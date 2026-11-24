import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Leave, Person, Project, Sprint, Task, TaskStatus } from '../../types';
import { exportSprintPlanToExcel } from '../../utils/exporter';
import { planTaskVersionsDetailed, PlanWarning } from '../../utils/sprintPlanner';
import { calculatePertFuzzyPert } from '../../utils/timeline';
import { buildLanes, currentLaneVersion, laneRange, lastPlannedSprint, positionPct, segmentPct, SprintLane } from '../../utils/timelinePlan';
import { DayRange, formatRange, isDayRange, toIsoDay } from '../../utils/calendarRange';
import { canPlanSprintTask, periodTaskQuery, sprintsInPeriod } from '../../utils/planning/period';
import { Icon } from './icons';
import { COLUMN_META, columnOf, daysLate, initialsOf, PRIORITY_META, sprintLabel } from './taskMeta';
import { Field, Sheet } from './ui';
import TaskQueryPicker from './TaskQueryPicker';
import SprintTeamCalendar from './SprintTeamCalendar';

/**
 * Modern zaman çizelgesi (sprint planı). Üstte tüm sprintleri ve test
 * dönemlerini tek şeritte gösteren zaman çizelgesi; altında sprint sütunları.
 * Görevler sütunlar arasında sürüklenir; her sprintte birim kapasitesi izlenir.
 */

export interface CalendarSettings {
    projectStartDate: string;
    sprintDuration: number;
    globalTestDays: number;
    useJiraRemainingEstimate?: boolean;
}

interface ModernTimelineProps {
    project: Project;
    people: Person[];
    leaves: Leave[];
    canEdit: boolean;
    onMoveTask: (taskId: string, version: number) => void;
    onPlanGenerated: (tasks: Task[]) => void;
    onInsertSprint: (version: number) => void;
    onDeleteSprint: (version: number) => void;
    onRenameSprint: (version: number, name: string) => void;
    onUpdateCalendar: (c: CalendarSettings) => void;
    onViewTask: (task: Task) => void;
    onNewTask: () => void;
    period: DayRange | null;
    me?: string;
    initialSelection?: string[];
    initialSprint?: number;
    onPeriodChange: (period: DayRange | null) => void;
    onBulkMove?: (ids: ReadonlySet<string>, sprint: number) => void;
    onOpenFilteredList: (query: string) => void;
    onOpenPeriodJira?: (period: DayRange) => void;
    onOpenManualRelease?: (ids: ReadonlySet<string>) => void;
}

const dm = (d?: Date) => (d ? d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '');
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Kaydırılan alan içinde kırpılmayan, ekrana göre konumlanan küçük menü */
const LaneMenu: React.FC<{ label: string; items: { label: string; danger?: boolean; run: () => void }[] }> = ({ label, items }) => {
    const [pos, setPos] = useState<React.CSSProperties | null>(null);
    const ref = useRef<HTMLButtonElement>(null);
    const toggle = () => {
        if (pos) { setPos(null); return; }
        const r = ref.current!.getBoundingClientRect();
        setPos({ position: 'fixed', top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    };
    return (
        <>
            <button ref={ref} type="button" className="m-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}><Icon name="more" /></button>
            {pos && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setPos(null)} aria-hidden="true"></div>
                    <div role="menu" className="w-56 m-surface m-pop rounded-2xl py-1.5 z-50" style={pos}>
                        {items.map(it => (
                            <button key={it.label} type="button" role="menuitem" onClick={() => { setPos(null); it.run(); }} className={`m-row-link w-full flex items-center min-h-[44px] px-3.5 text-[15px] ${it.danger ? 'm-ink-bad' : ''}`}>{it.label}</button>
                        ))}
                    </div>
                </>
            )}
        </>
    );
};

