import { Project, Task } from '../types';

/**
 * Görev silme (tekli, toplu ve asistan önerisi aynı kuralla). Silinen göreve
 * bağlı ardıl görevlerin öncül bağı kaldırılır; plan çizelgesinde kopuk bağ
 * kalmaz. Tahmin günlüğü, altın set ve sürüm planı gibi geçmiş kayıtlar
 * görev kimliğini tarih için tutar ve görev bulunamadığında atlar.
 */

/** Bir seferde silinebilecek en çok görev (kazara tüm projeyi silmeye karşı) */
export const MAX_BULK_DELETE = 500;

export interface TaskDeletePreview {
    /** Silinecek görevler (projede bulunanlar) */
    tasks: Task[];
    /** Öncül bağı kaldırılacak görevler (silinmeyenler) */
    unlinked: Task[];
    /** Projede bulunamayan kimlikler */
    missing: string[];
}

export const previewTaskDelete = (project: Pick<Project, 'tasks'>, ids: Iterable<string>): TaskDeletePreview | { error: string } => {
    const want = new Set(ids);
    if (!want.size) return { error: 'Silinecek görev seçilmedi.' };
    if (want.size > MAX_BULK_DELETE) return { error: `Bir seferde en çok ${MAX_BULK_DELETE} görev silinebilir.` };
    const tasks = project.tasks.filter(t => want.has(t.id));
    const found = new Set(tasks.map(t => t.id));
    const missing = [...want].filter(id => !found.has(id));
    const unlinked = project.tasks.filter(t => !found.has(t.id) && !!t.predecessor && found.has(t.predecessor));
    return { tasks, unlinked, missing };
};

/** Görevleri siler, ardıllarının öncül bağını kaldırır. Değişiklik yoksa aynı dizi döner. */
export const removeTasks = (tasks: Task[], ids: ReadonlySet<string>, now = new Date()): Task[] => {
    if (!tasks.some(t => ids.has(t.id))) return tasks;
    const stamp = now.toISOString();
    return tasks
        .filter(t => !ids.has(t.id))
        .map(t => (t.predecessor && ids.has(t.predecessor) ? { ...t, predecessor: null, updatedAt: stamp } : t));
};

/** Onay penceresi ve denetim günlüğü için kısa açıklama */
export const describeTaskDelete = (p: TaskDeletePreview): string => {
    const names = p.tasks.slice(0, 3).map(t => (t.jiraId ? `${t.jiraId} ${t.name}` : t.name));
    const more = p.tasks.length > 3 ? ` ve ${p.tasks.length - 3} görev daha` : '';
    return `${p.tasks.length} görev: ${names.join(', ')}${more}`;
};
