import { describe, it, expect } from 'vitest';
import { createRisk, riskBand, riskScore, summarizeRisks, topPortfolioRisks } from './risks';
import { createEmptyWorkspace, createProject } from './workspace';
import { Risk, WorkspaceData } from '../types';

const risk = (title: string, p: number, i: number, status: Risk['status'] = 'open'): Risk =>
    createRisk({ title, probability: p as Risk['probability'], impact: i as Risk['impact'], status });

const buildWs = (): WorkspaceData => {
    const p1 = createProject('Proje A');
    const p2 = createProject('Proje B');
    p1.risks = [
        risk('Tedarik gecikmesi', 5, 5),   // 25 high
        risk('Küçük hata', 1, 2),           // 2 low
        risk('Kapanmış', 4, 4, 'closed'),   // hariç
    ];
    p2.risks = [
        risk('Personel kaybı', 3, 4),       // 12 medium
    ];
    return { ...createEmptyWorkspace(), projects: [p1, p2] };
};

describe('riskScore / riskBand', () => {
    it('skor = olasılık × etki; bantlar 1-6 düşük, 8-12 orta, 15-25 yüksek', () => {
        expect(riskScore({ probability: 4, impact: 3 })).toBe(12);
        expect(riskBand(6)).toBe('low');
        expect(riskBand(8)).toBe('medium');
        expect(riskBand(12)).toBe('medium');
        expect(riskBand(15)).toBe('high');
        expect(riskBand(25)).toBe('high');
    });
});

describe('topPortfolioRisks', () => {
    it('kapananları eler, skora göre azalan sıralar, proje adını taşır', () => {
        const rows = topPortfolioRisks(buildWs());
        expect(rows).toHaveLength(3); // kapanmış hariç
        expect(rows[0].title).toBe('Tedarik gecikmesi');
        expect(rows[0].score).toBe(25);
        expect(rows[0].band).toBe('high');
        expect(rows[0].projectName).toBe('Proje A');
        expect(rows[1].title).toBe('Personel kaybı'); // 12
        expect(rows[2].title).toBe('Küçük hata'); // 2
    });
});

describe('summarizeRisks', () => {
    it('bant sayımlarını ve kapananları verir', () => {
        const s = summarizeRisks(buildWs());
        expect(s.high).toBe(1);
        expect(s.medium).toBe(1);
        expect(s.low).toBe(1);
        expect(s.closed).toBe(1);
        expect(s.total).toBe(3);
    });

    it('risksiz projede sıfır döner', () => {
        const s = summarizeRisks({ ...createEmptyWorkspace(), projects: [createProject('Boş')] });
        expect(s.total).toBe(0);
        expect(s.closed).toBe(0);
    });
});
