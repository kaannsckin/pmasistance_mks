import { createHash } from 'node:crypto';
import { jiraLocalDay, JIRA_WORK_TIME_ZONE, summarizeJiraHistory, type JiraHistoryEntry, type JiraHistorySummary } from '../../utils/jiraHistory.js';
import { authorize, type AuthResult } from '../ai/auth.js';
import { Env, resolveAuthMode } from '../ai/config.js';
import { createRateLimiter } from '../ai/rateLimit.js';
import { describeNetworkError, extraCaFor, upstreamFetch } from '../ai/tls.js';
import { withIntegrationSettings } from './settings.js';
import { parseSections, reportCronConfigured, runReportCron, sendNotion, sendSlack, type ReportChannels } from './reports.js';
import { reportText, type ReportSection } from '../../utils/reportAutomation.js';
import { addDays, DayRange, isDayRange, isIsoDay } from '../../utils/calendarRange.js';
import type { JiraAgileBoard, JiraAgileList, JiraSprint } from '../../types.js';

/**
 * Kurum entegrasyonları (yalnız sunucu): Jira worklog okuma, Teams ve e-posta
 * bildirimi, haftalık rapor hatırlatması (zamanlanmış). Tüm gizli bilgiler
 * ortam değişkenlerindedir; hiçbiri tarayıcıya gönderilmez. Yapılandırılmayan
 * entegrasyon "yapılandırılmadı" döner, uygulama yerel yöntemle (Teams
 * sohbet bağlantısı, e-posta taslağı) devam eder.
 *
 *   JIRA_BASE_URL + (JIRA_TOKEN | JIRA_EMAIL + JIRA_API_TOKEN)
 *   JIRA_ALLOWED_PROJECTS                   (isteğe bağlı: erişilebilecek proje anahtarları, virgülle)
 *   JIRA_STORY_POINTS_FIELD                 (isteğe bağlı: story point alanı, ör. customfield_10002; yoksa adından bulunur)
 *   JIRA_ALLOW_CREATE                       (isteğe bağlı, "1": planlamadaki kayıtlar Jira'da açılabilir; yoksa yalnız okuma)
 *   JIRA_ALLOW_UPDATE                       (isteğe bağlı, "1": uygulamadan Jira kaydı güncellenebilir — alan, durum geçişi, yorum)
 *   TEAMS_WEBHOOK_URL                       (Teams kanalı / Power Automate iş akışı)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
 *   NOTIFY_ALLOWED_DOMAINS                  (alıcı alan adları; yoksa SMTP_FROM'un alanı)
 *   REPORT_REMINDER_TO, APP_URL, CRON_SECRET (haftalık hatırlatma)
 *   SLACK_WEBHOOK_URL, NOTION_TOKEN + NOTION_PARENT_PAGE_ID (rapor otomasyonu kanalları; bkz. reports.ts)
 */

export type IntegrationRoute = 'health' | 'jira-worklogs' | 'jira-history' | 'jira-issues' | 'jira-create' | 'jira-sync' | 'notify' | 'cron-reminder' | 'cron-report';

export interface Mailer {
    sendMail: (m: { from: string; to?: string; bcc?: string; subject: string; text: string; html?: string }) => Promise<unknown>;
}

export interface IntegrationOptions {
    route: IntegrationRoute;
    isDev?: boolean;
    fetchImpl?: typeof fetch;
    /** Testlerde SMTP yerine sahte gönderici */
    mailer?: Mailer;
    now?: Date;
}

const clean = (v: string | undefined) => v?.trim() || undefined;

const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export interface IntegrationStatus {
    jira: boolean;
    /** Jira'da kayıt açma açık mı (JIRA_ALLOW_CREATE) */
    jiraCreate: boolean;
    /** Uygulamadan Jira kaydı güncelleme açık mı (JIRA_ALLOW_UPDATE) */
    jiraUpdate: boolean;
    teams: boolean;
    email: boolean;
    reminder: boolean;
    slack: boolean;
    notion: boolean;
    /** Zamanlanmış raporları sunucu gönderir (cron + bulut verisi); değilse tarayıcı yedeği */
    reportCron: boolean;
}

const jiraConfigured = (env: Env) => !!clean(env.JIRA_BASE_URL) && (!!clean(env.JIRA_TOKEN) || (!!clean(env.JIRA_EMAIL) && !!clean(env.JIRA_API_TOKEN)));

export const integrationStatus = (env: Env): IntegrationStatus => ({
    jira: jiraConfigured(env),
    jiraCreate: jiraConfigured(env) && /^(1|true|evet|yes)$/i.test(clean(env.JIRA_ALLOW_CREATE) || ''),
    jiraUpdate: jiraConfigured(env) && /^(1|true|evet|yes)$/i.test(clean(env.JIRA_ALLOW_UPDATE) || ''),
    teams: !!clean(env.TEAMS_WEBHOOK_URL),
    email: !!clean(env.SMTP_HOST) && !!clean(env.SMTP_FROM),
    reminder: !!clean(env.CRON_SECRET) && (!!clean(env.TEAMS_WEBHOOK_URL) || (!!clean(env.SMTP_HOST) && !!clean(env.REPORT_REMINDER_TO))),
    slack: !!clean(env.SLACK_WEBHOOK_URL),
    notion: !!clean(env.NOTION_TOKEN) && !!clean(env.NOTION_PARENT_PAGE_ID),
    reportCron: reportCronConfigured(env),
});

const attempt = async (fn: () => Promise<unknown>): Promise<string> => { try { await fn(); return 'sent'; } catch (e) { return (e as Error).message; } };

/** Rapor/bildirim kanallarına gönderim (zamanlanmış rapor ve notify ortak) */
const deliverReport = async (env: Env, status: IntegrationStatus, ch: ReportChannels, subject: string, text: string, sections: ReportSection[] | undefined, opts: { fetchImpl?: typeof fetch; mailer?: Mailer }): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    if (ch.teams) out.teams = status.teams ? await attempt(() => sendTeams(env, subject, text, opts.fetchImpl)) : 'not_configured';
    if (ch.slack) out.slack = status.slack ? await attempt(() => sendSlack(env, subject, sections, text, opts.fetchImpl)) : 'not_configured';
    if (ch.notion) out.notion = status.notion ? await attempt(() => sendNotion(env, subject, sections, text, opts.fetchImpl)) : 'not_configured';
    if (ch.email?.length) {
        const to = checkRecipients(ch.email, env);
        if (to.rejected.length) out.rejected = to.rejected.join(', ');
        const plain = sections?.length ? reportText(sections, 'plain', clean(env.APP_URL)) : text.replace(/\*\*(.+?)\*\*/g, '$1');
        out.email = !status.email ? 'not_configured' : !to.ok.length ? 'Geçerli alıcı yok.' : await attempt(() => sendEmail(env, { bcc: to.ok, subject, text: plain }, opts.mailer));
    }
    return out;
};

// ---------------------------------------------------------------- Jira

export interface JiraWorklog {
    id?: string;
    started?: string;
    updated?: string;
    accountId?: string;
    date: string;
    author: string;
    /** Jira'nın verdiği e-posta (izin varsa); havuzdaki kişiyle eşleştirmede isimden önce kullanılır */
    authorEmail?: string;
    issueKey: string;
    summary: string;
    hours: number;
    comment?: string;
    source: 'jira';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;

export const buildWorklogJql = (projectKey: string, from: string, to: string): string =>
    `project = "${projectKey.toUpperCase()}" AND worklogDate >= "${from}" AND worklogDate <= "${to}" ORDER BY key`;

const jiraAuth = (env: Env): string => {
    const token = clean(env.JIRA_TOKEN);
    if (token) return `Bearer ${token}`;
    const raw = `${clean(env.JIRA_EMAIL)}:${clean(env.JIRA_API_TOKEN)}`;
    return `Basic ${Buffer.from(raw).toString('base64')}`;
};

type JiraWorklogRaw = { id?: string; issueId?: string; started?: string; updated?: string; timeSpentSeconds?: number; comment?: unknown; author?: { displayName?: string; name?: string; emailAddress?: string; accountId?: string; key?: string } };
type JiraIssueRaw = { key: string; fields?: { summary?: string; worklog?: { total?: number; maxResults?: number; worklogs?: JiraWorklogRaw[] } } };

const commentText = (c: unknown): string | undefined => {
    if (typeof c === 'string') return c.trim() || undefined;
    // Jira Cloud v3 biçimi (ADF) gelirse düz metne indir
    const out: string[] = [];
    const walk = (n: unknown) => {
        if (!n || typeof n !== 'object') return;
        const o = n as { text?: unknown; content?: unknown[] };
        if (typeof o.text === 'string') out.push(o.text);
        if (Array.isArray(o.content)) o.content.forEach(walk);
    };
    walk(c);
    return out.join(' ').trim() || undefined;
};

/** Jira Cloud (atlassian.net) mı; Cloud eski arama ucunu kaldırdı, yeni uç sayfa jetonuyla ilerler */
export const isJiraCloud = (base: string): boolean => {
    try { return /\.atlassian\.net$/i.test(new URL(base).hostname); } catch { return false; }
};

/**
 * Tek arama sayfası. Server/DC: `/rest/api/2/search` (startAt, toplam);
 * Cloud: `/rest/api/2/search/jql` (nextPageToken, toplam yok). İmleç iki
 * biçimi de taşır; sonraki sayfa yoksa `next` null.
 */
export const searchJiraPage = async <T,>(
    get: (path: string) => Promise<unknown>,
    cloud: boolean,
    params: string,
    cursor?: string | null,
): Promise<{ issues: T[]; total: number | null; next: string | null }> => {
    if (cloud) {
        const page = await get(`/rest/api/2/search/jql?${params}${cursor ? `&nextPageToken=${encodeURIComponent(cursor)}` : ''}`) as { issues?: T[]; nextPageToken?: string; isLast?: boolean };
        const issues = page.issues || [];
        return { issues, total: null, next: issues.length && !page.isLast && page.nextPageToken ? page.nextPageToken : null };
    }
    const startAt = Math.max(0, Number(cursor) || 0);
    const page = await get(`/rest/api/2/search?${params}&startAt=${startAt}`) as { issues?: T[]; total?: number };
    const issues = page.issues || [];
    const total = typeof page.total === 'number' ? page.total : null;
    return { issues, total, next: issues.length && startAt + issues.length < (total ?? 0) ? String(startAt + issues.length) : null };
};

/** Projedeki, tarih aralığındaki worklog kayıtları (Jira Server/DC ve Cloud REST v2) */
export const fetchJiraWorklogs = async (env: Env, projectKey: string, from: string, to: string, fetchImpl?: typeof fetch, timeZone?: string): Promise<JiraWorklog[]> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json' };
    const get = async (path: string) => {
        const res = await jiraReadWithRetry(f, `${base}${path}`, { headers });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Jira erişimi reddedildi (yetki ya da jeton hatalı).'), { status: 502 });
        if (!res.ok) throw Object.assign(new Error(`Jira yanıtı başarısız (HTTP ${res.status}).`), { status: 502 });
        return res.json();
    };
    const params = `jql=${encodeURIComponent(buildWorklogJql(projectKey, timeZone ? addDays(from, -1) : from, timeZone ? addDays(to, 1) : to))}&fields=summary,worklog&maxResults=100`;
    const cloud = isJiraCloud(base);
    const issues: JiraIssueRaw[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) { // en çok 500 kayıt
        const r: { issues: JiraIssueRaw[]; next: string | null } = await searchJiraPage<JiraIssueRaw>(get, cloud, params, cursor);
        issues.push(...r.issues);
        cursor = r.next;
        if (!cursor) break;
    }
    if (cursor) throw Object.assign(new Error('Bu tarih aralığında 500’den fazla Jira kaydı var. Daha kısa bir aralık seçin.'), { status: 422 });
    const out: JiraWorklog[] = [];
    for (const issue of issues) {
        if (issue.key.split('-')[0].toUpperCase() !== projectKey.toUpperCase()) continue;
        let logs = issue.fields?.worklog?.worklogs || [];
        if ((issue.fields?.worklog?.total || 0) > logs.length) {
            logs = await readIssueLogPages((path, init) => jiraReadWithRetry(f, base + path, { ...init, headers }), issue.key) || [];
        }
        logs.forEach(w => {
            const date = timeZone && w.started ? jiraLocalDay(w.started, timeZone) || '' : (w.started || '').slice(0, 10);
            if (!DATE_RE.test(date) || date < from || date > to) return;
            const hours = (w.timeSpentSeconds || 0) / 3600;
            if (!(hours > 0)) return;
            out.push(worklogEntry(issue.key, issue.fields?.summary || '', w, date, hours));
        });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.issueKey.localeCompare(b.issueKey));
};

