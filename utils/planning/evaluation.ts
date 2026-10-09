import { EffortRange, EstimateGatePolicy, EvalRun, GoldenItem, IssueType, Leave, Person, Project, Task, TaskStatus } from '../../types';
import { estimatedAt, HistoryRecord, MIN_CALIBRATION, PlanningHistory } from './history';
import { ISSUE_TYPE_LABELS, pertDays } from './lifecycle';
import { SimInput, SimResult } from './monteCarlo';
import { quantileSorted } from './random';
import { estimateFromHistory, ReferenceEstimate } from './referenceClass';
import { buildSimulation, simulationStart } from './simulationInput';
import { workdaysBetween } from './workdays';
import { toIsoDay } from '../calendarRange';

/**
 * Tahmin kalitesinin değerlendirmesi (yönetici konsolu › Tahmin kalitesi):
 *  1. Benzer kayıt tahmininin geriye dönük testi: her kapanmış kayıt, yalnız
 *     kendisinden ÖNCE kapanmış kayıtlarla tahmin edilir ve gerçekle
 *     karşılaştırılır (zaman ayrımı; geleceği görmeden). Dürüst aralıkta
 *     gerçeklerin ≈ %50'si P50'nin, ≈ %80'i P80'in altında kalmalı.
 *  2. Sürüm simülasyonunun geriye dönük testi: tamamlanmış geçmiş sürümler,
 *     başladıkları gün bilinen tahminler ve o güne kadarki geçmişle simüle
 *     edilir; P80 tarihine gerçekten ≈ %80 oranında yetişilmeli.
 *  3. Kalibrasyon izleme: birim × tür grubunda gerçekleşen ÷ tahmin oranı ve
 *     son dönemdeki kayması.
 *  4. Altın set ve kalite kapısı: doğrulanmış kayıtlarda (kaydın kendisi
 *     geçmişten çıkarılarak) geçmiş kayıt tahmini ve AI önerisi ölçülür; AI
 *     eşikleri geçmezse ve kapı zorunluysa AI tahmin önerisi gösterilmez.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;
/** Türkçe ondalık (0,45) */
const dec = (v: number) => String(round2(v)).replace('.', ',');
const median = (xs: number[]) => (xs.length ? quantileSorted([...xs].sort((a, b) => a - b), 0.5) : null);
const rate = (xs: boolean[]): number | null => (xs.length ? round2(xs.filter(Boolean).length / xs.length) : null);
const mean = (xs: number[]): number | null => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const within = (v: number, e: EffortRange) => v >= e.best - 1e-9 && v <= e.worst + 1e-9;
const fold = (s?: string) => (s || '').trim().toLocaleLowerCase('tr-TR');

const draftOf = (r: HistoryRecord) => ({ name: r.name, notes: r.notes, issueType: r.issueType, unit: r.unit, priority: r.priority, labels: r.labels, workPackageId: r.workPackageId, projectId: r.projectId });

// ---------------------------------------------------------------- 1. kayıt tahmini

export interface RecordBacktestItem {
    id: string;
    unit: string;
    issueType?: IssueType;
    actualDays: number;
    actualEffort: number;
    p50: number;
    p80: number;
    p90: number;
    effort: EffortRange;
    /** Kaydın kendi (ekip) tahmini, geçmişe dayalı değilse */
    teamEstimate: number | null;
}

/** Test edilecek kayıtlar: en yeni kapananlar önce */
export const backtestTargets = (history: PlanningHistory, limit = 150): HistoryRecord[] =>
    [...history.records].sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1)).slice(0, limit);

/** Kaydı, yalnız kendisinden önce kapanmış kayıtlarla tahmin eder; yeterli geçmiş yoksa null */
export const backtestRecord = (rec: HistoryRecord, history: PlanningHistory): RecordBacktestItem | null => {
    const at = estimatedAt(rec);
    const est = estimateFromHistory(draftOf(rec), history, { filter: r => r !== rec && r.resolvedAt < at });
    if (est.method === 'none' || !est.duration || !est.effort) return null;
    return {
        id: rec.id, unit: rec.unit, issueType: rec.issueType, actualDays: rec.days, actualEffort: rec.effortDays,
        p50: est.duration.p50, p80: est.duration.p80, p90: est.duration.p90, effort: est.effort,
        teamEstimate: rec.ratio !== null ? rec.estimateDays : null,
    };
};

