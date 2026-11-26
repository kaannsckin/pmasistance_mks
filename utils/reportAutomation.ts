import type { Person, ProgressSnapshot, Project, ProjectRoleDef, ReportBlockKey, ReportSchedule, Task, TaskStatus } from '../types';
import { progressOf } from './progress.js';
import { computePocScores, pct as pocPct, pocCoefficient, pocSnapshotValue, signedPoints, syncLabel, testTaskId } from './gibPoc.js';

/**
 * Rapor otomasyonu: zamanlanmış proje ilerleme raporu (Teams, Slack, Notion,
 * e-posta). Saf ve yaprak modül: tarayıcı (yedek gönderici) ve sunucu
 * (Vercel cron, bulut verisi) aynı içeriği üretir. Çalışma zamanında yalnız
 * progress ve gibPoc (PoC skoru) modüllerine bağlıdır.
 */

const DAY = 86_400_000;
const TZ = 'Europe/Istanbul';
const DONE = 'Done' as TaskStatus;
const IN_PROGRESS = 'InProgress' as TaskStatus;
const CATEGORY_TR: Record<string, string> = { Backlog: 'Bekleyen', ToDo: 'Yapılacak', InProgress: 'Süreçte', Done: 'Tamamlandı' };
const norm = (s: string) => s.trim().toLocaleLowerCase('tr-TR');
const num = (v: number, d = 1) => v.toLocaleString('tr-TR', { maximumFractionDigits: d });
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const ts = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

export const BLOCK_LABELS: Record<ReportBlockKey, string> = {
    progress: 'İlerleme ve günlük fark',
    poc: 'PoC skoru (İlk, Doğrulanmış, Bugün, Olası) ve kategori katkıları',
    activity: 'Dönemde olanlar (biten, yeni, ilerleyen)',
    bugs: 'Hatalar (açılan / kapanan, oran %)',
    overdue: 'Geciken işler',
    sprint: 'Şu anki sprint',
    milestones: 'Kilometre taşları',
    teams: 'Takım bazında',
    blockers: 'Blocker işler',
    risks: 'Yüksek riskler',
};
export const DEFAULT_BLOCKS: ReportBlockKey[] = ['progress', 'activity', 'bugs', 'overdue', 'sprint', 'milestones'];
export const CADENCE_LABELS: Record<ReportSchedule['cadence'], string> = { daily: 'Her gün', weekdays: 'Hafta içi her gün', weekly: 'Haftada bir' };
export const WEEKDAYS_TR = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Türkiye saatine göre gün (YYYY-AA-GG), saat ve haftanın günü (1 Pzt … 7 Paz) */
export const trClock = (now: Date): { day: string; hour: number; weekday: number } => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' })
        .formatToParts(now).map(p => [p.type, p.value]));
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: wd };
};

/** Bugün bu raporun günü mü (periyoda göre) */
export const isReportDay = (s: Pick<ReportSchedule, 'cadence' | 'weekday'>, now: Date): boolean => {
    const { weekday } = trClock(now);
    if (s.cadence === 'weekdays') return weekday <= 5;
    if (s.cadence === 'weekly') return weekday === (s.weekday || 1);
    return true;
};

/**
 * Gönderim zamanı geldi mi: açık, bugün rapor günü, saati geldi ve bugün
 * gönderilmedi. `ignoreHour`: günde bir kez çalışan sunucu zamanlayıcısı saati beklemez.
 */
export const isReportDue = (s: ReportSchedule, now: Date, opts: { ignoreHour?: boolean; sentDay?: string } = {}): boolean => {
    if (!s.enabled || !hasChannel(s)) return false;
    const c = trClock(now);
    if ((opts.sentDay ?? s.lastSentDay) === c.day) return false;
    if (!isReportDay(s, now)) return false;
    return opts.ignoreHour || c.hour >= s.hour;
};

export const hasChannel = (s: Pick<ReportSchedule, 'channels'>): boolean => !!(s.channels.teams || s.channels.slack || s.channels.notion || s.channels.email?.length);

