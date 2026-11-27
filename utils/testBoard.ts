import {
    Person, Project, ProjectTestBoard, TestBoardColumn, TestBoardItem, TestBoardSettings, TestColumnMeaning, TestRuleCondition, TestRuleField,
    TestSnapshot, TestSnapshotRow,
} from '../types';
import { JiraIssueRecord } from './integrations';
import { kindOfJiraType } from './issueTypeMeta';
import { mapJiraPriority } from './planning/jiraFields';
import { foldTr } from './rag/text';
import { isoWeekOf } from './weeklyReport';

/**
 * Testler sekmesi: kayıtlı bir Jira filtresindeki (ör. gib_testset) açık ve
 * kapalı kayıtlar kural tabanlı bir panoya dağıtılır. Kolonu durum tek başına
 * belirlemez; durum, tür, atanan (ve rolü / bileşen liderliği), açan (ve
 * rolü), bileşen, etiket birleştirilir. Kart, sıradaki ilk uyan kolona düşer;
 * hiçbirine uymayan "Eşleşmeyen"de görünür.
 *
 * Her Cuma 20:00'de (Türkiye saati) pano kayıt kayıt saklanır; iki haftalık
 * görüntü ve aradaki Jira durum geçişleri karşılaştırılarak haftalık rapor
 * üretilir.
 */

// ---------------------------------------------------------------- varsayılanlar

const NOT_DONE: TestRuleCondition = { field: 'category', not: true, values: ['done'] };
const NOT_IN_TEST_FLOW: TestRuleCondition = { field: 'status', not: true, values: ['Resolved', 'Reopened', 'Testing'] };

export const DEFAULT_TEST_COLUMNS: TestBoardColumn[] = [
    { id: 'bugs', name: 'Açılan hatalar', meaning: 'bugs', when: [{ field: 'type', values: ['Bug'] }, { field: 'reporterRole', values: ['test'] }, NOT_DONE, NOT_IN_TEST_FLOW] },
    { id: 'changes', name: 'Değişiklik talepleri', meaning: 'changes', when: [{ field: 'type', values: ['Change Request'] }, NOT_DONE, NOT_IN_TEST_FLOW] },
    { id: 'dev', name: 'Geliştirmede', when: [NOT_DONE, NOT_IN_TEST_FLOW] },
    { id: 'reopened', name: 'Yeniden açıldı', meaning: 'reopened', when: [{ field: 'status', values: ['Reopened'] }] },
    { id: 'waiting', name: 'Test bekliyor', meaning: 'waiting', when: [{ field: 'status', values: ['Resolved'] }, { field: 'assigneeLead', values: [] }] },
    { id: 'testing', name: 'Testte', meaning: 'testing', when: [{ field: 'status', values: ['Testing'] }] },
    { id: 'done', name: 'Test edildi, kapandı', meaning: 'approved', when: [{ field: 'category', values: ['done'] }] },
];

export const defaultTestSettings = (filterId = '', filterName?: string, now = new Date()): TestBoardSettings => ({
    filterId, ...(filterName ? { filterName } : {}), since: now.toISOString(), columns: JSON.parse(JSON.stringify(DEFAULT_TEST_COLUMNS)),
});

export const FIELD_LABELS: Record<TestRuleField, string> = {
    status: 'Durum', category: 'Durum kategorisi', type: 'Kayıt türü', priority: 'Öncelik', assignee: 'Atanan', assigneeRole: 'Atananın rolü',
    assigneeLead: 'Atanan bileşen lideri', reporter: 'Açan', reporterRole: 'Açanın rolü', component: 'Bileşen', label: 'Etiket', reopened: 'Yeniden açılmış',
};

export const MEANING_LABELS: Record<TestColumnMeaning, string> = {
    bugs: 'Açılan hatalar', changes: 'Değişiklik talepleri', reopened: 'Yeniden açılanlar', waiting: 'Test bekleyen', testing: 'Test edilen', approved: 'Test edilip onaylanan',
};

