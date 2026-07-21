import { describe, it, expect } from 'vitest';
import { buildPersonProfile } from './personProfile';
import { createEmptyWorkspace, createProject } from './workspace';
import { Person, TaskStatus, WorkspaceData } from '../types';

const NOW = new Date('2026-06-15T09:00:00Z');

const person = (id: string, first: string, last: string, availableAA = 1): Person => ({
    id, firstName: first, lastName: last, departmentCode: 'U310', availableAA, roles: ['Yazılım Mühendisi'],
});

const buildWs = (): WorkspaceData => {
    const p1 = createProject('Proje A');
    const p2 = createProject('Proje B');
    p1.tasks = [
        { id: 't1', name: 'Geciken İş', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Kaan Test', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, dueDate: '2026-05-01' },
        { id: 't2', name: 'Başkasının İşi', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Biri Başka', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo },
    ];
    p2.tasks = [
        { id: 't3', name: 'Devam Eden', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Kaan Test', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.InProgress },
    ];
    return {
        ...createEmptyWorkspace(),
        projects: [p1, p2],
        people: [person('k1', 'Kaan', 'Test')],
        allocations: [
            { id: 'a1', personId: 'k1', projectId: p1.id, year: 2026, plan: { 1: 0.6, 2: 0.5 }, actual: { 1: 0.5 }, role: 'PY' },
            { id: 'a2', personId: 'k1', projectId: p2.id, year: 2026, plan: { 1: 0.6, 3: 0.4 }, actual: {} },
            { id: 'a3', personId: 'k1', projectId: p1.id, year: 2025, plan: { 1: 1 }, actual: {} }, // farklı yıl
        ],
    };
};

describe('buildPersonProfile', () => {
    it('tüm projelerdeki aylık planı toplar ve kapasiteyle aşımı bulur', () => {
        const r = buildPersonProfile(buildWs(), 'k1', 2026, NOW)!;
        expect(r.monthlyPlan[0]).toBeCloseTo(1.2); // Ocak: 0.6 + 0.6
        expect(r.monthlyPlan[1]).toBeCloseTo(0.5);
        expect(r.monthlyPlan[2]).toBeCloseTo(0.4);
        expect(r.totalPlanAA).toBeCloseTo(2.1);
        expect(r.totalActualAA).toBeCloseTo(0.5);
        expect(r.overMonths).toEqual([1]); // sadece Ocak (1.2 > 1)
        expect(r.capacity).toBe(1);
    });

    it('proje kırılımını plan AA’ya göre azalan verir', () => {
        const r = buildPersonProfile(buildWs(), 'k1', 2026, NOW)!;
        expect(r.byProject).toHaveLength(2);
        expect(r.byProject[0].projectName).toBe('Proje A'); // 1.1 toplam
        expect(r.byProject[0].total).toBeCloseTo(1.1);
        expect(r.byProject[0].role).toBe('PY');
        expect(r.byProject[1].total).toBeCloseTo(1.0);
        expect(r.projectCount).toBe(2);
    });

    it('isme göre görevleri tüm projelerden toplar; geciken önce; başkasınınkini almaz', () => {
        const r = buildPersonProfile(buildWs(), 'k1', 2026, NOW)!;
        expect(r.tasks.map(t => t.taskName)).toEqual(['Geciken İş', 'Devam Eden']);
        expect(r.tasks[0].overdue).toBe(true);
        expect(r.tasks[0].projectName).toBe('Proje A');
        expect(r.tasks[1].overdue).toBe(false);
        expect(r.tasks.some(t => t.taskName === 'Başkasının İşi')).toBe(false);
    });

    it('kapasitesi düşük kişide daha çok ay aşar', () => {
        const ws = buildWs();
        ws.people = [person('k1', 'Kaan', 'Test', 0.3)];
        const r = buildPersonProfile(ws, 'k1', 2026, NOW)!;
        expect(r.overMonths).toEqual([1, 2, 3]); // 1.2, 0.5, 0.4 hepsi > 0.3
    });

    it('bulunmayan kişide null döner', () => {
        expect(buildPersonProfile(buildWs(), 'yok', 2026, NOW)).toBeNull();
    });
});
