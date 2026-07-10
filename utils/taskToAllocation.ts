import { Project, WorkspaceData } from '../types';
import { calculatePertFuzzyPert } from './timeline';
import { createAllocationId, MONTH_INDEXES } from './allocations';

/**
 * Görev planı → Tahsis köprüsü.
 *
 * Projenin sprint planındaki görev eforlarını (PERT süresi / katılım oranı)
 * sprint takvimine yayıp kişi × ay bazında AA önerisine çevirir. PM aynı
 * bilgiyi ikinci kez elle girmek zorunda kalmaz; öneri tahsis tablosuna
 * "boş ayları doldur" ya da "üzerine yaz" modlarıyla uygulanır.
 *
 * Takvim, Kanban panosuyla aynı kurallarla ilerler: sprint = hafta × 5 iş
 * günü, ardından test dönemi, sonraki sprint testin bitiminden sonra başlar.
 * 1 AA = 21 iş günü varsayılır.
 */

export const AA_WORKDAYS_PER_MONTH = 21;

const isWorkday = (d: Date): boolean => d.getDay() !== 0 && d.getDay() !== 6;

const getFirstWorkday = (date: Date): Date => {
    const d = new Date(date);
    while (!isWorkday(d)) d.setDate(d.getDate() + 1);
    return d;
};

/** KanbanView ile birebir aynı: 'days' iş günü kaplayan aralığın SON günü */
const addWorkdays = (date: Date, days: number): Date => {
    const d = new Date(date);
    let toAdd = Math.round(days) - 1;
    if (toAdd < 0) return d;
    let added = 0;
    while (added < toAdd) {
        d.setDate(d.getDate() + 1);
        if (isWorkday(d)) added++;
    }
    return d;
};

const getNextWorkday = (date: Date): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    while (!isWorkday(d)) d.setDate(d.getDate() + 1);
    return d;
};

interface SprintWindow {
    sprint: number;
    start: Date;
    end: Date; // iş bitişi (test hariç)
    /** "yıl-ay" → penceredeki iş günü sayısı */
    workdaysByMonth: Map<string, number>;
    totalWorkdays: number;
}

const buildSprintWindows = (project: Project, maxSprint: number): SprintWindow[] => {
    const weeks = project.settings.sprintDuration || 3;
    const testDays = project.settings.globalTestDays || 4;
    const parts = (project.settings.projectStartDate || new Date().toISOString().split('T')[0]).split('-').map(Number);
    let cursor = getFirstWorkday(new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1));

    const windows: SprintWindow[] = [];
    for (let s = 1; s <= maxSprint; s++) {
        const start = new Date(cursor);
        const end = addWorkdays(start, weeks * 5);
        const workdaysByMonth = new Map<string, number>();
        let total = 0;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (!isWorkday(d)) continue;
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            workdaysByMonth.set(key, (workdaysByMonth.get(key) || 0) + 1);
            total++;
        }
        windows.push({ sprint: s, start, end, workdaysByMonth, totalWorkdays: total });
        const testStart = getNextWorkday(end);
        const testEnd = addWorkdays(testStart, testDays);
        cursor = getNextWorkday(testEnd);
    }
    return windows;
};

export interface AllocationSuggestion {
    resourceName: string;
    personId?: string; // havuzda eşleşen kişi
    personLabel: string;
    months: Record<number, number>; // 1-12 → önerilen AA (yalnızca hedef yıl)
    totalAA: number;
    matched: boolean;
}

export interface SuggestionResult {
    suggestions: AllocationSuggestion[];
    unmatched: string[]; // havuzda bulunamayan kaynak adları
    clippedOutsideYear: boolean; // plan hedef yılın dışına taştı mı
    sprintCount: number;
    taskCount: number;
}

const trKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');

