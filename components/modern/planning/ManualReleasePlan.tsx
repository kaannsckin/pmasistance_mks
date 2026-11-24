import React, { useMemo, useState } from 'react';
import { Project, ReleasePlan, Task } from '../../../types';
import { isDayRange } from '../../../utils/calendarRange';
import { sprintsInPeriod } from '../../../utils/planning/period';
import { canAddManualReleaseTask, commitManualReleasePlan, CommitResult, itemFromTask, newItem } from '../../../utils/planning/releasePlan';
import { Icon } from '../icons';
import TaskQueryPicker from '../TaskQueryPicker';
import { sprintLabel } from '../taskMeta';
import { Field } from '../ui';

interface Props {
    project: Project;
    initial: ReleasePlan;
    me?: string;
    canEdit: boolean;
    onViewTask?: (task: Task) => void;
    onSave: (plan: ReleasePlan) => void;
    onCommit: (result: CommitResult) => void;
    onClose: () => void;
}

const ManualReleasePlan: React.FC<Props> = ({ project, initial, me, canEdit, onViewTask, onSave, onCommit, onClose }) => {
    const [plan, setPlan] = useState(initial);
    const [selectOpen, setSelectOpen] = useState(!initial.items.length);
    const [batchSprint, setBatchSprint] = useState('');
    const [newName, setNewName] = useState('');
    const [error, setError] = useState('');
    const names = project.settings.sprintNames;
    const context = useMemo(() => ({ sprintNames: names, workPackages: project.workPackages, me }), [names, project.workPackages, me]);
    const blocked = useMemo(() => new Set((project.releasePlans || []).filter(p => p.id !== plan.id && p.status === 'draft').flatMap(p => p.items.flatMap(i => i.sourceTaskId ? [i.sourceTaskId] : []))), [project.releasePlans, plan.id]);
    const candidates = useMemo(() => project.tasks.filter(t => canAddManualReleaseTask(t) && !blocked.has(t.id)), [project.tasks, blocked]);
    const chosen = new Set(plan.items.flatMap(i => i.sourceTaskId ? [i.sourceTaskId] : []));
    const byId = new Map<string, Task>(candidates.map(task => [task.id, task]));
    const available = plan.items.filter(item => !item.sourceTaskId || byId.has(item.sourceTaskId));
    const period = { start: plan.startDate || '', end: plan.targetDate || '' };
    const validDates = !period.start || !period.end || isDayRange(period);
    const periodSprints = isDayRange(period) ? sprintsInPeriod(project, period) : [];
    const highest = Math.max(1, ...project.tasks.map(t => t.version || 0), ...plan.items.map(i => i.manualSprint || 0), ...periodSprints);
    const options = Array.from({ length: highest + 1 }, (_, i) => i);
    const sprintOptions = <><option value="">Mevcut sprinti koru</option>{options.map(v => <option key={v} value={v}>{sprintLabel(v, names)}</option>)}</>;

    const update = (patch: Partial<ReleasePlan>) => {
        if (!canEdit) return;
        const next = { ...plan, ...patch, updatedAt: new Date().toISOString() };
        setPlan(next);
        onSave(next);
        setError('');
    };
    const choose = (ids: Set<string>) => {
        const items = plan.items.filter(i => !i.sourceTaskId || ids.has(i.sourceTaskId));
        for (const id of ids) {
            const task = byId.get(id);
            if (task && !chosen.has(id)) items.push(itemFromTask(task));
        }
        update({ items });
    };
    const addNew = () => {
        if (!newName.trim()) return;
        update({ items: [...plan.items, newItem({ name: newName.trim() })] });
        setNewName('');
    };

    return (
        <section className="m-surface rounded-2xl p-5 flex flex-col gap-4" aria-labelledby="manual-release-title">
            <div className="min-w-0">
                <button type="button" className="m-btn m-btn-plain !min-h-[34px] -ml-2" onClick={onClose}><Icon name="chevronLeft" size={17} />Sürüm planları</button>
                <h3 id="manual-release-title" className="m-0 text-[19px] font-semibold m-text">Manuel sürüm planı</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <Field label="Sürüm adı" htmlFor="manual-release-name">
                    <input id="manual-release-name" className="m-input" value={plan.name} disabled={!canEdit} onChange={e => update({ name: e.target.value })} />
                </Field>
                <Field label="Başlangıç" htmlFor="manual-release-start">
                    <input id="manual-release-start" type="date" className="m-input" value={plan.startDate || ''} disabled={!canEdit} onChange={e => update({ startDate: e.target.value || undefined })} />
                </Field>
                <Field label="Hedef tarih" htmlFor="manual-release-end">
                    <input id="manual-release-end" type="date" className="m-input" value={plan.targetDate || ''} disabled={!canEdit} onChange={e => update({ targetDate: e.target.value || undefined })} />
                </Field>
            </div>
            {!validDates && <p role="alert" className="m-0 m-ink-bad">Hedef tarih başlangıçtan önce olamaz.</p>}
            {canEdit && (
                <>
                    <div className="flex flex-wrap items-end gap-2">
                        <button type="button" className="m-btn m-btn-gray" aria-expanded={selectOpen} onClick={() => setSelectOpen(!selectOpen)}><Icon name="search" size={17} />Mevcut görevleri seç</button>
                        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); addNew(); }}>
                            <Field label="Yeni görev başlığı" htmlFor="manual-release-new"><input id="manual-release-new" className="m-input" value={newName} onChange={e => setNewName(e.target.value)} /></Field>
                            <button type="submit" className="m-btn m-btn-gray" disabled={!newName.trim()}><Icon name="plus" size={17} />Görev ekle</button>
                        </form>
                    </div>
                    {selectOpen && <TaskQueryPicker projectId={project.id} tasks={candidates} ctx={context} selected={chosen} onChange={choose} onViewTask={onViewTask} label="Sürüm için görev bul" />}
                </>
            )}
            {plan.items.length > 0 && (
                <section aria-label="Sürüm kapsamı" className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-end gap-2">
                        <h4 className="m-0 flex-1 self-center text-[16px] m-text">Sürüm kapsamı ({plan.items.length})</h4>
                        {canEdit && (
                            <>
                                <Field label="Tüm kayıtların hedef sprinti" htmlFor="manual-release-bulk">
                                    <select id="manual-release-bulk" className="m-input" value={batchSprint} onChange={e => setBatchSprint(e.target.value)}>{sprintOptions}</select>
                                </Field>
                                <button type="button" className="m-btn m-btn-gray" onClick={() => update({ items: plan.items.map(i => ({ ...i, manualSprint: batchSprint === '' ? undefined : Number(batchSprint) })) })}>Kapsama uygula</button>
                            </>
                        )}
                    </div>
                    <ul className="m-0 p-0 list-none">
                        {plan.items.map(item => {
                            const task = item.sourceTaskId ? byId.get(item.sourceTaskId) : undefined;
                            return (
                                <li key={item.id} className="flex flex-wrap items-center gap-2 border-t m-sep py-2">
                                    <div className="flex-1 min-w-[140px]">
                                        <div className="m-text font-semibold">{task?.name || item.name}</div>
                                        <div className="text-[13px] m-text-3">{task ? [task.jiraId, sprintLabel(task.version || 0, names), task.fixVersion].filter(Boolean).join(' · ') : item.sourceTaskId ? 'Görev artık aktarılabilir değil' : 'Yeni görev'}</div>
                                    </div>
                                    <select aria-label={`${item.name} hedef sprinti`} className="m-input !w-auto" disabled={!canEdit} value={item.manualSprint ?? ''} onChange={e => update({ items: plan.items.map(i => i.id === item.id ? { ...i, manualSprint: e.target.value === '' ? undefined : Number(e.target.value) } : i) })}>{sprintOptions}</select>
                                    {canEdit && <button type="button" className="m-icon-btn" aria-label={`${item.name} kapsamdan çıkar`} onClick={() => update({ items: plan.items.filter(i => i.id !== item.id) })}><Icon name="x" size={17} /></button>}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
            {error && <p role="alert" className="m-0 m-ink-bad">{error}</p>}
            {canEdit && <button type="button" className="m-btn m-btn-primary self-start" disabled={!plan.name.trim() || !available.length || !validDates} onClick={() => {
                try {
                    onCommit(commitManualReleasePlan(project, { ...plan, items: plan.items.filter(item => !item.sourceTaskId || byId.has(item.sourceTaskId)) }));
                } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                }
            }}><Icon name="check" size={18} />{available.length} görevi sürüme aktar</button>}
        </section>
    );
};

export default ManualReleasePlan;
