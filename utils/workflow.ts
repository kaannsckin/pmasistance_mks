import { Task, TaskStatus } from '../types';

/**
 * İş akışı (issue) durumları — Jira'daki gibi ayrıntılı durumlar ve Türkçe
 * adları. Her durum dört ana kategoriden birine bağlıdır (Bekleyen, Yapılacak,
 * Süreçte, Tamamlandı); hesaplar (ilerleme, EVM, tahmin, yaşam döngüsü)
 * kategoriyi kullanmaya devam eder, ayrıntılı durum `Task.jiraStatus`
 * alanında Jira'nın anahtarıyla saklanır (ör. "TESTING"). Böylece Jira'dan
 * gelen durumlar ve uygulamada seçilenler aynı alanda buluşur, panoda aynı
 * kolon kurallarıyla eşlenir.
 */

export interface WorkflowStatus {
    /** Jira'daki durum adı (büyük harf) — eşleme anahtarı */
    key: string;
    /** Türkçe adı */
    label: string;
    category: TaskStatus;
}

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

export const CATEGORY_LABELS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Bekleyen',
    [TaskStatus.ToDo]: 'Yapılacak',
    [TaskStatus.InProgress]: 'Süreçte',
    [TaskStatus.Done]: 'Tamamlandı',
};

export const CATEGORY_ORDER: TaskStatus[] = [TaskStatus.Backlog, TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done];

/** Kategoriye göre seçildiğinde yazılan varsayılan ayrıntılı durum */
export const DEFAULT_KEY: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'BACKLOG',
    [TaskStatus.ToDo]: 'TO DO',
    [TaskStatus.InProgress]: 'IN PROGRESS',
    [TaskStatus.Done]: 'DONE',
};

export const workflowKey = (name: string): string => name.trim().toUpperCase().replace(/\s+/g, ' ');

const BY_KEY = new Map(WORKFLOW_STATUSES.map(s => [s.key, s]));

/** Bilinen durum (yoksa undefined — Jira'ya özgü özel durumlar) */
export const knownWorkflow = (name?: string): WorkflowStatus | undefined => (name ? BY_KEY.get(workflowKey(name)) : undefined);

/** Ayrıntılı durumun Türkçe adı; bilinmeyen Jira durumu olduğu gibi */
export const workflowLabel = (name: string): string => knownWorkflow(name)?.label || name.trim();

/** Görevin gösterilecek durumu: ayrıntılı durum varsa o, yoksa kategorinin adı */
export const taskWorkflow = (t: Pick<Task, 'status' | 'jiraStatus'>): WorkflowStatus => {
    if (t.jiraStatus) {
        const known = knownWorkflow(t.jiraStatus);
        if (known) return known;
        return { key: workflowKey(t.jiraStatus), label: t.jiraStatus.trim(), category: t.status };
    }
    return { key: DEFAULT_KEY[t.status], label: CATEGORY_LABELS[t.status], category: t.status };
};

export const taskStatusLabel = (t: Pick<Task, 'status' | 'jiraStatus'>): string => taskWorkflow(t).label;

/**
 * Seçilebilecek durumlar: hazır liste + projedeki görevlerde görülen
 * (Jira'ya özgü) durumlar; kategori sırasıyla gruplanmış.
 */
export const workflowOptions = (tasks: Pick<Task, 'status' | 'jiraStatus'>[] = []): { category: TaskStatus; label: string; statuses: WorkflowStatus[] }[] => {
    const extra = new Map<string, WorkflowStatus>();
    tasks.forEach(t => {
        if (t.jiraStatus && !knownWorkflow(t.jiraStatus)) {
            const k = workflowKey(t.jiraStatus);
            if (!extra.has(k)) extra.set(k, { key: k, label: t.jiraStatus.trim(), category: t.status });
        }
    });
    const all = [...WORKFLOW_STATUSES, ...extra.values()];
    return CATEGORY_ORDER.map(category => ({ category, label: CATEGORY_LABELS[category], statuses: all.filter(s => s.category === category) }))
        .filter(g => g.statuses.length);
};

/** Ayrıntılı durumu uygular: kategori (task.status) ve ayrıntılı durum birlikte değişir */
export const applyWorkflow = <T extends Task>(t: T, key: string, options?: WorkflowStatus[]): T => {
    const k = workflowKey(key);
    const s = knownWorkflow(k) || options?.find(o => o.key === k);
    if (!s) return t;
    return { ...t, status: s.category, jiraStatus: s.key };
};

/** Seçicinin değeri (option value) */
export const workflowValue = (t: Pick<Task, 'status' | 'jiraStatus'>): string => taskWorkflow(t).key;

/**
 * Yalnız kategori değişen görevde (eski "durum" düğmeleri, sürükle-bırak,
 * AI önerisi) eski ayrıntılı durum artık geçerli değilse temizlenir — örn.
 * "Testte" iken "Tamamlandı"ya alınan görev Test kolonunda kalmasın.
 */
export const reconcileWorkflow = (old: Pick<Task, 'status' | 'jiraStatus'>, t: Task): Task => {
    if (old.status === t.status || !t.jiraStatus || t.jiraStatus !== old.jiraStatus) return t;
    const known = knownWorkflow(t.jiraStatus);
    if (known && known.category === t.status) return t;
    return { ...t, jiraStatus: undefined };
};
