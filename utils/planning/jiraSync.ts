import { JiraSyncSettings, Task, TaskStatus } from '../../types';
import { JiraIssueRecord, JiraSyncPage, JiraSyncSource, JiraUpdateChanges } from '../integrations';
import { mapJiraPriority } from './jiraFields';
import { JiraImportOptions, mergeJiraIssues } from './jiraImport';
import { applyFieldPolicy, hasFieldPolicy, JiraPush, planPushes, pushesAny, withBase } from './jiraFieldSync';
import { DayRange, inRange } from '../calendarRange';
import { secondsToHours } from '../timeTracking';

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

/**
 * Eşitlemede anahtarla okunacak kayıtlar: açık bağlı kayıtlar; uygulamadan
 * Jira'ya yazan bir alan seçiliyse uygulamada kapatılanlar da (kapanış Jira'ya
 * taşınsın diye) — yani tüm bağlı kayıtlar.
 */
export const linkedSyncKeys = (tasks: Task[], settings?: JiraSyncSettings): string[] =>
    pushesAny(settings)
        ? [...new Set(tasks.filter(t => ISSUE_KEY_RE.test(keyOf(t.jiraId))).map(t => keyOf(t.jiraId)))]
        : linkedOpenKeys(tasks);

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

type FetchPage = (o: { keys: string[] } | { source: JiraSyncSource; cursor?: string | null; openOnly?: boolean }) => Promise<JiraSyncPage>;

/** Eşitleme verisini toplar: önce kaynak (keşif açıksa), sonra kaynakta dönmeyen bağlı açık kayıtlar anahtarla */
export const collectJiraSync = async (tasks: Task[], settings: JiraSyncSettings | undefined, fetchPage: FetchPage, onProgress?: (done: number) => void, period?: DayRange): Promise<JiraSyncFetch> => {
    const issues: JiraIssueRecord[] = [];
    const missing: string[] = [];
    let truncated = false;
    const source = period || settings?.discover ? sourceOf(settings) : null;
    if (period && !source) throw new Error('Aralık eşitlemesi için Jira projesi, etiket veya filtre seçin.');
    if (source) {
        let cursor: string | null = null;
        for (let page = 0; ; page++) {
            if (page >= SOURCE_MAX_PAGES) { truncated = true; break; }
            const r = await fetchPage(period ? { source: { ...source, duePeriod: period }, openOnly: false, cursor } : { source, cursor });
            issues.push(...(period ? r.issues.filter(issue => !!issue.due && inRange(issue.due, period)) : r.issues));
            onProgress?.(issues.length);
            if (!r.next) break;
            cursor = r.next;
        }
    }
    const fromSource = issues.length;
    const got = new Set(issues.map(i => keyOf(i.key)));
    const rest = period ? [] : linkedSyncKeys(tasks, settings).filter(k => !got.has(k));
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
    /** Çift yönlü alanlarda iki tarafta da değişen (Jira esas alınan) alan sayısı */
    conflicts?: number;
    /** Çakışma görülen kayıtlar (anahtar: alanlar) */
    conflictKeys?: string[];
}

/**
 * Çekilen kayıtları görevlere uygular; `addNew` kapalıyken yalnız var olan (bağlı) kayıtlar güncellenir.
 * `settings.fields` verilmişse yalnız Jira'dan alınacak alanlar değişir (bkz. jiraFieldSync).
 */