const worklogEntry = (issueKey: string, summary: string, w: JiraWorklogRaw, date: string, hours: number): JiraWorklog => {
    const email = clean(w.author?.emailAddress);
    const started = w.started && Number.isFinite(Date.parse(w.started)) ? w.started.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : undefined;
    const updated = isoOf(w.updated) || undefined;
    return {
        id: w.id === undefined ? undefined : String(w.id),
        started,
        updated,
        accountId: w.author?.accountId || w.author?.key,
        date, author: w.author?.displayName || w.author?.name || '', ...(email ? { authorEmail: email.toLowerCase() } : {}),
        issueKey, summary, hours, comment: commentText(w.comment), source: 'jira',
    };
};

export const MAX_WORKLOG_KEYS = 50;

type WorklogReader = (path: string, init?: RequestInit) => Promise<Response>;
type WorklogSnapshot = {
    byKey: Map<string, JiraWorklogRaw[]>;
    ids: Map<string, string>;
    since: number;
    refreshedAt: number;
    expires: number;
};
const worklogSnapshots = new Map<string, WorklogSnapshot>();
const WORKLOG_ISSUE_LIMIT = 5000;
const WORKLOG_SNAPSHOT_LIMIT = 15000;

const readIssueLogPages = async (get: WorklogReader, key: string): Promise<JiraWorklogRaw[] | null> => {
    const result: JiraWorklogRaw[] = [];
    for (let page = 0; page < 100; page++) {
        const res = await get(`/rest/api/2/issue/${encodeURIComponent(key)}/worklog?startAt=${result.length}&maxResults=1000`);
        if (res.status === 404) return null;
        if (!res.ok) throw Object.assign(new Error(`Jira worklog okunamadı (HTTP ${res.status}).`), { status: res.status === 429 ? 429 : 502 });
        const body = await res.json() as { worklogs?: JiraWorklogRaw[]; total?: number };
        const rows = body.worklogs || [];
        result.push(...rows);
        if (result.length > WORKLOG_ISSUE_LIMIT || (body.total || 0) > WORKLOG_ISSUE_LIMIT) break;
        if (typeof body.total !== 'number' || result.length >= body.total) return result;
        if (!rows.length) break;
    }
    throw Object.assign(new Error(`${key} için Jira worklog sınırı aşıldı veya eksik sayfa alındı.`), { status: 422 });
};

type WorklogChange = { worklogId: number; updatedTime?: number };
const worklogChanges = async (get: WorklogReader, kind: 'updated' | 'deleted', since: number) => {
    const ids = new Set<number>();
    const initialSince = since;
    for (let page = 0; page < 5; page++) {
        const res = await get(`/rest/api/2/worklog/${kind}?since=${since}`);
        if (!res.ok) return null;
        const data = await res.json() as { values?: WorklogChange[]; lastPage?: boolean; nextPage?: string; until?: number };
        if (!Array.isArray(data.values)) return null;
        data.values.forEach(row => { if (Number.isSafeInteger(row.worklogId)) ids.add(row.worklogId); });
        const until = Number(data.until);
        if (data.lastPage !== false) return { ids, until: until >= initialSince ? until : initialSince };
        const next = data.nextPage ? Number(new URL(data.nextPage, 'https://jira.invalid').searchParams.get('since')) : until;
        if (!Number.isSafeInteger(next) || next <= since) return null;
        since = next;
    }
    return null;
};

const reconcileWorklogSnapshot = async (get: WorklogReader, snapshot: WorklogSnapshot): Promise<WorklogSnapshot | null> => {
    const baseline = Date.now();
    const [updates, deletions] = await Promise.all([
        worklogChanges(get, 'updated', snapshot.since),
        worklogChanges(get, 'deleted', snapshot.since),
    ]);
    if (!updates || !deletions) return null;
    const changes = [...updates.ids].filter(id => !deletions.ids.has(id));
    const rows: JiraWorklogRaw[] = [];
    for (let i = 0; i < changes.length; i += 1000) {
        const res = await get('/rest/api/2/worklog/list', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: changes.slice(i, i + 1000) }),
        });
        if (!res.ok) return null;
        const page = await res.json() as JiraWorklogRaw[];
        if (!Array.isArray(page)) return null;
        rows.push(...page);
    }
    const affected = new Set([...updates.ids, ...deletions.ids].map(String));
    const byKey = new Map([...snapshot.byKey].map(([key, logs]) => [key, logs.filter(row => !affected.has(String(row.id)))]));
    for (const row of rows) {
        if (!row.issueId) return null;
        const key = snapshot.ids.get(String(row.issueId));
        if (key) byKey.get(key)?.push(row);
    }
    if ([...byKey.values()].some(logs => logs.length > WORKLOG_ISSUE_LIMIT)) return null;
    return { ...snapshot, byKey, since: Math.max(snapshot.since, Math.min(updates.until, deletions.until, baseline)), refreshedAt: baseline };
};

const fullWorklogSnapshot = async (get: WorklogReader, keys: string[], cloud: boolean, incremental: boolean): Promise<WorklogSnapshot> => {
    const checkedAt = Date.now();
    const byKey: WorklogSnapshot['byKey'] = new Map();
    const queue = [...keys];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let key = queue.shift(); key; key = queue.shift()) {
            const logs = await readIssueLogPages(get, key);
            if (logs) byKey.set(key, logs);
        }
    }));
    const ids = new Map<string, string>();
    if (incremental && byKey.size) {
        try {
            const jql = 'key in (' + [...byKey.keys()].join(',') + ')';
            const found = await searchJiraPage<{ key: string; id?: string }>(async path => {
                const res = await get(path);
                if (!res.ok) throw new Error('Jira kayıt kimlikleri okunamadı.');
                return res.json();
            }, cloud, `jql=${encodeURIComponent(jql)}&fields=none&maxResults=${MAX_WORKLOG_KEYS}`);
            found.issues.forEach(issue => { if (issue.id && byKey.has(issue.key)) ids.set(String(issue.id), issue.key); });
        } catch { /* Jira Worklog toplu akışı kullanılamıyorsa kayıt bazında yenile. */ }
    }
    const cacheable = ids.size === keys.length && [...byKey.values()].reduce((n, logs) => n + logs.length, 0) <= WORKLOG_SNAPSHOT_LIMIT;
    return { byKey, ids, since: checkedAt - 120_000, refreshedAt: checkedAt, expires: cacheable ? checkedAt + 15 * 60_000 : 0 };
};

/** Kayıt bazında tam okuma ve aynı proje grubunun sonraki okumalarında artımlı yenileme. */
export const fetchJiraIssueWorklogs = async (
    env: Env, keys: string[], fetchImpl?: typeof fetch, timeZone?: string, incremental = false,
): Promise<{ entries: JiraWorklog[]; missing: string[] }> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const auth = jiraAuth(env);
    const get: WorklogReader = (path, init) => jiraReadWithRetry(f, base + path, {
        ...init, headers: { ...init?.headers, authorization: auth, accept: 'application/json' },
    });
    const group = new Map<string, string[]>();
    for (const key of keys) {
        const project = key.split('-')[0];
        group.set(project, [...(group.get(project) || []), key]);
    }
    const results: WorklogSnapshot[] = [];
    const fingerprint = createHash('sha256').update(auth).digest('hex');
    for (const [project, projectKeys] of group) {
        const cacheKey = JSON.stringify([base, fingerprint, project, [...projectKeys].sort()]);
        const cached = incremental ? worklogSnapshots.get(cacheKey) : undefined;
        let result = cached && cached.expires > Date.now() ? cached : undefined;
        if (result) {
            result = (await reconcileWorklogSnapshot(get, result).catch(() => null)) || undefined;
        }
        result ||= await fullWorklogSnapshot(get, projectKeys, isJiraCloud(base), incremental);
        if (incremental && result.expires) {
            if (!worklogSnapshots.has(cacheKey) && worklogSnapshots.size >= 8) worklogSnapshots.delete(worklogSnapshots.keys().next().value!);
            const current = worklogSnapshots.get(cacheKey);
            if (!current || result.refreshedAt >= current.refreshedAt) worklogSnapshots.set(cacheKey, result);
        }
        results.push(result);
    }
    const entries: JiraWorklog[] = [];
    const missing = new Set(keys);
    for (const { byKey } of results) {
        for (const [key, logs] of byKey) {
            missing.delete(key);
            for (const log of logs) {
                const date = timeZone && log.started ? jiraLocalDay(log.started, timeZone) || '' : (log.started || '').slice(0, 10);
                const hours = (log.timeSpentSeconds || 0) / 3600;
                if (DATE_RE.test(date) && hours > 0) entries.push(worklogEntry(key, '', log, date, hours));
            }
        }
    }
    return { entries: entries.sort((a, b) => a.issueKey.localeCompare(b.issueKey) || a.date.localeCompare(b.date)), missing: [...missing].sort() };
};

const worklogSettings = (env: Env) => {
    try {
        const config = JSON.parse(env.JIRA_WORKLOG_ACCESS || '{}') as Record<string, { projects?: string[]; authorIds?: string[] }>;
        return config && typeof config === 'object' ? config : {};
    } catch {
        return {};
    }
};

const allowedWorklogs = (env: Env, who: Extract<AuthResult, { ok: true }>, entries: JiraWorklog[]): JiraWorklog[] => {
    if (who.subject.startsWith('ip:')) return entries;
    const config = worklogSettings(env)[who.subject.slice(5)];
    return entries.filter(row => {
        const project = row.issueKey.split('-')[0];
        return (Array.isArray(config?.projects) && config.projects.includes(project))
            || (!!who.verifiedEmail && row.authorEmail === who.verifiedEmail)
            || (!!row.accountId && Array.isArray(config?.authorIds) && config.authorIds.includes(row.accountId));
    });
};

// ---------------------------------------------------------------- Jira kayıt geçmişi

/** Jira durum kategorisi: yapılacak, sürüyor, bitti */
export type JiraStatusCategory = 'new' | 'indeterminate' | 'done';

export interface JiraTransition {
    at: string; // ISO
    from: string;
    to: string;
    fromCategory: JiraStatusCategory | null;
    toCategory: JiraStatusCategory | null;
}

