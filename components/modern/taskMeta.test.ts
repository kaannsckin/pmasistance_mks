import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../../types';
import { celebrationFor, columnOf, daysLate, initialsOf, missingEstimate, sprintLabel } from './taskMeta';

describe('taskMeta', () => {
    const now = new Date(2026, 9, 6, 15, 0);

    it('gecikme gün olarak, bitmiş/tarihsiz görevde 0', () => {
        expect(daysLate({ dueDate: '2026-10-03', status: TaskStatus.InProgress }, now)).toBe(3);
        expect(daysLate({ dueDate: '2026-10-06', status: TaskStatus.ToDo }, now)).toBe(0);
        expect(daysLate({ dueDate: '2026-10-01', status: TaskStatus.Done }, now)).toBe(0);
        expect(daysLate({ status: TaskStatus.ToDo }, now)).toBe(0);
        expect(daysLate({ dueDate: 'geçersiz', status: TaskStatus.ToDo }, now)).toBe(0);
    });

    it('süre tahmini eksikliği', () => {
        expect(missingEstimate({ status: TaskStatus.ToDo, time: { best: 0, avg: 0, worst: 0 } })).toBe(true);
        expect(missingEstimate({ status: TaskStatus.ToDo, time: { best: 1, avg: 2, worst: 3 } })).toBe(false);
        expect(missingEstimate({ status: TaskStatus.Done, time: { best: 0, avg: 0, worst: 0 } })).toBe(false);
    });

    it('backlog panoda yapılacak sütununda', () => {
        expect(columnOf(TaskStatus.Backlog)).toBe(TaskStatus.ToDo);
        expect(columnOf(TaskStatus.InProgress)).toBe(TaskStatus.InProgress);
    });

    it('baş harfler ve sürüm adı', () => {
        expect(initialsOf('ayşe yılmaz')).toBe('AY');
        expect(initialsOf('Kaan')).toBe('K');
        expect(initialsOf('  ')).toBe('?');
        expect(sprintLabel(0)).toBe('Havuz');
        expect(sprintLabel(2)).toBe('Sürüm 2');
        expect(sprintLabel(2, { 2: 'Pilot' })).toBe('Pilot');
    });
});

describe('celebrationFor', () => {
    const t = (id: string, version: number, status: TaskStatus) => ({ id, version, status } as unknown as import('../../types').Task);
    it('sürüm ve proje tamamlanınca mesaj üretir', () => {
        const tasks = [t('a', 1, TaskStatus.Done), t('b', 1, TaskStatus.InProgress), t('c', 2, TaskStatus.ToDo)];
        expect(celebrationFor(tasks, 'b', TaskStatus.Done)).toBe('Sürüm 1 tamamlandı!');
        expect(celebrationFor(tasks, 'b', TaskStatus.Done, { 1: 'Pilot' })).toBe('Pilot tamamlandı!');
        expect(celebrationFor(tasks, 'c', TaskStatus.Done)).toBe('Sürüm 2 tamamlandı!');
        expect(celebrationFor([...tasks, t('d', 2, TaskStatus.ToDo)], 'c', TaskStatus.Done)).toBeNull();
        expect(celebrationFor([t('a', 1, TaskStatus.Done), t('b', 2, TaskStatus.ToDo)], 'b', TaskStatus.Done)).toBe('Proje tamamlandı! Tebrikler.');
        expect(celebrationFor(tasks, 'b', TaskStatus.InProgress)).toBeNull();
        expect(celebrationFor([t('a', 0, TaskStatus.ToDo), t('b', 0, TaskStatus.Done), t('c', 1, TaskStatus.ToDo)], 'a', TaskStatus.Done)).toBeNull();
    });
});
