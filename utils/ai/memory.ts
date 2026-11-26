import { hashText, terms } from '../rag/text';

/**
 * Asistan hafızası: kullanıcının kendine özel bir Markdown belgesi (hafiza.md).
 * Kimlik (rol + kişi) başına, yalnız bu tarayıcıda saklanır; buluta ve çalışma
 * alanı verisine girmez. Kullanıcı belgeyi panelden okur, düzenler, .md olarak
 * indirir ve geri yükler.
 *
 * Belgenin bölümleri:
 *  - Üslup:     hitap, yazım tarzı, yanıt uzunluğu. Her yanıtta uygulanır, eskimez.
 *  - Tercihler: kalıcı çalışma tercihleri. Her yanıtta uygulanır, eskimez.
 *  - Notlar:    tarihli bağlam. Her soruda yalnız soruyla ilgili olanlar seçilir;
 *               eskidikçe ağırlığı yarı ömürle azalır, çok eskiyince Arşiv'e iner.
 *  - Arşiv:     taranmaz, modele gitmez; satırı Notlar'a taşıyarak geri alınır.
 *
 * Satır biçimi: `- [2026-11-25] ! Ana proje: ATLAS #atlas`
 *   [tarih]  yazıldığı gün (yaşlandırma buna göre)
 *   !        önemli: üç kat yavaş eskir, arşive iki kat geç iner
 *   #etiket  ilgililik eşleşmesine katkı verir
 *   "Anahtar: değer"  aynı anahtarla yazılan yeni satır eskisinin yerini alır
 */

export type MemorySection = 'uslup' | 'tercih' | 'not' | 'arsiv';

export interface MemoryItem {
    id: string;
    text: string;
    section: MemorySection;
    /** YYYY-AA-GG */
    createdAt: string;
    important?: boolean;
    tags?: string[];
}

export const SECTION_TITLES: Record<MemorySection, string> = {
    uslup: 'Üslup',
    tercih: 'Tercihler',
    not: 'Notlar',
    arsiv: 'Arşiv',
};

const SECTION_HINTS: Record<MemorySection, string> = {
    uslup: 'Her yanıtta uygulanır, eskimez: hitap, yazım tarzı, yanıt uzunluğu (kısa / orta / ayrıntılı).',
    tercih: 'Her yanıtta uygulanır, eskimez: kalıcı çalışma tercihleri.',
    not: 'Tarihli bağlam. Her soruda yalnız soruyla ilgili olanlar okunur; eskidikçe etkisi azalır, uzun süre sonra Arşiv\'e iner.',
    arsiv: 'Taranmaz ve asistana gitmez. Geri almak için satırı Notlar\'a taşıyın.',
};

const SECTION_ORDER: MemorySection[] = ['uslup', 'tercih', 'not', 'arsiv'];

export const MAX_MEMORY_CHARS = 300;
/** Üslup + tercih satırları her yanıtta gider: sınırlı tutulur */
export const MAX_PINNED_ITEMS = 25;
export const MAX_NOTE_ITEMS = 80;
export const MAX_ARCHIVE_ITEMS = 200;
/** Belge (elle düzenlemede) bu boyutu aşamaz */
export const MAX_MEMORY_DOC_CHARS = 40_000;

/** Yaşlandırma: notun ağırlığı her yarı ömürde yarıya iner */
export const HALF_LIFE_DAYS = 30;
export const IMPORTANT_HALF_LIFE_DAYS = 90;
/** Bu yaştan eski notlar arşive iner (önemli notlar iki katı) */
export const ARCHIVE_AFTER_DAYS = 180;
/** Bir turda modele giden en çok not */
export const MAX_SELECTED_NOTES = 6;
/** Bu ağırlığın altındaki (yaklaşık 4 aydan eski, sıradan) notlar seçilmez */
const MIN_WEIGHT = 0.06;
/** Soruyla eşleşen not yoksa bu kadar günlük notlar bağlam olarak gelir */
const FRESH_DAYS = 3;