export const describeSchedule = (s: Pick<ReportSchedule, 'cadence' | 'weekday' | 'hour' | 'channels'>): string => {
    const when = s.cadence === 'weekly' ? `Her ${WEEKDAYS_TR[s.weekday || 1]}` : CADENCE_LABELS[s.cadence];
    const ch = [s.channels.teams && 'Teams', s.channels.slack && 'Slack', s.channels.notion && 'Notion', s.channels.email?.length && `e-posta (${s.channels.email.length})`].filter(Boolean).join(', ');
    return `${when} ${String(s.hour).padStart(2, '0')}:00 · ${ch || 'kanal seçilmedi'}`;
};

const scopeTasks = (project: Pick<Project, 'tasks'>, fixVersion?: string): Task[] =>
    fixVersion ? project.tasks.filter(t => t.fixVersion && norm(t.fixVersion) === norm(fixVersion)) : project.tasks;

/** Günlük ölçüm: rapordaki "önceki rapora göre" farkı bundan hesaplanır (PoC verisi varsa Bugün skoru da) */
export const progressSnapshot = (project: Pick<Project, 'tasks' | 'progressModel'> & Partial<Pick<Project, 'poc' | 'jiraSync'>>, now: Date, fixVersion?: string): ProgressSnapshot => {
    const tasks = scopeTasks(project, fixVersion);
    const p = progressOf(tasks, project.progressModel);
    const poc = fixVersion ? undefined : pocSnapshotValue(project);
    return {
        day: trClock(now).day, pct: p.pct, done: p.done, total: p.total, open: p.total - p.done,
        bugsOpen: tasks.filter(t => t.issueType === 'bug' && t.status !== DONE).length,
        ...(poc || {}),
    };
};

/** Ölçüm geçmişine bugünü ekler (aynı gün üzerine yazar, en çok 90 gün) */
export const withSnapshot = (list: ProgressSnapshot[] | undefined, snap: ProgressSnapshot): ProgressSnapshot[] =>
    [...(list || []).filter(x => x.day !== snap.day), snap].sort((a, b) => a.day.localeCompare(b.day)).slice(-90);

/** Bugünden önceki son ölçüm */
export const previousSnapshot = (list: ProgressSnapshot[] | undefined, now: Date): ProgressSnapshot | undefined => {
    const today = trClock(now).day;
    return [...(list || [])].filter(x => x.day < today).sort((a, b) => b.day.localeCompare(a.day))[0];
};

export interface ReportSection {
    title: string;
    /** Bir cümlelik özet */
    summary?: string;
    lines: string[];
}

export interface BuiltReport {
    subject: string;
    sections: ReportSection[];
    /** Kanal bağımsız düz metin (Teams/e-posta; ** kalın) */
    text: string;
    snapshot: ProgressSnapshot;
}

export interface ReportContext {
    now: Date;
    previous?: ProgressSnapshot;
    /** Dönem başı (son gönderim); yoksa periyoda göre */
    since?: Date;
    people?: Person[];
    roleDefs?: ProjectRoleDef[];
    appUrl?: string;
}

const statusOf = (t: Task) => t.jiraStatus?.trim() || CATEGORY_TR[t.status] || t.status;
const keyOf = (t: Task) => t.jiraId?.trim() || 'Görev';
const daysLate = (t: Task, now: Date) => {
    if (!t.dueDate || t.status === DONE) return 0;
    const d = Math.floor((new Date(trClock(now).day).getTime() - new Date(t.dueDate.slice(0, 10)).getTime()) / DAY);
    return d > 0 ? d : 0;
};
const dateTr = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: TZ });
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `${v}` : '±0');

const currentSprintOf = (project: Project, tasks: Task[], now: Date) => {
    const start = new Date(`${project.settings?.projectStartDate || ''}T00:00:00`);
    const weeks = Math.max(1, project.settings?.sprintDuration || 2);
    if (isNaN(start.getTime())) return null;
    const len = weeks * 7 * DAY;
    const n = Math.floor((now.getTime() - start.getTime()) / len) + 1;
    if (n < 1) return null;
    const from = new Date(start.getTime() + (n - 1) * len), to = new Date(from.getTime() + len - DAY);
    const list = tasks.filter(t => t.version === n && t.includeInSprints !== false);
    return { n, from, to, list, name: project.settings?.sprintNames?.[n] || `Sprint ${n}`, daysLeft: Math.max(0, Math.ceil((to.getTime() - now.getTime()) / DAY)) };
};

