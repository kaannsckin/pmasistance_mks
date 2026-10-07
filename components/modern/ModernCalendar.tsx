import React, { useMemo, useState } from 'react';
import { WorkspaceData } from '../../types';
import { MONTHS_TR } from '../../utils/allocations';
import { Identity, visiblePersonIds, visibleProjectIds } from '../../utils/rbac';
import {
    buildMySchedule, buildProjectSchedule, buildTeamSchedule, buildWorkPackageSchedule, ScheduleScope, SchedCell, upcomingDeadlines,
} from '../../utils/schedule';
import { deadlineLabel } from '../../utils/projectOverview';
import { Icon } from './icons';
import { rowSep } from './ui';

/**
 * Modern Takvim: aylık tahsis (AA), izin ve görev terminleri tek ısı
 * haritasında. Kapsam: Takvimim / Ekip / Proje / İş paketi. Yanında
 * yaklaşan ve geciken terminler.
 */

const fmt = (v: number): string => (Math.abs(v) < 0.005 ? '0' : (Math.round(v * 100) / 100).toString().replace('.', ','));

const SCOPES: { id: ScheduleScope; label: string }[] = [
    { id: 'me', label: 'Takvimim' },
    { id: 'team', label: 'Ekip' },
    { id: 'project', label: 'Proje' },
    { id: 'workpackage', label: 'İş paketi' },
];

type Tone = 'over' | 'full' | 'ok' | 'leave' | 'empty' | 'tasks';
const TONE_CLASS: Record<Tone, string> = {
    over: 'm-tone-bad',
    full: 'm-tone-warn',
    ok: 'm-tone-ok',
    leave: 'm-tone-hold',
    empty: 'm-fill-2 m-text-3',
    tasks: 'm-tone-accent',
};

const toneOf = (c: SchedCell, tasksMetric: boolean, cap?: number): Tone => {
    if (tasksMetric) return c.tasks > 0 ? 'tasks' : 'empty';
    if (c.over) return 'over';
    if (c.aa <= 0.049) return c.leave > 0.049 ? 'leave' : 'empty';
    const ratio = cap && cap > 0 ? c.aa / cap : c.aa;
    return ratio >= 0.85 ? 'full' : 'ok';
};

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: string }> = ({ label, value, hint, tone }) => (
    <div className="m-surface rounded-2xl px-4 py-3.5 flex flex-col gap-0.5 min-w-0">
        <span className="text-[14px] m-text-2">{label}</span>
        <span className={`text-[26px] leading-tight font-bold m-tabular ${tone || 'm-text'}`}>{value}</span>
        {hint && <span className="text-[13px] m-text-3 truncate">{hint}</span>}
    </div>
);

export interface ModernCalendarProps {
    workspace: WorkspaceData;
    identity: Identity;
    onViewPerson: (personId: string) => void;
    onOpenProject: (projectId: string) => void;
}

