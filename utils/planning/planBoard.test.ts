import { describe, expect, it } from 'vitest';
import { Project, ReleasePlan, Task, TaskStatus } from '../../types';
import { createProject } from '../workspace';
import { applySprintChanges, buildPlanBoard, carryoverChanges, distributePlan, planTasks, sprintWindowsUntil } from './planBoard';

// Pazartesi 23 Kasım 2026'da başlayan, 1 haftalık sprint, test sprint içinde (sürekli geliştirme)
const NOW = new Date(2026, 11, 2, 10); // 2 Aralık 2026 Çarşamba → Sprint 2

const task = (id: string, days: number, extra: Partial<Task> = {}): Task => ({
    id, name: `İş ${id}`, availability: true, priority: 'Medium', version: 0, predecessor: null, unit: 'U310',
    resourceName: 'Ayşe', time: { best: days, avg: days, worst: days }, jiraId: `ATL-${id}`, notes: '', status: TaskStatus.ToDo, ...extra,
});

const project = (tasks: Task[]): Project => {
    const p = createProject('ATLAS');
    p.settings = { ...p.settings, projectStartDate: '2026-11-23', sprintDuration: 1, globalTestDays: 0 };
    p.resources = [
        { id: 'r1', name: 'Ayşe', participation: 100, unit: 'U310', title: 'Uzman' },
        { id: 'r2', name: 'Can', participation: 50, unit: 'U310', title: 'Uzman' },
    ];
    p.tasks = tasks;
    return p;
};

const plan = (taskIds: string[], milestones: { id: string; name: string; targetDate?: string; tasks: string[] }[] = []): ReleasePlan => ({
    id: 'rp', name: 'Sürüm 1', summary: '', mode: 'manual', testDays: 0, workPackageIds: [], step: 1, status: 'draft',
    createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z',
    items: taskIds.map(id => ({ id: `i-${id}`, name: `İş ${id}`, sourceTaskId: id })),
    milestones: milestones.map(m => ({ id: m.id, name: m.name, targetDate: m.targetDate, itemIds: m.tasks.map(t => `i-${t}`) })),
});

describe('plan panosu', () => {
    it('bugünün sprinti haftalık takvimden bulunur', () => {
        expect(sprintWindowsUntil(project([]), NOW, 1).current).toBe(2);
        expect(sprintWindowsUntil(project([]), new Date(2026, 10, 1), 1).current).toBe(1);
    });

    it('satırlar kilometre taşı sırasıyla; tahmini bitiş, hedefe göre durum, havuz ve devir', () => {
        const p = project([
            task('1', 2, { version: 1 }), // biten sprintte kalmış → devir
            task('2', 3, { version: 2, status: TaskStatus.Done }),
            task('3', 4, { version: 4 }),
            task('4', 1), // havuzda
        ]);
        const pl = plan(['1', '2', '3', '4'], [
            { id: 'm2', name: 'MS2 Pilot', targetDate: '2026-12-10', tasks: ['3'] },
            { id: 'm1', name: 'MS1 Demo', targetDate: '2026-12-05', tasks: ['1', '2'] },
        ]);
        const b = buildPlanBoard(p, pl, NOW);
        expect(b.current).toBe(2);
        expect(b.rows.map(r => r.milestone?.name ?? 'Taşsız')).toEqual(['MS1 Demo', 'MS2 Pilot', 'Taşsız']);
        expect(b.rows[0]).toMatchObject({ status: 'risk', forecastEnd: '2026-12-04', note: '1 görev biten sprintte kalmış' });
        expect(b.rows[1]).toMatchObject({ status: 'late', forecastEnd: '2026-12-18', note: 'Hedeften 8 gün geç' });
        expect(b.rows[2]).toMatchObject({ status: 'unplanned' });
        expect(b.pool.map(t => t.id)).toEqual(['4']);
        expect(b.carryover.map(t => t.id)).toEqual(['1']);
        expect(carryoverChanges(b)).toEqual([{ taskId: '1', from: 1, to: 2 }]);
        // Sprint 1'de 3 gün iş bitti (görev 2 Sprint 2'de bitti ama sprint sürüyor) → hız yalnız biten sprintlerden
        expect(b.velocity).toMatchObject({ sprints: 1, remaining: 7 });
        expect(b.sprints.find(s => s.current)?.version).toBe(2);
        expect(b.sprints[0].capacity).toBe(7.5); // Ayşe 5 + Can 2,5
    });

    it('otomatik dağıtım: bugünden başlar, taş sırası ve öncül, kişi kapasitesi; sürüm dışı yük düşülür', () => {
        const p = project([
            task('a', 3),
            task('b', 3, { predecessor: 'a' }),
            task('c', 2, { priority: 'High' }),
            task('x', 2, { version: 2 }), // sürüm dışı iş, Ayşe'nin Sprint 2'sini kısmen dolduruyor
            task('d', 1, { resourceName: 'Can' }),
        ]);
        const pl = plan(['a', 'b', 'c', 'd'], [
            { id: 'm1', name: 'MS1', targetDate: '2026-12-11', tasks: ['a', 'b'] },
            { id: 'm2', name: 'MS2', targetDate: '2026-12-31', tasks: ['c'] },
        ]);
        const r = distributePlan(p, pl, NOW);
        const to = Object.fromEntries(r.changes.map(c => [c.taskId, c.to]));
        // Ayşe Sprint 2'de 5−2=3 gün boş: önce MS1'in a'sı (c'nin önceliği yüksek olsa da taşı sonra);
        // b öncül nedeniyle Sprint 3; c Sprint 2'ye sığmaz, Sprint 3'te b ile tam 5 gün
        expect(to).toEqual({ a: 2, b: 3, c: 3, d: 2 });
        expect(r.warnings).toEqual([]);
        expect(r.preview.rows.find(x => x.milestone?.id === 'm1')).toMatchObject({ status: 'ok', forecastEnd: '2026-12-11' });
        const next = applySprintChanges(p, r.changes);
        expect(next.tasks.find(t => t.id === 'x')).toBe(p.tasks.find(t => t.id === 'x'));
        expect(planTasks(next, pl).map(t => t.version)).toEqual([2, 3, 3, 2]);
    });

    it('devam eden iş yerinde kalır; sığmayan büyük iş ve geç kalan taş uyarılır', () => {
        const p = project([
            task('w', 2, { version: 2, status: TaskStatus.InProgress }),
            task('big', 12),
        ]);
        const pl = plan(['w', 'big'], [{ id: 'm', name: 'MS1', targetDate: '2026-12-04', tasks: ['w', 'big'] }]);
        const r = distributePlan(p, pl, NOW);
        expect(r.changes).toEqual([{ taskId: 'big', from: 0, to: 3 }]);
        expect(r.warnings.map(w => w.kind)).toEqual(['oversized', 'late']);
    });
});
