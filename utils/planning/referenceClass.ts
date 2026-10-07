import { IssueType, Task } from '../../types';
import { terms } from '../rag/text';
import { Calibration, calibrator, HistoryRecord, PlanningHistory } from './history';
import { effectiveN, weightedQuantile } from './random';

/**
 * Referans sınıfı tahmini (reference class forecasting): yeni kayda en çok
 * benzeyen kapanmış kayıtlar bulunur ve onların GERÇEK süreleri tahmini
 * belirler. Benzerlik = metin (TF-IDF kosinüs, Türkçe gövdeleme) + nitelik
 * (tür, birim, öncelik, proje, etiket/iş paketi). Yeterli benzer kayıt yoksa
 * sırayla tür × birim grubuna, sonra tüm geçmişe düşülür ve güven düşer.
 *
 * Sonuç tek sayı değil aralıktır: kapanma süresi P50/P80/P90 ve efor
 * önerisi (iyimser P10 · olası P50 · kötümser P90). Kullanıcı kendi
 * tahminini girdiyse geçmiş sapma oranıyla düzeltilmiş hâli de verilir.
 */

export const MIN_REFS = 5;
const TOP_K = 20;
const MIN_SIMILARITY = 0.3;
const EVIDENCE = 6;

export interface RecordDraft {
    name: string;
    notes?: string;
    issueType?: IssueType;
    unit?: string;
    priority?: Task['priority'];
    labels?: string[];
    workPackageId?: string;
    projectId?: string;
    /** Kullanıcının kendi efor tahmini (gün, olası değer) */
    ownEstimateDays?: number;
}

export interface ReferenceMatch {
    record: HistoryRecord;
    score: number; // 0–1
    text: number; // metin benzerliği 0–1
    /** Kayıt kullanıcının görebildiği bir projede mi (değilse ad gösterilmez) */
    visible: boolean;
}

export type ReferenceMethod = 'similar' | 'group' | 'all' | 'none';
export type Confidence = 'high' | 'medium' | 'low';

export interface ReferenceEstimate {
    method: ReferenceMethod;
    methodLabel: string;
    n: number;
    effectiveN: number;
    /** Kanıt: en benzer kayıtlar */
    matches: ReferenceMatch[];
    /** Kapanma süresi (iş günü) */
    duration: { p50: number; p80: number; p90: number } | null;
    /** Efor önerisi (gün) */
    effort: { best: number; likely: number; worst: number } | null;
    /** Simülasyon için efor örnekleri (referansların efor eşdeğerleri) */
    effortSamples: number[];
    effortWeights: number[];
    priority: { value: Task['priority']; share: number } | null;
    issueType: { value: IssueType; share: number } | null;
    calibration: Calibration | null;
    /** Kullanıcı tahmini, geçmiş sapmayla düzeltilmiş (gün) */
    calibrated: { likely: number; low: number; high: number } | null;
    confidence: Confidence;
    reasons: string[];
}

export const METHOD_LABELS: Record<ReferenceMethod, string> = {
    similar: 'Benzer kapanmış kayıtlar',
    group: 'Aynı tür ve birimdeki kayıtlar',
    all: 'Tüm geçmiş kayıtlar',
    none: 'Geçmiş veri yok',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = { high: 'Yüksek güven', medium: 'Orta güven', low: 'Düşük güven' };

const fold = (s?: string) => (s || '').trim().toLocaleLowerCase('tr-TR');
const half = (v: number) => Math.max(0.5, Math.round(v * 2) / 2);
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- metin benzerliği

interface TextIndex {
    idf: Map<string, number>;
    vectors: Map<string, number>[];
    norms: number[];
    // Katlanmış nitelikler (toLocaleLowerCase her karşılaştırmada pahalı)
    units: string[];
    labels: string[][];
}

const indexCache = new WeakMap<PlanningHistory, TextIndex>();

const vectorOf = (ts: string[], idf: Map<string, number>, fallbackIdf: number): Map<string, number> => {
    const v = new Map<string, number>();
    ts.forEach(t => v.set(t, (v.get(t) || 0) + 1));
    v.forEach((tf, t) => v.set(t, (1 + Math.log(tf)) * (idf.get(t) ?? fallbackIdf)));
    return v;
};
const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));

