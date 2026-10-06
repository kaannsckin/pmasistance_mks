import { describe, expect, it, vi } from 'vitest';
import { buildEmbedRequest, parseEmbedResponse, readEmbeddingConfig, validateEmbedBody } from './embeddings';
import { handleAiRequest } from './handler';
import { createRateLimiter } from './rateLimit';

const CHAT = { AI_PROVIDER: 'openai', AI_API_KEY: 'sohbet-anahtari', AI_MODEL: 'm1' };

describe('embedding yapılandırması', () => {
    it('AI_EMBEDDING_MODEL yoksa kapalıdır', () => {
        expect(readEmbeddingConfig(CHAT)).toEqual({});
    });

    it('aynı sağlayıcıda sohbet anahtarını ve uç noktasını kullanır', () => {
        const c = readEmbeddingConfig({ ...CHAT, AI_BASE_URL: 'https://llm.kurum.local/v1', AI_EMBEDDING_MODEL: 'emb-1' }).config!;
        expect(c).toMatchObject({ provider: 'openai', apiKey: 'sohbet-anahtari', baseUrl: 'https://llm.kurum.local/v1', model: 'emb-1', rateLimitPerMin: 120 });
    });

    it('Anthropic sohbetinde ayrı embedding sağlayıcısı ister; farklı sağlayıcıda ayrı anahtar', () => {
        const anth = { AI_PROVIDER: 'anthropic', AI_API_KEY: 'k', AI_MODEL: 'c', AI_EMBEDDING_MODEL: 'voyage-3' };
        expect(readEmbeddingConfig(anth).problem).toMatch(/AI_EMBEDDING_PROVIDER/);
        expect(readEmbeddingConfig({ ...anth, AI_EMBEDDING_PROVIDER: 'voyage' }).problem).toMatch(/AI_EMBEDDING_API_KEY/);
        const v = readEmbeddingConfig({ ...anth, AI_EMBEDDING_PROVIDER: 'voyage', AI_EMBEDDING_API_KEY: 'vk' }).config!;
        expect(v).toMatchObject({ provider: 'voyage', apiKey: 'vk', baseUrl: 'https://api.voyageai.com/v1' });
    });
});

describe('embedding istek/yanıt', () => {
    const base = { apiKey: 'k', model: 'e', rateLimitPerMin: 10 };
    it('openai / voyage / gemini gövdeleri', () => {
        const o = buildEmbedRequest({ ...base, provider: 'openai', baseUrl: 'https://x/v1', dimensions: 256 }, { texts: ['a', 'b'], kind: 'document' });
        expect(o.url).toBe('https://x/v1/embeddings');
        expect(JSON.parse(o.body)).toEqual({ model: 'e', input: ['a', 'b'], dimensions: 256 });
        const v = buildEmbedRequest({ ...base, provider: 'voyage', baseUrl: 'https://v/v1' }, { texts: ['a'], kind: 'query' });
        expect(JSON.parse(v.body).input_type).toBe('query');
        const g = buildEmbedRequest({ ...base, provider: 'gemini', baseUrl: 'https://g/v1beta' }, { texts: ['a'], kind: 'query' });
        expect(g.url).toBe('https://g/v1beta/models/e:batchEmbedContents');
        expect(JSON.parse(g.body).requests[0]).toEqual({ model: 'models/e', content: { parts: [{ text: 'a' }] }, taskType: 'RETRIEVAL_QUERY' });
        expect(g.headers['x-goog-api-key']).toBe('k');
    });

    it('yanıtları giriş sırasına göre çözer; eksik vektörde hata', () => {
        const oc = { ...base, provider: 'openai' as const, baseUrl: 'x' };
        expect(parseEmbedResponse(oc, { data: [{ index: 1, embedding: [0.2] }, { index: 0, embedding: [0.1234567891] }] }, 2)).toEqual([[0.123457], [0.2]]);
        expect(parseEmbedResponse({ ...oc, provider: 'gemini' }, { embeddings: [{ values: [1, 2] }] }, 1)).toEqual([[1, 2]]);
        expect(() => parseEmbedResponse(oc, { data: [] }, 1)).toThrow();
    });

    it('gövde doğrulaması', () => {
        expect(validateEmbedBody({ texts: ['a'], kind: 'query' }).body).toEqual({ texts: ['a'], kind: 'query' });
        expect(validateEmbedBody({ texts: [] }).error).toBeTruthy();
        expect(validateEmbedBody({ texts: ['x'.repeat(8001)] }).error).toMatch(/uzun/);
        expect(validateEmbedBody({ texts: ['a'], kind: 'baska' }).error).toBeTruthy();
    });
});

describe('/embed ucu', () => {
    const req = (body: unknown) => new Request('https://app/api/ai/embed', { method: 'POST', headers: { 'content-type': 'application/json', host: 'app' }, body: JSON.stringify(body) });

    it('embedding kapalıyken 503; health embedding modelini bildirir', async () => {
        const off = await handleAiRequest(req({ texts: ['a'] }), CHAT, { isDev: true, rateLimiter: createRateLimiter(100) });
        expect(off.status).toBe(503);
        const h = await (await handleAiRequest(new Request('https://app/api/ai/health'), { ...CHAT, AI_EMBEDDING_MODEL: 'emb-1' }, { isDev: true })).json();
        expect(h.embeddingModel).toBe('emb-1');
        const hp = await (await handleAiRequest(new Request('https://app/api/ai/health'), { ...CHAT, AI_PROVIDER: 'anthropic', AI_EMBEDDING_MODEL: 'x' }, { isDev: true })).json();
        expect(hp.embeddingProblem).toMatch(/AI_EMBEDDING_PROVIDER/);
    });

    it('vektörleri döndürür; anahtar yalnızca sağlayıcıya gider', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.5, 0.25] }] }), { status: 200 }));
        const res = await handleAiRequest(req({ texts: ['merhaba'], kind: 'document' }), { ...CHAT, AI_EMBEDDING_MODEL: 'emb-1' }, { isDev: true, fetchImpl, rateLimiter: createRateLimiter(100) });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ vectors: [[0.5, 0.25]], model: 'emb-1' });
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.openai.com/v1/embeddings');
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer sohbet-anahtari');
    });

    it('sağlayıcı hatası anlaşılır mesajla 502', async () => {
        const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"model not found"}}', { status: 404 }));
        const res = await handleAiRequest(req({ texts: ['a'] }), { ...CHAT, AI_EMBEDDING_MODEL: 'yok' }, { isDev: true, fetchImpl, rateLimiter: createRateLimiter(100) });
        expect(res.status).toBe(502);
        expect((await res.json()).error).toMatch(/AI_EMBEDDING_MODEL.*model not found/);
    });
});
