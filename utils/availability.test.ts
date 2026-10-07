import { describe, it, expect } from 'vitest';
import {
    addLeaveRange, leaveFromRange,
    annualEffectiveCapacity, annualLeaveAA, effectiveCapacity,
    monthlyEffectiveCapacity, monthLeaveAA, upsertLeave,
} from './availability';
import { findOverAllocations } from './allocations';
import { buildRoleAnalysis } from './roleAnalysis';
import { Allocation, Leave, Person, Project } from '../types';
import { createProject } from './workspace';

const person = (id: string, availableAA = 1, roles: string[] = []): Person => ({
    id, firstName: id, lastName: 'T', departmentCode: 'U310', availableAA, roles,
});

describe('availability — efektif kapasite', () => {
    it('izin o ayın kapasitesini düşürür, diğer aylar etkilenmez', () => {
        const p = person('a', 1);
        const leaves: Leave[] = [{ id: 'l1', personId: 'a', year: 2026, month: 6, aa: 0.5 }];
        expect(effectiveCapacity(p, leaves, 2026, 6)).toBe(0.5);
        expect(effectiveCapacity(p, leaves, 2026, 7)).toBe(1);
        expect(monthLeaveAA(leaves, 'a', 2026, 6)).toBe(0.5);
    });

    it('kapasite negatif olmaz', () => {
        const p = person('a', 1);
        const leaves: Leave[] = [{ id: 'l1', personId: 'a', year: 2026, month: 3, aa: 1.5 }];
        expect(effectiveCapacity(p, leaves, 2026, 3)).toBe(0);
    });

    it('yıllık efektif kapasite ve izin toplamı', () => {
        const p = person('a', 1);
        const leaves: Leave[] = [
            { id: 'l1', personId: 'a', year: 2026, month: 1, aa: 1 },
            { id: 'l2', personId: 'a', year: 2026, month: 8, aa: 0.5 },
        ];
        expect(annualEffectiveCapacity(p, leaves, 2026)).toBe(10.5); // 12 - 1.5
        expect(annualLeaveAA(leaves, 'a', 2026)).toBe(1.5);
        expect(monthlyEffectiveCapacity(p, leaves, 2026)[0]).toBe(0); // Ocak tam izin
    });

    it('upsertLeave ekler, günceller, sıfırda kaldırır, 1 ile sınırlar', () => {
        let leaves: Leave[] = [];
        leaves = upsertLeave(leaves, 'a', 2026, 5, 0.5);
        expect(leaves).toHaveLength(1);
        leaves = upsertLeave(leaves, 'a', 2026, 5, 1); // güncelle
        expect(leaves).toHaveLength(1);
        expect(leaves[0].aa).toBe(1);
        leaves = upsertLeave(leaves, 'a', 2026, 5, 2); // 1'e sınırlanır
        expect(leaves[0].aa).toBe(1);
        leaves = upsertLeave(leaves, 'a', 2026, 5, 0); // kaldır
        expect(leaves).toHaveLength(0);
    });
});

describe('izin, aşırı-tahsis ve rol açığına yansır', () => {
    it('izinli ayda daha düşük planla bile aşırı-tahsis oluşur', () => {
        const people = [person('a', 1)];
        const allocs: Allocation[] = [
            { id: 'x', personId: 'a', projectId: 'p1', year: 2026, plan: { 6: 0.7 }, actual: {} },
        ];
        // İzinsiz: 0.7 < 1 → aşırı yok
        expect(findOverAllocations(allocs, people, 2026, 'plan', [])).toHaveLength(0);
        // Haziran yarım izin → kapasite 0.5 < 0.7 → aşırı
        const leaves: Leave[] = [{ id: 'l', personId: 'a', year: 2026, month: 6, aa: 0.5 }];
        const over = findOverAllocations(allocs, people, 2026, 'plan', leaves);
        expect(over).toHaveLength(1);
        expect(over[0].month).toBe(6);
        expect(over[0].capacity).toBe(0.5);
    });

    it('rol açığı izinli ayda büyür (kapasite düşer)', () => {
        const people = [person('a', 1, ['Yazılım'])];
        const projects: Project[] = [Object.assign(createProject('P'), { id: 'p1', status: 'devam' as const })];
        const allocs: Allocation[] = [
            { id: 'x', personId: 'a', projectId: 'p1', role: 'Yazılım', year: 2026, plan: { 2: 1 }, actual: {} },
        ];
        const leaves: Leave[] = [{ id: 'l', personId: 'a', year: 2026, month: 2, aa: 0.5 }];
        const rows = buildRoleAnalysis(allocs, people, projects, 2026, leaves);
        const row = rows.find(r => r.role === 'Yazılım')!;
        // Şubat: planlı 1, kapasite 0.5 → açık 0.5
        expect(row.capacity[1]).toBe(0.5);
        expect(row.gap[1]).toBe(0.5);
    });
});

describe('takvimden izin aralığı', () => {
    it('hafta içi günleri aylara böler ve AA değerine çevirir', () => {
        // 27 Temmuz (Pzt) – 7 Ağustos 2026 (Cum): Temmuz 5 gün / 23, Ağustos 5 gün / 21
        expect(leaveFromRange('2026-07-27', '2026-08-07')).toEqual([
            { year: 2026, month: 7, days: 5, aa: 0.22 },
            { year: 2026, month: 8, days: 5, aa: 0.24 },
        ]);
        expect(leaveFromRange('2026-10-10', '2026-10-11')).toEqual([]); // yalnız hafta sonu
        expect(leaveFromRange('2026-08-07', '2026-07-27')).toHaveLength(2); // ters sıra
        expect(leaveFromRange('2026-12-31', '2027-01-01').map(r => `${r.year}-${r.month}`)).toEqual(['2026-12', '2027-1']);
    });

    it('mevcut izne eklenir, ay başına en fazla 1 AA', () => {
        const leaves: Leave[] = [{ id: 'l', personId: 'p', year: 2026, month: 8, aa: 0.9 }];
        expect(addLeaveRange(leaves, 'p', '2026-08-03', '2026-08-07')).toEqual([{ year: 2026, month: 8, added: 0.24, aa: 1 }]);
        expect(addLeaveRange(leaves, 'q', '2026-08-03', '2026-08-07')[0].aa).toBe(0.24);
    });
});