export interface RecordBacktestSummary {
    n: number;
    skipped: number;
    /** Gerçek kapanma süresinin tahmin yüzdeliğinin altında kalma oranı (ideal: 0,5 · 0,8 · 0,9) */
    coverage: { p50: number | null; p80: number | null; p90: number | null };
    maeDays: number | null; // |gerçek − P50| ortalaması (iş günü)
    effort: { mae: number | null; coverage: number | null }; // efor: olası ile fark, [P10, P90] kapsama (ideal 0,8)
    /** Aynı kayıtlarda ekibin kendi tahmini ile geçmiş kayıt tahmini */
    vsTeam: { n: number; teamMae: number | null; referenceMae: number | null };
    groups: { key: string; label: string; n: number; p80: number | null; mae: number | null }[];
    advice: string[];
}

export const summarizeRecordBacktest = (items: RecordBacktestItem[], skipped: number): RecordBacktestSummary => {
    const team = items.filter(i => i.teamEstimate !== null);
    const g = new Map<string, RecordBacktestItem[]>();
    items.forEach(i => { const k = `${fold(i.unit)}|${i.issueType || ''}`; g.set(k, [...(g.get(k) || []), i]); });
    const s: RecordBacktestSummary = {
        n: items.length,
        skipped,
        coverage: { p50: rate(items.map(i => i.actualDays <= i.p50 + 1e-9)), p80: rate(items.map(i => i.actualDays <= i.p80 + 1e-9)), p90: rate(items.map(i => i.actualDays <= i.p90 + 1e-9)) },
        maeDays: mean(items.map(i => Math.abs(i.actualDays - i.p50))),
        effort: { mae: mean(items.map(i => Math.abs(i.actualEffort - i.effort.likely))), coverage: rate(items.map(i => within(i.actualEffort, i.effort))) },
        vsTeam: { n: team.length, teamMae: mean(team.map(i => Math.abs(i.actualEffort - i.teamEstimate!))), referenceMae: mean(team.map(i => Math.abs(i.actualEffort - i.effort.likely))) },
        groups: [...g.entries()].map(([key, xs]) => ({
            key,
            label: `${xs[0].unit || 'Birimsiz'} · ${xs[0].issueType ? ISSUE_TYPE_LABELS[xs[0].issueType] : 'türsüz'}`,
            n: xs.length,
            p80: rate(xs.map(i => i.actualDays <= i.p80 + 1e-9)),
            mae: mean(xs.map(i => Math.abs(i.actualDays - i.p50))),
        })).sort((a, b) => b.n - a.n).slice(0, 8),
        advice: [],
    };
    if (s.n < 20) s.advice.push(`Güvenilir ölçüm için en az 20 test edilebilir kayıt gerekir (şu an ${s.n}).`);
    else {
        const c = s.coverage.p80!;
        if (c < 0.7) s.advice.push(`P80 kayıtların yalnız %${Math.round(c * 100)} kadarında tuttu: aralıklar dar; son dönemde süreler uzamış olabilir (Kalibrasyon kartına bakın).`);
        else if (c > 0.9) s.advice.push(`P80 kayıtların %${Math.round(c * 100)} kadarında tuttu: aralıklar gereğinden geniş; taahhüt tarihleri olduğundan geç görünür.`);
        else s.advice.push(`P80 kayıtların %${Math.round(c * 100)} kadarında tuttu (hedef ≈ %80): aralıklar dürüst.`);
        const { teamMae, referenceMae, n } = s.vsTeam;
        if (n >= 10 && teamMae !== null && referenceMae !== null) {
            s.advice.push(referenceMae < teamMae
                ? `Geçmiş kayıt tahmini, ekibin kendi tahmininden daha isabetli (ortalama hata ${dec(referenceMae)} gün, ekip ${dec(teamMae)} gün; ${n} kayıt).`
                : `Ekibin kendi tahmini geçmiş kayıt tahmininden daha isabetli (ekip ${dec(teamMae)} gün, geçmiş ${dec(referenceMae)} gün; ${n} kayıt).`);
        }
    }
    return s;
};

