import React, { useEffect, useMemo, useRef, useState } from 'react';
import { hasProgressWeights, progressOf } from '../../../utils/progress';
import { Leave, Person, Project, ReleaseMilestone, ReleasePlan, Task, TaskStatus } from '../../../types';
import { calendarLabel, sprintCalendar } from '../../../utils/sprintCalendar';
import { isInSprint } from '../../../utils/sprintSpan';
import { canAddManualReleaseTask, createReleasePlan, itemFromTask, newId } from '../../../utils/planning/releasePlan';
import {
    BoardRow, buildPlanBoard, carryoverChanges, effortOf, MilestoneStatus, milestoneOfTask, SprintChange,
} from '../../../utils/planning/planBoard';
import PlanOptimizerSheet from './PlanOptimizerSheet';
import { CalendarSettings, CalendarSheet } from '../ModernTimeline';
import TaskQueryPicker from '../TaskQueryPicker';
import TaskKeyButton from '../TaskKeyButton';
import { sprintLabel } from '../taskMeta';
import { Icon } from '../icons';
import { Field, Sheet } from '../ui';

/**
 * Plan ekranı (Planlama'nın ana ekranı): sürüm → kilometre taşları → sprintler.
 *
 *  - Satırlar kilometre taşları (hedef tarih sırasıyla), sütunlar sprintler; ilk
 *    sütun "Planlanmamış". Kart sürüklenince sprinti (görevde) ve taşı (planda)
 *    değişir; aynı işler klavyeyle kartın "Taşı" menüsünden de yapılır.
 *  - Sprint takvimi projenin takvimidir (yol haritası ve otomatik planla aynı).
 *  - Optimize et: kapasite (izin, tatil, tampon), kritik zincir, kişi değişikliği ve bölme
 *    seçenekleri; gecikmede kurtarma senaryoları. Önce önizleme (bkz. PlanOptimizerSheet).
 *  - Sıkı takip: bu sprintin yükü, biten sprintte kalan işlerin devri, hızla bitiş tahmini.
 */

interface Props {
    project: Project;
    canEdit: boolean;
    me?: string;
    /** Görev listesinden "Sürüm planına al" ile gelen görevler */
    initialTaskIds?: string[];
    onSavePlan: (plan: ReleasePlan) => void;
    onSetSprints: (changes: SprintChange[], label: string) => void;
    onUpdateCalendar: (c: CalendarSettings) => void;
    onViewTask: (task: Task) => void;
    onOpenSimulation: () => void;
    /** Kapasitede izinler için veri havuzu */
    people?: Person[];
    leaves?: Leave[];
    /** Geçmiş sapma çarpanı (benzer kapanmış işlerin gerçekleşen ÷ tahmin oranı) */
    calibrate?: (t: Task) => number | undefined;
    calibrationHint?: number;
}

