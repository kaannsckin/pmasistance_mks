import { JiraSyncSettings, Task, TaskStatus } from '../../types';
import { JiraIssueRecord, JiraSyncPage, JiraSyncSource, JiraUpdateChanges } from '../integrations';
import { mapJiraPriority } from './jiraFields';
import { JiraImportOptions, mergeJiraIssues } from './jiraImport';

/**
 * Jira canlı eşitleme (saf mantık): hangi kayıtların çekileceği, sonucun
 * görevlere birleştirilmesi, otomatik eşitleme zamanı ve uygulama ↔ Jira farkı.
 *
 * Kapsam bilerek dardır: her eşitlemede yalnız (1) uygulamada Jira anahtarı
 * olan AÇIK kayıtların güncel hâli ve (2) istenirse seçili kaynaktaki (proje /
 * etiket / kayıtlı filtre) açık kayıtlar çekilir. Tüm Jira taranmaz.
 */

export const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{1,19}-\d{1,9}$/;
export const AUTO_SYNC_OPTIONS = [0, 5, 15, 30, 60] as const;
/** Kaynaktan en çok bu kadar sayfa (×100 kayıt) alınır */
export const SOURCE_MAX_PAGES = 10;
const KEYS_CHUNK = 50;

const keyOf = (s: string | undefined) => (s || '').trim().toUpperCase();

export const sourceOf = (s: JiraSyncSettings | undefined): JiraSyncSource | null => {
    if (!s) return null;
    const src: JiraSyncSource = {
        ...(s.projectKey?.trim() ? { projectKey: s.projectKey.trim().toUpperCase() } : {}),
        ...(s.labels?.length ? { labels: s.labels } : {}),
        ...(s.filterId?.trim() ? { filterId: s.filterId.trim() } : {}),
    };
    return Object.keys(src).length ? src : null;
};

/** "a, b c" → ["a", "b", "c"] (Jira etiketinde boşluk olmaz) */
export const parseLabels = (raw: string): string[] => [...new Set(raw.split(/[\s,;]+/).map(l => l.trim()).filter(Boolean))].slice(0, 10);

/** Uygulamada Jira anahtarı olan açık kayıtların anahtarları */
export const linkedOpenKeys = (tasks: Task[]): string[] =>
    [...new Set(tasks.filter(t => t.status !== TaskStatus.Done && ISSUE_KEY_RE.test(keyOf(t.jiraId))).map(t => keyOf(t.jiraId)))];

