import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EstimateGatePolicy, EvalRun, GoldenItem, IssueType, ModelEstimatePolicy, ModelEvalRun, ModelMetrics, Task, WorkspaceData } from '../../../types';
import { fetchAiStatus, streamChat } from '../../../utils/ai/client';
import { goldAnswer, goldenJsonl, goldPrompt } from '../../../utils/ai/estimateEval';
import { EMBED_SYSTEM } from '../../../utils/ai/embedded';
import { ESTIMATE_PROMPT_VERSION } from '../../../utils/ai/estimateSuggestion';
import { aiPolicyOf } from '../../../utils/ai/policy';
import { AiStatus } from '../../../utils/ai/protocol';
import { estimateLogCsv, estimateStats, SourceAccuracy } from '../../../utils/planning/estimateLog';
import {
    backtestRecord, backtestTargets, calibrationTrend, GATE_LABELS, gateStatus, GoldAiAnswer, goldCases, goldenCandidates, goldenFromRecord,
    RecordBacktestItem, ReleaseBacktestRow, releaseCases, scoreGoldRun, scoreReleaseCase, summarizeRecordBacktest, summarizeReleaseBacktest,
} from '../../../utils/planning/evaluation';
import { buildHistory, PlanningHistory } from '../../../utils/planning/history';
import { ISSUE_TYPE_LABELS } from '../../../utils/planning/lifecycle';
import { MIN_TRAIN, MODEL_VERSION } from '../../../utils/planning/ml/estimateModel';
import { evaluateModelAsync } from '../../../utils/planning/ml/runModel';
import { runSimulationAsync } from '../../../utils/planning/runSimulation';
import { dateAtOffset } from '../../../utils/planning/simulationInput';
import { toIsoDay } from '../../../utils/calendarRange';
import { Icon } from '../icons';
import { PRIORITY_META } from '../taskMeta';
import { Card, rowSep } from '../ui';
import { downloadFile } from '../weekly/shared';
import { Note, SwitchRow } from './controls';

/**
 * Yönetici konsolu › Tahmin kalitesi: geriye dönük testler (benzer kayıt
 * tahmini, sürüm simülasyonu), kalibrasyon kayması, altın set ve AI kalite
 * kapısı, öneri günlüğünün isabeti. AI değerlendirmesi konsolda asistandan
 * bağımsız, doğrudan AI sunucusuyla yapılır (kurum geneli AI açıksa).
 */

interface Props {
    workspace: WorkspaceData;
    onUpdateAiPolicy: (patch: { estimateGate?: Partial<EstimateGatePolicy>; modelEstimate?: ModelEstimatePolicy }, label: string) => void;
    onSetGolden: (items: GoldenItem[], label: string) => void;
    onAddEvalRun: (run: EvalRun) => void;
    onAddModelEval: (run: ModelEvalRun) => void;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `%${Math.round(v * 100)}`);
