import type { Env } from '../ai/config.js';
import { supabaseBackend, type StoredAiSettings } from '../ai/settingsStore.js';
import { upstreamFetch } from '../ai/tls.js';
import { buildReport, isReportDue, previousSnapshot, progressSnapshot, reportText, trClock, withSnapshot, type ReportSection } from '../../utils/reportAutomation.js';
import type { Person, ProgressSnapshot, Project, ProjectRoleDef, ReportSchedule } from '../../types.js';

/**
 * Rapor otomasyonu (sunucu): Slack ve Notion gönderimi ve zamanlanmış rapor
 * çalıştırıcısı (Vercel cron). Çalıştırıcı bulut verisini (Supabase, servis
 * anahtarıyla) okur, zamanı gelen raporları hesaplar ve gönderir; ne zaman
 * gönderildiğini ve günlük ilerleme ölçümlerini app_settings'teki
 * "report-runs" satırında tutar (proje verisine yazmaz).
 *
 *   SLACK_WEBHOOK_URL                        (Slack gelen webhook)
 *   NOTION_TOKEN + NOTION_PARENT_PAGE_ID     (Notion iç entegrasyon jetonu ve raporların ekleneceği sayfa)
 *   CRON_SECRET + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (zamanlanmış rapor)
 *   REPORT_CRON_HOURLY=1                     (cron saatlikse raporun saatine uyulur; yoksa günde bir kez hepsi)
 */

const clean = (v: string | undefined) => v?.trim() || undefined;
const MAX_TEXT = 1900; // Notion zengin metin sınırı 2000

export interface ReportChannels { teams?: boolean; slack?: boolean; notion?: boolean; email?: string[] }

/** Gelen bölüm listesini doğrular (istemciden) */
export const parseSections = (v: unknown): ReportSection[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    return v.slice(0, 20).filter((s): s is Record<string, unknown> => !!s && typeof s === 'object').map(s => ({
        title: String(s.title || '').slice(0, 200),
        summary: typeof s.summary === 'string' ? s.summary.slice(0, 500) : undefined,
        lines: Array.isArray(s.lines) ? s.lines.slice(0, 30).map(l => String(l).slice(0, 500)) : [],
    })).filter(s => s.title);
};

export const sendSlack = async (env: Env, subject: string, sections: ReportSection[] | undefined, text: string, fetchImpl?: typeof fetch): Promise<void> => {
    const url = clean(env.SLACK_WEBHOOK_URL)!;
    const f = fetchImpl || upstreamFetch(url, env);
    const body = sections?.length ? reportText(sections, 'slack', clean(env.APP_URL)) : text.replace(/\*\*(.+?)\*\*/g, '*$1*');
    const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `*${subject}*\n\n${body}`.slice(0, 39000) }) });
    if (!res.ok) throw new Error(`Slack iletisi gönderilemedi (HTTP ${res.status}).`);
};

const rich = (content: string) => [{ type: 'text', text: { content: content.slice(0, MAX_TEXT) } }];

/** Bölümler → Notion blokları (başlık, özet paragrafı, madde listesi) */
export const notionBlocks = (sections: ReportSection[], appUrl?: string): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = [];
    for (const s of sections) {
        out.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: rich(s.title) } });
        if (s.summary) out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: rich(s.summary) } });
        for (const l of s.lines) out.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rich(l.replace(/^[•!✓+]\s*/, '')) } });
    }
    if (appUrl) out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: "PlanAsistan'da aç", link: { url: appUrl } } }] } });
    return out.slice(0, 100); // Notion: istek başına en çok 100 blok
};

export const sendNotion = async (env: Env, subject: string, sections: ReportSection[] | undefined, text: string, fetchImpl?: typeof fetch): Promise<string | undefined> => {
    const token = clean(env.NOTION_TOKEN)!, parent = clean(env.NOTION_PARENT_PAGE_ID)!.replace(/-/g, '');
    const url = 'https://api.notion.com/v1/pages';
    const f = fetchImpl || upstreamFetch(url, env);
    const secs = sections?.length ? sections : [{ title: subject, lines: text.split('\n').filter(Boolean) }];
    const res = await f(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'notion-version': '2022-06-28', 'content-type': 'application/json' },
        body: JSON.stringify({ parent: { page_id: parent }, properties: { title: { title: rich(subject) } }, children: notionBlocks(secs, clean(env.APP_URL)) }),
    });
    if (!res.ok) {
        const t = await res.text().catch(() => '');
        const msg = /object_not_found|Could not find/.test(t) ? ': sayfa bulunamadı ya da entegrasyonla paylaşılmadı' : res.status === 401 ? ': jeton geçersiz' : '';
        throw new Error(`Notion sayfası oluşturulamadı (HTTP ${res.status})${msg}.`);
    }
    const page = await res.json().catch(() => ({})) as { url?: string };
    return page.url;
};

