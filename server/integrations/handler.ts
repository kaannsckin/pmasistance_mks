import { authorize } from '../ai/auth.js';
import { Env, resolveAuthMode } from '../ai/config.js';
import { createRateLimiter } from '../ai/rateLimit.js';
import { describeNetworkError, extraCaFor, upstreamFetch } from '../ai/tls.js';

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
 *   JIRA_ALLOW_UPDATE                       (isteğe bağlı, "1": uygulamadan Jira kaydı güncellenebilir — alan, durum geçişi, yorum, worklog)
 *   TEAMS_WEBHOOK_URL                       (Teams kanalı / Power Automate iş akışı)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
 *   NOTIFY_ALLOWED_DOMAINS                  (alıcı alan adları; yoksa SMTP_FROM'un alanı)
 *   REPORT_REMINDER_TO, APP_URL, CRON_SECRET (haftalık hatırlatma)
 */

export type IntegrationRoute = 'health' | 'jira-worklogs' | 'jira-issues' | 'jira-create' | 'jira-sync' | 'notify' | 'cron-reminder';

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
}

const jiraConfigured = (env: Env) => !!clean(env.JIRA_BASE_URL) && (!!clean(env.JIRA_TOKEN) || (!!clean(env.JIRA_EMAIL) && !!clean(env.JIRA_API_TOKEN)));

export const integrationStatus = (env: Env): IntegrationStatus => ({
    jira: jiraConfigured(env),
    jiraCreate: jiraConfigured(env) && /^(1|true|evet|yes)$/i.test(clean(env.JIRA_ALLOW_CREATE) || ''),
    jiraUpdate: jiraConfigured(env) && /^(1|true|evet|yes)$/i.test(clean(env.JIRA_ALLOW_UPDATE) || ''),
    teams: !!clean(env.TEAMS_WEBHOOK_URL),
    email: !!clean(env.SMTP_HOST) && !!clean(env.SMTP_FROM),
    reminder: !!clean(env.CRON_SECRET) && (!!clean(env.TEAMS_WEBHOOK_URL) || (!!clean(env.SMTP_HOST) && !!clean(env.REPORT_REMINDER_TO))),
});

// ---------------------------------------------------------------- Jira