const PREFIX_V1 = 'PLANASISTAN_AI_MEMORY_V1';
const PREFIX = 'PLANASISTAN_AI_MEMORY_V2';

export const memoryKey = (role: string, personId?: string): string => `${PREFIX}:${role}:${personId || '-'}`;
const legacyKey = (key: string): string => key.replace(PREFIX, PREFIX_V1);

/** Sicil, şifre, kart numarası gibi hassas içerik hafızaya yazılmaz */
const SENSITIVE = /(şifre|parola|password|token|api[\s_-]?anahtar|api[\s_-]?key|\bsicil\b|kredi kart|iban|\b\d{11}\b)/i;

export const validateMemoryText = (text: string): string | null => {
    const t = text.trim();
    if (!t) return 'Hafıza notu boş olamaz.';
    if (t.length > MAX_MEMORY_CHARS) return `Hafıza notu en çok ${MAX_MEMORY_CHARS} karakter olabilir; kısaltın.`;
    if (SENSITIVE.test(t)) return 'Şifre, sicil, kimlik ya da kart numarası gibi hassas bilgiler hafızaya yazılmaz.';
    return null;
};

const fold = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const DAY_MS = 86_400_000;
export const ageDays = (createdAt: string, now: Date): number => {
    const t = Date.parse(`${createdAt.slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY_MS)) : 0;
};

/** "Ana proje: ATLAS" → "ana proje" (en çok 4 kelimelik önek); yoksa undefined */
export const memoryKeyOf = (text: string): string | undefined => {
    const m = /^([^:\n]{2,40}):\s+\S/.exec(text.trim());
    if (!m || m[1].trim().split(/\s+/).length > 4 || /https?$/i.test(m[1])) return undefined;
    return fold(m[1]);
};

const TAG = /(^|\s)#([\p{L}\p{N}_-]{2,30})/gu;

/** Kimlik satırın içeriğinden türetilir: belge her okunduğunda aynı kalır */
const idOf = (section: MemorySection, text: string): string => `haf-${hashText(`${section}|${fold(text)}`)}`;

// ---------------------------------------------------------------------------
// Markdown ↔ kayıtlar
// ---------------------------------------------------------------------------

const sectionOf = (heading: string): MemorySection => {
    const h = fold(heading).replace(/[^a-zçğıöşü]/g, '');
    if (h.startsWith('üslup') || h.startsWith('uslup') || h.startsWith('hitap') || h.startsWith('stil')) return 'uslup';
    if (h.startsWith('tercih')) return 'tercih';
    if (h.startsWith('arşiv') || h.startsWith('arsiv')) return 'arsiv';
    return 'not';
};

const LINE = /^\s*[-*+]\s+(?:\[(\d{4}-\d{2}-\d{2})\]\s*)?(!\s*)?(.+?)\s*$/;

/** Markdown belgesini kayıtlara çevirir. Başlıksız ya da bilinmeyen bölüm satırları not sayılır. */
export const parseMemoryMarkdown = (md: string, today: string = isoDay(new Date())): MemoryItem[] => {
    const out: MemoryItem[] = [];
    let section: MemorySection = 'not';
    let inComment = false;
    for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
        const line = raw.trim();
        if (inComment) { if (line.includes('-->')) inComment = false; continue; }
        if (line.startsWith('<!--')) { if (!line.includes('-->')) inComment = true; continue; }
        const h = /^#{2,6}\s+(.+)$/.exec(line);
        if (h) { section = sectionOf(h[1]); continue; }
        const m = LINE.exec(line);
        if (!m) continue;
        const text = m[3].replace(/<!--.*?-->/g, '').trim();
        if (!text || validateMemoryText(text)) continue;
        const tags = [...text.matchAll(TAG)].map(t => fold(t[2]));
        out.push({
            id: idOf(section, text),
            text,
            section,
            createdAt: m[1] || today,
            ...(m[2] ? { important: true } : {}),
            ...(tags.length ? { tags: [...new Set(tags)] } : {}),
        });
    }
    return out;
};

const itemLine = (i: MemoryItem): string => `- [${i.createdAt.slice(0, 10)}] ${i.important ? '! ' : ''}${i.text}`;

/** Kayıtları kullanıcının okuyup düzenleyebileceği Markdown belgesine çevirir */
export const renderMemoryMarkdown = (items: MemoryItem[]): string => {
    const parts = [
        '# Asistan hafızası',
        '',
        '> Bu belgeyi düzenleyebilirsiniz. Satır biçimi: `- [YYYY-AA-GG] metin`.',
        '> `!` önemli (geç eskir) · `#etiket` ilgili sorularda bulunmasını kolaylaştırır · `Anahtar: değer` biçimli yeni satır aynı anahtarlı eskisinin yerini alır.',
    ];
    for (const s of SECTION_ORDER) {
        const rows = items.filter(i => i.section === s);
        // Notlar yeniden eskiye; diğerleri yazıldığı sırada
        if (s === 'not' || s === 'arsiv') rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        parts.push('', `## ${SECTION_TITLES[s]}`, `<!-- ${SECTION_HINTS[s]} -->`, ...rows.map(itemLine));
    }
    return `${parts.join('\n')}\n`;
};