const textIndex = (h: PlanningHistory): TextIndex => {
    const hit = indexCache.get(h);
    if (hit) return hit;
    const df = new Map<string, number>();
    h.records.forEach(r => new Set(r.terms).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    const N = Math.max(1, h.records.length);
    const idf = new Map<string, number>();
    df.forEach((n, t) => idf.set(t, Math.log(1 + N / n)));
    const vectors = h.records.map(r => vectorOf(r.terms, idf, Math.log(1 + N)));
    const idx = { idf, vectors, norms: vectors.map(norm), units: h.records.map(r => fold(r.unit)), labels: h.records.map(r => r.labels.map(fold)) };
    indexCache.set(h, idx);
    return idx;
};

// ---------------------------------------------------------------- nitelik benzerliği

const ATTR_WEIGHTS = { type: 0.35, unit: 0.25, priority: 0.15, project: 0.15, context: 0.1 };

interface DraftKeys { type?: IssueType; unit: string; priority?: Task['priority']; projectId?: string; labels: string[]; workPackageId?: string }

const attrSimilarity = (d: DraftKeys, r: HistoryRecord, unit: string, labels: string[]): number | null => {
    let w = 0, s = 0;
    const add = (weight: number, defined: boolean, match: boolean) => { if (!defined) return; w += weight; if (match) s += weight; };
    add(ATTR_WEIGHTS.type, !!d.type, d.type === r.issueType);
    add(ATTR_WEIGHTS.unit, !!d.unit, d.unit === unit);
    add(ATTR_WEIGHTS.priority, !!d.priority, d.priority === r.priority);
    add(ATTR_WEIGHTS.project, !!d.projectId, d.projectId === r.projectId);
    const ctxDefined = d.labels.length > 0 || !!d.workPackageId;
    const ctxMatch = (!!d.workPackageId && d.workPackageId === r.workPackageId) || d.labels.some(l => labels.includes(l));
    add(ATTR_WEIGHTS.context, ctxDefined, ctxMatch);
    return w > 0 ? s / w : null;
};

/** Taslağa göre geçmiş kayıtların benzerlik puanları (yüksekten düşüğe) */
export const rankSimilar = (draft: RecordDraft, history: PlanningHistory, visibleProjectIds?: ReadonlySet<string>): ReferenceMatch[] => {
    const idx = textIndex(history);
    const q = vectorOf(terms(`${draft.name} ${draft.notes || ''}`), idx.idf, Math.log(1 + Math.max(1, history.records.length)));
    const qn = norm(q);
    const keys: DraftKeys = {
        type: draft.issueType, unit: fold(draft.unit), priority: draft.priority, projectId: draft.projectId,
        labels: (draft.labels || []).map(fold).filter(Boolean), workPackageId: draft.workPackageId,
    };
    return history.records
        .map((r, i) => {
            let dot = 0;
            if (qn > 0 && idx.norms[i] > 0) q.forEach((x, t) => { const y = idx.vectors[i].get(t); if (y) dot += x * y; });
            const text = qn > 0 && idx.norms[i] > 0 ? dot / (qn * idx.norms[i]) : 0;
            const attr = attrSimilarity(keys, r, idx.units[i], idx.labels[i]);
            const score = qn > 0 ? (attr === null ? text : 0.55 * text + 0.45 * attr) : attr ?? 0;
            return { record: r, score, text, visible: !visibleProjectIds || visibleProjectIds.has(r.projectId) };
        })
        // eşit puanda en yeni kapanan önce
        .sort((a, b) => b.score - a.score || (a.record.resolvedAt < b.record.resolvedAt ? 1 : a.record.resolvedAt > b.record.resolvedAt ? -1 : 0));
};

// ---------------------------------------------------------------- tahmin

const share = <K extends string>(items: { key: K | undefined; weight: number }[]): { value: K; share: number } | null => {
    const m = new Map<K, number>();
    let total = 0;
    items.forEach(i => { if (!i.key) return; m.set(i.key, (m.get(i.key) || 0) + i.weight); total += i.weight; });
    if (!total) return null;
    const [value, w] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return { value, share: Math.round((w / total) * 100) / 100 };
};

export const estimateFromHistory = (draft: RecordDraft, history: PlanningHistory, opts: { visibleProjectIds?: ReadonlySet<string> } = {}): ReferenceEstimate => {
    const ranked = rankSimilar(draft, history, opts.visibleProjectIds);
    const hasText = terms(`${draft.name} ${draft.notes || ''}`).length > 0;
    let method: ReferenceMethod = 'none';
    let pool: ReferenceMatch[] = [];
    let weights: number[] = [];
    let groupLabel = METHOD_LABELS.group;

    const similar = ranked.filter(m => m.score >= MIN_SIMILARITY && (!hasText || m.text > 0)).slice(0, TOP_K);
    if (similar.length >= MIN_REFS) {
        method = 'similar';
        pool = similar;
        weights = similar.map(m => m.score);
    } else {
        const unit = fold(draft.unit);
        const units = textIndex(history).units;
        const pos = new Map(history.records.map((r, i) => [r, i]));
        const unitOf = (m: ReferenceMatch) => units[pos.get(m.record)!];
        const groups: [string, ReferenceMatch[]][] = [];
        if (draft.issueType && unit) groups.push(['Aynı tür ve birimdeki kayıtlar', ranked.filter(m => m.record.issueType === draft.issueType && unitOf(m) === unit)]);
        if (draft.issueType) groups.push(['Aynı türdeki kayıtlar', ranked.filter(m => m.record.issueType === draft.issueType)]);
        if (unit) groups.push(['Aynı birimdeki kayıtlar', ranked.filter(m => unitOf(m) === unit)]);
        const g = groups.find(([, x]) => x.length >= MIN_REFS);
        if (g) { method = 'group'; groupLabel = g[0]; pool = g[1]; }
        else if (ranked.length >= MIN_REFS) {
            const own = draft.projectId ? ranked.filter(m => m.record.projectId === draft.projectId) : [];
            method = 'all';
            pool = own.length >= MIN_REFS ? own : ranked;
        }
        weights = pool.map(() => 1);
    }

    const cal = calibrator(history)({ unit: draft.unit, issueType: draft.issueType });
    const own = draft.ownEstimateDays && draft.ownEstimateDays > 0 ? draft.ownEstimateDays : null;
    const calibrated = own && cal ? { likely: round1(own * cal.median), low: round1(own * cal.p20), high: round1(own * cal.p80) } : null;

    if (method === 'none') {
        return {
            method, methodLabel: METHOD_LABELS.none, n: 0, effectiveN: 0, matches: [], duration: null, effort: null,
            effortSamples: [], effortWeights: [], priority: null, issueType: null, calibration: cal, calibrated,
            confidence: 'low', reasons: [`Eğitime uygun kapanmış kayıt sayısı ${history.records.length}; en az ${MIN_REFS} gerekir`],
        };
    }

    const dur = pool.map((m, i) => ({ value: m.record.days, weight: weights[i] }));
    const eff = pool.map((m, i) => ({ value: m.record.effortDays, weight: weights[i] }));
    const p50 = weightedQuantile(dur, 0.5), p80 = weightedQuantile(dur, 0.8), p90 = weightedQuantile(dur, 0.9);
    const e10 = weightedQuantile(eff, 0.1), e50 = weightedQuantile(eff, 0.5), e90 = weightedQuantile(eff, 0.9);
    const effN = method === 'similar' ? effectiveN(weights) : pool.length;
    const spread = p50 > 0 ? p90 / p50 : Infinity;
    const top = pool[0]?.score ?? 0;

    const reasons: string[] = [];
    if (method !== 'similar') reasons.push(method === 'group' ? `Yeterince benzer kayıt yok; ${groupLabel.toLocaleLowerCase('tr-TR')} kullanıldı` : 'Yeterince benzer kayıt yok; tüm geçmişin dağılımı kullanıldı');
    if (method === 'similar' && effN < 8) reasons.push(`Benzer kayıt az (etkin ${round1(effN)})`);
    if (method === 'similar' && hasText && top < 0.45) reasons.push('Metin eşleşmesi zayıf');
    if (spread > 3) reasons.push(`Süreler dağınık: P90, P50'nin ${round1(spread)} katı`);
    const confidence: Confidence = method === 'similar' && effN >= 8 && spread <= 3 && (!hasText || top >= 0.45)
        ? 'high'
        : method !== 'all' && effN >= MIN_REFS && spread <= 5 ? 'medium' : 'low';

    const best = half(e10), likely = Math.max(best, half(e50)), worst = Math.max(likely, half(e90));
    const priority = method === 'all' ? null : share(pool.map((m, i) => ({ key: m.record.priority, weight: weights[i] })));
    const issueType = !draft.issueType && method === 'similar' ? share(pool.map((m, i) => ({ key: m.record.issueType, weight: weights[i] }))) : null;

    return {
        method,
        methodLabel: method === 'group' ? groupLabel : METHOD_LABELS[method],
        n: pool.length,
        effectiveN: round1(effN),
        matches: pool.slice(0, EVIDENCE),
        duration: { p50: round1(p50), p80: round1(p80), p90: round1(p90) },
        effort: { best, likely, worst },
        effortSamples: pool.map(m => m.record.effortDays),
        effortWeights: weights,
        priority,
        issueType,
        calibration: cal,
        calibrated,
        confidence,
        reasons,
    };
};
