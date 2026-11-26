import React, { useMemo, useState } from 'react';
import { Leave, Person, Project, ReleasePlan, Task } from '../../../types';
import { calendarLabel, sprintCalendar } from '../../../utils/sprintCalendar';
import {
    DEFAULT_OPTIONS, optimizePlan, OptimizeOptions, OptimizeResult, PlanChange, PlanMetrics, rescueScenarios, Scenario, withoutFromMilestone,
} from '../../../utils/planning/planOptimizer';
import TaskKeyButton from '../TaskKeyButton';
import { sprintLabel } from '../taskMeta';
import { Icon } from '../icons';
import { SelectionStrip, Sheet, ToggleSwitch } from '../ui';

/**
 * Plan optimizasyonu penceresi: seçenekler değiştikçe plan yeniden hesaplanır;
 * önce/sonra metrikleri, taş tahminleri, gecikme varsa kurtarma seçenekleri ve
 * gerekçeli değişiklik listesi gösterilir. Hiçbir şey onaysız uygulanmaz.
 */

interface Props {
    project: Project;
    plan: ReleasePlan;
    people?: Person[];
    leaves?: Leave[];
    /** Geçmiş sapma çarpanı (görev başına); yoksa seçenek gösterilmez */
    calibrate?: (t: Task) => number | undefined;
    /** Ekip ortalaması (ör. 1,3): seçenek etiketinde gösterilir */
    calibrationHint?: number;
    onViewTask: (task: Task) => void;
    /** Değişiklikleri uygular; plan değişikliği (kapsam daraltma, yeni hedef) varsa onu da kaydeder */
    onApply: (changes: PlanChange[], label: string, plan?: ReleasePlan) => void;
    onClose: () => void;
}

const LOADS = [0.7, 0.8, 0.85, 0.9, 1];
const dm = (s?: string) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—');
const STATUS: Record<string, { label: string; tone: string }> = {
    ok: { label: 'Yolunda', tone: 'm-ink-ok' }, risk: { label: 'Riskli', tone: 'm-ink-warn' }, late: { label: 'Gecikiyor', tone: 'm-ink-bad' },
    unplanned: { label: 'Planlanmamış', tone: 'm-ink-warn' }, empty: { label: 'Görev yok', tone: 'm-text-3' },
};

const Metric: React.FC<{ label: string; before: string | number; after: string | number; better?: boolean; worse?: boolean }> = ({ label, before, after, better, worse }) => (
    <div className="rounded-xl m-fill-2 px-3 py-2">
        <dt className="text-[12px] m-text-3">{label}</dt>
        <dd className="m-0 text-[15px] m-tabular m-text">
            <span className="m-text-3">{before}</span> → <strong className={better ? 'm-ink-ok' : worse ? 'm-ink-bad' : ''}>{after}</strong>
        </dd>
    </div>
);

const MetricsRow: React.FC<{ before: PlanMetrics; after: PlanMetrics }> = ({ before, after }) => {
    // Önce planlanmamış iş varsa gecikme ve bitiş ölçülemez: karşılaştırma renklendirilmez
    const unknown = before.unplanned > 0;
    return (
        <>
            <dl className="m-0 grid gap-2 grid-cols-2 md:grid-cols-5">
                <Metric label="Geciken taş" before={unknown ? '—' : before.lateMilestones} after={after.lateMilestones} better={!unknown && after.lateMilestones < before.lateMilestones} worse={after.lateMilestones > 0 && (unknown || after.lateMilestones > before.lateMilestones)} />
                <Metric label="Toplam gecikme" before={unknown ? '—' : `${before.latenessDays} g`} after={`${after.latenessDays} g`} better={!unknown && after.latenessDays < before.latenessDays} worse={after.latenessDays > 0 && (unknown || after.latenessDays > before.latenessDays)} />
                <Metric label="Kapasite aşımı" before={before.overloads} after={after.overloads} better={after.overloads < before.overloads} worse={after.overloads > before.overloads} />
                <Metric label="Planlanmamış" before={before.unplanned} after={after.unplanned} better={after.unplanned < before.unplanned} />
                <Metric label="Sürüm bitişi" before={dm(before.endDate)} after={dm(after.endDate)} better={!unknown && !!after.endDate && !!before.endDate && after.endDate < before.endDate} worse={!unknown && !!after.endDate && !!before.endDate && after.endDate > before.endDate} />
            </dl>
            {unknown && <p className="m-0 text-[12px] m-text-3">Şu an {before.unplanned} görev sprintte değil; mevcut planın gecikmesi ve bitişi ölçülemiyor. Kırmızı değerler optimize planın hedeflere göre durumudur.</p>}
        </>
    );
};

