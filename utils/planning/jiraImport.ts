import { IssueType, Project, Task, TaskStatus, TaskStatusChange } from '../../types';
import { JiraIssueRecord } from '../integrations';
import { foldTr } from '../rag/text';
import { mapJiraIssueType, mapJiraPriority, mapJiraStatus } from './jiraFields';
import { analyzeRecords } from './recordQuality';

/**
 * Jira API'den gelen kayıtları (alanlar + durum geçmişi) görev modeline
 * çevirir ve projedeki görevlerle Jira anahtarı üzerinden birleştirir.
 *
 * Jira'dan gelen alanlar güncellenir: başlık, açıklama, tür, önem, durum,
 * açılış / işe başlama / kapanış anları, durum geçişleri, tahmin ve harcanan
 * süre, story point, düzeltme sürümü; sorumlu ve birim (bileşen) Jira'da
 * doluysa. Uygulamadaki planlama alanları korunur: sürüm, öncül, iş paketi,
 * hedef bağlantısı, termin, alt görevler, yorumlar, açılıştaki tahmin ve
 * kendi tahmininiz (tahmin yoksa Jira'nınki yazılır).
 */

export interface JiraImportOptions {
    /** İçe aktarma anı (ISO) */
    importedAt: string;
    /** Bileşeni olmayan yeni kayıtların birimi */
    defaultUnit: string;
}

const MAX_LOG = 50;
const round1 = (v: number) => Math.round(v * 10) / 10;

const statusOf = (category: JiraIssueRecord['statusCategory'], name: string): TaskStatus => {
    if (category === 'done') return TaskStatus.Done;
    if (category === 'indeterminate') return TaskStatus.InProgress;
    if (category === 'new') return /backlog|bekleme/.test(foldTr(name)) ? TaskStatus.Backlog : TaskStatus.ToDo;
    return mapJiraStatus(name);
};

/** Durum geçmişi: kategoriler arası geçişler (aynı kategoride kalan adımlar, ör. İnceleme → Test, atlanır) */
export const jiraStatusLog = (issue: JiraIssueRecord): TaskStatusChange[] => {
    const log: TaskStatusChange[] = [];
    issue.transitions.forEach(t => {
        const from = statusOf(t.fromCategory, t.from);
        const to = statusOf(t.toCategory, t.to);
        if (from !== to) log.push({ at: t.at, from, to });
    });
    return log.slice(-MAX_LOG);
};

const keyOf = (s: string | undefined) => (s || '').trim().toUpperCase();

/** Jira kaydı → yeni görev (proje bağlamı olmadan) */
export const issueToTask = (issue: JiraIssueRecord, opts: JiraImportOptions, id = `jira-${issue.key.toLowerCase()}`): Task => {
    const status = statusOf(issue.statusCategory, issue.status);
    const statusLog = jiraStatusLog(issue);
    const startedAt = statusLog.find(c => c.to === TaskStatus.InProgress)?.at;
    const resolvedAt = status === TaskStatus.Done ? issue.resolved || [...statusLog].reverse().find(c => c.to === TaskStatus.Done)?.at : undefined;
    const estimateHours = issue.originalEstimateSeconds ? round1(issue.originalEstimateSeconds / 3600) : undefined;
    const estimateDays = estimateHours ? Math.max(1, Math.round(estimateHours / 8)) : 0;
    const actualHours = issue.timeSpentSeconds ? round1(issue.timeSpentSeconds / 3600) : undefined;
    const issueType = mapJiraIssueType(issue.issueType);
    return {
        id,
        name: issue.summary || issue.key,
        jiraId: issue.key,
        notes: issue.description,
        labels: issue.labels.length ? issue.labels : undefined,
        resourceName: issue.assignee,
        unit: issue.components[0] || opts.defaultUnit,
        availability: estimateDays > 0,
        priority: mapJiraPriority(issue.priority),
        version: 0,
        predecessor: null,
        // Jira tek tahmin verir: aralık uydurulmaz; belirsizlik geçmiş verilerden kalibre edilir
        time: { best: estimateDays, avg: estimateDays, worst: estimateDays },
        status,
        includeInSprints: status !== TaskStatus.Done, // kapanmış kayıtlar planlamaya girmez, geçmiş veri olarak kalır
        importedAt: opts.importedAt,
        ...(issue.created ? { createdAt: issue.created } : {}),
        ...(startedAt ? { startedAt } : {}),
        ...(resolvedAt ? { resolvedAt } : {}),
        ...(statusLog.length ? { statusLog } : {}),
        ...(issueType ? { issueType } : {}),
        ...(estimateHours ? { originalEstimateHours: estimateHours, estimateSource: 'jira' as const } : {}),
        ...(actualHours ? { actualHours } : {}),
        ...(issue.storyPoints ? { storyPoints: issue.storyPoints } : {}),
        ...(issue.fixVersions[0] ? { fixVersion: issue.fixVersions[0] } : {}),
    };
};

const noEstimate = (t: Task) => !(t.time?.best || t.time?.avg || t.time?.worst);

