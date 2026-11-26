import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../types';
import { createProject } from './workspace';
import { describeProgressModel, progressOf, taskProgressPercent } from './progress';
import { overviewStats, currentSprint } from './projectOverview';
import { versionProgress } from './projectLists';

const t = (id: string, status: TaskStatus, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U', resourceName: 'A',
    time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status, ...extra,
});

describe('ilerleme modeli', () => {
    const weights = { categories: { [TaskStatus.InProgress]: 30 }, statuses: { TESTTE: 75 } };
    const tasks = [
        t('a', TaskStatus.Done),
        t('b', TaskStatus.InProgress, { jiraStatus: 'Testte' }),
        t('c', TaskStatus.InProgress, { jiraStatus: 'Geliştirmede' }),
        t('d', TaskStatus.ToDo),
    ];

    it('model yoksa yalnız tamamlanan sayılır', () => {
        expect(progressOf(tasks)).toMatchObject({ pct: 25, done: 1, total: 4, weighted: false });
    });

    it('ayrıntılı durum kategoriyi geçer; tamamlanan her zaman %100', () => {
        expect(taskProgressPercent(tasks[1], weights)).toBe(75);
        expect(taskProgressPercent(tasks[2], weights)).toBe(30);
        expect(taskProgressPercent(t('x', TaskStatus.Done), { categories: { [TaskStatus.Done]: 10 } })).toBe(100);
        // (100 + 75 + 30 + 0) / 4
        expect(progressOf(tasks, { weights })).toMatchObject({ ratio: 0.5125, pct: 51, weighted: true });
    });

    it('efor ağırlıklı: büyük iş daha çok sayar; eforsuz listede adede döner', () => {
        const big = [t('a', TaskStatus.Done, { time: { best: 9, avg: 9, worst: 9 } }), t('b', TaskStatus.ToDo)];
        expect(progressOf(big, { basis: 'effort' })).toMatchObject({ pct: 90, basis: 'effort' });
        const none = big.map(x => ({ ...x, time: { best: 0, avg: 0, worst: 0 } }));
        expect(progressOf(none, { basis: 'effort' })).toMatchObject({ pct: 50, basis: 'count' });
        expect(describeProgressModel({ weights, basis: 'effort' })).toBe('durum yüzdeleri · efor ağırlıklı');
    });

    it('genel bakış, sprint ve sürüm ilerlemesi proje modelini kullanır', () => {
        const p = createProject('P', { tasks: tasks.map(x => ({ ...x, fixVersion: 'R1' })) });
        p.progressModel = { weights };
        expect(overviewStats(p).progressPct).toBe(51);
        expect(currentSprint(p)?.progressPct).toBe(51);
        expect(versionProgress(p.tasks, { id: 'v', name: 'R1', status: 'unreleased' }, new Date(), p.progressModel).pct).toBe(51);
        expect(versionProgress(p.tasks, { id: 'v', name: 'R1', status: 'unreleased' }).pct).toBe(25);
    });
});