export const applyJiraSync = (tasks: Task[], issues: JiraIssueRecord[], opts: JiraImportOptions, addNew: boolean, takenIds: Iterable<string> = [], settings?: JiraSyncSettings): JiraSyncApply => {
    const known = new Set(tasks.map(t => keyOf(t.jiraId)).filter(Boolean));
    const used = addNew ? issues : issues.filter(i => known.has(keyOf(i.key)));
    const r = mergeJiraIssues(tasks, used, opts, takenIds);
    const beforeById = new Map(tasks.map(t => [t.id, t]));
    if (!hasFieldPolicy(settings)) {
        const closed = r.tasks.filter(t => t.status === TaskStatus.Done && beforeById.has(t.id) && beforeById.get(t.id)!.status !== TaskStatus.Done).length;
        return { ...r, closed };
    }
    const issueOf = new Map(used.map(i => [keyOf(i.key), i]));
    let updated = 0, unchanged = 0, closed = 0, conflicts = 0;
    const conflictKeys: string[] = [];
    const out = r.tasks.map(t => {
        const issue = issueOf.get(keyOf(t.jiraId));
        const before = beforeById.get(t.id);
        if (!issue) return t;
        if (!before) return withBase(t, issue, settings);
        const p = applyFieldPolicy(before, t, issue, settings);
        if (p.conflicts.length) { conflicts += p.conflicts.length; conflictKeys.push(`${issue.key}: ${p.conflicts.join(', ')}`); }
        if (JSON.stringify(p.task) === JSON.stringify(before)) { unchanged++; return before; }
        updated++;
        if (p.task.status === TaskStatus.Done && before.status !== TaskStatus.Done) closed++;
        return p.task;
    });
    return { tasks: out, added: r.added, updated, unchanged, closed, conflicts, conflictKeys };
};

