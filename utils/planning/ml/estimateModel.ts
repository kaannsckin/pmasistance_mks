import { EstimateLogEntry, IssueType, ModelEvalRun, ModelMetrics, Task } from '../../../types';
import { HistoryRecord, PlanningHistory } from '../history';
import { mulberry32, quantileSorted } from '../random';
import { estimateFromHistory, RecordDraft } from '../referenceClass';
import { buildFeatureSpace, draftInput, encode, FeatureSpace, recordInput, TYPES } from './features';
import { contributionsGbm, GbmModel, predictGbm, trainGbm } from './gbm';
import { predictSoftmax, SoftmaxModel, trainSoftmax } from './softmax';

/**
 * Klasik makine öğrenmesi tahmini: eğitime uygun kapanmış kayıtlardan
 *  - efor (gün) ve kapanma süresi (iş günü): gradyan artırmalı ağaçlar,
 *    logaritmik ölçekte; aralık, katlamalı (fold dışı) kalıntıların
 *    kantillerinden (P10 · P50 · P90 efor, P50 · P80 kapanma)
 *  - önem ve tür: çok sınıflı lojistik regresyon (hedefi sızdıran özellik
 *    maskelenir: önem tahmininde önem, tür tahmininde tür ve önem).
 * Model tarayıcıda eğitilir; kayıtlar dışarı gönderilmez, kişi adı özellik
 * değildir. Geçmiş kayıt tahminiyle aynı kayıtlarda zaman ayrımlı sınanır.
 */

export const MODEL_VERSION = 'model-1';
export const MIN_TRAIN = 60;
const MAX_TRAIN = 2500;
const FOLDS = 3;
const MIN_TEST = 20;
const MAX_TEST = 150;
const PRIORITIES: Task['priority'][] = ['Blocker', 'High', 'Medium', 'Low'];

/** Efor ve kapanma süresi regresörleri ve aralık için kalıntı kantilleri */
export interface Regressors {
    effort: GbmModel;
    days: GbmModel;
    /** Logaritmik kalıntı kantilleri (fold dışı) */
    effortResid: { p10: number; p50: number; p90: number };
    daysResid: { p50: number; p80: number };
}

export interface EstimateModel {
    version: string;
    trainedAt: string;
    n: number;
    space: FeatureSpace;
    /** Yalnız bağlamdan (ekip tahmini olmadan) */
    plain: Regressors;
    /** Ekibin ilk tahmini de verildiğinde (yeterli tahminli kayıt yoksa null) */
    estimated: Regressors | null;
    priority: SoftmaxModel | null;
    priorityClasses: Task['priority'][];
    type: SoftmaxModel | null;
    typeClasses: IssueType[];
}

export interface ModelFactor {
    label: string;
    /** Efora etkisi: +0,25 = %25 daha uzun */
    effect: number;
}

