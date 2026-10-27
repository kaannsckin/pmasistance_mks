import { WorkspaceData } from '../../types';

/**
 * AI'ya giden metinlerde ad maskeleme (takma ad) — geri çevrilebilir.
 *
 * Kişi, proje ve kurum (müşteri) adları sağlayıcıya gönderilmeden önce kalıcı
 * takma adlarla (Kişi-4821, Proje-1307, Kurum-2290) değiştirilir; modelin
 * yanıtındaki ve araç çağrılarındaki takma adlar tarayıcıda gerçek adlara geri
 * çevrilir. Uygulamadaki veri değişmez; yalnız AI trafiği maskelenir.
 *
 *   - Takma ad addan türetilir (özet), bu yüzden oturumlar ve dizinleme arasında
 *     aynı kalır; aynı adın farklı yazımları (büyük/küçük harf, "Soyad Ad")
 *     aynı takma ada gider.
 *   - Eşleşme Türkçe büyük/küçük harf duyarsızdır ve kelime sınırlarına bakar;
 *     ad + kesme işaretiyle gelen ek ("Ali Veli'nin") korunur.
 *   - Model takma addan sonra ek getirirse ("Kişi-4821'in") ek, gerçek adın ses
 *     uyumuna göre düzeltilir ("Ali Veli'nin").
 * Sicil numaraları araç çıktılarında ayrıca maskelenir (utils/ai/scope.ts).
 */

export type MaskKind = 'person' | 'project' | 'customer';
const PREFIX: Record<MaskKind, string> = { person: 'Kişi', project: 'Proje', customer: 'Kurum' };
const KIND_OF: Record<string, MaskKind> = { kişi: 'person', proje: 'project', kurum: 'customer' };

export interface MaskEntry {
    kind: MaskKind;
    /** Gösterilecek (geri çevrilecek) ad */
    name: string;
    /** Aynı varlığın başka yazımları (ör. "Soyad Ad") */
    aliases?: string[];
}

export interface Masker {
    mask(text: string): string;
    unmask(text: string): string;
    /** Akış sırasında: sonda yarım kalmış olabilecek takma adı (ve ekini) henüz göstermez */
    unmaskPartial(text: string): string;
    /** Takma adı olan varlık sayısı */
    size: number;
}

const tr = (s: string) => s.toLocaleLowerCase('tr');
const keyOf = (s: string) => tr(s).replace(/\s+/g, ' ').trim();

/** FNV-1a (32 bit) */
const hash = (s: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
};

const escapeRe = (c: string) => c.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/**
 * Türkçe büyük/küçük harf duyarsız, boşluk esnek desen. Tek kelimelik adlar
 * yalnız büyük harfle başlıyorsa eşleşir: "Atlas" projesi ya da "Umut" adı,
 * talimat ve metinlerdeki sıradan "atlas" / "umut" kelimesini maskelemez.
 */
const formPattern = (form: string): string => {
    const chars = Array.from(form.trim());
    const single = !chars.some(c => /\s/.test(c));
    return chars.map((c, i) => {
        if (/\s/.test(c)) return '\\s+';
        const lo = c.toLocaleLowerCase('tr'), up = c.toLocaleUpperCase('tr');
        if (lo === up) return escapeRe(c);
        return single && i === 0 ? escapeRe(up) : `[${escapeRe(lo)}${escapeRe(up)}]`;
    }).join('').replace(/(\\s\+)+/g, '\\s+');
};

// ---------------------------------------------------------------- Türkçe ek uyumu

const VOWELS = 'aeıioöuü';

/**
 * Modelin takma ada getirdiği yaygın hâl ekini gerçek adın ses uyumuna göre
 * yeniden kurar (ilgi, belirtme, yönelme, bulunma, ayrılma, vasıta, -deki).
 * Tanınmayan ek olduğu gibi bırakılır.
 */