export const suggestAllocationsFromTasks = (
    project: Project,
    people: WorkspaceData['people'],
    year: number
): SuggestionResult => {
    const tasks = project.tasks.filter(t => (t.version || 0) > 0 && t.includeInSprints !== false);
    const maxSprint = Math.max(0, ...tasks.map(t => t.version || 0));
    const empty: SuggestionResult = { suggestions: [], unmatched: [], clippedOutsideYear: false, sprintCount: maxSprint, taskCount: tasks.length };
    if (!tasks.length || maxSprint === 0) return empty;

    const windows = buildSprintWindows(project, maxSprint);
    const participationByResource = new Map(project.resources.map(r => [trKey(r.name), (r.participation || 100) / 100]));
    const personByName = new Map(people.map(p => [trKey(`${p.firstName} ${p.lastName}`), p]));

    // kaynak adı → ay → gün
    const daysByResource = new Map<string, Map<number, number>>();
    let clipped = false;

    tasks.forEach(task => {
        const win = windows[task.version - 1];
        if (!win || win.totalWorkdays === 0) return;
        const { pert } = calculatePertFuzzyPert(task.time);
        if (pert <= 0) return;
        const participation = participationByResource.get(trKey(task.resourceName || '')) ?? 1;
        const effectiveDays = participation > 0 ? pert / participation : pert;
        const resource = (task.resourceName || 'Atanmamış').trim() || 'Atanmamış';
        if (!daysByResource.has(resource)) daysByResource.set(resource, new Map());
        const monthMap = daysByResource.get(resource)!;
        win.workdaysByMonth.forEach((count, key) => {
            const [y, m] = key.split('-').map(Number);
            const share = effectiveDays * (count / win.totalWorkdays);
            if (y !== year) {
                clipped = true;
                return;
            }
            monthMap.set(m, (monthMap.get(m) || 0) + share);
        });
    });

    const suggestions: AllocationSuggestion[] = [];
    const unmatched: string[] = [];
    daysByResource.forEach((monthMap, resourceName) => {
        const months: Record<number, number> = {};
        let totalAA = 0;
        MONTH_INDEXES.forEach(m => {
            const days = monthMap.get(m) || 0;
            if (days > 0) {
                const aa = Math.round((days / AA_WORKDAYS_PER_MONTH) * 100) / 100;
                if (aa > 0) {
                    months[m] = aa;
                    totalAA += aa;
                }
            }
        });
        if (totalAA === 0) return;
        const person = personByName.get(trKey(resourceName));
        if (!person) unmatched.push(resourceName);
        suggestions.push({
            resourceName,
            personId: person?.id,
            personLabel: person ? `${person.firstName} ${person.lastName}` : resourceName,
            months,
            totalAA: Math.round(totalAA * 100) / 100,
            matched: !!person,
        });
    });

    suggestions.sort((a, b) => a.personLabel.localeCompare(b.personLabel, 'tr'));
    return { suggestions, unmatched, clippedOutsideYear: clipped, sprintCount: maxSprint, taskCount: tasks.length };
};

export type ApplyMode = 'fill' | 'overwrite';

/**
 * Önerileri çalışma alanına uygular (yalnızca eşleşen kişiler).
 *  - fill: yalnızca boş (0/undefined) plan aylarını doldurur
 *  - overwrite: öneri olan ayları önerilen değerle değiştirir
 * Satır anahtarı: kişi × proje × yıl (İP'siz, rolsüz köprü satırı).
 */
export const applyAllocationSuggestions = (
    ws: WorkspaceData,
    projectId: string,
    year: number,
    suggestions: AllocationSuggestion[],
    mode: ApplyMode
): { workspace: WorkspaceData; applied: number; skippedCells: number } => {
    const allocations = ws.allocations.map(a => ({ ...a, plan: { ...a.plan }, actual: { ...a.actual } }));
    let applied = 0;
    let skippedCells = 0;

    suggestions.filter(s => s.matched && s.personId).forEach(s => {
        let row = allocations.find(a =>
            a.personId === s.personId && a.projectId === projectId && a.year === year &&
            !a.workPackageId && !a.role
        );
        if (!row) {
            row = { id: createAllocationId(), personId: s.personId!, projectId, year, plan: {}, actual: {} };
            allocations.push(row);
        }
        Object.entries(s.months).forEach(([mStr, aa]) => {
            const m = Number(mStr);
            const existing = row!.plan[m] || 0;
            if (mode === 'fill' && existing > 0) {
                skippedCells++;
                return;
            }
            row!.plan[m] = aa;
        });
        applied++;
    });

    return { workspace: { ...ws, allocations }, applied, skippedCells };
};
