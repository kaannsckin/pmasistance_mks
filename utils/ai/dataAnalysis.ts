import { Cell, toCell } from '../export/aiDocument';

/**
 * Asistanın hesap motoru: ekli Excel/CSV tabloları ya da okuma araçlarının
 * sonuçları üzerinde profil, gruplama, pivot, dağılım, aykırı değer, trend ve
 * korelasyon. Model sayıları kafadan toplamaz; bu motorla hesaplatır (Claude'un
 * kod çalıştırarak yaptığı analizin tarayıcıdaki karşılığı). Saf fonksiyonlar.
 */

export interface DataTable {
    /** Kullanıcıya ve modele görünen ad (ör. "butce.xlsx / Sayfa1") */
    name: string;
    columns: string[];
    rows: Cell[][];
}

export class AnalysisError extends Error {}

export const MAX_TABLE_ROWS = 50_000;
/** Bir sonuçta modele dönen en çok satır/grup */
export const MAX_RESULT_ROWS = 60;

export type AggFn = 'toplam' | 'ortalama' | 'ortanca' | 'min' | 'max' | 'say' | 'benzersiz' | 'std';
export const AGG_FNS: AggFn[] = ['toplam', 'ortalama', 'ortanca', 'min', 'max', 'say', 'benzersiz', 'std'];

export type FilterOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'icerir' | 'icermez' | 'bos' | 'dolu';
export const FILTER_OPS: FilterOp[] = ['=', '!=', '>', '>=', '<', '<=', 'icerir', 'icermez', 'bos', 'dolu'];

export interface Filter { sutun: string; op: FilterOp; deger?: unknown }
export interface Measure { sutun?: string; fonk: AggFn; ad?: string }

const fold = (s: string): string =>
    s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[_\s]+/g, ' ').trim();

const round = (n: number, d = 2): number => {
    const f = 10 ** d;
    return Math.round(n * f) / f;
};

/** Sütun adını (büyük/küçük harf, Türkçe karakter ve boşluk duyarsız) dizine çevirir */
export const columnIndex = (t: DataTable, name: string): number => {
    const want = fold(String(name ?? ''));
    let i = t.columns.findIndex(c => fold(c) === want);
    if (i < 0 && want) {
        const partial = t.columns.map((c, k) => ({ k, ok: fold(c).includes(want) })).filter(x => x.ok);
        if (partial.length === 1) i = partial[0].k;
    }
    if (i < 0) throw new AnalysisError(`"${name}" sütunu yok. Sütunlar: ${t.columns.join(', ')}.`);
    return i;
};

// ------------------------------------------------------------ değer türleri

const isEmpty = (c: Cell): boolean => c === null || c === '';

export const numOf = (c: Cell): number | null => {
    if (typeof c === 'number') return Number.isFinite(c) ? c : null;
    if (c === null) return null;
    const s = c.replace(/[₺$€%\s]|TL/gi, '');
    if (!s) return null;
    const v = toCell(s);
    return typeof v === 'number' ? v : null;
};

const DATE_ISO = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/;
const DATE_TR = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/;

/** "2026-11-03", "2026-11", "03.11.2026", "03/11/2026" → Date (UTC) */
export const dateOf = (c: Cell): Date | null => {
    if (typeof c !== 'string') return null;
    const s = c.trim();
    let m = DATE_ISO.exec(s);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1));
    m = DATE_TR.exec(s);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return null;
};

type ColType = 'sayı' | 'tarih' | 'metin' | 'boş';

const colType = (values: Cell[]): ColType => {
    const filled = values.filter(v => !isEmpty(v));
    if (!filled.length) return 'boş';
    const nums = filled.filter(v => numOf(v) !== null).length;
    if (nums / filled.length >= 0.9) return 'sayı';
    const dates = filled.filter(v => dateOf(v) !== null).length;
    if (dates / filled.length >= 0.9) return 'tarih';
    return 'metin';
};

const sorted = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);

/** Doğrusal ara değerli yüzdelik (0-100) */
export const percentile = (xs: number[], p: number): number => {
    if (!xs.length) return NaN;
    const s = sorted(xs);
    const pos = (s.length - 1) * (p / 100);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]): number => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