// ---------------------------------------------------------------- 2. sürüm simülasyonu

export interface ReleaseCase {
    projectId: string;
    projectName: string;
    version: number;
    label: string;
    start: string; // YYYY-AA-GG
    actualEnd: string;
    actualOffset: number; // iş günü (başlangıç dahil)
    taskCount: number;
    input: SimInput;
}

/**
 * Tamamlanmış geçmiş sürümler: sürümün bütün kayıtları kapanmış ve en az
 * `minTasks` kaydın tahmini var. Sürüm, ilk kaydının başladığı gün o güne
 * kadar kapanmış geçmişle ve kayıtların bilinen tahminleriyle simüle edilir.
 * Ekip bugünkü ekiptir; o sırada projede yürüyen başka işler hesaba katılmaz.
 */
export const releaseCases = (projects: Project[], history: PlanningHistory, ctx: { people?: Person[]; leaves?: Leave[] } = {}, opts: { minTasks?: number; iterations?: number; sprintName?: (p: Project, v: number) => string } = {}): ReleaseCase[] => {
    const out: ReleaseCase[] = [];
    projects.forEach(p => {
        const planned = p.tasks.filter(t => t.includeInSprints !== false && (t.version || 0) > 0);
        const versions = [...new Set(planned.map(t => t.version))].sort((a, b) => a - b);
        versions.forEach(v => {
            const tasks = planned.filter(t => t.version === v);
            if (tasks.some(t => t.status !== TaskStatus.Done || !t.resolvedAt)) return;
            const starts = tasks.map(t => t.startedAt || t.createdAt).filter(Boolean) as string[];
            if (!starts.length) return;
            const startIso = starts.sort()[0];
            const startDate = new Date(startIso);
            const past: PlanningHistory = { report: history.report, records: history.records.filter(r => r.resolvedAt < startIso) };
            // Sürümün tüm kayıtları simüle edilir (tahmini olmayan, o güne kadar kapanmış benzer
            // kayıtlardan); gerçek bitiş yalnız simüle edilen kayıtlar üzerinden ölçülür
            const ids = new Set(tasks.map(t => t.id));
            const fresh: Task[] = tasks.map(t => ({
                ...t, status: TaskStatus.ToDo, startedAt: undefined, resolvedAt: undefined, statusLog: undefined, version: 1,
                predecessor: t.predecessor && ids.has(t.predecessor) ? t.predecessor : null,
            }));
            const built = buildSimulation({ ...p, tasks: fresh }, past, ctx, { now: startDate, scope: 'open', testDays: 0, iterations: opts.iterations ?? 1000 });
            const simulated = new Set(built.tasks.map(t => t.id));
            if (simulated.size < (opts.minTasks ?? 3)) return;
            const endIso = tasks.filter(t => simulated.has(t.id)).map(t => t.resolvedAt!).sort().slice(-1)[0];
            const simStart = simulationStart(startDate);
            out.push({
                projectId: p.id, projectName: p.name, version: v, label: opts.sprintName?.(p, v) || `Sürüm ${v}`,
                start: toIsoDay(simStart), actualEnd: endIso.slice(0, 10), actualOffset: workdaysBetween(simStart, endIso) ?? 0,
                taskCount: simulated.size, input: built.input,
            });
        });
    });
    return out;
};

export interface ReleaseBacktestRow {
    projectName: string;
    label: string;
    start: string;
    actualEnd: string;
    taskCount: number;
    actualOffset: number;
    p50: number;
    p80: number;
    deterministic: number;
    hit50: boolean;
    hit80: boolean;
    hitDeterministic: boolean;
}

