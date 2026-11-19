import { BoardColumnConfig, BoardConfig, BoardQuickFilter, BoardStatusKey, Task, TaskStatus } from '../types';
import { WorkflowConfig } from '../types';
import { CATEGORY_LABELS, DEFAULT_WORKFLOW, WORKFLOW_STATUSES, workflowLabel } from './workflow';

/**
 * Jira tarzı proje panosu: kolonlar durumlara (uygulama durumu ya da Jira
 * durum adı) eşlenir, etiket kuralları eklenebilir, WIP sınırları, hızlı
 * filtreler ve kulvarlar. Saf fonksiyonlar — arayüz components/modern/ProjectBoard.tsx.
 *
 * Kolon seçimi:
 *  1. Görevin Jira durumu bir kolona eşlenmişse o kolonlar adaydır; değilse
 *     uygulama durumunun (Backlog/ToDo/InProgress/Done) eşlendiği kolonlar.
 *     Durumu olmayan, yalnız etiketle tanımlı kolon; "taşınınca durum"u
 *     görevin uygulama durumuyla aynıysa adaydır (o aşamanın alt kolonu).
 *  2. rulePriority 'status' (varsayılan, Jira'daki gibi süreç önce): aday
 *     kolonlardan görevin etiketiyle eşleşen seçilir, yoksa ilk aday. Hiç aday
 *     yoksa etiket kuralı uyan kolon. 'label': etiket kuralı uyan kolon her
 *     zaman önce gelir.
 *  3. Hiçbiri uymazsa görev eşlenmemiştir (panoda "Eşlenmemiş" uyarısı).
 */

export const APP_STATUS_LABELS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Backlog',
    [TaskStatus.ToDo]: 'Yapılacak',
    [TaskStatus.InProgress]: 'Devam Ediyor',
    [TaskStatus.Done]: 'Tamamlandı',
};

export const appKey = (s: TaskStatus): BoardStatusKey => `app:${s}`;
export const jiraKey = (name: string): BoardStatusKey => `jira:${name.trim().toUpperCase().replace(/\s+/g, ' ')}`;
/** Durum anahtarının adı: uygulama kategorisi ya da iş akışı durumunun Türkçe adı (bilinmeyen Jira durumu olduğu gibi) */
export const statusKeyLabel = (k: BoardStatusKey, wf?: WorkflowConfig): string =>
    k.startsWith('app:') ? APP_STATUS_LABELS[k.slice(4) as TaskStatus] || k.slice(4) : workflowLabel(k.slice(5), wf);
export const isJiraKey = (k: BoardStatusKey): boolean => k.startsWith('jira:');

/** Büyük/küçük ve ı/i duyarsız karşılaştırma ("GIB" = "gib", "İSTEMCİ" = "istemci") */
const norm = (s: string) => s.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
let seq = 0;
export const boardId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;

/** Kategorinin hazır iş akışı durumları (ilk Jira anahtarı, karta taşınınca yazılan durumdur) */
const wf = (...cats: TaskStatus[]): BoardStatusKey[] => WORKFLOW_STATUSES.filter(s => cats.includes(s.category)).map(s => jiraKey(s.key));

export const defaultBoardConfig = (): BoardConfig => ({
    columns: [
        { id: 'col-todo', name: 'Yapılacak', statuses: [appKey(TaskStatus.Backlog), appKey(TaskStatus.ToDo), jiraKey('TO DO'), ...wf(TaskStatus.ToDo, TaskStatus.Backlog).filter(k => k !== jiraKey('TO DO'))], targetStatus: TaskStatus.ToDo },
        { id: 'col-progress', name: 'Devam Ediyor', statuses: [appKey(TaskStatus.InProgress), ...wf(TaskStatus.InProgress).filter(k => k !== jiraKey('TESTING'))], targetStatus: TaskStatus.InProgress },
        { id: 'col-test', name: 'Testte', statuses: [jiraKey('TESTING')], targetStatus: TaskStatus.InProgress },
        { id: 'col-done', name: 'Tamamlandı', statuses: [appKey(TaskStatus.Done), jiraKey('DONE'), ...wf(TaskStatus.Done).filter(k => k !== jiraKey('DONE'))], targetStatus: TaskStatus.Done },
    ],
    rulePriority: 'status',
    quickFilters: [
        { id: 'qf-me', name: 'Sadece benim işlerim', assignee: 'me' },
        { id: 'qf-recent', name: 'Son güncellenenler', recentDays: 7 },
        { id: 'qf-overdue', name: 'Gecikenler', overdue: true },
    ],
    swimlane: 'none',
    expedite: { priorities: ['Blocker'] },
});

