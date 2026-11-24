import React, { useMemo } from 'react';
import { Leave, Person, Project, Task } from '../../types';
import { formatRange, toIsoDay } from '../../utils/calendarRange';
import { buildSprintTeamCalendar, SprintLoadCell } from '../../utils/sprintTeamCalendar';
import { SprintLane } from '../../utils/timelinePlan';
import { fmtHours } from './WorkforceParts';
import { sprintLabel } from './taskMeta';
import { Field, Sheet } from './ui';

interface Selection {
    component: string;
    person: string;
}

interface Props {
    project: Project;
    lane: SprintLane;
    people: Person[];
    leaves: Leave[];
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

const SprintTeamCalendar = ({ project, lane, people, leaves, selection, onSelection, onClose, onViewTask }: Props) => {
    const model = useMemo(() => buildSprintTeamCalendar(project, lane, people, leaves), [project, lane, people, leaves]);
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
                                            return (
                                                <td key={date.day} className={`rounded-md text-center px-1 py-2 min-w-[78px] whitespace-nowrap ${capacityTone(cell)}`}>
                                                    {date.kind === 'work' ? (
                                                        <>
                                                            <span className="m-tabular font-semibold">{number.format(cell.hours)} / {cell.capacity === undefined ? '—' : number.format(cell.capacity)}</span>
                                                            {componentHours !== undefined && <span className="block text-[11px]">{fmtHours(componentHours)} bileşen</span>}
                                                        </>
                                                    ) : <span className="m-text-3">—</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] m-text-3">
                        <span>Hücreler planlanan saat / kapasiteyi gösterir.</span>
                        <span className="rounded px-2 py-0.5 m-tone-warn">Kapasiteye yakın</span>
                        <span className="rounded px-2 py-0.5 m-tone-bad">Kapasite aşıldı</span>
                    </div>
                    <p className="m-0 text-[13px] m-text-3">Tahmini efor, sprintin iş günlerine ve varsa görev terminine göre dağıtılır.</p>
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
                                        <span className="m-text-3 text-[13px]">{estimate === undefined ? 'Tahmin yok' : fmtHours(estimate)}</span>
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