export const scoreReleaseCase = (c: ReleaseCase, r: SimResult): ReleaseBacktestRow => ({
    projectName: c.projectName, label: c.label, start: c.start, actualEnd: c.actualEnd, taskCount: c.taskCount, actualOffset: c.actualOffset,
    p50: Math.ceil(r.release.p50), p80: Math.ceil(r.release.p80), deterministic: r.deterministic,
    hit50: c.actualOffset <= Math.ceil(r.release.p50), hit80: c.actualOffset <= Math.ceil(r.release.p80), hitDeterministic: c.actualOffset <= r.deterministic,
});

export const summarizeReleaseBacktest = (rows: ReleaseBacktestRow[]) => {
    const s = {
        n: rows.length,
        hit80: rate(rows.map(r => r.hit80)),
        hit50: rate(rows.map(r => r.hit50)),
        hitDeterministic: rate(rows.map(r => r.hitDeterministic)),
        medianError: median(rows.map(r => r.actualOffset - r.p50)),
        advice: [] as string[],
    };
    if (s.n < 5) s.advice.push(`Anlamlı bir oran için en az 5 tamamlanmış sürüm gerekir (şu an ${s.n}). Sürümler kapandıkça dolar.`);
    else if (s.hit80 !== null) {
        s.advice.push(s.hit80 >= 0.7 && s.hit80 <= 0.9
            ? `P80 tarihine sürümlerin %${Math.round(s.hit80 * 100)} kadarında yetişildi (hedef ≈ %80): simülasyon dürüst.`
            : s.hit80 < 0.7
                ? `P80 tarihine sürümlerin yalnız %${Math.round(s.hit80 * 100)} kadarında yetişildi: simülasyon iyimser; sürümlerde plan dışı iş, kapsam artışı ya da eşzamanlı projeler olabilir.`
                : `P80 tarihine sürümlerin %${Math.round(s.hit80 * 100)} kadarında yetişildi: simülasyon temkinli.`);
        if (s.hitDeterministic !== null) s.advice.push(`Karşılaştırma: tek nokta plan (herkes tahmin ettiği sürede bitirirse) sürümlerin %${Math.round(s.hitDeterministic * 100)} kadarında tuttu.`);
    }
    return s;
};

// ---------------------------------------------------------------- 3. kalibrasyon izleme

export interface CalibrationTrendRow {
    key: string;
    label: string;
    n: number;
    median: number;
    p20: number;
    p80: number;
    recentN: number;
    recentMedian: number | null;
    /** Son dönem ÷ tüm dönem − 1 (0,25 = son dönemde %25 daha uzun) */
    drift: number | null;
}

export const calibrationTrend = (history: PlanningHistory, now: Date = new Date(), recentDays = 90, min = MIN_CALIBRATION): CalibrationTrendRow[] => {
    const since = new Date(now.getTime() - recentDays * 86_400_000).toISOString();
    const g = new Map<string, HistoryRecord[]>();
    history.records.forEach(r => {
        if (r.ratio === null) return;
        const k = `${fold(r.unit)}|${r.issueType || ''}`;
        g.set(k, [...(g.get(k) || []), r]);
    });
    return [...g.entries()]
        .filter(([, xs]) => xs.length >= min)
        .map(([key, xs]) => {
            const all = xs.map(r => r.ratio!).sort((a, b) => a - b);
            const recent = xs.filter(r => r.resolvedAt >= since).map(r => r.ratio!).sort((a, b) => a - b);
            const m = quantileSorted(all, 0.5);
            const rm = recent.length >= 5 ? quantileSorted(recent, 0.5) : null;
            return {
                key,
                label: `${xs[0].unit || 'Birimsiz'} · ${xs[0].issueType ? ISSUE_TYPE_LABELS[xs[0].issueType] : 'türsüz'}`,
                n: xs.length, median: round2(m), p20: round2(quantileSorted(all, 0.2)), p80: round2(quantileSorted(all, 0.8)),
                recentN: recent.length, recentMedian: rm === null ? null : round2(rm), drift: rm === null ? null : round2(rm / m - 1),
            };
        })
        .sort((a, b) => b.n - a.n);
};

// ---------------------------------------------------------------- 4. altın set ve kalite kapısı

