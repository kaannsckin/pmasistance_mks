import { afterEach, describe, expect, it, vi } from 'vitest';
import { collect, streamOf } from '../../server/ai/testUtils';
import {
    AI_ACCESS_TOKEN_KEY, AI_BROWSER_CONNECTION_KEY, browserSettingsExpired, configureMasking, embedTexts, fetchAiStatus, isBrowserKeyFormat, loadAccessToken,
    loadBrowserConnection, readNdjson, saveAccessToken, saveBrowserConnection, streamChat, trimHistory,
} from './client';
import { buildMasker, MASK_NOTE } from './masking';
import { BROWSER_BASE_URL_HEADER, BROWSER_KEY_HEADER, BROWSER_MODEL_HEADER, BROWSER_PROVIDER_HEADER, BROWSER_SETTINGS_TTL_MS, ChatMessage } from './protocol';

describe('readNdjson', () => {
    it('satır ortasında bölünen ve sonu satırsız biten akışı ayrıştırır', async () => {
        const evs = await collect(readNdjson(streamOf('{"type":"delta","te', 'xt":"a"}\n\n{"type":"del', 'ta","text":"ğüş"}\n{"type":"done"}')));
        expect(evs).toEqual([{ type: 'delta', text: 'a' }, { type: 'delta', text: 'ğüş' }, { type: 'done' }]);
    });

    it('bozuk satırları atlar', async () => {
        const evs = await collect(readNdjson(streamOf('çöp\n{"type":"done"}\n')));
        expect(evs).toEqual([{ type: 'done' }]);
    });
});