// ---------------------------------------------------------------------------
// Bakım: yaşlandırma ve sınırlar
// ---------------------------------------------------------------------------

/** Eskiyen notları arşive indirir, sınırları uygular. Sıra korunur. */
export const maintainMemory = (items: MemoryItem[], now: Date): MemoryItem[] => {
    let out = items.map(i => {
        if (i.section !== 'not') return i;
        const limit = i.important ? ARCHIVE_AFTER_DAYS * 2 : ARCHIVE_AFTER_DAYS;
        return ageDays(i.createdAt, now) > limit ? { ...i, section: 'arsiv' as const } : i;
    });
    // Not sınırı aşılırsa en eski sıradan notlar arşive
    const notes = out.filter(i => i.section === 'not');
    if (notes.length > MAX_NOTE_ITEMS) {
        const drop = new Set(notes.slice().sort((a, b) => Number(!!a.important) - Number(!!b.important) || a.createdAt.localeCompare(b.createdAt))
            .slice(0, notes.length - MAX_NOTE_ITEMS).map(i => i.id));
        out = out.map(i => (drop.has(i.id) ? { ...i, section: 'arsiv' as const } : i));
    }
    const archive = out.filter(i => i.section === 'arsiv');
    if (archive.length > MAX_ARCHIVE_ITEMS) {
        const drop = new Set(archive.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, archive.length - MAX_ARCHIVE_ITEMS).map(i => i.id));
        out = out.filter(i => !drop.has(i.id));
    }
    return out;
};

// ---------------------------------------------------------------------------
// Seçim: her soruda yalnız ilgili notlar
// ---------------------------------------------------------------------------

/** Notun yaşa göre ağırlığı (0-1): yarı ömürle azalır */
export const recencyWeight = (item: Pick<MemoryItem, 'createdAt' | 'important'>, now: Date): number =>
    Math.pow(0.5, ageDays(item.createdAt, now) / (item.important ? IMPORTANT_HALF_LIFE_DAYS : HALF_LIFE_DAYS));

export interface SelectedNote {
    item: MemoryItem;
    age: number;
    score: number;
}

export interface MemorySelection {
    /** Her yanıtta: üslup ve tercihler */
    pinned: MemoryItem[];
    /** Bu soruyla ilgili notlar (ilgililik × yaş ağırlığı) */
    notes: SelectedNote[];
    /** Taranan not sayısı (arşiv hariç) */
    scanned: number;
}