/** Planlama geçmişi için sadeleştirilmiş Jira kaydı (yorum ve worklog metni yok) */
export interface JiraIssueRecord {
    key: string;
    summary: string;
    description: string;
    issueType: string;
    status: string;
    statusCategory: JiraStatusCategory | null;
    priority: string;
    created: string | null;
    resolved: string | null;
    components: string[];
    labels: string[];
    fixVersions: string[];
    originalEstimateSeconds: number | null;
    timeSpentSeconds: number | null;
    historySummary?: JiraHistorySummary;
    remainingEstimateSeconds?: number | null;
    aggregateOriginalEstimateSeconds?: number | null;
    aggregateRemainingEstimateSeconds?: number | null;
    aggregateTimeSpentSeconds?: number | null;
    parentKey?: string;
    subtaskKeys?: string[];
    storyPoints: number | null;
    assignee: string;
    /** Atanan kişinin e-postası (Jira gizlemiyorsa) */
    assigneeEmail?: string;
    /** Bu kaydı engelleyen kayıtlar ("is blocked by") */
    blockedBy: string[];
    transitions: JiraTransition[];
    /** Jira'daki termin (duedate, YYYY-AA-GG) */
    due: string | null;
    /** Jira'da son güncellenme anı (ISO) */
    updated?: string | null;
}

export type JiraIssueScope = 'done' | 'all';
export const JIRA_PAGE_MAX = 100;
const DESCRIPTION_MAX = 4000;
const CHANGELOG_REFETCH_MAX = 25; // sayfa başına eksik değişiklik geçmişi tamamlanan kayıt

/** Kapanmış kayıtlar (yalnız kapanış tarihi `since` sonrası) ya da açıklar dahil */
export const buildIssueJql = (projectKey: string, scope: JiraIssueScope, since?: string): string => {
    const p = `project = "${projectKey.toUpperCase()}"`;
    const after = since ? ` AND resolved >= "${since}"` : '';
    return scope === 'done'
        ? `${p} AND statusCategory = Done${after} ORDER BY key ASC`
        : `${p}${since ? ` AND (statusCategory != Done OR resolved >= "${since}")` : ''} ORDER BY key ASC`;
};

/** İzin listesi tanımlıysa yalnız oradaki projeler okunur */
export const jiraProjectAllowed = (env: Env, key: string): boolean => {
    const list = (clean(env.JIRA_ALLOWED_PROJECTS) || '').split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
    return !list.length || list.includes(key.toUpperCase());
};

const CATEGORIES = new Set(['new', 'indeterminate', 'done']);
const asCategory = (v: unknown): JiraStatusCategory | null => (typeof v === 'string' && CATEGORIES.has(v) ? v as JiraStatusCategory : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : ''); // JSON'daki "toString" gibi alanlar Object.prototype'u gölgeleyebilir
const isoOf = (v: unknown): string | null => {
    if (typeof v !== 'string' || !v) return null;
    const d = new Date(v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return isNaN(d.getTime()) ? null : d.toISOString();
};
const seconds = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const jiraKey = (v: unknown): string | undefined => {
    const key = str((v as { key?: unknown } | null)?.key).toUpperCase();
    return ISSUE_KEY_RE.test(key) ? key : undefined;
};
const names = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => str((x as { name?: unknown })?.name).trim()).filter(Boolean) : []);

/** Jira wiki biçimini sade metne indirir ve kısaltır */
export const plainDescription = (v: unknown): string => {
    const raw = typeof v === 'string' ? v : commentText(v) || '';
    return raw
        .replace(/\{(code|noformat|quote|panel|color)[^}]*\}/g, ' ')
        .replace(/\[([^|\]]+)\|[^\]]+\]/g, '$1')
        .replace(/!\S+?!/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, DESCRIPTION_MAX);
};

type Cache<T> = Map<string, { at: number; value: T }>;
const statusCache: Cache<Map<string, JiraStatusCategory>> = new Map();
const pointsCache: Cache<string | null> = new Map();
const cached = async <T>(cache: Cache<T>, key: string, ttlMs: number, load: () => Promise<T>, fallback: T): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    try {
        const value = await load();
        cache.set(key, { at: Date.now(), value });
        return value;
    } catch {
        return fallback; // isteğe bağlı bilgi: alınamazsa kayıtlar yine döner
    }
};

type JiraHistoryRaw = { id?: string; created?: string; author?: { displayName?: string; name?: string; emailAddress?: string }; items?: { field?: string; fieldId?: string; from?: unknown; to?: unknown; fromString?: unknown; toString?: unknown }[] };
type JiraFullIssueRaw = { key: string; fields?: Record<string, unknown>; changelog?: { total?: number; histories?: JiraHistoryRaw[] } };

const normalizeHistory = (rows: JiraHistoryRaw[]): JiraHistoryEntry[] => rows.flatMap((row, index) => {
    const at = isoOf(row.created);
    if (!at) return [];
    const value = (raw: unknown): string | null => typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
    return [{
        id: row.id || `${at}:${index}`,
        at,
        author: row.author?.displayName || row.author?.name || '',
        authorEmail: clean(row.author?.emailAddress)?.toLowerCase(),
        items: (row.items || []).filter(item => item.field || item.fieldId).map(item => ({
            field: item.field || item.fieldId!, fieldId: item.fieldId,
            from: value(item.from), fromString: value(item.fromString), to: value(item.to), toString: value(item.toString),
        })),
    }];
}).sort((a, b) => b.at.localeCompare(a.at));

const jiraReadWithRetry = async (f: typeof fetch, url: string, init: RequestInit): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
        const res = await f(url, init);
        if (attempt === 2 || (res.status !== 429 && res.status < 500)) return res;
        const retry = res.headers.get('retry-after');
        const millis = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : NaN;
        if (millis > 3000) return res;
        await res.body?.cancel().catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, Number.isFinite(millis) ? Math.max(0, millis) : 200 * 2 ** attempt));
    }
};

const MAX_HISTORY_ENTRIES = 5000;

export const fetchJiraHistory = async (env: Env, key: string, fetchImpl?: typeof fetch): Promise<JiraHistoryEntry[]> => {
    const normalized = key.trim().toUpperCase();
    if (!ISSUE_KEY_RE.test(normalized)) throw Object.assign(new Error('Geçersiz Jira kayıt anahtarı.'), { status: 400 });
    if (!jiraProjectAllowed(env, normalized.split('-')[0])) throw Object.assign(new Error("Bu proje sunucuda Jira erişimine açık değil."), { status: 403 });
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json' };
    const get = async (path: string) => {
        const res = await jiraReadWithRetry(f, base + path, { headers });
        if (res.status === 404) throw Object.assign(new Error('Jira kaydı bulunamadı.'), { status: 404 });
        if (res.status === 429) throw Object.assign(new Error('Jira istek sınırına ulaştı. Biraz sonra tekrar deneyin.'), { status: 429 });
        if (!res.ok) throw Object.assign(new Error(`Jira geçmişi okunamadı (HTTP ${res.status}).`), { status: 502 });
        return res.json();
    };
    const tooLong = () => Object.assign(new Error(`Jira geçmişi ${MAX_HISTORY_ENTRIES} kayıt sınırını aşıyor.`), { status: 422 });
    const path = `/rest/api/${isJiraCloud(base) ? '3' : '2'}/issue/${encodeURIComponent(normalized)}`;
    if (!isJiraCloud(base)) {
        const issue = await get(path + '?expand=changelog&fields=none') as JiraFullIssueRaw;
        const rows = issue.changelog?.histories || [];
        if (rows.length > MAX_HISTORY_ENTRIES || (issue.changelog?.total || 0) > MAX_HISTORY_ENTRIES) throw tooLong();
        if ((issue.changelog?.total || 0) > rows.length)
            throw Object.assign(new Error('Jira Data Center eksik geçmiş döndürdü.'), { status: 502 });
        return normalizeHistory(rows);
    }
    const all: JiraHistoryRaw[] = [];
    for (;;) {
        const page = await get(`${path}/changelog?startAt=${all.length}&maxResults=100`) as { values?: JiraHistoryRaw[]; total?: number; isLast?: boolean };
        const values = page.values || [];
        all.push(...values);
        if (all.length > MAX_HISTORY_ENTRIES || (page.total || 0) > MAX_HISTORY_ENTRIES) throw tooLong();
        if (page.isLast || all.length >= (page.total ?? Infinity) || (!values.length && page.total === undefined)) break;
        if (!values.length) throw Object.assign(new Error('Jira eksik geçmiş döndürdü.'), { status: 502 });
        if (all.length === MAX_HISTORY_ENTRIES) throw tooLong();
    }
    return normalizeHistory(all);
};

const transitionsOf = (histories: JiraHistoryRaw[], categories: Map<string, JiraStatusCategory>): JiraTransition[] => histories
    .flatMap(h => (h.items || [])
        .filter(i => i.field === 'status' || i.fieldId === 'status')
        .map(i => ({ at: isoOf(h.created), from: str(i.fromString), to: str(i.toString), fromCategory: categories.get(str(i.from)) || null, toCategory: categories.get(str(i.to)) || null })))
    .filter((t): t is JiraTransition => !!t.at)
    .sort((a, b) => a.at.localeCompare(b.at));

export const normalizeIssue = (raw: JiraFullIssueRaw, categories: Map<string, JiraStatusCategory>, pointsField: string | null): JiraIssueRecord => {
    const f = raw.fields || {};
    const status = (f.status || {}) as { name?: unknown; id?: unknown; statusCategory?: { key?: unknown } };
    const links = Array.isArray(f.issuelinks) ? f.issuelinks as { type?: { name?: unknown; inward?: unknown }; inwardIssue?: { key?: unknown } }[] : [];
    const points = pointsField ? Number(f[pointsField]) : NaN;
    const tracking = (f.timetracking || {}) as { originalEstimateSeconds?: unknown; remainingEstimateSeconds?: unknown; timeSpentSeconds?: unknown };
    const parentKey = jiraKey(f.parent);
    const subtaskKeys = Array.isArray(f.subtasks) ? f.subtasks.map(jiraKey).filter((v): v is string => !!v) : [];
    const timeField = (field: string, nested: unknown) => f[field] === undefined ? seconds(nested) : seconds(f[field]);
    const records = raw.changelog?.histories || [];
    const closed = (id: string | null, label: string | null) => categories.get(id || '') === 'done'
        || /^(done|closed|resolved|kapandı|kapalı|tamamlandı|çözüldü|iptal)$/i.test(label || '');
    const historySummary = raw.changelog && summarizeJiraHistory(normalizeHistory(records), {
        created: isoOf(f.created),
        resolved: isoOf(f.resolutiondate),
        current: str(status.name),
        at: new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString(),
        isClosed: closed,
        partial: (raw.changelog.total || 0) > records.length,
    });
    return {
        ...(historySummary ? { historySummary } : {}),
        key: raw.key,
        summary: str(f.summary).trim(),
        description: plainDescription(f.description),
        issueType: str((f.issuetype as { name?: unknown })?.name),
        status: str(status.name),
        statusCategory: asCategory(status.statusCategory?.key) || categories.get(str(status.id)) || null,
        priority: str((f.priority as { name?: unknown })?.name),
        created: isoOf(f.created),
        resolved: isoOf(f.resolutiondate),
        components: names(f.components),
        labels: Array.isArray(f.labels) ? (f.labels as unknown[]).map(str).filter(Boolean) : [],
        fixVersions: names(f.fixVersions),
        originalEstimateSeconds: timeField('timeoriginalestimate', tracking.originalEstimateSeconds),
        timeSpentSeconds: timeField('timespent', tracking.timeSpentSeconds),
        remainingEstimateSeconds: timeField('timeestimate', tracking.remainingEstimateSeconds),
        aggregateOriginalEstimateSeconds: seconds(f.aggregatetimeoriginalestimate),
        aggregateRemainingEstimateSeconds: seconds(f.aggregatetimeestimate),
        aggregateTimeSpentSeconds: seconds(f.aggregatetimespent),
        ...(parentKey ? { parentKey } : {}),
        subtaskKeys,
        storyPoints: Number.isFinite(points) && points > 0 ? points : null,
        assignee: str((f.assignee as { displayName?: unknown })?.displayName) || str((f.assignee as { name?: unknown })?.name),
        ...(str((f.assignee as { emailAddress?: unknown })?.emailAddress) ? { assigneeEmail: str((f.assignee as { emailAddress?: unknown }).emailAddress) } : {}),
        blockedBy: links
            .filter(l => /block|engel/i.test(str(l.type?.name)) && /blocked by|engellen/i.test(str(l.type?.inward)) && str(l.inwardIssue?.key))
            .map(l => str(l.inwardIssue!.key)),
        transitions: transitionsOf(raw.changelog?.histories || [], categories),
        due: typeof f.duedate === 'string' && DATE_RE.test(f.duedate.slice(0, 10)) ? f.duedate.slice(0, 10) : null,
        ...(isoOf(f.updated) ? { updated: isoOf(f.updated) } : {}),
    };
};

