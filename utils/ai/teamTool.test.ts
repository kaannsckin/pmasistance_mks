import { describe, expect, it } from 'vitest';
import { Task, TaskStatus, WorkspaceData } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { buildToolContext } from './scope';
import { executeTool, toolSpecsFor } from './tools';

const NOW = new Date('2026-11-26T12:00:00Z');
const t = (id: string, who: string, status: TaskStatus, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U', resourceName: who,
    time: { best: 2, avg: 2, worst: 2 }, jiraId: `P-${id}`, notes: '', status, ...extra,
});

const ws = (): WorkspaceData => {
    const p = createProject('ATLAS');
    p.id = 'atlas';
    p.pmPersonId = 'p1';
    p.roleMembers = { test: ['p2'], gelistirici: ['p1'] };
    p.tasks = [t('a', 'Ayşe Kaya', TaskStatus.InProgress, { jiraStatus: 'Testte' }), t('b', 'Can Er', TaskStatus.Done, { issueType: 'bug', components: ['API'] })];
    p.progressModel = { weights: { statuses: { TESTTE: 75 } } };
    return {
        ...createEmptyWorkspace(), currentRole: 'py', currentPersonId: 'p1', projects: [p], activeProjectId: 'atlas',
        people: [
            { id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U', availableAA: 1, roles: [] },
            { id: 'p2', firstName: 'Can', lastName: 'Er', departmentCode: 'U', availableAA: 1, roles: [] },
        ],
    };
};

describe('asistan: ekip analizi', () => {
    it('yalnız sohbette; takım ve bileşen kırılımı durum yüzdeli ilerlemeyle döner', async () => {
        expect(toolSpecsFor(buildToolContext(ws(), NOW)).map(s => s.name)).not.toContain('ekip_analizi');
        const ctx = buildToolContext(ws(), NOW);
        ctx.files = [];
        const run = async (a: Record<string, unknown>) => JSON.parse((await executeTool({ name: 'ekip_analizi', arguments: a }, ctx)).content);
        const teams = await run({});
        expect(teams.ilerleme_yontemi).toBe('durum yüzdeleri');
        expect(teams.gruplar.map((g: { ad: string }) => g.ad)).toEqual(['Geliştirici', 'Test']);
        expect(teams.gruplar[0]).toMatchObject({ ilerleme_yuzde: 75, acik: 1 });
        const comps = await run({ kirilim: 'bilesen' });
        expect(comps.gruplar[0]).toMatchObject({ ad: 'API', hata: { acik: 0, pay_yuzde: 100 } });
        expect(comps.disarida.ad).toBe('Bileşensiz kayıtlar');
    });
});
