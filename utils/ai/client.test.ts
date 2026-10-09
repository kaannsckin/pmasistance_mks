import { afterEach, describe, expect, it, vi } from 'vitest';
import { collect, streamOf } from '../../server/ai/testUtils';
import { fetchAiStatus, isBrowserKeyFormat, loadBrowserKey, readNdjson, saveBrowserKey, streamChat, trimHistory } from './client';
import { BROWSER_KEY_HEADER, ChatMessage } from './protocol';

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

describe('tarayıcıdaki Gemini test anahtarı', () => {
    afterEach(() => vi.unstubAllGlobals());
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
        saveBrowserKey(KEY);
        expect(loadBrowserKey()).toBe(KEY);
        await fetchAiStatus();
        expect(seen[1][BROWSER_KEY_HEADER]).toBe(KEY);
        await fetchAiStatus(undefined, 'AIzaSyBaskaAnahtar_000000000000000');
        expect(seen[2][BROWSER_KEY_HEADER]).toBe('AIzaSyBaskaAnahtar_000000000000000');
        await fetchAiStatus(undefined, null);
        expect(seen[3][BROWSER_KEY_HEADER]).toBeUndefined();
        const r = await streamChat({ messages: [{ role: 'user', content: 'x' }] }, { authMode: 'none' });
        expect(r.text).toBe('tamam');
        expect(seen[4][BROWSER_KEY_HEADER]).toBe(KEY);
        saveBrowserKey(null);
        expect(loadBrowserKey()).toBeNull();
    });

    it('biçim denetimi sunucudakiyle aynı', () => {
        expect(isBrowserKeyFormat(KEY)).toBe(true);
        expect(isBrowserKeyFormat('kisa')).toBe(false);
        expect(isBrowserKeyFormat(`${KEY} x`)).toBe(false);
        expect(isBrowserKeyFormat(`${KEY}\n`)).toBe(false);
    });
});
