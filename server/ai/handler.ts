import { AI_LIMITS, AiStatus, ChatMessage, ChatRequestBody, TOOL_NAME_PATTERN, ToolCall, ToolSpec } from '../../utils/ai/protocol.js';
import { AuthResult, authorize } from './auth.js';
import { Env, readAiConfig } from './config.js';
import { buildUpstreamRequest, extractUpstreamError, parseUpstreamEvents, UpstreamStreamError } from './providers.js';
import { createRateLimiter, RateLimiter } from './rateLimit.js';
import { parseSSE } from './sse.js';

/**
 * AI proxy — çatıdan bağımsız (Web Request → Response). Vercel fonksiyonu
 * (api/ai/*) ve Vite geliştirme sunucusu (vite.config.ts) bu işleyiciyi çağırır.
 *
 *   GET  …/health → AiStatus (anahtar içermez)
 *   POST …/chat   → NDJSON akışı (ChatStreamEvent satırları)
 *
 * Mesaj içerikleri hiçbir zaman loglanmaz.
 */

export type ErrorCode = 'config' | 'auth' | 'forbidden' | 'origin' | 'rate_limited' | 'bad_request' | 'upstream' | 'timeout' | 'not_found';

export interface HandlerOptions {
    isDev?: boolean;
    fetchImpl?: typeof fetch;
    rateLimiter?: RateLimiter;
    route?: 'health' | 'chat';
}

const limiters = new Map<number, RateLimiter>();
const sharedLimiter = (perMin: number): RateLimiter => {
    let l = limiters.get(perMin);
    if (!l) {
        l = createRateLimiter(perMin);
        limiters.set(perMin, l);
    }
    return l;
};

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
    });

const errorResponse = (status: number, code: ErrorCode, message: string, headers: Record<string, string> = {}): Response =>
    jsonResponse(status, { error: message, code }, headers);

/**
 * Köken denetimi: aynı host her zaman serbest; başka kökenler yalnızca
 * AI_ALLOWED_ORIGINS listesindeyse (CORS başlıklarıyla) kabul edilir.
 * null → reddet.
 */
