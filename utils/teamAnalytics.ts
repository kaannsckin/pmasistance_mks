import { Person, Project, ProjectRoleDef, Task, TaskStatus } from '../types';
import { progressOf } from './progress';

/**
 * Ekip bazlı analiz: takım (proje rolü) ve bileşen kırılımında ilerleme,
 * akış, kalite ve tahmin isabeti. Takım üyeliği projenin rol üyeleridir
 * (Proje ayarları › Roller); görev, atananı takım üyesiyse o takımındır.
 * Bir kişi birden çok takımda olabilir; işi her takımında sayılır.
 */

const DAY = 86_400_000;
const norm = (s: string) => s.trim().toLocaleLowerCase('tr');
const effortOf = (t: Task) => Math.max(0, t.time?.avg || 0);
const ts = (iso?: string) => { if (!iso) return NaN; const v = new Date(iso).getTime(); return v; };
const median = (xs: number[]): number | null => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r1 = (v: number) => Math.round(v * 10) / 10;

export const NO_COMPONENT = '__none__';
export const NO_TEAM = '__none__';

export interface MemberStats {
    name: string;
    open: number;
    inProgress: number;
    doneInPeriod: number;
    overdue: number;
    openEffort: number;
}

export interface GroupStats {
    key: string;
    name: string;
    kind: 'team' | 'component';
    /** Takım: üye adları; bileşen: işte çalışan kişiler */
    members: string[];
    /** Bileşen sorumlusu */
    lead?: string;
    tasks: Task[];
    total: number;
    open: number;
    inProgress: number;
    done: number;
    overdue: number;
    blockers: number;
    /** Durum yüzdeleriyle ilerleme (0–100) */
    progressPct: number;
    openEffort: number;
    /** Dönemde biten kayıt ve efor */
    doneInPeriod: number;
    effortDoneInPeriod: number;
    /** Hata (tür = hata) */
    bugsOpen: number;
    bugsOpened: number;
    bugsClosed: number;
    /** Hataların tüm kayıtlara oranı (0–1) */
    bugShare: number;
    /** Ortanca kapanma süresi (gün; açılıştan kapanışa) */
    leadTimeDays: number | null;
    /** Ortanca gerçekleşen ÷ tahmin (1 = isabetli; >1 = tahmin düşük) */
    estimateRatio: number | null;
    /** Son 8 hafta biten kayıt (eskiden yeniye) */
    weekly: number[];
    memberStats: MemberStats[];
    /** Bileşen: takım adı → kayıt sayısı */
    teams?: { name: string; count: number }[];
}

export interface Insight {
    tone: 'bad' | 'warn' | 'ok';
    text: string;
    groupKey?: string;
}

export interface AnalyticsOptions {
    now?: Date;
    /** Dönem (gün): biten, açılan/kapanan hata bu pencerede sayılır */
    periodDays?: number;
}

