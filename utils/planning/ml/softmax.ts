/**
 * Çok sınıflı lojistik regresyon (softmax, L2 düzenlemeli). Özellikler
 * eğitim kümesinin ortalaması ve sapmasıyla ölçeklenir; tam yığın gradyan
 * inişiyle eğitilir. Maskelenen özellikler (hedefi sızdıranlar) kullanılmaz.
 */

export interface SoftmaxOptions {
    iterations: number;
    learningRate: number;
    l2: number;
}

export const SOFTMAX_DEFAULTS: SoftmaxOptions = { iterations: 250, learningRate: 0.5, l2: 0.01 };

export interface SoftmaxModel {
    classes: number;
    mean: number[];
    std: number[];
    /** Sınıf × (özellik + sabit) ağırlıklar; maskeli özelliklerin ağırlığı 0 */
    weights: number[][];
    mask: boolean[];
}

const softmaxInPlace = (z: Float64Array): Float64Array => {
    let m = -Infinity;
    for (const v of z) if (v > m) m = v;
    let s = 0;
    for (let k = 0; k < z.length; k++) { z[k] = Math.exp(z[k] - m); s += z[k]; }
    for (let k = 0; k < z.length; k++) z[k] /= s;
    return z;
};

export const trainSoftmax = (X: Float64Array[], y: number[], classes: number, mask: boolean[], options: Partial<SoftmaxOptions> = {}): SoftmaxModel => {
    const o = { ...SOFTMAX_DEFAULTS, ...options };
    const n = X.length;
    const f = mask.length;
    const mean = new Array<number>(f).fill(0);
    const std = new Array<number>(f).fill(1);
    for (let j = 0; j < f; j++) {
        if (!mask[j]) continue;
        let s = 0, s2 = 0;
        for (let i = 0; i < n; i++) { s += X[i][j]; s2 += X[i][j] * X[i][j]; }
        mean[j] = n ? s / n : 0;
        const v = n ? s2 / n - mean[j] * mean[j] : 0;
        std[j] = v > 1e-12 ? Math.sqrt(v) : 1;
    }
    const Z = X.map(x => { const z = new Float64Array(f); for (let j = 0; j < f; j++) z[j] = mask[j] ? (x[j] - mean[j]) / std[j] : 0; return z; });
    const W = Array.from({ length: classes }, () => new Float64Array(f + 1));
    // Sabit terim sınıf sıklığından başlar
    const counts = new Array<number>(classes).fill(0);
    y.forEach(c => counts[c]++);
    W.forEach((w, k) => { w[f] = Math.log((counts[k] + 1) / (n + classes)); });

    const grad = Array.from({ length: classes }, () => new Float64Array(f + 1));
    const p = new Float64Array(classes);
    for (let it = 0; it < o.iterations; it++) {
        grad.forEach(g => g.fill(0));
        for (let i = 0; i < n; i++) {
            const z = Z[i];
            for (let k = 0; k < classes; k++) {
                const w = W[k];
                let s = w[f];
                for (let j = 0; j < f; j++) if (z[j] !== 0) s += w[j] * z[j];
                p[k] = s;
            }
            softmaxInPlace(p);
            for (let k = 0; k < classes; k++) {
                const d = p[k] - (y[i] === k ? 1 : 0);
                if (d === 0) continue;
                const g = grad[k];
                for (let j = 0; j < f; j++) if (z[j] !== 0) g[j] += d * z[j];
                g[f] += d;
            }
        }
        for (let k = 0; k < classes; k++) {
            const w = W[k], g = grad[k];
            for (let j = 0; j < f; j++) if (mask[j]) w[j] -= o.learningRate * (g[j] / Math.max(1, n) + o.l2 * w[j]);
            w[f] -= o.learningRate * (g[f] / Math.max(1, n));
        }
    }
    return { classes, mean, std, weights: W.map(w => [...w]), mask };
};

export const predictSoftmax = (m: SoftmaxModel, x: ArrayLike<number>): number[] => {
    const f = m.mask.length;
    const z = new Float64Array(m.classes);
    for (let k = 0; k < m.classes; k++) {
        const w = m.weights[k];
        let s = w[f];
        for (let j = 0; j < f; j++) if (m.mask[j]) s += w[j] * ((x[j] - m.mean[j]) / m.std[j]);
        z[k] = s;
    }
    return [...softmaxInPlace(z)];
};