export const sourceLabel = (s: JiraSyncSettings | undefined): string => {
    const parts = [
        s?.projectKey ? `proje ${s.projectKey.toUpperCase()}` : '',
        s?.labels?.length ? `etiket ${s.labels.join(', ')}` : '',
        s?.filterId ? `filtre ${s.filterName || `#${s.filterId}`}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
};

export interface JiraSyncFetch {
    issues: JiraIssueRecord[];
    /** Uygulamada bağlı olup Jira'da bulunamayan anahtarlar */
    missing: string[];
    /** Kaynak sayfa sınırına takıldı mı */
    truncated: boolean;
    /** Kaynaktan gelen açık kayıt sayısı (keşif kapalıysa 0) */
    fromSource: number;
}

type FetchPage = (o: { keys: string[] } | { source: JiraSyncSource; cursor?: string | null }) => Promise<JiraSyncPage>;

/** Eşitleme verisini toplar: önce kaynak (keşif açıksa), sonra kaynakta dönmeyen bağlı açık kayıtlar anahtarla */
export const collectJiraSync = async (tasks: Task[], settings: JiraSyncSettings | undefined, fetchPage: FetchPage, onProgress?: (done: number) => void): Promise<JiraSyncFetch> => {
    const issues: JiraIssueRecord[] = [];
    const missing: string[] = [];
    let truncated = false;
    const source = settings?.discover ? sourceOf(settings) : null;
    if (source) {
        let cursor: string | null = null;
        for (let page = 0; ; page++) {
            if (page >= SOURCE_MAX_PAGES) { truncated = true; break; }
            const r = await fetchPage({ source, cursor });
            issues.push(...r.issues);
            onProgress?.(issues.length);
            if (!r.next) break;
            cursor = r.next;
        }
    }
    const fromSource = issues.length;
    const got = new Set(issues.map(i => keyOf(i.key)));
    const rest = linkedOpenKeys(tasks).filter(k => !got.has(k));
    for (let i = 0; i < rest.length; i += KEYS_CHUNK) {
        const r = await fetchPage({ keys: rest.slice(i, i + KEYS_CHUNK) });
        issues.push(...r.issues);
        missing.push(...r.missing);
        onProgress?.(issues.length);
    }
    return { issues, missing, truncated, fromSource };
};

export interface JiraSyncApply {
    tasks: Task[];
    added: number;
    updated: number;
    unchanged: number;
    /** Bu eşitlemede Jira'da kapandığı görülen kayıtlar */
    closed: number;
}

/** Çekilen kayıtları görevlere uygular; `addNew` kapalıyken yalnız var olan (bağlı) kayıtlar güncellenir */
export const applyJiraSync = (tasks: Task[], issues: JiraIssueRecord[], opts: JiraImportOptions, addNew: boolean, takenIds: Iterable<string> = []): JiraSyncApply => {
    const known = new Set(tasks.map(t => keyOf(t.jiraId)).filter(Boolean));
    const r = mergeJiraIssues(tasks, addNew ? issues : issues.filter(i => known.has(keyOf(i.key))), opts, takenIds);
    const before = new Map(tasks.map(t => [t.id, t.status]));
    const closed = r.tasks.filter(t => t.status === TaskStatus.Done && before.has(t.id) && before.get(t.id) !== TaskStatus.Done).length;
    return { ...r, closed };
};

export const syncSummary = (r: Pick<JiraSyncApply, 'added' | 'updated' | 'unchanged' | 'closed'>, f: Pick<JiraSyncFetch, 'missing' | 'truncated'>): string => {
    const parts = [
        r.updated ? `${r.updated} kayıt güncellendi` : '',
        r.closed ? `${r.closed} kayıt Jira'da kapanmış` : '',
        r.added ? `${r.added} yeni kayıt eklendi` : '',
        !r.updated && !r.added ? `değişiklik yok (${r.unchanged} kayıt güncel)` : '',
        f.missing.length ? `Jira'da bulunamayan: ${f.missing.slice(0, 5).join(', ')}${f.missing.length > 5 ? '…' : ''}` : '',
        f.truncated ? `kaynak ${SOURCE_MAX_PAGES * 100} kayıtla sınırlandı (kaynağı daraltın)` : '',
    ].filter(Boolean);
    return parts.join(' · ');
};

// ---------------------------------------------------------------- otomatik eşitleme durumu (cihazda)

export interface JiraSyncState {
    at: string; // ISO
    ok: boolean;
    text: string;
}
const stateKey = (projectId: string) => `planasistan.jiraSync.${projectId}`;

export const readSyncState = (projectId: string): JiraSyncState | null => {
    try {
        const v = JSON.parse(localStorage.getItem(stateKey(projectId)) || 'null') as JiraSyncState | null;
        return v && typeof v.at === 'string' ? v : null;
    } catch { return null; }
};
export const writeSyncState = (projectId: string, s: JiraSyncState): void => {
    try { localStorage.setItem(stateKey(projectId), JSON.stringify(s)); } catch { /* depolama dolu / kapalı */ }
    try { window.dispatchEvent(new CustomEvent('planasistan:jira-sync', { detail: projectId })); } catch { /* tarayıcı dışı */ }
};

/** Otomatik eşitleme zamanı geldi mi */
export const syncDue = (settings: JiraSyncSettings | undefined, lastAt: string | null | undefined, now: number): boolean => {
    const m = settings?.autoMinutes || 0;
    if (m <= 0) return false;
    const last = lastAt ? Date.parse(lastAt) : NaN;
    return !Number.isFinite(last) || now - last >= m * 60_000;
};

// ---------------------------------------------------------------- uygulama ↔ Jira farkı (Jira'ya yazma)

export type JiraDiffField = 'summary' | 'priority' | 'status' | 'dueDate';
export interface JiraDiffRow {
    field: JiraDiffField;
    label: string;
    local: string;
    remote: string;
}

const CATEGORY_OF: Record<TaskStatus, NonNullable<JiraIssueRecord['statusCategory']>> = {
    [TaskStatus.Backlog]: 'new',
    [TaskStatus.ToDo]: 'new',
    [TaskStatus.InProgress]: 'indeterminate',
    [TaskStatus.Done]: 'done',
};
const CATEGORY_LABEL = { new: 'Yapılacak', indeterminate: 'Sürüyor', done: 'Kapandı' } as const;
const PRIORITY_LABEL: Record<Task['priority'], string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };
const day = (v: string | null | undefined) => (v || '').slice(0, 10);

