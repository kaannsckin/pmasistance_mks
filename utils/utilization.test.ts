import { describe, it, expect } from 'vitest';
import { buildUtilization } from './utilization';
import { Allocation, Leave, Person } from '../types';

const person = (id: string, availableAA = 1): Person => ({
    id, firstName: id, lastName: 'T', departmentCode: 'U310', availableAA, roles: [],
});

describe('buildUtilization', () => {
    const people = [person('a', 1), person('b', 1)];
    const allocs: Allocation[] = [
        { id: '1', personId: 'a', projectId: 'p1', year: 2026, plan: { 1: 0.5, 2: 1, 3: 1.3 }, actual: {} },
        // b: yük yok
    ];

    it('oran ve seviye: düşük/sağlıklı/dolu/aşırı', () => {
        const { rows } = buildUtilization(allocs, people, 2026, 'plan', []);
        const a = rows.find(r => r.personId === 'a')!;
        expect(a.cells[0].ratio).toBe(0.5); // Ocak 0.5/1
        expect(a.cells[0].level).toBe('healthy'); // 0.4-0.85
        expect(a.cells[1].level).toBe('full'); // 1.0
        expect(a.cells[2].level).toBe('over'); // 1.3 > 1
        expect(a.cells[3].level).toBe('empty'); // Nisan yük yok
        expect(a.overCount).toBe(1);
    });

    it('yıllık ortalama oran = toplam yük / toplam kapasite', () => {
        const { rows } = buildUtilization(allocs, people, 2026, 'plan', []);
        const a = rows.find(r => r.personId === 'a')!;
        expect(a.totalLoad).toBe(2.8);
        expect(a.totalCapacity).toBe(12);
        expect(a.avgRatio).toBeCloseTo(0.23);
    });

    it('izin kapasiteyi düşürür → aynı yük aşırıya döner', () => {
        const leaves: Leave[] = [{ id: 'l', personId: 'a', year: 2026, month: 1, aa: 0.6 }];
        const { rows } = buildUtilization(allocs, people, 2026, 'plan', leaves);
        const a = rows.find(r => r.personId === 'a')!;
        // Ocak kapasite 0.4, yük 0.5 → aşırı
        expect(a.cells[0].capacity).toBe(0.4);
        expect(a.cells[0].level).toBe('over');
    });

    it('tam izinli ayda yük yoksa seviye "leave"', () => {
        const leaves: Leave[] = [{ id: 'l', personId: 'b', year: 2026, month: 5, aa: 1 }];
        const { rows } = buildUtilization(allocs, people, 2026, 'plan', leaves);
        const b = rows.find(r => r.personId === 'b')!;
        expect(b.cells[4].level).toBe('leave');
        expect(b.cells[4].capacity).toBe(0);
    });

    it('portföy özeti: aşırı/atıl kişi ve ortalama doluluk', () => {
        const s = buildUtilization(allocs, people, 2026, 'plan', []);
        expect(s.peopleOver).toBe(1); // a
        expect(s.peopleIdle).toBe(1); // b
        expect(s.avgUtilization).toBeCloseTo(round2(2.8 / 24));
    });
});

const round2 = (v: number) => Math.round(v * 100) / 100;