export const harmonizeSuffix = (name: string, suffix: string): string => {
    const w = tr(name).trim();
    if (!w) return suffix;
    let lv = 'e';
    for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i])) { lv = w[i]; break; }
    const last = w[w.length - 1];
    const endsVowel = VOWELS.includes(last);
    const A = 'aıou'.includes(lv) ? 'a' : 'e';
    const I = 'aı'.includes(lv) ? 'ı' : 'ei'.includes(lv) ? 'i' : 'ou'.includes(lv) ? 'u' : 'ü';
    const D = 'fstkçşhp'.includes(last) ? 't' : 'd';
    const s = tr(suffix);
    if (/^n?[ıiuü]n$/.test(s)) return endsVowel ? `n${I}n` : `${I}n`;
    if (/^y?[ıiuü]$/.test(s)) return endsVowel ? `y${I}` : I;
    if (/^y?[ae]$/.test(s)) return endsVowel ? `y${A}` : A;
    if (/^[dt][ae]$/.test(s)) return `${D}${A}`;
    if (/^[dt][ae]n$/.test(s)) return `${D}${A}n`;
    if (/^[dt][ae]ki$/.test(s)) return `${D}${A}ki`;
    if (/^y?l[ae]$/.test(s)) return endsVowel ? `yl${A}` : `l${A}`;
    return suffix;
};

// ---------------------------------------------------------------- maskeleyici

