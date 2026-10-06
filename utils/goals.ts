import { KeyResult, Objective, Project, Task, TaskStatus } from '../types';

/**
 * Hedef (OKR) ilerlemesi. Anahtar sonuç ilerlemesi = ona bağlı görevlerin
 * tamamlanma oranı; hedef ilerlemesi = anahtar sonuçların ortalaması (görevi
 * olmayan anahtar sonuç 0 sayılır). Hedefler ekranı ve proje genel bakışı
 * aynı hesabı kullanır.
 */

export interface KeyResultProgress {
    id: string;
    name: string;
    total: number;
    done: number;
    /** Bağlı görev yoksa null */
    progressPct: number | null;
}

export interface ObjectiveProgress {
    id: string;
    name: string;
    quarter?: string;
    description?: string;
    keyResults: KeyResultProgress[];
    linkedTasks: number;
    doneTasks: number;
    /** Hiç bağlı görev yoksa null */
    progressPct: number | null;
}

export const keyResultProgress = (kr: KeyResult, tasks: Task[]): KeyResultProgress => {
    const linked = tasks.filter(t => t.keyResultId === kr.id);
    const done = linked.filter(t => t.status === TaskStatus.Done).length;
    return { id: kr.id, name: kr.name, total: linked.length, done, progressPct: linked.length ? Math.round((done / linked.length) * 100) : null };
};

export const objectiveProgress = (project: Pick<Project, 'objectives' | 'tasks'>): ObjectiveProgress[] =>
    (project.objectives || []).map(o => {
        const krs = (o.keyResults || []).map(kr => keyResultProgress(kr, project.tasks || []));
        const linked = krs.reduce((s, k) => s + k.total, 0);
        const done = krs.reduce((s, k) => s + k.done, 0);
        const avg = krs.length ? krs.reduce((s, k) => s + (k.progressPct || 0), 0) / krs.length : 0;
        return {
            id: o.id,
            name: o.name,
            quarter: o.quarter || undefined,
            description: o.description || undefined,
            keyResults: krs,
            linkedTasks: linked,
            doneTasks: done,
            progressPct: linked ? Math.round(avg) : null,
        };
    });

export interface UnitProgress {
    unit: string;
    total: number;
    done: number;
    progressPct: number;
    /** Birimin görevleriyle katkı verdiği hedefler */
    objectives: string[];
}

/** Birim (görev birimi) bazında tamamlanma ve katkı verilen hedefler; en çok görevi olan başta */
export const unitProgress = (tasks: Task[], objectives: Objective[]): UnitProgress[] => {
    const krToObjective = new Map<string, string>();
    objectives.forEach(o => o.keyResults.forEach(kr => krToObjective.set(kr.id, o.name)));
    const byUnit = new Map<string, Task[]>();
    tasks.forEach(t => {
        const u = (t.unit || '').trim();
        if (!u) return;
        byUnit.set(u, [...(byUnit.get(u) || []), t]);
    });
    return [...byUnit.entries()].map(([unit, list]) => {
        const done = list.filter(t => t.status === TaskStatus.Done).length;
        const objs = [...new Set(list.map(t => (t.keyResultId ? krToObjective.get(t.keyResultId) : undefined)).filter((n): n is string => !!n))];
        return { unit, total: list.length, done, progressPct: Math.round((done / list.length) * 100), objectives: objs };
    }).sort((a, b) => b.total - a.total || a.unit.localeCompare(b.unit, 'tr'));
};

/** Bitmemiş ve hiçbir anahtar sonuca bağlı olmayan görev sayısı */
export const unlinkedOpenTasks = (tasks: Task[], objectives: Objective[]): number => {
    const krIds = new Set(objectives.flatMap(o => o.keyResults.map(kr => kr.id)));
    return tasks.filter(t => t.status !== TaskStatus.Done && !(t.keyResultId && krIds.has(t.keyResultId))).length;
};

/** Yeni hedef için varsayılan çeyrek: "Q4 2026" */
export const quarterLabel = (now: Date = new Date()): string => `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