export const aggregate = (values: Cell[], fn: AggFn): number | null => {
    if (fn === 'say') return values.filter(v => !isEmpty(v)).length;
    if (fn === 'benzersiz') return new Set(values.filter(v => !isEmpty(v)).map(v => (typeof v === 'string' ? fold(v) : v))).size;
    const xs = values.map(numOf).filter((x): x is number => x !== null);
    if (!xs.length) return null;
    switch (fn) {
        case 'toplam': return round(xs.reduce((a, b) => a + b, 0));
        case 'ortalama': return round(mean(xs));
        case 'ortanca': return round(percentile(xs, 50));
        case 'min': return Math.min(...xs);
        case 'max': return Math.max(...xs);
        case 'std': return round(std(xs));
    }
};

// ------------------------------------------------------------ süzgeç

export const applyFilters = (t: DataTable, filters: Filter[] = []): Cell[][] => {
    if (!filters.length) return t.rows;
    const fs = filters.map(f => {
        if (!FILTER_OPS.includes(f.op)) throw new AnalysisError(`Süzgeç işleci ${FILTER_OPS.join(', ')} olmalı.`);
        return { ...f, i: columnIndex(t, f.sutun) };
    });
    return t.rows.filter(r => fs.every(f => {
        const c = r[f.i];
        if (f.op === 'bos') return isEmpty(c);
        if (f.op === 'dolu') return !isEmpty(c);
        const want = f.deger as Cell;
        if (f.op === 'icerir' || f.op === 'icermez') {
            const hit = fold(String(c ?? '')).includes(fold(String(want ?? '')));
            return f.op === 'icerir' ? hit : !hit;
        }
        const a = numOf(c), b = numOf(toCell(want));
        if (a !== null && b !== null) {
            switch (f.op) {
                case '=': return a === b;
                case '!=': return a !== b;
                case '>': return a > b;
                case '>=': return a >= b;
                case '<': return a < b;
                case '<=': return a <= b;
            }
        }
        // Tarih ya da metin karşılaştırması (ISO tarihler metin olarak da sıralanır)
        const da = dateOf(c), db = dateOf(toCell(want));
        const x = da && db ? da.getTime() : fold(String(c ?? ''));
        const y = da && db ? db.getTime() : fold(String(want ?? ''));
        switch (f.op) {
            case '=': return x === y;
            case '!=': return x !== y;
            case '>': return x > y;
            case '>=': return x >= y;
            case '<': return x < y;
            case '<=': return x <= y;
        }
        return false;
    }));
};

// ------------------------------------------------------------ işlemler

export interface ColumnProfile {
    sutun: string;
    tur: ColType;
    dolu: number;
    bos: number;
    benzersiz: number;
    toplam?: number;
    ortalama?: number;
    ortanca?: number;
    min?: number | string;
    max?: number | string;
    std?: number;
    en_sik?: string;
}

