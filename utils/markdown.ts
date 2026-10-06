/**
 * Güvenli, küçük markdown ayrıştırıcı — AI yanıtlarını HTML enjekte ETMEDEN
 * React öğelerine çevirmek için ağaç üretir (components/Markdown.tsx render eder).
 * Ham HTML hiçbir zaman yorumlanmaz; bağlantılar yalnızca http(s)/mailto olabilir.
 * Akış sırasında yarım gelen metni de (kapanmamış kod bloğu vb.) tolere eder.
 *
 * Desteklenen: başlık, paragraf, madde/numaralı liste (girintili), kod bloğu,
 * alıntı, yatay çizgi, GFM tablo; satır içi: **kalın**, *italik*, `kod`,
 * ~~üstü çizili~~, [bağlantı](https://…).
 */

export type MdInline =
    | { t: 'text'; v: string }
    | { t: 'strong'; c: MdInline[] }
    | { t: 'em'; c: MdInline[] }
    | { t: 'del'; c: MdInline[] }
    | { t: 'code'; v: string }
    | { t: 'link'; href: string; c: MdInline[] }
    | { t: 'br' };

export interface MdListItem {
    depth: number;
    c: MdInline[];
}

export type MdBlock =
    | { t: 'heading'; level: number; c: MdInline[] }
    | { t: 'paragraph'; c: MdInline[] }
    | { t: 'list'; ordered: boolean; start: number; items: MdListItem[] }
    | { t: 'code'; lang: string; v: string }
    | { t: 'quote'; c: MdBlock[] }
    | { t: 'hr' }
    | { t: 'table'; align: ('left' | 'center' | 'right' | null)[]; head: MdInline[][]; rows: MdInline[][][] };

export const isSafeHref = (href: string): boolean => /^(https?:\/\/|mailto:)/i.test(href.trim());

// ---------------------------------------------------------------------------
// Satır içi
// ---------------------------------------------------------------------------

// URL içinde tek seviye parantez olabilir; y bayrağı: yalnızca i konumunda eşleşir
const LINK = /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/y;

const pushText = (out: MdInline[], v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === 'text') last.v += v;
    else out.push({ t: 'text', v });
};

export const parseInline = (src: string, depth = 0): MdInline[] => {
    const out: MdInline[] = [];
    if (depth > 6) {
        pushText(out, src);
        return out;
    }
    let i = 0;
    while (i < src.length) {
        const ch = src[i];

        if (ch === '\\' && i + 1 < src.length && /[\\`*_~[\]()#>-]/.test(src[i + 1])) {
            pushText(out, src[i + 1]);
            i += 2;
            continue;
        }
        if (ch === '\n') {
            out.push({ t: 'br' });
            i++;
            continue;
        }
        if (ch === '`') {
            const end = src.indexOf('`', i + 1);
            if (end > i + 1) {
                out.push({ t: 'code', v: src.slice(i + 1, end) });
                i = end + 1;
                continue;
            }
        }
        if (src.startsWith('**', i) || src.startsWith('__', i)) {
            const mark = src.slice(i, i + 2);
            const end = src.indexOf(mark, i + 2);
            if (end > i + 2) {
                out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end), depth + 1) });
                i = end + 2;
                continue;
            }
        }
        if (src.startsWith('~~', i)) {
            const end = src.indexOf('~~', i + 2);
            if (end > i + 2) {
                out.push({ t: 'del', c: parseInline(src.slice(i + 2, end), depth + 1) });
                i = end + 2;
                continue;
            }
        }
        if (ch === '*' && src[i + 1] && src[i + 1] !== ' ' && src[i + 1] !== '*') {
            const end = src.indexOf('*', i + 1);
            if (end > i + 1 && src[end - 1] !== ' ') {
                out.push({ t: 'em', c: parseInline(src.slice(i + 1, end), depth + 1) });
                i = end + 1;
                continue;
            }
        }
        if (ch === '[') {
            LINK.lastIndex = i;
            const m = LINK.exec(src);
            if (m) {
                if (isSafeHref(m[2])) out.push({ t: 'link', href: m[2].trim(), c: parseInline(m[1], depth + 1) });
                else pushText(out, m[1]); // güvensiz şema (javascript: vb.) → yalnızca metin
                i += m[0].length;
                continue;
            }
        }
        pushText(out, ch);
        i++;
    }
    return out;
};

