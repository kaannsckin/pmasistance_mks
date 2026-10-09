import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readNdjson } from '../../utils/ai/client';
import { resetAuthCache, safeEqual } from './auth';
import { handleAiRequest, validateChatBody } from './handler';
import { createRateLimiter } from './rateLimit';
import { collect, streamOf } from './testUtils';

const BASE_ENV = { AI_PROVIDER: 'openai', AI_API_KEY: 'gizli-anahtar', AI_MODEL: 'm1' };
const URL_BASE = 'https://app.kurum.local/api/ai';

const chatReq = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${URL_BASE}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'app.kurum.local', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });

const okBody = { system: 's', messages: [{ role: 'user', content: 'merhaba' }] };

const sseUpstream = () =>
    new Response(streamOf('data: {"choices":[{"delta":{"content":"Selam"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
    });

const freshLimiter = () => createRateLimiter(100);

beforeEach(() => resetAuthCache());

describe('health', () => {
    it('yapılandırma durumunu anahtarsız döndürür', async () => {
        const res = await handleAiRequest(new Request(`${URL_BASE}/health`), BASE_ENV, { isDev: true });
        const json = await res.json();
        expect(json).toEqual({ configured: true, authMode: 'none', configSource: 'env', provider: 'openai', model: 'm1' });
        expect(JSON.stringify(json)).not.toContain('gizli');
    });

    it('eksik yapılandırmada sorunu açıklar', async () => {
        const res = await handleAiRequest(new Request(`${URL_BASE}/health`), {}, { isDev: true });
        const json = await res.json();
        expect(json.configured).toBe(false);
        expect(json.problem).toMatch(/AI_API_KEY/);
    });
});

