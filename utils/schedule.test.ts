import { describe, it, expect } from 'vitest';
import { buildMySchedule, buildTeamSchedule, buildProjectSchedule, buildWorkPackageSchedule, taskDueMonth } from './schedule';
import { createEmptyWorkspace, createProject } from './workspace';
import { Allocation, Leave, Person, Task, TaskStatus, WorkspaceData } from '../types';

const person = (id: string, first: string, availableAA = 1): Person => ({
    id, firstName: first, lastName: 'T', departmentCode: 'U310', availableAA, roles: [],
});
const task = (id: string, wp: string | undefined, res: string, due?: string): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: '',
    resourceName: res, time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, workPackageId: wp, dueDate: due,
});

const buildWs = (): WorkspaceData => {
    const p = createProject('Alfa'); p.id = 'p1';
    p.workPackages = [{ id: 'wp1', name: 'Raporlama', description: '' }];
    p.tasks = [task('t1', 'wp1', 'Ali T', '2026-03-15'), task('t2', undefined, 'Ali T', '2026-07-01'), task('t3', 'wp1', 'Ali T')];
    return {
        ...createEmptyWorkspace(),
        projects: [p],
        people: [person('a', 'Ali'), person('b', 'Berk')],
        allocations: [
            { id: 'al', personId: 'a', projectId: 'p1', year: 2026, plan: { 3: 0.5, 7: 0.5 }, actual: {} } as Allocation,
        ],
        leaves: [{ id: 'l', personId: 'a', year: 2026, month: 8, aa: 1 }] as Leave[],
    };
};

describe('taskDueMonth', () => {
    it('yıl içi termin ayını verir; yok/başka yıl → 0', () => {
        expect(taskDueMonth('2026-03-15', 2026)).toBe(3);
        expect(taskDueMonth('2025-03-15', 2026)).toBe(0);
        expect(taskDueMonth(undefined, 2026)).toBe(0);
    });
});

describe('buildMySchedule (Takvimim)', () => {
    it('proje satırı + AA + termine göre görev + kapasite/izin', () => {
        const s = buildMySchedule(buildWs(), 'a', 2026);
        expect(s.rows).toHaveLength(1);
        const row = s.rows[0];
        expect(row.label).toBe('Alfa');
        expect(row.cells[2].aa).toBe(0.5); // Mart
        expect(row.cells[2].tasks).toBe(1); // t1 Mart
        expect(row.cells[6].tasks).toBe(1); // t2 Temmuz
        expect(row.total).toBe(1);
        expect(s.monthlyCapacity![7]).toBe(0); // Ağustos tam izin
        expect(s.monthlyLeave![7]).toBe(1);
    });
});

describe('buildTeamSchedule (Ekip)', () => {
    it('kişi satırları; AA + izin + aşırı', () => {
        const s = buildTeamSchedule(buildWs(), ['a', 'b'], 2026);
        expect(s.rows.map(r => r.id).sort()).toEqual(['a', 'b']);
        const ali = s.rows.find(r => r.id === 'a')!;
        expect(ali.cells[2].aa).toBe(0.5);
        expect(ali.cells[7].leave).toBe(1); // Ağustos izin
    });
    it('izinli ayda yük kapasiteyi aşarsa over', () => {
        const ws = buildWs();
        ws.allocations = [{ id: 'x', personId: 'a', projectId: 'p1', year: 2026, plan: { 8: 0.3 }, actual: {} } as Allocation];
        const s = buildTeamSchedule(ws, ['a'], 2026);
        expect(s.rows[0].cells[7].over).toBe(true); // Ağustos kapasite 0, yük 0.3
    });
});

describe('buildProjectSchedule / buildWorkPackageSchedule', () => {
    it('proje: kişi satırı o projedeki AA', () => {
        const s = buildProjectSchedule(buildWs(), 'p1', 2026);
        expect(s.rows[0].id).toBe('a');
        expect(s.rows[0].cells[2].aa).toBe(0.5);
    });
    it('iş paketi: termine göre görev sayısı, atanmamış kova', () => {
        const s = buildWorkPackageSchedule(buildWs(), 'p1', 2026);
        expect(s.metric).toBe('tasks');
        const wp1 = s.rows.find(r => r.id === 'wp1')!;
        expect(wp1.cells[2].tasks).toBe(1); // t1 Mart (t3 terminsiz → sayılmaz)
        const none = s.rows.find(r => r.id === '__none')!;
        expect(none.cells[6].tasks).toBe(1); // t2 Temmuz, İP yok
    });
});