const PlanOptimizerSheet: React.FC<Props> = ({ project, plan, people, leaves, calibrate, calibrationHint, onViewTask, onApply, onClose }) => {
    const [opts, setOpts] = useState<OptimizeOptions>({ ...DEFAULT_OPTIONS, useRemaining: !!project.settings.useJiraRemainingEstimate || DEFAULT_OPTIONS.useRemaining });
    const [useCalibration, setUseCalibration] = useState(false);
    const [scenarioId, setScenarioId] = useState<string | null>(null);
    const set = (patch: Partial<OptimizeOptions>) => { setOpts(o => ({ ...o, ...patch })); setScenarioId(null); };
    const names = project.settings.sprintNames;
    const cal = sprintCalendar(project.settings);

    const base = useMemo<OptimizeResult>(
        () => optimizePlan(project, plan, { ...opts, people, leaves, calibrate: useCalibration ? calibrate : undefined }),
        [project, plan, opts, people, leaves, calibrate, useCalibration],
    );
    const scenarios = useMemo<Scenario[]>(() => rescueScenarios(project, plan, base), [project, plan, base]);
    const scenario = scenarios.find(s => s.id === scenarioId) || null;
    const shown = scenario?.result || base;
    const byId = new Map<string, Task>(project.tasks.map(t => [t.id, t]));
    const msName = (id: string) => plan.milestones.find(m => m.id === id)?.name || '';

    const apply = () => {
        let nextPlan: ReleasePlan | undefined;
        if (scenario?.descope) nextPlan = withoutFromMilestone(plan, scenario.descope.milestoneId, scenario.descope.taskIds);
        if (scenario?.retarget) nextPlan = { ...plan, milestones: plan.milestones.map(m => (m.id === scenario.retarget!.milestoneId ? { ...m, targetDate: scenario.retarget!.date } : m)) };
        const label = scenario ? `"${plan.name}" planı: ${scenario.label}` : `"${plan.name}" optimize edildi (${shown.changes.length} değişiklik)`;
        onApply(shown.changes, label, nextPlan);
    };
    const nothing = !shown.changes.length && !scenario?.descope && !scenario?.retarget;

    return (
        <Sheet xl title="Planı optimize et" subtitle={`${calendarLabel(cal)} · ${shown.changes.length} değişiklik önerisi`} onClose={onClose}
            footer={<div className="ml-auto flex gap-2">
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={nothing} onClick={apply}>
                    {scenario ? 'Bu seçeneği uygula' : `Planı uygula (${shown.changes.length})`}
                </button>
            </div>}>
            {/* Seçenekler */}
            <section aria-label="Optimizasyon seçenekleri" className="rounded-xl m-fill-2 p-3 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center gap-3">
                    <SelectionStrip className="m-segmented" role="group" label="Kip" selection={opts.mode}>
                        <button type="button" className="m-segment" aria-pressed={opts.mode === 'stable'} onClick={() => set({ mode: 'stable' })}>Yalnız gerekeni değiştir</button>
                        <button type="button" className="m-segment" aria-pressed={opts.mode === 'fresh'} onClick={() => set({ mode: 'fresh' })}>Baştan dağıt</button>
                    </SelectionStrip>
                    <label className="flex items-center gap-2 text-[14px] m-text">
                        Hedef doluluk
                        <select className="m-input !w-auto !min-h-[36px]" value={opts.targetLoad} onChange={e => set({ targetLoad: Number(e.target.value) })}>
                            {[...new Set([...LOADS, opts.targetLoad, ...(base.velocity?.recommendedLoad ? [base.velocity.recommendedLoad] : [])])].sort((a, b) => a - b).map(l => <option key={l} value={l}>%{Math.round(l * 100)}{l === 1 ? ' (tampon yok)' : l === DEFAULT_OPTIONS.targetLoad ? ' (önerilen)' : ''}</option>)}
                        </select>
                    </label>
                </div>
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {([
                        ['split', 'Büyük işleri böl', 'Sprinte sığmayan işi ardışık sprintlere yayar (en çok 4).'],
                        ['reassign', 'Kişi değişikliğine izin ver', 'Aynı birimde, en az bir sprint erken bitirecek kişiye verir; atanmamış işe kişi önerir.'],
                        ['useRemaining', 'Jira kalan süresini kullan', 'Başlamış işlerin yükü Jira kalan süresinden.'],
                    ] as const).map(([k, label, hint]) => (
                        <div key={k} className="flex items-center justify-between gap-3 text-[14px] m-text">
                            <span className="flex flex-col"><span>{label}</span><span className="text-[12px] m-text-3">{hint}</span></span>
                            <ToggleSwitch label={label} checked={!!opts[k]} onChange={v => set({ [k]: v } as Partial<OptimizeOptions>)} />
                        </div>
                    ))}
                    {calibrate && (
                        <div className="flex items-center justify-between gap-3 text-[14px] m-text">
                            <span className="flex flex-col"><span>Geçmiş sapmaya göre düzelt</span>
                                <span className="text-[12px] m-text-3">Başlamamış işlerin eforu, benzer kapanmış işlerin gerçekleşen/tahmin oranıyla{calibrationHint ? ` (ekip ortalaması ×${calibrationHint.toLocaleString('tr-TR', { maximumFractionDigits: 2 })})` : ''}.</span></span>
                            <ToggleSwitch label="Geçmiş sapmaya göre düzelt" checked={useCalibration} onChange={v => { setUseCalibration(v); setScenarioId(null); }} />
                        </div>
                    )}
                </div>
            </section>

            {/* Hız kontrolü: plan, ekibin gerçekte bitirdiğinden belirgin fazlaysa */}
            {base.velocity && (
                base.velocity.recommendedLoad && opts.targetLoad > base.velocity.recommendedLoad ? (
                    <div role="status" className="rounded-xl p-3 flex flex-wrap items-center gap-3" style={{ background: 'var(--m-warn-tint, var(--m-fill-2))' }}>
                        <span className="flex-1 min-w-[240px] text-[14px] m-text">
                            <strong className="m-ink-warn">Plan geçmiş hızın üstünde.</strong> Plan sprint başına ~{base.velocity.planned.toLocaleString('tr-TR')} gün iş varsayıyor;
                            ekip son {base.velocity.sprints} sprintte ortalama {base.velocity.perSprint.toLocaleString('tr-TR')} gün bitirdi (tam kapasite {base.velocity.teamCapacity.toLocaleString('tr-TR')} gün).
                        </span>
                        <button type="button" className="m-btn m-btn-gray" onClick={() => set({ targetLoad: base.velocity!.recommendedLoad! })}>Hedef doluluğu %{Math.round(base.velocity.recommendedLoad * 100)} yap</button>
                    </div>
                ) : (
                    <p className="m-0 text-[13px] m-text-3">Ekip hızı: son {base.velocity.sprints} sprintte {base.velocity.perSprint.toLocaleString('tr-TR')} gün/sprint · plan varsayımı {base.velocity.planned.toLocaleString('tr-TR')} gün/sprint.</p>
                )
            )}

            {/* Önce / sonra */}
            <MetricsRow before={shown.before} after={shown.after} />

            {/* Kilometre taşları */}
            {shown.after.milestones.length > 0 && (
                <table className="w-full text-[14px] border-collapse">
                    <caption className="text-left text-[13px] font-semibold m-text-2 pb-1">Kilometre taşları</caption>
                    <thead><tr className="text-left text-[12px] m-text-3"><th className="py-1 font-medium">Taş</th><th className="font-medium">Hedef</th><th className="font-medium">Şimdi</th><th className="font-medium">Optimize</th><th className="font-medium">Durum</th></tr></thead>
                    <tbody>
                        {shown.after.milestones.map(m => {
                            const b = shown.before.milestones.find(x => x.id === m.id);
                            const target = scenario?.retarget?.milestoneId === m.id ? scenario.retarget.date : m.target;
                            const status = scenario?.retarget?.milestoneId === m.id ? 'ok' : m.status;
                            return (
                                <tr key={m.id} className="border-t m-sep">
                                    <td className="py-1.5 font-semibold m-text">{m.name}</td>
                                    <td className="m-tabular">{dm(target)}</td>
                                    <td className="m-tabular m-text-3">{dm(b?.forecast)}</td>
                                    <td className="m-tabular">{dm(m.forecast)}</td>
                                    <td className={`font-semibold ${STATUS[status]?.tone || ''}`}>{STATUS[status]?.label || status}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            {/* Kurtarma seçenekleri */}
            {scenarios.length > 0 && (
                <section aria-label="Kurtarma seçenekleri" className="flex flex-col gap-2">
                    <h3 className="m-0 text-[15px] font-semibold m-text">Gecikmeyi kapatmak için seçenekler</h3>
                    <p className="m-0 text-[13px] m-text-3">Her seçenek ayrı hesaplandı; yalnız gecikmeyi azaltanlar listelenir. Birini seçip önizleyin, sonra uygulayın.</p>
                    <div className="grid gap-2 md:grid-cols-2">
                        <button type="button" aria-pressed={!scenario} onClick={() => setScenarioId(null)}
                            className={`text-left rounded-xl p-3 border-2 ${!scenario ? 'border-[var(--m-accent)]' : 'm-sep'} m-surface`}>
                            <span className="block text-[14px] font-semibold m-text">Seçili ayarlarla plan</span>
                            <span className="block text-[12px] m-text-3">{base.after.lateMilestones} taş gecikiyor · {base.after.latenessDays} gün</span>
                        </button>
                        {scenarios.map(s => (
                            <button key={s.id} type="button" aria-pressed={scenario?.id === s.id} onClick={() => setScenarioId(s.id)}
                                className={`text-left rounded-xl p-3 border-2 ${scenario?.id === s.id ? 'border-[var(--m-accent)]' : 'm-sep'} m-surface`}>
                                <span className="block text-[14px] font-semibold m-text">{s.label}</span>
                                <span className="block text-[12px] m-text-2">{s.detail}</span>
                                <span className="block text-[12px] m-text-3 mt-1">
                                    {s.retarget ? 'Plan değişmez' : `${s.result.after.lateMilestones} taş gecikiyor · ${s.result.after.latenessDays} gün · ${s.result.changes.length} değişiklik`}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {shown.warnings.some(w => w.kind !== 'velocity') && (
                <ul className="m-0 pl-5 text-[13px] m-ink-warn" aria-label="Uyarılar">{shown.warnings.filter(w => w.kind !== 'velocity').map((w, i) => <li key={i}>{w.message}</li>)}</ul>
            )}

            {/* Değişiklikler */}
            {scenario?.descope && <p className="m-0 text-[14px] m-text">Taştan çıkarılacak: {scenario.descope.taskIds.map(id => byId.get(id)?.jiraId || byId.get(id)?.name).join(', ')} ({msName(scenario.descope.milestoneId)}). Görevler sürümde kalır.</p>}
            {shown.changes.length > 0 ? (
                <section aria-label="Değişiklikler">
                    <h3 className="m-0 text-[15px] font-semibold m-text pb-1">Değişiklikler ({shown.changes.length})</h3>
                    <ul className="m-0 p-0 list-none max-h-80 overflow-y-auto">
                        {shown.changes.map(c => {
                            const t = byId.get(c.taskId);
                            if (!t) return null;
                            return (
                                <li key={c.taskId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t m-sep py-1.5 text-[14px]">
                                    <TaskKeyButton task={t} onOpen={() => onViewTask(t)} />
                                    <span className="flex-1 min-w-[140px] truncate m-text">{t.name}</span>
                                    <span className="m-text-3 whitespace-nowrap">{sprintLabel(c.from, names)} → <strong className="m-text">{sprintLabel(c.to, names)}</strong>
                                        {c.toSpan !== undefined && c.toSpan > 1 ? ` (${c.toSpan} sprint)` : ''}</span>
                                    {c.toResource !== undefined && <span className="whitespace-nowrap m-ink-warn">{c.fromResource || 'Atanmamış'} → <strong>{c.toResource || 'Atanmamış'}</strong></span>}
                                    {c.reason && <span className="basis-full text-[12px] m-text-3 pl-1">{c.reason}</span>}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ) : !scenario?.retarget && <p className="m-0 text-[14px] m-text-2">Bu ayarlarla plan zaten en iyi durumda; değişiklik yok.</p>}

            <details className="text-[13px] m-text-3">
                <summary className="cursor-pointer">Nasıl hesaplanıyor?</summary>
                <ul className="m-0 mt-1 pl-5 flex flex-col gap-0.5">
                    <li>Kapasite: kişi katılımı × sprintin iş günleri (hafta sonu, resmi tatil ve izinler düşülür) × hedef doluluk. Bu sprintte yalnız bugünden sonraki günler sayılır.</li>
                    <li>Sıra: kilometre taşı (hedef tarih) → Blocker → kritik zincir (görev + en uzun ardıl zinciri) → öncelik → termin. Öncül bittiği sprintten sonra ardıl başlar.</li>
                    <li>Her iş kapasitesi yeten en erken sprinte konur. "Yalnız gerekeni değiştir" kipinde mevcut yeri uygunsa korunur; devam eden işler yerinde kalır.</li>
                    <li>Sürüm dışındaki açık işlerin yükü önce düşülür. Biten sprintlerde kalmış sürüm dışı işler sayılmaz (uyarılır).</li>
                    <li>Bu bir sezgisel yöntemdir: hızlı ve açıklanabilir, ama her durumda en iyi çözümü garanti etmez. Olasılıklı teslim tarihi için Plan simülasyonu sekmesini kullanın.</li>
                </ul>
            </details>
        </Sheet>
    );
};

export default PlanOptimizerSheet;
