import React, { useEffect, useMemo, useState } from 'react';
import { Objective, Person, Resource, Task, TaskStatus, WorkPackage } from '../../types';
import { EMBED_SYSTEM, parsePertEstimate, pertEstimatePrompt } from '../../utils/ai/embedded';
import { ISSUE_TYPE_LABELS } from '../../utils/planning/lifecycle';
import { calculatePertFuzzyPert } from '../../utils/timeline';
import { useAiRun } from '../assistant/AiButton';
import { Icon } from './icons';
import { PRIORITY_META, sprintLabel, TASK_STATUS_LABELS, uniq } from './taskMeta';
import { Field, Sheet } from './ui';

/**
 * Modern görev formu (ekle/düzenle). Sık kullanılanlar üstte; süre, bağlantılar
 * ve ayrıntılar ayrı başlıklarda. Klasik formdan farklı olarak termin de girilir.
 */

interface TaskFormSheetProps {
    task: Task | null;
    tasks: Task[];
    resources: Resource[];
    people: Person[];
    workPackages: WorkPackage[];
    objectives: Objective[];
    sprintNames?: Record<number, string>;
    onClose: () => void;
    onSave: (task: Task) => void;
}

type Draft = Omit<Task, 'id' | 'availability'>;

const STATUSES: TaskStatus[] = [TaskStatus.Backlog, TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done];
const PRIORITIES: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];

const emptyDraft = (resources: Resource[]): Draft => ({
    name: '', priority: 'Medium', version: 1, predecessor: null, unit: resources[0]?.unit || '', resourceName: resources[0]?.name || '',
    time: { best: 0, avg: 0, worst: 0 }, jiraId: '', notes: '', status: TaskStatus.ToDo, labels: [], includeInSprints: true,
    issueType: undefined, estimateSource: undefined,
});

const fromTask = (t: Task): Draft => ({
    name: t.name, priority: t.priority, version: t.version, predecessor: t.predecessor, unit: t.unit, resourceName: t.resourceName,
    time: { ...t.time }, jiraId: t.jiraId, notes: t.notes, status: t.status, labels: t.labels || [], includeInSprints: t.includeInSprints ?? true,
    keyResultId: t.keyResultId, workPackageId: t.workPackageId, dueDate: t.dueDate, subtasks: t.subtasks, comments: t.comments,
    issueType: t.issueType, estimateSource: t.estimateSource,
});

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <fieldset className="m-0 p-0 border-0 flex flex-col gap-3.5">
        <legend className="p-0 mb-1 text-[13px] font-semibold uppercase tracking-[0.04em] m-text-3">{title}</legend>
        {children}
    </fieldset>
);

