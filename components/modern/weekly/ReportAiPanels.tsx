import React, { useMemo, useState } from 'react';
import { Abbreviation, LearnedRule, ReportEvalMetrics, ReportEvalRun, ReportGatePolicy, ReportPromptVariant, WeeklyReport, WorkspaceData } from '../../../types';
import { aiPolicyOf } from '../../../utils/ai/policy';
import { GROUP_BY_LABELS, ReportAiGroupBy, reportAiStats } from '../../../utils/ai/reportAiStats';
import {
    goldenBlocker, goldenCandidates, REPORT_GATE_LABELS, reportGateStatus, reportGoldCases, reportGoldenJsonl, ReportDraftScore, scoreReportDraft, summarizeReportEval,
} from '../../../utils/ai/reportEval';
import { buildVariantRequest, PRODUCTION_VARIANT, REPORT_VARIANTS, VARIANT_META } from '../../../utils/ai/reportVariants';
import { parseReportSuggestion, reportConfigVersion } from '../../../utils/ai/weeklyReportPrompt';
import { DEFAULT_INSTITUTION, DEFAULT_REPORT_GUIDE, DEPARTMENT_GUIDE_LIMIT, GUIDE_LIMIT, INSTITUTION_LIMIT, reportSystemFor } from '../../../utils/ai/reportGuide';
import { weekLabel } from '../../../utils/weeklyReport';
import { useAiBatch, useAiRun } from '../../assistant/AiButton';
import { buildRulePrompt, parseRuleSuggestions, RULE_TEXT_LIMIT, RuleAction, ruleEvidence, RULES_SYSTEM } from '../../../utils/ai/reportRules';
import { RULES_PER_SCOPE } from '../../../utils/ai/reportGuide';
import { SwitchRow } from '../admin/controls';
import { Icon } from '../icons';
import { Card, Field, rowSep, Sheet } from '../ui';
import { downloadFile, Pill } from './shared';

/**
 * Haftalık rapor › Ayarlar › rapor AI kartları (yalnız PYB destek): öneri
 * günlüğünden kabul oranı, altın set değerlendirmesi ve kalite kapısı.
 */

const pct = (v: number | null) => (v === null ? '—' : `%${Math.round(v * 100)}`);
const dec = (v: number | null) => (v === null ? '—' : String(v).replace('.', ','));

const PERIODS: { key: string; label: string; days: number | null }[] = [
    { key: '30', label: 'Son 30 gün', days: 30 },
    { key: '90', label: 'Son 90 gün', days: 90 },
    { key: 'all', label: 'Tümü', days: null },
];

