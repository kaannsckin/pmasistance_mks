import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task, Whiteboard } from '../../../types';
import {
    applyOps, diffBoards, MergeState, metaOf, newMergeState, opItem, peerColor, WbClock, WbMessage, WbOp, WbPeer,
} from '../../../utils/whiteboard/collab';
import { boardRole, canCreateBoard, canEditBoard, WbViewer } from '../../../utils/whiteboard/access';
import { loadProjectItems, resolveWbCloud, saveOps, WbCloud } from '../../../utils/whiteboard/cloudStore';
import {
    boardTopic, cloudTransport, localTransport, MAX_BROADCAST, projectTopic, WbTransport, WbTransportHandlers, WbTransportStatus,
} from '../../../utils/whiteboard/transport';

/**
 * Projenin panolarını eş zamanlı düzenleme için yönetir:
 *  - yerel değişiklik → yetki denetimi → op'lar → yayın (+ bulutta satır olarak kalıcı)
 *  - gelen op'lar → son yazan kazanır birleştirmesi
 *  - katılımcılar (varlık), imleçler ve canlı sürükleme (yalnız yayın, kalıcı değil)
 *  - proje kaydı yerel önbellek olarak güncellenir (bulut yokken kalıcı kaynak)
 *
 * Bulutta iki kanal: proje kanalı (kim var, pano listesi değişti bildirimi;
 * içerik yok) ve açık panonun kanalı (içerik, imleç, seçim). Özel panonun
 * içeriği yalnız onu görebilenlere gider. Bulut yokken tek kanal (sekmeler arası).
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

/** Değişikliğin gerektirdiği yetki; yoksa neden reddedildiği */
export const commitDenied = (prev: Whiteboard | undefined, next: Whiteboard | undefined, viewer: WbViewer): string | null => {
    if (!prev) return canCreateBoard(viewer) ? null : 'Pano açmak için profilinizde kişi seçili olmalı.';
    const role = boardRole(prev, viewer);
    if (!next) return role === 'manage' ? null : 'Panoyu yalnız sahibi ya da projenin PY\'si silebilir.';
    const a = metaOf(prev), b = metaOf(next);
    if ((JSON.stringify(a.access || null) !== JSON.stringify(b.access || null) || a.ownerId !== b.ownerId) && role !== 'manage') return 'Erişimi yalnız panonun sahibi ya da projenin PY\'si değiştirebilir.';
    return canEditBoard(role) ? null : 'Bu panoyu yalnız görüntüleyebilirsiniz.';
};

