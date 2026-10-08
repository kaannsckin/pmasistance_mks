import { betaPert, mulberry32, pick, quantileSorted, Rng } from './random';

/**
 * Monte Carlo plan simülasyonu (saf, serileştirilebilir girdi; Web Worker'da
 * da ana iş parçacığında da aynı çalışır).
 *
 * Her tekrarda:
 *  1. Her kaydın eforu dağılımından çekilir (beta-PERT, geçmiş örnekleri ya
 *     da sabit) ve varsa kalibrasyon çarpanıyla (geçmiş gerçek ÷ tahmin
 *     oranlarından rastgele biri) çarpılır.
 *  2. Kayıtlar sabit öncelik sırasıyla (topolojik) çizelgelenir: öncül
 *     bitmeden başlamaz; kişi aynı anda tek iş yürütür ve günlük kapasitesi
 *     (katılım oranı, aylık plan, izinler) kadar ilerler. Atanmamış kayıtlar
 *     birimin en erken boşalan kişisine gider.
 *  3. Teslim = son kaydın bitişi + test süresi (iş günü).
 *
 * Çıktı: teslim günü dağılımı (sıralı tekrarlar, P50/P80/P95), hedefe yetişme olasılığı,
 * kayıt bazında kritik yolda olma oranı ve belirsizliğe katkı (korelasyon).
 * Zaman birimi iş günüdür; ofset k, başlangıçtan itibaren k'inci iş günüdür.
 */

export type EffortDist =
    | { kind: 'pert'; min: number; mode: number; max: number }
    | { kind: 'samples'; values: number[] }
    | { kind: 'fixed'; value: number };

export interface SimTask {
    id: string;
    dist: EffortDist;
    /** Efor çarpanı örnekleri (kalibrasyon); yoksa 1 */
    calibration?: number[];
    /** Sabit kişi şeridi; -1 ise `pool` birim havuzundan, -2 ise kaynaksız (bağımsız) */
    lane: number;
    pool?: number;
    /** Öncül kaydın indeksi; yoksa -1 */
    pred: number;
    /** Süreçteki iş: harcanmış efor tahmini (gün) */
    doneEffort?: number;
    /** Süreçte ama başlama zamanı bilinmiyor: yarısı bitmiş sayılır */
    halfDone?: boolean;
    /** Termin (iş günü ofseti) */
    dueOffset?: number;
}

export interface SimLane {
    /** Günlük kapasite (0–1), ufuk boyunca; ufuk ötesinde `base` */
    rate: number[];
    base: number;
}

export interface SimInput {
    tasks: SimTask[];
    lanes: SimLane[];
    pools: number[][]; // havuz → şerit indeksleri
    /** Çizelgeleme sırası (öncüller önce) */
    order: number[];
    testDays: number;
    iterations: number;
    seed: number;
    targetOffset?: number;
    /** Ayrıca izlenecek kayıt grupları (sürüm, kilometre taşı): her tekrarda grubun son bitişi */
    groups?: SimGroup[];
}

export interface SimGroup {
    id: string;
    tasks: number[]; // görev indeksleri
    /** Hedef bitiş ofseti (iş günü, test hariç) */
    target?: number;
}

export interface GroupStat {
    id: string;
    /** Grubun son kaydının bitiş günü dağılımı (test hariç) */
    finish: Summary;
    sorted: Float64Array;
    targetProbability: number | null;
    deterministic: number;
    /** Grup içi kritik yol oranı (group.tasks sırasıyla) */
    criticality: number[];
}

export interface TaskStat {
    id: string;
    criticality: number; // 0–1
    sensitivity: number; // efor ile teslim arasındaki korelasyon (-1–1)
    p50: number; // bitiş ofseti (iş günü)
    p80: number;
    dueProbability: number | null;
}

export interface Summary {
    p10: number;
    p50: number;
    p80: number;
    p95: number;
    mean: number;
    min: number;
    max: number;
}

export interface SimResult {
    iterations: number;
    seed: number;
    release: Summary; // teslim ofseti (iş günü, test dahil)
    devEnd: Summary; // son kaydın bitişi
    targetProbability: number | null;
    /** Tek nokta plan: herkes tahmin ettiği sürede bitirirse (kalibrasyonsuz, ortalama) */
    deterministic: number;
    tasks: TaskStat[];
    /** Sıralı teslim ofsetleri (her tekrar) */
    sorted: Float64Array;
    groups: GroupStat[];
}