/**
 * Soruya göre hafıza seçimi. Üslup ve tercihler her zaman; notlar soru
 * kelimeleriyle (gövdelenmiş, etiketler iki kat) eşleşmesine ve yaşına göre
 * puanlanır. Arşiv taranmaz. Yüzlerce satırda bile milisaniyenin altındadır.
 */
export const selectMemory = (items: MemoryItem[], query: string, now: Date, max = MAX_SELECTED_NOTES): MemorySelection => {
    const pinned = items.filter(i => i.section === 'uslup' || i.section === 'tercih').slice(0, MAX_PINNED_ITEMS);
    const notes = items.filter(i => i.section === 'not');
    const q = new Set(terms(query));
    const scored: SelectedNote[] = [];
    const fresh: SelectedNote[] = [];
    for (const item of notes) {
        const age = ageDays(item.createdAt, now);
        const w = recencyWeight(item, now);
        if (w < MIN_WEIGHT && !item.important) continue;
        const own = new Set(terms(item.text));
        const tagTerms = new Set((item.tags || []).flatMap(t => terms(t)));
        let rel = 0;
        for (const t of q) rel += (tagTerms.has(t) ? 2 : 0) + (own.has(t) ? 1 : 0);
        if (rel > 0) scored.push({ item, age, score: rel * w * (item.important ? 1.5 : 1) });
        else if (age <= FRESH_DAYS) fresh.push({ item, age, score: 0 });
    }
    scored.sort((a, b) => b.score - a.score || a.age - b.age);
    // Soruyla eşleşen not yoksa ("peki şimdi ne yapalım?") son günlerin notları bağlam olarak gelir
    const picked = scored.length ? scored : fresh.sort((a, b) => a.age - b.age).slice(0, 2);
    return { pinned, notes: picked.slice(0, max), scanned: notes.length };
};

// ---------------------------------------------------------------------------
// Saklama
// ---------------------------------------------------------------------------

const readRaw = (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
};

const writeRaw = (key: string, value: string): void => {
    try { localStorage.setItem(key, value); } catch { /* özel pencere ya da kota: bu oturumda bellekte kalır */ }
};

/** Eski (v1) düz listeyi yeni belgeye taşır: eski notlar "her yanıtta" davranışını korusun diye Tercihler'e girer */
const migrateLegacy = (key: string): MemoryItem[] | null => {
    const raw = readRaw(legacyKey(key));
    if (!raw) return null;
    try {
        const v = JSON.parse(raw);
        if (!Array.isArray(v)) return null;
        return v.filter(x => x && typeof x.text === 'string').map(x => ({
            id: idOf('tercih', String(x.text)),
            text: String(x.text),
            section: 'tercih' as const,
            createdAt: typeof x.createdAt === 'string' ? x.createdAt.slice(0, 10) : isoDay(new Date()),
        }));
    } catch {
        return null;
    }
};

export interface AddOptions {
    section?: Exclude<MemorySection, 'arsiv'>;
    important?: boolean;
    tags?: string[];
}

export interface AddResult {
    item: MemoryItem;
    /** Aynı anahtarla yazılmış ve yerini yeni notun aldığı eski satır */
    replaced?: MemoryItem;
    /** Aynı not zaten vardı (tarihi yenilendi) */
    existed?: boolean;
}

export interface MemoryStore {
    list: () => MemoryItem[];
    add: (text: string, opts?: AddOptions) => AddResult;
    /** Numara (1'den, arşiv hariç sırayla), kimlik ya da metin parçasıyla siler */
    remove: (ref: string | number) => MemoryItem | undefined;
    clear: () => void;
    markdown: () => string;
    /** Elle düzenlenen belgeyi kaydeder; hatalıysa açıklama döner */
    setMarkdown: (md: string) => { ok: true; count: number } | { ok: false; error: string };
    select: (query: string, max?: number) => MemorySelection;
}

