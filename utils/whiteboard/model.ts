import type { Project, Task, TaskStatus, WbEdge, WbNode, WbNodeType, Whiteboard } from '../../types';

/**
 * Whiteboard (FigJam tarzı) için saf işlemler: nesne ekleme, taşıma,
 * çoğaltma, bölüm (section) içerikleri, bağlantı geometrisi, "/" komutlarıyla
 * proje kaydı arama, metindeki görev referansları, oylama, zamanlayıcı ve
 * yapışkan notu göreve dönüştürme. Bileşenler yalnız çizer ve olay toplar.
 */

const DONE = 'Done' as TaskStatus;

// ------------------------------------------------------------------ renkler ve boyutlar

export interface WbColor { key: string; label: string; fill: string; ink: string; edge: string }

/** FigJam'deki gibi pastel yapışkan not renkleri (açık ve koyu temada aynı) */
export const WB_COLORS: WbColor[] = [
    { key: 'yellow', label: 'Sarı', fill: '#FFE89A', ink: '#3D3200', edge: '#E8C94A' },
    { key: 'orange', label: 'Turuncu', fill: '#FFD2A8', ink: '#4A2300', edge: '#F0A866' },
    { key: 'red', label: 'Kırmızı', fill: '#FFC2BD', ink: '#4D0C06', edge: '#F08A80' },
    { key: 'pink', label: 'Pembe', fill: '#FFC8E6', ink: '#4A0A2E', edge: '#F08CC4' },
    { key: 'purple', label: 'Mor', fill: '#DCCBFF', ink: '#25104F', edge: '#AE8FF5' },
    { key: 'blue', label: 'Mavi', fill: '#C2DDFF', ink: '#062A57', edge: '#7FB2F5' },
    { key: 'teal', label: 'Turkuaz', fill: '#B8EDE6', ink: '#05362F', edge: '#62CFC0' },
    { key: 'green', label: 'Yeşil', fill: '#C6EDC0', ink: '#0B3A06', edge: '#80CF74' },
    { key: 'gray', label: 'Gri', fill: '#E4E4E7', ink: '#1F1F23', edge: '#B5B5BC' },
    { key: 'white', label: 'Beyaz', fill: '#FFFFFF', ink: '#1F1F23', edge: '#D4D4D8' },
];
export const WB_COLOR = new Map(WB_COLORS.map(c => [c.key, c]));
export const colorOf = (key: string | undefined, fallback = 'yellow'): WbColor => WB_COLOR.get(key || fallback) || WB_COLOR.get(fallback)!;

export const STAMPS = ['👍', '❤️', '✅', '❓', '⭐', '🔥', '🎉', '👀', '⚠️', '💡'];

export const NODE_SIZE: Record<WbNodeType, { w: number; h: number }> = {
    sticky: { w: 200, h: 200 },
    text: { w: 260, h: 44 },
    shape: { w: 180, h: 110 },
    section: { w: 720, h: 460 },
    stamp: { w: 56, h: 56 },
    pen: { w: 1, h: 1 },
    image: { w: 320, h: 220 },
    task: { w: 280, h: 128 },
    sprint: { w: 300, h: 132 },
    workPackage: { w: 300, h: 120 },
    risk: { w: 280, h: 112 },
    version: { w: 280, h: 100 },
};

export const LINKED_TYPES = new Set<WbNodeType>(['task', 'sprint', 'workPackage', 'risk', 'version']);

let seq = 0;
export const wbId = (prefix = 'n'): string => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const createBoard = (name: string, now: Date = new Date(), by?: string): Whiteboard => ({
    id: wbId('wb'), name: name.trim() || 'Adsız pano', nodes: [], edges: [],
    createdAt: now.toISOString(), updatedAt: now.toISOString(), ...(by ? { createdBy: by } : {}),
});

export const makeNode = (type: WbNodeType, x: number, y: number, over: Partial<WbNode> = {}): WbNode => ({
    id: wbId(),
    type,
    x: Math.round(x),
    y: Math.round(y),
    ...NODE_SIZE[type],
    ...(type === 'sticky' ? { color: 'yellow', text: '' } : {}),
    ...(type === 'section' ? { color: 'gray', text: 'Bölüm' } : {}),
    ...(type === 'shape' ? { color: 'blue', shape: 'rect' as const, text: '' } : {}),
    ...(type === 'text' ? { text: '' } : {}),
    ...over,
});

