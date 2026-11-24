import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Leave, Person, Project, Task } from '../../types';
import { JiraIssueWorklog } from '../../utils/integrations';
import { Identity } from '../../utils/rbac';
import { getWorklogTimeZone } from '../../utils/workforce';
import { formatRange, toIsoDay } from '../../utils/calendarRange';
import { buildSprintTeamCalendar, indexSprintWorklogs, SprintLoadCell } from '../../utils/sprintTeamCalendar';
import { SprintLane } from '../../utils/timelinePlan';
import { fmtHours } from './WorkforceParts';
import { sprintLabel } from './taskMeta';
import { Field, Sheet } from './ui';
import { useJiraTimesheet } from './useJiraTimesheet';

interface Selection {
    component: string;
    person: string;
}

interface Props {
    project: Project;
    lane: SprintLane;
    people: Person[];
    leaves: Leave[];
    identity: Identity;
    selection: Selection;
    onSelection: (selection: Selection) => void;
    onClose: () => void;
    onViewTask: (task: Task) => void;
}

const dayLabel = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const weekday = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });
const number = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const sum = (numbers: number[]) => numbers.reduce((total, value) => total + value, 0);

const capacityTone = (cell: SprintLoadCell) => {
    if (!cell.hours || cell.capacity === undefined) return 'm-fill-2';
    if (cell.hours > cell.capacity + 1e-6) return 'm-tone-bad';
    return cell.hours >= cell.capacity * 0.85 ? 'm-tone-warn' : 'm-tone-accent';
};

