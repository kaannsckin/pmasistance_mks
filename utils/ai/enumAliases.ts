import { foldTr } from '../rag/text';
import type { JsonSchema } from './protocol';

/**
 * Seçenekli parametrelerde Türkçe karşılıklar (B-009): ajan ya da kullanıcı
 * "Kritik", "kırmızı", "kapandı" yazınca değer reddedilmesin; aracın beklediği
 * koda çevrilir. Önce birebir ve büyük/küçük harf duyarsız eşleşme denenir;
 * eşanlam yalnız hedefi o parametrenin seçeneklerindeyse uygulanır (aynı sözcük
 * farklı parametrelerde farklı koda gidebilir: "kritik" RAG'da red, öncelikte
 * Blocker). Tanınmayan değer olduğu gibi döner; denetim hatayı yine söyler.
 */

const key = (s: string): string => foldTr(s).replace(/[\s_-]+/g, '');

/** Katlanmış eşanlam → olası kodlar (sırayla; ilk izinli olan seçilir) */
const ALIASES: Record<string, string[]> = {
    // RAG
    yesil: ['green'], yolunda: ['green'],
    sari: ['amber'], turuncu: ['amber'], riskli: ['amber'],
    kirmizi: ['red'], kritik: ['red', 'Blocker'],
    // Risk durumu
    acik: ['open'],
    izleniyor: ['monitoring'], izlemede: ['monitoring'], izleme: ['monitoring'],
    kapali: ['closed'], kapandi: ['closed'], kapatildi: ['closed'], kapat: ['closed'],
    // Görev durumu
    yapilacak: ['ToDo'],
    devamediyor: ['InProgress'], suruyor: ['InProgress'], devam: ['InProgress'],
    tamamlandi: ['Done', 'closed'], bitti: ['Done'], yapildi: ['Done'],
    // Öncelik
    engelleyici: ['Blocker'], yuksek: ['High'], orta: ['Medium'], dusuk: ['Low'],
    // Müşteri isteği
    yeni: ['New'], donusturuldu: ['Converted'], reddedildi: ['Rejected', 'ret'],
    // Karar
    kabuledildi: ['kabul'],
};

export const normalizeEnumValue = <T>(value: T, allowed: readonly (string | number)[]): T => {
    if (typeof value !== 'string' || allowed.includes(value)) return value;
    const k = key(value);
    const same = allowed.find(a => typeof a === 'string' && key(a) === k);
    if (same !== undefined) return same as T;
    const hit = (ALIASES[k] || []).find(a => allowed.includes(a));
    return (hit ?? value) as T;
};

/** Şemadaki seçenekli parametrelerin değerlerini (liste dahil) koda çevirir */
export const normalizeEnumArgs = (schema: JsonSchema, args: Record<string, unknown>): Record<string, unknown> => {
    const props = schema.properties || {};
    let out: Record<string, unknown> | undefined;
    for (const [k, v] of Object.entries(args)) {
        const allowed = props[k]?.enum;
        if (!allowed) continue;
        const next = Array.isArray(v) ? v.map(x => normalizeEnumValue(x, allowed)) : normalizeEnumValue(v, allowed);
        if (Array.isArray(v) ? (next as unknown[]).some((x, i) => x !== v[i]) : next !== v) (out ||= { ...args })[k] = next;
    }
    return out || args;
};
