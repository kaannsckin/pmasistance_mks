import { Project, Task, TaskStatus } from '../types';
import { isInSprint, sprintSpanOf, sprintsOf } from './sprintSpan';
import { buildSprintWindows } from './taskToAllocation';
import { taskLoadDays } from './timelinePlan';

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const planned = (tasks: Task[]) => tasks.filter(t => t.includeInSprints !== false && (t.version || 0) > 0);

/** Bu değişiklikle son açık görevi biten sprintler (sprintler arası görev her sprintinde sayılır). */
export const newlyCompletedSprints = (before: Task[], after: Task[]): number[] => {
    const allDone = (tasks: Task[], sprint: number) => {
        const inSprint = planned(tasks).filter(t => isInSprint(t, sprint));
        return inSprint.length > 0 && inSprint.every(t => t.status === TaskStatus.Done);
    };
    // Yalnız bu değişiklikle biten görev sayılır: açık işin başka sprinte taşınması sprinti "bitirmez"
    const wasDone = new Set(before.filter(t => t.status === TaskStatus.Done).map(t => t.id));
    const finishedHere = (sprint: number) => planned(after).some(t => isInSprint(t, sprint) && t.status === TaskStatus.Done && !wasDone.has(t.id));
    const sprints = [...new Set(planned(after).flatMap(sprintsOf))].sort((a, b) => a - b);
    return sprints.filter(sprint => allDone(after, sprint) && planned(before).some(t => isInSprint(t, sprint)) && !allDone(before, sprint) && finishedHere(sprint));
};

export interface SprintCompletionSummary {
    sprint: number;
    taskCount: number;
    /** Tamamlanan efor (gün, PERT; sprintler arası görevin bu sprintteki payı) */
    effortDays: number;
    /** Geliştirme bitişine göre: eksi = erken, artı = geç (takvim günü); tarih bilinmiyorsa tanımsız */
    daysFromEnd?: number;
}

export const sprintCompletionSummary = (project: Project, sprint: number, now = new Date()): SprintCompletionSummary => {
    const tasks = planned(project.tasks).filter(t => isInSprint(t, sprint));
    const window = buildSprintWindows(project, sprint)[sprint - 1];
    return {
        sprint,
        taskCount: tasks.length,
        effortDays: Math.round(tasks.reduce((total, t) => total + taskLoadDays(t) / sprintSpanOf(t), 0) * 10) / 10,
        daysFromEnd: window ? Math.round((dayStart(now) - dayStart(window.end)) / DAY) : undefined,
    };
};
