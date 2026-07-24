import { describe, it, expect } from 'vitest';
import { buildForecast, detectCutoffMonth } from './forecast';
import { createEmptyWorkspace, createProject } from './workspace';
import { Allocation, Person, TitleDef, WorkspaceData } from '../types';

const person = (id: string, first: string, last: string, titleCode?: string): Person => ({
    id, firstName: first, lastName: last, departmentCode: 'U310', titleCode, availableAA: 1, roles: [],
});

const alloc = (id: string, personId: string, projectId: string, actual: Record<number, number>, plan: Record<number, number> = {}): Allocation => ({
    id, personId, projectId, year: 2026, plan, actual,
});

const build = (allocations: Allocation[], people: Person[], titles: TitleDef[] = []): Pick<WorkspaceData, 'allocations' | 'people' | 'projects' | 'titles'> => {
    const ws = createEmptyWorkspace();
    ws.projects = [createProject('Proje A', { code: 'A' }), createProject('Proje B', { code: 'B' })];
    ws.people = people;
    ws.titles = titles;
    ws.allocations = allocations;
    return ws;
};

describe('buildForecast', () => {
    it('hareketli ortalama: son N gerçekleşen ayın ortalamasını kalan aylara taşır', () => {
        const ws = build([alloc('a1', 'p1', 'x', { 1: 1, 2: 2, 3: 3 })], [person('p1', 'A', 'B')]);
        ws.projects = [createProject('X')];
        ws.allocations[0].projectId = ws.projects[0].id;
        const r = buildForecast(ws, { year: 2026, method: 'movingAvg', window: 3, dim: 'project' });
        expect(r.cutoffMonth).toBe(3);
        // Nisan (idx3) = (1+2+3)/3 = 2
        expect(r.total.months[3].forecast).toBeCloseTo(2, 2);
        expect(r.total.months[3].isForecast).toBe(true);
        // YTD = 6, kalan 9 ay × 2 = 18, EAC = 24
        expect(r.total.ytd).toBeCloseTo(6, 2);
        expect(r.total.eac).toBeCloseTo(24, 2);
    });

    it('doğrusal trend: artan seriyi ileri uzatır', () => {
        const ws = build([alloc('a1', 'p1', 'x', { 1: 1, 2: 2, 3: 3 })], [person('p1', 'A', 'B')]);
        ws.projects = [createProject('X')]; ws.allocations[0].projectId = ws.projects[0].id;
        const r = buildForecast(ws, { year: 2026, method: 'linear', window: 3, dim: 'project' });
        // eğim 1, intercept 1 (0-index) → Nisan(idx3)=4, Mayıs(idx4)=5
        expect(r.total.months[3].forecast).toBeCloseTo(4, 1);
        expect(r.total.months[4].forecast).toBeCloseTo(5, 1);
    });

    it('naïf: son gerçekleşen ay tekrar eder', () => {
        const ws = build([alloc('a1', 'p1', 'x', { 1: 1, 2: 5 })], [person('p1', 'A', 'B')]);
        ws.projects = [createProject('X')]; ws.allocations[0].projectId = ws.projects[0].id;
        const r = buildForecast(ws, { year: 2026, method: 'naive', window: 3, dim: 'project' });
        expect(r.cutoffMonth).toBe(2);
        expect(r.total.months[2].forecast).toBeCloseTo(5, 2); // Mart = son ay (5)
        expect(r.total.eac).toBeCloseTo(1 + 5 + 5 * 10, 2); // Oca1 Şub5 + 10 ay ×5
    });

    it('plana göre: kalan aylar plandan gelir, sapma hesaplanır', () => {
        const ws = build([alloc('a1', 'p1', 'x', { 1: 1 }, { 1: 1, 2: 2, 3: 2 })], [person('p1', 'A', 'B')]);
        ws.projects = [createProject('X')]; ws.allocations[0].projectId = ws.projects[0].id;
        const r = buildForecast(ws, { year: 2026, method: 'plan', window: 3, dim: 'project' });
        // cutoff=1; kalan aylar plan: Şub2, Mar2 → EAC = 1 + 2 + 2 = 5
        expect(r.total.eac).toBeCloseTo(5, 2);
        expect(r.total.planTotal).toBeCloseTo(5, 2);
        expect(r.total.variance).toBeCloseTo(0, 2);
    });

    it('maliyet: EAC AA × ünvan aylık oranı; oransız kişi maliyetlenemez', () => {
        const titles: TitleDef[] = [{ code: 'ARS', name: 'Araştırmacı', monthlyCost: 100000 }];
        const ws = build(
            [
                alloc('a1', 'p1', 'x', { 1: 1, 2: 1, 3: 1 }), // maliyetli (ARS)
                alloc('a2', 'p2', 'x', { 1: 2, 2: 2, 3: 2 }), // ünvansız → maliyetlenemez
            ],
            [person('p1', 'A', 'B', 'ARS'), person('p2', 'C', 'D')],
            titles,
        );
        ws.projects = [createProject('X')]; ws.allocations.forEach(a => a.projectId = ws.projects[0].id);
        const r = buildForecast(ws, { year: 2026, method: 'naive', window: 3, dim: 'person' });
        // p1: EAC AA = 12 (1×12) × 100000 = 1.200.000; p2 maliyetlenemez
        const p1row = r.rows.find(x => x.key === 'p1')!;
        expect(p1row.costEac).toBe(1200000);
        const p2row = r.rows.find(x => x.key === 'p2')!;
        expect(p2row.costable).toBe(false);
        expect(r.uncostedEacAA).toBeGreaterThan(0);
    });

    it('cutoff: yarım kalan son ayı (önceki ayların çok altında) atlar', () => {
        // Oca..Tem dolu (~10-16), Ağustos yarım (0,5) → cutoff Temmuz olmalı
        const ws = build([alloc('a1', 'p1', 'x', { 1: 10, 2: 12, 3: 13, 4: 12, 5: 15, 6: 13, 7: 10, 8: 0.5 })], [person('p1', 'A', 'B')]);
        ws.projects = [createProject('X')]; ws.allocations[0].projectId = ws.projects[0].id;
        expect(detectCutoffMonth(ws, 2026)).toBe(7); // Ağustos atlandı
        const r = buildForecast(ws, { year: 2026, method: 'movingAvg', window: 3, dim: 'project' });
        expect(r.cutoffMonth).toBe(7);
        // Öngörü = (May15+Haz13+Tem10)/3 ≈ 12.67, yarım Ağustos'a düşmez
        expect(r.total.months[7].forecast).toBeGreaterThan(11);
        expect(r.total.months[7].isForecast).toBe(true);
    });

    it('cutoff: kullanıcı elle ay seçebilir', () => {
        const ws = build([alloc('a1', 'p1', 'x', { 1: 10, 2: 12, 3: 13, 4: 12, 5: 15, 6: 13, 7: 10, 8: 0.5 })], [person('p1', 'A', 'B')]);
        ws.projects = [createProject('X')]; ws.allocations[0].projectId = ws.projects[0].id;
        const r = buildForecast(ws, { year: 2026, method: 'naive', window: 3, dim: 'project', cutoffMonth: 8 });
        expect(r.cutoffMonth).toBe(8); // elle Ağustos → gerçekleşen 0,5 dahil
        expect(r.total.months[8].forecast).toBeCloseTo(0.5, 2); // Eylül = son ay (0,5)
    });

    it('kırılım: proje bazında satırlar EAC’ye göre azalan', () => {
        const ws = build(
            [alloc('a1', 'p1', 'A', { 1: 1 }), alloc('a2', 'p1', 'B', { 1: 5 })],
            [person('p1', 'A', 'B')],
        );
        ws.allocations[0].projectId = ws.projects[0].id;
        ws.allocations[1].projectId = ws.projects[1].id;
        const r = buildForecast(ws, { year: 2026, method: 'naive', window: 3, dim: 'project' });
        expect(r.rows).toHaveLength(2);
        expect(r.rows[0].eac).toBeGreaterThanOrEqual(r.rows[1].eac); // azalan
    });
});
