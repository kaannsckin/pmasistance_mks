import { isoWeekOf, weekStart } from './weeklyReport';

/**
 * Takvim seçici yardımcıları (saf): ay ızgarası, gün/aralık biçimleri ve
 * aralık seçimi. Günler yerel saatle "YYYY-AA-GG" dizgisi olarak taşınır;
 * hafta Pazartesi başlar (ISO 8601).
 */

export type IsoDay = string; // "2026-10-07"

export interface DayRange {
    start: IsoDay;
    end: IsoDay;
}

export const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const MONTH_ABBR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const WEEKDAY_ABBR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const pad = (n: number) => String(n).padStart(2, '0');

export const toIsoDay = (d: Date): IsoDay => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "YYYY-AA-GG" (ya da ISO zaman damgasının gün kısmı) → yerel gece yarısı; geçersizse null */
export const parseIsoDay = (s: string | undefined | null): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
};

export const addDays = (day: IsoDay, n: number): IsoDay => {
    const d = parseIsoDay(day)!;
    d.setDate(d.getDate() + n);
    return toIsoDay(d);
};

/** Başlangıç ≤ bitiş olacak biçimde sıralar */
export const orderRange = (a: IsoDay, b: IsoDay): DayRange => (a <= b ? { start: a, end: b } : { start: b, end: a });

export const inRange = (day: IsoDay, r: DayRange | null | undefined): boolean => !!r && day >= r.start && day <= r.end;

export const daysInRange = (r: DayRange): number =>
    Math.round((parseIsoDay(r.end)!.getTime() - parseIsoDay(r.start)!.getTime()) / 86_400_000) + 1;

export interface CalendarCell {
    day: IsoDay;
    date: number; // ayın günü
    inMonth: boolean;
    weekend: boolean;
}

export interface CalendarRow {
    year: number; // ISO hafta yılı
    week: number;
    cells: CalendarCell[];
}

/** Ayın takvim ızgarası: Pazartesi başlayan 6 hafta (yükseklik sabit kalsın), ISO hafta numarasıyla */
export const monthGrid = (year: number, month: number /* 0–11 */): CalendarRow[] => {
    const first = new Date(year, month, 1);
    const cur = new Date(first);
    cur.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const rows: CalendarRow[] = [];
    for (let r = 0; r < 6; r++) {
        const wk = isoWeekOf(cur);
        const cells: CalendarCell[] = [];
        for (let i = 0; i < 7; i++) {
            cells.push({ day: toIsoDay(cur), date: cur.getDate(), inMonth: cur.getMonth() === month, weekend: i >= 5 });
            cur.setDate(cur.getDate() + 1);
        }
        rows.push({ year: wk.year, week: wk.week, cells });
    }
    return rows;
};

/** ISO haftasının gün aralığı (workdays: Pazartesi–Cuma, değilse Pazartesi–Pazar) */
export const weekRange = (year: number, week: number, workdays = true): DayRange => {
    const s = weekStart(year, week);
    return { start: toIsoDay(s), end: addDays(toIsoDay(s), workdays ? 4 : 6) };
};

const dayMonth = (d: Date, withYear: boolean) => `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;

/** Tek gün: "7 Eki 2026" */
export const formatDay = (day: IsoDay | undefined | null, withYear = true): string => {
    const d = parseIsoDay(day);
    return d ? dayMonth(d, withYear) : '';
};

/**
 * Aralık: aynı ay "5–9 Eki 2026", farklı ay "28 Eyl – 2 Eki 2026", farklı yıl
 * "29 Ara 2026 – 2 Oca 2027"; tek günse "7 Eki 2026".
 */
export const formatRange = (r: DayRange | null | undefined, withYear = true): string => {
    if (!r) return '';
    const a = parseIsoDay(r.start);
    const b = parseIsoDay(r.end);
    if (!a || !b) return '';
    if (r.start === r.end) return dayMonth(a, withYear);
    const sameYear = a.getFullYear() === b.getFullYear();
    if (sameYear && a.getMonth() === b.getMonth()) return `${a.getDate()}–${dayMonth(b, withYear)}`;
    return `${dayMonth(a, withYear && !sameYear)} – ${dayMonth(b, withYear)}`;
};

/**
 * Aralık seçimi (iki tık): ilk tık başlangıcı, ikinci tık bitişi verir (önce
 * tıklanan gün daha sonraysa yer değiştirir). Seçim bitmişken yeni tık yeniden
 * başlatır. Dönen `done` aralığın tamamlandığını söyler.
 */
export const pickDay = (anchor: IsoDay | null, day: IsoDay): { anchor: IsoDay | null; range: DayRange; done: boolean } =>
    anchor === null ? { anchor: day, range: { start: day, end: day }, done: false } : { anchor: null, range: orderRange(anchor, day), done: true };

/** Hazır aralıklar (bugüne göre) */
export const rangePresets = (now: Date = new Date()): { key: string; label: string; range: DayRange }[] => {
    const today = toIsoDay(now);
    const wk = isoWeekOf(now);
    const thisWeek = weekRange(wk.year, wk.week, false);
    const lastWeek = { start: addDays(thisWeek.start, -7), end: addDays(thisWeek.end, -7) };
    const monthStart = toIsoDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = toIsoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return [
        { key: 'thisWeek', label: 'Bu hafta', range: thisWeek },
        { key: 'lastWeek', label: 'Geçen hafta', range: lastWeek },
        { key: 'thisMonth', label: 'Bu ay', range: { start: monthStart, end: monthEnd } },
        { key: 'last30', label: 'Son 30 gün', range: { start: addDays(today, -29), end: today } },
    ];
};

// ---------------------------------------------------------------- ay aralığı

export interface MonthRange {
    from: number; // 1–12
    to: number; // 1–12
}

export const orderMonths = (a: number, b: number): MonthRange => (a <= b ? { from: a, to: b } : { from: b, to: a });

/** "Mar–May 2026" / tek ay "Mart 2026" */
export const formatMonthRange = (r: MonthRange, year?: number): string => {
    const y = year ? ` ${year}` : '';
    return r.from === r.to ? `${MONTH_NAMES[r.from - 1]}${y}` : `${MONTH_ABBR[r.from - 1]}–${MONTH_ABBR[r.to - 1]}${y}`;
};
