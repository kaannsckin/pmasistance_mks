import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task, Whiteboard } from '../../../types';
import {
    applyOps, diffBoards, MergeState, newMergeState, opItem, peerColor, WbClock, WbMessage, WbOp, WbPeer,
} from '../../../utils/whiteboard/collab';
import { loadProjectItems, resolveWbCloud, saveOps, WbCloud } from '../../../utils/whiteboard/cloudStore';
import { cloudTransport, localTransport, MAX_BROADCAST, WbTransport, WbTransportStatus } from '../../../utils/whiteboard/transport';

/**
 * Projenin panolarını eş zamanlı düzenleme için yönetir:
 *  - yerel değişiklik → op'lar → herkese yayın (+ bulutta satır olarak kalıcı)
 *  - gelen op'lar → son yazan kazanır birleştirmesi
 *  - katılımcılar (varlık), imleçler ve canlı sürükleme (yalnız yayın, kalıcı değil)
 *  - proje kaydı yerel önbellek olarak güncellenir (bulut yokken kalıcı kaynak)
 */

export interface LiveRect { x: number; y: number; w: number; h: number; at: number; color: string }

export interface CollabInfo {
    mode: 'cloud' | 'local' | 'off';
    status: WbTransportStatus;
    /** Kullanıcıya gösterilecek açıklama */
    detail: string;
    self: { client: string; name: string; color: string };
}

const CURSOR_MS = 50, LIVE_MS = 60, PRESENCE_MS = 150, SAVE_MS = 800, FLUSH_MS = 300;

const throttle = <A extends unknown[]>(ms: number, fn: (...a: A) => void) => {
    let last = 0, timer: ReturnType<typeof setTimeout> | null = null, pending: A | null = null;
    return (...a: A) => {
        const now = Date.now();
        pending = a;
        if (now - last >= ms) { last = now; pending = null; fn(...a); return; }
        if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); if (pending) { const p = pending; pending = null; fn(...p); } }, ms - (now - last));
    };
};

