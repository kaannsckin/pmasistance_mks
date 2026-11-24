import { Project, Task, TaskStatus } from '../types';
import type { JiraIssueRecord } from './integrations';

export const secondsToHours = (value: number | null | undefined): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value / 3600 : undefined;

/** Alanı göndermeyen eski proxy ile Jira'nın boş değerini birbirinden ayırır. */
export const jiraTimeFields = (issue: JiraIssueRecord, at?: string): Partial<Task> => ({
    originalEstimateHours: secondsToHours(issue.originalEstimateSeconds),
    actualHours: secondsToHours(issue.timeSpentSeconds),
    ...(issue.remainingEstimateSeconds !== undefined ? { remainingEstimateHours: secondsToHours(issue.remainingEstimateSeconds) } : {}),
    ...(issue.aggregateOriginalEstimateSeconds !== undefined ? { aggregateOriginalEstimateHours: secondsToHours(issue.aggregateOriginalEstimateSeconds) } : {}),
    ...(issue.aggregateRemainingEstimateSeconds !== undefined ? { aggregateRemainingHours: secondsToHours(issue.aggregateRemainingEstimateSeconds) } : {}),
    ...(issue.aggregateTimeSpentSeconds !== undefined ? { aggregateSpentHours: secondsToHours(issue.aggregateTimeSpentSeconds) } : {}),
    ...(issue.subtaskKeys !== undefined ? { jiraParentKey: issue.parentKey, jiraSubtaskKeys: issue.subtaskKeys.length ? issue.subtaskKeys : undefined } : {}),
    ...(at && issue.remainingEstimateSeconds !== undefined ? { timeTrackingAt: at } : {}),
});

export const taskTimeTracking = (task: Task) => {
    const original = task.originalEstimateHours;
    const spent = task.actualHours;
    const remaining = task.remainingEstimateHours;
    const eac = spent !== undefined && remaining !== undefined ? spent + remaining : undefined;
    const variance = eac !== undefined && original !== undefined ? eac - original : undefined;
    return {
        original, spent, remaining, eac, variance,
        progress: eac && spent !== undefined ? spent / eac : undefined,
        variancePct: variance !== undefined && original ? variance / original * 100 : undefined,
        overrun: (spent !== undefined && original !== undefined && spent > original)
            || (remaining === 0 && task.status !== TaskStatus.Done),
    };
};

/** Alt görevler zaten ayrı satır olduğundan toplamda kayıt düzeyindeki saatler kullanılır. */
export const totalTimeTracking = (tasks: Task[]) => {
    const totals = { original: 0, spent: 0, remaining: 0, eac: 0, comparableOriginal: 0, comparableEac: 0, comparable: 0, tracked: 0 };
    for (const task of tasks) {
        const m = taskTimeTracking(task);
        totals.original += m.original ?? 0;
        totals.spent += m.spent ?? 0;
        totals.remaining += m.remaining ?? 0;
        totals.eac += m.eac ?? 0;
        if ([m.original, m.spent, m.remaining].some(value => value !== undefined)) totals.tracked++;
        if (m.original !== undefined && m.eac !== undefined) {
            totals.comparable++;
            totals.comparableOriginal += m.original;
            totals.comparableEac += m.eac;
        }
    }
    return totals;
};

export type TimeTrackingGroup = 'project' | 'release' | 'component' | 'person';

export const groupTimeTracking = (projects: Project[], dimension: TimeTrackingGroup) => {
    const groups = new Map<string, { label: string; tasks: Task[] }>();
    projects.forEach(project => project.tasks.forEach(task => {
        // Çok bileşenli kayıt bir kez sayılır, birincil bileşen listedeki ilk bileşendir.
        const label = dimension === 'project' ? project.name : dimension === 'release' ? task.fixVersion || 'Sürüm yok'
            : dimension === 'component' ? task.components?.[0] || 'Bileşen yok' : task.resourceName || 'Atanmadı';
        const key = dimension === 'project' ? project.id : label;
        const group = groups.get(key) || { label, tasks: [] };
        group.tasks.push(task);
        groups.set(key, group);
    }));
    return [...groups].map(([key, group]) => ({ key, label: group.label, ...totalTimeTracking(group.tasks) }));
};
