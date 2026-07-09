import { describe, it, expect } from 'vitest';
import { addSnapshot, baselinePlanFor, buildSnapshot, ensureMonthlySnapshot, snapshotsForYear } from './snapshots';
import { createEmptyWorkspace, createProject } from './workspace';
import { WorkspaceData } from '../types';

const buildWs = (): WorkspaceData => {
    const p1 = createProject('Proje A');
    const p2 = createProject('Proje B');
    return {
        ...createEmptyWorkspace(),
        projects: [p1, p2],
        allocations: [
            { id: 'a1', personId: 'k1', projectId: p1.id, year: 2026, plan: { 1: 0.5, 2: 0.5 }, actual: { 1: 0.4 } },
            { id: 'a2', personId: 'k2', projectId: p2.id, year: 2026, plan: { 1: 1 }, actual: {} },
            { id: 'a3', personId: 'k1', projectId: p1.id, year: 2025, plan: { 1: 9 }, actual: {} },
        ],
    };
};

describe('buildSnapshot', () => {
    it('yıl bazlı toplamları ve proje kırılımını fotoğraflar', () => {
        const ws = buildWs();
        const s = buildSnapshot(ws, 2026, 'Test', 'manual');
        expect(s.totalPlanAA).toBeCloseTo(2.0);
        expect(s.totalActualAA).toBeCloseTo(0.4);
        expect(s.monthlyPlan[0]).toBeCloseTo(1.5);
        expect(s.monthlyPlan[1]).toBeCloseTo(0.5);
        expect(s.byProject).toHaveLength(2);
        const a = s.byProject.find(e => e.name === 'Proje A')!;
        expect(a.planAA).toBeCloseTo(1.0);
        expect(a.actualAA).toBeCloseTo(0.4);
    });

    it('tahsisi olmayan projeleri kırılıma dahil etmez', () => {
        const ws = buildWs();
        ws.projects.push(createProject('Boş Proje'));
        const s = buildSnapshot(ws, 2026, 'Test', 'manual');
        expect(s.byProject.some(e => e.name === 'Boş Proje')).toBe(false);
    });
});

describe('addSnapshot / snapshotsForYear', () => {
    it('kronolojik ekler ve yıl filtreler', () => {
        let ws = buildWs();
        ws = addSnapshot(ws, { ...buildSnapshot(ws, 2026, 'İlk', 'manual'), takenAt: '2026-01-31T00:00:00Z' });
        ws = addSnapshot(ws, { ...buildSnapshot(ws, 2026, 'İkinci', 'lock'), takenAt: '2026-02-28T00:00:00Z' });
        ws = addSnapshot(ws, { ...buildSnapshot(ws, 2025, 'Eski yıl', 'manual'), takenAt: '2025-06-30T00:00:00Z' });
        const list = snapshotsForYear(ws, 2026);
        expect(list.map(s => s.label)).toEqual(['İlk', 'İkinci']);
        expect(snapshotsForYear(ws, 2025)).toHaveLength(1);
    });

    it('yıl başına 24 kayıt üst sınırını korur (en eskiler düşer)', () => {
        let ws = buildWs();
        for (let i = 0; i < 30; i++) {
            ws = addSnapshot(ws, {
                ...buildSnapshot(ws, 2026, `S${i}`, 'manual'),
                takenAt: `2026-01-${String(Math.min(i + 1, 28)).padStart(2, '0')}T0${i % 10}:00:00Z`,
            });
        }
        const list = snapshotsForYear(ws, 2026);
        expect(list).toHaveLength(24);
        expect(list[list.length - 1].label).toBe('S29');
    });
});

describe('ensureMonthlySnapshot', () => {
    it('ayın ilk açılışında otomatik snapshot alır', () => {
        const ws = buildWs();
        const now = new Date('2026-03-05T09:00:00Z');
        // buildWs 2026 verisi içeriyor ama now yılı da 2026 olmalı — tahsis yılıyla eşleşiyor
        const result = ensureMonthlySnapshot(ws, now);
        expect(result).not.toBeNull();
        const snap = result!.snapshots[0];
        expect(snap.trigger).toBe('monthly');
        expect(snap.label).toContain('Mart 2026');
        expect(snap.totalPlanAA).toBeCloseTo(2.0);
    });

    it('aynı ay içinde ikinci kez almaz; herhangi bir snapshot da ayı doldurur', () => {
        let ws = buildWs();
        const now = new Date('2026-03-05T09:00:00Z');
        ws = ensureMonthlySnapshot(ws, now)!;
        expect(ensureMonthlySnapshot(ws, new Date('2026-03-28T09:00:00Z'))).toBeNull();
        // Manuel snapshot da ayı doldurmuş sayılır
        let ws2 = buildWs();
        ws2 = addSnapshot(ws2, { ...buildSnapshot(ws2, 2026, 'Manuel', 'manual'), takenAt: '2026-04-02T00:00:00Z' });
        expect(ensureMonthlySnapshot(ws2, new Date('2026-04-20T09:00:00Z'))).toBeNull();
        // Yeni ayda tekrar alır
        expect(ensureMonthlySnapshot(ws, new Date('2026-04-01T09:00:00Z'))).not.toBeNull();
    });

    it('o yıl için tahsis verisi yoksa snapshot almaz', () => {
        const ws = buildWs();
        ws.allocations = ws.allocations.filter(a => a.year !== 2026); // yalnız 2025 kalır
        expect(ensureMonthlySnapshot(ws, new Date('2026-05-01T09:00:00Z'))).toBeNull();
    });
});

describe('baselinePlanFor', () => {
    it('kilit tetiklemeli en son snapshotı baseline sayar', () => {
        let ws = buildWs();
        const p1 = ws.projects[0];
        ws = addSnapshot(ws, { ...buildSnapshot(ws, 2026, 'Onay', 'lock'), takenAt: '2026-01-15T00:00:00Z' });
        // Plan sonradan değişir
        ws = { ...ws, allocations: ws.allocations.map(a => a.id === 'a1' ? { ...a, plan: { 1: 0.9, 2: 0.9 } } : a) };
        ws = addSnapshot(ws, { ...buildSnapshot(ws, 2026, 'Sonra', 'manual'), takenAt: '2026-03-01T00:00:00Z' });
        // Baseline hâlâ kilit anındaki 1.0 olmalı (manuel 1.8'e rağmen)
        expect(baselinePlanFor(ws, p1.id, 2026)).toBeCloseTo(1.0);
    });

    it('kilit yoksa manuel snapshota düşer; hiç yoksa undefined', () => {
        let ws = buildWs();
        const p1 = ws.projects[0];
        expect(baselinePlanFor(ws, p1.id, 2026)).toBeUndefined();
        ws = addSnapshot(ws, buildSnapshot(ws, 2026, 'Manuel', 'manual'));
        expect(baselinePlanFor(ws, p1.id, 2026)).toBeCloseTo(1.0);
    });
});
