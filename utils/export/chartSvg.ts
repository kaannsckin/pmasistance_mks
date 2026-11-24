import type { DocBlock } from './aiDocument';

/**
 * Rapor grafiği → SVG (PDF'e gömülür; PowerPoint yerel grafik kullanır).
 * Bağımlılıksız, saf: çubuk (gruplu), çizgi ve pasta. Renkler erişilebilir,
 * ayırt edilebilir sabit bir paletten; değer etiketleri çubukların üstünde.
 */

type Chart = Extract<DocBlock, { kind: 'chart' }>;

export const CHART_PALETTE = ['0F766E', '2563EB', 'D97706', '7C3AED', 'DB2777', '64748B'];

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n: number): string => {
    const a = Math.abs(n);
    if (a >= 1e6) return `${(n / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`;
    if (a >= 1e4) return `${(n / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} B`;
    return n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
};
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Eksen için "yuvarlak" üst sınır ve adım */
export const niceScale = (min: number, max: number, ticks = 5): { lo: number; hi: number; step: number } => {
    const lo0 = Math.min(0, min), hi0 = Math.max(0, max);
    const span = hi0 - lo0 || 1;
    const raw = span / ticks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
    return { lo: Math.floor(lo0 / step) * step, hi: Math.ceil(hi0 / step) * step, step };
};

export const chartSvg = (c: Chart, width = 520, height = 260): string => {
    const font = 'font-family="Roboto, Arial, sans-serif"';
    const parts: string[] = [];
    const legend = c.series.length > 1 || c.chart === 'pie';
    const legendH = legend ? 18 : 0;

    if (c.chart === 'pie') {
        const vals = c.series[0].values.map(v => Math.max(0, v ?? 0));
        const total = vals.reduce((a, b) => a + b, 0) || 1;
        const r = Math.min(height - 20, width / 2 - 20) / 2;
        const cx = r + 20, cy = height / 2;
        let a0 = -Math.PI / 2;
        vals.forEach((v, i) => {
            if (!v) return;
            const a1 = a0 + (v / total) * Math.PI * 2;
            const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
            const color = CHART_PALETTE[i % CHART_PALETTE.length];
            // Yay, kısa doğru parçalarıyla çizilir: PDF'in SVG dönüştürücüsü büyük yay bayrağını yanlış yorumluyor
            const steps = Math.max(2, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 96));
            const arc = Array.from({ length: steps + 1 }, (_, k) => p(a0 + ((a1 - a0) * k) / steps));
            parts.push(v === total
                ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#${color}"/>`
                : `<polygon points="${cx},${cy} ${arc.join(' ')}" fill="#${color}" stroke="#FFFFFF" stroke-width="1.5"/>`);
            a0 = a1;
        });
        const lx = cx + r + 30;
        c.labels.forEach((l, i) => {
            const y = 24 + i * 20;
            if (y > height - 8) return;
            const pct = Math.round(((vals[i] || 0) / total) * 100);
            parts.push(`<rect x="${lx}" y="${y - 9}" width="10" height="10" fill="#${CHART_PALETTE[i % CHART_PALETTE.length]}"/>`);
            parts.push(`<text x="${lx + 16}" y="${y}" font-size="10" ${font} fill="#1F2937">${esc(clip(l, 34))} — %${pct} (${fmt(vals[i] || 0)})</text>`);
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
    }

    const all = c.series.flatMap(s => s.values).filter((v): v is number => v !== null);
    const { lo, hi, step } = niceScale(Math.min(...all), Math.max(...all));
    const left = 48, right = 10, top = 14 + legendH, bottom = 44;
    const pw = width - left - right, ph = height - top - bottom;
    const y = (v: number) => top + ph - ((v - lo) / (hi - lo || 1)) * ph;

    for (let t = lo; t <= hi + step / 2; t += step) {
        parts.push(`<line x1="${left}" x2="${width - right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="${t === 0 ? '#9CA3AF' : '#E5E7EB'}" stroke-width="${t === 0 ? 1 : 0.6}"/>`);
        parts.push(`<text x="${left - 6}" y="${(y(t) + 3).toFixed(1)}" font-size="8" ${font} fill="#6B7280" text-anchor="end">${esc(fmt(t))}</text>`);
    }
    const n = c.labels.length;
    const band = pw / n;
    const every = Math.ceil(n / 14);
    c.labels.forEach((l, i) => {
        if (i % every) return;
        const x = left + band * (i + 0.5);
        parts.push(`<text x="${x.toFixed(1)}" y="${height - bottom + 14}" font-size="8" ${font} fill="#374151" text-anchor="middle">${esc(clip(l, Math.max(6, Math.floor(band * every / 5))))}</text>`);
    });

    if (c.chart === 'bar') {
        const k = c.series.length;
        const bw = Math.max(2, Math.min(36, (band * 0.75) / k));
        const showValues = n * k <= 16;
        c.series.forEach((s, si) => s.values.forEach((v, i) => {
            if (v === null) return;
            const x = left + band * i + (band - bw * k) / 2 + bw * si;
            const y0 = y(0), y1 = y(v);
            parts.push(`<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, Math.abs(y0 - y1)).toFixed(1)}" fill="#${CHART_PALETTE[si % CHART_PALETTE.length]}" rx="1.5"/>`);
            if (showValues) parts.push(`<text x="${(x + bw / 2).toFixed(1)}" y="${(Math.min(y0, y1) - 3).toFixed(1)}" font-size="7.5" ${font} fill="#374151" text-anchor="middle">${esc(fmt(v))}</text>`);
        }));
    } else {
        c.series.forEach((s, si) => {
            const color = CHART_PALETTE[si % CHART_PALETTE.length];
            const pts = s.values.map((v, i) => (v === null ? null : `${(left + band * (i + 0.5)).toFixed(1)},${y(v).toFixed(1)}`));
            // Boş değerde çizgi kesilir
            let seg: string[] = [];
            const flush = () => { if (seg.length > 1) parts.push(`<polyline points="${seg.join(' ')}" fill="none" stroke="#${color}" stroke-width="2"/>`); seg = []; };
            pts.forEach(p => { if (p) seg.push(p); else flush(); });
            flush();
            pts.forEach(p => { if (p) { const [px, py] = p.split(','); parts.push(`<circle cx="${px}" cy="${py}" r="2.2" fill="#${color}"/>`); } });
        });
    }

    if (legend) {
        let lx = left;
        c.series.forEach((s, i) => {
            parts.push(`<rect x="${lx}" y="4" width="10" height="10" fill="#${CHART_PALETTE[i % CHART_PALETTE.length]}"/>`);
            parts.push(`<text x="${lx + 14}" y="13" font-size="9" ${font} fill="#1F2937">${esc(clip(s.name, 28))}</text>`);
            lx += 24 + Math.min(28, s.name.length) * 5.2;
        });
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
};

/** Grafiği çizemeyen metin biçimleri için yatay çubuk (█) — Word'de tablo sütunu */
export const textBar = (v: number | null, max: number, width = 24): string =>
    v === null || max <= 0 ? '' : '█'.repeat(Math.max(v > 0 ? 1 : 0, Math.round((Math.max(0, v) / max) * width)));