export const createMemoryStore = (key: string, now: () => Date = () => new Date()): MemoryStore => {
    const load = (): MemoryItem[] => {
        const raw = readRaw(key);
        if (raw !== null) return maintainMemory(parseMemoryMarkdown(raw, isoDay(now())), now());
        const legacy = migrateLegacy(key);
        if (legacy) writeRaw(key, renderMemoryMarkdown(legacy));
        return legacy || [];
    };
    const save = (items: MemoryItem[]) => writeRaw(key, renderMemoryMarkdown(maintainMemory(items, now())));
    const active = (items: MemoryItem[]) => items.filter(i => i.section !== 'arsiv');

    return {
        list: load,
        add: (text, opts = {}) => {
            const err = validateMemoryText(text);
            if (err) throw new Error(err);
            const t = text.trim().replace(/\s+/g, ' ');
            const section = opts.section || 'not';
            const items = load();
            const today = isoDay(now());
            const tagsInText = [...t.matchAll(TAG)].map(m => fold(m[2]));
            const tags = [...new Set([...tagsInText, ...(opts.tags || []).map(fold).filter(x => /^[\p{L}\p{N}_-]{2,30}$/u.test(x))])];
            const extra = tags.filter(x => !tagsInText.includes(x));
            const fullText = extra.length ? `${t} ${extra.map(x => `#${x}`).join(' ')}` : t;
            if (fullText.length > MAX_MEMORY_CHARS) throw new Error(`Hafıza notu en çok ${MAX_MEMORY_CHARS} karakter olabilir; kısaltın.`);

            const same = items.find(i => i.section !== 'arsiv' && fold(i.text) === fold(fullText));
            if (same) {
                // Tekrar söylenen not tazelenir (yaşlanma sıfırlanır)
                const fresh = { ...same, id: idOf(section, same.text), section, createdAt: today, ...(opts.important ? { important: true } : {}) };
                save(items.map(i => (i.id === same.id ? fresh : i)));
                return { item: fresh, existed: true };
            }
            const k = memoryKeyOf(fullText);
            const old = k ? items.find(i => i.section !== 'arsiv' && memoryKeyOf(i.text) === k) : undefined;
            const item: MemoryItem = { id: idOf(section, fullText), text: fullText, section, createdAt: today, ...(opts.important ? { important: true } : {}), ...(tags.length ? { tags } : {}) };
            const rest = old ? items.filter(i => i.id !== old.id) : items;
            if (section !== 'not' && rest.filter(i => i.section === 'uslup' || i.section === 'tercih').length >= MAX_PINNED_ITEMS) {
                throw new Error(`Üslup ve tercihler en çok ${MAX_PINNED_ITEMS} satır olabilir; önce birini silin.`);
            }
            save([...rest, item]);
            return { item, ...(old ? { replaced: old } : {}) };
        },
        remove: ref => {
            const items = load();
            const list = active(items);
            const n = typeof ref === 'number' ? ref : /^\d+$/.test(String(ref).trim()) ? Number(ref) : NaN;
            const q = fold(String(ref));
            const hit = Number.isInteger(n) ? list[n - 1] : items.find(i => i.id === ref) || list.find(i => q && fold(i.text).includes(q));
            if (!hit) return undefined;
            save(items.filter(i => i.id !== hit.id));
            return hit;
        },
        clear: () => writeRaw(key, renderMemoryMarkdown([])),
        markdown: () => renderMemoryMarkdown(load()),
        setMarkdown: md => {
            if (md.length > MAX_MEMORY_DOC_CHARS) return { ok: false, error: `Hafıza belgesi en çok ${MAX_MEMORY_DOC_CHARS.toLocaleString('tr-TR')} karakter olabilir.` };
            if (SENSITIVE.test(md)) return { ok: false, error: 'Belgede şifre, sicil, kimlik ya da kart numarası gibi hassas bilgi var; çıkarıp tekrar kaydedin.' };
            const items = parseMemoryMarkdown(md, isoDay(now()));
            if (items.filter(i => i.section === 'uslup' || i.section === 'tercih').length > MAX_PINNED_ITEMS) {
                return { ok: false, error: `Üslup ve tercihler en çok ${MAX_PINNED_ITEMS} satır olabilir.` };
            }
            save(items);
            return { ok: true, count: items.length };
        },
        select: (query, max) => selectMemory(load(), query, now(), max),
    };
};

