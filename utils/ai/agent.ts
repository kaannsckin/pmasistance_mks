import { trimHistory, StreamChatResult } from './client';
import { AI_LIMITS, ChatMessage, ChatRequestBody, ToolCall, ToolSpec } from './protocol';

/**
 * Araç döngüsü (agent loop): model araç isterse araç tarayıcıda çalıştırılır,
 * sonucu modele geri verilir; model metin yanıtı verene ya da adım sınırına
 * ulaşılana kadar sürer. Akış ve araç yürütme dışarıdan verilir → test edilir.
 */

export interface AgentStep {
    id: string;
    name: string;
    label: string;
    status: 'running' | 'done' | 'error';
}

export interface AgentTurnOptions {
    system: string;
    /** Önceki turlar + en sonda yeni kullanıcı mesajı */
    history: ChatMessage[];
    tools: ToolSpec[];
    execute: (call: ToolCall) => { content: string; ok: boolean } | Promise<{ content: string; ok: boolean }>;
    stream: (body: ChatRequestBody, onDelta: (full: string) => void) => Promise<StreamChatResult>;
    maxSteps?: number;
    onText?: (text: string) => void;
    onSteps?: (steps: AgentStep[]) => void;
    labelFor?: (name: string) => string;
}

export interface AgentTurnResult {
    text: string;
    steps: AgentStep[];
    stopReason?: string;
    hitStepLimit: boolean;
}

export const DEFAULT_MAX_STEPS = 6;

/** Bu turdaki eski araç sonuçlarını, bütçe aşılırsa kısa bir notla değiştirir (çağrı/sonuç eşleşmesi korunur) */
export const compactToolResults = (messages: ChatMessage[], budget: number): ChatMessage[] => {
    const size = (ms: ChatMessage[]) => ms.reduce((s, m) => s + m.content.length + (m.role === 'assistant' && m.toolCalls ? JSON.stringify(m.toolCalls).length : 0), 0);
    let total = size(messages);
    if (total <= budget) return messages;
    const out = [...messages];
    const placeholder = JSON.stringify({ not: 'Bu araç sonucu bağlam sınırı nedeniyle çıkarıldı; gerekirse aracı daha dar filtreyle yeniden çağır.' });
    for (let i = 0; i < out.length - 1 && total > budget; i++) {
        const m = out[i];
        if (m.role === 'tool' && m.content.length > placeholder.length) {
            total -= m.content.length - placeholder.length;
            out[i] = { ...m, content: placeholder };
        }
    }
    return out;
};

export const runAgentTurn = async (o: AgentTurnOptions): Promise<AgentTurnResult> => {
    const maxSteps = o.maxSteps ?? DEFAULT_MAX_STEPS;
    const labelFor = o.labelFor || ((n: string) => n);
    const toolChars = JSON.stringify(o.tools).length;
    // Sunucu sınırının altında kal: sistem + araç tanımları + %10 pay
    const budget = Math.floor(AI_LIMITS.maxTotalChars * 0.9) - o.system.length - toolChars;

    let messages: ChatMessage[] = [...o.history];
    const steps: AgentStep[] = [];
    let shown = '';
    let stopReason: string | undefined;

    for (let i = 0; i < maxSteps; i++) {
        const prefix = shown ? `${shown}\n\n` : '';
        messages = compactToolResults(messages, budget);
        const body: ChatRequestBody = {
            system: o.system,
            messages: trimHistory(messages, o.system.length + toolChars),
            ...(o.tools.length ? { tools: o.tools } : {}),
        };
        const res = await o.stream(body, full => o.onText?.(prefix + full));
        if (res.text.trim()) shown = prefix + res.text;
        stopReason = res.stopReason;
        if (res.toolCalls.length === 0) return { text: shown, steps, stopReason, hitStepLimit: false };

        messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls });
        for (const call of res.toolCalls) {
            const step: AgentStep = { id: call.id, name: call.name, label: labelFor(call.name), status: 'running' };
            steps.push(step);
            o.onSteps?.(steps.map(s => ({ ...s })));
            const out = await o.execute(call);
            step.status = out.ok ? 'done' : 'error';
            o.onSteps?.(steps.map(s => ({ ...s })));
            messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: out.content });
        }
    }
    return { text: shown, steps, stopReason, hitStepLimit: true };
};
