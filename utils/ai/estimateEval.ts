import { WorkspaceData } from '../../types';
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

/**
 * Altın set → sohbet biçiminde JSONL (değerlendirme ve gerekirse ince ayar).
 * Hedef yanıt gerçekleşen değerlerden kurulur: olası efor = gerçek efor,
 * aralık gerçeğin −%30 / +%60'ı; önem ve tür altın setteki doğru değer;
 * dayanak = en benzer üç bağlam kaydı. Kişi adı yoktur.
 */
export const goldenJsonl = (cases: GoldCase[]): string => cases.map(c => {
    const a = c.record.effortDays;
    const target = {
        tur: c.item.issueType || 'other',
        onem: c.item.priority,
        efor: { iyimser: round1(a * 0.7), olasi: round1(a), kotumser: round1(a * 1.6) },
        dayanak: [...contextIds(c.ref).keys()].slice(0, 3),
        onem_gerekce: '',
        efor_gerekce: `Gerçekleşen efor ${String(Math.round(a * 10) / 10).replace('.', ',')} gün.`,
        eksik_bilgi: [],
        guven: 'yuksek',
    };
    return JSON.stringify({ messages: [{ role: 'system', content: EMBED_SYSTEM }, { role: 'user', content: goldPrompt(c) }, { role: 'assistant', content: JSON.stringify(target) }] });
}).join('\n');
