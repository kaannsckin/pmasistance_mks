import { describe, expect, it } from 'vitest';
import { ChannelLike, createTabLock, LockManagerLike, TabRole } from './tabLock';

/** Tek adlı, sıralı, ifAvailable ve steal destekli sahte Web Locks */
class FakeLocks implements LockManagerLike {
    private holder: { reject: (e: unknown) => void } | null = null;
    private queue: (() => void)[] = [];

    request<T>(name: string, options: { ifAvailable?: boolean; steal?: boolean }, callback: (lock: { name: string } | null) => Promise<T> | T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const run = () => {
                const held = { reject };
                this.holder = held;
                Promise.resolve().then(() => callback({ name })).then(
                    v => { if (this.holder === held) { this.holder = null; this.queue.shift()?.(); } resolve(v); },
                    e => { if (this.holder === held) { this.holder = null; this.queue.shift()?.(); } reject(e); },
                );
            };
            if (options.steal) {
                const h = this.holder;
                this.holder = null;
                h?.reject(new Error('AbortError'));
                run();
            } else if (!this.holder) run();
            else if (options.ifAvailable) Promise.resolve(callback(null)).then(resolve, reject);
            else this.queue.push(run);
        });
    }
}

/** Aynı adlı kanallar arasında (kendisi hariç) ileti taşıyan sahte BroadcastChannel */
const bus = () => {
    const members = new Set<ChannelLike>();
    return (): ChannelLike => {
        const ch: ChannelLike = {
            onmessage: null,
            postMessage(message) { members.forEach(m => { if (m !== ch) setTimeout(() => m.onmessage?.({ data: message }), 0); }); },
            close() { members.delete(ch); },
        };
        members.add(ch);
        return ch;
    };
};

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

const tab = (locks: LockManagerLike, makeChannel: () => ChannelLike, opts: { slowRelease?: boolean; deaf?: boolean } = {}) => {
    const roles: TabRole[] = [];
    let released = 0;
    let reloaded = 0;
    const lock = createTabLock({
        onRole: r => roles.push(r),
        beforeRelease: async () => { released++; if (opts.slowRelease) await tick(5); },
        reload: () => { reloaded++; },
        locks,
        makeChannel: () => {
            const ch = makeChannel();
            // Yanıt vermeyen sekme: devir iletisini hiç işlemez
            if (opts.deaf) return { ...ch, set onmessage(_: ChannelLike['onmessage']) { /* yok sayılır */ }, get onmessage() { return null; } } as ChannelLike;
            return ch;
        },
        takeoverTimeoutMs: 30,
    });
    return { lock, roles, get released() { return released; }, get reloaded() { return reloaded; } };
};

describe('tek etkin sekme (UI-KRC-02, UI-KRC-13)', () => {
    it('ilk sekme etkin, ikincisi edilgen', async () => {
        const locks = new FakeLocks();
        const ch = bus();
        const a = tab(locks, ch); a.lock.start();
        await tick();
        const b = tab(locks, ch); b.lock.start();
        await tick();
        expect(a.roles).toEqual(['active']);
        expect(b.roles).toEqual(['passive']);
    });

    it('devralma: etkin sekme yazımlarını bitirip bırakır, devralan yeniden yüklenir', async () => {
        const locks = new FakeLocks();
        const ch = bus();
        const a = tab(locks, ch, { slowRelease: true }); a.lock.start();
        await tick();
        const b = tab(locks, ch); b.lock.start();
        await tick();
        await b.lock.takeOver();
        expect(a.released).toBe(1);
        expect(a.roles).toEqual(['active', 'released']);
        expect(b.reloaded).toBe(1);
    });

    it('yeniden yüklenen sekme kilidi alır; devreden sekme artık edilgen kalır', async () => {
        const locks = new FakeLocks();
        const ch = bus();
        const a = tab(locks, ch); a.lock.start();
        await tick();
        const b = tab(locks, ch); b.lock.start();
        await tick();
        await b.lock.takeOver();
        // Yeniden yüklenmiş b: yeni bir sekme gibi başlar
        const b2 = tab(locks, ch); b2.lock.start();
        await tick();
        expect(b2.roles).toEqual(['active']);
        expect(a.roles.at(-1)).toBe('released');
    });

    it('etkin sekme yanıt vermezse kilit zaman aşımında zorla alınır ve o sekme yazmayı bırakır', async () => {
        const locks = new FakeLocks();
        const ch = bus();
        const a = tab(locks, ch, { deaf: true }); a.lock.start();
        await tick();
        const b = tab(locks, ch); b.lock.start();
        await tick();
        await b.lock.takeOver();
        await tick();
        expect(b.reloaded).toBe(1);
        expect(a.roles).toEqual(['active', 'released']);
        expect(a.released).toBe(1);
    });

    it('Web Locks yoksa koruma devre dışı: sekme etkin sayılır', () => {
        const roles: TabRole[] = [];
        const lock = createTabLock({ onRole: r => roles.push(r), beforeRelease: async () => {}, locks: null, makeChannel: bus() });
        lock.start();
        expect(roles).toEqual(['active']);
    });
});
