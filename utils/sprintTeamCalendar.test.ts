import { describe, expect, it } from 'vitest';
import { Person, Task, TaskStatus } from '../types';
import { buildSprintTeamCalendar, indexSprintWorklogs, summarizeSprintTasks } from './sprintTeamCalendar';
import { buildLanes } from './timelinePlan';
import { createProject } from './workspace';

const task = (id: string, name: string, days: number, extra: Partial<Task> = {}): Task => ({
    id, name: id, status: TaskStatus.ToDo, resourceName: name, version: 1, unit: 'U300', priority: 'Medium',
    availability: true, predecessor: null, jiraId: '', notes: '', time: { best: days, avg: days, worst: days }, ...extra,
});

describe('sprint ekip takvimi', () => {
    it('aynı kişinin yükünü bir kez sayar ve bileşen payını termin ile günlük kapasiteye göre gösterir', () => {
        const project = createProject('Portal');
        project.settings = { ...project.settings, projectStartDate: '2026-11-23', sprintDuration: 1, globalTestDays: 2 };
        project.resources = [{ id: 'a', name: 'Ayşe Demir', unit: 'U300', title: '', participation: 50 }];
        project.components = [{ id: 'a', name: 'Portal', lead: 'Ece Can' }, { id: 'b', name: 'API' }];
        project.tasks = [
            task('portal', ' AYŞE  DEMİR ', 2, { components: ['Portal', 'API'], dueDate: '2026-11-24' }),
            task('service', 'Ayşe Demir', 0, { components: ['API'], originalEstimateHours: 16 }),
            task('unassigned', 'Atanmamış', 1, { components: ['Portal'] }),
            task('outside', 'Ayşe Demir', 30, { includeInSprints: false }),
            task('next', 'Ece Can', 1, { version: 2, components: ['Portal'] }),
        ];
        const people: Person[] = [{ id: 'a', firstName: 'Ayşe', lastName: 'Demir', departmentCode: 'U300', availableAA: 1, roles: [] }];
        const calendar = buildSprintTeamCalendar(project, buildLanes(project)[1], people, [{ id: 'leave', personId: 'a', year: 2026, month: 11, aa: 0.25 }]);
        const [ayse, ece] = calendar.rows;
        expect(ayse.name).toBe('Ayşe Demir');
        expect(ayse.tasks.map(item => [item.task.id, item.hours])).toEqual([['portal', 16], ['service', 16]]);
        expect(ayse.cells[0]).toMatchObject({ hours: 11.2, capacity: 3 });
        expect([...ayse.cells[0].byComponent.values()]).toEqual([8, 11.2]);
        expect(ayse.cells[2].hours).toBeCloseTo(3.2);
        expect(Object.fromEntries(ayse.cells[0].byTask)).toEqual({ portal: 8, service: 3.2 });
        expect(ayse.cells.reduce((sum, cell) => sum + cell.hours, 0)).toBeCloseTo(32);
        expect(ece.components.has('component:portal')).toBe(true);
        expect(ece.tasks).toEqual([]);
        expect(ece.cells[0].capacity).toBeUndefined();
        const test = calendar.days.findIndex(day => day.kind === 'test');
        expect(ayse.cells[test]).toMatchObject({ hours: 0, capacity: 0 });
        expect(calendar.unassigned.map(item => item.task.id)).toEqual(['unassigned']);
    });

    it('resmî tatili ve yarım günü hesaba katar, tarihinden önceki işe ilk iş gününde yer verir', () => {
        const project = createProject('Plan');
        project.settings = { ...project.settings, projectStartDate: '2026-10-26', sprintDuration: 1, globalTestDays: 1 };
        project.resources = [{ id: 'a', name: 'Ali Can', unit: 'U300', title: '', participation: 100 }];
        project.tasks = [
            task('plan', 'Ali Can', 3.5),
            task('geçmiş termin', 'Ali Can', 1, { dueDate: '2026-10-20' }),
            task('tahminsiz', 'Ali Can', 0),
        ];
        const { days, rows: [row] } = buildSprintTeamCalendar(project, buildLanes(project)[1], [], []);
        const cell = (key: string) => row.cells[days.findIndex(day => day.day === key)];
        expect(cell('2026-10-26')).toMatchObject({ hours: 16, capacity: 8 });
        expect(cell('2026-10-28')).toMatchObject({ hours: 4, capacity: 4 });
        expect(cell('2026-10-29')).toMatchObject({ hours: 0, capacity: 0 });
        expect(row.tasks.find(item => item.task.id === 'tahminsiz')?.hours).toBeUndefined();
    });

    it('Jira kayıtlarını e-posta ya da ada göre takvim kişisine ve gününe yerleştirir', () => {
        const people: Person[] = [{ id: 'a', firstName: 'Ayşe', lastName: 'Demir', email: 'ayse@kurum.gov.tr', departmentCode: 'U300', availableAA: 1, roles: [] }];
        const entry = (author: string, date: string, hours: number, authorEmail?: string) => ({ issueKey: 'MKS-1', author, authorEmail, date, hours });
        const index = indexSprintWorklogs(['ayşe demir', 'ali can'], [
            entry('A. Demir', '2026-11-23', 2, 'AYSE@kurum.gov.tr'),
            entry('Ayşe Demir', '2026-11-23', 1.5),
            entry(' ALİ  CAN ', '2026-11-24', 3),
            entry('Başka Biri', '2026-11-24', 4),
            entry('Ali Can', 'geçersiz', 1),
        ], people);
        expect(index.byRow.get('ayşe demir')?.get('2026-11-23')?.map(e => e.hours)).toEqual([2, 1.5]);
        expect(index.byRow.get('ali can')?.get('2026-11-24')?.map(e => e.hours)).toEqual([3]);
        expect(index.unmatched).toBe(2);
    });

    it('kişinin sprint görevlerini tahmin, başlangıç ve kayıt özetiyle listeler', () => {
        const project = createProject('Plan');
        project.settings = { ...project.settings, projectStartDate: '2026-11-23', sprintDuration: 1, globalTestDays: 1 };
        project.resources = [{ id: 'a', name: 'Ali Can', unit: 'U300', title: '', participation: 100 }];
        project.tasks = [
            task('a', 'Ali Can', 1, { jiraId: 'mks-1', startedAt: '2026-11-20T08:00:00Z', remainingEstimateHours: 3 }),
            task('b', 'Ali Can', 0, { jiraId: 'MKS-2', dueDate: '2026-11-25' }),
            task('c', 'Ali Can', 2, { dueDate: '2026-11-25' }),
        ];
        const calendar = buildSprintTeamCalendar(project, buildLanes(project)[1], [], []);
        const [row] = calendar.rows;
        const logs = indexSprintWorklogs([row.key], [
            { issueKey: 'MKS-1', author: 'Ali Can', date: '2026-11-24', hours: 2 },
            { issueKey: 'MKS-1', author: 'Ali Can', date: '2026-11-26', hours: 1 },
            { issueKey: 'MKS-2', author: 'Ali Can', date: '2026-11-23', hours: 4 },
        ], []);
        expect(summarizeSprintTasks(row, calendar.days, logs)).toEqual([
            expect.objectContaining({ estimate: 8, startedAt: '2026-11-20T08:00:00Z', plannedStart: '2026-11-23', logged: 3, lastLog: '2026-11-26', remaining: 3 }),
            expect.objectContaining({ estimate: undefined, plannedStart: undefined, logged: 4, lastLog: '2026-11-23' }),
            expect.objectContaining({ estimate: 16, plannedStart: '2026-11-23', logged: 0, lastLog: undefined }),
        ]);
        expect(summarizeSprintTasks(row, calendar.days)[0].logged).toBeUndefined();
    });
});
