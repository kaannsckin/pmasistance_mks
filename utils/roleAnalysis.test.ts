import { describe, it, expect } from 'vitest';
import { buildRoleAnalysis, summarizeGaps, UNASSIGNED_ROLE } from './roleAnalysis';
import { createProject } from './workspace';
import { Allocation, Person, Project } from '../types';

const person = (id: string, dept: string, roles: string[], availableAA = 1): Person => ({
    id, firstName: id, lastName: 'Test', departmentCode: dept, availableAA, roles,
});

const alloc = (id: string, personId: string, projectId: string, role: string | undefined, plan: Record<number, number>): Allocation => ({
    id, personId, projectId, role, year: 2026, plan, actual: {},
});

const setup = () => {
    const devam: Project = createProject('Devam Projesi');
    const teklif: Project = { ...createProject('Teklif Projesi'), status: 'teklif' };
    const people = [
        person('a', 'U310', ['Yazılım Mühendisi'], 1),
        person('b', 'U310', ['Yazılım Mühendisi', 'Takım Lideri'], 0.5),
        person('c', 'B700', ['Donanım Mühendisi'], 1),
    ];
    return { devam, teklif, people };
};

describe('buildRoleAnalysis', () => {
    it('talebi proje durumuna göre Planlı/Teklif kovalarına ayırır', () => {
        const { devam, teklif, people } = setup();
        const allocations = [
            alloc('1', 'a', devam.id, 'Yazılım Mühendisi', { 1: 0.6 }),
            alloc('2', 'b', devam.id, 'Yazılım Mühendisi', { 1: 0.4 }),
            alloc('3', 'a', teklif.id, 'Yazılım Mühendisi', { 1: 0.3 }),
        ];
        const rows = buildRoleAnalysis(allocations, people, [devam, teklif], 2026);
        const yzl = rows.find(r => r.departmentCode === 'U310' && r.role === 'Yazılım Mühendisi')!;
        expect(yzl.planned[0]).toBeCloseTo(1.0); // devam eden proje talebi
        expect(yzl.proposal[0]).toBeCloseTo(0.3); // teklif pipeline'ı
    });

    it('kapasiteyi rolü üstlenebilen kişilerden hesaplar (çok rollü kişi her rolde görünür)', () => {
        const { devam, teklif, people } = setup();
        const rows = buildRoleAnalysis([], people, [devam, teklif], 2026);
        const yzl = rows.find(r => r.role === 'Yazılım Mühendisi')!;
        expect(yzl.capacity[0]).toBeCloseTo(1.5); // a(1) + b(0.5)
        const lider = rows.find(r => r.role === 'Takım Lideri')!;
        expect(lider.capacity[0]).toBeCloseTo(0.5); // yalnız b
        const donanim = rows.find(r => r.departmentCode === 'B700')!;
        expect(donanim.capacity[0]).toBeCloseTo(1);
    });

    it('personel açığını max(0, planlı + teklif − kaynak) olarak hesaplar', () => {
        const { devam, teklif, people } = setup();
        const allocations = [
            alloc('1', 'a', devam.id, 'Yazılım Mühendisi', { 1: 1.2 }),
            alloc('2', 'a', teklif.id, 'Yazılım Mühendisi', { 1: 0.8 }),
            alloc('3', 'a', devam.id, 'Yazılım Mühendisi', { 2: 0.5 }), // Şubat: açık yok
        ];
        const rows = buildRoleAnalysis(allocations, people, [devam, teklif], 2026);
        const yzl = rows.find(r => r.role === 'Yazılım Mühendisi')!;
        expect(yzl.gap[0]).toBeCloseTo(0.5); // 1.2 + 0.8 − 1.5
        expect(yzl.gap[1]).toBeCloseTo(0);   // 0.5 < 1.5
        expect(yzl.totals.gap).toBeCloseTo(0.5);
    });

    it('rolsüz tahsis kişinin rolüne yazılır (B-025); kişinin rolü yoksa "Rol atanmamış" kovasında kalır', () => {
        const { devam, teklif, people } = setup();
        const allocations = [alloc('1', 'c', devam.id, undefined, { 3: 0.7 })];
        const rows = buildRoleAnalysis(allocations, people, [devam, teklif], 2026);
        expect(rows.find(r => r.role === 'Donanım Mühendisi' && r.departmentCode === 'B700')!.planned[2]).toBeCloseTo(0.7);
        expect(rows.find(r => r.role === UNASSIGNED_ROLE)).toBeUndefined(); // sahte açık yok
        // Aynı projede rollü satırı olan çok rollü kişi: o rol
        const multi = [alloc('2', 'b', devam.id, 'Takım Lideri', { 1: 0.2 }), { ...alloc('3', 'b', devam.id, undefined, { 3: 0.3 }), year: 2026 }];
        expect(buildRoleAnalysis(multi, people, [devam, teklif], 2026).find(r => r.role === 'Takım Lideri')!.planned[2]).toBeCloseTo(0.3);
        // Rolü olmayan kişi
        const roleless = [...people, { ...people[2], id: 'd', roles: [] }];
        const rows2 = buildRoleAnalysis([alloc('4', 'd', devam.id, undefined, { 3: 0.4 })], roleless, [devam, teklif], 2026);
        expect(rows2.find(r => r.role === UNASSIGNED_ROLE && r.departmentCode === 'B700')!.planned[2]).toBeCloseTo(0.4);
    });

    it('farklı yılın tahsislerini dahil etmez; boş satırları eler', () => {
        const { devam, teklif, people } = setup();
        const allocations = [{ ...alloc('1', 'a', devam.id, 'Yazılım Mühendisi', { 1: 1 }), year: 2025 }];
        const rows = buildRoleAnalysis(allocations, people, [devam, teklif], 2026);
        const yzl = rows.find(r => r.role === 'Yazılım Mühendisi')!;
        expect(yzl.planned[0]).toBe(0); // 2025 verisi girmedi (kapasite satırı yine var)
        expect(rows.every(r => r.totals.capacity > 0 || r.totals.planned > 0 || r.totals.proposal > 0)).toBe(true);
    });
});

describe('summarizeGaps', () => {
    it('açığı olan rol sayısını ve toplam açık AA’yı verir', () => {
        const { devam, teklif, people } = setup();
        const allocations = [
            alloc('1', 'a', devam.id, 'Yazılım Mühendisi', { 1: 2.0 }),
            alloc('2', 'c', devam.id, 'Donanım Mühendisi', { 1: 0.5 }),
        ];
        const rows = buildRoleAnalysis(allocations, people, [devam, teklif], 2026);
        const s = summarizeGaps(rows);
        expect(s.rolesWithGap).toBe(1); // yalnız yazılım (2.0 > 1.5)
        expect(s.totalGapAA).toBeCloseTo(0.5);
    });
});
