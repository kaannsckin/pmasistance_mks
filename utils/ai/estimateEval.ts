import { Confidence, IssueType, Task, WorkspaceData } from '../../types';
import { HistoryRecord } from '../planning/history';
import { ReferenceEstimate } from '../planning/referenceClass';
import { GoldAiAnswer, GoldCase, goldDraft, gateStatus, GateStatus } from '../planning/evaluation';
import { EMBED_SYSTEM } from './embedded';
import { contextIds, ESTIMATE_PROMPT_VERSION, estimateSuggestionPrompt, finalizeEstimateSuggestion, parseEstimateSuggestion } from './estimateSuggestion';
import { aiPolicyOf } from './policy';

/**
 * AI tahmin önerisinin altın sette çalıştırılması, kalite kapısı ve
 * değerlendirme / ince ayar veri kümesi (JSONL).
 */

export const goldPrompt = (c: GoldCase): string => estimateSuggestionPrompt(goldDraft(c.record), c.ref);

export const goldAnswer = (text: string, c: GoldCase): GoldAiAnswer => {
    const r = finalizeEstimateSuggestion(parseEstimateSuggestion(text), c.ref);
    return { effort: r.effort, priority: r.priority, issueType: r.issueType, confidence: r.confidence, unknownEvidence: r.flags.includes('unknown_evidence') };
};

/** Kapı durumu ve zorunluysa AI tahmin önerisinin engellenip engellenmediği */
export const estimateGate = (ws: Pick<WorkspaceData, 'aiPolicy' | 'evalRuns'>, model?: string): { status: GateStatus; enforce: boolean; blocked: boolean } => {
    const policy = aiPolicyOf(ws).estimateGate;
    const { status } = gateStatus(ws.evalRuns, ESTIMATE_PROMPT_VERSION, model);
    return { status, enforce: policy.enforce, blocked: policy.enforce && status === 'failed' };
};

export const GATE_BLOCK_MESSAGE = 'AI tahmin önerisi altın sette kalite kapısından geçmediği için kapalı (yönetici konsolu › Tahmin kalitesi). Geçmiş kayıtlardan öneri kullanılabilir.';

const round1 = (v: number) => Math.max(0.5, Math.round(v * 2) / 2);

const CONF_WORD: Record<Confidence, string> = { high: 'yuksek', medium: 'orta', low: 'dusuk' };

/**
 * Gerçekleşen değerlerden hedef yanıt (değerlendirme ve ince ayar için):
 * olası efor = gerçek efor, aralık gerçeğin −%30 / +%60'ı; önem ve tür
 * doğru değer; dayanak = en benzer üç bağlam kaydı. Kişi adı yoktur.
 */
export const estimateTarget = (record: HistoryRecord, ref: ReferenceEstimate, truth: { priority: Task['priority']; issueType?: IssueType }, confidence: Confidence = 'high') => {
    const a = record.effortDays;
    return {
        tur: truth.issueType || 'other',
        onem: truth.priority,
        efor: { iyimser: round1(a * 0.7), olasi: round1(a), kotumser: round1(a * 1.6) },
        dayanak: [...contextIds(ref).keys()].slice(0, 3),
        onem_gerekce: '',
        efor_gerekce: `Gerçekleşen efor ${String(Math.round(a * 10) / 10).replace('.', ',')} gün.`,
        eksik_bilgi: [] as string[],
        guven: CONF_WORD[confidence],
    };
};

/** Sohbet biçiminde tek örnek (system · user · assistant) */
export const chatExample = (prompt: string, target: object): string =>
    JSON.stringify({ messages: [{ role: 'system', content: EMBED_SYSTEM }, { role: 'user', content: prompt }, { role: 'assistant', content: JSON.stringify(target) }] });

/** Altın set → sohbet biçiminde JSONL (değerlendirme ve gerekirse ince ayar) */
export const goldenJsonl = (cases: GoldCase[]): string => cases
    .map(c => chatExample(goldPrompt(c), estimateTarget(c.record, c.ref, { priority: c.item.priority, issueType: c.item.issueType })))
    .join('\n');