export const CATEGORY_LABELS: Record<string, string> = { new: 'Yapılacak', indeterminate: 'Süreçte', done: 'Tamamlandı' };

// ---------------------------------------------------------------- Jira → kayıt

const MAX_TRANSITIONS = 30;

export const itemFromIssue = (i: JiraIssueRecord): TestBoardItem => ({
    key: i.key,
    summary: i.summary || i.key,
    type: i.issueType,
    status: i.status,
    category: i.statusCategory,
    priority: i.priority,
    assignee: i.assignee || '',
    reporter: i.reporter || '',
    components: i.components,
    labels: i.labels,
    ...(i.created ? { created: i.created } : {}),
    ...(i.resolved ? { resolved: i.resolved } : {}),
    ...(i.updated ? { updated: i.updated } : {}),
    ...(i.parentKey ? { parentKey: i.parentKey } : {}),
    transitions: i.transitions.slice(-MAX_TRANSITIONS).map(t => ({ at: t.at, from: t.from, to: t.to, fc: t.fromCategory, tc: t.toCategory })),
});

// ---------------------------------------------------------------- kurallar

const norm = (s: string | undefined) => foldTr(s || '').trim();

export interface TestRuleContext {
    people: Pick<Person, 'id' | 'firstName' | 'lastName'>[];
    roleMembers: Record<string, string[]>;
    /** Bileşen adı → lider adı */
    leads: { component: string; lead: string }[];
}

export const ruleContext = (project: Pick<Project, 'roleMembers' | 'components'>, people: TestRuleContext['people']): TestRuleContext => ({
    people,
    roleMembers: project.roleMembers || {},
    leads: (project.components || []).filter(c => c.lead?.trim()).map(c => ({ component: c.name, lead: c.lead!.trim() })),
});

const rolesOf = (name: string, ctx: TestRuleContext): string[] => {
    const n = norm(name);
    if (!n) return [];
    const person = ctx.people.find(p => norm(`${p.firstName} ${p.lastName}`) === n);
    if (!person) return [];
    return Object.entries(ctx.roleMembers).filter(([, ids]) => ids.includes(person.id)).map(([id]) => id);
};

/** Kayıt Jira'da tamamlandıktan sonra yeniden açılmış mı */
export const reopenedAt = (i: Pick<TestBoardItem, 'transitions'>): string[] =>
    i.transitions.filter(t => t.fc === 'done' && t.tc !== 'done').map(t => t.at);

const sameType = (raw: string, want: string): boolean => {
    if (norm(raw) === norm(want)) return true;
    const a = kindOfJiraType(raw), b = kindOfJiraType(want);
    return !!a && a === b && a !== 'other';
};

/** Koşul (not hariç) sağlanıyor mu */
const holds = (c: TestRuleCondition, i: TestBoardItem, ctx: TestRuleContext): boolean => {
    const eqAny = (vals: string[]) => c.values.some(w => vals.some(v => norm(v) === norm(w)));
    switch (c.field) {
        case 'status': return eqAny([i.status]);
        case 'category': return c.values.includes(i.category || '');
        case 'type': return c.values.some(w => sameType(i.type, w));
        case 'priority': return c.values.some(w => norm(w) === norm(i.priority) || mapJiraPriority(w) === mapJiraPriority(i.priority) && !!i.priority);
        case 'assignee': return eqAny([i.assignee]);
        case 'reporter': return eqAny([i.reporter]);
        case 'assigneeRole': { const r = rolesOf(i.assignee, ctx); return c.values.some(w => r.includes(w)); }
        case 'reporterRole': { const r = rolesOf(i.reporter, ctx); return c.values.some(w => r.includes(w)); }
        case 'assigneeLead': {
            const a = norm(i.assignee);
            if (!a) return false;
            const leads = ctx.leads.filter(l => !c.values.length || c.values.some(w => norm(w) === norm(l.component)));
            return leads.some(l => norm(l.lead) === a);
        }
        case 'component': return eqAny(i.components);
        case 'label': return eqAny(i.labels);
        case 'reopened': return reopenedAt(i).length > 0;
    }
    return false;
};