const gun = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} gün`);
const num = (v: number) => v.toLocaleString('tr-TR');
const fmtDay = (iso?: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
/** Kapsama ideal değere yakınsa iyi: ±0,1 içinde yeşil, ±0,2 içinde sarı */
const idealTone = (v: number | null, ideal: number) => (v === null ? 'm-text' : Math.abs(v - ideal) <= 0.1 ? 'm-ink-ok' : Math.abs(v - ideal) <= 0.2 ? 'm-ink-warn' : 'm-ink-bad');
const yield_ = () => new Promise<void>(r => setTimeout(r, 0));

const Tile: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({ label, value, hint, tone }) => (
    <div className="rounded-xl m-fill-2 px-3 py-2.5 flex flex-col">
        <span className="text-[12.5px] m-text-3">{label}</span>
        <span className={`text-[20px] font-bold m-tabular ${tone || 'm-text'}`}>{value}</span>
        {hint && <span className="text-[12px] m-text-3">{hint}</span>}
    </div>
);
const Advice: React.FC<{ items: string[] }> = ({ items }) => (
    <>{items.map(a => <p key={a} className="m-0 text-[14px] m-text-2 flex items-start gap-2"><span className="m-accent" style={{ marginTop: 2 }}><Icon name="info" size={16} /></span>{a}</p>)}</>
);

const ForecastQuality: React.FC<Props> = ({ workspace, onUpdateAiPolicy, onSetGolden, onAddEvalRun, onAddModelEval }) => {
    const history = useMemo(() => buildHistory(workspace.projects), [workspace.projects]);
    return (
        <div className="flex flex-col gap-4">
            <Note>
                Tahminler geleceği görmeden sınanır: her kayıt yalnız kendisinden önce kapanmış kayıtlarla tahmin edilir, her geçmiş sürüm başladığı günkü verilerle simüle edilir.
                Dürüst bir aralıkta gerçeklerin yaklaşık %50'si P50'nin, %80'i P80'in altında kalır. Eğitime uygun kapanmış kayıt: {history.records.length}.
            </Note>
            <RecordBacktest history={history} />
            <ReleaseBacktest workspace={workspace} history={history} />
            <CalibrationCard history={history} />
            <ModelCard workspace={workspace} history={history} onUpdateAiPolicy={onUpdateAiPolicy} onAddModelEval={onAddModelEval} />
            <GoldenGate workspace={workspace} history={history} onUpdateAiPolicy={onUpdateAiPolicy} onSetGolden={onSetGolden} onAddEvalRun={onAddEvalRun} />
            <EstimateMonitor workspace={workspace} history={history} />
        </div>
    );
};

// ------------------------------------------------------------------ benzer kayıt tahmini

const SAMPLE_SIZES = [100, 200, 500];

const RecordBacktest: React.FC<{ history: PlanningHistory }> = ({ history }) => {
    const [size, setSize] = useState(100);
    const [progress, setProgress] = useState<number | null>(null);
    const [result, setResult] = useState<ReturnType<typeof summarizeRecordBacktest> | null>(null);
    const cancel = useRef(false);
    useEffect(() => () => { cancel.current = true; }, []);
    const run = async () => {
        cancel.current = false;
        const targets = backtestTargets(history, size);
        const items: RecordBacktestItem[] = [];
        let skipped = 0;
        for (let i = 0; i < targets.length && !cancel.current; i++) {
            const it = backtestRecord(targets[i], history);
            if (it) items.push(it); else skipped++;
            if (i % 10 === 9) { setProgress((i + 1) / targets.length); await yield_(); }
        }
        setProgress(null);
        if (!cancel.current) setResult(summarizeRecordBacktest(items, skipped));
    };
    const r = result;
    return (
        <Card title="Benzer kayıt tahmini — geriye dönük test" subtitle="Her kayıt, kendisinden önce kapanmış kayıtlarla tahmin edilir ve gerçek kapanma süresi ve eforuyla karşılaştırılır.">
            <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Test edilecek kayıt sayısı" className="m-input !w-auto" value={size} onChange={e => setSize(Number(e.target.value))}>
                    {SAMPLE_SIZES.map(n => <option key={n} value={n}>Son {n} kayıt</option>)}
                </select>
                <button type="button" className="m-btn m-btn-gray" disabled={progress !== null || !history.records.length} onClick={run}><Icon name="refresh" size={18} />{progress !== null ? `Test ediliyor… ${pct(progress)}` : r ? 'Yeniden test et' : 'Testi çalıştır'}</button>
                {progress !== null && <button type="button" className="m-btn m-btn-plain" onClick={() => { cancel.current = true; }}>Durdur</button>}
            </div>
            {r && (
                <>
                    <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
                        <Tile label="Test edilen" value={String(r.n)} hint={r.skipped ? `${r.skipped} kayıtta yeterli geçmiş yok` : undefined} />
                        <Tile label="P50'nin altında" value={pct(r.coverage.p50)} hint="hedef ≈ %50" tone={idealTone(r.coverage.p50, 0.5)} />
                        <Tile label="P80'in altında" value={pct(r.coverage.p80)} hint="hedef ≈ %80" tone={idealTone(r.coverage.p80, 0.8)} />
                        <Tile label="P90'ın altında" value={pct(r.coverage.p90)} hint="hedef ≈ %90" tone={idealTone(r.coverage.p90, 0.9)} />
                    </div>
                    <p className="m-0 text-[13px] m-text-3">
                        Kapanma süresinde ortalama fark (P50): {gun(r.maeDays)} · efor: ortalama fark {gun(r.effort.mae)}, gerçek efor önerilen aralıkta {pct(r.effort.coverage)} (hedef ≈ %80)
                        {r.vsTeam.n ? ` · aynı ${r.vsTeam.n} kayıtta ekibin kendi tahmini ${gun(r.vsTeam.teamMae)}, geçmiş kayıt tahmini ${gun(r.vsTeam.referenceMae)} hata` : ''}
                    </p>
                    {r.groups.length > 0 && (
                        <div className="relative overflow-x-auto -mx-1">
                            <table className="w-full min-w-[420px] text-[14px] border-collapse">
                                <thead><tr className="text-left m-text-3 text-[13px]"><th className="font-semibold py-2 px-1">Birim · tür</th><th className="font-semibold py-2 px-1 text-right">Kayıt</th><th className="font-semibold py-2 px-1 text-right">P80'in altında</th><th className="font-semibold py-2 px-1 text-right">Ortalama fark</th></tr></thead>
                                <tbody>{r.groups.map((g, i) => { const sep = rowSep(i); return (
                                    <tr key={g.key} className={sep.className} style={sep.style}><td className="py-2 px-1 m-text">{g.label}</td><td className="py-2 px-1 text-right m-tabular">{g.n}</td><td className={`py-2 px-1 text-right m-tabular ${idealTone(g.p80, 0.8)}`}>{pct(g.p80)}</td><td className="py-2 px-1 text-right m-tabular">{gun(g.mae)}</td></tr>
                                ); })}</tbody>
                            </table>
                        </div>
                    )}
                    <Advice items={r.advice} />
                </>
            )}
        </Card>
    );
};

// ------------------------------------------------------------------ sürüm simülasyonu

const ReleaseBacktest: React.FC<{ workspace: WorkspaceData; history: PlanningHistory }> = ({ workspace, history }) => {
    const [rows, setRows] = useState<ReleaseBacktestRow[] | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const run = async () => {
        const cases = releaseCases(workspace.projects, history, { people: workspace.people, leaves: workspace.leaves || [] }, {
            sprintName: (p, v) => p.settings.sprintNames?.[v]?.trim() || `Sürüm ${v}`,
        });
        const out: ReleaseBacktestRow[] = [];
        setProgress({ done: 0, total: cases.length });
        for (let i = 0; i < cases.length; i++) {
            const r = await runSimulationAsync(cases[i].input).catch(() => null);
            if (r) out.push(scoreReleaseCase(cases[i], r));
            setProgress({ done: i + 1, total: cases.length });
        }
        setProgress(null);
        setRows(out);
    };
    const s = rows ? summarizeReleaseBacktest(rows) : null;
    const at = (start: string, k: number) => fmtDay(toIsoDay(dateAtOffset(start, k)));
    return (
        <Card title="Sürüm simülasyonu — geriye dönük test" subtitle="Tamamlanmış geçmiş sürümler, başladıkları gün bilinen tahminler ve o güne kadarki geçmişle simüle edilir; gerçek bitişle karşılaştırılır.">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="m-btn m-btn-gray" disabled={!!progress} onClick={run}><Icon name="refresh" size={18} />{progress ? `Simüle ediliyor… ${progress.done}/${progress.total}` : rows ? 'Yeniden çalıştır' : 'Testi çalıştır'}</button>
                <span className="text-[13px] m-text-3">Ekip bugünkü ekiptir; sürüm sırasında projede yürüyen başka işler hesaba katılmaz.</span>
            </div>
            {s && rows && (
                <>
                    <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
                        <Tile label="Tamamlanmış sürüm" value={String(s.n)} />
                        <Tile label="P80'e yetişildi" value={pct(s.hit80)} hint="hedef ≈ %80" tone={idealTone(s.hit80, 0.8)} />
                        <Tile label="P50'ye yetişildi" value={pct(s.hit50)} hint="hedef ≈ %50" tone={idealTone(s.hit50, 0.5)} />
                        <Tile label="Tek nokta plan tuttu" value={pct(s.hitDeterministic)} />
                    </div>
                    {rows.length > 0 && (
                        <div className="relative overflow-x-auto -mx-1">
                            <table className="w-full min-w-[620px] text-[14px] border-collapse">
                                <thead><tr className="text-left m-text-3 text-[13px]"><th className="font-semibold py-2 px-1">Proje · sürüm</th><th className="font-semibold py-2 px-1">Başlangıç</th><th className="font-semibold py-2 px-1">Gerçek bitiş</th><th className="font-semibold py-2 px-1">P50</th><th className="font-semibold py-2 px-1">P80</th><th className="font-semibold py-2 px-1 text-right">P80 tuttu</th></tr></thead>
                                <tbody>{rows.map((r, i) => { const sep = rowSep(i); return (
                                    <tr key={`${r.projectName}-${r.label}-${i}`} className={sep.className} style={sep.style}>
                                        <td className="py-2 px-1 m-text">{r.projectName} · {r.label} <span className="m-text-3 text-[12px]">({r.taskCount} kayıt)</span></td>
                                        <td className="py-2 px-1 m-tabular whitespace-nowrap">{fmtDay(r.start)}</td>
                                        <td className="py-2 px-1 m-tabular whitespace-nowrap">{fmtDay(r.actualEnd)}</td>
                                        <td className="py-2 px-1 m-tabular whitespace-nowrap">{at(r.start, r.p50)}</td>
                                        <td className="py-2 px-1 m-tabular whitespace-nowrap">{at(r.start, r.p80)}</td>
                                        <td className={`py-2 px-1 text-right font-semibold ${r.hit80 ? 'm-ink-ok' : 'm-ink-bad'}`}>{r.hit80 ? 'Evet' : 'Hayır'}</td>
                                    </tr>
                                ); })}</tbody>
                            </table>
                        </div>
                    )}
                    <Advice items={s.advice} />
                </>
            )}
        </Card>
    );
};

// ------------------------------------------------------------------ kalibrasyon

const CalibrationCard: React.FC<{ history: PlanningHistory }> = ({ history }) => {
    const rows = useMemo(() => calibrationTrend(history), [history]);
    return (
        <Card title="Kalibrasyon" subtitle="Birim ve türe göre gerçekleşen efor ÷ tahmin (1 = isabetli, 1,4 = %40 uzun). Son 90 gündeki kayma yeni tahminlerin düzeltilmesi gerektiğini gösterir.">
            {!rows.length ? <p className="m-0 text-[15px] m-text-2">Kalibrasyon için grup başına en az 8 tahminli kapanmış kayıt gerekir.</p> : (
                <div className="relative overflow-x-auto -mx-1">
                    <table className="w-full min-w-[520px] text-[14px] border-collapse">
                        <thead><tr className="text-left m-text-3 text-[13px]"><th className="font-semibold py-2 px-1">Birim · tür</th><th className="font-semibold py-2 px-1 text-right">Kayıt</th><th className="font-semibold py-2 px-1 text-right">Oran (P20–P80)</th><th className="font-semibold py-2 px-1 text-right">Son 90 gün</th><th className="font-semibold py-2 px-1 text-right">Kayma</th></tr></thead>
                        <tbody>{rows.map((r, i) => { const sep = rowSep(i); const d = r.drift; return (
                            <tr key={r.key} className={sep.className} style={sep.style}>
                                <td className="py-2 px-1 m-text">{r.label}</td>
                                <td className="py-2 px-1 text-right m-tabular">{r.n}</td>
                                <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">×{String(r.median).replace('.', ',')} <span className="m-text-3">({String(r.p20).replace('.', ',')}–{String(r.p80).replace('.', ',')})</span></td>
                                <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">{r.recentMedian === null ? <span className="m-text-3">{r.recentN} kayıt</span> : `×${String(r.recentMedian).replace('.', ',')} · ${r.recentN}`}</td>
                                <td className={`py-2 px-1 text-right m-tabular font-semibold ${d === null ? 'm-text-3' : Math.abs(d) >= 0.25 ? 'm-ink-bad' : Math.abs(d) >= 0.1 ? 'm-ink-warn' : 'm-ink-ok'}`}>{d === null ? '—' : `${d > 0 ? '↑' : d < 0 ? '↓' : ''} %${Math.abs(Math.round(d * 100))}`}</td>
                            </tr>
                        ); })}</tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};

// ------------------------------------------------------------------ altın set ve kalite kapısı

const PRIORITIES: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];
const RATIO_OPTIONS = [1, 1.1, 1.25, 1.5];
const ACC_OPTIONS = [0.5, 0.6, 0.7, 0.8];

/** Konsolda asistan kapalı: AI sunucusuyla doğrudan, tek seferlik tamamlama */
const completeDirect = async (status: AiStatus, prompt: string, signal: AbortSignal): Promise<string> => {
    const r = await streamChat({ system: EMBED_SYSTEM, messages: [{ role: 'user', content: prompt }] }, { authMode: status.authMode, signal });
    return r.text;
};

const GoldenGate: React.FC<Props & { history: PlanningHistory }> = ({ workspace, history, onUpdateAiPolicy, onSetGolden, onAddEvalRun }) => {
    const policy = aiPolicyOf(workspace);
    const gate = policy.estimateGate;
    const golden = workspace.goldenSet || [];
    const [status, setStatus] = useState<(AiStatus & { unreachable?: boolean }) | null>(null);
    const [query, setQuery] = useState('');
    const [picking, setPicking] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abort = useRef<AbortController | null>(null);
    useEffect(() => {
        const c = new AbortController();
        fetchAiStatus(c.signal).then(setStatus).catch(() => setStatus({ configured: false, authMode: 'none', unreachable: true }));
        return () => { c.abort(); abort.current?.abort(); };
    }, []);
    const byId = useMemo(() => new Map(history.records.map(r => [r.id, r])), [history]);
    const projectName = useMemo(() => new Map(workspace.projects.map(p => [p.id, p.name])), [workspace.projects]);
    const candidates = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr-TR');
        return goldenCandidates(history, golden).filter(r => !q || r.name.toLocaleLowerCase('tr-TR').includes(q)).slice(0, 40);
    }, [history, golden, query]);
    const g = gateStatus(workspace.evalRuns, ESTIMATE_PROMPT_VERSION, status?.model);
    const runs = [...(workspace.evalRuns || [])].reverse().slice(0, 8);
    const aiReady = policy.enabled && !!status?.configured;

    const setItem = (taskId: string, patch: Partial<GoldenItem>) => onSetGolden(golden.map(x => (x.taskId === taskId ? { ...x, ...patch } : x)), 'altın set kaydı düzeltildi');
    const evaluate = async (withAi: boolean) => {
        setError(null);
        const cases = goldCases(golden, history);
        const meta = { id: `eval-${Date.now().toString(36)}`, at: new Date().toISOString(), promptVersion: ESTIMATE_PROMPT_VERSION, model: withAi ? status?.model : undefined };
        if (!withAi) { onAddEvalRun(scoreGoldRun(cases, null, gate, meta)); return; }
        const c = new AbortController();
        abort.current = c;
        const answers = new Map<string, GoldAiAnswer>();
        setProgress({ done: 0, total: cases.length });
        for (let i = 0; i < cases.length && !c.signal.aborted; i++) {
            try {
                answers.set(cases[i].record.id, goldAnswer(await completeDirect(status!, goldPrompt(cases[i]), c.signal), cases[i]));
            } catch (e) {
                if (c.signal.aborted) break;
                // Tek kayıttaki hata değerlendirmeyi durdurmaz; yanıtsız kayıt AI ölçüsüne girmez
                setError(e instanceof Error ? e.message : String(e));
            }
            setProgress({ done: i + 1, total: cases.length });
        }
        setProgress(null);
        if (!c.signal.aborted) onAddEvalRun(scoreGoldRun(cases, answers, gate, meta));
    };
    const stamp = new Date().toISOString().slice(0, 10);

    return (
        <section aria-labelledby="fq-gold" className="m-surface rounded-2xl p-5 flex flex-col gap-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="fq-gold" className="m-0 text-[17px] font-semibold m-text">Altın set ve kalite kapısı</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Doğruluğu PY/PMO'ca onaylanmış kapanmış kayıtlar. AI tahmin önerisi bu kayıtlarda (her kayıt kendisi geçmişten çıkarılarak, önemi ve türü söylenmeden) ölçülür; istem ya da model değişince yeniden çalıştırın.</p>
                </div>
                <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${g.status === 'passed' ? 'm-tone-ok' : g.status === 'failed' ? 'm-tone-bad' : 'm-tone-warn'}`}>{GATE_LABELS[g.status]}</span>
            </div>

            <div className="flex flex-col -my-1">
                <SwitchRow index={0} label="Kalite kapısı zorunlu" hint={gate.enforce ? 'Son değerlendirme kapıdan geçmediyse planlama asistanında AI tahmin önerisi gösterilmez; geçmiş kayıt önerisi çalışır.' : 'Kapı yalnız izlenir; sonuç ne olursa olsun AI önerisi gösterilir.'} on={gate.enforce} onChange={on => onUpdateAiPolicy({ estimateGate: { enforce: on } }, `kalite kapısı ${on ? 'zorunlu' : 'izleme'}`)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">AI hatası en çok (geçmiş tahmine göre)
                    <select className="m-input" value={gate.maxMaeRatio} onChange={e => onUpdateAiPolicy({ estimateGate: { maxMaeRatio: Number(e.target.value) } }, `kapı: hata oranı ${e.target.value}`)}>
                        {RATIO_OPTIONS.map(v => <option key={v} value={v}>×{String(v).replace('.', ',')}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">Önem doğruluğu en az
                    <select className="m-input" value={gate.minPriorityAccuracy} onChange={e => onUpdateAiPolicy({ estimateGate: { minPriorityAccuracy: Number(e.target.value) } }, `kapı: önem doğruluğu ${e.target.value}`)}>
                        {ACC_OPTIONS.map(v => <option key={v} value={v}>{pct(v)}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">Gerçek efor aralıkta en az
                    <select className="m-input" value={gate.minCoverage} onChange={e => onUpdateAiPolicy({ estimateGate: { minCoverage: Number(e.target.value) } }, `kapı: kapsama ${e.target.value}`)}>
                        {ACC_OPTIONS.map(v => <option key={v} value={v}>{pct(v)}</option>)}
                    </select>
                </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold m-text">Altın set: {golden.length} kayıt</span>
                <span className="flex-1" />
                <button type="button" className="m-btn m-btn-plain" aria-expanded={picking} onClick={() => setPicking(v => !v)}><Icon name="plus" size={18} />Kayıt ekle</button>
                <button type="button" className="m-btn m-btn-plain" disabled={!golden.length} onClick={() => downloadFile(`altin-set-${stamp}.jsonl`, goldenJsonl(goldCases(golden, history)), 'application/jsonl')}><Icon name="download" size={18} />JSONL</button>
            </div>
            {picking && (
                <div className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-2">
                    <input aria-label="Kapanmış kayıt ara" className="m-input" placeholder="Kayıt adına göre ara" value={query} onChange={e => setQuery(e.target.value)} />
                    <div className="flex flex-col max-h-[280px] overflow-y-auto">
                        {candidates.map(r => (
                            <div key={r.id} className="flex items-center gap-2.5 min-h-[40px] text-[14px]">
                                <span className="flex-1 min-w-0 truncate m-text">{r.name}</span>
                                <span className="m-text-3 whitespace-nowrap">{projectName.get(r.projectId)} · {r.issueType ? ISSUE_TYPE_LABELS[r.issueType] : 'türsüz'} · {PRIORITY_META[r.priority].label}</span>
                                <button type="button" className="m-btn m-btn-plain !min-h-[32px] !px-2" onClick={() => onSetGolden([...golden, goldenFromRecord(r)], 'altın sete kayıt eklendi')}>Ekle</button>
                            </div>
                        ))}
                        {!candidates.length && <span className="text-[14px] m-text-3">Eklenebilecek kayıt yok.</span>}
                    </div>
                </div>
            )}
            {golden.length > 0 && (
                <details>
                    <summary className="cursor-pointer text-[14px] font-semibold m-accent min-h-[34px] flex items-center">Kayıtları ve doğru değerleri gör</summary>
                    <div className="flex flex-col mt-1">
                        {golden.map((x, i) => { const r = byId.get(x.taskId); const sep = rowSep(i); return (
                            <div key={x.taskId} className={`flex flex-wrap items-center gap-2 py-1.5 text-[14px] ${sep.className}`} style={sep.style}>
                                <span className="flex-1 min-w-[180px] truncate m-text">{r ? r.name : <span className="m-text-3">Artık eğitime uygun değil</span>}</span>
                                <select aria-label="Doğru önem" className="m-input !min-h-[34px] !w-auto text-[13px]" value={x.priority} onChange={e => setItem(x.taskId, { priority: e.target.value as Task['priority'] })}>
                                    {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                                </select>
                                <select aria-label="Doğru tür" className="m-input !min-h-[34px] !w-auto text-[13px]" value={x.issueType || ''} onChange={e => setItem(x.taskId, { issueType: (e.target.value || undefined) as IssueType | undefined })}>
                                    <option value="">Tür yok</option>
                                    {(Object.keys(ISSUE_TYPE_LABELS) as IssueType[]).map(t => <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>)}
                                </select>
                                <button type="button" className="m-icon-btn" aria-label="Altın setten çıkar" onClick={() => onSetGolden(golden.filter(y => y.taskId !== x.taskId), 'altın setten kayıt çıkarıldı')}><Icon name="x" size={16} /></button>
                            </div>
                        ); })}
                    </div>
                </details>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="m-btn m-btn-gray" disabled={!golden.length || !!progress} onClick={() => evaluate(false)}>Geçmiş kayıt tahminini ölç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!golden.length || !!progress || !aiReady} onClick={() => evaluate(true)}><Icon name="sparkles" size={18} />{progress ? `AI değerlendiriyor… ${progress.done}/${progress.total}` : 'AI ile değerlendir'}</button>
                {progress && <button type="button" className="m-btn m-btn-plain" onClick={() => abort.current?.abort()}>Durdur</button>}
                {!aiReady && <span className="text-[13px] m-text-3">{!policy.enabled ? 'Kurum genelinde AI kapalı.' : status?.unreachable ? 'AI sunucusuna ulaşılamadı.' : status ? 'AI sunucusu yapılandırılmamış.' : 'AI sunucusu denetleniyor…'}</span>}
                {status?.model && <span className="text-[13px] m-text-3">Model: {status.model} · istem: {ESTIMATE_PROMPT_VERSION}</span>}
            </div>
            {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">Bazı kayıtlarda AI yanıt vermedi: {error}</p>}

            {runs.length > 0 && (
                <div className="relative overflow-x-auto -mx-1">
                    <table className="w-full min-w-[720px] text-[14px] border-collapse">
                        <thead><tr className="text-left m-text-3 text-[13px]">
                            <th className="font-semibold py-2 px-1">Değerlendirme</th><th className="font-semibold py-2 px-1 text-right">Kayıt</th>
                            <th className="font-semibold py-2 px-1 text-right">Geçmiş: hata · aralık</th><th className="font-semibold py-2 px-1 text-right">AI: hata · aralık</th>
                            <th className="font-semibold py-2 px-1 text-right">AI önem · tür</th><th className="font-semibold py-2 px-1 text-right">Sonuç</th>
                        </tr></thead>
                        <tbody>{runs.map((r, i) => { const sep = rowSep(i); return (
                            <tr key={r.id} className={sep.className} style={sep.style} title={r.reasons.join(' ')}>
                                <td className="py-2 px-1 m-text whitespace-nowrap">{new Date(r.at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} <span className="m-text-3 text-[12px]">{r.promptVersion}{r.model ? ` · ${r.model}` : ''}</span></td>
                                <td className="py-2 px-1 text-right m-tabular">{r.ai ? `${r.ai.n}/${r.n}` : r.n}</td>
                                <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">{gun(r.reference.mae)} · {pct(r.reference.coverage)}</td>
                                <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">{r.ai ? `${gun(r.ai.mae)} · ${pct(r.ai.coverage)}` : '—'}</td>
                                <td className="py-2 px-1 text-right m-tabular whitespace-nowrap">{r.ai ? `${pct(r.ai.priorityAccuracy)} · ${pct(r.ai.typeAccuracy)}` : '—'}</td>
                                <td className={`py-2 px-1 text-right font-semibold whitespace-nowrap ${r.passed === true ? 'm-ink-ok' : r.passed === false ? 'm-ink-bad' : 'm-text-3'}`}>{r.passed === true ? 'Geçti' : r.passed === false ? 'Geçmedi' : r.ai ? 'Yetersiz' : 'Yalnız geçmiş'}</td>
                            </tr>
                        ); })}</tbody>
                    </table>
                </div>
            )}
            {g.run && g.run.reasons.length > 0 && <Advice items={g.run.reasons} />}
        </section>
    );
};

// ------------------------------------------------------------------ klasik ML modeli

const MODEL_POLICIES: { value: ModelEstimatePolicy; label: string }[] = [
    { value: 'auto', label: 'Otomatik: sınamada geçmiş kayıt tahmininden isabetliyse' },
    { value: 'on', label: 'Her zaman göster' },
    { value: 'off', label: 'Kapalı' },
];
const METRIC_ROWS: { key: keyof ModelMetrics; label: string; fmt: (v: number | null) => string; hint?: string }[] = [
    { key: 'mae', label: 'Efor hatası (olası değer)', fmt: gun },
    { key: 'coverage', label: 'Gerçek efor aralıkta', fmt: pct, hint: 'hedef ≈ %80' },
    { key: 'daysMae', label: 'Kapanma süresi hatası (P50)', fmt: v => (v === null ? '—' : `${String(v).replace('.', ',')} iş günü`) },
    { key: 'p80Coverage', label: "Kapanma P80'e yetişti", fmt: pct, hint: 'hedef ≈ %80' },
    { key: 'priorityAccuracy', label: 'Önem doğruluğu', fmt: pct },
    { key: 'typeAccuracy', label: 'Tür doğruluğu', fmt: pct },
];

const ModelCard: React.FC<{ workspace: WorkspaceData; history: PlanningHistory } & Pick<Props, 'onUpdateAiPolicy' | 'onAddModelEval'>> = ({ workspace, history, onUpdateAiPolicy, onAddModelEval }) => {
    const policy = aiPolicyOf(workspace).modelEstimate;
    const runs = (workspace.modelEvals || []).filter(r => r.version === MODEL_VERSION);
    const last = runs[runs.length - 1];
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abort = useRef<AbortController | null>(null);
    useEffect(() => () => abort.current?.abort(), []);
    const run = async () => {
        setBusy(true); setError(null);
        const c = new AbortController();
        abort.current = c;
        try {
            onAddModelEval(await evaluateModelAsync(history.records, `ml-${Date.now().toString(36)}`, c.signal));
        } catch (e) {
            if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };
    // Gösterildiği durumlar: ekip tahmini olmadan ve/veya ekibin kendi tahmini girildiğinde
    const shown = last ? [last.better && 'ekip tahmini olmadan', last.withEstimate.better && 'ekibin kendi tahmini girildiğinde'].filter((x): x is string => !!x) : [];
    // Karar verilebilen durumlar (veri yoksa o durum sayılmaz)
    const decided = last ? [last.better, last.withEstimate.better].filter(v => v !== null) : [];
    const status = !last ? { label: 'Sınanmadı', tone: 'm-tone-warn' }
        : !decided.length ? { label: 'Veri yetersiz', tone: 'm-tone-warn' }
        : shown.length === decided.length ? { label: 'Geçmiş kayıt tahmininden isabetli', tone: 'm-tone-ok' }
        : shown.length ? { label: 'Kısmen isabetli', tone: 'm-tone-warn' }
        : { label: 'Henüz daha isabetli değil', tone: 'm-tone-bad' };
    const fmtAt = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return (
        <section aria-labelledby="fq-ml" className="m-surface rounded-2xl p-5 flex flex-col gap-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="fq-ml" className="m-0 text-[17px] font-semibold m-text">Makine öğrenmesi modeli</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Gradyan artırmalı karar ağaçları (efor, kapanma süresi) ve lojistik regresyon (önem, tür). Tür, birim, proje, önem, iş paketi, ekibin ilk tahmini ve metindeki sık sözcüklerden öğrenir; kişi adı kullanılmaz. Tarayıcıda eğitilir, kayıtlar dışarı gönderilmez.</p>
                </div>
                <span className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${status.tone}`}>{status.label}</span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2 min-w-[260px] flex-1 max-w-[460px]">Planlamada model önerisi
                    <select className="m-input" value={policy} onChange={e => onUpdateAiPolicy({ modelEstimate: e.target.value as ModelEstimatePolicy }, `model önerisi: ${MODEL_POLICIES.find(p => p.value === e.target.value)?.label}`)}>
                        {MODEL_POLICIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </label>
                <button type="button" className="m-btn m-btn-gray" disabled={busy || history.records.length < MIN_TRAIN} onClick={run}><Icon name="refresh" size={18} />{busy ? 'Eğitiliyor ve sınanıyor…' : last ? 'Yeniden eğit ve sına' : 'Eğit ve sına'}</button>
                {busy && <button type="button" className="m-btn m-btn-plain" onClick={() => abort.current?.abort()}>Durdur</button>}
            </div>
            {history.records.length < MIN_TRAIN && <p className="m-0 text-[14px] m-text-2">Model için en az {MIN_TRAIN} eğitime uygun kapanmış kayıt gerekir (şu an {history.records.length}). Jira'dan kayıt geçmişi aktarılabilir.</p>}
            {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{error}</p>}
            {last && (
                <>
                    <p className="m-0 text-[13px] m-text-3">Son sınama {fmtAt(last.at)}: model {num(last.nTrain)} kayıtla eğitildi (kapanışı {fmtDay(last.cutoff.slice(0, 10))} öncesi), sonra kapanan {num(last.nTest)} kayıtta geçmiş kayıt tahminiyle aynı bilgiyle karşılaştırıldı.</p>
                    {last.nTest > 0 && (
                        <div className="relative overflow-x-auto -mx-1">
                            <table className="w-full min-w-[480px] text-[14px] border-collapse">
                                <thead><tr className="text-left m-text-3 text-[13px]">
                                    <th className="font-semibold py-2 px-1">Ölçü</th><th className="font-semibold py-2 px-1 text-right">Model</th><th className="font-semibold py-2 px-1 text-right">Geçmiş kayıtlar</th>
                                </tr></thead>
                                <tbody>{METRIC_ROWS.map((m, i) => { const sep = rowSep(i); return (
                                    <tr key={m.key} className={sep.className} style={sep.style}>
                                        <td className="py-2 px-1 m-text">{m.label}{m.hint && <span className="ml-1.5 text-[12px] m-text-3">{m.hint}</span>}</td>
                                        <td className="py-2 px-1 text-right m-tabular font-semibold m-text">{m.fmt(last.model[m.key])}</td>
                                        <td className="py-2 px-1 text-right m-tabular m-text-2">{m.fmt(last.reference[m.key])}</td>
                                    </tr>
                                ); })}</tbody>
                            </table>
                        </div>
                    )}
                    <Advice items={last.reasons} />
                    {last.importance.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                            <span className="m-text-3">Efora en çok etki eden özellikler:</span>
                            {last.importance.map(f => <span key={f.label} className="inline-flex items-center h-6 px-2 rounded-full m-fill-2 m-text-2">{f.label} {pct(f.share)}</span>)}
                        </div>
                    )}
                    <p className="m-0 text-[13px] m-text-3">
                        {policy === 'off' ? 'Model önerisi planlamada kapalı.' : policy === 'on' ? 'Model önerisi planlamada her zaman gösterilir.'
                            : shown.length ? `Otomatik: model ${shown.join(' ve ')} planlamada gösterilir.` : 'Otomatik: model sınamayı geçmediği için planlamada gösterilmez.'}
                        {' '}Gösterilen model önerileri öneri günlüğüne yazılır; isabeti aşağıdaki kartta izlenir.
                    </p>
                </>
            )}
            {runs.length > 1 && (
                <details>
                    <summary className="cursor-pointer text-[14px] font-semibold m-accent min-h-[34px] flex items-center">Önceki sınamalar ({runs.length - 1})</summary>
                    <ul className="m-0 mt-1 pl-0 list-none flex flex-col">
                        {[...runs].reverse().slice(1, 8).map((r, i) => { const sep = rowSep(i); return (
                            <li key={r.id} className={`flex flex-wrap items-center gap-3 py-1.5 text-[14px] ${sep.className}`} style={sep.style}>
                                <span className="m-text whitespace-nowrap">{fmtAt(r.at)}</span>
                                <span className="m-text-3">{num(r.nTest)} kayıt</span>
                                <span className="flex-1 m-text-2 m-tabular">model {gun(r.model.mae)} · geçmiş {gun(r.reference.mae)}</span>
                                <span className={`font-semibold ${r.better ? 'm-ink-ok' : r.better === false ? 'm-ink-bad' : 'm-text-3'}`}>{r.better ? 'Geçti' : r.better === false ? 'Geçmedi' : 'Karar yok'}</span>
                            </li>
                        ); })}
                    </ul>
                </details>
            )}
        </section>
    );
};

// ------------------------------------------------------------------ öneri günlüğü

/** Planlama asistanının kayıt tahmini önerileri: isabet, kabul oranı ve eğitim verisi */
const EstimateMonitor: React.FC<{ workspace: WorkspaceData; history: PlanningHistory }> = ({ workspace, history }) => {
    const st = useMemo(() => estimateStats(workspace, history), [workspace, history]);
    const pct = (v: number | null) => (v === null ? '—' : `%${Math.round(v * 100)}`);
    const gun = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')} gün`);
    const rows: { label: string; a: SourceAccuracy; extra?: string }[] = [
        { label: 'Geçmiş kayıtlar', a: st.reference, extra: `P80 tuttu: ${pct(st.reference.p80Coverage)}` },
        { label: 'AI önerisi', a: st.ai },
        { label: 'Model tahmini', a: st.model },
        { label: 'Kör tahmin (kullanıcı)', a: st.blind },
        { label: 'Nihai karar', a: st.final },
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    return (
        <section aria-labelledby="ad-ai-est" className="m-surface rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="ad-ai-est" className="m-0 text-[17px] font-semibold m-text">Kayıt tahmini önerileri</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Planlama asistanında gösterilen öneriler ve kullanıcının kararı; kayıt kapanınca gerçekleşen eforla karşılaştırılır.</p>
                </div>
                <button type="button" className="m-btn m-btn-gray" disabled={!st.entries} onClick={() => downloadFile(`oneri-gunlugu-${stamp}.csv`, estimateLogCsv(workspace, history), 'text/csv;charset=utf-8')}>
                    <Icon name="download" size={18} />Öneri günlüğü (CSV)
                </button>
            </div>
            <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
                {[
                    { label: 'Öneri', value: String(st.entries) },
                    { label: 'Kapanan ve ölçülen', value: String(st.closed) },
                    { label: 'AI eforu kabul', value: pct(st.aiAccept.effort) },
                    { label: 'AI önemi kabul', value: pct(st.aiAccept.priority) },
                ].map(t => (
                    <div key={t.label} className="rounded-xl m-fill-2 px-3 py-2.5 flex flex-col">
                        <span className="text-[12.5px] m-text-3">{t.label}</span>
                        <span className="text-[20px] font-bold m-tabular m-text">{t.value}</span>
                    </div>
                ))}
            </div>
            <div className="relative overflow-x-auto -mx-1">
                <table className="w-full min-w-[520px] text-[14px] border-collapse">
                    <thead>
                        <tr className="text-left m-text-3 text-[13px]">
                            <th className="font-semibold py-2 px-1">Kaynak</th>
                            <th className="font-semibold py-2 px-1 text-right">Ölçülen</th>
                            <th className="font-semibold py-2 px-1 text-right">Ortalama hata</th>
                            <th className="font-semibold py-2 px-1 text-right">Aralık gerçeği kapsadı</th>
                            <th className="font-semibold py-2 px-1 text-right">Not</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const sep = rowSep(i);
                            return (
                                <tr key={r.label} className={sep.className} style={sep.style}>
                                    <td className="py-2 px-1 m-text">{r.label}</td>
                                    <td className="py-2 px-1 text-right m-tabular">{r.a.n}</td>
                                    <td className="py-2 px-1 text-right m-tabular">{gun(r.a.mae)}</td>
                                    <td className="py-2 px-1 text-right m-tabular">{pct(r.a.coverage)}</td>
                                    <td className="py-2 px-1 text-right m-text-3">{r.extra || ''}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="m-0 text-[13px] m-text-3">Kör tahmin girilen kayıt payı: {pct(st.blindShare)} · aynı kayıtlarda AI ve kör tahmin: {st.aiVsBlind.n} kayıt{st.aiVsBlind.n ? ` (AI ${gun(st.aiVsBlind.aiMae)}, kör tahmin ${gun(st.aiVsBlind.blindMae)} ortalama hata)` : ''}. Gerçekleşen efor, kayıt verisi testlerinden geçen kapanmış kayıtlardan ölçülür.</p>
            {st.advice.map(a => <p key={a} className="m-0 text-[14px] m-text-2 flex items-start gap-2"><span className="m-accent" style={{ marginTop: 2 }}><Icon name="info" size={16} /></span>{a}</p>)}
        </section>
    );
};


export default ForecastQuality;
