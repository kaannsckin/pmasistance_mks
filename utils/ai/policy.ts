import { AiPolicy, AiScoringPolicy, EstimateGatePolicy, ModelEstimatePolicy, ReportGatePolicy, WorkspaceData } from '../../types';

/**
 * Admin'in yapay zekâ politikası (çalışma alanında, bulutla paylaşılır).
 * Sağlayıcı, model ve anahtar güvenlik gereği yalnız sunucu ortam
 * değişkenlerindedir; burada yalnız kullanım kuralları tutulur.
 */

export const DEFAULT_SCORING: AiScoringPolicy = { runs: 3, minEvidence: 1, maxSpread: 2, maxRuleGap: 4, lowConfidence: 'exclude' };
export const DEFAULT_GATE: EstimateGatePolicy = { enforce: false, maxMaeRatio: 1.1, minPriorityAccuracy: 0.6, minCoverage: 0.6 };
export const DEFAULT_REPORT_GATE: ReportGatePolicy = { enforce: false, maxLintErrorsPerReport: 0.5, maxUngroundedRate: 0.05, minRecall: 0.5 };

export interface ResolvedAiPolicy {
    enabled: boolean;
    chat: boolean;
    embedded: boolean;
    proposals: boolean;
    blindEstimate: boolean;
    estimateGate: EstimateGatePolicy;
    /** Planlamada klasik ML modeli önerisi */
    modelEstimate: ModelEstimatePolicy;
    scoring: AiScoringPolicy;
    /** AI'ya giden metinlerde kişi, proje ve kurum adları takma adla (utils/ai/masking.ts) */
    maskNames: boolean;
    /** Haftalık rapor taslağının kalite kapısı */
    reportGate: ReportGatePolicy;
}

const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
};

export const aiPolicyOf = (ws: Partial<Pick<WorkspaceData, 'aiPolicy'>> | undefined): ResolvedAiPolicy => {
    const p = ws?.aiPolicy || {};
    const s: Partial<AiScoringPolicy> = p.scoring || {};
    return {
        enabled: p.enabled !== false,
        chat: p.chat !== false,
        embedded: p.embedded !== false,
        proposals: p.proposals !== false,
        blindEstimate: p.blindEstimate !== false,
        estimateGate: {
            enforce: p.estimateGate?.enforce === true,
            maxMaeRatio: clampNum(p.estimateGate?.maxMaeRatio, 0.5, 3, DEFAULT_GATE.maxMaeRatio),
            minPriorityAccuracy: clampNum(p.estimateGate?.minPriorityAccuracy, 0, 1, DEFAULT_GATE.minPriorityAccuracy),
            minCoverage: clampNum(p.estimateGate?.minCoverage, 0, 1, DEFAULT_GATE.minCoverage),
        },
        modelEstimate: p.modelEstimate === 'on' || p.modelEstimate === 'off' ? p.modelEstimate : 'auto',
        maskNames: p.maskNames !== false,
        reportGate: {
            enforce: p.reportGate?.enforce === true,
            maxLintErrorsPerReport: clampNum(p.reportGate?.maxLintErrorsPerReport, 0, 5, DEFAULT_REPORT_GATE.maxLintErrorsPerReport),
            maxUngroundedRate: clampNum(p.reportGate?.maxUngroundedRate, 0, 1, DEFAULT_REPORT_GATE.maxUngroundedRate),
            minRecall: clampNum(p.reportGate?.minRecall, 0, 1, DEFAULT_REPORT_GATE.minRecall),
        },
        scoring: {
            runs: [1, 3, 5].includes(Number(s.runs)) ? Number(s.runs) : DEFAULT_SCORING.runs,
            minEvidence: clampInt(s.minEvidence, 0, 3, DEFAULT_SCORING.minEvidence),
            maxSpread: clampInt(s.maxSpread, 1, 9, DEFAULT_SCORING.maxSpread),
            maxRuleGap: clampInt(s.maxRuleGap, 1, 9, DEFAULT_SCORING.maxRuleGap),
            lowConfidence: s.lowConfidence === 'flag' ? 'flag' : 'exclude',
        },
    };
};

/** Politika değişikliği; varsayılana eşit alanlar atılır, hiçbir şey kalmazsa undefined */
export const updateAiPolicy = (cur: AiPolicy | undefined, patch: Partial<Omit<AiPolicy, 'scoring' | 'estimateGate' | 'reportGate'>> & { scoring?: Partial<AiScoringPolicy>; estimateGate?: Partial<EstimateGatePolicy>; reportGate?: Partial<ReportGatePolicy> }): AiPolicy | undefined => {
    const r = aiPolicyOf({ aiPolicy: {
        ...(cur || {}), ...patch,
        scoring: { ...DEFAULT_SCORING, ...(cur?.scoring || {}), ...(patch.scoring || {}) } as AiScoringPolicy,
        estimateGate: { ...DEFAULT_GATE, ...(cur?.estimateGate || {}), ...(patch.estimateGate || {}) },
        reportGate: { ...DEFAULT_REPORT_GATE, ...(cur?.reportGate || {}), ...(patch.reportGate || {}) },
    } });
    const out: AiPolicy = {};
    if (!r.enabled) out.enabled = false;
    if (!r.chat) out.chat = false;
    if (!r.embedded) out.embedded = false;
    if (!r.proposals) out.proposals = false;
    if (!r.blindEstimate) out.blindEstimate = false;
    if (r.modelEstimate !== 'auto') out.modelEstimate = r.modelEstimate;
    if (!r.maskNames) out.maskNames = false;
    const diff = (Object.keys(DEFAULT_SCORING) as (keyof AiScoringPolicy)[]).some(k => r.scoring[k] !== DEFAULT_SCORING[k]);
    if (diff) out.scoring = r.scoring;
    if ((Object.keys(DEFAULT_GATE) as (keyof EstimateGatePolicy)[]).some(k => r.estimateGate[k] !== DEFAULT_GATE[k])) out.estimateGate = r.estimateGate;
    if ((Object.keys(DEFAULT_REPORT_GATE) as (keyof ReportGatePolicy)[]).some(k => r.reportGate[k] !== DEFAULT_REPORT_GATE[k])) out.reportGate = r.reportGate;
    return Object.keys(out).length ? out : undefined;
};