const MIN_LEN: Record<MaskKind, number> = { person: 3, customer: 3, project: 4 };
const TOKEN = /([KkPp](?:işi|roje|urum))-(\d{4})(?!\d)(?:(['’])([\p{L}]+))?/gu;
/** Sonda yarım kalmış olabilecek takma ad: "K", "Kiş", "Kişi-48", "Kişi-4821'ni" */
const PARTIAL_TAIL = /(?:^|[^\p{L}\p{N}])((?:K|Ki|Kiş|Kişi|P|Pr|Pro|Proj|Proje|Ku|Kur|Kuru|Kurum)(?:-\d{0,4}(?:['’][\p{L}]*)?)?)$/u;

export const buildMasker = (entries: MaskEntry[]): Masker => {
    // Aynı ad (her yazımıyla) tek varlık; ilk görülen yazım gösterilir. Takma adlar 1000–9999
    // arasıdır; modele verilen nottaki örnekler (0001…) hiçbir varlığa denk gelmez.
    const byKey = new Map<string, { kind: MaskKind; name: string }>();
    const formOwner = new Map<string, string>(); // yazım anahtarı → varlık anahtarı
    for (const e of entries) {
        const name = e.name?.replace(/\s+/g, ' ').trim();
        if (!name || name.length < MIN_LEN[e.kind] || /^[\d\s.,-]+$/.test(name)) continue;
        const id = formOwner.get(keyOf(name)) || `${e.kind}:${keyOf(name)}`;
        if (!byKey.has(id)) byKey.set(id, { kind: e.kind, name });
        [name, ...(e.aliases || [])].forEach(f => {
            const fk = keyOf(f || '');
            if (fk.length >= MIN_LEN[e.kind] && !formOwner.has(fk)) formOwner.set(fk, id);
        });
    }
    // Takma adlar: özetten 4 hane; çakışırsa sıradaki boş numara (sıralı işlendiği için belirlenimci)
    const tokenOf = new Map<string, string>(); // varlık anahtarı → takma ad
    const nameOf = new Map<string, string>(); // takma ad → gerçek ad
    const used = new Set<string>();
    [...byKey.keys()].sort().forEach(id => {
        const ent = byKey.get(id)!;
        let n = 1000 + (hash(id) % 9000);
        let token = `${PREFIX[ent.kind]}-${n}`;
        while (used.has(token)) { n = n >= 9999 ? 1000 : n + 1; token = `${PREFIX[ent.kind]}-${n}`; }
        used.add(token);
        tokenOf.set(id, token);
        nameOf.set(token, ent.name);
    });

    const forms = [...formOwner.keys()].sort((a, b) => b.length - a.length);
    const re = forms.length
        ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${forms.map(formPattern).join('|')})(?![\\p{L}\\p{N}_])`, 'gu')
        : null;

    const mask = (text: string): string => {
        if (!re || !text) return text;
        return text.replace(re, m => tokenOf.get(formOwner.get(keyOf(m)) || '') || m);
    };
    const unmask = (text: string): string => {
        if (!text || !nameOf.size) return text;
        return text.replace(TOKEN, (all, prefix: string, num: string, apo?: string, suffix?: string) => {
            const kind = KIND_OF[tr(prefix)];
            const name = kind && nameOf.get(`${PREFIX[kind]}-${num}`);
            if (!name) return all;
            return suffix ? `${name}${apo}${harmonizeSuffix(name, suffix)}` : name;
        });
    };
    const unmaskPartial = (text: string): string => {
        const m = PARTIAL_TAIL.exec(text);
        return unmask(m ? text.slice(0, text.length - m[1].length) : text);
    };
    return { mask, unmask, unmaskPartial, size: byKey.size };
};

/** JSON benzeri değerdeki tüm metinlere uygular (araç çağrısı argümanları) */
export const mapStrings = <T,>(value: T, fn: (s: string) => string, depth = 0): T => {
    if (typeof value === 'string') return fn(value) as unknown as T;
    if (depth > 8 || !value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(v => mapStrings(v, fn, depth + 1)) as unknown as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mapStrings(v, fn, depth + 1);
    return out as T;
};

// ---------------------------------------------------------------- çalışma alanından adlar

/** Kişi adı taşıyan alanlar (rapor yazarı, onaylayan, kaynak, bölüm sorumlusu…) */
const PERSON_KEY = /(?:ByName|byName|authorName|leadName|resourceName)$/;

/** Çalışma alanındaki kişi, proje ve kurum adları */
export const collectMaskEntries = (ws: Partial<WorkspaceData> | null | undefined): MaskEntry[] => {
    if (!ws) return [];
    const out: MaskEntry[] = [];
    (ws.people || []).forEach(p => {
        const first = p.firstName?.trim() || '', last = p.lastName?.trim() || '';
        if (first && last) out.push({ kind: 'person', name: `${first} ${last}`, aliases: [`${last} ${first}`] });
        else if (first || last) out.push({ kind: 'person', name: first || last });
    });
    (ws.projects || []).forEach(p => {
        if (p.name) out.push({ kind: 'project', name: p.name });
        (p.resources || []).forEach(r => r.name && out.push({ kind: 'person', name: r.name }));
    });
    // Diğer kişi ve kurum adı alanları (iç içe kayıtlar dahil)
    const seen = new Set<unknown>();
    const walk = (v: unknown, depth: number) => {
        if (!v || typeof v !== 'object' || depth > 7 || seen.has(v)) return;
        seen.add(v);
        if (Array.isArray(v)) { v.forEach(x => walk(x, depth + 1)); return; }
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
            if (typeof x === 'string') {
                if (k === 'customerName') out.push({ kind: 'customer', name: x });
                else if (PERSON_KEY.test(k)) x.split(/\s*[,;/]\s*/).forEach(n => out.push({ kind: 'person', name: n }));
            } else if (x && typeof x === 'object') walk(x, depth + 1);
        }
    };
    walk(ws, 0);
    return out;
};

/** Takma adlar hakkında modele verilen kısa not (sistem talimatına eklenir) */
export const MASK_NOTE = 'Gizlilik: Kişi, proje ve kurum adları takma adla verilir (ör. Kişi-0001, Proje-0002, Kurum-0003). Takma adları aynen yazın, gerçek adı tahmin etmeye çalışmayın; araç çağrılarında da bu takma adları kullanın.';
