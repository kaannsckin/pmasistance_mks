import { Project, Task, TaskStatus } from '../../types';
import { calculatePertFuzzyPert } from '../timeline';
import { isUnassigned } from './jiraPeople';

/**
 * Otomatik sprint planından önce, planı yanıltacak eksik görev bilgisini bulur.
 * Planlayıcı süresi 0 olan görevi yük getirmeden yerleştirir, sorumlusu olmayanları
 * tek bir "Atanmamış" kuyruğunda toplar ve ekipte tanımlı olmayan kişiyi %100
 * katılımla varsayar; bunlar sessizce yanlış bir plan üretir.
 */
export type PlanReadinessIssue = 'noDuration' | 'noComponent' | 'noAssignee' | 'notInTeam';

export const PLAN_READINESS_LABELS: Record<PlanReadinessIssue, string> = {
    noDuration: 'Süresi 0',
    noComponent: 'Bileşeni yok',
    noAssignee: 'Sorumlusu (ekibi) yok',
    notInTeam: 'Sorumlu proje ekibinde değil',
};

export const PLAN_READINESS_HINTS: Record<PlanReadinessIssue, string> = {
    noDuration: 'Kapasite tüketmeden ilk sprinte yerleşir.',
    noComponent: 'Bileşen bazlı ekip yükünde "Bileşensiz" görünür.',
    noAssignee: 'Tüm atanmamış işler tek bir kişinin kapasitesine yazılır.',
    notInTeam: 'Katılım oranı bilinmediği için %100 varsayılır.',
};

export interface PlanReadinessRow {
    task: Task;
    issues: PlanReadinessIssue[];
}

export interface PlanReadiness {
    rows: PlanReadinessRow[];
    counts: Record<PlanReadinessIssue, number>;
}

// Türkçe küçültmede "API" → "apı" olur; ı/i farkı eşleşmeyi bozmasın.
const keyOf = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');

export const taskDurationDays = (task: Task): number => {
    if (!task.time) return 0;
    const { pert } = calculatePertFuzzyPert(task.time);
    return Number.isFinite(pert) && pert > 0 ? pert : 0;
};

export const isPlannableTask = (task: Task): boolean => task.includeInSprints !== false && task.status !== TaskStatus.Done;

export const checkPlanReadiness = (project: Pick<Project, 'tasks' | 'resources' | 'components'>): PlanReadiness => {
    const team = new Set(project.resources.filter(r => !isUnassigned(r.name)).map(r => keyOf(r.name)));
    // Projede bileşen listesi yoksa her görevi "bileşensiz" saymak gürültü olur.
    const usesComponents = (project.components || []).length > 0;
    const counts: Record<PlanReadinessIssue, number> = { noDuration: 0, noComponent: 0, noAssignee: 0, notInTeam: 0 };
    const rows: PlanReadinessRow[] = [];
    for (const task of project.tasks) {
        if (!isPlannableTask(task)) continue;
        const issues: PlanReadinessIssue[] = [];
        if (taskDurationDays(task) === 0) issues.push('noDuration');
        if (usesComponents && !(task.components || []).some(name => name.trim())) issues.push('noComponent');
        if (isUnassigned(task.resourceName)) issues.push('noAssignee');
        else if (!team.has(keyOf(task.resourceName))) issues.push('notInTeam');
        if (!issues.length) continue;
        issues.forEach(issue => { counts[issue]++; });
        rows.push({ task, issues });
    }
    return { rows, counts };
};

export interface PlanReadinessEdit {
    /** Tahmini iş günü; en iyi, ortalama ve en kötü tahmin bu değere eşitlenir. */
    days?: number;
    component?: string;
    resourceName?: string;
}

export const applyPlanReadinessEdit = (task: Task, edit: PlanReadinessEdit, project: Pick<Project, 'resources'>): Task => {
    let next = task;
    if (edit.days !== undefined && Number.isFinite(edit.days) && edit.days > 0 && edit.days !== taskDurationDays(task)) {
        next = { ...next, time: { best: edit.days, avg: edit.days, worst: edit.days }, estimateSource: 'user' };
    }
    const component = edit.component?.trim();
    if (component && !(task.components || []).some(name => keyOf(name) === keyOf(component))) {
        next = { ...next, components: [...(task.components || []).filter(name => name.trim()), component] };
    }
    const assignee = edit.resourceName?.trim();
    if (assignee && keyOf(assignee) !== keyOf(task.resourceName || '')) {
        const resource = project.resources.find(r => keyOf(r.name) === keyOf(assignee));
        next = { ...next, resourceName: resource?.name ?? assignee, unit: resource?.unit || task.unit };
    }
    return next;
};
