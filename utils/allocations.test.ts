import { describe, it, expect } from 'vitest';
import {
    canApprovePlan, canEditPool, canEnterData,
    createAllocation, findOverAllocations, getPlanLockStatus,
    isPlanEditable, personMonthTotal, rowTotal,
    setAllocationCell, summarizeByDepartment, summarizeByPerson, summarizeByProject,
    upsertPlanLock,
} from './allocations';
import { Allocation, Person, PlanLock, WorkspaceData } from '../types';
import { createEmptyWorkspace } from './workspace';

const person = (id: string, name: string, dept = 'U310', availableAA = 1): Person => ({
    id, firstName: name, lastName: 'Test', departmentCode: dept, availableAA, roles: [],
});

const alloc = (id: string, personId: string, projectId: string, year: number, plan: Record<number, number>, actual: Record<number, number> = {}): Allocation => ({
    id, personId, projectId, year, plan, actual,
});

describe('RBAC yetkileri', () => {
    it('rolleri kullanıcı hiyerarşisine göre ayırır', () => {
        expect(canEditPool('pyb_destek')).toBe(true);
        expect(canEditPool('py')).toBe(false);
        expect(canEnterData('py')).toBe(true);
        expect(canEnterData('bolum_sorumlu')).toBe(true);
        expect(canEnterData('mudur')).toBe(false); // Müdür girdi yapmaz
        expect(canEnterData('pyb_sorumlu')).toBe(false); // PYB Sorumlusu girdi yapmaz
        expect(canApprovePlan('pyb_sorumlu')).toBe(true);
        expect(canApprovePlan('mudur')).toBe(true);
        expect(canApprovePlan('py')).toBe(false);
    });
});

describe('plan kilidi', () => {
    it('varsayılan durum draft; onaya gönderme ve kilitleme akışı çalışır', () => {
        let locks: PlanLock[] = [];
        expect(getPlanLockStatus(locks, 'p1', 2026)).toBe('draft');
        locks = upsertPlanLock(locks, 'p1', 2026, 'submitted', 'py');
        expect(getPlanLockStatus(locks, 'p1', 2026)).toBe('submitted');
        locks = upsertPlanLock(locks, 'p1', 2026, 'locked', 'pyb_sorumlu');
        expect(getPlanLockStatus(locks, 'p1', 2026)).toBe('locked');
        expect(locks).toHaveLength(1); // aynı proje+yıl tek kayıt
        locks = upsertPlanLock(locks, 'p1', 2026, 'draft', 'mudur'); // kilidi aç
        expect(getPlanLockStatus(locks, 'p1', 2026)).toBe('draft');
    });

    it('plan düzenlenebilirliği rol + kilit durumuna bağlı; kilit yıl bazlıdır', () => {
        let locks: PlanLock[] = [];
        expect(isPlanEditable('py', locks, 'p1', 2026)).toBe(true);
        expect(isPlanEditable('mudur', locks, 'p1', 2026)).toBe(false); // rol girdi yapamaz
        locks = upsertPlanLock(locks, 'p1', 2026, 'locked', 'mudur');
        expect(isPlanEditable('py', locks, 'p1', 2026)).toBe(false); // kilitli
        expect(isPlanEditable('py', locks, 'p1', 2027)).toBe(true); // başka yıl serbest
    });
});

