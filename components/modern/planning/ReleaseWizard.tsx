import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EffortRange, IssueType, Leave, Person, Project, ReleaseItemChoice, ReleaseMilestone, ReleasePlan, ReleasePlanItem, Task, TaskStatus } from '../../../types';
import { EMBED_SYSTEM } from '../../../utils/ai/embedded';
import { GATE_BLOCK_MESSAGE } from '../../../utils/ai/estimateEval';
import { logModel } from '../../../utils/planning/ml/estimateModel';
import { modelFor, PlanningModel } from '../../../utils/planning/ml/runModel';
import { AI_FLAG_LABELS, ESTIMATE_PROMPT_VERSION, estimateSuggestionPrompt, finalizeEstimateSuggestion, parseEstimateSuggestion } from '../../../utils/ai/estimateSuggestion';
import { milestonePrompt, parseMilestones } from '../../../utils/ai/milestoneSuggestion';
import { PlanningHistory } from '../../../utils/planning/history';
import { ISSUE_TYPE_LABELS } from '../../../utils/planning/lifecycle';
import { CONFIDENCE_LABELS, estimateFromHistory } from '../../../utils/planning/referenceClass';
import {
    autoMilestones, BASELINE_ITERATIONS, buildReleaseSimulation, choiceOf, commitGroups, commitReleasePlan, CommitResult, decisionOf, finalizeCommit, effortOf, groupOf, includedItems, itemDraft, itemFromTask, ItemDecision,
    newId, newItem, parsePastedItems, priorityOf, RELEASE_GROUP, RELEASE_STEPS, releaseDates, sanitizeMilestones, suggestDescope, typeOf, withReference,
} from '../../../utils/planning/releasePlan';
import { runSimulationAsync } from '../../../utils/planning/runSimulation';
import { toIsoDay } from '../../../utils/calendarRange';
import { buildSimulation, dateAtOffset } from '../../../utils/planning/simulationInput';
import { useAiRun } from '../../assistant/AiButton';
import { useAssistantOptional } from '../../assistant/AssistantContext';
import { Icon } from '../icons';
import { PRIORITY_META } from '../taskMeta';
import { Field, rowSep } from '../ui';
import SimChart, { ChartMarker } from './SimChart';
import { useReleaseSimulation } from './useReleaseSimulation';

/**
 * Sürüm planlama sihirbazı. Taslak her değişiklikte (gecikmeli) kaydedilir;
 * kapatılıp sonra kalınan adımdan sürdürülebilir. Kör tahmin açıksa satırların
 * kendi tahminleri 2. adımda girilir ve öneriler 3. adımda açılırken donar.
 */

interface Props {
    project: Project;
    initial: ReleasePlan;
    history: PlanningHistory;
    people: Person[];
    leaves: Leave[];
    visibleProjectIds: ReadonlySet<string>;
    canEdit: boolean;
    blindEstimate: boolean;
    /** Kalite kapısı: AI tahmin önerisi kapalı (kilometre taşı önerisi etkilenmez) */
    aiBlocked?: boolean;
    /** Klasik ML modeli (sınamayı geçtiyse) */
    ml?: PlanningModel | null;
    onSave: (plan: ReleasePlan) => void;
    onCommit: (result: CommitResult) => void;
    onClose: () => void;
}

const PRIORITIES: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const pct = (v: number) => `%${Math.round(v * 100)}`;
const fmtDay = (iso?: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const CONF_TONE = { high: 'm-tone-ok', medium: 'm-tone-warn', low: 'm-tone-bad' } as const;
const DECISION_META: Record<ItemDecision, { label: string; tone: string }> = {
    accepted: { label: 'Öneri kabul', tone: 'm-tone-ok' },
    edited: { label: 'Düzeltildi', tone: 'm-tone-accent' },
    rejected: { label: 'Kapsam dışı', tone: 'm-tone-hold' },
    pending: { label: 'Tahmin yok', tone: 'm-tone-warn' },
};
const probInk = (p: number) => (p >= 0.8 ? 'm-ink-ok' : p >= 0.5 ? 'm-ink-warn' : 'm-ink-bad');
const range = (e: EffortRange) => `${num(e.best)} · ${num(e.likely)} · ${num(e.worst)} gün`;

const ReleaseWizard: React.FC<Props> = ({ project, initial, history, people, leaves, visibleProjectIds, canEdit, blindEstimate, aiBlocked = false, ml = null, onSave, onCommit, onClose }) => {
    const [plan, setPlan] = useState<ReleasePlan>(initial);
    const latest = useRef(plan);
    latest.current = plan;
    const dirty = useRef(false);
    const update = (fn: (p: ReleasePlan) => ReleasePlan) => {
        if (!canEdit) return;
        dirty.current = true;
        setPlan(p => {
            const next = fn(p);
            // Kayıtlar değişince kilometre taşları da güncel kalır (yeni kayıt uygun taşa, çıkarılan atılır)
            const ms = next.items !== p.items && next.milestones.length ? sanitizeMilestones(next.milestones, next, { keepEmpty: true }) : next.milestones;
            return { ...next, milestones: ms, updatedAt: new Date().toISOString() };
        });
    };
    // Taslak kaydı: gecikmeli; kapanırken bekleyen değişiklik yazılır
    useEffect(() => {
        if (!dirty.current) return;
        const t = setTimeout(() => { dirty.current = false; onSave(latest.current); }, 600);
        return () => clearTimeout(t);
    }, [plan, onSave]);
    useEffect(() => () => { if (dirty.current) onSave(latest.current); }, [onSave]);

    // Salt okunurda adımlar arasında yine gezilebilir
    const [viewStep, setViewStep] = useState(plan.step);
    const step = canEdit ? plan.step : viewStep;
    const ctx = useMemo(() => ({ people, leaves }), [people, leaves]);
    const sim = useReleaseSimulation(project, plan, history, ctx, { enabled: step >= 4, visibleProjectIds });

    const items = includedItems(plan);
    const reach = [
        true,
        !!plan.name.trim(),
        !!plan.name.trim() && plan.items.some(i => i.name.trim()),
        items.some(i => effortOf(i)),
        items.some(i => effortOf(i)),
        items.some(i => effortOf(i)) && !!sim.result,
    ];
    const goTo = (step: number) => {
        if (!reach[step - 1] && step > plan.step) return;
        update(p => {
            let next = { ...p, step };
            // Kör tahmin: öneriler ilk açılırken kullanıcının kendi değerleri donar
            if (step >= 3 && !p.revealed) {
                next = { ...next, revealed: true, items: p.items.map(i => (blindEstimate && (i.ownEstimateDays || i.priority) ? { ...i, blind: { effortDays: i.ownEstimateDays, priority: i.priority } } : i)) };
            }
            if (step === 5 && !p.milestones.length) next = { ...next, milestones: autoMilestones(next, project) };
            return next;
        });
    };
    const go = (s: number) => (canEdit ? goTo(s) : setViewStep(s));

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <button type="button" onClick={onClose} className="inline-flex items-center min-h-[40px] -ml-2 pr-2 rounded-xl text-[15px] m-accent bg-transparent border-0 cursor-pointer">
                        <Icon name="chevronLeft" size={20} strokeWidth={2.2} />Sürüm planları
                    </button>
                    <h2 className="m-0 text-[20px] font-bold m-text">{plan.name.trim() || 'Yeni sürüm planı'}</h2>
                    <p className="m-0 text-[13px] m-text-3">Taslak otomatik kaydedilir; kapatıp sonra kalınan adımdan devam edebilirsiniz.</p>
                </div>
            </div>

            <ol className="m-0 p-0 list-none flex flex-wrap gap-1.5" aria-label="Sihirbaz adımları">
                {RELEASE_STEPS.map((label, k) => {
                    const n = k + 1;
                    const current = n === step;
                    const enabled = !canEdit || reach[k] || n <= plan.step;
                    return (
                        <li key={label}>
                            <button
                                type="button"
                                disabled={!enabled}
                                aria-current={current ? 'step' : undefined}
                                onClick={() => go(n)}
                                className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-[13px] font-semibold border-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ background: current ? 'var(--m-accent)' : 'var(--m-fill-2)', color: current ? 'var(--m-on-accent)' : 'var(--m-label)' }}
                            >
                                <span className="m-tabular">{n}</span>{label}
                            </button>
                        </li>
                    );
                })}
            </ol>

            {step === 1 && <StepDefine plan={plan} project={project} canEdit={canEdit} update={update} />}
            {step === 2 && <StepItems plan={plan} project={project} canEdit={canEdit} blindEstimate={blindEstimate} update={update} />}
            {step === 3 && <StepSuggestions plan={plan} project={project} history={history} visibleProjectIds={visibleProjectIds} canEdit={canEdit} aiBlocked={aiBlocked} ml={ml} update={update} />}
            {step === 4 && <StepSimulation plan={plan} project={project} history={history} ctx={ctx} visibleProjectIds={visibleProjectIds} sim={sim} canEdit={canEdit} update={update} />}
            {step === 5 && <StepMilestones plan={plan} project={project} sim={sim} canEdit={canEdit} update={update} />}
            {step === 6 && <StepCommit plan={plan} project={project} history={history} ctx={ctx} sim={sim} canEdit={canEdit} onCommit={onCommit} />}

            <div className="flex flex-wrap items-center justify-between gap-2.5">
                <button type="button" className="m-btn m-btn-plain" disabled={step <= 1} onClick={() => go(step - 1)}><Icon name="chevronLeft" size={18} />Geri</button>
                {step < 6 && (
                    <button type="button" className="m-btn m-btn-primary" disabled={!(reach[step] ?? false)} onClick={() => go(step + 1)}>
                        {RELEASE_STEPS[step]}<Icon name="chevronRight" size={18} />
                    </button>
                )}
            </div>
        </div>
    );
};

