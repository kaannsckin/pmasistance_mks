import { describe, expect, it } from 'vitest';
import { ReleasePlan, Task, TaskStatus, UserRole, WorkspaceData } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { buildToolContext } from './scope';
import { executeTool, toolSpecsFor } from './tools';
import { applyAction, validateAction } from './actions';

const NOW = new Date(2026, 10, 30, 9); // Sprint 2 başı (haftalık, 23 Kas başlangıç)

const task = (id: string, days: number, extra: Partial<Task> = {}): Task => ({
    id, name: `İş ${id}`, availability: true, priority: 'Medium', version: 0, predecessor: null, unit: 'U310',
    resourceName: 'Ayşe Kaya', time: { best: days, avg: days, worst: days }, jiraId: `ATL-${id}`, notes: '', status: TaskStatus.ToDo, ...extra,
});

const plan: ReleasePlan = {
    id: 'rp', name: 'Sürüm 1', summary: '', mode: 'manual', testDays: 0, workPackageIds: [], step: 1, status: 'draft',
    createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z',
    items: ['a', 'b', 'c'].map(id => ({ id: `i-${id}`, name: id, sourceTaskId: id })),
    milestones: [{ id: 'm1', name: 'MS1 Demo', targetDate: '2026-12-04', itemIds: ['i-a', 'i-b', 'i-c'] }],
};

const ws = (role: UserRole = 'py'): WorkspaceData => {
    const p = createProject('ATLAS');
    p.id = 'atlas';
    p.pmPersonId = 'pm';
    p.settings = { ...p.settings, projectStartDate: '2026-11-23', sprintDuration: 1, globalTestDays: 0 };
    p.resources = [
        { id: 'r1', name: 'Ayşe Kaya', participation: 100, unit: 'U310', title: 'Uzman' },
        { id: 'r2', name: 'Can Er', participation: 100, unit: 'U310', title: 'Uzman' },
    ];
    p.tasks = [task('a', 3), task('b', 3, { priority: 'Low' }), task('c', 2, { priority: 'High' })];
    p.releasePlans = [plan];
    return {
        ...createEmptyWorkspace(), currentRole: role, currentPersonId: role === 'py' ? 'pm' : undefined, projects: [p], activeProjectId: 'atlas',
        people: [{ id: 'pm', firstName: 'Kaan', lastName: 'Demir', departmentCode: 'U310', availableAA: 1, roles: [] }],
    };
};

const ctxOf = (role: UserRole = 'py') => {
    const ctx = buildToolContext(ws(role), NOW);
    ctx.files = [];
    return ctx;
};
const run = async (ctx: ReturnType<typeof ctxOf>, args: Record<string, unknown>) => JSON.parse((await executeTool({ name: 'plan_optimizasyonu', arguments: args }, ctx)).content);

describe('asistan: plan optimizasyonu', () => {
    it('yalnız sohbette sunulur; taş durumu, senaryolar ve gerekçeli değişiklikler döner', async () => {
        expect(toolSpecsFor(buildToolContext(ws(), NOW)).map(s => s.name)).not.toContain('plan_optimizasyonu');
        const ctx = ctxOf();
        const r = await run(ctx, { hedef_doluluk: 100 });
        expect(r.surum).toBe('Sürüm 1');
        expect(r.takvim).toBe('1 hafta · test sprint içinde');
        expect(r.taslar[0]).toMatchObject({ tas: 'MS1 Demo', hedef: '2026-12-04', durum: 'late' });
        expect(r.senaryolar.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining(['reassign', 'descope-m1', 'retarget-m1']));
        expect(r.degisiklikler.length).toBe(3);
        expect(ctx.proposals).toHaveLength(0); // oner istenmedi
    });

    it('senaryo seçilip öneri kartı hazırlanır; onay sonrası uygulanır; araya değişiklik girerse reddedilir', async () => {
        const ctx = ctxOf();
        const r = await run(ctx, { hedef_doluluk: 100, senaryo: 'reassign', oner: true });
        expect(r.sonra).toMatch(/tüm taşlar hedefe yetişiyor/);
        expect(ctx.proposals).toHaveLength(1);
        const action = ctx.proposals[0].action;
        expect(action).toMatchObject({ type: 'plan_uygula', projectId: 'atlas', planId: 'rp', label: 'Aynı birimde iş dağılımı' });
        expect(validateAction(ws(), action)).toBeNull();
        const { ws: next } = applyAction(ws(), action);
        const tasks = next.projects[0].tasks;
        expect(tasks.every(t => t.version === 2)).toBe(true);
        expect(tasks.some(t => t.resourceName === 'Can Er')).toBe(true);
        // Öneriden sonra biri görevin sprintini değiştirdiyse kart eski veriye dayanır: reddedilir
        const moved = ws();
        moved.projects[0].tasks[0] = { ...moved.projects[0].tasks[0], version: 5 };
        expect(validateAction(moved, action)).toMatch(/yeniden hesaplayın/);
    });

    it('kapsam daraltma ve yeni hedef plana yazılır; yönetici rolü öneri hazırlayamaz', async () => {
        const ctx = ctxOf();
        await run(ctx, { hedef_doluluk: 100, senaryo: 'retarget-m1', oner: true });
        const { ws: next } = applyAction(ws(), ctx.proposals[0].action);
        expect(next.projects[0].releasePlans![0].milestones[0].targetDate).toBe('2026-12-11');
        const c2 = ctxOf();
        await run(c2, { hedef_doluluk: 100, senaryo: 'descope-m1', oner: true });
        const after = applyAction(ws(), c2.proposals[0].action).ws.projects[0].releasePlans![0];
        expect(after.milestones[0].itemIds).toEqual(['i-a', 'i-c']);
        const mgr = ctxOf('mudur');
        expect((await run(mgr, { oner: true })).hata).toMatch(/Bu rol plan değişikliği öneremez/);
        expect((await run(ctxOf(), { senaryo: 'uydurma' })).hata).toMatch(/senaryosu yok/);
    });
});
