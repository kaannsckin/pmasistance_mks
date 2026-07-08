import { Allocation, Person, PlanLock, PlanLockStatus, UserRole, WorkspaceData } from '../types';

export const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const MONTH_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const ROLE_LABELS: Record<UserRole, string> = {
    mudur: 'Müdür',
    pyb_sorumlu: 'PYB Sorumlusu',
    pyb_destek: 'PYB Destek',
    py: 'Proje Yöneticisi',
    bolum_sorumlu: 'Bölüm Sorumlusu',
};

// ---------------------------------------------------------------------------
// RBAC: kullanıcının tarifine göre —
//  PY + Bölüm Sorumlusu girdi yapar; PYB Destek veri havuzunu yönetir;
//  PYB Sorumlusu ve Müdür kontrol eder (onay/kilit), girdi yapmaz.
// ---------------------------------------------------------------------------

export const canEditPool = (role: UserRole | undefined): boolean => role === 'pyb_destek';

export const canEnterData = (role: UserRole | undefined): boolean =>
    role === 'py' || role === 'bolum_sorumlu';

export const canApprovePlan = (role: UserRole | undefined): boolean =>
    role === 'pyb_sorumlu' || role === 'mudur';

// ---------------------------------------------------------------------------
// Plan kilidi yardımcıları
// ---------------------------------------------------------------------------

export const getPlanLock = (locks: PlanLock[], projectId: string, year: number): PlanLock | undefined =>
    locks.find(l => l.projectId === projectId && l.year === year);

export const getPlanLockStatus = (locks: PlanLock[], projectId: string, year: number): PlanLockStatus =>
    getPlanLock(locks, projectId, year)?.status ?? 'draft';

/** Plan hücresi düzenlenebilir mi? (rol + kilit durumu birlikte) */
export const isPlanEditable = (role: UserRole | undefined, locks: PlanLock[], projectId: string, year: number): boolean =>
    canEnterData(role) && getPlanLockStatus(locks, projectId, year) === 'draft';

/** Gerçekleşen hücresi düzenlenebilir mi? (kilitten bağımsız, rol yeterli) */
export const isActualEditable = (role: UserRole | undefined): boolean => canEnterData(role);

export const upsertPlanLock = (
    locks: PlanLock[],
    projectId: string,
    year: number,
    status: PlanLockStatus,
    role: UserRole | undefined
): PlanLock[] => {
    const now = new Date().toISOString();
    const existing = getPlanLock(locks, projectId, year);
    const next: PlanLock = {
        projectId,
        year,
        status,
        submittedAt: status === 'submitted' ? now : existing?.submittedAt,
        submittedByRole: status === 'submitted' ? role : existing?.submittedByRole,
        decidedAt: status === 'locked' || status === 'draft' ? now : existing?.decidedAt,
        decidedByRole: status === 'locked' || status === 'draft' ? role : existing?.decidedByRole,
    };
    const rest = locks.filter(l => !(l.projectId === projectId && l.year === year));
    return [...rest, next];
};

// ---------------------------------------------------------------------------
// Toplamlar / özetler
// ---------------------------------------------------------------------------

export type EffortField = 'plan' | 'actual';

export const rowTotal = (a: Allocation, field: EffortField): number =>
    MONTH_INDEXES.reduce((sum, m) => sum + (a[field][m] || 0), 0);

export interface MonthlySummaryRow {
    key: string;
    label: string;
    months: number[]; // 12 eleman (index 0 = Ocak)
    total: number;
    /** Kişi özetinde: aylık kapasite (availableAA); diğerlerinde undefined */
    capacity?: number;
}

const emptyMonths = (): number[] => Array(12).fill(0);

/** Kişi bazlı aylık toplam (tüm projeler) — Excel'deki "P.Personel AA" */
export const summarizeByPerson = (
    allocations: Allocation[],
    people: Person[],
    year: number,
    field: EffortField
): MonthlySummaryRow[] => {
    const rows = new Map<string, MonthlySummaryRow>();
    people.forEach(p => {
        rows.set(p.id, {
            key: p.id,
            label: `${p.firstName} ${p.lastName}`.trim(),
            months: emptyMonths(),
            total: 0,
            capacity: p.availableAA,
        });
    });
    allocations.filter(a => a.year === year).forEach(a => {
        const row = rows.get(a.personId);
        if (!row) return;
        MONTH_INDEXES.forEach(m => {
            const v = a[field][m] || 0;
            row.months[m - 1] += v;
            row.total += v;
        });
    });
    return Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
};

