import { describe, it, expect } from 'vitest';
import { createPestelItem, itemsForCategory, PESTEL_ORDER, summarizePestel } from './pestel';
import { PestelItem } from '../types';

const item = (category: PestelItem['category'], kind: PestelItem['kind'], impact: number, text = 'x'): PestelItem =>
    createPestelItem(category, { kind, impact: impact as PestelItem['impact'], text });

describe('pestel', () => {
    it('createPestelItem varsayılanları (tehdit, etki 3)', () => {
        const p = createPestelItem('political');
        expect(p.category).toBe('political');
        expect(p.kind).toBe('threat');
        expect(p.impact).toBe(3);
        expect(p.id).toBeTruthy();
    });

    it('6 faktör sabit sırada', () => {
        expect(PESTEL_ORDER).toEqual(['political', 'economic', 'social', 'technological', 'environmental', 'legal']);
    });

    it('summarizePestel: fırsat/tehdit, yüksek etki, kategori sayıları, boşlar', () => {
        const items = [
            item('political', 'threat', 5),
            item('political', 'opportunity', 2),
            item('economic', 'threat', 4),
            item('legal', 'opportunity', 3),
        ];
        const s = summarizePestel(items);
        expect(s.total).toBe(4);
        expect(s.opportunities).toBe(2);
        expect(s.threats).toBe(2);
        expect(s.highImpact).toBe(2); // 5 ve 4
        expect(s.byCategory.political).toBe(2);
        expect(s.byCategory.economic).toBe(1);
        expect(s.emptyCategories).toContain('social');
        expect(s.emptyCategories).toContain('technological');
        expect(s.emptyCategories).toContain('environmental');
        expect(s.emptyCategories).not.toContain('political');
    });

    it('itemsForCategory etkiye göre azalan', () => {
        const items = [item('social', 'threat', 2), item('social', 'threat', 5), item('economic', 'threat', 4)];
        const soc = itemsForCategory(items, 'social');
        expect(soc.map(i => i.impact)).toEqual([5, 2]);
        expect(itemsForCategory(items, 'economic')).toHaveLength(1);
    });
});
