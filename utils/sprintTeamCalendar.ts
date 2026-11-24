import { Leave, Person, Project, Resource, Task, TaskStatus } from '../types';
import { effectiveCapacity } from './availability';
import { isIsoDay, toIsoDay } from './calendarRange';
import { fullName } from './dataPool';
import { JiraIssueWorklog } from './integrations';
import { isUnassigned } from './planning/jiraPeople';
import { isHalfDay, isWorkday } from './planning/workdays';
import { plannedShare } from './resourcePlan';
import { SprintLane, taskLoadDays } from './timelinePlan';
import { sprintSpanOf } from './sprintSpan';
import { HOURS_PER_DAY, matchWorklogPerson } from './workforce';

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
    /** Görev kimliği → o gün için planlanan saat */
    byTask: Map<string, number>;
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
                cells: days.map(day => ({ hours: 0, capacity: capacityOf(day, resource, person, personLeaves), byComponent: new Map(), byTask: new Map() })) };
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
        // Sprintler arası devam eden görevin bu sprintteki payı
        const total = effortHours(task);
        const item = { task, hours: total === undefined ? undefined : total / sprintSpanOf(task), components: componentsOf(task) };
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
            cell.byTask.set(task.id, (cell.byTask.get(task.id) || 0) + hours);
            item.components.forEach(key => cell.byComponent.set(key, (cell.byComponent.get(key) || 0) + hours));
        }
    }

    return { days, rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
        components: [...components].sort((a, b) => a[1].localeCompare(b[1], 'tr')), unassigned };
};

export interface SprintWorklogIndex {
    /** Takvim satırı → gün (YYYY-AA-GG) → o gün girilen Jira çalışma kayıtları */
    byRow: Map<string, Map<string, JiraIssueWorklog[]>>;
    /** Takvimdeki bir kişiyle eşleşmeyen kayıt sayısı */
    unmatched: number;
}

/** Jira worklog'larını kişi (e-posta, yoksa ad) ve güne göre takvim satırlarına yerleştirir. */
export const indexSprintWorklogs = (rowKeys: Iterable<string>, entries: JiraIssueWorklog[], people: Person[]): SprintWorklogIndex => {
    const rows = new Set(rowKeys);
    const byRow = new Map<string, Map<string, JiraIssueWorklog[]>>();
    let unmatched = 0;
    for (const entry of entries) {
        const person = matchWorklogPerson(people, entry.author, entry.authorEmail);
        const key = keyOf(person ? fullName(person) : entry.author || '');
        if (!rows.has(key) || !isIsoDay(entry.date)) { unmatched++; continue; }
        const days = byRow.get(key) || new Map<string, JiraIssueWorklog[]>();
        days.set(entry.date, [...(days.get(entry.date) || []), entry]);
        byRow.set(key, days);
    }
    return { byRow, unmatched };
};

export interface SprintTaskSummary {
    task: Task;
    /** Tahmini efor (saat); tahmin yoksa tanımsız */
    estimate?: number;
    /** Gerçek başlangıç (ilk "Süreçte" geçişi) */
    startedAt?: string;
    /** Planın göreve saat ayırdığı ilk gün */
    plannedStart?: string;
    /** Sprint tarihlerinde bu kişinin göreve girdiği saat; Jira kayıtları yoksa tanımsız */
    logged?: number;
    lastLog?: string;
    /** Jira kalan süresi (saat) */
    remaining?: number;
}

/** Kişinin sprint görevleri: tahmin, başlangıç ve Jira çalışma kaydı özeti. */
export const summarizeSprintTasks = (row: Pick<SprintLoadPerson, 'key' | 'tasks' | 'cells'>, days: { day: string }[], worklogs?: SprintWorklogIndex): SprintTaskSummary[] => {
    const logs = worklogs ? [...(worklogs.byRow.get(row.key)?.values() || [])].flat() : undefined;
    return row.tasks.map(({ task, hours }) => {
        const firstPlanned = row.cells.findIndex(cell => (cell.byTask.get(task.id) || 0) > 0);
        const key = task.jiraId?.trim().toUpperCase();
        const own = logs && key ? logs.filter(entry => entry.issueKey.toUpperCase() === key) : [];
        const remaining = task.remainingEstimateHours;
        return {
            task,
            estimate: hours,
            startedAt: task.startedAt,
            plannedStart: firstPlanned >= 0 ? days[firstPlanned]?.day : undefined,
            logged: logs ? own.reduce((total, entry) => total + entry.hours, 0) : undefined,
            lastLog: own.reduce<string | undefined>((last, entry) => (!last || entry.date > last ? entry.date : last), undefined),
            remaining: remaining !== undefined && Number.isFinite(remaining) && remaining >= 0 ? remaining : undefined,
        };
    });
};

export type SprintPoolFit = 'fits' | 'late' | 'unknown';

