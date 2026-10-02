import { ChatMessage, ChatRequestBody, ChatStreamEvent, ToolCall, ToolSpec } from '../../utils/ai/protocol.js';
import { AiConfig } from './config.js';
import { SseEvent } from './sse.js';

/**
 * Sağlayıcı adaptörleri: ortak sohbet isteğini (mesajlar + araç tanımları)
 * sağlayıcının akış isteğine çevirir ve dönen SSE olaylarını ortak olaylara
 * (delta / tool_call / done) indirger. SDK kullanılmaz — sunucusuz fonksiyon
 * bağımlılıksız kalır.
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

/** Ardışık 'tool' mesajlarını tek grupta toplar (Anthropic/Gemini tek kullanıcı turunda bekler) */
type Grouped =
    | Exclude<ChatMessage, { role: 'tool' }>
    | { role: 'tool_results'; results: Extract<ChatMessage, { role: 'tool' }>[] };

const groupToolResults = (messages: ChatMessage[]): Grouped[] => {
    const out: Grouped[] = [];
    for (const m of messages) {
        if (m.role === 'tool') {
            const last = out[out.length - 1];
            if (last && last.role === 'tool_results') last.results.push(m);
            else out.push({ role: 'tool_results', results: [m] });
        } else {
            out.push(m);
        }
    }
    return out;
};

const parseJsonValue = (s: string): unknown => {
    try {
        return JSON.parse(s);
    } catch {
        return s;
    }
};

// ---------------------------------------------------------------------------
// İstek gövdeleri
// ---------------------------------------------------------------------------

const openaiMessages = (req: ChatRequestBody) => [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    ...req.messages.map(m => {
        if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
        if (m.role === 'assistant' && m.toolCalls?.length) {
            return {
                role: 'assistant',
                content: m.content || null,
                tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) } })),
            };
        }
        return { role: m.role, content: m.content };
    }),
];

const openaiTools = (tools: ToolSpec[]) =>
    tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

const anthropicMessages = (req: ChatRequestBody) =>
    groupToolResults(req.messages).map(m => {
        if (m.role === 'tool_results') {
            return {
                role: 'user',
                content: m.results.map(r => ({ type: 'tool_result', tool_use_id: r.toolCallId, content: r.content })),
            };
        }
        if (m.role === 'assistant' && m.toolCalls?.length) {
            return {
                role: 'assistant',
                content: [
                    ...(m.content.trim() ? [{ type: 'text', text: m.content }] : []),
                    ...m.toolCalls.map(c => ({ type: 'tool_use', id: c.id, name: c.name, input: c.arguments || {} })),
                ],
            };
        }
        return { role: m.role, content: m.content };
    });

const anthropicTools = (tools: ToolSpec[]) =>
    tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));

const geminiContents = (req: ChatRequestBody) =>
    groupToolResults(req.messages).map(m => {
        if (m.role === 'tool_results') {
            return {
                role: 'user',
                parts: m.results.map(r => {
                    const call = findCall(req.messages, r.toolCallId);
                    const id = typeof call?.meta?.geminiId === 'string' ? call.meta.geminiId : undefined;
                    return { functionResponse: { ...(id ? { id } : {}), name: r.name, response: { result: parseJsonValue(r.content) } } };
                }),
            };
        }
        if (m.role === 'assistant') {
            const parts: Record<string, unknown>[] = [];
            if (m.content.trim()) parts.push({ text: m.content });
            (m.toolCalls || []).forEach(c => {
                const id = typeof c.meta?.geminiId === 'string' ? c.meta.geminiId : undefined;
                const sig = typeof c.meta?.thoughtSignature === 'string' ? c.meta.thoughtSignature : undefined;
                parts.push({ functionCall: { ...(id ? { id } : {}), name: c.name, args: c.arguments || {} }, ...(sig ? { thoughtSignature: sig } : {}) });
            });
            return { role: 'model', parts: parts.length ? parts : [{ text: ' ' }] };
        }
        return { role: 'user', parts: [{ text: m.content }] };
    });

const findCall = (messages: ChatMessage[], id: string): ToolCall | undefined => {
    for (const m of messages) {
        if (m.role === 'assistant') {
            const c = m.toolCalls?.find(x => x.id === id);
            if (c) return c;
        }
    }
    return undefined;
};

const geminiTools = (tools: ToolSpec[]) => [{
    functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        // Gemini, özelliksiz nesne şemasını reddeder → parametresiz araçta alan verilmez
        ...(t.parameters.properties && Object.keys(t.parameters.properties).length ? { parameters: t.parameters } : {}),
    })),
}];