type Update = (fn: (p: ReleasePlan) => ReleasePlan) => void;
const setItem = (update: Update, id: string, patch: Partial<ReleasePlanItem>) => update(p => ({ ...p, items: p.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }));

// ------------------------------------------------------------------ 1. tanım

const StepDefine: React.FC<{ plan: ReleasePlan; project: Project; canEdit: boolean; update: Update }> = ({ plan, project, canEdit, update }) => (
    <section className="m-surface rounded-2xl p-5 flex flex-col gap-3.5" aria-labelledby="rp-s1">
        <h3 id="rp-s1" className="m-0 text-[17px] font-semibold m-text">Sürümü tanımlayın</h3>
        <div className="grid gap-3.5 sm:grid-cols-[2fr_1fr_1fr]">
            <Field label="Sürüm adı" htmlFor="rp-name">
                <input id="rp-name" className="m-input" disabled={!canEdit} value={plan.name} placeholder="Ör. Sürüm 2.0 — Kimlik ve raporlama" onChange={e => update(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Hedef teslim tarihi" htmlFor="rp-target" hint="İsteğe bağlı">
                <input id="rp-target" type="date" className="m-input" disabled={!canEdit} value={plan.targetDate || ''} onChange={e => update(p => ({ ...p, targetDate: e.target.value || undefined }))} />
            </Field>
            <Field label="Test süresi (iş günü)" htmlFor="rp-test">
                <input id="rp-test" type="number" min={0} max={60} className="m-input m-tabular" disabled={!canEdit} value={plan.testDays} onChange={e => update(p => ({ ...p, testDays: Math.max(0, Math.min(60, Number(e.target.value) || 0)) }))} />
            </Field>
        </div>
        <Field label="Özet (Summary)" htmlFor="rp-summary" hint="Sürümün amacı, kapsamı ve sınırları; AI önerilerine bağlam olarak verilir.">
            <textarea id="rp-summary" className="m-input py-2.5" rows={4} disabled={!canEdit} value={plan.summary} onChange={e => update(p => ({ ...p, summary: e.target.value }))} />
        </Field>
        {project.workPackages.length > 0 && (
            <fieldset className="m-0 p-0 border-0 flex flex-col gap-1.5">
                <legend className="p-0 mb-1 text-[13px] font-semibold m-text-2">İş paketleri</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {project.workPackages.map(w => (
                        <label key={w.id} className="flex items-center gap-2 min-h-[36px] text-[15px] m-text cursor-pointer">
                            <input type="checkbox" className="w-4 h-4" disabled={!canEdit} checked={plan.workPackageIds.includes(w.id)}
                                onChange={e => update(p => ({ ...p, workPackageIds: e.target.checked ? [...p.workPackageIds, w.id] : p.workPackageIds.filter(x => x !== w.id) }))} />
                            {w.name}
                        </label>
                    ))}
                </div>
            </fieldset>
        )}
    </section>
);

// ------------------------------------------------------------------ 2. kayıtlar

/**
 * Ondalık sayı girişi: yazılan metin korunur ("2," yazarken virgül silinmez,
 * "2,5" → 2,5). Değer dışarıdan değişirse (seçim, sıfırlama) metin eşitlenir.
 * `toValue` kaydedilecek değeri sınırlar (ör. 0 → boş).
 */
const DecimalInput: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
    value: number | undefined;
    onValue: (v: number | undefined) => void;
    toValue?: (n: number | undefined) => number | undefined;
}> = ({ value, onValue, toValue = n => n, ...rest }) => {
    const fmt = (v?: number) => (v === undefined ? '' : String(v).replace('.', ','));
    const parse = (t: string) => { const n = Number(t.trim().replace(',', '.')); return t.trim() && Number.isFinite(n) ? n : undefined; };
    const [text, setText] = useState(fmt(value));
    useEffect(() => { if (toValue(parse(text)) !== value) setText(fmt(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
    return <input {...rest} inputMode="decimal" value={text} onChange={e => { setText(e.target.value); onValue(toValue(parse(e.target.value))); }} />;
};
const positive = (n: number | undefined) => (n !== undefined && n > 0 ? n : undefined);
const nonNegative = (n: number | undefined) => (n !== undefined && n >= 0 ? n : 0);

const StepItems: React.FC<{ plan: ReleasePlan; project: Project; canEdit: boolean; blindEstimate: boolean; update: Update }> = ({ plan, project, canEdit, blindEstimate, update }) => {
    const [paste, setPaste] = useState<string | null>(null);
    const [pool, setPool] = useState<Set<string> | null>(null);
    const units = useMemo<string[]>(() => [...new Set<string>([...project.resources.map(r => r.unit), ...project.tasks.map(t => t.unit)].map(u => (u || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [project]);
    const wps = plan.workPackageIds.length ? project.workPackages.filter(w => plan.workPackageIds.includes(w.id)) : project.workPackages;
    // Bu planda ya da başka bir taslakta alınmış havuz görevi yeniden önerilmez
    const taken = new Set((project.releasePlans || []).filter(p => p.id !== plan.id && p.status === 'draft').concat(plan).flatMap(p => p.items.map(i => i.sourceTaskId)).filter(Boolean));
    const backlog = project.tasks.filter(t => t.status !== TaskStatus.Done && (t.version || 0) === 0 && t.includeInSprints !== false && !taken.has(t.id));
    const defaultUnit = project.resources[0]?.unit || '';
    const add = (xs: ReleasePlanItem[]) => update(p => ({ ...p, items: [...p.items, ...xs] }));
    const hideHint = plan.revealed ? 'Öneriler açıldı; buradaki değişiklik kör tahmini değiştirmez.' : blindEstimate ? 'Kör tahmin açık: kendi tahminlerinizi şimdi girin; öneriler bir sonraki adımda açılır.' : 'Kendi tahmininiz isteğe bağlı; bir sonraki adımda önerilerle karşılaştırılır.';

    return (
        <section className="m-surface rounded-2xl p-5 flex flex-col gap-3.5" aria-labelledby="rp-s2">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 id="rp-s2" className="m-0 text-[17px] font-semibold m-text">Kayıtlar ({plan.items.length})</h3>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">{hideHint}</p>
                </div>
                {canEdit && (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="m-btn m-btn-gray" onClick={() => add([newItem({ unit: defaultUnit })])}><Icon name="plus" size={18} strokeWidth={2.2} />Kayıt ekle</button>
                        <button type="button" className="m-btn m-btn-plain" aria-expanded={paste !== null} onClick={() => setPaste(v => (v === null ? '' : null))}><Icon name="copy" size={18} />Yapıştır</button>
                        <button type="button" className="m-btn m-btn-plain" aria-expanded={pool !== null} disabled={!backlog.length} onClick={() => setPool(v => (v ? null : new Set()))}><Icon name="inbox" size={18} />Havuzdan ({backlog.length})</button>
                    </div>
                )}
            </div>

            {paste !== null && (
                <div className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-2">
                    <Field label="Excel ya da Jira'dan yapıştırın" htmlFor="rp-paste" hint="Her satır bir kayıt. Sütunlar: Başlık, Açıklama, Tür, Önem, Birim, Tahmin (gün). İlk satır başlıksa sütun adlarına göre eşlenir; “başlık | açıklama” da olur.">
                        <textarea id="rp-paste" className="m-input py-2.5 m-tabular" rows={5} value={paste} onChange={e => setPaste(e.target.value)} />
                    </Field>
                    <div className="flex gap-2">
                        <button type="button" className="m-btn m-btn-primary" disabled={!paste.trim()} onClick={() => { add(parsePastedItems(paste, { unit: defaultUnit })); setPaste(null); }}>Satırları ekle ({parsePastedItems(paste).length})</button>
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setPaste(null)}>Vazgeç</button>
                    </div>
                </div>
            )}

            {pool && (
                <div className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-2">
                    <span className="text-[13px] font-semibold m-text-2">Havuzdaki açık kayıtlar (sürüm atanmamış)</span>
                    <div className="flex flex-col max-h-[260px] overflow-y-auto">
                        {backlog.map(t => (
                            <label key={t.id} className="flex items-center gap-2.5 min-h-[40px] text-[15px] m-text cursor-pointer">
                                <input type="checkbox" className="w-4 h-4" checked={pool.has(t.id)} onChange={e => setPool(s => { const n = new Set(s!); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
                                <span className="flex-1 min-w-0 truncate">{t.name}</span>
                                <span className="text-[13px] m-text-3">{PRIORITY_META[t.priority].label}</span>
                            </label>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className="m-btn m-btn-primary" disabled={!pool.size} onClick={() => { add(backlog.filter(t => pool.has(t.id)).map(itemFromTask)); setPool(null); }}>Seçilenleri ekle ({pool.size})</button>
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setPool(null)}>Vazgeç</button>
                    </div>
                </div>
            )}

            <datalist id="rp-units">{units.map(u => <option key={u} value={u} />)}</datalist>
            {!plan.items.length && <p className="m-0 text-[15px] m-text-2">Henüz kayıt yok. Tek tek ekleyin, Excel/Jira'dan yapıştırın ya da havuzdaki kayıtları seçin.</p>}
            <div className="flex flex-col gap-3">
                {plan.items.map((i, k) => (
                    <div key={i.id} className="rounded-xl p-3.5 flex flex-col gap-2.5 border m-sep" style={{ borderStyle: 'solid', borderWidth: 1 }}>
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold m-text-3 m-tabular w-7">#{k + 1}</span>
                            <input aria-label={`Kayıt ${k + 1} başlığı`} className="m-input flex-1" disabled={!canEdit} value={i.name} placeholder="Kayıt başlığı" onChange={e => setItem(update, i.id, { name: e.target.value })} />
                            {i.sourceTaskId && <span className="inline-flex items-center h-6 px-2 rounded-full text-[12px] font-semibold m-tone-hold whitespace-nowrap">Havuzdan</span>}
                            {canEdit && <button type="button" className="m-icon-btn" aria-label={`${k + 1}. kaydı sil`} onClick={() => update(p => ({ ...p, items: p.items.filter(x => x.id !== i.id).map(x => (x.predecessorId === i.id ? { ...x, predecessorId: undefined } : x)), milestones: p.milestones.map(m => ({ ...m, itemIds: m.itemIds.filter(id => id !== i.id) })) }))}><Icon name="trash" size={16} /></button>}
                        </div>
                        <textarea aria-label={`Kayıt ${k + 1} açıklaması`} className="m-input py-2" rows={2} disabled={!canEdit} value={i.notes || ''} placeholder="Açıklama (isteğe bağlı)" onChange={e => setItem(update, i.id, { notes: e.target.value || undefined })} />
                        <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
                            <Field label="Tür" htmlFor={`rp-type-${i.id}`}>
                                <select id={`rp-type-${i.id}`} className="m-input" disabled={!canEdit} value={i.issueType || ''} onChange={e => setItem(update, i.id, { issueType: (e.target.value || undefined) as IssueType | undefined })}>
                                    <option value="">Seçilmedi</option>
                                    {(Object.keys(ISSUE_TYPE_LABELS) as IssueType[]).map(t => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}
                                </select>
                            </Field>
                            <Field label="Önem" htmlFor={`rp-pri-${i.id}`}>
                                <select id={`rp-pri-${i.id}`} className="m-input" disabled={!canEdit} value={i.priority || ''} onChange={e => setItem(update, i.id, { priority: (e.target.value || undefined) as Task['priority'] | undefined })}>
                                    <option value="">Öneriye bırak</option>
                                    {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                                </select>
                            </Field>
                            <Field label="Birim" htmlFor={`rp-unit-${i.id}`}>
                                <input id={`rp-unit-${i.id}`} className="m-input" list="rp-units" disabled={!canEdit} value={i.unit || ''} onChange={e => setItem(update, i.id, { unit: e.target.value || undefined })} />
                            </Field>
                            <Field label="Kendi tahmininiz (gün)" htmlFor={`rp-own-${i.id}`}>
                                <DecimalInput id={`rp-own-${i.id}`} className="m-input m-tabular" disabled={!canEdit} value={i.ownEstimateDays} placeholder="—"
                                    toValue={positive} onValue={v => setItem(update, i.id, { ownEstimateDays: v })} />
                            </Field>
                            <Field label="Sorumlu" htmlFor={`rp-res-${i.id}`}>
                                <select id={`rp-res-${i.id}`} className="m-input" disabled={!canEdit} value={i.resourceName || ''} onChange={e => {
                                    const r = project.resources.find(x => x.name === e.target.value);
                                    setItem(update, i.id, { resourceName: e.target.value || undefined, ...(r?.unit ? { unit: r.unit } : {}) });
                                }}>
                                    <option value="">Atanmamış</option>
                                    {project.resources.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                                </select>
                            </Field>
                            {wps.length > 0 && (
                                <Field label="İş paketi" htmlFor={`rp-wp-${i.id}`}>
                                    <select id={`rp-wp-${i.id}`} className="m-input" disabled={!canEdit} value={i.workPackageId || ''} onChange={e => setItem(update, i.id, { workPackageId: e.target.value || undefined })}>
                                        <option value="">Seçilmedi</option>
                                        {wps.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </Field>
                            )}
                            <Field label="Öncül" htmlFor={`rp-pred-${i.id}`}>
                                <select id={`rp-pred-${i.id}`} className="m-input" disabled={!canEdit} value={i.predecessorId || ''} onChange={e => setItem(update, i.id, { predecessorId: e.target.value || undefined })}>
                                    <option value="">Yok</option>
                                    {plan.items.filter(x => x.id !== i.id && x.name.trim()).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select>
                            </Field>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

// ------------------------------------------------------------------ 3. öneriler

const StepSuggestions: React.FC<{ plan: ReleasePlan; project: Project; history: PlanningHistory; visibleProjectIds: ReadonlySet<string>; canEdit: boolean; aiBlocked: boolean; ml: PlanningModel | null; update: Update }> = ({ plan, project, history, visibleProjectIds, canEdit, aiBlocked, ml, update }) => {
    const ai = useAiRun();
    const aiOn = ai.available && !aiBlocked;
    const model = useAssistantOptional()?.status?.model;
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const cancel = useRef(false);

    // Geçmiş kayıt önerileri: adım açılınca ve satır metni değiştikçe güncellenir
    const refKey = JSON.stringify(plan.items.map(i => [i.id, i.name, i.notes, i.issueType, i.unit, i.priority, i.workPackageId, i.ownEstimateDays]));
    useEffect(() => {
        if (!canEdit) return;
        const t = setTimeout(() => update(p => ({
            ...p,
            items: p.items.map(i => {
                if (!i.name.trim()) return i;
                const r = withReference(i, history, project.id, visibleProjectIds);
                const m = modelFor(ml, itemDraft(i, project.id));
                return { ...r, model: m ? logModel(m) : undefined };
            }),
        })), 50);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refKey, history, ml]);

    const askOne = async (i: ReleasePlanItem): Promise<boolean> => {
        const draft = itemDraft(i, project.id);
        const ref = estimateFromHistory(draft, history, { visibleProjectIds });
        const parsed = await ai.run(EMBED_SYSTEM, estimateSuggestionPrompt(draft, ref, { name: plan.name, summary: plan.summary }), parseEstimateSuggestion);
        if (!parsed) return false;
        const r = finalizeEstimateSuggestion(parsed, ref);
        setItem(update, i.id, {
            ai: {
                promptVersion: ESTIMATE_PROMPT_VERSION, model, issueType: r.issueType, priority: r.priority, effort: r.effort, confidence: r.confidence, flags: r.flags,
                evidence: r.evidence, questions: r.questions.length, rationale: [r.effortRationale, r.priorityRationale].filter(Boolean).join(' ') || undefined, questionList: r.questions,
            },
        });
        return true;
    };
    const askAll = async (all: boolean) => {
        const queue = includedItems(plan).filter(i => all || !i.ai);
        cancel.current = false;
        setProgress({ done: 0, total: queue.length });
        for (let k = 0; k < queue.length && !cancel.current; k++) {
            const ok = await askOne(queue[k]);
            if (!ok) break;
            setProgress({ done: k + 1, total: queue.length });
        }
        setProgress(null);
    };

    const named = plan.items.filter(i => i.name.trim());
    const counts = named.reduce((m, i) => { const d = decisionOf(i); m[d] = (m[d] || 0) + 1; return m; }, {} as Partial<Record<ItemDecision, number>>);
    const effortSum = includedItems(plan).reduce((s, i) => s + (effortOf(i)?.likely || 0), 0);

    return (
        <section className="m-surface rounded-2xl p-5 flex flex-col gap-3.5" aria-labelledby="rp-s3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 id="rp-s3" className="m-0 text-[17px] font-semibold m-text">Öneriler ve kararlar</h3>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">
                        {named.length} kayıt · {counts.accepted || 0} öneri kabul · {counts.edited || 0} düzeltildi · {counts.rejected || 0} kapsam dışı{counts.pending ? ` · ${counts.pending} tahminsiz` : ''} · toplam efor {num(effortSum)} gün
                    </p>
                </div>
                {aiOn && canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                        {progress ? (
                            <>
                                <span className="text-[14px] m-text-2 m-tabular" role="status">AI: {progress.done}/{progress.total}</span>
                                <button type="button" className="m-btn m-btn-plain" onClick={() => { cancel.current = true; }}>Durdur</button>
                            </>
                        ) : (
                            <>
                                <button type="button" className="m-btn m-btn-gray" disabled={ai.loading || !includedItems(plan).some(i => !i.ai)} onClick={() => askAll(false)}><Icon name="sparkles" size={18} />Tümüne AI önerisi al</button>
                                {includedItems(plan).some(i => i.ai) && <button type="button" className="m-btn m-btn-plain" disabled={ai.loading} onClick={() => askAll(true)}>Yenile</button>}
                            </>
                        )}
                    </div>
                )}
            </div>
            {ai.error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{ai.error}</p>}
            {ai.available && aiBlocked && <p className="m-0 text-[14px] m-text-2 flex items-start gap-1.5"><Icon name="lock" size={16} className="mt-0.5 shrink-0" />{GATE_BLOCK_MESSAGE}</p>}
            <p className="m-0 text-[13px] m-text-3">Varsayılan: güveni düşük olmayan AI önerisi, yoksa geçmiş kayıtlar, yoksa kendi tahmininiz. Her satırda değiştirebilir, elle düzeltebilir ya da kaydı kapsam dışı bırakabilirsiniz; kararlar öneri günlüğüne yazılır.</p>

            <div className="flex flex-col gap-3">
                {named.map(i => <SuggestionRow key={i.id} item={i} canEdit={canEdit} aiAvailable={aiOn && !progress} aiLoading={ai.loading} onAsk={() => askOne(i)} update={update} />)}
            </div>
        </section>
    );
};

const SuggestionRow: React.FC<{ item: ReleasePlanItem; canEdit: boolean; aiAvailable: boolean; aiLoading: boolean; onAsk: () => void; update: Update }> = ({ item: i, canEdit, aiAvailable, aiLoading, onAsk, update }) => {
    const c = choiceOf(i);
    const d = decisionOf(i);
    const set = (patch: Partial<ReleasePlanItem>) => setItem(update, i.id, patch);
    const pick = (choice: ReleaseItemChoice) => set({ choice, ...(choice === 'manual' && !i.manual ? { manual: effortOf(i) || { best: 1, likely: 2, worst: 3 } } : {}) });
    const radio = (choice: ReleaseItemChoice, label: React.ReactNode, enabled = true) => (
        <label className={`flex items-start gap-2.5 text-[14px] ${enabled ? 'cursor-pointer' : 'opacity-50'}`}>
            <input type="radio" className="mt-0.5" name={`rp-c-${i.id}`} disabled={!canEdit || !enabled || !!i.excluded} checked={c === choice} onChange={() => pick(choice)} />
            <span className="flex-1 min-w-0">{label}</span>
        </label>
    );
    const setManual = (k: keyof EffortRange, n: number | undefined) => {
        const m = { ...(i.manual || { best: 1, likely: 2, worst: 3 }), [k]: nonNegative(n) };
        set({ manual: m, choice: 'manual' });
    };
    return (
        <div className="rounded-xl p-3.5 flex flex-col gap-2.5 border m-sep" style={{ borderStyle: 'solid', borderWidth: 1, opacity: i.excluded ? 0.65 : 1 }}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-0 text-[15px] font-semibold m-text truncate">{i.name}</span>
                <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold ${DECISION_META[d].tone}`}>{DECISION_META[d].label}</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
                {radio('own', <>Kendi tahminim: <b className="m-tabular">{i.ownEstimateDays ? `${num(i.ownEstimateDays)} gün` : '—'}</b>{i.blind?.effortDays ? <span className="ml-1.5 text-[12px] m-text-3">(kör)</span> : null}</>, !!i.ownEstimateDays)}
                {radio('reference', i.reference ? <>Geçmiş kayıtlar: <b className="m-tabular">{range(i.reference.effort)}</b> <span className="text-[12px] m-text-3">· {i.reference.n} kayıt · {CONFIDENCE_LABELS[i.reference.confidence].toLocaleLowerCase('tr-TR')} · kapanma {num(i.reference.p50Days)}–{num(i.reference.p80Days)} iş günü</span></> : <span className="m-text-3">Geçmiş kayıtlardan öneri yok</span>, !!i.reference)}
                {radio('ai', i.ai ? <>AI: <b className="m-tabular">{range(i.ai.effort)}</b> <span className={`ml-1 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold ${CONF_TONE[i.ai.confidence]}`}>{CONFIDENCE_LABELS[i.ai.confidence]}</span></> : (
                    <span className="inline-flex items-center gap-2 m-text-3">AI önerisi yok{aiAvailable && canEdit && <button type="button" className="m-btn m-btn-plain !min-h-[30px] !px-2" disabled={aiLoading} onClick={onAsk}>AI'ya sor</button>}</span>
                ), !!i.ai)}
                {i.model && radio('model', <>Model: <b className="m-tabular">{range(i.model.effort)}</b> <span className="text-[12px] m-text-3">· kapanma {num(i.model.p50Days)}–{num(i.model.p80Days)} iş günü</span></>)}
                {radio('manual', <span className="inline-flex flex-wrap items-center gap-1.5">Elle:
                    {(['best', 'likely', 'worst'] as (keyof EffortRange)[]).map(k => (
                        <DecimalInput key={k} aria-label={`${i.name} ${k === 'best' ? 'iyimser' : k === 'likely' ? 'olası' : 'kötümser'} efor`} className="m-input m-tabular !min-h-[32px] !w-[64px] !px-2 text-[14px]" disabled={!canEdit || !!i.excluded}
                            value={i.manual?.[k]} toValue={nonNegative} placeholder={k === 'best' ? 'iyi' : k === 'likely' ? 'olası' : 'kötü'} onValue={v => setManual(k, v)} />
                    ))} gün</span>)}
            </div>
            {c === 'manual' && i.manual && !(i.manual.best <= i.manual.likely && i.manual.likely <= i.manual.worst) && (
                <p className="m-0 text-[13px] m-ink-warn">İyimser ≤ olası ≤ kötümser olmalı; hesapta değerler sıraya dizilir ({range(effortOf(i)!)}).</p>
            )}
            {i.ai && (i.ai.flags.length > 0 || i.ai.rationale || i.ai.questionList?.length) && (
                <details>
                    <summary className="cursor-pointer text-[13px] font-semibold m-accent min-h-[30px] flex items-center">AI gerekçesi{i.ai.flags.length ? ` · ${i.ai.flags.length} uyarı` : ''}</summary>
                    <div className="flex flex-col gap-1 mt-1 text-[13px] m-text-2">
                        {i.ai.rationale && <p className="m-0">{i.ai.rationale}</p>}
                        {i.ai.questionList?.map(q => <p key={q} className="m-0">• {q}</p>)}
                        {i.ai.flags.map(f => <p key={f} className="m-0 m-ink-warn">⚠ {AI_FLAG_LABELS[f]}</p>)}
                    </div>
                </details>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[14px] m-text-2">
                    Önem
                    <select className="m-input !min-h-[36px] !w-auto" disabled={!canEdit || !!i.excluded} value={i.priority || ''} onChange={e => set({ priority: (e.target.value || undefined) as Task['priority'] | undefined })}>
                        <option value="">Öneri: {PRIORITY_META[priorityOf({ ...i, priority: undefined })].label}</option>
                        {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                    </select>
                </label>
                {typeOf(i) && <span className="text-[13px] m-text-3">Tür: {ISSUE_TYPE_LABELS[typeOf(i)!]}</span>}
                <span className="flex-1" />
                {canEdit && <button type="button" className="m-btn m-btn-plain !min-h-[36px]" onClick={() => set({ excluded: !i.excluded })}>{i.excluded ? 'Kapsama geri al' : 'Kapsam dışı bırak'}</button>}
            </div>
        </div>
    );
};

// ------------------------------------------------------------------ 4. simülasyon

type SimState = ReturnType<typeof useReleaseSimulation>;

const StepSimulation: React.FC<{ plan: ReleasePlan; project: Project; history: PlanningHistory; ctx: { people: Person[]; leaves: Leave[] }; visibleProjectIds: ReadonlySet<string>; sim: SimState; canEdit: boolean; update: Update }> = ({ plan, project, history, ctx, visibleProjectIds, sim, canEdit, update }) => {
    const [descope, setDescope] = useState<{ state: 'idle' | 'running' | 'none' } | { state: 'done'; removed: string[]; probability: number }>({ state: 'idle' });
    const r = sim.result;
    const s = sim.sim;
    const g = r ? groupOf(r, RELEASE_GROUP) : undefined;
    const dates = r && s ? releaseDates(r, s.built.start, plan.testDays) : null;
    const others = s ? s.built.tasks.filter(t => !t.id.startsWith('rp:')).length : 0;
    const names = new Map(plan.items.map(i => [i.id, i.name]));
    useEffect(() => { setDescope({ state: 'idle' }); }, [r]);

    const runDescope = async () => {
        if (!r || !s) return;
        setDescope({ state: 'running' });
        const res = await suggestDescope(plan, { result: r, built: s.built }, async ex => {
            // Ana simülasyonla aynı tekrar sayısı ve tohum: fark kapsamdan gelsin, rastlantıdan değil
            const b = buildReleaseSimulation(project, plan, history, ctx, { now: new Date(), iterations: s.built.input.iterations, seed: s.built.input.seed, extraExcluded: ex, visibleProjectIds });
            const out = await runSimulationAsync(b.built.input).catch(() => null);
            return out ? groupOf(out, RELEASE_GROUP)?.targetProbability ?? null : null;
        });
        setDescope(res ? { state: 'done', ...res } : { state: 'none' });
    };

    const shifted = g ? Float64Array.from(g.sorted, v => v + plan.testDays) : null;
    const summary = g ? { ...g.finish, p10: g.finish.p10 + plan.testDays, p50: g.finish.p50 + plan.testDays, p80: g.finish.p80 + plan.testDays, p95: g.finish.p95 + plan.testDays, mean: g.finish.mean + plan.testDays, min: g.finish.min + plan.testDays, max: g.finish.max + plan.testDays } : null;
    const markers: ChartMarker[] = summary && s ? [
        { key: 'p50', label: 'P50', offset: Math.ceil(summary.p50), tone: 'accent' },
        { key: 'p80', label: 'P80', offset: Math.ceil(summary.p80), tone: 'ok' },
        ...(plan.targetDate && g?.targetProbability !== null && g?.targetProbability !== undefined ? [{ key: 't', label: 'Hedef', offset: (s.built.input.groups![0].target ?? 0) + plan.testDays, tone: (g.targetProbability >= 0.8 ? 'ok' : 'bad') } as ChartMarker] : []),
    ] : [];
    const critical = g && s ? s.built.input.groups![0].tasks.map((ti, k) => ({ id: s.built.tasks[ti].id.slice(3), c: g.criticality[k] })).sort((a, b) => b.c - a.c).slice(0, 5) : [];

    return (
        <section className="m-surface rounded-2xl p-5 flex flex-col gap-4" aria-labelledby="rp-s4" style={{ opacity: sim.running ? 0.7 : 1 }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 id="rp-s4" className="m-0 text-[17px] font-semibold m-text">Simülasyon</h3>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Sürüm kayıtları, projedeki {others} açık kayıtla birlikte ekip kapasitesine binlerce kez yerleştirilir; mevcut sürümlerdeki işler önce gelir. Sona {plan.testDays} iş günü test eklenir.</p>
                </div>
                {sim.running && <span role="status" className="inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold m-tone-accent">Hesaplanıyor</span>}
            </div>
            {sim.error && <p role="alert" className="m-0 m-ink-bad">Simülasyon çalışmadı: {sim.error}</p>}
            {s && s.missing.length > 0 && <p className="m-0 text-[14px] m-ink-warn flex items-start gap-2"><Icon name="alert" size={16} />{s.missing.length} kaydın tahmini yok; simülasyona girmedi: {s.missing.map(id => names.get(id)).join(', ')}</p>}
            {dates && summary && shifted && s ? (
                <>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                        {[['P50', dates.p50, '%50 olasılıkla', false], ['P80', dates.p80, '%80 olasılıkla · taahhüt için', true], ['P95', dates.p95, '%95 olasılıkla', false]].map(([k, v, l, strong]) => (
                            <div key={k as string} className="rounded-xl p-3.5 flex flex-col gap-0.5" style={{ background: strong ? 'var(--m-accent-tint)' : 'var(--m-fill-2)' }}>
                                <span className="text-[13px] font-semibold m-text-2">{k as string}</span>
                                <span className="text-[22px] font-bold m-text m-tabular">{fmtDay(v as string)}</span>
                                <span className="text-[13px] m-text-3">{l as string}</span>
                            </div>
                        ))}
                    </div>
                    {dates.targetProbability !== null && (
                        <p className="m-0 text-[15px] m-text">Hedef tarihe ({fmtDay(plan.targetDate)}) yetişme olasılığı: <b className={probInk(dates.targetProbability)}>{pct(dates.targetProbability)}</b></p>
                    )}
                    <SimChart sorted={shifted} summary={summary} start={s.built.start} markers={markers} />
                    {dates.targetProbability !== null && dates.targetProbability < 0.8 && (
                        <div className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-2">
                            <span className="text-[15px] font-semibold m-text">Hedef %80 olasılıkla tutmuyor</span>
                            {descope.state === 'idle' && <div><button type="button" className="m-btn m-btn-gray" onClick={runDescope}>Kapsam önerisi hesapla</button></div>}
                            {descope.state === 'running' && <p className="m-0 text-[14px] m-text-2" role="status">Kayıtlar teker teker çıkarılarak yeniden simüle ediliyor…</p>}
                            {descope.state === 'none' && <p className="m-0 text-[14px] m-text-2">Engelleyiciler korunarak %80 olasılığa ulaşan bir kapsam bulunamadı. Hedef tarihi kaydırmayı ya da ekibe kişi eklemeyi düşünün.</p>}
                            {descope.state === 'done' && (
                                <>
                                    <p className="m-0 text-[14px] m-text-2">Şu {descope.removed.length} kayıt çıkarılırsa hedef <b className={probInk(descope.probability)}>{pct(descope.probability)}</b> olasılıkla tutuyor: {descope.removed.map(id => names.get(id)).join(', ')}.</p>
                                    {canEdit && <div><button type="button" className="m-btn m-btn-primary" onClick={() => update(p => ({ ...p, items: p.items.map(i => (descope.removed.includes(i.id) ? { ...i, excluded: true } : i)) }))}>Bu kayıtları kapsam dışı bırak</button></div>}
                                </>
                            )}
                        </div>
                    )}
                    {critical.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <span className="text-[13px] font-semibold m-text-2">Sürümün teslimini en çok belirleyen kayıtlar</span>
                            {critical.map((c, k) => { const sep = rowSep(k); return (
                                <div key={c.id} className={`flex items-center gap-3 py-1.5 text-[14px] ${sep.className}`} style={sep.style}>
                                    <span className="flex-1 min-w-0 truncate m-text">{names.get(c.id)}</span>
                                    <span className="m-tabular m-text-2">kritik yolda {pct(c.c)}</span>
                                </div>
                            ); })}
                        </div>
                    )}
                </>
            ) : !sim.running && !sim.error && <p className="m-0 text-[15px] m-text-2">Simüle edilecek, tahmini olan kayıt yok.</p>}
            <p className="m-0 text-[13px] m-text-3">Simülasyon başlangıcı {s ? fmtDay(s.built.start) : '—'}; tarihler iş günü takvimine göre, hafta sonları ve resmi tatiller düşülerek hesaplanır.</p>
        </section>
    );
};

// ------------------------------------------------------------------ 5. kilometre taşları

const StepMilestones: React.FC<{ plan: ReleasePlan; project: Project; sim: SimState; canEdit: boolean; update: Update }> = ({ plan, project, sim, canEdit, update }) => {
    const ai = useAiRun();
    const items = includedItems(plan);
    const names = new Map(items.map(i => [i.id, i.name]));
    const set = (ms: ReleaseMilestone[]) => update(p => ({ ...p, milestones: sanitizeMilestones(ms, p) }));
    const ms = useMemo(() => sanitizeMilestones(plan.milestones, plan, { keepEmpty: true }), [plan]);
    const r = sim.result;
    const s = sim.sim;
    const day = (offset: number) => (s ? fmtDay(toIsoDay(dateAtOffset(s.built.start, Math.max(1, Math.ceil(offset))))) : '—');
    const askAi = async () => {
        const out = await ai.run(EMBED_SYSTEM, milestonePrompt(plan, new Map(project.workPackages.map(w => [w.id, w.name]))), text => parseMilestones(text, plan));
        if (out) set(out);
    };
    const move = (itemId: string, to: string) => set(ms.map(m => ({ ...m, itemIds: m.id === to ? [...m.itemIds.filter(x => x !== itemId), itemId] : m.itemIds.filter(x => x !== itemId) })));

    return (
        <section className="m-surface rounded-2xl p-5 flex flex-col gap-3.5" aria-labelledby="rp-s5" style={{ opacity: sim.running ? 0.75 : 1 }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 id="rp-s5" className="m-0 text-[17px] font-semibold m-text">Kilometre taşları</h3>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Her taşın tarihi, içindeki kayıtların simülasyondaki bitişinden gelir (P50 · P80). Hedef tarih girerseniz tutma olasılığı hesaplanır.</p>
                </div>
                {canEdit && (
                    <div className="flex flex-wrap gap-2">
                        {ai.available && <button type="button" className="m-btn m-btn-gray" disabled={ai.loading || !items.length} onClick={askAi}><Icon name="sparkles" size={18} />{ai.loading ? 'AI çalışıyor…' : 'AI ile öner'}</button>}
                        <button type="button" className="m-btn m-btn-plain" onClick={() => set(autoMilestones(plan, project))}>İş paketine / önceliğe göre kur</button>
                        <button type="button" className="m-btn m-btn-plain" onClick={() => update(p => ({ ...p, milestones: [...p.milestones, { id: newId('ms'), name: `Kilometre taşı ${p.milestones.length + 1}`, itemIds: [] }] }))}><Icon name="plus" size={18} />Taş ekle</button>
                    </div>
                )}
            </div>
            {ai.error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{ai.error}</p>}
            <div className="flex flex-col gap-3">
                {ms.map((m, k) => {
                    const g = r ? groupOf(r, m.id) : undefined;
                    return (
                        <div key={m.id} className="rounded-xl p-3.5 flex flex-col gap-2.5 border m-sep" style={{ borderStyle: 'solid', borderWidth: 1 }}>
                            <div className="flex flex-wrap items-end gap-2.5">
                                <Field label={`Taş ${k + 1}`} htmlFor={`rp-ms-${m.id}`}>
                                    <input id={`rp-ms-${m.id}`} className="m-input" disabled={!canEdit} value={m.name} onChange={e => update(p => ({ ...p, milestones: p.milestones.map(x => (x.id === m.id ? { ...x, name: e.target.value } : x)) }))} />
                                </Field>
                                <Field label="Hedef tarih" htmlFor={`rp-mst-${m.id}`}>
                                    <input id={`rp-mst-${m.id}`} type="date" className="m-input" disabled={!canEdit} value={m.targetDate || ''} onChange={e => update(p => ({ ...p, milestones: p.milestones.map(x => (x.id === m.id ? { ...x, targetDate: e.target.value || undefined } : x)) }))} />
                                </Field>
                                <div className="flex flex-col gap-0.5 min-h-[44px] justify-center text-[14px]">
                                    {g && g.finish.max > 0 ? (
                                        <>
                                            <span className="m-text">P50 <b className="m-tabular">{day(g.finish.p50)}</b> · P80 <b className="m-tabular">{day(g.finish.p80)}</b></span>
                                            {g.targetProbability !== null && <span className={probInk(g.targetProbability)}>Hedefi tutma: {pct(g.targetProbability)}</span>}
                                        </>
                                    ) : <span className="m-text-3">{sim.running ? 'Hesaplanıyor…' : 'Tarih için kayıt gerekli'}</span>}
                                </div>
                                <span className="flex-1" />
                                {canEdit && ms.length > 1 && <button type="button" className="m-icon-btn" aria-label={`${m.name} taşını sil`} onClick={() => set(ms.filter(x => x.id !== m.id))}><Icon name="trash" size={16} /></button>}
                            </div>
                            {m.rationale && <p className="m-0 text-[13px] m-text-3">{m.rationale}</p>}
                            <div className="flex flex-col">
                                {m.itemIds.map((id, j) => { const sep = rowSep(j); return (
                                    <div key={id} className={`flex flex-wrap items-center gap-2 py-1.5 text-[14px] ${sep.className}`} style={sep.style}>
                                        <span className="flex-1 min-w-0 truncate m-text">{names.get(id)}</span>
                                        {canEdit && ms.length > 1 && (
                                            <select aria-label={`${names.get(id)} kilometre taşı`} className="m-input !min-h-[34px] !w-auto text-[13px]" value={m.id} onChange={e => move(id, e.target.value)}>
                                                {ms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                ); })}
                                {!m.itemIds.length && <span className="text-[14px] m-text-3">Kayıt yok — başka taştan taşıyın.</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

// ------------------------------------------------------------------ 6. aktarım

const StepCommit: React.FC<{ plan: ReleasePlan; project: Project; history: PlanningHistory; ctx: { people: Person[]; leaves: Leave[] }; sim: SimState; canEdit: boolean; onCommit: (r: CommitResult) => void }> = ({ plan, project, history, ctx, sim, canEdit, onCommit }) => {
    const model = useAssistantOptional()?.status?.model;
    const [committing, setCommitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // İki aşama: plan aktarılır, sonra aktarılan proje simüle edilip taban çizgisi kesinleşir
    const commit = async () => {
        if (!sim.sim || !sim.result) return;
        setCommitting(true);
        setError(null);
        try {
            const c = commitReleasePlan(project, plan, { built: sim.sim.built, result: sim.result }, { now: new Date(), model });
            const built = buildSimulation(c.project, history, ctx, { now: new Date(), scope: 'open', testDays: plan.testDays, iterations: BASELINE_ITERATIONS });
            built.input.groups = commitGroups(built, c);
            const r = await runSimulationAsync(built.input);
            onCommit(finalizeCommit(c, built, r));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setCommitting(false);
        }
    };
    const r = sim.result;
    const s = sim.sim;
    const preview = useMemo(() => (r && s ? commitReleasePlan(project, plan, { built: s.built, result: r }, { model }) : null), [r, s, project, plan, model]);
    const dates = r && s ? releaseDates(r, s.built.start, plan.testDays) : null;
    const versions = preview ? [...new Set<number>(preview.project.tasks.filter(t => preview.plan.baseline?.taskIds.includes(t.id)).map(t => t.version))].sort((a, b) => a - b) : [];
    const excluded = plan.items.filter(i => i.name.trim() && (i.excluded || !effortOf(i))).length;

    return (
        <section className="m-surface rounded-2xl p-5 flex flex-col gap-3.5" aria-labelledby="rp-s6">
            <h3 id="rp-s6" className="m-0 text-[17px] font-semibold m-text">Aktarım</h3>
            {!preview || !dates ? (
                <p className="m-0 text-[15px] m-text-2" role="status">{sim.running ? 'Son simülasyon hesaplanıyor…' : 'Aktarım için simülasyon sonucu gerekli; önceki adımlara dönün.'}</p>
            ) : (
                <>
                    <ul className="m-0 pl-5 flex flex-col gap-1.5 text-[15px] m-text">
                        <li><b>{preview.created}</b> yeni görev açılır{preview.updated ? `, havuzdaki ${preview.updated} görev güncellenir` : ''}{excluded ? `; ${excluded} kayıt kapsam dışı kalır (kararı günlüğe yazılır)` : ''}.</li>
                        {preview.skipped.length > 0 && <li className="m-ink-warn">Havuzdan alınan {preview.skipped.length} görev bu arada başka bir sürüme ya da hedefe bağlanmış veya kapanmış; aktarılmaz: {preview.skipped.map(x => `"${x.name}"`).join(', ')}.</li>}
                        <li>Görevler simülasyon takvimine göre {versions.length > 1 ? `sürüm ${versions[0]}–${versions[versions.length - 1]} arasına` : `sürüm ${versions[0] ?? '—'} içine`} yerleşir; termin, kilometre taşının hedef tarihi (yoksa P80'i) olur.</li>
                        {preview.plan.milestones.length > 0 && <li>"{`Sürüm: ${plan.name}`}" hedefi ve {preview.plan.milestones.length} anahtar sonuç (kilometre taşları) Hedefler ekranına eklenir.</li>}
                        <li>Taban çizgisi: P50 {fmtDay(dates.p50)}, P80 {fmtDay(dates.p80)}, P95 {fmtDay(dates.p95)}{dates.targetProbability !== null ? `; hedef olasılığı ${pct(dates.targetProbability)}` : ''}. Sonradan güncel tahminle karşılaştırılır.</li>
                    </ul>
                    {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">Aktarım tamamlanamadı: {error}</p>}
                    {canEdit ? (
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" className="m-btn m-btn-primary" disabled={sim.running || committing} onClick={commit}><Icon name="check" size={18} strokeWidth={2.4} />{committing ? 'Taban çizgisi hesaplanıyor…' : 'Planı aktar'}</button>
                            <span className="text-[13px] m-text-3">Taban çizgisi, kayıtlar sürüm takvimine yerleştikten sonra yeniden simüle edilerek kesinleşir.</span>
                        </div>
                    ) : <p className="m-0 text-[14px] m-text-3">Bu projeye plan aktarma yetkiniz yok.</p>}
                </>
            )}
        </section>
    );
};

export default ReleaseWizard;
