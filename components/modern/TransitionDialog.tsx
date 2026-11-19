import React, { useState } from 'react';
import { IssueType, Task, TransitionRule, WorkPackage } from '../../types';
import { ISSUE_TYPE_OPTIONS, REQUIRED_FIELD_LABELS } from '../../utils/projectScheme';
import { inputProblems, TransitionInput, TransitionNeeds } from '../../utils/transitions';
import { Icon } from './icons';
import { Sheet } from './ui';

/**
 * Geçiş penceresi (Jira "transition screen"): geçişin doğrulayıcıları bilgi
 * istiyorsa açılır — geçiş notu, harcanan süre ve boş zorunlu alanlar.
 */
const TransitionDialog: React.FC<{
    task: Task;
    fromLabel: string;
    toLabel: string;
    rule: TransitionRule;
    needs: TransitionNeeds;
    assignees: string[];
    workPackages: WorkPackage[];
    components?: string[];
    versions?: string[];
    onCancel: () => void;
    onConfirm: (input: TransitionInput) => void;
}> = ({ task, fromLabel, toLabel, rule, needs, assignees, workPackages, components = [], versions = [], onCancel, onConfirm }) => {
    const [comment, setComment] = useState('');
    const [hours, setHours] = useState('');
    const [fields, setFields] = useState<Partial<Task>>({});
    const [tried, setTried] = useState(false);
    const input: TransitionInput = {
        ...(needs.comment ? { comment } : {}),
        ...(needs.hours ? { hours: Number(hours.replace(',', '.')) } : {}),
        fields,
    };
    const problems = inputProblems(rule, task, input);
    const setF = (patch: Partial<Task>) => setFields(f => ({ ...f, ...patch }));
    const confirm = () => { setTried(true); if (!problems.length) onConfirm(input); };

    return (
        <Sheet title={`${fromLabel} → ${toLabel}`} subtitle={`${task.jiraId ? `${task.jiraId} · ` : ''}${task.name}`} onClose={onCancel}
            footer={(
                <>
                    {tried && problems.length > 0 ? <span role="alert" className="flex-1 text-[13px] m-ink-bad">{problems[0]}</span> : <span className="flex-1 text-[13px] m-text-3">Projenin iş akışı bu geçişte bu bilgileri istiyor.</span>}
                    <button type="button" className="m-btn m-btn-gray" onClick={onCancel}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-primary" onClick={confirm}><Icon name="check" size={16} />Geçişi yap</button>
                </>
            )}>
            <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); confirm(); }}>
                {needs.comment && (
                    <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold m-text-2">Geçiş notu</span>
                        <textarea className="m-input" rows={3} autoFocus value={comment} placeholder="Ne yapıldı, neden bu duruma geçiyor?" onChange={e => setComment(e.target.value)} />
                        <span className="text-[12px] m-text-3">Göreve yorum olarak eklenir.</span>
                    </label>
                )}
                {needs.hours && (
                    <label className="flex flex-col gap-1 max-w-[220px]"><span className="text-[13px] font-semibold m-text-2">Harcanan süre (saat)</span>
                        <input className="m-input" inputMode="decimal" autoFocus={!needs.comment} value={hours} placeholder="ör. 3,5" onChange={e => setHours(e.target.value)} />
                        <span className="text-[12px] m-text-3">Görevin harcanan süresine eklenir{task.actualHours ? ` (şu an ${task.actualHours} sa)` : ''}.</span>
                    </label>
                )}
                {needs.fields.map(f => (
                    <label key={f} className="flex flex-col gap-1"><span className="text-[13px] font-semibold m-text-2">{REQUIRED_FIELD_LABELS[f]}</span>
                        {f === 'resourceName' && (
                            <select className="m-input" value={fields.resourceName || ''} onChange={e => setF({ resourceName: e.target.value })}>
                                <option value="">Seçin…</option>{assignees.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        )}
                        {f === 'dueDate' && <input type="date" className="m-input" value={fields.dueDate || ''} onChange={e => setF({ dueDate: e.target.value || undefined })} />}
                        {f === 'estimate' && <input className="m-input max-w-[220px]" inputMode="decimal" placeholder="Ortalama süre (gün)" onChange={e => { const n = Number(e.target.value.replace(',', '.')); setF({ time: { best: task.time.best, worst: task.time.worst, avg: Number.isFinite(n) && n > 0 ? n : 0 }, availability: n > 0 }); }} />}
                        {f === 'issueType' && (
                            <select className="m-input" value={fields.issueType || ''} onChange={e => setF({ issueType: (e.target.value || undefined) as IssueType | undefined })}>
                                <option value="">Seçin…</option>{ISSUE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        )}
                        {f === 'labels' && <input className="m-input" placeholder="Etiketler (virgülle)" onChange={e => setF({ labels: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />}
                        {f === 'component' && (
                            <select className="m-input" value={fields.components?.[0] || ''} onChange={e => setF({ components: e.target.value ? [e.target.value] : undefined })}>
                                <option value="">Seçin…</option>{components.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        )}
                        {f === 'fixVersion' && (
                            <select className="m-input" value={fields.fixVersion || ''} onChange={e => setF({ fixVersion: e.target.value || undefined })}>
                                <option value="">Seçin…</option>{versions.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        )}
                        {f === 'workPackage' && (
                            <select className="m-input" value={fields.workPackageId || ''} onChange={e => setF({ workPackageId: e.target.value || undefined })}>
                                <option value="">Seçin…</option>{workPackages.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        )}
                    </label>
                ))}
            </form>
        </Sheet>
    );
};

export default TransitionDialog;
