import { Task, TaskStatus, WorkflowConfig, WorkflowStatusDef } from '../types';

/**
 * İş akışı (issue) durumları — Jira'daki gibi ayrıntılı durumlar ve Türkçe
 * adları. Her durum dört ana kategoriden birine bağlıdır (Bekleyen, Yapılacak,
 * Süreçte, Tamamlandı); hesaplar (ilerleme, EVM, tahmin, yaşam döngüsü)
 * kategoriyi kullanmaya devam eder, ayrıntılı durum `Task.jiraStatus`
 * alanında Jira'nın anahtarıyla saklanır (ör. "TESTING"). Böylece Jira'dan
 * gelen durumlar ve uygulamada seçilenler aynı alanda buluşur.
 *
 * Projenin iş akışı admin'in atadığı şemadan gelir (utils/projectScheme.ts):
 * durum listesi, başlangıç durumu ve izin verilen geçişler. Fonksiyonlar
 * iş akışı verilmezse yerleşik tam listeyi (DEFAULT_WORKFLOW) kullanır.
 */

export type WorkflowStatus = WorkflowStatusDef;

export const WORKFLOW_STATUSES: WorkflowStatus[] = [
    { key: 'BACKLOG', label: 'Bekleyen', category: TaskStatus.Backlog },
    { key: 'POSTPONED', label: 'Ertelendi', category: TaskStatus.Backlog },
    { key: 'TO DO', label: 'Yapılacak', category: TaskStatus.ToDo },
    { key: 'OPEN', label: 'Açık', category: TaskStatus.ToDo },
    { key: 'REOPENED', label: 'Yeniden Açıldı', category: TaskStatus.ToDo },
    { key: 'IN PROGRESS', label: 'Geliştirmede', category: TaskStatus.InProgress },
    { key: 'ANALYSIS', label: 'Analizde', category: TaskStatus.InProgress },
    { key: 'IN REVIEW', label: 'Kod İncelemede', category: TaskStatus.InProgress },
    { key: 'TESTING', label: 'Testte', category: TaskStatus.InProgress },
    { key: 'BLOCKED', label: 'Engellendi', category: TaskStatus.InProgress },
    { key: 'RESOLVED', label: 'Çözüldü', category: TaskStatus.Done },
    { key: 'DONE', label: 'Tamamlandı', category: TaskStatus.Done },
    { key: 'CLOSED', label: 'Kapandı', category: TaskStatus.Done },
    { key: 'REJECTED', label: 'Reddedildi', category: TaskStatus.Done },
];

/** Yerleşik iş akışı: tüm hazır durumlar, serbest geçiş */
export const DEFAULT_WORKFLOW: WorkflowConfig = { statuses: WORKFLOW_STATUSES, initial: 'TO DO' };

export const CATEGORY_LABELS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Bekleyen',
    [TaskStatus.ToDo]: 'Yapılacak',
    [TaskStatus.InProgress]: 'Süreçte',
    [TaskStatus.Done]: 'Tamamlandı',
};

export const CATEGORY_ORDER: TaskStatus[] = [TaskStatus.Backlog, TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done];

/** Kategoriye göre seçildiğinde yazılan varsayılan ayrıntılı durum (yerleşik liste) */
export const DEFAULT_KEY: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'BACKLOG',
    [TaskStatus.ToDo]: 'TO DO',
    [TaskStatus.InProgress]: 'IN PROGRESS',
    [TaskStatus.Done]: 'DONE',
};

export const workflowKey = (name: string): string => name.trim().toUpperCase().replace(/\s+/g, ' ');

const BUILTIN = new Map(WORKFLOW_STATUSES.map(s => [s.key, s]));

/** Durum tanımı: önce projenin iş akışı, sonra yerleşik liste (Jira adlarının Türkçesi) */
export const knownWorkflow = (name?: string, wf?: WorkflowConfig): WorkflowStatus | undefined => {
    if (!name) return undefined;
    const k = workflowKey(name);
    return wf?.statuses.find(s => s.key === k) || BUILTIN.get(k);
};

