import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudTransport, JOIN_TIMEOUT_MS, NO_SOCKET_DETAIL } from './transport';

/** WebSocket hiç açılamayan Realtime: subscribe geri çağrısı hiç gelmez (ya da sonradan gelir) */
const fakeClient = () => {
    let cb: ((s: string) => void) | null = null;
    const channel = { on: () => channel, subscribe: (f: (s: string) => void) => { cb = f; return channel; }, track: vi.fn(), send: vi.fn(), presenceState: () => ({}) };
    const client = { realtime: { setAuth: async () => undefined }, channel: () => channel, removeChannel: vi.fn() } as unknown as SupabaseClient;
    return { client, fire: (s: string) => cb?.(s) };
};

describe('canlı kanal bağlantısı', () => {
    afterEach(() => vi.useRealTimers());

    it('katılım zaman aşımında hata bildirir; sonradan bağlanırsa canlıya döner; kapanınca zamanlayıcı durur', async () => {
        vi.useFakeTimers();
        const { client, fire } = fakeClient();
        const onStatus = vi.fn();
        cloudTransport(client, 'wb:x:y', 'me', { onMessage: vi.fn(), onPeers: vi.fn(), onStatus });
        await vi.advanceTimersByTimeAsync(JOIN_TIMEOUT_MS - 1);
        expect(onStatus.mock.calls).toEqual([['connecting']]);
        await vi.advanceTimersByTimeAsync(1);
        expect(onStatus).toHaveBeenLastCalledWith('error', NO_SOCKET_DETAIL);
        fire('SUBSCRIBED');
        expect(onStatus).toHaveBeenLastCalledWith('live');

        const quiet = vi.fn();
        const t = cloudTransport(fakeClient().client, 'wb:x:z', 'me', { onMessage: vi.fn(), onPeers: vi.fn(), onStatus: quiet });
        t.close();
        await vi.advanceTimersByTimeAsync(JOIN_TIMEOUT_MS * 2);
        expect(quiet.mock.calls).toEqual([['connecting'], ['closed']]);
    });
});
