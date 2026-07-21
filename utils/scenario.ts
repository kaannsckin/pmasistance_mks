import { Person, Project, WorkspaceData } from '../types';
import { MONTH_INDEXES } from './allocations';
import { UNASSIGNED_ROLE } from './roleAnalysis';

/**
 * Senaryo / what-if planlama motoru.
 *
 * "Bu teklifi kazanırsak hangi roller açığa düşer?" sorusunun cevabı.
 * Hiçbir şey KALICI DEĞİL — gerçek veri üzerinde geçici bir simülasyon.
 *
 *  - baseline: yalnızca taahhüt edilmiş (devam/beklemede/tamamlandı) projelerin
 *    plan talebi vs mevcut kapasite (rolü üstlenebilen kişilerin AA'sı)
 *  - senaryo: baseline + seçilen teklif projelerinin talebi vs (kapasite +
 *    varsayımsal işe alımlar)
 *
 * Açık = max(0, talep − kapasite). Senaryo açığı ile baseline açığının farkı,
 * kararların (teklif kazanma, işe alım) yükü nereye bindirdiğini gösterir.
 */

export interface ScenarioHire {
    departmentCode: string;
    role: string;
    aa: number; // aylık AA (tüm yıl eklenir)
}

export interface Scenario {
    wonProjectIds: string[]; // "kazanılmış say" işaretli teklif projeleri
    hires: ScenarioHire[];
}

export interface ScenarioRoleRow {
    departmentCode: string;
    role: string;
    committed: number[]; // 12 (taahhüt talebi)
    scenario: number[];  // 12 (taahhüt + kazanılan teklifler)
    capacity: number[];  // 12 (mevcut + işe alım)
    baseCapacity: number[]; // 12 (işe alımsız)
    gap: number[];       // 12 (senaryo açığı)
    baselineGap: number[]; // 12 (taahhüt açığı, işe alımsız)
    totals: { committed: number; scenario: number; capacity: number; gap: number; baselineGap: number };
}

