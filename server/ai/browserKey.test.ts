import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_BASE_URL_HEADER, BROWSER_KEY_HEADER, BROWSER_MODEL_HEADER, BROWSER_PROVIDER_HEADER, LEGACY_BROWSER_KEY_HEADER } from '../../utils/ai/protocol';
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

const req = (path: string, opts: { key?: string; token?: string; body?: unknown; extra?: Record<string, string> } = {}) => new Request(`${BASE}/${path}`, {
    method: opts.body ? 'POST' : 'GET',
    headers: {
        host: 'app.local',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...(opts.key ? { [BROWSER_KEY_HEADER]: opts.key } : {}),
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...opts.extra,
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

describe('tarayıcıdaki AI bağlantısı', () => {
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
        expect(h.problem).toBe('Bu tarayıcıdaki AI bağlantısı: Gemini API anahtarı geçersiz; Google AI Studio\'dan yeni anahtar alın. Bağlantıyı Yönetici konsolu › Yapay zekâ bölümünden değiştirin ya da kaldırın.');

        clearGeminiCache();
        const denied = recorder(url => (url.includes(':streamGenerateContent') ? json(403, { error: { message: 'Permission denied' } }) : undefined));
        const res = await handleAiRequest(req('chat', { key: KEY, token: SERVER.AI_ACCESS_TOKEN, body: { messages: [{ role: 'user', content: 'x' }] } }), SERVER, { fetchImpl: denied.fetchImpl });
        expect(res.status).toBe(502);
        expect((await res.json()).error).toMatch(/bu tarayıcıdaki AI bağlantısının API anahtarını/);
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
    it('OpenAI: sabit adres, aynı anahtarla anlamsal arama; kurum adresi ve anahtarı kullanılmaz', async () => {
        const oai = 'sk-proj-TarayiciAnahtari_0123456789';
        const { calls, fetchImpl } = recorder(url => (url.endsWith('/chat/completions') ? new Response(streamOf('data: {"choices":[{"delta":{"content":"tamam"}}]}\n\ndata: [DONE]\n\n'), { status: 200 }) : undefined));
        const extra = { [BROWSER_PROVIDER_HEADER]: 'openai', [BROWSER_MODEL_HEADER]: 'gpt-4.1-mini' };
        const h = await (await handleAiRequest(req('health', { key: oai, extra }), SERVER, { fetchImpl })).json();
        expect(h).toMatchObject({ configured: true, provider: 'openai', model: 'gpt-4.1-mini', embeddingModel: 'text-embedding-3-small', configSource: 'browser' });
        const res = await handleAiRequest(req('chat', { key: oai, extra, token: SERVER.AI_ACCESS_TOKEN, body: { messages: [{ role: 'user', content: 'x' }] } }), SERVER, { fetchImpl });
        expect(res.status).toBe(200);
        expect(calls.at(-1)!.url).toBe('https://api.openai.com/v1/chat/completions');
        expect(calls.at(-1)!.headers.authorization).toBe(`Bearer ${oai}`);
        const body = JSON.parse(calls.at(-1)!.body!);
        expect(body.reasoning_effort).toBeUndefined();
        expect(body.chat_template_kwargs).toBeUndefined();
    });

    it('model eksik, sağlayıcı tanınmıyor ya da Azure adresi kuruma ait değilse istek gitmez', async () => {
        const { calls, fetchImpl } = recorder();
        const ask = async (extra: Record<string, string>) => (await (await handleAiRequest(req('health', { key: KEY, extra }), SERVER, { fetchImpl })).json()).problem as string;
        expect(await ask({ [BROWSER_PROVIDER_HEADER]: 'anthropic' })).toMatch(/model adı eksik/);
        expect(await ask({ [BROWSER_PROVIDER_HEADER]: 'kurum' })).toMatch(/sağlayıcı tanınmadı/);
        expect(await ask({ [BROWSER_PROVIDER_HEADER]: 'azure', [BROWSER_MODEL_HEADER]: 'gpt', [BROWSER_BASE_URL_HEADER]: 'https://ai-api.kurum.local/v1' })).toMatch(/Azure adresi/);
        expect(await ask({ [BROWSER_PROVIDER_HEADER]: 'azure', [BROWSER_MODEL_HEADER]: 'gpt', [BROWSER_BASE_URL_HEADER]: 'https://x.openai.azure.com.saldirgan.example/v1' })).toMatch(/Azure adresi/);
        expect(calls).toHaveLength(0);
        const az = readBrowserKey(new Request(BASE, { headers: { [BROWSER_KEY_HEADER]: KEY, [BROWSER_PROVIDER_HEADER]: 'azure', [BROWSER_MODEL_HEADER]: 'gpt', [BROWSER_BASE_URL_HEADER]: 'https://kaynak.openai.azure.com/openai/v1/' } }), {});
        expect(az.conn).toMatchObject({ provider: 'azure', baseUrl: 'https://kaynak.openai.azure.com/openai/v1' });
    });

    it('sunucuda hiç ayar yokken (Vercel değişkeni yok) bağlantı tek başına çalışır: erişim koruması aranmaz', async () => {
        const { fetchImpl } = recorder();
        expect((await (await handleAiRequest(req('health'), {}, { fetchImpl })).json()).configured).toBe(false);
        const h = await (await handleAiRequest(req('health', { key: KEY }), {}, { fetchImpl })).json();
        expect(h).toMatchObject({ configured: true, authMode: 'none', configSource: 'browser' });
        const res = await handleAiRequest(req('chat', { key: KEY, body: { messages: [{ role: 'user', content: 'x' }] } }), {}, { fetchImpl });
        expect(res.status).toBe(200);
        // Başlıksız istek açık uç olmaz
        expect((await handleAiRequest(req('chat', { body: { messages: [{ role: 'user', content: 'x' }] } }), {}, { fetchImpl })).status).toBe(503);
    });

    it('eski istemcinin x-gemini-api-key başlığı Gemini bağlantısı olarak kabul edilir', async () => {
        const { fetchImpl } = recorder();
        const res = await handleAiRequest(new Request(`${BASE}/health`, { headers: { host: 'app.local', [LEGACY_BROWSER_KEY_HEADER]: KEY } }), SERVER, { fetchImpl });
        expect(await res.json()).toMatchObject({ configured: true, provider: 'gemini', configSource: 'browser' });
    });
});
