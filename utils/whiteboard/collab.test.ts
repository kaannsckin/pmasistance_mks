import { describe, expect, it } from 'vitest';
import { Whiteboard } from '../../types';
import {
    applyOps, boardToOps, changedSnap, compactOps, currentSnap, diffBoards, newMergeState, opToRow, restoreSnap, revGt, rowToOp, WbClock, WbOp,
} from './collab';
import { addEdge, addNodes, castVote, createBoard, makeNode, moveNodes, reorder, drawOrder, removeNodes, startVoting, updateNodes } from './model';

const clockOf = (client: string, start = 1000) => { let t = start; return new WbClock(client, () => t++); };

/** İki istemci: her biri kendi değişikliğini op'a çevirir, karşı tarafa iletir */
const peer = (client: string, boards: Whiteboard[]) => {
    const st = newMergeState();
    const clock = clockOf(client);
    let state = boards;
    return {
        get boards() { return state; },
        board(id: string) { return state.find(b => b.id === id)!; },
        /** Yerel değişiklik: prev → next farkı */
        edit(id: string, fn: (b: Whiteboard) => Whiteboard): WbOp[] {
            const prev = state.find(b => b.id === id);
            const next = prev ? fn(prev) : undefined;
            const ops = diffBoards(prev, next, id, () => clock.tick());
            state = applyOps(state, ops, st).boards;
            return ops;
        },
        receive(ops: WbOp[]) { ops.forEach(o => clock.observe(o.rev)); state = applyOps(state, ops, st).boards; },
        st,
    };
};

const seed = () => {
    const a = makeNode('sticky', 0, 0, { text: 'A' });
    const b = makeNode('sticky', 300, 0, { text: 'B' });
    const board = addNodes(createBoard('Retro', new Date('2026-11-26T10:00:00Z')), [a, b]);
    return { board, a, b };
};

describe('whiteboard eş zamanlı düzenleme: birleştirme', () => {
    it('farklı nesnelerde aynı anda yapılan değişiklikler iki tarafta da aynı sonuca varır', () => {
        const { board, a, b } = seed();
        const p1 = peer('c1', [board]), p2 = peer('c2', [board]);
        const o1 = p1.edit(board.id, x => updateNodes(x, [a.id], { text: 'A (Ayşe)' }));
        const o2 = p2.edit(board.id, x => moveNodes(x, [b.id], 50, 20));
        const o3 = p2.edit(board.id, x => addNodes(x, [makeNode('sticky', 600, 0, { text: 'C' })]));
        p1.receive([...o2, ...o3]);
        p2.receive(o1);
        expect(p1.board(board.id).nodes).toEqual(p2.board(board.id).nodes);
        expect(p1.board(board.id).nodes.map(n => n.text)).toEqual(['A (Ayşe)', 'B', 'C']);
        expect(p1.board(board.id).nodes.find(n => n.id === b.id)).toMatchObject({ x: 350, y: 20 });
    });

    it('aynı nesneye eş zamanlı yazmada son yazan kazanır; sıra ve tekrar sonucu değiştirmez', () => {
        const { board, a } = seed();
        const p1 = peer('c1', [board]), p2 = peer('c2', [board]);
        const o1 = p1.edit(board.id, x => updateNodes(x, [a.id], { text: 'bir' }));
        const o2 = p2.edit(board.id, x => updateNodes(x, [a.id], { text: 'iki' }));
        // Saat eşit (ikisi de 1000): istemci kimliği belirler (c2 > c1)
        p1.receive(o2); p2.receive(o1);
        p1.receive(o2); p2.receive([...o1, ...o1]);
        expect(p1.board(board.id).nodes[0].text).toBe('iki');
        expect(p2.board(board.id).nodes[0].text).toBe('iki');
    });

    it('oylar kişi bazında birleşir: iki kişinin aynı nota oyu kaybolmaz', () => {
        const { board, a } = seed();
        const voting = startVoting(board, 3);
        const p1 = peer('c1', [voting]), p2 = peer('c2', [voting]);
        const o1 = p1.edit(board.id, x => castVote(x, a.id, 'ayse'));
        const o2 = p2.edit(board.id, x => castVote(castVote(x, a.id, 'mehmet'), a.id, 'mehmet'));
        expect(o1.map(o => o.k)).toEqual(['vote']);
        p1.receive(o2); p2.receive(o1);
        expect(p1.board(board.id).nodes[0].votes).toEqual({ ayse: 1, mehmet: 2 });
        expect(p2.board(board.id).nodes[0].votes).toEqual({ ayse: 1, mehmet: 2 });
        // Nesne değişikliği (taşıma) oyları silmez
        const o3 = p1.edit(board.id, x => moveNodes(x, [a.id], 10, 10));
        p2.receive(o3);
        expect(p2.board(board.id).nodes[0].votes).toEqual({ ayse: 1, mehmet: 2 });
    });

    it('nesne silinince bağlantıları da silinir; silinmiş pano geç gelen op ile dirilmez', () => {
        const { board, a, b } = seed();
        const linked = addEdge(board, a.id, b.id);
        const p1 = peer('c1', [linked]), p2 = peer('c2', [linked]);
        const del = p1.edit(board.id, x => removeNodes(x, [a.id]));
        expect(del.map(o => o.k).sort()).toEqual(['edge', 'node']);
        const late = p2.edit(board.id, x => updateNodes(x, [b.id], { text: 'geç' }));
        const gone = p1.edit(board.id, () => undefined as unknown as Whiteboard);
        p2.receive([...gone, ...del]);
        p1.receive(late);
        expect(p1.boards).toEqual([]);
        expect(p2.boards).toEqual([]);
    });

    it('op sırası karışık gelse de (nesne panodan önce) pano kurulur', () => {
        const { board } = seed();
        const src = peer('c1', []);
        const ops = boardToOps(board, () => new WbClock('c1').tick());
        src.receive([...ops].reverse());
        expect(src.board(board.id).name).toBe('Retro');
        expect(src.board(board.id).nodes.map(n => n.text).sort()).toEqual(['A', 'B']);
    });

    it('katman sırası z ile: öne getirilen nesne başka istemcide de üstte çizilir', () => {
        const { board, a, b } = seed();
        const p1 = peer('c1', [board]), p2 = peer('c2', [board]);
        p2.receive(p1.edit(board.id, x => reorder(x, [a.id], 'front')));
        expect(drawOrder(p2.board(board.id).nodes).map(n => n.id)).toEqual([b.id, a.id]);
    });
});

