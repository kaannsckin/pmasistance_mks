import { Note } from '../types';
import { isoWeekOf } from './weeklyReport';

/**
 * Günlük (proje notları) — saf yardımcılar. Not sözdizimi klasik ekranla
 * aynıdır: #etiket, @kişi, [ ] / [x] görev, #anımsatıcı, **kalın**, *italik*,
 * ==vurgu==, [c:#renk]…[/c] renkli metin. Satır bazında "gelişme notu"
 * (lineUpdates) tutulur.
 */

export const PREDEFINED_TAGS = ['Toplantı', 'Karar', 'Risk', 'Fikir', 'Acil', 'anımsatıcı', 'todo'];

const TAG_RE = /#[\w\-ğüşöçİĞÜŞÖÇı]+/g;
// Kişi adı boşluksuz yazılır (öneriden seçilince "@AyşeYılmaz")
const MENTION_RE = /@[\w\-ğüşöçİĞÜŞÖÇı]+/g;

export const parseContent = (content: string): { tags: string[]; mentions: string[] } => ({
    tags: (content.match(TAG_RE) || []).map(t => t.substring(1)),
    mentions: (content.match(MENTION_RE) || []).map(m => m.substring(1)),
});

/** Seçilen güne (yerel) not: bugünse şimdiki saat, geçmiş günse (saat dilimi kaymasın diye) öğlen 12:00 */
export const createNote = (content: string, day: string, now: Date = new Date()): Note => {
    const [y, m, d] = day.split('-').map(Number);
    const isToday = y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate();
    const at = !(y && m && d) || isToday ? now : new Date(y, m - 1, d, 12);
    const w = isoWeekOf(at);
    return {
        id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        content,
        createdAt: at.toISOString(),
        weekNumber: w.week,
        year: w.year,
        ...parseContent(content),
    };
};

export const editNoteContent = (note: Note, content: string): Note => ({ ...note, content, ...parseContent(content) });

// ---------------------------------------------------------------- satır biçimi

export type NoteToken =
    | { kind: 'text'; text: string; color?: string }
    | { kind: 'bold' | 'italic' | 'mark'; text: string; color?: string }
    | { kind: 'todo'; done: boolean }
    | { kind: 'tag'; tag: string }
    | { kind: 'mention'; name: string };

const SPLIT_RE = /(\*\*.*?\*\*|\*.*?\*|==.*?==|\[\s?\]|\[x\]|\[c:[^\]]+\]|\[\/c\]|#[\w\-ğüşöçİĞÜŞÖÇı]+|@[\w\-ğüşöçİĞÜŞÖÇı]+)/g;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i;

/** Bir not satırını görüntülenecek parçalara böler (HTML üretmez; React metin olarak basar) */
export const tokenizeLine = (line: string): NoteToken[] => {
    const out: NoteToken[] = [];
    let color: string | undefined;
    line.split(SPLIT_RE).forEach(part => {
        if (!part) return;
        if (part === '[ ]' || part === '[]') { out.push({ kind: 'todo', done: false }); return; }
        if (part === '[x]') { out.push({ kind: 'todo', done: true }); return; }
        if (part.startsWith('[c:')) { const c = part.slice(3, -1).trim(); color = SAFE_COLOR.test(c) ? c : undefined; return; }
        if (part === '[/c]') { color = undefined; return; }
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) { out.push({ kind: 'bold', text: part.slice(2, -2), color }); return; }
        if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) { out.push({ kind: 'italic', text: part.slice(1, -1), color }); return; }
        if (part.length > 4 && part.startsWith('==') && part.endsWith('==')) { out.push({ kind: 'mark', text: part.slice(2, -2) }); return; }
        if (part.startsWith('#') && part.length > 1) { out.push({ kind: 'tag', tag: part.substring(1) }); return; }
        if (part.startsWith('@') && part.length > 1) { out.push({ kind: 'mention', name: part.substring(1).trim() }); return; }
        out.push({ kind: 'text', text: part, color });
    });
    return out;
};

export const isDoneLine = (line: string): boolean => line.trim().startsWith('[x]');

// ---------------------------------------------------------------- görevler ve anımsatıcılar

export interface TodoLine {
    noteId: string;
    lineIndex: number;
    text: string;
    done: boolean;
    createdAt: string;
}

const stripMarks = (s: string) => s.replace(/\[c:[^\]]+\]|\[\/c\]/g, '').replace(/\*\*|==/g, '').trim();

