import { AI_LIMITS, AiStatus, BROWSER_KEY_HEADER, ChatMessage, ChatRequestBody, TOOL_NAME_PATTERN, ToolCall, ToolSpec } from '../../utils/ai/protocol.js';
import { AuthResult, authorize } from './auth.js';
import { Env, readAiConfig } from './config.js';
import { buildEmbedRequest, parseEmbedResponse, readEmbeddingConfig, validateEmbedBody } from './embeddings.js';
import { buildUpstreamRequest, extractUpstreamError, parseUpstreamEvents, UpstreamStreamError } from './providers.js';
import { createRateLimiter, RateLimiter } from './rateLimit.js';
import { parseSSE } from './sse.js';
import { describeNetworkError, networkErrorCode, upstreamFetch } from './tls.js';
import { handleAiAdmin } from './admin.js';
import { clientIp } from './auth.js';
import { browserKeyAllowed, browserKeyEnv, browserKeyProblem, readBrowserKey } from './browserKey.js';
import { upstreamErrorMessage } from './errors.js';
import { GeminiAuto } from './gemini.js';
import { effectiveEnv, prepareEnv } from './settingsStore.js';

/**
 * AI proxy — çatıdan bağımsız (Web Request → Response). Vercel fonksiyonu
 * (api/ai/*) ve Vite geliştirme sunucusu (vite.config.ts) bu işleyiciyi çağırır.
 *
 *   GET  …/health → AiStatus (anahtar içermez)
 *   POST …/embed  → { vectors } (RAG anlamsal arama; isteğe bağlı)
 *   POST …/chat   → NDJSON akışı (ChatStreamEvent satırları)
 *
 * Mesaj içerikleri hiçbir zaman loglanmaz.
 */

export type ErrorCode = 'config' | 'auth' | 'forbidden' | 'origin' | 'rate_limited' | 'bad_request' | 'upstream' | 'timeout' | 'not_found';

export interface HandlerOptions {
    isDev?: boolean;
    fetchImpl?: typeof fetch;
    rateLimiter?: RateLimiter;
    route?: 'health' | 'chat' | 'embed' | 'admin';
    /** Sağlayıcı yoğunken yeniden denemeden önce bekleme (ms; testlerde 0) */
    retryDelayMs?: number;
}

/**
 * Tarayıcı test anahtarıyla gelen istekler (istemci IP'si başına, dakikada).
 * Amaç yetkilendirmeden önce giden model listesi isteklerini sınırlamak;
 * anlamsal arama dizinlemesi (embedding grupları) takılmasın diye geniş.
 */
const BROWSER_KEY_PER_MIN = 180;

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
            'access-control-allow-headers': `authorization, content-type, ${BROWSER_KEY_HEADER}`,
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

/** Sağlayıcının geçici yoğunluk / kesinti yanıtları (yeniden denenir) */
const OVERLOADED = new Set([500, 502, 503, 504]);

/** İptal edilebilir bekleme */
const pause = (ms: number, signal: AbortSignal): Promise<void> => new Promise(resolve => {
    if (ms <= 0 || signal.aborted) { resolve(); return; }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

/** Sağlayıcı anahtarı reddederse kullanıcıya hangi anahtarın denetleneceği söylenir */
const keyNameOf = (source: 'panel' | 'env' | 'browser'): string | undefined =>
    source === 'browser' ? 'bu tarayıcıdaki Gemini test anahtarını (Yönetici konsolu › Yapay zekâ)' : undefined;

const hostOf = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return '?';
    }
};

