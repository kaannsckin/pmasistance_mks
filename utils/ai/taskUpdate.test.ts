import { describe, expect, it } from 'vitest';
import { Task, TaskStatus, WorkspaceData } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { applyAction, validateAction } from './actions';
import { buildToolContext } from './scope';
import { executeTool } from './tools';

const NOW = new Date('2026-11-20T09:00:00Z');

const task = (id: string, name: string, extra: Partial<Task> = {}): Task => ({
    id, name, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U310', resourceName: 'Ayşe Kaya',
    time: { best: 2, avg: 4, worst: 8 }, jiraId: '', notes: '', status: TaskStatus.ToDo, labels: ['arayüz'], ...extra,
});

const buildWs = (role: 'py' | 'mudur' = 'py'): WorkspaceData => {
    const p = createProject('ATLAS', { code: 'ATL' });
    p.id = 'atlas';
    p.pmPersonId = 'p1';
    p.resources = [{ id: 'r1', name: 'Ayşe Kaya', participation: 100, unit: 'U310', title: 'ARŞ' }];
    p.tasks = [
        task('t1', 'Giriş ekranı', { jiraId: 'ATL-1', dueDate: '2026-11-10' }),
        task('t2', 'Rapor servisi', { jiraId: 'ATL-2', dueDate: '2026-11-12' }),
        task('t3', 'Kurulum', { jiraId: 'ATL-3' }),
    ];
    return {
        ...createEmptyWorkspace(), currentRole: role, currentPersonId: role === 'py' ? 'p1' : undefined, projects: [p],
        people: [
            { id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] },
            { id: 'p2', firstName: 'Mehmet', lastName: 'Demir', departmentCode: 'U320', titleCode: 'UAR', availableAA: 1, roles: [] },
        ],
    };
};

const propose = async (ws: WorkspaceData, gorevler: unknown[]) => {
    const ctx = buildToolContext(ws, NOW);
    const out = JSON.parse((await executeTool({ name: 'oner_gorev_guncelle', arguments: { proje: 'ATLAS', gorevler } }, ctx)).content);
    return { out, proposal: ctx.proposals[0] };
};

describe('oner_gorev_guncelle', () => {
    it('çok görevi tek öneride: kaydırma, atama, öncelik, süre ve etiket; termini olmayan atlanır', async () => {
        const ws = buildWs();
        const { out, proposal } = await propose(ws, [
            { gorev: 'ATL-1', kaydir_gun: 14, atanan: 'Mehmet Demir', oncelik: 'High' },
            { gorev: 'Rapor servisi', sure: 6, etiket_ekle: 'acil', etiket_cikar: 'arayüz' },
            { gorev: 'Kurulum', kaydir_gun: 7 },
        ]);
        expect(out.atlanan).toEqual([expect.stringContaining('termini yok')]);
        expect(proposal.title).toBe('Görev güncelle: 2 görev · ATLAS');
        expect(proposal.details[0]).toEqual({ label: 'ATL-1 Giriş ekranı', value: 'termin: 10 Kas 2026 → 24 Kas 2026 · atanan: Ayşe Kaya → Mehmet Demir · öncelik: Medium → High' });
        expect(proposal.details[1].value).toBe('süre: 2/4/8 → 3/6/12 gün · etiket +acil · etiket −arayüz');

        const next = applyAction(ws, proposal.action).ws.projects[0];
        expect(next.tasks[0]).toMatchObject({ dueDate: '2026-11-24', resourceName: 'Mehmet Demir', priority: 'High' });
        expect(next.tasks[1]).toMatchObject({ time: { best: 3, avg: 6, worst: 12 }, labels: ['acil'], estimateSource: 'ai' });
        // Havuzdan atanan kişi proje ekibine eklenir
        expect(next.resources.map(r => r.name)).toEqual(['Ayşe Kaya', 'Mehmet Demir']);
    });

    it('termin silme ve atamayı kaldırma; değişen bir şey yoksa öneri olmaz', async () => {
        const ws = buildWs();
        const { proposal } = await propose(ws, [{ gorev: 'ATL-1', bitis: 'yok', atanan: 'yok' }]);
        const t = applyAction(ws, proposal.action).ws.projects[0].tasks[0];
        expect(t.dueDate).toBeUndefined();
        expect(t.resourceName).toBe('');
        const same = await propose(ws, [{ gorev: 'ATL-1', oncelik: 'Medium' }]);
        expect(same.out.hata).toMatch(/değişen bir şey yok/);
    });

    it('yetki ve doğrulama uygulamada yeniden denetlenir', () => {
        const action = { type: 'gorev_guncelle' as const, projectId: 'atlas', changes: [{ taskId: 't1', dueDate: '2026-13-45x' }] };
        expect(validateAction(buildWs(), action)).toMatch(/YYYY-AA-GG/);
        expect(validateAction(buildWs(), { ...action, changes: [{ taskId: 't1', resourceName: 'Dış Kişi' }] })).toMatch(/veri havuzunda/);
        expect(validateAction(buildWs('mudur'), { ...action, changes: [{ taskId: 't1', priority: 'Low' }] })).toMatch(/yetkiniz yok|bulunamadı/);
    });
});