/** Bölüm bazlı aylık toplam — Excel'deki "Bölümler AA" */
export const summarizeByDepartment = (
    allocations: Allocation[],
    people: Person[],
    year: number,
    field: EffortField
): MonthlySummaryRow[] => {
    const personDept = new Map(people.map(p => [p.id, p.departmentCode || 'Tanımsız']));
    const deptCapacity = new Map<string, number>();
    people.forEach(p => {
        const d = p.departmentCode || 'Tanımsız';
        deptCapacity.set(d, (deptCapacity.get(d) || 0) + (p.availableAA || 0));
    });
    const rows = new Map<string, MonthlySummaryRow>();
    allocations.filter(a => a.year === year).forEach(a => {
        const dept = personDept.get(a.personId) || 'Tanımsız';
        if (!rows.has(dept)) {
            rows.set(dept, { key: dept, label: dept, months: emptyMonths(), total: 0, capacity: deptCapacity.get(dept) });
        }
        const row = rows.get(dept)!;
        MONTH_INDEXES.forEach(m => {
            const v = a[field][m] || 0;
            row.months[m - 1] += v;
            row.total += v;
        });
    });
    return Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
};

/** Proje bazlı aylık toplam — Excel'deki "Projeler AA" */
export const summarizeByProject = (
    allocations: Allocation[],
    projectNames: Map<string, string>,
    year: number,
    field: EffortField
): MonthlySummaryRow[] => {
    const rows = new Map<string, MonthlySummaryRow>();
    allocations.filter(a => a.year === year).forEach(a => {
        if (!rows.has(a.projectId)) {
            rows.set(a.projectId, {
                key: a.projectId,
                label: projectNames.get(a.projectId) || 'Bilinmeyen Proje',
                months: emptyMonths(),
                total: 0,
            });
        }
        const row = rows.get(a.projectId)!;
        MONTH_INDEXES.forEach(m => {
            const v = a[field][m] || 0;
            row.months[m - 1] += v;
            row.total += v;
        });
    });
    return Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label, 'tr'));
};

/**
 * Aşırı tahsis kontrolü: kişinin bir aydaki toplam PLANI kullanılabilir
 * kapasitesini (availableAA) aşıyor mu? Projeler arası koordinasyonun kalbi.
 */
export interface OverAllocation {
    personId: string;
    personName: string;
    month: number; // 1-12
    total: number;
    capacity: number;
}

export const findOverAllocations = (
    allocations: Allocation[],
    people: Person[],
    year: number,
    field: EffortField = 'plan'
): OverAllocation[] => {
    const result: OverAllocation[] = [];
    const byPerson = summarizeByPerson(allocations, people, year, field);
    const personMap = new Map(people.map(p => [p.id, p]));
    byPerson.forEach(row => {
        const person = personMap.get(row.key);
        if (!person) return;
        const cap = person.availableAA ?? 1;
        row.months.forEach((v, idx) => {
            if (v > cap + 1e-9) {
                result.push({ personId: person.id, personName: row.label, month: idx + 1, total: v, capacity: cap });
            }
        });
    });
    return result;
};

/** Belirli kişi+ay için toplam (hücre bazlı aşırı tahsis vurgusu için) */
export const personMonthTotal = (
    allocations: Allocation[],
    personId: string,
    year: number,
    month: number,
    field: EffortField
): number =>
    allocations
        .filter(a => a.personId === personId && a.year === year)
        .reduce((sum, a) => sum + (a[field][month] || 0), 0);

export const createAllocationId = (): string =>
    `alloc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Yeni tahsis satırı; aynı kişi+proje+İP+rol+yıl varsa null döner (tekrar engeli) */
export const createAllocation = (
    existing: Allocation[],
    personId: string,
    projectId: string,
    year: number,
    workPackageId?: string,
    role?: string
): Allocation | null => {
    const dup = existing.some(a =>
        a.personId === personId && a.projectId === projectId && a.year === year &&
        (a.workPackageId || '') === (workPackageId || '') && (a.role || '') === (role || '')
    );
    if (dup) return null;
    return { id: createAllocationId(), personId, projectId, workPackageId, role, year, plan: {}, actual: {} };
};

/** Workspace içindeki bir tahsis hücresini günceller (immutable). */
export const setAllocationCell = (
    ws: WorkspaceData,
    allocationId: string,
    field: EffortField,
    month: number,
    value: number | undefined
): WorkspaceData => ({
    ...ws,
    allocations: ws.allocations.map(a => {
        if (a.id !== allocationId) return a;
        const next = { ...a[field] };
        if (value === undefined || isNaN(value) || value < 0) {
            delete next[month];
        } else {
            next[month] = Math.round(value * 100) / 100;
        }
        return { ...a, [field]: next };
    }),
});
