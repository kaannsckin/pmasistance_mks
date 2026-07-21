import { Allocation, Leave, Person, Project } from '../types';
import { MONTH_INDEXES } from './allocations';
import { effectiveCapacity } from './availability';

/**
 * Rol bazlı kapasite-talep analizi — Excel'deki "Plan, Kaynak, İhtiyaç (Rol)"
 * sayfasının canlı karşılığı. Bölüm × rol kesitinde dört efor türü:
 *
 *  - planned  (Planlı - Proje):   devam eden/bekleyen/tamamlanan projelere
 *                                 girilen aylık plan AA toplamı (bağlı talep)
 *  - capacity (Kaynak - İşgücü):  o bölümde o rolü üstlenebilen kişilerin
 *                                 kullanılabilir AA toplamı (aylık sabit)*
 *  - proposal (İhtiyaç - Teklif): teklif aşamasındaki projelerin plan AA'sı
 *                                 (pipeline talebi)
 *  - gap      (Personel Açığı):   max(0, planned + proposal - capacity)
 *                                 → işe alım / görevlendirme ihtiyacı
 *
 *  * Birden fazla rolü olan kişi, üstlenebileceği her rolün kapasitesinde
 *    görünür (Excel'deki manuel girişle aynı yaklaşım: "bu role çekilebilecek
 *    işgücü"). Bu nedenle kapasite kolonları roller arasında toplanamaz.
 */

export const EFFORT_TYPE_LABELS = {
    planned: 'Planlı - Proje',
    capacity: 'Kaynak - İşgücü',
    proposal: 'İhtiyaç - Teklif',
    gap: 'Personel Açığı',
} as const;

export type EffortType = keyof typeof EFFORT_TYPE_LABELS;

export const UNASSIGNED_ROLE = 'Rol atanmamış';

export interface RoleAnalysisRow {
    departmentCode: string;
    role: string;
    planned: number[]; // 12 eleman (Ocak..Aralık)
    capacity: number[];
    proposal: number[];
    gap: number[];
    totals: Record<EffortType, number>;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const emptyMonths = () => Array(12).fill(0) as number[];

export const buildRoleAnalysis = (
    allocations: Allocation[],
    people: Person[],
    projects: Project[],
    year: number,
    leaves: Leave[] = []
): RoleAnalysisRow[] => {
    const personById = new Map(people.map(p => [p.id, p]));
    const projectById = new Map(projects.map(p => [p.id, p]));

    const rows = new Map<string, RoleAnalysisRow>();
    const getRow = (dept: string, role: string): RoleAnalysisRow => {
        const key = `${dept}|${role}`;
        if (!rows.has(key)) {
            rows.set(key, {
                departmentCode: dept,
                role,
                planned: emptyMonths(),
                capacity: emptyMonths(),
                proposal: emptyMonths(),
                gap: emptyMonths(),
                totals: { planned: 0, capacity: 0, proposal: 0, gap: 0 },
            });
        }
        return rows.get(key)!;
    };

    // 1) Talep: tahsis planları → rol satırlarına dağıt
    allocations
        .filter(a => a.year === year)
        .forEach(a => {
            const person = personById.get(a.personId);
            if (!person) return;
            const dept = person.departmentCode || 'Tanımsız';
            const role = (a.role || '').trim() || UNASSIGNED_ROLE;
            const project = projectById.get(a.projectId);
            const bucket: Extract<EffortType, 'planned' | 'proposal'> =
                project?.status === 'teklif' ? 'proposal' : 'planned';
            const row = getRow(dept, role);
            MONTH_INDEXES.forEach(m => {
                const v = a.plan[m] || 0;
                if (v > 0) row[bucket][m - 1] += v;
            });
        });

    // 2) Kapasite: rolü üstlenebilen kişilerin kullanılabilir AA'sı
    people.forEach(p => {
        const dept = p.departmentCode || 'Tanımsız';
        const roleList = p.roles.length ? p.roles : [UNASSIGNED_ROLE];
        roleList.forEach(role => {
            // Kapasiteyi yalnızca talebi ya da tanımı olan satırlara değil,
            // rolü olan herkese açıyoruz — boş rol satırı da görünür olmalı
            const row = getRow(dept, role.trim() || UNASSIGNED_ROLE);
            MONTH_INDEXES.forEach(m => {
                // İzin/tatili düşülmüş efektif kapasite (rol açığı gerçekçi olsun)
                row.capacity[m - 1] += effectiveCapacity(p, leaves, year, m);
            });
        });
    });

    // 3) Açık + toplamlar
    const result = Array.from(rows.values()).map(row => {
        MONTH_INDEXES.forEach(m => {
            const idx = m - 1;
            row.planned[idx] = round2(row.planned[idx]);
            row.capacity[idx] = round2(row.capacity[idx]);
            row.proposal[idx] = round2(row.proposal[idx]);
            row.gap[idx] = round2(Math.max(0, row.planned[idx] + row.proposal[idx] - row.capacity[idx]));
        });
        row.totals = {
            planned: round2(row.planned.reduce((a, b) => a + b, 0)),
            capacity: round2(row.capacity.reduce((a, b) => a + b, 0)),
            proposal: round2(row.proposal.reduce((a, b) => a + b, 0)),
            gap: round2(row.gap.reduce((a, b) => a + b, 0)),
        };
        return row;
    });

    // Tamamen boş satırları at (talep yok + kapasite yok)
    return result
        .filter(r => r.totals.planned > 0 || r.totals.proposal > 0 || r.totals.capacity > 0)
        .sort((a, b) =>
            a.departmentCode.localeCompare(b.departmentCode, 'tr') ||
            a.role.localeCompare(b.role, 'tr'));
};

/** Yıl genelinde açığı olan rol sayısı ve toplam açık AA (özet göstergeler) */
export const summarizeGaps = (rows: RoleAnalysisRow[]): { rolesWithGap: number; totalGapAA: number } => ({
    rolesWithGap: rows.filter(r => r.totals.gap > 0).length,
    totalGapAA: round2(rows.reduce((sum, r) => sum + r.totals.gap, 0)),
});
