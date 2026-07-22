import { Task, TaskStatus, WorkPackage } from '../types';

/**
 * İş paketi ↔ görev ↔ kişi özeti. Bir projedeki görevleri iş paketine göre
 * gruplar; her paketin görev sayısı, tamamlanma ve atanan kişileri.
 * İş paketi atanmamış görevler ayrı "kovada" toplanır.
 */

export interface WorkPackageSummary {
    id: string; // '' → iş paketi atanmamış
    name: string;
    taskCount: number;
    doneCount: number;
    donePct: number; // 0..100
    assignees: string[]; // tekil kaynak adları
}

const UNASSIGNED_ID = '';
const UNASSIGNED_NAME = 'İş paketi atanmamış';

export const summarizeWorkPackages = (workPackages: WorkPackage[], tasks: Task[]): WorkPackageSummary[] => {
    const wpById = new Map(workPackages.map(wp => [wp.id, wp.name]));
    const buckets = new Map<string, { count: number; done: number; assignees: Set<string> }>();
    const ensure = (id: string) => {
        if (!buckets.has(id)) buckets.set(id, { count: 0, done: 0, assignees: new Set() });
        return buckets.get(id)!;
    };

    tasks.forEach(t => {
        // Geçersiz/eksik iş paketi → atanmamış kovası
        const id = t.workPackageId && wpById.has(t.workPackageId) ? t.workPackageId : UNASSIGNED_ID;
        const b = ensure(id);
        b.count++;
        if (t.status === TaskStatus.Done) b.done++;
        const name = (t.resourceName || '').trim();
        if (name) b.assignees.add(name);
    });

    const rows: WorkPackageSummary[] = workPackages.map(wp => {
        const b = buckets.get(wp.id);
        const count = b?.count || 0;
        const done = b?.done || 0;
        return {
            id: wp.id,
            name: wp.name,
            taskCount: count,
            doneCount: done,
            donePct: count > 0 ? Math.round((done / count) * 100) : 0,
            assignees: b ? Array.from(b.assignees).sort((a, c) => a.localeCompare(c, 'tr')) : [],
        };
    });

    const unassigned = buckets.get(UNASSIGNED_ID);
    if (unassigned && unassigned.count > 0) {
        rows.push({
            id: UNASSIGNED_ID,
            name: UNASSIGNED_NAME,
            taskCount: unassigned.count,
            doneCount: unassigned.done,
            donePct: Math.round((unassigned.done / unassigned.count) * 100),
            assignees: Array.from(unassigned.assignees).sort((a, c) => a.localeCompare(c, 'tr')),
        });
    }

    return rows;
};
