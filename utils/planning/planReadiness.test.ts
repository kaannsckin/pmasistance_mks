import { describe, expect, it } from 'vitest';
import { Project, Resource, Task, TaskStatus } from '../../types';
import { applyPlanReadinessEdit, checkPlanReadiness, taskDurationDays } from './planReadiness';

const resource = (name: string, unit = 'YZL'): Resource => ({ id: name, name, participation: 100, unit, title: 'Uzman' });
const task = (id: string, over: Partial<Task> = {}): Task => ({
    id, name: `Görev ${id}`, availability: true, priority: 'Medium', version: 0, predecessor: null, unit: '', resourceName: 'Ayşe Kaya',
    time: { best: 2, avg: 3, worst: 4 }, jiraId: '', notes: '', status: TaskStatus.ToDo, components: ['API'], ...over,
});
const project = (tasks: Task[], extra: Partial<Project> = {}) => ({
    tasks, resources: [resource('Ayşe Kaya'), resource('Atanmamış')], components: [{ id: 'c1', name: 'API' }], ...extra,
});

describe('otomatik plan öncesi kontrol', () => {
    it('süresi 0, bileşensiz, sorumlusuz ve ekip dışı görevleri ayırır', () => {
        const result = checkPlanReadiness(project([
            task('ok'),
            task('sure', { time: { best: 0, avg: 0, worst: 0 } }),
            task('bilesen', { components: [] }),
            task('sorumlu', { resourceName: 'Atanmamış' }),
            task('bos', { resourceName: '  ' }),
            task('ekip', { resourceName: 'Mehmet Demir' }),
        ]));
        expect(result.rows.map(row => [row.task.id, row.issues])).toEqual([
            ['sure', ['noDuration']],
            ['bilesen', ['noComponent']],
            ['sorumlu', ['noAssignee']],
            ['bos', ['noAssignee']],
            ['ekip', ['notInTeam']],
        ]);
        expect(result.counts).toEqual({ noDuration: 1, noComponent: 1, noAssignee: 2, notInTeam: 1 });
    });

    it('biten ve plan dışı görevleri ve bileşen listesi olmayan projede bileşeni denetlemez', () => {
        const tasks = [
            task('bitti', { status: TaskStatus.Done, time: { best: 0, avg: 0, worst: 0 } }),
            task('disarida', { includeInSprints: false, resourceName: '' }),
            task('bilesensiz', { components: undefined }),
        ];
        expect(checkPlanReadiness(project(tasks, { components: [] })).rows).toEqual([]);
    });

    it('ekip adını büyük-küçük harf ve boşluk farkı gözetmeden eşler', () => {
        expect(checkPlanReadiness(project([task('a', { resourceName: ' ayşe  kaya ' })])).rows).toEqual([]);
    });

    it('düzenlemeyi göreve uygular, değişmeyen alanlara dokunmaz', () => {
        const base = task('a', { time: { best: 0, avg: 0, worst: 0 }, components: [], resourceName: 'Atanmamış', unit: 'ESK' });
        const p = { resources: [resource('Ayşe Kaya', 'YZL')] };
        const next = applyPlanReadinessEdit(base, { days: 5, component: 'API', resourceName: 'ayşe kaya' }, p);
        expect(taskDurationDays(next)).toBe(5);
        expect(next).toMatchObject({ time: { best: 5, avg: 5, worst: 5 }, estimateSource: 'user', components: ['API'], resourceName: 'Ayşe Kaya', unit: 'YZL' });
        expect(applyPlanReadinessEdit(next, { days: 5, component: 'api', resourceName: 'Ayşe Kaya' }, p)).toBe(next);
        expect(applyPlanReadinessEdit(base, { days: 0 }, p)).toBe(base);
    });
});