// ------------------------------------------------------------------ geometri

export interface Rect { x: number; y: number; w: number; h: number }

export const boundsOf = (nodes: Pick<WbNode, 'x' | 'y' | 'w' | 'h'>[]): Rect | null => {
    if (!nodes.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of nodes) { x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + n.w); y2 = Math.max(y2, n.y + n.h); }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const contains = (outer: Rect, inner: Rect): boolean =>
    inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Bölümün içindekiler: merkezi bölümün içinde kalan, bölümden küçük nesneler (FigJam: bölüm taşınınca içindekiler de taşınır) */
export const sectionChildren = (board: Pick<Whiteboard, 'nodes'>, section: WbNode): WbNode[] =>
    board.nodes.filter(n => {
        if (n.id === section.id) return false;
        if (n.type === 'section' && n.w * n.h >= section.w * section.h) return false;
        const c = center(n);
        return c.x >= section.x && c.x <= section.x + section.w && c.y >= section.y && c.y <= section.y + section.h;
    });

/** Taşınacak nesneler: seçilenler + seçili bölümlerin içindekiler (kilitliler hariç) */
export const dragSet = (board: Pick<Whiteboard, 'nodes'>, ids: string[]): Set<string> => {
    const out = new Set<string>();
    const byId = new Map(board.nodes.map(n => [n.id, n]));
    const add = (n: WbNode) => {
        if (n.locked || out.has(n.id)) return;
        out.add(n.id);
        if (n.type === 'section') sectionChildren(board, n).forEach(add);
    };
    ids.forEach(id => { const n = byId.get(id); if (n) add(n); });
    return out;
};

/** İki nesneyi birleştiren çizginin uçları: merkezden merkeze, kenarlarda kesilir */
export const edgeEnds = (a: Rect, b: Rect): { x1: number; y1: number; x2: number; y2: number } => {
    const ca = center(a), cb = center(b);
    const clip = (r: Rect, from: { x: number; y: number }, to: { x: number; y: number }) => {
        const dx = to.x - from.x, dy = to.y - from.y;
        if (!dx && !dy) return from;
        const tx = dx ? (r.w / 2) / Math.abs(dx) : Infinity;
        const ty = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
        const t = Math.min(tx, ty, 1);
        return { x: from.x + dx * t, y: from.y + dy * t };
    };
    const p1 = clip(a, ca, cb), p2 = clip(b, cb, ca);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
};

// ------------------------------------------------------------------ pano işlemleri (saf)

const touch = (b: Whiteboard, now = new Date()): Whiteboard => ({ ...b, updatedAt: now.toISOString() });

export const addNodes = (b: Whiteboard, nodes: WbNode[], edges: WbEdge[] = []): Whiteboard =>
    touch({ ...b, nodes: [...b.nodes, ...nodes], edges: [...b.edges, ...edges] });

export const updateNodes = (b: Whiteboard, ids: Iterable<string>, patch: Partial<WbNode> | ((n: WbNode) => WbNode)): Whiteboard => {
    const set = new Set(ids);
    return touch({ ...b, nodes: b.nodes.map(n => (set.has(n.id) ? (typeof patch === 'function' ? patch(n) : { ...n, ...patch }) : n)) });
};

export const moveNodes = (b: Whiteboard, ids: Iterable<string>, dx: number, dy: number): Whiteboard =>
    updateNodes(b, ids, n => ({ ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) }));

/** Siler; kilitli nesneler kalır, silinenlere bağlı çizgiler de gider */
export const removeNodes = (b: Whiteboard, ids: Iterable<string>): Whiteboard => {
    const set = new Set([...ids].filter(id => !b.nodes.find(n => n.id === id)?.locked));
    return touch({ ...b, nodes: b.nodes.filter(n => !set.has(n.id)), edges: b.edges.filter(e => !set.has(e.from) && !set.has(e.to) && !set.has(e.id)) });
};

export const removeEdges = (b: Whiteboard, ids: Iterable<string>): Whiteboard => {
    const set = new Set(ids);
    return touch({ ...b, edges: b.edges.filter(e => !set.has(e.id)) });
};

