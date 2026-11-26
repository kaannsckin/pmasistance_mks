import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Project, Task, WbEdge, WbNode, WbNodeType, WbShape, Whiteboard } from '../../../types';
import {
    addEdge, addNodes, boundsOf, castVote, cloneNodes, contains, defaultUnit, dragSet, drawOrder, duplicateNodes, edgeEnds, endVoting,
    clearVoting, insertToken, intersects, makeNode, moveNodes, NODE_SIZE, Rect, removeEdges, removeNodes, reorder, sectionWithTasks,
    isVotable, sectionChildren, startTimer, startVoting, STAMPS, stopTimer, taskCards, taskFromNode, tasksOfRef, timerLeft, updateNodes, voteRefusal, voteResults,
    VotingSetup, votingDue, wantsReference, WB_COLORS, WbRefKind,
} from '../../../utils/whiteboard/model';
import { WB_TEMPLATE_BY_KEY } from '../../../utils/whiteboard/templates';
import { Icon, IconName } from '../icons';
import { NodeEnv, PEN_COLORS, penPath, WbNodeBody } from './WbNodeView';
import { VoteBanner, VoteResults, VoteSetup } from './WbVoting';
import WbAssistant from './WbAssistant';
import { applyWbAiResult, WbAiResult } from '../../../utils/whiteboard/assistant';
import { clearWhiteboardBridge, setWhiteboardBridge, whiteboardImageConsent, WhiteboardBridge } from '../../../utils/whiteboard/bridge';
import { runWbAssistant } from './wbAiRun';
import { changedSnap, currentSnap, initials, ItemSnap, restoreSnap, snapIsEmpty, WbPeer } from '../../../utils/whiteboard/collab';
import type { LiveRect } from './useWhiteboardCollab';
import { PaletteAction, WbPalette } from './WbPalette';

/**
 * FigJam tarzı tuval: sonsuz alan (kaydır / yakınlaştır), araçlar (seç, el,
 * yapışkan not, metin, şekil, bölüm, bağlantı, kalem, damga), seçim ve
 * sürükleme, boyutlandırma, bağlantılar, "/" komut paleti, "//" ile metne
 * görev referansı, yapıştır / bırak ile görsel, geri al / yinele, oylama ve
 * ortak zamanlayıcı. Değişiklik bitince (sürükleme bırakılınca, yazı bitince)
 * pano projeye yazılır.
 */

type Tool = 'select' | 'hand' | 'sticky' | 'text' | 'shape' | 'section' | 'connector' | 'pen' | 'stamp';
interface ViewState { x: number; y: number; zoom: number }
interface Pt { x: number; y: number }

type Interaction =
    | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
    | { kind: 'move'; start: Pt; ids: string[]; base: Whiteboard; moved: boolean }
    | { kind: 'marquee'; start: Pt; cur: Pt; base: string[] }
    | { kind: 'resize'; id: string; start: Pt; base: Whiteboard; orig: WbNode }
    | { kind: 'pen'; points: number[] }
    | { kind: 'connect'; from: string; cur: Pt }
    | { kind: 'create'; type: WbNodeType; start: Pt; cur: Pt };

const MIN_ZOOM = 0.1, MAX_ZOOM = 3;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
const EDITABLE = new Set<WbNodeType>(['sticky', 'text', 'shape', 'section']);
const viewKey = (id: string) => `PLANASISTAN_WB_VIEW:${id}`;

const TOOLS: { tool: Tool; label: string; key: string; icon: IconName }[] = [
    { tool: 'select', label: 'Seç', key: 'V', icon: 'pointer' },
    { tool: 'hand', label: 'El (kaydır)', key: 'H', icon: 'hand' },
    { tool: 'sticky', label: 'Yapışkan not', key: 'S', icon: 'sticky' },
    { tool: 'text', label: 'Metin', key: 'T', icon: 'type' },
    { tool: 'shape', label: 'Şekil', key: 'R', icon: 'square' },
    { tool: 'section', label: 'Bölüm', key: 'Shift+S', icon: 'frame' },
    { tool: 'connector', label: 'Bağlantı', key: 'L', icon: 'arrowRight' },
    { tool: 'pen', label: 'Kalem', key: 'P', icon: 'pen' },
    { tool: 'stamp', label: 'Damga', key: 'E', icon: 'smile' },
];
const SHAPES: { shape: WbShape; icon: IconName; label: string }[] = [
    { shape: 'rect', icon: 'square', label: 'Dikdörtgen' }, { shape: 'ellipse', icon: 'circle', label: 'Elips' },
    { shape: 'diamond', icon: 'diamond', label: 'Karar (eşkenar dörtgen)' }, { shape: 'triangle', icon: 'triangle', label: 'Üçgen' },
];
const TEXT_SIZES: [string, number][] = [['S', 14], ['M', 18], ['L', 24], ['XL', 32]];

/** Görseli küçültür (en çok 1200 px) ve data URL'ye çevirir: pano bulutla eşitlenir, boyut sınırlı kalmalı */
const readImage = (file: File): Promise<{ src: string; w: number; h: number }> => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Görsel okunamadı'));
    r.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Görsel açılamadı'));
        img.onload = () => {
            const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            if (!ctx) return reject(new Error('Görsel işlenemedi'));
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve({ src: c.toDataURL('image/jpeg', 0.82), w, h });
        };
        img.src = String(r.result);
    };
    r.readAsDataURL(file);
});

export interface WhiteboardEditorProps {
    board: Whiteboard;
    project: Project;
    canEdit: boolean;
    /** Nottan görev açabilir (proje içeriğini düzenleyen: projenin PY'si) */
    canCreateTasks?: boolean;
    /** Ekleyen kişinin görünen adı */
    actor: string;
    /** Oylamada kişi anahtarı */
    voter: string;
    /** Oy verebilir (düzenleyen ya da kişisi seçili görüntüleyen); yoksa canEdit */
    canVote?: boolean;
    /** Değişiklik: yeni hâl, değişikliğin dayandığı hâl (eş zamanlı birleştirme farkı buna göre alır) */
    onCommit: (next: Whiteboard, prev: Whiteboard, newTasks?: Task[]) => void;
    onViewTask: (t: Task) => void;
    /** Eş zamanlı düzenleme: diğer katılımcılar ve canlı sinyaller */
    collab?: EditorCollab;
}

export interface EditorCollab {
    peers: WbPeer[];
    live: Record<string, LiveRect>;
    cursor: (x: number, y: number) => void;
    presence: (p: { selection?: string[]; editing?: string | null; cursor?: { x: number; y: number } | null }) => void;
    liveMove: (nodes: { id: string; x: number; y: number; w: number; h: number }[]) => void;
}

