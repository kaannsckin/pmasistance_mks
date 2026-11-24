import { addDays, parseIsoDay } from './calendarRange';
import { isHalfDay, isWorkday } from './planning/workdays';

export interface JiraHistoryItem {
    field: string;
    fieldId?: string;
    from: string | null;
    fromString: string | null;
    to: string | null;
    toString: string | null;
}

export interface JiraHistoryEntry {
    id: string;
    at: string;
    author: string;
    authorEmail?: string;
    items: JiraHistoryItem[];
}

export interface JiraHistorySummary {
    reopenCount: number;
    assigneeChanges: number;
    estimateChanges: number;
    dueDateShifts: number;
    sprintChanges: number;
    timeInStatus: Record<string, number>;
    at: string;
    partial?: boolean;
}

export const JIRA_WORK_TIME_ZONE = 'Europe/Istanbul';
const dayFormats = new Map<string, Intl.DateTimeFormat>();

export const jiraLocalDay = (timestamp: string | number, timeZone = JIRA_WORK_TIME_ZONE): string | undefined => {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return undefined;
    let format = dayFormats.get(timeZone);
    if (!format) {
        format = new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
        dayFormats.set(timeZone, format);
    }
    return format.format(date);
};

const istanbulClock = new Intl.DateTimeFormat('en-GB', { timeZone: JIRA_WORK_TIME_ZONE, timeZoneName: 'longOffset' });
const businessDays = new Map<string, { start: number; end: number } | null>();
const businessDay = (day: string) => {
    const cached = businessDays.get(day);
    if (cached !== undefined) return cached;
    if (businessDays.size >= 12000) businessDays.clear();
    const date = parseIsoDay(day)!;
    if (!isWorkday(date)) {
        businessDays.set(day, null);
        return null;
    }
    // Çalışma saatlerinde saat dilimi geçişi olmadığından öğlenin ofseti yeterli.
    const offset = istanbulClock.formatToParts(new Date(day + 'T12:00:00Z'))
        .find(part => part.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00';
    const start = Date.parse(day + 'T09:00:00' + offset);
    const end = Date.parse(day + (isHalfDay(date) ? 'T13:00:00' : 'T17:00:00') + offset);
    const work = { start, end };
    businessDays.set(day, work);
    return work;
};

export const jiraBusinessHours = (start: string, end: string): number => {
    const from = Date.parse(start), to = Date.parse(end);
    if (!(to > from)) return 0;
    let day = jiraLocalDay(from)!;
    const last = jiraLocalDay(to)!;
    let hours = 0;
    for (; day <= last; day = addDays(day, 1)) {
        const work = businessDay(day);
        if (!work) continue;
        hours += Math.max(0, Math.min(to, work.end) - Math.max(from, work.start)) / 3_600_000;
    }
    return hours;
};

export const jiraHistoryField = (item: JiraHistoryItem): string => {
    const field = item.field.toLowerCase().trim().replace(/[ _-]/g, '');
    const id = item.fieldId?.toLowerCase();
    if (field === 'sprint') return 'sprint';
    if (field === 'duedate' || id === 'duedate') return 'due';
    if (['timeoriginalestimate', 'originalestimate'].includes(field) || id === 'timeoriginalestimate') return 'original';
    if (['timeestimate', 'remainingestimate'].includes(field) || id === 'timeestimate') return 'remaining';
    return id?.startsWith('customfield_') ? field : id || field;
};

export const summarizeJiraHistory = (
    entries: JiraHistoryEntry[],
    options: { created: string | null; resolved: string | null; current: string; at: string; isClosed: (id: string | null, value: string | null) => boolean; partial?: boolean },
): JiraHistorySummary => {
    const summary: JiraHistorySummary = {
        reopenCount: 0, assigneeChanges: 0, estimateChanges: 0, dueDateShifts: 0, sprintChanges: 0,
        timeInStatus: {}, at: options.at, ...(options.partial ? { partial: true } : {}),
    };
    const time = new Map<string, number>();
    const events = [...entries].sort((a, b) => a.at.localeCompare(b.at));
    const statusEvents = events.flatMap(entry => entry.items
        .filter(item => jiraHistoryField(item) === 'status').map(item => ({ at: entry.at, item })));
    let previous = options.partial ? statusEvents[0]?.at : options.created || statusEvents[0]?.at;
    let status = statusEvents[0]?.item.fromString || options.current;
    const addTime = (until: string) => {
        if (status && previous) time.set(status, (time.get(status) || 0) + jiraBusinessHours(previous, until));
        previous = until;
    };
    for (const { at, item } of statusEvents) {
        addTime(at);
        if (options.isClosed(item.from, item.fromString) && !options.isClosed(item.to, item.toString)) summary.reopenCount++;
        status = item.toString || item.to || options.current;
    }
    const end = options.resolved || options.at;
    if (!previous || end > previous) addTime(end);
    summary.timeInStatus = Object.fromEntries([...time].map(([status, hours]) => [status, Math.round(hours * 100) / 100]));
    for (const entry of events) {
        const fields = new Set(entry.items.map(jiraHistoryField));
        if (fields.has('assignee')) summary.assigneeChanges++;
        if (fields.has('original') || fields.has('remaining')) summary.estimateChanges++;
        if (fields.has('due')) summary.dueDateShifts++;
        if (fields.has('sprint')) summary.sprintChanges++;
    }
    return summary;
};