/** Veri profili: satır, sütun türleri, boşluklar, özet istatistikler ve veri kalitesi uyarıları */
export const profile = (t: DataTable, rows: Cell[][] = t.rows) => {
    const cols: ColumnProfile[] = t.columns.map((name, i) => {
        const vals = rows.map(r => r[i] ?? null);
        const filled = vals.filter(v => !isEmpty(v));
        const type = colType(vals);
        const p: ColumnProfile = {
            sutun: name, tur: type, dolu: filled.length, bos: vals.length - filled.length,
            benzersiz: new Set(filled.map(v => (typeof v === 'string' ? fold(v) : v))).size,
        };
        if (type === 'sayı') {
            const xs = filled.map(numOf).filter((x): x is number => x !== null);
            Object.assign(p, { toplam: round(xs.reduce((a, b) => a + b, 0)), ortalama: round(mean(xs)), ortanca: round(percentile(xs, 50)), min: Math.min(...xs), max: Math.max(...xs), std: round(std(xs)) });
        } else if (type === 'tarih') {
            const ds = filled.map(dateOf).filter((d): d is Date => !!d).map(d => d.getTime());
            p.min = new Date(Math.min(...ds)).toISOString().slice(0, 10);
            p.max = new Date(Math.max(...ds)).toISOString().slice(0, 10);
        } else if (type === 'metin') {
            const freq = new Map<string, number>();
            filled.forEach(v => freq.set(String(v), (freq.get(String(v)) || 0) + 1));
            p.en_sik = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} (${n})`).join('; ');
        }
        return p;
    });
    const seen = new Set<string>();
    let dup = 0;
    rows.forEach(r => { const k = JSON.stringify(r); if (seen.has(k)) dup++; else seen.add(k); });
    const uyarilar: string[] = [];
    if (dup) uyarilar.push(`${dup} satır birebir tekrar ediyor.`);
    cols.filter(c => c.dolu && c.bos / rows.length >= 0.3).forEach(c => uyarilar.push(`"${c.sutun}" sütununun %${Math.round((c.bos / rows.length) * 100)}'i boş.`));
    cols.filter(c => c.tur === 'boş').forEach(c => uyarilar.push(`"${c.sutun}" sütunu tamamen boş.`));
    // Toplam satırı ("Toplam", "Genel Toplam") analizde çift sayıma yol açar
    const totals = rows.filter(r => r.some(c => typeof c === 'string' && /^(genel\s+)?toplam\b|^total\b/i.test(c.trim()))).length;
    if (totals) uyarilar.push(`${totals} satır toplam satırı gibi görünüyor; toplamlarda çift sayılmaması için süzgeçle çıkarın.`);
    return { tablo: t.name, satir: rows.length, sutun: t.columns.length, sutunlar: cols, ...(uyarilar.length ? { veri_kalitesi: uyarilar } : {}) };
};

const measureName = (m: Measure): string => m.ad || (m.fonk === 'say' && !m.sutun ? 'kayıt sayısı' : `${m.sutun} ${m.fonk}`);

/** Gruplayıp ölç: "bölüm başına toplam saat", "durum başına kayıt sayısı"; pay (%) ve genel toplam da döner */
export const groupBy = (t: DataTable, rows: Cell[][], groups: string[], measures: Measure[], o: { sirala?: string; artan?: boolean; limit?: number } = {}) => {
    if (!measures.length) measures = [{ fonk: 'say' }];
    const gi = groups.map(g => columnIndex(t, g));
    const ms = measures.map(m => {
        if (!AGG_FNS.includes(m.fonk)) throw new AnalysisError(`Ölçü fonksiyonu ${AGG_FNS.join(', ')} olmalı.`);
        if (m.fonk !== 'say' && !m.sutun) throw new AnalysisError(`${m.fonk} için sutun gerekli.`);
        return { ...m, i: m.sutun ? columnIndex(t, m.sutun) : -1, name: measureName(m) };
    });
    const buckets = new Map<string, { key: Cell[]; rows: Cell[][] }>();
    for (const r of rows) {
        const key = gi.map(i => (isEmpty(r[i]) ? '(boş)' : r[i]));
        const k = JSON.stringify(key.map(v => (typeof v === 'string' ? fold(v) : v)));
        const b = buckets.get(k);
        if (b) b.rows.push(r); else buckets.set(k, { key, rows: [r] });
    }
    const out = [...buckets.values()].map(b => {
        const row: Record<string, Cell> = {};
        groups.forEach((g, k) => { row[t.columns[gi[k]] || g] = b.key[k]; });
        ms.forEach(m => { row[m.name] = aggregate(m.i < 0 ? b.rows.map(() => 1) : b.rows.map(r => r[m.i]), m.fonk); });
        return row;
    });
    // İlk ölçü toplanabilirse (toplam / say) her grubun payı
    const first = ms[0];
    const additive = first.fonk === 'toplam' || first.fonk === 'say';
    const grand = additive ? aggregate(first.i < 0 ? rows.map(() => 1) : rows.map(r => r[first.i]), first.fonk) : null;
    if (additive && grand) out.forEach(r => { r['pay %'] = round(((r[first.name] as number) || 0) / grand * 100, 1); });
    const sortKey = o.sirala ? (ms.find(m => fold(m.name) === fold(o.sirala!))?.name || t.columns[columnIndex(t, o.sirala)]) : first.name;
    out.sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'tr');
        return o.artan ? d : -d;
    });
    const limit = Math.min(o.limit || MAX_RESULT_ROWS, MAX_RESULT_ROWS);
    return {
        grup_sayisi: out.length,
        ...(grand !== null ? { genel_toplam: { [first.name]: grand } } : {}),
        satirlar: out.slice(0, limit),
        ...(out.length > limit ? { not: `İlk ${limit} grup gösterildi (${out.length} grup var); kalanlar sıralamanın altında.` } : {}),
    };
};