const WhiteboardEditor: React.FC<WhiteboardEditorProps> = ({ board, project, canEdit, canCreateTasks = canEdit, actor, voter, canVote = canEdit, onCommit, onViewTask, collab }) => {
    const [doc, setDoc] = useState<Whiteboard>(board);
    const docRef = useRef(doc);
    docRef.current = doc;
    const committed = useRef<Whiteboard>(board);
    // Geçmiş: yalnız bu kişinin dokunduğu öğelerin önceki hâli (başkalarının değişikliği geri alınmaz)
    const past = useRef<ItemSnap[]>([]);
    const future = useRef<ItemSnap[]>([]);
    const [following, setFollowing] = useState<string | null>(null);

    const viewport = useRef<HTMLDivElement>(null);
    // Kayıtlı görünüm (bu cihazda); yoksa ilk çizimde içeriğe sığdırılır
    const storedView = useRef<ViewState | null>((() => {
        try { const v = JSON.parse(localStorage.getItem(viewKey(board.id)) || 'null'); return v && Number.isFinite(v.zoom) ? v : null; } catch { return null; }
    })());
    const [view, setView] = useState<ViewState>(() => storedView.current || { x: 80, y: 80, zoom: 1 });
    const viewRef = useRef(view);
    viewRef.current = view;
    const [tool, setTool] = useState<Tool>('select');
    const [stickyColor, setStickyColor] = useState('yellow');
    const [shapeKind, setShapeKind] = useState<WbShape>('rect');
    const [stamp, setStamp] = useState(STAMPS[0]);
    const [penColor, setPenColor] = useState('gray');
    const [selection, setSelection] = useState<string[]>([]);
    const selectionRef = useRef(selection);
    selectionRef.current = selection;
    const [edgeSel, setEdgeSel] = useState<string | null>(null);
    const [interaction, setInteractionState] = useState<Interaction | null>(null);
    const interactionRef = useRef<Interaction | null>(null);
    const setInteraction = (i: Interaction | null) => { interactionRef.current = i; setInteractionState(i); };
    const [editing, setEditingState] = useState<{ id: string; text: string } | null>(null);
    // Düzenleme durumu ayrıca eşzamanlı tutulur: Esc + odak kaybı aynı düzenlemeyi iki kez bitirmesin
    const editingRef = useRef<{ id: string; text: string } | null>(null);
    const setEditing = (v: { id: string; text: string } | null) => { editingRef.current = v; setEditingState(v); };
    const editRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
    const [palette, setPalette] = useState<{ at: Pt; board: Pt; mode: 'insert' | 'reference' } | null>(null);
    const [votePanel, setVotePanel] = useState(false);
    const [voteSetup, setVoteSetup] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const space = useRef(false);
    const lastPointer = useRef<Pt | null>(null);
    const clip = useRef<{ text: string; nodes: WbNode[]; edges: WbEdge[] } | null>(null);
    const [, forceTick] = useState(0);
    // Seçim araç çubuğunun ölçüsü: seçimin üstüne ortalanır, sığmazsa altına iner
    const barRef = useRef<HTMLDivElement>(null);
    const [barSize, setBarSize] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        const el = barRef.current;
        if (!el) return;
        const w = el.offsetWidth, h = el.offsetHeight;
        if (w !== barSize.w || h !== barSize.h) setBarSize({ w, h });
    });

    const tasksById = useMemo(() => new Map(project.tasks.map(t => [t.id, t])), [project.tasks]);
    const byId = useMemo(() => new Map(doc.nodes.map(n => [n.id, n])), [doc.nodes]);
    const env: NodeEnv = { project, tasksById, onViewTask, voter, votingActive: !!doc.voting?.active, showVotes: !!doc.voting && !doc.voting.active, canUnvote: canVote };

    // ---- kayıt ve geçmiş
    // Yeni eklenip hemen yazılan nesne: ilk yazı oluşturmayla tek geri alma adımıdır
    const fresh = useRef<Set<string>>(new Set());
    const commit = useCallback((next: Whiteboard, prev: Whiteboard = docRef.current, newTasks?: Task[], record = true) => {
        if (next === prev && !newTasks) return;
        const snap = changedSnap(prev, next);
        if (record && !snapIsEmpty(snap)) {
            past.current.push(snap);
            if (past.current.length > 100) past.current.shift();
            future.current = [];
            fresh.current = new Set();
        }
        committed.current = next;
        docRef.current = next;
        setDoc(next);
        onCommit(next, prev, newTasks);
    }, [onCommit]);
    const step = (from: React.MutableRefObject<ItemSnap[]>, to: React.MutableRefObject<ItemSnap[]>) => {
        const s = from.current.pop();
        if (!s) return;
        const cur = docRef.current;
        to.current.push(currentSnap(cur, s));
        const next = restoreSnap(cur, s);
        committed.current = next;
        setDoc(next);
        onCommit(next, cur);
    };
    const undo = () => step(past, future);
    const redo = () => step(future, past);

    // Dışarıdan gelen değişiklik (başka kişi, başka sekme): sürükleme sürerken bekler, bitince alınır.
    // Yazarken de alınır: düzenlenen metin ayrı tutulur, kaybolmaz.
    useEffect(() => {
        if (board === committed.current || interactionRef.current) return;
        committed.current = board;
        setDoc(board);
    }, [board, interaction]);

    useEffect(() => { try { localStorage.setItem(viewKey(board.id), JSON.stringify(view)); } catch { /* özel pencere */ } }, [view, board.id]);

    // ---- eş zamanlı: seçim / düzenleme varlığı, takip
    const collabRef = useRef(collab);
    collabRef.current = collab;
    useEffect(() => { collabRef.current?.presence({ selection, editing: editing?.id || null }); }, [selection, editing?.id]);
    const peers = collab?.peers || [];
    const editingBy = useMemo(() => new Map(peers.filter(p => p.editing).map(p => [p.editing!, p])), [peers]);
    const followed = following ? peers.find(p => p.client === following) : undefined;
    useEffect(() => {
        // Takip edilen kişinin imleci ekranın ortasında tutulur
        if (!followed?.cursor) return;
        const r = viewport.current?.getBoundingClientRect();
        if (!r) return;
        const c = followed.cursor;
        setView(v => ({ ...v, x: r.width / 2 - c.x * v.zoom, y: r.height / 2 - c.y * v.zoom }));
    }, [followed?.cursor?.x, followed?.cursor?.y]);
    useEffect(() => { if (following && !followed) setFollowing(null); }, [following, followed]);

    // ---- koordinatlar
    const toBoard = (clientX: number, clientY: number): Pt => {
        const r = viewport.current!.getBoundingClientRect();
        const v = viewRef.current;
        return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
    };
    const toScreen = (p: Pt): Pt => ({ x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y });
    const viewportCenter = (): Pt => {
        const r = viewport.current?.getBoundingClientRect();
        return r ? toBoard(r.left + r.width / 2, r.top + r.height / 2) : { x: 0, y: 0 };
    };

    const fit = useCallback((nodes = docRef.current.nodes) => {
        const r = viewport.current?.getBoundingClientRect();
        const b = boundsOf(nodes);
        if (!r) return;
        if (!b) { setView({ x: r.width / 2, y: r.height / 2, zoom: 1 }); return; }
        const zoom = clampZoom(Math.min(1, (r.width - 160) / Math.max(1, b.w), (r.height - 200) / Math.max(1, b.h)));
        setView({ zoom, x: (r.width - b.w * zoom) / 2 - b.x * zoom, y: (r.height - b.h * zoom) / 2 - b.y * zoom });
    }, []);
    useEffect(() => {
        if (!storedView.current) fit(board.nodes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const zoomAt = (factor: number, at?: Pt) => {
        const r = viewport.current?.getBoundingClientRect();
        if (!r) return;
        const sx = at ? at.x : r.width / 2, sy = at ? at.y : r.height / 2;
        setView(v => {
            const zoom = clampZoom(v.zoom * factor);
            const k = zoom / v.zoom;
            return { zoom, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k };
        });
    };

    // Tekerlek: Ctrl/⌘ (ya da iki parmak sıkıştırma) yakınlaştırır, diğerleri kaydırır
    useEffect(() => {
        const el = viewport.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if ((e.target as HTMLElement).closest('[data-ui]')) return;
            e.preventDefault();
            setFollowing(null);
            const r = el.getBoundingClientRect();
            if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top });
            else setView(v => ({ ...v, x: v.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) }));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    // Zamanlayıcı: saniyede bir çizim
    const commitRef = useRef<(next: Whiteboard) => void>(() => undefined);
    useEffect(() => {
        if (!doc.timer && !doc.voting?.endsAt) return;
        const id = window.setInterval(() => {
            forceTick(t => t + 1);
            // Süreli oylama süresi dolunca biter (düzenleyenlerden biri yazar; aynı sonuç)
            if (votingDue(docRef.current)) { if (canEdit) commitRef.current(endVoting(docRef.current)); return; }
            if (timerLeft(docRef.current) === 0 && docRef.current.timer) setToast('Süre doldu');
        }, 1000);
        return () => window.clearInterval(id);
    }, [doc.timer, doc.voting?.endsAt, canEdit]);
    // Oylama bitince sonuçlar herkeste açılır (pano açılırken eski sonuç açılmaz)
    const seenEnd = useRef(board.voting?.endedAt);
    useEffect(() => {
        const end = doc.voting && !doc.voting.active ? doc.voting.endedAt : undefined;
        if (end && end !== seenEnd.current) { setVotePanel(true); setVoteSetup(false); }
        seenEnd.current = end;
    }, [doc.voting]);
    useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 3500); return () => window.clearTimeout(id); }, [toast]);

    // ---- nesne oluşturma
    const place = (nodes: WbNode[], edges: WbEdge[] = [], newTasks?: Task[]) => {
        commit(addNodes(docRef.current, nodes, edges), docRef.current, newTasks);
        fresh.current = new Set(nodes.map(n => n.id));
        setSelection(nodes.filter(n => n.type !== 'section' || nodes.length === 1).map(n => n.id));
        setEdgeSel(null);
    };
    const createAt = (type: WbNodeType, p: Pt, size?: Rect): WbNode => {
        const s = NODE_SIZE[type];
        const r = size || { x: p.x - s.w / 2, y: p.y - s.h / 2, w: s.w, h: s.h };
        return makeNode(type, r.x, r.y, {
            w: r.w, h: r.h,
            ...(type === 'sticky' ? { color: stickyColor, author: actor } : {}),
            ...(type === 'shape' ? { shape: shapeKind, color: 'blue' } : {}),
            ...(type === 'stamp' ? { stamp } : {}),
            ...(type === 'text' ? { text: '' } : {}),
        });
    };
    const startEdit = (n: WbNode) => {
        if (!canEdit || !EDITABLE.has(n.type) || n.locked) return;
        const other = editingBy.get(n.id);
        if (other) { setToast(`${other.name} bu nesneyi düzenliyor.`); return; }
        setSelection([n.id]);
        setEditing({ id: n.id, text: n.text || '' });
    };
    const finishEdit = (then?: (b: Whiteboard) => void) => {
        const e = editingRef.current;
        if (!e) return;
        setEditing(null);
        setPalette(p => (p?.mode === 'reference' ? null : p));
        const n = docRef.current.nodes.find(x => x.id === e.id);
        if (!n) return;
        let next = docRef.current;
        if (n.type === 'text' && !e.text.trim()) next = removeNodes(next, [n.id]);
        else if ((n.text || '') !== e.text) next = updateNodes(next, [n.id], { text: e.text });
        const amend = fresh.current.has(n.id);
        commit(next, docRef.current, undefined, !amend);
        fresh.current = new Set();
        then?.(next);
    };

    // ---- seçim yardımcıları
    const selectedNodes = selection.map(id => byId.get(id)).filter((n): n is WbNode => !!n);
    const removeSelection = () => {
        if (!canEdit) return;
        if (edgeSel) { commit(removeEdges(docRef.current, [edgeSel])); setEdgeSel(null); return; }
        if (!selection.length) return;
        commit(removeNodes(docRef.current, selection));
        setSelection([]);
    };
    const nodeAtTarget = (t: EventTarget | null): WbNode | undefined => {
        const el = (t as HTMLElement | null)?.closest?.('[data-node-id]') as HTMLElement | null;
        return el ? docRef.current.nodes.find(n => n.id === el.dataset.nodeId) : undefined;
    };

    // ---- işaretçi
    const onPointerDown = (e: React.PointerEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-ui]') || target.closest('[data-editing]')) return;
        viewport.current?.focus({ preventScroll: true });
        if (following) setFollowing(null);
        if (editing) finishEdit();
        if (palette) setPalette(null);
        const p = toBoard(e.clientX, e.clientY);
        lastPointer.current = p;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        if (e.button === 1 || tool === 'hand' || space.current) {
            setInteraction({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
            return;
        }
        if (e.button === 2) return;
        const handle = target.closest('[data-handle]') as HTMLElement | null;
        const node = nodeAtTarget(target);
        const edgeEl = target.closest('[data-edge-id]') as HTMLElement | null;

        if (handle && node && canEdit) {
            if (handle.dataset.handle === 'resize') setInteraction({ kind: 'resize', id: node.id, start: p, base: docRef.current, orig: node });
            else setInteraction({ kind: 'connect', from: node.id, cur: p });
            return;
        }
        if (tool === 'connector' && canEdit) {
            if (node) setInteraction({ kind: 'connect', from: node.id, cur: p });
            return;
        }
        if (tool === 'pen' && canEdit) { setInteraction({ kind: 'pen', points: [p.x, p.y] }); return; }
        if ((tool === 'sticky' || tool === 'text' || tool === 'shape' || tool === 'section' || tool === 'stamp') && canEdit) {
            setInteraction({ kind: 'create', type: tool, start: p, cur: p });
            return;
        }
        if (edgeEl && !node) { setEdgeSel(edgeEl.dataset.edgeId || null); setSelection([]); return; }
        if (node) {
            // Oylama: tıklayan oy verir; kendi oy rozetine (ya da Alt ile) tıklayınca geri alır
            if (doc.voting?.active && canVote && isVotable(docRef.current, node) && !e.shiftKey) {
                const unvote = e.altKey || !!target.closest('[data-vote-badge]');
                const why = voteRefusal(docRef.current, node.id, voter, unvote ? -1 : 1);
                if (!why) commit(castVote(docRef.current, node.id, voter, unvote ? -1 : 1));
                else if (why === 'noVotesLeft') setToast(`Oy hakkınız bitti (${doc.voting.perPerson}). Geri almak için bir notun üstündeki oy rozetine tıklayın.`);
                else if (why === 'nodeLimit') setToast('Bu nota verebileceğiniz en fazla oyu verdiniz.');
                return;
            }
            setEdgeSel(null);
            let sel = selection;
            if (e.shiftKey) sel = selection.includes(node.id) ? selection.filter(x => x !== node.id) : [...selection, node.id];
            else if (!selection.includes(node.id)) sel = [node.id];
            setSelection(sel);
            if (canEdit && sel.includes(node.id)) setInteraction({ kind: 'move', start: p, ids: [...dragSet(docRef.current, sel)], base: docRef.current, moved: false });
            return;
        }
        // Boş alan: çerçeveyle seçim
        setEdgeSel(null);
        setSelection(e.shiftKey ? selection : []);
        setInteraction({ kind: 'marquee', start: p, cur: p, base: e.shiftKey ? selection : [] });
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const it = interactionRef.current;
        const p = toBoard(e.clientX, e.clientY);
        lastPointer.current = p;
        collab?.cursor(p.x, p.y);
        if (!it) return;
        switch (it.kind) {
            case 'pan': setView(v => ({ ...v, x: it.vx + e.clientX - it.sx, y: it.vy + e.clientY - it.sy })); break;
            case 'move': {
                const dx = p.x - it.start.x, dy = p.y - it.start.y;
                if (!it.moved && Math.hypot(dx, dy) * view.zoom < 3) return;
                it.moved = true;
                const moved = moveNodes(it.base, it.ids, dx, dy);
                setDoc(moved);
                // Başkaları sürüklemeyi canlı görür (kalıcı kayıt bırakınca)
                const set = new Set(it.ids.slice(0, 60));
                collab?.liveMove(moved.nodes.filter(n => set.has(n.id)).map(n => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h })));
                break;
            }
            case 'resize': {
                const o = it.orig;
                const keep = o.type === 'stamp' || o.type === 'image';
                let w = Math.max(40, o.w + p.x - it.start.x), h = Math.max(30, o.h + p.y - it.start.y);
                if (keep || e.shiftKey) { const k = Math.max(w / o.w, h / o.h); w = Math.max(30, o.w * k); h = Math.max(30, o.h * k); }
                setDoc(updateNodes(it.base, [o.id], { w: Math.round(w), h: Math.round(h) }));
                collab?.liveMove([{ id: o.id, x: o.x, y: o.y, w: Math.round(w), h: Math.round(h) }]);
                break;
            }
            case 'marquee': {
                const next = { ...it, cur: p };
                setInteraction(next);
                const r = { x: Math.min(it.start.x, p.x), y: Math.min(it.start.y, p.y), w: Math.abs(p.x - it.start.x), h: Math.abs(p.y - it.start.y) };
                const hit = docRef.current.nodes.filter(n => (n.type === 'section' ? contains(r, n) : intersects(r, n))).map(n => n.id);
                setSelection([...new Set([...it.base, ...hit])]);
                break;
            }
            case 'pen': {
                const pts = it.points;
                const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
                if (Math.hypot(p.x - lx, p.y - ly) * view.zoom < 2) return;
                setInteraction({ kind: 'pen', points: [...pts, p.x, p.y] });
                break;
            }
            case 'connect': setInteraction({ ...it, cur: p }); break;
            case 'create': setInteraction({ ...it, cur: p }); break;
        }
    };

    const onPointerUp = (e: React.PointerEvent) => {
        const it = interactionRef.current;
        setInteraction(null);
        if (!it) return;
        if (it.kind === 'move') {
            if (it.moved) commit(docRef.current, it.base);
            return;
        }
        if (it.kind === 'resize') { commit(docRef.current, it.base); return; }
        if (it.kind === 'pen') {
            const pts = it.points;
            const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1);
            const x = Math.min(...xs), y = Math.min(...ys);
            const node = makeNode('pen', x, y, { w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y), points: pts.map((v, i) => Math.round((v - (i % 2 === 0 ? x : y)) * 10) / 10), color: penColor, fontSize: 4 });
            commit(addNodes(docRef.current, [node]));
            return;
        }
        if (it.kind === 'connect') {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const to = nodeAtTarget(el);
            if (to && to.id !== it.from) commit(addEdge(docRef.current, it.from, to.id));
            else if (!to && tool !== 'connector' && canEdit) {
                // Boşa bırakılan bağlantı: yeni yapışkan not açar ve bağlar (FigJam gibi)
                const from = docRef.current.nodes.find(n => n.id === it.from);
                if (from && Math.hypot(it.cur.x - (from.x + from.w / 2), it.cur.y - (from.y + from.h / 2)) > 80) {
                    const n = createAt('sticky', it.cur);
                    commit(addEdge(addNodes(docRef.current, [n]), it.from, n.id));
                    fresh.current = new Set([n.id]);
                    setSelection([n.id]);
                    setEditing({ id: n.id, text: '' });
                }
            }
            return;
        }
        if (it.kind === 'create') {
            const dragged = Math.hypot(it.cur.x - it.start.x, it.cur.y - it.start.y) * view.zoom > 10 && (it.type === 'section' || it.type === 'shape');
            const r = dragged ? { x: Math.min(it.start.x, it.cur.x), y: Math.min(it.start.y, it.cur.y), w: Math.abs(it.cur.x - it.start.x), h: Math.abs(it.cur.y - it.start.y) } : undefined;
            const n = createAt(it.type, it.start, r);
            place([n]);
            if (it.type !== 'stamp') { setTool('select'); if (EDITABLE.has(n.type)) setEditing({ id: n.id, text: n.text || '' }); }
        }
    };

    const onDoubleClick = (e: React.MouseEvent) => {
        // İşaretçi yakalandığı için olay tuvale yönlenir: hedef imlecin altındaki öğedir
        const target = (document.elementFromPoint(e.clientX, e.clientY) || e.target) as HTMLElement;
        if (target.closest('[data-ui]') || target.closest('[data-editing]')) return;
        const node = nodeAtTarget(target);
        const edgeEl = target.closest('[data-edge-id]') as HTMLElement | null;
        if (node) { startEdit(node); return; }
        if (edgeEl && canEdit) {
            const edge = docRef.current.edges.find(x => x.id === edgeEl.dataset.edgeId);
            const label = window.prompt('Bağlantı etiketi', edge?.label || '');
            if (edge && label !== null) commit({ ...docRef.current, edges: docRef.current.edges.map(x => (x.id === edge.id ? { ...x, label: label.trim() || undefined } : x)), updatedAt: new Date().toISOString() });
            return;
        }
        if (!canEdit || tool !== 'select') return;
        const n = createAt('sticky', toBoard(e.clientX, e.clientY));
        place([n]);
        setEditing({ id: n.id, text: '' });
    };

    // ---- palet
    const openPalette = (mode: 'insert' | 'reference', anchor?: Pt) => {
        const r = viewport.current?.getBoundingClientRect();
        if (!r) return;
        const boardPt = anchor || lastPointer.current || viewportCenter();
        const s = toScreen(boardPt);
        setPalette({ mode, board: boardPt, at: { x: Math.max(8, Math.min(r.width - 448, s.x)), y: Math.max(8, Math.min(r.height - 460, s.y + 8)) } });
    };

    const existingTaskIds = () => new Set(docRef.current.nodes.filter(n => n.type === 'task').map(n => n.ref));
    const paletteOffset = useRef(0);
    const onPaletteAction = (a: PaletteAction) => {
        if (!palette) return;
        if (palette.mode === 'reference') {
            if (a.kind !== 'hit' || !editing) return;
            const el = editRef.current;
            const caret = el?.selectionStart ?? editing.text.length;
            const r = insertToken(editing.text, caret, a.hit.token);
            setEditing({ ...editing, text: r.text });
            // Odak hemen metne döner (sonraki tuş kaybolmasın); imleç yeni metin çizilince yerleşir
            editRef.current?.focus();
            requestAnimationFrame(() => editRef.current?.setSelectionRange(r.caret, r.caret));
            return;
        }
        const at = { x: palette.board.x + paletteOffset.current, y: palette.board.y + paletteOffset.current };
        paletteOffset.current = a.kind === 'hit' && a.keepOpen ? paletteOffset.current + 30 : 0;
        if (a.kind === 'hit') {
            const kind = a.hit.kind as WbRefKind;
            if (a.withTasks && (kind === 'sprint' || kind === 'workPackage' || kind === 'version')) {
                const tasks = tasksOfRef(project, kind, a.hit.ref).filter(t => !existingTaskIds().has(t.id)).slice(0, 30);
                const card = makeNode(kind, at.x, at.y, { ref: a.hit.ref });
                const sec = sectionWithTasks(a.hit.label, tasks, { x: at.x, y: at.y + card.h + 60 }, kind === 'sprint' ? 'purple' : 'blue', 3);
                place([...sec, card]);
            } else {
                place([makeNode(kind, at.x, at.y, { ref: a.hit.ref })]);
            }
        } else if (a.kind === 'create') {
            const n = createAt(a.type, at);
            place([n]);
            if (EDITABLE.has(n.type)) setEditing({ id: n.id, text: n.text || '' });
        } else if (a.kind === 'template') {
            const t = WB_TEMPLATE_BY_KEY.get(a.key);
            if (!t) return;
            const b = boundsOf(docRef.current.nodes);
            const origin = b ? { x: b.x, y: b.y + b.h + 200 } : at;
            const built = t.build(project, origin);
            place(built.nodes, built.edges);
            window.setTimeout(() => fit(built.nodes), 0);
        } else if (a.kind === 'vote') {
            toggleVoting();
        } else if (a.kind === 'timer') {
            commit(startTimer(docRef.current, a.seconds));
        }
    };

    // ---- oturum: oylama ve zamanlayıcı
    const toggleVoting = () => {
        if (!canEdit) return;
        if (doc.voting?.active) { commit(endVoting(docRef.current)); setVotePanel(true); }
        else { setVotePanel(false); setVoteSetup(true); }
    };
    const beginVoting = (setup: VotingSetup) => {
        commit(startVoting(docRef.current, setup));
        setVoteSetup(false); setVotePanel(false); setTool('select'); setSelection([]);
    };
    /** Sonucu panoya yaz: oy alanlar sırayla, oylanan alanın sağına bir not */
    const addVoteSummary = () => {
        const res = voteResults(docRef.current);
        if (!res.length) return;
        const v = docRef.current.voting;
        const label = (n: WbNode) => (n.text || (n.type === 'task' ? tasksById.get(n.ref || '')?.name : '') || 'Adsız').replace(/\s+/g, ' ').slice(0, 80);
        const lines = [`Oylama: ${v?.title || doc.name}`, ...res.slice(0, 10).map((r, i) => `${i + 1}. ${label(r.node)} (${r.votes} oy)`)];
        const c = viewportCenter();
        const area = boundsOf(res.map(r => r.node)) || { x: c.x, y: c.y, w: 0, h: 0 };
        const n = makeNode('sticky', area.x + area.w + 80, area.y, { color: 'purple', text: lines.join('\n'), w: 340, h: Math.min(560, 70 + lines.length * 24), author: actor });
        place([n]);
        setSelection([n.id]);
    };

    // ---- seçim eylemleri
    const convertToTasks = () => {
        const nodes = selectedNodes.filter(n => (n.type === 'sticky' || n.type === 'text' || n.type === 'shape') && n.text?.trim() && !n.locked);
        if (!nodes.length) return;
        const now = new Date();
        const unit = defaultUnit(project);
        const created: Task[] = [];
        let next = docRef.current;
        const cards: WbNode[] = [];
        for (const n of nodes) {
            const t = taskFromNode(n, { now: new Date(now.getTime() + created.length), unit, boardName: doc.name, author: actor });
            if (!t) continue;
            created.push(t);
            cards.push(makeNode('task', n.x, n.y, { ref: t.id }));
        }
        // Not, aynı yerde görev kartıyla değişir; bağlantılar yeni karta taşınır
        const map = new Map(nodes.map((n, i) => [n.id, cards[i]?.id]));
        next = { ...next, edges: next.edges.map(e => ({ ...e, from: map.get(e.from) || e.from, to: map.get(e.to) || e.to })) };
        next = addNodes({ ...next, nodes: next.nodes.filter(n => !map.has(n.id)) }, cards);
        commit(next, docRef.current, created);
        setSelection(cards.map(c => c.id));
        setToast(`${created.length} görev oluşturuldu (Yapılacak, havuzda, "Whiteboard" etiketiyle)`);
    };
    const expandLinked = (n: WbNode) => {
        const tasks = tasksOfRef(project, n.type as WbRefKind, n.ref || '').filter(t => !existingTaskIds().has(t.id)).slice(0, 30);
        if (!tasks.length) { setToast('Eklenecek görev yok (hepsi panoda ya da kayıt boş).'); return; }
        place(taskCards(tasks, { x: n.x + n.w + 40, y: n.y }, 3));
    };

    // ---- klavye
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (editing || palette) return;
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key;
        if (k === ' ') { space.current = true; e.preventDefault(); return; }
        if (mod && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
        if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setSelection(doc.nodes.map(n => n.id)); return; }
        if (mod && k.toLowerCase() === 'd' && canEdit && selection.length) {
            e.preventDefault();
            const r = duplicateNodes(docRef.current, selection);
            commit(r.board); setSelection(r.ids); return;
        }
        if ((k === 'Delete' || k === 'Backspace') && canEdit) { e.preventDefault(); removeSelection(); return; }
        if (k === 'Escape') { setSelection([]); setEdgeSel(null); setTool('select'); setFollowing(null); return; }
        if (k === 'Enter' && selection.length === 1) { const n = byId.get(selection[0]); if (n) { e.preventDefault(); startEdit(n); } return; }
        if (k.startsWith('Arrow') && canEdit && selection.length) {
            e.preventDefault();
            const d = e.shiftKey ? 10 : 1;
            const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0;
            commit(moveNodes(docRef.current, dragSet(docRef.current, selection), dx, dy));
            return;
        }
        if (mod) return;
        if (k === '/' && canEdit) { e.preventDefault(); openPalette('insert'); return; }
        if (k === '+' || k === '=') { zoomAt(1.2); return; }
        if (k === '-') { zoomAt(1 / 1.2); return; }
        if (e.shiftKey && k === '!') { fit(); return; }
        if (e.shiftKey && (k === ')' || k === '0')) { setView(v => ({ ...v, zoom: 1 })); return; }
        const map: Record<string, Tool> = { v: 'select', h: 'hand', s: 'sticky', t: 'text', r: 'shape', o: 'shape', l: 'connector', x: 'connector', p: 'pen', m: 'pen', e: 'stamp' };
        const lower = k.toLowerCase();
        if (e.shiftKey && lower === 's' && canEdit) { setTool('section'); return; }
        if (map[lower] && (canEdit || lower === 'v' || lower === 'h')) {
            if (lower === 'o') setShapeKind('ellipse');
            if (lower === 'r') setShapeKind('rect');
            setTool(map[lower]);
        }
    };
    const onKeyUp = (e: React.KeyboardEvent) => { if (e.key === ' ') space.current = false; };

    // ---- kopyala / yapıştır / bırak
    const onCopy = (e: React.ClipboardEvent) => {
        if (editing || !selection.length) return;
        const set = dragSet(docRef.current, selection);
        const nodes = docRef.current.nodes.filter(n => set.has(n.id) || selection.includes(n.id));
        const text = nodes.map(n => n.text || (n.type === 'task' ? tasksById.get(n.ref || '')?.name : '') || '').filter(Boolean).join('\n') || 'PlanAsistan pano nesneleri';
        clip.current = { text, nodes, edges: docRef.current.edges };
        e.clipboardData.setData('text/plain', text);
        e.preventDefault();
    };
    const onCut = (e: React.ClipboardEvent) => { onCopy(e); if (canEdit && !editing) removeSelection(); };
    const addImages = async (files: File[], at: Pt) => {
        const imgs = files.filter(f => f.type.startsWith('image/')).slice(0, 6);
        if (!imgs.length) return false;
        try {
            const nodes: WbNode[] = [];
            for (const [i, f] of imgs.entries()) {
                const img = await readImage(f);
                const scale = Math.min(1, 480 / img.w);
                nodes.push(makeNode('image', at.x + i * 40, at.y + i * 40, { src: img.src, w: Math.round(img.w * scale), h: Math.round(img.h * scale), text: f.name, author: actor }));
            }
            place(nodes);
        } catch (err) { setToast((err as Error).message); }
        return true;
    };
    const onPaste = (e: React.ClipboardEvent) => {
        if (editing || !canEdit) return;
        const at = lastPointer.current || viewportCenter();
        const files = [...e.clipboardData.files];
        if (files.length) { e.preventDefault(); void addImages(files, at); return; }
        const text = e.clipboardData.getData('text/plain');
        if (clip.current && text === clip.current.text) {
            e.preventDefault();
            const b = boundsOf(clip.current.nodes);
            const c = cloneNodes(clip.current.nodes, clip.current.edges, b ? at.x - b.x : 30, b ? at.y - b.y : 30);
            place(c.nodes, c.edges);
            return;
        }
        if (text.trim()) {
            e.preventDefault();
            // Satır satır yapıştırılan liste: her satır bir yapışkan not
            const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            const items = lines.length > 1 && lines.length <= 40 ? lines : [text.trim()];
            const { w, h } = NODE_SIZE.sticky;
            place(items.map((t, i) => makeNode('sticky', at.x + (i % 5) * (w + 20), at.y + Math.floor(i / 5) * (h + 20), { text: t.slice(0, 2000), color: stickyColor, author: actor })));
        }
    };
    const onDrop = (e: React.DragEvent) => {
        if (!canEdit) return;
        const files = [...e.dataTransfer.files];
        if (!files.length) return;
        e.preventDefault();
        void addImages(files, toBoard(e.clientX, e.clientY));
    };

    commitRef.current = next => commit(next);

    // ---- asistan
    const visibleRect = (): Rect => {
        const r = viewport.current?.getBoundingClientRect();
        const v = viewRef.current;
        return { x: -v.x / v.zoom, y: -v.y / v.zoom, w: (r?.width || 800) / v.zoom, h: (r?.height || 600) / v.zoom };
    };
    const applyAi = (r: WbAiResult) => {
        const before = selectionRef.current;
        commit(applyWbAiResult(docRef.current, r));
        const ids = new Set([...before, ...r.nodes.map(n => n.id), ...r.moves.map(m => m.id)]);
        setSelection(r.nodes.map(n => n.id));
        window.setTimeout(() => fit(docRef.current.nodes.filter(n => ids.has(n.id))), 0);
    };
    const applyAiRef = useRef(applyAi);
    applyAiRef.current = applyAi;
    const projectRef = useRef(project);
    projectRef.current = project;
    const visibleRef = useRef(visibleRect);
    visibleRef.current = visibleRect;
    // Uygulamanın asistanı bu panoya çizebilsin (sohbette "panoya_ciz" aracı); pano kapanınca kayıt silinir
    useEffect(() => {
        if (!canEdit) return;
        const bridge: WhiteboardBridge = {
            describe: () => {
                const d = docRef.current;
                const sel = selectionRef.current.map(id => d.nodes.find(n => n.id === id)).filter((n): n is WbNode => !!n);
                const img = sel.some(n => n.type === 'image');
                return `"${d.name}" panosu, ${d.nodes.length} nesne${sel.length ? `; ${sel.length} nesne seçili${img ? ' (ekran görüntüsü dahil)' : ''}` : '; seçim yok (görünen alana çizilir)'}`;
            },
            draw: async (request, complete) => {
                const d = docRef.current;
                const selection = selectionRef.current.map(id => d.nodes.find(n => n.id === id)).filter((n): n is WbNode => !!n);
                const r = await runWbAssistant({ board: d, project: projectRef.current, selection, visible: visibleRef.current(), request, sendImage: whiteboardImageConsent(), complete });
                applyAiRef.current(r.result);
                return { summary: r.result.summary, added: r.result.nodes.length, moved: r.result.moves.length, noImage: r.noImage };
            },
        };
        setWhiteboardBridge(bridge);
        return () => clearWhiteboardBridge(bridge);
    }, [canEdit]);

    // ---- çizim
    const nodes = drawOrder(doc.nodes);
    const selSet = new Set(selection);
    const remoteSel = new Map<string, WbPeer>();
    peers.forEach(p => (p.selection || []).forEach(id => { if (!remoteSel.has(id)) remoteSel.set(id, p); }));
    const selBounds = boundsOf(selectedNodes);
    const single = selectedNodes.length === 1 ? selectedNodes[0] : undefined;
    const timer = timerLeft(doc);
    const results = doc.voting && !doc.voting.active ? voteResults(doc) : [];
    const cursor = interaction?.kind === 'pan' ? 'grabbing' : tool === 'hand' || space.current ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
    const sw = 1 / view.zoom;
    const markerId = `wb-arrow-${doc.id}`;

    const editor = (n: WbNode) => {
        if (editing?.id !== n.id) return undefined;
        const common = {
            ref: (el: HTMLTextAreaElement | HTMLInputElement | null) => { editRef.current = el; },
            value: editing.text,
            autoFocus: true,
            'data-editing': true,
            onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            onBlur: () => { if (!palette) finishEdit(); },
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
                const text = e.target.value;
                setEditing({ id: n.id, text });
                const caret = e.target.selectionStart ?? text.length;
                if (wantsReference(text, caret)) openPalette('reference', { x: n.x, y: n.y + n.h });
            },
            onKeyDown: (e: React.KeyboardEvent) => {
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); finishEdit(); viewport.current?.focus(); }
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && n.type === 'sticky') {
                    // Yanına yeni not (FigJam: ⌘+Enter)
                    e.preventDefault();
                    finishEdit(b => {
                        const src = b.nodes.find(x => x.id === n.id) || n;
                        const nn = makeNode('sticky', src.x + src.w + 24, src.y, { color: src.color, w: src.w, h: src.h, author: actor });
                        commit(addNodes(b, [nn]), b);
                        fresh.current = new Set([nn.id]);
                        setSelection([nn.id]);
                        setEditing({ id: nn.id, text: '' });
                    });
                }
                if (e.key === 'Enter' && n.type === 'section') { e.preventDefault(); finishEdit(); }
            },
        };
        if (n.type === 'section') return <input {...common} className="bg-transparent border-0 outline-none min-w-[160px] font-semibold" style={{ color: 'inherit', font: 'inherit' }} aria-label="Bölüm adı" />;
        return <textarea {...common} className="w-full h-full resize-none bg-transparent border-0 outline-none p-0 m-0" style={{ color: 'inherit', font: 'inherit', textAlign: n.type === 'shape' ? 'center' : 'left' }}
            placeholder="Yazın · // ile görev, sprint ya da iş paketi ekleyin" aria-label="Not metni" />;
    };

    const toolbarBtn = (active: boolean) => `w-10 h-10 flex-none rounded-xl grid place-items-center border-0 cursor-pointer ${active ? 'm-tone-accent' : 'bg-transparent m-text-2 hover:m-fill-2'}`;

    return (
        <div
            ref={viewport}
            tabIndex={0}
            className="m-wb-canvas relative w-full h-full overflow-hidden outline-none select-none rounded-2xl"
            style={{ cursor, touchAction: 'none', backgroundImage: 'radial-gradient(circle, var(--wb-dot, rgba(120,120,130,0.35)) 1px, transparent 1px)', backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setInteraction(null)}
            onDoubleClick={onDoubleClick}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onCopy={onCopy}
            onCut={onCut}
            onPaste={onPaste}
            onDragOver={e => { if (canEdit) e.preventDefault(); }}
            onDrop={onDrop}
            onContextMenu={e => e.preventDefault()}
            aria-label={`${doc.name} panosu`}
            role="application"
        >
            {/* Dönüştürülen katman: pano koordinatları */}
            <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
                {nodes.map(n => {
                    const sel = selSet.has(n.id);
                    // Başkasının sürüklediği nesne canlı konumunda çizilir
                    const lv = !interaction ? collab?.live[n.id] : undefined;
                    const r = lv || n;
                    const otherSel = !sel ? remoteSel.get(n.id) : undefined;
                    const otherEdit = editingBy.get(n.id);
                    const ring = sel ? `${2 * sw}px solid #2563eb` : otherEdit ? `${2 * sw}px solid ${otherEdit.color}` : otherSel ? `${2 * sw}px dashed ${otherSel.color}` : lv ? `${2 * sw}px dashed ${lv.color}` : undefined;
                    return (
                        <div key={n.id} data-node-id={n.id}
                            className="absolute"
                            style={{
                                left: r.x, top: r.y, width: Math.max(1, r.w), height: Math.max(1, r.h),
                                pointerEvents: n.type === 'pen' ? 'none' : undefined,
                                outline: ring,
                                outlineOffset: ring ? 3 * sw : undefined,
                                borderRadius: n.type === 'section' ? 16 : 6,
                                transition: lv ? 'left 60ms linear, top 60ms linear' : undefined,
                                // Oylamada oylanamayanlar soluk, oylananlar tıklanabilir görünür
                                opacity: doc.voting?.active && n.type !== 'section' && n.type !== 'pen' && !isVotable(doc, n) ? 0.35 : undefined,
                                cursor: doc.voting?.active && canVote && isVotable(doc, n) ? 'pointer' : undefined,
                            }}>
                            <WbNodeBody n={n} env={env} editor={editor(n)} />
                            {n.locked && <span className="absolute -top-3 -left-3 w-6 h-6 rounded-full grid place-items-center m-surface shadow m-text-3" title="Kilitli"><Icon name="lock" size={12} /></span>}
                            {otherEdit && (
                                <span className="absolute left-0 top-0 whitespace-nowrap px-2 py-0.5 rounded-md text-white text-[12px] font-semibold pointer-events-none"
                                    style={{ background: otherEdit.color, transform: `translateY(-100%) scale(${sw})`, transformOrigin: '0 100%' }}>{otherEdit.name} yazıyor…</span>
                            )}
                        </div>
                    );
                })}

                {/* Bağlantılar, kalem önizlemesi, geçici bağlantı (nesnelerin üstünde, tıklanabilir) */}
                <svg className="absolute left-0 top-0 overflow-visible" width={1} height={1} style={{ pointerEvents: 'none' }}>
                    <defs>
                        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                            <path d="M0 0 L10 5 L0 10 z" fill="var(--wb-ink, #3f3f46)" />
                        </marker>
                    </defs>
                    {doc.edges.map(e => {
                        const a = byId.get(e.from), b = byId.get(e.to);
                        if (!a || !b) return null;
                        const p = edgeEnds(a, b);
                        const sel = edgeSel === e.id;
                        const mx = (p.x1 + p.x2) / 2, my = (p.y1 + p.y2) / 2;
                        return (
                            <g key={e.id} data-edge-id={e.id} style={{ pointerEvents: 'auto', cursor: 'pointer' }}>
                                <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="transparent" strokeWidth={14 * sw} />
                                <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={sel ? '#2563eb' : 'var(--wb-ink, #3f3f46)'} strokeWidth={sel ? 3 : 2} markerEnd={e.style === 'line' ? undefined : `url(#${markerId})`} />
                                {e.label && <text x={mx} y={my - 6} textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--wb-ink, #3f3f46)" stroke="var(--wb-canvas, #f4f4f6)" strokeWidth={5} paintOrder="stroke">{e.label}</text>}
                            </g>
                        );
                    })}
                    {interaction?.kind === 'pen' && <path d={penPath(interaction.points)} fill="none" stroke={PEN_COLORS[penColor]} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
                    {interaction?.kind === 'connect' && (() => {
                        const a = byId.get(interaction.from);
                        if (!a) return null;
                        return <line x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={interaction.cur.x} y2={interaction.cur.y} stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" markerEnd={`url(#${markerId})`} />;
                    })()}
                </svg>

                {/* Tutamaçlar: boyutlandırma ve bağlantı (tek seçimde) */}
                {single && canEdit && !single.locked && !editing && single.type !== 'pen' && (
                    <>
                        <div data-node-id={single.id} data-handle="resize" title="Boyutlandır (Shift: oranı koru)" className="absolute rounded-sm"
                            style={{ left: single.x + single.w - 6 * sw + 3 * sw, top: single.y + single.h - 6 * sw + 3 * sw, width: 12 * sw, height: 12 * sw, background: '#fff', border: `${2 * sw}px solid #2563eb`, cursor: 'nwse-resize' }} />
                        {[[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]].map(([fx, fy], i) => (
                            <div key={i} data-node-id={single.id} data-handle="connect" title="Sürükleyerek bağla" className="absolute rounded-full"
                                style={{ left: single.x + single.w * fx - 7 * sw + (fx === 1 ? 18 : fx === 0 ? -18 : 0) * sw, top: single.y + single.h * fy - 7 * sw + (fy === 1 ? 18 : fy === 0 ? -18 : 0) * sw, width: 14 * sw, height: 14 * sw, background: '#2563eb', border: `${2 * sw}px solid #fff`, cursor: 'crosshair', opacity: 0.85 }} />
                        ))}
                    </>
                )}

                {interaction?.kind === 'marquee' && (
                    <div className="absolute pointer-events-none" style={{
                        left: Math.min(interaction.start.x, interaction.cur.x), top: Math.min(interaction.start.y, interaction.cur.y),
                        width: Math.abs(interaction.cur.x - interaction.start.x), height: Math.abs(interaction.cur.y - interaction.start.y),
                        background: 'rgba(37,99,235,0.08)', border: `${sw}px solid #2563eb`,
                    }} />
                )}
                {/* Diğer katılımcıların imleçleri (yakınlaştırmadan bağımsız boyut) */}
                {peers.filter(p => p.cursor).map(p => (
                    <div key={p.client} className="absolute pointer-events-none" style={{ left: p.cursor!.x, top: p.cursor!.y, transform: `scale(${sw})`, transformOrigin: '0 0', transition: 'left 80ms linear, top 80ms linear', zIndex: 5 }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.3))' }}>
                            <path d="M4 3l7.5 18 2.6-7.4L21.5 11z" fill={p.color} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
                        </svg>
                        <span className="absolute left-4 top-5 whitespace-nowrap px-2 py-0.5 rounded-full text-white text-[12px] font-semibold shadow" style={{ background: p.color }}>{p.name}</span>
                    </div>
                ))}

                {interaction?.kind === 'create' && (interaction.type === 'section' || interaction.type === 'shape') && (
                    <div className="absolute pointer-events-none rounded-xl" style={{
                        left: Math.min(interaction.start.x, interaction.cur.x), top: Math.min(interaction.start.y, interaction.cur.y),
                        width: Math.abs(interaction.cur.x - interaction.start.x), height: Math.abs(interaction.cur.y - interaction.start.y),
                        border: `${2 * sw}px dashed #2563eb`,
                    }} />
                )}
            </div>

            {/* Boş pano ipucu */}
            {!doc.nodes.length && (
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                    <div className="text-center max-w-[460px] px-6">
                        <p className="m-0 text-[20px] font-semibold m-text">Boş pano</p>
                        <p className="mt-2 mb-0 text-[14.5px] m-text-3">{canEdit
                            ? 'Not eklemek için çift tıklayın. "/" ile görev, sprint, iş paketi, risk ve şablon ekleyin. Notta "//" yazınca görev referansı eklenir.'
                            : 'Bu panoda henüz bir şey yok.'}</p>
                    </div>
                </div>
            )}

            {/* Seçim araç çubuğu */}
            {canEdit && !editing && !interaction && (selectedNodes.length > 0 || edgeSel) && (() => {
                const box = selBounds ? toScreen({ x: selBounds.x, y: selBounds.y }) : null;
                const edge = edgeSel ? doc.edges.find(x => x.id === edgeSel) : undefined;
                const colorable = selectedNodes.filter(n => n.type === 'sticky' || n.type === 'shape' || n.type === 'section');
                const shapes = selectedNodes.filter(n => n.type === 'shape');
                const texts = selectedNodes.filter(n => n.type === 'text' || n.type === 'sticky' || n.type === 'shape');
                const pens = selectedNodes.filter(n => n.type === 'pen');
                const convertible = canCreateTasks ? selectedNodes.filter(n => (n.type === 'sticky' || n.type === 'text' || n.type === 'shape') && n.text?.trim()) : [];
                const linked = single && (single.type === 'sprint' || single.type === 'workPackage' || single.type === 'version') ? single : undefined;
                const allLocked = selectedNodes.length > 0 && selectedNodes.every(n => n.locked);
                const vp = viewport.current?.getBoundingClientRect();
                const vw = vp?.width || 800, vh = vp?.height || 600;
                const boxW = selBounds ? selBounds.w * view.zoom : 0, boxH = selBounds ? selBounds.h * view.zoom : 0;
                const left = box ? Math.max(8, Math.min(vw - barSize.w - 8, box.x + boxW / 2 - barSize.w / 2)) : 12;
                let top = box ? box.y - barSize.h - 16 : 12;
                if (box && top < 8) top = Math.min(vh - barSize.h - 80, box.y + boxH + 16);
                top = Math.max(8, top);
                const ids = selection;
                return (
                    <div ref={barRef} data-ui className="absolute z-30 flex flex-nowrap items-center gap-0.5 p-1 rounded-2xl m-surface m-pop shadow-xl max-w-[calc(100%-16px)] overflow-x-auto" style={{ left, top, border: '1px solid var(--m-sep, #e5e7eb)', visibility: barSize.w ? 'visible' : 'hidden' }} onPointerDown={e => e.stopPropagation()}>
                        {edge && <>
                            <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2 text-[13px]" onClick={() => commit({ ...doc, edges: doc.edges.map(x => (x.id === edge.id ? { ...x, style: x.style === 'line' ? undefined : 'line' } : x)), updatedAt: new Date().toISOString() })}>{edge.style === 'line' ? 'Ok yap' : 'Oku kaldır'}</button>
                            <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2 text-[13px]" onClick={() => { const l = window.prompt('Bağlantı etiketi', edge.label || ''); if (l !== null) commit({ ...doc, edges: doc.edges.map(x => (x.id === edge.id ? { ...x, label: l.trim() || undefined } : x)), updatedAt: new Date().toISOString() }); }}>Etiket</button>
                        </>}
                        {colorable.length > 0 && WB_COLORS.map(c => (
                            <button key={c.key} type="button" title={c.label} aria-label={`Renk: ${c.label}`} className="w-5 h-5 mx-0.5 flex-none rounded-full border cursor-pointer" style={{ background: c.fill, borderColor: c.edge }}
                                onClick={() => commit(updateNodes(doc, colorable.map(n => n.id), { color: c.key }))} />
                        ))}
                        {pens.length > 0 && Object.entries(PEN_COLORS).slice(0, 7).map(([k, v]) => (
                            <button key={k} type="button" aria-label={`Kalem rengi ${k}`} className="w-6 h-6 rounded-full border-0 cursor-pointer" style={{ background: v }} onClick={() => commit(updateNodes(doc, pens.map(n => n.id), { color: k }))} />
                        ))}
                        {shapes.length > 0 && SHAPES.map(s => (
                            <button key={s.shape} type="button" title={s.label} aria-label={s.label} className={toolbarBtn(shapes.every(n => (n.shape || 'rect') === s.shape))} onClick={() => commit(updateNodes(doc, shapes.map(n => n.id), { shape: s.shape }))}><Icon name={s.icon} size={17} /></button>
                        ))}
                        {texts.length > 0 && <span className="w-px h-6 m-fill-2 mx-0.5 flex-none" />}
                        {texts.length > 0 && TEXT_SIZES.map(([l, px]) => (
                            <button key={l} type="button" title={`Yazı ${px}px`} className="w-7 h-8 flex-none rounded-lg border-0 cursor-pointer bg-transparent m-text-2 text-[12px] font-semibold hover:m-fill-2" onClick={() => commit(updateNodes(doc, texts.map(n => n.id), { fontSize: px }))}>{l}</button>
                        ))}
                        {convertible.length > 0 && <button type="button" className="m-btn m-btn-primary !min-h-[34px] !px-3 text-[13px] flex-none whitespace-nowrap" onClick={convertToTasks} title="Not metninden görev oluşturur ve notu görev kartıyla değiştirir"><Icon name="check" size={14} />Göreve dönüştür{convertible.length > 1 ? ` (${convertible.length})` : ''}</button>}
                        {linked && <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-3 text-[13px] flex-none whitespace-nowrap" onClick={() => expandLinked(linked)}><Icon name="plus" size={14} />Görevlerini ekle</button>}
                        {selectedNodes.some(n => n.type === 'image') && <button type="button" className="m-btn m-btn-gray !min-h-[34px] !px-3 text-[13px] flex-none whitespace-nowrap" onClick={() => setAiOpen(true)} title="Değişiklik talebinizi yazın; asistan görselin üstünde işaretlesin ve yeni ekranı çizsin"><Icon name="sparkles" size={14} />Asistana sor</button>}
                        {selectedNodes.length > 0 && <>
                            <span className="w-px h-6 m-fill-2 mx-0.5 flex-none" />
                            <button type="button" title="Öne getir" aria-label="Öne getir" className={toolbarBtn(false)} onClick={() => commit(reorder(doc, ids, 'front'))}><Icon name="bringFront" size={17} /></button>
                            <button type="button" title="Arkaya gönder" aria-label="Arkaya gönder" className={toolbarBtn(false)} onClick={() => commit(reorder(doc, ids, 'back'))}><Icon name="sendBack" size={17} /></button>
                            <button type="button" title={allLocked ? 'Kilidi aç' : 'Kilitle'} aria-label={allLocked ? 'Kilidi aç' : 'Kilitle'} className={toolbarBtn(allLocked)} onClick={() => commit(updateNodes(doc, ids, { locked: allLocked ? undefined : true }))}><Icon name={allLocked ? 'unlock' : 'lock'} size={17} /></button>
                            <button type="button" title="Çoğalt (Ctrl+D)" aria-label="Çoğalt" className={toolbarBtn(false)} onClick={() => { const r = duplicateNodes(doc, ids); commit(r.board); setSelection(r.ids); }}><Icon name="copy" size={17} /></button>
                        </>}
                        <button type="button" title="Sil (Delete)" aria-label="Sil" className={toolbarBtn(false)} onClick={removeSelection}><Icon name="trash" size={17} /></button>
                    </div>
                );
            })()}

            {/* Sol üst: panodaki diğer katılımcılar (tıkla: takip et) */}
            {peers.length > 0 && (
                <div data-ui className="absolute top-3 left-3 z-20 flex items-center gap-2" onPointerDown={e => e.stopPropagation()}>
                    <div className="flex -space-x-2">
                        {peers.slice(0, 8).map(p => (
                            <button key={p.client} type="button" onClick={() => setFollowing(f => (f === p.client ? null : p.client))}
                                title={`${p.name}${following === p.client ? ' · takibi bırak' : ' · takip et'}`} aria-label={`${p.name} kişisini ${following === p.client ? 'takibi bırak' : 'takip et'}`}
                                className="w-9 h-9 rounded-full grid place-items-center text-white text-[12.5px] font-bold border-2 cursor-pointer shadow"
                                style={{ background: p.color, borderColor: following === p.client ? '#111' : 'var(--wb-canvas, #fff)' }}>
                                {initials(p.name)}
                            </button>
                        ))}
                        {peers.length > 8 && <span className="w-9 h-9 rounded-full grid place-items-center m-surface m-text-2 text-[12px] font-semibold border-2 shadow" style={{ borderColor: 'var(--wb-canvas, #fff)' }}>+{peers.length - 8}</span>}
                    </div>
                    {followed && (
                        <span className="inline-flex items-center gap-2 h-9 pl-3 pr-1 rounded-xl text-white text-[13px] font-semibold shadow" style={{ background: followed.color }}>
                            {followed.name} takip ediliyor
                            <button type="button" aria-label="Takibi bırak" className="w-7 h-7 rounded-lg border-0 cursor-pointer grid place-items-center" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }} onClick={() => setFollowing(null)}><Icon name="x" size={14} /></button>
                        </span>
                    )}
                </div>
            )}
            {followed && <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ boxShadow: `inset 0 0 0 3px ${followed.color}` }} />}

            {/* Sağ üst: oturum ve yakınlaştırma */}
            <div data-ui className="absolute top-3 right-3 z-20 flex flex-wrap items-center justify-end gap-2" onPointerDown={e => e.stopPropagation()}>
                {timer !== null && (
                    <span className={`inline-flex items-center gap-2 h-10 pl-3 pr-1 rounded-xl m-surface m-pop shadow-md text-[15px] font-semibold m-tabular ${timer === 0 ? 'm-ink-bad' : 'm-text'}`}>
                        <Icon name="clock" size={16} />{String(Math.floor(timer / 60)).padStart(2, '0')}:{String(timer % 60).padStart(2, '0')}
                        {canEdit && <button type="button" aria-label="Zamanlayıcıyı durdur" className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer m-text-3" onClick={() => commit(stopTimer(doc))}><Icon name="x" size={15} /></button>}
                    </span>
                )}
                {canEdit && !doc.voting?.active && (
                    <button type="button" className={`h-10 px-3 rounded-xl m-surface m-pop shadow-md inline-flex items-center gap-1.5 border-0 cursor-pointer text-[13.5px] font-semibold ${voteSetup ? 'm-tone-accent' : 'm-text'}`}
                        aria-expanded={voteSetup} onClick={() => { setVotePanel(false); setVoteSetup(v => !v); }}><Icon name="thumbsUp" size={15} />Oylama</button>
                )}
                {!canEdit && !doc.voting?.active && results.length > 0 && (
                    <button type="button" className="h-10 px-3 rounded-xl m-surface m-pop shadow-md inline-flex items-center gap-1.5 border-0 cursor-pointer text-[13.5px] font-semibold m-text" onClick={() => setVotePanel(v => !v)}><Icon name="thumbsUp" size={15} />Sonuçlar</button>
                )}
                {canEdit && (
                    <details className="relative">
                        <summary className="list-none h-10 w-10 rounded-xl m-surface m-pop shadow-md grid place-items-center cursor-pointer m-text" title="Zamanlayıcı" aria-label="Zamanlayıcı"><Icon name="clock" size={16} /></summary>
                        <div className="absolute right-0 mt-2 p-2 rounded-xl m-surface m-pop shadow-xl flex gap-1" style={{ border: '1px solid var(--m-sep, #e5e7eb)' }}>
                            {[1, 3, 5, 10, 15].map(m => <button key={m} type="button" className="m-btn m-btn-gray !min-h-[34px] !px-3" onClick={e => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; commit(startTimer(doc, m * 60)); }}>{m} dk</button>)}
                        </div>
                    </details>
                )}
                <span className="inline-flex items-center h-10 rounded-xl m-surface m-pop shadow-md">
                    <button type="button" aria-label="Uzaklaş" className="w-9 h-10 border-0 bg-transparent cursor-pointer m-text-2" onClick={() => zoomAt(1 / 1.2)}><Icon name="minus" size={15} /></button>
                    <button type="button" title="Sığdır (Shift+1) · tıkla: %100" className="min-w-[56px] h-10 border-0 bg-transparent cursor-pointer text-[13px] font-semibold m-tabular m-text" onClick={() => (Math.abs(view.zoom - 1) < 0.01 ? fit() : setView(v => ({ ...v, zoom: 1 })))}>%{Math.round(view.zoom * 100)}</button>
                    <button type="button" aria-label="Yakınlaş" className="w-9 h-10 border-0 bg-transparent cursor-pointer m-text-2" onClick={() => zoomAt(1.2)}><Icon name="plus" size={15} /></button>
                    <button type="button" aria-label="İçeriğe sığdır" title="İçeriğe sığdır (Shift+1)" className="w-9 h-10 border-0 bg-transparent cursor-pointer m-text-2" onClick={() => fit()}><Icon name="expand" size={15} /></button>
                </span>
            </div>

            {/* Oylama: sürerken şerit, kurulum ve sonuçlar */}
            {doc.voting?.active && (
                <VoteBanner board={doc} voter={voter} canVote={canVote} canEnd={canEdit} secondsLeft={doc.voting.endsAt ? timer : null}
                    scopeName={doc.voting.scope ? (byId.get(doc.voting.scope)?.text || 'Bölüm') : undefined} onEnd={() => toggleVoting()} />
            )}
            {voteSetup && canEdit && !doc.voting?.active && (
                <VoteSetup section={single?.type === 'section' ? single : selectedNodes.find(n => n.type === 'section')} hasResults={results.length > 0}
                    onStart={beginVoting} onShowResults={() => { setVoteSetup(false); setVotePanel(true); }} onClose={() => setVoteSetup(false)} />
            )}
            {votePanel && doc.voting && !doc.voting.active && (
                <VoteResults board={doc} results={results} tasksById={tasksById} canEdit={canEdit}
                    onFocus={n => { setSelection([n.id]); fit([n]); }}
                    onSelectTop={ids => { setSelection(ids); fit(doc.nodes.filter(n => ids.includes(n.id))); }}
                    onAddSummary={addVoteSummary}
                    onRestart={() => { setVotePanel(false); setVoteSetup(true); }}
                    onClear={() => { commit(clearVoting(docRef.current)); setVotePanel(false); }}
                    onClose={() => setVotePanel(false)} />
            )}

            {/* Alt araç çubuğu */}
            <div data-ui className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2" onPointerDown={e => e.stopPropagation()}>
                {canEdit && tool === 'sticky' && (
                    <div className="flex gap-1.5 p-2 rounded-2xl m-surface m-pop shadow-lg">{WB_COLORS.slice(0, 9).map(c => <button key={c.key} type="button" aria-label={`Not rengi: ${c.label}`} className="w-7 h-7 rounded-md border-2 cursor-pointer" style={{ background: c.fill, borderColor: stickyColor === c.key ? '#2563eb' : c.edge }} onClick={() => setStickyColor(c.key)} />)}</div>
                )}
                {canEdit && tool === 'shape' && (
                    <div className="flex gap-1 p-1.5 rounded-2xl m-surface m-pop shadow-lg">{SHAPES.map(s => <button key={s.shape} type="button" title={s.label} aria-label={s.label} className={toolbarBtn(shapeKind === s.shape)} onClick={() => setShapeKind(s.shape)}><Icon name={s.icon} size={18} /></button>)}</div>
                )}
                {canEdit && tool === 'stamp' && (
                    <div className="flex gap-1 p-1.5 rounded-2xl m-surface m-pop shadow-lg">{STAMPS.map(s => <button key={s} type="button" aria-label={`Damga ${s}`} className={`${toolbarBtn(stamp === s)} text-[20px]`} onClick={() => setStamp(s)}>{s}</button>)}</div>
                )}
                {canEdit && tool === 'pen' && (
                    <div className="flex gap-1.5 p-2 rounded-2xl m-surface m-pop shadow-lg">{Object.entries(PEN_COLORS).filter(([k]) => k !== 'white').map(([k, v]) => <button key={k} type="button" aria-label={`Kalem rengi ${k}`} className="w-7 h-7 rounded-full cursor-pointer" style={{ background: v, border: penColor === k ? '3px solid #93c5fd' : '0' }} onClick={() => setPenColor(k)} />)}</div>
                )}
                <div className="flex items-center gap-0.5 p-1.5 rounded-2xl m-surface m-pop shadow-xl" role="toolbar" aria-label="Pano araçları" style={{ border: '1px solid var(--m-sep, #e5e7eb)' }}>
                    {TOOLS.filter(t => canEdit || t.tool === 'select' || t.tool === 'hand').map(t => (
                        <button key={t.tool} type="button" title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool === t.tool} className={toolbarBtn(tool === t.tool)} onClick={() => { setTool(t.tool); viewport.current?.focus(); }}>
                            <Icon name={t.icon} size={19} />
                        </button>
                    ))}
                    {canEdit && <>
                        <span className="w-px h-7 m-fill-2 mx-1" />
                        <button type="button" title="Ekle: görev, sprint, iş paketi, risk, şablon (/)" aria-label="Komut paleti" className="h-10 px-3 rounded-xl border-0 cursor-pointer m-tone-accent inline-flex items-center gap-1.5 text-[14px] font-semibold" onClick={() => openPalette('insert', viewportCenter())}>
                            <Icon name="slash" size={16} />Ekle
                        </button>
                        <label className={`${toolbarBtn(false)} cursor-pointer`} title="Görsel ekle (ya da yapıştır / sürükle)" aria-label="Görsel ekle">
                            <Icon name="image" size={19} />
                            <input type="file" accept="image/*" multiple className="hidden" onChange={e => { void addImages([...(e.target.files || [])], viewportCenter()); e.target.value = ''; }} />
                        </label>
                        <button type="button" title="Geri al (Ctrl+Z)" aria-label="Geri al" className={toolbarBtn(false)} onClick={undo}><Icon name="undo" size={18} /></button>
                        <span className="w-px h-7 m-fill-2 mx-1" />
                        <button type="button" title="Asistan: isteğinizi yazın, panoya çizsin (seçili ekran görüntüsünde değişiklikleri işaretler)" aria-pressed={aiOpen}
                            className={`h-10 px-3 rounded-xl border-0 cursor-pointer inline-flex items-center gap-1.5 text-[14px] font-semibold ${aiOpen ? 'm-tone-accent' : 'bg-transparent m-text'}`} onClick={() => setAiOpen(o => !o)}>
                            <Icon name="sparkles" size={16} />Asistan
                        </button>
                    </>}
                </div>
            </div>

            {aiOpen && canEdit && (
                <WbAssistant board={doc} project={project} selection={selectedNodes} visible={visibleRect()}
                    onApply={applyAi} onUndo={undo} onClose={() => { setAiOpen(false); viewport.current?.focus(); }} />
            )}

            {palette && (
                <WbPalette project={project} tasksById={tasksById} at={palette.at} mode={palette.mode} canEdit={canEdit} votingActive={!!doc.voting?.active}
                    onAction={onPaletteAction} onViewTask={onViewTask}
                    onClose={() => { setPalette(null); paletteOffset.current = 0; if (palette.mode === 'reference') editRef.current?.focus(); else viewport.current?.focus(); }} />
            )}

            {toast && <div data-ui role="status" className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-xl shadow-lg text-[14px] font-medium text-white" style={{ background: '#18181b' }}>{toast}</div>}
        </div>
    );
};

export default WhiteboardEditor;