/** Kopyalar: nesneler kaydırılır, aralarındaki bağlantılar da kopyalanır. Yeni kimlikler döner. */
export const cloneNodes = (nodes: WbNode[], edges: WbEdge[], dx: number, dy: number): { nodes: WbNode[]; edges: WbEdge[] } => {
    const map = new Map<string, string>();
    const copies = nodes.map(n => {
        const id = wbId();
        map.set(n.id, id);
        // Kopya kilitsiz ve oysuz başlar
        const { votes: _v, locked: _l, ...rest } = n;
        return { ...rest, id, x: n.x + dx, y: n.y + dy };
    });
    const es = edges.filter(e => map.has(e.from) && map.has(e.to)).map(e => ({ ...e, id: wbId('e'), from: map.get(e.from)!, to: map.get(e.to)! }));
    return { nodes: copies, edges: es };
};

export const duplicateNodes = (b: Whiteboard, ids: string[], offset = 24): { board: Whiteboard; ids: string[] } => {
    const set = dragSet(b, ids);
    const src = b.nodes.filter(n => set.has(n.id) || ids.includes(n.id));
    const c = cloneNodes(src, b.edges, offset, offset);
    return { board: addNodes(b, c.nodes, c.edges), ids: c.nodes.map(n => n.id) };
};

/**
 * Öne / arkaya: nesnenin z değeri değişir (dizi sırası değil). Eş zamanlı
 * düzenlemede her nesne ayrı birleştiği için sıra nesnenin kendi alanında tutulur.
 */
export const reorder = (b: Whiteboard, ids: string[], where: 'front' | 'back'): Whiteboard => {
    const set = new Set(ids);
    const zs = b.nodes.filter(n => !set.has(n.id)).map(n => n.z || 0);
    const edge = where === 'front' ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1;
    // Seçilenlerin kendi aralarındaki sırası korunur
    const moving = drawOrder(b.nodes).filter(n => set.has(n.id));
    const zOf = new Map(moving.map((n, i) => [n.id, where === 'front' ? edge + i : edge - (moving.length - 1 - i)]));
    return touch({ ...b, nodes: b.nodes.map(n => (zOf.has(n.id) ? { ...n, z: zOf.get(n.id) } : n)) });
};

/** Çizim sırası: bölümler her zaman arkada; sonra z, eşitlikte eklenme sırası */
export const drawOrder = (nodes: WbNode[]): WbNode[] => {
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const by = (a: WbNode, b: WbNode) => (a.z || 0) - (b.z || 0) || idx.get(a.id)! - idx.get(b.id)!;
    return [...nodes.filter(n => n.type === 'section').sort(by), ...nodes.filter(n => n.type !== 'section').sort(by)];
};

export const addEdge = (b: Whiteboard, from: string, to: string, style: WbEdge['style'] = 'arrow'): Whiteboard => {
    if (from === to || b.edges.some(e => e.from === from && e.to === to)) return b;
    return touch({ ...b, edges: [...b.edges, { id: wbId('e'), from, to, ...(style === 'line' ? { style } : {}) }] });
};

// ------------------------------------------------------------------ proje kayıtları ("/" komutları)

const fold = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

export const sprintName = (n: number, names?: Record<number, string>): string => (n === 0 ? 'Havuz' : names?.[n]?.trim() || `Sprint ${n}`);

/** Projedeki sprintler (görevlerin sprinti ve adlandırılmış sprintler) */
export const projectSprints = (project: Pick<Project, 'tasks' | 'settings'>): number[] => {
    const set = new Set<number>();
    project.tasks.forEach(t => { if ((t.version || 0) > 0) set.add(t.version); });
    Object.keys(project.settings?.sprintNames || {}).forEach(k => { const n = Number(k); if (n > 0) set.add(n); });
    return [...set].sort((a, b) => a - b);
};

export type WbRefKind = 'task' | 'sprint' | 'workPackage' | 'risk' | 'version';

export interface WbSearchHit {
    kind: WbRefKind;
    ref: string;
    label: string;
    sub: string;
    /** Metne eklenecek kısa referans (görev anahtarı, sprint adı …) */
    token: string;
}

export const CATEGORY_TR: Record<string, string> = { Backlog: 'Bekleyen', ToDo: 'Yapılacak', InProgress: 'Süreçte', Done: 'Tamamlandı' };
export const taskStatusText = (t: Pick<Task, 'status' | 'jiraStatus'>): string => t.jiraStatus?.trim() || CATEGORY_TR[t.status] || t.status;

/** Görevin metinde geçecek referansı: Jira anahtarı, yoksa #kimlik */
export const taskToken = (t: Pick<Task, 'id' | 'jiraId'>): string => t.jiraId?.trim() || `#${t.id}`;

