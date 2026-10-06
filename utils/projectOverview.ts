import { Project, Task, TaskStatus } from '../types';
import { buildSprintWindows } from './taskToAllocation';
import { daysLate, missingEstimate, sprintLabel } from '../components/modern/taskMeta';
import { riskScore } from './risks';

/**
 * Modern proje "Genel bakış" sekmesinin veri katmanı. PM projeye girdiğinde
 * önce nerede olduğunu (aktif sürüm, ilerleme), neyin yaklaştığını (terminler)
 * ve neyin takıldığını (gecikme, risk, yük) tek bakışta görür.
 */

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export interface OverviewStats {
    total: number;
    todo: number; // Backlog + Yapılacak
    inProgress: number;
    done: number;
    overdue: number;
    missingEstimate: number;
    progressPct: number;
    openRisks: number;
    highRisks: number;
}

export const overviewStats = (project: Project, now: Date = new Date()): OverviewStats => {
    const tasks = project.tasks || [];
    const done = tasks.filter(t => t.status === TaskStatus.Done).length;
    const risks = (project.risks || []).filter(r => r.status !== 'closed');
    return {
        total: tasks.length,
        todo: tasks.filter(t => t.status === TaskStatus.ToDo || t.status === TaskStatus.Backlog).length,
        inProgress: tasks.filter(t => t.status === TaskStatus.InProgress).length,
        done,
        overdue: tasks.filter(t => daysLate(t, now) > 0).length,
        missingEstimate: tasks.filter(missingEstimate).length,
        progressPct: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
        openRisks: risks.length,
        highRisks: risks.filter(r => riskScore(r) >= 15).length,
    };
};

export interface CurrentSprint {
    version: number;
    label: string;
    total: number;
    done: number;
    inProgress: number;
    progressPct: number;
    start: Date;
    end: Date;
    /** Planlanan iş bitişine kalan gün; negatifse o kadar gün geride */
    daysLeft: number;
    /** Sonraki sürümlerde bekleyen görev sayısı */
    laterTasks: number;
}

/**
 * Aktif sürüm: bitmemiş görevi olan en küçük sürüm (Havuz hariç). Hepsi
 * bitmişse son sürüm. Tarihler panodaki takvimle aynı kurallarla hesaplanır.
 */
export const currentSprint = (project: Project, now: Date = new Date()): CurrentSprint | null => {
    const tasks = (project.tasks || []).filter(t => (t.version || 0) > 0 && t.includeInSprints !== false);
    if (tasks.length === 0) return null;
    const versions = [...new Set(tasks.map(t => t.version))].sort((a, b) => a - b);
    const open = versions.find(v => tasks.some(t => t.version === v && t.status !== TaskStatus.Done));
    const version = open ?? versions[versions.length - 1];
    const inSprint = tasks.filter(t => t.version === version);
    const done = inSprint.filter(t => t.status === TaskStatus.Done).length;
    const window = buildSprintWindows(project, version)[version - 1];
    return {
        version,
        label: sprintLabel(version, project.settings.sprintNames),
        total: inSprint.length,
        done,
        inProgress: inSprint.filter(t => t.status === TaskStatus.InProgress).length,
        progressPct: Math.round((done / inSprint.length) * 100),
        start: window.start,
        end: window.end,
        daysLeft: Math.round((dayStart(window.end) - dayStart(now)) / DAY),
        laterTasks: tasks.filter(t => t.version > version && t.status !== TaskStatus.Done).length,
    };
};

export interface Deadline {
    task: Task;
    /** Termine kalan gün; negatifse gecikme */
    daysUntil: number;
}

/** Bitmemiş, terminli görevler; gecikenler başta, sonra en yakın termin */
export const upcomingDeadlines = (project: Project, now: Date = new Date(), limit = 5): { items: Deadline[]; total: number } => {
    const all = (project.tasks || [])
        .filter(t => t.status !== TaskStatus.Done && t.dueDate && !isNaN(new Date(t.dueDate).getTime()))
        .map(task => ({ task, daysUntil: Math.round((dayStart(new Date(task.dueDate!)) - dayStart(now)) / DAY) }))
        .sort((a, b) => a.daysUntil - b.daysUntil || a.task.name.localeCompare(b.task.name, 'tr'));
    return { items: all.slice(0, limit), total: all.length };
};

export const deadlineLabel = (daysUntil: number): string =>
    daysUntil < 0 ? `${-daysUntil} gün gecikti` : daysUntil === 0 ? 'Bugün' : daysUntil === 1 ? 'Yarın' : `${daysUntil} gün kaldı`;

export interface MemberLoad {
    name: string;
    open: number;
    inProgress: number;
    overdue: number;
    done: number;
}

/** Görev sahibine göre açık iş yükü; en yüklü başta. Atanmamış ayrı sayılır. */
export const teamLoad = (project: Project, now: Date = new Date()): { members: MemberLoad[]; unassigned: number } => {
    const byName = new Map<string, MemberLoad>();
    let unassigned = 0;
    (project.tasks || []).forEach(t => {
        const name = (t.resourceName || '').trim();
        if (!name) {
            if (t.status !== TaskStatus.Done) unassigned++;
            return;
        }
        const m = byName.get(name) || { name, open: 0, inProgress: 0, overdue: 0, done: 0 };
        if (t.status === TaskStatus.Done) m.done++;
        else {
            m.open++;
            if (t.status === TaskStatus.InProgress) m.inProgress++;
            if (daysLate(t, now) > 0) m.overdue++;
        }
        byName.set(name, m);
    });
    // Projede kaynak olarak tanımlı ama görevi olmayanlar da görünsün
    (project.resources || []).forEach(r => {
        const name = (r.name || '').trim();
        if (name && !byName.has(name)) byName.set(name, { name, open: 0, inProgress: 0, overdue: 0, done: 0 });
    });
    const members = [...byName.values()].sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.name.localeCompare(b.name, 'tr'));
    return { members, unassigned };
};

export interface ObjectiveProgress {
    id: string;
    name: string;
    quarter?: string;
    /** Bağlı görevlerden; bağlı görev yoksa null */
    progressPct: number | null;
    keyResults: number;
    linkedTasks: number;
}

/** Hedef ilerlemesi = anahtar sonuçlara bağlı görevlerin tamamlanma oranı (Hedefler ekranıyla aynı) */
export const objectiveProgress = (project: Project): ObjectiveProgress[] =>
    (project.objectives || []).map(o => {
        const krIds = new Set((o.keyResults || []).map(kr => kr.id));
        const linked = (project.tasks || []).filter(t => t.keyResultId && krIds.has(t.keyResultId));
        const done = linked.filter(t => t.status === TaskStatus.Done).length;
        return {
            id: o.id,
            name: o.name,
            quarter: o.quarter,
            progressPct: linked.length ? Math.round((done / linked.length) * 100) : null,
            keyResults: krIds.size,
            linkedTasks: linked.length,
        };
    });
