import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../types';
import { createProject } from './workspace';
import { newlyCompletedSprints, sprintCompletionSummary } from './sprintCompletion';

const task = (id: string, version: number, status: TaskStatus, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version, predecessor: null, unit: 'U', resourceName: 'Ali',
    time: { best: 2, avg: 2, worst: 2 }, jiraId: '', notes: '', status, ...extra,
});
const done = (tasks: Task[], id: string) => tasks.map(t => (t.id === id ? { ...t, status: TaskStatus.Done } : t));

describe('sprint tamamlama', () => {
    it('son açık görevi biten sprinti bir kez bulur; havuz ve plan dışı görevleri saymaz', () => {
        const tasks = [task('a', 1, TaskStatus.Done), task('b', 1, TaskStatus.InProgress), task('c', 2, TaskStatus.ToDo),
            task('havuz', 0, TaskStatus.ToDo), task('dis', 1, TaskStatus.ToDo, { includeInSprints: false })];
        const after = done(tasks, 'b');
        expect(newlyCompletedSprints(tasks, after)).toEqual([1]);
        expect(newlyCompletedSprints(after, after)).toEqual([]);
        expect(newlyCompletedSprints(tasks, done(tasks, 'havuz'))).toEqual([]);
        // Sprinte bitmiş görev eklemek, önceden bitmemiş/boş sprinti "tamamlandı" yapmaz
        expect(newlyCompletedSprints([], [task('x', 3, TaskStatus.Done)])).toEqual([]);
    });

    it('sprintler arası görev bitmeden iki sprinti de tamamlanmış saymaz', () => {
        const tasks = [task('uzun', 1, TaskStatus.InProgress, { sprintSpan: 2 }), task('b', 2, TaskStatus.Done), task('c', 1, TaskStatus.Done)];
        expect(newlyCompletedSprints(tasks, done(tasks, 'uzun'))).toEqual([1, 2]);
        expect(newlyCompletedSprints(tasks, done(tasks, 'c'))).toEqual([]);
    });

    it('özet: görev sayısı, efor payı ve sprint sonuna göre gün farkı', () => {
        const p = createProject('Plan');
        p.settings = { ...p.settings, projectStartDate: '2026-11-16', sprintDuration: 2, globalTestDays: 3 };
        p.tasks = [task('a', 1, TaskStatus.Done), task('uzun', 1, TaskStatus.Done, { sprintSpan: 2, time: { best: 6, avg: 6, worst: 6 } }), task('c', 2, TaskStatus.Done)];
        // Sprint 1 geliştirme bitişi 27 Kasım Cuma
        expect(sprintCompletionSummary(p, 1, new Date(2026, 10, 24, 15))).toEqual({ sprint: 1, taskCount: 2, effortDays: 5, daysFromEnd: -3 });
        expect(sprintCompletionSummary(p, 1, new Date(2026, 10, 30, 9)).daysFromEnd).toBe(3);
    });
});
