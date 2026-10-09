import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { JiraIssueRecord } from '../../utils/integrations.js';

/**
 * Pilot Jira'sı: gerçek Jira REST API v2'nin uygulamanın kullandığı alt kümesi
 * (Server/DC biçimi). Veri 1. rutinin ürettiği dışa aktarımlardır
 * (pilot-data/jira/<ANAHTAR>.json — `GET /rest/api/2/search?expand=changelog`
 * yanıtıyla aynı biçim). Uygulamanın Jira istemcisi (server/integrations)
 * değiştirilmeden buna bağlanır: MCP'de `fetch` yerine verilir, tarayıcıdaki
 * uygulama için `pilot jira-sunucu` ile HTTP olarak açılır.
 *
 * Desteklenen uçlar: status, field, priority, myself, project/{key},
 * search (ve Cloud biçimi search/jql), issue/{key}, issue/{key}/worklog.
 * Yazma (kayıt açma) desteklenmez: pilot Jira'sı salt-okunurdur.
 */

export const JIRA_STATUSES = [
    { id: '1', name: 'Yapılacak', statusCategory: { id: 2, key: 'new', name: 'To Do' } },
    { id: '3', name: 'Devam Ediyor', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
    { id: '4', name: 'Yeniden Açıldı', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
    { id: '10001', name: 'İncelemede', statusCategory: { id: 4, key: 'indeterminate', name: 'In Progress' } },
    { id: '6', name: 'Tamamlandı', statusCategory: { id: 3, key: 'done', name: 'Done' } },
];
export const STORY_POINTS_FIELD = 'customfield_10002';
const FIELDS = [
    { id: 'summary', name: 'Summary' }, { id: 'description', name: 'Description' }, { id: 'duedate', name: 'Due Date' },
    { id: STORY_POINTS_FIELD, name: 'Story Points', custom: true },
];
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'].map((name, i) => ({ id: String(i + 1), name }));
const ISSUE_TYPES = ['Hata', 'Hikaye', 'İyileştirme', 'Görev'].map((name, i) => ({ id: String(10000 + i), name, subtask: false }));
const WORKLOG_PAGE = 20; // gerçek Jira'da aramadaki worklog alanı 20 kayıtla kısaltılır

export interface RawWorklog { id: string; author: { displayName: string; name: string }; started: string; timeSpentSeconds: number; comment?: string }
export interface RawIssue {
    id: string;
    key: string;
    fields: Record<string, unknown> & { worklog?: { startAt: number; maxResults: number; total: number; worklogs: RawWorklog[] } };
    changelog?: { startAt: number; maxResults: number; total: number; histories: { id: string; created: string; author?: { displayName: string }; items: { field: string; fieldtype: string; from: string | null; fromString: string; to: string | null; toString: string }[] }[] };
}
export interface SearchResponse { expand?: string; startAt: number; maxResults: number; total: number; issues: RawIssue[] }

const statusId = (name: string) => JIRA_STATUSES.find(s => s.name === name)?.id || null;
const loginOf = (name: string) => name.toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/\s+/g, '.');

/** UTC ISO → Jira zaman biçimi (İstanbul, "2026-06-02T14:03:00.000+0300") */
export const jiraTime = (iso: string): string => {
    const d = new Date(new Date(iso).getTime() + 3 * 3_600_000);
    return `${d.toISOString().slice(0, 23)}+0300`;
};

/** Simülasyonun kaydı (normalize edilmiş biçim) → Jira REST v2 ham kaydı */
export const toRawIssue = (
    rec: JiraIssueRecord,
    o: { id: number; project: { key: string; name: string }; worklogs: { day: string; hours: number; author: string }[] },
): RawIssue => {
    const worklogs: RawWorklog[] = o.worklogs.map((w, i) => ({
        id: `${o.id}${String(i + 1).padStart(3, '0')}`,
        author: { displayName: w.author, name: loginOf(w.author) },
        started: `${w.day}T09:00:00.000+0300`,
        timeSpentSeconds: Math.round(w.hours * 3600),
    }));
    const histories = rec.transitions.map((t, i) => ({
        id: `${o.id}${String(i + 1).padStart(2, '0')}`,
        created: jiraTime(t.at),
        author: { displayName: rec.assignee },
        items: [{ field: 'status', fieldtype: 'jira', from: statusId(t.from), fromString: t.from, to: statusId(t.to), toString: t.to }],
    }));
    const status = JIRA_STATUSES.find(s => s.name === rec.status) || JIRA_STATUSES[0];
    return {
        id: String(o.id),
        key: rec.key,
        fields: {
            summary: rec.summary,
            description: rec.description,
            issuetype: { name: rec.issueType },
            status: { id: status.id, name: status.name, statusCategory: status.statusCategory },
            priority: { name: rec.priority },
            created: rec.created ? jiraTime(rec.created) : null,
            resolutiondate: rec.resolved ? jiraTime(rec.resolved) : null,
            duedate: rec.due || null,
            components: rec.components.map(name => ({ name })),
            labels: rec.labels,
            fixVersions: rec.fixVersions.map(name => ({ name })),
            timeoriginalestimate: rec.originalEstimateSeconds,
            timespent: rec.timeSpentSeconds,
            assignee: rec.assignee ? { displayName: rec.assignee, name: loginOf(rec.assignee) } : null,
            issuelinks: rec.blockedBy.map(key => ({ type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key } })),
            [STORY_POINTS_FIELD]: rec.storyPoints,
            project: o.project,
            worklog: { startAt: 0, maxResults: WORKLOG_PAGE, total: worklogs.length, worklogs },
        },
        changelog: { startAt: 0, maxResults: histories.length, total: histories.length, histories },
    };
};

