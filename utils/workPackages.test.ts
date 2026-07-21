import { describe, it, expect } from 'vitest';
import { summarizeWorkPackages } from './workPackages';
import { createProject } from './workspace';
import { Task, TaskStatus } from '../types';

const task = (id: string, wp: string | undefined, resource: string, status: TaskStatus): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null,
    unit: '', resourceName: resource, time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status,
    workPackageId: wp,
});

describe('summarizeWorkPackages', () => {
    const p = createProject('P');
    p.workPackages = [{ id: 'wp1', name: 'Raporlama', description: '' }, { id: 'wp2', name: 'Altyapı', description: '' }];
    p.tasks = [
        task('t1', 'wp1', 'Ali Veli', TaskStatus.Done),
        task('t2', 'wp1', 'Berk Can', TaskStatus.InProgress),
        task('t3', 'wp2', 'Ali Veli', TaskStatus.ToDo),
        task('t4', undefined, 'Cem Demir', TaskStatus.Done), // İP yok → atanmamış
        task('t5', 'silinmis', 'Deniz', TaskStatus.ToDo),     // geçersiz İP → atanmamış
    ];

    it('görevleri iş paketine göre gruplar; sayı/tamamlanma/atananlar', () => {
        const rows = summarizeWorkPackages(p.workPackages, p.tasks);
        const wp1 = rows.find(r => r.id === 'wp1')!;
        expect(wp1.taskCount).toBe(2);
        expect(wp1.doneCount).toBe(1);
        expect(wp1.donePct).toBe(50);
        expect(wp1.assignees).toEqual(['Ali Veli', 'Berk Can']);
    });

    it('geçersiz/eksik iş paketini "atanmamış" kovasına toplar', () => {
        const rows = summarizeWorkPackages(p.workPackages, p.tasks);
        const un = rows.find(r => r.id === '')!;
        expect(un.name).toBe('İş paketi atanmamış');
        expect(un.taskCount).toBe(2); // t4 + t5
        expect(un.assignees).toEqual(['Cem Demir', 'Deniz']);
    });

    it('boş iş paketi 0 görevle görünür; atanmamış kova yoksa eklenmez', () => {
        const q = createProject('Q');
        q.workPackages = [{ id: 'a', name: 'A', description: '' }];
        q.tasks = [task('x', 'a', 'Kaan', TaskStatus.ToDo)];
        const rows = summarizeWorkPackages(q.workPackages, q.tasks);
        expect(rows).toHaveLength(1);
        expect(rows[0].taskCount).toBe(1);
        expect(rows.some(r => r.id === '')).toBe(false);
    });
});