describe('trimHistory', () => {
    const msgs = (n: number): ChatMessage[] =>
        Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` }));

    it('en yeni mesajları korur ve kullanıcı mesajıyla başlar', () => {
        const out = trimHistory(msgs(9), 0, 4);
        expect(out.map(m => m.content)).toEqual(['m6', 'm7', 'm8']);
        expect(out[0].role).toBe('user');
    });

    it('karakter bütçesini aşan eski mesajları atar, son mesajı her zaman tutar', () => {
        const history: ChatMessage[] = [
            { role: 'user', content: 'x'.repeat(50) },
            { role: 'assistant', content: 'y'.repeat(50) },
            { role: 'user', content: 'son' },
        ];
        expect(trimHistory(history, 10, 40, 80).map(m => m.content)).toEqual(['son']);
        expect(trimHistory([{ role: 'user', content: 'z'.repeat(200) }], 0, 40, 80)).toHaveLength(1);
    });

    it('boş mesajları atlar', () => {
        expect(trimHistory([{ role: 'user', content: '  ' }, { role: 'user', content: 'a' }])).toEqual([{ role: 'user', content: 'a' }]);
    });
});

describe('stripReasoning (<think> çıktısı)', () => {
    it('tam blokları, şablonun açtığı düşünmeyi ve süren düşünmeyi gizler', async () => {
        const { stripReasoning } = await import('./client');
        expect(stripReasoning('Merhaba')).toBe('Merhaba');
        expect(stripReasoning('<think>plan yapıyorum</think>\n\nYanıt burada.')).toBe('Yanıt burada.');
        expect(stripReasoning('önce düşünürüm...</think>Sonuç: 3 proje')).toBe('Sonuç: 3 proje');
        expect(stripReasoning('<think>hâlâ düşünüyor')).toBe('');
        expect(stripReasoning('Giriş <think>ara düşünce</think> devam')).toBe('Giriş  devam');
    });
});

describe('tarayıcıdaki AI bağlantısı', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
    const memoryStorage = () => {
        const m = new Map<string, string>();
        return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    };
    const KEY = 'AIzaSyTarayiciTestAnahtari_0123456789';

    it('kayıtlı anahtar durum ve sohbet isteklerine başlık olarak eklenir; deneme anahtarı kayıtlıyı ezer, null anahtarsız gönderir', async () => {
        vi.stubGlobal('localStorage', memoryStorage());
        const seen: Record<string, string>[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            seen.push(Object.fromEntries(new Headers(init?.headers).entries()));
            return url.endsWith('/health')
                ? new Response(JSON.stringify({ configured: true, authMode: 'none' }), { status: 200 })
                : new Response(streamOf('{"type":"delta","text":"tamam"}\n{"type":"done"}\n'), { status: 200 });
        }));
        await fetchAiStatus();
        expect(seen[0][BROWSER_KEY_HEADER]).toBeUndefined();
        saveBrowserConnection({ provider: 'gemini', apiKey: KEY });
        expect(loadBrowserConnection()).toMatchObject({ provider: 'gemini', apiKey: KEY });
        await fetchAiStatus();
        expect(seen[1][BROWSER_KEY_HEADER]).toBe(KEY);
        expect(seen[1][BROWSER_PROVIDER_HEADER]).toBe('gemini');
        expect(seen[1][BROWSER_MODEL_HEADER]).toBeUndefined();
        await fetchAiStatus(undefined, { provider: 'azure', apiKey: 'AzureAnahtari_00000000000000', model: 'gpt-dagitim', baseUrl: 'https://kaynak.openai.azure.com/openai/v1' });
        expect(seen[2]).toMatchObject({ [BROWSER_KEY_HEADER]: 'AzureAnahtari_00000000000000', [BROWSER_PROVIDER_HEADER]: 'azure', [BROWSER_MODEL_HEADER]: 'gpt-dagitim', [BROWSER_BASE_URL_HEADER]: 'https://kaynak.openai.azure.com/openai/v1' });
        await fetchAiStatus(undefined, null);
        expect(seen[3][BROWSER_KEY_HEADER]).toBeUndefined();
        const r = await streamChat({ messages: [{ role: 'user', content: 'x' }] }, { authMode: 'none' });
        expect(r.text).toBe('tamam');
        expect(seen[4][BROWSER_KEY_HEADER]).toBe(KEY);
        saveBrowserConnection(null);
        expect(loadBrowserConnection()).toBeNull();
    });

    it('bağlantı ve erişim kodu 24 saat geçerli; süre dolunca silinir ve "süresi doldu" işaretlenir, yeniden girilince kalkar', () => {
        const store = memoryStorage();
        vi.stubGlobal('localStorage', store);
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-09T09:00:00Z'));
        saveBrowserConnection({ provider: 'openai', apiKey: 'sk-proj-0123456789abcdefghij', model: 'gpt-4.1-mini' });
        saveAccessToken('erisim-kodu');
        expect(loadBrowserConnection()?.expiresAt).toBe(Date.now() + BROWSER_SETTINGS_TTL_MS);
        vi.setSystemTime(new Date('2026-10-10T08:59:00Z'));
        expect(loadBrowserConnection()?.model).toBe('gpt-4.1-mini');
        expect(loadAccessToken()).toBe('erisim-kodu');
        expect(browserSettingsExpired()).toBe(false);
        vi.setSystemTime(new Date('2026-10-10T09:00:01Z'));
        expect(loadBrowserConnection()).toBeNull();
        expect(loadAccessToken()).toBeNull();
        expect(store.getItem(AI_BROWSER_CONNECTION_KEY)).toBeNull();
        expect(browserSettingsExpired()).toBe(true);
        saveAccessToken('yeni-kod');
        expect(browserSettingsExpired()).toBe(false);
    });

    it('eski sürümün kayıtları (düz erişim kodu, Gemini test anahtarı) yeni biçime 24 saatle taşınır', () => {
        const store = memoryStorage();
        vi.stubGlobal('localStorage', store);
        store.setItem(AI_ACCESS_TOKEN_KEY, 'eski-kod');
        store.setItem('PLANASISTAN_AI_GEMINI_TEST_KEY', KEY);
        expect(loadAccessToken()).toBe('eski-kod');
        expect(JSON.parse(store.getItem(AI_ACCESS_TOKEN_KEY)!).expiresAt).toBeGreaterThan(Date.now());
        expect(loadBrowserConnection()).toMatchObject({ provider: 'gemini', apiKey: KEY });
        expect(store.getItem('PLANASISTAN_AI_GEMINI_TEST_KEY')).toBeNull();
    });

    it('biçim denetimi sunucudakiyle aynı', () => {
        expect(isBrowserKeyFormat(KEY)).toBe(true);
        expect(isBrowserKeyFormat('kisa')).toBe(false);
        expect(isBrowserKeyFormat(`${KEY} x`)).toBe(false);
        expect(isBrowserKeyFormat(`${KEY}\n`)).toBe(false);
    });
});

describe('ad maskeleme (istemci)', () => {
    afterEach(() => { vi.unstubAllGlobals(); configureMasking(null); });
    const masker = buildMasker([{ kind: 'person', name: 'Ali Veli' }, { kind: 'project', name: 'Safir' }]);
    const ALI = masker.mask('Ali Veli'), SAFIR = masker.mask('Safir');

    it('giden sohbet maskelenir; gelen metin, akış ve araç argümanları gerçek adlara döner', async () => {
        configureMasking(() => masker);
        let sent = '';
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            sent = String(init?.body);
            const lines = [
                { type: 'delta', text: `${ALI}'in ` },
                { type: 'delta', text: `${SAFIR.slice(0, 7)}` },
                { type: 'delta', text: `${SAFIR.slice(7)}'deki görevi` },
                { type: 'tool_call', call: { id: 'c1', name: 'kisi_profili', arguments: { kisi: ALI }, meta: { thoughtSignature: 'imza' } } },
                { type: 'done' },
            ].map(l => JSON.stringify(l)).join('\n');
            return new Response(streamOf(lines), { status: 200 });
        }));
        const shown: string[] = [];
        const r = await streamChat({
            system: 'Kullanıcı: Ali Veli',
            messages: [
                { role: 'user', content: 'Ali Veli hangi projede?' },
                { role: 'assistant', content: '', toolCalls: [{ id: 'c0', name: 'kisi_profili', arguments: { kisi: 'Ali Veli' } }] },
                { role: 'tool', toolCallId: 'c0', name: 'kisi_profili', content: '{"ad":"Ali Veli","proje":"Safir"}' },
            ],
        }, { authMode: 'none', onDelta: (_t, full) => shown.push(full) });
        expect(sent).not.toMatch(/Ali Veli|Safir/);
        const body = JSON.parse(sent);
        expect(body.system).toBe(`Kullanıcı: ${ALI}\n\n${MASK_NOTE}`);
        expect(body.messages[1].toolCalls[0].arguments.kisi).toBe(ALI);
        expect(r.text).toBe("Ali Veli'nin Safir'deki görevi");
        expect(r.toolCalls[0]).toEqual({ id: 'c1', name: 'kisi_profili', arguments: { kisi: 'Ali Veli' }, meta: { thoughtSignature: 'imza' } });
        expect(shown.some(s => /Kişi-|Proje-|Pro$/.test(s))).toBe(false);
        expect(shown.at(-1)).toBe("Ali Veli'nin Safir'deki görevi");
    });

    it('embedding metinleri de maskelenir; kapalıyken hiçbir şey değişmez', async () => {
        const bodies: { texts: string[] }[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            bodies.push(JSON.parse(String(init?.body)));
            return new Response(JSON.stringify({ vectors: [[0.1]] }), { status: 200 });
        }));
        configureMasking(() => masker);
        await embedTexts(['Safir projesinde Ali Veli'], 'document', 'none');
        configureMasking(() => null);
        await embedTexts(['Safir projesinde Ali Veli'], 'document', 'none');
        expect(bodies[0].texts[0]).toBe(`${SAFIR} projesinde ${ALI}`);
        expect(bodies[1].texts[0]).toBe('Safir projesinde Ali Veli');
    });
});