/** Bir projenin dışa aktarımı: arama yanıtıyla aynı biçim (tüm alanlar, changelog ve tüm worklog'lar) */
export const searchExport = (issues: RawIssue[]): SearchResponse => ({ expand: 'changelog', startAt: 0, maxResults: issues.length, total: issues.length, issues });

// ---------------------------------------------------------------------------
// JQL — uygulamanın ürettiği sorgular (buildIssueJql, buildWorklogJql)
// ---------------------------------------------------------------------------

interface Query { project: string; doneOnly?: boolean; openOrResolvedSince?: string; resolvedSince?: string; worklogFrom?: string; worklogTo?: string }

export const parseJql = (jql: string): Query | null => {
    let rest = ` ${jql} `;
    const take = (re: RegExp): RegExpMatchArray | null => {
        const m = rest.match(re);
        if (m) rest = rest.replace(m[0], ' ');
        return m;
    };
    const project = take(/\bproject\s*=\s*"?([A-Za-z][A-Za-z0-9_]*)"?/i);
    if (!project) return null;
    const q: Query = { project: project[1].toUpperCase() };
    const or = take(/\(\s*statusCategory\s*!=\s*Done\s+OR\s+resolved\s*>=\s*"(\d{4}-\d{2}-\d{2})"\s*\)/i);
    if (or) q.openOrResolvedSince = or[1];
    if (take(/\bstatusCategory\s*=\s*Done\b/i)) q.doneOnly = true;
    const res = take(/\bresolved\s*>=\s*"(\d{4}-\d{2}-\d{2})"/i);
    if (res) q.resolvedSince = res[1];
    const wf = take(/\bworklogDate\s*>=\s*"(\d{4}-\d{2}-\d{2})"/i);
    if (wf) q.worklogFrom = wf[1];
    const wt = take(/\bworklogDate\s*<=\s*"(\d{4}-\d{2}-\d{2})"/i);
    if (wt) q.worklogTo = wt[1];
    take(/\bORDER\s+BY\s+key(\s+(ASC|DESC))?/i);
    // Kalan yalnız bağlaçlar olmalı; tanımadığımız bir koşul varsa sessizce yok sayma
    return rest.replace(/\bAND\b/gi, ' ').trim() === '' ? q : null;
};

const dayOfJira = (v: unknown): string | null => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

const matches = (issue: RawIssue, q: Query): boolean => {
    if (!issue.key.toUpperCase().startsWith(`${q.project}-`)) return false;
    const done = (issue.fields.status as { statusCategory?: { key?: string } })?.statusCategory?.key === 'done';
    const resolved = dayOfJira(issue.fields.resolutiondate);
    if (q.doneOnly && !done) return false;
    if (q.resolvedSince && (!resolved || resolved < q.resolvedSince)) return false;
    if (q.openOrResolvedSince && done && (!resolved || resolved < q.openOrResolvedSince)) return false;
    if (q.worklogFrom || q.worklogTo) {
        const logs = issue.fields.worklog?.worklogs || [];
        if (!logs.some(w => (!q.worklogFrom || w.started.slice(0, 10) >= q.worklogFrom) && (!q.worklogTo || w.started.slice(0, 10) <= q.worklogTo))) return false;
    }
    return true;
};

const keyNo = (key: string) => Number(key.split('-').pop()) || 0;

