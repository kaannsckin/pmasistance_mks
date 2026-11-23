/**
 * Asistan hafızası: kullanıcının kalıcı tercihleri ve bağlamı ("raporlarda saat
 * yerine gün kullan", "ana projem ATLAS"). Kimlik (rol + kişi) başına, yalnız
 * bu tarayıcıda saklanır; buluta ve çalışma alanı verisine girmez. Her soruda
 * sistem talimatına eklenir; kullanıcı panelden görür ve siler.
 */

export interface MemoryItem {
    id: string;
    text: string;
    createdAt: string;
}

export const MAX_MEMORY_ITEMS = 30;
export const MAX_MEMORY_CHARS = 300;
const PREFIX = 'PLANASISTAN_AI_MEMORY_V1';

export const memoryKey = (role: string, personId?: string): string => `${PREFIX}:${role}:${personId || '-'}`;

/** Sicil, şifre, kart numarası gibi hassas içerik hafızaya yazılmaz */
const SENSITIVE = /(şifre|parola|password|token|api[\s_-]?anahtar|api[\s_-]?key|\bsicil\b|kredi kart|iban|\b\d{11}\b)/i;

export const validateMemoryText = (text: string): string | null => {
    const t = text.trim();
    if (!t) return 'Hafıza notu boş olamaz.';
    if (t.length > MAX_MEMORY_CHARS) return `Hafıza notu en çok ${MAX_MEMORY_CHARS} karakter olabilir; kısaltın.`;
    if (SENSITIVE.test(t)) return 'Şifre, sicil, kimlik ya da kart numarası gibi hassas bilgiler hafızaya yazılmaz.';
    return null;
};

const read = (key: string): MemoryItem[] => {
    try {
        const raw = localStorage.getItem(key);
        const v = raw ? JSON.parse(raw) : [];
        return Array.isArray(v) ? v.filter(x => x && typeof x.text === 'string' && typeof x.id === 'string').slice(0, MAX_MEMORY_ITEMS) : [];
    } catch {
        return [];
    }
};

const write = (key: string, items: MemoryItem[]): void => {
    try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* özel pencere ya da kota: bu oturumda bellekte kalır */ }
};

export interface MemoryStore {
    list: () => MemoryItem[];
    /** Ekler; aynı not varsa yenisini eklemez. Sınır dolunca en eskisi düşer. */
    add: (text: string) => { item: MemoryItem; replaced?: MemoryItem };
    /** Numara (1'den) ya da metin parçasıyla siler; silineni döndürür */
    remove: (ref: string | number) => MemoryItem | undefined;
    clear: () => void;
}

export const createMemoryStore = (key: string, now: () => Date = () => new Date()): MemoryStore => {
    let cache = read(key);
    const save = (items: MemoryItem[]) => { cache = items; write(key, items); };
    return {
        list: () => (cache = read(key)).slice(),
        add: text => {
            const err = validateMemoryText(text);
            if (err) throw new Error(err);
            const t = text.trim().replace(/\s+/g, ' ');
            const items = read(key);
            const same = items.find(i => i.text.toLocaleLowerCase('tr-TR') === t.toLocaleLowerCase('tr-TR'));
            if (same) return { item: same };
            const item: MemoryItem = { id: `haf-${now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, text: t, createdAt: now().toISOString() };
            const next = [...items, item];
            const replaced = next.length > MAX_MEMORY_ITEMS ? next.shift() : undefined;
            save(next);
            return { item, ...(replaced ? { replaced } : {}) };
        },
        remove: ref => {
            const items = read(key);
            const n = typeof ref === 'number' ? ref : /^\d+$/.test(String(ref).trim()) ? Number(ref) : NaN;
            const q = String(ref).trim().toLocaleLowerCase('tr-TR');
            const hit = Number.isInteger(n) ? items[n - 1] : items.find(i => i.id === ref) || items.find(i => q && i.text.toLocaleLowerCase('tr-TR').includes(q));
            if (!hit) return undefined;
            save(items.filter(i => i.id !== hit.id));
            return hit;
        },
        clear: () => save([]),
    };
};

/** Sistem talimatına eklenen bölüm */
export const memoryPromptSection = (items: MemoryItem[]): string => [
    'Hafıza (kullanıcının kalıcı tercihleri ve bağlamı; yanıtlarında bunlara uy, ama güncel veriyle çelişirse veriyi esas al):',
    ...(items.length ? items.map((m, i) => `${i + 1}. ${m.text}`) : ['(boş)']),
    'Kullanıcı açıkça "hatırla", "bundan sonra", "her zaman", "unutma" derse ya da kalıcı bir tercih belirtirse hafiza_kaydet ile kısa ve genel bir not olarak kaydet; tek seferlik istekleri, veri değerlerini ve hassas bilgiyi kaydetme. "Unut" derse hafiza_sil kullan. Kaydettiğini ya da sildiğini bir cümleyle söyle.',
].join('\n');