// ---------------------------------------------------------------------------
// Bloklar
// ---------------------------------------------------------------------------

const FENCE = /^\s{0,3}(```|~~~)\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const splitRow = (line: string): string[] => {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
};

const isBlockStart = (line: string): boolean =>
    FENCE.test(line) || HEADING.test(line) || HR.test(line) || LIST_ITEM.test(line) || QUOTE.test(line);

export const parseMarkdown = (src: string): MdBlock[] => {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const blocks: MdBlock[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
            continue;
        }

        const fence = FENCE.exec(line);
        if (fence) {
            const body: string[] = [];
            i++;
            while (i < lines.length && !new RegExp(`^\\s{0,3}${fence[1]}\\s*$`).test(lines[i])) body.push(lines[i++]);
            i++; // kapanış (yoksa akış devam ediyordur — sorun değil)
            blocks.push({ t: 'code', lang: fence[2] || '', v: body.join('\n') });
            continue;
        }

        const heading = HEADING.exec(line);
        if (heading) {
            blocks.push({ t: 'heading', level: heading[1].length, c: parseInline(heading[2]) });
            i++;
            continue;
        }

        if (HR.test(line)) {
            blocks.push({ t: 'hr' });
            i++;
            continue;
        }

        if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
            const head = splitRow(line);
            const align = splitRow(lines[i + 1]).map(c =>
                c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null
            );
            i += 2;
            const rows: MdInline[][][] = [];
            while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
                const cells = splitRow(lines[i]);
                rows.push(head.map((_, ci) => parseInline(cells[ci] || '')));
                i++;
            }
            blocks.push({ t: 'table', align, head: head.map(h => parseInline(h)), rows });
            continue;
        }

        if (QUOTE.test(line)) {
            const inner: string[] = [];
            while (i < lines.length && QUOTE.test(lines[i])) inner.push(QUOTE.exec(lines[i++])![1]);
            blocks.push({ t: 'quote', c: parseMarkdown(inner.join('\n')) });
            continue;
        }

        const first = LIST_ITEM.exec(line);
        if (first) {
            const ordered = /\d/.test(first[2]);
            const baseIndent = first[1].length;
            const items: MdListItem[] = [];
            while (i < lines.length) {
                const m = LIST_ITEM.exec(lines[i]);
                if (m) {
                    if (m[1].length <= baseIndent && /\d/.test(m[2]) !== ordered) break;
                    items.push({ depth: Math.min(4, Math.floor(Math.max(0, m[1].length - baseIndent) / 2)), c: parseInline(m[3]) });
                    i++;
                } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length > 0) {
                    // girintili devam satırı → önceki maddeye eklenir
                    const last = items[items.length - 1];
                    last.c = [...last.c, { t: 'br' }, ...parseInline(lines[i].trim())];
                    i++;
                } else {
                    break;
                }
            }
            blocks.push({ t: 'list', ordered, start: ordered ? parseInt(first[2], 10) || 1 : 1, items });
            continue;
        }

        const para: string[] = [];
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) &&
            !(lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))) {
            para.push(lines[i].trim());
            i++;
        }
        if (para.length === 0) {
            // isBlockStart eşleşti ama yukarıdaki dallar yakalayamadı — sonsuz döngüyü önle
            para.push(lines[i].trim());
            i++;
        }
        blocks.push({ t: 'paragraph', c: parseInline(para.join('\n')) });
    }
    return blocks;
};
