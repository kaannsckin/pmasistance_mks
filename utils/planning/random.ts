/**
 * Simülasyon için tohumlu rastgele sayılar ve dağılım yardımcıları (saf).
 * Aynı tohum aynı diziyi verir: aynı plan ve aynı tohumla simülasyon her
 * çalıştığında aynı sonucu üretir (karşılaştırılabilir senaryolar, testler).
 */

export type Rng = () => number; // [0, 1)

/** mulberry32: hızlı, 32 bit durumlu, simülasyon için yeterli kalitede */
export const mulberry32 = (seed: number): Rng => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/** Standart normal (Box–Muller) */
export const normal = (rng: Rng): number => {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

/** Gamma(k, 1) — Marsaglia–Tsang; k < 1 için güçlendirme */
export const gamma = (k: number, rng: Rng): number => {
    if (k < 1) return gamma(k + 1, rng) * Math.pow(rng() || 1e-12, 1 / k);
    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
        let x: number, v: number;
        do {
            x = normal(rng);
            v = 1 + c * x;
        } while (v <= 0);
        v = v * v * v;
        const u = rng();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
};

export const beta = (a: number, b: number, rng: Rng): number => {
    const x = gamma(a, rng);
    const y = gamma(b, rng);
    return x / (x + y);
};

/**
 * Beta-PERT (en iyi, olası, en kötü): beklenen değer (a + 4m + b) / 6.
 * Aralık sıfırsa sabit değer döner.
 */
export const betaPert = (min: number, mode: number, max: number, rng: Rng): number => {
    if (!(max > min)) return mode;
    const m = Math.min(Math.max(mode, min), max);
    const alpha = 1 + (4 * (m - min)) / (max - min);
    const bet = 1 + (4 * (max - m)) / (max - min);
    return min + beta(alpha, bet, rng) * (max - min);
};

/** Diziden düzgün örnek (bootstrap) */
export const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];

/** Sıralı dizide doğrusal aradeğerli yüzdelik (q: 0–1) */
export const quantileSorted = (sorted: ArrayLike<number>, q: number): number => {
    const n = sorted.length;
    if (!n) return NaN;
    const pos = (n - 1) * Math.min(Math.max(q, 0), 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export const quantile = (xs: readonly number[], q: number): number => quantileSorted([...xs].sort((a, b) => a - b), q);

/** Ağırlıklı yüzdelik (benzerlik ağırlıklı referans sınıfı için) */
export const weightedQuantile = (items: readonly { value: number; weight: number }[], q: number): number => {
    const xs = items.filter(i => i.weight > 0 && Number.isFinite(i.value)).sort((a, b) => a.value - b.value);
    if (!xs.length) return NaN;
    const total = xs.reduce((s, i) => s + i.weight, 0);
    const target = q * total;
    let acc = 0;
    for (const i of xs) {
        acc += i.weight;
        if (acc >= target - 1e-12) return i.value;
    }
    return xs[xs.length - 1].value;
};

/** Ağırlıkların etkin örnek sayısı (Kish): (Σw)² / Σw² */
export const effectiveN = (weights: readonly number[]): number => {
    const s = weights.reduce((a, b) => a + b, 0);
    const s2 = weights.reduce((a, b) => a + b * b, 0);
    return s2 > 0 ? (s * s) / s2 : 0;
};

/** Dizgiden tohum (FNV-1a) — aynı girdiye aynı tohum */
export const seedFrom = (s: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
};