export const handleAiRequest = async (request: Request, rawEnv: Env, opts: HandlerOptions = {}): Promise<Response> => {
    const fetchImpl = opts.fetchImpl || fetch;
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const route = opts.route || (path.endsWith('/health') ? 'health' : path.endsWith('/chat') ? 'chat' : path.endsWith('/embed') ? 'embed' : path.endsWith('/admin') ? 'admin' : undefined);
    if (!route) return errorResponse(404, 'not_found', 'Bilinmeyen AI uç noktası.');

    // Tarayıcıdaki Gemini test anahtarı yalnız o tarayıcının isteklerinde sunucu ayarının yerine geçer
    const browser = route === 'admin' || request.method === 'OPTIONS' ? {} : readBrowserKey(request, rawEnv);
    if (browser.key) {
        // Anahtar doğrulanmadan önce sağlayıcıya model listesi isteği gider: istemci başına sınırlı
        const wait = (opts.rateLimiter || sharedLimiter(BROWSER_KEY_PER_MIN)).hit(`browser-key:${clientIp(request)}`);
        if (wait > 0) return errorResponse(429, 'rate_limited', `Çok fazla istek; ${wait} sn sonra tekrar deneyin.`, { 'retry-after': String(wait) });
    }
    // Yönetici panelinden girilen bağlantı ayarları ortam değişkenlerinin üzerine yazılır
    const eff: { env: Env; source: 'panel' | 'env' | 'browser'; auto: GeminiAuto; problem?: string } = browser.key
        ? { ...(await prepareEnv(browserKeyEnv(rawEnv, browser.key), opts.fetchImpl)), source: 'browser' }
        : await effectiveEnv(rawEnv, { isDev: opts.isDev, fetchImpl: opts.fetchImpl });
    const env = eff.env;
    const cfg = readAiConfig(env, { isDev: opts.isDev });
    const cors = corsFor(request, cfg.config?.allowedOrigins || []);
    if (cors === null) return errorResponse(403, 'origin', 'Bu kökenden AI erişimine izin verilmiyor.');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Yönetim ucu yapılandırma eksikken de çalışır (ilk kurulum panelden yapılabilsin)
    if (route === 'admin') return handleAiAdmin(request, rawEnv, { isDev: opts.isDev, fetchImpl: opts.fetchImpl }, cors);

    // Tarayıcı anahtarı bu sunucuda kullanılamıyorsa sessizce sunucu ayarına düşülmez
    if (browser.problem) {
        if (route === 'health') {
            return jsonResponse(200, { configured: false, authMode: cfg.authMode, configSource: 'browser', browserKeyAllowed: browserKeyAllowed(rawEnv), problem: browser.problem } satisfies AiStatus, cors);
        }
        return errorResponse(403, 'forbidden', browser.problem, cors);
    }

    if (route === 'health') {
        if (request.method !== 'GET') return errorResponse(405, 'bad_request', 'Yalnızca GET.', cors);
        // Gemini model listesi alınamadıysa asıl neden odur ("AI_MODEL tanımlı değil" değil)
        // (tarayıcı anahtarındaki sorun sunucu ayarı sanılmasın diye nerede olduğu da söylenir)
        const problem = !cfg.problem ? undefined
            : eff.problem && !cfg.config ? (eff.source === 'browser' ? browserKeyProblem(eff.problem) : eff.problem)
            : cfg.problem;
        const status: AiStatus = {
            configured: !!cfg.config,
            authMode: cfg.authMode,
            configSource: eff.source,
            browserKeyAllowed: browserKeyAllowed(rawEnv),
            ...(cfg.provider ? { provider: cfg.provider } : {}),
            ...(cfg.model ? { model: cfg.model } : {}),
            ...(problem ? { problem } : {}),
        };
        const emb = readEmbeddingConfig(env);
        if (emb.config) status.embeddingModel = emb.config.model;
        else if (emb.problem) status.embeddingProblem = emb.problem;
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

    if (route === 'embed') return handleEmbed(request, env, auth.subject, cors, opts, config.timeoutMs, keyNameOf(eff.source));

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

    // Sağlayıcı yoğunsa (503 vb.) kısa bir beklemeyle bir kez yeniden denenir. Gemini modeli
    // otomatik seçildiyse sonra sıradaki modele geçilir; her modelin kapasitesi ve ücretsiz
    // kotası ayrı olduğundan kota dolunca (429) da doğrudan sıradaki model denenir.
    const models = eff.auto.model && eff.auto.model === config.model ? [config.model, ...(eff.auto.fallbacks || [])] : [config.model];
    const first = buildUpstreamRequest(config, body);
    const send = opts.fetchImpl || upstreamFetch(first.url, env);
    let active = config;
    let upstream: Response;
    let firstFail: { status: number; detail: string } | undefined;
    for (let attempt = 0, mi = 0; ; attempt++) {
        active = mi === 0 ? config : { ...config, model: models[mi] };
        const up = mi === 0 ? first : buildUpstreamRequest(active, body);
        try {
            upstream = await send(up.url, { method: 'POST', headers: up.headers, body: up.body, signal: upstreamAbort.signal });
        } catch (err) {
            cleanup();
            if (timedOut) return errorResponse(504, 'timeout', 'AI sağlayıcısı zamanında yanıt vermedi.', cors);
            console.error(`[ai] sağlayıcıya bağlanılamadı: ${active.provider} ${hostOf(up.url)} ${networkErrorCode(err) || 'bilinmeyen'}`);
            return errorResponse(502, 'upstream', `AI sağlayıcısına ulaşılamadı: ${describeNetworkError(err)}.`, cors);
        }
        if ((upstream.ok && upstream.body) || attempt >= 3) break;
        const overloaded = OVERLOADED.has(upstream.status);
        const sameAgain = overloaded && attempt === 0;
        if (!sameAgain && !((overloaded || upstream.status === 429) && mi + 1 < models.length)) break;
        if (!sameAgain) mi++;
        const text = await upstream.text().catch(() => '');
        firstFail ??= { status: upstream.status, detail: extractUpstreamError(text) };
        console.warn(`[ai] ${active.provider} ${active.model} HTTP ${upstream.status}; ${sameAgain ? 'yeniden deneniyor' : `${models[mi]} ile deneniyor`}`);
        await pause(sameAgain ? opts.retryDelayMs ?? 800 : Math.min(300, opts.retryDelayMs ?? 300), upstreamAbort.signal);
    }

    if (!upstream.ok || !upstream.body) {
        let status = upstream.status;
        let detail = extractUpstreamError(await upstream.text().catch(() => ''));
        cleanup();
        console.error(`[ai] sağlayıcı hatası: ${active.provider} ${active.model} HTTP ${status}`);
        // Yedek model başka bir nedenle reddettiyse (ör. önceki turun model imzası) asıl neden ilk hatadır
        if (firstFail && !OVERLOADED.has(status) && status !== 429) ({ status, detail } = firstFail);
        return errorResponse(status === 429 ? 429 : 502, status === 429 ? 'rate_limited' : 'upstream', upstreamErrorMessage(status, detail, keyNameOf(eff.source)), cors);
    }

    const encoder = new TextEncoder();
    const events = parseUpstreamEvents(active, parseSSE(upstream.body!));
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

/** POST …/embed — belge/sorgu metinleri için embedding vektörleri */
const handleEmbed = async (
    request: Request,
    env: Env,
    subject: string,
    cors: Record<string, string>,
    opts: HandlerOptions,
    timeoutMs: number,
    keyName?: string,
): Promise<Response> => {
    const emb = readEmbeddingConfig(env);
    if (!emb.config) return errorResponse(503, 'config', emb.problem || 'Embedding modeli yapılandırılmamış (AI_EMBEDDING_MODEL).', cors);
    const c = emb.config;

    const retryAfter = (opts.rateLimiter || sharedLimiter(c.rateLimitPerMin)).hit(`embed:${subject}`);
    if (retryAfter > 0) {
        return errorResponse(429, 'rate_limited', `Çok fazla embedding isteği; ${retryAfter} sn sonra tekrar deneyin.`, { ...cors, 'retry-after': String(retryAfter) });
    }

    const rawText = await request.text();
    if (rawText.length > AI_LIMITS.maxEmbedTexts * AI_LIMITS.maxEmbedChars * 2) return errorResponse(413, 'bad_request', 'İstek çok büyük.', cors);
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        return errorResponse(400, 'bad_request', 'İstek gövdesi JSON değil.', cors);
    }
    const { body, error } = validateEmbedBody(parsed);
    if (!body) return errorResponse(400, 'bad_request', error || 'Geçersiz istek.', cors);

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
        const up = buildEmbedRequest(c, body);
        let res: Response;
        try {
            const send = opts.fetchImpl || upstreamFetch(up.url, env);
            res = await send(up.url, { method: 'POST', headers: up.headers, body: up.body, signal: abort.signal });
        } catch (err) {
            if (abort.signal.aborted) return errorResponse(504, 'timeout', 'Embedding sağlayıcısı zamanında yanıt vermedi.', cors);
            console.error(`[ai] embedding sağlayıcısına bağlanılamadı: ${c.provider} ${hostOf(up.url)} ${networkErrorCode(err) || 'bilinmeyen'}`);
            return errorResponse(502, 'upstream', `Embedding sağlayıcısına ulaşılamadı: ${describeNetworkError(err)}.`, cors);
        }
        const text = await res.text().catch(() => '');
        if (!res.ok) {
            console.error(`[ai] embedding hatası: ${c.provider} HTTP ${res.status}`);
            return errorResponse(res.status === 429 ? 429 : 502, res.status === 429 ? 'rate_limited' : 'upstream',
                upstreamErrorMessage(res.status, extractUpstreamError(text), keyName).replace('AI_API_KEY', 'AI_EMBEDDING_API_KEY').replace('AI_MODEL', 'AI_EMBEDDING_MODEL'), cors);
        }
        let vectors: number[][];
        try {
            vectors = parseEmbedResponse(c, JSON.parse(text), body.texts.length);
        } catch (e) {
            return errorResponse(502, 'upstream', (e as Error).message || 'Embedding yanıtı okunamadı.', cors);
        }
        return jsonResponse(200, { vectors, model: c.model }, cors);
    } finally {
        clearTimeout(timer);
    }
};
