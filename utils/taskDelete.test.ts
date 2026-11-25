import { describe, expect, it } from 'vitest';
import { Task, TaskStatus, UserRole, WorkspaceData } from '../types';
import { createEmptyWorkspace, createProject } from './workspace';
import { describeTaskDelete, MAX_BULK_DELETE, previewTaskDelete, removeTasks } from './taskDelete';
import { applyAction, describeAction, validateAction } from './ai/actions';
import { buildToolContext } from './ai/scope';
import { executeTool, toolSpecsFor } from './ai/tools';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `Görev ${id}`, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: '', resourceName: '',
    time: { best: 1, avg: 2, worst: 3 }, jiraId: `ATL-${id}`, notes: '', status: TaskStatus.ToDo, ...extra,
});

const tasks = (): Task[] => [task('1'), task('2', { predecessor: '1' }), task('3', { predecessor: '2' }), task('4')];

const ws = (role: UserRole = 'py'): WorkspaceData => {
    const p = createProject('ATLAS');
    p.id = 'atlas';
    p.pmPersonId = 'pm';
    p.tasks = tasks();
    return {
        ...createEmptyWorkspace(), currentRole: role, currentPersonId: role === 'py' ? 'pm' : undefined, projects: [p], activeProjectId: 'atlas',
        people: [{ id: 'pm', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] }],
    };
};

describe('görev silme', () => {
    it('önizleme: silinecekler, öncül bağı kalkacak ardıllar ve bulunamayanlar', () => {
        const p = previewTaskDelete({ tasks: tasks() }, ['1', 'x']);
        if ('error' in p) throw new Error(p.error);
        expect(p.tasks.map(t => t.id)).toEqual(['1']);
        expect(p.unlinked.map(t => t.id)).toEqual(['2']);
        expect(p.missing).toEqual(['x']);
        expect(describeTaskDelete(p)).toBe('1 görev: ATL-1 Görev 1');
        expect(previewTaskDelete({ tasks: tasks() }, [])).toEqual({ error: 'Silinecek görev seçilmedi.' });
        expect(previewTaskDelete({ tasks: tasks() }, Array.from({ length: MAX_BULK_DELETE + 1 }, (_, i) => `k${i}`))).toHaveProperty('error');
    });

    it('silme: ardılın öncülü kalkar, silinen başka bir görevin ardılı da silinirse bağ sorunu kalmaz', () => {
        const input = tasks();
        const out = removeTasks(input, new Set(['1', '2']), new Date('2026-11-25T10:00:00Z'));
        expect(out.map(t => t.id)).toEqual(['3', '4']);
        expect(out[0]).toMatchObject({ id: '3', predecessor: null, updatedAt: '2026-11-25T10:00:00.000Z' });
        expect(out[1]).toBe(input[3]); // değişmeyen görev aynı nesne kalır
        const same = tasks();
        expect(removeTasks(same, new Set(['yok']))).toBe(same);
    });
});

describe('asistan: görev silme önerisi', () => {
    it('öneri aracı yalnız veri girebilen role sunulur; ad ya da Jira anahtarıyla öneri kartı çıkar', async () => {
        expect(toolSpecsFor(buildToolContext(ws('mudur'))).map(s => s.name)).not.toContain('oner_gorev_sil');
        const ctx = buildToolContext(ws());
        expect(toolSpecsFor(ctx).map(s => s.name)).toContain('oner_gorev_sil');
        const out = JSON.parse((await executeTool({ name: 'oner_gorev_sil', arguments: { gorevler: ['ATL-1', 'Görev 4', 'olmayan'], gerekce: 'mükerrer' } }, ctx)).content);
        expect(out.atlanan?.join(' ')).toMatch(/olmayan/);
        expect(ctx.proposals).toHaveLength(1);
        expect(ctx.proposals[0].action).toEqual({ type: 'gorev_sil', projectId: 'atlas', taskIds: ['1', '4'], reason: 'mükerrer' });
        expect(ctx.proposals[0].title).toBe('Görev sil: 2 görev · ATLAS');
    });

    it('doğrulama, kart ve uygulama: yetki denetlenir, öncül bağı kalkar, denetim günlüğüne yazılır', () => {
        const action = { type: 'gorev_sil' as const, projectId: 'atlas', taskIds: ['2'] };
        expect(validateAction(ws('mudur'), action)).toMatch(/yetkiniz yok/);
        expect(validateAction(ws(), { ...action, taskIds: ['yok'] })).toMatch(/bulunamadı/);
        expect(validateAction(ws(), { ...action, taskIds: [] })).toMatch(/Silinecek görev yok/);
        const card = describeAction(ws(), action);
        expect(card.details.find(d => d.label === 'Öncül bağı')?.value).toBe('1 görevin öncül bağı kaldırılacak');
        const { ws: next, summary } = applyAction(ws(), action);
        const project = next.projects[0];
        expect(project.tasks.map(t => t.id)).toEqual(['1', '3', '4']);
        expect(project.tasks.find(t => t.id === '3')?.predecessor).toBeNull();
        expect(summary).toBe('"ATLAS" · 1 görev silindi');
        expect((next.auditLog || []).map(e => e.action)).toEqual(expect.arrayContaining(['task.delete', 'ai.apply']));
    });
});