const ModernCalendar: React.FC<ModernCalendarProps> = ({ workspace, identity, onViewPerson, onOpenProject }) => {
    const now = new Date();
    const [scope, setScope] = useState<ScheduleScope>(identity.personId ? 'me' : 'team');
    const [year, setYear] = useState(now.getFullYear());
    const [projectId, setProjectId] = useState('');

    const visibleProjects = useMemo(() => {
        const ids = visibleProjectIds(workspace, identity);
        return workspace.projects.filter(p => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }, [workspace, identity]);
    const activeProjectId = projectId && visibleProjects.some(p => p.id === projectId) ? projectId : (visibleProjects[0]?.id || '');
    const me = identity.personId ? workspace.people.find(p => p.id === identity.personId) : undefined;
    const teamIds = useMemo(() => Array.from(visiblePersonIds(workspace, identity)), [workspace, identity]);

    const schedule = useMemo(() => {
        if (scope === 'me') return identity.personId ? buildMySchedule(workspace, identity.personId, year) : { metric: 'aa' as const, rows: [] };
        if (scope === 'team') return buildTeamSchedule(workspace, teamIds, year);
        if (scope === 'project') return buildProjectSchedule(workspace, activeProjectId, year);
        return buildWorkPackageSchedule(workspace, activeProjectId, year);
    }, [scope, workspace, identity.personId, year, activeProjectId, teamIds]);

    const deadlines = useMemo(() => {
        if (scope === 'me') return me ? upcomingDeadlines(workspace, { personNames: [`${me.firstName} ${me.lastName}`] }, now) : [];
        if (scope === 'team') {
            const names = workspace.people.filter(p => teamIds.includes(p.id)).map(p => `${p.firstName} ${p.lastName}`);
            return upcomingDeadlines(workspace, { personNames: names, projectIds: new Set(visibleProjects.map(p => p.id)) }, now);
        }
        return upcomingDeadlines(workspace, { projectIds: new Set(activeProjectId ? [activeProjectId] : []) }, now);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, workspace, me, teamIds, visibleProjects, activeProjectId]);

    const tasksMetric = schedule.metric === 'tasks';
    const isThisYear = year === now.getFullYear();
    const m = now.getMonth();
    const clickablePeople = scope === 'team' || scope === 'project';
    const needsProject = scope === 'project' || scope === 'workpackage';
    const noPerson = scope === 'me' && !identity.personId;
    const monthTotals = MONTHS_TR.map((_, i) => schedule.rows.reduce((s, r) => s + (tasksMetric ? r.cells[i].tasks : r.cells[i].aa), 0));

    // Özet kartları
    const overdue = deadlines.filter(d => d.days < 0).length;
    const soon = deadlines.filter(d => d.days >= 0 && d.days <= 14).length;
    const stats: { label: string; value: React.ReactNode; hint?: string; tone?: string }[] = [];
    if (!tasksMetric && isThisYear) {
        if (scope === 'me' && schedule.monthlyCapacity) {
            const load = monthTotals[m];
            const cap = schedule.monthlyCapacity[m];
            stats.push({ label: `${MONTHS_TR[m]} yükü`, value: `${fmt(load)} AA`, hint: `Kapasite ${fmt(cap)} AA`, tone: load > cap + 1e-9 ? 'm-ink-bad' : undefined });
            const leave = (schedule.monthlyLeave || []).reduce((s, v) => s + v, 0);
            stats.push({ label: `${year} izin`, value: `${fmt(leave)} AA`, hint: leave > 0 ? `${(schedule.monthlyLeave || []).filter(v => v > 0.049).length} ayda` : 'İzin girilmemiş' });
        } else {
            const over = schedule.rows.filter(r => r.cells[m].over).length;
            stats.push({ label: `${MONTHS_TR[m]} toplam`, value: `${fmt(monthTotals[m])} AA`, hint: `${schedule.rows.filter(r => r.cells[m].aa > 0.049).length} kişi çalışıyor` });
            stats.push({ label: 'Aşırı yük', value: over, hint: over ? 'Kapasitesini aşan kişi (bu ay)' : 'Bu ay aşım yok', tone: over ? 'm-ink-bad' : 'm-ink-ok' });
        }
    } else if (tasksMetric) {
        stats.push({ label: `${year} terminli görev`, value: monthTotals.reduce((s, v) => s + v, 0), hint: `${schedule.rows.length} iş paketi` });
    }
    stats.push({ label: 'Geciken', value: overdue, hint: overdue ? 'Termini geçmiş açık görev' : 'Geciken görev yok', tone: overdue ? 'm-ink-bad' : undefined });
    stats.push({ label: '14 gün içinde', value: soon, hint: 'Yaklaşan termin' });

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-[70ch]">
                    <h1 className="m-0 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Takvim</h1>
                    <p className="m-0 mt-1 text-[15px] m-text-3">Aylık tahsis (AA), izinler ve görev terminleri bir arada.</p>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" className="m-icon-btn" aria-label="Önceki yıl" onClick={() => setYear(y => y - 1)}><Icon name="chevronLeft" /></button>
                    <span className="min-w-[64px] text-center text-[17px] font-semibold m-text m-tabular">{year}</span>
                    <button type="button" className="m-icon-btn" aria-label="Sonraki yıl" onClick={() => setYear(y => y + 1)}><Icon name="chevronRight" /></button>
                    {!isThisYear && <button type="button" className="m-btn m-btn-plain !min-h-[40px]" onClick={() => setYear(now.getFullYear())}>Bu yıl</button>}
                </div>
            </header>

            <div className="flex flex-wrap items-center gap-2">
                <div className="m-segmented" role="group" aria-label="Kapsam">
                    {SCOPES.map(s => <button key={s.id} type="button" className="m-segment" aria-pressed={scope === s.id} onClick={() => setScope(s.id)}>{s.label}</button>)}
                </div>
                {needsProject && (
                    <select aria-label="Proje" className="m-pill is-active" value={activeProjectId} onChange={e => setProjectId(e.target.value)}>
                        {visibleProjects.length === 0 && <option value="">Proje yok</option>}
                        {visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                )}
                {scope === 'me' && me && <span className="text-[14px] m-text-3">{me.firstName} {me.lastName}</span>}
            </div>

            {noPerson ? (
                <div className="m-surface rounded-2xl px-5 py-10 flex flex-col items-center gap-2 text-center">
                    <span className="w-11 h-11 rounded-full m-tone-accent flex items-center justify-center"><Icon name="users" size={22} /></span>
                    <span className="text-[17px] font-semibold m-text">Kişi seçilmedi</span>
                    <span className="text-[15px] m-text-3 max-w-[52ch]">“Takvimim” için profil menüsünden kendinizi seçin. Yönetici olarak “Ekip” takvimini kullanabilirsiniz.</span>
                </div>
            ) : (
                <>
                    <section aria-label="Özet" className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                        {stats.map(s => <Stat key={s.label} {...s} />)}
                    </section>

                    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px] items-start">
                        <section aria-label="Aylık çizelge" className="m-surface rounded-2xl p-3 sm:p-4 flex flex-col gap-3 min-w-0">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[820px] border-separate" style={{ borderSpacing: '3px' }}>
                                    <thead>
                                        <tr>
                                            <th scope="col" className="text-left text-[13px] font-semibold m-text-3 px-2 py-1.5 min-w-[180px]">
                                                {scope === 'me' ? 'Proje' : scope === 'workpackage' ? 'İş paketi' : 'Kişi'}
                                            </th>
                                            {MONTHS_TR.map((mo, i) => (
                                                <th key={mo} scope="col" className={`text-center text-[13px] font-semibold px-0.5 py-1.5 w-[54px] ${isThisYear && i === m ? 'm-accent' : 'm-text-3'}`} aria-current={isThisYear && i === m ? 'date' : undefined}>{mo}</th>
                                            ))}
                                            <th scope="col" className="text-right text-[13px] font-semibold m-text-3 px-2 py-1.5">{tasksMetric ? 'Görev' : 'Yıllık'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {schedule.rows.map(row => (
                                            <tr key={row.id}>
                                                <th scope="row" className="text-left font-normal px-2 py-1">
                                                    {clickablePeople ? (
                                                        <button type="button" className="bg-transparent border-0 p-0 text-left cursor-pointer flex flex-col" onClick={() => onViewPerson(row.id)}>
                                                            <span className="text-[15px] m-text hover:underline">{row.label}</span>
                                                            {row.sublabel && <span className="text-[12.5px] m-text-3">{row.sublabel}</span>}
                                                        </button>
                                                    ) : scope === 'me' && workspace.projects.some(p => p.id === row.id) ? (
                                                        <button type="button" className="bg-transparent border-0 p-0 text-left cursor-pointer text-[15px] m-text hover:underline" onClick={() => onOpenProject(row.id)}>{row.label}</button>
                                                    ) : (
                                                        <span className="flex flex-col"><span className="text-[15px] m-text">{row.label}</span>{row.sublabel && <span className="text-[12.5px] m-text-3">{row.sublabel}</span>}</span>
                                                    )}
                                                </th>
                                                {row.cells.map((c, i) => {
                                                    const tone = toneOf(c, tasksMetric, schedule.monthlyCapacity?.[i]);
                                                    const label = tasksMetric ? (c.tasks > 0 ? String(c.tasks) : '') : c.aa > 0.049 ? fmt(c.aa) : c.leave > 0.049 ? 'izin' : '';
                                                    const title = `${MONTHS_TR[i]} · ${tasksMetric ? `${c.tasks} görev` : `${fmt(c.aa)} AA${c.leave > 0.049 ? ` · izin ${fmt(c.leave)}` : ''}${c.over ? ' · kapasite aşıldı' : ''}${c.tasks ? ` · ${c.tasks} görev termini` : ''}`}`;
                                                    return (
                                                        <td key={i} className="p-0">
                                                            <div title={title} aria-label={`${row.label}, ${title}`}
                                                                className={`relative h-10 rounded-lg flex items-center justify-center text-[13px] font-semibold m-tabular ${TONE_CLASS[tone]}`}
                                                                style={isThisYear && i === m ? { boxShadow: 'inset 0 0 0 2px var(--m-accent)' } : undefined}>
                                                                {label}
                                                                {!tasksMetric && c.tasks > 0 && (
                                                                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full m-accent-bg text-[11px] font-bold flex items-center justify-center">{c.tasks}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                                <td className="text-right text-[15px] font-semibold m-text m-tabular px-2">{tasksMetric ? row.total : fmt(row.total)}</td>
                                            </tr>
                                        ))}
                                        {scope === 'me' && schedule.monthlyCapacity && schedule.rows.length > 0 && (
                                            <tr>
                                                <th scope="row" className="text-left text-[13px] font-semibold m-text-2 px-2 pt-2">Toplam yük</th>
                                                {monthTotals.map((v, i) => {
                                                    const over = v > (schedule.monthlyCapacity![i] || 0) + 1e-9;
                                                    return <td key={i} className={`text-center text-[13px] font-semibold m-tabular pt-2 ${over ? 'm-ink-bad' : 'm-text-2'}`} title={over ? 'Kapasite aşıldı' : undefined}>{v > 0.049 ? fmt(v) : ''}{over ? ' ▲' : ''}</td>;
                                                })}
                                                <td className="text-right text-[13px] font-semibold m-text-2 m-tabular px-2 pt-2">{fmt(monthTotals.reduce((s, v) => s + v, 0))}</td>
                                            </tr>
                                        )}
                                        {scope === 'me' && schedule.monthlyCapacity && (
                                            <tr>
                                                <th scope="row" className="text-left text-[13px] font-semibold m-text-3 px-2 pt-1">Efektif kapasite</th>
                                                {schedule.monthlyCapacity.map((c, i) => (
                                                    <td key={i} className="text-center text-[13px] m-text-3 m-tabular pt-1" title={schedule.monthlyLeave?.[i] ? `izin ${fmt(schedule.monthlyLeave[i])}` : undefined}>{fmt(c)}</td>
                                                ))}
                                                <td></td>
                                            </tr>
                                        )}
                                        {scope !== 'me' && schedule.rows.length > 1 && (
                                            <tr>
                                                <th scope="row" className="text-left text-[13px] font-semibold m-text-3 px-2 pt-2">Toplam</th>
                                                {monthTotals.map((v, i) => <td key={i} className="text-center text-[13px] font-semibold m-text-2 m-tabular pt-2">{tasksMetric ? v || '' : v > 0.049 ? fmt(v) : ''}</td>)}
                                                <td className="text-right text-[13px] font-semibold m-text-2 m-tabular px-2 pt-2">{tasksMetric ? monthTotals.reduce((s, v) => s + v, 0) : fmt(monthTotals.reduce((s, v) => s + v, 0))}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {schedule.rows.length === 0 && <p className="m-0 py-10 text-center text-[15px] m-text-3">Bu kapsam ve yıl için kayıt yok.</p>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[13px] m-text-2">
                                {tasksMetric ? (
                                    <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded m-tone-accent"></span>Görev termini (o ay)</span>
                                ) : (
                                    <>
                                        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded m-tone-ok"></span>Uygun</span>
                                        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded m-tone-warn"></span>Dolu (%85+)</span>
                                        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded m-tone-bad"></span>Aşırı</span>
                                        <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded m-tone-hold"></span>İzin</span>
                                        <span className="inline-flex items-center gap-1.5"><span className="w-[18px] h-[18px] rounded-full m-accent-bg text-[11px] font-bold inline-flex items-center justify-center">2</span>Görev termini</span>
                                    </>
                                )}
                            </div>
                        </section>

                        <section aria-label="Terminler" className="m-surface rounded-2xl p-5 flex flex-col gap-2">
                            <div>
                                <h2 className="m-0 text-[17px] font-semibold m-text">Terminler</h2>
                                <p className="m-0 mt-0.5 text-[14px] m-text-3">Geciken ve 30 gün içindeki açık görevler</p>
                            </div>
                            {deadlines.length === 0 ? (
                                <p className="m-0 py-6 text-center text-[15px] m-text-3">Yaklaşan termin yok.</p>
                            ) : (
                                <div className="-mx-2 flex flex-col max-h-[520px] overflow-y-auto">
                                    {deadlines.slice(0, 40).map((d, i) => {
                                        const sep = rowSep(i);
                                        const tone = d.days < 0 ? 'm-tone-bad' : d.days <= 3 ? 'm-tone-warn' : 'm-tone-hold';
                                        return (
                                            <button key={`${d.projectId}-${d.taskId}`} type="button" onClick={() => onOpenProject(d.projectId)} className={`m-row-link flex items-center gap-3 px-2 py-2.5 min-h-[56px] ${sep.className}`} style={sep.style}>
                                                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                    <span className="text-[15px] font-semibold m-text truncate">{d.taskName}</span>
                                                    <span className="text-[13px] m-text-3 truncate">{[scope === 'project' || scope === 'workpackage' ? '' : d.projectName, d.resourceName || 'Atanmadı', new Date(`${d.dueDate}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</span>
                                                </span>
                                                <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${tone}`}>{deadlineLabel(d.days)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>
                </>
            )}
        </div>
    );
};

export default ModernCalendar;