/** Boş değerli koşul yok sayılır (bileşen lideri ve yeniden açılma hariç: onlar değersiz de anlamlı) */
const active = (c: TestRuleCondition) => c.values.length > 0 || c.field === 'assigneeLead' || c.field === 'reopened';

export const conditionMatches = (c: TestRuleCondition, i: TestBoardItem, ctx: TestRuleContext): boolean =>
    !active(c) || (c.not ? !holds(c, i, ctx) : holds(c, i, ctx));

export const columnMatches = (col: TestBoardColumn, i: TestBoardItem, ctx: TestRuleContext): boolean =>
    col.when.every(c => conditionMatches(c, i, ctx));

/** Kartın kolonu (ilk uyan); hiçbiri uymazsa '' */
export const columnOf = (columns: TestBoardColumn[], i: TestBoardItem, ctx: TestRuleContext): string =>
    columns.find(col => columnMatches(col, i, ctx))?.id || '';

export const distributeItems = (columns: TestBoardColumn[], items: TestBoardItem[], ctx: TestRuleContext): Map<string, TestBoardItem[]> => {
    const out = new Map<string, TestBoardItem[]>([...columns.map(c => [c.id, []] as [string, TestBoardItem[]]), ['', []]]);
    items.forEach(i => out.get(columnOf(columns, i, ctx))!.push(i));
    return out;
};

export const describeCondition = (c: TestRuleCondition, roleName: (id: string) => string): string => {
    const label = FIELD_LABELS[c.field];
    if (c.field === 'reopened') return c.not ? 'hiç yeniden açılmamış' : 'yeniden açılmış';
    if (c.field === 'assigneeLead') return `atanan ${c.values.length ? c.values.join(' / ') : 'bir'} bileşen${c.values.length ? 'inin' : ''} lideri${c.not ? ' değil' : ''}`;
    const vals = c.values.map(v => (c.field === 'category' ? CATEGORY_LABELS[v] || v : c.field.endsWith('Role') ? roleName(v) : v));
    return `${label} ${c.not ? '≠' : '='} ${vals.join(' / ') || '…'}`;
};

// ---------------------------------------------------------------- hafta kapanışı (Cuma 20:00, Türkiye)

/** Türkiye 2016'dan beri yaz saati uygulamıyor: UTC+3 sabit */
const TR_OFFSET = 3 * 3_600_000;
export const CLOSE_WEEKDAY = 5; // Cuma
export const CLOSE_HOUR = 20;

/** now'dan önceki (ya da eşit) son hafta kapanışı (UTC zaman damgası) */
export const lastWeekClose = (now: Date): Date => {
    const tr = new Date(now.getTime() + TR_OFFSET); // UTC alanları Türkiye saatini gösterir
    const wd = tr.getUTCDay() || 7;
    const close = new Date(Date.UTC(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate() - ((wd - CLOSE_WEEKDAY + 7) % 7), CLOSE_HOUR));
    if (close.getTime() > tr.getTime()) close.setUTCDate(close.getUTCDate() - 7);
    return new Date(close.getTime() - TR_OFFSET);
};

/** Kapanış anının ISO haftası (Türkiye takvimiyle) */
export const weekIdOf = (at: Date): string => {
    const tr = new Date(at.getTime() + TR_OFFSET);
    const { year, week } = isoWeekOf(new Date(tr.getUTCFullYear(), tr.getUTCMonth(), tr.getUTCDate()));
    return `${year}-W${String(week).padStart(2, '0')}`;
};

export const weekNumber = (weekId: string): number => Number(weekId.split('-W')[1]) || 0;

