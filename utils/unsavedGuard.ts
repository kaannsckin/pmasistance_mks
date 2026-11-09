/**
 * Kaydedilmemiş iş koruması (UI-KRC-04, UI-KRC-09).
 *
 * Düzenleyiciler (haftalık rapor, görev formu) kaydedilmemiş değişiklikleri buraya bildirir.
 * Uygulama ekran değiştirmeden, proje ya da arayüz değiştirmeden önce confirmLeave() sorar;
 * sayfa yenilenir ya da kapanırsa tarayıcının kendi uyarısı (beforeunload) çıkar.
 */

const DEFAULT_MESSAGE = 'Kaydedilmemiş değişiklikler var. Çıkılsın mı?';
const dirty = new Map<string, string>();
let listening = false;

const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!dirty.size) return;
    e.preventDefault();
    e.returnValue = '';
};

const sync = () => {
    if (typeof window === 'undefined') return;
    if (dirty.size && !listening) { window.addEventListener('beforeunload', onBeforeUnload); listening = true; }
    else if (!dirty.size && listening) { window.removeEventListener('beforeunload', onBeforeUnload); listening = false; }
};

export const markUnsaved = (key: string, message: string = DEFAULT_MESSAGE): void => { dirty.set(key, message); sync(); };
export const clearUnsaved = (key: string): void => { if (dirty.delete(key)) sync(); };
export const hasUnsaved = (): boolean => dirty.size > 0;
/** İlk kaydedilmemiş işin açıklaması, soru kısmı olmadan ("…var." ); yoksa null */
export const unsavedSummary = (): string | null => {
    if (!dirty.size) return null;
    return [...dirty.values()][0].replace(/\s*[^.?!]*\?\s*$/, '').trim() || 'Kaydedilmemiş değişiklikler var.';
};

/**
 * Kaydedilmemiş iş varsa kullanıcıya sorar. Ayrılmak uygunsa true döner ve kayıtları temizler
 * (aynı ayrılışta ikinci kez sorulmaz).
 */
export const confirmLeave = (ask: (message: string) => boolean = m => window.confirm(m)): boolean => {
    if (!dirty.size) return true;
    const message = [...dirty.values()][0];
    if (!ask(message)) return false;
    dirty.clear();
    sync();
    return true;
};