const TaskFormSheet: React.FC<TaskFormSheetProps> = ({ task, tasks, resources, people, workPackages, objectives, sprintNames, onClose, onSave }) => {
    // Müşteri isteğinden açılan taslak listede yoktur → "yeni görev" sayılır
    const isNew = !task || !tasks.some(t => t.id === task.id);
    const [d, setD] = useState<Draft>(() => (task ? fromTask(task) : emptyDraft(resources)));
    const [objectiveId, setObjectiveId] = useState(() => (task?.keyResultId ? objectives.find(o => o.keyResults.some(kr => kr.id === task.keyResultId))?.id || '' : ''));
    const [labelText, setLabelText] = useState(() => (task?.labels || []).join(', '));
    const [touched, setTouched] = useState(false);
    const ai = useAiRun();
    const [aiNote, setAiNote] = useState<string | null>(null);
    const set = (patch: Partial<Draft>) => setD(prev => ({ ...prev, ...patch }));

    // Havuz kişileri (projede kaynağı olmayanlar ayrı grupta)
    const poolCandidates = useMemo(() => {
        const existing = new Set(resources.map(r => r.name.trim().toLocaleLowerCase('tr-TR')));
        return people
            .map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), unit: p.departmentCode || '' }))
            .filter(p => p.name && !existing.has(p.name.toLocaleLowerCase('tr-TR')))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }, [people, resources]);

    // Sorumlu değişince birim kaynaktan ya da kişinin bölümünden dolar
    useEffect(() => {
        const r = resources.find(x => x.name === d.resourceName);
        const unit = r?.unit || poolCandidates.find(p => p.name === d.resourceName)?.unit;
        if (unit && unit !== d.unit) set({ unit });
    }, [d.resourceName]); // eslint-disable-line react-hooks/exhaustive-deps

    const versions = useMemo(() => {
        const used = uniq<number>(tasks.map(t => t.version || 0));
        const max = Math.max(0, ...used, d.version || 0);
        return Array.from({ length: max + 2 }, (_, i) => i);
    }, [tasks, d.version]);
    const keyResults = objectives.find(o => o.id === objectiveId)?.keyResults || [];
    const predecessors = tasks.filter(t => t.id !== task?.id);
    const pert = d.time.avg > 0 ? calculatePertFuzzyPert(d.time).pert : 0;
    const timeError = d.time.worst > 0 && (d.time.best > d.time.avg || d.time.avg > d.time.worst) ? 'En iyi ≤ olası ≤ en kötü olmalı.' : '';
    const nameError = touched && !d.name.trim() ? 'Görev adı gerekli.' : '';

    const estimate = async () => {
        const est = await ai.run(EMBED_SYSTEM, pertEstimatePrompt({ name: d.name, notes: d.notes }, tasks), parsePertEstimate);
        if (est) {
            set({ time: { best: est.best, avg: est.avg, worst: est.worst }, estimateSource: 'ai' });
            setAiNote(est.rationale || 'AI tahmini uygulandı; değerleri değiştirebilirsiniz.');
        }
    };

    const save = () => {
        setTouched(true);
        if (!d.name.trim() || timeError) return;
        const labels = labelText.split(',').map(s => s.trim()).filter(Boolean);
        onSave({
            ...d,
            name: d.name.trim(),
            labels,
            dueDate: d.dueDate || undefined,
            id: task?.id || `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            availability: d.time.avg > 0,
            estimateSource: d.time.avg > 0 ? d.estimateSource || 'user' : undefined,
        });
    };

    const num = (key: keyof Task['time'], label: string) => (
        <label className="flex flex-col gap-1.5 min-w-0">
            <span className="text-[13px] font-semibold m-text-2">{label}</span>
            <input type="number" min={0} inputMode="numeric" className="m-input m-tabular" value={d.time[key] || ''} placeholder="0"
                onChange={e => set({ time: { ...d.time, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) }, estimateSource: 'user' })} />
        </label>
    );

    return (
        <Sheet
            title={isNew ? 'Yeni görev' : 'Görevi düzenle'}
            onClose={onClose}
            wide
            footer={<>
                <span className="flex-1"></span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" onClick={save}>{isNew ? 'Görevi ekle' : 'Kaydet'}</button>
            </>}
        >
            <form className="flex flex-col gap-6" onSubmit={e => { e.preventDefault(); save(); }}>
                <Field label="Görev adı" htmlFor="tf-name">
                    <input id="tf-name" className="m-input" autoFocus={isNew} value={d.name} aria-invalid={!!nameError} placeholder="Ör. Kimlik doğrulama servisini yaz"
                        onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(true)} />
                    {nameError && <span role="alert" className="text-[13px] m-ink-bad">{nameError}</span>}
                </Field>

                <Section title="Plan">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-semibold m-text-2">Durum</span>
                        <div className="m-segmented self-start" role="group" aria-label="Durum">
                            {STATUSES.map(s => <button key={s} type="button" className="m-segment" aria-pressed={d.status === s} onClick={() => set({ status: s })}>{TASK_STATUS_LABELS[s]}</button>)}
                        </div>
                    </div>
                    <Field label="Kayıt türü" htmlFor="tf-type" hint="Planlama simülasyonu ve AI tahmini benzer kayıtları türüne göre karşılaştırır">
                        <select id="tf-type" className="m-input" value={d.issueType || ''} onChange={e => set({ issueType: (e.target.value || undefined) as Task['issueType'] })}>
                            <option value="">Belirtilmedi</option>
                            {(Object.keys(ISSUE_TYPE_LABELS) as NonNullable<Task['issueType']>[]).map(k => <option key={k} value={k}>{ISSUE_TYPE_LABELS[k]}</option>)}
                        </select>
                    </Field>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-semibold m-text-2">Öncelik</span>
                        <div className="m-segmented self-start" role="group" aria-label="Öncelik">
                            {PRIORITIES.map(p => <button key={p} type="button" className="m-segment" aria-pressed={d.priority === p} onClick={() => set({ priority: p })}>{PRIORITY_META[p].label}</button>)}
                        </div>
                    </div>
                    <div className="grid gap-3.5 sm:grid-cols-2">
                        <Field label="Sorumlu" htmlFor="tf-owner">
                            <select id="tf-owner" className="m-input" value={d.resourceName} onChange={e => set({ resourceName: e.target.value })}>
                                <option value="">Atanmadı</option>
                                {resources.length > 0 && <optgroup label="Proje ekibi">{resources.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}</optgroup>}
                                {poolCandidates.length > 0 && <optgroup label="Personel havuzu">{poolCandidates.map(p => <option key={p.id} value={p.name}>{p.name}{p.unit ? ` (${p.unit})` : ''}</option>)}</optgroup>}
                            </select>
                        </Field>
                        <Field label="Birim" htmlFor="tf-unit">
                            <input id="tf-unit" className="m-input" value={d.unit} onChange={e => set({ unit: e.target.value })} />
                        </Field>
                        <Field label="Sürüm" htmlFor="tf-version">
                            <select id="tf-version" className="m-input" value={d.version} onChange={e => set({ version: parseInt(e.target.value, 10) || 0 })}>
                                {versions.map(v => <option key={v} value={v}>{sprintLabel(v, sprintNames)}</option>)}
                            </select>
                        </Field>
                        <Field label="Termin" htmlFor="tf-due">
                            <input id="tf-due" type="date" className="m-input" value={d.dueDate?.slice(0, 10) || ''} onChange={e => set({ dueDate: e.target.value || undefined })} />
                        </Field>
                    </div>
                    <label className="flex items-center gap-2.5 text-[15px] m-text cursor-pointer self-start">
                        <input type="checkbox" className="w-4 h-4" checked={d.includeInSprints !== false} onChange={e => set({ includeInSprints: e.target.checked })} />
                        Sürüm planlamasına dahil
                    </label>
                </Section>

                <Section title="Süre tahmini (gün)">
                    <div className="grid gap-3 grid-cols-3">
                        {num('best', 'En iyi')}
                        {num('avg', 'Olası')}
                        {num('worst', 'En kötü')}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`text-[14px] ${timeError ? 'm-ink-bad' : 'm-text-3'}`} role={timeError ? 'alert' : undefined}>
                            {timeError || (pert > 0 ? `PERT süresi ≈ ${pert.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün` : 'Tahmin girilmezse planlamada süre 0 sayılır.')}
                        </span>
                        {ai.available && (
                            <button type="button" className="m-btn m-btn-gray" disabled={ai.loading || !d.name.trim()} onClick={estimate}>
                                <Icon name="activity" size={16} />
                                {ai.loading ? 'Tahmin ediliyor…' : 'AI ile tahmin et'}
                            </button>
                        )}
                    </div>
                    {aiNote && <span className="text-[13px] m-accent">{aiNote}</span>}
                    {ai.error && <span role="alert" className="text-[13px] m-ink-bad">{ai.error}</span>}
                </Section>

                <Section title="Bağlantılar">
                    <div className="grid gap-3.5 sm:grid-cols-2">
                        <Field label="Öncül görev" htmlFor="tf-pred">
                            <select id="tf-pred" className="m-input" value={d.predecessor || ''} onChange={e => set({ predecessor: e.target.value || null })}>
                                <option value="">Yok</option>
                                {predecessors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </Field>
                        <Field label="İş paketi" htmlFor="tf-wp">
                            <select id="tf-wp" className="m-input" value={d.workPackageId || ''} disabled={workPackages.length === 0} onChange={e => set({ workPackageId: e.target.value || undefined })}>
                                <option value="">{workPackages.length ? 'Atanmamış' : 'İş paketi tanımlı değil'}</option>
                                {workPackages.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Hedef" htmlFor="tf-obj">
                            <select id="tf-obj" className="m-input" value={objectiveId} disabled={objectives.length === 0} onChange={e => { setObjectiveId(e.target.value); set({ keyResultId: undefined }); }}>
                                <option value="">{objectives.length ? 'Hedefe bağlı değil' : 'Hedef tanımlı değil'}</option>
                                {objectives.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Anahtar sonuç" htmlFor="tf-kr">
                            <select id="tf-kr" className="m-input" value={d.keyResultId || ''} disabled={!objectiveId} onChange={e => set({ keyResultId: e.target.value || undefined })}>
                                <option value="">{objectiveId ? 'Seçin' : 'Önce hedef seçin'}</option>
                                {keyResults.map(kr => <option key={kr.id} value={kr.id}>{kr.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Jira kayıt no" htmlFor="tf-jira">
                            <input id="tf-jira" className="m-input" value={d.jiraId} placeholder="Ör. MKS-123" onChange={e => set({ jiraId: e.target.value })} />
                        </Field>
                        <Field label="Etiketler" htmlFor="tf-labels" hint="Virgülle ayırın">
                            <input id="tf-labels" className="m-input" value={labelText} placeholder="arayüz, güvenlik" onChange={e => setLabelText(e.target.value)} />
                        </Field>
                    </div>
                </Section>

                <Field label="Açıklama" htmlFor="tf-notes">
                    <textarea id="tf-notes" className="m-input py-2.5" rows={3} value={d.notes} onChange={e => set({ notes: e.target.value })} />
                </Field>
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1}></button>
            </form>
        </Sheet>
    );
};

export default TaskFormSheet;