export const KIND_LABEL: Record<WbRefKind, string> = { task: 'Görev', sprint: 'Sprint', workPackage: 'İş paketi', risk: 'Risk', version: 'Sürüm' };

/**
 * "/" komut paletinde arama: görev (anahtar ya da ad), sprint, iş paketi,
 * risk ve sürüm. Boş sorguda her türden ilk kayıtlar (açık görevler önce).
 */
export const searchProject = (project: Project, query: string, opts: { kinds?: WbRefKind[]; limit?: number } = {}): WbSearchHit[] => {
    const q = fold(query);
    const kinds = new Set(opts.kinds || ['task', 'sprint', 'workPackage', 'risk', 'version']);
    const limit = opts.limit ?? 30;
    const words = q.split(/\s+/).filter(Boolean);
    const match = (...fields: (string | undefined)[]) => {
        if (!words.length) return true;
        const hay = fold(fields.filter(Boolean).join(' '));
        return words.every(w => hay.includes(w));
    };
    const out: WbSearchHit[] = [];
    if (kinds.has('task')) {
        const tasks = [...project.tasks].sort((a, b) => Number(a.status === DONE) - Number(b.status === DONE));
        for (const t of tasks) {
            if (!match(t.jiraId, t.name, t.resourceName, t.id)) continue;
            out.push({ kind: 'task', ref: t.id, label: t.name, sub: [t.jiraId, taskStatusText(t), t.resourceName].filter(Boolean).join(' · '), token: taskToken(t) });
        }
        // Tam anahtar eşleşmesi en üste
        out.sort((a, b) => Number(fold(b.token) === q) - Number(fold(a.token) === q));
    }
    if (kinds.has('sprint')) {
        for (const n of projectSprints(project)) {
            const name = sprintName(n, project.settings?.sprintNames);
            if (!match(name, `sprint ${n}`)) continue;
            const list = project.tasks.filter(t => t.version === n);
            out.push({ kind: 'sprint', ref: String(n), label: name, sub: `${list.length} görev · ${list.filter(t => t.status === DONE).length} bitti`, token: name });
        }
    }
    if (kinds.has('workPackage')) {
        for (const w of project.workPackages || []) {
            if (!match(w.name, w.description)) continue;
            out.push({ kind: 'workPackage', ref: w.id, label: w.name, sub: `${project.tasks.filter(t => t.workPackageId === w.id).length} görev`, token: w.name });
        }
    }
    if (kinds.has('risk')) {
        for (const r of project.risks || []) {
            if (!match(r.title, r.owner)) continue;
            out.push({ kind: 'risk', ref: r.id, label: r.title, sub: `Skor ${r.probability * r.impact}${r.owner ? ` · ${r.owner}` : ''}`, token: r.title });
        }
    }
    if (kinds.has('version')) {
        for (const v of project.versions || []) {
            if (!match(v.name, v.description)) continue;
            out.push({ kind: 'version', ref: v.id, label: v.name, sub: v.releaseDate ? `Yayın ${v.releaseDate}` : 'Tarihsiz', token: v.name });
        }
    }
    // Boş sorguda türleri karıştır: her türden birkaç kayıt görünsün
    if (!words.length) {
        const per = new Map<WbRefKind, number>();
        return out.filter(h => { const c = per.get(h.kind) || 0; per.set(h.kind, c + 1); return c < (h.kind === 'task' ? 8 : 4); }).slice(0, limit);
    }
    return out.slice(0, limit);
};

/** Bağlı kart düğümü */
export const linkedNode = (kind: WbRefKind, ref: string, x: number, y: number): WbNode => makeNode(kind, x, y, { ref });

/** Izgara yerleşimi: n kart, sütun sayısı ve aralıkla */
export const gridPositions = (n: number, origin: { x: number; y: number }, cols: number, w: number, h: number, gap = 20): { x: number; y: number }[] =>
    Array.from({ length: n }, (_, i) => ({ x: origin.x + (i % cols) * (w + gap), y: origin.y + Math.floor(i / cols) * (h + gap) }));

/** Görevleri kart olarak dizer (zaten panoda olanlar atlanabilir) */
export const taskCards = (tasks: Pick<Task, 'id'>[], origin: { x: number; y: number }, cols = 3): WbNode[] => {
    const { w, h } = NODE_SIZE.task;
    return gridPositions(tasks.length, origin, cols, w, h).map((p, i) => linkedNode('task', tasks[i].id, p.x, p.y));
};