export interface ModelEstimate {
    effort: { best: number; likely: number; worst: number };
    days: { p50: number; p80: number };
    priority: { value: Task['priority']; p: number } | null;
    issueType: { value: IssueType; p: number } | null;
    factors: ModelFactor[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const lnEffort = (r: HistoryRecord) => Math.log(Math.max(0.25, r.effortDays));
const lnDays = (r: HistoryRecord) => Math.log(Math.max(0.5, r.days));
const roundsFor = (n: number) => Math.round(Math.min(150, Math.max(40, n / 8)));
const sortedQ = (xs: number[], q: number) => quantileSorted([...xs].sort((a, b) => a - b), q);

const classifier = <C extends string>(X: Float64Array[], labels: (C | undefined)[], order: C[], mask: boolean[]): { model: SoftmaxModel | null; classes: C[] } => {
    const counts = new Map<C, number>();
    labels.forEach(l => { if (l) counts.set(l, (counts.get(l) || 0) + 1); });
    const classes = order.filter(c => (counts.get(c) || 0) >= 3);
    if (classes.length < 2) return { model: null, classes };
    const rows: Float64Array[] = [], y: number[] = [];
    labels.forEach((l, i) => { const k = l ? classes.indexOf(l) : -1; if (k >= 0) { rows.push(X[i]); y.push(k); } });
    return { model: trainSoftmax(rows, y, classes.length, mask), classes };
};

/** Model eğitimi; en az MIN_TRAIN kayıt yoksa null */
export const trainEstimateModel = (records: HistoryRecord[], opts: { seed?: number; now?: Date } = {}): EstimateModel | null => {
    const recs = [...records].sort((a, b) => (a.resolvedAt < b.resolvedAt ? 1 : -1)).slice(0, MAX_TRAIN);
    if (recs.length < MIN_TRAIN) return null;
    const seed = opts.seed ?? 7;
    const space = buildFeatureSpace(recs);
    const X = recs.map(r => encode(space, recordInput(r)));
    const plainX = X.map(x => withoutEstimate(space, x));
    const yE = recs.map(lnEffort);
    const yD = recs.map(lnDays);
    const gbm = { rounds: roundsFor(recs.length), seed };
    const fold = (() => { const rand = mulberry32(seed + 1); return recs.map(() => Math.floor(rand() * FOLDS)); })();
    const regressors = (rows: Float64Array[]): Regressors => {
        // Aralıklar için fold dışı kalıntılar
        const resE: number[] = [], resD: number[] = [];
        for (let k = 0; k < FOLDS; k++) {
            const tr = recs.map((_, i) => i).filter(i => fold[i] !== k);
            const te = recs.map((_, i) => i).filter(i => fold[i] === k);
            if (!te.length || tr.length < MIN_TRAIN / 2) continue;
            const mE = trainGbm(tr.map(i => rows[i]), tr.map(i => yE[i]), gbm);
            const mD = trainGbm(tr.map(i => rows[i]), tr.map(i => yD[i]), gbm);
            te.forEach(i => { resE.push(yE[i] - predictGbm(mE, rows[i])); resD.push(yD[i] - predictGbm(mD, rows[i])); });
        }
        return {
            effort: trainGbm(rows, yE, gbm),
            days: trainGbm(rows, yD, gbm),
            effortResid: resE.length ? { p10: sortedQ(resE, 0.1), p50: sortedQ(resE, 0.5), p90: sortedQ(resE, 0.9) } : { p10: -0.7, p50: 0, p90: 0.7 },
            daysResid: resD.length ? { p50: sortedQ(resD, 0.5), p80: sortedQ(resD, 0.8) } : { p50: 0, p80: 0.5 },
        };
    };
    const estimatedN = recs.filter(r => recordInput(r).estimateDays).length;
    // Sınıflandırıcılar ekip tahminini kullanmaz (taslakta çoğu zaman yoktur; varken yokmuş gibi davranmak dağılımı kaydırır)
    const pi = space.priorityIndex;
    const priorityMask = space.labels.map((_, j) => j !== pi && j !== pi + 1 && j !== pi + 2);
    const typeMask = priorityMask.map((ok, j) => ok && (j < space.typeRange[0] || j >= space.typeRange[1]));
    const pr = classifier(X, recs.map(r => r.priority), PRIORITIES, priorityMask);
    const ty = classifier(X, recs.map(r => r.issueType), TYPES.filter((t): t is IssueType => t !== 'none'), typeMask);
    return {
        version: MODEL_VERSION,
        trainedAt: (opts.now || new Date()).toISOString(),
        n: recs.length,
        space,
        plain: regressors(plainX),
        estimated: estimatedN >= MIN_TRAIN ? regressors(X) : null,
        priority: pr.model,
        priorityClasses: pr.classes,
        type: ty.model,
        typeClasses: ty.classes,
    };
};

const argmax = (p: number[]) => p.reduce((b, v, i) => (v > p[b] ? i : b), 0);

/** Ekip tahmini özelliklerini "yok" yapar (bağlam modeli için) */
const withoutEstimate = (s: FeatureSpace, x: Float64Array): Float64Array => {
    const y = Float64Array.from(x);
    y[s.priorityIndex + 1] = 0;
    y[s.priorityIndex + 2] = -1;
    return y;
};

/** Taslak için model tahmini ve efora en çok etki eden özellikler */
export const predictEstimate = (m: EstimateModel, draft: RecordDraft): ModelEstimate => {
    const full = encode(m.space, draftInput(draft));
    const reg = draft.ownEstimateDays && m.estimated ? m.estimated : m.plain;
    const x = reg === m.plain ? withoutEstimate(m.space, full) : full;
    const e = predictGbm(reg.effort, x);
    const d = predictGbm(reg.days, x);
    const likely = Math.max(0.25, round1(Math.exp(e + reg.effortResid.p50)));
    const best = Math.min(likely, Math.max(0.25, round1(Math.exp(e + reg.effortResid.p10))));
    const worst = Math.max(likely, round1(Math.exp(e + reg.effortResid.p90)));
    const p50 = Math.max(1, Math.round(Math.exp(d + reg.daysResid.p50)));
    const p80 = Math.max(p50, Math.round(Math.exp(d + reg.daysResid.p80)));
    const pp = m.priority ? predictSoftmax(m.priority, x) : null;
    const tp = m.type ? predictSoftmax(m.type, x) : null;

    // Etkenler: yalnız bu kayıtta etkin olan özellikler (önem ve metin uzunluğu her zaman; ekip tahmini girildiyse)
    const { contrib } = contributionsGbm(reg.effort, x, x.length);
    const pi = m.space.priorityIndex;
    const active = (j: number) => j === pi || j === pi + 5 || (j === pi + 2 ? x[pi + 1] === 1 : x[j] > 0);
    const factors: ModelFactor[] = [];
    contrib.forEach((c, j) => {
        if (!c || !active(j)) return;
        const effect = Math.exp(c) - 1;
        if (Math.abs(effect) >= 0.05) factors.push({ label: m.space.labels[j], effect: round2(effect) });
    });
    factors.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
    return {
        effort: { best, likely, worst },
        days: { p50, p80 },
        priority: pp ? { value: m.priorityClasses[argmax(pp)], p: round2(pp[argmax(pp)]) } : null,
        issueType: tp ? { value: m.typeClasses[argmax(tp)], p: round2(tp[argmax(tp)]) } : null,
        factors: factors.slice(0, 5),
    };
};

/** Öneri günlüğü ve sürüm planı için model önerisi (önem ve tür yalnız olasılık ≥ 0,5 ise) */
export const logModel = (e: ModelEstimate): NonNullable<EstimateLogEntry['model']> => ({
    version: MODEL_VERSION, effort: e.effort, p50Days: e.days.p50, p80Days: e.days.p80,
    priority: e.priority && e.priority.p >= 0.5 ? e.priority.value : undefined,
    issueType: e.issueType && e.issueType.p >= 0.5 ? e.issueType.value : undefined,
});

/** Özellik önemi (bağlam efor modeli, toplam kazancın payı) */
export const importanceOf = (m: EstimateModel, top = 8): { label: string; share: number }[] => {
    const total = m.plain.effort.gain.reduce((a, b) => a + b, 0) || 1;
    return m.plain.effort.gain.map((g, j) => ({ label: m.space.labels[j], share: round2(g / total) }))
        .filter(x => x.share > 0).sort((a, b) => b.share - a.share).slice(0, top);
};

// ---------------------------------------------------------------- zaman ayrımlı sınama

const draftOf = (r: HistoryRecord): RecordDraft => ({
    name: r.name, notes: r.notes, issueType: r.issueType, unit: r.unit, priority: r.priority, labels: r.labels, workPackageId: r.workPackageId, projectId: r.projectId,
});
/** Ekibin kendi ilk tahmini (geçmişten üretilmiş tahminlerin oranı yoktur) */
const teamEstimate = (r: HistoryRecord) => (r.ratio !== null && r.estimateDays ? r.estimateDays : undefined);

const mean = (xs: number[]) => (xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const rate = (xs: boolean[]) => (xs.length ? round2(xs.filter(Boolean).length / xs.length) : null);

/**
 * Son kapanan kayıtlar (en çok MAX_TEST) sınama kümesidir; model yalnız
 * onlardan önce kapanmış kayıtlarla eğitilir, geçmiş kayıt tahmini de aynı
 * bilgiyle yapılır. Önem ve tür doğruluğunda taslaktan ilgili alan çıkarılır.
 * İki durum ayrı ölçülür ve ayrı karar verilir: ekip tahmini olmadan (ana
 * ölçü) ve ekibin ilk tahmini de verildiğinde (model onu da kullanır).
 */
export const evaluateEstimateModel = (history: PlanningHistory, opts: { seed?: number; now?: Date; id?: string } = {}): ModelEvalRun => {
    const now = opts.now || new Date();
    const recs = [...history.records].sort((a, b) => (a.resolvedAt < b.resolvedAt ? -1 : 1));
    const testN = Math.min(MAX_TEST, Math.max(MIN_TEST, Math.round(recs.length * 0.2)));
    const test = recs.slice(-testN);
    const cutoff = test[0]?.resolvedAt || now.toISOString();
    const train = recs.filter(r => r.resolvedAt < cutoff);
    const empty: ModelMetrics = { mae: null, coverage: null, daysMae: null, p80Coverage: null, priorityAccuracy: null, typeAccuracy: null };
    const run: ModelEvalRun = {
        id: opts.id || `ml-${now.getTime().toString(36)}`, at: now.toISOString(), version: MODEL_VERSION,
        nTrain: train.length, nTest: 0, cutoff, model: empty, reference: empty, better: null,
        withEstimate: { n: 0, mae: null, referenceMae: null, coverage: null, better: null }, reasons: [], importance: [],
    };
    if (recs.length < MIN_TRAIN + MIN_TEST || train.length < MIN_TRAIN) {
        run.reasons.push(`Sınama için en az ${MIN_TRAIN + MIN_TEST} eğitime uygun kapanmış kayıt gerekir (şu an ${recs.length}).`);
        return run;
    }
    const model = trainEstimateModel(train, { seed: opts.seed, now })!;
    const past = (r: HistoryRecord) => r.resolvedAt < cutoff;
    const rows = test.map(r => {
        const d = draftOf(r);
        const m = predictEstimate(model, d);
        const ref = estimateFromHistory(d, history, { filter: past });
        const refP = estimateFromHistory({ ...d, priority: undefined }, history, { filter: past }).priority?.value;
        const refT = estimateFromHistory({ ...d, priority: undefined, issueType: undefined }, history, { filter: past }).issueType?.value;
        const own = teamEstimate(r);
        const mOwn = own ? predictEstimate(model, { ...d, ownEstimateDays: own }) : null;
        return { r, m, ref, refP, refT, mOwn };
    }).filter(x => x.ref.effort && x.ref.duration);
    run.nTest = rows.length;
    const metrics = (pick: 'm' | 'ref'): ModelMetrics => ({
        mae: mean(rows.map(x => Math.abs((pick === 'm' ? x.m.effort.likely : x.ref.effort!.likely) - x.r.effortDays))),
        coverage: rate(rows.map(x => { const e = pick === 'm' ? x.m.effort : x.ref.effort!; return x.r.effortDays >= e.best - 1e-9 && x.r.effortDays <= e.worst + 1e-9; })),
        daysMae: mean(rows.map(x => Math.abs((pick === 'm' ? x.m.days.p50 : x.ref.duration!.p50) - x.r.days))),
        p80Coverage: rate(rows.map(x => x.r.days <= (pick === 'm' ? x.m.days.p80 : x.ref.duration!.p80) + 1e-9)),
        priorityAccuracy: rate(rows.map(x => (pick === 'm' ? x.m.priority?.value : x.refP) === x.r.priority)),
        typeAccuracy: rate(rows.filter(x => x.r.issueType).map(x => (pick === 'm' ? x.m.issueType?.value : x.refT) === x.r.issueType)),
    });
    run.model = metrics('m');
    run.reference = metrics('ref');
    run.importance = importanceOf(model);
    if (rows.length < MIN_TEST) {
        run.reasons.push(`Karşılaştırılabilir sınama kaydı az (${rows.length}); karar verilmedi.`);
        return run;
    }
    const dec = (v: number | null) => (v === null ? '—' : String(v).replace('.', ','));
    const pct = (v: number | null) => (v === null ? '—' : `%${Math.round(v * 100)}`);
    const better = run.model.mae! <= run.reference.mae! * 0.97;
    const honest = run.model.coverage! >= 0.65;
    run.better = better && honest;
    const own = rows.filter(x => x.mOwn);
    const ownMae = mean(own.map(x => Math.abs(x.mOwn!.effort.likely - x.r.effortDays)));
    const ownRef = mean(own.map(x => Math.abs(x.ref.effort!.likely - x.r.effortDays)));
    const ownCov = rate(own.map(x => x.r.effortDays >= x.mOwn!.effort.best - 1e-9 && x.r.effortDays <= x.mOwn!.effort.worst + 1e-9));
    run.withEstimate = {
        n: own.length, mae: ownMae, referenceMae: ownRef, coverage: ownCov,
        better: own.length < MIN_TEST ? null : ownMae! <= ownRef! * 0.97 && ownCov! >= 0.65,
    };
    run.reasons.push(better
        ? `Model efor hatası ${dec(run.model.mae)} gün, geçmiş kayıt tahmini ${dec(run.reference.mae)} gün: model daha isabetli.`
        : `Model efor hatası ${dec(run.model.mae)} gün, geçmiş kayıt tahmini ${dec(run.reference.mae)} gün: model belirgin biçimde daha isabetli değil.`);
    if (!honest) run.reasons.push(`Model aralığının gerçeği kapsama oranı ${pct(run.model.coverage)}; en az %65 olmalı (aralık dar).`);
    if (run.withEstimate.better !== null) {
        run.reasons.push(`Ekibin ilk tahmini de verildiğinde (${run.withEstimate.n} kayıt) model hatası ${dec(ownMae)} gün, geçmiş kayıt tahmini ${dec(ownRef)} gün${run.withEstimate.better ? ': model daha isabetli.' : '.'}`);
    }
    if (run.model.priorityAccuracy !== null && run.reference.priorityAccuracy !== null) {
        run.reasons.push(`Önem doğruluğu: model ${pct(run.model.priorityAccuracy)}, geçmiş kayıtlar ${pct(run.reference.priorityAccuracy)}.`);
    }
    return run;
};

export const MAX_MODEL_EVALS = 20;
export const appendModelEval = (runs: ModelEvalRun[] | undefined, run: ModelEvalRun): ModelEvalRun[] => [...(runs || []), run].slice(-MAX_MODEL_EVALS);
