import { describe, expect, it } from 'vitest';
import { Project, Task, TaskStatus } from '../types';
import { currentSprint, deadlineLabel, objectiveProgress, overviewStats, teamLoad, upcomingDeadlines } from './projectOverview';
import { createProject } from './workspace';

const NOW = new Date(2026, 6, 15); // 15 Temmuz 2026, Çarşamba

const task = (id: string, version: number, status: TaskStatus, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version, predecessor: null, unit: '',
    resourceName: '', time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status, ...extra,
});

const buildProject = (): Project => {
    const p = createProject('Örnek');
    p.settings = { ...p.settings, projectStartDate: '2026-07-06', sprintDuration: 3, globalTestDays: 4, sprintNames: { 2: 'Beta' } };
    p.tasks = [
        task('a', 1, TaskStatus.Done, { resourceName: 'Ayşe' }),
        task('b', 1, TaskStatus.Done, { resourceName: 'Ayşe' }),
        task('c', 2, TaskStatus.InProgress, { resourceName: 'Ali', dueDate: '2026-07-10' }),
        task('d', 2, TaskStatus.ToDo, { resourceName: 'Ali', dueDate: '2026-07-17' }),
        task('e', 2, TaskStatus.Backlog, { dueDate: '2026-07-15', time: { best: 0, avg: 0, worst: 0 } }),
        task('f', 3, TaskStatus.ToDo, { resourceName: 'Ayşe', keyResultId: 'kr1' }),
        task('g', 0, TaskStatus.Backlog, { keyResultId: 'kr1' }),
        task('h', 1, TaskStatus.Done, { keyResultId: 'kr2', resourceName: 'Ayşe' }),
        task('x', 2, TaskStatus.ToDo, { includeInSprints: false }),
    ];
    p.risks = [
        { id: 'r1', title: 'Yüksek', probability: 4, impact: 4, status: 'open', createdAt: '' },
        { id: 'r2', title: 'Düşük', probability: 1, impact: 2, status: 'open', createdAt: '' },
        { id: 'r3', title: 'Kapalı', probability: 5, impact: 5, status: 'closed', createdAt: '' },
    ];
    p.objectives = [
        { id: 'o1', name: 'Hedef 1', description: '', quarter: 'Q3 2026', keyResults: [{ id: 'kr1', name: 'KR1' }, { id: 'kr2', name: 'KR2' }] },
        { id: 'o2', name: 'Bağsız', description: '', quarter: 'Q4 2026', keyResults: [] },
    ];
    p.resources = [{ id: 'res1', name: 'Zeynep', participation: 100, unit: '', title: '' }];
    return p;
};

describe('overviewStats', () => {
    it('durumları, gecikmeyi, eksik tahmini ve açık riskleri sayar', () => {
        const s = overviewStats(buildProject(), NOW);
        expect(s.total).toBe(9);
        expect(s.done).toBe(3);
        expect(s.inProgress).toBe(1);
        expect(s.todo).toBe(5); // Backlog da "Yapılacak" sayılır
        expect(s.overdue).toBe(1); // yalnız 'c' (termini 10 Temmuz)
        expect(s.missingEstimate).toBe(1);
        expect(s.progressPct).toBe(33);
        expect(s.openRisks).toBe(2);
        expect(s.highRisks).toBe(1);
    });

    it('görevsiz projede ilerleme 0', () => {
        expect(overviewStats(createProject('Boş'), NOW).progressPct).toBe(0);
    });
});

describe('currentSprint', () => {
    it('bitmemiş görevi olan ilk sürümü seçer; takvim panoyla aynı', () => {
        const s = currentSprint(buildProject(), NOW)!;
        expect(s.version).toBe(2);
        expect(s.label).toBe('Beta');
        expect(s.total).toBe(3); // sürümden hariç tutulan 'x' sayılmaz
        expect(s.done).toBe(0);
        expect(s.inProgress).toBe(1);
        // Sürüm 1: 6–24 Temmuz, test 27–30 Temmuz → Sürüm 2: 31 Temmuz – 20 Ağustos
        expect(s.start.getMonth()).toBe(6);
        expect(s.start.getDate()).toBe(31);
        expect(s.end.getMonth()).toBe(7);
        expect(s.end.getDate()).toBe(20);
        expect(s.daysLeft).toBe(36);
        expect(s.laterTasks).toBe(1);
    });

    it('her şey bittiyse son sürüm; sürümsüz projede null', () => {
        const p = buildProject();
        p.tasks = p.tasks.map(t => ({ ...t, status: TaskStatus.Done }));
        const s = currentSprint(p, NOW)!;
        expect(s.version).toBe(3);
        expect(s.progressPct).toBe(100);
        expect(currentSprint({ ...p, tasks: [task('z', 0, TaskStatus.ToDo)] }, NOW)).toBeNull();
    });

    it('takvimi geçmiş sürümde kalan gün negatif', () => {
        const s = currentSprint(buildProject(), new Date(2026, 7, 25))!;
        expect(s.daysLeft).toBe(-5);
    });
});

describe('upcomingDeadlines', () => {
    it('gecikeni başa alır, bitenleri ve terminsizleri atlar', () => {
        const { items, total } = upcomingDeadlines(buildProject(), NOW, 2);
        expect(total).toBe(3);
        expect(items.map(d => d.task.id)).toEqual(['c', 'e']);
        expect(items.map(d => d.daysUntil)).toEqual([-5, 0]);
    });

    it('etiketler', () => {
        expect(deadlineLabel(-3)).toBe('3 gün gecikti');
        expect(deadlineLabel(0)).toBe('Bugün');
        expect(deadlineLabel(1)).toBe('Yarın');
        expect(deadlineLabel(6)).toBe('6 gün kaldı');
    });
});

describe('teamLoad', () => {
    it('kişi başına açık/geciken iş; görevsiz kaynak da listelenir; atanmamış ayrı', () => {
        const { members, unassigned } = teamLoad(buildProject(), NOW);
        expect(members.map(m => m.name)).toEqual(['Ali', 'Ayşe', 'Zeynep']);
        expect(members[0]).toMatchObject({ open: 2, inProgress: 1, overdue: 1, done: 0 });
        expect(members[1]).toMatchObject({ open: 1, done: 3 });
        expect(members[2].open).toBe(0);
        expect(unassigned).toBe(3); // e, g, x
    });
});

describe('objectiveProgress', () => {
    it('anahtar sonuçlara bağlı görevlerden ilerleme; bağ yoksa null', () => {
        const [o1, o2] = objectiveProgress(buildProject());
        expect(o1).toMatchObject({ progressPct: 33, keyResults: 2, linkedTasks: 3 });
        expect(o2.progressPct).toBeNull();
    });
});
