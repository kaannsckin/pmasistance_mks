import { describe, it, expect } from 'vitest';
import { departmentScorecards, orgCapacity } from './deptScorecard';
import { createEmptyWorkspace } from './workspace';
import { Allocation, Department, Person, WorkspaceData } from '../types';

const person = (id: string, dept: string, availableAA = 1): Person => ({ id, firstName: id.toUpperCase(), lastName: 'T', departmentCode: dept, availableAA, roles: [] });
const alloc = (personId: string, projectId: string, plan: Record<number, number>): Allocation => ({ id: `al-${personId}-${projectId}`, personId, projectId, year: 2026, plan, actual: {} } as Allocation);
const dept = (code: string, name: string): Department => ({ code, name });

const buildWs = (): WorkspaceData => ({
    ...createEmptyWorkspace(),
    departments: [dept('U310', 'Yazılım'), dept('U320', 'Test')],
    people: [person('a', 'U310'), person('b', 'U310'), person('c', 'U320')],
    allocations: [
        alloc('a', 'p1', { 1: 1.5, 2: 1 }), // a: yıllık 2.5 plan, Ocak'ta kapasite üstü (1.5>1)
        alloc('b', 'p1', { 1: 0.5 }),        // b: 0.5 plan
        alloc('c', 'p2', { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1 }), // c: 12 plan (dolu)
    ],
});

describe('departmentScorecards', () => {
    it('bölüm başına kişi/kapasite/plan/doluluk/aşırı tahsis hesaplar', () => {
        const cards = departmentScorecards(buildWs(), 2026);
        expect(cards).toHaveLength(2);
        const yaz = cards.find(c => c.code === 'U310')!;
        expect(yaz.name).toBe('Yazılım');
        expect(yaz.headcount).toBe(2);
        expect(yaz.capacityAA).toBe(24); // 2 kişi × 12 ay
        expect(yaz.plannedAA).toBe(3);   // 2.5 + 0.5
        expect(yaz.utilization).toBe(0.13); // 3/24
        expect(yaz.overAllocatedPeople).toBe(1); // yalnız a
        expect(yaz.projectCount).toBe(1);
        expect(yaz.band).toBe('warn');
        expect(yaz.reasons.some(r => r.includes('kapasite üstü'))).toBe(true);
        // Kişi detayı doluluğa göre sıralı, aşırı olan işaretli
        expect(yaz.people[0].personId).toBe('a');
        expect(yaz.people[0].over).toBe(true);
    });

    it('kapasite üstü toplam plan → kritik (bad) bant', () => {
        const ws: WorkspaceData = {
            ...createEmptyWorkspace(),
            departments: [dept('U330', 'Altyapı')],
            people: [person('x', 'U330')], // kapasite 12
            allocations: [alloc('x', 'p1', { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 1 })], // 15 plan > 12
        };
        const card = departmentScorecards(ws, 2026)[0];
        expect(card.utilization).toBe(1.25);
        expect(card.band).toBe('bad');
        expect(card.reasons.some(r => r.includes('Aşırı yük'))).toBe(true);
    });
});

describe('orgCapacity', () => {
    it('kurum geneli toplamları ve doluluğu döner', () => {
        const org = orgCapacity(buildWs(), 2026);
        expect(org.totalHeadcount).toBe(3);
        expect(org.totalCapacityAA).toBe(36); // 24 + 12
        expect(org.totalPlannedAA).toBe(15);  // 3 + 12
        expect(org.utilization).toBe(0.42);   // 15/36
        expect(org.overAllocatedPeople).toBe(1);
    });
});
