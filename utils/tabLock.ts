/**
 * Tek etkin sekme (UI-KRC-02, UI-KRC-13).
 *
 * Çalışma alanı tarayıcının deposunda tek kopyadır; iki sekme aynı anda
 * yazarsa son yazan kazanır ve öteki sekmenin işi sessizce kaybolur. Daha
 * kötüsü, eski hâli açık bir sekme kaydettiğinde yeni durumu geri alır
 * (gönderilen haftalık rapor taslağa döner).
 *
 * Burada yalnız bir sekme yazar: Web Locks ile "yazar" kilidini tutan sekme
 * etkindir; ötekiler edilgendir ve kullanıcıya "başka sekmede açık" denir.
 * Edilgen sekme devralmak isterse etkin sekmeye haber verir; etkin sekme
 * bekleyen yazımlarını bitirip kilidi bırakır, devralan sekme depodan taze
 * veriyle yeniden açılır. Etkin sekme yanıt vermezse kilit zorla alınır.
 *
 * Web Locks ya da BroadcastChannel yoksa (eski tarayıcı) koruma devre dışıdır
 * ve sekme etkin sayılır: eski davranış.
 */

export type TabRole = 'checking' | 'active' | 'passive' | 'released';

export const TAB_LOCK_NAME = 'planasistan-calisma-alani';
export const TAB_CHANNEL_NAME = 'planasistan-sekme';
/** Etkin sekmenin devre yanıt vermesi için beklenen süre; sonra kilit zorla alınır */
export const TAKEOVER_TIMEOUT_MS = 4000;

interface LockLike { name: string }
export interface LockManagerLike {
    request<T>(name: string, options: { ifAvailable?: boolean; steal?: boolean }, callback: (lock: LockLike | null) => Promise<T> | T): Promise<T>;
}
export interface ChannelLike {
    postMessage(message: unknown): void;
    onmessage: ((event: { data: unknown }) => void) | null;
    close(): void;
}

export interface TabLockDeps {
    /** Sekmenin rolü değişince */
    onRole: (role: TabRole) => void;
    /** Kilit bırakılmadan önce: bekleyen yazımları bitir, yeni yazımları durdur */
    beforeRelease: () => Promise<void>;
    /** Devralan sekmenin taze veriyle açılması */
    reload?: () => void;
    locks?: LockManagerLike | null;
    makeChannel?: (name: string) => ChannelLike;
    takeoverTimeoutMs?: number;
}

export interface TabLock {
    start(): void;
    /** Bu sekmeyi etkin yapar (öteki sekme bırakınca ya da zaman aşımında) ve yeniden yükler */
    takeOver(): Promise<void>;
    dispose(): void;
}

const defaultLocks = (): LockManagerLike | null => {
    try { return (typeof navigator !== 'undefined' && (navigator as unknown as { locks?: LockManagerLike }).locks) || null; } catch { return null; }
};
const defaultChannel = (name: string): ChannelLike | null => {
    try { return typeof BroadcastChannel === 'undefined' ? null : (new BroadcastChannel(name) as unknown as ChannelLike); } catch { return null; }
};

export const createTabLock = (deps: TabLockDeps): TabLock => {
    const { onRole, beforeRelease } = deps;
    const reload = deps.reload || (() => window.location.reload());
    const locks = deps.locks === undefined ? defaultLocks() : deps.locks;
    const channel = deps.makeChannel ? deps.makeChannel(TAB_CHANNEL_NAME) : defaultChannel(TAB_CHANNEL_NAME);
    const timeoutMs = deps.takeoverTimeoutMs ?? TAKEOVER_TIMEOUT_MS;

    if (!locks || !channel) {
        return { start: () => onRole('active'), takeOver: async () => {}, dispose: () => channel?.close() };
    }

    let release: (() => void) | null = null;
    let releasing = false;
    let disposed = false;

    const stepDown = async () => {
        if (releasing) return;
        releasing = true;
        try { await beforeRelease(); } catch (e) { console.error('Sekme devrinde yazımlar tamamlanamadı', e); }
        onRole('released');
        const r = release;
        release = null;
        r?.();
    };

    channel.onmessage = event => {
        const data = event.data as { tur?: string } | null;
        if (data?.tur === 'devral' && release) void stepDown();
    };

    return {
        start() {
            locks.request(TAB_LOCK_NAME, { ifAvailable: true }, async lock => {
                if (disposed) return;
                if (!lock) { onRole('passive'); return; }
                onRole('active');
                // Kilit, devir istenene ya da sekme kapanana kadar tutulur
                await new Promise<void>(resolve => { release = resolve; });
            }).catch(() => {
                // Kilit başka sekmece zorla alındı (yanıt vermedik): artık yazmıyoruz
                if (!disposed && !releasing) { releasing = true; release = null; void beforeRelease().catch(() => {}); onRole('released'); }
            });
        },
        async takeOver() {
            channel.postMessage({ tur: 'devral' });
            let timer: ReturnType<typeof setTimeout> | undefined;
            const freed = locks.request(TAB_LOCK_NAME, {}, async () => {}).then(() => true);
            const timedOut = new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); });
            const ok = await Promise.race([freed, timedOut]);
            if (timer) clearTimeout(timer);
            if (!ok) await locks.request(TAB_LOCK_NAME, { steal: true }, async () => {});
            reload();
        },
        dispose() {
            disposed = true;
            channel.close();
            const r = release;
            release = null;
            r?.();
        },
    };
};