export interface JiraWorklog {
    date: string;
    author: string;
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

type JiraWorklogRaw = { started?: string; timeSpentSeconds?: number; comment?: unknown; author?: { displayName?: string; name?: string } };
type JiraIssueRaw = { key: string; fields?: { summary?: string; worklog?: { total?: number; maxResults?: number; worklogs?: JiraWorklogRaw[] } } };

const commentText = (c: unknown): string | undefined => {
    if (typeof c === 'string') return c.trim() || undefined;
    // Jira Cloud v3 biçimi (ADF) gelirse düz metne indir
    const out: string[] = [];
    const walk = (n: unknown) => {
        if (!n || typeof n !== 'object') return;
        const o = n as { text?: unknown; content?: unknown[] };
        if (typeof o.text === 'string') out.push(o.text);
        (o.content || []).forEach(walk);
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
export const fetchJiraWorklogs = async (env: Env, projectKey: string, from: string, to: string, fetchImpl?: typeof fetch): Promise<JiraWorklog[]> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json' };
    const get = async (path: string) => {
        const res = await f(`${base}${path}`, { headers });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Jira erişimi reddedildi (yetki ya da jeton hatalı).'), { status: 502 });
        if (!res.ok) throw Object.assign(new Error(`Jira yanıtı başarısız (HTTP ${res.status}).`), { status: 502 });
        return res.json();
    };
    const params = `jql=${encodeURIComponent(buildWorklogJql(projectKey, from, to))}&fields=summary,worklog&maxResults=100`;
    const cloud = isJiraCloud(base);
    const issues: JiraIssueRaw[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) { // en çok 500 kayıt
        const r: { issues: JiraIssueRaw[]; next: string | null } = await searchJiraPage<JiraIssueRaw>(get, cloud, params, cursor);
        issues.push(...r.issues);
        if (!r.next) break;
        cursor = r.next;
    }
    const out: JiraWorklog[] = [];
    for (const issue of issues) {
        let logs = issue.fields?.worklog?.worklogs || [];
        if ((issue.fields?.worklog?.total || 0) > logs.length) {
            const all = await get(`/rest/api/2/issue/${encodeURIComponent(issue.key)}/worklog`) as { worklogs?: JiraWorklogRaw[] };
            logs = all.worklogs || logs;
        }
        logs.forEach(w => {
            const date = (w.started || '').slice(0, 10);
            if (!DATE_RE.test(date) || date < from || date > to) return;
            const hours = Math.round(((w.timeSpentSeconds || 0) / 3600) * 100) / 100;
            if (!(hours > 0)) return;
            out.push({ date, author: w.author?.displayName || w.author?.name || '', issueKey: issue.key, summary: issue.fields?.summary || '', hours, comment: commentText(w.comment), source: 'jira' });
        });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.issueKey.localeCompare(b.issueKey));
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
    storyPoints: number | null;
    assignee: string;
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
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
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

type JiraHistoryRaw = { created?: string; items?: { field?: string; fieldId?: string; from?: unknown; to?: unknown; fromString?: unknown; toString?: unknown }[] };
type JiraFullIssueRaw = { key: string; fields?: Record<string, unknown>; changelog?: { total?: number; histories?: JiraHistoryRaw[] } };

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
    return {
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
        originalEstimateSeconds: num(f.timeoriginalestimate),
        timeSpentSeconds: num(f.timespent),
        storyPoints: Number.isFinite(points) && points > 0 ? points : null,
        assignee: str((f.assignee as { displayName?: unknown })?.displayName) || str((f.assignee as { name?: unknown })?.name),
        blockedBy: links
            .filter(l => /block|engel/i.test(str(l.type?.name)) && /blocked by|engellen/i.test(str(l.type?.inward)) && str(l.inwardIssue?.key))
            .map(l => str(l.inwardIssue!.key)),
        transitions: transitionsOf(raw.changelog?.histories || [], categories),
        due: typeof f.duedate === 'string' && DATE_RE.test(f.duedate.slice(0, 10)) ? f.duedate.slice(0, 10) : null,
        ...(isoOf(f.updated) ? { updated: isoOf(f.updated) } : {}),
    };
};

const ISSUE_FIELDS = 'summary,description,issuetype,status,priority,created,updated,resolutiondate,duedate,components,labels,fixVersions,timeoriginalestimate,timespent,assignee,issuelinks';

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
}
export const JIRA_SYNC_KEYS_MAX = 100;
const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}-\d{1,9}$/;
const LABEL_RE = /^[^\s"\\,()]{1,100}$/;
const FILTER_RE = /^\d{1,12}$/;

const allowedProjects = (env: Env): string[] => (clean(env.JIRA_ALLOWED_PROJECTS) || '').split(',').map(k => k.trim().toUpperCase()).filter(k => KEY_RE.test(k));
const quoted = (list: string[]) => list.map(v => `"${v}"`).join(', ');

/** Kaynağı doğrular; hata iletisi ya da temiz kaynak döner */
export const checkSyncSource = (env: Env, raw: unknown): { source: JiraSyncSource } | { error: string; status: number } => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const projectKey = r.projectKey ? String(r.projectKey).trim().toUpperCase() : undefined;
    const labels = Array.isArray(r.labels) ? [...new Set(r.labels.map(l => String(l).trim()).filter(Boolean))] : [];
    const filterId = r.filterId ? String(r.filterId).trim() : undefined;
    if (!projectKey && !labels.length && !filterId) return { error: 'Eşitleme kaynağı gerekli: proje, etiket ya da kayıtlı filtre seçin (tüm Jira taranmaz).', status: 400 };
    if ((projectKey && !KEY_RE.test(projectKey)) || labels.length > 10 || labels.some(l => !LABEL_RE.test(l)) || (filterId && !FILTER_RE.test(filterId))) {
        return { error: 'Geçersiz proje anahtarı, etiket ya da filtre.', status: 400 };
    }
    if (projectKey && !jiraProjectAllowed(env, projectKey)) return { error: `${projectKey} projesi bu sunucuda Jira erişimine açık değil.`, status: 403 };
    return { source: { ...(projectKey ? { projectKey } : {}), ...(labels.length ? { labels } : {}), ...(filterId ? { filterId } : {}) } };
};