/** Ayrıntılı durumun Türkçe adı; bilinmeyen Jira durumu olduğu gibi */
export const workflowLabel = (name: string, wf?: WorkflowConfig): string => knownWorkflow(name, wf)?.label || name.trim();

/** Kategorinin iş akışındaki ilk durumu (yoksa yerleşik varsayılan) */
export const firstOfCategory = (category: TaskStatus, wf: WorkflowConfig = DEFAULT_WORKFLOW): WorkflowStatus | undefined =>
    wf.statuses.find(s => s.category === category);

/** Görevin gösterilecek durumu: ayrıntılı durum varsa o, yoksa kategorinin iş akışındaki ilk durumu */
export const taskWorkflow = (t: Pick<Task, 'status' | 'jiraStatus'>, wf: WorkflowConfig = DEFAULT_WORKFLOW): WorkflowStatus => {
    if (t.jiraStatus) {
        const known = knownWorkflow(t.jiraStatus, wf);
        if (known) return known;
        return { key: workflowKey(t.jiraStatus), label: t.jiraStatus.trim(), category: t.status };
    }
    const first = firstOfCategory(t.status, wf);
    if (first) return { ...first, label: wf === DEFAULT_WORKFLOW ? CATEGORY_LABELS[t.status] : first.label };
    return { key: DEFAULT_KEY[t.status], label: CATEGORY_LABELS[t.status], category: t.status };
};

export const taskStatusLabel = (t: Pick<Task, 'status' | 'jiraStatus'>, wf?: WorkflowConfig): string => taskWorkflow(t, wf).label;

/** Geçiş izni: serbest akışta ya da tanımsız (Jira'dan gelen) durumdan her yere; aynı duruma her zaman */
export const canTransition = (wf: WorkflowConfig, from: string, to: string): boolean => {
    const f = workflowKey(from);
    const t = workflowKey(to);
    if (f === t || !wf.transitions) return true;
    if (!wf.statuses.some(s => s.key === f)) return true;
    return (wf.transitions[f] || []).includes(t);
};

/**
 * Seçilebilecek durumlar, kategoriye göre gruplu: projenin iş akışı + görevlerde
 * görülen (Jira'ya özgü) durumlar. `from` verilirse yalnız izin verilen geçişler
 * (Jira'daki gibi) ve mevcut durum.
 */
export const workflowOptions = (
    tasks: Pick<Task, 'status' | 'jiraStatus'>[] = [],
    wf: WorkflowConfig = DEFAULT_WORKFLOW,
    from?: Pick<Task, 'status' | 'jiraStatus'>,
): { category: TaskStatus; label: string; statuses: WorkflowStatus[] }[] => {
    const extra = new Map<string, WorkflowStatus>();
    tasks.forEach(t => {
        if (!t.jiraStatus) return;
        const k = workflowKey(t.jiraStatus);
        if (wf.statuses.some(s => s.key === k) || extra.has(k)) return;
        extra.set(k, { key: k, label: workflowLabel(t.jiraStatus, wf), category: t.status });
    });
    let all = [...wf.statuses, ...extra.values()];
    if (from) {
        const cur = taskWorkflow(from, wf).key;
        all = all.filter(s => s.key === cur || (wf.statuses.some(x => x.key === s.key) && canTransition(wf, cur, s.key)));
        if (!all.some(s => s.key === cur)) all.unshift(taskWorkflow(from, wf));
    }
    return CATEGORY_ORDER.map(category => ({ category, label: CATEGORY_LABELS[category], statuses: all.filter(s => s.category === category) }))
        .filter(g => g.statuses.length);
};

/** Ayrıntılı durumu uygular: kategori (task.status) ve ayrıntılı durum birlikte değişir */
export const applyWorkflow = <T extends Task>(t: T, key: string, options?: WorkflowStatus[], wf?: WorkflowConfig): T => {
    const k = workflowKey(key);
    const s = knownWorkflow(k, wf) || options?.find(o => o.key === k);
    if (!s) return t;
    return { ...t, status: s.category, jiraStatus: s.key };
};