const groupStats = (key: string, name: string, kind: GroupStats['kind'], tasks: Task[], project: Pick<Project, 'progressModel'>, members: string[], opts: Required<AnalyticsOptions>): GroupStats => {
    const now = opts.now.getTime();
    const from = now - opts.periodDays * DAY;
    const todayIso = opts.now.toISOString().slice(0, 10);
    const inPeriod = (iso?: string) => { const v = ts(iso); return !isNaN(v) && v >= from && v <= now; };
    const isDone = (t: Task) => t.status === TaskStatus.Done;
    const open = tasks.filter(t => !isDone(t));
    const done = tasks.filter(isDone);
    const overdue = open.filter(t => !!t.dueDate && t.dueDate.slice(0, 10) < todayIso);
    const bugs = tasks.filter(t => t.issueType === 'bug');
    const lead = done.map(t => (ts(t.resolvedAt) - ts(t.createdAt)) / DAY).filter(v => Number.isFinite(v) && v >= 0);
    const ratios = done.filter(t => (t.actualHours || 0) > 0 && effortOf(t) > 0).map(t => (t.actualHours || 0) / (effortOf(t) * 8));
    const weekly = Array.from({ length: 8 }, (_, i) => {
        const end = now - (7 - i) * 7 * DAY, start = end - 7 * DAY;
        return done.filter(t => { const v = ts(t.resolvedAt); return v > start && v <= end; }).length;
    });
    const names = new Map<string, string>();
    for (const m of members) names.set(norm(m), m);
    for (const t of tasks) if (t.resourceName?.trim() && kind === 'component') names.set(norm(t.resourceName), t.resourceName.trim());
    const memberStats = [...names.entries()].map(([k, n]) => {
        const mine = tasks.filter(t => norm(t.resourceName || '') === k);
        const mo = mine.filter(t => !isDone(t));
        return {
            name: n,
            open: mo.length,
            inProgress: mo.filter(t => t.status === TaskStatus.InProgress).length,
            doneInPeriod: mine.filter(t => isDone(t) && inPeriod(t.resolvedAt)).length,
            overdue: mo.filter(t => !!t.dueDate && t.dueDate.slice(0, 10) < todayIso).length,
            openEffort: r1(mo.reduce((s, t) => s + effortOf(t), 0)),
        };
    }).sort((a, b) => b.openEffort - a.openEffort || b.open - a.open || a.name.localeCompare(b.name, 'tr'));
    const doneInPeriod = done.filter(t => inPeriod(t.resolvedAt));
    return {
        key, name, kind, members: kind === 'team' ? members : memberStats.map(m => m.name), tasks,
        total: tasks.length,
        open: open.length,
        inProgress: open.filter(t => t.status === TaskStatus.InProgress).length,
        done: done.length,
        overdue: overdue.length,
        blockers: open.filter(t => t.priority === 'Blocker').length,
        progressPct: progressOf(tasks, project.progressModel).pct,
        openEffort: r1(open.reduce((s, t) => s + effortOf(t), 0)),
        doneInPeriod: doneInPeriod.length,
        effortDoneInPeriod: r1(doneInPeriod.reduce((s, t) => s + effortOf(t), 0)),
        bugsOpen: bugs.filter(t => !isDone(t)).length,
        bugsOpened: bugs.filter(t => inPeriod(t.createdAt)).length,
        bugsClosed: bugs.filter(t => isDone(t) && inPeriod(t.resolvedAt)).length,
        bugShare: tasks.length ? bugs.length / tasks.length : 0,
        leadTimeDays: lead.length ? r1(median(lead)!) : null,
        estimateRatio: ratios.length ? Math.round(median(ratios)! * 100) / 100 : null,
        weekly,
        memberStats,
    };
};

const fill = (o: AnalyticsOptions): Required<AnalyticsOptions> => ({ now: o.now || new Date(), periodDays: o.periodDays || 30 });