describe('chat', () => {
    it('başarılı akışı NDJSON olarak iletir ve anahtarı yalnızca sağlayıcıya gönderir', async () => {
        const fetchImpl = vi.fn(async () => sseUpstream());
        const res = await handleAiRequest(chatReq(okBody), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: freshLimiter() });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('ndjson');
        const evs = await collect(readNdjson(res.body!));
        expect(evs).toEqual([{ type: 'delta', text: 'Selam' }, { type: 'delta', text: '!' }, { type: 'done', stopReason: 'stop' }]);
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.openai.com/v1/chat/completions');
        expect((init.headers as Record<string, string>).authorization).toBe('Bearer gizli-anahtar');
    });

    it('yayında koruma yoksa 503 döner, sağlayıcıyı çağırmaz', async () => {
        const fetchImpl = vi.fn();
        const res = await handleAiRequest(chatReq(okBody), BASE_ENV, { fetchImpl, rateLimiter: freshLimiter() });
        expect(res.status).toBe(503);
        expect((await res.json()).code).toBe('config');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('token modu: kod yok/yanlış → 401, doğru → 200', async () => {
        const env = { ...BASE_ENV, AI_ACCESS_TOKEN: 'kurum-kodu' };
        const fetchImpl = vi.fn(async () => sseUpstream());
        const limiter = freshLimiter();
        expect((await handleAiRequest(chatReq(okBody), env, { fetchImpl, rateLimiter: limiter })).status).toBe(401);
        expect((await handleAiRequest(chatReq(okBody, { authorization: 'Bearer yanlis' }), env, { fetchImpl, rateLimiter: limiter })).status).toBe(401);
        const ok = await handleAiRequest(chatReq(okBody, { authorization: 'Bearer kurum-kodu' }), env, { fetchImpl, rateLimiter: limiter });
        expect(ok.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('supabase modu: oturum + üyelik doğrulanır', async () => {
        const env = { ...BASE_ENV, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' };
        const make = (members: unknown[]) =>
            vi.fn(async (url: string) => {
                if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
                if (url.includes('/rest/v1/workspace_members')) return new Response(JSON.stringify(members), { status: 200 });
                return sseUpstream();
            });

        const noMember = make([]);
        const r1 = await handleAiRequest(chatReq(okBody, { authorization: 'Bearer jwt-a' }), env, { fetchImpl: noMember as any, rateLimiter: freshLimiter() });
        expect(r1.status).toBe(403);

        const member = make([{ role: 'py' }]);
        const r2 = await handleAiRequest(chatReq(okBody, { authorization: 'Bearer jwt-b' }), env, { fetchImpl: member as any, rateLimiter: freshLimiter() });
        expect(r2.status).toBe(200);
        expect(member.mock.calls.map(c => c[0])).toContain('https://api.openai.com/v1/chat/completions');
    });

    it('geçersiz gövde → 400', async () => {
        const opts = { isDev: true, fetchImpl: vi.fn(), rateLimiter: freshLimiter() };
        expect((await handleAiRequest(chatReq('{bozuk'), BASE_ENV, opts)).status).toBe(400);
        expect((await handleAiRequest(chatReq({ messages: [] }), BASE_ENV, opts)).status).toBe(400);
        expect((await handleAiRequest(chatReq({ messages: [{ role: 'system', content: 'x' }] }), BASE_ENV, opts)).status).toBe(400);
        expect(opts.fetchImpl).not.toHaveBeenCalled();
    });

    it('hız sınırı → 429 + Retry-After', async () => {
        const limiter = createRateLimiter(1);
        const fetchImpl = vi.fn(async () => sseUpstream());
        expect((await handleAiRequest(chatReq(okBody), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: limiter })).status).toBe(200);
        const res = await handleAiRequest(chatReq(okBody), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: limiter });
        expect(res.status).toBe(429);
        expect(res.headers.get('retry-after')).toBeTruthy();
    });

    it('sağlayıcı anahtarı reddederse 502 + açıklama (kullanıcı oturumu 401 ile karışmaz)', async () => {
        const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"Incorrect API key"}}', { status: 401 }));
        const res = await handleAiRequest(chatReq(okBody), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: freshLimiter() });
        expect(res.status).toBe(502);
        const json = await res.json();
        expect(json.code).toBe('upstream');
        expect(json.error).toMatch(/AI_API_KEY/);
        expect(json.error).toContain('Incorrect API key');
        expect(json.error).not.toContain('gizli-anahtar');
    });

    it('sağlayıcıya ulaşılamazsa 502', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new TypeError('fetch failed');
        });
        const res = await handleAiRequest(chatReq(okBody), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: freshLimiter() });
        expect(res.status).toBe(502);
    });

    it('bağlantı hatasının nedenini (sertifika) açıklar', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fetchImpl = vi.fn(async () => {
            throw new TypeError('fetch failed', { cause: Object.assign(new Error('unable to get local issuer certificate'), { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' }) });
        });
        const res = await handleAiRequest(chatReq(okBody), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: freshLimiter() });
        expect(res.status).toBe(502);
        const json = await res.json();
        expect(json.error).toMatch(/sertifika/);
        expect(json.error).toContain('UNABLE_TO_GET_ISSUER_CERT_LOCALLY');
        expect(String(errSpy.mock.calls[0]?.[0])).toContain('api.openai.com');
        expect(JSON.stringify(errSpy.mock.calls)).not.toContain('gizli-anahtar');
        errSpy.mockRestore();
    });

    it('akış ortasında hata → error olayı', async () => {
        const fetchImpl = vi.fn(async () => new Response(streamOf('data: {"choices":[{"delta":{"content":"a"}}]}\n\n', 'data: {"error":{"message":"kesildi"}}\n\n'), { status: 200 }));
        const res = await handleAiRequest(chatReq(okBody), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: freshLimiter() });
        const evs = await collect(readNdjson(res.body!));
        expect(evs).toEqual([{ type: 'delta', text: 'a' }, { type: 'error', message: 'kesildi' }]);
    });

    it('köken denetimi: yabancı köken reddedilir, izinli köken CORS alır', async () => {
        const opts = { isDev: true, fetchImpl: vi.fn(async () => sseUpstream()), rateLimiter: freshLimiter() };
        const bad = await handleAiRequest(chatReq(okBody, { origin: 'https://kotu.example' }), BASE_ENV, opts);
        expect(bad.status).toBe(403);

        const same = await handleAiRequest(chatReq(okBody, { origin: 'https://app.kurum.local' }), BASE_ENV, opts);
        expect(same.status).toBe(200);

        const env = { ...BASE_ENV, AI_ALLOWED_ORIGINS: 'https://planasistan.vercel.app' };
        const pre = await handleAiRequest(
            new Request(`${URL_BASE}/chat`, { method: 'OPTIONS', headers: { origin: 'https://planasistan.vercel.app', host: 'app.kurum.local' } }),
            env,
            opts
        );
        expect(pre.status).toBe(204);
        expect(pre.headers.get('access-control-allow-origin')).toBe('https://planasistan.vercel.app');
    });

    it('bilinmeyen uç nokta → 404', async () => {
        const res = await handleAiRequest(new Request(`${URL_BASE}/baska`), BASE_ENV, { isDev: true });
        expect(res.status).toBe(404);
    });
});