/** Altın sete eklenebilecek kayıtlar: eğitime uygun kapanmış kayıtlar */
/** Kayıt kimliği yalnız proje içinde tekil; altın set kaydı proje + kimlikle eşlenir */
export const goldKey = (projectId: string, taskId: string) => `${projectId}|${taskId}`;

/** Altın set değerlendirmesinde AI yanıtlarının anahtarı */
export const caseKey = (c: Pick<GoldCase, 'record'>) => goldKey(c.record.projectId, c.record.id);

export const goldenCandidates = (history: PlanningHistory, golden: GoldenItem[] = []): HistoryRecord[] => {
    const taken = new Set(golden.map(g => goldKey(g.projectId, g.taskId)));
    return history.records.filter(r => !taken.has(goldKey(r.projectId, r.id))).sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1));
};

export const goldenFromRecord = (r: HistoryRecord, now: Date = new Date()): GoldenItem => ({ taskId: r.id, projectId: r.projectId, priority: r.priority, issueType: r.issueType, addedAt: now.toISOString() });

/** Altın set kaydının tahmin taslağı: başlık, açıklama, birim, proje, iş paketi */
export const goldDraft = (r: HistoryRecord) => ({ ...draftOf(r), priority: undefined, issueType: undefined });

export interface GoldCase {
    item: GoldenItem;
    record: HistoryRecord;
    /** Kaydın kendisi geçmişten çıkarılarak yapılan geçmiş kayıt tahmini */
    ref: ReferenceEstimate;
}

/** Altın setteki kayıtlar (hâlâ eğitime uygun olanlar) ve kendileri hariç tahminleri */
export const goldCases = (golden: GoldenItem[], history: PlanningHistory, visibleProjectIds?: ReadonlySet<string>): GoldCase[] => {
    const byKey = new Map(history.records.map(r => [goldKey(r.projectId, r.id), r]));
    return golden.flatMap(item => {
        const record = byKey.get(goldKey(item.projectId, item.taskId));
        if (!record) return [];
        // Kayıt kendisi (ve başka projeye aktarılmış aynı Jira kaydı) geçmişten çıkarılır
        const jira = record.jiraId?.toUpperCase();
        const self = (r: HistoryRecord) => r === record || (!!jira && r.jiraId?.toUpperCase() === jira);
        // Önem ve tür sorulan şeydir: taslağa girmez (yoksa doğruluk yapay olarak yükselir)
        const ref = estimateFromHistory(goldDraft(record), history, { visibleProjectIds, filter: r => !self(r) });
        return [{ item, record, ref }];
    });
};

export interface GoldAiAnswer {
    effort: EffortRange;
    priority?: Task['priority'];
    issueType?: IssueType;
    confidence: 'high' | 'medium' | 'low';
    unknownEvidence: boolean;
}

export const MIN_GATE_CASES = 10;

/**
 * Altın set değerlendirmesi. AI yanıtı olmayan kayıtlar (hata, iptal) AI
 * ölçülerine girmez; karşılaştırma adil olsun diye geçmiş kayıt tahmini de
 * aynı yanıtlanmış kayıtlarda ölçülür. Okunamayan önem ya da tür yanlış
 * sayılır. Kapı: AI ortalama hatası ≤ geçmiş kayıt hatası × oran, önem
 * doğruluğu ve aralık kapsaması alt sınırların üstünde olmalı.
 */