const ISSUE_FIELDS = 'summary,description,issuetype,status,priority,created,updated,resolutiondate,duedate,components,labels,fixVersions,timeoriginalestimate,timespent,timeestimate,aggregatetimeoriginalestimate,aggregatetimeestimate,aggregatetimespent,timetracking,parent,subtasks,assignee,issuelinks';

/**
 * Projenin kayıtlarından bir sayfa: alanlar ve durum geçmişi (changelog).
 * Jira Cloud yeni arama ucunu (`search/jql`, sayfa jetonu), Server/DC
 * klasik aramayı (`search`, startAt) kullanır; imleç iki biçimi de taşır.
 */
export const fetchJiraIssuesPage = (
    env: Env,
    q: { projectKey: string; scope: JiraIssueScope; since?: string; cursor?: string; pageSize?: number },
    fetchImpl?: typeof fetch,
): Promise<{ issues: JiraIssueRecord[]; total: number | null; next: string | null }> =>
    fetchIssuesByJql(env, buildIssueJql(q.projectKey, q.scope, q.since), { cursor: q.cursor, pageSize: q.pageSize }, fetchImpl);

/** Verilen JQL'in bir sayfası: alanlar ve durum geçmişi; 400 yanıtının iletileri hataya eklenir (`jiraMessages`) */
export const fetchIssuesByJql = async (
    env: Env,
    jql: string,
    q: { cursor?: string; pageSize?: number },
    fetchImpl?: typeof fetch,
): Promise<{ issues: JiraIssueRecord[]; total: number | null; next: string | null }> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json' };
    const get = async (path: string) => {
        const res = await f(`${base}${path}`, { headers });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Jira erişimi reddedildi (yetki ya da jeton hatalı).'), { status: 502 });
        if (res.status === 400) {
            const b = await res.json().catch(() => ({})) as { errorMessages?: unknown[] };
            throw Object.assign(new Error('Jira sorguyu kabul etmedi (proje anahtarı, etiket ya da filtre doğru mu?).'), { status: 502, jiraMessages: Array.isArray(b.errorMessages) ? b.errorMessages.map(str) : [] });
        }
        if (!res.ok) throw Object.assign(new Error(`Jira yanıtı başarısız (HTTP ${res.status}).`), { status: 502 });
        return res.json();
    };
    const categories = await cached(statusCache, base, 10 * 60_000, async () => {
        const list = await get('/rest/api/2/status') as { id?: unknown; statusCategory?: { key?: unknown } }[];
        return new Map(list.flatMap(s => { const c = asCategory(s.statusCategory?.key); return c ? [[str(s.id), c] as [string, JiraStatusCategory]] : []; }));
    }, new Map());
    const pointsField = clean(env.JIRA_STORY_POINTS_FIELD) || await cached(pointsCache, base, 60 * 60_000, async () => {
        const list = await get('/rest/api/2/field') as { id?: unknown; name?: unknown }[];
        return str(list.find(x => /^story ?points?( estimate)?$|^story point estimate$/i.test(str(x.name).trim()))?.id) || null;
    }, null);

    const cloud = isJiraCloud(base);
    const size = Math.max(10, Math.min(JIRA_PAGE_MAX, Math.round(q.pageSize || JIRA_PAGE_MAX)));
    const params = `jql=${encodeURIComponent(jql)}&fields=${ISSUE_FIELDS}${pointsField ? `,${pointsField}` : ''}&expand=changelog&maxResults=${size}`;
    const { issues: raws, total, next } = await searchJiraPage<JiraFullIssueRaw>(get, cloud, params, q.cursor);
    // Aramada değişiklik geçmişi kısaltılmışsa kaydın kendisinden tamamlanır
    let refetched = 0;
    for (const r of raws) {
        const c = r.changelog;
        if (!c || (c.total || 0) <= (c.histories?.length || 0) || refetched >= CHANGELOG_REFETCH_MAX) continue;
        refetched++;
        try {
            const full = await get(`/rest/api/2/issue/${encodeURIComponent(r.key)}?fields=status&expand=changelog`) as JiraFullIssueRaw;
            if ((full.changelog?.histories?.length || 0) > (c.histories?.length || 0)) r.changelog = full.changelog;
        } catch { /* kısaltılmış geçmişle devam */ }
    }
    return { issues: raws.map(r => normalizeIssue(r, categories, pointsField)), total, next };
};

// ---------------------------------------------------------------- Jira canlı eşitleme (kapsamlı okuma + güncelleme)

/**
 * Eşitleme kaynağı: proje, etiket(ler) ve/veya kayıtlı filtre. En az biri
 * zorunludur; tarayıcıdan serbest JQL kabul edilmez ve kapsamsız (tüm Jira)
 * sorgu kurulamaz.
 */
export interface JiraSyncSource {
    projectKey?: string;
    labels?: string[];
    filterId?: string;
    /** Serbest metin araması (text ~); yalnız harf, rakam, boşluk, nokta, alt çizgi — JQL'e kaçış gerektirmez */
    text?: string;
    duePeriod?: DayRange;
}
export const JIRA_SYNC_KEYS_MAX = 100;
const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}-\d{1,9}$/;
const LABEL_RE = /^[^\s"\\,()]{1,100}$/;
const FILTER_RE = /^\d{1,12}$/;
const TEXT_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._]{1,99}$/u;

const allowedProjects = (env: Env): string[] => (clean(env.JIRA_ALLOWED_PROJECTS) || '').split(',').map(k => k.trim().toUpperCase()).filter(k => KEY_RE.test(k));
const quoted = (list: string[]) => list.map(v => `"${v}"`).join(', ');

/** Kaynağı doğrular; hata iletisi ya da temiz kaynak döner */
export const checkSyncSource = (env: Env, raw: unknown): { source: JiraSyncSource } | { error: string; status: number } => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const projectKey = r.projectKey ? String(r.projectKey).trim().toUpperCase() : undefined;
    const labels = Array.isArray(r.labels) ? [...new Set(r.labels.map(l => String(l).trim()).filter(Boolean))] : [];
    const filterId = r.filterId ? String(r.filterId).trim() : undefined;
    const text = r.text ? String(r.text).replace(/\s+/g, ' ').trim() : undefined;
    if (!projectKey && !labels.length && !filterId) return { error: 'Eşitleme kaynağı gerekli: proje, etiket ya da kayıtlı filtre seçin (tüm Jira taranmaz).', status: 400 };
    if ((projectKey && !KEY_RE.test(projectKey)) || labels.length > 10 || labels.some(l => !LABEL_RE.test(l)) || (filterId && !FILTER_RE.test(filterId))) {
        return { error: 'Geçersiz proje anahtarı, etiket ya da filtre.', status: 400 };
    }
    if (text && !TEXT_RE.test(text)) return { error: 'Arama metni yalnız harf, rakam, boşluk, nokta ve alt çizgi içerebilir (2–100 karakter).', status: 400 };
    const duePeriod = r.duePeriod;
    if (duePeriod !== undefined && !isDayRange(duePeriod)) return { error: 'Geçersiz termin aralığı.', status: 400 };
    if (projectKey && !jiraProjectAllowed(env, projectKey)) return { error: `${projectKey} projesi bu sunucuda Jira erişimine açık değil.`, status: 403 };
    return { source: { ...(projectKey ? { projectKey } : {}), ...(labels.length ? { labels } : {}), ...(filterId ? { filterId } : {}), ...(text ? { text } : {}), ...(isDayRange(duePeriod) ? { duePeriod: { start: duePeriod.start, end: duePeriod.end } } : {}) } };
};

/** Kaynak JQL'i: yalnız açık kayıtlar (istenirse); izin listesi varsa sorgu ona da daraltılır */
export const buildSyncJql = (env: Env, source: JiraSyncSource, openOnly = true): string => {
    const allowed = allowedProjects(env);
    return [
        source.projectKey ? `project = "${source.projectKey}"` : allowed.length ? `project in (${quoted(allowed)})` : '',
        source.labels?.length ? `labels in (${quoted(source.labels)})` : '',
        source.filterId ? `filter = ${source.filterId}` : '',
        source.text ? `text ~ "${source.text}"` : '',
        source.duePeriod ? `duedate >= "${source.duePeriod.start}" AND duedate <= "${source.duePeriod.end}"` : '',
        openOnly ? 'statusCategory != Done' : '',
    ].filter(Boolean).join(' AND ') + ' ORDER BY key ASC';
};

export const buildKeysJql = (keys: string[]): string => `key in (${quoted(keys)}) ORDER BY key ASC`;

const agileId = (value: unknown): number | undefined => {
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    if (!/^[1-9]\d{0,11}$/.test(String(value))) return undefined;
    return Number(value);
};

const agileList = async <T extends { id: number }>(env: Env, path: string, normalize: (row: Record<string, unknown>) => T | undefined, fetchImpl?: typeof fetch): Promise<JiraAgileList<T>> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json' };
    const values = new Map<number, T>();
    const separator = path.includes('?') ? '&' : '?';
    for (let startAt = 0, page = 0; page < 10; page++) {
        const response = await jiraReadWithRetry(f, `${base}/rest/agile/1.0/${path}${separator}startAt=${startAt}&maxResults=50`, { headers });
        if (!response.ok) {
            const status = response.status === 404 ? 404 : response.status === 429 ? 429 : 502;
            throw Object.assign(new Error(response.status === 404 ? 'Jira panosu bulunamadı veya Jira Software sprint erişimi kapalı.' : `Jira sprint verisi okunamadı (HTTP ${response.status}).`), { status });
        }
        const data = await response.json() as { values?: Record<string, unknown>[]; startAt?: number; total?: number; isLast?: boolean };
        const rows = Array.isArray(data.values) ? data.values : [];
        if (typeof data.startAt === 'number' && data.startAt !== startAt) break;
        for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            const item = normalize(row);
            if (item) values.set(item.id, item);
        }
        startAt += rows.length;
        if (!rows.length || data.isLast === true || (typeof data.total === 'number' && startAt >= data.total)
            || (data.isLast === undefined && data.total === undefined && rows.length < 50)) return { values: [...values.values()], truncated: false };
    }
    return { values: [...values.values()], truncated: true };
};

