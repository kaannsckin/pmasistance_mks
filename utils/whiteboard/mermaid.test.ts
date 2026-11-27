import { describe, expect, it } from 'vitest';
import dagre from '@dagrejs/dagre';
import { layoutMermaid, parseMermaid } from './mermaid';

describe('Mermaid akış şeması', () => {
    const code = `flowchart LR
    %% sipariş süreci
    A([Başla]) --> B[Sipariş al]
    B --> C{Stok var mı?}
    C -->|Evet| D[(Depo)]
    C -- Hayır --> E[/Tedarikçiye yaz/]
    D & E --> F((Bitiş))
    subgraph S1 [Ödeme]
      G[Fatura] -.-> H{{Onay}}
    end
    F --- G
    classDef x fill:#f00
    style A fill:#0f0`;

    it('düğüm biçimleri, etiketli ve çoklu bağlantılar, alt grafik', () => {
        const g = parseMermaid(code);
        expect(g.dir).toBe('LR');
        expect([...g.nodes.values()].map(n => [n.id, n.label, n.shape])).toEqual([
            ['A', 'Başla', 'stadium'], ['B', 'Sipariş al', 'rect'], ['C', 'Stok var mı?', 'diamond'], ['D', 'Depo', 'cylinder'],
            ['E', 'Tedarikçiye yaz', 'parallelogram'], ['F', 'Bitiş', 'circle'], ['G', 'Fatura', 'rect'], ['H', 'Onay', 'hexagon'],
        ]);
        expect(g.edges).toEqual([
            { from: 'A', to: 'B', arrow: true }, { from: 'B', to: 'C', arrow: true },
            { from: 'C', to: 'D', label: 'Evet', arrow: true }, { from: 'C', to: 'E', label: 'Hayır', arrow: true },
            { from: 'D', to: 'F', arrow: true }, { from: 'E', to: 'F', arrow: true },
            { from: 'G', to: 'H', arrow: true }, { from: 'F', to: 'G', arrow: false },
        ]);
        expect(g.groups).toEqual([{ id: 'S1', label: 'Ödeme', members: ['G', 'H'] }]);
        expect(parseMermaid('graph TD; a-->b; b-->c').edges).toHaveLength(2);
        expect(parseMermaid('graph TD\n  a["Uzun <br/> etiket"] ==> b').nodes.get('a')!.label).toBe('Uzun \n etiket');
    });

    it('dagre ile yerleşim: çakışmasız kutular, bölüm üyelerini kapsar', () => {
        const r = layoutMermaid(parseMermaid(code), dagre, { x: 1000, y: 500 }, 'Asistan');
        const shapes = r.nodes.filter(n => n.type === 'shape');
        expect(shapes).toHaveLength(8);
        expect(shapes.find(n => n.text === 'Stok var mı?')).toMatchObject({ shape: 'diamond', color: 'yellow' });
        for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
            const a = shapes[i], b = shapes[j];
            expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
        }
        expect(Math.min(...r.nodes.map(n => n.x))).toBeGreaterThanOrEqual(1000);
        const sec = r.nodes.find(n => n.type === 'section')!;
        const g = shapes.find(n => n.text === 'Fatura')!;
        expect(g.x >= sec.x && g.x + g.w <= sec.x + sec.w && g.y >= sec.y && g.y + g.h <= sec.y + sec.h).toBe(true);
        expect(r.edges).toHaveLength(8);
        expect(r.edges.find(e => e.label === 'Evet')).toBeTruthy();
        expect(r.edges.filter(e => e.style === 'line')).toHaveLength(1);
        expect(r.ids.get('C')).toBe(shapes.find(n => n.text === 'Stok var mı?')!.id);
    });
});