/** Kaynak JQL'i: yalnız açık kayıtlar (istenirse); izin listesi varsa sorgu ona da daraltılır */
export const buildSyncJql = (env: Env, source: JiraSyncSource, openOnly = true): string => {
    const allowed = allowedProjects(env);
    return [
        source.projectKey ? `project = "${source.projectKey}"` : allowed.length ? `project in (${quoted(allowed)})` : '',
        source.labels?.length ? `labels in (${quoted(source.labels)})` : '',
        source.filterId ? `filter = ${source.filterId}` : '',
        openOnly ? 'statusCategory != Done' : '',
    ].filter(Boolean).join(' AND ') + ' ORDER BY key ASC';
};

export const buildKeysJql = (keys: string[]): string => `key in (${quoted(keys)}) ORDER BY key ASC`;

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
    /** Hedef durum kategorisi; iş akışındaki uygun geçiş uygulanır */
    status?: JiraStatusCategory;
    comment?: string;
    worklogHours?: number;
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
const jiraErrorText = (body: { errors?: Record<string, unknown>; errorMessages?: unknown[] }, status: number): string =>
    [...Object.entries(body.errors || {}).map(([k, v]) => `${k}: ${str(v)}`), ...(Array.isArray(body.errorMessages) ? body.errorMessages.map(str) : [])].filter(Boolean).join('; ') || `HTTP ${status}`;

/**
 * Tek kaydı günceller: alanlar (düzenleme ekranında olmayan alan çıkarılıp
 * bir kez yeniden denenir), durum geçişi, yorum ve worklog. Adımlar
 * bağımsızdır; biri başarısız olursa diğerleri yine uygulanır ve hata
 * alan bazında döner.
 */
