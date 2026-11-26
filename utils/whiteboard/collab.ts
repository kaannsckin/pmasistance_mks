import type { WbEdge, WbNode, Whiteboard } from '../../types';

/**
 * Whiteboard eş zamanlı düzenleme: işlem (op) modeli ve birleştirme.
 *
 * Pano, bağımsız öğelerden oluşur: pano bilgisi (ad, oylama, zamanlayıcı),
 * her nesne, her bağlantı ve her (nesne, kişi) oyu. Her öğe kendi sürümüyle
 * (rev: zaman damgası + istemci) "son yazan kazanır" kuralıyla birleşir:
 * farklı nesneler üzerinde aynı anda çalışan kişiler birbirini ezmez, oylar
 * kişi bazında toplanır. İşlemler sırasız ve tekrarlı gelebilir; sonuç aynıdır.
 *
 * Saf modül: taşıma (Supabase Realtime, BroadcastChannel) ve kalıcılık ayrı.
 */

export interface Rev { t: number; by: string }

/** a, b'den yeni mi (eşitlikte istemci kimliği belirler: herkes aynı sonuca varır) */
export const revGt = (a: Rev, b: Rev): boolean => a.t > b.t || (a.t === b.t && a.by > b.by);

export type WbMeta = Pick<Whiteboard, 'name' | 'createdAt'> & Partial<Pick<Whiteboard, 'voting' | 'timer' | 'createdBy' | 'ownerId' | 'access'>>;

export type WbOp =
    | { k: 'meta'; board: string; meta: WbMeta | null; rev: Rev }
    | { k: 'node'; board: string; id: string; node: WbNode | null; rev: Rev }
    | { k: 'edge'; board: string; id: string; edge: WbEdge | null; rev: Rev }
    | { k: 'vote'; board: string; node: string; voter: string; n: number; rev: Rev };

/** Öğe anahtarı (pano içinde benzersiz); kalıcı satırın item_id'si */
export const opItem = (op: WbOp): string =>
    op.k === 'meta' ? 'meta' : op.k === 'node' ? `n:${op.id}` : op.k === 'edge' ? `e:${op.id}` : `v:${op.node}:${op.voter}`;
export const opKey = (op: WbOp): string => `${op.board}|${opItem(op)}`;

// ------------------------------------------------------------------ saat

/** Karma mantıksal saat: duvar saati geri kaysa da artan, alınan sürümlerin önünde kalan zaman damgası */
export class WbClock {
    private last = 0;
    constructor(readonly client: string, private now: () => number = () => Date.now()) {}
    tick(): Rev { this.last = Math.max(this.now(), this.last + 1); return { t: this.last, by: this.client }; }
    observe(rev: Rev): void { if (rev.t > this.last) this.last = rev.t; }
}

// ------------------------------------------------------------------ fark

export const metaOf = (b: Whiteboard): WbMeta => ({
    name: b.name, createdAt: b.createdAt,
    ...(b.voting ? { voting: b.voting } : {}), ...(b.timer ? { timer: b.timer } : {}), ...(b.createdBy ? { createdBy: b.createdBy } : {}),
    ...(b.ownerId ? { ownerId: b.ownerId } : {}), ...(b.access ? { access: b.access } : {}),
});

