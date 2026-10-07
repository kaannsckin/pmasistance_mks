import { WorklogEntry } from '../types';
import { isoWeekOf } from './weeklyReport';

/**
 * Jira worklog dışa aktarımı (Excel/CSV; Tempo ya da "Work log" raporları)
 * → worklog kayıtları. Sütunlar Türkçe/İngilizce başlıklardan tanınır.
 */

const lower = (s: unknown) => String(s ?? '').trim().toLocaleLowerCase('tr-TR');

const COLS: Record<'date' | 'author' | 'key' | 'summary' | 'hours' | 'seconds' | 'spent' | 'comment', string[]> = {
    date: ['work date', 'worklog date', 'started', 'start date', 'date', 'tarih', 'başlangıç'],
    author: ['full name', 'author', 'user', 'worker', 'kullanıcı', 'kişi', 'yazar', 'çalışan'],
    key: ['issue key', 'key', 'anahtar', 'kayıt no', 'issue'],
    summary: ['issue summary', 'summary', 'özet', 'başlık', 'konu'],
    hours: ['hours', 'hour', 'saat', 'time spent (h)', 'logged hours'],
    seconds: ['time spent (seconds)', 'timespentseconds', 'seconds', 'saniye'],
    spent: ['time spent', 'harcanan süre', 'süre'],
    comment: ['work description', 'worklog comment', 'comment', 'açıklama', 'yorum', 'description'],
};

const findCol = (headers: string[], keys: string[], used: Set<number>): number => {
    for (const k of keys) {
        const i = headers.findIndex((h, idx) => !used.has(idx) && h === k);
        if (i !== -1) return i;
    }
    for (const k of keys) {
        const i = headers.findIndex((h, idx) => !used.has(idx) && h.includes(k));
        if (i !== -1) return i;
    }
    return -1;
};

const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_TR = ['oca', 'şub', 'mar', 'nis', 'may', 'haz', 'tem', 'ağu', 'eyl', 'eki', 'kas', 'ara'];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Excel seri tarihi, ISO, GG.AA.YYYY, Jira "07/Oct/26 9:00 AM" biçimleri */
export const parseWorkDate = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && v > 20000 && v < 80000) {
        const d = new Date(Math.round((v - 25569) * 86400000));
        return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(s);
    if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = /^(\d{1,2})[/ -]([a-zçğıöşü]{3})[a-zçğıöşü]*[/ -](\d{2,4})/iu.exec(s);
    if (m) {
        const mon = m[2].toLocaleLowerCase('tr-TR');
        const idx = MONTHS_EN.indexOf(mon) !== -1 ? MONTHS_EN.indexOf(mon) : MONTHS_TR.indexOf(mon);
        if (idx !== -1) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], idx + 1, +m[1]);
    }
    return null;
};

/** "2h 30m", "1d 2h", "1,5" → saat (1 gün = 8 saat) */
export const parseSpent = (v: unknown): number => {
    if (typeof v === 'number') return v;
    const s = lower(v);
    if (!s) return 0;
    const parts = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*(w|d|h|m|g|sa|dk)\b/g)];
    if (parts.length) {
        return parts.reduce((sum, [, n, u]) => {
            const x = parseFloat(n.replace(',', '.'));
            if (u === 'w') return sum + x * 40;
            if (u === 'd' || u === 'g') return sum + x * 8;
            if (u === 'h' || u === 'sa') return sum + x;
            return sum + x / 60;
        }, 0);
    }
    const n = parseFloat(s.replace(',', '.'));
    return isNaN(n) ? 0 : n;
};

export const parseWorklogRows = (rows: unknown[][]): { entries: WorklogEntry[]; error?: string } => {
    if (!rows || rows.length < 2) return { entries: [], error: 'Dosyada başlık satırı ve en az bir kayıt olmalı.' };
    const headers = rows[0].map(lower);
    const used = new Set<number>();
    const col = (k: keyof typeof COLS) => { const i = findCol(headers, COLS[k], used); if (i !== -1) used.add(i); return i; };
    const c = { date: col('date'), key: col('key'), summary: col('summary'), seconds: col('seconds'), hours: col('hours'), spent: col('spent'), author: col('author'), comment: col('comment') };
    if (c.date === -1) return { entries: [], error: 'Tarih sütunu bulunamadı ("Work date", "Started" ya da "Tarih").' };
    if (c.seconds === -1 && c.hours === -1 && c.spent === -1) return { entries: [], error: 'Süre sütunu bulunamadı ("Hours", "Time Spent" ya da "Saat").' };
    const entries: WorklogEntry[] = [];
    rows.slice(1).forEach(row => {
        const date = parseWorkDate(row[c.date]);
        if (!date) return;
        const hours = c.seconds !== -1 ? (Number(row[c.seconds]) || 0) / 3600 : c.hours !== -1 ? parseSpent(row[c.hours]) : parseSpent(row[c.spent]);
        if (!(hours > 0)) return;
        entries.push({
            date,
            author: c.author !== -1 ? String(row[c.author] ?? '').trim() : '',
            issueKey: c.key !== -1 ? String(row[c.key] ?? '').trim() || undefined : undefined,
            summary: c.summary !== -1 ? String(row[c.summary] ?? '').trim() : '',
            hours: Math.round(hours * 100) / 100,
            comment: c.comment !== -1 ? String(row[c.comment] ?? '').trim() || undefined : undefined,
            source: 'file',
        });
    });
    return entries.length ? { entries } : { entries, error: 'Dosyada okunabilir worklog kaydı yok.' };
};

export const worklogInWeek = (entries: WorklogEntry[], year: number, week: number): WorklogEntry[] =>
    entries.filter(e => {
        const [y, m, d] = e.date.split('-').map(Number);
        const w = isoWeekOf(new Date(y, m - 1, d));
        return w.year === year && w.week === week;
    });

export interface WorklogIssue {
    issueKey?: string;
    summary: string;
    hours: number;
    authors: string[];
    comments: string[];
}

/** Konu (kayıt) bazında toplam süre; en çok emek verilen başta */
export const summarizeWorklog = (entries: WorklogEntry[]): WorklogIssue[] => {
    const map = new Map<string, WorklogIssue>();
    entries.forEach(e => {
        const k = e.issueKey || e.summary || '—';
        const cur = map.get(k) || { issueKey: e.issueKey, summary: e.summary, hours: 0, authors: [], comments: [] };
        cur.hours = Math.round((cur.hours + e.hours) * 100) / 100;
        if (e.author && !cur.authors.includes(e.author)) cur.authors.push(e.author);
        if (e.comment && !cur.comments.includes(e.comment)) cur.comments.push(e.comment);
        map.set(k, cur);
    });
    return [...map.values()].sort((a, b) => b.hours - a.hours || (a.issueKey || '').localeCompare(b.issueKey || '', 'tr'));
};