export const buildUpstreamRequest = (config: AiConfig, req: ChatRequestBody): UpstreamRequest => {
    const json = { 'content-type': 'application/json' };
    const temp = config.temperature !== undefined ? { temperature: config.temperature } : {};
    const tools = req.tools && req.tools.length ? req.tools : undefined;

    switch (config.provider) {
        case 'openai':
        case 'azure': {
            const tokenParam = usesMaxCompletionTokens(config) ? 'max_completion_tokens' : 'max_tokens';
            return {
                url: `${config.baseUrl}/chat/completions`,
                headers: config.provider === 'azure'
                    ? { ...json, 'api-key': config.apiKey }
                    : { ...json, authorization: `Bearer ${config.apiKey}` },
                body: JSON.stringify({
                    model: config.model,
                    messages: openaiMessages(req),
                    stream: true,
                    [tokenParam]: config.maxOutputTokens,
                    ...(tools ? { tools: openaiTools(tools) } : {}),
                    ...temp,
                }),
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
                    messages: anthropicMessages(req),
                    ...(tools ? { tools: anthropicTools(tools) } : {}),
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
                    contents: geminiContents(req),
                    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
                    ...(tools ? { tools: geminiTools(tools) } : {}),
                    generationConfig: { maxOutputTokens: config.maxOutputTokens, ...temp },
                }),
            };
        }
    }
};

// ---------------------------------------------------------------------------
// Akış ayrıştırma
// ---------------------------------------------------------------------------

const parseJson = (data: string): any => {
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
};

/** Araç argüman metni → nesne (bozuk/boş JSON → boş nesne; araç doğrulaması hatayı bildirir) */
const parseArgs = (raw: string): Record<string, unknown> => {
    const v = raw.trim() ? parseJson(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};

const errorText = (err: any): string =>
    String(err?.message || err?.error?.message || (typeof err === 'string' ? err : 'bilinmeyen hata')).slice(0, 300);

async function* openaiEvents(events: AsyncIterable<SseEvent>): AsyncGenerator<ChatStreamEvent> {
    let stopReason: string | undefined;
    // Araç çağrıları parça parça gelir (index'e göre birleştirilir)
    const calls = new Map<number, { id: string; name: string; args: string }>();
    for await (const ev of events) {
        if (ev.data === '[DONE]') break;
        const json = parseJson(ev.data);
        if (!json) continue;
        if (json.error) throw new UpstreamStreamError(errorText(json.error));
        const choice = json.choices?.[0];
        const delta = choice?.delta;
        const text = delta?.content;
        if (typeof text === 'string' && text) yield { type: 'delta', text };
        for (const tc of delta?.tool_calls || []) {
            const idx = typeof tc.index === 'number' ? tc.index : calls.size;
            const cur = calls.get(idx) || { id: '', name: '', args: '' };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (typeof tc.function?.arguments === 'string') cur.args += tc.function.arguments;
            calls.set(idx, cur);
        }
        if (choice?.finish_reason) stopReason = choice.finish_reason;
    }
    for (const [idx, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
        if (!c.name) continue;
        yield { type: 'tool_call', call: { id: c.id || `call_${idx}`, name: c.name, arguments: parseArgs(c.args) } };
    }
    yield { type: 'done', stopReason };
}

async function* anthropicEvents(events: AsyncIterable<SseEvent>): AsyncGenerator<ChatStreamEvent> {
    let stopReason: string | undefined;
    const blocks = new Map<number, { id: string; name: string; json: string }>();
    for await (const ev of events) {
        const json = parseJson(ev.data);
        if (!json) continue;
        if (json.type === 'error') throw new UpstreamStreamError(errorText(json.error));
        if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
            blocks.set(json.index, { id: json.content_block.id, name: json.content_block.name, json: '' });
        } else if (json.type === 'content_block_delta') {
            if (json.delta?.type === 'text_delta' && json.delta.text) yield { type: 'delta', text: json.delta.text };
            else if (json.delta?.type === 'input_json_delta') {
                const b = blocks.get(json.index);
                if (b) b.json += json.delta.partial_json || '';
            }
        } else if (json.type === 'content_block_stop') {
            const b = blocks.get(json.index);
            if (b) {
                blocks.delete(json.index);
                yield { type: 'tool_call', call: { id: b.id, name: b.name, arguments: parseArgs(b.json) } };
            }
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
    let callIndex = 0;
    // Gemini çoğu zaman çağrı kimliği vermez; adımlar arası çakışmasın diye istek başına önek
    const prefix = `gemini_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    for await (const ev of events) {
        const json = parseJson(ev.data);
        if (!json) continue;
        if (json.error) throw new UpstreamStreamError(errorText(json.error));
        if (json.promptFeedback?.blockReason) {
            throw new UpstreamStreamError(`İstek sağlayıcının güvenlik filtresine takıldı (${json.promptFeedback.blockReason}).`);
        }
        const cand = json.candidates?.[0];
        const parts: any[] = cand?.content?.parts || [];
        for (const p of parts) {
            // "thought" parçaları modelin iç düşünmesidir; kullanıcıya gösterilmez
            if (typeof p?.text === 'string' && p.text && !p.thought) yield { type: 'delta', text: p.text };
            if (p?.functionCall?.name) {
                const fc = p.functionCall;
                const meta: Record<string, unknown> = {};
                if (typeof p.thoughtSignature === 'string') meta.thoughtSignature = p.thoughtSignature;
                if (typeof fc.id === 'string') meta.geminiId = fc.id;
                yield {
                    type: 'tool_call',
                    call: {
                        id: typeof fc.id === 'string' ? fc.id : `${prefix}_${callIndex}`,
                        name: fc.name,
                        arguments: fc.args && typeof fc.args === 'object' ? fc.args : {},
                        ...(Object.keys(meta).length ? { meta } : {}),
                    },
                };
                callIndex++;
            }
        }
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