/** Pivot: satır × sütun çapraz tablosu (ör. kişi × ay toplam saat) */
export const pivot = (t: DataTable, rows: Cell[][], rowCol: string, colCol: string, m: Measure) => {
    const ri = columnIndex(t, rowCol), ci = columnIndex(t, colCol);
    const vi = m.sutun ? columnIndex(t, m.sutun) : -1;
    if (m.fonk !== 'say' && vi < 0) throw new AnalysisError(`${m.fonk} için deger_sutun gerekli.`);
    const label = (c: Cell) => (isEmpty(c) ? '(boş)' : String(c));
    const colKeys = [...new Set(rows.map(r => label(r[ci])))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
    if (colKeys.length > 24) throw new AnalysisError(`"${t.columns[ci]}" ${colKeys.length} farklı değer içeriyor; pivot sütunu için en çok 24 olmalı (tersini deneyin ya da süzün).`);
    const cells = new Map<string, Map<string, Cell[]>>();
    for (const r of rows) {
        const rk = label(r[ri]), ck = label(r[ci]);
        if (!cells.has(rk)) cells.set(rk, new Map());
        const row = cells.get(rk)!;
        if (!row.has(ck)) row.set(ck, []);
        row.get(ck)!.push(vi < 0 ? 1 : r[vi]);
    }
    const out = [...cells.entries()].map(([rk, row]) => {
        const o: Record<string, Cell> = { [t.columns[ri]]: rk };
        const all: Cell[] = [];
        colKeys.forEach(ck => { const vs = row.get(ck) || []; all.push(...vs); o[ck] = vs.length ? aggregate(vs, m.fonk) : null; });
        o['Toplam'] = aggregate(all, m.fonk);
        return o;
    }).sort((a, b) => ((b['Toplam'] as number) || 0) - ((a['Toplam'] as number) || 0));
    return { satir_sayisi: out.length, sutunlar: colKeys, satirlar: out.slice(0, MAX_RESULT_ROWS), ...(out.length > MAX_RESULT_ROWS ? { not: `İlk ${MAX_RESULT_ROWS} satır gösterildi.` } : {}) };
};

/** Sayısal bir sütunun dağılımı: yüzdelikler ve eşit aralıklı histogram */
export const distribution = (t: DataTable, rows: Cell[][], col: string, bins = 8) => {
    const i = columnIndex(t, col);
    const xs = rows.map(r => numOf(r[i])).filter((x): x is number => x !== null);
    if (!xs.length) throw new AnalysisError(`"${t.columns[i]}" sütununda sayı yok.`);
    const min = Math.min(...xs), max = Math.max(...xs);
    const n = Math.max(1, Math.min(20, bins));
    const w = (max - min) / n || 1;
    const hist = Array.from({ length: n }, (_, k) => ({ aralik: `${round(min + k * w)} – ${round(min + (k + 1) * w)}`, adet: 0 }));
    xs.forEach(x => { hist[Math.min(n - 1, Math.floor((x - min) / w))].adet++; });
    const p = (q: number) => round(percentile(xs, q));
    const m = mean(xs), md = percentile(xs, 50);
    return {
        sutun: t.columns[i], adet: xs.length, ortalama: round(m), ortanca: round(md), std: round(std(xs)), min, max,
        yuzdelikler: { p10: p(10), p25: p(25), p50: p(50), p75: p(75), p90: p(90), p95: p(95) },
        carpiklik: Math.abs(m - md) < (std(xs) || 1) * 0.1 ? 'simetrik' : m > md ? 'sağa çarpık (birkaç büyük değer ortalamayı yukarı çekiyor; ortanca daha temsilî)' : 'sola çarpık',
        histogram: hist,
    };
};

/** Aykırı değerler (Tukey çitleri: Q1 − 1,5·IQR, Q3 + 1,5·IQR) */
export const outliers = (t: DataTable, rows: Cell[][], col: string, show: string[] = []) => {
    const i = columnIndex(t, col);
    const si = (show.length ? show : t.columns.slice(0, 3)).map(c => columnIndex(t, c)).filter(k => k !== i);
    const xs = rows.map(r => numOf(r[i])).filter((x): x is number => x !== null);
    if (xs.length < 4) throw new AnalysisError('Aykırı değer için en az 4 sayısal değer gerekir.');
    const q1 = percentile(xs, 25), q3 = percentile(xs, 75), iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
    const md = percentile(xs, 50);
    const hits = rows.filter(r => { const x = numOf(r[i]); return x !== null && (x < lo || x > hi); })
        .map(r => {
            const x = numOf(r[i])!;
            const o: Record<string, Cell> = {};
            si.forEach(k => { o[t.columns[k]] = r[k]; });
            o[t.columns[i]] = x;
            o['yön'] = x > hi ? 'yüksek' : 'düşük';
            o['ortancanın katı'] = md ? round(x / md, 1) : null;
            return o;
        })
        .sort((a, b) => Math.abs((b[t.columns[i]] as number) - md) - Math.abs((a[t.columns[i]] as number) - md));
    return {
        sutun: t.columns[i], alt_sinir: round(lo), ust_sinir: round(hi), ortanca: round(md),
        aykiri_sayisi: hits.length, oran_yuzde: round((hits.length / xs.length) * 100, 1),
        satirlar: hits.slice(0, 30),
    };
};

export type Period = 'gun' | 'hafta' | 'ay' | 'ceyrek' | 'yil';
export const PERIODS: Period[] = ['gun', 'hafta', 'ay', 'ceyrek', 'yil'];

const periodKey = (d: Date, p: Period): string => {
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    switch (p) {
        case 'gun': return d.toISOString().slice(0, 10);
        case 'ay': return `${y}-${String(m).padStart(2, '0')}`;
        case 'ceyrek': return `${y}-Ç${Math.ceil(m / 3)}`;
        case 'yil': return String(y);
        case 'hafta': {
            // ISO hafta
            const t = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
            const day = t.getUTCDay() || 7;
            t.setUTCDate(t.getUTCDate() + 4 - day);
            const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
            const w = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
            return `${t.getUTCFullYear()}-H${String(w).padStart(2, '0')}`;
        }
    }
};

/** Zaman serisi: dönem başına ölçü, dönemden döneme değişim, eğilim yönü ve hızı */
export const trend = (t: DataTable, rows: Cell[][], dateCol: string, m: Measure, period: Period = 'ay') => {
    const di = columnIndex(t, dateCol);
    const vi = m.sutun ? columnIndex(t, m.sutun) : -1;
    if (m.fonk !== 'say' && vi < 0) throw new AnalysisError(`${m.fonk} için deger_sutun gerekli.`);
    if (!PERIODS.includes(period)) throw new AnalysisError(`periyot ${PERIODS.join(', ')} olmalı.`);
    const buckets = new Map<string, Cell[]>();
    let skipped = 0;
    for (const r of rows) {
        const d = dateOf(r[di]);
        if (!d) { skipped++; continue; }
        const k = periodKey(d, period);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k)!.push(vi < 0 ? 1 : r[vi]);
    }
    if (!buckets.size) throw new AnalysisError(`"${t.columns[di]}" sütununda tarih bulunamadı (YYYY-AA-GG ya da GG.AA.YYYY beklenir).`);
    const name = measureName(m);
    const series = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, vs]) => ({ donem: k, [name]: aggregate(vs, m.fonk) as number | null }));
    series.forEach((s, k) => {
        const prev = k ? series[k - 1][name] as number | null : null;
        const cur = s[name] as number | null;
        (s as Record<string, unknown>)['değişim %'] = prev && cur !== null ? round(((cur - prev) / Math.abs(prev)) * 100, 1) : null;
    });
    // En küçük kareler eğimi (dönem başına), ortalamaya oranla
    const ys = series.map(s => (s[name] as number) ?? 0);
    const n = ys.length;
    let slope = 0;
    if (n >= 2) {
        const xm = (n - 1) / 2, ym = mean(ys);
        const num = ys.reduce((a, y, x) => a + (x - xm) * (y - ym), 0);
        const den = ys.reduce((a, _y, x) => a + (x - xm) ** 2, 0);
        slope = den ? num / den : 0;
    }
    const avg = mean(ys) || 1;
    const rel = round((slope / Math.abs(avg)) * 100, 1);
    const first = ys[0], last = ys[n - 1];
    const peak = series.reduce((a, s) => (((s[name] as number) ?? -Infinity) > ((a[name] as number) ?? -Infinity) ? s : a), series[0]);
    return {
        olcu: name, periyot: period, donem_sayisi: n,
        egilim: n < 3 ? 'yetersiz veri (en az 3 dönem gerekir)' : Math.abs(rel) < 2 ? 'yatay' : rel > 0 ? 'artış' : 'azalış',
        donem_basina_degisim_yuzde: rel,
        ilk_son_degisim_yuzde: first ? round(((last - first) / Math.abs(first)) * 100, 1) : null,
        zirve: { donem: peak.donem, deger: peak[name] },
        ...(skipped ? { tarihsiz_satir: skipped } : {}),
        satirlar: series.slice(-MAX_RESULT_ROWS),
    };
};

