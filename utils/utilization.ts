import { Allocation, Leave, Person } from '../types';
import { EffortField, MONTH_INDEXES } from './allocations';
import { effectiveCapacity } from './availability';

/**
 * Doluluk (utilization) ısı haritası verisi — kişi × ay.
 * Her hücre: yük (plan/gerçekleşen AA) / efektif kapasite oranı.
 * Float/Runn/Resource Guru'nun imza görünümü; aşırı yük/atıl kapasite bir bakışta.
 */

export type HeatLevel = 'empty' | 'low' | 'healthy' | 'full' | 'over' | 'leave';

export interface HeatCell {
    month: number; // 1-12
    load: number;
    capacity: number; // efektif (izin düşülmüş)
    leave: number;
    ratio: number | null; // load/capacity; kapasite 0 & yük 0 → null
    level: HeatLevel;
}

export interface HeatRow {
    personId: string;
    name: string;
    departmentCode: string;
    cells: HeatCell[]; // 12
    totalLoad: number;
    totalCapacity: number;
    avgRatio: number | null; // yıllık yük / yıllık kapasite
    overCount: number; // aşırı ay sayısı
}

export interface UtilizationSummary {
    rows: HeatRow[];
    peopleOver: number; // en az bir ayı aşan kişi
    peopleIdle: number; // hiç yükü olmayan kişi
    avgUtilization: number | null; // portföy geneli (toplam yük / toplam kapasite)
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const EPS = 1e-9;

const levelFor = (load: number, capacity: number, leave: number): HeatLevel => {
    if (load <= EPS) return leave > EPS ? 'leave' : 'empty';
    if (capacity <= EPS) return 'over'; // yük var, kapasite yok → aşırı
    const r = load / capacity;
    if (r > 1 + EPS) return 'over';
    if (r >= 0.85 - EPS) return 'full';
    if (r >= 0.4 - EPS) return 'healthy';
    return 'low';
};

export const buildUtilization = (
    allocations: Allocation[],
    people: Person[],
    year: number,
    field: EffortField = 'plan',
    leaves: Leave[] = [],
): UtilizationSummary => {
    const yearAllocs = allocations.filter(a => a.year === year);
    const loadByPersonMonth = new Map<string, number[]>();
    people.forEach(p => loadByPersonMonth.set(p.id, Array(12).fill(0)));
    yearAllocs.forEach(a => {
        const arr = loadByPersonMonth.get(a.personId);
        if (!arr) return;
        MONTH_INDEXES.forEach(m => { arr[m - 1] += a[field][m] || 0; });
    });

    const rows: HeatRow[] = people.map(person => {
        const loads = loadByPersonMonth.get(person.id) || Array(12).fill(0);
        let totalLoad = 0, totalCapacity = 0, overCount = 0;
        const cells: HeatCell[] = MONTH_INDEXES.map(m => {
            const load = round2(loads[m - 1]);
            const capacity = effectiveCapacity(person, leaves, year, m);
            const leave = round2(Math.max(0, (person.availableAA ?? 1) - capacity));
            totalLoad += load;
            totalCapacity += capacity;
            const level = levelFor(load, capacity, leave);
            if (level === 'over') overCount++;
            const ratio = capacity > EPS ? round2(load / capacity) : (load > EPS ? null : null);
            return { month: m, load, capacity, leave, ratio, level };
        });
        return {
            personId: person.id,
            name: `${person.firstName} ${person.lastName}`.trim(),
            departmentCode: person.departmentCode || 'Tanımsız',
            cells,
            totalLoad: round2(totalLoad),
            totalCapacity: round2(totalCapacity),
            avgRatio: totalCapacity > EPS ? round2(totalLoad / totalCapacity) : null,
            overCount,
        };
    }).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    const peopleOver = rows.filter(r => r.overCount > 0).length;
    const peopleIdle = rows.filter(r => r.totalLoad <= EPS).length;
    const sumLoad = rows.reduce((s, r) => s + r.totalLoad, 0);
    const sumCap = rows.reduce((s, r) => s + r.totalCapacity, 0);

    return {
        rows,
        peopleOver,
        peopleIdle,
        avgUtilization: sumCap > EPS ? round2(sumLoad / sumCap) : null,
    };
};