export const syncSummary = (r: Pick<JiraSyncApply, 'added' | 'updated' | 'unchanged' | 'closed' | 'conflicts'>, f: Pick<JiraSyncFetch, 'missing' | 'truncated'>, extra: { pushed?: number; pushErrors?: number; people?: number } = {}): string => {
    const parts = [
        r.updated ? `${r.updated} kayıt güncellendi` : '',
        extra.pushed ? `${extra.pushed} kayıt Jira'ya yazıldı` : '',
        extra.pushErrors ? `${extra.pushErrors} kayıt Jira'ya yazılamadı` : '',
        r.conflicts ? `${r.conflicts} alanda çakışma (Jira esas alındı)` : '',
        extra.people ? `${extra.people} kişi ekibe eklendi` : '',
        r.closed ? `${r.closed} kayıt Jira'da kapanmış` : '',
        r.added ? `${r.added} yeni kayıt eklendi` : '',
        !r.updated && !r.added && !extra.pushed ? `değişiklik yok (${r.unchanged} kayıt güncel)` : '',
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

export type JiraDiffField = 'summary' | 'priority' | 'status' | 'dueDate' | 'remaining';
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
    const remaining = secondsToHours(issue.remainingEstimateSeconds);
    if (issue.remainingEstimateSeconds !== undefined && task.remainingEstimateHours !== remaining) {
        const format = (hours?: number) => hours === undefined ? '—' : `${hours.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} sa`;
        rows.push({ field: 'remaining', label: 'Kalan süre', local: format(task.remainingEstimateHours), remote: format(remaining) });
    }
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
        else if (f === 'remaining' && task.remainingEstimateHours !== undefined) c.remainingEstimateHours = task.remainingEstimateHours;
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
    /** Uygulamadan Jira'ya yazılacak alanlar (yazma çağıranın işidir) */
    pushes: JiraPush[];
    text: string;
}

/** Projeyi eşitler (yalnız okur ve önizler; görevlere yazmak çağıranın işidir) */
export const runProjectSync = async (
    project: { tasks: Task[]; resources: { unit?: string }[]; jiraSync?: JiraSyncSettings },
    fetchPage: FetchPage,
    onProgress?: (done: number) => void,
    now: Date = new Date(),
    period?: DayRange,
): Promise<JiraSyncRun> => {
    const fetched = await collectJiraSync(project.tasks, project.jiraSync, fetchPage, onProgress, period);
    const opts: JiraImportOptions = { importedAt: now.toISOString(), defaultUnit: defaultUnitOf(project.resources) };
    const addNew = !!project.jiraSync?.discover;
    const preview = applyJiraSync(project.tasks, fetched.issues, opts, addNew, [], project.jiraSync);
    const pushes = planPushes(project.tasks, fetched.issues, project.jiraSync);
    return { fetched, opts, addNew, preview, pushes, text: syncSummary(preview, fetched) };
};

export interface JiraPushOutcome {
    done: { taskId: string; key: string; applied: string[]; issue?: JiraIssueRecord }[];
    errors: { key: string; message: string }[];
}

/** Jira'ya yazar (sırayla; bir kayıttaki hata diğerlerini durdurmaz) */
export const executePushes = async (
    pushes: JiraPush[],
    update: (key: string, changes: JiraPush['changes']) => Promise<{ applied: string[]; errors: { field: string; message: string }[]; issue?: JiraIssueRecord }>,
    onProgress?: (done: number) => void,
): Promise<JiraPushOutcome> => {
    const out: JiraPushOutcome = { done: [], errors: [] };
    for (let i = 0; i < pushes.length; i++) {
        const p = pushes[i];
        try {
            const r = await update(p.key, p.changes);
            if (r.applied.length) out.done.push({ taskId: p.taskId, key: p.key, applied: r.applied, issue: r.issue });
            r.errors.forEach(e => out.errors.push({ key: p.key, message: `${e.field}: ${e.message}` }));
        } catch (e) {
            if ((e as Error)?.name === 'AbortError') throw e;
            out.errors.push({ key: p.key, message: e instanceof Error ? e.message : String(e) });
        }
        onProgress?.(i + 1);
    }
    return out;
};

/** Jira'ya yazma sonrası dönen güncel kayıtlar, eşitlemede okunanların yerine geçer */
export const withPushedIssues = (issues: JiraIssueRecord[], outcome: JiraPushOutcome | undefined): JiraIssueRecord[] => {
    if (!outcome?.done.length) return issues;
    const fresh = new Map(outcome.done.filter(d => d.issue).map(d => [keyOf(d.key), d.issue!]));
    return issues.map(i => fresh.get(keyOf(i.key)) || i);
};

export interface JiraFullSync extends JiraSyncRun {
    /** Uygulanacak kayıtlar (Jira'ya yazılanların güncel hâli dahil) */
    issues: JiraIssueRecord[];
    pushed?: JiraPushOutcome;
    /** Görevlere / ekibe uygulanacak bir şey var mı */
    shouldApply: boolean;
}

/**
 * Tam eşitleme: Jira'dan okur, uygulamadan Jira'ya yazılacak alanları yazar
 * (`update` verilmişse — sunucuda JIRA_ALLOW_UPDATE açık olmalı), uygulanacak
 * kayıtları döner. Görevlere yazmak çağıranın işidir.
 */
export const runFullSync = async (
    project: { tasks: Task[]; resources: { unit?: string }[]; jiraSync?: JiraSyncSettings },
    fetchPage: FetchPage,
    update: Parameters<typeof executePushes>[1] | null,
    onProgress?: (done: number) => void,
    period?: DayRange,
): Promise<JiraFullSync> => {
    const r = await runProjectSync(project, fetchPage, onProgress, new Date(), period);
    const pushed = r.pushes.length && update ? await executePushes(r.pushes, update) : undefined;
    const issues = withPushedIssues(r.fetched.issues, pushed);
    const waiting = r.pushes.length && !update ? `${r.pushes.length} kayıt Jira'ya yazılmayı bekliyor (sunucuda JIRA_ALLOW_UPDATE kapalı)` : '';
    const errors = pushed?.errors.length ? `hata: ${pushed.errors.slice(0, 3).map(e => `${e.key} ${e.message}`).join('; ')}` : '';
    const text = [syncSummary(r.preview, r.fetched, { pushed: pushed?.done.length, pushErrors: pushed?.errors.length }), waiting, errors].filter(Boolean).join(' · ');
    const shouldApply = !!(r.preview.added || r.preview.updated || pushed?.done.length || project.jiraSync?.autoPeople);
    return { ...r, issues, pushed, shouldApply, text };
};

/** Bu projede eşitlenecek bir şey var mı (bağlı açık kayıt ya da keşif kaynağı) */
export const hasSyncWork = (project: { tasks: Task[]; jiraSync?: JiraSyncSettings }): boolean =>
    linkedSyncKeys(project.tasks, project.jiraSync).length > 0 || (!!project.jiraSync?.discover && !!sourceOf(project.jiraSync));