const jiraSprintBoards = (env: Env, key: string, fetchImpl?: typeof fetch): Promise<JiraAgileList<JiraAgileBoard>> =>
    agileList(env, `board?projectKeyOrId=${encodeURIComponent(key)}`, row => {
        const id = agileId(row.id);
        return id !== undefined && (!row.type || row.type === 'scrum' || row.type === 'simple') ? { id, name: str(row.name).trim() || `Pano ${id}` } : undefined;
    }, fetchImpl);

const jiraBoardSprints = (env: Env, boardId: number, state: string, fetchImpl?: typeof fetch): Promise<JiraAgileList<JiraSprint>> =>
    agileList(env, `board/${boardId}/sprint${state ? `?state=${state}` : ''}`, row => {
        const id = agileId(row.id);
        if (!id) return undefined;
        const state = row.state === 'active' || row.state === 'future' || row.state === 'closed' ? row.state : 'unknown';
        return { id, name: str(row.name).trim() || `Sprint ${id}`, state, startDate: isoOf(row.startDate) || undefined,
            endDate: isoOf(row.endDate) || undefined, goal: str(row.goal).trim().slice(0, 2000) || undefined };
    }, fetchImpl);

/**
 * Anahtarı bilinen kayıtların güncel hâli (kapanmış olanlar dahil). Jira,
 * listede silinmiş / taşınmış tek bir anahtar olsa tüm sorguyu reddeder:
 * reddedilen anahtarlar çıkarılıp yeniden denenir ve `missing` ile bildirilir.
 */
export const fetchJiraIssuesByKeys = async (env: Env, keys: string[], fetchImpl?: typeof fetch): Promise<{ issues: JiraIssueRecord[]; missing: string[] }> => {
    let rest = [...new Set(keys.map(k => k.toUpperCase()))];
    const missing: string[] = [];
    for (let attempt = 0; rest.length; attempt++) {
        try {
            const r = await fetchIssuesByJql(env, buildKeysJql(rest), { pageSize: JIRA_PAGE_MAX }, fetchImpl);
            const got = new Set(r.issues.map(i => i.key.toUpperCase()));
            // Taşınan kayıt yeni anahtarıyla döner: istenen anahtar listede yoksa eksik sayılır
            missing.push(...rest.filter(k => !got.has(k)));
            return { issues: r.issues, missing };
        } catch (e) {
            const msgs = ((e as { jiraMessages?: string[] }).jiraMessages || []).join(' ').toUpperCase();
            const bad = rest.filter(k => new RegExp(`(^|[^A-Z0-9_-])${k}([^0-9]|$)`).test(msgs));
            if (!bad.length || attempt >= 3) throw e;
            missing.push(...bad);
            rest = rest.filter(k => !bad.includes(k));
        }
    }
    return { issues: [], missing };
};

export interface JiraMeta {
    user: string;
    projects: { key: string; name: string }[];
    filters: { id: string; name: string; jql: string }[];
}

/** Bağlantı sınaması ve kaynak seçenekleri: jeton sahibi, erişilebilen projeler, sık kullanılan (kayıtlı) filtreler */
export const fetchJiraMeta = async (env: Env, fetchImpl?: typeof fetch): Promise<JiraMeta> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json' };
    const get = async (path: string) => {
        const res = await f(`${base}${path}`, { headers });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Jira erişimi reddedildi (yetki ya da jeton hatalı).'), { status: 502 });
        if (!res.ok) throw Object.assign(new Error(`Jira yanıtı başarısız (HTTP ${res.status}).`), { status: 502 });
        return res.json();
    };
    const me = await get('/rest/api/2/myself') as { displayName?: unknown; name?: unknown };
    const allowed = allowedProjects(env);
    let projects: JiraMeta['projects'] = [];
    let filters: JiraMeta['filters'] = [];
    try {
        projects = ((await get('/rest/api/2/project')) as { key?: unknown; name?: unknown }[])
            .map(p => ({ key: str(p.key).toUpperCase(), name: str(p.name) }))
            .filter(p => p.key && (!allowed.length || allowed.includes(p.key)))
            .sort((a, b) => a.key.localeCompare(b.key)).slice(0, 500);
    } catch { /* liste alınamazsa anahtar elle yazılır */ }
    try {
        filters = ((await get('/rest/api/2/filter/favourite')) as { id?: unknown; name?: unknown; jql?: unknown }[])
            .map(x => ({ id: str(x.id) || String(x.id ?? ''), name: str(x.name), jql: str(x.jql).slice(0, 300) }))
            .filter(x => FILTER_RE.test(x.id)).slice(0, 200);
    } catch { /* filtre listesi isteğe bağlı */ }
    return { user: str(me.displayName) || str(me.name), projects, filters };
};

/** Uygulamadan Jira'ya yazılabilen değişiklikler */
export interface JiraUpdateChanges {
    summary?: string;
    priority?: string; // Blocker | High | Medium | Low
    /** YYYY-AA-GG; null termini siler */
    dueDate?: string | null;
    estimateHours?: number;
    remainingEstimateHours?: number;
    /** Hedef durum kategorisi; iş akışındaki uygun geçiş uygulanır */
    status?: JiraStatusCategory;
    comment?: string;
    /** Hedef Jira durum adı (ör. TESTING): verilirse geçiş bu duruma göre seçilir, yoksa kategoriye göre */
    statusName?: string;
    /** Geçişte yazılacak çözüm (Türkçe ad ya da Jira adı; ekranda yoksa geçiş çözümsüz yeniden denenir) */
    resolution?: string;
}
export interface JiraUpdateResult {
    applied: string[];
    errors: { field: string; message: string }[];
    /** Güncellemeden sonraki hâl (okunabildiyse) */
    issue?: JiraIssueRecord;
}

const TRANSITION_HINTS: Record<JiraStatusCategory, RegExp> = {
    new: /to ?do|open|reopen|yapilacak|acik|yeniden ac/,
    indeterminate: /in ?progress|start|devam|surec|basla/,
    done: /done|close|resolve|tamam|kapat|cozul|bitti/,
};
/** Uygulamadaki Türkçe çözüm adlarının Jira'daki standart karşılıkları */
const RESOLUTION_MAP: Record<string, string> = {
    'duzeltildi': 'Fixed', 'tamamlandi': 'Done', 'yapilmayacak': "Won't Do", 'tekrar (duplicate)': 'Duplicate', 'tekrar': 'Duplicate',
    'tekrarlanamadi': 'Cannot Reproduce', 'hata degil': 'Not a Bug',
};
export const jiraResolutionName = (name: string): string => RESOLUTION_MAP[foldName(name)] || name.trim();

const jiraErrorText = (body: { errors?: Record<string, unknown>; errorMessages?: unknown[] }, status: number): string =>
    [...Object.entries(body.errors || {}).map(([k, v]) => `${k}: ${str(v)}`), ...(Array.isArray(body.errorMessages) ? body.errorMessages.map(str) : [])].filter(Boolean).join('; ') || `HTTP ${status}`;

/**
 * Tek kaydı günceller: alanlar (düzenleme ekranında olmayan alan çıkarılıp
 * bir kez yeniden denenir), durum geçişi, yorum ve worklog. Adımlar
 * bağımsızdır; biri başarısız olursa diğerleri yine uygulanır ve hata
 * alan bazında döner.
 */