describe('özetler', () => {
    const people = [person('a', 'Ali'), person('b', 'Banu', 'U320', 0.5)];
    const allocations = [
        alloc('1', 'a', 'prj1', 2026, { 1: 0.5, 2: 0.5 }, { 1: 0.6 }),
        alloc('2', 'a', 'prj2', 2026, { 1: 0.7 }),
        alloc('3', 'b', 'prj1', 2026, { 1: 0.4 }),
        alloc('4', 'a', 'prj1', 2025, { 1: 1 }), // farklı yıl — dahil edilmemeli
    ];

    it('kişi bazlı aylık toplam (projeler arası) doğru', () => {
        const rows = summarizeByPerson(allocations, people, 2026, 'plan');
        const ali = rows.find(r => r.label.startsWith('Ali'))!;
        expect(ali.months[0]).toBeCloseTo(1.2); // 0.5 + 0.7
        expect(ali.months[1]).toBeCloseTo(0.5);
        expect(ali.total).toBeCloseTo(1.7);
        expect(ali.capacity).toBe(1);
    });

    it('bölüm bazlı toplam kapasiteyle birlikte gelir', () => {
        const rows = summarizeByDepartment(allocations, people, 2026, 'plan');
        const u310 = rows.find(r => r.key === 'U310')!;
        expect(u310.months[0]).toBeCloseTo(1.2);
        expect(u310.capacity).toBe(1); // U310'da tek kişi, 1 AA
        const u320 = rows.find(r => r.key === 'U320')!;
        expect(u320.capacity).toBe(0.5);
    });

    it('proje bazlı toplam ve gerçekleşen alanı ayrışır', () => {
        const names = new Map([['prj1', 'Proje 1'], ['prj2', 'Proje 2']]);
        const planRows = summarizeByProject(allocations, names, 2026, 'plan');
        expect(planRows.find(r => r.label === 'Proje 1')!.months[0]).toBeCloseTo(0.9);
        const actualRows = summarizeByProject(allocations, names, 2026, 'actual');
        expect(actualRows.find(r => r.label === 'Proje 1')!.months[0]).toBeCloseTo(0.6);
    });

    it('rowTotal yıllık AA hesaplar', () => {
        expect(rowTotal(allocations[0], 'plan')).toBeCloseTo(1.0);
        expect(rowTotal(allocations[0], 'actual')).toBeCloseTo(0.6);
    });
});

describe('aşırı tahsis tespiti', () => {
    it('kapasiteyi aşan kişi+ay kombinasyonlarını bulur', () => {
        const people = [person('a', 'Ali', 'U310', 1)];
        const allocations = [
            alloc('1', 'a', 'prj1', 2026, { 1: 0.6, 2: 0.5 }),
            alloc('2', 'a', 'prj2', 2026, { 1: 0.6, 2: 0.5 }),
        ];
        const over = findOverAllocations(allocations, people, 2026, 'plan');
        expect(over).toHaveLength(1); // sadece Ocak (1.2 > 1); Şubat tam 1.0 sınırda
        expect(over[0].month).toBe(1);
        expect(over[0].total).toBeCloseTo(1.2);
    });

    it('personMonthTotal hücre bazlı kontrol için toplar', () => {
        const allocations = [
            alloc('1', 'a', 'prj1', 2026, { 3: 0.4 }),
            alloc('2', 'a', 'prj2', 2026, { 3: 0.3 }),
        ];
        expect(personMonthTotal(allocations, 'a', 2026, 3, 'plan')).toBeCloseTo(0.7);
    });
});

describe('tahsis satırı işlemleri', () => {
    it('aynı kişi+proje+İP+rol+yıl için ikinci satır açılmaz', () => {
        const first = createAllocation([], 'a', 'p1', 2026, 'wp1', 'Rol');
        expect(first).not.toBeNull();
        const dup = createAllocation([first!], 'a', 'p1', 2026, 'wp1', 'Rol');
        expect(dup).toBeNull();
        const differentWp = createAllocation([first!], 'a', 'p1', 2026, 'wp2', 'Rol');
        expect(differentWp).not.toBeNull();
    });

    it('setAllocationCell değeri yuvarlar, geçersiz değeri siler', () => {
        const ws: WorkspaceData = {
            ...createEmptyWorkspace(),
            allocations: [alloc('1', 'a', 'p1', 2026, { 1: 0.5 })],
        };
        let next = setAllocationCell(ws, '1', 'plan', 2, 0.333333);
        expect(next.allocations[0].plan[2]).toBe(0.33);
        next = setAllocationCell(next, '1', 'plan', 1, undefined);
        expect(next.allocations[0].plan[1]).toBeUndefined();
        expect(ws.allocations[0].plan[1]).toBe(0.5); // orijinal değişmedi (immutable)
    });
});
