import { describe, expect, it } from 'vitest';
import { Objective, Task, TaskStatus } from '../types';
import { objectiveProgress, quarterLabel, unitProgress, unlinkedOpenTasks } from './goals';

const task = (id: string, status: TaskStatus, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: '',
    resourceName: '', time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status, ...extra,
});

const objectives: Objective[] = [
    { id: 'o1', name: 'Altyapı', description: 'Açıklama', quarter: 'Q4 2026', keyResults: [{ id: 'kr1', name: 'Kuyruk' }, { id: 'kr2', name: 'Rapor' }, { id: 'kr3', name: 'Boş' }] },
    { id: 'o2', name: 'Bağsız', description: '', quarter: '', keyResults: [{ id: 'kr4', name: 'Hiç görev yok' }] },
];
const tasks = [
    task('a', TaskStatus.Done, { keyResultId: 'kr1', unit: 'U310' }),
    task('b', TaskStatus.ToDo, { keyResultId: 'kr1', unit: 'U310' }),
    task('c', TaskStatus.Done, { keyResultId: 'kr2', unit: 'U320' }),
    task('d', TaskStatus.InProgress, { unit: 'U310' }),
    task('e', TaskStatus.Done, { unit: 'U320' }),
    task('f', TaskStatus.ToDo, { keyResultId: 'silinmis-kr' }),
];

describe('objectiveProgress', () => {
    it('anahtar sonuçların ortalaması; görevsiz anahtar sonuç 0 sayılır', () => {
        const [o1, o2] = objectiveProgress({ objectives, tasks });
        expect(o1.keyResults.map(k => k.progressPct)).toEqual([50, 100, null]);
        expect(o1).toMatchObject({ progressPct: 50, linkedTasks: 3, doneTasks: 2, quarter: 'Q4 2026', description: 'Açıklama' });
        expect(o2.progressPct).toBeNull();
        expect(o2.quarter).toBeUndefined();
    });
});

describe('unitProgress', () => {
    it('birim bazında tamamlanma ve katkı verilen hedefler', () => {
        expect(unitProgress(tasks, objectives)).toEqual([
            { unit: 'U310', total: 3, done: 1, progressPct: 33, objectives: ['Altyapı'] },
            { unit: 'U320', total: 2, done: 2, progressPct: 100, objectives: ['Altyapı'] },
        ]);
    });
});

describe('yardımcılar', () => {
    it('bağsız açık görevler (silinmiş anahtar sonuca bağlı olan da sayılır)', () => {
        expect(unlinkedOpenTasks(tasks, objectives)).toBe(2); // d, f
    });
    it('çeyrek etiketi', () => {
        expect(quarterLabel(new Date(2026, 9, 6))).toBe('Q4 2026');
        expect(quarterLabel(new Date(2026, 0, 1))).toBe('Q1 2026');
    });
});
