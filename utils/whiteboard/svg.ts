/**
 * Asistanın çizdiği SVG illüstrasyonu (çiçek, bulut, ikon, karakter …) panoya
 * görsel olarak eklenir. Görsel <img> içinde gösterildiği için tarayıcı betik
 * çalıştırmaz ve dış kaynak yüklemez; yine de yalnız çizim etiketleri ve
 * öznitelikleri bırakılır (savunma katmanı), boyut sınırlanır.
 */

export const MAX_SVG = 60_000;

const TAGS = new Set([
    'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs',
    'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'use', 'title', 'desc', 'pattern', 'symbol',
]);
/** İçeriğiyle birlikte atılanlar */
const DROP_WITH_CONTENT = /<(script|style|foreignObject|iframe|object|embed|image|a|animate\w*|set)\b[\s\S]*?(<\/\1\s*>|\/>)/gi;

const cleanAttrs = (attrs: string): string => {
    const out: string[] = [];
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*')/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(attrs))) {
        const name = m[1];
        const value = m[2].slice(1, -1);
        const lower = name.toLowerCase();
        if (lower.startsWith('on')) continue;
        if (lower === 'style' && /url\(|expression|@import/i.test(value)) continue;
        if ((lower === 'href' || lower === 'xlink:href') && !value.startsWith('#')) continue;
        if (/javascript:|data:|url\((?!\s*#)/i.test(value)) continue;
        out.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
    }
    return out.length ? ` ${out.join(' ')}` : '';
};

/**
 * Temiz SVG metni; geçersizse null. Kök <svg>'de xmlns ve viewBox garanti
 * edilir (viewBox yoksa genişlik / yükseklikten ya da 0 0 w h'den).
 */
export const sanitizeSvg = (raw: string, w = 400, h = 300): string | null => {
    let s = (raw || '').trim();
    const start = s.search(/<svg[\s>]/i);
    const end = s.toLowerCase().lastIndexOf('</svg>');
    if (start < 0 || end < start) return null;
    s = s.slice(start, end + 6);
    if (s.length > MAX_SVG) return null;
    s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[\s\S]*?>/gi, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    s = s.replace(DROP_WITH_CONTENT, '');
    // Bilinmeyen etiketleri at, bilinenlerin özniteliklerini temizle
    s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g, (_all, close: string, tag: string, attrs: string, self: string) => {
        if (!TAGS.has(tag.toLowerCase())) return '';
        return close ? `</${tag}>` : `<${tag}${cleanAttrs(attrs)}${self ? ' /' : ''}>`;
    });
    if (!/^<svg\b/i.test(s)) return null;
    s = s.replace(/^<svg\b([^>]*)>/i, (_m, attrs: string) => {
        let a = attrs.replace(/\s*\/$/, '');
        if (!/\bxmlns=/.test(a)) a += ' xmlns="http://www.w3.org/2000/svg"';
        if (!/\bviewBox=/i.test(a)) {
            const ww = Number(/\bwidth="(\d+(?:\.\d+)?)"/.exec(a)?.[1]) || w;
            const hh = Number(/\bheight="(\d+(?:\.\d+)?)"/.exec(a)?.[1]) || h;
            a += ` viewBox="0 0 ${ww} ${hh}"`;
        }
        // Boyutu kutu belirler
        a = a.replace(/\s(width|height)="[^"]*"/g, '');
        return `<svg${a} width="100%" height="100%">`;
    });
    // Görünür bir şekil yoksa boş sayılır
    if (!/<(path|circle|ellipse|rect|line|polyline|polygon|text)\b/i.test(s)) return null;
    return s;
};

/** SVG metni → <img> için data URL */
export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