const SprintTeamCalendar = ({ project, lane, people, leaves, identity, selection, onSelection, onClose, onViewTask }: Props) => {
    const model = useMemo(() => buildSprintTeamCalendar(project, lane, people, leaves), [project, lane, people, leaves]);
    const [refresh, setRefresh] = useState(0);
    const [focus, setFocus] = useState<{ row: string; index: number } | null>(null);
    const detailRef = useRef<HTMLElement>(null);
    const timeZone = getWorklogTimeZone();
    const worklogs = useJiraTimesheet({ project, start: model.days[0]?.day || '', end: model.days.at(-1)?.day || '', timeZone, identity, people, refresh });
    // Kaydın saati, günleri belirleyen worklog saat diliminde gösterilir (tarayıcının değil).
    const clock = useMemo(() => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone }), [timeZone]);
    const index = useMemo(() => worklogs.status === 'ready' ? indexSprintWorklogs(model.rows.map(row => row.key), worklogs.rows, people) : null, [worklogs, model.rows, people]);
    const logsOf = (row: string, day: string): JiraIssueWorklog[] => index?.byRow.get(row)?.get(day) || [];
    const loggedOf = (row: string, day: string) => sum(logsOf(row, day).map(entry => entry.hours));
    const tasksByKey = useMemo(() => new Map(project.tasks.filter(t => t.jiraId).map(t => [t.jiraId.toUpperCase(), t])), [project.tasks]);
    const openTask = (task: Task) => { onClose(); onViewTask(task); };
    useEffect(() => { if (focus) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [focus]);
    const component = model.components.some(([key]) => key === selection.component) ? selection.component : '';
    const team = model.rows.filter(row => !component || row.components.has(component));
    const selected = team.find(row => row.key === selection.person);
    const setPerson = (person: string) => onSelection({ component, person });
    const rows = selected ? [selected] : team;
    const workCells = rows.flatMap(row => row.cells.filter((_, i) => model.days[i].kind === 'work'));
    const hours = sum(rows.flatMap(row => row.tasks.map(item => item.hours ?? 0)));
    const scopeHours = component ? sum(rows.flatMap(row => row.tasks.filter(item => item.components.includes(component)).map(item => item.hours ?? 0))) : undefined;
    const capacities = workCells.flatMap(cell => cell.capacity === undefined ? [] : [cell.capacity]);
    const partialCapacity = capacities.length !== workCells.length;
    const unassigned = model.unassigned.filter(item => !component || item.components.includes(component));
    const withoutEstimate = rows.reduce((count, row) => count + row.tasks.filter(item => item.hours === undefined).length, 0);
    const logged = index ? sum(rows.flatMap(row => model.days.map(day => loggedOf(row.key, day.day)))) : undefined;
    const focusRow = focus ? rows.find(row => row.key === focus.row) : undefined;
    const focusDay = focus && focusRow ? model.days[focus.index] : undefined;
    const title = `${sprintLabel(lane.version, project.settings.sprintNames)} ekip takvimi`;
    const interval = lane.start && lane.end ? formatRange({ start: toIsoDay(lane.start), end: toIsoDay(lane.testEnd || lane.end) }) : '';

    return (
        <Sheet title={title} subtitle={interval} xxl onClose={onClose}>
            <div className="grid gap-3 sm:grid-cols-2 sm:max-w-xl">
                <Field label="Bileşen ekibi" htmlFor="sprint-calendar-team">
                    <select id="sprint-calendar-team" className="m-input" value={component} onChange={e => onSelection({ component: e.target.value, person: '' })}>
                        <option value="">Tüm ekipler</option>
                        {model.components.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                    </select>
                </Field>
                <Field label="Kişi" htmlFor="sprint-calendar-person">
                    <select id="sprint-calendar-person" className="m-input" value={selected?.key || ''} onChange={e => setPerson(e.target.value)}>
                        <option value="">Tüm kişiler</option>
                        {team.map(row => <option key={row.key} value={row.key}>{row.name}</option>)}
                    </select>
                </Field>
            </div>
            <dl className="m-0 flex flex-wrap gap-3" aria-label="Sprint yoğunluk özeti">
                <div className="rounded-xl m-fill-2 px-3 py-2"><dt className="text-[13px] m-text-3">Sprint yükü</dt><dd className="m-0 font-semibold m-tabular">{fmtHours(hours)}</dd></div>
                <div className="rounded-xl m-fill-2 px-3 py-2"><dt className="text-[13px] m-text-3">{partialCapacity ? 'Bilinen kapasite' : 'Kapasite'}</dt><dd className="m-0 font-semibold m-tabular">{capacities.length ? fmtHours(sum(capacities)) : '—'}</dd></div>
                {scopeHours !== undefined && <div className="rounded-xl m-fill-2 px-3 py-2"><dt className="text-[13px] m-text-3">Bileşenin yükü</dt><dd className="m-0 font-semibold m-tabular">{fmtHours(scopeHours)}</dd></div>}
                {worklogs.status !== 'off' && (
                    <div className="rounded-xl m-fill-2 px-3 py-2 flex items-end gap-3">
                        <div><dt className="text-[13px] m-text-3">Jira'ya girilen</dt><dd className="m-0 font-semibold m-tabular">{logged === undefined ? (worklogs.status === 'loading' ? '…' : '—') : fmtHours(logged)}</dd></div>
                        <button type="button" className="m-btn m-btn-plain" disabled={worklogs.status === 'loading'} onClick={() => setRefresh(value => value + 1)}>Yenile</button>
                    </div>
                )}
            </dl>
            {rows.length > 0 ? (
                <>
                    <div className="overflow-x-auto rounded-xl m-surface" tabIndex={0} aria-label="Kişi ve güne göre yoğunluk tablosu">
                        <table className="border-separate border-spacing-1 text-[13px]" aria-label="Günlük sprint yoğunluğu">
                            <thead>
                                <tr>
                                    <th scope="col" className="sticky left-0 z-[1] m-bg min-w-40 text-left px-2 py-2">Kişi</th>
                                    {model.days.map(day => (
                                        <th key={day.day} scope="col" className={`min-w-[78px] rounded-md px-2 py-1 whitespace-nowrap ${day.kind === 'test' ? 'm-tone-accent' : 'm-fill-2'}`}>
                                            <span className="block font-semibold">{dayLabel.format(day.date)}</span>
                                            <span className="block text-[12px] m-text-3">{day.kind === 'test' ? 'Test' : day.kind === 'off' ? 'Tatil' : weekday.format(day.date)}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={row.key}>
                                        <th scope="row" className="sticky left-0 z-[1] m-bg rounded-md px-1 text-left">
                                            <button type="button" className="m-row-link w-full px-2 py-2 text-left font-semibold" aria-pressed={selected?.key === row.key}
                                                onClick={() => setPerson(selected?.key === row.key ? '' : row.key)}>{row.name}</button>
                                        </th>
                                        {row.cells.map((cell, index) => {
                                            const date = model.days[index];
                                            const componentHours = cell.byComponent.get(component);
                                            const dayLogged = loggedOf(row.key, date.day);
                                            const active = focus?.row === row.key && focus.index === index;
                                            const planned = date.kind === 'work' ? `planlanan ${number.format(cell.hours)} saat, kapasite ${cell.capacity === undefined ? 'bilinmiyor' : `${number.format(cell.capacity)} saat`}` : date.kind === 'test' ? 'test günü' : 'tatil';
                                            return (
                                                <td key={date.day} className={`rounded-md p-0 min-w-[78px] whitespace-nowrap ${capacityTone(cell)}`}>
                                                    <button type="button" aria-pressed={active}
                                                        aria-label={`${row.name}, ${dayLabel.format(date.date)}: ${planned}${dayLogged ? `, Jira kaydı ${number.format(dayLogged)} saat` : ''}`}
                                                        className="w-full min-h-[44px] rounded-md px-1 py-2 text-center border-0 bg-transparent cursor-pointer"
                                                        style={active ? { boxShadow: 'inset 0 0 0 2px var(--m-accent)' } : undefined}
                                                        onClick={() => setFocus(active ? null : { row: row.key, index })}>
                                                        {date.kind === 'work' ? (
                                                            <>
                                                                <span className="m-tabular font-semibold">{number.format(cell.hours)} / {cell.capacity === undefined ? '—' : number.format(cell.capacity)}</span>
                                                                {componentHours !== undefined && <span className="block text-[11px]">{fmtHours(componentHours)} bileşen</span>}
                                                            </>
                                                        ) : <span className="m-text-3">—</span>}
                                                        {dayLogged > 0 && <span className="block text-[11px] m-tabular">Kayıt {fmtHours(dayLogged)}</span>}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {focusRow && focusDay && (() => {
                        const cell = focusRow.cells[focus!.index];
                        const plannedTasks = [...cell.byTask].map(([id, hours]) => ({ task: focusRow.tasks.find(item => item.task.id === id)?.task, hours })).filter(item => item.task);
                        const logs = logsOf(focusRow.key, focusDay.day);
                        return (
                            <section ref={detailRef} aria-label={`${focusRow.name}, ${dayLabel.format(focusDay.date)} ayrıntısı`} className="rounded-xl m-surface p-4 flex flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="m-0 flex-1 text-[16px] font-semibold">{focusRow.name} · {dayLabel.format(focusDay.date)} {weekday.format(focusDay.date)}</h3>
                                    <span className="text-[13px] m-text-3 m-tabular">Plan {fmtHours(cell.hours)}{index ? ` · Kayıt ${fmtHours(loggedOf(focusRow.key, focusDay.day))}` : ''}</span>
                                    <button type="button" className="m-btn m-btn-plain" onClick={() => setFocus(null)}>Kapat</button>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="min-w-0">
                                        <h4 className="m-0 mb-1.5 text-[13px] font-semibold m-text-2">O gün için planlanan</h4>
                                        {plannedTasks.length ? (
                                            <ul className="m-0 list-none p-0 grid gap-1">
                                                {plannedTasks.map(({ task, hours: h }) => (
                                                    <li key={task!.id}><button type="button" className="m-row-link w-full rounded-lg m-fill-2 px-3 py-2 text-left flex justify-between gap-2" onClick={() => openTask(task!)}>
                                                        <span className="min-w-0 break-words">{task!.jiraId && <span className="m-text-3 mr-2">{task!.jiraId}</span>}{task!.name}</span>
                                                        <span className="m-text-3 text-[13px] m-tabular whitespace-nowrap">{fmtHours(h)}</span>
                                                    </button></li>
                                                ))}
                                            </ul>
                                        ) : <p className="m-0 text-[14px] m-text-3">{focusDay.kind === 'work' ? 'Bu güne dağıtılan görev yok.' : focusDay.kind === 'test' ? 'Test günü; geliştirme planlanmaz.' : 'Tatil günü.'}</p>}
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="m-0 mb-1.5 text-[13px] font-semibold m-text-2">Jira çalışma kayıtları</h4>
                                        {worklogs.status === 'off' ? <p className="m-0 text-[14px] m-text-3">Proje Jira'ya bağlı değil.</p>
                                            : worklogs.status === 'loading' ? <p className="m-0 text-[14px] m-text-3" role="status">Kayıtlar getiriliyor…</p>
                                            : worklogs.status === 'error' ? <p className="m-0 text-[14px] m-ink-warn" role="status">{worklogs.error}</p>
                                            : logs.length ? (
                                                <ul className="m-0 list-none p-0 grid gap-1">
                                                    {logs.map((entry, i) => {
                                                        const task = tasksByKey.get(entry.issueKey.toUpperCase());
                                                        const started = entry.started ? new Date(entry.started) : undefined;
                                                        const body = (
                                                            <>
                                                                <span className="flex justify-between gap-2">
                                                                    <span className="min-w-0 break-words"><span className="m-text-3 mr-2">{entry.issueKey}</span>{task?.name || entry.summary || ''}</span>
                                                                    <span className="m-tabular text-[13px] whitespace-nowrap">{started && !Number.isNaN(started.getTime()) ? `${clock.format(started)} · ` : ''}{fmtHours(entry.hours)}</span>
                                                                </span>
                                                                {entry.comment && <span className="block text-[13px] m-text-3 whitespace-pre-line break-words">{entry.comment}</span>}
                                                            </>
                                                        );
                                                        return (
                                                            <li key={entry.id || `${entry.issueKey}-${i}`}>
                                                                {task ? <button type="button" className="m-row-link w-full rounded-lg m-fill-2 px-3 py-2 text-left flex flex-col gap-0.5" onClick={() => openTask(task)}>{body}</button>
                                                                    : <div className="rounded-lg m-fill-2 px-3 py-2 flex flex-col gap-0.5">{body}</div>}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            ) : <p className="m-0 text-[14px] m-text-3">Bu gün için Jira kaydı yok.</p>}
                                    </div>
                                </div>
                            </section>
                        );
                    })()}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] m-text-3">
                        <span>Hücreler planlanan saat / kapasiteyi{worklogs.status !== 'off' ? ', altında Jira\'ya girilen saati' : ''} gösterir. Ayrıntı için hücreye tıklayın.</span>
                        <span className="rounded px-2 py-0.5 m-tone-warn">Kapasiteye yakın</span>
                        <span className="rounded px-2 py-0.5 m-tone-bad">Kapasite aşıldı</span>
                    </div>
                    <p className="m-0 text-[13px] m-text-3">Tahmini efor, sprintin iş günlerine ve varsa görev terminine göre dağıtılır.
                        {worklogs.status === 'loading' && ' Jira çalışma kayıtları getiriliyor…'}
                        {worklogs.status === 'error' && <span className="m-ink-warn"> Jira kayıtları alınamadı: {worklogs.error}</span>}
                        {index && index.unmatched > 0 && ` ${index.unmatched} Jira kaydı takvimdeki bir kişiyle eşleşmedi.`}</p>
                </>
            ) : <p className="m-0 m-text-3 text-[14px]">{component ? 'Bu bileşende kayıtlı ekip üyesi yok.' : 'Gösterilecek ekip üyesi yok.'}</p>}
            {(withoutEstimate > 0 || unassigned.length > 0) && (
                <p className="m-0 text-[13px] m-text-3">
                    {[withoutEstimate ? `${withoutEstimate} atanan görevin süre tahmini yok` : '', unassigned.length ? `${unassigned.length} atanmamış görev` : ''].filter(Boolean).join(' · ')}
                </p>
            )}
            {selected && (
                <section aria-label={`${selected.name} sprint görevleri`} className="min-w-0">
                    <h3 className="m-0 mb-2 text-[15px] font-semibold">{selected.name} · Sprint görevleri</h3>
                    {selected.tasks.length === 0 ? <p className="m-0 text-[14px] m-text-3">Bu sprintte atanan görev yok.</p> : (
                        <ul className="m-0 list-none p-0 grid gap-1">
                            {selected.tasks.map(({ task, hours: estimate, components }) => (
                                <li key={task.id}>
                                    <button type="button" className="m-row-link w-full rounded-xl m-fill-2 px-3 py-2 text-left flex flex-wrap justify-between gap-1.5"
                                        onClick={() => { onClose(); onViewTask(task); }}>
                                        <span className="min-w-0 break-words">{task.jiraId && <span className="m-text-3 mr-2">{task.jiraId}</span>}{task.name}
                                            {component && components.includes(component) && <span className="ml-2 m-accent text-[12px]">Seçili bileşen</span>}</span>
                                        <span className="m-text-3 text-[13px] m-tabular">{estimate === undefined ? 'Tahmin yok' : `Plan ${fmtHours(estimate)}`}
                                            {index && task.jiraId && (() => {
                                                const spent = sum([...(index.byRow.get(selected.key)?.values() || [])].flat().filter(entry => entry.issueKey.toUpperCase() === task.jiraId.toUpperCase()).map(entry => entry.hours));
                                                return spent > 0 ? ` · Kayıt ${fmtHours(spent)}` : '';
                                            })()}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </Sheet>
    );
};

export default SprintTeamCalendar;
