/**
 * Yıkıcı işlem onayı (UI-KRC-03, UI-KRC-15).
 *
 * Çift tıkta ikinci tık, ilk onay penceresi kapandıktan hemen sonra işlenir; listeler kaydığı
 * için çoğu zaman bir sonraki satırın çöp kutusuna denk gelir ve refleksle onaylanır. İlk onay
 * kapandıktan kısa süre içinde gelen yeni bir onay isteği yok sayılır.
 */

export const DOUBLE_CLICK_WINDOW_MS = 700;
let lastClosedAt = -Infinity;

export const confirmDestructive = (
    message: string,
    ask: (message: string) => boolean = m => window.confirm(m),
    now: () => number = () => Date.now(),
): boolean => {
    if (now() - lastClosedAt < DOUBLE_CLICK_WINDOW_MS) return false;
    const ok = ask(message);
    lastClosedAt = now();
    return ok;
};

/** Testler için */
export const resetConfirmDestructive = (): void => { lastClosedAt = -Infinity; };
