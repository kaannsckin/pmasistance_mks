import { JIRA_WORK_TIME_ZONE } from './jiraHistory';
import type { JiraIssueWorklog } from './integrations';
import { Person, Project, Task, TaskJiraWorklog, TitleDef, WorklogEntry, WorkspaceData } from '../types';
import { fullName } from './dataPool';
import { effectiveWorkdays } from './planning/workdays';

/**
 * İş güçleri: Jira worklog'larından (billing hours) kim, hangi kayıtta, ne kadar
 * zaman harcamış ve bunun maliyeti. Veri, görev Jira kaydıyla eşitlenince
 * `task.jiraWorklog` alanına yazılır (bkz. useJiraWorklogRefresh).
 *
 * Maliyet = saat × saatlik oran; saatlik oran = ünvanın aylık maliyeti ÷
 * (o ayın iş günü × 8 saat). Ünvanı ya da ünvan maliyeti olmayan kişinin saati
 * "maliyetlenemeyen" olarak ayrıca sayılır; havuzda olmayan Jira kullanıcıları
 * da ayrıca listelenir ki rakamların eksik olduğu bilinsin.
 */

export const HOURS_PER_DAY = 8;

const nameKey = (s: string): string =>
    s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');

/** Worklog yazarını havuzdaki kişiyle eşleştirir: önce e-posta, sonra ad soyad */
export const matchWorklogPerson = (people: Person[], author: string, email?: string): Person | undefined => {
    const e = (email || '').trim().toLowerCase();
    if (e) {
        const hit = people.find(p => (p.email || '').trim().toLowerCase() === e);
        if (hit) return hit;
    }
    const k = nameKey(author || '');
    return k ? people.find(p => nameKey(fullName(p)) === k) : undefined;
};

/** Kişinin o ayki saatlik maliyeti (₺); ünvan ya da ünvan maliyeti yoksa null */
export const hourlyRate = (person: Person | undefined, titles: TitleDef[], date: string): number | null => {
    if (!person?.titleCode) return null;
    const monthly = titles.find(t => t.code === person.titleCode)?.monthlyCost;
    if (!monthly || monthly <= 0) return null;
    const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
    const days = effectiveWorkdays(y, m);
    return days > 0 ? monthly / (days * HOURS_PER_DAY) : null;
};

export interface WorkforceFilter {
    from?: string; // YYYY-AA-GG (dahil)
    to?: string; // YYYY-AA-GG (dahil)
    /** Kişi adı, Jira anahtarı ya da kayıt özetinde geçen metin */
    query?: string;
}

export interface WorkforceEntry {
    projectId: string;
    projectName: string;
    taskId: string;
    issueKey: string;
    summary: string;
    author: string;
    person?: Person;
    date: string;
    hours: number;
    cost: number | null;
}

export interface PersonRow {
    key: string; // personId ya da "jira:<ad>"
    person?: Person;
    name: string;
    hours: number;
    cost: number;
    uncostedHours: number;
    records: number;
    projects: number;
    lastDate: string;
    entries: WorkforceEntry[];
}

export interface RecordRow {
    taskId: string;
    projectId: string;
    projectName: string;
    issueKey: string;
    summary: string;
    hours: number;
    cost: number;
    uncostedHours: number;
    people: { key: string; name: string; person?: Person; hours: number; cost: number | null }[];
}