export const updateJiraIssue = async (env: Env, key: string, changes: JiraUpdateChanges, fetchImpl?: typeof fetch): Promise<JiraUpdateResult> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json', 'content-type': 'application/json' };
    const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; ok: boolean; body: { errors?: Record<string, unknown>; errorMessages?: unknown[] } & Record<string, unknown> }> => {
        const res = await f(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error(method === 'GET' ? 'Jira erişimi reddedildi (yetki ya da jeton hatalı).' : `Jira'da ${key} kaydını güncelleme yetkisi yok (jetonun projede düzenleme izni olmalı).`), { status: 502 });
        if (res.status === 404) throw Object.assign(new Error(`${key} Jira'da bulunamadı.`), { status: 404 });
        return { status: res.status, ok: res.ok, body: await res.json().catch(() => ({})) };
    };
    const path = `/rest/api/2/issue/${encodeURIComponent(key)}`;
    const applied: string[] = [];
    const errors: JiraUpdateResult['errors'] = [];

    // 1) Alanlar
    const fields: Record<string, unknown> = {};
    const fieldOf: Record<string, string> = {}; // Jira alanı → uygulama alanı
    if (changes.summary) { fields.summary = changes.summary; fieldOf.summary = 'summary'; }
    if (changes.priority) {
        const list = await call('GET', '/rest/api/2/priority');
        const hit = pickPriority((Array.isArray(list.body) ? list.body as { id?: unknown; name?: unknown }[] : []).map(p => ({ id: str(p.id), name: str(p.name) })), changes.priority);
        if (hit) { fields.priority = { id: hit.id }; fieldOf.priority = 'priority'; }
        else errors.push({ field: 'priority', message: "Jira'da karşılığı olan öncelik bulunamadı." });
    }
    if (changes.dueDate !== undefined) { fields.duedate = changes.dueDate; fieldOf.duedate = 'dueDate'; }
    const timeTracking = {
        ...(changes.estimateHours ? { originalEstimate: `${Math.max(1, Math.round(changes.estimateHours * 60))}m` } : {}),
        ...(changes.remainingEstimateHours !== undefined ? { remainingEstimate: `${Math.round(changes.remainingEstimateHours * 60)}m` } : {}),
    };
    if (Object.keys(timeTracking).length) {
        fields.timetracking = timeTracking;
        fieldOf.timetracking = changes.remainingEstimateHours !== undefined ? 'remainingEstimateHours' : 'estimateHours';
    }
    for (let attempt = 0; attempt < 2 && Object.keys(fields).length; attempt++) {
        const r = await call('PUT', path, { fields });
        if (r.ok) {
            applied.push(...Object.keys(fields).map(k => fieldOf[k]));
            if (fields.timetracking && timeTracking.originalEstimate && timeTracking.remainingEstimate !== undefined) applied.push('estimateHours');
            break;
        }
        const bad = Object.keys(r.body.errors || {}).filter(k => k in fields);
        if (attempt === 0 && bad.length && bad.length < Object.keys(fields).length) {
            bad.forEach(k => { errors.push({ field: fieldOf[k], message: str(r.body.errors![k]) || 'Jira bu alanı kabul etmedi.' }); delete fields[k]; });
            continue;
        }
        const message = jiraErrorText(r.body, r.status);
        Object.keys(fields).forEach(k => errors.push({ field: fieldOf[k], message }));
        break;
    }

    // 2) Durum geçişi: belirli durum adı verildiyse ona, yoksa hedef kategoriye götüren iş akışı adımı
    if (changes.status || changes.statusName) {
        const cur = await call('GET', `${path}?fields=status`);
        const st = (cur.body.fields as { status?: { name?: unknown; statusCategory?: { key?: unknown } } } | undefined)?.status;
        const current = asCategory(st?.statusCategory?.key);
        const wantName = changes.statusName ? foldName(changes.statusName) : '';
        const already = wantName ? foldName(str(st?.name)) === wantName : current === changes.status;
        if (!already) {
            const t = await call('GET', `${path}/transitions`);
            const all = Array.isArray(t.body.transitions) ? t.body.transitions as { id?: unknown; name?: unknown; to?: { name?: unknown; statusCategory?: { key?: unknown } } }[] : [];
            let pick = wantName ? all.find(x => foldName(str(x.to?.name)) === wantName) || all.find(x => foldName(str(x.name)) === wantName) : undefined;
            if (!pick && changes.status && !wantName) {
                const options = all.filter(x => asCategory(x.to?.statusCategory?.key) === changes.status);
                pick = options.find(x => TRANSITION_HINTS[changes.status!].test(foldName(`${str(x.name)} ${str(x.to?.name)}`))) || options[0];
            }
            if (!pick) {
                const avail = all.map(x => str(x.to?.name) || str(x.name)).filter(Boolean);
                errors.push({ field: 'status', message: `Jira iş akışı bu kayıt için ${changes.statusName ? `"${changes.statusName}" durumuna` : 'istenen duruma'} doğrudan geçişe izin vermiyor${avail.length ? ` (Jira'daki geçişler: ${avail.join(', ')})` : ''}.` });
            } else {
                const resolution = changes.resolution ? jiraResolutionName(changes.resolution) : undefined;
                let r = await call('POST', `${path}/transitions`, { transition: { id: str(pick.id) }, ...(resolution ? { fields: { resolution: { name: resolution } } } : {}) });
                // Çözüm alanı geçiş ekranında yoksa çözümsüz yeniden dene
                if (!r.ok && resolution && r.status === 400) {
                    r = await call('POST', `${path}/transitions`, { transition: { id: str(pick.id) } });
                    if (r.ok) errors.push({ field: 'resolution', message: "Jira geçiş ekranında çözüm alanı yok; çözüm yazılmadı." });
                }
                if (r.ok) { applied.push('status'); if (resolution && !errors.some(e => e.field === 'resolution')) applied.push('resolution'); }
                else errors.push({ field: 'status', message: jiraErrorText(r.body, r.status) });
            }
        }
    }

    // 3) Yorum ve worklog
    if (changes.comment) {
        const r = await call('POST', `${path}/comment`, { body: changes.comment });
        if (r.ok) applied.push('comment'); else errors.push({ field: 'comment', message: jiraErrorText(r.body, r.status) });
    }


    let issue: JiraIssueRecord | undefined;
    try { issue = (await fetchJiraIssuesByKeys(env, [key], fetchImpl)).issues[0]; } catch { /* güncel hâl okunamadı: sonraki eşitlemede gelir */ }
    return { applied, errors, ...(issue ? { issue } : {}) };
};

// ---------------------------------------------------------------- Jira'da kayıt açma

/** Planlamadan gelen kayıt (uygulama alanları; Jira adlarıyla sunucuda eşlenir) */
export interface JiraCreateInput {
    ref: string;
    summary: string;
    description?: string;
    issueType?: string; // bug | feature | improvement | task | other
    priority?: string; // Blocker | High | Medium | Low
    component?: string; // birim
    estimateHours?: number;
}
export interface JiraCreateResult {
    ref: string;
    key?: string;
    error?: string;
    /** Jira ekranında olmadığı için çıkarılan alanlar */
    dropped?: string[];
}
export const JIRA_CREATE_MAX = 50;

const foldName = (v: string) => v.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim();
type Named = { id: string; name: string; subtask?: boolean };
const firstMatch = (list: Named[], patterns: RegExp[]) => {
    for (const re of patterns) { const hit = list.find(x => re.test(foldName(x.name))); if (hit) return hit; }
    return undefined;
};
const TYPE_PATTERNS: Record<string, RegExp[]> = {
    bug: [/^(bug|hata)$/, /bug|defect|hata|ariza/],
    feature: [/^(story|hikaye|new feature|yeni ozellik)$/, /story|hikaye|feature|ozellik/],
    improvement: [/^(improvement|iyilestirme)$/, /improvement|enhancement|iyilestir|gelistirme/],
    task: [/^(task|gorev)$/, /task|gorev/],
};
/** Uygulamadaki tür → projedeki Jira türü; yoksa "Görev", o da yoksa alt görev olmayan ilk tür */
export const pickIssueType = (types: Named[], wanted?: string): Named | undefined => {
    const usable = types.filter(t => !t.subtask);
    return (wanted && TYPE_PATTERNS[wanted] ? firstMatch(usable, TYPE_PATTERNS[wanted]) : undefined) || firstMatch(usable, TYPE_PATTERNS.task) || usable[0];
};
const PRIORITY_PATTERNS: Record<string, RegExp[]> = {
    Blocker: [/blocker|engelleyici/, /highest|en yuksek/, /critical|kritik/],
    High: [/^(high|yuksek)$/, /major/, /high(?!est)|yuksek/],
    Medium: [/^(medium|orta|normal)$/, /medium|orta|normal/],
    Low: [/^(low|dusuk)$/, /minor/, /low(?!est)|dusuk/],
};
/** Uygulamadaki önem → Jira önceliği; eşleşmezse gönderilmez (Jira varsayılanı) */
export const pickPriority = (list: Named[], wanted?: string): Named | undefined => (wanted && PRIORITY_PATTERNS[wanted] ? firstMatch(list, PRIORITY_PATTERNS[wanted]) : undefined);

const OPTIONAL_FIELDS = ['description', 'priority', 'components', 'timetracking'];

/** Kayıtları sırayla açar; ekranda olmayan isteğe bağlı alan hatasında o alan çıkarılıp bir kez yeniden denenir */
export const createJiraIssues = async (env: Env, projectKey: string, inputs: JiraCreateInput[], fetchImpl?: typeof fetch): Promise<JiraCreateResult[]> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json', 'content-type': 'application/json' };
    const get = async (path: string) => {
        const res = await f(`${base}${path}`, { headers });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Jira erişimi reddedildi (yetki ya da jeton hatalı).'), { status: 502 });
        if (res.status === 404) throw Object.assign(new Error(`${projectKey.toUpperCase()} projesi Jira'da bulunamadı.`), { status: 404 });
        if (!res.ok) throw Object.assign(new Error(`Jira yanıtı başarısız (HTTP ${res.status}).`), { status: 502 });
        return res.json();
    };
    const project = await get(`/rest/api/2/project/${encodeURIComponent(projectKey.toUpperCase())}`) as { issueTypes?: { id?: unknown; name?: unknown; subtask?: unknown }[]; components?: { id?: unknown; name?: unknown }[] };
    const types: Named[] = (project.issueTypes || []).map(t => ({ id: str(t.id), name: str(t.name), subtask: t.subtask === true })).filter(t => t.id);
    const components: Named[] = (project.components || []).map(c => ({ id: str(c.id), name: str(c.name) })).filter(c => c.id);
    let priorities: Named[] = [];
    try { priorities = ((await get('/rest/api/2/priority')) as { id?: unknown; name?: unknown }[]).map(p => ({ id: str(p.id), name: str(p.name) })); } catch { /* öncelik gönderilmez */ }
    if (!types.length) throw Object.assign(new Error('Jira projesinde kayıt türü bulunamadı.'), { status: 502 });

    const out: JiraCreateResult[] = [];
    // Yarıda kalan istekte açılmış kayıtlar kaybolmasın (yeniden göndermede çift kayıt olur): kalanlar hatayla döner
    const failRest = (from: number, error: string) => inputs.slice(from).forEach(i => out.push({ ref: i.ref, error }));
    for (let n = 0; n < inputs.length; n++) {
        const input = inputs[n];
        const type = pickIssueType(types, input.issueType)!;
        const priority = pickPriority(priorities, input.priority);
        const component = input.component ? components.find(c => foldName(c.name) === foldName(input.component!)) : undefined;
        const minutes = input.estimateHours && input.estimateHours > 0 ? Math.max(1, Math.round(input.estimateHours * 60)) : 0;
        const fields: Record<string, unknown> = {
            project: { key: projectKey.toUpperCase() },
            summary: input.summary,
            issuetype: { id: type.id },
            ...(input.description ? { description: input.description } : {}),
            ...(priority ? { priority: { id: priority.id } } : {}),
            ...(component ? { components: [{ id: component.id }] } : {}),
            ...(minutes ? { timetracking: { originalEstimate: `${minutes}m` } } : {}),
        };
        const dropped: string[] = [];
        let result: JiraCreateResult = { ref: input.ref };
        let fatal: string | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            let res: Response;
            try {
                res = await f(`${base}/rest/api/2/issue`, { method: 'POST', headers, body: JSON.stringify({ fields }) });
            } catch (e) {
                // Kayıt açılmış olabilir: kullanıcı Jira'da denetlemeli
                result = { ref: input.ref, error: `Jira'ya ulaşılamadı; kaydın açılıp açılmadığını Jira'da denetleyin (${describeNetworkError(e)}).` };
                fatal = "Önceki kayıtta bağlantı koptu; gönderilmedi.";
                break;
            }
            if (res.status === 401 || res.status === 403) {
                fatal = "Jira'da kayıt açma yetkisi yok (jetonun projede \"Create Issues\" izni olmalı).";
                result = { ref: input.ref, error: fatal };
                break;
            }
            const body = await res.json().catch(() => ({})) as { key?: unknown; errors?: Record<string, unknown>; errorMessages?: unknown[] };
            if (res.ok && str(body.key)) { result = { ref: input.ref, key: str(body.key), ...(dropped.length ? { dropped } : {}) }; break; }
            const errors = body.errors || {};
            const optional = Object.keys(errors).filter(k => OPTIONAL_FIELDS.includes(k) && k in fields);
            if (attempt === 0 && optional.length && optional.length === Object.keys(errors).length) {
                optional.forEach(k => { delete fields[k]; dropped.push(k); });
                continue;
            }
            const msg = [...Object.entries(errors).map(([k, v]) => `${k}: ${str(v)}`), ...(Array.isArray(body.errorMessages) ? body.errorMessages.map(str) : [])].filter(Boolean).join('; ');
            result = { ref: input.ref, error: msg || `Jira kaydı açmadı (HTTP ${res.status}).` };
            break;
        }
        out.push(result);
        if (fatal) { failRest(n + 1, fatal); break; }
    }
    return out;
};

// ---------------------------------------------------------------- Teams ve e-posta

const EMAIL_RE = /^[^\s@<>(),;:"]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Alıcıları doğrular; yalnız izinli alan adlarına gönderilir (açık röle olmasın) */
export const checkRecipients = (list: unknown, env: Env): { ok: string[]; rejected: string[] } => {
    const allowed = (clean(env.NOTIFY_ALLOWED_DOMAINS) || clean(env.SMTP_FROM)?.split('@')[1] || '')
        .split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
    const ok: string[] = [];
    const rejected: string[] = [];
    (Array.isArray(list) ? list : []).slice(0, 200).forEach(x => {
        const e = String(x || '').trim().toLowerCase();
        if (!EMAIL_RE.test(e)) { if (e) rejected.push(e); return; }
        const domain = e.split('@')[1];
        if (allowed.length && !allowed.some(d => domain === d || domain.endsWith(`.${d}`))) { rejected.push(e); return; }
        if (!ok.includes(e)) ok.push(e);
    });
    return { ok, rejected };
};

export const teamsCard = (subject: string, text: string, appUrl?: string) => ({
    type: 'message',
    attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
                { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: subject, wrap: true },
                { type: 'TextBlock', text: text.length > 20000 ? `${text.slice(0, 20000)}…` : text, wrap: true },
            ],
            actions: appUrl ? [{ type: 'Action.OpenUrl', title: "PlanAsistan'ı aç", url: appUrl }] : [],
        },
    }],
});

