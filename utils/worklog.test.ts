import { describe, expect, it } from 'vitest';
import { parseSpent, parseWorkDate, parseWorklogRows, summarizeWorklog, worklogInWeek } from './worklog';

describe('worklog ayrıştırma', () => {
    it('tarih biçimleri', () => {
        expect(parseWorkDate('2026-10-06 09:00')).toBe('2026-10-06');
        expect(parseWorkDate('06.10.2026')).toBe('2026-10-06');
        expect(parseWorkDate('06/Oct/26 9:00 AM')).toBe('2026-10-06');
        expect(parseWorkDate('6 Eki 2026')).toBe('2026-10-06');
        expect(parseWorkDate(46301)).toBe('2026-10-06'); // Excel seri tarihi
        expect(parseWorkDate('yarın')).toBeNull();
    });

    it('süre biçimleri (1 gün = 8 saat)', () => {
        expect(parseSpent('2h 30m')).toBe(2.5);
        expect(parseSpent('1d 2h')).toBe(10);
        expect(parseSpent('1,5')).toBe(1.5);
        expect(parseSpent('3 sa 15 dk')).toBe(3.25);
        expect(parseSpent(4)).toBe(4);
    });

    it('Jira dışa aktarımı: saniye sütunu öncelikli; geçersiz satırlar atlanır', () => {
        const { entries, error } = parseWorklogRows([
            ['Issue Key', 'Issue summary', 'Full name', 'Work date', 'Time Spent (seconds)', 'Work Description'],
            ['MKS-12', 'Multi-domain desteği', 'Kaan Demir', '2026-10-06', 7200, 'Alan adı doğrulama'],
            ['MKS-12', 'Multi-domain desteği', 'Ali Veli', '2026-10-07', 3600, ''],
            ['MKS-15', 'Arşiv API', 'Kaan Demir', '2026-10-08', 1800, 'Uç tanımları'],
            ['', '', '', 'tarih yok', 3600, ''],
            ['MKS-20', 'Eski', 'Kaan', '2026-09-28', 0, ''],
        ]);
        expect(error).toBeUndefined();
        expect(entries).toHaveLength(3);
        expect(entries[0]).toMatchObject({ issueKey: 'MKS-12', author: 'Kaan Demir', hours: 2, comment: 'Alan adı doğrulama', source: 'file' });
        const sum = summarizeWorklog(entries);
        expect(sum[0]).toMatchObject({ issueKey: 'MKS-12', hours: 3, authors: ['Kaan Demir', 'Ali Veli'], comments: ['Alan adı doğrulama'] });
        expect(worklogInWeek(entries, 2026, 41)).toHaveLength(3);
        expect(worklogInWeek(entries, 2026, 40)).toHaveLength(0);
    });

    it('Türkçe başlıklar ve "Time Spent" metni', () => {
        const { entries } = parseWorklogRows([
            ['Anahtar', 'Özet', 'Kullanıcı', 'Tarih', 'Harcanan süre'],
            ['P-1', 'Kurulum', 'Ayşe', '07.10.2026', '1d 4h'],
        ]);
        expect(entries[0]).toMatchObject({ issueKey: 'P-1', summary: 'Kurulum', author: 'Ayşe', date: '2026-10-07', hours: 12 });
    });

    it('zorunlu sütun yoksa hata', () => {
        expect(parseWorklogRows([['Özet', 'Saat'], ['x', 1]]).error).toMatch(/Tarih/);
        expect(parseWorklogRows([['Tarih', 'Özet'], ['2026-10-06', 'x']]).error).toMatch(/Süre/);
    });
});
