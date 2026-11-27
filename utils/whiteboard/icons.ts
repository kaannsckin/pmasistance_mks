import { foldTr } from '../rag/text';

/**
 * Pano ikonları: Lucide (ISC lisanslı, ~2000 çizgi ikonu). Veri yalnız
 * gerektiğinde (asistan ikon kullanınca ya da Öğeler › İkonlar açılınca) ayrı
 * bir parça olarak yüklenir. İkon, istenen renkte SVG görsel olarak panoya
 * eklenir; asistan ikonu adıyla (ör. "database", "server", "flower") seçer.
 */

export type IconNode = [string, Record<string, string>][];
export interface IconLib {
    nodes: Record<string, IconNode>;
    tags: Record<string, string[]>;
}

let loading: Promise<IconLib> | null = null;

export const loadIconLib = (): Promise<IconLib> => {
    loading ||= Promise.all([
        import('lucide-static/icon-nodes.json'),
        import('lucide-static/tags.json'),
    ]).then(([n, t]) => ({ nodes: (n as unknown as { default: IconLib['nodes'] }).default, tags: (t as unknown as { default: IconLib['tags'] }).default }))
        .catch(e => { loading = null; throw e; });
    return loading;
};

/** Türkçe sık adlar → Lucide adı (model ve kullanıcı Türkçe yazabilir) */
const TR_ALIAS: Record<string, string> = {
    'veri tabani': 'database', veritabani: 'database', sunucu: 'server', kullanici: 'user', kullanicilar: 'users', kisi: 'user', ekip: 'users',
    bulut: 'cloud', cicek: 'flower', agac: 'tree-pine', gunes: 'sun', yagmur: 'cloud-rain', ay: 'moon', yildiz: 'star', kalp: 'heart',
    bilgisayar: 'laptop', telefon: 'smartphone', ekran: 'monitor', dosya: 'file-text', klasor: 'folder', belge: 'file-text', posta: 'mail', eposta: 'mail',
    kilit: 'lock', anahtar: 'key', kalkan: 'shield', guvenlik: 'shield-check', ayarlar: 'settings', hata: 'bug', roket: 'rocket', hedef: 'target',
    takvim: 'calendar', saat: 'clock', grafik: 'chart-column', rapor: 'file-chart-column', para: 'banknote', fatura: 'receipt', sepet: 'shopping-cart',
    ev: 'house', bina: 'building', araba: 'car', ucak: 'plane', harita: 'map', konum: 'map-pin', arama: 'search', bildirim: 'bell', mesaj: 'message-square',
    onay: 'circle-check', red: 'circle-x', uyari: 'triangle-exclamation-point', bilgi: 'info', soru: 'circle-question-mark', fikir: 'lightbulb', kod: 'code', api: 'webhook',
    ag: 'network', internet: 'globe', yapay: 'bot', robot: 'bot', yz: 'bot', kuyruk: 'list-ordered', test: 'flask-conical', yayin: 'rocket', surum: 'tag',
};

const norm = (s: string) => foldTr(s || '').trim().replace(/^lucide[-_ ]?/, '').replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');

/** Adı Lucide ikonuna eşler: tam ad, kebab-case, Türkçe karşılık, etiket ya da ad içinde arama */
export const resolveIconName = (lib: IconLib, raw: string): string | null => {
    const n = norm(raw);
    if (!n) return null;
    if (lib.nodes[n]) return n;
    const kebab = norm(raw.replace(/([a-z0-9])([A-Z])/g, '$1-$2'));
    if (lib.nodes[kebab]) return kebab;
    const tr = TR_ALIAS[foldTr(raw).trim()] || TR_ALIAS[n.replace(/-/g, ' ')] || TR_ALIAS[n];
    if (tr && lib.nodes[tr]) return tr;
    const word = n.replace(/-/g, ' ');
    const byTag = Object.keys(lib.tags).find(k => lib.nodes[k] && lib.tags[k].some(t => t.toLowerCase() === word));
    if (byTag) return byTag;
    return Object.keys(lib.nodes).filter(k => k.includes(n)).sort((a, b) => a.length - b.length)[0] || null;
};

/** Arama (Öğeler paneli): ad ve etiketlerde, önce ad eşleşmeleri */
export const searchIcons = (lib: IconLib, q: string, limit = 60): string[] => {
    const w = norm(q);
    const names = Object.keys(lib.nodes);
    if (!w) return names.slice(0, limit);
    const tr = TR_ALIAS[foldTr(q).trim()];
    const byName = names.filter(k => k.includes(w));
    const byTag = names.filter(k => !k.includes(w) && (lib.tags[k] || []).some(t => t.toLowerCase().includes(w.replace(/-/g, ' '))));
    return [...new Set([...(tr && lib.nodes[tr] ? [tr] : []), ...byName.sort((a, b) => a.length - b.length), ...byTag])].slice(0, limit);
};

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** İkonun SVG metni (24×24, çizgi rengi verilen renk) */
export const iconSvg = (lib: IconLib, name: string, color = '#334155', strokeWidth = 2): string | null => {
    const node = lib.nodes[name];
    if (!node) return null;
    const c = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#334155';
    const body = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ')}/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${c}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
};
