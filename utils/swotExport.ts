import { SwotItem } from '../types';
import { itemsForQuadrant, SWOT_KIND_LABELS, SWOT_LABELS, SWOT_ORDER } from './swot';
import { wrapText } from './pestelExport';

/**
 * SWOT görsel dışa aktarım — 2×2 renkli stratejik pano (S W / O T) SVG olarak
 * üretilir; tarayıcıda PNG'ye çevrilip indirilebilir. Bağımlılıksız
 * (SVG string + canvas). buildSwotSvg saf/test edilebilir.
 */

const QUAD_W = 340;
const GAP = 16;
const MARGIN_X = 26;
const TITLE_H = 74;
const HEADER_H = 46;
const BODY_PAD = 16;
const LINE_H = 15;
const ITEM_GAP = 10;
const MIN_QUAD_BODY = 96;
const FOOT_H = 34;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Üst köşeleri yuvarlatılmış (alt köşeler düz) dikdörtgen path — başlık şeridi için */
const topRoundRect = (x: number, y: number, w: number, h: number, r: number): string =>
    `M${x} ${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} H${x} Z`;

interface QuadModel {
    q: typeof SWOT_ORDER[number];
    meta: typeof SWOT_LABELS[keyof typeof SWOT_LABELS];
    rows: { it: SwotItem; lines: string[] }[];
    bodyH: number;
}

export interface SwotSvgResult { svg: string; width: number; height: number; }

export const buildSwotSvg = (projectName: string, items: SwotItem[]): SwotSvgResult => {
    const models: Record<string, QuadModel> = {};
    SWOT_ORDER.forEach(q => {
        const rows = itemsForQuadrant(items, q).map(it => ({ it, lines: wrapText(it.text, 42) }));
        const bodyH = Math.max(MIN_QUAD_BODY, rows.reduce((h, r) => h + r.lines.length * LINE_H + ITEM_GAP, BODY_PAD) + BODY_PAD);
        models[q] = { q, meta: SWOT_LABELS[q], rows, bodyH };
    });

    const quadH = (q: string): number => HEADER_H + models[q].bodyH;
    const row0H = Math.max(quadH('strength'), quadH('weakness'));
    const row1H = Math.max(quadH('opportunity'), quadH('threat'));
    const width = MARGIN_X * 2 + QUAD_W * 2 + GAP;
    const height = TITLE_H + row0H + GAP + row1H + FOOT_H;

    const grid = [
        { q: 'strength', col: 0, row: 0 },
        { q: 'weakness', col: 1, row: 0 },
        { q: 'opportunity', col: 0, row: 1 },
        { q: 'threat', col: 1, row: 1 },
    ] as const;

    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Arial, sans-serif">`);
    parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
    // Başlık
    parts.push(`<text x="${MARGIN_X}" y="38" font-size="26" font-weight="700" fill="#1f2937">SWOT ANALİZİ</text>`);
    parts.push(`<text x="${MARGIN_X}" y="58" font-size="12" fill="#9ca3af">Güçlü/Zayıf Yönler içsel · Fırsatlar/Tehditler dışsal</text>`);
    parts.push(`<text x="${width - MARGIN_X}" y="38" font-size="15" font-weight="600" fill="#9ca3af" text-anchor="end">${esc(projectName)}</text>`);

    grid.forEach(({ q, col, row }) => {
        const m = models[q];
        const { hex, short, label, kind } = m.meta;
        const x = MARGIN_X + col * (QUAD_W + GAP);
        const y = TITLE_H + (row === 0 ? 0 : row0H + GAP);
        const h = row === 0 ? row0H : row1H;

        // Gövde çerçevesi + başlık şeridi
        parts.push(`<rect x="${x}" y="${y}" width="${QUAD_W}" height="${h}" rx="16" fill="#ffffff" stroke="${hex}" stroke-width="1.5"/>`);
        parts.push(`<path d="${topRoundRect(x, y, QUAD_W, HEADER_H, 16)}" fill="${hex}"/>`);
        parts.push(`<text x="${x + 18}" y="${y + 32}" font-size="26" font-weight="800" fill="#ffffff">${short}</text>`);
        parts.push(`<text x="${x + 50}" y="${y + 24}" font-size="15" font-weight="700" fill="#ffffff">${esc(label)}</text>`);
        parts.push(`<text x="${x + 50}" y="${y + 39}" font-size="10" fill="#ffffff" opacity="0.85">${SWOT_KIND_LABELS[kind]} · ${m.meta.tone === 'pos' ? 'Olumlu' : 'Olumsuz'}</text>`);
        parts.push(`<text x="${x + QUAD_W - 14}" y="${y + 30}" font-size="14" font-weight="700" fill="#ffffff" text-anchor="end">${m.rows.length}</text>`);

        // Maddeler
        let iy = y + HEADER_H + BODY_PAD + 4;
        if (m.rows.length === 0) {
            parts.push(`<text x="${x + 16}" y="${iy + 6}" font-size="12" fill="#cbd5e1">—</text>`);
        }
        m.rows.forEach(({ lines }) => {
            parts.push(`<circle cx="${x + 12}" cy="${iy - 3}" r="3.5" fill="${hex}"/>`);
            lines.forEach((ln, li) => {
                parts.push(`<text x="${x + 22}" y="${iy + li * LINE_H}" font-size="12" fill="#374151">${esc(ln)}</text>`);
            });
            iy += lines.length * LINE_H + ITEM_GAP;
        });
    });

    // Alt bilgi
    const fy = height - 13;
    parts.push(`<text x="${MARGIN_X}" y="${fy}" font-size="11" fill="#9ca3af">S Güçlü · W Zayıf · O Fırsat · T Tehdit</text>`);
    parts.push(`<text x="${width - MARGIN_X}" y="${fy}" font-size="11" fill="#9ca3af" text-anchor="end">${new Date().toLocaleDateString('tr-TR')}</text>`);
    parts.push('</svg>');

    return { svg: parts.join(''), width, height };
};

// ---- Tarayıcı tarafı indirme yardımcıları ----

const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const safeName = (s: string): string => (s || 'proje').replace(/[^\wÀ-ſ-]+/g, '_').slice(0, 40);

export const exportSwotSvg = (projectName: string, items: SwotItem[]): void => {
    const { svg } = buildSwotSvg(projectName, items);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `swot-${safeName(projectName)}.svg`);
};

export const exportSwotPng = (projectName: string, items: SwotItem[], scale = 2): Promise<void> =>
    new Promise((resolve, reject) => {
        const { svg, width, height } = buildSwotSvg(projectName, items);
        const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = width * scale;
                canvas.height = height * scale;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas bağlamı yok');
                ctx.scale(scale, scale);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(svgUrl);
                canvas.toBlob(blob => {
                    if (!blob) { reject(new Error('PNG üretilemedi')); return; }
                    downloadBlob(blob, `swot-${safeName(projectName)}.png`);
                    resolve();
                }, 'image/png');
            } catch (e) {
                URL.revokeObjectURL(svgUrl);
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        };
        img.onerror = () => { URL.revokeObjectURL(svgUrl); reject(new Error('SVG görüntüye çevrilemedi')); };
        img.src = svgUrl;
    });
