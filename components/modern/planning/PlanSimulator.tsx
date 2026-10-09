import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Leave, Person, Project, Task, TaskStatus } from '../../../types';
import { PlanningHistory, weeklyThroughput } from '../../../utils/planning/history';
import { probabilityBy, SimResult, simulateThroughput, ThroughputResult } from '../../../utils/planning/monteCarlo';
import { runSimulationAsync } from '../../../utils/planning/runSimulation';
import { BuiltSimulation, buildSimulation, dateAtOffset, DEFAULT_ITERATIONS, SimScope } from '../../../utils/planning/simulationInput';
import { Icon } from '../icons';
import { sprintLabel } from '../taskMeta';
import { Field, rowSep } from '../ui';
import SimChart, { ChartMarker } from './SimChart';

/**
 * Plan simülasyonu: projenin açık kayıtları ekip kapasitesiyle binlerce kez
 * çizelgelenir; teslim tarihi tek bir gün değil olasılık dağılımı olarak
 * verilir. Senaryolar: kapsam (sürüme kadar, kayıt çıkarma), hedef tarih,
 * test süresi, birim içinde serbest dağıtım ve ek kişi. İkinci yöntem
 * (geçmiş haftalık kapanış hızı) sonucu bağımsız olarak sınar.
 */

interface Props {
    project: Project;
    history: PlanningHistory;
    people: Person[];
    leaves: Leave[];
    visibleProjectIds: ReadonlySet<string>;
    onViewTask: (task: Task) => void;
}

interface Outcome {
    built: BuiltSimulation;
    result: SimResult;
    throughput: ThroughputResult | null;
    /** Bu sonucun hesaplandığı hedef tarih (girdi değişip yeni sonuç gelene kadar eskisi gösterilir) */
    target?: string;
}

const fmt = (start: string, offset: number) => dateAtOffset(start, offset).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
const pct = (v: number) => `%${Math.round(v * 100)}`;
const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
/** "Sürüm 1–3" (sürüme kadar, öncekiler dahil); özel adlı sürümün adı parantezde */
const scopeLabel = (v: number, names?: Record<number, string>) => {
    const custom = names?.[v]?.trim();
    return v === 1 ? sprintLabel(1, names) : `Sürüm 1–${v}${custom ? ` (${custom})` : ''}`;
};
const probInk = (p: number) => (p >= 0.8 ? 'm-ink-ok' : p >= 0.5 ? 'm-ink-warn' : 'm-ink-bad');

