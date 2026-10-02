import { ChatRequestBody, ChatStreamEvent } from '../../utils/ai/protocol.js';
import { AiConfig } from './config.js';
import { SseEvent } from './sse.js';

/**
 * Sağlayıcı adaptörleri: ortak sohbet isteğini sağlayıcının akış (stream)
 * isteğine çevirir ve dönen SSE olaylarını ortak olaylara (delta/done) indirger.
 * SDK kullanılmaz — sunucusuz fonksiyon bağımlılıksız kalır.
 *
 *  - openai   : OpenAI ve OpenAI-uyumlu uç noktalar (vLLM, Ollama, LiteLLM,
 *               kurum içi ağ geçitleri) — Authorization: Bearer
 *  - azure    : Azure OpenAI v1 uç noktası — api-key başlığı, aynı gövde
 *  - anthropic: Anthropic Messages API
 *  - gemini   : Google Gemini (generativelanguage) API
 */

export interface UpstreamRequest {
    url: string;
    headers: Record<string, string>;
    body: string;
}

/** Sağlayıcının akış içinde bildirdiği hata (ör. güvenlik filtresi) */
export class UpstreamStreamError extends Error {}

/** Resmi OpenAI/Azure yeni modelleri max_tokens yerine max_completion_tokens bekler */
const usesMaxCompletionTokens = (config: AiConfig): boolean =>
    config.provider === 'azure' || /^https:\/\/api\.openai\.com(\/|$)/i.test(config.baseUrl);

export const buildUpstreamRequest = (config: AiConfig, req: ChatRequestBody): UpstreamRequest => {
    const json = { 'content-type': 'application/json' };
    const temp = config.temperature !== undefined ? { temperature: config.temperature } : {};

    switch (config.provider) {
        case 'openai':
        case 'azure': {
            const messages = [
                ...(req.system ? [{ role: 'system', content: req.system }] : []),
                ...req.messages.map(m => ({ role: m.role, content: m.content })),
            ];
            const tokenParam = usesMaxCompletionTokens(config) ? 'max_completion_tokens' : 'max_tokens';
            return {
                url: `${config.baseUrl}/chat/completions`,
                headers: config.provider === 'azure'
                    ? { ...json, 'api-key': config.apiKey }
                    : { ...json, authorization: `Bearer ${config.apiKey}` },
                body: JSON.stringify({ model: config.model, messages, stream: true, [tokenParam]: config.maxOutputTokens, ...temp }),
            };
        }
        case 'anthropic': {
            const root = config.baseUrl.replace(/\/v1$/, '');
            return {
                url: `${root}/v1/messages`,
                headers: { ...json, 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({
                    model: config.model,
                    max_tokens: config.maxOutputTokens,
                    ...(req.system ? { system: req.system } : {}),
                    messages: req.messages.map(m => ({ role: m.role, content: m.content })),
                    stream: true,
                    ...temp,
                }),
            };
        }
        case 'gemini': {
            return {
                url: `${config.baseUrl}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`,
                headers: { ...json, 'x-goog-api-key': config.apiKey },
                body: JSON.stringify({
                    contents: req.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
                    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
                    generationConfig: { maxOutputTokens: config.maxOutputTokens, ...temp },
                }),
            };
        }
    }
};

const parseJson = (data: string): any => {
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
};

const errorText = (err: any): string =>
    String(err?.message || err?.error?.message || (typeof err === 'string' ? err : 'bilinmeyen hata')).slice(0, 300);

async function* openaiEvents(events: AsyncIterable<SseEvent>): AsyncGenerator<ChatStreamEvent> {
    let stopReason: string | undefined;
    for await (const ev of events) {
        if (ev.data === '[DONE]') break;
        const json = parseJson(ev.data);
        if (!json) continue;
        if (json.error) throw new UpstreamStreamError(errorText(json.error));
        const choice = json.choices?.[0];
        const text = choice?.delta?.content;
        if (typeof text === 'string' && text) yield { type: 'delta', text };
        if (choice?.finish_reason) stopReason = choice.finish_reason;
    }
    yield { type: 'done', stopReason };
}

async function* anthropicEvents(events: AsyncIterable<SseEvent>): AsyncGenerator<ChatStreamEvent> {
    let stopReason: string | undefined;
    for await (const ev of events) {
        const json = parseJson(ev.data);
        if (!json) continue;
        if (json.type === 'error') throw new UpstreamStreamError(errorText(json.error));
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
            yield { type: 'delta', text: json.delta.text };
        } else if (json.type === 'message_delta' && json.delta?.stop_reason) {
            stopReason = json.delta.stop_reason;
        } else if (json.type === 'message_stop') {
            break;
        }
    }
    yield { type: 'done', stopReason };
}

async function* geminiEvents(events: AsyncIterable<SseEvent>): AsyncGenerator<ChatStreamEvent> {
    let stopReason: string | undefined;
    for await (const ev of events) {
        const json = parseJson(ev.data);
        if (!json) continue;
        if (json.error) throw new UpstreamStreamError(errorText(json.error));
        if (json.promptFeedback?.blockReason) {
            throw new UpstreamStreamError(`İstek sağlayıcının güvenlik filtresine takıldı (${json.promptFeedback.blockReason}).`);
        }
        const cand = json.candidates?.[0];
        const parts: any[] = cand?.content?.parts || [];
        // "thought" parçaları modelin iç düşünmesidir; kullanıcıya gösterilmez
        const text = parts.filter(p => typeof p?.text === 'string' && !p.thought).map(p => p.text).join('');
        if (text) yield { type: 'delta', text };
        if (cand?.finishReason) stopReason = String(cand.finishReason).toLowerCase();
    }
    yield { type: 'done', stopReason };
}

export const parseUpstreamEvents = (config: AiConfig, events: AsyncIterable<SseEvent>): AsyncGenerator<ChatStreamEvent> => {
    switch (config.provider) {
        case 'openai':
        case 'azure':
            return openaiEvents(events);
        case 'anthropic':
            return anthropicEvents(events);
        case 'gemini':
            return geminiEvents(events);
    }
};

/** Sağlayıcının hata gövdesinden kısa ve anahtarsız bir açıklama çıkarır */
export const extractUpstreamError = (bodyText: string): string => {
    const json = parseJson(bodyText);
    const obj = Array.isArray(json) ? json[0] : json;
    const raw = obj
        ? obj.error?.message || obj.message || (typeof obj.error === 'string' ? obj.error : '')
        : bodyText;
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 300);
};
