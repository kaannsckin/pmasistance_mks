import { describe, expect, it } from 'vitest';
import { addNodes, createBoard, makeNode } from './model';
import { applyWbAiResult, buildFrame, buildWbAiPrompt, containRect, imageSpaceH, IMAGE_SPACE_W, parseWbAiResult } from './assistant';

describe('whiteboard asistanı', () => {
    const img = makeNode('image', 100, 100, { w: 500, h: 400, src: 'data:image/png;base64,AAAA', text: 'ekran.png' });
    const note = makeNode('sticky', 1000, 100, { text: 'Kaydet nerede?' });
    const board = addNodes(createBoard('UI inceleme'), [img, note]);
    const visible = { x: 0, y: 0, w: 1600, h: 900 };

    it('containRect: görselin düğüm içinde çizildiği alan (object-contain)', () => {
        expect(containRect({ x: 100, y: 100, w: 500, h: 400 }, 1000, 500)).toEqual({ x: 100, y: 175, w: 500, h: 250 });
    });

    it('görsel uzayındaki işaretlemeyi görselin üstüne, notları sağdaki alana yerleştirir', () => {
        const frame = buildFrame({ board, selection: [img], image: { node: img, rect: containRect(img, 1000, 500) }, visible });
        expect(frame.anchor).toEqual({ x: 720, y: 175 });
        expect(imageSpaceH(frame)).toBe(500);
        const prompt = buildWbAiPrompt(frame, 'Kaydet düğmesini sağ üste al', { board, imageSent: true });
        expect(prompt).toContain(`${IMAGE_SPACE_W} x 500`);
        expect(prompt).toContain('İstek: Kaydet düğmesini sağ üste al');
        const r = parseWbAiResult(JSON.stringify({
            summary: 'Kaydet düğmesi işaretlendi.',
            items: [
                { id: 'b1', type: 'box', on: 'image', x: 800, y: 20, w: 150, h: 60 },
                { id: 'm1', type: 'marker', on: 'image', x: 790, y: 20, text: '1' },
                { id: 's1', type: 'sticky', x: 0, y: 0, text: '1. Kaydet sağ üste', color: 'pink' },
                { type: 'arrow', from: 'm1', to: 's1' },
                { type: 'blob', x: 1, y: 1 },
                { id: 'w', type: 'section', x: 0, y: 300, w: 1000, h: 600, text: 'Önerilen ekran', color: 'mor-olmayan' },
            ],
        }), frame);
        const [box, marker, sticky, section] = r.nodes;
        expect(box).toMatchObject({ type: 'shape', hollow: true, x: 500, y: 185, w: 75, h: 30, color: 'red' });
        expect(marker).toMatchObject({ shape: 'ellipse', text: '1', w: 34 });
        expect(sticky).toMatchObject({ type: 'sticky', x: 720, y: 175, color: 'pink', author: 'Asistan' });
        expect(section).toMatchObject({ type: 'section', color: 'gray', text: 'Önerilen ekran' });
        expect(r.edges).toHaveLength(1);
        expect(r.edges[0]).toMatchObject({ from: marker.id, to: sticky.id });
        expect(r.nodes).toHaveLength(4); // bilinmeyen tür atlandı
    });

    it('mevcut nesneyi takma adıyla taşır ve bağlar; bölümü en alta koyar', () => {
        const frame = buildFrame({ board, selection: [note], visible });
        expect(frame.refs[0]).toMatchObject({ alias: 'n1' });
        const r = parseWbAiResult('```json\n{"summary":"Gruplandı","items":[{"id":"g","type":"section","x":0,"y":0,"text":"Kaydet"},{"type":"arrow","from":"n1","to":"g"}],"moves":[{"ref":"n1","x":40,"y":60},{"ref":"n9","x":0,"y":0}]}\n```', frame);
        expect(r.moves).toEqual([{ id: note.id, x: frame.anchor.x + 40, y: frame.anchor.y + 60 }]);
        const next = applyWbAiResult(board, r);
        expect(next.nodes.find(n => n.id === note.id)).toMatchObject({ x: frame.anchor.x + 40, y: frame.anchor.y + 60 });
        const section = next.nodes.find(n => n.type === 'section')!;
        expect(section.z).toBeLessThan(0);
        expect(next.edges).toHaveLength(1);
    });

    it('okunamayan ya da boş yanıtta açıklayıcı hata verir', () => {
        const frame = buildFrame({ board, selection: [], visible });
        expect(() => parseWbAiResult('Üzgünüm, çizemem.', frame)).toThrow(/okunamadı/);
        expect(() => parseWbAiResult('{"summary":"x","items":[]}', frame)).toThrow(/çizilecek/);
    });
});
