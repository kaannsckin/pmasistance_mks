import React, { useDeferredValue, useMemo, useState } from 'react';
import { EstimateLogEntry, IssueType, Leave, Person, Project, Task, TaskStatus } from '../../../types';
import { EMBED_SYSTEM } from '../../../utils/ai/embedded';
import { AI_FLAG_LABELS, AiEstimate, ESTIMATE_PROMPT_VERSION, estimateSuggestionPrompt, finalizeEstimateSuggestion, parseEstimateSuggestion } from '../../../utils/ai/estimateSuggestion';
import { useAiRun } from '../../assistant/AiButton';
import { useAssistantOptional } from '../../assistant/AssistantContext';
import { PlanningHistory } from '../../../utils/planning/history';
import { ISSUE_TYPE_LABELS } from '../../../utils/planning/lifecycle';
import { EffortDist } from '../../../utils/planning/monteCarlo';
import { CONFIDENCE_LABELS, estimateFromHistory, RecordDraft, ReferenceEstimate } from '../../../utils/planning/referenceClass';
import { DEFAULT_SPREAD } from '../../../utils/planning/simulationInput';
import { FIT_TARGET, SprintFit, sprintFit } from '../../../utils/planning/sprintFit';
import { Icon } from '../icons';
import { PRIORITY_META, sprintLabel } from '../taskMeta';
import { Field, rowSep } from '../ui';

/**
 * Tekil yeni kayıt: kayıt formu gibi doldurulur; benzer kapanmış kayıtların
 * gerçek sürelerinden kapanma süresi, efor, önem ve tür önerilir ve kaydın
 * hangi sürüme hangi olasılıkla sığacağı hesaplanır. "Kayıtlara gönder" ile
 * görev listesine eklenir; verilen tahmin kayıtta saklanır ve kayıt
 * kapandığında isabeti ölçülür.
 *
 * AI önerisi (isteğe bağlı) aynı benzer kayıtları gerçek değerleriyle bağlam
 * alır; dayanakları doğrulanır, geçmiş dağılımla sınanır. Kör tahmin açıksa
 * öneriler kullanıcı kendi tahminini girene kadar gizlenir. Gönderirken
 * gösterilen öneriler, kör tahmin ve nihai karar öneri günlüğüne yazılır.
 */

interface Props {
    project: Project;
    history: PlanningHistory;
    people: Person[];
    leaves: Leave[];
    visibleProjectIds: ReadonlySet<string>;
    canEdit: boolean;
    /** Kör tahmin: öneriler kullanıcı kendi tahminini girdikten sonra görünür */
    blindEstimate: boolean;
    onAddTask: (task: Task, log: EstimateLogEntry) => void;
    onOpenList: () => void;
}

type Choice = 'suggested' | 'own' | 'calibrated' | 'ai';
const SOURCE_OF: Record<Choice, EstimateLogEntry['final']['source']> = { suggested: 'reference', own: 'user', calibrated: 'calibrated', ai: 'ai' };

interface AiRun {
    result: AiEstimate;
    key: string; // istendiği andaki taslak (değişirse öneri eskir)
    names: Map<string, string>; // dayanak kimliği → kayıt adı
}

const PRIORITIES: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const pct = (v: number) => `%${Math.round(v * 100)}`;
const dm = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const CONF_TONE: Record<ReferenceEstimate['confidence'], string> = { high: 'm-tone-ok', medium: 'm-tone-warn', low: 'm-tone-bad' };
const probTone = (p: number) => (p >= FIT_TARGET ? 'var(--m-ok)' : p >= 0.5 ? 'var(--m-warn)' : 'var(--m-bad)');

