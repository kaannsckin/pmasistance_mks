import { describe, expect, it } from 'vitest';
import { addNodes, colorOf, createBoard, edgeGeometry, makeNode, taskFromNotes } from './model';
import { buildFrame, parseWbAiResult, resolveWbAiResult } from './assistant';
import { iconSvg, loadIconLib, resolveIconName, searchIcons } from './icons';
import { sanitizeSvg, svgDataUrl } from './svg';
import { buildTaskPrompt, parseTaskDrafts } from './taskAssist';

describe('SVG temizleme', () => {
    it('çizim etiketleri kalır; betik, olay, dış bağlantı ve bilinmeyen etiket atılır; viewBox eklenir', () => {
        const out = sanitizeSvg(`<?xml version="1.0"?><svg width='200' height='100'><script>alert(1)</script><g onclick='x()'><circle cx='50' cy='50' r='40' fill='#f9c' /><image href='http://kotu.example/x.png'/><a href='http://x'><rect width='5' height='5'/></a><foreignObject><div>x</div></foreignObject><path d='M0 0 L10 10' style='fill:url(http://x)'/><use href='#c'/><use href='http://x#y'/></g></svg>`)!;
        expect(out).toContain('<circle cx="50" cy="50" r="40" fill="#f9c" />');
        expect(out).toContain('viewBox="0 0 200 100"');
        expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(out).toContain('<use href="#c" />');
        expect(out).not.toMatch(/script|onclick|kotu\.example|foreignObject|<a\b|<image|url\(http|http:\/\/x/);
        expect(sanitizeSvg('<div>svg değil</div>')).toBeNull();
        expect(sanitizeSvg('<svg viewBox="0 0 10 10"><g></g></svg>')).toBeNull(); // görünür şekil yok
        expect(svgDataUrl('<svg/>')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    });
});

describe('asistan çizimi: illüstrasyon, emoji, yol, özel renk, kıvrımlı ok', () => {
    const board = createBoard('Çizim');
    const frame = buildFrame({ board, selection: [], visible: { x: 0, y: 0, w: 1600, h: 900 } });
    it('yeni öğe türleri pano nesnesine çevrilir', () => {
        const r = parseWbAiResult(JSON.stringify({
            summary: 'Bahar sahnesi',
            items: [
                { id: 'f', type: 'svg', x: 0, y: 0, w: 300, h: 300, text: 'Çiçek', svg: "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='20' fill='#f472b6'/></svg>" },
                { id: 'bad', type: 'svg', svg: '<div>x</div>' },
                { id: 'e', type: 'emoji', x: 320, y: 0, size: 120, emoji: '☁️' },
                { id: 'notemoji', type: 'emoji', emoji: 'abc' },
                { id: 'p', type: 'path', points: [10, 10, 60, 40, 110, 10], color: '#16a34a', width: 3, fill: '#bbf7d0' },
                { id: 's', type: 'shape', shape: 'cloud', x: 500, y: 0, w: 200, h: 120, color: '#BFDBFE' },
                { id: 't', type: 'text', x: 0, y: 320, text: 'Bahar', color: '#be185d' },
                { type: 'arrow', from: 'e', to: 's', curve: 50, label: 'kıvrımlı ok' },
            ],
        }), frame);
        const [svg, emoji, pen, shape, text] = r.nodes;
        expect(svg).toMatchObject({ type: 'image', w: 300, h: 300, text: 'Çiçek' });
        expect(svg.src).toMatch(/^data:image\/svg\+xml/);
        expect(emoji).toMatchObject({ type: 'stamp', stamp: '☁️', w: 120, h: 120 });
        expect(pen).toMatchObject({ type: 'pen', w: 100, h: 30, points: [0, 0, 50, 30, 100, 0], color: '#16a34a', fill: '#bbf7d0', fontSize: 3 });
        expect(shape).toMatchObject({ type: 'shape', shape: 'cloud', color: '#bfdbfe' });
        expect(text).toMatchObject({ type: 'text', color: '#be185d' });
        expect(r.nodes).toHaveLength(5);
        expect(r.summary).toBe('Bahar sahnesi (1 çizim geçersiz ya da çok büyük SVG olduğu için eklenmedi; tekrar isteyin.)');
        expect(r.edges[0]).toMatchObject({ from: emoji.id, to: shape.id, curve: 50, label: 'kıvrımlı ok' });
    });

    it('özel renk ve kıvrımlı çizgi geometrisi', () => {
        expect(colorOf('#ffffff')).toMatchObject({ fill: '#ffffff', ink: '#1F1F23' });
        expect(colorOf('#1e3a8a').ink).toBe('#FFFFFF');
        expect(colorOf('#zzz', 'blue').key).toBe('blue');
        expect(edgeGeometry({ x1: 0, y1: 0, x2: 100, y2: 0 })).toEqual({ d: 'M0 0 L100 0', lx: 50, ly: 0 });
        expect(edgeGeometry({ x1: 0, y1: 0, x2: 100, y2: 0 }, 30)).toEqual({ d: 'M0 0 Q50 60 100 0', lx: 50, ly: 30 });
    });
});

describe('ikonlar ve akış şeması', () => {
    const frame = buildFrame({ board: createBoard('Mimari'), selection: [], visible: { x: 0, y: 0, w: 1600, h: 900 } });

    it('Lucide ikon adı, Türkçe karşılık ve etiket araması çözülür', async () => {
        const lib = await loadIconLib();
        expect(Object.keys(lib.nodes).length).toBeGreaterThan(1500);
        expect(resolveIconName(lib, 'database')).toBe('database');
        expect(resolveIconName(lib, 'TreePine')).toBe('tree-pine');
        expect(resolveIconName(lib, 'veri tabanı')).toBe('database');
        expect(resolveIconName(lib, 'Sunucu')).toBe('server');
        expect(resolveIconName(lib, 'qwertyzz')).toBeNull();
        expect(searchIcons(lib, 'bulut')[0]).toBe('cloud');
        expect(iconSvg(lib, 'database', '#7c3aed')).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24"[^>]*stroke="#7c3aed"/);
    });

    it('asistan yanıtı: ikon + etiket, Mermaid şeması ve şema düğümüne ok; bulunamayan bildirilir', async () => {
        const r = await resolveWbAiResult(JSON.stringify({
            summary: 'Mimari',
            items: [
                { id: 'u', type: 'icon', name: 'users', x: 0, y: 0, size: 64, color: '#2563eb', text: 'Kullanıcılar' },
                { id: 'x', type: 'icon', name: 'boyle-bir-ikon-yok' },
                { id: 'm', type: 'mermaid', x: 200, y: 0, code: 'flowchart LR\n A[API] --> B[(Veri tabanı)]' },
                { type: 'arrow', from: 'u', to: 'm.A' },
            ],
        }), frame);
        const icon = r.nodes.find(n => n.type === 'image')!;
        expect(icon).toMatchObject({ w: 64, h: 64, text: 'Kullanıcılar' });
        expect(decodeURIComponent(icon.src!)).toContain('stroke="#2563eb"');
        expect(r.nodes.find(n => n.type === 'text')).toMatchObject({ text: 'Kullanıcılar', y: icon.y + 70 });
        const api = r.nodes.find(n => n.type === 'shape' && n.text === 'API')!;
        expect(r.nodes.find(n => n.text === 'Veri tabanı')).toMatchObject({ shape: 'cylinder' });
        expect(r.edges.map(e => [e.from, e.to])).toContainEqual([icon.id, api.id]);
        expect(r.edges).toHaveLength(2);
        expect(r.summary).toBe('Mimari (Eklenemeyen: boyle-bir-ikon-yok.)');
        // Kütüphane verilmeden çözümlenirse öğe atlanır ve bildirilir
        expect(parseWbAiResult(JSON.stringify({ items: [{ type: 'mermaid', code: 'graph TD; a-->b' }, { type: 'sticky', text: 'x' }] }), frame).summary).toContain('Eklenemeyen: akış şeması');
    });
});

describe('notlardan tek kayıt', () => {
    const req = makeNode('section', 0, 0, { w: 400, h: 300, text: '01 — Gereksinim' });
    const alt = makeNode('section', 450, 0, { w: 400, h: 300, text: '03 — Alternatif tasarımlar' });
    const dec = makeNode('section', 0, 350, { w: 400, h: 300, text: '06 — Karar ve aksiyon' });
    const n1 = makeNode('sticky', 20, 40, { text: 'Fatura ekranına toplu onay\nMüşteri: 50+ fatura tek seferde' });
    const n2 = makeNode('sticky', 470, 40, { text: 'Alternatif A: tablo üstünde onay çubuğu' });
    const n3 = makeNode('sticky', 680, 40, { text: 'Alternatif B: yan panel' });
    const n4 = makeNode('sticky', 20, 380, { text: 'Seçilen: A' });
    const loose = makeNode('sticky', 1000, 1000, { text: 'Hedef: Aralık sürümü' });
    const board = addNodes(createBoard('Tasarım'), [req, alt, dec, n1, n2, n3, n4, loose]);

    it('başlık gereksinim notundan; açıklama bölüm bölüm', () => {
        const t = taskFromNotes(board, [n4, n3, loose, n2, n1], { now: new Date('2026-11-27T10:00:00Z'), unit: 'Yazılım', boardName: 'Tasarım', author: 'Murat' })!;
        expect(t.name).toBe('Fatura ekranına toplu onay');
        expect(t.notes).toBe([
            '01 — Gereksinim:', '- Fatura ekranına toplu onay', '  Müşteri: 50+ fatura tek seferde', '',
            '03 — Alternatif tasarımlar:', '- Alternatif A: tablo üstünde onay çubuğu', '- Alternatif B: yan panel', '',
            '06 — Karar ve aksiyon:', '- Seçilen: A', '',
            '- Hedef: Aralık sürümü', '',
            'Whiteboard: Tasarım · Murat · 5 nottan birleştirildi',
        ].join('\n'));
        expect(t.labels).toEqual(['Whiteboard']);
    });

    it('asistan istemi bölüm adlarını taşır; yanıt yalnız bilinen notlarla kabul edilir', () => {
        const prompt = buildTaskPrompt(board, [{ alias: 'n1', node: n1 }, { alias: 'n2', node: n2 }], 'tek kayıt aç');
        expect(prompt).toContain('n1 [bölüm: 01 — Gereksinim]');
        expect(prompt).toContain('İstek: tek kayıt aç');
        const r = parseTaskDrafts(JSON.stringify({ summary: '1 kayıt', tasks: [{ title: 'Toplu onay', description: 'Gereksinim: …', notes: ['n1', 'n2', 'n9'], priority: 'High', type: 'feature' }, { title: '' }] }), new Set(['n1', 'n2']));
        expect(r.drafts).toEqual([{ title: 'Toplu onay', description: 'Gereksinim: …', aliases: ['n1', 'n2'], priority: 'High', issueType: 'feature' }]);
        expect(() => parseTaskDrafts('{"tasks": []}', new Set())).toThrow(/kayıt bulamadı/);
    });
});
