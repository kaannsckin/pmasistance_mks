import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAiRequest } from './handler';
import { decryptSecret, encryptSecret, invalidateSettingsCache, resolveSettingsStore, supabaseBackend } from './settingsStore';
import { streamOf } from './testUtils';

const URL_BASE = 'https://app.kurum.local/api/ai';
const ADMIN = 'yonetici-anahtari-1234567890';
let dir: string;
let ENV: Record<string, string>;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pa-ai-'));
    ENV = { AI_PROVIDER: 'openai', AI_API_KEY: 'env-anahtari-ENV1', AI_MODEL: 'env-model', AI_SETTINGS_FILE: join(dir, 'ai.json'), AI_CONFIG_SECRET: 'x'.repeat(32), AI_ADMIN_TOKEN: ADMIN, AI_ACCESS_TOKEN: 'erisim-kodu-123456' };
    invalidateSettingsCache();
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); invalidateSettingsCache(); });

const admin = (body: unknown, token: string | null = ADMIN) => new Request(`${URL_BASE}/admin`, {
    method: 'POST', headers: { 'content-type': 'application/json', host: 'app.kurum.local', ...(token ? { 'x-admin-token': token } : {}) }, body: JSON.stringify(body),
});
const sse = () => new Response(streamOf('data: {"choices":[{"delta":{"content":"tamam"}}]}\n\n', 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } });

describe('panel ayar deposu', () => {
    it('anahtarlar AES-GCM ile şifrelenir; yanlış gizli anahtarla çözülmez', async () => {
        const enc = await encryptSecret('sk-gizli', 'a'.repeat(32));
        expect(enc).toMatch(/^v1:/);
        expect(enc).not.toContain('sk-gizli');
        expect(await decryptSecret(enc, 'a'.repeat(32))).toBe('sk-gizli');
        await expect(decryptSecret(enc, 'b'.repeat(32))).rejects.toThrow();
    });

    it('depo ve gizli anahtar olmadan panel kapalı; yerelde geliştirme anahtarı kullanılır', () => {
        expect(resolveSettingsStore({}).problem).toMatch(/kalıcı depo/);
        expect(resolveSettingsStore({ AI_SETTINGS_FILE: 'x.json' }).problem).toMatch(/AI_CONFIG_SECRET/);
        expect(resolveSettingsStore({ AI_SETTINGS_FILE: 'x.json' }, { isDev: true }).store).toBeTruthy();
        expect(resolveSettingsStore({ SUPABASE_URL: 'https://s.co', SUPABASE_SERVICE_ROLE_KEY: 'k', AI_CONFIG_SECRET: 'x'.repeat(32) }).store!.backend.kind).toBe('supabase');
    });

    it('Supabase deposu app_settings satırını okur, yazar (upsert) ve siler', async () => {
        const calls: [string, RequestInit | undefined][] = [];
        const f = vi.fn(async (url: string, init?: RequestInit) => {
            calls.push([url, init]);
            return url.includes('select=data') ? new Response(JSON.stringify([{ data: { values: { AI_MODEL: 'm' }, updatedAt: 't' } }])) : new Response(null, { status: 201 });
        }) as unknown as typeof fetch;
        const b = supabaseBackend('https://s.co/', 'servis', f);
        expect(await b.load()).toEqual({ values: { AI_MODEL: 'm' }, updatedAt: 't' });
        await b.save({ values: { AI_MODEL: 'n' }, updatedAt: 'u' });
        await b.save(null);
        expect(calls.map(([u, i]) => `${i?.method || 'GET'} ${u}`)).toEqual([
            'GET https://s.co/rest/v1/app_settings?id=eq.ai&select=data', 'POST https://s.co/rest/v1/app_settings', 'DELETE https://s.co/rest/v1/app_settings?id=eq.ai',
        ]);
        expect((calls[1][1]!.headers as Record<string, string>).prefer).toMatch(/merge-duplicates/);
        expect((calls[0][1]!.headers as Record<string, string>).authorization).toBe('Bearer servis');
    });
});