/** Ufuk sonrası tükenmeyen kapasite için alt sınır */
const MIN_RATE = 0.05;
/** Süreçteki işin en az kalan payı */
export const MIN_REMAINING_SHARE = 0.15;
/** Kayıt bazında bitiş dağılımı için saklanan en çok tekrar */
const TASK_SAMPLE_LIMIT = 2000;

export const distMean = (d: EffortDist): number => {
    if (d.kind === 'fixed') return d.value;
    if (d.kind === 'pert') return (d.min + 4 * d.mode + d.max) / 6;
    return d.values.length ? d.values.reduce((a, b) => a + b, 0) / d.values.length : 0;
};

const sampleDist = (d: EffortDist, rng: Rng): number => {
    if (d.kind === 'fixed') return d.value;
    if (d.kind === 'pert') return betaPert(d.min, d.mode, d.max, rng);
    return d.values.length ? pick(d.values, rng) : 0;
};

interface Lane {
    cum: Float64Array; // cum[k] = ilk k günün toplam kapasitesi
    rate: number[];
    base: number;
    H: number;
}

const prepLane = (l: SimLane): Lane => {
    const H = l.rate.length;
    const cum = new Float64Array(H + 1);
    for (let k = 0; k < H; k++) cum[k + 1] = cum[k] + Math.max(0, l.rate[k]);
    return { cum, rate: l.rate, base: Math.max(MIN_RATE, l.base), H };
};

/** Şeridin t anına kadar biriken kapasitesi */
const capAt = (L: Lane, t: number): number => {
    if (t <= 0) return 0;
    if (t >= L.H) return L.cum[L.H] + (t - L.H) * L.base;
    const k = Math.floor(t);
    return L.cum[k] + Math.max(0, L.rate[k]) * (t - k);
};

/** s anında başlayan, `effort` gün kapasite gerektiren işin bitiş anı */
export const finishOn = (L: Lane, s: number, effort: number): number => {
    if (effort <= 0) return s;
    const target = capAt(L, s) + effort;
    if (target > L.cum[L.H]) return L.H + (target - L.cum[L.H]) / L.base;
    // cum[k+1] >= target olan en küçük k
    let lo = Math.floor(Math.max(0, s)), hi = L.H - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (L.cum[mid + 1] >= target) hi = mid; else lo = mid + 1;
    }
    const r = Math.max(0, L.rate[lo]);
    return r > 0 ? lo + (target - L.cum[lo]) / r : lo + 1;
};

const summarize = (sorted: Float64Array): Summary => {
    let sum = 0;
    for (let i = 0; i < sorted.length; i++) sum += sorted[i];
    return {
        p10: quantileSorted(sorted, 0.1),
        p50: quantileSorted(sorted, 0.5),
        p80: quantileSorted(sorted, 0.8),
        p95: quantileSorted(sorted, 0.95),
        mean: sorted.length ? sum / sorted.length : 0,
        min: sorted[0] ?? 0,
        max: sorted[sorted.length - 1] ?? 0,
    };
};

interface RunState {
    finish: Float64Array;
    effort: Float64Array;
    driver: Int32Array;
    free: Float64Array;
    laneLast: Int32Array;
}

/** Tek tekrar: çizelgeyi kurar, son bitişi döndürür (state'e yazar) */
const runOnce = (input: SimInput, lanes: Lane[], st: RunState, draw: (t: SimTask) => number): number => {
    st.free.fill(0);
    st.laneLast.fill(-1);
    let makespan = 0;
    for (const i of input.order) {
        const t = input.tasks[i];
        let e = draw(t);
        if (t.halfDone) e *= 0.5;
        else if (t.doneEffort && t.doneEffort > 0) e = Math.max(e - t.doneEffort, e * MIN_REMAINING_SHARE);
        st.effort[i] = e;
        const predF = t.pred >= 0 ? st.finish[t.pred] : 0;
        let lane = t.lane;
        if (lane === -1 && t.pool !== undefined) {
            // Birim havuzu: en erken başlayabilecek kişi (eşitlikte en yüksek kapasiteli)
            let bestStart = Infinity, bestRate = -1;
            for (const l of input.pools[t.pool]) {
                const s = Math.max(st.free[l], predF);
                const r = lanes[l].rate[Math.min(Math.floor(s), lanes[l].H - 1)] ?? lanes[l].base;
                if (s < bestStart - 1e-9 || (Math.abs(s - bestStart) <= 1e-9 && r > bestRate)) { bestStart = s; bestRate = r; lane = l; }
            }
        }
        let start: number, end: number;
        if (lane >= 0) {
            start = Math.max(st.free[lane], predF);
            end = finishOn(lanes[lane], start, e);
            st.driver[i] = predF >= st.free[lane] ? (t.pred >= 0 && predF > 0 ? t.pred : -1) : st.laneLast[lane];
            st.free[lane] = end;
            st.laneLast[lane] = i;
        } else {
            start = predF;
            end = start + e;
            st.driver[i] = t.pred >= 0 && predF > 0 ? t.pred : -1;
        }
        st.finish[i] = end;
        if (end > makespan) makespan = end;
    }
    return makespan;
};

