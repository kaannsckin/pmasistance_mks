import { Person, Project, TaskStatus, WorklogEntry } from '../types';
import { BilledHoursRecord } from './billedHours';
import { MONTH_INDEXES } from './allocations';
import { AA_WORKDAYS_PER_MONTH, AllocationSuggestion, SuggestionResult } from './taskToAllocation';
import { isUnassigned } from './planning/jiraPeople';

/**
 * Jira → ekip tahsisi.
 *
 *  - Gerçekleşen: Jira worklog'ları (yalnız bu projedeki Jira kayıtlarına
 *    yazılanlar) kişi × ay saatine toplanır ve "Billed Hours" yoluyla
 *    gerçekleşen AA'ya çevrilir (saat ÷ 8 ÷ ayın iş günü).
 *  - Plan: Jira'da birine atanmış açık işlerin kalan eforu (gün), bugünden
 *    termine kadar iş günlerine eşit yayılır; termin yoksa bugünden başlayarak
 *    eforu kadar iş gününe. Sonuç tahsis önerisi olarak gösterilir, PY onaylayınca
 *    "boş ayları doldur" ya da "üzerine yaz" ile tahsis tablosuna yazılır.
 */

const keyOf = (s: string | undefined) => (s || '').trim().toUpperCase();
const trKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Projede Jira anahtarı olan görevlerin anahtarları */
export const projectJiraKeys = (project: Pick<Project, 'tasks'>): Set<string> =>
    new Set(project.tasks.map(t => keyOf(t.jiraId)).filter(k => /^[A-Z][A-Z0-9_]+-\d+$/.test(k)));

/** Worklog'lar → Billed Hours kayıtları (proje adıyla; yalnız seçilen yıl ve bu projenin kayıtları) */
export const worklogsToBilled = (entries: WorklogEntry[], project: Pick<Project, 'name' | 'tasks'>, year: number, onlyProjectKeys = true): { records: BilledHoursRecord[]; hours: number; skipped: number } => {
    const keys = projectJiraKeys(project);
    const sum = new Map<string, BilledHoursRecord>();
    let hours = 0, skipped = 0;
    entries.forEach(e => {
        const d = (e.date || '').slice(0, 10);
        const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
        if (y !== year || !m || !(e.hours > 0) || !e.author) return;
        if (onlyProjectKeys && keys.size && !keys.has(keyOf(e.issueKey))) { skipped++; return; }
        const k = `${trKey(e.author)}|${m}`;
        const r = sum.get(k) || { projectName: project.name, personName: e.author.trim(), month: m, hours: 0 };
        r.hours += e.hours;
        sum.set(k, r);
        hours += e.hours;
    });
    return { records: [...sum.values()].map(r => ({ ...r, hours: round2(r.hours) })), hours: round2(hours), skipped };
};

const isWorkday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

/** [from, to] arasındaki iş günleri (ikisi dahil); `limit` verilirse en çok o kadar */
const workdays = (from: Date, to: Date | null, limit?: number): Date[] => {
    const out: Date[] = [];
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (let i = 0; i < 800; i++) {
        if (to && d > to) break;
        if (isWorkday(d)) out.push(new Date(d));
        if (limit !== undefined && out.length >= limit) break;
        d.setDate(d.getDate() + 1);
    }
    return out;
};

export interface JiraPlanResult extends SuggestionResult {
    /** Atanmamış, eforu ya da kalan işi olmayan açık kayıtlar */
    skipped: number;
    /** Termini geçmiş (bugüne yazılan) kayıtlar */
    overdue: number;
}

/**
 * Jira'daki atamalardan tahsis planı önerisi. Yalnız Jira anahtarlı, açık,
 * birine atanmış ve eforu olan görevler sayılır; kalan efor = tahmin − harcanan.
 */
export const suggestAllocationsFromJira = (project: Pick<Project, 'tasks'>, people: Person[], year: number, today: Date = new Date()): JiraPlanResult => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const byPerson = new Map<string, Map<number, number>>(); // kaynak adı → ay → gün
    let taskCount = 0, skipped = 0, overdue = 0, clipped = false;
    project.tasks.forEach(t => {
        if (!keyOf(t.jiraId) || t.status === TaskStatus.Done || t.includeInSprints === false) return;
        const effort = t.time?.avg || t.time?.best || 0;
        const remaining = Math.max(0, effort - (t.actualHours || 0) / 8);
        if (isUnassigned(t.resourceName) || remaining <= 0) { skipped++; return; }
        taskCount++;
        let days: Date[];
        if (t.dueDate) {
            const due = parseDay(t.dueDate);
            days = workdays(start, due);
            if (!days.length) { overdue++; days = workdays(start, null, 1); } // termin geçmiş: kalan iş bugünden
        } else {
            days = workdays(start, null, Math.max(1, Math.ceil(remaining)));
        }
        const perDay = remaining / days.length;
        const map = byPerson.get(t.resourceName.trim()) || new Map<number, number>();
        days.forEach(d => {
            if (d.getFullYear() !== year) { clipped = true; return; }
            map.set(d.getMonth() + 1, (map.get(d.getMonth() + 1) || 0) + perDay);
        });
        byPerson.set(t.resourceName.trim(), map);
    });
    const personByName = new Map(people.map(p => [trKey(`${p.firstName} ${p.lastName}`), p]));
    const suggestions: AllocationSuggestion[] = [];
    const unmatched: string[] = [];
    byPerson.forEach((map, name) => {
        const months: Record<number, number> = {};
        let total = 0;
        MONTH_INDEXES.forEach(m => {
            const aa = round2((map.get(m) || 0) / AA_WORKDAYS_PER_MONTH);
            if (aa > 0) { months[m] = aa; total += aa; }
        });
        if (!total) return;
        const person = personByName.get(trKey(name));
        if (!person) unmatched.push(name);
        suggestions.push({ resourceName: name, personId: person?.id, personLabel: person ? `${person.firstName} ${person.lastName}`.trim() : name, months, totalAA: round2(total), matched: !!person });
    });
    suggestions.sort((a, b) => a.personLabel.localeCompare(b.personLabel, 'tr'));
    return { suggestions, unmatched, clippedOutsideYear: clipped, sprintCount: 0, taskCount, skipped, overdue };
};

/** Yılın ilk ve son günü (worklog sorgusu için; bugünden ileri gidilmez) */
export const yearRange = (year: number, today: Date = new Date()): { from: string; to: string } => {
    const end = new Date(year, 11, 31);
    return { from: `${year}-01-01`, to: ymd(end < today ? end : today) };
};
