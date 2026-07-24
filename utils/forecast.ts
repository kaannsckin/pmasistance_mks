import { Allocation, Person, WorkspaceData } from '../types';
import { MONTH_INDEXES } from './allocations';

/**
 * İş yükü (Adam-Ay) öngörüsü.
 *
 * Gerçekleşen (actual) tahsis verisinden yılın kalan aylarını tahmin eder ve
 * yıl sonu tahminine (EAC = gerçekleşen + öngörü) çevirir. Öngörü, kişi × proje
 * satırı bazında hesaplanıp proje/kişi/bölüm ve portföy düzeyine toplanır;
 * böylece hem AA hem de (ünvan aylık maliyetiyle) ₺ maliyet tutarlı çıkar.
 *
 * Yöntemler:
 *  - movingAvg: son N gerçekleşen ayın ortalaması, kalan aylara sabit taşınır
 *  - linear:    gerçekleşen aylara en küçük kareler doğrusu, ileri uzatılır
 *  - naive:     son gerçekleşen ay tekrar eder
 *  - plan:      kalan aylar için onaylı plan kullanılır
 */

export type ForecastMethod = 'movingAvg' | 'linear' | 'naive' | 'plan';
export type ForecastDim = 'project' | 'person' | 'department';

export const FORECAST_METHOD_LABELS: Record<ForecastMethod, string> = {
    movingAvg: 'Hareketli Ortalama',
    linear: 'Doğrusal Trend',
    naive: 'Son Ay (naïf)',
    plan: 'Plana Göre',
};

export const FORECAST_DIM_LABELS: Record<ForecastDim, string> = {
    project: 'Proje',
    person: 'Kişi',
    department: 'Bölüm',
};

export interface ForecastMonth {
    actual: number;
    forecast: number; // gerçekleşen (≤ cutoff) + öngörü (> cutoff) birleşik seri
    plan: number;
    isForecast: boolean; // ay öngörü mü (cutoff'tan sonra)
}

export interface ForecastRow {
    key: string;
    label: string;
    sublabel?: string;
    months: ForecastMonth[]; // 12
    ytd: number; // Σ gerçekleşen (1..cutoff)
    remaining: number; // Σ öngörü (cutoff+1..12)
    eac: number; // ytd + remaining (yıl sonu tahmini)
    planTotal: number;
    variance: number; // eac − planTotal
    costEac: number; // ₺ (maliyetlenebilen kişiler)
    costable: boolean;
}

export interface ForecastResult {
    year: number;
    method: ForecastMethod;
    window: number;
    cutoffMonth: number; // 1..12; 0 ⇒ hiç gerçekleşen yok
    dim: ForecastDim;
    total: ForecastRow; // portföy toplamı (grafik + KPI)
    rows: ForecastRow[]; // boyuta göre kırılım, EAC'ye göre azalan
    uncostedEacAA: number; // maliyetlenemeyen (ünvansız/oransız) EAC AA
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Yılın aylık gerçekleşen (actual) AA toplamları (12 eleman, index 0 = Ocak). */
export function monthlyActualTotals(
    ws: Pick<WorkspaceData, 'allocations'>,
    year: number,
): number[] {
    const t = Array(12).fill(0) as number[];
    ws.allocations.filter(a => a.year === year).forEach(a =>
        MONTH_INDEXES.forEach(m => { t[m - 1] += a.actual[m] || 0; }));
    return t;
}

/**
 * Son gerçekleşen ayı (cutoff) otomatik bulur: verisi olan son ay, ancak
 * önceki ayların çok altında kalan (yarım/eksik girilmiş) sondaki ay(lar)
 * atlanır — böylece eksik son ay öngörüyü aşağı çekmez. En çok 2 ay atlanır.
 */
export function detectCutoffMonth(ws: Pick<WorkspaceData, 'allocations'>, year: number): number {
    const t = monthlyActualTotals(ws, year);
    let last = 0;
    for (let i = 11; i >= 0; i--) { if (t[i] > 1e-9) { last = i + 1; break; } }
    if (last === 0) return 0;
    let skips = 0;
    while (last >= 2 && skips < 2) {
        const prev: number[] = [];
        for (let j = last - 2; j >= 0 && prev.length < 3; j--) { if (t[j] > 1e-9) prev.push(t[j]); }
        if (!prev.length) break;
        const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
        if (t[last - 1] < 0.4 * avg) { last--; skips++; } else break;
    }
    return last;
}

/** j = 0..cutoffIdx noktalarına doğru uydurup x'te değer verir. */
function linearAt(actual: number[], cutoffIdx: number, x: number): number {
    const n = cutoffIdx + 1;
    if (n < 2) return actual[cutoffIdx] || 0;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let j = 0; j <= cutoffIdx; j++) {
        const y = actual[j] || 0;
        sx += j; sy += y; sxx += j * j; sxy += j * y;
    }
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-9) return sy / n;
    const slope = (n * sxy - sx * sy) / d;
    const intercept = (sy - slope * sx) / n;
    return slope * x + intercept;
}