/** Var olan görevi Jira'daki hâliyle günceller; planlama alanları korunur */
const updateFrom = (e: Task, fresh: Task, issue: JiraIssueRecord): Task => ({
    ...e,
    name: fresh.name || e.name,
    notes: issue.description || e.notes,
    priority: issue.priority ? fresh.priority : e.priority,
    issueType: fresh.issueType ?? e.issueType,
    status: fresh.status,
    createdAt: fresh.createdAt ?? e.createdAt,
    startedAt: fresh.startedAt ?? (fresh.statusLog ? undefined : e.startedAt),
    resolvedAt: fresh.resolvedAt,
    statusLog: fresh.statusLog ?? e.statusLog,
    unit: issue.components.length ? fresh.unit : e.unit,
    labels: fresh.labels ?? e.labels,
    resourceName: issue.assignee || e.resourceName,
    originalEstimateHours: fresh.originalEstimateHours ?? e.originalEstimateHours,
    actualHours: fresh.actualHours ?? e.actualHours,
    storyPoints: fresh.storyPoints ?? e.storyPoints,
    fixVersion: fresh.fixVersion ?? e.fixVersion,
    ...(noEstimate(e) && !noEstimate(fresh) ? { time: fresh.time, availability: true, estimateSource: e.estimateSource ?? fresh.estimateSource } : {}),
});

/** Görevi undefined alanlar olmadan karşılaştırmak için */
const same = (a: Task, b: Task) => JSON.stringify(a) === JSON.stringify(b);

export interface JiraMergeResult {
    tasks: Task[];
    added: number;
    updated: number;
    unchanged: number;
}

/** Jira kayıtlarını görev listesine birleştirir (Jira anahtarıyla; aynı anahtar iki kez gelirse sonuncusu) */
export const mergeJiraIssues = (tasks: Task[], issues: JiraIssueRecord[], opts: JiraImportOptions): JiraMergeResult => {
    const latest = new Map<string, JiraIssueRecord>();
    issues.forEach(i => latest.set(keyOf(i.key), i));
    const byKey = new Map<string, number>();
    tasks.forEach((t, i) => { const k = keyOf(t.jiraId); if (k && !byKey.has(k)) byKey.set(k, i); });
    const ids = new Set(tasks.map(t => t.id));
    const idOfKey = new Map<string, string>();
    tasks.forEach(t => { const k = keyOf(t.jiraId); if (k && !idOfKey.has(k)) idOfKey.set(k, t.id); });

    const out = [...tasks];
    const added: Task[] = [];
    let updated = 0, unchanged = 0;
    const fresh = new Map<string, Task>();
    latest.forEach((issue, k) => {
        let id = `jira-${k.toLowerCase()}`;
        if (!idOfKey.has(k)) {
            for (let n = 2; ids.has(id); n++) id = `jira-${k.toLowerCase()}-${n}`;
            ids.add(id);
            idOfKey.set(k, id);
        }
        fresh.set(k, issueToTask(issue, opts, idOfKey.get(k)));
    });
    // Öncül: Jira'da bu kaydı engelleyen ve projede bulunan ilk kayıt
    const blockerOf = (issue: JiraIssueRecord, self: string) => issue.blockedBy.map(b => idOfKey.get(keyOf(b))).find(x => x && x !== self) || null;

    latest.forEach((issue, k) => {
        const t = fresh.get(k)!;
        const at = byKey.get(k);
        if (at === undefined) {
            added.push({ ...t, predecessor: blockerOf(issue, t.id) });
            return;
        }
        const e = out[at];
        const next = updateFrom(e, t, issue);
        if (!next.predecessor) next.predecessor = blockerOf(issue, e.id);
        if (same(next, e)) { unchanged++; return; }
        out[at] = next;
        updated++;
    });
    return { tasks: [...out, ...added], added: added.length, updated, unchanged };
};

export interface JiraImportPreview {
    total: number;
    closed: number;
    open: number;
    added: number;
    updated: number;
    unchanged: number;
    /** Kapanmışlar içinde: ilk tahmini, harcanan süresi, işe başlama anı olan pay */
    withEstimate: number;
    withSpent: number;
    withStart: number;
    byType: { type: IssueType | 'none'; n: number }[];
    /** Projede eğitime uygun kapanmış kayıt (aktarımdan önce → sonra) */
    usableBefore: number;
    usableAfter: number;
    /** Aktarılan kapanmış kayıtlardan kalite testinde elenenler */
    excluded: number;
}

const share = (n: number, d: number) => (d ? n / d : 0);

export const previewJiraImport = (project: Pick<Project, 'id' | 'name' | 'tasks'>, issues: JiraIssueRecord[], opts: JiraImportOptions): JiraImportPreview => {
    const r = mergeJiraIssues(project.tasks, issues, opts);
    const keys = new Set(issues.map(i => keyOf(i.key)));
    const imported = r.tasks.filter(t => keys.has(keyOf(t.jiraId)));
    const closed = imported.filter(t => t.status === TaskStatus.Done);
    const types = new Map<IssueType | 'none', number>();
    imported.forEach(t => types.set(t.issueType || 'none', (types.get(t.issueType || 'none') || 0) + 1));
    const before = analyzeRecords([project]);
    const after = analyzeRecords([{ ...project, tasks: r.tasks }]);
    const importedRows = after.rows.filter(row => keys.has(keyOf(row.task.jiraId)));
    return {
        total: imported.length,
        closed: closed.length,
        open: imported.length - closed.length,
        added: r.added,
        updated: r.updated,
        unchanged: r.unchanged,
        withEstimate: share(closed.filter(t => t.originalEstimateHours).length, closed.length),
        withSpent: share(closed.filter(t => t.actualHours).length, closed.length),
        withStart: share(closed.filter(t => t.startedAt).length, closed.length),
        byType: [...types].map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n),
        usableBefore: before.usable,
        usableAfter: after.usable,
        excluded: importedRows.filter(row => !row.usable).length, // satırlar yalnız kapanmış kayıtlardır
    };
};

/** Dönem seçeneği → "since" tarihi (YYYY-MM-DD); 0 = tümü */
export const sinceMonths = (months: number, now: Date = new Date()): string | undefined => {
    if (!months) return undefined;
    const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