const TaskChip: React.FC<{ task: Task; draggable: boolean; onOpen: () => void }> = ({ task, draggable, onOpen }) => {
    const col = columnOf(task.status);
    const done = task.status === TaskStatus.Done;
    const pert = task.time.avg > 0 ? calculatePertFuzzyPert(task.time).pert : 0;
    const late = daysLate(task);
    const urgent = task.priority === 'Blocker' || task.priority === 'High';
    return (
        <div
            draggable={draggable}
            onDragStart={e => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; }}
            className={`m-surface rounded-xl ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{ boxShadow: 'var(--m-shadow)' }}
        >
            <button type="button" onClick={onOpen} className="m-row-link rounded-xl px-3 py-2.5 flex items-start gap-2.5 text-left">
                <span aria-hidden="true" className="mt-1 w-3 h-3 rounded-full flex-none" style={{ boxShadow: `inset 0 0 0 2px ${COLUMN_META[col].ring}`, background: COLUMN_META[col].fill }}></span>
                <span className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className={`text-[14px] leading-snug line-clamp-2 ${done ? 'm-text-3 line-through' : 'm-text'}`}>{task.name}</span>
                    <span className="flex items-center gap-2 text-[12px] m-text-3">
                        {task.resourceName && <span className="inline-flex items-center gap-1 min-w-0"><span aria-hidden="true" className="w-5 h-5 rounded-full m-fill m-text-2 flex items-center justify-center text-[10px] font-semibold flex-none">{initialsOf(task.resourceName)}</span><span className="truncate">{task.resourceName.split(' ')[0]}</span></span>}
                        {pert > 0 ? <span className="m-tabular whitespace-nowrap">{num(pert)} g</span> : <span className="m-ink-warn whitespace-nowrap">süre yok</span>}
                        {urgent && <span className={`whitespace-nowrap font-semibold ${PRIORITY_META[task.priority].ink}`}>{PRIORITY_META[task.priority].label}</span>}
                        {late > 0 && <span className="m-ink-bad font-semibold whitespace-nowrap">{late} g gecikti</span>}
                    </span>
                </span>
            </button>
        </div>
    );
};

const CalendarSheet: React.FC<{ value: CalendarSettings; onClose: () => void; onSave: (c: CalendarSettings) => void }> = ({ value, onClose, onSave }) => {
    const [start, setStart] = useState(value.projectStartDate);
    const [weeks, setWeeks] = useState(value.sprintDuration);
    const [testDays, setTestDays] = useState(value.globalTestDays);
    const [useRemaining, setUseRemaining] = useState(!!value.useJiraRemainingEstimate);
    return (
        <Sheet
            title="Takvim"
            onClose={onClose}
            footer={<>
                <span className="flex-1 text-[13px] m-text-3">Tüm sprint tarihleri yeniden hesaplanır.</span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!start} onClick={() => onSave({ projectStartDate: start, sprintDuration: weeks, globalTestDays: testDays, useJiraRemainingEstimate: useRemaining })}>Kaydet</button>
            </>}
        >
            <Field label="Proje başlangıcı" htmlFor="tl-start">
                <input id="tl-start" type="date" className="m-input" value={start} onChange={e => setStart(e.target.value)} />
            </Field>
            <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold m-text-2">Sprint süresi</span>
                <div className="m-segmented self-start" role="group" aria-label="Sprint süresi">
                    {[1, 2, 3, 4, 5, 6].map(w => <button key={w} type="button" className="m-segment" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>{w} hf</button>)}
                </div>
            </div>
            <Field label="Test dönemi (iş günü)" htmlFor="tl-test" hint="Her sprintin ardından test ve canlıya alma için ayrılan süre">
                <input id="tl-test" type="number" min={0} max={20} className="m-input m-tabular" value={testDays} onChange={e => setTestDays(Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)))} />
            </Field>
            <label className="flex items-center gap-2 text-[14px] m-text">
                <input type="checkbox" className="w-4 h-4" checked={useRemaining} onChange={e => setUseRemaining(e.target.checked)} />
                EVM ve iş yükü tahmininde Jira kalan süresini kullan
            </label>
        </Sheet>
    );
};

const ModernTimeline: React.FC<ModernTimelineProps> = ({ project, people, leaves, canEdit, onMoveTask, onPlanGenerated, onInsertSprint, onDeleteSprint, onRenameSprint, onUpdateCalendar, onViewTask, onNewTask, period, me, initialSelection, initialSprint, onPeriodChange, onBulkMove, onOpenFilteredList, onOpenPeriodJira, onOpenManualRelease }) => {
    const [extra, setExtra] = useState(0);
    const [dates, setDates] = useState<DayRange>(period || { start: '', end: '' });
    const [selection, setSelection] = useState<Set<string> | null>(() => initialSelection ? new Set(initialSelection) : null);
    const [targetSprint, setDestination] = useState<number>();
    const periodSprints = useMemo(() => period ? sprintsInPeriod(project, period) : [], [project.settings, period]);
    const lastUsed = lastPlannedSprint(project);
    const lanes = useMemo(() => buildLanes(project, Math.max(extra, (periodSprints.at(-1) || 0) - lastUsed)), [project, extra, periodSprints, lastUsed]);
    const sprints = period ? lanes.filter(l => periodSprints.includes(l.version)) : lanes.filter(l => l.version > 0);
    const range = laneRange(sprints);
    const today = new Date();
    const nowVersion = currentLaneVersion(lanes, today);
    const names = project.settings.sprintNames || {};
    const weeks = project.settings.sprintDuration || 3;
    const testDays = project.settings.globalTestDays || 4;
    const excluded = project.tasks.filter(t => t.includeInSprints === false).length;
    const [poolOpen, setPoolOpen] = useState(false);
    const [renaming, setRenaming] = useState<{ v: number; name: string } | null>(null);
    const [dropTarget, setDropTarget] = useState<number | null>(null);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [teamCalendarMode, setTeamCalendarMode] = useState(false);
    const [teamCalendarSprint, setTeamCalendarSprint] = useState<number | null>(null);
    const [teamCalendarSelection, setTeamCalendarSelection] = useState({ component: '', person: '' });
    const [result, setResult] = useState<{ warnings: PlanWarning[]; text: string } | null>(null);
    const laneRefs = useRef(new Map<number, HTMLElement>());
    useEffect(() => {
        if (initialSprint) laneRefs.current.get(initialSprint)?.scrollIntoView({ inline: 'start', block: 'nearest' });
    }, [initialSprint]);
    const teamCalendarLane = sprints.find(lane => lane.version === teamCalendarSprint);

    const openSprint = (version: number) => {
        if (teamCalendarMode) setTeamCalendarSprint(version);
        else laneRefs.current.get(version)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    };

    const pool = lanes[0];
    const bulkTasks = useMemo(() => project.tasks.filter(canPlanSprintTask), [project.tasks]);
    const bulkContext = useMemo(() => ({ sprintNames: project.settings.sprintNames, workPackages: project.workPackages, me }), [project.settings.sprintNames, project.workPackages, me]);
    const selected = new Set(bulkTasks.filter(t => selection?.has(t.id)).map(t => t.id));
    const targets = sprints.length ? sprints.map(l => l.version) : [lastUsed + 1];
    const destination = targetSprint ?? sprints.find(l => l.version === nowVersion)?.version ?? targets[0];
    const moveCount = bulkTasks.filter(t => selected.has(t.id) && (t.version || 0) !== destination).length;
    const setMonth = (offset: number) => {
        const month = today.getMonth() + offset;
        const next = { start: toIsoDay(new Date(today.getFullYear(), month, 1)), end: toIsoDay(new Date(today.getFullYear(), month + 1, 0)) };
        setDates(next);
        setDestination(undefined);
        onPeriodChange(next);
    };

    const autoPlan = () => {
        const placed = project.tasks.some(t => (t.version || 0) > 0 && t.status !== TaskStatus.Done);
        if (placed && !window.confirm('Otomatik plan, bitmemiş görevlerin sprintlerini öncül ilişkileri ve kapasiteye göre yeniden dağıtır. Devam edilsin mi?')) return;
        try {
            const r = planTaskVersionsDetailed(project.tasks, project.resources, weeks, testDays);
            onPlanGenerated(r.tasks);
            setExtra(0);
            setResult({ warnings: r.warnings, text: `${r.stats.plannedTaskCount} görev ${r.stats.sprintCount} sprinte dağıtıldı (${num(r.stats.totalEffortDays)} gün iş).` });
        } catch (e) {
            setResult({ warnings: [], text: e instanceof Error ? e.message : 'Plan oluşturulamadı.' });
        }
    };

    const exportExcel = () => exportSprintPlanToExcel((period ? sprints : lanes).map((l): Sprint => ({
        id: l.version,
        title: sprintLabel(l.version, names),
        tasks: l.tasks,
        unitLoads: {},
        startDate: l.start?.toLocaleDateString('tr-TR'),
        endDate: l.end?.toLocaleDateString('tr-TR'),
    })));

    const dropProps = (v: number) => (canEdit ? {
        onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dropTarget !== v) setDropTarget(v); },
        onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget(null); },
        onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDropTarget(null);
            const id = e.dataTransfer.getData('text/plain');
            const t = project.tasks.find(x => x.id === id);
            if (t && (t.version || 0) !== v) onMoveTask(id, v);
        },
    } : {});
    const dropStyle = (v: number): React.CSSProperties | undefined => (dropTarget === v ? { boxShadow: 'inset 0 0 0 2px var(--m-accent)', background: 'var(--m-accent-tint)' } : undefined);

    // Ay başları (şeridin altındaki ölçek)
    const monthTicks = useMemo(() => {
        if (!range) return [];
        const ticks: { left: number; label: string }[] = [];
        const d = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 1);
        while (d <= range.end) {
            const left = positionPct(d, range);
            if (left !== null) ticks.push({ left, label: `${MONTHS[d.getMonth()]}${d.getMonth() === 0 ? ` ${d.getFullYear()}` : ''}` });
            d.setMonth(d.getMonth() + 1);
        }
        return ticks;
    }, [range]);
    const todayPct = range ? positionPct(today, range) : null;

    const laneHeader = (l: SprintLane) => {
        const label = sprintLabel(l.version, names);
        const pct = l.capacity > 0 ? Math.round((l.load / l.capacity) * 100) : 0;
        const over = l.overloaded.length > 0;
        const isRenaming = renaming?.v === l.version;
        return (
            <div className="flex flex-col gap-2 px-3 pt-3 pb-2.5">
                <div className="flex items-center gap-2 min-h-[36px]">
                    {isRenaming ? (
                        <input
                            aria-label="Sprint adı"
                            className="m-input flex-1"
                            style={{ minHeight: 36 }}
                            autoFocus
                            value={renaming!.name}
                            onChange={e => setRenaming({ v: l.version, name: e.target.value })}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { onRenameSprint(l.version, renaming!.name.trim()); setRenaming(null); }
                                if (e.key === 'Escape') setRenaming(null);
                            }}
                            onBlur={() => { onRenameSprint(l.version, renaming!.name.trim()); setRenaming(null); }}
                        />
                    ) : (
                        <h3 className="m-0 flex-1 min-w-0 text-[17px] font-semibold m-text truncate">
                            {teamCalendarMode ? (
                                <button type="button" className="m-row-link w-full py-1 text-left font-semibold min-w-0 truncate m-accent"
                                    aria-label={`${label} ekip takvimi`} aria-haspopup="dialog" onClick={() => openSprint(l.version)}>{label}</button>
                            ) : label}
                        </h3>
                    )}
                    {nowVersion === l.version && !isRenaming && <span className="inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold m-tone-accent">Şimdi</span>}
                    {canEdit && !isRenaming && (
                        <LaneMenu label={`${label} işlemleri`} items={[
                            { label: 'Yeniden adlandır', run: () => setRenaming({ v: l.version, name: names[l.version] || '' }) },
                            { label: 'Önüne yeni sprint ekle', run: () => onInsertSprint(l.version) },
                            {
                                label: 'Sprinti sil', danger: true, run: () => {
                                    if (window.confirm(`${label} silinsin mi? İçindeki ${l.tasks.length} görev Havuz'a taşınır, sonraki sprintler bir öne kayar.`)) onDeleteSprint(l.version);
                                },
                            },
                        ]} />
                    )}
                </div>
                <span className="text-[13px] m-text-3">{dm(l.start)} – {dm(l.end)} · test {dm(l.testStart)}–{dm(l.testEnd)}</span>
                <span className="text-[13px] m-text-2">{l.tasks.length} görev{l.done ? ` · ${l.done} bitti` : ''}</span>
                {l.capacity > 0 && (
                    <div className="flex flex-col gap-1">
                        <span role="img" aria-label={`Kapasite kullanımı %${pct}`} className="block h-1.5 rounded-full m-fill overflow-hidden">
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: over ? 'var(--m-bad)' : pct >= 85 ? 'var(--m-warn)' : 'var(--m-accent)' }}></span>
                        </span>
                        <span className={`text-[12px] ${over ? 'm-ink-bad' : 'm-text-3'}`}>
                            {over ? `${l.overloaded.join(', ')} kapasiteyi aşıyor` : `Kapasite %${pct} · ${num(l.load)}/${num(l.capacity)} gün`}
                        </span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="m-0 text-[15px] m-text-2">
                    {sprints.length ? `${sprints.length} sprint · ${dm(range?.start)} – ${dm(range?.end)}` : 'Henüz sprint yok'} · sprint {weeks} hafta + {testDays} gün test
                    {excluded > 0 && <span className="m-text-3"> · {excluded} görev plan dışı</span>}
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                    {canEdit && <button type="button" className="m-btn m-btn-gray" onClick={() => setCalendarOpen(true)}><Icon name="sliders" size={18} />Takvim</button>}
                    <button type="button" className={`m-btn ${teamCalendarMode ? 'm-btn-primary' : 'm-btn-gray'}`} aria-pressed={teamCalendarMode} disabled={!sprints.length && !teamCalendarMode}
                        onClick={() => { setTeamCalendarMode(!teamCalendarMode); setTeamCalendarSprint(null); }}>
                        <Icon name="calendar" size={18} />{teamCalendarMode ? 'Ekip takvimini gizle' : 'Ekip takvimini göster'}
                    </button>
                    {onBulkMove && <button type="button" className="m-btn m-btn-gray" aria-expanded={!!selection} onClick={() => {
                        setSelection(selection ? null : new Set());
                        setDestination(undefined);
                    }}><Icon name="list" size={18} />Toplu sprint planı</button>}
                    <button type="button" className="m-btn m-btn-gray" onClick={exportExcel} disabled={!project.tasks.length}><Icon name="download" size={18} />Excel</button>
                    {canEdit && <button type="button" className="m-btn m-btn-primary" onClick={autoPlan} disabled={!project.tasks.length}><Icon name="rocket" size={18} />Otomatik planla</button>}
                </div>
            </div>
            {teamCalendarMode && <p className="m-0 text-[14px] m-text-2" role="status">Ekip yoğunluğunu açmak için zaman şeridinden veya sütun başlığından bir sprint seçin.</p>}

            <section aria-label="Plan aralığı" className="m-surface rounded-2xl p-3.5 flex flex-wrap items-end gap-2.5">
                <Field label="Aralık başlangıcı" htmlFor="tl-period-start">
                    <input id="tl-period-start" type="date" className="m-input" value={dates.start} onChange={e => setDates({ ...dates, start: e.target.value })} />
                </Field>
                <Field label="Aralık bitişi" htmlFor="tl-period-end">
                    <input id="tl-period-end" type="date" className="m-input" value={dates.end} onChange={e => setDates({ ...dates, end: e.target.value })} />
                </Field>
                <button type="button" className="m-btn m-btn-primary" disabled={!isDayRange(dates)} onClick={() => { setDestination(undefined); onPeriodChange(dates); }}>Aralığı göster</button>
                <button type="button" className="m-btn m-btn-plain" onClick={() => setMonth(0)}>Bu ay</button>
                <button type="button" className="m-btn m-btn-plain" onClick={() => setMonth(1)}>Gelecek ay</button>
                {period && <button type="button" className="m-btn m-btn-plain" onClick={() => { setDates({ start: '', end: '' }); setDestination(undefined); onPeriodChange(null); }}>Tüm sprintler</button>}
                {period && (
                    <div className="w-full flex flex-wrap items-center gap-2">
                        <span className="text-[14px] m-text-2">{formatRange(period)} · {sprints.length} sprint · {sprints.reduce((n, lane) => n + lane.tasks.length - lane.done, 0)} açık görev</span>
                        <button type="button" className="m-btn m-btn-gray !min-h-[36px]" onClick={() => onOpenFilteredList(periodTaskQuery(periodSprints, period))}>Aralığı görev listesinde aç</button>
                        {onOpenManualRelease && <button type="button" className="m-btn m-btn-gray !min-h-[36px]" onClick={() => onOpenManualRelease(new Set())}>Aralığın sürüm planları</button>}
                        {onOpenPeriodJira && <button type="button" className="m-btn m-btn-gray !min-h-[36px]" onClick={() => onOpenPeriodJira(period)}><Icon name="refresh" size={16} />Aralığı Jira ile eşitle</button>}
                    </div>
                )}
            </section>

            {selection && onBulkMove && (
                <section aria-label="Toplu sprint planı" className="m-surface rounded-2xl p-4 flex flex-col gap-3">
                    <TaskQueryPicker projectId={project.id} tasks={bulkTasks} ctx={bulkContext} selected={selected} onChange={setSelection} onViewTask={onViewTask} label="Sprint için görev bul" />
                    <div className="flex flex-wrap gap-2 items-end">
                        <Field label="Hedef sprint" htmlFor="tl-bulk-target">
                            <select id="tl-bulk-target" className="m-input" value={destination} onChange={e => setDestination(Number(e.target.value))}>
                                <option value={0}>Havuz</option>
                                {[...new Set([...targets, ...(destination ? [destination] : [])])].map(v => <option key={v} value={v}>{sprintLabel(v, names)}</option>)}
                            </select>
                        </Field>
                        <button type="button" className="m-btn m-btn-primary" disabled={!moveCount} onClick={() => {
                            onBulkMove(selected, destination);
                            setResult({ warnings: [], text: `${moveCount} görev ${sprintLabel(destination, names)} hedefine taşındı.` });
                            setSelection(null);
                            setExtra(0);
                        }}>{moveCount} görevi taşı</button>
                        {onOpenManualRelease && <button type="button" className="m-btn m-btn-gray" disabled={!selected.size} onClick={() => onOpenManualRelease(selected)}>Seçimle sürüm planı aç</button>}
                    </div>
                </section>
            )}

            {result && (
                <div role="status" className={`rounded-2xl px-4 py-3 flex items-start gap-3 ${result.warnings.length ? 'm-tone-warn' : 'm-tone-ok'}`}>
                    <span className="flex-1 flex flex-col gap-1 text-[15px]">
                        <span className="font-semibold">{result.text}{result.warnings.length ? ` ${result.warnings.length} uyarı var:` : ''}</span>
                        {result.warnings.slice(0, 4).map((w, i) => <span key={`${w.taskId}-${i}`} className="text-[14px]">• {w.message}</span>)}
                        {result.warnings.length > 4 && <span className="text-[14px]">… ve {result.warnings.length - 4} uyarı daha</span>}
                    </span>
                    <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => setResult(null)}><Icon name="x" size={18} /></button>
                </div>
            )}

            {range && sprints.length > 0 && (
                <section aria-label="Zaman şeridi" className="m-surface rounded-2xl px-5 pt-4 pb-3 flex flex-col gap-2">
                    <div className="relative h-11">
                        {sprints.map(l => {
                            const work = segmentPct(l.start!, l.end!, range);
                            const test = segmentPct(l.testStart!, l.testEnd!, range);
                            const label = sprintLabel(l.version, names);
                            const over = l.overloaded.length > 0;
                            return (
                                <React.Fragment key={l.version}>
                                    <button
                                        type="button"
                                        title={`${label}: ${dm(l.start)} – ${dm(l.end)}`}
                                        aria-haspopup={teamCalendarMode ? 'dialog' : undefined}
                                        onClick={() => openSprint(l.version)}
                                        className="absolute top-0 h-full rounded-lg px-2 flex items-center text-[12px] font-semibold overflow-hidden whitespace-nowrap border-0 cursor-pointer"
                                        style={{ left: `${work.left}%`, width: `${work.width}%`, background: over ? 'var(--m-bad-tint)' : 'var(--m-accent-tint)', color: over ? 'var(--m-bad-ink)' : 'var(--m-accent-ink)', boxShadow: nowVersion === l.version ? 'inset 0 0 0 2px var(--m-accent)' : undefined }}
                                    >
                                        <span className="truncate">{label}</span>
                                    </button>
                                    <span
                                        aria-hidden="true"
                                        title={`Test: ${dm(l.testStart)} – ${dm(l.testEnd)}`}
                                        className="absolute top-1.5 bottom-1.5 rounded-md"
                                        style={{ left: `${test.left}%`, width: `${test.width}%`, background: 'repeating-linear-gradient(135deg, var(--m-fill) 0 4px, var(--m-fill-2) 4px 8px)' }}
                                    ></span>
                                </React.Fragment>
                            );
                        })}
                        {todayPct !== null && (
                            <span aria-label={`Bugün ${dm(today)}`} className="absolute -top-1 -bottom-1 w-0.5 rounded-full" style={{ left: `${todayPct}%`, background: 'var(--m-bad)' }}>
                                <span className="absolute -top-4 -translate-x-1/2 text-[11px] font-semibold m-ink-bad whitespace-nowrap">Bugün</span>
                            </span>
                        )}
                    </div>
                    <div className="relative h-4 text-[11px] m-text-3">
                        {monthTicks.map(t => <span key={t.label + t.left} className="absolute whitespace-nowrap" style={{ left: `${t.left}%` }}>{t.label}</span>)}
                    </div>
                    <div className="flex flex-wrap gap-4 text-[12px] m-text-3">
                        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded" style={{ background: 'var(--m-accent-tint)' }}></span>Geliştirme</span>
                        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded" style={{ background: 'repeating-linear-gradient(135deg, var(--m-fill) 0 3px, var(--m-fill-2) 3px 6px)' }}></span>Test ve canlıya alma</span>
                        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-3 h-3 rounded" style={{ background: 'var(--m-bad-tint)' }}></span>Kapasite aşımı</span>
                    </div>
                </section>
            )}

            <div className="overflow-x-auto -mx-1 px-1 pb-3">
                <div className="flex items-start gap-4 min-w-max">
                    {poolOpen ? (
                        <section aria-label={`Havuz, ${pool.tasks.length} görev`} className="w-[300px] flex-none m-fill-2 rounded-2xl" {...dropProps(0)} style={dropStyle(0)}>
                            <div className="flex items-center gap-2 px-3 pt-3 pb-2.5 min-h-[36px]">
                                <h3 className="m-0 flex-1 text-[17px] font-semibold m-text">Havuz</h3>
                                <span className="text-[13px] m-text-3 m-tabular">{pool.tasks.length}</span>
                                <button type="button" className="m-icon-btn" aria-label="Havuzu daralt" onClick={() => setPoolOpen(false)}><Icon name="chevronLeft" /></button>
                            </div>
                            <p className="m-0 px-3 pb-2 text-[13px] m-text-3">Henüz bir sprinte atanmamış görevler</p>
                            <div className="flex flex-col gap-2 px-2.5 pb-3">
                                {pool.tasks.map(t => <TaskChip key={t.id} task={t} draggable={canEdit} onOpen={() => onViewTask(t)} />)}
                                {pool.tasks.length === 0 && <span className="px-1 py-6 text-center text-[14px] m-text-3">Havuz boş</span>}
                            </div>
                        </section>
                    ) : (
                        <button
                            type="button"
                            aria-label={`Havuzu aç, ${pool.tasks.length} görev`}
                            onClick={() => setPoolOpen(true)}
                            className="w-[64px] flex-none self-stretch min-h-[200px] m-fill-2 rounded-2xl flex flex-col items-center gap-3 py-4 border-0 cursor-pointer m-text-2"
                            {...dropProps(0)}
                            style={dropStyle(0)}
                        >
                            <Icon name="inbox" size={20} />
                            <span className="text-[15px] font-semibold m-tabular m-text">{pool.tasks.length}</span>
                            <span className="text-[13px] font-semibold" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Havuz</span>
                        </button>
                    )}

                    {sprints.map(l => (
                        <section
                            key={l.version}
                            ref={el => { if (el) laneRefs.current.set(l.version, el); else laneRefs.current.delete(l.version); }}
                            aria-label={`${sprintLabel(l.version, names)}, ${l.tasks.length} görev`}
                            className="w-[300px] flex-none m-fill-2 rounded-2xl"
                            {...dropProps(l.version)}
                            style={dropStyle(l.version) || (nowVersion === l.version ? { boxShadow: 'inset 0 0 0 2px var(--m-accent)' } : undefined)}
                        >
                            {laneHeader(l)}
                            <div className="flex flex-col gap-2 px-2.5 pb-3">
                                {l.tasks.map(t => <TaskChip key={t.id} task={t} draggable={canEdit} onOpen={() => onViewTask(t)} />)}
                                {l.tasks.length === 0 && <span className="px-1 py-6 text-center text-[14px] m-text-3">{canEdit ? 'Görevleri buraya sürükleyin' : 'Görev yok'}</span>}
                            </div>
                        </section>
                    ))}

                    {canEdit && (
                        <div className="w-[200px] flex-none flex flex-col gap-2.5">
                            <button type="button" onClick={() => setExtra(e => Math.min(10, e + 1))} className="m-row-link rounded-2xl min-h-[96px] flex flex-col items-center justify-center gap-1.5 text-[15px] font-semibold m-accent" style={{ border: '2px dashed var(--m-sep)' }}>
                                <Icon name="plus" size={20} strokeWidth={2.2} />
                                Sprint ekle
                            </button>
                            <button type="button" onClick={onNewTask} className="m-row-link rounded-2xl min-h-[52px] flex items-center justify-center gap-1.5 text-[15px] m-text-2" style={{ border: '2px dashed var(--m-sep)' }}>
                                <Icon name="plus" size={16} />
                                Yeni görev
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {calendarOpen && (
                <CalendarSheet
                    value={{ projectStartDate: project.settings.projectStartDate, sprintDuration: weeks, globalTestDays: testDays, useJiraRemainingEstimate: project.settings.useJiraRemainingEstimate }}
                    onClose={() => setCalendarOpen(false)}
                    onSave={c => { onUpdateCalendar(c); setCalendarOpen(false); }}
                />
            )}
            {teamCalendarLane && <SprintTeamCalendar project={project} lane={teamCalendarLane} people={people} leaves={leaves}
                selection={teamCalendarSelection} onSelection={setTeamCalendarSelection}
                onClose={() => setTeamCalendarSprint(null)} onViewTask={onViewTask} />}
        </div>
    );
};

export default ModernTimeline;
