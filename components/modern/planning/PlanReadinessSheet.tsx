import React, { useMemo, useState } from 'react';
import { Project, Task } from '../../../types';
import { isUnassigned } from '../../../utils/planning/jiraPeople';
import {
    applyPlanReadinessEdit, PLAN_READINESS_HINTS, PLAN_READINESS_LABELS, PlanReadiness, PlanReadinessIssue, taskDurationDays,
} from '../../../utils/planning/planReadiness';
import { Icon } from '../icons';
import { Sheet } from '../ui';

interface Draft { days: string; component: string; resourceName: string }

interface PlanReadinessSheetProps {
    project: Pick<Project, 'tasks' | 'resources' | 'components'>;
    readiness: PlanReadiness;
    /** Planlanmış bitmemiş görevler varsa plan bunların sprintlerini yeniden dağıtır. */
    replansPlaced: boolean;
    onClose: () => void;
    onContinue: () => void;
    onViewTask: (task: Task) => void;
    /** Düzenlenen görevler; `plan` true ise ardından otomatik plan çalışır. */
    onSave: (changed: Task[], plan: boolean) => void;
}

const ISSUES: PlanReadinessIssue[] = ['noDuration', 'noComponent', 'noAssignee', 'notInTeam'];
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const parseDays = (value: string): number | undefined => {
    const days = Number(value.replace(',', '.'));
    return value.trim() && Number.isFinite(days) && days > 0 ? days : undefined;
};

const PlanReadinessSheet: React.FC<PlanReadinessSheetProps> = ({ project, readiness, replansPlaced, onClose, onContinue, onViewTask, onSave }) => {
    const [editing, setEditing] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const components = (project.components || []).map(c => c.name).filter(name => name.trim());
    const team = project.resources.map(r => r.name).filter(name => !isUnassigned(name));
    const total = readiness.rows.length;

    const draftOf = (id: string): Draft => drafts[id] || { days: '', component: '', resourceName: '' };
    const setDraft = (id: string, patch: Partial<Draft>) => setDrafts(prev => ({ ...prev, [id]: { ...draftOf(id), ...patch } }));
    const invalid = Object.values<Draft>(drafts).some(d => d.days.trim() !== '' && parseDays(d.days) === undefined);

    const changed = useMemo(() => {
        const now = new Date().toISOString();
        return readiness.rows.flatMap(({ task }) => {
            const d = drafts[task.id];
            if (!d) return [];
            const next = applyPlanReadinessEdit(task, { days: parseDays(d.days), component: d.component, resourceName: d.resourceName }, project);
            return next === task ? [] : [{ ...next, updatedAt: now }];
        });
    }, [drafts, readiness.rows, project]);

    if (!editing) {
        return (
            <Sheet
                title="Plan öncesi kontrol"
                subtitle={`${total} görevde eksik bilgi var`}
                onClose={onClose}
                wide
                footer={<>
                    <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                    <span className="flex-1"></span>
                    <button type="button" className="m-btn m-btn-gray" onClick={() => setEditing(true)}><Icon name="pencil" size={18} />Düzenle</button>
                    <button type="button" className="m-btn m-btn-primary" onClick={onContinue}><Icon name="rocket" size={18} />Devam et</button>
                </>}
            >
                <p className="m-0 text-[15px] m-text-2">Bu görevler planı yanıltabilir. Düzenleyebilir ya da olduğu gibi planlamaya devam edebilirsiniz.</p>
                <ul className="m-0 p-0 list-none flex flex-col gap-2">
                    {ISSUES.filter(issue => readiness.counts[issue] > 0).map(issue => {
                        const names = readiness.rows.filter(row => row.issues.includes(issue)).map(row => row.task.name);
                        return (
                            <li key={issue} className="m-fill-2 rounded-xl px-4 py-3 flex flex-col gap-0.5">
                                <span className="text-[15px] font-semibold m-text">{PLAN_READINESS_LABELS[issue]}: {readiness.counts[issue]} görev</span>
                                <span className="text-[13px] m-text-3">{PLAN_READINESS_HINTS[issue]}</span>
                                <span className="text-[13px] m-text-2">{names.slice(0, 3).join(', ')}{names.length > 3 ? ` ve ${names.length - 3} görev daha` : ''}</span>
                            </li>
                        );
                    })}
                </ul>
                {replansPlaced && <p className="m-0 text-[14px] m-ink-warn">Devam ederseniz bitmemiş görevlerin sprintleri öncül ilişkileri ve kapasiteye göre yeniden dağıtılır.</p>}
            </Sheet>
        );
    }

    return (
        <Sheet
            title="Eksik görev bilgilerini düzenle"
            subtitle={`${total} görev · boş bıraktığınız alan değişmez`}
            onClose={onClose}
            xl
            footer={<>
                <button type="button" className="m-btn m-btn-plain" onClick={() => setEditing(false)}>Geri</button>
                <span className="flex-1 text-[13px] m-text-3">{invalid ? 'Süre sıfırdan büyük bir sayı olmalı.' : changed.length ? `${changed.length} görev değişecek` : 'Henüz değişiklik yok'}</span>
                <button type="button" className="m-btn m-btn-gray" disabled={invalid || !changed.length} onClick={() => onSave(changed, false)}>Kaydet</button>
                <button type="button" className="m-btn m-btn-primary" disabled={invalid} onClick={() => onSave(changed, true)}><Icon name="rocket" size={18} />{changed.length ? 'Kaydet ve planla' : 'Planla'}</button>
            </>}
        >
            <div className="flex flex-col gap-2">
                {readiness.rows.map(({ task, issues }) => {
                    const d = draftOf(task.id);
                    const days = taskDurationDays(task);
                    const dayError = d.days.trim() !== '' && parseDays(d.days) === undefined;
                    return (
                        <section key={task.id} aria-label={task.name} className="m-fill-2 rounded-xl px-4 py-3 flex flex-col gap-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <button type="button" className="m-row-link text-left text-[15px] font-semibold m-text min-w-0 flex-1 truncate" onClick={() => onViewTask(task)}>
                                    {task.jiraId ? `${task.jiraId} · ` : ''}{task.name}
                                </button>
                                {issues.map(issue => <span key={issue} className="inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold m-tone-warn">{PLAN_READINESS_LABELS[issue]}</span>)}
                            </div>
                            <div className="grid gap-2.5 sm:grid-cols-3">
                                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">
                                    Süre (iş günü)
                                    <input className="m-input m-tabular" inputMode="decimal" aria-invalid={dayError} placeholder={days ? num(days) : 'Örn. 3'}
                                        value={d.days} onChange={e => setDraft(task.id, { days: e.target.value })} />
                                </label>
                                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">
                                    Bileşen
                                    <select className="m-input" value={d.component} disabled={!components.length} onChange={e => setDraft(task.id, { component: e.target.value })}>
                                        <option value="">{(task.components || []).join(', ') || (components.length ? 'Seçin' : 'Projede bileşen yok')}</option>
                                        {components.map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                </label>
                                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">
                                    Sorumlu
                                    <select className="m-input" value={d.resourceName} disabled={!team.length} onChange={e => setDraft(task.id, { resourceName: e.target.value })}>
                                        <option value="">{isUnassigned(task.resourceName) ? (team.length ? 'Seçin' : 'Proje ekibi boş') : task.resourceName}</option>
                                        {team.map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                </label>
                            </div>
                        </section>
                    );
                })}
            </div>
        </Sheet>
    );
};

export default PlanReadinessSheet;