export const useWhiteboardCollab = (opts: {
    project: Project;
    actor: string;
    canEdit: boolean;
    onUpdateProject: (updater: (p: Project) => Project) => void;
}) => {
    const { project, actor, canEdit, onUpdateProject } = opts;
    const client = useMemo(() => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, []);
    const color = useMemo(() => peerColor(`${actor}:${client}`), [actor, client]);
    const clock = useRef(new WbClock(client));
    const st = useRef<MergeState>(newMergeState());
    const [boards, setBoards] = useState<Whiteboard[]>(() => project.whiteboards || []);
    const boardsRef = useRef(boards);
    boardsRef.current = boards;
    const [peers, setPeers] = useState<WbPeer[]>([]);
    const [cursors, setCursors] = useState<Record<string, { board: string; x: number; y: number; at: number }>>({});
    const [live, setLive] = useState<Record<string, Record<string, LiveRect>>>({});
    const [info, setInfo] = useState<Omit<CollabInfo, 'self'>>({ mode: 'off', status: 'connecting', detail: 'Bağlanıyor…' });
    const transport = useRef<WbTransport | null>(null);
    const cloud = useRef<WbCloud | null>(null);
    const outbox = useRef<WbOp[]>([]);
    const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateRef = useRef(onUpdateProject);
    updateRef.current = onUpdateProject;
    const presenceRef = useRef<WbPeer>({ client, name: actor, color, at: Date.now() });
    const colorOf = useCallback((c: string) => peers.find(p => p.client === c)?.color || peerColor(c), [peers]);
    const peersRef = useRef(peers);
    peersRef.current = peers;

    // ---- proje kaydı (önbellek / bulut yokken kalıcı kaynak)
    const scheduleSave = useCallback((newTasks?: Task[]) => {
        if (newTasks?.length) {
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = null;
            updateRef.current(p => ({ ...p, whiteboards: boardsRef.current, tasks: [...p.tasks, ...newTasks], updatedAt: new Date().toISOString() }));
            return;
        }
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            saveTimer.current = null;
            updateRef.current(p => (p.whiteboards === boardsRef.current ? p : { ...p, whiteboards: boardsRef.current }));
        }, SAVE_MS);
    }, []);
    // Ayrılırken bekleyen kayıt yazılır
    useEffect(() => () => {
        if (saveTimer.current) { clearTimeout(saveTimer.current); updateRef.current(p => ({ ...p, whiteboards: boardsRef.current })); }
    }, []);

    // ---- bulut kalıcılığı
    const flush = useCallback(async () => {
        flushTimer.current = null;
        const c = cloud.current;
        const ops = outbox.current;
        outbox.current = [];
        if (!c || !ops.length) return;
        const err = await saveOps(c, project.id, ops);
        if (err) {
            outbox.current = [...ops, ...outbox.current];
            setInfo(i => ({ ...i, detail: `Kaydedilemedi: ${err}` }));
            if (!flushTimer.current) flushTimer.current = setTimeout(() => { void flush(); }, 5000);
        }
    }, [project.id]);
    const persist = useCallback((ops: WbOp[]) => {
        if (!cloud.current || !ops.length) return;
        outbox.current.push(...ops);
        if (!flushTimer.current) flushTimer.current = setTimeout(() => { void flush(); }, FLUSH_MS);
    }, [flush]);

    // ---- gelen ve giden op'lar
    const applyIncoming = useCallback((ops: WbOp[]) => {
        ops.forEach(o => clock.current.observe(o.rev));
        const r = applyOps(boardsRef.current, ops, st.current);
        if (!r.applied.length) return;
        boardsRef.current = r.boards;
        setBoards(r.boards);
        // Kalıcı hâli gelen nesnenin canlı sürükleme gölgesi kalkar
        const done = new Set(r.applied.filter(o => o.k === 'node').map(o => `${o.board}|${(o as { id: string }).id}`));
        if (done.size) setLive(l => {
            const next: typeof l = {};
            for (const [b, m] of Object.entries(l)) next[b] = Object.fromEntries(Object.entries(m).filter(([id]) => !done.has(`${b}|${id}`)));
            return next;
        });
        scheduleSave();
    }, [scheduleSave]);

    const broadcastOps = useCallback((ops: WbOp[]) => {
        const t = transport.current;
        if (!t || !ops.length) return;
        if (t.kind === 'cloud') {
            // Büyük op'lar (görsel) yayınlanmaz: alıcı satırı buluttan okur
            const small: WbOp[] = [], big: WbOp[] = [];
            for (const o of ops) (JSON.stringify(o).length > MAX_BROADCAST / 4 ? big : small).push(o);
            if (small.length) t.send({ type: 'ops', from: client, ops: small });
            const byBoard = new Map<string, string[]>();
            big.forEach(o => byBoard.set(o.board, [...(byBoard.get(o.board) || []), opItem(o)]));
            // Satır yazıldıktan sonra haber verilir
            if (byBoard.size) setTimeout(() => byBoard.forEach((items, board) => t.send({ type: 'refetch', from: client, board, items })), FLUSH_MS + 1200);
        } else t.send({ type: 'ops', from: client, ops });
    }, [client]);

    /** Yerel değişiklik: prev → next (düzenleyicinin gördüğü hâle göre fark; başkalarının değişikliği ezilmez) */
    const commitBoard = useCallback((boardId: string, prev: Whiteboard | undefined, next: Whiteboard | undefined, newTasks?: Task[]) => {
        if (!canEdit) return;
        const ops = diffBoards(prev, next, boardId, () => clock.current.tick());
        if (!ops.length && !newTasks?.length) return;
        const r = applyOps(boardsRef.current, ops, st.current);
        boardsRef.current = r.boards;
        setBoards(r.boards);
        broadcastOps(ops);
        persist(ops);
        scheduleSave(newTasks);
    }, [canEdit, broadcastOps, persist, scheduleSave]);

    // ---- bağlantı
    useEffect(() => {
        let disposed = false;
        const handlers = {
            onMessage: (m: WbMessage) => {
                if (m.type === 'ops') applyIncoming(m.ops);
                else if (m.type === 'cursor') setCursors(cs => ({ ...cs, [m.from]: { board: m.board, x: m.x, y: m.y, at: Date.now() } }));
                else if (m.type === 'live') {
                    const now = Date.now();
                    const c = peerColor(m.from);
                    setLive(l => ({ ...l, [m.board]: { ...(l[m.board] || {}), ...Object.fromEntries(m.nodes.map(n => [n.id, { ...n, at: now, color: peersRef.current.find(p => p.client === m.from)?.color || c }])) } }));
                } else if (m.type === 'refetch' && cloud.current) {
                    void loadProjectItems(cloud.current, project.id, { board: m.board, ids: m.items }).then(r => { if (!disposed && 'ops' in r) applyIncoming(r.ops); });
                }
            },
            onPeers: (list: WbPeer[]) => setPeers(list),
            onStatus: (s: WbTransportStatus, detail?: string) => setInfo(i => ({ ...i, status: s, ...(detail ? { detail } : {}) })),
        };
        const goLocal = (detail: string) => {
            if (disposed) return;
            const t = localTransport(project.id, client, handlers);
            transport.current = t;
            setInfo({ mode: t ? 'local' : 'off', status: t ? 'live' : 'closed', detail: t ? detail : 'Bu tarayıcı canlı düzenlemeyi desteklemiyor.' });
            if (t) t.setPresence({ ...presenceRef.current, at: Date.now() });
        };
        (async () => {
            const c = await resolveWbCloud();
            if (disposed) return;
            if (!c) { goLocal('Bulut bağlı değil: bu tarayıcıdaki sekmeler arasında canlı.'); return; }
            const loaded = await loadProjectItems(c, project.id);
            if (disposed) return;
            if (!('ops' in loaded)) {
                goLocal(loaded.missingTable
                    ? 'Bulutta whiteboard tablosu yok (supabase/schema.sql yeniden çalıştırılmalı): yalnız bu tarayıcıda canlı.'
                    : `Bulut panoları okunamadı (${loaded.message}): yalnız bu tarayıcıda canlı.`);
                return;
            }
            cloud.current = c;
            // Buluttaki öğeler yerel önbelleğin üstüne; bulutta olmayan yerel panolar ve öğeler yüklenir
            const local = boardsRef.current;
            loaded.ops.forEach(o => clock.current.observe(o.rev));
            const r = applyOps(local, loaded.ops, st.current);
            const seed: WbOp[] = [];
            if (canEdit) {
                for (const b of r.boards) {
                    if (st.current.deleted.has(b.id)) continue;
                    const all = diffBoards(undefined, b, b.id, () => clock.current.tick());
                    seed.push(...all.filter(o => !st.current.revs.has(`${o.board}|${opItem(o)}`)));
                }
            }
            const merged = seed.length ? applyOps(r.boards, seed, st.current).boards : r.boards;
            const ordered = [...merged].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            boardsRef.current = ordered;
            setBoards(ordered);
            if (seed.length) persist(seed);
            scheduleSave();
            const t = cloudTransport(c.client, c.workspaceId, project.id, client, handlers);
            transport.current = t;
            setInfo({ mode: 'cloud', status: 'connecting', detail: 'Bulut üzerinden canlı: aynı panodaki herkes değişiklikleri anında görür.' });
            t.setPresence({ ...presenceRef.current, at: Date.now() });
        })();
        return () => {
            disposed = true;
            transport.current?.close();
            transport.current = null;
            if (flushTimer.current) { clearTimeout(flushTimer.current); void flush(); }
        };
        // Proje değişince (bileşen anahtarı) yeniden kurulur
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id, client]);

    // Eski imleç ve canlı sürükleme gölgeleri temizlenir
    useEffect(() => {
        const id = window.setInterval(() => {
            const now = Date.now();
            setCursors(cs => { const next = Object.fromEntries(Object.entries(cs).filter(([, c]) => now - (c as { at: number }).at < 15_000)) as typeof cs; return Object.keys(next).length === Object.keys(cs).length ? cs : next; });
            setLive(l => {
                let changed = false;
                const next: typeof l = {};
                for (const [b, m] of Object.entries(l)) { next[b] = Object.fromEntries(Object.entries(m).filter(([, r]) => { const keep = now - r.at < 2500; if (!keep) changed = true; return keep; })); }
                return changed ? next : l;
            });
        }, 1000);
        return () => window.clearInterval(id);
    }, []);

    // ---- varlık, imleç, canlı sürükleme
    const pushPresence = useMemo(() => throttle(PRESENCE_MS, () => transport.current?.setPresence({ ...presenceRef.current, at: Date.now() })), []);
    const setPresence = useCallback((p: Partial<Pick<WbPeer, 'board' | 'selection' | 'editing' | 'cursor'>>) => {
        presenceRef.current = { ...presenceRef.current, ...p, name: actor, color, at: Date.now() };
        pushPresence();
    }, [actor, color, pushPresence]);
    const sendCursor = useMemo(() => throttle(CURSOR_MS, (board: string, x: number, y: number) => transport.current?.send({ type: 'cursor', from: client, board, x: Math.round(x), y: Math.round(y) })), [client]);
    const sendLive = useMemo(() => throttle(LIVE_MS, (board: string, nodes: { id: string; x: number; y: number; w: number; h: number }[]) => transport.current?.send({ type: 'live', from: client, board, nodes })), [client]);

    /** Bir panodaki diğer katılımcılar (imleç konumuyla) */
    const peersOn = useCallback((board: string): WbPeer[] => peers
        .filter(p => p.board === board)
        .map(p => { const c = cursors[p.client]; return c && c.board === board ? { ...p, cursor: { x: c.x, y: c.y } } : p; }), [peers, cursors]);

    return {
        boards,
        info: { ...info, self: { client, name: actor, color } } as CollabInfo,
        peers,
        peersOn,
        liveOn: (board: string) => live[board] || {},
        colorOf,
        commitBoard,
        setPresence,
        sendCursor,
        sendLive,
    };
};

export type WhiteboardCollab = ReturnType<typeof useWhiteboardCollab>;
