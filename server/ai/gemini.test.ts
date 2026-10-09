import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGeminiCache, geminiKeyAlias, pickGeminiChatModel, pickGeminiEmbeddingModel, withGeminiDefaults } from './gemini';
import { handleAiRequest } from './handler';
import { invalidateSettingsCache } from './settingsStore';
import { streamOf } from './testUtils';

const gen = ['generateContent', 'countTokens'];
const emb = ['embedContent', 'batchEmbedContents'];
const MODELS = [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: gen },
    { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: gen },
    { name: 'models/gemini-3.5-flash', supportedGenerationMethods: gen },
    { name: 'models/gemini-3.5-flash-001', supportedGenerationMethods: gen },
    { name: 'models/gemini-3.8-flash-preview', supportedGenerationMethods: gen },
    { name: 'models/gemini-3.5-flash-image', supportedGenerationMethods: gen },
    { name: 'models/gemini-3.1-pro', supportedGenerationMethods: gen },
    { name: 'models/gemini-flash-latest', supportedGenerationMethods: gen },
    { name: 'models/text-embedding-004', supportedGenerationMethods: emb },
    { name: 'models/gemini-embedding-001', supportedGenerationMethods: emb },
    { name: 'models/gemini-embedding-exp-03-07', supportedGenerationMethods: emb },
];
const asModels = (list: typeof MODELS) => list.map(m => ({ id: m.name.replace('models/', ''), methods: m.supportedGenerationMethods }));
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => { clearGeminiCache(); invalidateSettingsCache(); });

describe('Gemini model seçimi', () => {
    it('en yüksek sürümlü kararlı Flash; önizleme, lite ve görüntü modeli seçilmez', () => {
        expect(pickGeminiChatModel(asModels(MODELS))).toBe('gemini-3.5-flash');
        expect(pickGeminiChatModel(asModels(MODELS.filter(m => !/3\.5-flash$|2\.5-flash$|3\.5-flash-001/.test(m.name))))).toBe('gemini-flash-latest');
        expect(pickGeminiChatModel(asModels([{ name: 'models/gemini-4-flash-002', supportedGenerationMethods: gen }, { name: 'models/gemini-3.5-flash', supportedGenerationMethods: gen }]))).toBe('gemini-4-flash-002');
        expect(pickGeminiChatModel([])).toBeUndefined();
    });

    it('embedding: en yüksek numaralı gemini-embedding; yoksa text-embedding', () => {
        expect(pickGeminiEmbeddingModel(asModels(MODELS))).toBe('gemini-embedding-001');
        expect(pickGeminiEmbeddingModel(asModels(MODELS.filter(m => !/gemini-embedding/.test(m.name))))).toBe('text-embedding-004');
    });

    it('GEMINI_API_KEY tek başına sağlayıcıyı gemini yapar; başka anahtar ya da sağlayıcı varsa dokunmaz', () => {
        expect(geminiKeyAlias({ GEMINI_API_KEY: 'g' })).toMatchObject({ AI_PROVIDER: 'gemini', AI_API_KEY: 'g' });
        expect(geminiKeyAlias({ GEMINI_API_KEY: 'g', AI_API_KEY: 'o' }).AI_API_KEY).toBe('o');
        expect(geminiKeyAlias({ GEMINI_API_KEY: 'g', AI_PROVIDER: 'openai' }).AI_API_KEY).toBeUndefined();
        expect(geminiKeyAlias({ GOOGLE_API_KEY: 'x' }).AI_API_KEY).toBeUndefined();
    });

    it('eksik model ve embedding anahtarın listesinden doldurulur; liste önbellekte', async () => {
        const fetchImpl = vi.fn(async () => json(200, { models: MODELS })) as unknown as typeof fetch;
        const r = await withGeminiDefaults({ AI_PROVIDER: 'gemini', AI_API_KEY: 'k' }, fetchImpl);
        expect(r.env).toMatchObject({ AI_MODEL: 'gemini-3.5-flash', AI_EMBEDDING_MODEL: 'gemini-embedding-001', AI_EMBEDDING_DIMENSIONS: '768' });
        expect(r.auto).toEqual({ model: 'gemini-3.5-flash', embeddingModel: 'gemini-embedding-001' });
        await withGeminiDefaults({ AI_PROVIDER: 'gemini', AI_API_KEY: 'k' }, fetchImpl);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        // Verilen model ve "none" embedding korunur; liste istenmez
        const fixed = await withGeminiDefaults({ AI_PROVIDER: 'gemini', AI_API_KEY: 'k2', AI_MODEL: 'gemini-2.5-flash', AI_EMBEDDING_MODEL: 'none' }, fetchImpl);
        expect(fixed.env.AI_MODEL).toBe('gemini-2.5-flash');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        // Başka sağlayıcıda hiçbir şey yapılmaz
        expect((await withGeminiDefaults({ AI_PROVIDER: 'openai', AI_API_KEY: 'k' }, fetchImpl)).env.AI_MODEL).toBeUndefined();
    });
});

