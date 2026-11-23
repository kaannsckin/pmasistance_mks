/**
 * Asistanın ürettiği dosya: biçimden bağımsız belge modeli (başlık, paragraf,
 * liste, tablo). Asistan bunu dosya_olustur aracıyla kurar; sohbetteki kart
 * istenen biçime (Excel, CSV, Word, PDF, PowerPoint) tarayıcıda dönüştürür.
 * Dosya hiçbir yere yüklenmez.
 */

export type DocFormat = 'xlsx' | 'csv' | 'docx' | 'pdf' | 'pptx';

export const DOC_FORMATS: DocFormat[] = ['xlsx', 'csv', 'docx', 'pdf', 'pptx'];

export const DOC_FORMAT_LABELS: Record<DocFormat, string> = {
    xlsx: 'Excel', csv: 'CSV', docx: 'Word', pdf: 'PDF', pptx: 'PowerPoint',
};

export type Cell = string | number | null;

export type DocBlock =
    | { kind: 'heading'; text: string; level: 1 | 2 }
    | { kind: 'paragraph'; text: string }
    | { kind: 'list'; items: string[] }
    | { kind: 'table'; title?: string; columns: string[]; rows: Cell[][]; note?: string };

export interface AiDocument {
    id: string;
    title: string;
    subtitle?: string;
    format: DocFormat;
    blocks: DocBlock[];
    createdAt: string;
}

export const DOC_LIMITS = {
    blocks: 200,
    columns: 40,
    rows: 5000,
    cells: 60_000,
    text: 4000,
};

export class DocError extends Error {}

/** Markdown vurgularını sadeleştirir (**kalın**, __, `kod`) — dosyada düz metin */
export const plainText = (s: unknown, max = DOC_LIMITS.text): string =>
    (typeof s === 'string' ? s : s === null || s === undefined ? '' : String(s))
        .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1')
        .replace(/\r\n?/g, '\n').trim().slice(0, max);

const NUMERIC = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$|^-?\d+\.\d+$/;

/**
 * Hücre değeri: sayı olarak gelenler sayı kalır; "1.234,5" / "1234.5" gibi
 * sayısal metinler sayıya çevrilir (Excel'de hesaplanabilsin). Baştaki sıfırlı
 * kodlar (0012), yüzde, para birimi ve tarih metin kalır.
 */
export const toCell = (v: unknown): Cell => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
    if (typeof v === 'object') return plainText(Array.isArray(v) ? v.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : JSON.stringify(v), 1000);
    const s = plainText(v, 1000);
    if (!s) return null;
    if (NUMERIC.test(s) && !/^-?0\d/.test(s)) {
        const n = /,/.test(s) || /^\-?\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
        if (Number.isFinite(n)) return n;
    }
    return s;
};

/** Ekranda / metin biçimlerinde hücre (Türkçe sayı biçimi) */
export const cellText = (c: Cell): string =>
    c === null ? '' : typeof c === 'number' ? c.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : c;

const ASCII: Record<string, string> = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U', â: 'a', Â: 'A', î: 'i', û: 'u' };

/**
 * Dosya adı: başlıktan, yasak karakterler atılır. Türkçe harfler sadeleşir
 * (ç→c): bazı tarayıcı/işletim sistemi bileşimleri ASCII olmayan indirme adını
 * reddedip "download" adı veriyor. Dosyanın içeriği Türkçe kalır.
 */
export const fileNameFor = (doc: Pick<AiDocument, 'title' | 'createdAt'>, format: DocFormat): string => {
    const base = doc.title.replace(/[çÇğĞıİöÖşŞüÜâÂîû]/g, ch => ASCII[ch]).normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
        .replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'PlanAsistan';
    return `${base} - ${doc.createdAt.slice(0, 10)}.${format}`;
};

