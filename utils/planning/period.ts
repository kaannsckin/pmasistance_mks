import { Project, Task, TaskStatus } from '../../types';
import { DayRange, parseIsoDay, toIsoDay } from '../calendarRange';
import { buildSprintWindows } from '../taskToAllocation';

export const canPlanSprintTask = (task: Task): boolean => task.status !== TaskStatus.Done && task.includeInSprints !== false;

export const moveSprintTasks = (tasks: Task[], ids: ReadonlySet<string>, sprint: number): Task[] => {
    if (!Number.isSafeInteger(sprint) || sprint < 0 || !tasks.some(t => ids.has(t.id) && canPlanSprintTask(t) && (t.version || 0) !== sprint)) return tasks;
    return tasks.map(t => ids.has(t.id) && canPlanSprintTask(t) && (t.version || 0) !== sprint ? { ...t, version: sprint } : t);
};

/** Tarih aralığına değen sprintleri, test günlerini de kapsayacak biçimde bulur. */
export const sprintsInPeriod = (project: Project, period: DayRange): number[] => {
    const start = parseIsoDay(project.settings.projectStartDate) || new Date();
    const end = parseIsoDay(period.end);
    if (!end || end < start) return [];
    const count = Math.ceil((end.getTime() - start.getTime()) / (Math.max(1, project.settings.sprintDuration || 3) * 7 * 86_400_000)) + 2;
    return buildSprintWindows(project, count)
        .filter(window => toIsoDay(window.start) <= period.end && toIsoDay(window.testEnd) >= period.start)
        .map(window => window.sprint);
};

export const periodTaskQuery = (sprints: number[], period: DayRange): string => {
    const due = `termin >= ${period.start} AND termin <= ${period.end}`;
    return sprints.length ? `sprint IN (${sprints.join(', ')}) OR (${due})` : due;
};