describe('yalnız anahtarla kullanıma hazır', () => {
    const sse = () => new Response(streamOf('data: {"candidates":[{"content":{"parts":[{"text":"tamam"}]},"finishReason":"STOP"}]}\n\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } });

    it('ortamda yalnız GEMINI_API_KEY: durum hazır, sohbet otomatik modelle x-goog-api-key başlığıyla gider, anlamsal arama açık', async () => {
        const calls: { url: string; headers: Record<string, string> }[] = [];
        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({ url, headers: (init?.headers || {}) as Record<string, string> });
            if (url.includes('/models?pageSize')) return json(200, { models: MODELS });
            return sse();
        }) as unknown as typeof fetch;
        const env = { GEMINI_API_KEY: 'AIza-test-anahtar' };
        const health = await (await handleAiRequest(new Request('https://app.local/api/ai/health'), env, { isDev: true, fetchImpl })).json();
        expect(health).toMatchObject({ configured: true, provider: 'gemini', model: 'gemini-3.5-flash', embeddingModel: 'gemini-embedding-001' });
        expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
        expect(calls[0].headers['x-goog-api-key']).toBe('AIza-test-anahtar');
        const res = await handleAiRequest(new Request('https://app.local/api/ai/chat', {
            method: 'POST', headers: { 'content-type': 'application/json', host: 'app.local' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'merhaba' }] }),
        }), env, { isDev: true, fetchImpl });
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('tamam');
        const chat = calls.find(c => c.url.includes(':streamGenerateContent'))!;
        expect(chat.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse');
        expect(chat.headers['x-goog-api-key']).toBe('AIza-test-anahtar');
    });

    it('geçersiz anahtar: durum nedenini söyler', async () => {
        const fetchImpl = vi.fn(async () => json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } })) as unknown as typeof fetch;
        const health = await (await handleAiRequest(new Request('https://app.local/api/ai/health'), { GEMINI_API_KEY: 'kotu' }, { isDev: true, fetchImpl })).json();
        expect(health.configured).toBe(false);
        expect(health.problem).toMatch(/Gemini API anahtarı geçersiz/);
    });

    it('panel: yalnız sağlayıcı ve anahtarla test ve kayıt; seçilen model bildirilir', async () => {
        const { mkdtempSync, rmSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const dir = mkdtempSync(join(tmpdir(), 'pa-gem-'));
        const env = { AI_SETTINGS_FILE: join(dir, 'ai.json'), AI_CONFIG_SECRET: 'x'.repeat(32), AI_ADMIN_TOKEN: 'yonetici-1234567890', AI_ACCESS_TOKEN: 'erisim-123456' };
        const fetchImpl = vi.fn(async (url: string) => {
            if (url.includes('/models?pageSize')) return json(200, { models: MODELS });
            if (url.includes(':batchEmbedContents')) return json(200, { embeddings: [{ values: Array(768).fill(0.01) }] });
            return sse();
        }) as unknown as typeof fetch;
        const admin = (body: unknown) => new Request('https://app.local/api/ai/admin', { method: 'POST', headers: { 'content-type': 'application/json', host: 'app.local', 'x-admin-token': env.AI_ADMIN_TOKEN }, body: JSON.stringify(body) });
        const values = { AI_PROVIDER: 'gemini', AI_API_KEY: 'AIza-panel' };
        const t = await (await handleAiRequest(admin({ action: 'test', values }), env, { fetchImpl })).json();
        expect(t).toMatchObject({ chat: { ok: true, model: 'gemini-3.5-flash', reply: 'tamam' }, embed: { ok: true, dimensions: 768, model: 'gemini-embedding-001' }, auto: { model: 'gemini-3.5-flash' } });
        expect((await handleAiRequest(admin({ action: 'save', values }), env, { fetchImpl })).status).toBe(200);
        const got = await (await handleAiRequest(admin({ action: 'get' }), env, { fetchImpl })).json();
        expect(got).toMatchObject({ source: 'panel', panel: { AI_PROVIDER: 'gemini' }, effective: { configured: true, model: 'gemini-3.5-flash', embeddingModel: 'gemini-embedding-001', auto: { model: 'gemini-3.5-flash' } } });
        expect(got.panel.AI_MODEL).toBeUndefined(); // model kaydedilmez, her zaman güncel olan seçilir
        const models = await (await handleAiRequest(admin({ action: 'models', values }), env, { fetchImpl })).json();
        expect(models.recommended).toBe('gemini-3.5-flash');
        expect(models.models).toContain('gemini-3.1-pro');
        expect(models.models).not.toContain('gemini-embedding-001');
        rmSync(dir, { recursive: true, force: true });
    });

    it('hızlı kurulum: ortamda başka sağlayıcının adresi, modeli ve embedding anahtarı olsa da Gemini kullanılır', async () => {
        const urls: string[] = [];
        const fetchImpl = vi.fn(async (url: string) => {
            urls.push(url);
            if (url.includes('/models?pageSize')) return json(200, { models: MODELS });
            if (url.includes(':batchEmbedContents')) return json(200, { embeddings: [{ values: Array(768).fill(0.01) }] });
            return sse();
        }) as unknown as typeof fetch;
        const env = { AI_PROVIDER: 'openai', AI_BASE_URL: 'https://gw.kurum/v1', AI_MODEL: 'general', AI_API_KEY: 'sk-kurum', AI_EMBEDDING_PROVIDER: 'openai', AI_EMBEDDING_MODEL: 'text-embedding-3-small', AI_EMBEDDING_API_KEY: 'sk-emb' };
        const G = 'https://generativelanguage.googleapis.com/v1beta';
        const quick = { AI_PROVIDER: 'gemini', AI_BASE_URL: G, AI_MODEL: 'auto', AI_API_KEY: 'AIza-q', AI_EMBEDDING_PROVIDER: 'gemini', AI_EMBEDDING_BASE_URL: G, AI_EMBEDDING_MODEL: 'auto', AI_EMBEDDING_API_KEY: 'AIza-q' };
        const r = await withGeminiDefaults({ ...env, ...quick }, fetchImpl);
        expect(r.env).toMatchObject({ AI_MODEL: 'gemini-3.5-flash', AI_EMBEDDING_MODEL: 'gemini-embedding-001', AI_BASE_URL: G });
        // Liste alınamazsa "auto" sağlayıcıya model adı olarak gitmez
        clearGeminiCache();
        const fail = await withGeminiDefaults({ ...env, ...quick }, vi.fn(async () => json(400, { error: { message: 'API key not valid.' } })) as unknown as typeof fetch);
        expect(fail.env.AI_MODEL).toBeUndefined();
        expect(fail.problem).toMatch(/geçersiz/);
    });
});
