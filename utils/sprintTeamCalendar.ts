import { Leave, Person, Project, Resource, Task, TaskStatus } from '../types';
import { effectiveCapacity } from './availability';
import { isIsoDay, toIsoDay } from './calendarRange';
import { fullName } from './dataPool';
import { isUnassigned } from './planning/jiraPeople';
import { isHalfDay, isWorkday } from './planning/workdays';
import { plannedShare } from './resourcePlan';
import { SprintLane, taskLoadDays } from './timelinePlan';
import { HOURS_PER_DAY } from './workforce';

const keyOf = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
const componentKey = (name: string) => `component:${keyOf(name)}`;
const NO_COMPONENT = 'no-component';

interface SprintLoadDay {
    date: Date;
    day: string;
    kind: 'work' | 'test' | 'off';
    workShare: number;
}

interface SprintLoadTask {
    task: Task;
    hours?: number;
    components: string[];
}

export interface SprintLoadCell {
    hours: number;
    capacity?: number;
    byComponent: Map<string, number>;
}

interface SprintLoadPerson {
    key: string;
    name: string;
    components: Set<string>;
    tasks: SprintLoadTask[];
    cells: SprintLoadCell[];
}

const capacityOf = (day: SprintLoadDay, resource: Resource | undefined, person: Person | undefined, leaves: Leave[]): number | undefined => {
    if (day.kind !== 'work') return 0;
    if (!resource && !person) return undefined;
    const month = day.date.getMonth();
    const base = person?.availableAA ?? 1;
    const share = Math.max(0, Math.min(1, resource ? plannedShare(resource, month) : base));
    const effective = person ? effectiveCapacity(person, leaves, day.date.getFullYear(), month + 1) : 1;
    const proportion = base > 0 ? Math.min(share, base) * (effective / base) : 0;
    return proportion * day.workShare * HOURS_PER_DAY;
};

const effortHours = (task: Task): number | undefined => {
    const days = task.time ? taskLoadDays(task) : 0;
    if (Number.isFinite(days) && days > 0) return days * HOURS_PER_DAY;
    const original = task.originalEstimateHours;
    return original !== undefined && Number.isFinite(original) && original >= 0 ? original : undefined;
};

/** Sprintteki tahmini efor, varsa termine kadar çalışılabilir günlere paylaştırılır. */
export const buildSprintTeamCalendar = (project: Project, lane: SprintLane, people: Person[], leaves: Leave[]) => {
    const days: SprintLoadDay[] = [];
    const end = lane.end;
    if (lane.start && end) {
        for (const date = new Date(lane.start); date <= (lane.testEnd || end); date.setDate(date.getDate() + 1)) {
            const workday = isWorkday(date);
            const kind = !workday ? 'off' : date <= end ? 'work' : 'test';
            days.push({ date: new Date(date), day: toIsoDay(date), kind, workShare: kind === 'work' ? (isHalfDay(date) ? 0.5 : 1) : 0 });
        }
    }
    const workdays = days.flatMap((day, index) => day.workShare ? [{ ...day, index }] : []);
    const components = new Map((project.components || []).map(component => [componentKey(component.name), component.name]));
    const resources = new Map(project.resources.map(resource => [keyOf(resource.name), resource]));
    const peopleByName = new Map(people.map(person => [keyOf(fullName(person)), person]));
    const rows = new Map<string, SprintLoadPerson>();
    const unassigned: SprintLoadTask[] = [];

    const personRow = (name: string): SprintLoadPerson => {
        const key = keyOf(name);
        let row = rows.get(key);
        if (!row) {
            const person = peopleByName.get(key);
            const resource = resources.get(key);
            const personLeaves = person ? leaves.filter(leave => leave.personId === person.id) : [];
            row = { key, name: person ? fullName(person) : name.trim(), components: new Set(), tasks: [],
                cells: days.map(day => ({ hours: 0, capacity: capacityOf(day, resource, person, personLeaves), byComponent: new Map() })) };
            rows.set(key, row);
        }
        return row;
    };
    const componentsOf = (task: Task): string[] => {
        const names = (task.components || []).filter(name => name.trim());
        if (!names.length) {
            components.set(NO_COMPONENT, 'Bileşensiz');
            return [NO_COMPONENT];
        }
        return [...new Set(names.map(name => {
            const key = componentKey(name);
            if (!components.has(key)) components.set(key, name.trim());
            return key;
        }))];
    };

    project.resources.forEach(resource => { if (!isUnassigned(resource.name)) personRow(resource.name); });
    for (const component of project.components || []) {
        if (component.lead && !isUnassigned(component.lead)) personRow(component.lead).components.add(componentKey(component.name));
    }
    // Açık proje kayıtlarındaki atamalar, sprintte yükü olmayan ekip üyelerini de gösterir.
    for (const task of project.tasks) {
        if (task.status === TaskStatus.Done || task.includeInSprints === false) continue;
        const keys = componentsOf(task);
        if (!isUnassigned(task.resourceName)) keys.forEach(key => personRow(task.resourceName).components.add(key));
    }

    for (const task of lane.tasks) {
        const item = { task, hours: effortHours(task), components: componentsOf(task) };
        if (isUnassigned(task.resourceName)) { unassigned.push(item); continue; }
        const row = personRow(task.resourceName);
        item.components.forEach(key => row.components.add(key));
        row.tasks.push(item);
        if (!item.hours || !workdays.length) continue;
        const due = task.dueDate?.slice(0, 10);
        const beforeDue = isIsoDay(due) ? workdays.filter(day => day.day <= due) : workdays;
        const activeDays = beforeDue.length ? beforeDue : workdays.slice(0, 1);
        const totalShare = activeDays.reduce((sum, day) => sum + day.workShare, 0);
        for (const day of activeDays) {
            const hours = item.hours * (day.workShare / totalShare);
            const cell = row.cells[day.index];
            cell.hours += hours;
            item.components.forEach(key => cell.byComponent.set(key, (cell.byComponent.get(key) || 0) + hours));
        }
    }

    return { days, rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
        components: [...components].sort((a, b) => a[1].localeCompare(b[1], 'tr')), unassigned };
};