const PlanSimulator: React.FC<Props> = ({ project, history, people, leaves, visibleProjectIds, onViewTask }) => {
    const [scope, setScope] = useState<SimScope>('open');
    const [target, setTarget] = useState('');
    const [testDays, setTestDays] = useState(project.settings.globalTestDays ?? 4);
    const [pooling, setPooling] = useState<'unassigned' | 'unit'>('unassigned');
    const [extraUnit, setExtraUnit] = useState(project.resources[0]?.unit || '');
    const [extraCount, setExtraCount] = useState(0);
    const [iterations, setIterations] = useState(DEFAULT_ITERATIONS);
    const [excluded, setExcluded] = useState<string[]>([]);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const runId = useRef(0);

    const versions = useMemo<number[]>(() => [...new Set<number>(project.tasks.filter(t => t.status !== TaskStatus.Done && t.includeInSprints !== false && t.version > 0).map(t => t.version))].sort((a, b) => a - b), [project.tasks]);
    const units = useMemo<string[]>(() => [...new Set<string>(project.resources.map(r => (r.unit || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [project.resources]);
    const taskById = useMemo<Map<string, Task>>(() => new Map(project.tasks.map(t => [t.id, t])), [project.tasks]);
    // Seçimde görünen birim (ilk kişinin birimi boşsa ya da artık yoksa listedeki ilk birim)
    const extraUnitEff = units.includes(extraUnit) ? extraUnit : units[0] || '';

    useEffect(() => {
        const id = ++runId.current;
        const abort = new AbortController();
        setRunning(true);
        setError(null);
        const timer = setTimeout(() => {
            try {
                const now = new Date();
                const built = buildSimulation(project, history, { people, leaves }, {
                    now, scope, excluded, pooling, testDays, iterations, target: target || undefined, visibleProjectIds,
                    extraPeople: extraCount > 0 ? [{ unit: extraUnitEff, count: extraCount }] : [],
                });
                const weekly = weeklyThroughput(history.report, project.id, now);
                const throughput = weekly ? simulateThroughput(weekly, built.scopeCount, { iterations: built.input.iterations, seed: built.input.seed, testDays: built.input.testDays, targetOffset: built.input.targetOffset }) : null;
                if (!built.input.tasks.length) {
                    if (id === runId.current) { setOutcome(null); setRunning(false); }
                    return;
                }
                runSimulationAsync(built.input, abort.signal).then(result => {
                    if (id !== runId.current) return;
                    setOutcome({ built, result, throughput, target: target || undefined });
                    setRunning(false);
                }, e => {
                    if (id !== runId.current || abort.signal.aborted) return;
                    setError(e instanceof Error ? e.message : String(e));
                    setRunning(false);
                });
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setRunning(false);
            }
        }, 250);
        return () => { clearTimeout(timer); abort.abort(); };
    }, [project, history, people, leaves, visibleProjectIds, scope, excluded, pooling, testDays, iterations, target, extraUnitEff, extraCount]);

    const exclude = (id: string) => setExcluded(xs => (xs.includes(id) ? xs : [...xs, id]));
    const r = outcome?.result;
    const b = outcome?.built;
    const infoById = useMemo<Map<string, BuiltSimulation['tasks'][number]>>(() => new Map((b?.tasks || []).map(t => [t.id, t])), [b]);
    const markers: ChartMarker[] = r && b ? [
        { key: 'p50', label: 'P50', offset: Math.ceil(r.release.p50), tone: 'accent' },
        { key: 'p80', label: 'P80', offset: Math.ceil(r.release.p80), tone: 'ok' },
        ...(b.input.targetOffset !== undefined ? [{ key: 'target', label: 'Hedef', offset: b.input.targetOffset, tone: (r.targetProbability ?? 0) >= 0.8 ? 'ok' : 'bad' } as ChartMarker] : []),
    ] : [];
    const critical = r ? [...r.tasks].sort((x, y) => y.criticality - x.criticality || y.sensitivity - x.sensitivity).slice(0, 10) : [];
    const detProb = r ? probabilityBy(r, r.deterministic) : 0;
    const tp = outcome?.throughput;
    const disagree = r && tp ? Math.abs(tp.p80 - r.release.p80) / Math.max(1, r.release.p80) > 0.3 : false;

    return (
        <div className="flex flex-col gap-4">
            <section className="m-surface rounded-2xl p-5 flex flex-col gap-3.5" aria-labelledby="ps-title">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                        <h2 id="ps-title" className="m-0 text-[17px] font-semibold m-text">Plan simülasyonu</h2>
                        <p className="m-0 mt-0.5 text-[14px] m-text-3">Açık kayıtlar ekip kapasitesiyle {num(iterations)} kez çizelgelenir; ayar değişince yeniden hesaplanır.</p>
                    </div>
                    {running && <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full text-[13px] font-semibold m-tone-accent" role="status"><Icon name="refresh" size={14} />Hesaplanıyor</span>}
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Kapsam" htmlFor="ps-scope">
                        <select id="ps-scope" className="m-input" value={String(scope)} onChange={e => setScope(e.target.value === 'open' ? 'open' : Number(e.target.value))}>
                            <option value="open">Tüm açık kayıtlar</option>
                            {versions.map(v => <option key={v} value={v}>{scopeLabel(v, project.settings.sprintNames)}</option>)}
                        </select>
                    </Field>
                    <Field label="Hedef tarih" htmlFor="ps-target" hint="İsteğe bağlı">
                        <input id="ps-target" type="date" className="m-input" value={target} onChange={e => setTarget(e.target.value)} />
                    </Field>
                    <Field label="Test süresi (iş günü)" htmlFor="ps-test">
                        <input id="ps-test" type="number" min={0} max={60} className="m-input m-tabular" value={testDays} onChange={e => setTestDays(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} />
                    </Field>
                    <Field label="Tekrar sayısı" htmlFor="ps-iter">
                        <select id="ps-iter" className="m-input" value={iterations} onChange={e => setIterations(Number(e.target.value))}>
                            {[1000, 5000, 10000].map(n => <option key={n} value={n}>{num(n)}</option>)}
                        </select>
                    </Field>
                </div>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    <label className="flex items-center gap-2.5 min-h-[44px] text-[15px] m-text cursor-pointer">
                        <input type="checkbox" className="w-4 h-4" checked={pooling === 'unit'} onChange={e => setPooling(e.target.checked ? 'unit' : 'unassigned')} />
                        Birim içinde serbest dağıt
                    </label>
                    {units.length > 0 && (
                        <div className="flex flex-wrap items-end gap-2">
                            <Field label="Ek kişi" htmlFor="ps-extra-unit">
                                <select id="ps-extra-unit" className="m-input" value={extraUnitEff} onChange={e => setExtraUnit(e.target.value)}>
                                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </Field>
                            <div className="flex items-center gap-1 min-h-[44px]" role="group" aria-label="Ek kişi sayısı">
                                <button type="button" className="m-icon-btn text-[22px] leading-none" aria-label="Ek kişiyi azalt" disabled={extraCount === 0} onClick={() => setExtraCount(c => Math.max(0, c - 1))}>−</button>
                                <span className="w-8 text-center text-[17px] font-semibold m-tabular m-text" aria-live="polite">{extraCount}</span>
                                <button type="button" className="m-icon-btn" aria-label="Ek kişiyi artır" disabled={extraCount >= 5} onClick={() => setExtraCount(c => Math.min(5, c + 1))}><Icon name="plus" size={18} strokeWidth={2.2} /></button>
                            </div>
                        </div>
                    )}
                </div>
                {extraCount > 0 && pooling !== 'unit' && <p className="m-0 text-[13px] m-text-3">Ek kişi yalnız atanmamış kayıtları alır; atanmış işleri de paylaştırmak için "Birim içinde serbest dağıt"ı açın.</p>}
                {excluded.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] m-text-2">Kapsam dışı:</span>
                        {excluded.map(id => (
                            <button key={id} type="button" className="inline-flex items-center gap-1 h-8 px-3 rounded-full m-fill-2 text-[13px] m-text" onClick={() => setExcluded(xs => xs.filter(x => x !== id))} aria-label={`${taskById.get(id)?.name || id} kapsamına geri al`}>
                                {taskById.get(id)?.name || id}<Icon name="x" size={14} />
                            </button>
                        ))}
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setExcluded([])}>Tümünü geri al</button>
                    </div>
                )}
            </section>

            {error && <p role="alert" className="m-0 m-surface rounded-2xl p-4 m-ink-bad">Simülasyon çalışmadı: {error}</p>}

            {!r || !b ? (!running && !error && (
                <p className="m-0 m-surface rounded-2xl p-5 text-[15px] m-text-2">Kapsamda tahmini olan açık kayıt yok. Kayıtlara tahmin girin ya da kapsamı genişletin.</p>
            )) : (
                <>
                    <section className="m-surface rounded-2xl p-5 flex flex-col gap-4" aria-labelledby="ps-result" style={{ opacity: running ? 0.6 : 1 }}>
                        <h2 id="ps-result" className="m-0 text-[17px] font-semibold m-text">Teslim tarihi olasılıkları</h2>
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                            {[
                                { k: 'P50', label: '%50 olasılıkla', v: r.release.p50 },
                                { k: 'P80', label: '%80 olasılıkla · taahhüt için önerilen', v: r.release.p80, strong: true },
                                { k: 'P95', label: '%95 olasılıkla', v: r.release.p95 },
                            ].map(x => (
                                <div key={x.k} className="rounded-xl p-3.5 flex flex-col gap-0.5" style={{ background: x.strong ? 'var(--m-accent-tint)' : 'var(--m-fill-2)' }}>
                                    <span className="text-[13px] font-semibold m-text-2">{x.k}</span>
                                    <span className="text-[22px] font-bold m-text m-tabular">{fmt(b.start, Math.ceil(x.v))}</span>
                                    <span className="text-[13px] m-text-3">{x.label}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col gap-1.5 text-[15px]">
                            {r.targetProbability !== null && outcome?.target && (
                                <p className="m-0 m-text">Hedef tarihe ({new Date(`${outcome.target}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}) yetişme olasılığı: <b className={probInk(r.targetProbability)}>{pct(r.targetProbability)}</b></p>
                            )}
                            <p className="m-0 m-text-2">
                                Tek nokta plan (herkes tahmin ettiği sürede bitirirse) {fmt(b.start, r.deterministic)} diyor; bunun tutma olasılığı <b className={probInk(detProb)}>{pct(detProb)}</b>.
                            </p>
                            {tp && (
                                <p className="m-0 m-text-2">
                                    Geçmiş hız yöntemi (son {tp.weeks} haftada haftada ortalama {num(tp.perWeek)} kapanış, {b.scopeCount} kayıt): P50 {fmt(b.start, tp.p50)}, P80 {fmt(b.start, tp.p80)}.
                                    {disagree && <span className="m-ink-warn"> İki yöntem belirgin biçimde ayrışıyor: tahminler, ekip ya da iş karışımı geçmişten farklı olabilir.</span>}
                                </p>
                            )}
                        </div>
                        <SimChart sorted={r.sorted} summary={r.release} start={b.start} markers={markers} />
                    </section>

                    <section className="m-surface rounded-2xl p-5 flex flex-col gap-2" aria-labelledby="ps-crit">
                        <div>
                            <h2 id="ps-crit" className="m-0 text-[17px] font-semibold m-text">Teslimi belirleyen kayıtlar</h2>
                            <p className="m-0 mt-0.5 text-[14px] m-text-3">Kritik yol: tekrarların kaçında teslimi bu kaydın zinciri belirledi. Belirsizlik: kaydın süresi uzadıkça teslimin ne kadar kaydığı (korelasyon).</p>
                        </div>
                        <div className="relative overflow-x-auto -mx-1">
                            <table className="w-full min-w-[560px] text-[14px] border-collapse">
                                <thead>
                                    <tr className="text-left m-text-3 text-[13px]">
                                        <th className="font-semibold py-2 px-1">Kayıt</th>
                                        <th className="font-semibold py-2 px-1 text-right">Kritik yol</th>
                                        <th className="font-semibold py-2 px-1 text-right">Belirsizlik</th>
                                        <th className="font-semibold py-2 px-1 text-right">P80 bitiş</th>
                                        <th className="font-semibold py-2 px-1 text-right">Termin</th>
                                        <th className="py-2 px-1"><span className="sr-only">Eylem</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {critical.map((c, i) => {
                                        const info = infoById.get(c.id);
                                        const t = taskById.get(c.id);
                                        const s = rowSep(i);
                                        return (
                                            <tr key={c.id} className={s.className} style={s.style}>
                                                <td className="py-2 px-1 max-w-[260px]">
                                                    <button type="button" className="m-0 p-0 bg-transparent border-0 text-left cursor-pointer m-text font-semibold truncate max-w-full block" onClick={() => t && onViewTask(t)}>{info?.name || c.id}</button>
                                                    <span className="block text-[12px] m-text-3 truncate">{[info?.resource || 'Atanmamış', info?.unit, info?.source === 'reference' ? 'benzer kayıtlardan' : info?.source === 'default' ? 'varsayılan belirsizlik' : info?.calibrated ? 'kalibre' : ''].filter(Boolean).join(' · ')}</span>
                                                </td>
                                                <td className="py-2 px-1 text-right m-tabular">{pct(c.criticality)}</td>
                                                <td className="py-2 px-1 text-right m-tabular">{num(Math.max(0, c.sensitivity))}</td>
                                                <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">{fmt(b.start, Math.ceil(c.p80))}</td>
                                                <td className={`py-2 px-1 text-right m-tabular ${c.dueProbability !== null ? probInk(c.dueProbability) : 'm-text-3'}`}>{c.dueProbability !== null ? pct(c.dueProbability) : '—'}</td>
                                                <td className="py-2 px-1 text-right"><button type="button" className="m-btn m-btn-plain" onClick={() => exclude(c.id)}>Kapsam dışı</button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="m-surface rounded-2xl p-5 flex flex-col gap-2" aria-labelledby="ps-basis">
                        <h2 id="ps-basis" className="m-0 text-[17px] font-semibold m-text">Dayanak</h2>
                        <ul className="m-0 pl-0 list-none flex flex-col gap-1.5 text-[14px] m-text-2">
                            <li>{b.tasks.length} kayıt simüle edildi, {b.lanes.length} kişi şeridi; başlangıç {fmt(b.start, 1)}, tohum {r.seed} (aynı plan aynı sonucu verir).</li>
                            <li>
                                {b.medianRatio !== null
                                    ? `Geçmiş sapma uygulanan kayıt payı ${pct(b.calibratedShare)}: bu kayıtlarda gerçekleşen efor tahminin medyan ${num(b.medianRatio)} katı.`
                                    : 'Kalibrasyon için yeterli geçmiş yok; tahminler olduğu gibi kullanıldı.'}
                            </li>
                            {b.warnings.map(w => <li key={w.kind} className="flex items-start gap-2 m-ink-warn"><Icon name="alert" size={16} />{w.message}</li>)}
                        </ul>
                        <details>
                            <summary className="cursor-pointer text-[15px] font-semibold m-accent min-h-[36px] flex items-center">Nasıl hesaplanıyor?</summary>
                            <div className="text-[14px] m-text-2 flex flex-col gap-1.5 mt-1">
                                <p className="m-0">Her tekrarda her kaydın eforu tahmin aralığından (beta-PERT) çekilir ve bu birim ve türde geçmişte gerçekleşen ÷ tahmin oranlarından biriyle çarpılır. Tahmini olmayan kayıtlarda benzer kapanmış kayıtların gerçek eforları kullanılır.</p>
                                <p className="m-0">Kayıtlar öncelik ve sürüm sırasıyla, öncülleri bitmeden başlamayacak biçimde kişilere yerleştirilir. Kişi aynı anda bir iş yürütür; günlük kapasitesi katılım oranı, aylık planı ve izinleri kadardır. Atanmamış kayıtlar birimde en erken boşalan kişiye gider. Hafta sonları ve resmi tatiller düşülür; son kayıttan sonra test süresi eklenir.</p>
                                <p className="m-0">P80, tekrarların %80'inde teslimin o tarihte ya da önce gerçekleştiği gündür. Taahhüt için P80, iç hedef için P50 önerilir.</p>
                            </div>
                        </details>
                    </section>
                </>
            )}
        </div>
    );
};

export default PlanSimulator;
