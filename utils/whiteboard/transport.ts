import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { WbMessage, WbPeer } from './collab';

/**
 * Whiteboard canlı iletimi.
 *
 *  - cloud: Supabase Realtime özel kanalları. Proje kanalı `wb:<çalışma
 *    alanı>:<proje>` kimin nerede olduğunu ve pano listesi değişikliğini
 *    taşır (içerik yok); pano kanalı `wbb:…:<pano>` op, imleç, seçim ve canlı
 *    sürüklemeyi taşır. Kanallara yalnız yetkisi olan üyeler katılır
 *    (realtime.messages RLS; bkz. supabase/schema.sql): özel panonun içeriği
 *    projenin diğer üyelerine yayınlanmaz.
 *  - local: aynı tarayıcıdaki sekmeler arası BroadcastChannel (bulut yokken).
 */

export type WbTransportStatus = 'connecting' | 'live' | 'error' | 'closed';

export interface WbTransportHandlers {
    onMessage: (msg: WbMessage) => void;
    onPeers: (peers: WbPeer[]) => void;
    onStatus: (s: WbTransportStatus, detail?: string) => void;
}

export interface WbTransport {
    kind: 'cloud' | 'local';
    send: (msg: WbMessage) => void;
    setPresence: (peer: WbPeer) => void;
    close: () => void;
}

const PEER_TTL = 12_000;

/** Aynı tarayıcıdaki sekmeler: varlık kalp atışıyla (3 sn), 12 sn sessiz kalan düşer */
export const localTransport = (projectId: string, self: string, h: WbTransportHandlers): WbTransport | null => {
    if (typeof BroadcastChannel === 'undefined') return null;
    const ch = new BroadcastChannel(`planasistan-wb:${projectId}`);
    const peers = new Map<string, WbPeer>();
    let mine: WbPeer | null = null;
    const emit = () => h.onPeers([...peers.values()]);
    const post = (m: WbMessage) => { try { ch.postMessage(m); } catch { /* kapalı */ } };
    ch.onmessage = (e: MessageEvent<WbMessage>) => {
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === 'presence') { if (m.peer.client !== self) { peers.set(m.peer.client, { ...m.peer, at: Date.now() }); emit(); } return; }
        if (m.type === 'bye') { if (peers.delete(m.from)) emit(); return; }
        if (m.type === 'hello') { if (mine) post({ type: 'presence', peer: mine }); return; }
        if ('from' in m && m.from === self) return;
        h.onMessage(m);
    };
    const beat = window.setInterval(() => {
        if (mine) post({ type: 'presence', peer: { ...mine, at: Date.now() } });
        const now = Date.now();
        let changed = false;
        for (const [k, p] of peers) if (now - p.at > PEER_TTL) { peers.delete(k); changed = true; }
        if (changed) emit();
    }, 3000);
    post({ type: 'hello', from: self });
    h.onStatus('live');
    const bye = () => post({ type: 'bye', from: self });
    window.addEventListener('pagehide', bye);
    return {
        kind: 'local',
        send: post,
        setPresence: peer => { mine = peer; post({ type: 'presence', peer }); },
        close: () => { bye(); window.clearInterval(beat); window.removeEventListener('pagehide', bye); ch.close(); h.onStatus('closed'); },
    };
};

/** Yayın mesajı sınırı (Supabase Realtime ~256 KB); büyük op'lar satırdan okunur */
export const MAX_BROADCAST = 180_000;

/** Kanal adları: proje (kim var, pano listesi) ve pano (içerik); RLS bkz. schema.sql › can_join_whiteboard_topic */
export const projectTopic = (workspaceId: string, projectId: string) => `wb:${workspaceId}:${projectId}`;
export const boardTopic = (workspaceId: string, projectId: string, boardId: string) => `wbb:${workspaceId}:${projectId}:${boardId}`;

/** Kanala bu sürede katılınamazsa hata bildirilir (WebSocket hiç açılamazsa Realtime sessizce bekler) */
export const JOIN_TIMEOUT_MS = 15_000;
export const NO_SOCKET_DETAIL = 'Canlı kanala bağlanılamadı: ağ (kurum güvenlik duvarı ya da vekil sunucu) WebSocket bağlantısına izin vermiyor olabilir. Değişiklikleriniz yine buluta kaydedilir; başkalarının değişiklikleri 20 saniyede bir yenilenir.';

export const cloudTransport = (client: SupabaseClient, topic: string, self: string, h: WbTransportHandlers): WbTransport => {
    let mine: WbPeer | null = null;
    let joined = false;
    let channel: RealtimeChannel | null = null;
    let closed = false;
    h.onStatus('connecting');
    const timeout = setTimeout(() => { if (!closed && !joined) h.onStatus('error', NO_SOCKET_DETAIL); }, JOIN_TIMEOUT_MS);
    const start = async () => {
        try {
            // Özel kanal: oturum jetonuyla yetkilendirilir (RLS)
            await client.realtime.setAuth();
        } catch { /* jeton yoksa abone olurken hata döner */ }
        if (closed) return;
        channel = client.channel(topic, { config: { private: true, broadcast: { self: false }, presence: { key: self } } });
        channel
            .on('broadcast', { event: 'msg' }, ({ payload }) => { const m = payload as WbMessage; if (m && (!('from' in m) || m.from !== self)) h.onMessage(m); })
            .on('presence', { event: 'sync' }, () => {
                const state = channel!.presenceState<WbPeer & { presence_ref?: string }>();
                const list: WbPeer[] = [];
                for (const [key, metas] of Object.entries(state)) {
                    if (key === self || !metas.length) continue;
                    const { presence_ref: _r, ...p } = metas[metas.length - 1];
                    list.push(p as WbPeer);
                }
                h.onPeers(list);
            })
            .subscribe(status => {
                if (closed) return;
                if (status === 'SUBSCRIBED') { joined = true; clearTimeout(timeout); h.onStatus('live'); if (mine) void channel!.track(mine); }
                else if (status === 'CHANNEL_ERROR') h.onStatus('error', 'Canlı kanala bağlanılamadı (yetki ya da Realtime ayarı).');
                else if (status === 'TIMED_OUT') h.onStatus('error', 'Canlı kanal zaman aşımına uğradı.');
                else if (status === 'CLOSED') { joined = false; h.onStatus('closed'); }
            });
    };
    void start();
    return {
        kind: 'cloud',
        send: m => {
            if (!channel || !joined) return;
            void channel.send({ type: 'broadcast', event: 'msg', payload: m });
        },
        setPresence: peer => { mine = peer; if (channel && joined) void channel.track(peer); },
        close: () => { closed = true; clearTimeout(timeout); if (channel) void client.removeChannel(channel); h.onStatus('closed'); },
    };
};