export const sendTeams = async (env: Env, subject: string, text: string, fetchImpl?: typeof fetch): Promise<void> => {
    const url = clean(env.TEAMS_WEBHOOK_URL)!;
    const f = fetchImpl || upstreamFetch(url, env);
    const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(teamsCard(subject, text, clean(env.APP_URL))) });
    if (!res.ok) throw new Error(`Teams iletisi gönderilemedi (HTTP ${res.status}).`);
};

const smtpMailer = async (env: Env): Promise<Mailer> => {
    const nodemailer = await import('nodemailer');
    const host = clean(env.SMTP_HOST)!;
    const port = Number(clean(env.SMTP_PORT) || 587);
    const ca = extraCaFor(`https://${host}`, env);
    return nodemailer.createTransport({
        host,
        port,
        secure: clean(env.SMTP_SECURE) === 'true' || port === 465,
        auth: clean(env.SMTP_USER) ? { user: clean(env.SMTP_USER)!, pass: env.SMTP_PASS || '' } : undefined,
        ...(ca.length ? { tls: { ca } } : {}),
    }) as unknown as Mailer;
};

export const sendEmail = async (env: Env, m: { to?: string[]; bcc?: string[]; subject: string; text: string; html?: string }, mailer?: Mailer): Promise<void> => {
    const t = mailer || await smtpMailer(env);
    await t.sendMail({
        from: clean(env.SMTP_FROM)!,
        to: m.to?.length ? m.to.join(', ') : undefined,
        bcc: m.bcc?.length ? m.bcc.join(', ') : undefined,
        subject: m.subject,
        text: m.text,
        ...(m.html ? { html: m.html } : {}),
    });
};

// ---------------------------------------------------------------- haftalık hatırlatma