export const runMonteCarlo = (input: SimInput): SimResult => {
    const n = input.tasks.length;
    const iters = Math.max(1, Math.floor(input.iterations));
    const lanes = input.lanes.map(prepLane);
    const st: RunState = {
        finish: new Float64Array(n),
        effort: new Float64Array(n),
        driver: new Int32Array(n),
        free: new Float64Array(lanes.length),
        laneLast: new Int32Array(lanes.length),
    };
    const rng = mulberry32(input.seed);
    const draw = (t: SimTask) => {
        const base = sampleDist(t.dist, rng);
        return t.calibration && t.calibration.length ? base * pick(t.calibration, rng) : base;
    };

    const test = Math.max(0, input.testDays);
    const releases = new Float64Array(iters);
    const devEnds = new Float64Array(iters);
    const crit = new Float64Array(n);
    // Korelasyon için artımlı toplamlar
    const sx = new Float64Array(n), sxx = new Float64Array(n), sxy = new Float64Array(n);
    let sy = 0, syy = 0;
    const keep = Math.min(iters, TASK_SAMPLE_LIMIT);
    const taskFinish = new Float32Array(n * keep);
    const dueHits = new Float64Array(n);
    let targetHits = 0;

    const G = input.groups || [];
    const gFin = G.map(() => new Float64Array(iters));
    const gCrit = G.map(g => new Float64Array(g.tasks.length));
    const gHits = G.map(() => 0);
    const gPos = G.map(g => new Map(g.tasks.map((t, k) => [t, k])));
    const groupFinish = (finish: Float64Array, g: SimGroup): { day: number; last: number } => {
        let best = -1, last = -1;
        for (const i of g.tasks) if (finish[i] > best) { best = finish[i]; last = i; }
        return { day: best > 0 ? Math.ceil(best - 1e-9) : 0, last };
    };

    for (let it = 0; it < iters; it++) {
        const mk = runOnce(input, lanes, st, draw);
        G.forEach((g, gi) => {
            const { day, last } = groupFinish(st.finish, g);
            gFin[gi][it] = day;
            if (g.target !== undefined && day <= g.target) gHits[gi]++;
            // Grubun kritik zinciri: grubun en son biten kaydından geriye (gruptaki kayıtlar sayılır)
            let j = last, guard = 0;
            while (j >= 0 && guard++ <= n) { const k = gPos[gi].get(j); if (k !== undefined) gCrit[gi][k]++; j = st.driver[j]; }
        });
        // Teslim günü: işin bittiği iş günü (tavan) + test
        const release = mk > 0 ? Math.ceil(mk - 1e-9) + test : 0;
        devEnds[it] = Math.ceil(mk - 1e-9);
        releases[it] = release;
        if (input.targetOffset !== undefined && release <= input.targetOffset) targetHits++;
        // Kritik zincir: en son biten kayıttan geriye
        let j = -1, best = -1;
        for (let i = 0; i < n; i++) if (st.finish[i] > best) { best = st.finish[i]; j = i; }
        let guard = 0;
        while (j >= 0 && guard++ <= n) { crit[j]++; j = st.driver[j]; }
        sy += release;
        syy += release * release;
        for (let i = 0; i < n; i++) {
            const x = st.effort[i];
            sx[i] += x; sxx[i] += x * x; sxy[i] += x * release;
            const day = Math.ceil(st.finish[i] - 1e-9);
            if (it < keep) taskFinish[i * keep + it] = day;
            const due = input.tasks[i].dueOffset;
            if (due !== undefined && day <= due) dueHits[i]++;
        }
    }

    // Tek nokta plan: ortalama eforlar, kalibrasyonsuz
    const detSt: RunState = { finish: new Float64Array(n), effort: new Float64Array(n), driver: new Int32Array(n), free: new Float64Array(lanes.length), laneLast: new Int32Array(lanes.length) };
    const detMk = runOnce(input, lanes, detSt, t => distMean(t.dist));
    const deterministic = detMk > 0 ? Math.ceil(detMk - 1e-9) + test : 0;

    const sortedRel = Float64Array.from(releases).sort();
    const sortedDev = Float64Array.from(devEnds).sort();
    const release = summarize(sortedRel);

    const vy = syy / iters - (sy / iters) ** 2;
    const tasks: TaskStat[] = input.tasks.map((t, i) => {
        const vx = sxx[i] / iters - (sx[i] / iters) ** 2;
        const cov = sxy[i] / iters - (sx[i] / iters) * (sy / iters);
        const sens = vx > 1e-12 && vy > 1e-12 ? cov / Math.sqrt(vx * vy) : 0;
        const fin = taskFinish.subarray(i * keep, (i + 1) * keep).slice().sort();
        return {
            id: t.id,
            criticality: crit[i] / iters,
            sensitivity: Math.round(sens * 1000) / 1000,
            p50: quantileSorted(fin, 0.5),
            p80: quantileSorted(fin, 0.8),
            dueProbability: t.dueOffset !== undefined ? dueHits[i] / iters : null,
        };
    });

    return {
        iterations: iters,
        seed: input.seed,
        release,
        devEnd: summarize(sortedDev),
        targetProbability: input.targetOffset !== undefined ? targetHits / iters : null,
        deterministic,
        tasks,
        sorted: sortedRel,
        groups: G.map((g, gi) => {
            const sorted = Float64Array.from(gFin[gi]).sort();
            return {
                id: g.id,
                finish: summarize(sorted),
                sorted,
                targetProbability: g.target !== undefined ? gHits[gi] / iters : null,
                deterministic: groupFinish(detSt.finish, g).day,
                criticality: Array.from(gCrit[gi], c => c / iters),
            };
        }),
    };
};

