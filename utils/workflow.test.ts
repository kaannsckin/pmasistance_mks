import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../types';
import { stampLifecycle } from './planning/lifecycle';
import { applyWorkflow, reconcileWorkflow, taskStatusLabel, taskWorkflow, workflowOptions, WORKFLOW_STATUSES } from './workflow';

const task = (extra: Partial<Task> = {}): Task => ({
    id: 't1', name: 'Görev', availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U310', resourceName: '',
    time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});

describe('iş akışı durumları', () => {
    it('Jira durumları Türkçe adla ve kategoriyle tanımlı', () => {
        const by = Object.fromEntries(WORKFLOW_STATUSES.map(s => [s.key, [s.label, s.category]]));
        expect(by['TESTING']).toEqual(['Testte', TaskStatus.InProgress]);
        expect(by['RESOLVED']).toEqual(['Çözüldü', TaskStatus.Done]);
        expect(by['CLOSED']).toEqual(['Kapandı', TaskStatus.Done]);
        expect(by['REOPENED']).toEqual(['Yeniden Açıldı', TaskStatus.ToDo]);
        expect(new Set(WORKFLOW_STATUSES.map(s => s.key)).size).toBe(WORKFLOW_STATUSES.length);
    });

    it('görevin gösterilen durumu: bilinen, Jira\'ya özgü ya da yalnız kategori', () => {
        expect(taskStatusLabel(task({ status: TaskStatus.InProgress, jiraStatus: 'In Review' }))).toBe('Kod İncelemede');
        expect(taskStatusLabel(task({ status: TaskStatus.InProgress, jiraStatus: 'Wafer Cleaning' }))).toBe('Wafer Cleaning');
        expect(taskStatusLabel(task({ status: TaskStatus.Done }))).toBe('Tamamlandı');
        expect(taskWorkflow(task({ status: TaskStatus.InProgress })).key).toBe('IN PROGRESS');
    });

    it('seçim kategoriyi ve ayrıntılı durumu birlikte değiştirir; projeye özgü durumlar da seçilebilir', () => {
        expect(applyWorkflow(task(), 'resolved')).toMatchObject({ status: TaskStatus.Done, jiraStatus: 'RESOLVED' });
        const tasks = [task({ status: TaskStatus.InProgress, jiraStatus: 'Wafer Cleaning' })];
        const opts = workflowOptions(tasks);
        expect(opts.map(g => g.label)).toEqual(['Bekleyen', 'Yapılacak', 'Süreçte', 'Tamamlandı']);
        expect(opts[2].statuses.map(s => s.label)).toContain('Wafer Cleaning');
        expect(applyWorkflow(task(), 'WAFER CLEANING', opts.flatMap(g => g.statuses))).toMatchObject({ status: TaskStatus.InProgress, jiraStatus: 'WAFER CLEANING' });
        expect(applyWorkflow(task(), 'YOK')).toEqual(task());
    });

    it('yalnız kategori değişince eskiyen ayrıntılı durum temizlenir', () => {
        const old = task({ status: TaskStatus.InProgress, jiraStatus: 'TESTING' });
        expect(reconcileWorkflow(old, { ...old, status: TaskStatus.Done }).jiraStatus).toBeUndefined();
        expect(reconcileWorkflow(old, { ...old, status: TaskStatus.Done, jiraStatus: 'RESOLVED' }).jiraStatus).toBe('RESOLVED');
        const [stamped] = stampLifecycle([old], [{ ...old, status: TaskStatus.Done }], new Date('2026-11-19T09:00:00Z'));
        expect(stamped).toMatchObject({ status: TaskStatus.Done, jiraStatus: undefined, resolvedAt: '2026-11-19T09:00:00.000Z' });
        // Aynı kategoride kalan bilinen durum korunur
        const res = task({ status: TaskStatus.Done, jiraStatus: 'RESOLVED' });
        expect(reconcileWorkflow({ ...res, status: TaskStatus.InProgress }, res).jiraStatus).toBe('RESOLVED');
    });
});
