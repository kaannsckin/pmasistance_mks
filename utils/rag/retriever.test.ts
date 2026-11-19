import { describe, expect, it, vi } from 'vitest';
import { buildBm25, searchBm25 } from './bm25';
import { Embedder, embeddingWaitText, Retriever } from './retriever';
import { RagDoc } from './sources';
import { createStore } from './store';
import { chunkText, foldTr, hashText, stem, terms, tokenize } from './text';

const doc = (id: string, title: string, text: string, extra: Partial<RagDoc> = {}): RagDoc => ({
    id, type: 'not', title, text, ref: { kind: 'guide', section: id }, ...extra,
});

/** Kelime torbası (hash) vektörleri — anlamsal yolu sınamak için sahte embedder */
const bagEmbedder = (model = 'bag-v1'): Embedder & { calls: number; texts: number } => {
    const e = {
        model, calls: 0, texts: 0,
        embed: async (texts: string[]) => {
            e.calls++;
            e.texts += texts.length;
            return texts.map(t => {
                const v = new Array(64).fill(0);
                terms(t).forEach(w => { v[parseInt(hashText(w), 36) % 64] += 1; });
                return v;
            });
        },
    };
    return e;
};

describe('metin işleme', () => {
    it('Türkçe katlama ve F5 gövdeleme', () => {
        expect(foldTr('BÜTÇE Şirket İSTANBUL ılık')).toBe('butce sirket istanbul ilik');
        expect(tokenize('Projenin bütçesi ve gecikme nedir?')).toEqual(['projenin', 'butcesi', 'gecikme']);
        expect(terms('gecikmeler gecikmesi gecikme')).toEqual(['gecik', 'gecik', 'gecik']);
        expect(stem('2026')).toBe('2026');
    });

    it('uzun metni paragraf/cümle sınırlarından örtüşmeli parçalar', () => {
        const para = (n: number) => `Paragraf ${n}. ` + 'Bu cümle örnek içerik taşır. '.repeat(12);
        const text = [1, 2, 3, 4].map(para).join('\n\n');
        const chunks = chunkText(text, 500, 80);
        expect(chunks.length).toBeGreaterThan(2);
        expect(chunks.every(c => c.length <= 600)).toBe(true);
        expect(chunks.join(' ')).toContain('Paragraf 4.');
        expect(chunkText('kısa metin')).toEqual(['kısa metin']);
        expect(chunkText('   ')).toEqual([]);
    });
});

describe('BM25', () => {
    it('ekli/aksansız sorguyla eşleşir, alakasızı getirmez', () => {
        const idx = buildBm25([
            { title: 'Tedarik', text: 'Tedarikçi gecikmesi nedeniyle teslimat kaydı.' },
            { title: 'Bütçe', text: 'Ek bütçe talebi müşteriye iletildi.' },
            { title: 'Toplantı', text: 'Haftalık koordinasyon toplantısı yapıldı.' },
        ]);
        expect(searchBm25(idx, 'butce talepleri')[0].index).toBe(1);
        expect(searchBm25(idx, 'tedarikçilerdeki gecikmeler')[0].index).toBe(0);
        expect(searchBm25(idx, 'uzay mekiği')).toEqual([]);
        expect(searchBm25(idx, 'butce', 10, i => i !== 1)).toEqual([]);
    });
});

