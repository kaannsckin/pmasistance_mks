import { Task } from '../types';

/** Bir görevin yer alabileceği en çok ardışık sprint */
export const MAX_SPRINT_SPAN = 4;

/**
 * Görevin sürdüğü ardışık sprint sayısı. Görev `version` sprintinde başlar ve
 * sonraki sprintlerde devam eder; havuzdaki görevde her zaman 1.
 */
export const sprintSpanOf = (task: Pick<Task, 'version' | 'sprintSpan'>): number =>
    (task.version || 0) > 0 ? requestedSprintSpan(task) : 1;

/** Görevde istenen sprint sayısı (havuzdayken de; otomatik plan bunu kullanır) */
export const requestedSprintSpan = (task: Pick<Task, 'sprintSpan'>): number =>
    Math.max(1, Math.min(MAX_SPRINT_SPAN, Math.floor(Number(task.sprintSpan) || 1)));

/** Görevin son sprinti (havuzda 0) */
export const lastSprintOf = (task: Pick<Task, 'version' | 'sprintSpan'>): number =>
    (task.version || 0) > 0 ? task.version + sprintSpanOf(task) - 1 : 0;

/** Görev bu sprintte yer alıyor mu? 0 = Havuz */
export const isInSprint = (task: Pick<Task, 'version' | 'sprintSpan'>, sprint: number): boolean => {
    const start = task.version || 0;
    return sprint === 0 ? start === 0 : start > 0 && sprint >= start && sprint <= lastSprintOf(task);
};

/** Görevin bulunduğu sprintler (havuzda [0]) */
export const sprintsOf = (task: Pick<Task, 'version' | 'sprintSpan'>): number[] => {
    const start = task.version || 0;
    return start > 0 ? Array.from({ length: sprintSpanOf(task) }, (_, i) => start + i) : [0];
};
