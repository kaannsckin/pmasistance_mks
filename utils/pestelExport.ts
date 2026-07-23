import { PestelItem } from '../types';
import { itemsForCategory, PESTEL_LABELS, PESTEL_ORDER } from './pestel';

/**
 * PESTEL görsel dışa aktarım — 6 renkli sütunlu pano (P E S T E L) SVG olarak
 * üretilir; tarayıcıda PNG'ye çevrilip indirilebilir. Bağımlılıksız
 * (SVG string + canvas). buildPestelSvg saf/test edilebilir.
 */

const COL_W = 210;
const GAP = 14;
const MARGIN_X = 24;
const TITLE_H = 64;
const HEADER_H = 104;
const BODY_TOP_PAD = 16;
const LINE_H = 15;
const ITEM_GAP = 9;
const FOOT_H = 34;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Basit kelime-kaydırma (yaklaşık karakter genişliğine göre) */
export const wrapText = (text: string, maxChars = 30): string[] => {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > maxChars && cur) { lines.push(cur); cur = w; }
        else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
};

export interface PestelSvgResult { svg: string; width: number; height: number; }

export const buildPestelSvg = (projectName: string, items: PestelItem[]): PestelSvgResult => {
    const columns = PESTEL_ORDER.map(cat => ({
        cat,
        meta: PESTEL_LABELS[cat],
        rows: itemsForCategory(items, cat).map(it => ({ it, lines: wrapText(it.text, 30) })),
    }));

    const width = MARGIN_X * 2 + COL_W * 6 + GAP * 5;
    const bodyTop = TITLE_H + HEADER_H + BODY_TOP_PAD;
    const colBodyHeight = (col: typeof columns[number]): number =>
        col.rows.reduce((h, r) => h + r.lines.length * LINE_H + ITEM_GAP + 6, 0);
    const maxBody = Math.max(120, ...columns.map(colBodyHeight));
    const height = bodyTop + maxBody + FOOT_H;

    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Arial, sans-serif">`);
    parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
    // Başlık
    parts.push(`<text x="${MARGIN_X}" y="40" font-size="26" font-weight="700" fill="#1f2937">PESTEL ANALİZİ</text>`);
    parts.push(`<text x="${width - MARGIN_X}" y="40" font-size="15" font-weight="600" fill="#9ca3af" text-anchor="end">${esc(projectName)}</text>`);

    columns.forEach((col, i) => {
        const x = MARGIN_X + i * (COL_W + GAP);
        const { hex, letter, label } = col.meta;
        // Başlık bloğu
        parts.push(`<rect x="${x}" y="${TITLE_H}" width="${COL_W}" height="${HEADER_H}" rx="14" fill="${hex}"/>`);
        parts.push(`<text x="${x + COL_W / 2}" y="${TITLE_H + 58}" font-size="46" font-weight="800" fill="#ffffff" text-anchor="middle">${letter}</text>`);
        parts.push(`<text x="${x + COL_W / 2}" y="${TITLE_H + 86}" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(label)}</text>`);

        // Maddeler
        let y = bodyTop + 6;
        if (col.rows.length === 0) {
            parts.push(`<text x="${x + 6}" y="${y + 8}" font-size="12" fill="#cbd5e1">—</text>`);
        }
        col.rows.forEach(({ it, lines }) => {
            const dot = it.kind === 'opportunity' ? '#10b981' : '#ef4444';
            parts.push(`<circle cx="${x + 6}" cy="${y - 3}" r="3.5" fill="${dot}"/>`);
            lines.forEach((ln, li) => {
                parts.push(`<text x="${x + 16}" y="${y + li * LINE_H}" font-size="12" fill="#374151">${esc(ln)}</text>`);
            });
            y += lines.length * LINE_H + ITEM_GAP + 6;
        });
    });

    // Alt bilgi / lejant
    const fy = height - 14;
    parts.push(`<circle cx="${MARGIN_X + 4}" cy="${fy - 4}" r="3.5" fill="#10b981"/>`);
    parts.push(`<text x="${MARGIN_X + 14}" y="${fy}" font-size="11" fill="#6b7280">Fırsat</text>`);
    parts.push(`<circle cx="${MARGIN_X + 70}" cy="${fy - 4}" r="3.5" fill="#ef4444"/>`);
    parts.push(`<text x="${MARGIN_X + 80}" y="${fy}" font-size="11" fill="#6b7280">Tehdit</text>`);
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

export const exportPestelSvg = (projectName: string, items: PestelItem[]): void => {
    const { svg } = buildPestelSvg(projectName, items);
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `pestel-${safeName(projectName)}.svg`);
};

export const exportPestelPng = (projectName: string, items: PestelItem[], scale = 2): Promise<void> =>
    new Promise((resolve, reject) => {
        const { svg, width, height } = buildPestelSvg(projectName, items);
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
                    downloadBlob(blob, `pestel-${safeName(projectName)}.png`);
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