/** Sprint, iş paketi ya da sürümün görevleri */
export const tasksOfRef = (project: Project, kind: WbRefKind, ref: string): Task[] => {
    if (kind === 'sprint') return project.tasks.filter(t => t.version === Number(ref));
    if (kind === 'workPackage') return project.tasks.filter(t => t.workPackageId === ref);
    if (kind === 'version') {
        const v = project.versions?.find(x => x.id === ref);
        return v ? project.tasks.filter(t => t.fixVersion && fold(t.fixVersion) === fold(v.name)) : [];
    }
    return [];
};

/** Kayıt ve görevleri bir bölüm içinde: başlıkta kayıt adı, içinde kart ızgarası */
export const sectionWithTasks = (title: string, tasks: Pick<Task, 'id'>[], origin: { x: number; y: number }, color = 'gray', cols = 3): WbNode[] => {
    const { w, h } = NODE_SIZE.task;
    const rows = Math.max(1, Math.ceil(tasks.length / cols));
    const section = makeNode('section', origin.x, origin.y, { text: title, color, w: cols * (w + 20) + 40, h: rows * (h + 20) + 80 });
    return [section, ...taskCards(tasks, { x: origin.x + 30, y: origin.y + 60 }, cols)];
};

// ------------------------------------------------------------------ metindeki görev referansları

export type TextSegment = { text: string } | { task: Task; raw: string };

/**
 * Metni parçalar: projedeki görevlerin Jira anahtarları (MPS-123) ve #kimlik
 * referansları görev parçası olur (pano bunları görev kodu düğmesi olarak çizer).
 */
