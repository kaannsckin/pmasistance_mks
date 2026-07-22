import { describe, it, expect } from 'vitest';
import { findAvailablePeople, allPersonRoles } from './staffing';
import { Allocation, Leave, Person } from '../types';

const person = (id: string, roles: string[], availableAA = 1): Person => ({
    id, firstName: id, lastName: 'T', departmentCode: 'U310', availableAA, roles,
});

const people = [
    person('bos', ['Yazılım']),      // tamamen boş
    person('yaridolu', ['Yazılım']), // Haziran yarı dolu
    person('dolu', ['Yazılım']),     // Haziran tam dolu
    person('sistem', ['Sistem']),    // farklı rol
];
const allocations: Allocation[] = [
    { id: '1', personId: 'yaridolu', projectId: 'p', year: 2026, plan: { 6: 0.5 }, actual: {} },
    { id: '2', personId: 'dolu', projectId: 'p', year: 2026, plan: { 6: 1 }, actual: {} },
];

describe('findAvailablePeople', () => {
    it('rol filtreler; Haziran 0.5 AA gereksinimine uyanları önce sıralar', () => {
        const res = findAvailablePeople(people, allocations, [], { role: 'Yazılım', year: 2026, months: [6], requiredAA: 0.5 });
        expect(res.map(r => r.personId)).not.toContain('sistem'); // rol dışı
        expect(res[0].personId).toBe('bos'); // en boş
        const dolu = res.find(r => r.personId === 'dolu')!;
        expect(dolu.fits).toBe(false); // Haziran dolu
        expect(dolu.freeByMonth[5]).toBe(0);
        const yari = res.find(r => r.personId === 'yaridolu')!;
        expect(yari.fits).toBe(true); // 0.5 boş = gerekli 0.5
        expect(yari.freeByMonth[5]).toBe(0.5);
    });

    it('izin pencere darboğazını düşürür → uymaz', () => {
        const leaves: Leave[] = [{ id: 'l', personId: 'bos', year: 2026, month: 6, aa: 0.7 }];
        const res = findAvailablePeople(people, allocations, leaves, { role: 'Yazılım', year: 2026, months: [6], requiredAA: 0.5 });
        const bos = res.find(r => r.personId === 'bos')!;
        expect(bos.freeByMonth[5]).toBeCloseTo(0.3); // 1 - 0.7 izin
        expect(bos.fits).toBe(false); // 0.3 < 0.5
    });

    it('çok aylık pencerede darboğaz (min) belirleyici', () => {
        const res = findAvailablePeople(people, allocations, [], { role: 'Yazılım', year: 2026, months: [5, 6, 7], requiredAA: 0.6 });
        const yari = res.find(r => r.personId === 'yaridolu')!;
        // May 1.0, Haz 0.5, Tem 1.0 → min 0.5 < 0.6 → uymaz
        expect(yari.windowMinFree).toBe(0.5);
        expect(yari.fits).toBe(false);
    });

    it('rol verilmezse herkes aday', () => {
        const res = findAvailablePeople(people, allocations, [], { year: 2026, months: [1], requiredAA: 1 });
        expect(res).toHaveLength(4);
    });

    it('allPersonRoles tekil ve alfabetik', () => {
        expect(allPersonRoles(people)).toEqual(['Sistem', 'Yazılım']);
    });
});