/**
 * İş akışından pano (Jira'nın yeni pano davranışı gibi): Yapılacak kolonu
 * (Bekleyen + Yapılacak kategorisi), Süreçteki her durum ayrı kolon (4'ten
 * fazlaysa tek "Devam Ediyor" kolonu), Tamamlandı kolonu. Kolonun ilk iş akışı
 * durumu, karta taşınınca yazılan durumdur.
 */
export const boardFromWorkflow = (wf: WorkflowConfig = DEFAULT_WORKFLOW): BoardConfig => {
    if (wf === DEFAULT_WORKFLOW) return defaultBoardConfig();
    const keys = (cats: TaskStatus[]) => wf.statuses.filter(s => cats.includes(s.category)).map(s => jiraKey(s.key));
    const todo = keys([TaskStatus.ToDo, TaskStatus.Backlog]);
    const initial = jiraKey(wf.initial);
    const progress = wf.statuses.filter(s => s.category === TaskStatus.InProgress);
    const done = wf.statuses.filter(s => s.category === TaskStatus.Done);
    const columns: BoardColumnConfig[] = [
        { id: 'col-todo', name: CATEGORY_LABELS[TaskStatus.ToDo], statuses: [appKey(TaskStatus.Backlog), appKey(TaskStatus.ToDo), ...(todo.includes(initial) ? [initial] : []), ...todo.filter(k => k !== initial)], targetStatus: TaskStatus.ToDo },
        ...(progress.length <= 4
            ? progress.map((s, i) => ({ id: `col-${s.key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: s.label, statuses: [...(i === 0 ? [appKey(TaskStatus.InProgress)] : []), jiraKey(s.key)], targetStatus: TaskStatus.InProgress }))
            : [{ id: 'col-progress', name: 'Devam Ediyor', statuses: [appKey(TaskStatus.InProgress), ...progress.map(s => jiraKey(s.key))], targetStatus: TaskStatus.InProgress }]),
        { id: 'col-done', name: done[0]?.label && done.length === 1 ? done[0].label : CATEGORY_LABELS[TaskStatus.Done], statuses: [appKey(TaskStatus.Done), ...done.map(s => jiraKey(s.key))], targetStatus: TaskStatus.Done },
    ];
    if (!progress.length) columns.splice(1, 0, { id: 'col-progress', name: 'Devam Ediyor', statuses: [appKey(TaskStatus.InProgress)], targetStatus: TaskStatus.InProgress });
    return { ...defaultBoardConfig(), columns };
};

/** Kayıtlı ayarı eksik alanlarıyla tamamlar (eski sürümler / elle düzenlenmiş JSON); ayar yoksa iş akışından */
export const boardConfigOf = (cfg?: BoardConfig | null, wf?: WorkflowConfig): BoardConfig => {
    const d = boardFromWorkflow(wf);
    if (!cfg || !Array.isArray(cfg.columns) || !cfg.columns.length) return d;
    return {
        ...d,
        ...cfg,
        quickFilters: Array.isArray(cfg.quickFilters) ? cfg.quickFilters : d.quickFilters,
        columns: cfg.columns.map(c => ({ ...c, statuses: Array.isArray(c.statuses) ? c.statuses : [], targetStatus: c.targetStatus || TaskStatus.ToDo })),
    };
};

const hasLabel = (t: Task, labels?: string[]): boolean => {
    if (!labels?.length || !t.labels?.length) return false;
    const want = new Set(labels.map(norm));
    return t.labels.some(l => want.has(norm(l)));
};

/** Görevin düştüğü kolon (yoksa null = eşlenmemiş) */
export const columnOfTask = (t: Task, cfg: BoardConfig): BoardColumnConfig | null => {
    const cols = cfg.columns;
    const byJira = t.jiraStatus ? cols.filter(c => c.statuses.includes(jiraKey(t.jiraStatus!))) : [];
    const byStatus = byJira.length ? byJira : cols.filter(c => c.statuses.includes(appKey(t.status)));
    // Yalnız etiketle tanımlı kolon, "taşınınca durum" aşamasının alt kolonudur (ör. Devam Ediyor + "test" → Test)
    const stage = t.status === TaskStatus.Backlog ? TaskStatus.ToDo : t.status;
    const candidates = byStatus.length
        ? [...byStatus, ...cols.filter(c => !c.statuses.length && c.labels?.length && (c.targetStatus === TaskStatus.Backlog ? TaskStatus.ToDo : c.targetStatus) === stage)]
        : byStatus;
    const labelCol = cols.find(c => hasLabel(t, c.labels));
    if (cfg.rulePriority === 'label' && labelCol) return labelCol;
    if (candidates.length) return candidates.find(c => hasLabel(t, c.labels)) || candidates[0];
    return labelCol || null;
};

/**
 * Kart bir kolona bırakılınca görev değişikliği: uygulama durumu kolonun hedef
 * durumu olur; kolon Jira durumu eşliyorsa yereldeki Jira durumu da ona
 * çekilir (bir sonraki Jira eşitlemesi gerçek durumu geri yazar). Etiket
 * kuralının kartı tutmaması için kaynak kolonun etiketleri kaldırılır, hedef
 * kolon etiketle tanımlıysa ilk etiketi eklenir.
 */
export const moveTaskPatch = (t: Task, target: BoardColumnConfig, cfg: BoardConfig, now: Date = new Date()): Partial<Task> => {
    const source = columnOfTask(t, cfg);
    const patch: Partial<Task> = { status: target.targetStatus, updatedAt: now.toISOString() };
    const jira = target.statuses.find(isJiraKey);
    if (jira) patch.jiraStatus = jira.slice(5);
    else if (t.jiraStatus) patch.jiraStatus = undefined;
    let labels = t.labels || [];
    if (source && source.id !== target.id && source.labels?.length) {
        const drop = new Set(source.labels.map(norm));
        labels = labels.filter(l => !drop.has(norm(l)));
    }
    const needsLabel = target.labels?.length && (cfg.rulePriority === 'label' || !target.statuses.length || target.statuses.every(k => cfg.columns.some(c => c.id !== target.id && c.statuses.includes(k))));
    if (needsLabel && !hasLabel({ ...t, labels }, target.labels)) labels = [...labels, target.labels![0]];
    if (labels !== (t.labels || [])) patch.labels = labels.length ? labels : undefined;
    return patch;
};

export const isTaskOverdue = (t: Task, now: Date): boolean => !!t.dueDate && t.status !== TaskStatus.Done && t.dueDate.slice(0, 10) < now.toISOString().slice(0, 10);

/** Görevin son hareket anı (Jira güncellenmesi, durum geçişi, açılış) */
export const lastActivity = (t: Task): string | undefined =>
    [t.updatedAt, t.statusLog?.[t.statusLog.length - 1]?.at, t.resolvedAt, t.startedAt, t.createdAt].filter(Boolean).sort().pop();

export const matchesQuickFilter = (t: Task, f: BoardQuickFilter, ctx: { me?: string; now: Date }): boolean => {
    if (f.assignee) {
        const who = f.assignee === 'me' ? ctx.me : f.assignee;
        if (!who || norm(t.resourceName || '') !== norm(who)) return false;
    }
    if (f.labels?.length && !hasLabel(t, f.labels)) return false;
    if (f.priorities?.length && !f.priorities.includes(t.priority)) return false;
    if (f.issueTypes?.length && !(t.issueType && f.issueTypes.includes(t.issueType))) return false;
    if (f.overdue && !isTaskOverdue(t, ctx.now)) return false;
    if (f.recentDays) {
        const at = lastActivity(t);
        if (!at || ctx.now.getTime() - new Date(at).getTime() > f.recentDays * 86_400_000) return false;
    }
    return true;
};

/** Hızlı filtreleri ve arama metnini uygular (Jira'daki gibi seçili filtreler VE ile birleşir) */
export const filterBoardTasks = (tasks: Task[], active: BoardQuickFilter[], ctx: { me?: string; now: Date; query?: string }): Task[] => {
    const q = norm(ctx.query || '');
    return tasks.filter(t =>
        active.every(f => matchesQuickFilter(t, f, ctx))
        && (!q || [t.name, t.jiraId, t.resourceName, ...(t.labels || [])].some(v => v && norm(v).includes(q))));
};

const isDoneColumn = (c: BoardColumnConfig) => c.targetStatus === TaskStatus.Done;

/** Kolonlara dağıtım; tamamlanma kolonlarında doneDays süzgeci (toplam ayrıca döner) */
export const distribute = (tasks: Task[], cfg: BoardConfig, now: Date = new Date()) => {
    const columns = cfg.columns.map(c => ({ column: c, tasks: [] as Task[], total: 0 }));
    const index = new Map(cfg.columns.map((c, i) => [c.id, i]));
    const unmapped: Task[] = [];
    const cutoff = cfg.doneDays ? now.getTime() - cfg.doneDays * 86_400_000 : null;
    for (const t of tasks) {
        const c = columnOfTask(t, cfg);
        if (!c) { unmapped.push(t); continue; }
        const slot = columns[index.get(c.id)!];
        slot.total++;
        if (cutoff !== null && isDoneColumn(c)) {
            const at = t.resolvedAt || lastActivity(t);
            if (at && new Date(at).getTime() < cutoff) continue;
        }
        slot.tasks.push(t);
    }
    return { columns, unmapped };
};

/** WIP durumu: max aşıldı / min altında / normal */
export const wipState = (count: number, c: Pick<BoardColumnConfig, 'min' | 'max'>): 'over' | 'under' | 'ok' =>
    c.max !== undefined && c.max > 0 && count > c.max ? 'over' : c.min !== undefined && c.min > 0 && count < c.min ? 'under' : 'ok';

export interface Lane {
    id: string;
    title: string;
    tasks: Task[];
}

const PRIORITY_ORDER: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];
const PRIORITY_TR: Record<Task['priority'], string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };

export const isExpedite = (t: Task, cfg: BoardConfig): boolean =>
    !!(cfg.expedite?.priorities?.includes(t.priority) || hasLabel(t, cfg.expedite?.labels));

/** Kulvarlar (boş kulvarlar atlanır; "none" tek kulvar) */
export const buildLanes = (tasks: Task[], cfg: BoardConfig, wpNames: Map<string, string> = new Map()): Lane[] => {
    const group = (key: (t: Task) => string, order?: string[], title: (k: string) => string = k => k): Lane[] => {
        const m = new Map<string, Task[]>();
        tasks.forEach(t => { const k = key(t); m.set(k, [...(m.get(k) || []), t]); });
        const keys = [...m.keys()].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : 0) || (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'tr')));
        return keys.map(k => ({ id: `lane-${k || 'none'}`, title: title(k), tasks: m.get(k)! }));
    };
    switch (cfg.swimlane) {
        case 'expedite': {
            const exp = tasks.filter(t => isExpedite(t, cfg));
            const rest = tasks.filter(t => !isExpedite(t, cfg));
            return [
                ...(exp.length ? [{ id: 'lane-expedite', title: 'Expedite', tasks: exp }] : []),
                ...(rest.length ? [{ id: 'lane-rest', title: 'Diğer işler', tasks: rest }] : []),
            ];
        }
        case 'assignee': return group(t => t.resourceName || '', undefined, k => k || 'Atanmamış');
        case 'priority': return group(t => t.priority, PRIORITY_ORDER, k => PRIORITY_TR[k as Task['priority']] || k);
        case 'workPackage': return group(t => (t.workPackageId && wpNames.get(t.workPackageId)) || '', undefined, k => k || 'İş paketi yok');
        default: return [{ id: 'lane-all', title: '', tasks }];
    }
};

/** Projede görülen tüm durum anahtarları ve görev sayıları (yapılandırma ekranı) */
export const statusUsage = (tasks: Task[], wf: WorkflowConfig = DEFAULT_WORKFLOW): Map<BoardStatusKey, number> => {
    const m = new Map<BoardStatusKey, number>();
    Object.values(TaskStatus).forEach(s => m.set(appKey(s), 0));
    // İş akışının durumları da (Jira'daki "görev içermeyen durumlar" gibi) eşlenebilsin
    (wf.statuses.length ? wf.statuses : WORKFLOW_STATUSES).forEach(s => m.set(jiraKey(s.key), 0));
    tasks.forEach(t => {
        const k = t.jiraStatus ? jiraKey(t.jiraStatus) : appKey(t.status);
        m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
};

/** Hiçbir kolona eşlenmemiş durum anahtarları */
export const unmappedStatuses = (cfg: BoardConfig, usage: Map<BoardStatusKey, number>): BoardStatusKey[] => {
    const mapped = new Set(cfg.columns.flatMap(c => c.statuses));
    return [...usage.keys()].filter(k => !mapped.has(k));
};

/** Projede en çok kullanılan etiketler (hızlı filtre önerisi) */
export const topLabels = (tasks: Task[], n = 12): { label: string; count: number }[] => {
    const m = new Map<string, number>();
    tasks.forEach(t => (t.labels || []).forEach(l => m.set(l, (m.get(l) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr')).slice(0, n).map(([label, count]) => ({ label, count }));
};

/** Ayarı doğrular: kullanıcıya gösterilecek sorunlar */
export const validateBoardConfig = (cfg: BoardConfig): string[] => {
    const errs: string[] = [];
    if (!cfg.columns.length) errs.push('En az bir kolon gerekli.');
    cfg.columns.forEach(c => {
        if (!c.name.trim()) errs.push('Kolon adı boş olamaz.');
        if (!c.statuses.length && !c.labels?.length) errs.push(`"${c.name || 'Adsız'}" kolonunda durum ya da etiket kuralı yok.`);
        if (c.min !== undefined && c.max !== undefined && c.min > 0 && c.max > 0 && c.min > c.max) errs.push(`"${c.name}" kolonunda en az, en çoktan büyük.`);
    });
    // Aynı durum birden çok kolonda olabilir (etiketle ayrılır); etiketsiz ikinci kolon hiç kart almaz
    const plain = new Map<BoardStatusKey, string>();
    cfg.columns.forEach(c => c.statuses.forEach(k => {
        if (c.labels?.length) return;
        if (plain.has(k)) errs.push(`"${statusKeyLabel(k)}" durumu etiket kuralı olmayan iki kolona eşlenmiş (${plain.get(k)}, ${c.name}); ikincisi kart almaz.`);
        else plain.set(k, c.name);
    }));
    return errs;
};