describe('whiteboard eş zamanlı düzenleme: geri alma ve satırlar', () => {
    it('geri alma yalnız kendi değişikliğini geri alır; başkasının arada yaptığı korunur', () => {
        const { board, a, b } = seed();
        const before = board;
        const mine = moveNodes(before, [a.id], 100, 0);
        const undo = changedSnap(before, mine);
        expect(Object.keys(undo.nodes)).toEqual([a.id]);
        // Arada başkası B'yi değiştirdi ve yeni not ekledi
        const theirs = addNodes(updateNodes(mine, [b.id], { text: 'B (başkası)' }), [makeNode('sticky', 0, 400, { text: 'yeni' })]);
        const redo = currentSnap(theirs, undo);
        const undone = restoreSnap(theirs, undo);
        expect(undone.nodes.find(n => n.id === a.id)!.x).toBe(0);
        expect(undone.nodes.find(n => n.id === b.id)!.text).toBe('B (başkası)');
        expect(undone.nodes.map(n => n.text)).toContain('yeni');
        expect(restoreSnap(undone, redo).nodes.find(n => n.id === a.id)!.x).toBe(100);
    });

    it('silmeyi geri alma nesneyi ve bağlantısını geri getirir', () => {
        const { board, a, b } = seed();
        const linked = addEdge(board, a.id, b.id);
        const removed = removeNodes(linked, [a.id]);
        const back = restoreSnap(removed, changedSnap(linked, removed));
        expect(back.nodes.map(n => n.id).sort()).toEqual([a.id, b.id].sort());
        expect(back.edges).toHaveLength(1);
    });

    it('op ↔ satır dönüşümü kayıpsız; sıkıştırma aynı öğenin son hâlini bırakır', () => {
        const { board, a } = seed();
        const c = new WbClock('c1', (() => { let t = 5; return () => t++; })());
        const ops = [...boardToOps(board, () => c.tick()), { k: 'vote', board: board.id, node: a.id, voter: 'ayse', n: 2, rev: c.tick() } as WbOp];
        for (const op of ops) expect(rowToOp(opToRow(op, 'ws', 'p1'))).toEqual(op);
        const moved = diffBoards(board, moveNodes(board, [a.id], 5, 5), board.id, () => c.tick());
        const compact = compactOps([...ops, ...moved]);
        expect(compact.filter(o => o.k === 'node' && o.id === a.id)).toHaveLength(1);
        expect(compact.find(o => o.k === 'node' && o.id === a.id)!.rev).toEqual(moved[0].rev);
    });

    it('saat: alınan sürümlerin önüne geçer, duvar saati geri kaysa da artar', () => {
        let wall = 100;
        const c = new WbClock('c1', () => wall);
        expect(c.tick().t).toBe(100);
        wall = 50;
        expect(c.tick().t).toBe(101);
        c.observe({ t: 500, by: 'c2' });
        expect(c.tick().t).toBe(501);
        expect(revGt({ t: 1, by: 'b' }, { t: 1, by: 'a' })).toBe(true);
    });
});
