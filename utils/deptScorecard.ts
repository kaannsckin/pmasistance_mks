import { WorkspaceData } from '../types';
import { annualEffectiveCapacity, annualLeaveAA } from './availability';
import { findOverAllocations, MONTH_INDEXES } from './allocations';
import { HealthBand } from './executive';

/**
 * Departman (kurum) karnesi — yönetim ekranının "genel kurum bazında" görünümü.
 * Her bölümün insan kaynağı sağlığını tek bakışta özetler: kişi sayısı, efektif
 * kapasite (izin düşülmüş), planlanan yük, doluluk oranı ve aşırı tahsis. Saf/
 * test edilebilir; ExecutiveView bu veriyi kart/panolar olarak render eder.
 */

export interface DeptPersonLoad {
    personId: string;
    name: string;
    capacityAA: number;
    plannedAA: number;
    utilization: number | null; // planned / capacity
    over: boolean; // herhangi bir ayda kapasite üstü
}

export interface DeptScorecard {
    code: string;
    name: string;
    headcount: number;
    capacityAA: number; // yıllık efektif kapasite (izin düşülmüş)
    plannedAA: number;
    actualAA: number;
    leaveAA: number;
    utilization: number | null; // plannedAA / capacityAA
    overAllocatedPeople: number; // bazı aylarda kapasitesini aşan kişi sayısı
    projectCount: number; // bölümün katkı verdiği proje sayısı
    band: HealthBand;
    reasons: string[];
    people: DeptPersonLoad[]; // detaya inince gösterilir
}

export interface OrgCapacity {
    departments: DeptScorecard[];
    totalHeadcount: number;
    totalCapacityAA: number;
    totalPlannedAA: number;
    totalActualAA: number;
    utilization: number | null;
    overAllocatedPeople: number;
}

const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

const bandForDept = (utilization: number | null, overPeople: number, reasons: string[]): HealthBand => {
    let band: HealthBand = 'good';
    if (utilization === null) {
        reasons.push('Kapasite tanımsız');
        band = 'warn';
    } else if (utilization > 1.05) {
        reasons.push(`Aşırı yük (%${Math.round(utilization * 100)})`);
        band = 'bad';
    } else if (utilization > 0.95) {
        reasons.push(`Kapasite dolu (%${Math.round(utilization * 100)})`);
        band = 'warn';
    } else if (utilization < 0.4) {
        reasons.push(`Düşük doluluk (%${Math.round(utilization * 100)})`);
        band = 'warn';
    }
    if (overPeople > 0) {
        reasons.push(`${overPeople} kişi bazı aylarda kapasite üstü`);
        if (band === 'good') band = 'warn';
        if (overPeople >= 3) band = 'bad';
    }
    return band;
};

export const departmentScorecards = (ws: WorkspaceData, year: number): DeptScorecard[] => {
    const leaves = ws.leaves || [];
    const deptName = new Map(ws.departments.map(d => [d.code, d.name]));
    const yearAllocs = ws.allocations.filter(a => a.year === year);

    // Kişi bazında yıllık plan/gerçekleşen ve katkı verdiği projeler
    const personPlan = new Map<string, number>();
    const personActual = new Map<string, number>();
    const personProjects = new Map<string, Set<string>>();
    yearAllocs.forEach(a => {
        const plan = MONTH_INDEXES.reduce((s, m) => s + (a.plan[m] || 0), 0);
        const actual = MONTH_INDEXES.reduce((s, m) => s + (a.actual[m] || 0), 0);
        personPlan.set(a.personId, (personPlan.get(a.personId) || 0) + plan);
        personActual.set(a.personId, (personActual.get(a.personId) || 0) + actual);
        if (!personProjects.has(a.personId)) personProjects.set(a.personId, new Set());
        personProjects.get(a.personId)!.add(a.projectId);
    });

    // Aşırı tahsisli kişiler (aya özel kapasiteyi aşanlar)
    const overPeople = new Set(findOverAllocations(yearAllocs, ws.people, year, 'plan', leaves).map(o => o.personId));

    // Kişileri bölüme göre grupla
    const byCode = new Map<string, typeof ws.people>();
    ws.people.forEach(p => {
        const code = p.departmentCode || '—';
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code)!.push(p);
    });

    const cards: DeptScorecard[] = [];
    byCode.forEach((people, code) => {
        let capacityAA = 0, plannedAA = 0, actualAA = 0, leaveAA = 0;
        const projectSet = new Set<string>();
        let overCount = 0;
        const personLoads: DeptPersonLoad[] = people.map(p => {
            const cap = annualEffectiveCapacity(p, leaves, year);
            const plan = personPlan.get(p.id) || 0;
            const projs = personProjects.get(p.id);
            capacityAA += cap;
            plannedAA += plan;
            actualAA += personActual.get(p.id) || 0;
            leaveAA += annualLeaveAA(leaves, p.id, year);
            if (projs) projs.forEach(pr => projectSet.add(pr));
            const over = overPeople.has(p.id);
            if (over) overCount++;
            return {
                personId: p.id,
                name: `${p.firstName} ${p.lastName}`.trim(),
                capacityAA: round2(cap),
                plannedAA: round2(plan),
                utilization: cap > 0 ? round2(plan / cap) : null,
                over,
            };
        }).sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1));

        const utilization = capacityAA > 0 ? round2(plannedAA / capacityAA) : null;
        const reasons: string[] = [];
        const band = bandForDept(utilization, overCount, reasons);
        cards.push({
            code,
            name: deptName.get(code) || (code === '—' ? 'Tanımsız' : code),
            headcount: people.length,
            capacityAA: round1(capacityAA),
            plannedAA: round1(plannedAA),
            actualAA: round1(actualAA),
            leaveAA: round1(leaveAA),
            utilization,
            overAllocatedPeople: overCount,
            projectCount: projectSet.size,
            band,
            reasons,
            people: personLoads,
        });
    });

    // En yüksek doluluk / en riskli önce
    const bandRank = { bad: 0, warn: 1, good: 2 };
    return cards.sort((a, b) => bandRank[a.band] - bandRank[b.band] || (b.utilization ?? -1) - (a.utilization ?? -1));
};

export const orgCapacity = (ws: WorkspaceData, year: number): OrgCapacity => {
    const departments = departmentScorecards(ws, year);
    const totalHeadcount = departments.reduce((s, d) => s + d.headcount, 0);
    const totalCapacityAA = round1(departments.reduce((s, d) => s + d.capacityAA, 0));
    const totalPlannedAA = round1(departments.reduce((s, d) => s + d.plannedAA, 0));
    const totalActualAA = round1(departments.reduce((s, d) => s + d.actualAA, 0));
    const overAllocatedPeople = departments.reduce((s, d) => s + d.overAllocatedPeople, 0);
    return {
        departments,
        totalHeadcount,
        totalCapacityAA,
        totalPlannedAA,
        totalActualAA,
        utilization: totalCapacityAA > 0 ? round2(totalPlannedAA / totalCapacityAA) : null,
        overAllocatedPeople,
    };
};
