import { describe, it, expect } from 'vitest';
import { buildPestelSvg, wrapText } from './pestelExport';
import { createPestelItem } from './pestel';

describe('wrapText', () => {
    it('uzun metni satırlara böler', () => {
        const lines = wrapText('bir iki üç dört beş altı yedi sekiz dokuz on', 12);
        expect(lines.length).toBeGreaterThan(1);
        lines.forEach(l => expect(l.length).toBeLessThanOrEqual(14));
    });
    it('boş metinde tek boş satır', () => {
        expect(wrapText('')).toEqual(['']);
    });
});

describe('buildPestelSvg', () => {
    const items = [
        createPestelItem('political', { text: 'Teşvik politikaları', kind: 'opportunity', impact: 4 }),
        createPestelItem('legal', { text: 'Yeni mevzuat uyumu', kind: 'threat', impact: 5 }),
    ];

    it('geçerli SVG üretir; başlık + 6 faktör etiketi + madde metinleri içerir', () => {
        const { svg, width, height } = buildPestelSvg('MİLGEM', items);
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
        expect(svg).toContain('PESTEL ANALİZİ');
        expect(svg).toContain('MİLGEM');
        ['Politik', 'Ekonomik', 'Sosyal', 'Teknolojik', 'Çevresel', 'Yasal'].forEach(l => expect(svg).toContain(l));
        expect(svg).toContain('Teşvik politikaları');
        expect(svg).toContain('Yeni mevzuat uyumu');
        expect(width).toBeGreaterThan(1000);
        expect(height).toBeGreaterThan(200);
    });

    it('XML özel karakterlerini kaçırır', () => {
        const { svg } = buildPestelSvg('A & B', [createPestelItem('social', { text: '<risk> & "tırnak"' })]);
        expect(svg).toContain('A &amp; B');
        expect(svg).toContain('&lt;risk&gt; &amp;');
        expect(svg).not.toContain('<risk>');
    });
});