// ---------------------------------------------------------------- zamanlanmış çalıştırıcı

export type Deliver = (channels: ReportChannels, subject: string, text: string, sections: ReportSection[]) => Promise<Record<string, string>>;

interface RunState {
    sent: Record<string, string>;
    sentAt: Record<string, string>;
    snapshots: Record<string, ProgressSnapshot[]>;
}

interface WorkspaceRow { id: string; core?: { people?: Person[]; projectRoles?: ProjectRoleDef[] } }
interface ProjectRow { workspace_id: string; project_id: string; data: Project }

export const reportCronConfigured = (env: Env): boolean => !!clean(env.CRON_SECRET) && !!clean(env.SUPABASE_URL) && !!clean(env.SUPABASE_SERVICE_ROLE_KEY);

export const runReportCron = async (env: Env, opts: { now: Date; deliver: Deliver; fetchImpl?: typeof fetch }): Promise<{ status: number; body: Record<string, unknown> }> => {
    const supa = clean(env.SUPABASE_URL)?.replace(/\/+$/, ''), key = clean(env.SUPABASE_SERVICE_ROLE_KEY);
    if (!supa || !key) return { status: 503, body: { error: 'Zamanlanmış rapor için SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekir (bulut verisi okunur).', code: 'config' } };
    const f = opts.fetchImpl || fetch;
    const headers = { apikey: key, authorization: `Bearer ${key}` };
    const get = async <T>(path: string): Promise<T> => {
        const res = await f(`${supa}/rest/v1/${path}`, { headers });
        if (!res.ok) throw new Error(`Bulut verisi okunamadı (HTTP ${res.status}).`);
        return res.json() as Promise<T>;
    };
    let rows: ProjectRow[], spaces: WorkspaceRow[];
    try {
        rows = await get<ProjectRow[]>('workspace_projects?select=workspace_id,project_id,data');
        spaces = await get<WorkspaceRow[]>('workspaces?select=id,core');
    } catch (e) {
        return { status: 502, body: { error: (e as Error).message, code: 'upstream' } };
    }
    const store = supabaseBackend(supa, key, f, 'report-runs');
    const loaded = (await store.load().catch(() => null)) as unknown as Partial<RunState> | null;
    const state: RunState = { sent: loaded?.sent || {}, sentAt: loaded?.sentAt || {}, snapshots: loaded?.snapshots || {} };
    const core = new Map(spaces.map(w => [w.id, w.core || {}]));
    const hourly = /^(1|true|evet|yes)$/i.test(clean(env.REPORT_CRON_HOURLY) || '');
    const now = opts.now;
    const sent: Record<string, unknown>[] = [];
    let dirty = false;
    for (const row of rows) {
        const project = row.data;
        const schedules: ReportSchedule[] = (project?.reportSchedules || []).filter(s => s.enabled);
        if (!schedules.length || !Array.isArray(project.tasks)) continue;
        const pk = `${row.workspace_id}:${row.project_id}`;
        const snaps = [...(project.progressSnapshots || []), ...(state.snapshots[pk] || [])];
        const ws = core.get(row.workspace_id) || {};
        for (const s of schedules) {
            const k = `${pk}:${s.id}`;
            const sentDay = [state.sent[k], s.lastSentDay].filter(Boolean).sort().pop();
            if (!isReportDue(s, now, { ignoreHour: !hourly, sentDay })) continue;
            const lastAt = [state.sentAt[k], s.lastSentAt].filter((x): x is string => !!x).sort().pop();
            const r = buildReport(project, s, { now, previous: previousSnapshot(snaps, now), since: lastAt ? new Date(lastAt) : undefined, people: ws.people, roleDefs: ws.projectRoles, appUrl: clean(env.APP_URL) });
            const result = await opts.deliver(s.channels, r.subject, r.text, r.sections);
            state.sent[k] = trClock(now).day;
            state.sentAt[k] = now.toISOString();
            sent.push({ proje: project.name, rapor: s.name, ...result });
            dirty = true;
        }
        // Günlük ölçüm: "önceki rapora göre" farkı için (rapor gönderilmese de)
        const today = progressSnapshot(project, now);
        if (!(state.snapshots[pk] || []).some(x => x.day === today.day)) { state.snapshots[pk] = withSnapshot(state.snapshots[pk], today); dirty = true; }
    }
    if (dirty) await store.save(state as unknown as StoredAiSettings).catch(e => console.error('[rapor] çalışma kaydı yazılamadı:', (e as Error).message));
    return { status: 200, body: { ok: true, sent } };
};
