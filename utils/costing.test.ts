import { describe, it, expect } from 'vitest';
import { buildCostReport, fmtTL } from './costing';
import { createEmptyWorkspace, createProject } from './workspace';
import { WorkspaceData } from '../types';

const buildWs = (): WorkspaceData => {
    const p1 = createProject('Proje A');
    const p2 = createProject('Proje B');
    return {
        ...createEmptyWorkspace(),
        projects: [p1, p2],
        titles: [
            { code: 'ARŞ', name: 'Araştırmacı', monthlyCost: 100000 },
            { code: 'UAR', name: 'Uzman Araştırmacı', monthlyCost: 150000 },
            { code: 'BRS', name: 'Bursiyer' }, // maliyet girilmemiş
        ],
        people: [
            { id: 'k1', firstName: 'Kaan', lastName: 'T', departmentCode: 'U310', availableAA: 1, roles: [], titleCode: 'ARŞ' },
            { id: 'k2', firstName: 'Ayşe', lastName: 'D', departmentCode: 'U320', availableAA: 1, roles: [], titleCode: 'UAR' },
            { id: 'k3', firstName: 'Mehmet', lastName: 'B', departmentCode: 'U310', availableAA: 1, roles: [], titleCode: 'BRS' },
            { id: 'k4', firstName: 'Zeynep', lastName: 'Ü', departmentCode: 'U310', availableAA: 1, roles: [] }, // ünvansız
        ],
        allocations: [
            { id: 'a1', personId: 'k1', projectId: p1.id, year: 2026, plan: { 1: 0.5, 2: 0.5 }, actual: { 1: 0.6 } },
            { id: 'a2', personId: 'k2', projectId: p1.id, year: 2026, plan: { 1: 0.4 }, actual: {} },
            { id: 'a3', personId: 'k2', projectId: p2.id, year: 2026, plan: { 1: 0.2 }, actual: { 1: 0.2 } },
            { id: 'a4', personId: 'k3', projectId: p1.id, year: 2026, plan: { 1: 1 }, actual: {} }, // maliyetsiz ünvan
            { id: 'a5', personId: 'k4', projectId: p1.id, year: 2026, plan: { 1: 0.3 }, actual: {} }, // ünvansız
            { id: 'a6', personId: 'k1', projectId: p1.id, year: 2025, plan: { 1: 1 }, actual: {} }, // farklı yıl
        ],
    };
};

describe('buildCostReport', () => {
    it('AA × ünvan aylık maliyetiyle plan/gerçekleşen maliyeti hesaplar', () => {
        const r = buildCostReport(buildWs(), 2026);
        // Ocak plan: k1 0.5×100k + k2 0.4×150k + k2 0.2×150k = 50k + 60k + 30k = 140k
        expect(r.monthlyPlanCost[0]).toBe(140000);
        expect(r.monthlyPlanCost[1]).toBe(50000); // Şubat: k1 0.5×100k
        // Ocak gerçekleşen: k1 0.6×100k + k2 0.2×150k = 90k
        expect(r.monthlyActualCost[0]).toBe(90000);
        expect(r.totalPlanCost).toBe(190000);
        expect(r.totalActualCost).toBe(90000);
        expect(r.totalVarianceCost).toBe(-100000);
    });

    it('proje ve bölüm kırılımı doğru; plan maliyetine göre sıralı', () => {
        const r = buildCostReport(buildWs(), 2026);
        const pa = r.byProject.find(p => p.label === 'Proje A')!;
        expect(pa.planCost).toBe(160000); // 50+50 (k1) + 60 (k2)
        expect(pa.actualCost).toBe(60000);
        const pb = r.byProject.find(p => p.label === 'Proje B')!;
        expect(pb.planCost).toBe(30000);
        expect(r.byProject[0].label).toBe('Proje A'); // büyük önce
        const u320 = r.byDepartment.find(d => d.key === 'U320')!;
        expect(u320.planCost).toBe(90000); // k2'nin tüm tahsisleri
    });

    it('maliyetlenemeyen kişileri listeler, hesaba katmaz', () => {
        const r = buildCostReport(buildWs(), 2026);
        expect(r.uncostedPeople).toContain('Mehmet B'); // ünvanına ₺ girilmemiş
        expect(r.uncostedPeople).toContain('Zeynep Ü'); // ünvansız
        expect(r.uncostedPeople).toHaveLength(2);
        expect(r.costedTitleCount).toBe(2);
    });

    it('hiç maliyet girilmemişse katman boş döner', () => {
        const ws = buildWs();
        ws.titles = ws.titles.map(t => ({ ...t, monthlyCost: undefined }));
        const r = buildCostReport(ws, 2026);
        expect(r.costedTitleCount).toBe(0);
        expect(r.totalPlanCost).toBe(0);
    });
});

describe('fmtTL', () => {
    it('tr-TR binlik ayraçla biçimler', () => {
        expect(fmtTL(1234567.4)).toBe('1.234.567 ₺');
        expect(fmtTL(0)).toBe('0 ₺');
    });
});
