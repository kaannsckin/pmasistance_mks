import { terms } from './text';

/**
 * BM25 anahtar kelime dizini (Okapi BM25, k1=1.2, b=0.75). Bellekte tutulur;
 * birkaç bin parça için milisaniyeler içinde kurulur ve sorgulanır.
 * Başlık iki kez dizinlenir (basit alan ağırlığı).
 */

export interface Bm25Index {
    n: number;
    avgLen: number;
    lengths: number[];
    /** terim → (parça sırası → frekans) */
    postings: Map<string, Map<number, number>>;
}

const K1 = 1.2;
const B = 0.75;

export const buildBm25 = (items: { title: string; text: string }[]): Bm25Index => {
    const postings = new Map<string, Map<number, number>>();
    const lengths: number[] = [];
    items.forEach((it, idx) => {
        const ts = terms(`${it.title} ${it.title} ${it.text}`);
        lengths.push(ts.length);
        for (const t of ts) {
            let p = postings.get(t);
            if (!p) postings.set(t, (p = new Map()));
            p.set(idx, (p.get(idx) || 0) + 1);
        }
    });
    const total = lengths.reduce((s, l) => s + l, 0);
    return { n: items.length, avgLen: items.length ? total / items.length : 0, lengths, postings };
};

/** Sorguyla eşleşen parçalar (skor > 0), skora göre azalan. `allow` verilirse yalnız o sıralar */
export const searchBm25 = (idx: Bm25Index, query: string, limit = 50, allow?: (i: number) => boolean): { index: number; score: number }[] => {
    const qTerms = Array.from(new Set(terms(query)));
    if (qTerms.length === 0 || idx.n === 0) return [];
    const scores = new Map<number, number>();
    for (const t of qTerms) {
        const p = idx.postings.get(t);
        if (!p) continue;
        const idf = Math.log(1 + (idx.n - p.size + 0.5) / (p.size + 0.5));
        for (const [i, tf] of p) {
            if (allow && !allow(i)) continue;
            const norm = tf + K1 * (1 - B + (B * idx.lengths[i]) / (idx.avgLen || 1));
            scores.set(i, (scores.get(i) || 0) + idf * ((tf * (K1 + 1)) / norm));
        }
    }
    return Array.from(scores.entries())
        .map(([index, score]) => ({ index, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
};