export interface WorkforceReport {
    totalHours: number;
    totalCost: number;
    uncostedHours: number;
    people: PersonRow[];
    records: RecordRow[];
    /** Havuzda karşılığı bulunmayan Jira kullanıcıları (saatleri dahil, maliyetleri yok) */
    unmatchedAuthors: string[];
    /** Worklog'u çekilmiş ve henüz çekilmemiş (Jira'da harcanan süresi olan) görev sayıları */
    syncedTasks: number;
    pendingTasks: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const contains = (hay: string, q: string) => hay.toLocaleLowerCase('tr-TR').includes(q);

/** Seçili projelerdeki worklog satırları (tarih süzgeciyle), kişi ve maliyetle */
export const collectWorkforceEntries = (ws: Pick<WorkspaceData, 'people' | 'titles'>, projects: Project[], f: WorkforceFilter = {}): WorkforceEntry[] => {
    const out: WorkforceEntry[] = [];
    const cache = new Map<string, Person | undefined>();
    for (const p of projects) {
        for (const t of p.tasks) {
            if (!t.jiraId || !t.jiraWorklog) continue;
            for (const e of t.jiraWorklog.entries) {
                if ((f.from && e.date < f.from) || (f.to && e.date > f.to)) continue;
                const ck = `${e.email || ''}|${e.author}`;
                if (!cache.has(ck)) cache.set(ck, matchWorklogPerson(ws.people, e.author, e.email));
                const person = cache.get(ck);
                const rate = hourlyRate(person, ws.titles, e.date);
                out.push({
                    projectId: p.id, projectName: p.name, taskId: t.id, issueKey: t.jiraId, summary: t.name,
                    author: person ? fullName(person) : e.author, person, date: e.date, hours: e.hours,
                    cost: rate === null ? null : rate * e.hours,
                });
            }
        }
    }
    const q = (f.query || '').trim().toLocaleLowerCase('tr-TR');
    return q ? out.filter(e => contains(e.author, q) || contains(e.issueKey, q) || contains(e.summary, q)) : out;
};

export const buildWorkforce = (ws: Pick<WorkspaceData, 'people' | 'titles'>, projects: Project[], f: WorkforceFilter = {}): WorkforceReport => {
    const entries = collectWorkforceEntries(ws, projects, f);
    const byPerson = new Map<string, PersonRow>();
    const byRecord = new Map<string, RecordRow & { _p: Map<string, RecordRow['people'][number]> }>();
    const unmatched = new Set<string>();
    let totalHours = 0, totalCost = 0, uncosted = 0;

    for (const e of entries) {
        totalHours += e.hours;
        if (e.cost === null) uncosted += e.hours; else totalCost += e.cost;
        if (!e.person) unmatched.add(e.author);
        const pk = e.person ? e.person.id : `jira:${e.author}`;

        let pr = byPerson.get(pk);
        if (!pr) byPerson.set(pk, pr = { key: pk, person: e.person, name: e.author, hours: 0, cost: 0, uncostedHours: 0, records: 0, projects: 0, lastDate: '', entries: [] });
        pr.hours += e.hours;
        if (e.cost === null) pr.uncostedHours += e.hours; else pr.cost += e.cost;
        if (e.date > pr.lastDate) pr.lastDate = e.date;
        pr.entries.push(e);

        let rr = byRecord.get(e.taskId);
        if (!rr) byRecord.set(e.taskId, rr = { taskId: e.taskId, projectId: e.projectId, projectName: e.projectName, issueKey: e.issueKey, summary: e.summary, hours: 0, cost: 0, uncostedHours: 0, people: [], _p: new Map() });
        rr.hours += e.hours;
        if (e.cost === null) rr.uncostedHours += e.hours; else rr.cost += e.cost;
        let rp = rr._p.get(pk);
        if (!rp) rr._p.set(pk, rp = { key: pk, name: e.author, person: e.person, hours: 0, cost: 0 });
        rp.hours += e.hours;
        rp.cost = e.cost === null || rp.cost === null ? null : rp.cost + e.cost;
    }

    const people = [...byPerson.values()].map(p => ({
        ...p,
        hours: r2(p.hours), cost: Math.round(p.cost), uncostedHours: r2(p.uncostedHours),
        records: new Set(p.entries.map(e => e.taskId)).size,
        projects: new Set(p.entries.map(e => e.projectId)).size,
    })).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'tr'));

    const records = [...byRecord.values()].map(({ _p, ...r }) => ({
        ...r,
        hours: r2(r.hours), cost: Math.round(r.cost), uncostedHours: r2(r.uncostedHours),
        people: [..._p.values()].map(x => ({ ...x, hours: r2(x.hours), cost: x.cost === null ? null : Math.round(x.cost) })).sort((a, b) => b.hours - a.hours),
    })).sort((a, b) => b.hours - a.hours || a.issueKey.localeCompare(b.issueKey));

    const linked = projects.flatMap(p => p.tasks).filter(t => t.jiraId);
    return {
        totalHours: r2(totalHours), totalCost: Math.round(totalCost), uncostedHours: r2(uncosted),
        people, records, unmatchedAuthors: [...unmatched].sort((a, b) => a.localeCompare(b, 'tr')),
        syncedTasks: linked.filter(t => t.jiraWorklog).length,
        pendingTasks: linked.filter(needsWorklogRefresh).length,
    };
};

/** Bir kişinin (ya da kaydın) saatleri aylara göre: [{ ay: 'YYYY-AA', saat }] */
export const hoursByMonth = (entries: Pick<WorkforceEntry, 'date' | 'hours'>[]): { month: string; hours: number }[] => {
    const m = new Map<string, number>();
    entries.forEach(e => m.set(e.date.slice(0, 7), (m.get(e.date.slice(0, 7)) || 0) + e.hours));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, hours]) => ({ month, hours: r2(hours) }));
};

// ---------------------------------------------------------------- yenileme