/** Belgeyi doğrular ve sınırlar; boş tablolar ve boş bloklar düşer */
export const normalizeDocument = (doc: Omit<AiDocument, 'id' | 'createdAt'> & Partial<Pick<AiDocument, 'id' | 'createdAt'>>): AiDocument => {
    const title = plainText(doc.title, 150);
    if (!title) throw new DocError('Dosyanın başlığı boş olamaz.');
    const blocks: DocBlock[] = [];
    let cells = 0;
    for (const b of doc.blocks) {
        if (blocks.length >= DOC_LIMITS.blocks) throw new DocError(`Dosyada en çok ${DOC_LIMITS.blocks} bölüm olabilir.`);
        if (b.kind === 'heading' || b.kind === 'paragraph') {
            const text = plainText(b.text);
            if (text) blocks.push(b.kind === 'heading' ? { kind: 'heading', text: text.slice(0, 200), level: b.level === 2 ? 2 : 1 } : { kind: 'paragraph', text });
        } else if (b.kind === 'list') {
            const items = b.items.map(i => plainText(i, 1000)).filter(Boolean).slice(0, 500);
            if (items.length) blocks.push({ kind: 'list', items });
        } else {
            const columns = b.columns.map(c => plainText(c, 120)).slice(0, DOC_LIMITS.columns);
            if (!columns.length) throw new DocError(`"${b.title || 'Tablo'}" tablosunun sütunları yok.`);
            if (b.rows.length > DOC_LIMITS.rows) throw new DocError(`Bir tabloda en çok ${DOC_LIMITS.rows} satır olabilir.`);
            const rows = b.rows.map(r => columns.map((_, i) => toCell(r[i])));
            cells += rows.length * columns.length;
            if (cells > DOC_LIMITS.cells) throw new DocError('Dosya çok büyük; tabloları daraltın (daha kısa dönem, daha az sütun).');
            blocks.push({ kind: 'table', ...(b.title ? { title: plainText(b.title, 120) } : {}), columns, rows, ...(b.note ? { note: plainText(b.note, 500) } : {}) });
        }
    }
    if (!blocks.length) throw new DocError('Dosyanın içeriği boş.');
    return {
        id: doc.id || `dosya-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        ...(plainText(doc.subtitle, 300) ? { subtitle: plainText(doc.subtitle, 300) } : {}),
        format: DOC_FORMATS.includes(doc.format) ? doc.format : 'xlsx',
        blocks,
        createdAt: doc.createdAt || new Date().toISOString(),
    };
};

export const documentStats = (doc: AiDocument): { tables: number; rows: number } => {
    const tables = doc.blocks.filter((b): b is Extract<DocBlock, { kind: 'table' }> => b.kind === 'table');
    return { tables: tables.length, rows: tables.reduce((s, t) => s + t.rows.length, 0) };
};

/** Araç sonucu anahtarlarındaki ASCII sözcüklerin Türkçesi (sütun başlığı için) */
const TR_WORDS: Record<string, string> = {
    kisi: 'kişi', kisiler: 'kişiler', bolum: 'bölüm', bolumler: 'bölümler', unvan: 'ünvan', unvanlar: 'ünvanlar', gorev: 'görev', gorevler: 'görevler',
    oncelik: 'öncelik', baslik: 'başlık', aciklama: 'açıklama', sure: 'süre', gun: 'gün', olasilik: 'olasılık', eposta: 'e-posta', aylik: 'aylık',
    kisaltma: 'kısaltma', bitis: 'bitiş', baslangic: 'başlangıç', ozet: 'özet', ozeti: 'özeti', sayisi: 'sayısı', yil: 'yıl', is: 'iş', gerceklesen: 'gerçekleşen',
    geciken: 'geciken', surum: 'sürüm', saglik: 'sağlık', dagilimi: 'dağılımı', yuzde: 'yüzde', yoneticisi: 'yöneticisi', onem: 'önem', olusturma: 'oluşturma',
    kayit: 'kayıt', kayitlar: 'kayıtlar', gerekce: 'gerekçe', deger: 'değer', bos: 'boş', bilesen: 'bileşen', asiri: 'aşırı', acik: 'açık', yuku: 'yükü',
    yuksek: 'yüksek', yuklu: 'yüklü', yontem: 'yöntem', uyari: 'uyarı', tamamlanan: 'tamamlanan', suresi: 'süresi', sayilar: 'sayılar', olmayan: 'olmayan',
    maliyetsiz: 'maliyetsiz', son: 'son', etki: 'etki', sahip: 'sahip', hafta: 'hafta', aksiyon: 'aksiyon', kod: 'kod', ad: 'ad', durum: 'durum', planlanan: 'planlanan',
    tahmini: 'tahmini', sapma: 'sapma', doluluk: 'doluluk', musteri: 'müşteri', istek: 'istek', tur: 'tür', ust: 'üst', sorumlu: 'sorumlu', calisma: 'çalışma',
    harcanan: 'harcanan', cozum: 'çözüm', bagimlilik: 'bağımlılık', gecikti: 'gecikti', tamamlandi: 'tamamlandı', ilerleme: 'ilerleme', ortalama: 'ortalama', uygun: 'uygun', guncel: 'güncel', icerik: 'içerik', ozellik: 'özellik', gecikme: 'gecikme', gun_sayisi: 'gün sayısı',
};

const label = (key: string): string => {
    const s = key.replace(/_tl$/, ' (TL)').split(/[_\s]+/).map(w => TR_WORDS[w] || w).join(' ').trim();
    return s ? s[0].toLocaleUpperCase('tr-TR') + s.slice(1) : key;
};

const isRow = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Bir okuma aracının sonucundan tablo: istenen alandaki (yoksa en uzun) nesne
 * dizisi satır olur, anahtarlar sütun. İç içe nesneler "üst alt" sütunlarına
 * açılır (bir düzey); diziler virgülle birleşir; tamamen boş sütunlar atılır.
 */
export const tableFromResult = (result: unknown, field?: string): { columns: string[]; rows: Cell[][]; field: string } => {
    const arrays: { path: string; rows: Record<string, unknown>[] }[] = [];
    const walk = (v: unknown, path: string, depth: number) => {
        if (Array.isArray(v)) {
            if (v.length && v.every(isRow)) arrays.push({ path, rows: v as Record<string, unknown>[] });
            return;
        }
        if (isRow(v) && depth < 3) for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, depth + 1);
    };
    walk(result, '', 0);
    if (Array.isArray(result) && !arrays.length && result.length) arrays.push({ path: '', rows: result.map(x => (isRow(x) ? x : { deger: x })) });
    const pick = field
        ? arrays.find(a => a.path === field || a.path.endsWith(`.${field}`))
        : arrays.sort((a, b) => b.rows.length - a.rows.length)[0];
    if (!pick) {
        if (field) throw new DocError(`Araç sonucunda "${field}" listesi yok. Var olanlar: ${arrays.map(a => a.path || '(kök)').join(', ') || 'liste yok'}.`);
        throw new DocError('Araç sonucunda tabloya dönüştürülecek bir liste yok.');
    }
    const flat = pick.rows.map(r => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) {
            if (isRow(v)) for (const [k2, v2] of Object.entries(v)) out[`${k} ${k2}`] = v2;
            else out[k] = v;
        }
        return out;
    });
    const all: string[] = [];
    flat.forEach(r => Object.keys(r).forEach(k => { if (!all.includes(k)) all.push(k); }));
    // Hiçbir satırda değeri olmayan sütunlar atılır (dar sayfada yer kaplamasın)
    const keys = all.filter(k => flat.some(r => toCell(r[k]) !== null));
    return { columns: keys.map(label), rows: flat.map(r => keys.map(k => toCell(r[k]))), field: pick.path };
};