describe('yönetici ucu', () => {
    it('yönetici anahtarı olmadan reddedilir; yayında anahtar tanımlı değilse kapalı', async () => {
        expect((await handleAiRequest(admin({ action: 'get' }, null), ENV)).status).toBe(401);
        expect((await handleAiRequest(admin({ action: 'get' }, 'yanlis'), ENV)).status).toBe(401);
        const { AI_ADMIN_TOKEN: _, ...noAdmin } = ENV;
        expect((await handleAiRequest(admin({ action: 'get' }), noAdmin)).status).toBe(503);
        expect((await handleAiRequest(admin({ action: 'get' }, null), noAdmin, { isDev: true })).status).toBe(200);
    });

    it('kaydedilen ayar ortam değişkeninin üzerine yazılır; anahtar şifreli, tarayıcıya yalnız son 4 hane döner', async () => {
        const save = await handleAiRequest(admin({ action: 'save', values: { AI_PROVIDER: 'anthropic', AI_MODEL: 'panel-model', AI_API_KEY: 'sk-panel-ABCD' } }), ENV);
        expect(save.status).toBe(200);
        const file = readFileSync(ENV.AI_SETTINGS_FILE, 'utf8');
        expect(file).not.toContain('sk-panel-ABCD');
        expect(file).toContain('panel-model');
        const got = await (await handleAiRequest(admin({ action: 'get' }), ENV)).json();
        expect(got).toMatchObject({ source: 'panel', store: { available: true, kind: 'file' }, panel: { AI_PROVIDER: 'anthropic', AI_MODEL: 'panel-model', AI_API_KEY: '…ABCD' }, env: { AI_API_KEY: '…ENV1' }, effective: { configured: true, provider: 'anthropic', model: 'panel-model' } });
        expect(JSON.stringify(got)).not.toContain('sk-panel');
        const health = await (await handleAiRequest(new Request(`${URL_BASE}/health`), ENV)).json();
        expect(health).toMatchObject({ configured: true, provider: 'anthropic', model: 'panel-model', configSource: 'panel' });
        // Anahtar verilmeden yeniden kaydetme kayıtlı anahtarı korur; boş metin siler
        await handleAiRequest(admin({ action: 'save', values: { AI_PROVIDER: 'anthropic', AI_MODEL: 'panel-model-2' } }), ENV);
        expect((await (await handleAiRequest(admin({ action: 'get' }), ENV)).json()).panel).toMatchObject({ AI_MODEL: 'panel-model-2', AI_API_KEY: '…ABCD' });
        // Ortam değişkenlerine dönüş
        await handleAiRequest(admin({ action: 'clear' }), ENV);
        expect(await (await handleAiRequest(admin({ action: 'get' }), ENV)).json()).toMatchObject({ source: 'env', panel: {}, effective: { model: 'env-model' } });
    });

    it('geçersiz ayar kaydedilmez', async () => {
        const res = await handleAiRequest(admin({ action: 'save', values: { AI_PROVIDER: 'azure', AI_MODEL: 'm' } }), ENV);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/AI_BASE_URL/);
        const bad = await handleAiRequest(admin({ action: 'save', values: { AI_EXTRA_BODY: '{bozuk' } }), ENV);
        expect((await bad.json()).error).toMatch(/AI_EXTRA_BODY/);
    });

    it('test: kaydetmeden taslakla kısa istek atar; hata nedenini açıklar', async () => {
        const urls: string[] = [];
        const auths: string[] = [];
        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            urls.push(url);
            auths.push((init?.headers as Record<string, string>).authorization);
            if (url.includes('kotu')) return new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), { status: 401 });
            return sse();
        }) as unknown as typeof fetch;
        const ok = await (await handleAiRequest(admin({ action: 'test', values: { AI_PROVIDER: 'openai', AI_MODEL: 'taslak-model', AI_BASE_URL: 'https://gw.kurum/v1', AI_API_KEY: 'sk-taslak' } }), ENV, { fetchImpl })).json();
        expect(ok.chat).toMatchObject({ ok: true, reply: 'tamam', model: 'taslak-model' });
        expect(ok.embed).toBeNull();
        expect(urls[0]).toBe('https://gw.kurum/v1/chat/completions');
        expect(auths[0]).toBe('Bearer sk-taslak');
        // Taslak kaydedilmedi
        expect((await (await handleAiRequest(admin({ action: 'get' }), ENV)).json()).source).toBe('env');
        const bad = await (await handleAiRequest(admin({ action: 'test', values: { AI_PROVIDER: 'openai', AI_MODEL: 'm', AI_BASE_URL: 'https://kotu.kurum/v1' } }), ENV, { fetchImpl })).json();
        expect(bad.chat.ok).toBe(false);
        expect(bad.chat.error).toMatch(/API anahtarını kontrol edin.*Incorrect API key/);
        // Anahtar verilmediyse ortamdaki kullanılır
        expect(auths[1]).toBe('Bearer env-anahtari-ENV1');
    });

    it('kaydedilen ayarla asistan sohbeti panel adresine ve anahtarına gider', async () => {
        await handleAiRequest(admin({ action: 'save', values: { AI_PROVIDER: 'openai', AI_MODEL: 'panel-m', AI_BASE_URL: 'https://panel.kurum/v1', AI_API_KEY: 'sk-panel-9999' } }), ENV);
        const seen: { url: string; auth: string; model: string }[] = [];
        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            seen.push({ url, auth: (init?.headers as Record<string, string>).authorization, model: JSON.parse(String(init?.body)).model });
            return sse();
        }) as unknown as typeof fetch;
        const res = await handleAiRequest(new Request(`${URL_BASE}/chat`, {
            method: 'POST', headers: { 'content-type': 'application/json', host: 'app.kurum.local', authorization: `Bearer ${ENV.AI_ACCESS_TOKEN}` },
            body: JSON.stringify({ messages: [{ role: 'user', content: 'merhaba' }] }),
        }), ENV, { fetchImpl });
        expect(res.status).toBe(200);
        await res.text();
        expect(seen[0]).toEqual({ url: 'https://panel.kurum/v1/chat/completions', auth: 'Bearer sk-panel-9999', model: 'panel-m' });
    });
});
