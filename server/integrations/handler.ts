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
 *   TEAMS_WEBHOOK_URL                       (Teams kanalı / Power Automate iş akışı)
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
 *   NOTIFY_ALLOWED_DOMAINS                  (alıcı alan adları; yoksa SMTP_FROM'un alanı)
 *   REPORT_REMINDER_TO, APP_URL, CRON_SECRET (haftalık hatırlatma)
 */

export type IntegrationRoute = 'health' | 'jira-worklogs' | 'jira-issues' | 'notify' | 'cron-reminder';

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
    teams: boolean;
    email: boolean;
    reminder: boolean;
}

export const integrationStatus = (env: Env): IntegrationStatus => ({
    jira: !!clean(env.JIRA_BASE_URL) && (!!clean(env.JIRA_TOKEN) || (!!clean(env.JIRA_EMAIL) && !!clean(env.JIRA_API_TOKEN))),
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
    const jql = encodeURIComponent(buildWorklogJql(projectKey, from, to));
    const issues: JiraIssueRaw[] = [];
    for (let startAt = 0; startAt < 500; startAt += 100) {
        const page = await get(`/rest/api/2/search?jql=${jql}&fields=summary,worklog&maxResults=100&startAt=${startAt}`) as { issues?: JiraIssueRaw[]; total?: number };
        issues.push(...(page.issues || []));
        if (!page.issues?.length || issues.length >= (page.total || 0)) break;
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
    };
};

const ISSUE_FIELDS = 'summary,description,issuetype,status,priority,created,resolutiondate,components,labels,fixVersions,timeoriginalestimate,timespent,assignee,issuelinks';

/**
 * Projenin kayıtlarından bir sayfa: alanlar ve durum geçmişi (changelog).
 * Jira Cloud yeni arama ucunu (`search/jql`, sayfa jetonu), Server/DC
 * klasik aramayı (`search`, startAt) kullanır; imleç iki biçimi de taşır.
 */
export const fetchJiraIssuesPage = async (
    env: Env,
    q: { projectKey: string; scope: JiraIssueScope; since?: string; cursor?: string; pageSize?: number },
    fetchImpl?: typeof fetch,
): Promise<{ issues: JiraIssueRecord[]; total: number | null; next: string | null }> => {
    const base = clean(env.JIRA_BASE_URL)!.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const headers = { authorization: jiraAuth(env), accept: 'application/json' };
    const get = async (path: string) => {
        const res = await f(`${base}${path}`, { headers });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Jira erişimi reddedildi (yetki ya da jeton hatalı).'), { status: 502 });
        if (res.status === 400) throw Object.assign(new Error('Jira sorguyu kabul etmedi (proje anahtarı doğru mu?).'), { status: 502 });
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

    const cloud = /\.atlassian\.net$/i.test(new URL(base).hostname);
    const size = Math.max(10, Math.min(JIRA_PAGE_MAX, Math.round(q.pageSize || JIRA_PAGE_MAX)));
    const params = `jql=${encodeURIComponent(buildIssueJql(q.projectKey, q.scope, q.since))}&fields=${ISSUE_FIELDS}${pointsField ? `,${pointsField}` : ''}&expand=changelog&maxResults=${size}`;
    let raws: JiraFullIssueRaw[];
    let total: number | null = null;
    let next: string | null = null;
    if (cloud) {
        const page = await get(`/rest/api/2/search/jql?${params}${q.cursor ? `&nextPageToken=${encodeURIComponent(q.cursor)}` : ''}`) as { issues?: JiraFullIssueRaw[]; nextPageToken?: string; isLast?: boolean };
        raws = page.issues || [];
        next = !page.isLast && page.nextPageToken ? page.nextPageToken : null;
    } else {
        const startAt = Math.max(0, Number(q.cursor) || 0);
        const page = await get(`/rest/api/2/search?${params}&startAt=${startAt}`) as { issues?: JiraFullIssueRaw[]; total?: number };
        raws = page.issues || [];
        total = typeof page.total === 'number' ? page.total : null;
        next = raws.length && startAt + raws.length < (total ?? 0) ? String(startAt + raws.length) : null;
    }
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
// Geçmiş aktarımı sayfa sayfa ilerler; ayrı ve daha geniş sınır
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
    const wait = (opts.route === 'jira-issues' ? jiraPageLimiter : limiter).hit(who.subject);
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
