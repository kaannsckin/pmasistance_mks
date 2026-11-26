import type { DashboardProgressWeights, Project, ProjectProgressModel, Task, TaskStatus } from '../types';

// Yaprak modül: sunucu (zamanlanmış rapor) da kullanır; çalışma zamanında başka modüle bağlı değildir
const DONE = 'Done' as TaskStatus;
const workflowKey = (name: string): string => name.trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Durum yüzdeleriyle ilerleme. Varsayılan yalnız Tamamlandı = %100; proje
 * modeliyle her kategori ya da ayrıntılı iş akışı durumu (ör. "TESTTE" = %75)
 * kısmi ilerleme sayılır. Ayrıntılı durum yüzdesi kategori yüzdesinden önce gelir.
 */

export const defaultProgressPercent = (category: TaskStatus): number => (category === DONE ? 100 : 0);
export const isProgressPercent = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

export const hasProgressWeights = (w?: DashboardProgressWeights): boolean =>
    !!w && (Object.values(w.categories || {}).some(isProgressPercent) || Object.values(w.statuses || {}).some(isProgressPercent));

/** Görevin tamamlanma yüzdesi (0–100) */
export const taskProgressPercent = (task: Pick<Task, 'status' | 'jiraStatus'>, weights?: DashboardProgressWeights): number => {
    // Tamamlanmış iş her zaman %100: yüzde yalnız yolda olan işi kısmi sayar
    if (task.status === DONE) return 100;
    const specific = task.jiraStatus?.trim() ? weights?.statuses?.[workflowKey(task.jiraStatus)] : undefined;
    if (isProgressPercent(specific)) return specific;
    const category = weights?.categories?.[task.status];
    return isProgressPercent(category) ? category : defaultProgressPercent(task.status);
};

const effortWeight = (t: Task) => Math.max(0, t.time?.avg || 0);

export interface ProgressSummary {
    /** 0–1 */
    ratio: number;
    /** 0–100, yuvarlanmış */
    pct: number;
    done: number;
    total: number;
    /** Durum yüzdeleri kullanıldı mı (kısmi ilerleme) */
    weighted: boolean;
    basis: 'count' | 'effort';
}

/** Görev listesinin ilerlemesi; model yoksa Tamamlandı adedi ÷ toplam */
export const progressOf = (tasks: Task[], model?: ProjectProgressModel, override?: DashboardProgressWeights): ProgressSummary => {
    const weights = override && hasProgressWeights(override) ? override : model?.weights;
    const weighted = hasProgressWeights(weights);
    let basis: 'count' | 'effort' = model?.basis === 'effort' ? 'effort' : 'count';
    if (basis === 'effort' && !tasks.some(t => effortWeight(t) > 0)) basis = 'count';
    let sum = 0, total = 0, done = 0;
    for (const t of tasks) {
        if (t.status === DONE) done++;
        const w = basis === 'effort' ? effortWeight(t) : 1;
        sum += w * taskProgressPercent(t, weights);
        total += w;
    }
    const ratio = total ? sum / (100 * total) : 0;
    return { ratio, pct: Math.round(ratio * 100), done, total: tasks.length, weighted, basis };
};

export const projectProgress = (project: Pick<Project, 'tasks' | 'progressModel'>, tasks: Task[] = project.tasks || []): ProgressSummary =>
    progressOf(tasks, project.progressModel);

/** Modelin kısa açıklaması (ör. "Durum yüzdeleri · efor ağırlıklı") */
export const describeProgressModel = (model?: ProjectProgressModel): string => {
    const parts = [hasProgressWeights(model?.weights) ? 'durum yüzdeleri' : 'yalnız tamamlanan'];
    if (model?.basis === 'effort') parts.push('efor ağırlıklı');
    return parts.join(' · ');
};