/** Uygulamadaki görev ile Jira'daki güncel kayıt arasındaki, Jira'ya yazılabilen farklar */
export const jiraDiff = (task: Task, issue: JiraIssueRecord): JiraDiffRow[] => {
    const rows: JiraDiffRow[] = [];
    if (task.name.trim() && task.name.trim() !== issue.summary.trim()) rows.push({ field: 'summary', label: 'Başlık', local: task.name.trim(), remote: issue.summary });
    if (task.priority !== mapJiraPriority(issue.priority)) rows.push({ field: 'priority', label: 'Öncelik', local: PRIORITY_LABEL[task.priority], remote: issue.priority || '—' });
    if (issue.statusCategory && CATEGORY_OF[task.status] !== issue.statusCategory) rows.push({ field: 'status', label: 'Durum', local: CATEGORY_LABEL[CATEGORY_OF[task.status]], remote: issue.status || CATEGORY_LABEL[issue.statusCategory] });
    if (day(task.dueDate) !== day(issue.due)) rows.push({ field: 'dueDate', label: 'Termin', local: day(task.dueDate) || '—', remote: day(issue.due) || '—' });
    return rows;
};

/** Seçilen farkları Jira güncelleme isteğine çevirir */
export const diffToChanges = (task: Task, fields: Iterable<JiraDiffField>): JiraUpdateChanges => {
    const c: JiraUpdateChanges = {};
    for (const f of fields) {
        if (f === 'summary') c.summary = task.name.trim();
        else if (f === 'priority') c.priority = task.priority;
        else if (f === 'status') c.status = CATEGORY_OF[task.status];
        else if (f === 'dueDate') c.dueDate = day(task.dueDate) || null;
    }
    return c;
};

/**
 * Jira'daki hâli göreve uygular. Olağan birleştirme uygulamadaki termini
 * korur; burada kullanıcı açıkça "Jira'daki hâli al" dediği için termin de
 * Jira'dan alınır.
 */
export const pullIssueIntoTasks = (tasks: Task[], issue: JiraIssueRecord, opts: JiraImportOptions): Task[] => {
    const k = keyOf(issue.key);
    return applyJiraSync(tasks, [issue], opts, false).tasks.map(t => {
        if (keyOf(t.jiraId) !== k) return t;
        const { dueDate: _drop, ...rest } = t;
        return issue.due ? { ...t, dueDate: issue.due } : rest;
    });
};

// ---------------------------------------------------------------- çalıştırma

/** Durum değişince (bu sekmede) yayınlanan olay; paneller son eşitlemeyi buradan yeniler */
export const JIRA_SYNC_EVENT = 'planasistan:jira-sync';

/** Bileşeni olmayan yeni kayıtların birimi: ekipte en sık geçen birim */
export const defaultUnitOf = (resources: { unit?: string }[]): string => {
    const n = new Map<string, number>();
    resources.forEach(r => { const u = (r.unit || '').trim(); if (u) n.set(u, (n.get(u) || 0) + 1); });
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Genel';
};

export interface JiraSyncRun {
    fetched: JiraSyncFetch;
    opts: JiraImportOptions;
    addNew: boolean;
    preview: JiraSyncApply;
    text: string;
}

/** Projeyi eşitler (yalnız okur ve önizler; görevlere yazmak çağıranın işidir) */
export const runProjectSync = async (
    project: { tasks: Task[]; resources: { unit?: string }[]; jiraSync?: JiraSyncSettings },
    fetchPage: FetchPage,
    onProgress?: (done: number) => void,
    now: Date = new Date(),
): Promise<JiraSyncRun> => {
    const fetched = await collectJiraSync(project.tasks, project.jiraSync, fetchPage, onProgress);
    const opts: JiraImportOptions = { importedAt: now.toISOString(), defaultUnit: defaultUnitOf(project.resources) };
    const addNew = !!project.jiraSync?.discover;
    const preview = applyJiraSync(project.tasks, fetched.issues, opts, addNew);
    return { fetched, opts, addNew, preview, text: syncSummary(preview, fetched) };
};

/** Bu projede eşitlenecek bir şey var mı (bağlı açık kayıt ya da keşif kaynağı) */
export const hasSyncWork = (project: { tasks: Task[]; jiraSync?: JiraSyncSettings }): boolean =>
    linkedOpenKeys(project.tasks).length > 0 || (!!project.jiraSync?.discover && !!sourceOf(project.jiraSync));