/**
 * Worklog'u (yeniden) çekilmeli mi: Jira'daki harcanan süre (actualHours),
 * worklog'ların en son çekildiği andakinden farklıysa. Harcanan süresi olmayan
 * ve hiç çekilmemiş kayıtlar istenmez.
 */
export const needsWorklogRefresh = (t: Pick<Task, 'jiraId' | 'actualHours' | 'jiraWorklog'>): boolean =>
    !!t.jiraId && (t.actualHours || 0) !== (t.jiraWorklog?.forHours ?? 0);

/** Worklog'u çekilecek Jira anahtarları (proje sırasıyla, en çok `limit`); `force` tüm bağlı kayıtları ister */
export const pendingWorklogKeys = (projects: Pick<Project, 'tasks'>[], limit: number, force = false): string[] => {
    const keys: string[] = [];
    for (const p of projects) {
        for (const t of p.tasks) {
            if (!t.jiraId || keys.includes(t.jiraId.toUpperCase())) continue;
            if (force ? !!t.jiraId : needsWorklogRefresh(t)) keys.push(t.jiraId.toUpperCase());
            if (keys.length >= limit) return keys;
        }
    }
    return keys;
};

/**
 * Çekilen worklog'ları görevlere yazar. İstenen her anahtar için (Jira'da hiç
 * worklog yoksa da) kayıt yazılır ki aynı anahtar tekrar tekrar istenmesin;
 * Jira'da bulunamayan kayıtlar dokunulmadan bırakılır. Değişen yoksa aynı nesne döner.
 */
export const applyIssueWorklogs = (
    project: Project,
    requested: string[],
    entries: JiraIssueWorklog[],
    missing: string[],
    now: Date = new Date(),
): Project => {
    const want = new Set(requested.map(k => k.toUpperCase()));
    missing.forEach(k => want.delete(k.toUpperCase()));
    if (!project.tasks.some(t => t.jiraId && want.has(t.jiraId.toUpperCase()))) return project;
    const byKey = new Map<string, TaskJiraWorklog['entries']>();
    entries.forEach(e => {
        const k = e.issueKey.toUpperCase();
        if (!byKey.has(k)) byKey.set(k, []);
        const { id, author, authorEmail: email, accountId, date, hours, started, updated } = e;
        byKey.get(k)!.push({ id, author, email, accountId, date, hours, started, updated });
    });
    const at = now.toISOString();
    return {
        ...project,
        tasks: project.tasks.map(t => {
            const k = t.jiraId?.toUpperCase();
            if (!k || !want.has(k)) return t;
            return { ...t, jiraWorklog: { at, forHours: t.actualHours || 0, entries: byKey.get(k) || [] } };
        }),
    };
};

/** Paylaşılan proje verisindeki mevcut özetleri oturum görünürlüğüne göre süzer. */
export const scopedWorklogProject = (project: Project, canViewAll: boolean, person?: Person): Project => {
    if (canViewAll) return project;
    const email = person?.email?.trim().toLowerCase();
    return { ...project, tasks: project.tasks.map(task => task.jiraWorklog ? {
        ...task,
        jiraWorklog: { ...task.jiraWorklog, entries: email ? task.jiraWorklog.entries.filter(row => row.email?.trim().toLowerCase() === email) : [] },
    } : task) };
};

/** Haftalık rapora paylaşıma uygun, kişi ve yorum içermeyen Jira özeti. */
export const summarizeJiraWorklogForReport = (entries: WorklogEntry[]): WorklogEntry[] => {
    const byIssueDay = new Map<string, WorklogEntry>();
    for (const { issueKey, date, summary, hours, source } of entries) {
        const key = JSON.stringify([issueKey || summary, date]);
        const row = byIssueDay.get(key) || { issueKey, date, summary, hours: 0, author: '', source };
        row.hours += hours;
        byIssueDay.set(key, row);
    }
    return [...byIssueDay.values()];
};

const WORKLOG_TIME_ZONE_KEY = 'planasistan.jiraWorklog.timeZone';

export const getWorklogTimeZone = (): string => {
    try {
        const zone = localStorage.getItem(WORKLOG_TIME_ZONE_KEY);
        if (zone) {
            new Intl.DateTimeFormat('tr-TR', { timeZone: zone });
            return zone;
        }
    } catch { /* Tarayıcı depolaması kapalıysa İstanbul kullanılır. */ }
    return JIRA_WORK_TIME_ZONE;
};

export const setWorklogTimeZone = (zone: string) => {
    try { localStorage.setItem(WORKLOG_TIME_ZONE_KEY, zone); } catch { /* Oturum içi tercih korunur. */ }
};