export const updateJiraIssue = async (env: Env, key: string, changes: JiraUpdateChanges, fetchImpl?: typeof fetch, now: Date = new Date()): Promise<JiraUpdateResult> => {
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
    if (changes.estimateHours) { fields.timetracking = { originalEstimate: `${Math.max(1, Math.round(changes.estimateHours * 60))}m` }; fieldOf.timetracking = 'estimateHours'; }
    for (let attempt = 0; attempt < 2 && Object.keys(fields).length; attempt++) {
        const r = await call('PUT', path, { fields });
        if (r.ok) { applied.push(...Object.keys(fields).map(k => fieldOf[k])); break; }
        const bad = Object.keys(r.body.errors || {}).filter(k => k in fields);
        if (attempt === 0 && bad.length && bad.length < Object.keys(fields).length) {
            bad.forEach(k => { errors.push({ field: fieldOf[k], message: str(r.body.errors![k]) || 'Jira bu alanı kabul etmedi.' }); delete fields[k]; });
            continue;
        }
        const message = jiraErrorText(r.body, r.status);
        Object.keys(fields).forEach(k => errors.push({ field: fieldOf[k], message }));
        break;
    }

    // 2) Durum geçişi: hedef kategoriye götüren iş akışı adımı
    if (changes.status) {
        const cur = await call('GET', `${path}?fields=status`);
        const current = asCategory(((cur.body.fields as { status?: { statusCategory?: { key?: unknown } } } | undefined)?.status?.statusCategory?.key));
        if (current !== changes.status) {
            const t = await call('GET', `${path}/transitions`);
            const options = (Array.isArray(t.body.transitions) ? t.body.transitions as { id?: unknown; name?: unknown; to?: { name?: unknown; statusCategory?: { key?: unknown } } }[] : [])
                .filter(x => asCategory(x.to?.statusCategory?.key) === changes.status);
            const pick = options.find(x => TRANSITION_HINTS[changes.status!].test(foldName(`${str(x.name)} ${str(x.to?.name)}`))) || options[0];
            if (!pick) errors.push({ field: 'status', message: 'Jira iş akışı bu kayıt için istenen duruma doğrudan geçişe izin vermiyor.' });
            else {
                const r = await call('POST', `${path}/transitions`, { transition: { id: str(pick.id) } });
                if (r.ok) applied.push('status');
                else errors.push({ field: 'status', message: jiraErrorText(r.body, r.status) });
            }
        }
    }

    // 3) Yorum ve worklog
    if (changes.comment) {
        const r = await call('POST', `${path}/comment`, { body: changes.comment });
        if (r.ok) applied.push('comment'); else errors.push({ field: 'comment', message: jiraErrorText(r.body, r.status) });
    }
    if (changes.worklogHours) {
        const r = await call('POST', `${path}/worklog`, { timeSpentSeconds: Math.max(60, Math.round(changes.worklogHours * 3600)), started: now.toISOString().replace('Z', '+0000') });
        if (r.ok) applied.push('worklog'); else errors.push({ field: 'worklog', message: jiraErrorText(r.body, r.status) });
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

export const handleIntegrationRequest = async (request: Request, env: Env, opts: IntegrationOptions): Promise<Response> => {
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

    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return json(405, { error: 'Yalnızca POST.', code: 'bad_request' });

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

    let body: Record<string, unknown>;
    try {
        body = await request.json() as Record<string, unknown>;
    } catch {
        return json(400, { error: 'Geçersiz istek gövdesi.', code: 'bad_request' });
    }

    if (opts.route === 'jira-worklogs') {
        if (!status.jira) return json(501, { error: "Jira bağlantısı yapılandırılmadı (kurum içi izin ve sunucu ayarı gerekir).", code: 'config' });
        const key = String(body.projectKey || ''), from = String(body.from || ''), to = String(body.to || '');
        if (!KEY_RE.test(key) || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return json(400, { error: 'Geçersiz proje anahtarı ya da tarih aralığı.', code: 'bad_request' });
        if (!jiraProjectAllowed(env, key)) return json(403, { error: `${key.toUpperCase()} projesi bu sunucuda Jira erişimine açık değil.`, code: 'forbidden' });
        try {
            return json(200, { entries: await fetchJiraWorklogs(env, key, from, to, opts.fetchImpl) });
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
                const changes: JiraUpdateChanges = {
                    summary: typeof c.summary === 'string' ? c.summary.replace(/\s+/g, ' ').trim().slice(0, 255) || undefined : undefined,
                    priority: typeof c.priority === 'string' && Object.hasOwn(PRIORITY_PATTERNS, c.priority) ? c.priority : undefined,
                    dueDate: c.dueDate === null ? null : typeof c.dueDate === 'string' && DATE_RE.test(c.dueDate) ? c.dueDate : undefined,
                    estimateHours: hours(c.estimateHours, 10000),
                    status: asCategory(c.status) || undefined,
                    comment: typeof c.comment === 'string' ? c.comment.trim().slice(0, 30000) || undefined : undefined,
                    worklogHours: hours(c.worklogHours, 24),
                };
                if (!Object.values(changes).some(v => v !== undefined)) return json(400, { error: 'Güncellenecek geçerli alan yok.', code: 'bad_request' });
                return json(200, await updateJiraIssue(env, key, changes, opts.fetchImpl, opts.now));
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
    const result: { teams?: string; email?: string; rejected?: string[] } = {};
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
