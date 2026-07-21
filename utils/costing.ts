import { WorkspaceData } from '../types';
import { MONTH_INDEXES } from './allocations';

/**
 * Maliyet katmanı: tahsis (AA) × ünvanın aylık maliyeti (₺).
 * Kişinin ünvanı yoksa veya ünvana maliyet girilmemişse satır maliyetlenemez;
 * bu kişiler raporda ayrıca listelenir ki rakamların eksik olduğu bilinsin.
 */

export interface CostRow {
    key: string;
    label: string;
    planCost: number;
    actualCost: number;
    varianceCost: number; // gerçekleşen - plan
}

export interface CostReport {
    year: number;
    monthlyPlanCost: number[]; // 12
    monthlyActualCost: number[]; // 12
    totalPlanCost: number;
    totalActualCost: number;
    totalVarianceCost: number;
    byProject: CostRow[];
    byDepartment: CostRow[];
    /** Maliyetlenemeyen kişiler (ünvan yok ya da ünvana ₺ girilmemiş) */
    uncostedPeople: string[];
    /** Maliyet oranı girilmiş ünvan sayısı (0 ise katman devre dışı demektir) */
    costedTitleCount: number;
}

const round0 = (v: number) => Math.round(v);

export const buildCostReport = (ws: WorkspaceData, year: number): CostReport => {
    const rateByTitle = new Map(
        ws.titles.filter(t => (t.monthlyCost || 0) > 0).map(t => [t.code, t.monthlyCost as number])
    );
    const personById = new Map(ws.people.map(p => [p.id, p]));
    const projectName = new Map(ws.projects.map(p => [p.id, p.name]));

    const monthlyPlanCost = Array(12).fill(0) as number[];
    const monthlyActualCost = Array(12).fill(0) as number[];
    const byProject = new Map<string, CostRow>();
    const byDepartment = new Map<string, CostRow>();
    const uncosted = new Set<string>();

    ws.allocations.filter(a => a.year === year).forEach(a => {
        const person = personById.get(a.personId);
        if (!person) return;
        const rate = person.titleCode ? rateByTitle.get(person.titleCode) : undefined;
        if (!rate) {
            const hasValue = MONTH_INDEXES.some(m => (a.plan[m] || 0) > 0 || (a.actual[m] || 0) > 0);
            if (hasValue) uncosted.add(`${person.firstName} ${person.lastName}`.trim());
            return;
        }
        const getRow = (map: Map<string, CostRow>, key: string, label: string): CostRow => {
            if (!map.has(key)) map.set(key, { key, label, planCost: 0, actualCost: 0, varianceCost: 0 });
            return map.get(key)!;
        };
        const proj = getRow(byProject, a.projectId, projectName.get(a.projectId) || 'Bilinmeyen Proje');
        const dept = getRow(byDepartment, person.departmentCode || 'Tanımsız', person.departmentCode || 'Tanımsız');
        MONTH_INDEXES.forEach(m => {
            const planCost = (a.plan[m] || 0) * rate;
            const actualCost = (a.actual[m] || 0) * rate;
            monthlyPlanCost[m - 1] += planCost;
            monthlyActualCost[m - 1] += actualCost;
            proj.planCost += planCost;
            proj.actualCost += actualCost;
            dept.planCost += planCost;
            dept.actualCost += actualCost;
        });
    });

    const finalize = (map: Map<string, CostRow>): CostRow[] =>
        Array.from(map.values())
            .map(r => ({ ...r, planCost: round0(r.planCost), actualCost: round0(r.actualCost), varianceCost: round0(r.actualCost - r.planCost) }))
            .sort((a, b) => b.planCost - a.planCost);

    const totalPlanCost = round0(monthlyPlanCost.reduce((a, b) => a + b, 0));
    const totalActualCost = round0(monthlyActualCost.reduce((a, b) => a + b, 0));

    return {
        year,
        monthlyPlanCost: monthlyPlanCost.map(round0),
        monthlyActualCost: monthlyActualCost.map(round0),
        totalPlanCost,
        totalActualCost,
        totalVarianceCost: round0(totalActualCost - totalPlanCost),
        byProject: finalize(byProject),
        byDepartment: finalize(byDepartment),
        uncostedPeople: Array.from(uncosted).sort((a, b) => a.localeCompare(b, 'tr')),
        costedTitleCount: rateByTitle.size,
    };
};

/** ₺ biçimlendirme (tr-TR binlik ayraç, ondalıksız) */
export const fmtTL = (v: number): string => `${Math.round(v).toLocaleString('tr-TR')} ₺`;
