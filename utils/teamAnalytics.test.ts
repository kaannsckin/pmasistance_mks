import { describe, expect, it } from 'vitest';
import { Person, Task, TaskStatus } from '../types';
import { createProject } from './workspace';
import { componentAnalytics, teamAnalytics } from './teamAnalytics';
import { DEFAULT_PROJECT_ROLES } from './projectRoles';

const NOW = new Date('2026-11-26T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const t = (id: string, who: string, status: TaskStatus, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U', resourceName: who,
    time: { best: 2, avg: 2, worst: 2 }, jiraId: `P-${id}`, notes: '', status, ...extra,
});
const people: Person[] = [
    { id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U', availableAA: 1, roles: [] },
    { id: 'p2', firstName: 'Can', lastName: 'Er', departmentCode: 'U', availableAA: 1, roles: [] },
    { id: 'p3', firstName: 'Ece', lastName: 'Su', departmentCode: 'U', availableAA: 1, roles: [] },
];

const project = () => {
    const p = createProject('P');
    p.roleMembers = { gelistirici: ['p1', 'p2'], test: ['p3'] };
    p.components = [{ id: 'c1', name: 'Ödeme', lead: 'Can Er' }];
    p.progressModel = { weights: { statuses: { TESTTE: 75 } } };
    p.tasks = [
        t('a', 'Ayşe Kaya', TaskStatus.Done, { createdAt: daysAgo(20), resolvedAt: daysAgo(10), actualHours: 32, components: ['Ödeme'] }),
        t('b', 'Ayşe Kaya', TaskStatus.InProgress, { jiraStatus: 'Testte', time: { best: 8, avg: 8, worst: 8 }, dueDate: '2026-11-01', components: ['ödeme'] }),
        t('c', 'Ayşe Kaya', TaskStatus.ToDo, { time: { best: 6, avg: 6, worst: 6 }, dueDate: '2026-11-10' }),
        t('d', 'Can Er', TaskStatus.ToDo, { issueType: 'bug', createdAt: daysAgo(3), priority: 'Blocker', components: ['Rapor'] }),
        t('e', 'Ece Su', TaskStatus.Done, { issueType: 'bug', createdAt: daysAgo(5), resolvedAt: daysAgo(2) }),
        t('f', 'Dış Kişi', TaskStatus.ToDo),
    ];
    return p;
};

describe('takım analizi (proje rolleri)', () => {
    it('üyesi olan her rol bir takım; işi atananın takımına sayılır', () => {
        const r = teamAnalytics(project(), DEFAULT_PROJECT_ROLES, people, { now: NOW, periodDays: 30 });
        expect(r.groups.map(g => g.name)).toEqual(['Geliştirici', 'Test']);
        const dev = r.groups[0];
        expect(dev).toMatchObject({ total: 4, open: 3, done: 1, overdue: 2, blockers: 1, doneInPeriod: 1, bugsOpen: 1, bugsOpened: 1, bugsClosed: 0 });
        // (100 + 75 + 0 + 0) / 4
        expect(dev.progressPct).toBe(44);
        expect(dev.leadTimeDays).toBe(10);
        expect(dev.estimateRatio).toBe(2); // 32 sa / (2 gün × 8)
        expect(dev.memberStats[0]).toMatchObject({ name: 'Ayşe Kaya', open: 2, openEffort: 14 });
        expect(dev.weekly.reduce((a, b) => a + b, 0)).toBe(1);
        expect(r.outside).toMatchObject({ name: 'Takımı olmayan kişiler', total: 1 });
    });

    it('bulgular: gecikme, darboğaz, tahmin sapması, Blocker', () => {
        const texts = teamAnalytics(project(), DEFAULT_PROJECT_ROLES, people, { now: NOW }).insights.map(i => i.text);
        expect(texts).toEqual(expect.arrayContaining([
            expect.stringMatching(/Geliştirici: açık işlerin %67'i gecikmiş/),
            expect.stringMatching(/açık eforun %88'i Ayşe Kaya üzerinde/),
            expect.stringMatching(/tahminin 2 katı/),
            expect.stringMatching(/1 açık Blocker/),
        ]));
    });

    it('rol üyesi yoksa takım çıkmaz', () => {
        const p = project();
        p.roleMembers = undefined;
        expect(teamAnalytics(p, DEFAULT_PROJECT_ROLES, people, { now: NOW })).toMatchObject({ groups: [], outside: null });
    });
});

describe('bileşen analizi', () => {
    it('listedeki ve görevlerde geçen bileşenler; büyük-küçük harf duyarsız; takım dağılımı', () => {
        const r = componentAnalytics(project(), DEFAULT_PROJECT_ROLES, people, { now: NOW });
        expect(r.groups.map(g => g.name)).toEqual(['Ödeme', 'Rapor']);
        expect(r.groups[0]).toMatchObject({ total: 2, lead: 'Can Er', teams: [{ name: 'Geliştirici', count: 2 }] });
        expect(r.groups[0].members).toEqual(expect.arrayContaining(['Can Er', 'Ayşe Kaya']));
        expect(r.outside).toMatchObject({ name: 'Bileşensiz kayıtlar', total: 3 });
    });
});
