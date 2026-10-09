import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_KEY_HEADER } from '../../utils/ai/protocol';
import { browserKeyEnv, readBrowserKey } from './browserKey';
import { clearGeminiCache } from './gemini';
import { handleAiRequest } from './handler';
import { createRateLimiter } from './rateLimit';
import { invalidateSettingsCache } from './settingsStore';
import { streamOf } from './testUtils';

const gen = ['generateContent'];
const MODELS = [
    { name: 'models/gemini-3.5-flash', supportedGenerationMethods: gen },
    { name: 'models/gemini-3.8-flash-preview', supportedGenerationMethods: gen },
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent', 'batchEmbedContents'] },
];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const sse = () => new Response(streamOf('data: {"candidates":[{"content":{"parts":[{"text":"tamam"}]},"finishReason":"STOP"}]}\n\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } });

// Yayındaki gibi: kurum modeli ortam değişkenlerinde, erişim kodu zorunlu, panel deposu yok
const SERVER = {
    AI_PROVIDER: 'openai', AI_BASE_URL: 'https://ai-api.kurum.local/v1', AI_MODEL: 'general', AI_API_KEY: 'kurum-gizli-anahtar',
    AI_REASONING_EFFORT: 'low', AI_EXTRA_BODY: '{"chat_template_kwargs":{"enable_thinking":false}}', AI_MAX_OUTPUT_TOKENS: '512',
    AI_ACCESS_TOKEN: 'erisim-kodu-123',
};
const KEY = 'AIzaSyTarayiciTestAnahtari_0123456789';
const BASE = 'https://app.local/api/ai';

const req = (path: string, opts: { key?: string; token?: string; body?: unknown } = {}) => new Request(`${BASE}/${path}`, {
    method: opts.body ? 'POST' : 'GET',
    headers: {
        host: 'app.local',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...(opts.key ? { [BROWSER_KEY_HEADER]: opts.key } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
});

const recorder = (respond?: (url: string) => Response | undefined) => {
    const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: (init?.headers || {}) as Record<string, string>, body: init?.body as string | undefined });
        const r = respond?.(url);
        if (r) return r;
        if (url.includes('/models?pageSize')) return json(200, { models: MODELS });
        if (url.includes(':batchEmbedContents')) return json(200, { embeddings: [{ values: Array(768).fill(0.01) }] });
        return sse();
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
};

beforeEach(() => { clearGeminiCache(); invalidateSettingsCache(); });

describe('tarayıcıdaki Gemini test anahtarı', () => {
    it('sunucuda ek ayar olmadan: durum Gemini (otomatik model), kaynak "browser"; başlıksız istek sunucu ayarında kalır', async () => {
        const { calls, fetchImpl } = recorder();
        const h = await (await handleAiRequest(req('health', { key: KEY }), SERVER, { fetchImpl })).json();
        expect(h).toMatchObject({ configured: true, provider: 'gemini', model: 'gemini-3.5-flash', embeddingModel: 'gemini-embedding-001', configSource: 'browser', authMode: 'token', browserKeyAllowed: true });
        expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
        expect(calls[0].headers['x-goog-api-key']).toBe(KEY);

        const plain = await (await handleAiRequest(req('health'), SERVER, { fetchImpl })).json();
        expect(plain).toMatchObject({ configured: true, provider: 'openai', model: 'general', configSource: 'env', browserKeyAllowed: true });
        expect(JSON.stringify([h, plain])).not.toContain(KEY);
    });

    it('sohbet ve anlamsal arama tarayıcı anahtarıyla Google\'a gider; kurum anahtarı ve adresi kullanılmaz; erişim kodu yine zorunlu', async () => {
        const { calls, fetchImpl } = recorder();
        const body = { messages: [{ role: 'user', content: 'merhaba' }] };
        expect((await handleAiRequest(req('chat', { key: KEY, body }), SERVER, { fetchImpl })).status).toBe(401);

        const res = await handleAiRequest(req('chat', { key: KEY, body, token: SERVER.AI_ACCESS_TOKEN }), SERVER, { fetchImpl });
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('tamam');
        const chat = calls.find(c => c.url.includes(':streamGenerateContent'))!;
        expect(chat.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse');
        expect(chat.headers['x-goog-api-key']).toBe(KEY);
        // Kurum modeline özgü üretim ayarları Gemini'ye taşınmaz
        expect(JSON.parse(chat.body!).generationConfig.maxOutputTokens).not.toBe(512);

        const emb = await handleAiRequest(req('embed', { key: KEY, token: SERVER.AI_ACCESS_TOKEN, body: { texts: ['bir'], kind: 'query' } }), SERVER, { fetchImpl });
        expect(emb.status).toBe(200);
        expect(await emb.json()).toMatchObject({ model: 'gemini-embedding-001' });
        const e = calls.find(c => c.url.includes(':batchEmbedContents'))!;
        expect(e.headers['x-goog-api-key']).toBe(KEY);
        expect(JSON.parse(e.body!).requests[0].outputDimensionality).toBe(768);

        expect(calls.every(c => c.url.startsWith('https://generativelanguage.googleapis.com/'))).toBe(true);
        expect(JSON.stringify(calls)).not.toContain('kurum-gizli-anahtar');
    });

    it('geçersiz anahtar: durum nedenini ve anahtarın bu tarayıcıda olduğunu söyler; sağlayıcı reddederse hata mesajı da', async () => {
        const bad = recorder(() => json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }));
        const h = await (await handleAiRequest(req('health', { key: KEY }), SERVER, { fetchImpl: bad.fetchImpl })).json();
        expect(h.configured).toBe(false);
        expect(h.configSource).toBe('browser');
        expect(h.problem).toBe('Bu tarayıcıdaki Gemini test anahtarı: Gemini API anahtarı geçersiz; Google AI Studio\'dan yeni anahtar alın. Anahtarı Yönetici konsolu › Yapay zekâ bölümünden değiştirin ya da kaldırın.');

        clearGeminiCache();
        const denied = recorder(url => (url.includes(':streamGenerateContent') ? json(403, { error: { message: 'Permission denied' } }) : undefined));
        const res = await handleAiRequest(req('chat', { key: KEY, token: SERVER.AI_ACCESS_TOKEN, body: { messages: [{ role: 'user', content: 'x' }] } }), SERVER, { fetchImpl: denied.fetchImpl });
        expect(res.status).toBe(502);
        expect((await res.json()).error).toMatch(/bu tarayıcıdaki Gemini test anahtarını/);
    });

    it('AI_ALLOW_BROWSER_KEY=0: sessizce sunucu ayarına düşmez, nedenini söyler', async () => {
        const env = { ...SERVER, AI_ALLOW_BROWSER_KEY: '0' };
        const { calls, fetchImpl } = recorder();
        const h = await (await handleAiRequest(req('health', { key: KEY }), env, { fetchImpl })).json();
        expect(h).toMatchObject({ configured: false, configSource: 'browser', browserKeyAllowed: false });
        expect(h.problem).toMatch(/AI_ALLOW_BROWSER_KEY=0/);
        const chat = await handleAiRequest(req('chat', { key: KEY, token: SERVER.AI_ACCESS_TOKEN, body: { messages: [{ role: 'user', content: 'x' }] } }), env, { fetchImpl });
        expect(chat.status).toBe(403);
        expect(calls).toHaveLength(0);
        expect((await (await handleAiRequest(req('health'), env, { fetchImpl })).json()).browserKeyAllowed).toBe(false);
    });

    it('biçimi bozuk anahtar sağlayıcıya gönderilmez', async () => {
        const { calls, fetchImpl } = recorder();
        const h = await (await handleAiRequest(req('health', { key: 'kisa' }), SERVER, { fetchImpl })).json();
        expect(h).toMatchObject({ configured: false, configSource: 'browser' });
        expect(h.problem).toMatch(/geçersiz biçimde/);
        expect(calls).toHaveLength(0);
        expect(readBrowserKey(new Request(BASE, { headers: { [BROWSER_KEY_HEADER]: `${KEY}/../x` } }), {}).problem).toBeTruthy();
    });

    it('anahtarlı istekler istemci başına sınırlı (model listesi isteği doğrulamadan önce gider)', async () => {
        const { fetchImpl } = recorder();
        const rateLimiter = createRateLimiter(1);
        expect((await handleAiRequest(req('health', { key: KEY }), SERVER, { fetchImpl, rateLimiter })).status).toBe(200);
        const second = await handleAiRequest(req('health', { key: KEY }), SERVER, { fetchImpl, rateLimiter });
        expect(second.status).toBe(429);
        expect(second.headers.get('retry-after')).toBeTruthy();
    });

    it('yönetim ucu başlığı dikkate almaz', async () => {
        const { calls, fetchImpl } = recorder();
        const res = await handleAiRequest(new Request(`${BASE}/admin`, { method: 'POST', headers: { host: 'app.local', 'content-type': 'application/json', [BROWSER_KEY_HEADER]: KEY }, body: JSON.stringify({ action: 'get' }) }), SERVER, { fetchImpl });
        expect(res.status).toBe(503);
        expect(calls).toHaveLength(0);
    });

    it('ortam üst katmanı: sabit Google adresi, aynı anahtar embedding için; kurum ayarları atılır', () => {
        const env = browserKeyEnv({ ...SERVER, AI_EMBEDDING_DIMENSIONS: '1024', AI_EMBEDDING_BASE_URL: 'https://emb.kurum.local' }, KEY);
        expect(env).toMatchObject({ AI_PROVIDER: 'gemini', AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta', AI_API_KEY: KEY, AI_MODEL: 'auto', AI_EMBEDDING_PROVIDER: 'gemini', AI_EMBEDDING_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta', AI_EMBEDDING_API_KEY: KEY, AI_ACCESS_TOKEN: SERVER.AI_ACCESS_TOKEN });
        for (const k of ['AI_REASONING_EFFORT', 'AI_EXTRA_BODY', 'AI_MAX_OUTPUT_TOKENS', 'AI_EMBEDDING_DIMENSIONS']) expect(env[k]).toBeUndefined();
    });
});