const corsFor = (request: Request, allowedOrigins: string[]): Record<string, string> | null => {
    const origin = request.headers.get('origin');
    if (!origin) return {};
    let originHost: string;
    try {
        originHost = new URL(origin).host;
    } catch {
        return null;
    }
    const reqHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
    if (originHost === reqHost) return {};
    if (allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
        return {
            'access-control-allow-origin': origin,
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-max-age': '600',
            vary: 'Origin',
        };
    }
    return null;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const jsonSize = (v: unknown): number => {
    try {
        return JSON.stringify(v).length;
    } catch {
        return Infinity;
    }
};

const validateTools = (raw: unknown): { tools?: ToolSpec[]; size: number; error?: string } => {
    if (raw === undefined) return { size: 0 };
    if (!Array.isArray(raw)) return { size: 0, error: 'tools bir dizi olmalı.' };
    if (raw.length > AI_LIMITS.maxTools) return { size: 0, error: `En fazla ${AI_LIMITS.maxTools} araç tanımlanabilir.` };
    const tools: ToolSpec[] = [];
    let size = 0;
    const names = new Set<string>();
    for (const t of raw) {
        const name = (t as any)?.name;
        const description = (t as any)?.description;
        const parameters = (t as any)?.parameters;
        if (typeof name !== 'string' || !TOOL_NAME_PATTERN.test(name) || names.has(name)) return { size: 0, error: 'Geçersiz ya da yinelenen araç adı.' };
        if (typeof description !== 'string' || description.length > 2000) return { size: 0, error: `Geçersiz araç açıklaması: ${name}` };
        if (!isPlainObject(parameters) || parameters.type !== 'object') return { size: 0, error: `Araç parametre şeması nesne olmalı: ${name}` };
        const sz = jsonSize(parameters);
        if (sz > AI_LIMITS.maxToolJsonChars) return { size: 0, error: `Araç şeması çok büyük: ${name}` };
        names.add(name);
        size += name.length + description.length + sz;
        tools.push({ name, description, parameters: parameters as unknown as ToolSpec['parameters'] });
    }
    return { tools, size };
};

const validateToolCall = (c: unknown): { call?: ToolCall; size: number } => {
    const id = (c as any)?.id;
    const name = (c as any)?.name;
    const args = (c as any)?.arguments;
    const meta = (c as any)?.meta;
    if (typeof id !== 'string' || !id || id.length > 200) return { size: 0 };
    if (typeof name !== 'string' || !TOOL_NAME_PATTERN.test(name)) return { size: 0 };
    if (!isPlainObject(args)) return { size: 0 };
    if (meta !== undefined && !isPlainObject(meta)) return { size: 0 };
    const size = jsonSize(args) + (meta ? jsonSize(meta) : 0);
    if (size > AI_LIMITS.maxToolJsonChars) return { size: 0 };
    return { call: { id, name, arguments: args, ...(meta ? { meta } : {}) }, size: size + id.length + name.length };
};

/**
 * Gövde doğrulaması: roller ve sıralama sağlayıcıların ortak kurallarına
 * uymalı — ilk mesaj kullanıcıdan, her araç sonucu önceki bir çağrıya ait,
 * son mesaj kullanıcı ya da araç sonucu.
 */
export const validateChatBody = (raw: unknown): { body?: ChatRequestBody; error?: string } => {
    if (!isPlainObject(raw)) return { error: 'Geçersiz istek gövdesi.' };
    const { system: rawSystem, messages, tools: rawTools } = raw;
    if (rawSystem !== undefined && typeof rawSystem !== 'string') return { error: 'system metin olmalı.' };
    const system = typeof rawSystem === 'string' ? rawSystem : '';
    if (system.length > AI_LIMITS.maxSystemChars) return { error: 'Sistem talimatı çok uzun.' };
    if (!Array.isArray(messages) || messages.length === 0) return { error: 'En az bir mesaj gerekli.' };
    if (messages.length > AI_LIMITS.maxMessages) return { error: `En fazla ${AI_LIMITS.maxMessages} mesaj gönderilebilir.` };

    const toolCheck = validateTools(rawTools);
    if (toolCheck.error) return { error: toolCheck.error };

    let total = system.length + toolCheck.size;
    const clean: ChatMessage[] = [];
    const callIds = new Set<string>();
    for (const m of messages) {
        const role = (m as any)?.role;
        const content = (m as any)?.content;
        if (role !== 'user' && role !== 'assistant' && role !== 'tool') return { error: 'Mesaj rolü user, assistant ya da tool olmalı.' };
        if (typeof content !== 'string') return { error: 'Mesaj içeriği metin olmalı.' };
        if (content.length > AI_LIMITS.maxCharsPerMessage) return { error: 'Mesaj çok uzun.' };
        total += content.length;

        if (role === 'user') {
            if (!content.trim()) return { error: 'Mesaj içeriği boş olamaz.' };
            clean.push({ role, content });
        } else if (role === 'assistant') {
            const rawCalls = (m as any)?.toolCalls;
            if (rawCalls !== undefined && (!Array.isArray(rawCalls) || rawCalls.length > AI_LIMITS.maxToolCallsPerMessage)) {
                return { error: 'Geçersiz araç çağrısı listesi.' };
            }
            const calls: ToolCall[] = [];
            for (const c of rawCalls || []) {
                const v = validateToolCall(c);
                if (!v.call) return { error: 'Geçersiz araç çağrısı.' };
                callIds.add(v.call.id);
                total += v.size;
                calls.push(v.call);
            }
            if (!content.trim() && calls.length === 0) return { error: 'Mesaj içeriği boş olamaz.' };
            clean.push(calls.length ? { role, content, toolCalls: calls } : { role, content });
        } else {
            const toolCallId = (m as any)?.toolCallId;
            const name = (m as any)?.name;
            if (typeof toolCallId !== 'string' || !callIds.has(toolCallId)) return { error: 'Araç sonucu bilinen bir çağrıya ait değil.' };
            if (typeof name !== 'string' || !TOOL_NAME_PATTERN.test(name)) return { error: 'Geçersiz araç adı.' };
            clean.push({ role, toolCallId, name, content });
        }
    }
    if (total > AI_LIMITS.maxTotalChars) return { error: 'Sohbet çok uzun; yeni bir sohbet başlatın.' };
    if (clean[0].role !== 'user') return { error: 'İlk mesaj kullanıcıdan olmalı.' };
    const lastRole = clean[clean.length - 1].role;
    if (lastRole !== 'user' && lastRole !== 'tool') return { error: 'Son mesaj kullanıcıdan ya da araç sonucundan olmalı.' };
    return {
        body: {
            ...(system ? { system } : {}),
            messages: clean,
            ...(toolCheck.tools && toolCheck.tools.length ? { tools: toolCheck.tools } : {}),
        },
    };
};

const upstreamErrorMessage = (status: number, detail: string): string => {
    const suffix = detail ? ` (${detail})` : '';
    if (status === 401 || status === 403) return `AI sağlayıcısı anahtarı reddetti; sunucudaki AI_API_KEY'i kontrol edin${suffix}.`;
    if (status === 404) return `Model ya da uç nokta bulunamadı; AI_MODEL / AI_BASE_URL'i kontrol edin${suffix}.`;
    if (status === 429) return `AI sağlayıcısı kota/hız sınırına ulaştı; biraz sonra tekrar deneyin${suffix}.`;
    if (status >= 500) return `AI sağlayıcısında geçici bir hata oluştu${suffix}.`;
    return `AI sağlayıcısı isteği reddetti${suffix}.`;
};

export const handleAiRequest = async (request: Request, env: Env, opts: HandlerOptions = {}): Promise<Response> => {
    const fetchImpl = opts.fetchImpl || fetch;
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const route = opts.route || (path.endsWith('/health') ? 'health' : path.endsWith('/chat') ? 'chat' : undefined);
    if (!route) return errorResponse(404, 'not_found', 'Bilinmeyen AI uç noktası.');

    const cfg = readAiConfig(env, { isDev: opts.isDev });
    const cors = corsFor(request, cfg.config?.allowedOrigins || []);
    if (cors === null) return errorResponse(403, 'origin', 'Bu kökenden AI erişimine izin verilmiyor.');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (route === 'health') {
        if (request.method !== 'GET') return errorResponse(405, 'bad_request', 'Yalnızca GET.', cors);
        const status: AiStatus = {
            configured: !!cfg.config,
            authMode: cfg.authMode,
            ...(cfg.provider ? { provider: cfg.provider } : {}),
            ...(cfg.model ? { model: cfg.model } : {}),
            ...(cfg.problem ? { problem: cfg.problem } : {}),
        };
        return jsonResponse(200, status, cors);
    }

    if (request.method !== 'POST') return errorResponse(405, 'bad_request', 'Yalnızca POST.', cors);
    const config = cfg.config;
    if (!config) return errorResponse(503, 'config', cfg.problem || 'AI yapılandırılmamış.', cors);

    const auth = await authorize(request, config, fetchImpl);
    if (!auth.ok) {
        const { status, message } = auth as Extract<AuthResult, { ok: false }>;
        return errorResponse(status, status === 403 ? 'forbidden' : status === 401 ? 'auth' : 'upstream', message, cors);
    }

    const retryAfter = (opts.rateLimiter || sharedLimiter(config.rateLimitPerMin)).hit(auth.subject);
    if (retryAfter > 0) {
        return errorResponse(429, 'rate_limited', `Çok fazla istek; ${retryAfter} sn sonra tekrar deneyin.`, { ...cors, 'retry-after': String(retryAfter) });
    }

    const rawText = await request.text();
    if (rawText.length > AI_LIMITS.maxTotalChars * 2 + 10_000) return errorResponse(413, 'bad_request', 'İstek çok büyük.', cors);
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        return errorResponse(400, 'bad_request', 'İstek gövdesi JSON değil.', cors);
    }
    const { body, error } = validateChatBody(parsed);
    if (!body) return errorResponse(400, 'bad_request', error || 'Geçersiz istek.', cors);

    // Zaman aşımı + istemci bağlantıyı keserse sağlayıcı isteği de iptal edilir
    const upstreamAbort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        upstreamAbort.abort();
    }, config.timeoutMs);
    const onClientAbort = () => upstreamAbort.abort();
    request.signal?.addEventListener('abort', onClientAbort);
    const cleanup = () => {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onClientAbort);
    };

    const up = buildUpstreamRequest(config, body);
    let upstream: Response;
    try {
        upstream = await fetchImpl(up.url, { method: 'POST', headers: up.headers, body: up.body, signal: upstreamAbort.signal });
    } catch {
        cleanup();
        return timedOut
            ? errorResponse(504, 'timeout', 'AI sağlayıcısı zamanında yanıt vermedi.', cors)
            : errorResponse(502, 'upstream', 'AI sağlayıcısına ulaşılamadı; AI_BASE_URL ve ağ erişimini kontrol edin.', cors);
    }

    if (!upstream.ok || !upstream.body) {
        const detail = extractUpstreamError(await upstream.text().catch(() => ''));
        cleanup();
        console.error(`[ai] sağlayıcı hatası: ${config.provider} HTTP ${upstream.status}`);
        return errorResponse(upstream.status === 429 ? 429 : 502, upstream.status === 429 ? 'rate_limited' : 'upstream', upstreamErrorMessage(upstream.status, detail), cors);
    }

    const encoder = new TextEncoder();
    const events = parseUpstreamEvents(config, parseSSE(upstream.body));
    const line = (ev: unknown) => encoder.encode(JSON.stringify(ev) + '\n');

    const stream = new ReadableStream<Uint8Array>({
        async pull(ctrl) {
            try {
                const { done, value } = await events.next();
                if (done) {
                    cleanup();
                    ctrl.close();
                    return;
                }
                ctrl.enqueue(line(value));
            } catch (e) {
                cleanup();
                const message = timedOut
                    ? 'AI yanıtı zaman aşımına uğradı.'
                    : e instanceof UpstreamStreamError
                        ? e.message
                        : 'AI yanıt akışı kesildi.';
                ctrl.enqueue(line({ type: 'error', message }));
                ctrl.close();
            }
        },
        cancel() {
            upstreamAbort.abort();
            cleanup();
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            ...cors,
            'content-type': 'application/x-ndjson; charset=utf-8',
            'cache-control': 'no-store',
            'x-accel-buffering': 'no',
        },
    });
};