const stripVotes = (n: WbNode): WbNode => { const { votes: _v, ...rest } = n; return rest; };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * İki pano hâli arasındaki işlemler (yerel değişiklik → gönderilecek op'lar).
 * `prev` yoksa pano yeni; `next` yoksa silindi. Oylar nesneden ayrı op olur.
 */
export const diffBoards = (prev: Whiteboard | undefined, next: Whiteboard | undefined, boardId: string, rev: () => Rev): WbOp[] => {
    if (!next) return prev ? [{ k: 'meta', board: boardId, meta: null, rev: rev() }] : [];
    const ops: WbOp[] = [];
    if (!prev || !same(metaOf(prev), metaOf(next))) ops.push({ k: 'meta', board: boardId, meta: metaOf(next), rev: rev() });
    const pn = new Map((prev?.nodes || []).map(n => [n.id, n]));
    for (const n of next.nodes) {
        const o = pn.get(n.id);
        if (!o || !same(stripVotes(o), stripVotes(n))) ops.push({ k: 'node', board: boardId, id: n.id, node: stripVotes(n), rev: rev() });
        const voters = new Set([...Object.keys(o?.votes || {}), ...Object.keys(n.votes || {})]);
        for (const v of voters) {
            const a = o?.votes?.[v] || 0, b = n.votes?.[v] || 0;
            if (a !== b) ops.push({ k: 'vote', board: boardId, node: n.id, voter: v, n: b, rev: rev() });
        }
        pn.delete(n.id);
    }
    for (const id of pn.keys()) ops.push({ k: 'node', board: boardId, id, node: null, rev: rev() });
    const pe = new Map((prev?.edges || []).map(e => [e.id, e]));
    for (const e of next.edges) {
        const o = pe.get(e.id);
        if (!o || !same(o, e)) ops.push({ k: 'edge', board: boardId, id: e.id, edge: e, rev: rev() });
        pe.delete(e.id);
    }
    for (const id of pe.keys()) ops.push({ k: 'edge', board: boardId, id, edge: null, rev: rev() });
    return ops;
};

// ------------------------------------------------------------------ uygulama

export interface MergeState {
    /** Öğe anahtarı → son uygulanan sürüm */
    revs: Map<string, Rev>;
    /** Silinmiş panolar (geç gelen nesne op'ları panoyu diriltmesin) */
    deleted: Set<string>;
}
export const newMergeState = (): MergeState => ({ revs: new Map(), deleted: new Set() });

const emptyBoard = (id: string, meta?: WbMeta): Whiteboard => ({
    id, nodes: [], edges: [], name: meta?.name || 'Pano', createdAt: meta?.createdAt || new Date(0).toISOString(),
    updatedAt: meta?.createdAt || new Date(0).toISOString(),
    ...(meta ? emptyBoardMeta(meta) : {}),
});

/**
 * Op'ları panolara uygular (son yazan kazanır). Eski ya da tekrar gelen op
 * yok sayılır. Dönen `applied`, gerçekten etki eden op'lardır.
 */
export const applyOps = (boards: Whiteboard[], ops: WbOp[], st: MergeState): { boards: Whiteboard[]; applied: WbOp[] } => {
    const byId = new Map(boards.map(b => [b.id, b]));
    const order = boards.map(b => b.id);
    const applied: WbOp[] = [];
    for (const op of ops) {
        const key = opKey(op);
        const cur = st.revs.get(key);
        if (cur && !revGt(op.rev, cur)) continue;
        if (op.k !== 'meta' && st.deleted.has(op.board)) { st.revs.set(key, op.rev); continue; }
        st.revs.set(key, op.rev);
        applied.push(op);
        if (op.k === 'meta') {
            if (!op.meta) { st.deleted.add(op.board); byId.delete(op.board); continue; }
            st.deleted.delete(op.board);
            const b = byId.get(op.board);
            const { voting: _v, timer: _t, createdBy: _c, ownerId: _o, access: _a, ...base } = b || emptyBoard(op.board);
            byId.set(op.board, { ...base, ...emptyBoardMeta(op.meta), nodes: b?.nodes || [], edges: b?.edges || [], updatedAt: new Date(op.rev.t).toISOString() });
            if (!order.includes(op.board)) order.push(op.board);
            continue;
        }
        let b = byId.get(op.board);
        if (!b) { b = emptyBoard(op.board); if (!order.includes(op.board)) order.push(op.board); }
        if (op.k === 'node') {
            const i = b.nodes.findIndex(n => n.id === op.id);
            let nodes = b.nodes;
            if (!op.node) nodes = b.nodes.filter(n => n.id !== op.id);
            else if (i >= 0) { nodes = [...b.nodes]; nodes[i] = { ...op.node, ...(b.nodes[i].votes ? { votes: b.nodes[i].votes } : {}) }; }
            else nodes = [...b.nodes, op.node];
            b = { ...b, nodes };
        } else if (op.k === 'edge') {
            const i = b.edges.findIndex(e => e.id === op.id);
            let edges = b.edges;
            if (!op.edge) edges = b.edges.filter(e => e.id !== op.id);
            else if (i >= 0) { edges = [...b.edges]; edges[i] = op.edge; }
            else edges = [...b.edges, op.edge];
            b = { ...b, edges };
        } else {
            b = {
                ...b, nodes: b.nodes.map(n => {
                    if (n.id !== op.node) return n;
                    const votes = { ...(n.votes || {}) };
                    if (op.n > 0) votes[op.voter] = op.n; else delete votes[op.voter];
                    return { ...n, votes: Object.keys(votes).length ? votes : undefined };
                }),
            };
        }
        byId.set(op.board, { ...b, updatedAt: new Date(Math.max(Date.parse(b.updatedAt) || 0, op.rev.t)).toISOString() });
    }
    return { boards: order.filter(id => byId.has(id)).map(id => byId.get(id)!), applied };
};

function emptyBoardMeta(m: WbMeta): Partial<Whiteboard> {
    return {
        name: m.name, createdAt: m.createdAt,
        ...(m.voting ? { voting: m.voting } : {}), ...(m.timer ? { timer: m.timer } : {}), ...(m.createdBy ? { createdBy: m.createdBy } : {}),
        ...(m.ownerId ? { ownerId: m.ownerId } : {}), ...(m.access ? { access: m.access } : {}),
    };
}

/** Panonun tamamını op'a çevirir (bulutta olmayan yerel panoyu yüklemek için) */
export const boardToOps = (b: Whiteboard, rev: () => Rev): WbOp[] => diffBoards(undefined, b, b.id, rev);

// ------------------------------------------------------------------ geri al (yalnız kendi değişikliğin)

export interface ItemSnap {
    nodes: Record<string, WbNode | null>;
    edges: Record<string, WbEdge | null>;
    meta?: WbMeta;
}

/** prev → next değişiminde dokunulan öğelerin prev'deki hâli (geri alma kaydı) */
export const changedSnap = (prev: Whiteboard, next: Whiteboard): ItemSnap => {
    const snap: ItemSnap = { nodes: {}, edges: {} };
    const pn = new Map(prev.nodes.map(n => [n.id, n])), nn = new Map(next.nodes.map(n => [n.id, n]));
    for (const id of new Set([...pn.keys(), ...nn.keys()])) if (!same(pn.get(id), nn.get(id))) snap.nodes[id] = pn.get(id) || null;
    const pe = new Map(prev.edges.map(e => [e.id, e])), ne = new Map(next.edges.map(e => [e.id, e]));
    for (const id of new Set([...pe.keys(), ...ne.keys()])) if (!same(pe.get(id), ne.get(id))) snap.edges[id] = pe.get(id) || null;
    if (!same(metaOf(prev), metaOf(next))) snap.meta = metaOf(prev);
    return snap;
};

export const snapIsEmpty = (s: ItemSnap): boolean => !Object.keys(s.nodes).length && !Object.keys(s.edges).length && !s.meta;

/** Aynı öğelerin şimdiki hâli (yineleme kaydı) */
export const currentSnap = (b: Whiteboard, like: ItemSnap): ItemSnap => {
    const nodes = new Map(b.nodes.map(n => [n.id, n])), edges = new Map(b.edges.map(e => [e.id, e]));
    return {
        nodes: Object.fromEntries(Object.keys(like.nodes).map(id => [id, nodes.get(id) || null])),
        edges: Object.fromEntries(Object.keys(like.edges).map(id => [id, edges.get(id) || null])),
        ...(like.meta ? { meta: metaOf(b) } : {}),
    };
};

/**
 * Kaydı panoya geri yazar: yalnız kayıttaki öğeler değişir, başkalarının o
 * arada yaptığı diğer değişiklikler korunur.
 */
export const restoreSnap = (b: Whiteboard, s: ItemSnap): Whiteboard => {
    let nodes = b.nodes.filter(n => !(n.id in s.nodes) || s.nodes[n.id]).map(n => (n.id in s.nodes ? s.nodes[n.id]! : n));
    const have = new Set(nodes.map(n => n.id));
    nodes = [...nodes, ...Object.values(s.nodes).filter((n): n is WbNode => !!n && !have.has(n.id))];
    let edges = b.edges.filter(e => !(e.id in s.edges) || s.edges[e.id]).map(e => (e.id in s.edges ? s.edges[e.id]! : e));
    const haveE = new Set(edges.map(e => e.id));
    edges = [...edges, ...Object.values(s.edges).filter((e): e is WbEdge => !!e && !haveE.has(e.id))];
    const ids = new Set(nodes.map(n => n.id));
    edges = edges.filter(e => ids.has(e.from) && ids.has(e.to));
    const meta = s.meta ? { ...s.meta } : undefined;
    const base: Whiteboard = { ...b, nodes, edges, updatedAt: new Date().toISOString() };
    if (!meta) return base;
    const { voting: _v, timer: _t, ownerId: _o, access: _a, ...rest } = base;
    return { ...rest, ...emptyBoardMeta(meta) };
};

// ------------------------------------------------------------------ kalıcı satır (Supabase)

export interface WbRow {
    workspace_id: string;
    project_id: string;
    board_id: string;
    item_id: string;
    kind: 'meta' | 'node' | 'edge' | 'vote';
    data: unknown;
    deleted: boolean;
    rev_t: number;
    rev_by: string;
}

export const opToRow = (op: WbOp, workspaceId: string, projectId: string): WbRow => ({
    workspace_id: workspaceId, project_id: projectId, board_id: op.board, item_id: opItem(op), kind: op.k,
    data: op.k === 'meta' ? op.meta : op.k === 'node' ? op.node : op.k === 'edge' ? op.edge : { node: op.node, voter: op.voter, n: op.n },
    deleted: op.k === 'meta' ? !op.meta : op.k === 'node' ? !op.node : op.k === 'edge' ? !op.edge : op.n <= 0,
    rev_t: op.rev.t, rev_by: op.rev.by,
});

export const rowToOp = (r: Pick<WbRow, 'board_id' | 'item_id' | 'kind' | 'data' | 'deleted' | 'rev_t' | 'rev_by'>): WbOp | null => {
    const rev = { t: Number(r.rev_t), by: r.rev_by };
    const id = r.item_id.slice(2);
    if (r.kind === 'meta') return { k: 'meta', board: r.board_id, meta: r.deleted ? null : (r.data as WbMeta), rev };
    if (r.kind === 'node') return { k: 'node', board: r.board_id, id, node: r.deleted ? null : (r.data as WbNode), rev };
    if (r.kind === 'edge') return { k: 'edge', board: r.board_id, id, edge: r.deleted ? null : (r.data as WbEdge), rev };
    if (r.kind === 'vote') {
        const d = (r.data || {}) as { node?: string; voter?: string; n?: number };
        if (!d.node || !d.voter) return null;
        return { k: 'vote', board: r.board_id, node: d.node, voter: d.voter, n: r.deleted ? 0 : Number(d.n) || 0, rev };
    }
    return null;
};

/** Sunucuya gönderilecek op'lar: aynı öğenin yalnız son hâli */
export const compactOps = (ops: WbOp[]): WbOp[] => {
    const m = new Map<string, WbOp>();
    for (const op of ops) { const k = opKey(op); const cur = m.get(k); if (!cur || revGt(op.rev, cur.rev)) m.set(k, op); }
    return [...m.values()];
};

// ------------------------------------------------------------------ katılımcılar

export interface WbPeer {
    client: string;
    name: string;
    color: string;
    /** Bulunduğu pano */
    board?: string;
    cursor?: { x: number; y: number } | null;
    selection?: string[];
    editing?: string | null;
    /** Son görülme (ms) */
    at: number;
}

export const PEER_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
export const peerColor = (seed: string): string => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return PEER_COLORS[h % PEER_COLORS.length];
};
export const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toLocaleUpperCase('tr-TR')).join('') || '?';

/** Taşıma mesajları */
export type WbMessage =
    | { type: 'ops'; from: string; ops: WbOp[] }
    | { type: 'live'; from: string; board: string; nodes: { id: string; x: number; y: number; w: number; h: number }[] }
    | { type: 'cursor'; from: string; board: string; x: number; y: number }
    | { type: 'presence'; peer: WbPeer }
    | { type: 'bye'; from: string }
    | { type: 'hello'; from: string }
    /** Büyük op (görsel) yayınlanmaz; alıcı satırı sunucudan okur */
    | { type: 'refetch'; from: string; board: string; items: string[] }
    /** Pano listesi değişti (açıldı, adı / erişimi değişti, silindi): alıcı pano bilgilerini sunucudan okur */
    | { type: 'boards'; from: string };
