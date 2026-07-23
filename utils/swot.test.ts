import { describe, it, expect } from 'vitest';
import { createSwotItem, suggestSwotFromContext, summarizeSwot, SWOT_ORDER } from './swot';
import { PestelItem, Risk, SwotItem } from '../types';

const pestel = (partial: Partial<PestelItem>): PestelItem => ({
    id: `p-${Math.random()}`, category: 'economic', text: '', kind: 'threat', impact: 3, ...partial,
});
const risk = (partial: Partial<Risk>): Risk => ({
    id: `r-${Math.random()}`, title: '', probability: 3, impact: 3, status: 'open', createdAt: '', ...partial,
});

describe('summarizeSwot', () => {
    it('içsel/dışsal ve pozitif/negatif toplar; boş kadranları listeler', () => {
        const items: SwotItem[] = [
            createSwotItem('strength', { text: 'Deneyimli ekip' }),
            createSwotItem('weakness', { text: 'Bütçe dar' }),
            createSwotItem('opportunity', { text: 'Yeni pazar' }),
        ];
        const s = summarizeSwot(items);
        expect(s.total).toBe(3);
        expect(s.internal).toBe(2); // güçlü + zayıf
        expect(s.external).toBe(1); // fırsat
        expect(s.positive).toBe(2); // güçlü + fırsat
        expect(s.negative).toBe(1); // zayıf
        expect(s.emptyQuadrants).toEqual(['threat']);
        expect(SWOT_ORDER).toHaveLength(4);
    });
});

describe('suggestSwotFromContext', () => {
    it('PESTEL fırsat→fırsat, PESTEL tehdit→tehdit, yüksek risk→tehdit', () => {
        const pestelItems = [
            pestel({ text: 'Teşvik programı', kind: 'opportunity', category: 'political' }),
            pestel({ text: 'Kur riski', kind: 'threat', category: 'economic' }),
        ];
        const risks = [
            risk({ title: 'Tedarik krizi', probability: 5, impact: 5 }), // skor 25 → tehdit
            risk({ title: 'Küçük risk', probability: 1, impact: 2 }), // skor 2 → elenir
        ];
        const out = suggestSwotFromContext([], pestelItems, risks);
        const byQ = (q: string) => out.filter(i => i.quadrant === q).map(i => i.text);
        expect(byQ('opportunity')).toEqual(['Teşvik programı']);
        expect(byQ('threat')).toEqual(['Kur riski', 'Tedarik krizi']);
        expect(out.find(i => i.text === 'Kur riski')?.note).toContain('PESTEL');
        expect(out.find(i => i.text === 'Tedarik krizi')?.note).toContain('skor 25');
    });

    it('mevcut maddelerle mükerrerleri ayıklar (aynı kadran + metin)', () => {
        const existing = [createSwotItem('threat', { text: 'Kur riski' })];
        const pestelItems = [pestel({ text: 'kur riski', kind: 'threat' })]; // farklı harf büyüklüğü
        const out = suggestSwotFromContext(existing, pestelItems, []);
        expect(out).toHaveLength(0);
    });

    it('kapanan riskleri ve düşük skorluları önermez', () => {
        const risks = [
            risk({ title: 'Kapandı', probability: 5, impact: 5, status: 'closed' }),
            risk({ title: 'Düşük', probability: 2, impact: 3 }), // skor 6
        ];
        expect(suggestSwotFromContext([], [], risks)).toHaveLength(0);
    });
});
