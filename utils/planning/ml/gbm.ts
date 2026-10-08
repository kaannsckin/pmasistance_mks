import { mulberry32 } from '../random';

/**
 * Gradyan artırmalı regresyon ağaçları (kare kayıp). Küçük ve bağımlılıksız:
 * özellikler kantil kutularına bölünür (histogram), her turda sığ bir ağaç
 * kalıntıya uydurulur. Satır ve sütun alt örneklemesi tohumlu rastgeleyle
 * yapılır; aynı veri aynı modeli verir. Tahminin hangi özellikten geldiği
 * ağaç yolu katkılarıyla (Saabas) açıklanır.
 */

export interface GbmOptions {
    rounds: number;
    learningRate: number;
    maxDepth: number;
    minLeaf: number;
    lambda: number;
    subsample: number;
    colsample: number;
    maxBins: number;
    seed: number;
}

export const GBM_DEFAULTS: GbmOptions = { rounds: 120, learningRate: 0.08, maxDepth: 3, minLeaf: 6, lambda: 1, subsample: 0.8, colsample: 0.8, maxBins: 24, seed: 7 };

/** Düz dizi ağaç: yaprakta feature = −1; x[feature] <= threshold ise sola */
export interface GbmTree {
    feature: number[];
    threshold: number[];
    left: number[];
    right: number[];
    value: number[];
}

export interface GbmModel {
    base: number;
    trees: GbmTree[];
    /** Özellik başına toplam kazanç (önem) */
    gain: number[];
}

/** Sütunun kutu sınırları: benzersiz değerler azsa ara noktalar, çoksa kantiller */
const thresholdsOf = (col: Float64Array, maxBins: number): number[] => {
    const u = [...new Set(col)].sort((a, b) => a - b);
    if (u.length <= 1) return [];
    if (u.length <= maxBins) return u.slice(0, -1).map((v, i) => (v + u[i + 1]) / 2);
    const s = Float64Array.from(col).sort();
    const out: number[] = [];
    for (let b = 1; b < maxBins; b++) {
        const v = s[Math.floor((b / maxBins) * (s.length - 1))];
        if (!out.length || v > out[out.length - 1]) out.push(v);
    }
    return out.filter(t => t < u[u.length - 1]);
};

export const trainGbm = (X: Float64Array[], y: number[], options: Partial<GbmOptions> = {}): GbmModel => {
    const o = { ...GBM_DEFAULTS, ...options };
    const n = X.length;
    const f = n ? X[0].length : 0;
    const rand = mulberry32(o.seed);
    const base = n ? y.reduce((a, b) => a + b, 0) / n : 0;
    const gain = new Array<number>(f).fill(0);
    if (n < 2 * o.minLeaf) return { base, trees: [], gain };

    // Kutulama (sütun düzeninde)
    const cuts: number[][] = [];
    const bins: Uint8Array[] = [];
    for (let j = 0; j < f; j++) {
        const col = new Float64Array(n);
        for (let i = 0; i < n; i++) col[i] = X[i][j];
        const t = thresholdsOf(col, o.maxBins);
        cuts.push(t);
        const b = new Uint8Array(n);
        for (let i = 0; i < n; i++) { let k = 0; while (k < t.length && col[i] > t[k]) k++; b[i] = k; }
        bins.push(b);
    }
    const usable = cuts.map((t, j) => (t.length ? j : -1)).filter(j => j >= 0);

    const pred = new Float64Array(n).fill(base);
    const grad = new Float64Array(n);
    const trees: GbmTree[] = [];
    const histG = new Float64Array(o.maxBins + 1);
    const histH = new Float64Array(o.maxBins + 1);

    for (let round = 0; round < o.rounds; round++) {
        for (let i = 0; i < n; i++) grad[i] = pred[i] - y[i];
        const rows: number[] = [];
        for (let i = 0; i < n; i++) if (rand() < o.subsample) rows.push(i);
        const cols = usable.filter(() => rand() < o.colsample);
        if (rows.length < 2 * o.minLeaf || !cols.length) continue;

        const tree: GbmTree = { feature: [], threshold: [], left: [], right: [], value: [] };
        const grow = (idx: number[], depth: number): number => {
            let G = 0;
            for (const i of idx) G += grad[i];
            const H = idx.length;
            const node = tree.feature.length;
            tree.feature.push(-1); tree.threshold.push(0); tree.left.push(-1); tree.right.push(-1);
            tree.value.push((-G / (H + o.lambda)) * o.learningRate);
            if (depth >= o.maxDepth || H < 2 * o.minLeaf) return node;
            const parent = (G * G) / (H + o.lambda);
            let best = 1e-9, bestF = -1, bestB = -1;
            for (const j of cols) {
                const t = cuts[j];
                histG.fill(0, 0, t.length + 1); histH.fill(0, 0, t.length + 1);
                const b = bins[j];
                for (const i of idx) { histG[b[i]] += grad[i]; histH[b[i]]++; }
                let GL = 0, HL = 0;
                for (let k = 0; k < t.length; k++) {
                    GL += histG[k]; HL += histH[k];
                    const HR = H - HL;
                    if (HL < o.minLeaf) continue;
                    if (HR < o.minLeaf) break;
                    const GR = G - GL;
                    const g = (GL * GL) / (HL + o.lambda) + (GR * GR) / (HR + o.lambda) - parent;
                    if (g > best) { best = g; bestF = j; bestB = k; }
                }
            }
            if (bestF < 0) return node;
            gain[bestF] += best;
            const L: number[] = [], R: number[] = [];
            const b = bins[bestF];
            for (const i of idx) (b[i] <= bestB ? L : R).push(i);
            tree.feature[node] = bestF;
            tree.threshold[node] = cuts[bestF][bestB];
            tree.left[node] = grow(L, depth + 1);
            tree.right[node] = grow(R, depth + 1);
            return node;
        };
        grow(rows, 0);
        if (tree.feature[0] < 0) continue; // bölünemedi: sabit kayma tabana zaten dahil
        trees.push(tree);
        for (let i = 0; i < n; i++) pred[i] += leafOf(tree, X[i]);
    }
    return { base, trees, gain };
};

const leafOf = (t: GbmTree, x: ArrayLike<number>): number => {
    let k = 0;
    while (t.feature[k] >= 0) k = x[t.feature[k]] <= t.threshold[k] ? t.left[k] : t.right[k];
    return t.value[k];
};

export const predictGbm = (m: GbmModel, x: ArrayLike<number>): number => {
    let s = m.base;
    for (const t of m.trees) s += leafOf(t, x);
    return s;
};

/** Ağaç yolu katkıları: özellik başına tahmine eklenen pay (taban + kökler + katkılar = tahmin) */
export const contributionsGbm = (m: GbmModel, x: ArrayLike<number>, nFeatures: number): { bias: number; contrib: Float64Array } => {
    const contrib = new Float64Array(nFeatures);
    let bias = m.base;
    for (const t of m.trees) {
        let k = 0;
        bias += t.value[0];
        while (t.feature[k] >= 0) {
            const next = x[t.feature[k]] <= t.threshold[k] ? t.left[k] : t.right[k];
            contrib[t.feature[k]] += t.value[next] - t.value[k];
            k = next;
        }
    }
    return { bias, contrib };
};