export const scoreGoldRun = (
    cases: GoldCase[],
    ai: Map<string, GoldAiAnswer> | null,
    gate: EstimateGatePolicy,
    meta: { id: string; at: string; promptVersion: string; model?: string },
): EvalRun => {
    const withRef = cases.filter(c => c.ref.effort && (!ai || ai.has(caseKey(c))));
    const reference = {
        mae: mean(withRef.map(c => Math.abs(c.ref.effort!.likely - c.record.effortDays))),
        coverage: rate(withRef.map(c => within(c.record.effortDays, c.ref.effort!))),
        priorityAccuracy: rate(withRef.map(c => c.ref.priority?.value === c.item.priority)), // öneri yoksa yanlış (AI ile aynı ölçü)
    };
    const answered = ai ? cases.filter(c => ai.has(caseKey(c))) : [];
    const A = (c: GoldCase) => ai!.get(caseKey(c))!;
    const aiStats = ai ? {
        n: answered.length,
        mae: mean(answered.map(c => Math.abs(A(c).effort.likely - c.record.effortDays))),
        coverage: rate(answered.map(c => within(c.record.effortDays, A(c).effort))),
        priorityAccuracy: rate(answered.map(c => A(c).priority === c.item.priority)),
        typeAccuracy: rate(answered.filter(c => c.item.issueType).map(c => A(c).issueType === c.item.issueType)),
        lowConfidence: rate(answered.map(c => A(c).confidence === 'low')),
        unknownEvidence: rate(answered.map(c => A(c).unknownEvidence)),
    } : null;

    const reasons: string[] = [];
    let passed: boolean | null = null;
    if (!aiStats) reasons.push('AI çalıştırılmadı; yalnız geçmiş kayıt tahmini ölçüldü.');
    else if (aiStats.n < MIN_GATE_CASES) reasons.push(`Kapı için en az ${MIN_GATE_CASES} yanıtlanmış kayıt gerekir (${aiStats.n}).`);
    else {
        passed = true;
        if (aiStats.mae !== null && reference.mae !== null && aiStats.mae > reference.mae * gate.maxMaeRatio) {
            passed = false;
            reasons.push(`AI ortalama hatası ${dec(aiStats.mae)} gün; sınır ${dec(round2(reference.mae * gate.maxMaeRatio))} gün (geçmiş kayıt tahmini ${dec(reference.mae)} gün × ${dec(gate.maxMaeRatio)}).`);
        }
        if (aiStats.priorityAccuracy !== null && aiStats.priorityAccuracy < gate.minPriorityAccuracy) {
            passed = false;
            reasons.push(`Önem doğruluğu %${Math.round(aiStats.priorityAccuracy * 100)}; alt sınır %${Math.round(gate.minPriorityAccuracy * 100)}.`);
        }
        if (aiStats.coverage !== null && aiStats.coverage < gate.minCoverage) {
            passed = false;
            reasons.push(`AI efor aralığının gerçeği kapsama oranı %${Math.round(aiStats.coverage * 100)}; alt sınır %${Math.round(gate.minCoverage * 100)}.`);
        }
        if (passed) reasons.push('Kalite kapısı geçildi.');
    }
    return { ...meta, n: cases.length, reference, ai: aiStats, passed, reasons };
};

export type GateStatus = 'none' | 'passed' | 'failed' | 'stale' | 'insufficient';

export const GATE_LABELS: Record<GateStatus, string> = {
    none: 'Henüz değerlendirilmedi',
    passed: 'Kapıdan geçti',
    failed: 'Kapıdan geçmedi',
    stale: 'Model değişti, yeniden değerlendirilmeli',
    insufficient: 'Yetersiz örnek',
};

/**
 * Güncel istem sürümünün (ve modelin) son değerlendirmesine göre kapı durumu.
 * Son koşu karar veremediyse (ör. AI çoğu kayıtta hata verdi) aynı modelle
 * yapılmış son kararlı koşu geçerlidir: geçmeyen kapı bu yolla kalkmaz.
 */
export const gateStatus = (runs: EvalRun[] | undefined, promptVersion: string, model?: string): { status: GateStatus; run?: EvalRun } => {
    const list = [...(runs || [])].reverse().filter(r => r.promptVersion === promptVersion && r.ai);
    const run = list[0];
    if (!run) return { status: 'none' };
    if (model && run.model && run.model !== model) return { status: 'stale', run };
    if (run.passed === null) {
        const decisive = list.find(r => r.passed !== null && (r.model || '') === (run.model || ''));
        return decisive ? { status: decisive.passed ? 'passed' : 'failed', run: decisive } : { status: 'insufficient', run };
    }
    return { status: run.passed ? 'passed' : 'failed', run };
};

export const MAX_EVAL_RUNS = 50;
export const appendEvalRun = (runs: EvalRun[] | undefined, run: EvalRun): EvalRun[] => [...(runs || []), run].slice(-MAX_EVAL_RUNS);