export const personName = (p: Pick<Person, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`.trim();

/** Takımın üye adları (rol üyeleri havuz kimliğiyle tutulur) */
export const teamMemberNames = (project: Pick<Project, 'roleMembers'>, roleId: string, people: Person[]): string[] => {
    const byId = new Map(people.map(p => [p.id, personName(p)]));
    return (project.roleMembers?.[roleId] || []).map(id => byId.get(id)).filter((n): n is string => !!n);
};

export interface TeamAnalytics {
    groups: GroupStats[];
    /** Hiçbir takımda olmayan kişilere atanmış açık kayıt */
    outside: GroupStats | null;
    insights: Insight[];
}

/** Takım = proje rolü; yalnız üyesi olan roller */
export const teamAnalytics = (project: Project, roles: ProjectRoleDef[], people: Person[], o: AnalyticsOptions = {}): TeamAnalytics => {
    const opts = fill(o);
    const groups: GroupStats[] = [];
    const covered = new Set<string>();
    for (const r of roles) {
        const members = teamMemberNames(project, r.id, people);
        if (!members.length) continue;
        const set = new Set(members.map(norm));
        members.forEach(m => covered.add(norm(m)));
        groups.push(groupStats(r.id, r.name, 'team', project.tasks.filter(t => set.has(norm(t.resourceName || ''))), project, members, opts));
    }
    const rest = project.tasks.filter(t => t.resourceName?.trim() && !covered.has(norm(t.resourceName)));
    const outside = groups.length && rest.length ? groupStats(NO_TEAM, 'Takımı olmayan kişiler', 'team', rest, project, [...new Set(rest.map(t => t.resourceName.trim()))], opts) : null;
    return { groups, outside, insights: insightsOf(groups, opts.periodDays) };
};

/** Bileşen kırılımı: projenin bileşen listesi + görevlerde geçen ama listede olmayanlar + bileşensiz */
export const componentAnalytics = (project: Project, roles: ProjectRoleDef[], people: Person[], o: AnalyticsOptions = {}): TeamAnalytics => {
    const opts = fill(o);
    const listed = (project.components || []).map(c => ({ name: c.name, lead: c.lead }));
    const known = new Set(listed.map(c => norm(c.name)));
    for (const t of project.tasks) for (const c of t.components || []) if (c.trim() && !known.has(norm(c))) { known.add(norm(c)); listed.push({ name: c.trim(), lead: undefined }); }
    const teams = roles.map(r => ({ name: r.name, set: new Set(teamMemberNames(project, r.id, people).map(norm)) })).filter(t => t.set.size);
    const groups = listed.map(c => {
        const tasks = project.tasks.filter(t => (t.components || []).some(x => norm(x) === norm(c.name)));
        const g = groupStats(c.name, c.name, 'component', tasks, project, c.lead ? [c.lead] : [], opts);
        g.lead = c.lead;
        g.teams = teams.map(t => ({ name: t.name, count: tasks.filter(x => t.set.has(norm(x.resourceName || ''))).length })).filter(t => t.count).sort((a, b) => b.count - a.count);
        return g;
    });
    const none = project.tasks.filter(t => !(t.components || []).some(c => c.trim()));
    const outside = groups.length && none.length ? groupStats(NO_COMPONENT, 'Bileşensiz kayıtlar', 'component', none, project, [], opts) : null;
    return { groups, outside, insights: insightsOf(groups, opts.periodDays) };
};

/** Otomatik bulgular: gecikme, darboğaz, hata eğilimi, tahmin sapması, iş yığılması */
export const insightsOf = (groups: GroupStats[], periodDays = 30): Insight[] => {
    const out: Insight[] = [];
    for (const g of groups) {
        if (g.open >= 3 && g.overdue / g.open >= 0.25) out.push({ tone: 'bad', groupKey: g.key, text: `${g.name}: açık işlerin %${Math.round((g.overdue / g.open) * 100)}'i gecikmiş (${g.overdue}/${g.open}).` });
        const top = g.memberStats[0];
        if (g.kind === 'team' && g.members.length >= 2 && top && g.openEffort >= 5 && top.openEffort / g.openEffort >= 0.45) {
            out.push({ tone: 'warn', groupKey: g.key, text: `${g.name}: açık eforun %${Math.round((top.openEffort / g.openEffort) * 100)}'i ${top.name} üzerinde (darboğaz riski).` });
        }
        if (g.bugsOpened >= 3 && g.bugsOpened > g.bugsClosed * 1.5) out.push({ tone: 'warn', groupKey: g.key, text: `${g.name}: son ${periodDays} günde ${g.bugsOpened} hata açıldı, ${g.bugsClosed} kapandı; hata birikiyor.` });
        if (g.estimateRatio !== null && g.estimateRatio >= 1.3) out.push({ tone: 'warn', groupKey: g.key, text: `${g.name}: işler tahminin ${g.estimateRatio.toLocaleString('tr-TR')} katı sürüyor; tahminler düşük.` });
        if (g.kind === 'team' && g.members.length && g.inProgress > g.members.length * 2) out.push({ tone: 'warn', groupKey: g.key, text: `${g.name}: kişi başı ${r1(g.inProgress / g.members.length).toLocaleString('tr-TR')} iş aynı anda süreçte; odak dağılıyor.` });
        if (g.blockers) out.push({ tone: 'bad', groupKey: g.key, text: `${g.name}: ${g.blockers} açık Blocker.` });
    }
    const active = groups.filter(g => g.doneInPeriod > 0);
    if (active.length >= 2) {
        const best = [...active].sort((a, b) => b.effortDoneInPeriod - a.effortDoneInPeriod)[0];
        out.push({ tone: 'ok', groupKey: best.key, text: `En yüksek çıktı: ${best.name} (son ${periodDays} günde ${best.doneInPeriod} kayıt, ${best.effortDoneInPeriod.toLocaleString('tr-TR')} gün efor).` });
    }
    const rank = { bad: 0, warn: 1, ok: 2 } as const;
    return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
};