/** Aramada istenen alanlar; worklog 20 kayıtla kısaltılır (gerçek Jira gibi) */
const project = (issue: RawIssue, fields: string[] | null, expandChangelog: boolean): RawIssue => {
    const all = !fields || fields.includes('*all');
    const out: RawIssue['fields'] = {};
    Object.entries(issue.fields).forEach(([k, v]) => { if (all || fields!.includes(k)) out[k] = v; });
    if (out.worklog) {
        const w = issue.fields.worklog!;
        out.worklog = { startAt: 0, maxResults: WORKLOG_PAGE, total: w.total, worklogs: w.worklogs.slice(0, WORKLOG_PAGE) };
    }
    return { id: issue.id, key: issue.key, fields: out, ...(expandChangelog && issue.changelog ? { changelog: issue.changelog } : {}) };
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json;charset=UTF-8' } });
const jiraError = (status: number, message: string) => json(status, { errorMessages: [message], errors: {} });

/** fetch ile aynı imzalı sahte Jira (uygulamanın Jira istemcisine fetchImpl olarak verilir) */
export const createMockJira = (load: () => Promise<RawIssue[]>): typeof fetch => (async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    if (!req.headers.get('authorization')) return jiraError(401, 'Kimlik doğrulama gerekli.');
    if (req.method !== 'GET') return jiraError(403, 'Pilot Jira\'sı salt-okunurdur; kayıt açılamaz.');
    if (path === '/rest/api/2/status') return json(200, JIRA_STATUSES);
    if (path === '/rest/api/2/field') return json(200, FIELDS);
    if (path === '/rest/api/2/priority') return json(200, PRIORITIES);
    if (path === '/rest/api/2/myself') return json(200, { name: 'pilot', displayName: 'Pilot Kullanıcısı' });
    if (path === '/rest/api/2/serverInfo') return json(200, { version: '9.12.0', deploymentType: 'Server', serverTitle: 'PlanAsistan Pilot Jira' });

    const issues = await load();
    const projectMatch = path.match(/^\/rest\/api\/2\/project\/([^/]+)$/);
    if (projectMatch) {
        const key = decodeURIComponent(projectMatch[1]).toUpperCase();
        const mine = issues.filter(i => i.key.startsWith(`${key}-`));
        if (!mine.length) return jiraError(404, `Proje bulunamadı: ${key}`);
        const components = [...new Set(mine.flatMap(i => ((i.fields.components || []) as { name: string }[]).map(c => c.name)))];
        return json(200, { key, name: (mine[0].fields.project as { name?: string })?.name || key, issueTypes: ISSUE_TYPES, components: components.map((name, i) => ({ id: String(i + 1), name })) });
    }
    const issueMatch = path.match(/^\/rest\/api\/2\/issue\/([^/]+)(\/worklog)?$/);
    if (issueMatch) {
        const key = decodeURIComponent(issueMatch[1]).toUpperCase();
        const issue = issues.find(i => i.key === key);
        if (!issue) return jiraError(404, 'Kayıt bulunamadı ya da görme izniniz yok.');
        if (issueMatch[2]) {
            const w = issue.fields.worklog?.worklogs || [];
            return json(200, { startAt: 0, maxResults: w.length, total: w.length, worklogs: w });
        }
        const fields = url.searchParams.get('fields');
        return json(200, project(issue, fields ? fields.split(',') : null, (url.searchParams.get('expand') || '').includes('changelog')));
    }
    if (path === '/rest/api/2/search' || path === '/rest/api/2/search/jql') {
        const jql = url.searchParams.get('jql') || '';
        const q = parseJql(jql);
        if (!q) return jiraError(400, `Pilot Jira'sı bu JQL'i desteklemiyor: ${jql}`);
        const found = issues.filter(i => matches(i, q)).sort((a, b) => keyNo(a.key) - keyNo(b.key));
        const max = Math.max(1, Math.min(100, Number(url.searchParams.get('maxResults')) || 50));
        const cloud = path.endsWith('/jql');
        const startAt = cloud ? Number(url.searchParams.get('nextPageToken')) || 0 : Math.max(0, Number(url.searchParams.get('startAt')) || 0);
        const fields = url.searchParams.get('fields');
        const page = found.slice(startAt, startAt + max).map(i => project(i, fields ? fields.split(',') : null, (url.searchParams.get('expand') || '').includes('changelog')));
        if (cloud) {
            const more = startAt + page.length < found.length;
            return json(200, { issues: page, isLast: !more, ...(more ? { nextPageToken: String(startAt + page.length) } : {}) });
        }
        return json(200, { expand: 'schema,names', startAt, maxResults: max, total: found.length, issues: page });
    }
    return jiraError(404, `Pilot Jira'sında olmayan uç: ${path}`);
}) as typeof fetch;

/** pilot-data/jira/*.json dışa aktarımlarından okuyan sahte Jira (dosyalar değişince yeniden okur) */
export const mockJiraFromDir = (dir: string): typeof fetch => {
    let cache: { sig: string; issues: RawIssue[] } | null = null;
    return createMockJira(async () => {
        let files: string[] = [];
        try { files = (await readdir(dir)).filter(f => f.endsWith('.json') && !f.startsWith('_')).sort(); } catch { return []; }
        const sig = (await Promise.all(files.map(async f => `${f}:${(await stat(join(dir, f))).mtimeMs}`))).join('|');
        if (cache?.sig === sig) return cache.issues;
        const issues = (await Promise.all(files.map(async f => (JSON.parse(await readFile(join(dir, f), 'utf8')) as SearchResponse).issues || []))).flat();
        cache = { sig, issues };
        return issues;
    });
};

/** Uygulamanın Jira istemcisinin pilot için ortamı (adres sahte; jeton yalnız başlık için) */
export const PILOT_JIRA_ENV = { JIRA_BASE_URL: 'http://pilot-jira.local', JIRA_TOKEN: 'pilot' };