/** İki sayısal sütun arasındaki Pearson korelasyonu */
export const correlation = (t: DataTable, rows: Cell[][], a: string, b: string) => {
    const ai = columnIndex(t, a), bi = columnIndex(t, b);
    const pairs = rows.map(r => [numOf(r[ai]), numOf(r[bi])]).filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
    if (pairs.length < 3) throw new AnalysisError('Korelasyon için en az 3 eşleşen sayı çifti gerekir.');
    const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]);
    const mx = mean(xs), my = mean(ys);
    const num = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
    const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
    const r = den ? round(num / den, 3) : 0;
    const abs = Math.abs(r);
    return {
        sutunlar: [t.columns[ai], t.columns[bi]], cift_sayisi: pairs.length, r,
        yorum: `${abs >= 0.7 ? 'güçlü' : abs >= 0.4 ? 'orta' : abs >= 0.2 ? 'zayıf' : 'anlamlı ilişki yok'}${abs >= 0.2 ? (r > 0 ? ' pozitif' : ' negatif') : ''} (korelasyon nedensellik değildir)`,
    };
};

/** Satırları süz, sırala, ilk N'i ver (ör. "en pahalı 10 kalem") */
export const topRows = (t: DataTable, rows: Cell[][], o: { sirala?: string; artan?: boolean; limit?: number; sutunlar?: string[] } = {}) => {
    let rs = rows;
    if (o.sirala) {
        const i = columnIndex(t, o.sirala);
        rs = [...rows].sort((x, y) => {
            const a = numOf(x[i]), b = numOf(y[i]);
            const d = a !== null && b !== null ? a - b : String(x[i] ?? '').localeCompare(String(y[i] ?? ''), 'tr');
            return o.artan ? d : -d;
        });
    }
    const idx = o.sutunlar?.length ? o.sutunlar.map(c => columnIndex(t, c)) : t.columns.map((_, i) => i);
    const limit = Math.min(o.limit || 20, MAX_RESULT_ROWS);
    return {
        eslesen: rows.length,
        satirlar: rs.slice(0, limit).map(r => Object.fromEntries(idx.map(i => [t.columns[i], r[i] ?? null]))),
    };
};