/** F1: öneri günlüğünden gruplu kabul ölçüleri */
export const ReportAiQualityCard: React.FC<{ workspace: WorkspaceData }> = ({ workspace }) => {
    const [by, setBy] = useState<ReportAiGroupBy>('department');
    const [period, setPeriod] = useState('90');
    const days = PERIODS.find(p => p.key === period)?.days ?? null;
    const from = days === null ? undefined : new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const rows = useMemo(() => reportAiStats(workspace, { by, from }), [workspace, by, from]);
    return (
        <Card title="Rapor AI kalitesi" subtitle="AI taslak önerilerinin ne kadarının uygulandığı, gönderime kadar aynen kaldığı, düzenlendiği ya da silindiği; AI'lı raporların iade oranı ve format sorunları." labelledBy="wr-aiq">
            <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-[14px] m-text-2">Gruplama
                    <select className="m-input !w-auto" value={by} onChange={e => setBy(e.target.value as ReportAiGroupBy)}>
                        {(Object.keys(GROUP_BY_LABELS) as ReportAiGroupBy[]).map(k => <option key={k} value={k}>{GROUP_BY_LABELS[k]}</option>)}
                    </select>
                </label>
                <select aria-label="Dönem" className="m-input !w-auto" value={period} onChange={e => setPeriod(e.target.value)}>
                    {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
            </div>
            {rows.length === 0 ? (
                <p className="m-0 text-[14px] m-text-3">Bu dönemde AI önerisi kullanılmadı. PY'ler rapor düzenleyicide "Taslak öner"i kullandıkça ölçüler burada birikir.</p>
            ) : (
                <div className="relative overflow-x-auto -mx-1">
                    <table className="w-full min-w-[760px] text-[14px] border-collapse">
                        <thead><tr className="text-left m-text-3 text-[13px]">
                            <th className="font-semibold py-2 px-1">{GROUP_BY_LABELS[by]}</th>
                            <th className="font-semibold py-2 px-1 text-right" title="Uygulanan + vazgeçilen + hatalı">Öneri</th>
                            <th className="font-semibold py-2 px-1 text-right">Uygulandı</th>
                            <th className="font-semibold py-2 px-1 text-right">Vazgeçildi</th>
                            <th className="font-semibold py-2 px-1 text-right" title="AI taslaklı gönderilen rapor">Gönderim</th>
                            <th className="font-semibold py-2 px-1 text-right" title="AI maddelerinin gönderimde aynen kalma oranı">Aynen kaldı</th>
                            <th className="font-semibold py-2 px-1 text-right">Düzenlendi</th>
                            <th className="font-semibold py-2 px-1 text-right">Silindi</th>
                            <th className="font-semibold py-2 px-1 text-right">İade</th>
                            <th className="font-semibold py-2 px-1 text-right" title="Gönderimde rapor başına ortalama format hatası · uyarısı">Hata · uyarı</th>
                        </tr></thead>
                        <tbody>{rows.map((r, i) => { const sep = rowSep(i); return (
                            <tr key={r.key || 'none'} className={sep.className} style={sep.style}>
                                <td className="py-2 px-1 m-text">{r.label}</td>
                                <td className="py-2 px-1 text-right m-tabular">{r.suggestions}</td>
                                <td className="py-2 px-1 text-right m-tabular">{pct(r.applyRate)}</td>
                                <td className="py-2 px-1 text-right m-tabular">{pct(r.discardRate)}{r.errorRate ? <span className="m-ink-bad"> · {pct(r.errorRate)} hata</span> : null}</td>
                                <td className="py-2 px-1 text-right m-tabular">{r.submitted}</td>
                                <td className="py-2 px-1 text-right m-tabular font-semibold">{pct(r.keptRate)}</td>
                                <td className="py-2 px-1 text-right m-tabular">{pct(r.editedRate)}</td>
                                <td className="py-2 px-1 text-right m-tabular">{pct(r.deletedRate)}</td>
                                <td className={`py-2 px-1 text-right m-tabular ${r.returnRate ? 'm-ink-warn' : ''}`}>{pct(r.returnRate)}</td>
                                <td className="py-2 px-1 text-right m-tabular">{dec(r.avgLintErrors)} · {dec(r.avgLintWarnings)}</td>
                            </tr>
                        ); })}</tbody>
                    </table>
                </div>
            )}
            <p className="m-0 text-[12.5px] m-text-3">Günlükte rapor metni tutulmaz; yalnız sayılar. Aynı rapor iade sonrası yeniden gönderildiyse son gönderimi sayılır.</p>
        </Card>
    );
};

// ---------------------------------------------------------------- altın set ve değerlendirme

const LINT_OPTIONS = [0, 0.25, 0.5, 1, 2];
const UNGROUNDED_OPTIONS = [0, 0.02, 0.05, 0.1, 0.2];
const RECALL_OPTIONS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

const METRIC_COLUMNS: { key: keyof ReportEvalMetrics; label: string; kind: 'pct' | 'dec'; better: 'high' | 'low'; title: string }[] = [
    { key: 'lintErrorsPerReport', label: 'Hata', kind: 'dec', better: 'low', title: 'Rapor başına format hatası' },
    { key: 'lintWarningsPerReport', label: 'Uyarı', kind: 'dec', better: 'low', title: 'Rapor başına format uyarısı' },
    { key: 'ungroundedRate', label: 'Dayanaksız', kind: 'pct', better: 'low', title: 'Girdide geçmeyen rakam, tarih ve ad oranı' },
    { key: 'recall', label: 'Kapsama', kind: 'pct', better: 'high', title: 'Onaylı maddelerden AI\'nın yakaladığı (recall)' },
    { key: 'precision', label: 'İsabet', kind: 'pct', better: 'high', title: 'AI maddelerinden onaylı hâlde karşılığı olan (precision)' },
    { key: 'categoryAccuracy', label: 'Tür', kind: 'pct', better: 'high', title: 'Eşleşen maddelerde tür doğruluğu' },
    { key: 'unknownAbbrPerReport', label: 'Kısaltma', kind: 'dec', better: 'low', title: 'Rapor başına açılımı bilinmeyen kısaltma' },
    { key: 'missingPerReport', label: 'Soru', kind: 'dec', better: 'low', title: 'Rapor başına eksik bilgi sorusu (bilgi amaçlı)' },
];

export interface ReportEvalCardProps {
    workspace: WorkspaceData;
    dictionary: Abbreviation[];
    onAddGolden: (reportId: string) => boolean;
    onRemoveGolden: (reportId: string) => void;
    onAddRun: (run: ReportEvalRun) => void;
    onUpdateGate: (patch: Partial<ReportGatePolicy>, label: string) => void;
}

/** F2: altın set, varyant koşusu, karşılaştırma tablosu ve kalite kapısı */
export const ReportEvalCard: React.FC<ReportEvalCardProps> = ({ workspace, dictionary, onAddGolden, onRemoveGolden, onAddRun, onUpdateGate }) => {
    const gate = aiPolicyOf(workspace).reportGate;
    const batch = useAiBatch();
    const [variant, setVariant] = useState<ReportPromptVariant>(PRODUCTION_VARIANT);
    const [picking, setPicking] = useState(false);
    const [query, setQuery] = useState('');
    const [error, setError] = useState<string | null>(null);
    const configVersion = reportConfigVersion(workspace.reportSettings);
    const g = reportGateStatus(workspace.reportEvalRuns, configVersion, batch.model);
    const cases = useMemo(() => reportGoldCases(workspace, dictionary), [workspace, dictionary]);
    const projectName = useMemo(() => new Map(workspace.projects.map(p => [p.id, p.name])), [workspace.projects]);
    const deptName = useMemo(() => new Map(workspace.departments.map(d => [d.code, d.name])), [workspace.departments]);
    const reportLabel = (r: Pick<WeeklyReport, 'projectId' | 'year' | 'week' | 'departmentCode'>) =>
        `${projectName.get(r.projectId || '') || 'Silinmiş proje'} · ${weekLabel(r.year, r.week)} · ${deptName.get(r.departmentCode) || r.departmentCode || 'bölümsüz'}`;
    const candidates = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr-TR');
        if (!q) return goldenCandidates(workspace, dictionary, 20).map(r => ({ r, blocker: null as string | null }));
        return (workspace.weeklyReports || [])
            .filter(r => r.kind === 'project' && r.stage === 'approved' && (projectName.get(r.projectId || '') || '').toLocaleLowerCase('tr-TR').includes(q))
            .sort((a, b) => b.year - a.year || b.week - a.week).slice(0, 30)
            .map(r => ({ r, blocker: goldenBlocker(workspace, r, dictionary) }));
    }, [workspace, dictionary, query, projectName]);
    const usable = cases.filter(c => c.report && c.input);
    // Varyant başına geçerli yapılandırma sürümündeki son koşu
    const latest = useMemo(() => {
        const m = new Map<ReportPromptVariant, ReportEvalRun>();
        [...(workspace.reportEvalRuns || [])].reverse().forEach(r => { if (r.promptVersion === configVersion && !m.has(r.variant)) m.set(r.variant, r); });
        return m;
    }, [workspace.reportEvalRuns, configVersion]);
    const best = (key: keyof ReportEvalMetrics, better: 'high' | 'low') => {
        const vals = [...latest.values()].map(r => r.metrics[key]).filter((v): v is number => v !== null);
        return vals.length > 1 ? (better === 'high' ? Math.max(...vals) : Math.min(...vals)) : null;
    };
    const recent = [...(workspace.reportEvalRuns || [])].reverse().slice(0, 8);

    const evaluate = async () => {
        setError(null);
        const jobs = usable.map(c => buildVariantRequest({ variant, ws: workspace, report: c.report!, input: c.input! }));
        const model = batch.model;
        const res = await batch.runAll(jobs, t => parseReportSuggestion(t));
        if (res.aborted) return;
        if (res.errors.length) setError(res.errors[0]);
        const scores = res.results.map((s, i) => (s ? scoreReportDraft({ suggestion: s, gold: usable[i].report!, input: usable[i].input!, dictionary }) : null)).filter((x): x is ReportDraftScore => !!x);
        onAddRun(summarizeReportEval(scores, gate, {
            id: `reval-${Date.now().toString(36)}`, at: new Date().toISOString(), promptVersion: configVersion, variant, model,
            failed: res.results.filter(x => !x).length, skipped: cases.length - usable.length,
        }));
    };
    const download = () => {
        const out = reportGoldenJsonl(workspace, variant, dictionary);
        downloadFile(`rapor-altin-set-${variant}-${new Date().toISOString().slice(0, 10)}.jsonl`, `${out.jsonl}\n`, 'application/jsonl');
    };
    const fmt = (v: number | null, kind: 'pct' | 'dec') => (kind === 'pct' ? pct(v) : dec(v));

    return (
        <section aria-labelledby="wr-reval" className="m-surface rounded-2xl p-5 flex flex-col gap-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="wr-reval" className="m-0 text-[17px] font-semibold m-text">Rapor AI değerlendirmesi</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Seçtiğiniz onaylı raporlar o haftanın girdisiyle yeniden önerilir ve onaylı son hâlle karşılaştırılır. Örnekler yalnız o haftadan önce onaylanmış raporlardan gelir. Kılavuz, kural, istem ya da model değişince yeniden çalıştırın.</p>
                </div>
                <Pill tone={g.status === 'passed' ? 'm-tone-ok' : g.status === 'failed' ? 'm-tone-bad' : 'm-tone-warn'}>{REPORT_GATE_LABELS[g.status]}</Pill>
            </div>

            <div className="flex flex-col -my-1">
                <SwitchRow index={0} label="Kalite kapısı zorunlu" hint={gate.enforce ? 'Üretim istemi (Tam) son değerlendirmede kapıdan geçmediyse rapor düzenleyicide uyarı gösterilir; öneri engellenmez.' : 'Kapı yalnız izlenir; düzenleyicide uyarı gösterilmez.'} on={gate.enforce} onChange={on => onUpdateGate({ enforce: on }, `rapor kalite kapısı ${on ? 'zorunlu' : 'izleme'}`)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">Rapor başına format hatası en çok
                    <select className="m-input" value={gate.maxLintErrorsPerReport} onChange={e => onUpdateGate({ maxLintErrorsPerReport: Number(e.target.value) }, `rapor kapısı: format hatası ${e.target.value}`)}>
                        {LINT_OPTIONS.map(v => <option key={v} value={v}>{dec(v)}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">Dayanaksız bilgi en çok
                    <select className="m-input" value={gate.maxUngroundedRate} onChange={e => onUpdateGate({ maxUngroundedRate: Number(e.target.value) }, `rapor kapısı: dayanaksız bilgi ${e.target.value}`)}>
                        {UNGROUNDED_OPTIONS.map(v => <option key={v} value={v}>{pct(v)}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold m-text-2">Onaylı maddeleri kapsama en az
                    <select className="m-input" value={gate.minRecall} onChange={e => onUpdateGate({ minRecall: Number(e.target.value) }, `rapor kapısı: kapsama ${e.target.value}`)}>
                        {RECALL_OPTIONS.map(v => <option key={v} value={v}>{pct(v)}</option>)}
                    </select>
                </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold m-text">Altın set: {cases.length} rapor</span>
                {cases.length > usable.length && <Pill tone="m-tone-warn">{cases.length - usable.length} raporun girdisi yok</Pill>}
                <span className="flex-1" />
                <button type="button" className="m-btn m-btn-plain" aria-expanded={picking} onClick={() => setPicking(v => !v)}><Icon name="plus" size={18} />Rapor ekle</button>
                <button type="button" className="m-btn m-btn-plain" disabled={!usable.length} onClick={download} title="Seçili varyantın istemi ve onaylı son hâl; kişi adları maskeli"><Icon name="download" size={18} />JSONL</button>
            </div>
            {picking && (
                <div className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-2">
                    <input aria-label="Onaylı rapor ara" className="m-input" placeholder="Proje adına göre ara" value={query} onChange={e => setQuery(e.target.value)} />
                    {!query.trim() && <span className="text-[13px] m-text-3">Öneriler: format hatası olmayan, iade edilmemiş, girdisi bulunan raporlar; bölümler arasında dönüşümlü.</span>}
                    <div className="flex flex-col max-h-[300px] overflow-y-auto">
                        {candidates.map(({ r, blocker }) => (
                            <div key={r.id} className="flex flex-wrap items-center gap-2.5 min-h-[44px] text-[14px]">
                                <span className="flex-1 min-w-[200px] m-text">{reportLabel(r)}</span>
                                {blocker ? <span className="text-[12.5px] m-text-3 max-w-[40ch]">{blocker}</span>
                                    : <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-2" onClick={() => onAddGolden(r.id)}>Ekle</button>}
                            </div>
                        ))}
                        {!candidates.length && <span className="text-[14px] m-text-3">{query.trim() ? 'Eşleşen onaylı rapor yok.' : 'Önerilecek uygun rapor yok. Proje adıyla arayarak diğer onaylı raporlara bakabilirsiniz.'}</span>}
                    </div>
                </div>
            )}
            {cases.length > 0 && (
                <details>
                    <summary className="cursor-pointer text-[14px] font-semibold m-accent min-h-[34px] flex items-center">Altın setteki raporlar</summary>
                    <div className="flex flex-col mt-1">
                        {cases.map((c, i) => { const sep = rowSep(i); return (
                            <div key={c.item.reportId} className={`flex flex-wrap items-center gap-2 py-1.5 text-[14px] ${sep.className}`} style={sep.style}>
                                <span className="flex-1 min-w-[200px] m-text">{c.report ? reportLabel(c.report) : <span className="m-text-3">Rapor bulunamadı (silinmiş ya da onayı geri alınmış)</span>}</span>
                                {c.report && !c.input && <Pill tone="m-tone-warn">Girdisi yok</Pill>}
                                <button type="button" className="m-icon-btn" aria-label="Altın setten çıkar" onClick={() => onRemoveGolden(c.item.reportId)}><Icon name="x" size={16} /></button>
                            </div>
                        ); })}
                    </div>
                </details>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <select aria-label="İstem varyantı" className="m-input !w-auto" value={variant} onChange={e => setVariant(e.target.value as ReportPromptVariant)}>
                    {REPORT_VARIANTS.map(v => <option key={v} value={v}>{VARIANT_META[v].label}</option>)}
                </select>
                <button type="button" className="m-btn m-btn-primary" disabled={!usable.length || batch.running || !batch.available} onClick={evaluate}>
                    <Icon name="sparkles" size={18} />{batch.progress ? `Değerlendiriliyor… ${batch.progress.done}/${batch.progress.total}` : 'AI ile değerlendir'}
                </button>
                {batch.running && <button type="button" className="m-btn m-btn-plain" onClick={batch.cancel}>Durdur</button>}
                {!batch.available && <span className="text-[13px] m-text-3">AI kapalı ya da ekran içi AI kullanımı kapatılmış.</span>}
            </div>
            <p className="m-0 text-[13px] m-text-3">{VARIANT_META[variant].hint}. Yapılandırma: {configVersion}{batch.model ? ` · model: ${batch.model}` : ''}. En çok 2 paralel çağrı.</p>
            {error && <p role="alert" className="m-0 text-[14px] m-ink-bad">Bazı raporlarda AI yanıt vermedi: {error}</p>}

            {latest.size > 0 ? (
                <div className="relative overflow-x-auto -mx-1">
                    <table className="w-full min-w-[820px] text-[14px] border-collapse">
                        <thead><tr className="text-left m-text-3 text-[13px]">
                            <th className="font-semibold py-2 px-1">Varyant</th>
                            <th className="font-semibold py-2 px-1 text-right">Rapor</th>
                            {METRIC_COLUMNS.map(c => <th key={c.key} className="font-semibold py-2 px-1 text-right" title={c.title}>{c.label}</th>)}
                            <th className="font-semibold py-2 px-1 text-right">Kapı</th>
                        </tr></thead>
                        <tbody>{REPORT_VARIANTS.filter(v => latest.has(v)).map((v, i) => { const r = latest.get(v)!; const sep = rowSep(i); return (
                            <tr key={v} className={sep.className} style={sep.style}>
                                <td className="py-2 px-1 m-text" title={VARIANT_META[v].hint}>{VARIANT_META[v].label}</td>
                                <td className="py-2 px-1 text-right m-tabular">{r.n}{r.failed ? <span className="m-ink-bad"> (+{r.failed})</span> : null}</td>
                                {METRIC_COLUMNS.map(c => { const val = r.metrics[c.key]; const b = best(c.key, c.better); return (
                                    <td key={c.key} className={`py-2 px-1 text-right m-tabular ${b !== null && val === b ? 'font-semibold m-ink-ok' : ''}`}>{fmt(val, c.kind)}</td>
                                ); })}
                                <td className={`py-2 px-1 text-right font-semibold ${r.passed ? 'm-ink-ok' : r.passed === false ? 'm-ink-bad' : 'm-text-3'}`}>{r.passed === null ? 'Karar yok' : r.passed ? 'Geçti' : 'Kaldı'}</td>
                            </tr>
                        ); })}</tbody>
                    </table>
                </div>
            ) : <p className="m-0 text-[14px] m-text-3">Bu yapılandırmayla henüz değerlendirme yapılmadı. En az iki varyantı koşarak katmanların kazancını karşılaştırın; kapı kararı için en az 5 rapor gerekir.</p>}
            {recent.length > 0 && (
                <details>
                    <summary className="cursor-pointer text-[14px] font-semibold m-accent min-h-[34px] flex items-center">Son koşular</summary>
                    <ul className="m-0 p-0 list-none flex flex-col mt-1">
                        {recent.map((r, i) => { const sep = rowSep(i); return (
                            <li key={r.id} className={`py-1.5 text-[13.5px] ${sep.className}`} style={sep.style}>
                                <span className="m-text">{new Date(r.at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {VARIANT_META[r.variant].label} · {r.promptVersion}{r.model ? ` · ${r.model}` : ''} · {r.n} rapor</span>
                                <span className="block m-text-3">{r.reasons.join(' ')}</span>
                            </li>
                        ); })}
                    </ul>
                </details>
            )}
        </section>
    );
};

// ---------------------------------------------------------------- kılavuz

const changed = (v?: { version: number; updatedAt: string; updatedByName?: string }) =>
    v ? `Sürüm ${v.version} · ${new Date(v.updatedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${v.updatedByName ? ` · ${v.updatedByName}` : ''}` : 'Varsayılan kılavuz (koddaki)';

export interface ReportGuideCardProps {
    workspace: WorkspaceData;
    onSaveGuide: (patch: { institutionName?: string; text: string }) => boolean;
    onResetGuide: () => boolean;
    onSaveDepartmentGuide: (code: string, text: string) => boolean;
}

/** F4: kurum kılavuzu, bölüm ekleri ve tam istem önizlemesi */
export const ReportGuideCard: React.FC<ReportGuideCardProps> = ({ workspace, onSaveGuide, onResetGuide, onSaveDepartmentGuide }) => {
    const settings = workspace.reportSettings;
    const guide = settings?.guide;
    const [inst, setInst] = useState(guide?.institutionName || '');
    const [text, setText] = useState(guide?.text?.trim() ? guide.text : DEFAULT_REPORT_GUIDE);
    const [dept, setDept] = useState(workspace.departments[0]?.code || '');
    const deptGuide = settings?.departmentGuides?.[dept];
    const [deptText, setDeptText] = useState(deptGuide?.text || '');
    const [preview, setPreview] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const dirty = text.trim() !== (guide?.text?.trim() || DEFAULT_REPORT_GUIDE) || inst.trim() !== (guide?.institutionName || '');
    const custom = !!guide?.text?.trim();
    const pickDept = (code: string) => { setDept(code); setDeptText(settings?.departmentGuides?.[code]?.text || ''); };
    const say = (ok: boolean, okText: string) => setMsg(ok ? { ok, text: okText } : { ok, text: 'Kaydedilemedi: yetkiniz yok ya da metin sınırı aşıldı.' });
    const deptName = (code: string) => workspace.departments.find(d => d.code === code)?.name || code;

    return (
        <Card title="Rapor kılavuzu" subtitle="AI taslağının uyduğu kurum kuralları. Kaydettiğiniz her değişiklik yeni sürümdür; kalite kapısı yeniden değerlendirme ister. Madde türleri ve JSON çıktı biçimi kodda sabittir." labelledBy="wr-guide">
            <Field label="Kurum adı" htmlFor="wr-inst" hint={`Rol satırında geçer. Boşsa: ${DEFAULT_INSTITUTION}.`}>
                <input id="wr-inst" className="m-input" maxLength={INSTITUTION_LIMIT} value={inst} placeholder={DEFAULT_INSTITUTION} onChange={e => setInst(e.target.value)} />
            </Field>
            <Field label="Kılavuz metni" htmlFor="wr-guide-text" hint={`${text.length.toLocaleString('tr-TR')} / ${GUIDE_LIMIT.toLocaleString('tr-TR')} karakter · ${changed(guide)}`}>
                <textarea id="wr-guide-text" className="m-input py-2.5 font-mono text-[13px]" rows={14} maxLength={GUIDE_LIMIT} value={text} onChange={e => setText(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="m-btn m-btn-primary" disabled={!dirty} onClick={() => say(onSaveGuide({ institutionName: inst, text }), 'Kılavuz kaydedildi (yeni sürüm).')}>Kaydet</button>
                <button type="button" className="m-btn m-btn-plain" disabled={!custom && text.trim() === DEFAULT_REPORT_GUIDE} onClick={() => { if (window.confirm('Kılavuz varsayılan metne dönsün mü?') && onResetGuide()) { setText(DEFAULT_REPORT_GUIDE); say(true, 'Varsayılan kılavuza dönüldü.'); } }}>Varsayılana dön</button>
                <button type="button" className="m-btn m-btn-plain" onClick={() => setPreview(dept)}><Icon name="eye" size={17} />Tam istemi önizle</button>
            </div>

            <div className="flex flex-col gap-2 pt-1">
                <h3 className="m-0 text-[15px] font-semibold m-text">Bölüme özgü ek kurallar</h3>
                {workspace.departments.length === 0 ? <p className="m-0 text-[14px] m-text-3">Veri havuzunda bölüm tanımlı değil.</p> : (
                    <>
                        <select aria-label="Bölüm" className="m-input !w-auto self-start" value={dept} onChange={e => pickDept(e.target.value)}>
                            {workspace.departments.map(d => <option key={d.code} value={d.code}>{d.name}{settings?.departmentGuides?.[d.code] ? ' •' : ''}</option>)}
                        </select>
                        <Field label={`${deptName(dept)} için ek kurallar`} htmlFor="wr-dept-guide" hint={`Yalnız bu bölümün raporlarında, kurum kılavuzunun ardına eklenir. ${deptText.length} / ${DEPARTMENT_GUIDE_LIMIT} karakter · ${deptGuide ? changed(deptGuide) : 'ek yok'}`}>
                            <textarea id="wr-dept-guide" className="m-input py-2.5 text-[14px]" rows={4} maxLength={DEPARTMENT_GUIDE_LIMIT} value={deptText} placeholder="Ör. Hakediş tutarları KDV hariç yazılır; müşteri adı kısaltılmaz." onChange={e => setDeptText(e.target.value)} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className="m-btn m-btn-gray" disabled={deptText.trim() === (deptGuide?.text || '')} onClick={() => say(onSaveDepartmentGuide(dept, deptText), deptText.trim() ? 'Bölüm eki kaydedildi.' : 'Bölüm eki kaldırıldı.')}>{deptText.trim() || !deptGuide ? 'Bölüm ekini kaydet' : 'Bölüm ekini kaldır'}</button>
                        </div>
                    </>
                )}
            </div>
            {msg && <p role="status" className={`m-0 text-[14px] ${msg.ok ? 'm-ink-ok' : 'm-ink-bad'}`}>{msg.text}</p>}

            {preview !== null && (
                <Sheet wide title="Tam sistem istemi" subtitle={`${preview ? deptName(preview) : 'Bölümsüz'} raporları için, kayıtlı ayarlarla (salt okunur)`} onClose={() => setPreview(null)}
                    footer={<><span className="flex-1" /><button type="button" className="m-btn m-btn-plain" onClick={() => setPreview(null)}>Kapat</button></>}>
                    {workspace.departments.length > 0 && (
                        <select aria-label="Önizleme bölümü" className="m-input !w-auto self-start" value={preview} onChange={e => setPreview(e.target.value)}>
                            {workspace.departments.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                        </select>
                    )}
                    <p className="m-0 text-[13px] m-text-3">Proje kapsamlı etkin kurallar yalnız o projenin raporunda eklenir; burada kurum ve bölüm kuralları görünür.</p>
                    <pre className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed m-fill-2 rounded-xl p-3 m-text">{reportSystemFor(settings, preview)}</pre>
                </Sheet>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------- öğrenilmiş kurallar

const SOURCE_LABELS: Record<LearnedRule['source'], string> = { lint: 'Format sorunları', edit: 'Taslak düzeltmeleri', return: 'İade notları (AI)', manual: 'Elle' };

export interface LearnedRulesCardProps {
    workspace: WorkspaceData;
    onRuleAction: (a: RuleAction) => boolean;
}

/** F7: kural adayları (kural tabanlı ve AI destekli), onay, düzenleme, emekliye ayırma */
export const LearnedRulesCard: React.FC<LearnedRulesCardProps> = ({ workspace, onRuleAction }) => {
    const rules = workspace.reportSettings?.learnedRules || [];
    const ai = useAiRun();
    const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
    const [newText, setNewText] = useState('');
    const [newScope, setNewScope] = useState<string>('institution');
    const [msg, setMsg] = useState<string | null>(null);
    const deptName = (code?: string) => workspace.departments.find(d => d.code === code)?.name || code || '';
    const projectName = (id?: string) => workspace.projects.find(p => p.id === id)?.name || 'Silinmiş proje';
    const scopeLabel = (r: Pick<LearnedRule, 'scope' | 'scopeId'>) => (r.scope === 'institution' ? 'Kurum geneli' : r.scope === 'department' ? `Bölüm: ${deptName(r.scopeId)}` : `Proje: ${projectName(r.scopeId)}`);
    const proposed = rules.filter(r => r.status === 'proposed').sort((a, b) => b.evidenceCount - a.evidenceCount);
    const active = rules.filter(r => r.status === 'active');
    const retired = rules.filter(r => r.status === 'retired');
    const evidence = useMemo(() => ruleEvidence(workspace), [workspace]);
    const act = (a: RuleAction, ok?: string) => { const r = onRuleAction(a); setMsg(r ? ok || null : 'İşlem yapılamadı.'); return r; };
    const suggestAi = async () => {
        setMsg(null);
        const res = await ai.run(RULES_SYSTEM, buildRulePrompt(evidence), t => parseRuleSuggestions(t));
        if (res) act({ kind: 'candidates', candidates: res }, res.length ? `AI ${res.length} aday kural önerdi; etkinleştirmeden isteme girmez.` : 'AI yeni kural önermedi.');
    };
    const addManual = (e: React.FormEvent) => {
        e.preventDefault();
        const [scope, scopeId] = newScope.split(':') as [LearnedRule['scope'], string | undefined];
        if (act({ kind: 'add', text: newText, scope, scopeId }, 'Kural eklendi ve etkinleştirildi.')) setNewText('');
    };

    const row = (r: LearnedRule, i: number, actions: React.ReactNode) => {
        const sep = rowSep(i);
        return (
            <div key={r.id} className={`flex flex-col gap-1.5 py-2.5 ${sep.className}`} style={sep.style}>
                {editing?.id === r.id ? (
                    <div className="flex flex-wrap gap-2">
                        <input aria-label="Kural metni" className="m-input flex-1 min-w-[220px]" maxLength={RULE_TEXT_LIMIT} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} />
                        <button type="button" className="m-btn m-btn-primary" disabled={!editing.text.trim()} onClick={() => { if (act({ kind: 'edit', id: r.id, text: editing.text }, 'Kural güncellendi.')) setEditing(null); }}>Kaydet</button>
                        <button type="button" className="m-btn m-btn-plain" onClick={() => setEditing(null)}>Vazgeç</button>
                    </div>
                ) : <span className="text-[15px] m-text">{r.text}</span>}
                <span className="text-[12.5px] m-text-3">{scopeLabel(r)} · {SOURCE_LABELS[r.source]}{r.evidenceCount ? ` · ${r.evidenceCount} kanıt` : ''}{r.approvedByName && r.status === 'active' ? ` · onaylayan: ${r.approvedByName}` : ''}</span>
                {r.examples?.length ? <ul className="m-0 pl-4 text-[12.5px] m-text-3">{r.examples.map((x, k) => <li key={k}>{x}</li>)}</ul> : null}
                {editing?.id !== r.id && <div className="flex flex-wrap gap-1.5">{actions}<button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-2" onClick={() => setEditing({ id: r.id, text: r.text })}><Icon name="pencil" size={15} />Düzenle</button></div>}
            </div>
        );
    };

    return (
        <Card title="Öğrenilmiş kurallar" subtitle={`Tekrarlanan format sorunlarından, AI taslağına yapılan düzeltmelerden ve iade notlarından çıkarılan kurallar. Önerilen kural siz etkinleştirmeden isteme girmez; kapsam başına en çok ${RULES_PER_SCOPE} etkin kural kullanılır. Kural değişince kalite kapısı yeniden değerlendirme ister.`} labelledBy="wr-rules">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="m-btn m-btn-gray" onClick={() => act({ kind: 'refresh' }, 'Adaylar güncellendi.')}><Icon name="refresh" size={17} />Adayları güncelle</button>
                {ai.available && (
                    <button type="button" className="m-btn m-btn-plain" disabled={ai.loading || (!evidence.returnNotes.length && !evidence.edits.length)} onClick={suggestAi}
                        title={`${evidence.returnNotes.length} iade notu, ${evidence.edits.length} düzeltme örneği`}>
                        <Icon name="sparkles" size={17} />{ai.loading ? 'AI inceliyor…' : 'AI ile aday öner'}
                    </button>
                )}
            </div>
            {ai.error && <p role="alert" className="m-0 text-[14px] m-ink-bad">{ai.error}</p>}
            {msg && <p role="status" className="m-0 text-[14px] m-text-2">{msg}</p>}

            <h3 className="m-0 text-[15px] font-semibold m-text">Öneriler <span className="m-text-3 font-normal m-tabular">{proposed.length}</span></h3>
            {proposed.length ? <div className="flex flex-col">{proposed.map((r, i) => row(r, i, <>
                <button type="button" className="m-btn m-btn-primary !min-h-[36px] !px-3" onClick={() => act({ kind: 'status', id: r.id, status: 'active' }, 'Kural etkinleştirildi.')}>Etkinleştir</button>
                <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-2" onClick={() => act({ kind: 'status', id: r.id, status: 'retired' }, 'Öneri reddedildi.')}>Reddet</button>
            </>))}</div> : <p className="m-0 text-[14px] m-text-3">Öneri yok. "Adayları güncelle" format sorunları ve taslak düzeltmeleri en az 3 raporda tekrarlanınca kural önerir.</p>}

            <h3 className="m-0 text-[15px] font-semibold m-text">Etkin kurallar <span className="m-text-3 font-normal m-tabular">{active.length}</span></h3>
            {active.length ? <div className="flex flex-col">{active.map((r, i) => row(r, i, (
                <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-2" onClick={() => act({ kind: 'status', id: r.id, status: 'retired' }, 'Kural emekliye ayrıldı.')}>Emekliye ayır</button>
            )))}</div> : <p className="m-0 text-[14px] m-text-3">Etkin kural yok.</p>}

            <form className="flex flex-wrap items-end gap-2" onSubmit={addManual}>
                <div className="flex-1 min-w-[220px]"><Field label="Elle kural ekle" htmlFor="wr-rule-new"><input id="wr-rule-new" className="m-input" maxLength={RULE_TEXT_LIMIT} value={newText} placeholder="Ör. Hakediş maddesinde fatura numarasını yazma; tutar ve tarihi yaz." onChange={e => setNewText(e.target.value)} /></Field></div>
                <select aria-label="Kapsam" className="m-input !w-auto" value={newScope} onChange={e => setNewScope(e.target.value)}>
                    <option value="institution">Kurum geneli</option>
                    {workspace.departments.map(d => <option key={d.code} value={`department:${d.code}`}>Bölüm: {d.name}</option>)}
                    {workspace.projects.filter(p => p.status === 'devam').map(p => <option key={p.id} value={`project:${p.id}`}>Proje: {p.name}</option>)}
                </select>
                <button type="submit" className="m-btn m-btn-gray" disabled={!newText.trim()}>Ekle</button>
            </form>

            {retired.length > 0 && (
                <details>
                    <summary className="cursor-pointer text-[14px] font-semibold m-accent min-h-[34px] flex items-center">Emekli ve reddedilen kurallar ({retired.length})</summary>
                    <div className="flex flex-col mt-1">{retired.map((r, i) => row(r, i, (
                        <button type="button" className="m-btn m-btn-plain !min-h-[36px] !px-2" onClick={() => act({ kind: 'status', id: r.id, status: 'active' }, 'Kural yeniden etkinleştirildi.')}>Yeniden etkinleştir</button>
                    )))}</div>
                </details>
            )}
        </Card>
    );
};
