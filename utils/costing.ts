import { WorkspaceData } from '../types';
import { MONTH_INDEXES, MONTHS_TR } from './allocations';

/**
 * Maliyet katmanı: tahsis (AA) × ünvanın aylık maliyeti (₺).
 * Kişinin ünvanı yoksa veya ünvana maliyet girilmemişse satır maliyetlenemez;
 * bu kişiler raporda ayrıca listelenir ki rakamların eksik olduğu bilinsin.
 *
 * Sapma aynı dönemle kıyaslanır: gerçekleşen, girilmiş son aya kadarki planla
 * (dönem planı) karşılaştırılır. Yıllık planı dokuz aylık gerçekleşenle
 * kıyaslamak "harcanmamış bütçe" gibi yanlış bir tablo çizer.
 */

export interface CostRow {
    key: string;
    label: string;
    planCost: number; // yıllık plan
    actualCost: number;
    periodPlanCost: number; // gerçekleşeni girilmiş son aya kadarki plan
    varianceCost: number; // gerçekleşen - dönem planı
}

export interface CostReport {
    year: number;
    monthlyPlanCost: number[]; // 12
    monthlyActualCost: number[]; // 12
    totalPlanCost: number; // yıllık plan
    totalActualCost: number;
    /** Gerçekleşeni girilmiş son ay (1-12; hiç yoksa 0). Sapma bu aya kadarki planla hesaplanır. */
    periodEndMonth: number;
    totalPeriodPlanCost: number;
    totalVarianceCost: number; // gerçekleşen - dönem planı
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
    type Acc = { key: string; label: string; plan: number[]; actual: number };
    const byProject = new Map<string, Acc>();
    const byDepartment = new Map<string, Acc>();
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
        const getRow = (map: Map<string, Acc>, key: string, label: string): Acc => {
            if (!map.has(key)) map.set(key, { key, label, plan: Array(12).fill(0), actual: 0 });
            return map.get(key)!;
        };
        const proj = getRow(byProject, a.projectId, projectName.get(a.projectId) || 'Bilinmeyen Proje');
        const dept = getRow(byDepartment, person.departmentCode || 'Tanımsız', person.departmentCode || 'Tanımsız');
        MONTH_INDEXES.forEach(m => {
            const planCost = (a.plan[m] || 0) * rate;
            const actualCost = (a.actual[m] || 0) * rate;
            monthlyPlanCost[m - 1] += planCost;
            monthlyActualCost[m - 1] += actualCost;
            proj.plan[m - 1] += planCost;
            proj.actual += actualCost;
            dept.plan[m - 1] += planCost;
            dept.actual += actualCost;
        });
    });

    // Dönem: gerçekleşeni girilmiş son ay (ay kapanışı yapılmamış ay sapmaya girmez)
    const periodEndMonth = MONTH_INDEXES.reduce((last, m) => (monthlyActualCost[m - 1] > 0 ? m : last), 0);
    const upToPeriod = (plan: number[]): number => plan.slice(0, periodEndMonth).reduce((a, b) => a + b, 0);

    const finalize = (map: Map<string, Acc>): CostRow[] =>
        Array.from(map.values())
            .map(r => {
                const planCost = round0(r.plan.reduce((a, b) => a + b, 0));
                const periodPlanCost = round0(upToPeriod(r.plan));
                const actualCost = round0(r.actual);
                return { key: r.key, label: r.label, planCost, actualCost, periodPlanCost, varianceCost: actualCost - periodPlanCost };
            })
            .sort((a, b) => b.planCost - a.planCost);

    const totalPlanCost = round0(monthlyPlanCost.reduce((a, b) => a + b, 0));
    const totalActualCost = round0(monthlyActualCost.reduce((a, b) => a + b, 0));
    const totalPeriodPlanCost = round0(upToPeriod(monthlyPlanCost));

    return {
        year,
        monthlyPlanCost: monthlyPlanCost.map(round0),
        monthlyActualCost: monthlyActualCost.map(round0),
        totalPlanCost,
        totalActualCost,
        periodEndMonth,
        totalPeriodPlanCost,
        totalVarianceCost: totalActualCost - totalPeriodPlanCost,
        byProject: finalize(byProject),
        byDepartment: finalize(byDepartment),
        uncostedPeople: Array.from(uncosted).sort((a, b) => a.localeCompare(b, 'tr')),
        costedTitleCount: rateByTitle.size,
    };
};

/** Sapma döneminin etiketi: "Oca–Eyl" (hiç gerçekleşen yoksa "—") */
export const costPeriodLabel = (periodEndMonth: number): string =>
    periodEndMonth <= 0 ? '—' : periodEndMonth === 1 ? MONTHS_TR[0] : `${MONTHS_TR[0]}–${MONTHS_TR[periodEndMonth - 1]}`;

/** ₺ biçimlendirme (tr-TR binlik ayraç, ondalıksız) */
export const fmtTL = (v: number): string => `${Math.round(v).toLocaleString('tr-TR')} ₺`;
