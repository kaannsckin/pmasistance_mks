import { describe, expect, it } from 'vitest';
import { tubitakQuickValues } from '../../utils/ai/adminConfig';
import { BROWSER_KEY_HEADER, BROWSER_PROVIDER_HEADER } from '../../utils/ai/protocol';
import { browserKeyEnv, readBrowserKey } from './browserKey';
import { readAiConfig, TUBITAK_AI_BASE_URL } from './config';
import { readEmbeddingConfig } from './embeddings';
import { handleAiRequest } from './handler';
import { buildUpstreamRequest } from './providers';

const KEY = 'bilgem-anahtar-0123456789abcdef';

describe('TÜBİTAK BİLGEM AI API: yalnız anahtar', () => {
    it('adres, model ve önerilen ayarlar kendiliğinden; istek OpenAI biçiminde Bearer ile', () => {
        const r = readAiConfig({ AI_PROVIDER: 'tubitak', AI_API_KEY: KEY, AI_AUTH_MODE: 'none' });
        expect(r.problem).toBeUndefined();
        expect(r.config).toMatchObject({ provider: 'tubitak', baseUrl: TUBITAK_AI_BASE_URL, model: 'general', reasoningEffort: 'medium', maxOutputTokens: 8192 });
        const req = buildUpstreamRequest(r.config!, { messages: [{ role: 'user', content: 'merhaba' }] });
        expect(req.url).toBe('https://ai-api.bilgem.tubitak.gov.tr/v1/chat/completions');
        expect(req.headers.authorization).toBe(`Bearer ${KEY}`);
        expect(JSON.parse(req.body)).toMatchObject({ model: 'general', stream: true, max_tokens: 8192, reasoning_effort: 'medium', messages: [{ role: 'user', content: 'merhaba' }] });
        // Ortam değişkeniyle ezilebilir
        expect(readAiConfig({ AI_PROVIDER: 'TUBITAK', AI_API_KEY: KEY, AI_MODEL: 'code', AI_REASONING_EFFORT: 'low', AI_AUTH_MODE: 'none' }).config).toMatchObject({ model: 'code', reasoningEffort: 'low' });
        expect(readAiConfig({ AI_PROVIDER: 'tubitak', AI_AUTH_MODE: 'none' }).problem).toBe('AI_API_KEY tanımlı değil.');
    });

    it('tarayıcı bağlantısı: model gerekmez, adres sabittir', () => {
        const request = new Request('http://x/api/ai/chat', { headers: { [BROWSER_KEY_HEADER]: KEY, [BROWSER_PROVIDER_HEADER]: 'tubitak', 'x-ai-base-url': 'https://kotu.example/v1' } });
        const { conn, problem } = readBrowserKey(request, {});
        expect(problem).toBeUndefined();
        expect(conn).toEqual({ provider: 'tubitak', key: KEY, model: undefined });
        const env = browserKeyEnv({ AI_PROVIDER: 'openai', AI_BASE_URL: 'https://api.openai.com/v1', AI_MODEL: 'gpt-x', AI_EMBEDDING_MODEL: 'text-embedding-3-small' }, conn!);
        expect(env).toMatchObject({ AI_PROVIDER: 'tubitak', AI_BASE_URL: TUBITAK_AI_BASE_URL, AI_MODEL: 'general', AI_API_KEY: KEY });
        expect(readEmbeddingConfig(env)).toEqual({}); // kurumun embedding ayarı taşınmaz
    });

    it('panel hızlı kurulumu: ortamdaki başka sağlayıcının adresi ve embedding ayarı karışmaz', () => {
        const env = { AI_PROVIDER: 'openai', AI_BASE_URL: 'https://api.openai.com/v1', AI_MODEL: 'gpt-x', AI_API_KEY: 'eski', AI_EMBEDDING_MODEL: 'text-embedding-3-small', AI_AUTH_MODE: 'none' };
        const values = Object.fromEntries(Object.entries(tubitakQuickValues(` ${KEY} `)).filter(([, v]) => v)); // panel boş alanları atar
        const merged = { ...env, ...values };
        expect(readAiConfig(merged).config).toMatchObject({ provider: 'tubitak', baseUrl: TUBITAK_AI_BASE_URL, model: 'general', apiKey: KEY });
        expect(readEmbeddingConfig(merged)).toEqual({});
        expect(tubitakQuickValues(KEY, 'code').AI_MODEL).toBe('code');
    });

    it('uçtan uca: yönetici paneli testi BİLGEM adresine Bearer anahtarla gider', async () => {
        const calls: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
        const fetchImpl = (async (url: string, init?: RequestInit) => {
            calls.push({ url, auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body || '{}')) });
            const sse = 'data: {"choices":[{"delta":{"content":"tamam"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
            return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
        }) as unknown as typeof fetch;
        const request = new Request('http://localhost/api/ai/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'test', values: tubitakQuickValues(KEY) }) });
        const res = await handleAiRequest(request, { AI_AUTH_MODE: 'none' }, { isDev: true, fetchImpl });
        const body = await res.json() as { chat: { ok: boolean; model?: string; error?: string }; embed: unknown };
        expect(body.chat).toMatchObject({ ok: true, model: 'general' });
        expect(body.embed).toBeNull();
        expect(calls[0]).toMatchObject({ url: 'https://ai-api.bilgem.tubitak.gov.tr/v1/chat/completions', auth: `Bearer ${KEY}`, body: { model: 'general' } });
    });
});