export interface SprintPoolItem {
    task: Task;
    estimate?: number;
    fit: SprintPoolFit;
}

export interface SprintPool {
    /** Seçilen günden sprint geliştirme sonuna kadar kişinin kapasitesi (saat); bilinmiyorsa tanımsız */
    available?: number;
    /** O gün itibarıyla süren (başlamış, bitmemiş) işlerin kalan eforu (saat) */
    inProgress: number;
    /** Başlamamış görevler (havuz) */
    items: SprintPoolItem[];
    /** Süren görevler; `estimate` kalan efordur */
    started: SprintPoolItem[];
}

const PRIORITY_RANK: Record<Task['priority'], number> = { Blocker: 0, High: 1, Medium: 2, Low: 3 };
const dayOf = (iso?: string) => iso?.slice(0, 10);
/** ISO günleri düz karşılaştırır; tarihsiz sona düşer. */
const compareDay = (a?: string, b?: string) => (a === b ? 0 : !a ? 1 : !b ? -1 : a < b ? -1 : 1);

/**
 * Seçilen gün itibarıyla başlamamış sprint görevleri ve sprint sonuna yetişip
 * yetişmeyecekleri. Kalan kapasiteden önce süren işlerin kalanı düşülür;
 * başlamamış görevler öncelik, termin ve plan sırasıyla eklenir, kapasiteyi
 * aşanlar "late" olur. Kapasite ya da tahmin bilinmiyorsa "unknown".
 */
export const sprintTaskPool = (
    row: Pick<SprintLoadPerson, 'key' | 'tasks' | 'cells'>,
    days: Pick<SprintLoadDay, 'day' | 'kind'>[],
    dayIndex: number,
    worklogs?: SprintWorklogIndex,
): SprintPool => {
    const day = days[dayIndex]?.day || '';
    const logs = worklogs ? [...(worklogs.byRow.get(row.key)?.values() || [])].flat().filter(entry => entry.date <= day) : [];
    const loggedOn = (task: Task) => {
        const key = task.jiraId?.trim().toUpperCase();
        return key ? logs.filter(entry => entry.issueKey.toUpperCase() === key) : [];
    };
    const doneBy = (task: Task) => task.status === TaskStatus.Done && (!task.resolvedAt || dayOf(task.resolvedAt)! <= day);
    // Yaşam döngüsü tarihi yoksa güncel durum ve o güne kadarki kayıtlar esas alınır.
    const startedBy = (task: Task) => (task.startedAt ? dayOf(task.startedAt)! <= day : task.status !== TaskStatus.ToDo && task.status !== TaskStatus.Backlog) || loggedOn(task).length > 0;

    const workCells = row.cells.filter((_, i) => i >= dayIndex && days[i]?.kind === 'work');
    const available = workCells.every(cell => cell.capacity !== undefined) ? workCells.reduce((total, cell) => total + (cell.capacity || 0), 0) : undefined;

    type Entry = { task: Task; estimate?: number; plannedStart: number };
    const running: Entry[] = [];
    const pending: Entry[] = [];
    for (const { task, hours } of row.tasks) {
        if (doneBy(task)) continue;
        const first = row.cells.findIndex(cell => (cell.byTask.get(task.id) || 0) > 0);
        const plannedStart = first < 0 ? Number.MAX_SAFE_INTEGER : first;
        if (startedBy(task)) {
            const spent = loggedOn(task).reduce((total, entry) => total + entry.hours, 0);
            const remaining = task.remainingEstimateHours;
            running.push({ task, plannedStart, estimate: remaining !== undefined && Number.isFinite(remaining) && remaining >= 0 ? remaining : Math.max(0, (hours ?? 0) - spent) });
            continue;
        }
        pending.push({ task, estimate: hours, plannedStart });
    }
    const order = (a: Entry, b: Entry) => (PRIORITY_RANK[a.task.priority] ?? 2) - (PRIORITY_RANK[b.task.priority] ?? 2)
        || compareDay(a.task.dueDate, b.task.dueDate)
        || a.plannedStart - b.plannedStart
        || a.task.name.localeCompare(b.task.name, 'tr');
    running.sort(order);
    pending.sort(order);

    // Süren işler önce, ardından başlamamışlar sırayla kalan kapasiteye eklenir.
    let queued = 0;
    const place = ({ task, estimate }: Entry): SprintPoolItem => {
        if (available === undefined || estimate === undefined) return { task, estimate, fit: 'unknown' };
        queued += estimate;
        return { task, estimate, fit: queued <= available + 1e-6 ? 'fits' : 'late' };
    };
    const started = running.map(place);
    const inProgress = running.reduce((total, entry) => total + (entry.estimate ?? 0), 0);
    queued = inProgress;
    return { available, inProgress, items: pending.map(place), started };
};