// ---------------------------------------------------------------------------
// Sistem talimatı
// ---------------------------------------------------------------------------

const ageLabel = (days: number): string => {
    if (days === 0) return 'bugün';
    if (days === 1) return 'dün';
    if (days < 14) return `${days} gün önce`;
    if (days < 60) return `${Math.round(days / 7)} hafta önce`;
    return `${Math.round(days / 30)} ay önce`;
};

/** Üslup satırlarından yanıt uzunluğu tercihi (yoksa kısa) */
export const lengthPreference = (items: MemoryItem[]): 'kisa' | 'orta' | 'ayrintili' => {
    const line = items.find(i => i.section === 'uslup' && /uzunlu|ayrıntı|ayrinti|kısa|kisa|detay/i.test(i.text))?.text || '';
    if (/ayrıntılı|ayrintili|detaylı|detayli|uzun\b/i.test(line)) return 'ayrintili';
    if (/\borta\b/i.test(line)) return 'orta';
    return 'kisa';
};

export const MEMORY_WRITE_RULE = 'Hafızaya yazma: kullanıcı açıkça "hatırla", "hafızaya ekle", "bundan sonra", "her zaman", "unutma" derse ya da kalıcı bir tercih belirtirse hafiza_kaydet ile kısa, genel bir satır yaz. bolum: hitap, yazım tarzı, yanıt uzunluğu → uslup; kalıcı çalışma tercihi → tercih; geçici bağlam ya da olgu (ör. "ATLAS teslimi Ocak sonuna kaydı") → not. Değişebilecek bilgiyi "Anahtar: değer" biçiminde yaz (ör. "Ana proje: ATLAS") ki yenisi eskisinin yerini alsın. Tek seferlik istekleri, uygulamadaki veri değerlerini ve hassas bilgiyi kaydetme. "Unut" derse hafiza_sil kullan. Kaydettiğini ya da sildiğini tek cümleyle söyle.';

/** Sistem talimatına eklenen bölüm: yalnız seçilenler gider */
export const memoryPromptSection = (sel: MemorySelection): string => {
    const style = sel.pinned.filter(i => i.section === 'uslup');
    const prefs = sel.pinned.filter(i => i.section === 'tercih');
    const lines = ['Hafıza (kullanıcının kendi hafiza.md belgesi):'];
    if (style.length) lines.push('Üslup (her yanıtta uy: hitap, yazım tarzı, uzunluk):', ...style.map(i => `- ${i.text}`));
    if (prefs.length) lines.push('Tercihler (her yanıtta uy):', ...prefs.map(i => `- ${i.text}`));
    if (sel.notes.length) {
        lines.push(
            `Bu soruyla ilgili notlar (${sel.scanned} not içinden seçildi; yeniden eskiye):`,
            ...sel.notes.slice().sort((a, b) => a.age - b.age).map(n => `- (${ageLabel(n.age)}${n.item.important ? ', önemli' : ''}) ${n.item.text}`),
            'Notları yaşına göre tart: yeni not eskisiyle çelişirse yeniyi esas al; 2 aydan eski notları "eski olabilir" diye düşün ve uygulamanın güncel verisiyle doğrula. Güncel veri her zaman notun önündedir.',
        );
    }
    if (!style.length && !prefs.length && !sel.notes.length) lines.push('(boş)');
    lines.push(MEMORY_WRITE_RULE);
    return lines.join('\n');
};
