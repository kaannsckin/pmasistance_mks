import { clientIp, safeEqual } from './auth.js';
import { Env, readAiConfig } from './config.js';
import { buildEmbedRequest, parseEmbedResponse, readEmbeddingConfig } from './embeddings.js';
import { upstreamErrorMessage } from './errors.js';
import { buildUpstreamRequest, extractUpstreamError, parseUpstreamEvents } from './providers.js';
import { createRateLimiter } from './rateLimit.js';
import { EDITABLE_KEYS, EditableKey, effectiveEnv, loadSettings, resolveSettingsStore, saveSettings, SECRET_KEYS, secretHint } from './settingsStore.js';
import { parseSSE } from './sse.js';
import { describeNetworkError, upstreamFetch } from './tls.js';

/**
 * POST …/admin — yönetici panelinden AI bağlantısı (yalnız sunucu):
 *   get   → panel ve ortam değişkeni değerleri (anahtarlar yalnız son 4 haneyle), etkin durum
 *   save  → panel ayarlarını doğrulayıp şifreli kaydeder
 *   clear → panel ayarlarını siler (ortam değişkenlerine dönülür)
 *   test  → kaydetmeden (taslak) ya da mevcut ayarla kısa bir istek ve embedding denemesi
 * Yetki: AI_ADMIN_TOKEN (x-admin-token başlığı); tanımlı değilse yalnız yerel geliştirmede açık.
 */

export interface AdminOptions {
    isDev?: boolean;
    fetchImpl?: typeof fetch;
    now?: () => number;
}

const limiter = createRateLimiter(30);
const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

type Draft = Partial<Record<EditableKey, string>>;

/** İstekteki taslak: gizli alan verilmediyse panelde kayıtlı olan kalır; boş metin silmek demektir */
const applyDraft = (stored: Draft, raw: unknown): Draft => {
    const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: Draft = {};
    for (const k of EDITABLE_KEYS) {
        if (SECRET_KEYS.includes(k)) {
            if (typeof v[k] === 'string') { if (clean(v[k])) out[k] = clean(v[k]); }
            else if (stored[k]) out[k] = stored[k];
        } else if (clean(v[k])) out[k] = clean(v[k]);
    }
    return out;
};

/** Sağlayıcı ayarlarının denetimi (erişim koruması ayrı denetlenir) */
const check = (env: Env) => {
    const probe = { ...env, AI_AUTH_MODE: 'none' };
    const chat = readAiConfig(probe, { isDev: true });
    const emb = readEmbeddingConfig(probe);
    return { chat, emb };
};

const masked = (values: Draft) => Object.fromEntries(EDITABLE_KEYS.flatMap(k => {
    const v = values[k];
    if (!v) return [];
    return [[k, SECRET_KEYS.includes(k) ? secretHint(v)! : v]];
})) as Draft;

const envValues = (env: Env): Draft => Object.fromEntries(EDITABLE_KEYS.flatMap(k => (clean(env[k]) ? [[k, clean(env[k])]] : []))) as Draft;

const TEST_TIMEOUT_MS = 30_000;

/** Sağlayıcı hata metnini panel diline çevirir (ortam değişkeni adları yerine alan adları) */
const forPanel = (msg: string) => msg
    .replace(/sunucudaki AI_EMBEDDING_API_KEY'i/g, 'embedding API anahtarını').replace(/sunucudaki AI_API_KEY'i/g, 'API anahtarını')
    .replace(/AI_EMBEDDING_MODEL \/ AI_BASE_URL/g, 'embedding model adını ve adresini').replace(/AI_MODEL \/ AI_BASE_URL/g, 'model adını ve adresi (base URL)');

/** Kısa bir sohbet isteği: yanıt süresi ve ilk sözcükler */
const testChat = async (env: Env, fetchImpl?: typeof fetch) => {
    const { chat } = check(env);
    if (!chat.config) return { ok: false, error: chat.problem || 'Yapılandırma eksik.' };
    const config = { ...chat.config, maxOutputTokens: Math.min(chat.config.maxOutputTokens, 512) };
    const up = buildUpstreamRequest(config, { system: 'Kısa yanıt ver.', messages: [{ role: 'user', content: 'Bağlantı testi: yalnızca "tamam" yaz.' }] });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), Math.min(config.timeoutMs, TEST_TIMEOUT_MS));
    const t0 = Date.now();
    try {
        let res: Response;
        try {
            res = await (fetchImpl || upstreamFetch(up.url, env))(up.url, { method: 'POST', headers: up.headers, body: up.body, signal: abort.signal });
        } catch (e) {
            return { ok: false, error: abort.signal.aborted ? 'Sağlayıcı zamanında yanıt vermedi.' : `Sağlayıcıya ulaşılamadı: ${describeNetworkError(e)}. Adresi (AI_BASE_URL) ve ağ erişimini kontrol edin.` };
        }
        if (!res.ok || !res.body) return { ok: false, status: res.status, error: forPanel(upstreamErrorMessage(res.status, extractUpstreamError(await res.text().catch(() => '')))) };
        let reply = '';
        for await (const ev of parseUpstreamEvents(config, parseSSE(res.body))) {
            if (ev.type === 'delta') reply += ev.text;
            else if (ev.type === 'error') return { ok: false, error: ev.message };
            else if (ev.type === 'done') break;
            if (reply.length > 400) break;
        }
        return { ok: true, latencyMs: Date.now() - t0, reply: reply.trim().slice(0, 160), provider: config.provider, model: config.model };
    } catch (e) {
        return { ok: false, error: abort.signal.aborted ? 'Yanıt zaman aşımına uğradı.' : (e as Error).message || 'Yanıt okunamadı.' };
    } finally {
        clearTimeout(timer);
    }
};