/**
 * Yalnız kategori istenen değişiklik (ör. "Tamamlandı olarak işaretle", eski
 * kontroller): o kategorideki, mevcut durumdan geçişine izin verilen ilk durum.
 * Uygun durum yoksa null (geçiş kurallarına aykırı).
 */
export const transitionToCategory = (t: Pick<Task, 'status' | 'jiraStatus'>, category: TaskStatus, wf: WorkflowConfig = DEFAULT_WORKFLOW): WorkflowStatus | null => {
    const cur = taskWorkflow(t, wf);
    if (cur.category === category) return cur;
    return wf.statuses.find(s => s.category === category && canTransition(wf, cur.key, s.key)) || null;
};

/** Seçicinin değeri (option value) */
export const workflowValue = (t: Pick<Task, 'status' | 'jiraStatus'>, wf?: WorkflowConfig): string => taskWorkflow(t, wf).key;

/**
 * Yalnız kategori değişen görevde (sürükle-bırak, AI önerisi, eski kontroller)
 * eski ayrıntılı durum artık geçerli değilse temizlenir — örn. "Testte" iken
 * "Tamamlandı"ya alınan görev Test kolonunda kalmasın.
 */
export const reconcileWorkflow = (old: Pick<Task, 'status' | 'jiraStatus'>, t: Task): Task => {
    if (old.status === t.status || !t.jiraStatus || t.jiraStatus !== old.jiraStatus) return t;
    const known = knownWorkflow(t.jiraStatus);
    if (known && known.category === t.status) return t;
    return { ...t, jiraStatus: undefined };
};

const normLabel = (x: string) => x.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');

/**
 * İstenen geçişi iş akışına göre çözer (AI önerisi ve dış çağrılar için): ad
 * (Türkçe) ya da Jira adıyla belirli durum veya yalnız kategori. İzin yoksa
 * kullanıcıya/modele gösterilecek gerekçe ve izinli geçişler döner.
 */
export const resolveTransition = (
    t: Pick<Task, 'status' | 'jiraStatus'>,
    wf: WorkflowConfig,
    want: { key?: string; category?: TaskStatus },
): { target: WorkflowStatus } | { error: string } => {
    const cur = taskWorkflow(t, wf);
    const allowed = workflowOptions([], wf, t).flatMap(g => g.statuses).filter(s => s.key !== cur.key);
    const allowedText = allowed.length ? allowed.map(s => s.label).join(', ') : 'yok';
    if (want.key) {
        const k = workflowKey(want.key);
        const s = wf.statuses.find(x => x.key === k || normLabel(x.label) === normLabel(want.key!));
        if (!s) return { error: `"${want.key}" bu projenin iş akışında yok. Durumlar: ${wf.statuses.map(x => x.label).join(', ')}.` };
        if (!canTransition(wf, cur.key, s.key)) return { error: `"${cur.label}" → "${s.label}" geçişi projenin iş akışında tanımlı değil. İzinli geçişler: ${allowedText}.` };
        return { target: s };
    }
    if (!want.category) return { error: 'Hedef durum belirtilmedi.' };
    const s = transitionToCategory(t, want.category, wf);
    if (!s) return { error: `"${cur.label}" durumundan "${CATEGORY_LABELS[want.category]}" kategorisine geçiş projenin iş akışında tanımlı değil. İzinli geçişler: ${allowedText}.` };
    return { target: s };
};

/** Yeni kaydın başlangıcı (iş akışının başlangıç durumu) */
export const initialStatus = (wf: WorkflowConfig): { status: TaskStatus; jiraStatus?: string } => {
    const s = wf.statuses.find(x => x.key === wf.initial);
    if (!s) return { status: TaskStatus.ToDo };
    return wf === DEFAULT_WORKFLOW ? { status: s.category } : { status: s.category, jiraStatus: s.key };
};