describe('Retriever', () => {
    const docs = [
        doc('a', 'Müşteri toplantısı', 'Müşteri kapsamın genişlemesini istedi; ek bütçe talep edilecek.', { projectId: 'p1', type: 'not' }),
        doc('b', 'Tedarik riski', 'Donanım tedarikçisi teslimatı iki ay geciktirebilir.', { projectId: 'p1', type: 'risk' }),
        doc('c', 'Plan onayı', 'Plan Onaya Gönder ile gönderilir, PYB Sorumlusu Onayla & Kilitle der.', { type: 'kilavuz' }),
        doc('d', 'Diğer proje notu', 'Başka projede ek bütçe konuşuldu.', { projectId: 'p2', type: 'not' }),
    ];

    it('anahtar kelimeyle bulur; tür ve proje filtreleri çalışır', async () => {
        const r = new Retriever();
        r.sync(docs);
        const hits = await r.search('ek bütçe');
        expect(hits.map(h => h.chunk.docId)).toEqual(expect.arrayContaining(['a', 'd']));
        expect(hits.every(h => h.lexical && !h.semantic)).toBe(true);
        expect((await r.search('ek bütçe', { projectId: 'p1' })).map(h => h.chunk.docId)).toEqual(['a']);
        expect((await r.search('plan nasıl onaylanır kilitlenir', { types: ['kilavuz'] }))[0].chunk.docId).toBe('c');
        expect(r.status().chunks).toBe(4);
    });

    it('embedding varsa hibrit; değişmeyen parçalar yeniden vektörlenmez (önbellek)', async () => {
        const cache = createStore<Float32Array>('test-vectors');
        const emb = bagEmbedder();
        const r1 = new Retriever({ cache, batchSize: 2 });
        r1.sync(docs, emb);
        await r1.whenIdle();
        expect(emb.texts).toBe(4);
        expect(r1.status().vectors).toBe(4);
        const hits = await r1.search('tedarikçi teslimat gecikmesi', { embedder: emb });
        expect(hits[0].chunk.docId).toBe('b');
        expect(hits[0].semantic && hits[0].lexical).toBe(true);

        // Yeni bir örnek, aynı önbellek: yalnız eklenen parça vektörlenir
        const before = emb.texts; // (sorgu embedding'i de sayıldı)
        const r2 = new Retriever({ cache });
        r2.sync([...docs, doc('e', 'Yeni not', 'Sunucu kurulumu tamamlandı.')], emb);
        await r2.whenIdle();
        expect(emb.texts - before).toBe(1);
        expect(r2.status().vectors).toBe(5);
    });

    it('embedding hatasında anahtar kelimeyle devam eder ve hatayı bildirir', async () => {
        const failing: Embedder = { model: 'x', embed: vi.fn(async () => { throw new Error('kota doldu'); }) };
        const r = new Retriever();
        r.sync(docs, failing);
        await r.whenIdle();
        expect(r.status().semanticError).toBe('kota doldu');
        const hits = await r.search('ek bütçe', { embedder: failing });
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.every(h => !h.semantic)).toBe(true);
    });

    describe('kota/hız sınırı', () => {
        /** Sahte saat: bekleme saati ilerletir ve kaydedilir */
        const fakeClock = () => {
            const c = { t: 0, sleeps: [] as number[], now: () => c.t, sleep: async (ms: number) => { c.sleeps.push(ms); c.t += ms; } };
            return c;
        };
        const rateLimited = (extra: Record<string, unknown> = {}) =>
            Object.assign(new Error('AI sağlayıcısı kota/hız sınırına ulaştı'), { code: 'rate_limited', status: 429, ...extra });
        /** Bağlı embedder: çağrı anlarını ve metinleri kaydeder; `fail` true dönerse verilen hatayı fırlatır */
        const recording = (clock: { now: () => number }, fail: (call: number) => Error | null = () => null) => {
            const inner = bagEmbedder('rec-v1');
            const e = {
                model: 'rec-v1', at: [] as number[], batches: [] as string[][],
                embed: async (texts: string[], kind: 'document' | 'query') => {
                    e.at.push(clock.now());
                    e.batches.push(texts);
                    const err = fail(e.at.length);
                    if (err) throw err;
                    return inner.embed(texts, kind);
                },
            };
            return e;
        };

        it('istekleri aralıklı gönderir; sınırda bildirilen süre kadar bekleyip aynı partiden sürer', async () => {
            const clock = fakeClock();
            const emb = recording(clock, call => call === 2 ? rateLimited({ retryAfterSec: 40 }) : null);
            const r = new Retriever({ batchSize: 1, minIntervalMs: 1000, now: clock.now, sleep: clock.sleep });
            const waits: (string | undefined)[] = [];
            r.onChange(() => { const s = r.status(); if (s.waitUntil) waits.push(`${s.waitKind}@${s.waitUntil}`); });
            r.sync(docs, emb);
            await r.whenIdle();

            // 0: ilk parti · 1000: aralıklı ikinci parti sınıra takılır · 41000: 40 sn sonra aynı parti
            // sonra aralık iki katına çıkar (2 sn)
            expect(emb.at).toEqual([0, 1000, 41000, 43000, 45000]);
            expect(emb.batches[2]).toEqual(emb.batches[1]);
            expect(waits).toEqual([`rate@${new Date(41000).toISOString()}`]);
            expect(r.status()).toMatchObject({ vectors: 4, chunks: 4, embedding: false });
            expect(r.status().semanticError).toBeUndefined();
            expect(r.status().waitUntil).toBeUndefined();
        });

        it('süre bildirilmezse artan sürelerle bekler ve vazgeçmez', async () => {
            const clock = fakeClock();
            const emb = recording(clock, call => call >= 2 && call <= 4 ? rateLimited() : null);
            const r = new Retriever({ batchSize: 2, minIntervalMs: 0, backoffMs: 15_000, now: clock.now, sleep: clock.sleep });
            r.sync(docs, emb);
            await r.whenIdle();
            expect(clock.sleeps.filter(ms => ms >= 15_000)).toEqual([15_000, 30_000, 60_000]);
            expect(r.status().vectors).toBe(4);
            expect(r.status().semanticError).toBeUndefined();
        });

        it('günlük kotada seyrek dener; beklerken sorgu embedding istenmez; "Dizini yenile" beklemeyi keser', async () => {
            let calls = 0;
            const sleeps: number[] = [];
            const emb: Embedder = {
                model: 'gunluk-v1',
                embed: async texts => {
                    calls++;
                    if (calls === 1) throw rateLimited({ retryAfterSec: 20, quota: 'daily' });
                    return texts.map(() => [1, 0, 0]);
                },
            };
            // Beklemeler kendiliğinden bitmez: yalnızca uyandırılınca sürer
            const r = new Retriever({ minIntervalMs: 0, now: () => 0, sleep: ms => { sleeps.push(ms); return new Promise(() => undefined); } });
            r.sync(docs, emb);
            await vi.waitFor(() => expect(r.status().waitKind).toBe('daily'));
            expect(sleeps).toEqual([3_600_000]);
            expect(r.status().waitUntil).toBe(new Date(3_600_000).toISOString());

            const hits = await r.search('ek bütçe', { embedder: emb });
            expect(hits.length).toBeGreaterThan(0);
            expect(calls).toBe(1);

            r.resetSemanticError();
            await r.whenIdle();
            expect(calls).toBe(2);
            expect(r.status().vectors).toBe(4);
            expect(r.status().waitUntil).toBeUndefined();
        });

        it('bağlantı hatasında birkaç kez dener, sonra durur', async () => {
            const clock = fakeClock();
            const emb = recording(clock, () => Object.assign(new Error('AI sunucusuna ulaşılamadı.'), { code: 'network' }));
            const r = new Retriever({ minIntervalMs: 0, backoffMs: 1000, maxTransientRetries: 2, now: clock.now, sleep: clock.sleep });
            r.sync(docs, emb);
            await r.whenIdle();
            expect(emb.at).toEqual([0, 1000, 3000]);
            expect(r.status().semanticError).toBe('AI sunucusuna ulaşılamadı.');
        });

        it('sayfa yenilense de kaldığı yerden sürer (tamamlanan partiler önbellekte)', async () => {
            const cache = createStore<Float32Array>('test-vectors-resume');
            const first = recording({ now: () => 0 }, call => call >= 2 ? rateLimited() : null);
            const r1 = new Retriever({ cache, batchSize: 2, minIntervalMs: 0, sleep: () => new Promise(() => undefined) });
            r1.sync(docs, first);
            await vi.waitFor(() => expect(r1.status().waitKind).toBe('rate'));
            expect(r1.status().vectors).toBe(2);

            // Yeni sayfa: aynı önbellek, yalnızca eksik iki parça istenir
            const second = recording({ now: () => 0 });
            const r2 = new Retriever({ cache, batchSize: 2, minIntervalMs: 0 });
            r2.sync(docs, second);
            await r2.whenIdle();
            expect(second.batches.flat()).toHaveLength(2);
            expect(r2.status().vectors).toBe(4);
        });

        it('beklerken model değişirse eski iş bırakılır, yeni modelle baştan başlanır', async () => {
            const stuck: Embedder = { model: 'eski', embed: async () => { throw rateLimited({ retryAfterSec: 30 }); } };
            const r = new Retriever({ minIntervalMs: 0, sleep: () => new Promise(() => undefined) });
            r.sync(docs, stuck);
            await vi.waitFor(() => expect(r.status().waitKind).toBe('rate'));
            const fresh = bagEmbedder('yeni');
            r.sync(docs, fresh);
            await r.whenIdle();
            expect(r.status()).toMatchObject({ model: 'yeni', vectors: 4 });
            expect(r.status().waitUntil).toBeUndefined();
        });

        it('bekleme metni', () => {
            const base = { chunks: 10, byType: {}, vectors: 4, embedding: true };
            expect(embeddingWaitText(base)).toBeNull();
            expect(embeddingWaitText({ ...base, waitUntil: new Date(60_000).toISOString(), waitKind: 'rate' }, 0))
                .toBe('AI sağlayıcısı hız sınırına ulaştı; anlamsal dizin birazdan kaldığı yerden devam edecek (4/10 parça hazır). Bu sırada anahtar kelime araması kullanılıyor.');
            expect(embeddingWaitText({ ...base, waitUntil: new Date(3_600_000).toISOString(), waitKind: 'daily' }, 0))
                .toMatch(/^AI sağlayıcısının günlük kotası doldu; anlamsal dizin \d{2}[:.]\d{2} civarında kaldığı yerden/);
        });
    });

    it('aynı belgeden en fazla 2 parça döner', async () => {
        const long = 'Bütçe kalemi açıklaması uzun bir paragraf olarak burada yer alır. '.repeat(60);
        const r = new Retriever();
        r.sync([doc('uzun', 'Bütçe', long), doc('kisa', 'Bütçe özeti', 'Bütçe özeti.')]);
        const hits = await r.search('bütçe', { k: 10 });
        expect(hits.filter(h => h.chunk.docId === 'uzun').length).toBeLessThanOrEqual(2);
        expect(hits.some(h => h.chunk.docId === 'kisa')).toBe(true);
    });
});