// ------------------------------------------------------------ tablo okuma

/**
 * Hücre dizisinden tablo: başlık satırı ilk 15 satırda en dolu, metin ağırlıklı
 * satır (Excel'lerdeki başlık/logo satırları atlanır); boş satırlar düşer,
 * adsız sütun "Sütun N", tekrar eden ad "Ad (2)" olur, tamamen boş sütun atılır.
 */
export const tableFromGrid = (name: string, grid: unknown[][]): DataTable | null => {
    const rows = grid.map(r => (Array.isArray(r) ? r : []).map(v => (v instanceof Date ? (Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)) : toCell(v))));
    const nonEmpty = (r: Cell[]) => r.filter(c => !isEmpty(c)).length;
    const head = rows.slice(0, 15);
    const maxFilled = Math.max(0, ...head.map(nonEmpty));
    if (maxFilled < 1) return null;
    const hi = head.findIndex(r => nonEmpty(r) >= Math.max(2, Math.ceil(maxFilled * 0.6)) && r.filter(c => !isEmpty(c)).every(c => typeof c === 'string'));
    const headerAt = hi < 0 ? 0 : hi;
    const width = Math.max(...rows.slice(headerAt).map(r => r.length));
    const body = rows.slice(headerAt + 1).filter(r => nonEmpty(r) > 0).slice(0, MAX_TABLE_ROWS);
    const used = new Map<string, number>();
    const columns = Array.from({ length: width }, (_, i) => {
        const raw = rows[headerAt][i];
        let c = !isEmpty(raw ?? null) && hi >= 0 ? String(raw).trim().slice(0, 80) : `Sütun ${i + 1}`;
        const n = (used.get(fold(c)) || 0) + 1;
        used.set(fold(c), n);
        if (n > 1) c = `${c} (${n})`;
        return c;
    });
    const data = hi < 0 ? [rows[0], ...body] : body;
    const keep = columns.map((_, i) => data.some(r => !isEmpty(r[i] ?? null)));
    const t: DataTable = {
        name,
        columns: columns.filter((_, i) => keep[i]),
        rows: data.map(r => columns.map((_, i) => r[i] ?? null).filter((_, i) => keep[i])),
    };
    return t.columns.length && t.rows.length ? t : null;
};

/** Modele gösterilen kısa tablo tanımı */
export const describeTable = (t: DataTable): string =>
    `"${t.name}" — ${t.rows.length.toLocaleString('tr-TR')} satır; sütunlar: ${t.columns.slice(0, 30).join(', ')}${t.columns.length > 30 ? ` … (+${t.columns.length - 30})` : ''}`;