export const textSegments = (text: string, tasks: Task[]): TextSegment[] => {
    if (!text) return [];
    const byKey = new Map<string, Task>();
    tasks.forEach(t => { if (t.jiraId?.trim()) byKey.set(t.jiraId.trim().toUpperCase(), t); byKey.set(`#${t.id}`.toUpperCase(), t); });
    const re = /(#[\w-]+|\b[A-Z][A-Z0-9]+-\d+\b)/gi;
    const out: TextSegment[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
        const t = byKey.get(m[0].toUpperCase());
        if (!t) continue;
        if (m.index! > last) out.push({ text: text.slice(last, m.index) });
        out.push({ task: t, raw: m[0] });
        last = m.index! + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
};

/** "//" yazılınca açılan paletten seçilen referansı yerleştirir: son "//" yerine token */
export const insertToken = (text: string, caret: number, token: string): { text: string; caret: number } => {
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('//');
    const start = at >= 0 ? at : caret;
    const next = `${text.slice(0, start)}${token} ${text.slice(caret)}`;
    return { text: next, caret: start + token.length + 1 };
};

/** İmleçten önce, satır başında ya da boşluktan sonra "//" yazıldıysa referans paleti açılır ("http://" açmaz) */
export const wantsReference = (text: string, caret: number): boolean => {
    if (caret < 2 || text.slice(caret - 2, caret) !== '//') return false;
    const before = caret > 2 ? text[caret - 3] : '';
    return before === '' || /\s/.test(before);
};

// ------------------------------------------------------------------ oylama ve zamanlayıcı

export const votesUsed = (b: Whiteboard, voter: string): number => b.nodes.reduce((s, n) => s + (n.votes?.[voter] || 0), 0);
export const votesLeft = (b: Whiteboard, voter: string): number => Math.max(0, (b.voting?.perPerson || 0) - votesUsed(b, voter));

const VOTABLE_TYPES = new Set<WbNodeType>(['sticky', 'text', 'shape', 'image', 'stamp', 'task', 'sprint', 'workPackage', 'risk', 'version']);

/** Oylanabilir mi: tür uygun ve (kapsam varsa) bölümün içinde */
export const isVotable = (b: Pick<Whiteboard, 'nodes' | 'voting'>, node: WbNode): boolean => {
    if (!VOTABLE_TYPES.has(node.type)) return false;
    const scope = b.voting?.scope ? b.nodes.find(n => n.id === b.voting!.scope && n.type === 'section') : undefined;
    return !scope || sectionChildren(b, scope).some(n => n.id === node.id);
};

export type VoteRefusal = 'inactive' | 'notVotable' | 'noVotesLeft' | 'nodeLimit' | null;

/** Oy verilemiyorsa nedeni (verilebiliyorsa null) */
export const voteRefusal = (b: Whiteboard, nodeId: string, voter: string, delta: 1 | -1 = 1): VoteRefusal => {
    if (!b.voting?.active) return 'inactive';
    const node = b.nodes.find(n => n.id === nodeId);
    if (!node || !isVotable(b, node)) return 'notVotable';
    if (delta < 0) return null;
    if (votesUsed(b, voter) >= b.voting.perPerson) return 'noVotesLeft';
    if (b.voting.maxPerNode && (node.votes?.[voter] || 0) >= b.voting.maxPerNode) return 'nodeLimit';
    return null;
};

/** Oy verir (hak bittiyse, nesne oylanamıyorsa değişmez); `delta` −1 ile geri alınır */
export const castVote = (b: Whiteboard, nodeId: string, voter: string, delta: 1 | -1 = 1): Whiteboard => {
    if (voteRefusal(b, nodeId, voter, delta)) return b;
    return updateNodes(b, [nodeId], n => {
        const cur = n.votes?.[voter] || 0;
        const next = Math.max(0, cur + delta);
        if (next === cur) return n;
        const votes = { ...(n.votes || {}) };
        if (next) votes[voter] = next; else delete votes[voter];
        return { ...n, votes: Object.keys(votes).length ? votes : undefined };
    });
};

export const voteTotal = (n: Pick<WbNode, 'votes'>): number => Object.values(n.votes || {}).reduce((a, b) => a + b, 0);

export interface VotingSetup {
    perPerson: number;
    title?: string;
    /** Bölüm kimliği */
    scope?: string;
    maxPerNode?: number;
    /** Süre (dakika); verilirse ortak zamanlayıcı da başlar */
    minutes?: number;
}

export const startVoting = (b: Whiteboard, setup: number | VotingSetup, now = new Date()): Whiteboard => {
    const s: VotingSetup = typeof setup === 'number' ? { perPerson: setup } : setup;
    const per = Math.max(1, Math.min(20, Math.round(s.perPerson)));
    const minutes = s.minutes && s.minutes > 0 ? Math.min(60, s.minutes) : 0;
    const endsAt = minutes ? new Date(now.getTime() + minutes * 60_000).toISOString() : undefined;
    const title = s.title?.trim().slice(0, 140);
    const scope = s.scope && b.nodes.some(n => n.id === s.scope && n.type === 'section') ? s.scope : undefined;
    const maxPerNode = s.maxPerNode && s.maxPerNode > 0 && s.maxPerNode < per ? Math.round(s.maxPerNode) : undefined;
    return touch({
        ...b,
        voting: { active: true, perPerson: per, startedAt: now.toISOString(), ...(title ? { title } : {}), ...(scope ? { scope } : {}), ...(maxPerNode ? { maxPerNode } : {}), ...(endsAt ? { endsAt } : {}) },
        ...(endsAt ? { timer: { seconds: minutes * 60, endsAt } } : {}),
        nodes: b.nodes.map(n => (n.votes ? { ...n, votes: undefined } : n)),
    });
};

/** Süreli oylamanın süresi doldu mu */
export const votingDue = (b: Pick<Whiteboard, 'voting'>, now = new Date()): boolean =>
    !!b.voting?.active && !!b.voting.endsAt && now.getTime() >= Date.parse(b.voting.endsAt);

export const endVoting = (b: Whiteboard, now = new Date()): Whiteboard => {
    if (!b.voting?.active) return b;
    // Oylamayla başlayan zamanlayıcı oylamayla biter
    const { timer, ...rest } = b;
    const keepTimer = timer && timer.endsAt !== b.voting.endsAt;
    return touch({ ...rest, ...(keepTimer ? { timer } : {}), voting: { ...b.voting, active: false, endedAt: now.toISOString() } });
};

export const clearVoting = (b: Whiteboard): Whiteboard => {
    const { voting: _v, ...rest } = b;
    return touch({ ...rest, nodes: b.nodes.map(n => (n.votes ? { ...n, votes: undefined } : n)) });
};

/** Sonuçlar: oy alan nesneler, çoktan aza */
export const voteResults = (b: Whiteboard): { node: WbNode; votes: number }[] =>
    b.nodes.map(node => ({ node, votes: voteTotal(node) })).filter(r => r.votes > 0).sort((a, b) => b.votes - a.votes);

/** Kaç kişi oy verdi, toplam kaç oy */
export const voteTally = (b: Whiteboard): { voters: number; votes: number } => {
    const who = new Set<string>();
    let votes = 0;
    b.nodes.forEach(n => Object.entries(n.votes || {}).forEach(([k, v]) => { if (v > 0) { who.add(k); votes += v; } }));
    return { voters: who.size, votes };
};

export const startTimer = (b: Whiteboard, seconds: number, now = new Date()): Whiteboard =>
    touch({ ...b, timer: { seconds, endsAt: new Date(now.getTime() + seconds * 1000).toISOString() } });
export const stopTimer = (b: Whiteboard): Whiteboard => { const { timer: _t, ...rest } = b; return touch(rest); };
export const timerLeft = (b: Pick<Whiteboard, 'timer'>, now = new Date()): number | null =>
    b.timer ? Math.max(0, Math.round((Date.parse(b.timer.endsAt) - now.getTime()) / 1000)) : null;

// ------------------------------------------------------------------ yapışkan not → görev

/**
 * Yapışkan notu (ya da metni) göreve çevirir: ilk satır ad, kalanı not.
 * Yeni görev Yapılacak, havuzda (sprint 0), "Whiteboard" etiketiyle.
 */
export const taskFromNode = (node: Pick<WbNode, 'text'>, opts: { now: Date; unit: string; boardName: string; author?: string }): Task | null => {
    const lines = (node.text || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) return null;
    const at = opts.now.toISOString();
    return {
        id: `wb-task-${opts.now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: lines[0].slice(0, 200),
        availability: false,
        priority: 'Medium',
        version: 0,
        predecessor: null,
        unit: opts.unit,
        resourceName: 'Atanmamış',
        time: { best: 0, avg: 0, worst: 0 },
        jiraId: '',
        notes: [...lines.slice(1), `Whiteboard: ${opts.boardName}${opts.author ? ` · ${opts.author}` : ''}`].join('\n'),
        status: 'ToDo' as TaskStatus,
        labels: ['Whiteboard'],
        createdAt: at,
        updatedAt: at,
    };
};

/** Çalışma alanındaki en sık birim (yeni görev için) */
export const defaultUnit = (project: Pick<Project, 'tasks' | 'resources'>): string => {
    const n = new Map<string, number>();
    [...project.resources.map(r => r.unit), ...project.tasks.map(t => t.unit)].forEach(u => { const k = (u || '').trim(); if (k) n.set(k, (n.get(k) || 0) + 1); });
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Genel';
};

// ------------------------------------------------------------------ dışa aktarım

/** Panonun metin özeti (bölüm bölüm notlar ve kartlar): kopyala / Markdown */
export const boardOutline = (b: Whiteboard, project: Project): string => {
    const tasks = new Map(project.tasks.map(t => [t.id, t]));
    const label = (n: WbNode): string => {
        if (n.type === 'task') { const t = tasks.get(n.ref || ''); return t ? `${t.jiraId ? `${t.jiraId} ` : ''}${t.name} (${taskStatusText(t)})` : 'Silinmiş görev'; }
        if (n.type === 'sprint') return sprintName(Number(n.ref), project.settings?.sprintNames);
        if (n.type === 'workPackage') return project.workPackages.find(w => w.id === n.ref)?.name || 'İş paketi';
        if (n.type === 'risk') return project.risks?.find(r => r.id === n.ref)?.title || 'Risk';
        if (n.type === 'version') return project.versions?.find(v => v.id === n.ref)?.name || 'Sürüm';
        if (n.type === 'stamp') return n.stamp || '';
        return (n.text || '').replace(/\s+/g, ' ').trim();
    };
    const sections = b.nodes.filter(n => n.type === 'section');
    const inSection = new Set<string>();
    const lines = [`# ${b.name}`];
    for (const s of sections) {
        const kids = sectionChildren(b, s).filter(n => n.type !== 'section' && n.type !== 'pen');
        kids.forEach(k => inSection.add(k.id));
        lines.push('', `## ${s.text || 'Bölüm'}`, ...kids.map(k => `- ${label(k)}${voteTotal(k) ? ` (${voteTotal(k)} oy)` : ''}`).filter(l => l !== '- '));
    }
    const loose = b.nodes.filter(n => n.type !== 'section' && n.type !== 'pen' && !inSection.has(n.id)).map(label).filter(Boolean);
    if (loose.length) lines.push('', '## Diğer', ...loose.map(l => `- ${l}`));
    return lines.join('\n');
};
