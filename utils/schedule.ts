import { Person, WorkspaceData } from '../types';
import { MONTH_INDEXES, personMonthTotal } from './allocations';
import { effectiveCapacity, monthlyEffectiveCapacity, personYearLeaveMonths } from './availability';

/**
 * Takvim / zaman çizelgesi — aylık (bizim AA modeline uygun; günlük değil).
 * Seçmeli kapsam: Takvimim / Ekip / Proje / İş Paketi. Tahsis (AA) + görev
 * (termine göre) + izin tek çizelgede. MS Project'in kaynak zaman çizelgesinin
 * aylık, sade karşılığı.
 */

export type ScheduleScope = 'me' | 'team' | 'project' | 'workpackage';

export interface SchedCell {
    aa: number;
    tasks: number;
    leave: number;
    over: boolean;
}

export interface SchedRow {
    id: string;
    label: string;
    sublabel?: string;
    cells: SchedCell[]; // 12
    total: number; // aa toplamı (aa metriği) ya da görev toplamı (tasks metriği)
}

export interface Schedule {
    metric: 'aa' | 'tasks';
    rows: SchedRow[];
    monthlyCapacity?: number[]; // Takvimim: efektif kapasite
    monthlyLeave?: number[]; // Takvimim: aylık izin
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const emptyCells = (): SchedCell[] => MONTH_INDEXES.map(() => ({ aa: 0, tasks: 0, leave: 0, over: false }));
const trKey = (s: string): string => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
const fullName = (p: Person): string => `${p.firstName} ${p.lastName}`.trim();

/** Görevin bu yıldaki termin ayı (1-12); tarih yok/başka yıl → 0 */
export const taskDueMonth = (dueDate: string | undefined, year: number): number => {
    if (!dueDate) return 0;
    const d = new Date(dueDate);
    if (isNaN(d.getTime()) || d.getFullYear() !== year) return 0;
    return d.getMonth() + 1;
};

/** Takvimim — bir kişinin projeleri (aylık AA) + görev terminleri + izin/kapasite */
export const buildMySchedule = (ws: WorkspaceData, personId: string, year: number): Schedule => {
    const person = ws.people.find(p => p.id === personId);
    if (!person) return { metric: 'aa', rows: [] };
    const nameKey = trKey(fullName(person));
    const leaves = ws.leaves || [];
    const rows = new Map<string, SchedRow>();
    const ensure = (id: string, label: string): SchedRow => {
        if (!rows.has(id)) rows.set(id, { id, label, cells: emptyCells(), total: 0 });
        return rows.get(id)!;
    };

    ws.allocations.filter(a => a.personId === personId && a.year === year).forEach(a => {
        const proj = ws.projects.find(p => p.id === a.projectId);
        const row = ensure(a.projectId, proj?.name || 'Bilinmeyen Proje');
        MONTH_INDEXES.forEach(m => {
            const v = a.plan[m] || 0;
            row.cells[m - 1].aa = round2(row.cells[m - 1].aa + v);
            row.total = round2(row.total + v);
        });
    });
    ws.projects.forEach(p => p.tasks.forEach(t => {
        if (trKey(t.resourceName || '') !== nameKey) return;
        const m = taskDueMonth(t.dueDate, year);
        if (!m) return;
        ensure(p.id, p.name).cells[m - 1].tasks++;
    }));

    return {
        metric: 'aa',
        rows: Array.from(rows.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'tr')),
        monthlyCapacity: monthlyEffectiveCapacity(person, leaves, year),
        monthlyLeave: personYearLeaveMonths(leaves, personId, year),
    };
};

/** Ekip — kişiler; aylık toplam AA + izin + aşırı yük + termine göre görev sayısı */
export const buildTeamSchedule = (ws: WorkspaceData, personIds: string[], year: number): Schedule => {
    const set = new Set(personIds);
    const leaves = ws.leaves || [];
    const rows = ws.people.filter(p => set.has(p.id)).map(person => {
        const cells = emptyCells();
        let total = 0;
        MONTH_INDEXES.forEach(m => {
            const load = personMonthTotal(ws.allocations, person.id, year, m, 'plan');
            const cap = effectiveCapacity(person, leaves, year, m);
            cells[m - 1] = { aa: round2(load), tasks: 0, leave: round2(Math.max(0, (person.availableAA ?? 1) - cap)), over: load > cap + 1e-9 };
            total += load;
        });
        const nameKey = trKey(fullName(person));
        ws.projects.forEach(p => p.tasks.forEach(t => {
            if (trKey(t.resourceName || '') !== nameKey) return;
            const m = taskDueMonth(t.dueDate, year);
            if (m) cells[m - 1].tasks++;
        }));
        return { id: person.id, label: fullName(person), sublabel: person.departmentCode || 'Tanımsız', cells, total: round2(total) };
    }).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
    return { metric: 'aa', rows };
};

/** Proje — projedeki kişiler; o projedeki aylık AA + termine göre görev */
export const buildProjectSchedule = (ws: WorkspaceData, projectId: string, year: number): Schedule => {
    const proj = ws.projects.find(p => p.id === projectId);
    if (!proj) return { metric: 'aa', rows: [] };
    const personById = new Map(ws.people.map(p => [p.id, p]));
    const rows = new Map<string, SchedRow>();
    const ensure = (id: string): SchedRow => {
        if (!rows.has(id)) {
            const person = personById.get(id);
            rows.set(id, { id, label: person ? fullName(person) : id, sublabel: person?.departmentCode, cells: emptyCells(), total: 0 });
        }
        return rows.get(id)!;
    };
    ws.allocations.filter(a => a.projectId === projectId && a.year === year).forEach(a => {
        const row = ensure(a.personId);
        MONTH_INDEXES.forEach(m => {
            const v = a.plan[m] || 0;
            row.cells[m - 1].aa = round2(row.cells[m - 1].aa + v);
            row.total = round2(row.total + v);
        });
    });
    proj.tasks.forEach(t => {
        const m = taskDueMonth(t.dueDate, year);
        if (!m) return;
        const person = ws.people.find(p => trKey(fullName(p)) === trKey(t.resourceName || ''));
        if (!person) return;
        ensure(person.id).cells[m - 1].tasks++;
    });
    return { metric: 'aa', rows: Array.from(rows.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'tr')) };
};

/** İş Paketi — projenin iş paketleri; aylık görev sayısı (termine göre) */
export const buildWorkPackageSchedule = (ws: WorkspaceData, projectId: string, year: number): Schedule => {
    const proj = ws.projects.find(p => p.id === projectId);
    if (!proj) return { metric: 'tasks', rows: [] };
    const wpById = new Map(proj.workPackages.map(w => [w.id, w.name]));
    const rows = new Map<string, SchedRow>();
    const ensure = (id: string, label: string): SchedRow => {
        if (!rows.has(id)) rows.set(id, { id, label, cells: emptyCells(), total: 0 });
        return rows.get(id)!;
    };
    proj.workPackages.forEach(w => ensure(w.id, w.name)); // boş paketler de görünür
    proj.tasks.forEach(t => {
        const wpid = t.workPackageId && wpById.has(t.workPackageId) ? t.workPackageId : '__none';
        const label = wpid === '__none' ? 'İş paketi atanmamış' : wpById.get(wpid)!;
        const row = ensure(wpid, label);
        const m = taskDueMonth(t.dueDate, year);
        if (m) { row.cells[m - 1].tasks++; row.total++; }
    });
    return {
        metric: 'tasks',
        rows: Array.from(rows.values()).filter(r => !(r.id === '__none' && r.total === 0)),
    };
};
