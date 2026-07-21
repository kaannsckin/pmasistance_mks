import { Allocation, Leave, Person } from '../types';
import { MONTH_INDEXES, personMonthTotal } from './allocations';
import { effectiveCapacity } from './availability';

/**
 * Uygun kişi bulucu (staffing) — "şu rol + şu ay(lar)da en az şu AA boş kim var?".
 * Float/Runn'ın beceri-bazlı aramasının karşılığı. Efektif kapasiteden (izin
 * düşülmüş) mevcut plan yükü çıkarılır; seçilen ay penceresinde boşluk aranır.
 */

export interface StaffCandidate {
    personId: string;
    name: string;
    departmentCode: string;
    roles: string[];
    freeByMonth: number[]; // 12 — o ay boş kapasite (negatif = aşırı yüklü)
    windowFree: number; // pencere aylarındaki toplam boş (>=0 kırpılmış)
    windowMinFree: number; // penceredeki en dar ay (darboğaz)
    fits: boolean; // her seçili ayda gerekli AA kadar boş var mı
}

export interface StaffQuery {
    role?: string; // boş/undefined → tüm roller (herkes)
    year: number;
    months: number[]; // 1-12 pencere
    requiredAA: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

export const findAvailablePeople = (
    people: Person[],
    allocations: Allocation[],
    leaves: Leave[],
    q: StaffQuery,
): StaffCandidate[] => {
    const wanted = q.role && q.role.trim() ? q.role.trim() : null;
    const months = q.months.length ? q.months : MONTH_INDEXES;
    const candidates = people.filter(p => !wanted || p.roles.includes(wanted));

    const rows: StaffCandidate[] = candidates.map(p => {
        const freeByMonth = MONTH_INDEXES.map(m => {
            const load = personMonthTotal(allocations, p.id, q.year, m, 'plan');
            return round2(effectiveCapacity(p, leaves, q.year, m) - load);
        });
        const windowFrees = months.map(m => freeByMonth[m - 1]);
        const windowFree = round2(windowFrees.reduce((s, v) => s + Math.max(0, v), 0));
        const windowMinFree = windowFrees.length ? round2(Math.min(...windowFrees)) : 0;
        return {
            personId: p.id,
            name: `${p.firstName} ${p.lastName}`.trim(),
            departmentCode: p.departmentCode || 'Tanımsız',
            roles: p.roles,
            freeByMonth,
            windowFree,
            windowMinFree,
            fits: windowMinFree >= q.requiredAA - 1e-9,
        };
    });

    // Sıralama: uygun olanlar önce → darboğaz boşluğu fazla → toplam boş fazla → ad
    return rows.sort((a, b) =>
        (Number(b.fits) - Number(a.fits)) ||
        (b.windowMinFree - a.windowMinFree) ||
        (b.windowFree - a.windowFree) ||
        a.name.localeCompare(b.name, 'tr'));
};

/** Havuzdaki tüm rol adları (kişilerin üstlenebildiği), alfabetik tekil */
export const allPersonRoles = (people: Person[]): string[] =>
    Array.from(new Set(people.flatMap(p => p.roles))).sort((a, b) => a.localeCompare(b, 'tr'));