export const todoLines = (notes: Note[]): TodoLine[] =>
    notes.flatMap(n => (n.content || '').split('\n').flatMap((line, i) => {
        if (!/\[\s?\]|\[x\]/.test(line)) return [];
        return [{ noteId: n.id, lineIndex: i, text: stripMarks(line.replace(/\[\s?x?\]/g, '')), done: line.includes('[x]'), createdAt: n.createdAt }];
    })).sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt));

export interface ReminderLine {
    noteId: string;
    lineIndex: number;
    text: string;
    createdAt: string;
}

export const reminderLines = (notes: Note[]): ReminderLine[] =>
    notes.flatMap(n => (n.content || '').split('\n').flatMap((line, i) =>
        line.toLocaleLowerCase('tr-TR').includes('#anımsatıcı')
            ? [{ noteId: n.id, lineIndex: i, text: stripMarks(line.replace(/#anımsatıcı/giu, '')), createdAt: n.createdAt }]
            : []))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** Satırdaki görevi işaretle / geri al */
export const toggleTodo = (note: Note, lineIndex: number): Note => {
    const lines = note.content.split('\n');
    const line = lines[lineIndex];
    if (line === undefined) return note;
    if (/\[\s?\]/.test(line)) lines[lineIndex] = line.replace(/\[\s?\]/, '[x]');
    else if (line.includes('[x]')) lines[lineIndex] = line.replace('[x]', '[ ]');
    else return note;
    return editNoteContent(note, lines.join('\n'));
};

/** Satırı ve gelişme notunu güncelle (boş gelişme notu silinir) */
export const updateLine = (note: Note, lineIndex: number, text: string, update: string): Note => {
    const lines = note.content.split('\n');
    lines[lineIndex] = text;
    const lineUpdates = { ...(note.lineUpdates || {}) };
    if (update.trim()) lineUpdates[lineIndex] = update.trim(); else delete lineUpdates[lineIndex];
    return { ...editNoteContent(note, lines.join('\n')), lineUpdates };
};

// ---------------------------------------------------------------- süzme ve gruplama

export const allTags = (notes: Note[]): { tag: string; count: number }[] => {
    const m = new Map<string, { tag: string; count: number }>();
    PREDEFINED_TAGS.forEach(t => m.set(t.toLocaleLowerCase('tr-TR'), { tag: t, count: 0 }));
    notes.forEach(n => new Set(n.tags.map(t => t.toLocaleLowerCase('tr-TR'))).forEach(k => {
        const cur = m.get(k) || { tag: n.tags.find(t => t.toLocaleLowerCase('tr-TR') === k) || k, count: 0 };
        cur.count++;
        m.set(k, cur);
    }));
    return [...m.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'tr'));
};

export const filterNotes = (notes: Note[], o: { tag?: string | null; query?: string }): Note[] => {
    const tag = o.tag?.toLocaleLowerCase('tr-TR');
    const q = o.query?.trim().toLocaleLowerCase('tr-TR');
    return notes.filter(n =>
        (!tag || n.tags.some(t => t.toLocaleLowerCase('tr-TR') === tag))
        && (!q || [n.content, ...Object.values(n.lineUpdates || {})].join('\n').toLocaleLowerCase('tr-TR').includes(q)));
};

export interface NoteDay {
    key: string; // YYYY-MM-DD (yerel)
    label: string;
    notes: Note[];
}

export interface NoteWeek {
    year: number;
    week: number;
    days: NoteDay[];
    count: number;
}

const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Haftalara, hafta içinde günlere göre (en yeni önce) */
export const groupNotesByWeek = (notes: Note[]): NoteWeek[] => {
    const weeks = new Map<string, NoteWeek>();
    [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach(n => {
        const w = isoWeekOf(new Date(n.createdAt));
        const wk = `${w.year}-${w.week}`;
        if (!weeks.has(wk)) weeks.set(wk, { year: w.year, week: w.week, days: [], count: 0 });
        const week = weeks.get(wk)!;
        const k = dayKey(n.createdAt);
        let day = week.days.find(d => d.key === k);
        if (!day) {
            day = { key: k, label: new Date(n.createdAt).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }), notes: [] };
            week.days.push(day);
        }
        day.notes.push(n);
        week.count++;
    });
    return [...weeks.values()];
};