export const useWhiteboardCollab = (opts: {
    project: Project;
    actor: string;
    viewer: WbViewer;
    onUpdateProject: (updater: (p: Project) => Project) => void;
}) => {
    const { project, actor, viewer, onUpdateProject } = opts;
    const client = useMemo(() => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, []);
    const color = useMemo(() => peerColor(`${actor}:${client}`), [actor, client]);
    const clock = useRef(new WbClock(client));
    const st = useRef<MergeState>(newMergeState());
    const [boards, setBoards] = useState<Whiteboard[]>(() => project.whiteboards || []);
    const boardsRef = useRef(boards);
    boardsRef.current = boards;
    const viewerRef = useRef(viewer);
    viewerRef.current = viewer;
    const [projectPeers, setProjectPeers] = useState<WbPeer[]>([]);
    const [boardPeers, setBoardPeers] = useState<WbPeer[]>([]);
    const [cursors, setCursors] = useState<Record<string, { board: string; x: number; y: number; at: number }>>({});
    const [live, setLive] = useState<Record<string, Record<string, LiveRect>>>({});
    const [info, setInfo] = useState<Omit<CollabInfo, 'self'>>({ mode: 'off', status: 'connecting', detail: 'Bağlanıyor…' });
    const [denied, setDenied] = useState<string | null>(null);
    /** Bulut kipinde: proje kanalı; bulut yokken tek kanal */
    const projectT = useRef<WbTransport | null>(null);
    /** Bulut kipinde açık panonun kanalı */
    const boardT = useRef<WbTransport | null>(null);
    const cloud = useRef<WbCloud | null>(null);
    const [cloudReady, setCloudReady] = useState(false);
    const [activeBoard, setActiveBoard] = useState<string | undefined>(undefined);
    const outbox = useRef<WbOp[]>([]);
    const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateRef = useRef(onUpdateProject);
    updateRef.current = onUpdateProject;
    const presenceRef = useRef<WbPeer>({ client, name: actor, color, at: Date.now() });
    const peersRef = useRef<WbPeer[]>([]);
    const disposedRef = useRef(false);

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
            // Yetki hatası tekrar denenmez (sunucu kuralı değişmedikçe aynı sonuç)
            if (/yetkiniz yok/.test(err)) { setDenied(err); return; }
            outbox.current = [...ops, ...outbox.current];
            setInfo(i => ({ ...i, detail: `Kaydedilemedi: ${err}` }));
            if (!flushTimer.current) flushTimer.current = setTimeout(() => { void flush(); }, 5000);
            return;
        }
        // Pano listesi değiştiyse (açıldı, ad / erişim, silindi) projedekilere haber verilir
        if (ops.some(o => o.k === 'meta')) projectT.current?.send({ type: 'boards', from: client });
    }, [project.id, client]);
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

    /** İçerik mesajı: bulutta yalnız açık panonun kanalından (o panoyu görebilenler), bulut yokken tek kanaldan */
    const contentChannel = (board: string): WbTransport | null =>
        cloud.current ? (board === activeRef.current ? boardT.current : null) : projectT.current;
    const activeRef = useRef<string | undefined>(undefined);
    activeRef.current = activeBoard;

    const broadcastOps = useCallback((ops: WbOp[]) => {
        const byBoard = new Map<string, WbOp[]>();
        ops.forEach(o => byBoard.set(o.board, [...(byBoard.get(o.board) || []), o]));
        for (const [board, list] of byBoard) {
            const t = contentChannel(board);
            if (!t) continue; // başka pano: kalıcı yazım + "pano listesi" bildirimi yeter
            if (t.kind === 'cloud') {
                // Büyük op'lar (görsel) yayınlanmaz: alıcı satırı buluttan okur
                const small = list.filter(o => JSON.stringify(o).length <= MAX_BROADCAST / 4);
                const big = list.filter(o => JSON.stringify(o).length > MAX_BROADCAST / 4);
                if (small.length) t.send({ type: 'ops', from: client, ops: small });
                if (big.length) setTimeout(() => t.send({ type: 'refetch', from: client, board, items: big.map(opItem) }), FLUSH_MS + 1200);
            } else t.send({ type: 'ops', from: client, ops: list });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client]);

    /**
     * Yerel değişiklik: prev → next (düzenleyicinin gördüğü hâle göre fark;
     * başkalarının değişikliği ezilmez). Yetkisiz değişiklik uygulanmaz.
     */
    const commitBoard = useCallback((boardId: string, prev: Whiteboard | undefined, next: Whiteboard | undefined, newTasks?: Task[]): boolean => {
        const why = commitDenied(prev, next, viewerRef.current);
        if (why) { setDenied(why); return false; }
        const ops = diffBoards(prev, next, boardId, () => clock.current.tick());
        if (!ops.length && !newTasks?.length) return true;
        const r = applyOps(boardsRef.current, ops, st.current);
        boardsRef.current = r.boards;
        setBoards(r.boards);
        broadcastOps(ops);
        persist(ops);
        if (!cloud.current && ops.some(o => o.k === 'meta')) projectT.current?.send({ type: 'boards', from: client });
        scheduleSave(newTasks);
        return true;
    }, [broadcastOps, persist, scheduleSave, client]);

    // ---- mesajlar
    const reloadMeta = useCallback(async () => {
        const c = cloud.current;
        if (!c) return;
        const r = await loadProjectItems(c, project.id, { metaOnly: true });
        if (disposedRef.current || !('ops' in r)) return;
        // Görünürlüğü kalkan panolar (erişim değişti): sunucu artık göstermiyor → yerelden düşer
        const visible = new Set(r.ops.map(o => o.board));
        const gone = boardsRef.current.filter(b => !visible.has(b.id)).map(b => b.id);
        applyIncoming(r.ops);
        if (gone.length) {
            gone.forEach(id => st.current.deleted.add(id));
            boardsRef.current = boardsRef.current.filter(b => !gone.includes(b.id));
            setBoards(boardsRef.current);
            scheduleSave();
        }
    }, [project.id, applyIncoming, scheduleSave]);

    const handlers = useCallback((which: 'project' | 'board'): WbTransportHandlers => ({
        onMessage: (m: WbMessage) => {
            if (m.type === 'ops') applyIncoming(m.ops);
            else if (m.type === 'boards') { if (cloud.current) void reloadMeta(); }
            else if (m.type === 'cursor') setCursors(cs => ({ ...cs, [m.from]: { board: m.board, x: m.x, y: m.y, at: Date.now() } }));
            else if (m.type === 'live') {
                const now = Date.now();
                const c = peersRef.current.find(p => p.client === m.from)?.color || peerColor(m.from);
                setLive(l => ({ ...l, [m.board]: { ...(l[m.board] || {}), ...Object.fromEntries(m.nodes.map(n => [n.id, { ...n, at: now, color: c }])) } }));
            } else if (m.type === 'refetch' && cloud.current) {
                void loadProjectItems(cloud.current, project.id, { board: m.board, ids: m.items }).then(r => { if (!disposedRef.current && 'ops' in r) applyIncoming(r.ops); });
            }
        },
        onPeers: (list: WbPeer[]) => (which === 'project' ? setProjectPeers(list) : setBoardPeers(list)),
        onStatus: (s: WbTransportStatus, detail?: string) => { if (which === 'project') setInfo(i => ({ ...i, status: s, ...(detail ? { detail } : {}) })); },
    }), [applyIncoming, reloadMeta, project.id]);

    // ---- bağlantı (proje)
    useEffect(() => {
        disposedRef.current = false;
        const goLocal = (detail: string) => {
            if (disposedRef.current) return;
            const t = localTransport(project.id, client, handlers('project'));
            projectT.current = t;
            setInfo({ mode: t ? 'local' : 'off', status: t ? 'live' : 'closed', detail: t ? detail : 'Bu tarayıcı canlı düzenlemeyi desteklemiyor.' });
            if (t) t.setPresence({ ...presenceRef.current, at: Date.now() });
        };
        (async () => {
            const c = await resolveWbCloud();
            if (disposedRef.current) return;
            if (!c) { goLocal('Bulut bağlı değil: bu tarayıcıdaki sekmeler arasında canlı.'); return; }
            const loaded = await loadProjectItems(c, project.id);
            if (disposedRef.current) return;
            if (!('ops' in loaded)) {
                goLocal(loaded.missingTable
                    ? 'Bulutta whiteboard tablosu yok (supabase/schema.sql yeniden çalıştırılmalı): yalnız bu tarayıcıda canlı.'
                    : `Bulut panoları okunamadı (${loaded.message}): yalnız bu tarayıcıda canlı.`);
                return;
            }
            cloud.current = c;
            // Buluttaki öğeler yerel önbelleğin üstüne; bulutta görünmeyen yerel panolar:
            // sahibi ya da PY ise yüklenir, değilse (erişimi kalkmış) önbellekten düşer
            const local = boardsRef.current;
            loaded.ops.forEach(o => clock.current.observe(o.rev));
            const r = applyOps(local, loaded.ops, st.current);
            const inCloud = new Set(loaded.ops.map(o => o.board));
            const v = viewerRef.current;
            const seed: WbOp[] = [];
            const keep: Whiteboard[] = [];
            for (const b of r.boards) {
                if (st.current.deleted.has(b.id)) continue;
                if (!inCloud.has(b.id)) {
                    const mine = v.projectEditor || (!!b.ownerId && b.ownerId === v.personId);
                    if (!mine) continue;
                    seed.push(...diffBoards(undefined, b.ownerId || !v.personId ? b : { ...b, ownerId: v.personId }, b.id, () => clock.current.tick()));
                } else if (canEditBoard(boardRole(b, v))) {
                    // Bulutta olmayan yerel öğeler (çevrimdışı eklenenler) yüklenir
                    seed.push(...diffBoards(undefined, b, b.id, () => clock.current.tick()).filter(o => !st.current.revs.has(`${o.board}|${opItem(o)}`)));
                }
                keep.push(b);
            }
            const merged = seed.length ? applyOps(keep, seed, st.current).boards : keep;
            const ordered = [...merged].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            boardsRef.current = ordered;
            setBoards(ordered);
            if (seed.length) persist(seed);
            scheduleSave();
            const t = cloudTransport(c.client, projectTopic(c.workspaceId, project.id), client, handlers('project'));
            projectT.current = t;
            setInfo({ mode: 'cloud', status: 'connecting', detail: 'Bulut üzerinden canlı: aynı panodaki herkes değişiklikleri anında görür.' });
            t.setPresence({ ...presenceRef.current, at: Date.now() });
            setCloudReady(true);
        })();
        return () => {
            disposedRef.current = true;
            projectT.current?.close();
            projectT.current = null;
            boardT.current?.close();
            boardT.current = null;
            setCloudReady(false);
            if (flushTimer.current) { clearTimeout(flushTimer.current); void flush(); }
        };
        // Proje değişince (bileşen anahtarı) yeniden kurulur
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id, client]);

    // ---- bağlantı (açık pano, bulut): panoya geçince güncel hâli okunur ve kanalına katılınır
    useEffect(() => {
        const c = cloud.current;
        if (!cloudReady || !c || !activeBoard) return;
        let closed = false;
        void loadProjectItems(c, project.id, { board: activeBoard }).then(r => { if (!closed && 'ops' in r) applyIncoming(r.ops); });
        const t = cloudTransport(c.client, boardTopic(c.workspaceId, project.id, activeBoard), client, handlers('board'));
        boardT.current = t;
        t.setPresence({ ...presenceRef.current, at: Date.now() });
        return () => { closed = true; t.close(); if (boardT.current === t) boardT.current = null; setBoardPeers([]); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cloudReady, activeBoard, project.id, client]);

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
    const pushPresence = useMemo(() => throttle(PRESENCE_MS, () => {
        const me = { ...presenceRef.current, at: Date.now() };
        if (cloud.current) {
            // Proje kanalına yalnız kim olduğu ve hangi panoda olduğu gider (seçim / imleç pano kanalında)
            projectT.current?.setPresence({ client: me.client, name: me.name, color: me.color, board: me.board, at: me.at });
            boardT.current?.setPresence(me);
        } else projectT.current?.setPresence(me);
    }), []);
    const setPresence = useCallback((p: Partial<Pick<WbPeer, 'board' | 'selection' | 'editing' | 'cursor'>>) => {
        presenceRef.current = { ...presenceRef.current, ...p, name: actor, color, at: Date.now() };
        if ('board' in p) setActiveBoard(p.board);
        pushPresence();
    }, [actor, color, pushPresence]);
    const sendCursor = useMemo(() => throttle(CURSOR_MS, (board: string, x: number, y: number) => contentChannel(board)?.send({ type: 'cursor', from: client, board, x: Math.round(x), y: Math.round(y) })), [client]);
    const sendLive = useMemo(() => throttle(LIVE_MS, (board: string, nodes: { id: string; x: number; y: number; w: number; h: number }[]) => contentChannel(board)?.send({ type: 'live', from: client, board, nodes })), [client]);

    const peers = projectPeers;
    peersRef.current = cloud.current ? [...projectPeers, ...boardPeers] : projectPeers;

    /** Bir panodaki diğer katılımcılar (seçim, düzenleme ve imleç konumuyla) */
    const peersOn = useCallback((board: string): WbPeer[] => {
        const list = cloud.current && board === activeBoard ? boardPeers : projectPeers.filter(p => p.board === board);
        return list.map(p => { const c = cursors[p.client]; return c && c.board === board ? { ...p, cursor: { x: c.x, y: c.y } } : p; });
    }, [projectPeers, boardPeers, cursors, activeBoard]);

    return {
        boards,
        info: { ...info, self: { client, name: actor, color } } as CollabInfo,
        peers,
        peersOn,
        liveOn: (board: string) => live[board] || {},
        commitBoard,
        setPresence,
        sendCursor,
        sendLive,
        /** Son reddedilen değişikliğin nedeni (kullanıcıya gösterilir) */
        denied,
        clearDenied: () => setDenied(null),
    };
};

export type WhiteboardCollab = ReturnType<typeof useWhiteboardCollab>;
