import { Leave, Person } from '../types';

/**
 * Uygunluk / efektif kapasite — izin/tatil/yarı-zaman kişinin o aydaki
 * kullanılabilir AA'sını düşürür. Efektif kapasite = availableAA − izin AA.
 * Saf/test edilebilir; aşırı-tahsis, rol-açığı, doluluk ısı haritası ve kişi
 * profili bu kapasiteyi kullanır.
 */

const MONTH_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const round2 = (v: number): number => Math.round(v * 100) / 100;

export const LEAVE_REASONS = ['İzin', 'Yıllık İzin', 'Tatil', 'Eğitim', 'Yarı-zaman', 'Diğer'];

/** Bir kişinin belirli ayda toplam izin AA'sı */
export const monthLeaveAA = (leaves: Leave[], personId: string, year: number, month: number): number =>
    leaves
        .filter(l => l.personId === personId && l.year === year && l.month === month)
        .reduce((sum, l) => sum + (l.aa || 0), 0);

/** Efektif aylık kapasite: temel AA − o ayın izinleri (negatif olmaz) */
export const effectiveCapacity = (person: Person, leaves: Leave[], year: number, month: number): number => {
    const base = person.availableAA ?? 1;
    return round2(Math.max(0, base - monthLeaveAA(leaves, person.id, year, month)));
};

/** 12 aylık efektif kapasite dizisi (index 0 = Ocak) */
export const monthlyEffectiveCapacity = (person: Person, leaves: Leave[], year: number): number[] =>
    MONTH_INDEXES.map(m => effectiveCapacity(person, leaves, year, m));

/** Yıllık efektif kapasite toplamı */
export const annualEffectiveCapacity = (person: Person, leaves: Leave[], year: number): number =>
    round2(monthlyEffectiveCapacity(person, leaves, year).reduce((a, b) => a + b, 0));

/** Bir kişinin bir yıldaki izinleri (aya göre) */
export const personYearLeaveMonths = (leaves: Leave[], personId: string, year: number): number[] =>
    MONTH_INDEXES.map(m => round2(monthLeaveAA(leaves, personId, year, m)));

/** Toplam izin AA (kişi/yıl) */
export const annualLeaveAA = (leaves: Leave[], personId: string, year: number): number =>
    round2(personYearLeaveMonths(leaves, personId, year).reduce((a, b) => a + b, 0));

/**
 * Bir (kişi, yıl, ay) için izni ayarlar (upsert): aa<=0 ise kaldırır, aksi
 * halde tek kayıt olarak günceller/ekler. Immutable.
 */
export const upsertLeave = (
    leaves: Leave[],
    personId: string,
    year: number,
    month: number,
    aa: number,
    reason?: string,
): Leave[] => {
    const rest = leaves.filter(l => !(l.personId === personId && l.year === year && l.month === month));
    if (!aa || aa <= 0) return rest;
    const capped = Math.min(1, round2(aa)); // bir ay en fazla 1 AA
    return [...rest, { id: `leave-${personId}-${year}-${month}`, personId, year, month, aa: capped, reason }];
};

const weekdaysInMonth = (year: number, month: number): number => {
    let n = 0;
    const d = new Date(year, month - 1, 1);
    while (d.getMonth() === month - 1) {
        if (d.getDay() !== 0 && d.getDay() !== 6) n++;
        d.setDate(d.getDate() + 1);
    }
    return n;
};

export interface RangeLeave {
    year: number;
    month: number; // 1–12
    days: number; // aralıktaki hafta içi gün
    aa: number; // days ÷ ayın hafta içi günü
}

/**
 * Takvimden seçilen izin aralığını aylık AA'ya çevirir: her ay için aralığa
 * düşen hafta içi gün ÷ o ayın hafta içi gün sayısı (resmi tatiller ayrıca
 * düşülmez). Yalnız hafta sonuna düşen aylar listelenmez.
 */
export const leaveFromRange = (start: string, end: string): RangeLeave[] => {
    const parse = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
    let a = parse(start), b = parse(end);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return [];
    if (a > b) [a, b] = [b, a];
    const byMonth = new Map<string, RangeLeave>();
    for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        const cur = byMonth.get(key) || { year: d.getFullYear(), month: d.getMonth() + 1, days: 0, aa: 0 };
        cur.days++;
        byMonth.set(key, cur);
    }
    return [...byMonth.values()].map(r => ({ ...r, aa: round2(r.days / weekdaysInMonth(r.year, r.month)) }));
};

/**
 * İzin aralığını mevcut izinlere ekler (ay başına en fazla 1 AA). Dönen
 * liste her ayın yeni toplamıdır; çağıran upsertLeave ile yazar.
 */
export const addLeaveRange = (leaves: Leave[], personId: string, start: string, end: string): { year: number; month: number; aa: number; added: number }[] =>
    leaveFromRange(start, end).map(r => ({
        year: r.year,
        month: r.month,
        added: r.aa,
        aa: Math.min(1, round2(monthLeaveAA(leaves, personId, r.year, r.month) + r.aa)),
    }));