const BLOCK_ORDER: ReportBlockKey[] = ['progress', 'poc', 'activity', 'bugs', 'overdue', 'sprint', 'milestones', 'teams', 'blockers', 'risks'];

export const buildReport = (project: Project, s: Pick<ReportSchedule, 'name' | 'blocks' | 'fixVersion' | 'note' | 'cadence'>, ctx: ReportContext): BuiltReport => {
    const now = ctx.now;
    const tasks = scopeTasks(project, s.fixVersion);
    const snap = progressSnapshot(project, now, s.fixVersion);
    const periodDays = s.cadence === 'weekly' ? 7 : 1;
    const since = ctx.since && now.getTime() - ctx.since.getTime() < 14 * DAY && ctx.since < now ? ctx.since : new Date(now.getTime() - periodDays * DAY);
    const inPeriod = (iso?: string) => { const v = ts(iso); return !isNaN(v) && v > since.getTime() && v <= now.getTime(); };
    const periodLabel = ctx.since ? 'son rapordan bu yana' : periodDays === 7 ? 'son 7 günde' : 'son 24 saatte';
    const open = tasks.filter(t => t.status !== DONE);
    const sections: ReportSection[] = [];
    const blocks = BLOCK_ORDER.filter(b => s.blocks.includes(b));
    const p = progressOf(tasks, project.progressModel);

    for (const b of blocks) {
        if (b === 'progress') {
            const prev = ctx.previous;
            const delta = prev ? snap.pct - prev.pct : null;
            sections.push({
                title: 'İlerleme',
                summary: `%${snap.pct}${delta !== null ? ` (önceki ölçüm %${prev!.pct}, ${signed(delta)} puan)` : ''}`,
                lines: [
                    `${snap.done} / ${snap.total} kayıt tamamlandı${prev ? ` (${signed(snap.done - prev.done)})` : ''}`,
                    `Açık iş: ${snap.open}${prev ? ` (${signed(snap.open - prev.open)})` : ''}`,
                    `Yöntem: ${p.weighted ? 'durum yüzdeleri' : 'yalnız tamamlanan'}${p.basis === 'effort' ? ', efor ağırlıklı' : ''}`,
                ],
            });
        }
        if (b === 'poc') {
            const sc = computePocScores(project);
            if (!sc) { sections.push({ title: 'PoC skoru', summary: 'Projede PoC test listesi yok (Excel aktarımıyla gelir)', lines: [] }); continue; }
            const prev = ctx.previous?.poc;
            const scopeName = sc.scope.map(l => l.replace(/^[^:]*:\s*/, '')).join(' + ') || 'kapsam';
            const byTask = new Map(project.tasks.map(t => [t.id, t]));
            const linked = new Set((project.poc?.tests || []).map(testTaskId));
            // Dönemde durumu değişen PoC maddeleri (skora etkisi katsayıdan)
            const moved = [...linked].map(id => byTask.get(id)).filter((t): t is Task => !!t && (t.statusLog || []).some(c => inPeriod(c.at)));
            sections.push({
                title: 'PoC skoru',
                summary: `Bugün ${pocPct(sc.today)}${prev !== undefined ? ` (önceki ölçüm ${pocPct(prev)}, ${signedPoints(sc.today - prev)} puan)` : ''} · Jira verisi: ${syncLabel(sc.syncAt)}`,
                lines: [
                    `İlk ${pocPct(sc.initial)} · Doğrulanmış ${pocPct(sc.verified)} · Bugün ${pocPct(sc.today)} · Olası (${scopeName}) ${pocPct(sc.possible)}`,
                    `Zorunlu açık madde: ${sc.mandatoryOpen}`,
                    ...(sc.contributions.length ? [`Kalan açık (${signedPoints(100 - sc.possible)} puan): ${sc.contributions.map(c => `${c.name} ${signedPoints(c.value)}`).join(' · ')}`] : []),
                    ...moved.slice(0, 6).map(t => `• ${keyOf(t)} ${t.name}: ${statusOf(t)} (k ${num(pocCoefficient(t, project.poc?.settings), 2)})`),
                ],
            });
        }
        if (b === 'activity') {
            const done = tasks.filter(t => t.status === DONE && inPeriod(t.resolvedAt));
            const created = tasks.filter(t => inPeriod(t.createdAt));
            const moved = tasks.filter(t => (t.statusLog || []).some(c => inPeriod(c.at)) && !done.includes(t));
            sections.push({
                title: `Dönemde olanlar (${periodLabel})`,
                summary: `${done.length} iş tamamlandı, ${created.length} yeni kayıt, ${moved.length} işte durum değişti`,
                lines: done.slice(0, 8).map(t => `✓ ${keyOf(t)} ${t.name}${t.resourceName ? ` — ${t.resourceName}` : ''}`),
            });
        }
        if (b === 'bugs') {
            const bugs = tasks.filter(t => t.issueType === 'bug');
            const bugsOpen = bugs.filter(t => t.status !== DONE);
            const opened = bugs.filter(t => inPeriod(t.createdAt));
            const closed = bugs.filter(t => t.status === DONE && inPeriod(t.resolvedAt));
            const createdAll = tasks.filter(t => inPeriod(t.createdAt)).length;
            sections.push({
                title: 'Hatalar',
                summary: `${bugsOpen.length} açık hata (${signed(opened.length)} açıldı, −${closed.length} kapandı)${ctx.previous ? ` · önceki ölçüm ${ctx.previous.bugsOpen}` : ''}`,
                lines: [
                    `Açık işlerin %${pctOf(bugsOpen.length, open.length)}'i hata · tüm kayıtların %${pctOf(bugs.length, tasks.length)}'i hata`,
                    ...(createdAll ? [`Dönemde açılan kayıtların %${pctOf(opened.length, createdAll)}'i hata (${opened.length}/${createdAll})`] : []),
                    ...opened.slice(0, 5).map(t => `+ ${keyOf(t)} ${t.name} (${t.priority})`),
                ],
            });
        }
        if (b === 'overdue') {
            const late = open.map(t => ({ t, d: daysLate(t, now) })).filter(x => x.d > 0).sort((a, b) => b.d - a.d);
            sections.push({
                title: 'Geciken işler',
                summary: late.length ? `${late.length} iş termini geçmiş (açık işlerin %${pctOf(late.length, open.length)}'i)` : 'Gecikme yok',
                lines: late.slice(0, 6).map(({ t, d }) => `! ${keyOf(t)} ${t.name} — ${t.resourceName || 'atanmadı'}, ${d} gün`),
            });
        }
        if (b === 'sprint') {
            const sp = currentSprintOf(project, tasks, now);
            if (!sp || !sp.list.length) sections.push({ title: 'Şu anki sprint', summary: 'Bu sprintte planlanmış iş yok', lines: [] });
            else {
                const sp2 = progressOf(sp.list, project.progressModel);
                const inProg = sp.list.filter(t => t.status === IN_PROGRESS).length;
                sections.push({
                    title: `Şu anki sprint: ${sp.name}`,
                    summary: `%${sp2.pct} · ${sp2.done}/${sp2.total} bitti · ${inProg} süreçte · ${sp.daysLeft} gün kaldı`,
                    lines: [`${dateTr(sp.from)} – ${dateTr(sp.to)}`],
                });
            }
        }
        if (b === 'milestones') {
            const byId = new Map(project.tasks.map(t => [t.id, t]));
            const today = trClock(now).day;
            const lines: string[] = [];
            for (const plan of (project.releasePlans || []).filter(x => x.mode === 'manual')) {
                const items = new Map(plan.items.map(i => [i.id, i]));
                for (const m of plan.milestones) {
                    const ts2 = m.itemIds.map(id => items.get(id)?.sourceTaskId).map(id => (id ? byId.get(id) : undefined)).filter((t): t is Task => !!t);
                    if (!ts2.length) continue;
                    const mp = progressOf(ts2, project.progressModel);
                    const late = !!m.targetDate && m.targetDate < today && mp.done < mp.total;
                    lines.push(`${late ? '!' : '•'} ${m.name}${m.targetDate ? ` (hedef ${dateTr(new Date(m.targetDate + 'T12:00:00'))})` : ''}: %${mp.pct}, ${mp.done}/${mp.total} bitti${late ? ' — hedef geçti' : ''}`);
                }
            }
            sections.push({ title: 'Kilometre taşları', summary: lines.length ? undefined : 'Sürüm planında taş yok', lines: lines.slice(0, 8) });
        }
        if (b === 'teams') {
            const people = ctx.people || [];
            const byId = new Map(people.map(x => [x.id, `${x.firstName} ${x.lastName}`.trim()]));
            const groups = (ctx.roleDefs || []).map(r => ({ name: r.name, members: new Set((project.roleMembers?.[r.id] || []).map(id => byId.get(id)).filter((n): n is string => !!n).map(norm)) })).filter(g => g.members.size);
            // Takım (proje rolü) yoksa birim bazında
            const rows = groups.length
                ? groups.map(g => ({ name: g.name, list: tasks.filter(t => g.members.has(norm(t.resourceName || ''))) }))
                : [...new Set(tasks.map(t => t.unit?.trim()).filter((u): u is string => !!u))].map(u => ({ name: u, list: tasks.filter(t => t.unit?.trim() === u) }));
            sections.push({
                title: groups.length ? 'Takım bazında' : 'Birim bazında',
                lines: rows.filter(r => r.list.length).map(r => {
                    const rp = progressOf(r.list, project.progressModel);
                    const doneP = r.list.filter(t => t.status === DONE && inPeriod(t.resolvedAt)).length;
                    const late = r.list.filter(t => daysLate(t, now) > 0).length;
                    return `• ${r.name}: %${rp.pct} · ${doneP} biten · ${r.list.length - rp.done} açık${late ? ` · ${late} geciken` : ''}`;
                }).slice(0, 10),
            });
        }
        if (b === 'blockers') {
            const bl = open.filter(t => t.priority === 'Blocker');
            sections.push({ title: 'Blocker işler', summary: bl.length ? `${bl.length} açık Blocker` : 'Açık Blocker yok', lines: bl.slice(0, 6).map(t => `! ${keyOf(t)} ${t.name} — ${statusOf(t)}, ${t.resourceName || 'atanmadı'}`) });
        }
        if (b === 'risks') {
            const risks = (project.risks || []).filter(r => r.status !== 'closed').map(r => ({ r, sc: r.probability * r.impact })).sort((a, b) => b.sc - a.sc);
            const high = risks.filter(x => x.sc >= 15);
            sections.push({ title: 'Yüksek riskler', summary: `${risks.length} açık risk, ${high.length} yüksek`, lines: high.slice(0, 5).map(x => `! ${x.r.title} (skor ${x.sc})${x.r.owner ? ` — ${x.r.owner}` : ''}`) });
        }
    }
    if (s.note?.trim()) sections.push({ title: 'Not', lines: [s.note.trim()] });

    const subject = `${project.name} · ${s.name} · ${dateTr(now)} · %${snap.pct}`;
    return { subject, sections, text: reportText(sections, 'md', ctx.appUrl), snapshot: snap };
};