export const reminderMessage = (appUrl: string | undefined, now: Date): { subject: string; text: string } => {
    const d = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
    return {
        subject: 'Haftalık proje raporu hatırlatması',
        text: [
            `Sayın Proje Yöneticimiz,`,
            ``,
            `Bu haftanın (${d}) proje raporunu PlanAsistan'da yazıp bölüm sorumlunuza göndermenizi rica ederiz.`,
            `Haftalık notlarınız ve worklog kayıtlarınızdan AI önerisi alabilirsiniz; rapor kılavuzu ekranda.`,
            appUrl ? `` : '',
            appUrl ? `Rapor sayfası: ${appUrl}` : '',
        ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim(),
    };
};

// ---------------------------------------------------------------- istek işleyici

const limiter = createRateLimiter(20);
// Geçmiş aktarımı ve Jira'ya gönderme küçük parçalarla ilerler; ayrı ve daha geniş sınır
const jiraPageLimiter = createRateLimiter(60);

export const handleIntegrationRequest = async (request: Request, rawEnv: Env, opts: IntegrationOptions): Promise<Response> => {
    // Yönetici panelinde girilen Jira / Teams / e-posta ayarları ortam değişkenlerinin üzerine
    const env = await withIntegrationSettings(rawEnv, { isDev: opts.isDev, fetchImpl: opts.fetchImpl });
    const status = integrationStatus(env);
    // authMode gizli değildir: istemci hangi kimlik bilgisini göndereceğini bilmeli
    if (opts.route === 'health') return json(200, { ...status, authMode: resolveAuthMode(env, !!opts.isDev).mode });

    // Zamanlanmış görev (Vercel cron): yalnız CRON_SECRET ile
    if (opts.route === 'cron-reminder') {
        const secret = clean(env.CRON_SECRET);
        if (!secret) return json(503, { error: 'CRON_SECRET tanımlı değil.', code: 'config' });
        if ((request.headers.get('authorization') || '') !== `Bearer ${secret}`) return json(401, { error: 'Yetkisiz.', code: 'auth' });
        const msg = reminderMessage(clean(env.APP_URL), opts.now || new Date());
        const result: Record<string, string> = {};
        if (status.teams) {
            try { await sendTeams(env, msg.subject, msg.text, opts.fetchImpl); result.teams = 'sent'; } catch (e) { result.teams = (e as Error).message; }
        }
        const to = checkRecipients(clean(env.REPORT_REMINDER_TO)?.split(',') || [], env).ok;
        if (status.email && to.length) {
            try { await sendEmail(env, { bcc: to, subject: msg.subject, text: msg.text }, opts.mailer); result.email = 'sent'; } catch (e) { result.email = (e as Error).message; }
        }
        return json(200, { ok: true, ...result });
    }

    // Zamanlanmış rapor (Vercel cron): bulut verisinden zamanı gelen raporlar
    if (opts.route === 'cron-report') {
        const secret = clean(env.CRON_SECRET);
        if (!secret) return json(503, { error: 'CRON_SECRET tanımlı değil.', code: 'config' });
        if ((request.headers.get('authorization') || '') !== `Bearer ${secret}`) return json(401, { error: 'Yetkisiz.', code: 'auth' });
        const r = await runReportCron(env, {
            now: opts.now || new Date(), fetchImpl: opts.fetchImpl,
            deliver: (ch, subject, text, sections) => deliverReport(env, status, ch, subject, text, sections, opts),
        });
        return json(r.status, r.body);
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    const method = opts.route === 'jira-history' ? 'GET' : 'POST';
    if (request.method !== method) return json(405, { error: `Yalnızca ${method}.`, code: 'bad_request' });

    const auth = resolveAuthMode(env, !!opts.isDev);
    if (auth.problem) return json(503, { error: auth.problem, code: 'config' });
    const who = await authorize(request, {
        authMode: auth.mode,
        accessToken: clean(env.AI_ACCESS_TOKEN),
        supabaseUrl: clean(env.SUPABASE_URL)?.replace(/\/+$/, ''),
        supabaseAnonKey: clean(env.SUPABASE_ANON_KEY),
    }, opts.fetchImpl || fetch);
    if (who.ok === false) return json(who.status, { error: who.message, code: 'auth' });
    const wait = (opts.route === 'jira-issues' || opts.route === 'jira-create' || opts.route === 'jira-sync' ? jiraPageLimiter : limiter).hit(who.subject);
    if (wait > 0) {
        const res = json(429, { error: 'Çok fazla istek; biraz sonra tekrar deneyin.', code: 'rate_limited' });
        res.headers.set('retry-after', String(wait));
        return res;
    }

    if (opts.route === 'jira-history') {
        if (!status.jira) return json(501, { error: 'Jira bağlantısı yapılandırılmadı.', code: 'config' });
        const key = new URL(request.url).searchParams.get('key') || '';
        try {
            return json(200, { entries: await fetchJiraHistory(env, key, opts.fetchImpl) });
        } catch (e) {
            const err = e as Error & { status?: number };
            return json(err.status || 502, { error: err.status ? err.message : `Jira'ya ulaşılamadı: ${describeNetworkError(e)}`, code: 'upstream' });
        }
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json() as Record<string, unknown>;
    } catch {
        return json(400, { error: 'Geçersiz istek gövdesi.', code: 'bad_request' });
    }

    const timezone = body.timeZone === undefined ? JIRA_WORK_TIME_ZONE : String(body.timeZone);
    if (opts.route === 'jira-worklogs') {
        try {
            if (!timezone || timezone.length > 64) throw new Error();
            new Intl.DateTimeFormat('tr-TR', { timeZone: timezone });
        } catch {
            return json(400, { error: 'Geçersiz worklog saat dilimi.', code: 'bad_request' });
        }
        if (status.jira && auth.mode !== 'supabase' && !(opts.isDev && auth.mode === 'none') && env.JIRA_WORKLOG_SINGLE_USER !== '1') {
            return json(403, { error: 'Worklog okumak için kişisel Supabase oturumu veya tek kullanıcılı sunucu ayarı gerekir.', code: 'forbidden' });
        }
    }

    if (opts.route === 'jira-worklogs' && Array.isArray(body.keys)) {
        // Kayıt bazında tüm worklog'lar (görev eşitlemesindeki billing hours)
        if (!status.jira) return json(501, { error: "Jira bağlantısı yapılandırılmadı (kurum içi izin ve sunucu ayarı gerekir).", code: 'config' });
        const keys = [...new Set(body.keys.map(k => String(k).trim().toUpperCase()))];
        if (!keys.length || keys.length > MAX_WORKLOG_KEYS || keys.some(k => !ISSUE_KEY_RE.test(k))) {
            return json(400, { error: `1–${MAX_WORKLOG_KEYS} geçerli Jira kayıt anahtarı gerekir (ör. MKS-12).`, code: 'bad_request' });
        }
        const blocked = [...new Set(keys.map(k => k.split('-')[0]))].filter(p => !jiraProjectAllowed(env, p));
        if (blocked.length) return json(403, { error: `${blocked.join(', ')} projesi bu sunucuda Jira erişimine açık değil.`, code: 'forbidden' });
        try {
            const { entries, missing } = await fetchJiraIssueWorklogs(env, keys, opts.fetchImpl, timezone, body.incremental === true);
            const visible = allowedWorklogs(env, who, entries);
            return json(200, { entries: body.detail === true ? visible : visible.map(({ comment: _, ...entry }) => entry), missing });
        } catch (e) {
            const err = e as Error & { status?: number };
            return json(err.status || 502, { error: err.status ? err.message : `Jira'ya ulaşılamadı: ${describeNetworkError(e)}`, code: 'upstream' });
        }
    }

    if (opts.route === 'jira-worklogs') {
        if (!status.jira) return json(501, { error: "Jira bağlantısı yapılandırılmadı (kurum içi izin ve sunucu ayarı gerekir).", code: 'config' });
        const key = String(body.projectKey || ''), from = String(body.from || ''), to = String(body.to || '');
        if (!KEY_RE.test(key) || !isIsoDay(from) || !isIsoDay(to) || from > to) return json(400, { error: 'Geçersiz proje anahtarı ya da tarih aralığı.', code: 'bad_request' });
        if (!jiraProjectAllowed(env, key)) return json(403, { error: `${key.toUpperCase()} projesi bu sunucuda Jira erişimine açık değil.`, code: 'forbidden' });
        try {
            const entries = allowedWorklogs(env, who, await fetchJiraWorklogs(env, key, from, to, opts.fetchImpl, timezone));
            return json(200, { entries: body.detail === true ? entries : entries.map(({ comment: _, ...entry }) => entry) });
        } catch (e) {
            const err = e as Error & { status?: number };
            return json(err.status || 502, { error: err.status ? err.message : `Jira'ya ulaşılamadı: ${describeNetworkError(e)}`, code: 'upstream' });
        }
    }

    if (opts.route === 'jira-issues') {
        if (!status.jira) return json(501, { error: "Jira bağlantısı yapılandırılmadı (kurum içi izin ve sunucu ayarı gerekir).", code: 'config' });
        const key = String(body.projectKey || '');
        const scope: JiraIssueScope = body.scope === 'all' ? 'all' : 'done';
        const since = body.since ? String(body.since) : undefined;
        const cursor = body.cursor === undefined || body.cursor === null ? undefined : String(body.cursor);
        if (!KEY_RE.test(key) || (since !== undefined && (!DATE_RE.test(since) || since < '2000-01-01')) || (cursor !== undefined && (cursor.length > 2000 || /\s/.test(cursor)))) {
            return json(400, { error: 'Geçersiz proje anahtarı, tarih ya da sayfa imleci.', code: 'bad_request' });
        }
        if (!jiraProjectAllowed(env, key)) return json(403, { error: `${key.toUpperCase()} projesi bu sunucuda Jira erişimine açık değil.`, code: 'forbidden' });
        try {
            return json(200, await fetchJiraIssuesPage(env, { projectKey: key, scope, since, cursor, pageSize: Number(body.pageSize) || undefined }, opts.fetchImpl));
        } catch (e) {
            const err = e as Error & { status?: number };
            return json(err.status || 502, { error: err.status ? err.message : `Jira'ya ulaşılamadı: ${describeNetworkError(e)}`, code: 'upstream' });
        }
    }

    if (opts.route === 'jira-sync') {
        if (!status.jira) return json(501, { error: "Jira bağlantısı yapılandırılmadı (kurum içi izin ve sunucu ayarı gerekir).", code: 'config' });
        const fail = (e: unknown) => {
            const err = e as Error & { status?: number };
            return json(err.status || 502, { error: err.status ? err.message : `Jira'ya ulaşılamadı: ${describeNetworkError(e)}`, code: 'upstream' });
        };
        const keyAllowed = (k: string) => jiraProjectAllowed(env, k.split('-')[0]);
        const op = String(body.op || '');
        try {
            // Bağlantı sınaması ve kaynak seçenekleri
            if (op === 'meta') return json(200, await fetchJiraMeta(env, opts.fetchImpl));

            if (op === 'sprintBoards' || op === 'boardSprints' || op === 'sprintIssues') {
                const projectKey = String(body.projectKey || '').trim().toUpperCase();
                if (!KEY_RE.test(projectKey)) return json(400, { error: 'Geçerli Jira proje anahtarı gerekir.', code: 'bad_request' });
                if (!jiraProjectAllowed(env, projectKey)) return json(403, { error: `${projectKey} projesi bu sunucuda Jira erişimine açık değil.`, code: 'forbidden' });
                if (op === 'sprintBoards') return json(200, await jiraSprintBoards(env, projectKey, opts.fetchImpl));
                if (op === 'boardSprints') {
                    const boardId = agileId(body.boardId);
                    const state = String(body.state || '');
                    if (!boardId || !['', 'active', 'future', 'closed'].includes(state)) return json(400, { error: 'Geçersiz Jira panosu ya da sprint durumu.', code: 'bad_request' });
                    const boards = await jiraSprintBoards(env, projectKey, opts.fetchImpl);
                    if (!boards.values.some(board => board.id === boardId)) return json(403, { error: 'Bu Jira panosu seçili projede erişilebilir değil.', code: 'forbidden' });
                    return json(200, await jiraBoardSprints(env, boardId, state, opts.fetchImpl));
                }
                const sprintId = agileId(body.sprintId);
                const cursor = body.cursor == null ? undefined : String(body.cursor);
                if (!sprintId || (cursor !== undefined && (cursor.length > 2000 || /\s/.test(cursor)))) return json(400, { error: 'Geçersiz Jira sprinti ya da sayfa imleci.', code: 'bad_request' });
                const page = await fetchIssuesByJql(env, `project = "${projectKey}" AND sprint = ${sprintId} ORDER BY key ASC`, { cursor }, opts.fetchImpl);
                return json(200, { ...page, issues: page.issues.filter(issue => issue.key.split('-')[0].toUpperCase() === projectKey) });
            }

            // Kapsamlı okuma: anahtarı bilinen kayıtlar ya da kaynak (proje / etiket / kayıtlı filtre)
            if (op === 'search') {
                if (Array.isArray(body.keys)) {
                    const keys = body.keys.map(k => String(k).trim().toUpperCase());
                    if (!keys.length || keys.length > JIRA_SYNC_KEYS_MAX || keys.some(k => !ISSUE_KEY_RE.test(k))) return json(400, { error: `Bir istekte 1–${JIRA_SYNC_KEYS_MAX} geçerli Jira anahtarı gönderilebilir.`, code: 'bad_request' });
                    const blocked = keys.find(k => !keyAllowed(k));
                    if (blocked) return json(403, { error: `${blocked.split('-')[0]} projesi bu sunucuda Jira erişimine açık değil.`, code: 'forbidden' });
                    const r = await fetchJiraIssuesByKeys(env, keys, opts.fetchImpl);
                    return json(200, { issues: r.issues, missing: r.missing, total: r.issues.length, next: null });
                }
                const checked = checkSyncSource(env, body.source);
                if ('error' in checked) return json(checked.status, { error: checked.error, code: checked.status === 403 ? 'forbidden' : 'bad_request' });
                const cursor = body.cursor === undefined || body.cursor === null ? undefined : String(body.cursor);
                if (cursor !== undefined && (cursor.length > 2000 || /\s/.test(cursor))) return json(400, { error: 'Geçersiz sayfa imleci.', code: 'bad_request' });
                const page = await fetchIssuesByJql(env, buildSyncJql(env, checked.source, body.openOnly !== false), { cursor, pageSize: Number(body.pageSize) || undefined }, opts.fetchImpl);
                return json(200, { ...page, missing: [] });
            }

            // Uygulamadan Jira kaydını güncelleme
            if (op === 'update') {
                if (!status.jiraUpdate) return json(403, { error: "Jira kaydı güncelleme bu sunucuda kapalı (JIRA_ALLOW_UPDATE).", code: 'forbidden' });
                const key = String(body.key || '').trim().toUpperCase();
                if (!ISSUE_KEY_RE.test(key)) return json(400, { error: 'Geçersiz Jira anahtarı.', code: 'bad_request' });
                if (!keyAllowed(key)) return json(403, { error: `${key.split('-')[0]} projesi bu sunucuda Jira erişimine açık değil.`, code: 'forbidden' });
                const c = (body.changes && typeof body.changes === 'object' ? body.changes : {}) as Record<string, unknown>;
                const hours = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, max) : undefined);
                if ('worklogHours' in c) return json(403, { error: 'Jira çalışma kayıtları salt okunurdur.', code: 'forbidden' });
                const changes: JiraUpdateChanges = {
                    summary: typeof c.summary === 'string' ? c.summary.replace(/\s+/g, ' ').trim().slice(0, 255) || undefined : undefined,
                    priority: typeof c.priority === 'string' && Object.hasOwn(PRIORITY_PATTERNS, c.priority) ? c.priority : undefined,
                    dueDate: c.dueDate === null ? null : typeof c.dueDate === 'string' && DATE_RE.test(c.dueDate) ? c.dueDate : undefined,
                    estimateHours: hours(c.estimateHours, 10000),
                    remainingEstimateHours: typeof c.remainingEstimateHours === 'number' && c.remainingEstimateHours >= 0 && c.remainingEstimateHours <= 10000 ? c.remainingEstimateHours : undefined,
                    status: asCategory(c.status) || undefined,
                    comment: typeof c.comment === 'string' ? c.comment.trim().slice(0, 30000) || undefined : undefined,
                    statusName: typeof c.statusName === 'string' && /^[\p{L}\p{N} ._'()&/-]{1,60}$/u.test(c.statusName.trim()) ? c.statusName.trim() : undefined,
                    resolution: typeof c.resolution === 'string' && /^[\p{L}\p{N} ._'()-]{1,60}$/u.test(c.resolution.trim()) ? c.resolution.trim() : undefined,
                };
                if (!Object.values(changes).some(v => v !== undefined)) return json(400, { error: 'Güncellenecek geçerli alan yok.', code: 'bad_request' });
                return json(200, await updateJiraIssue(env, key, changes, opts.fetchImpl));
            }
        } catch (e) {
            return fail(e);
        }
        return json(400, { error: 'Geçersiz işlem.', code: 'bad_request' });
    }

    if (opts.route === 'jira-create') {
        if (!status.jira) return json(501, { error: "Jira bağlantısı yapılandırılmadı (kurum içi izin ve sunucu ayarı gerekir).", code: 'config' });
        if (!status.jiraCreate) return json(403, { error: "Jira'da kayıt açma bu sunucuda kapalı (JIRA_ALLOW_CREATE).", code: 'forbidden' });
        const key = String(body.projectKey || '');
        if (!KEY_RE.test(key)) return json(400, { error: 'Geçersiz proje anahtarı.', code: 'bad_request' });
        if (!jiraProjectAllowed(env, key)) return json(403, { error: `${key.toUpperCase()} projesi bu sunucuda Jira erişimine açık değil.`, code: 'forbidden' });
        const raw = Array.isArray(body.issues) ? body.issues as Record<string, unknown>[] : [];
        if (!raw.length || raw.length > JIRA_CREATE_MAX) return json(400, { error: `Bir istekte 1–${JIRA_CREATE_MAX} kayıt gönderilebilir.`, code: 'bad_request' });
        const inputs: JiraCreateInput[] = raw.map(r => ({
            ref: String(r.ref || '').slice(0, 100),
            summary: String(r.summary || '').replace(/\s+/g, ' ').trim().slice(0, 255),
            description: typeof r.description === 'string' ? r.description.slice(0, 30000) : undefined,
            issueType: typeof r.issueType === 'string' ? r.issueType : undefined,
            priority: typeof r.priority === 'string' ? r.priority : undefined,
            component: typeof r.component === 'string' ? r.component.slice(0, 255) : undefined,
            estimateHours: typeof r.estimateHours === 'number' && Number.isFinite(r.estimateHours) && r.estimateHours > 0 ? Math.min(r.estimateHours, 10000) : undefined,
        }));
        if (inputs.some(i => !i.ref || !i.summary)) return json(400, { error: 'Her kaydın kimliği ve başlığı olmalı.', code: 'bad_request' });
        try {
            return json(200, { results: await createJiraIssues(env, key, inputs, opts.fetchImpl) });
        } catch (e) {
            const err = e as Error & { status?: number };
            return json(err.status || 502, { error: err.status ? err.message : `Jira'ya ulaşılamadı: ${describeNetworkError(e)}`, code: 'upstream' });
        }
    }

    // notify: Teams kanalına ve/veya e-posta ile bildirim
    const subject = String(body.subject || '').trim().slice(0, 200);
    const text = String(body.text || '').trim().slice(0, 50000);
    const html = typeof body.html === 'string' ? body.html.slice(0, 200000) : undefined;
    if (!subject || !text) return json(400, { error: 'Konu ve metin gerekli.', code: 'bad_request' });
    const result: { teams?: string; email?: string; slack?: string; notion?: string; rejected?: string[] } = {};
    // Rapor kanalları: Slack ve Notion (bölümlerle biçimlenir; yoksa metinden)
    if (body.slack || body.notion) {
        const r = await deliverReport(env, status, { slack: !!body.slack, notion: !!body.notion }, subject, text, parseSections(body.sections), opts);
        if (r.slack) result.slack = r.slack;
        if (r.notion) result.notion = r.notion;
    }
    if (body.teams) {
        if (!status.teams) result.teams = 'not_configured';
        else {
            try { await sendTeams(env, subject, text, opts.fetchImpl); result.teams = 'sent'; } catch (e) { result.teams = (e as Error).message; }
        }
    }
    if (body.email) {
        const e = body.email as { to?: unknown; bcc?: unknown };
        const to = checkRecipients(e.to, env), bcc = checkRecipients(e.bcc, env);
        result.rejected = [...to.rejected, ...bcc.rejected];
        if (!status.email) result.email = 'not_configured';
        else if (!to.ok.length && !bcc.ok.length) result.email = 'Geçerli alıcı yok.';
        else {
            try { await sendEmail(env, { to: to.ok, bcc: bcc.ok, subject, text, html }, opts.mailer); result.email = 'sent'; } catch (err) { result.email = (err as Error).message; }
        }
    }
    return json(200, result);
};