const STATUS_META: Record<MilestoneStatus, { label: string; tone: string; dot: string }> = {
    ok: { label: 'Yolunda', tone: 'm-ink-ok', dot: 'var(--m-ok)' },
    risk: { label: 'Riskli', tone: 'm-ink-warn', dot: 'var(--m-warn)' },
    late: { label: 'Gecikiyor', tone: 'm-ink-bad', dot: 'var(--m-bad)' },
    unplanned: { label: 'Planlanmamış iş', tone: 'm-ink-warn', dot: 'var(--m-warn)' },
    empty: { label: 'Görev yok', tone: 'm-text-3', dot: 'var(--m-hold)' },
};
const NO_MS = '__taşsız';
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const dm = (d?: Date | string) => {
    if (!d) return '—';
    const x = typeof d === 'string' ? new Date(`${d}T00:00:00`) : d;
    return x.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const manualPlans = (p: Project) => (p.releasePlans || []).filter(r => r.mode === 'manual');

const PlanBoard: React.FC<Props> = ({ project, canEdit, me, initialTaskIds, onSavePlan, onSetSprints, onUpdateCalendar, onViewTask, onOpenSimulation, people, leaves, calibrate, calibrationHint }) => {
    const plans = manualPlans(project);
    const [planId, setPlanId] = useState<string | null>(() => {
        const drafts = plans.filter(p => p.status === 'draft').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return (drafts[0] || plans[0])?.id || null;
    });
    const plan = plans.find(p => p.id === planId) || null;
    const [extra, setExtra] = useState(0);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [pickOpen, setPickOpen] = useState(false);
    const [optimizeOpen, setOptimizeOpen] = useState(false);
    const [moving, setMoving] = useState<Task | null>(null);
    const [drag, setDrag] = useState<{ row: string; version: number } | null>(null);
    const [notice, setNotice] = useState('');
    const cal = sprintCalendar(project.settings);
    const names = project.settings.sprintNames;

    const save = (next: ReleasePlan) => { if (canEdit) onSavePlan({ ...next, updatedAt: new Date().toISOString() }); };
    const newPlan = (taskIds: string[] = []): ReleasePlan => {
        const p = createReleasePlan(project);
        p.mode = 'manual';
        p.name = `Sürüm ${plans.length + 1}`;
        p.testDays = cal.testDays;
        p.items = project.tasks.filter(t => taskIds.includes(t.id) && canAddManualReleaseTask(t)).map(itemFromTask);
        return p;
    };
    const addTasks = (target: ReleasePlan, ids: Iterable<string>) => {
        const have = new Set(target.items.flatMap(i => (i.sourceTaskId ? [i.sourceTaskId] : [])));
        const add = project.tasks.filter(t => [...ids].includes(t.id) && !have.has(t.id) && canAddManualReleaseTask(t)).map(itemFromTask);
        return add.length ? { ...target, items: [...target.items, ...add] } : target;
    };

    // Görev listesinden seçilenlerle gelindiyse: açık taslağa eklenir ya da yeni sürüm açılır (bir kez)
    const seeded = useRef(false);
    useEffect(() => {
        if (seeded.current || !initialTaskIds?.length || !canEdit) return;
        seeded.current = true;
        const target = plan && plan.status === 'draft' ? addTasks(plan, initialTaskIds) : newPlan(initialTaskIds);
        save(target);
        setPlanId(target.id);
        const added = target.items.length - (plan && plan.id === target.id ? plan.items.length : 0);
        const skipped = initialTaskIds.length - added;
        setNotice(`${added} görev "${target.name}" planına alındı${skipped > 0 ? `; ${skipped} görev zaten kapsamdaydı ya da bitmişti` : ''}.`);
    }, [initialTaskIds]); // eslint-disable-line react-hooks/exhaustive-deps

    const board = useMemo(() => (plan ? buildPlanBoard(project, plan, new Date(), { extraSprints: extra, people, leaves }) : null), [project, plan, extra, people, leaves]);

    if (!plan || !board) {
        return (
            <section className="m-surface rounded-2xl p-6 flex flex-col items-start gap-3">
                <h3 className="m-0 text-[19px] font-semibold m-text">Sürüm planı</h3>
                <p className="m-0 m-text-2 text-[15px]">Bir sürüm oluşturun; görevleri seçin, kilometre taşlarını ve hedef tarihlerini girin, sprintlere elle ya da otomatik dağıtın. Sprint takvimi: {calendarLabel(cal)}.</p>
                {canEdit && <button type="button" className="m-btn m-btn-primary" onClick={() => { const p = newPlan(); save(p); setPlanId(p.id); setPickOpen(true); }}><Icon name="plus" size={18} />Yeni sürüm planı</button>}
            </section>
        );
    }

    const itemOf = (taskId: string) => plan.items.find(i => i.sourceTaskId === taskId);
    const setMilestone = (taskId: string, msId: string) => {
        const item = itemOf(taskId);
        if (!item) return;
        save({ ...plan, milestones: plan.milestones.map(m => ({ ...m, itemIds: m.id === msId ? [...new Set([...m.itemIds, item.id])] : m.itemIds.filter(x => x !== item.id) })) });
    };
    const moveTo = (task: Task, version: number, msId?: string) => {
        if (!canEdit) return;
        if (msId !== undefined && (milestoneOfTask(plan, task.id)?.id || NO_MS) !== msId) setMilestone(task.id, msId);
        if ((task.version || 0) !== version) onSetSprints([{ taskId: task.id, from: task.version || 0, to: version }], `${task.jiraId || task.name} → ${sprintLabel(version, names)}`);
    };
    const updateMilestone = (id: string, patch: Partial<ReleaseMilestone>) => save({ ...plan, milestones: plan.milestones.map(m => (m.id === id ? { ...m, ...patch } : m)) });
    const addMilestone = () => {
        const n = plan.milestones.length + 1;
        const last = board.sprints.at(-1);
        save({ ...plan, milestones: [...plan.milestones, { id: newId('ms'), name: `MS${n}`, itemIds: [], ...(last ? { targetDate: isoOf(last.end) } : {}) }] });
    };
    const removeFromPlan = (taskId: string) => {
        const item = itemOf(taskId);
        if (!item) return;
        save({ ...plan, items: plan.items.filter(i => i.id !== item.id), milestones: plan.milestones.map(m => ({ ...m, itemIds: m.itemIds.filter(x => x !== item.id) })) });
    };
    const scopeIds = new Set(plan.items.flatMap(i => (i.sourceTaskId ? [i.sourceTaskId] : [])));
    const candidates = project.tasks.filter(t => canAddManualReleaseTask(t) || scopeIds.has(t.id));
    const current = board.sprints.find(s => s.current);
    const currentTasks = board.rows.flatMap(r => r.tasks).filter(t => isInSprint(t, board.current));
    const currentOpen = currentTasks.filter(t => t.status !== TaskStatus.Done);
    const rowKey = (r: BoardRow) => r.milestone?.id || NO_MS;
    const weighted = hasProgressWeights(project.progressModel?.weights);
    const columns = [0, ...board.sprints.map(s => s.version)];
    const gridCols = `minmax(190px, 220px) repeat(${columns.length}, minmax(168px, 1fr))`;

    const card = (t: Task, row: BoardRow) => {
        const done = t.status === TaskStatus.Done;
        const carry = board.carryover.some(c => c.id === t.id);
        return (
            <li key={`${t.id}-${row.milestone?.id}`} draggable={canEdit} onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                className={`m-surface rounded-xl px-2.5 py-2 flex flex-col gap-1 border m-sep ${canEdit ? 'cursor-grab' : ''} ${done ? 'opacity-60' : ''}`}
                style={carry ? { boxShadow: 'inset 3px 0 0 var(--m-warn)' } : undefined}>
                <div className="flex items-center gap-1.5">
                    <TaskKeyButton task={t} onOpen={() => onViewTask(t)} className="!min-h-[26px] !px-2 !text-[12px]" />
                    <span className="flex-1" />
                    <span className="text-[12px] m-text-3 m-tabular" title="Efor (PERT, gün)">{num(effortOf(t))} g</span>
                    {canEdit && <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${t.name} taşı`} title="Sprint ya da kilometre taşı değiştir" onClick={() => setMoving(t)}><Icon name="more" size={16} /></button>}
                </div>
                <span className={`text-[13px] leading-snug m-text break-words ${done ? 'line-through' : ''}`}>{t.name}</span>
                <span className="text-[12px] m-text-3 truncate">{[t.resourceName || 'Atanmamış', done ? 'Bitti' : t.status === TaskStatus.InProgress ? 'Sürüyor' : '', carry ? 'Devir bekliyor' : '', (t.sprintSpan || 1) > 1 ? `${t.sprintSpan} sprint` : ''].filter(Boolean).join(' · ')}</span>
            </li>
        );
    };

    const cell = (row: BoardRow, version: number) => {
        const key = rowKey(row);
        const tasks = row.tasks.filter(t => (version === 0 ? !(t.version > 0) : t.version === version));
        const over = drag?.row === key && drag.version === version;
        const target = row.milestone?.targetDate;
        const sprint = board.sprints.find(s => s.version === version);
        const holdsTarget = !!(target && sprint && isoOf(sprint.start) <= target && target <= isoOf(sprint.testEnd));
        return (
            <div key={`${key}-${version}`} role="group" aria-label={`${row.milestone?.name || 'Taşsız işler'} · ${sprintLabel(version, names)}`}
                onDragOver={canEdit ? e => { e.preventDefault(); if (!over) setDrag({ row: key, version }); } : undefined}
                onDragLeave={canEdit ? e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrag(null); } : undefined}
                onDrop={canEdit ? e => {
                    e.preventDefault(); setDrag(null);
                    const t = project.tasks.find(x => x.id === e.dataTransfer.getData('text/plain'));
                    if (t && scopeIds.has(t.id)) moveTo(t, version, key);
                } : undefined}
                className={`p-1.5 min-h-[72px] border-t m-sep ${sprint?.current ? 'm-accent-tint' : version === 0 ? 'm-fill-2' : ''} ${sprint?.past ? 'opacity-80' : ''}`}
                style={{ ...(over ? { boxShadow: 'inset 0 0 0 2px var(--m-accent)' } : {}), ...(holdsTarget ? { borderRight: '2px dashed var(--m-bad)' } : {}) }}>
                {holdsTarget && <span className="block text-[11px] font-semibold m-ink-bad mb-1"><Icon name="flag" size={12} /> Hedef {dm(target)}</span>}
                <ul className="m-0 p-0 list-none flex flex-col gap-1.5">{tasks.map(t => card(t, row))}</ul>
            </div>
        );
    };

    return (
        <section className="flex flex-col gap-4" aria-label="Sürüm planı">
            {/* Üst bant: sürüm, ritim, eylemler */}
            <div className="m-surface rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-end gap-3">
                    <Field label="Sürüm" htmlFor="pb-plan">
                        <select id="pb-plan" className="m-input !w-auto" value={plan.id} onChange={e => (e.target.value === '__new' ? (() => { const p = newPlan(); save(p); setPlanId(p.id); })() : setPlanId(e.target.value))}>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.name || 'Adsız sürüm'}{p.status === 'committed' ? ' (aktarıldı)' : ''}</option>)}
                            {canEdit && <option value="__new">+ Yeni sürüm planı</option>}
                        </select>
                    </Field>
                    <Field label="Ad" htmlFor="pb-name">
                        <input id="pb-name" className="m-input" value={plan.name} disabled={!canEdit} onChange={e => save({ ...plan, name: e.target.value })} />
                    </Field>
                    <Field label="Sürüm hedefi" htmlFor="pb-target">
                        <input id="pb-target" type="date" className="m-input" value={plan.targetDate || ''} disabled={!canEdit} onChange={e => save({ ...plan, targetDate: e.target.value || undefined })} />
                    </Field>
                    <button type="button" className="m-btn m-btn-gray" onClick={() => setCalendarOpen(true)} title="Sprint takvimi: yol haritası ve otomatik planla ortak">
                        <Icon name="calendar" size={17} />{calendarLabel(cal)}
                    </button>
                    <span className="flex-1" />
                    {canEdit && <button type="button" className="m-btn m-btn-gray" onClick={() => setPickOpen(true)}><Icon name="plus" size={17} />Görev ekle</button>}
                    {canEdit && <button type="button" className="m-btn m-btn-gray" onClick={addMilestone}><Icon name="flag" size={17} />Kilometre taşı</button>}
                    {canEdit && <button type="button" className="m-btn m-btn-primary" disabled={!board.total.open} onClick={() => setOptimizeOpen(true)}><Icon name="rocket" size={17} />Optimize et</button>}
                </div>
                {notice && <p className="m-0 text-[14px] m-ink-ok" role="status">{notice}</p>}
                {/* Göstergeler */}
                <dl className="m-0 grid gap-2 grid-cols-2 md:grid-cols-5">
                    {[
                        { k: 'Kapsam', v: `${board.total.tasks} görev`, s: `${num(board.total.effort)} gün efor` },
                        { k: 'Kalan', v: `${num(board.total.remaining)} gün`, s: `${board.total.open} açık görev` },
                        { k: 'Bu sprint', v: current ? `${num(current.load)} / ${num(current.capacity)} gün` : '—', s: current ? `${sprintLabel(current.version, names)} · ${dm(current.start)}–${dm(current.end)}` : 'Sprint yok', bad: !!current?.overloaded.length },
                        { k: 'Hız', v: board.velocity.perSprint ? `${num(board.velocity.perSprint)} gün/sprint` : 'Ölçülmedi', s: board.velocity.sprints ? `son ${board.velocity.sprints} sprint` : 'Biten sprint yok' },
                        { k: 'Hızla bitiş', v: board.velocity.forecastEnd ? dm(board.velocity.forecastEnd) : '—', s: board.velocity.sprintsLeft ? `${board.velocity.sprintsLeft} sprint${plan.targetDate ? ` · hedef ${dm(plan.targetDate)}` : ''}` : 'Kalan iş ya da hız yok', bad: !!(plan.targetDate && board.velocity.forecastEnd && board.velocity.forecastEnd > plan.targetDate) },
                    ].map(x => (
                        <div key={x.k} className="rounded-xl m-fill-2 px-3 py-2">
                            <dt className="text-[12px] m-text-3">{x.k}</dt>
                            <dd className={`m-0 text-[17px] font-semibold m-tabular ${x.bad ? 'm-ink-bad' : 'm-text'}`}>{x.v}</dd>
                            <dd className="m-0 text-[12px] m-text-3">{x.s}</dd>
                        </div>
                    ))}
                </dl>
            </div>

            {/* Sıkı takip: bu sprint ve devir */}
            {(board.carryover.length > 0 || currentOpen.length > 0) && (
                <div className="m-surface rounded-2xl p-4 flex flex-wrap items-center gap-3">
                    <Icon name="gauge" size={20} />
                    <span className="text-[15px] m-text flex-1 min-w-[220px]">
                        <strong>{current ? sprintLabel(current.version, names) : 'Bu sprint'}</strong>: {currentOpen.length} açık görev
                        {current?.overloaded.length ? <span className="m-ink-bad"> · kapasite aşımı: {current.overloaded.map(o => `${o.resource} ${num(o.load)}/${num(o.capacity)} g`).join(', ')}</span> : null}
                        {board.carryover.length > 0 && <span className="m-ink-warn"> · {board.carryover.length} görev biten sprintte kalmış</span>}
                    </span>
                    {canEdit && board.carryover.length > 0 && (
                        <button type="button" className="m-btn m-btn-gray" onClick={() => { onSetSprints(carryoverChanges(board), `${board.carryover.length} görev ${sprintLabel(board.current, names)}'e devredildi`); setNotice(`${board.carryover.length} görev bu sprinte devredildi.`); }}>
                            Bu sprinte devret ({board.carryover.length})
                        </button>
                    )}
                    <button type="button" className="m-btn m-btn-plain" onClick={onOpenSimulation}>Olasılıklı tarih (simülasyon)</button>
                </div>
            )}

            {/* Kilometre taşları */}
            {plan.milestones.length > 0 && (
                <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Kilometre taşları">
                    {board.rows.filter(r => r.milestone).map(r => {
                        const st = STATUS_META[r.status];
                        return (
                            <li key={r.milestone!.id} className="m-surface rounded-xl px-3 py-2 flex items-center gap-2 text-[14px]">
                                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full" style={{ background: st.dot }}></span>
                                <span className="font-semibold m-text">{r.milestone!.name}</span>
                                <span className="m-text-3">hedef {dm(r.milestone!.targetDate)} · tahmin {r.forecastEnd ? dm(r.forecastEnd) : '—'}</span>
                                <span className={`font-semibold ${st.tone}`}>{st.label}</span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {/* Izgara: taş × sprint */}
            <div className="m-surface rounded-2xl overflow-x-auto">
                <div className="grid min-w-max" style={{ gridTemplateColumns: gridCols }}>
                    <div className="sticky left-0 z-10 m-surface px-3 py-2 text-[13px] font-semibold m-text-2 flex items-end">Kilometre taşı</div>
                    {columns.map(v => {
                        const s = board.sprints.find(x => x.version === v);
                        const pct = s && s.capacity ? Math.min(100, Math.round((s.load / s.capacity) * 100)) : 0;
                        const over = !!s?.overloaded.length || (!!s && s.capacity > 0 && s.load > s.capacity);
                        return (
                            <div key={v} className={`px-2.5 py-2 flex flex-col gap-1 ${s?.current ? 'm-accent-tint' : v === 0 ? 'm-fill-2' : ''}`}>
                                <span className="text-[14px] font-semibold m-text">{v === 0 ? 'Planlanmamış' : sprintLabel(v, names)}{s?.current ? ' · bugün' : ''}</span>
                                {s ? (
                                    <>
                                        <span className="text-[12px] m-text-3">{dm(s.start)} – {dm(s.end)}{cal.testDays ? ` · test ${dm(s.testEnd)}` : ''}</span>
                                        <span className="h-1.5 rounded-full m-fill overflow-hidden" role="img" aria-label={`Yük ${num(s.load)} / kapasite ${num(s.capacity)} gün`}>
                                            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: over ? 'var(--m-bad)' : pct > 85 ? 'var(--m-warn)' : 'var(--m-ok)' }}></span>
                                        </span>
                                        <span className={`text-[12px] m-tabular ${over ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{num(s.load)}/{num(s.capacity)} g · sürüm {num(s.planLoad)} g</span>
                                    </>
                                ) : <span className="text-[12px] m-text-3">{board.pool.length} görev</span>}
                            </div>
                        );
                    })}
                    {board.rows.map(r => {
                        const st = STATUS_META[r.status];
                        const m = r.milestone;
                        return (
                            <React.Fragment key={rowKey(r)}>
                                <div className="sticky left-0 z-10 m-surface border-t m-sep px-3 py-2 flex flex-col gap-1.5">
                                    {m && canEdit ? (
                                        <>
                                            <input aria-label="Kilometre taşı adı" className="m-input !min-h-[32px] text-[14px] font-semibold" value={m.name} onChange={e => updateMilestone(m.id, { name: e.target.value })} />
                                            <input aria-label={`${m.name} hedef tarihi`} type="date" className="m-input !min-h-[32px] text-[13px]" value={m.targetDate || ''} onChange={e => updateMilestone(m.id, { targetDate: e.target.value || undefined })} />
                                        </>
                                    ) : <span className="text-[14px] font-semibold m-text">{m ? m.name : 'Taşsız işler'}</span>}
                                    <span className={`text-[12px] font-semibold ${st.tone}`}>{st.label}</span>
                                    <span className="text-[12px] m-text-3">{weighted && r.tasks.length ? `%${progressOf(r.tasks, project.progressModel).pct} · ` : ''}{r.done}/{r.tasks.length} bitti · {num(r.effort)} g · {r.note}</span>
                                    {m && canEdit && !r.tasks.length && <button type="button" className="m-btn m-btn-plain !min-h-[28px] self-start text-[12px]" onClick={() => save({ ...plan, milestones: plan.milestones.filter(x => x.id !== m.id) })}><Icon name="trash" size={14} />Taşı sil</button>}
                                </div>
                                {columns.map(v => cell(r, v))}
                            </React.Fragment>
                        );
                    })}
                </div>
                {canEdit && <div className="p-2 border-t m-sep"><button type="button" className="m-btn m-btn-plain !min-h-[32px]" onClick={() => setExtra(x => x + 1)}><Icon name="plus" size={15} />Sprint göster</button></div>}
            </div>

            {calendarOpen && (
                <CalendarSheet
                    value={{ projectStartDate: project.settings.projectStartDate, sprintDuration: cal.weeks, globalTestDays: cal.testDays, parallelTest: cal.parallelTest, useJiraRemainingEstimate: project.settings.useJiraRemainingEstimate }}
                    onClose={() => setCalendarOpen(false)}
                    onSave={c => { if (canEdit) onUpdateCalendar(c); setCalendarOpen(false); }}
                />
            )}

            {pickOpen && (
                <Sheet wide title="Sürüme görev ekle" subtitle={`${scopeIds.size} görev kapsamda`} onClose={() => setPickOpen(false)}>
                    <TaskQueryPicker projectId={project.id} tasks={candidates} ctx={{ sprintNames: names, workPackages: project.workPackages, me }}
                        selected={scopeIds} onViewTask={onViewTask} label="Sürüm için görev bul"
                        onChange={ids => {
                            let next = addTasks(plan, ids);
                            const removed = [...scopeIds].filter(id => !ids.has(id));
                            if (removed.length) {
                                const gone = new Set(next.items.filter(i => i.sourceTaskId && removed.includes(i.sourceTaskId)).map(i => i.id));
                                next = { ...next, items: next.items.filter(i => !gone.has(i.id)), milestones: next.milestones.map(m => ({ ...m, itemIds: m.itemIds.filter(x => !gone.has(x)) })) };
                            }
                            save(next);
                        }} />
                </Sheet>
            )}

            {moving && (
                <Sheet title="Görevi taşı" subtitle={[moving.jiraId, moving.name].filter(Boolean).join(' · ')} onClose={() => setMoving(null)}
                    footer={<div className="ml-auto flex gap-2">
                        <button type="button" className="m-btn m-btn-plain" onClick={() => { removeFromPlan(moving.id); setMoving(null); }}><Icon name="x" size={16} />Sürümden çıkar</button>
                        <button type="button" className="m-btn m-btn-primary" onClick={() => setMoving(null)}>Tamam</button>
                    </div>}>
                    <Field label="Sprint" htmlFor="pb-move-sprint">
                        <select id="pb-move-sprint" className="m-input" value={moving.version || 0} onChange={e => { const v = Number(e.target.value); moveTo(moving, v); setMoving({ ...moving, version: v }); }}>
                            {columns.map(v => <option key={v} value={v}>{v === 0 ? 'Planlanmamış' : `${sprintLabel(v, names)} (${dm(board.sprints.find(s => s.version === v)?.start)})`}</option>)}
                        </select>
                    </Field>
                    <Field label="Kilometre taşı" htmlFor="pb-move-ms">
                        <select id="pb-move-ms" className="m-input" value={milestoneOfTask(plan, moving.id)?.id || NO_MS} onChange={e => setMilestone(moving.id, e.target.value)}>
                            <option value={NO_MS}>Taşsız</option>
                            {plan.milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </Field>
                </Sheet>
            )}

            {optimizeOpen && (
                <PlanOptimizerSheet project={project} plan={plan} people={people} leaves={leaves} calibrate={calibrate} calibrationHint={calibrationHint}
                    onViewTask={onViewTask} onClose={() => setOptimizeOpen(false)}
                    onApply={(changes, label, nextPlan) => {
                        if (nextPlan) save(nextPlan);
                        if (changes.length) onSetSprints(changes, label);
                        setNotice(`${label}.`);
                        setOptimizeOpen(false);
                    }} />
            )}
        </section>
    );
};

export default PlanBoard;