/** Bölümleri kanal biçimine çevirir: md (Teams/e-posta, **kalın**), slack (*kalın*), plain */
export const reportText = (sections: ReportSection[], style: 'md' | 'slack' | 'plain', appUrl?: string): string => {
    const b = (x: string) => (style === 'md' ? `**${x}**` : style === 'slack' ? `*${x}*` : x);
    const parts = sections.map(s => [`${b(s.title)}${s.summary ? `: ${s.summary}` : ''}`, ...s.lines.map(l => `${style === 'plain' ? '  ' : ''}${l}`)].join('\n'));
    if (appUrl) parts.push(style === 'slack' ? `<${appUrl}|PlanAsistan'da aç>` : `PlanAsistan: ${appUrl}`);
    return parts.join('\n\n');
};

export const newScheduleId = () => `rapor-${Math.random().toString(36).slice(2, 9)}`;

export const scheduleProblems = (s: Pick<ReportSchedule, 'name' | 'channels' | 'blocks' | 'hour'>): string[] => {
    const out: string[] = [];
    if (!s.name.trim()) out.push('Rapora ad verin.');
    if (!hasChannel(s)) out.push('En az bir kanal seçin.');
    if (!s.blocks.length) out.push('En az bir bölüm seçin.');
    if (!(s.hour >= 0 && s.hour <= 23)) out.push('Saat 0–23 arası olmalı.');
    const bad = (s.channels.email || []).filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad.length) out.push(`Geçersiz e-posta: ${bad.join(', ')}`);
    return out;
};