/** Bu hafta için alınması gereken haftalık görüntü (yoksa null) */
export const snapshotDue = (tb: ProjectTestBoard | undefined, now: Date): { week: string; close: Date; late: boolean } | null => {
    if (!tb?.settings.filterId) return null;
    const close = lastWeekClose(now);
    const week = weekIdOf(close);
    if ((tb.snapshots || []).some(s => !s.manual && s.week === week)) return null;
    // Pano bu kapanıştan sonra kurulduysa geriye dönük görüntü alınmaz (ilk görüntü sonraki Cuma)
    if (tb.settings.since && Date.parse(tb.settings.since) > close.getTime()) return null;
    return { week, close, late: now.getTime() - close.getTime() > 3_600_000 };
};

// ---------------------------------------------------------------- anlık görüntü

export const MAX_WEEKLY = 26;
export const MAX_MANUAL = 10;

export const makeSnapshot = (settings: TestBoardSettings, items: TestBoardItem[], ctx: TestRuleContext, at: Date, opts: { week?: string; manual?: boolean; late?: boolean; by?: string } = {}): TestSnapshot => ({
    id: `ts-${at.getTime().toString(36)}${opts.manual ? 'm' : ''}`,
    at: at.toISOString(),
    week: opts.week || weekIdOf(at),
    ...(opts.manual ? { manual: true } : {}),
    ...(opts.late ? { late: true } : {}),
    ...(opts.by ? { by: opts.by } : {}),
    columns: settings.columns.map(c => ({ id: c.id, name: c.name, ...(c.meaning ? { meaning: c.meaning } : {}) })),
    rows: items.map(i => ({ k: i.key, c: columnOf(settings.columns, i, ctx), s: i.status, p: i.priority, t: i.type, a: i.assignee, n: i.summary.slice(0, 160) })),
});

export const withSnapshot = (list: TestSnapshot[] | undefined, s: TestSnapshot): TestSnapshot[] => {
    const rest = (list || []).filter(x => s.manual || x.manual || x.week !== s.week);
    const all = [...rest, s].sort((a, b) => a.at.localeCompare(b.at));
    const weekly = all.filter(x => !x.manual).slice(-MAX_WEEKLY);
    const manual = all.filter(x => x.manual).slice(-MAX_MANUAL);
    return [...weekly, ...manual].sort((a, b) => a.at.localeCompare(b.at));
};

// ---------------------------------------------------------------- haftalık rapor

const within = (iso: string | undefined, from: number, to: number) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t > from && t <= to;
};

export interface TestWeekReport {
    week: string;
    from: string;
    to: string;
    /** Karşılaştırılan önceki haftalık görüntü yoksa aralık 7 gün varsayılır */
    hasPrevious: boolean;
    approved: TestSnapshotRow[];
    newBugs: TestBoardItem[];
    bugsByPriority: { priority: 'Blocker' | 'High' | 'Medium' | 'Low'; n: number }[];
    bugsFromTesters: number;
    newChanges: TestBoardItem[];
    reopened: TestBoardItem[];
    columns: { id: string; name: string; meaning?: TestColumnMeaning; now: number; before: number | null }[];
    unmatched: number;
    /** Test bekleyenler, en uzun bekleyen önce (gün) */
    waiting: { key: string; name: string; days: number | null; assignee: string }[];
    /** Testte olanlar, en uzun süredir testte olan önce */
    testing: { key: string; name: string; days: number | null; assignee: string }[];
    /** Görüntü anında açık (onaylanmamış) hata kayıtları, en kritik önce */
    openBugs: { key: string; name: string; priority: 'Blocker' | 'High' | 'Medium' | 'Low'; status: string; assignee: string }[];
    /** Önceki görüntüde açık hata sayısı */
    openBugsBefore: number | null;
    /** Görüntüdeki toplam kayıt */
    total: number;
    /** Test ekibi (Test rolü) projede tanımlı mı: değilse "test ekibinden" sayısı anlamsızdır */
    testerRoleDefined: boolean;
    /** Açan bilgisi gelmeyen yeni hata (eski sunucu ya da gizli alan) */
    reporterMissing: number;
}

const DAY = 86_400_000;

