import { describe, expect, it, vi } from 'vitest';
import { buildBm25, searchBm25 } from './bm25';
import { Embedder, Retriever } from './retriever';
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

    it('aynı belgeden en fazla 2 parça döner', async () => {
        const long = 'Bütçe kalemi açıklaması uzun bir paragraf olarak burada yer alır. '.repeat(60);
        const r = new Retriever();
        r.sync([doc('uzun', 'Bütçe', long), doc('kisa', 'Bütçe özeti', 'Bütçe özeti.')]);
        const hits = await r.search('bütçe', { k: 10 });
        expect(hits.filter(h => h.chunk.docId === 'uzun').length).toBeLessThanOrEqual(2);
        expect(hits.some(h => h.chunk.docId === 'kisa')).toBe(true);
    });
});