export interface ScenarioResult {
    rows: ScenarioRoleRow[];
    newlyStrained: ScenarioRoleRow[]; // baseline'da açık yokken senaryoda açığa düşen roller
    totalNewGapAA: number; // senaryonun getirdiği ek açık (senaryo − baseline)
    wonProposalCount: number;
    hireAA: number; // toplam varsayımsal işe alım AA
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const emptyMonths = () => Array(12).fill(0) as number[];
const trKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');

export const buildScenario = (ws: WorkspaceData, year: number, scenario: Scenario): ScenarioResult => {
    const personById = new Map(ws.people.map(p => [p.id, p]));
    const projectById = new Map<string, Project>(ws.projects.map(p => [p.id, p]));
    const wonSet = new Set(scenario.wonProjectIds);

    const rows = new Map<string, ScenarioRoleRow>();
    const getRow = (dept: string, role: string): ScenarioRoleRow => {
        const key = `${dept}|${role}`;
        if (!rows.has(key)) {
            rows.set(key, {
                departmentCode: dept, role,
                committed: emptyMonths(), scenario: emptyMonths(),
                capacity: emptyMonths(), baseCapacity: emptyMonths(),
                gap: emptyMonths(), baselineGap: emptyMonths(),
                totals: { committed: 0, scenario: 0, capacity: 0, gap: 0, baselineGap: 0 },
            });
        }
        return rows.get(key)!;
    };

    // 1) Talep: tahsis planlarını taahhüt/teklif olarak ayır
    ws.allocations.filter(a => a.year === year).forEach(a => {
        const person = personById.get(a.personId);
        if (!person) return;
        const project = projectById.get(a.projectId);
        if (!project) return;
        const dept = person.departmentCode || 'Tanımsız';
        const role = (a.role || '').trim() || UNASSIGNED_ROLE;
        const row = getRow(dept, role);
        const isProposal = project.status === 'teklif';
        const included = !isProposal || wonSet.has(project.id); // taahhüt her zaman; teklif yalnız kazanılırsa
        MONTH_INDEXES.forEach(m => {
            const v = a.plan[m] || 0;
            if (v <= 0) return;
            if (!isProposal) row.committed[m - 1] += v;
            if (included) row.scenario[m - 1] += v;
        });
    });

    // 2) Kapasite: rolü üstlenebilen kişiler
    ws.people.forEach(p => {
        const dept = p.departmentCode || 'Tanımsız';
        const roleList = p.roles.length ? p.roles : [UNASSIGNED_ROLE];
        roleList.forEach(roleRaw => {
            const role = roleRaw.trim() || UNASSIGNED_ROLE;
            const row = getRow(dept, role);
            MONTH_INDEXES.forEach(m => {
                row.baseCapacity[m - 1] += p.availableAA || 0;
                row.capacity[m - 1] += p.availableAA || 0;
            });
        });
    });

    // 3) Varsayımsal işe alımlar → yalnız senaryo kapasitesine
    scenario.hires.forEach(h => {
        if (h.aa <= 0) return;
        const row = getRow(h.departmentCode || 'Tanımsız', (h.role || '').trim() || UNASSIGNED_ROLE);
        MONTH_INDEXES.forEach(m => { row.capacity[m - 1] += h.aa; });
    });

    // 4) Açıklar + toplamlar
    let totalNewGapAA = 0;
    const result: ScenarioRoleRow[] = [];
    rows.forEach(row => {
        MONTH_INDEXES.forEach(m => {
            const i = m - 1;
            row.committed[i] = round2(row.committed[i]);
            row.scenario[i] = round2(row.scenario[i]);
            row.capacity[i] = round2(row.capacity[i]);
            row.baseCapacity[i] = round2(row.baseCapacity[i]);
            row.gap[i] = round2(Math.max(0, row.scenario[i] - row.capacity[i]));
            row.baselineGap[i] = round2(Math.max(0, row.committed[i] - row.baseCapacity[i]));
            totalNewGapAA += Math.max(0, row.gap[i] - row.baselineGap[i]);
        });
        const sum = (arr: number[]) => round2(arr.reduce((a, b) => a + b, 0));
        row.totals = {
            committed: sum(row.committed), scenario: sum(row.scenario),
            capacity: sum(row.capacity), gap: sum(row.gap), baselineGap: sum(row.baselineGap),
        };
        result.push(row);
    });

    result.sort((a, b) =>
        b.totals.gap - a.totals.gap ||
        a.departmentCode.localeCompare(b.departmentCode, 'tr') ||
        a.role.localeCompare(b.role, 'tr'));

    const relevant = result.filter(r => r.totals.scenario > 0 || r.totals.capacity > 0);
    const newlyStrained = relevant.filter(r => r.totals.gap > 0 && r.totals.baselineGap < r.totals.gap - 1e-9);

    return {
        rows: relevant,
        newlyStrained,
        totalNewGapAA: round2(totalNewGapAA),
        wonProposalCount: scenario.wonProjectIds.length,
        hireAA: round2(scenario.hires.reduce((s, h) => s + Math.max(0, h.aa) * 12, 0)),
    };
};

/** Senaryoda dahil edilebilecek teklif projeleri */
export const proposalProjects = (ws: WorkspaceData): Project[] =>
    ws.projects.filter(p => p.status === 'teklif');

/** Havuzdaki (bölüm, rol) çiftleri — işe alım seçimi için */
export const departmentRolePairs = (people: Person[]): { departmentCode: string; role: string }[] => {
    const set = new Set<string>();
    const out: { departmentCode: string; role: string }[] = [];
    people.forEach(p => {
        const dept = p.departmentCode || 'Tanımsız';
        (p.roles.length ? p.roles : [UNASSIGNED_ROLE]).forEach(r => {
            const role = r.trim() || UNASSIGNED_ROLE;
            const key = `${trKey(dept)}|${trKey(role)}`;
            if (!set.has(key)) { set.add(key); out.push({ departmentCode: dept, role }); }
        });
    });
    return out.sort((a, b) => a.departmentCode.localeCompare(b.departmentCode, 'tr') || a.role.localeCompare(b.role, 'tr'));
};