describe('validateChatBody', () => {
    it('son mesaj kullanıcıdan olmalı ve sınırlar uygulanır', () => {
        expect(validateChatBody({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }).error).toMatch(/Son mesaj/);
        expect(validateChatBody({ messages: [{ role: 'user', content: 'x'.repeat(20_001) }] }).error).toMatch(/uzun/);
        expect(validateChatBody({ system: 5, messages: [{ role: 'user', content: 'a' }] }).error).toMatch(/system/);
        expect(validateChatBody(okBody).body).toEqual(okBody);
    });
});

describe('safeEqual', () => {
    it('eşitlik doğru çalışır', () => {
        expect(safeEqual('abc', 'abc')).toBe(true);
        expect(safeEqual('abc', 'abd')).toBe(false);
        expect(safeEqual('abc', 'abcd')).toBe(false);
        expect(safeEqual('', '')).toBe(true);
    });
});

describe('validateChatBody — araç mesajları', () => {
    const tools = [{ name: 'proje_listesi', description: 'Projeleri listeler', parameters: { type: 'object', properties: {} } }];
    const call = { id: 'c1', name: 'proje_listesi', arguments: {} };

    it('geçerli araç turu kabul edilir', () => {
        const r = validateChatBody({
            tools,
            messages: [
                { role: 'user', content: 'soru' },
                { role: 'assistant', content: '', toolCalls: [call] },
                { role: 'tool', toolCallId: 'c1', name: 'proje_listesi', content: '{}' },
            ],
        });
        expect(r.error).toBeUndefined();
        expect(r.body?.tools).toHaveLength(1);
        expect(r.body?.messages).toHaveLength(3);
    });

    it('bilinmeyen çağrıya ait sonuç, geçersiz araç adı ve nesne olmayan şema reddedilir', () => {
        expect(validateChatBody({ messages: [{ role: 'user', content: 'a' }, { role: 'tool', toolCallId: 'yok', name: 'x', content: '{}' }] }).error).toMatch(/bilinen bir çağrı/);
        expect(validateChatBody({ tools: [{ ...tools[0], name: 'kötü ad' }], messages: [{ role: 'user', content: 'a' }] }).error).toMatch(/araç adı/);
        expect(validateChatBody({ tools: [{ ...tools[0], parameters: { type: 'string' } }], messages: [{ role: 'user', content: 'a' }] }).error).toMatch(/nesne/);
        expect(validateChatBody({ tools: [tools[0], tools[0]], messages: [{ role: 'user', content: 'a' }] }).error).toMatch(/yinelenen/);
    });

    it('ilk mesaj kullanıcıdan olmalı; son mesaj asistan olamaz', () => {
        expect(validateChatBody({ messages: [{ role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }] }).error).toMatch(/İlk mesaj/);
        expect(validateChatBody({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: '', toolCalls: [call] }] }).error).toMatch(/Son mesaj/);
    });

    it('argümanı nesne olmayan çağrı reddedilir', () => {
        expect(validateChatBody({ messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: '', toolCalls: [{ ...call, arguments: '{}' }] }, { role: 'tool', toolCallId: 'c1', name: 'proje_listesi', content: '{}' }] }).error).toMatch(/araç çağrısı/);
    });

    it('chat ucu tool_call olaylarını NDJSON ile iletir', async () => {
        const fetchImpl = vi.fn(async () => new Response(streamOf(
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"proje_listesi","arguments":"{}"}}]}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n'
        ), { status: 200 }));
        const res = await handleAiRequest(chatReq({ tools, messages: [{ role: 'user', content: 'x' }] }), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: freshLimiter() });
        const evs = await collect(readNdjson(res.body!));
        expect(evs[0]).toEqual({ type: 'tool_call', call: { id: 'call_a', name: 'proje_listesi', arguments: {} } });
        const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
        expect(sent.tools[0].function.name).toBe('proje_listesi');
    });
});

describe('araç çağrısını desteklemeyen sunucu', () => {
    it('400 + tool hatası anlaşılır ipucuyla döner', async () => {
        const fetchImpl = vi.fn(async () => new Response('{"error":{"message":"\\"auto\\" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set"}}', { status: 400 }));
        const res = await handleAiRequest(chatReq(okBody), BASE_ENV, { isDev: true, fetchImpl, rateLimiter: freshLimiter() });
        expect(res.status).toBe(502);
        expect((await res.json()).error).toMatch(/araç çağrısını \(tool calling\) reddetti/);
    });
});
