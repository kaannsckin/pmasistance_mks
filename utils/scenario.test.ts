import { describe, it, expect } from 'vitest';
import { buildScenario, departmentRolePairs, proposalProjects } from './scenario';
import { createEmptyWorkspace, createProject } from './workspace';
import { Person, Project, WorkspaceData } from '../types';

const person = (id: string, roles: string[], dept = 'U310', availableAA = 1): Person => ({
    id, firstName: id, lastName: 'T', departmentCode: dept, availableAA, roles,
});

const buildWs = (): WorkspaceData => {
    const devam: Project = createProject('Devam');
    const teklif: Project = { ...createProject('Teklif MİLGEM'), status: 'teklif' };
    return {
        ...createEmptyWorkspace(),
        projects: [devam, teklif],
        people: [
            person('a', ['Yazılım Mühendisi'], 'U310', 1),
            person('b', ['Yazılım Mühendisi'], 'U310', 1),
        ],
        allocations: [
            // Taahhüt: Ocak 1.5 AA (kapasite 2 → açık yok)
            { id: 'c1', personId: 'a', projectId: devam.id, role: 'Yazılım Mühendisi', year: 2026, plan: { 1: 0.8 }, actual: {} },
            { id: 'c2', personId: 'b', projectId: devam.id, role: 'Yazılım Mühendisi', year: 2026, plan: { 1: 0.7 }, actual: {} },
            // Teklif: Ocak 1.0 AA (kazanılırsa toplam 2.5 > 2 → 0.5 açık)
            { id: 't1', personId: 'a', projectId: teklif.id, role: 'Yazılım Mühendisi', year: 2026, plan: { 1: 1.0 }, actual: {} },
        ],
    };
};

describe('buildScenario', () => {
    it('teklif seçilmeden baseline açık yok', () => {
        const r = buildScenario(buildWs(), 2026, { wonProjectIds: [], hires: [] });
        const row = r.rows.find(x => x.role === 'Yazılım Mühendisi')!;
        expect(row.committed[0]).toBeCloseTo(1.5);
        expect(row.capacity[0]).toBeCloseTo(2);
        expect(row.gap[0]).toBe(0);
        expect(r.totalNewGapAA).toBe(0);
        expect(r.newlyStrained).toHaveLength(0);
    });

    it('teklif kazanılırsa rolü açığa düşürür ve yeni açığı raporlar', () => {
        const ws = buildWs();
        const teklifId = ws.projects[1].id;
        const r = buildScenario(ws, 2026, { wonProjectIds: [teklifId], hires: [] });
        const row = r.rows.find(x => x.role === 'Yazılım Mühendisi')!;
        expect(row.scenario[0]).toBeCloseTo(2.5); // 1.5 taahhüt + 1.0 teklif
        expect(row.gap[0]).toBeCloseTo(0.5); // 2.5 − 2
        expect(row.baselineGap[0]).toBe(0);
        expect(r.totalNewGapAA).toBeCloseTo(0.5);
        expect(r.newlyStrained).toHaveLength(1);
        expect(r.newlyStrained[0].role).toBe('Yazılım Mühendisi');
        expect(r.wonProposalCount).toBe(1);
    });

    it('varsayımsal işe alım açığı kapatır', () => {
        const ws = buildWs();
        const teklifId = ws.projects[1].id;
        const r = buildScenario(ws, 2026, {
            wonProjectIds: [teklifId],
            hires: [{ departmentCode: 'U310', role: 'Yazılım Mühendisi', aa: 1 }],
        });
        const row = r.rows.find(x => x.role === 'Yazılım Mühendisi')!;
        expect(row.capacity[0]).toBeCloseTo(3); // 2 + 1 işe alım
        expect(row.gap[0]).toBe(0); // 2.5 < 3
        expect(r.totalNewGapAA).toBe(0);
        expect(r.hireAA).toBeCloseTo(12); // 1 AA × 12 ay
    });

    it('teklif seçilmezse talebi senaryoya girmez', () => {
        const r = buildScenario(buildWs(), 2026, { wonProjectIds: [], hires: [] });
        const row = r.rows.find(x => x.role === 'Yazılım Mühendisi')!;
        expect(row.scenario[0]).toBeCloseTo(1.5); // yalnız taahhüt
    });
});

describe('proposalProjects / departmentRolePairs', () => {
    it('yalnızca teklif projelerini verir', () => {
        const props = proposalProjects(buildWs());
        expect(props).toHaveLength(1);
        expect(props[0].name).toBe('Teklif MİLGEM');
    });

    it('havuzdaki tekil bölüm-rol çiftlerini verir', () => {
        const pairs = departmentRolePairs(buildWs().people);
        expect(pairs).toEqual([{ departmentCode: 'U310', role: 'Yazılım Mühendisi' }]);
    });
});