const NewRecordPlanner: React.FC<Props> = ({ project, history, people, leaves, visibleProjectIds, canEdit, blindEstimate, onAddTask, onOpenList }) => {
    const [name, setName] = useState('');
    const [notes, setNotes] = useState('');
    const [issueType, setIssueType] = useState<IssueType | ''>('');
    const [priority, setPriority] = useState<Task['priority'] | ''>('');
    const [resourceName, setResourceName] = useState('');
    const [unit, setUnit] = useState(project.resources[0]?.unit || '');
    const [workPackageId, setWorkPackageId] = useState('');
    const [ownText, setOwnText] = useState('');
    const [choice, setChoice] = useState<Choice | null>(null);
    const [version, setVersion] = useState<number | null>(null); // null = önerilen
    const [sent, setSent] = useState<Task | null>(null);
    const [touched, setTouched] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const [blind, setBlind] = useState<EstimateLogEntry['blind'] | null>(null);
    const [aiRun, setAiRun] = useState<AiRun | null>(null);
    const ai = useAiRun();
    const model = useAssistantOptional()?.status?.model;

    const units = useMemo<string[]>(() => [...new Set<string>([...project.resources.map(r => r.unit), ...project.tasks.map(t => t.unit)].map(u => (u || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [project]);
    const own = Number(ownText.replace(',', '.'));
    const ownDays = Number.isFinite(own) && own > 0 ? own : undefined;

    const draft = useMemo<RecordDraft>(() => ({
        name, notes, issueType: issueType || undefined, unit, priority: priority || undefined, workPackageId: workPackageId || undefined, projectId: project.id, ownEstimateDays: ownDays,
    }), [name, notes, issueType, unit, priority, workPackageId, project.id, ownDays]);
    const deferred = useDeferredValue(draft);
    const est = useMemo<ReferenceEstimate>(() => estimateFromHistory(deferred, history, { visibleProjectIds }), [deferred, history, visibleProjectIds]);

    const draftKey = JSON.stringify([name.trim(), notes.trim(), issueType, unit.trim()]);
    const aiEst = aiRun?.result ?? null;
    const aiStale = !!aiRun && aiRun.key !== draftKey;
    // Kör tahmin: gösterilecek bir öneri varsa, kullanıcı kendi tahminini verene kadar gizli
    const hasSuggestion = est.method !== 'none' || ai.available;
    const hidden = blindEstimate && !revealed && hasSuggestion;

    // Kayda yazılacak tahmin: kullanıcı seçmediyse kendi tahmini (varsa), yoksa geçmiş kayıtlardan öneri
    const effChoice: Choice | null = hidden ? (ownDays ? 'own' : null)
        : choice === 'ai' && aiEst ? 'ai'
        : choice === 'calibrated' && est.calibrated ? 'calibrated'
        : choice === 'suggested' && est.effort ? 'suggested'
        : choice === 'own' && ownDays ? 'own'
        : ownDays ? 'own' : est.effort ? 'suggested' : null;
    const time = effChoice === 'suggested' ? { best: est.effort!.best, avg: est.effort!.likely, worst: est.effort!.worst }
        : effChoice === 'ai' ? { best: aiEst!.effort.best, avg: aiEst!.effort.likely, worst: aiEst!.effort.worst }
        : effChoice === 'calibrated' ? { best: est.calibrated!.low, avg: est.calibrated!.likely, worst: est.calibrated!.high }
        : effChoice === 'own' ? { best: ownDays!, avg: ownDays!, worst: ownDays! } : null;
    const effort: { dist: EffortDist; calibration?: number[] } | null = effChoice === 'suggested' ? { dist: { kind: 'samples', values: est.effortSamples } }
        : effChoice === 'ai' ? { dist: { kind: 'pert', min: aiEst!.effort.best, mode: aiEst!.effort.likely, max: aiEst!.effort.worst } }
        : effChoice === 'calibrated' ? { dist: { kind: 'pert', min: est.calibrated!.low, mode: est.calibrated!.likely, max: est.calibrated!.high } }
        : effChoice === 'own' ? (est.calibration && !hidden ? { dist: { kind: 'fixed', value: ownDays! }, calibration: est.calibration.ratios } : { dist: { kind: 'pert', min: ownDays! * DEFAULT_SPREAD.low, mode: ownDays!, max: ownDays! * DEFAULT_SPREAD.high } })
        : null;

    // Örnekler her çizimde yeni dizi; sürüme sığma yalnız içerik değişince yeniden hesaplansın
    const effortKey = !effort ? '' : effort.dist.kind === 'samples'
        ? `s${effort.dist.values.length}:${effort.dist.values.reduce((a, b) => a + b, 0)}`
        : `${JSON.stringify(effort.dist)}|${effort.calibration?.length || 0}`;
    const fit = useMemo<SprintFit | null>(() => (unit.trim() && effort ? sprintFit(project, history, { unit, effort: effort.dist, calibration: effort.calibration }, { people, leaves, sprintName: v => sprintLabel(v, project.settings.sprintNames) }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [project, history, unit, effortKey, people, leaves]);
    const targetVersion = version ?? fit?.recommended ?? 0;

    const suggestedPriority = est.priority && est.priority.share >= 0.5 ? est.priority : null;
    const finalPriority: Task['priority'] = priority || (hidden ? 'Medium' : (effChoice === 'ai' && aiEst?.priority) || suggestedPriority?.value || 'Medium');
    const finalType: IssueType | undefined = issueType || (hidden ? undefined : (effChoice === 'ai' ? aiEst?.issueType : undefined) || est.issueType?.value);

    const reveal = () => {
        if (blindEstimate) setBlind(ownDays || priority ? { effortDays: ownDays, priority: priority || undefined } : null);
        setRevealed(true);
    };

    const askAi = async () => {
        const key = draftKey;
        const ref = est;
        const parsed = await ai.run(EMBED_SYSTEM, estimateSuggestionPrompt(draft, ref), parseEstimateSuggestion);
        if (!parsed) return;
        setAiRun({ result: finalizeEstimateSuggestion(parsed, ref), key, names: new Map(ref.context.map(m => [m.record.id, m.record.name])) });
    };

    const reset = () => {
        setName(''); setNotes(''); setIssueType(''); setPriority(''); setOwnText(''); setChoice(null); setVersion(null); setTouched(false);
        setRevealed(false); setBlind(null); setAiRun(null); ai.setError(null);
    };

    const send = () => {
        setTouched(true);
        if (!name.trim() || !canEdit) return;
        const now = new Date().toISOString();
        const task: Task = {
            id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            name: name.trim(),
            notes: notes.trim(),
            availability: true,
            priority: finalPriority,
            version: targetVersion,
            predecessor: null,
            unit: unit.trim(),
            resourceName,
            time: time || { best: 0, avg: 0, worst: 0 },
            jiraId: '',
            status: TaskStatus.ToDo,
            labels: [],
            includeInSprints: true,
            issueType: finalType,
            workPackageId: workPackageId || undefined,
            // Geçmişe dayanan tahminler (benzer kayıtlar, düzeltilmiş, AI) simülasyonda yeniden kalibre edilmez
            estimateSource: effChoice === 'own' ? 'user' : effChoice === 'ai' ? 'ai' : effChoice ? 'reference' : undefined,
            forecast: est.duration && est.method !== 'none' ? {
                at: now, method: est.method, n: est.n, confidence: est.confidence, p50Days: est.duration.p50, p80Days: est.duration.p80,
                effortDays: est.effort?.likely, accepted: effChoice === 'suggested' || effChoice === 'calibrated',
            } : undefined,
        };
        const log: EstimateLogEntry = {
            id: `est-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            at: now,
            projectId: project.id,
            taskId: task.id,
            draft: { name: task.name, issueType: issueType || undefined, unit: task.unit || undefined, hasNotes: !!task.notes },
            blind: blind || undefined,
            reference: est.method !== 'none' && est.effort && est.duration ? {
                method: est.method, n: est.n, confidence: est.confidence, p50Days: est.duration.p50, p80Days: est.duration.p80,
                effort: est.effort, priority: est.priority?.value, issueType: est.issueType?.value,
            } : undefined,
            ai: aiEst ? {
                promptVersion: ESTIMATE_PROMPT_VERSION, model, issueType: aiEst.issueType, priority: aiEst.priority, effort: aiEst.effort,
                confidence: aiEst.confidence, flags: aiEst.flags, evidence: aiEst.evidence, questions: aiEst.questions.length,
            } : undefined,
            final: {
                source: effChoice ? SOURCE_OF[effChoice] : 'none',
                priority: finalPriority,
                issueType: finalType,
                effort: time ? { best: time.best, likely: time.avg, worst: time.worst } : undefined,
                version: targetVersion,
            },
        };
        onAddTask(task, log);
        setSent(task);
        reset();
    };

    if (sent) {
        return (
            <section className="m-surface rounded-2xl p-6 flex flex-col items-start gap-3" aria-live="polite">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-full m-tone-ok"><Icon name="check" size={22} strokeWidth={2.4} /></span>
                <h2 className="m-0 text-[20px] font-bold m-text">Kayıt eklendi</h2>
                <p className="m-0 text-[15px] m-text-2">
                    "{sent.name}" {sent.version ? `${sprintLabel(sent.version, project.settings.sprintNames)} planına` : 'havuza'} eklendi
                    {sent.forecast ? `; tahmini kapanma süresi ${num(sent.forecast.p50Days)}–${num(sent.forecast.p80Days)} iş günü olarak kaydedildi` : ''}.
                </p>
                <div className="flex flex-wrap gap-2.5">
                    <button type="button" className="m-btn m-btn-gray" onClick={onOpenList}><Icon name="list" size={18} />Listede gör</button>
                    <button type="button" className="m-btn m-btn-primary" onClick={() => setSent(null)}><Icon name="plus" size={18} strokeWidth={2.2} />Yeni kayıt</button>
                </div>
            </section>
        );
    }

    const nameError = touched && !name.trim();
    const noHistory = history.records.length === 0;

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
            <section className="m-surface rounded-2xl p-5 flex flex-col gap-3.5" aria-labelledby="nr-title">
                <div>
                    <h2 id="nr-title" className="m-0 text-[17px] font-semibold m-text">Yeni kayıt</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Yazdıkça benzer kapanmış kayıtlar aranır ve öneri güncellenir.</p>
                </div>
                <Field label="Başlık" htmlFor="nr-name">
                    <input id="nr-name" className="m-input" value={name} aria-invalid={nameError} placeholder="Ör. Giriş ekranında oturum zaman aşımı hatası" onChange={e => setName(e.target.value)} />
                    {nameError && <span className="text-[13px] m-ink-bad">Başlık gerekli.</span>}
                </Field>
                <Field label="Açıklama" htmlFor="nr-notes" hint="Ne yapılacağı, kapsamı, bilinen kısıtlar; benzer kayıt eşleşmesini iyileştirir.">
                    <textarea id="nr-notes" className="m-input py-2.5" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
                </Field>
                <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field label="Kayıt türü" htmlFor="nr-type">
                        <select id="nr-type" className="m-input" value={issueType} onChange={e => setIssueType(e.target.value as IssueType | '')}>
                            <option value="">Seçilmedi</option>
                            {(Object.keys(ISSUE_TYPE_LABELS) as IssueType[]).map(k => <option key={k} value={k}>{ISSUE_TYPE_LABELS[k]}</option>)}
                        </select>
                    </Field>
                    <Field label="Önem (öncelik)" htmlFor="nr-priority">
                        <select id="nr-priority" className="m-input" value={priority} onChange={e => setPriority(e.target.value as Task['priority'] | '')}>
                            <option value="">Öneriye bırak</option>
                            {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                        </select>
                    </Field>
                    <Field label="Sorumlu" htmlFor="nr-owner">
                        <select id="nr-owner" className="m-input" value={resourceName} onChange={e => {
                            const r = project.resources.find(x => x.name === e.target.value);
                            setResourceName(e.target.value);
                            if (r?.unit) setUnit(r.unit);
                        }}>
                            <option value="">Atanmamış</option>
                            {project.resources.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Birim" htmlFor="nr-unit">
                        <input id="nr-unit" className="m-input" list="nr-units" value={unit} onChange={e => setUnit(e.target.value)} />
                        <datalist id="nr-units">{units.map(u => <option key={u} value={u} />)}</datalist>
                    </Field>
                    {project.workPackages.length > 0 && (
                        <Field label="İş paketi" htmlFor="nr-wp">
                            <select id="nr-wp" className="m-input" value={workPackageId} onChange={e => setWorkPackageId(e.target.value)}>
                                <option value="">Seçilmedi</option>
                                {project.workPackages.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </Field>
                    )}
                    <Field label="Kendi tahmininiz (gün)" htmlFor="nr-own" hint="İsteğe bağlı; öneriyle karşılaştırılır.">
                        <input id="nr-own" className="m-input m-tabular" inputMode="decimal" value={ownText} placeholder="Ör. 3" onChange={e => setOwnText(e.target.value)} />
                    </Field>
                </div>
            </section>

            <div className="flex flex-col gap-4 min-w-0">
                <section className="m-surface rounded-2xl p-5 flex flex-col gap-4" aria-labelledby="nr-sugg" aria-live="polite">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h2 id="nr-sugg" className="m-0 text-[17px] font-semibold m-text">Öneri</h2>
                            <p className="m-0 mt-0.5 text-[14px] m-text-3">{hidden ? 'Kör tahmin' : est.method === 'none' ? 'Geçmiş veri bekleniyor' : `${est.methodLabel} · ${est.n} kayıt`}</p>
                        </div>
                        {!hidden && est.method !== 'none' && <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${CONF_TONE[est.confidence]}`}>{CONFIDENCE_LABELS[est.confidence]}</span>}
                    </div>

                    {hidden ? (
                        <div className="flex flex-col gap-3">
                            <p className="m-0 text-[15px] m-text-2">
                                Önerileri görmeden önce kendi tahmininizi (gün) ve isterseniz önemini girin. Öneriler sizi yönlendirmez; zamanla sizin tahmininizin,
                                geçmiş kayıtların ve AI'nın hangisinin daha isabetli olduğu ölçülür.
                            </p>
                            <div className="flex flex-wrap items-center gap-2.5">
                                <button type="button" className="m-btn m-btn-gray" disabled={!ownDays} onClick={reveal}><Icon name="eye" size={18} />Önerileri göster</button>
                                <button type="button" className="m-btn m-btn-plain" onClick={reveal}>Tahminim yok, göster</button>
                            </div>
                        </div>
                    ) : noHistory || est.method === 'none' ? (
                        <p className="m-0 text-[15px] m-text-2">
                            Henüz eğitime uygun kapanmış kayıt yok ({history.records.length}). Jira CSV ile geçmiş kayıtları içe aktarın ya da kayıtlar kapandıkça
                            öneriler belirir. Bu sırada kendi tahmininizle sürüme sığma olasılığını görebilirsiniz.
                        </p>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-0.5">
                                    <span className="text-[13px] font-semibold m-text-2">Kapanma süresi</span>
                                    <span className="text-[24px] font-bold m-text m-tabular">{num(est.duration!.p50)}–{num(est.duration!.p80)} <span className="text-[15px] font-semibold m-text-2">iş günü</span></span>
                                    <span className="text-[13px] m-text-3">%50 ve %80 olasılıkla · %90: {num(est.duration!.p90)} gün</span>
                                </div>
                                <div className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-0.5">
                                    <span className="text-[13px] font-semibold m-text-2">Önerilen efor</span>
                                    <span className="text-[24px] font-bold m-text m-tabular">{num(est.effort!.likely)} <span className="text-[15px] font-semibold m-text-2">gün</span></span>
                                    <span className="text-[13px] m-text-3">İyimser {num(est.effort!.best)} · kötümser {num(est.effort!.worst)}</span>
                                </div>
                            </div>

                            {(suggestedPriority || est.issueType) && (
                                <div className="flex flex-col gap-2">
                                    {suggestedPriority && (
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                                            <span className="m-text-2">Önem önerisi: <b className={PRIORITY_META[suggestedPriority.value].ink}>{PRIORITY_META[suggestedPriority.value].label}</b> · benzer kayıtlarda {pct(suggestedPriority.share)}</span>
                                            {priority !== suggestedPriority.value && <button type="button" className="m-btn m-btn-plain" onClick={() => setPriority(suggestedPriority.value)}>Uygula</button>}
                                        </div>
                                    )}
                                    {est.issueType && !issueType && (
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                                            <span className="m-text-2">Tür önerisi: <b className="m-text">{ISSUE_TYPE_LABELS[est.issueType.value]}</b> · benzer kayıtlarda {pct(est.issueType.share)}</span>
                                            <button type="button" className="m-btn m-btn-plain" onClick={() => setIssueType(est.issueType!.value)}>Uygula</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {est.reasons.length > 0 && (
                                <ul className="m-0 pl-0 list-none flex flex-col gap-1">
                                    {est.reasons.map(r => <li key={r} className="flex items-start gap-2 text-[14px] m-ink-warn"><Icon name="alert" size={16} />{r}</li>)}
                                </ul>
                            )}

                            <details className="group">
                                <summary className="cursor-pointer text-[15px] font-semibold m-accent min-h-[36px] flex items-center">Dayanak kayıtlar ({est.matches.length})</summary>
                                <ul className="m-0 mt-1 pl-0 list-none">
                                    {est.matches.map((m, i) => {
                                        const s = rowSep(i);
                                        return (
                                            <li key={m.record.id} className={`flex items-center gap-3 py-2 text-[14px] ${s.className}`} style={s.style}>
                                                <span className="flex-1 min-w-0 truncate m-text">{m.visible ? m.record.name : 'Başka bir projedeki kayıt'}</span>
                                                <span className="m-text-3 whitespace-nowrap">{m.record.issueType ? ISSUE_TYPE_LABELS[m.record.issueType] : '—'}</span>
                                                <span className="m-text-2 m-tabular whitespace-nowrap">{num(m.record.days)} iş günü</span>
                                                {est.method === 'similar' && <span className="m-text-3 m-tabular whitespace-nowrap w-10 text-right">{pct(m.score)}</span>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </details>
                        </>
                    )}

                    {!hidden && ai.available && (
                        <div className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ background: 'var(--m-accent-tint)' }} aria-live="polite">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-2 text-[15px] font-semibold m-text"><Icon name="sparkles" size={18} />AI önerisi</span>
                                <div className="flex items-center gap-2">
                                    {aiEst && <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold ${CONF_TONE[aiEst.confidence]}`}>{CONFIDENCE_LABELS[aiEst.confidence]}</span>}
                                    <button type="button" className="m-btn m-btn-gray !min-h-[36px]" disabled={ai.loading || !name.trim()} onClick={askAi}>
                                        {ai.loading ? 'AI çalışıyor…' : aiEst ? 'Yenile' : 'AI önerisi al'}
                                    </button>
                                </div>
                            </div>
                            {!aiEst && !ai.loading && !ai.error && <p className="m-0 text-[14px] m-text-2">Benzer kapanmış kayıtlar gerçek süreleriyle AI'ya verilir; tür, önem, efor aralığı ve eksik bilgi soruları önerilir. Kayıt adları başka projelerden gönderilmez.</p>}
                            {ai.error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{ai.error}</p>}
                            {aiEst && (
                                <div className="flex flex-col gap-2 text-[15px]">
                                    {aiStale && <p className="m-0 text-[13px] m-ink-warn flex items-start gap-1.5"><Icon name="alert" size={15} />Kayıt değişti; öneri eski metne göre. Yenileyin.</p>}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="m-text-2">Efor: <b className="m-text m-tabular">{num(aiEst.effort.best)} · {num(aiEst.effort.likely)} · {num(aiEst.effort.worst)} gün</b></span>
                                    </div>
                                    {aiEst.priority && (
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="m-text-2">Önem: <b className={PRIORITY_META[aiEst.priority].ink}>{PRIORITY_META[aiEst.priority].label}</b></span>
                                            {priority !== aiEst.priority && <button type="button" className="m-btn m-btn-plain !min-h-[34px]" onClick={() => setPriority(aiEst.priority!)}>Uygula</button>}
                                        </div>
                                    )}
                                    {aiEst.issueType && (
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="m-text-2">Tür: <b className="m-text">{ISSUE_TYPE_LABELS[aiEst.issueType]}</b></span>
                                            {issueType !== aiEst.issueType && <button type="button" className="m-btn m-btn-plain !min-h-[34px]" onClick={() => setIssueType(aiEst.issueType!)}>Uygula</button>}
                                        </div>
                                    )}
                                    {(aiEst.effortRationale || aiEst.priorityRationale) && (
                                        <p className="m-0 text-[14px] m-text-2">{[aiEst.effortRationale, aiEst.priorityRationale].filter(Boolean).join(' ')}</p>
                                    )}
                                    {aiEst.evidence.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                                            <span className="m-text-3">Dayanak:</span>
                                            {aiEst.evidence.map(id => <span key={id} className="inline-flex items-center h-6 px-2 rounded-full m-surface m-text-2 max-w-[220px] truncate">{aiRun!.names.get(id) || id}</span>)}
                                        </div>
                                    )}
                                    {aiEst.questions.length > 0 && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[13px] font-semibold m-text-2">Netleştirilmesi gerekenler</span>
                                            <ul className="m-0 pl-5 text-[14px] m-text-2">{aiEst.questions.map(q => <li key={q}>{q}</li>)}</ul>
                                        </div>
                                    )}
                                    {aiEst.flags.length > 0 && (
                                        <ul className="m-0 pl-0 list-none flex flex-col gap-1">
                                            {aiEst.flags.map(f => <li key={f} className="flex items-start gap-2 text-[14px] m-ink-warn"><Icon name="alert" size={16} />{AI_FLAG_LABELS[f]}</li>)}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {!hidden && (est.effort || ownDays || aiEst) && (
                        <fieldset className="m-0 p-0 border-0 flex flex-col gap-2">
                            <legend className="p-0 mb-1 text-[13px] font-semibold m-text-2">Kayda yazılacak tahmin</legend>
                            {est.effort && (
                                <label className="flex items-start gap-2.5 text-[15px] cursor-pointer">
                                    <input type="radio" name="nr-choice" className="mt-1" checked={effChoice === 'suggested'} onChange={() => setChoice('suggested')} />
                                    <span className="m-text">Önerilen: {num(est.effort.best)} · {num(est.effort.likely)} · {num(est.effort.worst)} gün</span>
                                </label>
                            )}
                            {aiEst && (
                                <label className="flex items-start gap-2.5 text-[15px] cursor-pointer">
                                    <input type="radio" name="nr-choice" className="mt-1" checked={effChoice === 'ai'} onChange={() => setChoice('ai')} />
                                    <span className="m-text">AI önerisi: {num(aiEst.effort.best)} · {num(aiEst.effort.likely)} · {num(aiEst.effort.worst)} gün{aiEst.confidence === 'low' ? <span className="ml-1.5 text-[13px] m-ink-warn">(düşük güven)</span> : null}</span>
                                </label>
                            )}
                            {ownDays && (
                                <label className="flex items-start gap-2.5 text-[15px] cursor-pointer">
                                    <input type="radio" name="nr-choice" className="mt-1" checked={effChoice === 'own'} onChange={() => setChoice('own')} />
                                    <span className="m-text">Kendi tahminim: {num(ownDays)} gün</span>
                                </label>
                            )}
                            {est.calibrated && est.calibration && (
                                <label className="flex items-start gap-2.5 text-[15px] cursor-pointer">
                                    <input type="radio" name="nr-choice" className="mt-1" checked={effChoice === 'calibrated'} onChange={() => setChoice('calibrated')} />
                                    <span className="m-text">
                                        Geçmiş sapmaya göre düzeltilmiş: {num(est.calibrated.likely)} gün ({num(est.calibrated.low)}–{num(est.calibrated.high)})
                                        <span className="block text-[13px] m-text-3">Bu {est.calibration.label} için gerçekleşen efor tahminin medyan {num(est.calibration.median)} katı ({est.calibration.n} kayıt)</span>
                                    </span>
                                </label>
                            )}
                        </fieldset>
                    )}
                </section>

                <section className="m-surface rounded-2xl p-5 flex flex-col gap-3" aria-labelledby="nr-fit">
                    <div>
                        <h2 id="nr-fit" className="m-0 text-[17px] font-semibold m-text">Hangi sürüme sığar?</h2>
                        <p className="m-0 mt-0.5 text-[14px] m-text-3">Birimin kalan kapasitesi ile o sürümdeki açık işler ve bu kaydın eforu birlikte simüle edilir.</p>
                    </div>
                    {!unit.trim() || !effort ? (
                        <p className="m-0 text-[15px] m-text-2">{hidden ? 'Birim ve kendi tahmininiz gerekli (öneriler kör tahminden sonra açılır).' : 'Birim ve bir tahmin (öneri ya da kendi tahmininiz) gerekli.'}</p>
                    ) : !fit?.unitHasTeam ? (
                        <p className="m-0 text-[15px] m-text-2">Bu projede "{unit}" biriminde ekip yok; kayıt havuza eklenir.</p>
                    ) : (
                        <div role="radiogroup" aria-label="Hedef sürüm" className="flex flex-col">
                            {fit.rows.map((r, i) => {
                                const s = rowSep(i);
                                const selected = targetVersion === r.version;
                                return (
                                    <label key={r.version} className={`flex items-center gap-3 py-2.5 cursor-pointer ${s.className}`} style={s.style}>
                                        <input type="radio" name="nr-version" checked={selected} onChange={() => setVersion(r.version)} />
                                        <span className="flex-1 min-w-0 flex flex-col">
                                            <span className="text-[15px] font-semibold m-text">
                                                {r.label}{r.isNew ? ' (yeni)' : ''}
                                                {fit.recommended === r.version && <span className={`ml-2 inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold ${fit.recommendedRisky ? 'm-tone-warn' : 'm-tone-ok'}`}>Önerilen</span>}
                                            </span>
                                            <span className="text-[13px] m-text-3">{dm(r.start)} – {dm(r.end)} · kapasite {num(r.capacity)} gün · dolu {num(r.committed)} gün</span>
                                        </span>
                                        {r.probability !== null && (
                                            <span className="flex items-center gap-2 w-[120px] flex-none">
                                                <span className="flex-1 h-2 rounded-full m-fill-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.round(r.probability * 100)}%`, background: probTone(r.probability) }} /></span>
                                                <span className="text-[14px] font-semibold m-tabular w-10 text-right m-text">{pct(r.probability)}</span>
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                            <label className="flex items-center gap-3 py-2.5 cursor-pointer border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                <input type="radio" name="nr-version" checked={targetVersion === 0} onChange={() => setVersion(0)} />
                                <span className="text-[15px] m-text">Havuz (sürüme atama)</span>
                            </label>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button type="button" className="m-btn m-btn-primary" disabled={!canEdit} onClick={send}>
                            <Icon name="send" size={18} />Kayıtlara gönder
                        </button>
                        <button type="button" className="m-btn m-btn-plain" onClick={reset}>Temizle</button>
                        {!canEdit && <span className="text-[13px] m-text-3">Bu projeye kayıt ekleme yetkiniz yok.</span>}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default NewRecordPlanner;