/** Kaydın şu anki durumuna son girdiği an (geçiş yoksa açılış) */
const enteredStatusAt = (i: TestBoardItem | undefined, status: string, at: number): number | null => {
    if (!i) return null;
    const last = [...i.transitions].reverse().find(t => Date.parse(t.at) <= at && norm(t.to) === norm(status));
    const ts = last ? Date.parse(last.at) : i.created ? Date.parse(i.created) : NaN;
    return Number.isFinite(ts) ? ts : null;
};

export const weekReport = (cur: TestSnapshot, prev: TestSnapshot | undefined, items: TestBoardItem[], ctx: TestRuleContext): TestWeekReport => {
    const to = Date.parse(cur.at);
    const from = prev ? Date.parse(prev.at) : to - 7 * DAY;
    const meaning = new Map(cur.columns.map(c => [c.id, c.meaning]));
    const prevMeaning = new Map((prev?.columns || []).map(c => [c.id, c.meaning]));
    const prevRow = new Map((prev?.rows || []).map(r => [r.k, r]));
    const byKey = new Map(items.map(i => [i.key, i]));
    const approved = cur.rows.filter(r => meaning.get(r.c) === 'approved' && (!prev || prevMeaning.get(prevRow.get(r.k)?.c || '') !== 'approved'));
    const createdIn = (kind: string) => items.filter(i => kindOfJiraType(i.type) === kind && within(i.created, from, to));
    const newBugs = createdIn('bug');
    const prio = (['Blocker', 'High', 'Medium', 'Low'] as const).map(p => ({ priority: p, n: newBugs.filter(b => mapJiraPriority(b.priority) === p).length }));
    const testers = newBugs.filter(b => conditionMatches({ field: 'reporterRole', values: ['test'] }, b, ctx) && !!b.reporter).length;
    const reopened = items.filter(i => reopenedAt(i).some(at => within(at, from, to)));
    const count = (s: TestSnapshot | undefined, id: string) => (s ? s.rows.filter(r => r.c === id).length : null);
    const queue = (m: TestColumnMeaning) => cur.rows.filter(r => meaning.get(r.c) === m).map(r => {
        const since = enteredStatusAt(byKey.get(r.k), r.s, to);
        return { key: r.k, name: r.n, days: since === null ? null : Math.max(0, Math.floor((to - since) / DAY)), assignee: r.a };
    }).sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
    const RANK = { Blocker: 0, High: 1, Medium: 2, Low: 3 } as const;
    // Açık hata: hata türünde ve onaylananlar kolonunda değil (güncel görüntüde Jira'da kapanmış olanlar da sayılmaz)
    const openOf = (snap: TestSnapshot, mean: Map<string, TestColumnMeaning | undefined>) => snap.rows.filter(r =>
        kindOfJiraType(r.t) === 'bug' && mean.get(r.c) !== 'approved' && (snap !== cur || byKey.get(r.k)?.category !== 'done'));
    const openBugs = openOf(cur, meaning)
        .map(r => ({ key: r.k, name: r.n, priority: mapJiraPriority(r.p), status: r.s, assignee: r.a }))
        .sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.key.localeCompare(b.key, 'tr', { numeric: true }));
    return {
        week: cur.week,
        from: new Date(from).toISOString(),
        to: cur.at,
        hasPrevious: !!prev,
        approved,
        newBugs,
        bugsByPriority: prio,
        bugsFromTesters: testers,
        newChanges: createdIn('change'),
        reopened,
        columns: cur.columns.map(c => ({ ...c, now: count(cur, c.id)!, before: prev ? count(prev, c.id) : null })),
        unmatched: count(cur, '')!,
        waiting: queue('waiting'),
        testing: queue('testing'),
        openBugs,
        openBugsBefore: prev ? openOf(prev, prevMeaning).length : null,
        total: cur.rows.length,
        testerRoleDefined: (ctx.roleMembers.test || []).length > 0,
        reporterMissing: newBugs.filter(b => !b.reporter).length,
    };
};
