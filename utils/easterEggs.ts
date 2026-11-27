import { ModernTheme, Task, TaskStatus } from '../types';

/**
 * Küçük sürprizler (easter egg'ler). Hepsi yan etkisizdir ve
 * "hareketi azalt" tercihine saygı duyar — animasyon yerine kısa bir mesaj
 * gösterilir.
 *
 *  - Konami kodu (↑↑↓↓←→←→BA) → uzay modu
 *  - Komut paletinde "roket" → fırlatma
 *  - Bir sprintin/projenin son görevi tamamlanınca → kutlama
 *  - Gece yarısı, cuma akşamı ve pazartesi sabahı → küçük selamlar
 *  - Yazı alanı dışında kelime yazmak (temalara özel):
 *      "egg" / "yumurta" → sürpriz rehberi kartı
 *      "pop" (Cam) · "aurora" (Aurora) · "ship" (Pro) · "boing" (Kil)
 */

export const prefersReducedMotion = (): boolean => {
    try {
        return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
};

export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/** Tuşları sırayla besler; dizi tamamlandığında true döner ve baştan başlar */
export const createSequenceDetector = (sequence: string[] = KONAMI) => {
    let pos = 0;
    return (key: string): boolean => {
        const k = key.length === 1 ? key.toLowerCase() : key;
        if (k === sequence[pos]) {
            pos++;
            if (pos === sequence.length) {
                pos = 0;
                return true;
            }
            return false;
        }
        // Yanlış tuş: bu tuş dizinin başıysa oradan devam et
        pos = k === sequence[0] ? 1 : 0;
        return false;
    };
};

/** Tıklama zamanlarını tutar; `count` tık `windowMs` içinde olursa true */
export const createRapidClickDetector = (count = 5, windowMs = 2000) => {
    let times: number[] = [];
    return (now: number = Date.now()): boolean => {
        times = [...times.filter(t => now - t <= windowMs), now];
        if (times.length >= count) {
            times = [];
            return true;
        }
        return false;
    };
};

/** Saate göre küçük selam (yoksa null) */
export const timeGreeting = (now: Date = new Date()): string | null => {
    const h = now.getHours();
    const day = now.getDay(); // 0 pazar … 5 cuma
    if (h >= 23 || h < 5) return 'Geç oldu; dinlenmeyi unutmayın.';
    if (day === 5 && h >= 16) return 'Hafta sonu yaklaşıyor. Kolay gelsin!';
    if (day === 1 && h < 10) return 'Yeni hafta, yeni sprint.';
    return null;
};

/**
 * Durum değişikliği bir grubu (ör. sprint) tamamen bitiriyor mu?
 * Önceden bitmemiş en az bir görev varken değişiklikten sonra hepsi Done ise true.
 */
export const completesGroup = (group: Pick<Task, 'id' | 'status'>[], taskId: string, newStatus: TaskStatus): boolean => {
    if (group.length === 0 || newStatus !== TaskStatus.Done) return false;
    if (!group.some(t => t.id === taskId)) return false;
    const before = group.every(t => t.status === TaskStatus.Done);
    const after = group.every(t => (t.id === taskId ? newStatus : t.status) === TaskStatus.Done);
    return !before && after;
};

/** Yazı alanı dışında yazılınca tetiklenen kelimeler */
export const TYPED_EGGS = ['egg', 'yumurta', 'pop', 'aurora', 'ship', 'boing'] as const;
export type TypedEgg = typeof TYPED_EGGS[number];

/**
 * Harfleri sırayla besler; son yazılanlar bir kelimeyle bitiyorsa o kelimeyi
 * döner (ve tamponu boşaltır). `gapMs`'den uzun duraklama tamponu sıfırlar;
 * harf olmayan tek karakterli tuşlar (boşluk, rakam) da kelimeyi böler.
 */
export const createWordDetector = <W extends string>(words: readonly W[], gapMs = 1500) => {
    const max = Math.max(...words.map(w => w.length));
    let buf = '';
    let last = 0;
    return (key: string, now: number = Date.now()): W | null => {
        if (key.length !== 1) return null; // Shift, ok tuşları vb. kelimeyi bölmez
        if (now - last > gapMs) buf = '';
        last = now;
        const ch = key.toLocaleLowerCase('en-US');
        if (!/[a-zçğıöşü]/.test(ch)) { buf = ''; return null; }
        buf = (buf + ch).slice(-max);
        const hit = words.find(w => buf.endsWith(w));
        if (hit) buf = '';
        return hit ?? null;
    };
};

/** Sürpriz rehberi kartında ve komut paletinde kullanılan katalog */
export type EggTrigger = 'rocket' | 'hyper' | 'space' | 'celebrate' | 'sprint' | 'pop' | 'aurora' | 'ship' | 'boing';
export interface EggInfo {
    id: EggTrigger | 'greeting';
    title: string;
    how: string;
    /** Bu sürpriz en çok hangi temaya yakışır (rehberde "temana özel" rozeti) */
    theme?: ModernTheme;
    /** Rehberden "Dene" ile doğrudan çalıştırılabilir mi */
    tryable: boolean;
}

export const EGG_CATALOG: EggInfo[] = [
    { id: 'hyper', title: 'Hiper sürüş', how: 'Komut paletinde "roket" arayın.', tryable: true },
    { id: 'space', title: 'Uzay modu', how: 'Klavyede ↑ ↑ ↓ ↓ ← → ← → B A.', tryable: true },
    { id: 'celebrate', title: 'Kutlama', how: 'Bir sürümün ya da projenin son görevini tamamlayın.', tryable: true },
    { id: 'sprint', title: 'Sprint tamamlandı', how: 'Bir sprintin son açık görevini tamamlayın; görev sayısı, efor ve sprint sonuna göre zamanlama gösterilir.', tryable: true },
    { id: 'greeting', title: 'Saatli selam', how: 'Gece yarısı, cuma akşamı ya da pazartesi sabahı Portföy\'e bakın.', tryable: false },
    { id: 'pop', title: 'Baloncuk patlat', how: 'Bir yazı alanında değilken "pop" yazın.', theme: 'bubble', tryable: true },
    { id: 'aurora', title: 'Kuzey ışıkları', how: 'Bir yazı alanında değilken "aurora" yazın.', theme: 'aurora', tryable: true },
    { id: 'ship', title: 'Yayına al', how: 'Bir yazı alanında değilken "ship" yazın.', theme: 'pro', tryable: true },
    { id: 'boing', title: 'Jöle kartlar', how: 'Bir yazı alanında değilken "boing" yazın.', theme: 'clay', tryable: true },
];
