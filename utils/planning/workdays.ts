/**
 * Türkiye iş günü takvimi: hafta sonu ve resmi tatiller (ulusal bayramlar her
 * yıl, dini bayramlar tablo yıllarında). Arife yarım günleri iş günü sayılır
 * (süre ölçümünde gün çözünürlüğü yeterli). Tablo dışındaki yıllarda yalnız
 * sabit tatiller düşülür; yeni yıl eklenince DINI_BAYRAMLAR güncellenmeli.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Sabit resmi tatiller (AA-GG) */
const SABIT = ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29'];

/** Ramazan ve Kurban Bayramı günleri (Diyanet takvimi; ilk–son gün, arifeler hariç) */
const DINI_BAYRAMLAR: Record<number, [string, string][]> = {
    2021: [['05-13', '05-15'], ['07-20', '07-23']],
    2022: [['05-02', '05-04'], ['07-09', '07-12']],
    2023: [['04-21', '04-23'], ['06-28', '07-01']],
    2024: [['04-10', '04-12'], ['06-16', '06-19']],
    2025: [['03-30', '04-01'], ['06-06', '06-09']],
    2026: [['03-20', '03-22'], ['05-27', '05-30']],
    2027: [['03-09', '03-11'], ['05-16', '05-19']],
};

export const HOLIDAY_TABLE_YEARS = Object.keys(DINI_BAYRAMLAR).map(Number);

const cache = new Map<number, Set<string>>();

/** Yılın resmi tatil günleri ("YYYY-AA-GG") */
export const trHolidays = (year: number): Set<string> => {
    const hit = cache.get(year);
    if (hit) return hit;
    const out = new Set(SABIT.map(md => `${year}-${md}`));
    (DINI_BAYRAMLAR[year] || []).forEach(([from, to]) => {
        const d = new Date(`${year}-${from}T00:00:00`);
        const end = new Date(`${year}-${to}T00:00:00`);
        for (; d <= end; d.setDate(d.getDate() + 1)) out.add(isoDay(d));
    });
    cache.set(year, out);
    return out;
};

export const isWorkday = (d: Date): boolean => d.getDay() !== 0 && d.getDay() !== 6 && !trHolidays(d.getFullYear()).has(isoDay(d));

const dayOnly = (v: string | Date): Date => {
    const d = typeof v === 'string' ? new Date(v) : new Date(v);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * İki an arasındaki iş günü sayısı, iki uç günü de içererek: aynı gün açılıp
 * kapanan kayıt 1 iş günü. Bitiş başlangıçtan önceyse null. Uçlar iş günü
 * değilse (hafta sonu kapanış) sayılmaz; hiç iş günü yoksa 0.
 */
export const workdaysBetween = (start: string | Date, end: string | Date): number | null => {
    const a = dayOnly(start), b = dayOnly(end);
    if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return null;
    let n = 0;
    for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (isWorkday(d)) n++;
    return n;
};

/** Bir ayın iş günü sayısı (1–12) */
export const workdaysInMonth = (year: number, month: number): number =>
    workdaysBetween(new Date(year, month - 1, 1), new Date(year, month, 0)) || 0;

/** Başlangıçtan itibaren n iş günü sonraki iş günü (n = 1 → başlangıç ya da sonraki ilk iş günü) */
export const addWorkdays = (start: Date, n: number): Date => {
    const d = dayOnly(start);
    let left = Math.max(1, Math.ceil(n));
    for (;;) {
        if (isWorkday(d) && --left === 0) return d;
        d.setDate(d.getDate() + 1);
    }
};