/** Teslimin verilen ofsete (dahil) kadar gerçekleşme olasılığı — hedef değişince yeniden simüle etmeden */
export const probabilityBy = (result: Pick<SimResult, 'sorted'>, offset: number): number => {
    const xs = result.sorted;
    let lo = 0, hi = xs.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (xs[mid] <= offset) lo = mid + 1; else hi = mid;
    }
    return xs.length ? lo / xs.length : 0;
};

// ---------------------------------------------------------------- geçmiş hız (throughput)

export interface ThroughputResult {
    p50: number; // teslim ofseti (iş günü, test dahil)
    p80: number;
    p95: number;
    weeks: number; // kullanılan geçmiş hafta sayısı
    perWeek: number; // haftalık ortalama kapanış
    targetProbability: number | null;
}

const MAX_WEEKS = 520;

/**
 * İkinci yöntem: geçmiş haftalık kapanış sayılarından rastgele haftalar
 * çekilerek kalan kayıt sayısı kaç haftada biter. Tahmin gerektirmez; iş
 * karışımının geçmişe benzediğini varsayar.
 */
export const simulateThroughput = (weekly: number[], remaining: number, opts: { iterations: number; seed: number; testDays: number; targetOffset?: number }): ThroughputResult | null => {
    if (!weekly.length || !weekly.some(w => w > 0) || remaining <= 0) return null;
    const rng = mulberry32(opts.seed ^ 0x9e3779b9);
    const out = new Float64Array(opts.iterations);
    let hits = 0;
    for (let it = 0; it < opts.iterations; it++) {
        let done = 0, w = 0;
        while (done < remaining && w < MAX_WEEKS) { done += pick(weekly, rng); w++; }
        const off = w * 5 + Math.max(0, opts.testDays);
        out[it] = off;
        if (opts.targetOffset !== undefined && off <= opts.targetOffset) hits++;
    }
    out.sort();
    return {
        p50: quantileSorted(out, 0.5),
        p80: quantileSorted(out, 0.8),
        p95: quantileSorted(out, 0.95),
        weeks: weekly.length,
        perWeek: Math.round((weekly.reduce((a, b) => a + b, 0) / weekly.length) * 10) / 10,
        targetProbability: opts.targetOffset !== undefined ? hits / opts.iterations : null,
    };
};
