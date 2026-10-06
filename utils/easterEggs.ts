import { Task, TaskStatus } from '../types';

/**
 * Küçük sürprizler (easter egg'ler). Hepsi yan etkisizdir ve
 * "hareketi azalt" tercihine saygı duyar — animasyon yerine kısa bir mesaj
 * gösterilir.
 *
 *  - Logo (roket): tek tık → fırlatma; 5 hızlı tık → hiper sürüş
 *  - Konami kodu (↑↑↓↓←→←→BA) → uzay modu
 *  - Komut paletinde "roket" → fırlatma
 *  - Bir sürümün/projenin son görevi tamamlanınca → kutlama
 *  - Gece yarısı, cuma akşamı ve pazartesi sabahı → küçük selamlar
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
    if (day === 1 && h < 10) return 'Yeni hafta, yeni sürüm.';
    return null;
};

/**
 * Durum değişikliği bir grubu (ör. sürüm) tamamen bitiriyor mu?
 * Önceden bitmemiş en az bir görev varken değişiklikten sonra hepsi Done ise true.
 */
export const completesGroup = (group: Pick<Task, 'id' | 'status'>[], taskId: string, newStatus: TaskStatus): boolean => {
    if (group.length === 0 || newStatus !== TaskStatus.Done) return false;
    if (!group.some(t => t.id === taskId)) return false;
    const before = group.every(t => t.status === TaskStatus.Done);
    const after = group.every(t => (t.id === taskId ? newStatus : t.status) === TaskStatus.Done);
    return !before && after;
};