/** Embedding modeli tanımlıysa tek metinle deneme */
const testEmbed = async (env: Env, fetchImpl?: typeof fetch) => {
    const { emb } = check(env);
    if (!emb.config) return emb.problem ? { ok: false, error: emb.problem } : null;
    const up = buildEmbedRequest(emb.config, { texts: ['bağlantı testi'], kind: 'query' });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TEST_TIMEOUT_MS);
    const t0 = Date.now();
    try {
        const res = await (fetchImpl || upstreamFetch(up.url, env))(up.url, { method: 'POST', headers: up.headers, body: up.body, signal: abort.signal });
        const text = await res.text().catch(() => '');
        if (!res.ok) return { ok: false, status: res.status, error: forPanel(upstreamErrorMessage(res.status, extractUpstreamError(text)).replace('AI_API_KEY', 'AI_EMBEDDING_API_KEY').replace('AI_MODEL', 'AI_EMBEDDING_MODEL')) };
        const [vec] = parseEmbedResponse(emb.config, JSON.parse(text), 1);
        return { ok: true, latencyMs: Date.now() - t0, dimensions: vec?.length || 0, model: emb.config.model };
    } catch (e) {
        return { ok: false, error: abort.signal.aborted ? 'Embedding sağlayıcısı zamanında yanıt vermedi.' : `Embedding denemesi başarısız: ${describeNetworkError(e)}.` };
    } finally {
        clearTimeout(timer);
    }
};

export const handleAiAdmin = async (request: Request, env: Env, opts: AdminOptions, cors: Record<string, string>): Promise<Response> => {
    if (request.method !== 'POST') return json(405, { error: 'Yalnızca POST.', code: 'bad_request' }, cors);
    const adminToken = clean(env.AI_ADMIN_TOKEN);
    if (!adminToken && !opts.isDev) {
        return json(503, { error: 'Panelden AI yapılandırması kapalı: sunucuda AI_ADMIN_TOKEN tanımlanmalı.', code: 'config' }, cors);
    }
    const wait = limiter.hit(`admin:${clientIp(request)}`);
    if (wait > 0) return json(429, { error: `Çok fazla deneme; ${wait} sn sonra tekrar deneyin.`, code: 'rate_limited' }, { ...cors, 'retry-after': String(wait) });
    if (adminToken && !safeEqual(request.headers.get('x-admin-token') || '', adminToken)) {
        return json(401, { error: 'Yönetici anahtarı hatalı.', code: 'auth' }, cors);
    }

    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { return json(400, { error: 'İstek gövdesi JSON değil.', code: 'bad_request' }, cors); }
    const action = body.action;
    const { store, problem: storeProblem } = resolveSettingsStore(env, opts);
    let stored: Draft = {};
    let updatedAt: string | undefined;
    if (store) {
        try { ({ values: stored, updatedAt } = await loadSettings(store)); } catch (e) {
            return json(502, { error: (e as Error).message, code: 'upstream' }, cors);
        }
    }

    if (action === 'get') {
        const eff = await effectiveEnv(env, opts);
        const { chat, emb } = check(eff.env);
        return json(200, {
            store: { available: !!store, kind: store?.backend.kind, problem: storeProblem },
            source: eff.source,
            updatedAt,
            panel: masked(stored),
            env: masked(envValues(env)),
            effective: {
                configured: !!chat.config, provider: chat.provider, model: chat.model, baseUrl: chat.config?.baseUrl, problem: chat.problem,
                embeddingModel: emb.config?.model, embeddingProblem: emb.problem,
            },
        }, cors);
    }

    if (action === 'test') {
        // Taslak verildiyse kaydetmeden onunla; yoksa etkin ayarla
        const draft = body.values ? applyDraft(stored, body.values) : stored;
        const merged = { ...env, ...draft };
        const [chat, embed] = await Promise.all([testChat(merged, opts.fetchImpl), testEmbed(merged, opts.fetchImpl)]);
        return json(200, { chat, embed }, cors);
    }

    if (action === 'save' || action === 'clear') {
        if (!store) return json(503, { error: storeProblem, code: 'config' }, cors);
        const next = action === 'clear' ? {} : applyDraft(stored, body.values);
        if (action === 'save') {
            const { chat, emb } = check({ ...env, ...next });
            if (!chat.config) return json(400, { error: `Kaydedilmedi: ${chat.problem}`, code: 'bad_request' }, cors);
            if (emb.problem) return json(400, { error: `Kaydedilmedi: ${emb.problem}`, code: 'bad_request' }, cors);
        }
        try {
            await saveSettings(store, next);
        } catch (e) {
            return json(502, { error: (e as Error).message, code: 'upstream' }, cors);
        }
        console.info(`[ai] panel ayarları ${action === 'clear' ? 'silindi' : 'güncellendi'}`);
        return json(200, { ok: true }, cors);
    }

    return json(400, { error: 'Bilinmeyen işlem.', code: 'bad_request' }, cors);
};