/** 12 aylık gerçekleşen + planı, kalan ayları öngörüyle dolan seriye çevirir. */
function projectSeries(
    actual: number[],
    plan: number[],
    cutoffIdx: number,
    method: ForecastMethod,
    window: number,
): number[] {
    const out = actual.slice();
    for (let i = cutoffIdx + 1; i < 12; i++) {
        let f: number;
        if (method === 'plan' || cutoffIdx < 0) {
            f = plan[i] || 0; // plana göre ya da hiç gerçekleşen yoksa plana düş
        } else if (method === 'naive') {
            f = actual[cutoffIdx] || 0;
        } else if (method === 'linear') {
            f = linearAt(actual, cutoffIdx, i);
        } else {
            // movingAvg
            const start = Math.max(0, cutoffIdx - window + 1);
            let s = 0, n = 0;
            for (let j = start; j <= cutoffIdx; j++) { s += actual[j] || 0; n++; }
            f = n ? s / n : 0;
        }
        out[i] = round2(Math.max(0, f));
    }
    return out;
}

interface AllocFc {
    alloc: Allocation;
    series: number[]; // 12
    plan: number[]; // 12
    person?: Person;
    rate?: number;
}

/** Portföy/boyut öngörüsünü tek seferde hesaplar. */
export function buildForecast(
    ws: Pick<WorkspaceData, 'allocations' | 'people' | 'projects' | 'titles'>,
    opts: { year: number; method: ForecastMethod; window: number; dim: ForecastDim; cutoffMonth?: number },
): ForecastResult {
    const window = opts.window > 0 ? opts.window : 3;
    const allocs = ws.allocations.filter(a => a.year === opts.year);
    const rateByTitle = new Map(
        ws.titles.filter(t => (t.monthlyCost || 0) > 0).map(t => [t.code, t.monthlyCost as number]),
    );
    const personById = new Map(ws.people.map(p => [p.id, p]));
    const projName = new Map(ws.projects.map(p => [p.id, p.name]));

    // Cutoff: kullanıcı verdiyse onu, yoksa yarım son ayı atlayan otomatik tespit.
    const cutoffMonth = opts.cutoffMonth != null
        ? Math.max(0, Math.min(12, Math.round(opts.cutoffMonth)))
        : detectCutoffMonth(ws, opts.year);
    const cutoffIdx = cutoffMonth - 1;

    const fcs: AllocFc[] = allocs.map(a => {
        const actual = MONTH_INDEXES.map(m => a.actual[m] || 0);
        const plan = MONTH_INDEXES.map(m => a.plan[m] || 0);
        const person = personById.get(a.personId);
        const rate = person?.titleCode ? rateByTitle.get(person.titleCode) : undefined;
        return { alloc: a, series: projectSeries(actual, plan, cutoffIdx, opts.method, window), plan, person, rate };
    });

    const makeRow = (key: string, label: string, subset: AllocFc[], sublabel?: string): ForecastRow => {
        const months: ForecastMonth[] = MONTH_INDEXES.map((m, i) => {
            let actual = 0, forecast = 0, plan = 0;
            subset.forEach(f => {
                forecast += f.series[i];
                plan += f.plan[i];
                if (i <= cutoffIdx) actual += f.alloc.actual[m] || 0;
            });
            return { actual: round2(actual), forecast: round2(forecast), plan: round2(plan), isForecast: i > cutoffIdx };
        });
        let ytd = 0, remaining = 0, planTotal = 0;
        months.forEach((mm, i) => {
            planTotal += mm.plan;
            if (i <= cutoffIdx) ytd += mm.actual; else remaining += mm.forecast;
        });
        let costEac = 0, costable = false;
        subset.forEach(f => {
            if (f.rate) { costable = true; costEac += f.series.reduce((s, v) => s + v, 0) * f.rate!; }
        });
        const eac = round2(ytd + remaining);
        return {
            key, label, sublabel, months,
            ytd: round2(ytd), remaining: round2(remaining), eac,
            planTotal: round2(planTotal), variance: round2(eac - planTotal),
            costEac: Math.round(costEac), costable,
        };
    };

    const total = makeRow('__total__', 'Portföy', fcs);

    const groups = new Map<string, { label: string; sub?: string; items: AllocFc[] }>();
    fcs.forEach(f => {
        let key: string, label: string, sub: string | undefined;
        if (opts.dim === 'project') {
            key = f.alloc.projectId;
            label = projName.get(f.alloc.projectId) || 'Bilinmeyen Proje';
        } else if (opts.dim === 'person') {
            key = f.alloc.personId;
            label = f.person ? `${f.person.firstName} ${f.person.lastName}`.trim() : 'Bilinmeyen Kişi';
            sub = f.person?.departmentCode;
        } else {
            key = f.person?.departmentCode || 'Tanımsız';
            label = key;
        }
        if (!groups.has(key)) groups.set(key, { label, sub, items: [] });
        groups.get(key)!.items.push(f);
    });
    const rows = Array.from(groups.entries())
        .map(([k, g]) => makeRow(k, g.label, g.items, g.sub))
        .sort((a, b) => b.eac - a.eac);

    const uncostedEacAA = round2(
        fcs.filter(f => !f.rate).reduce((s, f) => s + f.series.reduce((x, v) => x + v, 0), 0),
    );

    return { year: opts.year, method: opts.method, window, cutoffMonth, dim: opts.dim, total, rows, uncostedEacAA };
}
