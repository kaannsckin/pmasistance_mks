import { describe, expect, it } from 'vitest';
import {
    addDays, daysInRange, formatDay, formatMonthRange, formatRange, inRange, monthGrid, orderMonths, orderRange, parseIsoDay, pickDay, rangePresets, toIsoDay, weekRange,
} from './calendarRange';

describe('gün dizgileri', () => {
    it('yerel gün biçimi ve ayrıştırma; geçersiz gün null', () => {
        expect(toIsoDay(new Date(2026, 9, 7, 23, 30))).toBe('2026-10-07');
        expect(parseIsoDay('2026-10-07T10:00:00Z')!.getDate()).toBe(7);
        expect(parseIsoDay('2026-02-30')).toBeNull();
        expect(parseIsoDay('')).toBeNull();
        expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    });

    it('aralık sıralama, içerme ve gün sayısı', () => {
        const r = orderRange('2026-10-09', '2026-10-05');
        expect(r).toEqual({ start: '2026-10-05', end: '2026-10-09' });
        expect(inRange('2026-10-07', r)).toBe(true);
        expect(inRange('2026-10-10', r)).toBe(false);
        expect(daysInRange(r)).toBe(5);
    });
});

describe('monthGrid', () => {
    it('Pazartesi başlar, 6 hafta, ISO hafta numaralı', () => {
        const g = monthGrid(2026, 9); // Ekim 2026: 1 Ekim Perşembe
        expect(g).toHaveLength(6);
        expect(g[0].cells[0]).toMatchObject({ day: '2026-09-28', inMonth: false });
        expect(g[0].cells[3]).toMatchObject({ day: '2026-10-01', inMonth: true, weekend: false });
        expect(g[0].cells[5].weekend).toBe(true);
        expect(g[0]).toMatchObject({ year: 2026, week: 40 });
        expect(g[1]).toMatchObject({ week: 41 });
        // Yıl sonu: 28 Aralık 2026 → 2026'nın 53. haftası
        expect(monthGrid(2026, 11)[4]).toMatchObject({ year: 2026, week: 53 });
    });
});

describe('biçimler', () => {
    it('gün ve aralık', () => {
        expect(formatDay('2026-10-07')).toBe('7 Eki 2026');
        expect(formatRange({ start: '2026-10-05', end: '2026-10-09' })).toBe('5–9 Eki 2026');
        expect(formatRange({ start: '2026-09-28', end: '2026-10-02' })).toBe('28 Eyl – 2 Eki 2026');
        expect(formatRange({ start: '2026-12-29', end: '2027-01-02' })).toBe('29 Ara 2026 – 2 Oca 2027');
        expect(formatRange({ start: '2026-10-07', end: '2026-10-07' })).toBe('7 Eki 2026');
        expect(formatRange({ start: '2026-10-05', end: '2026-10-09' }, false)).toBe('5–9 Eki');
    });

    it('hafta aralığı iş günü ya da tam hafta', () => {
        expect(weekRange(2026, 41)).toEqual({ start: '2026-10-05', end: '2026-10-09' });
        expect(weekRange(2026, 41, false).end).toBe('2026-10-11');
    });

    it('ay aralığı', () => {
        expect(orderMonths(9, 3)).toEqual({ from: 3, to: 9 });
        expect(formatMonthRange({ from: 3, to: 5 }, 2026)).toBe('Mar–May 2026');
        expect(formatMonthRange({ from: 3, to: 3 })).toBe('Mart');
    });
});

describe('pickDay ve hazır aralıklar', () => {
    it('iki tıkla aralık; ters sırada tıklama düzeltilir', () => {
        let s = pickDay(null, '2026-10-09');
        expect(s).toMatchObject({ anchor: '2026-10-09', done: false });
        s = pickDay(s.anchor, '2026-10-05');
        expect(s).toEqual({ anchor: null, range: { start: '2026-10-05', end: '2026-10-09' }, done: true });
    });

    it('bu hafta, geçen hafta, bu ay, son 30 gün', () => {
        const p = rangePresets(new Date(2026, 9, 7));
        expect(p.map(x => x.range)).toEqual([
            { start: '2026-10-05', end: '2026-10-11' },
            { start: '2026-09-28', end: '2026-10-04' },
            { start: '2026-10-01', end: '2026-10-31' },
            { start: '2026-09-08', end: '2026-10-07' },
        ]);
    });
});
