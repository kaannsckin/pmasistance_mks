import { describe, expect, it } from 'vitest';
import { Allocation, TaskStatus, UserRole, WorkspaceData } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { AiAction, applyAction, describeAction, validateAction } from './actions';

const build = (role: UserRole = 'py', personId: string | null = 'pm'): WorkspaceData => {
    const mine = createProject('ALTAY');
    mine.id = 'altay';
    mine.pmPersonId = 'pm';
    mine.tasks = [{ id: 't1', name: 'Arayüz', availability: true, priority: 'High', version: 1, predecessor: null, unit: '', resourceName: '', time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status: TaskStatus.ToDo }];
    const other = createProject('Başka');
    other.id = 'other';
    other.pmPersonId = 'x';
    return {
        ...createEmptyWorkspace(),
        currentRole: role,
        currentPersonId: personId ?? undefined,
        projects: [mine, other],
        people: [
            { id: 'pm', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] },
            { id: 'dev', firstName: 'Can', lastName: 'Er', departmentCode: 'U310', availableAA: 1, roles: [] },
        ],
        allocations: [{ id: 'a1', personId: 'dev', projectId: 'altay', year: 2026, plan: { 3: 0.5 }, actual: {} } as Allocation],
    };
};

const risk: AiAction = { type: 'risk_ekle', projectId: 'altay', title: 'Tedarik gecikmesi', probability: 4, impact: 3, mitigation: 'Alternatif tedarikçi', ownerPersonId: 'dev' };

describe('validateAction (yetki)', () => {
    it('proje sahibi PM kendi projesinde öneri uygulayabilir; başka projede ve yönetici rolünde reddedilir', () => {
        expect(validateAction(build(), risk)).toBeNull();
        expect(validateAction(build(), { ...risk, projectId: 'other' })).toMatch(/yetkiniz yok/);
        expect(validateAction(build('mudur', null), risk)).toMatch(/yetkiniz yok/);
        expect(validateAction(build(), { ...risk, probability: 9 as any })).toMatch(/1-5/);
        expect(validateAction(build(), { ...risk, projectId: 'yok' })).toMatch(/bulunamadı/);
    });

    it('plan kilitliyse plan reddedilir, gerçekleşen kabul edilir', () => {
        const ws = { ...build(), planLocks: [{ projectId: 'altay', year: 2026, status: 'locked' as const }] };
        const plan: AiAction = { type: 'tahsis_ayarla', personId: 'dev', projectId: 'altay', year: 2026, month: 4, field: 'plan', value: 0.5 };
        expect(validateAction(ws, plan)).toMatch(/kilitli/);
        expect(validateAction(ws, { ...plan, field: 'actual' })).toBeNull();
        expect(validateAction(build(), { ...plan, value: 3 })).toMatch(/0 ile 1,5/);
        expect(validateAction(build(), { ...plan, month: 13 })).toMatch(/1-12/);
    });
});

describe('applyAction', () => {
    it('risk ekler, denetim günlüğüne hem risk.add hem ai.apply yazar', () => {
        const { ws, summary } = applyAction(build(), risk);
        const r = ws.projects[0].risks![0];
        expect(r).toMatchObject({ title: 'Tedarik gecikmesi', probability: 4, impact: 3, owner: 'Can Er', ownerPersonId: 'dev' });
        expect(ws.auditLog!.map(a => a.action)).toEqual(['ai.apply', 'risk.add']);
        expect(summary).toContain('Tedarik gecikmesi');
    });

    it('görev ekler ve havuzdaki atanan kişiyi proje kaynaklarına ekler', () => {
        const { ws } = applyAction(build(), { type: 'gorev_ekle', projectId: 'altay', name: 'Test planı', priority: 'High', resourceName: 'Can Er', dueDate: '2026-11-01', time: { best: 2, avg: 3, worst: 5 } });
        const t = ws.projects[0].tasks.find(x => x.name === 'Test planı')!;
        expect(t).toMatchObject({ status: TaskStatus.ToDo, resourceName: 'Can Er', dueDate: '2026-11-01', availability: true });
        expect(ws.projects[0].resources.some(r => r.name === 'Can Er')).toBe(true);
    });

    it('görev durumu ve RAG günceller', () => {
        const a = applyAction(build(), { type: 'gorev_durumu', projectId: 'altay', taskId: 't1', status: TaskStatus.Done });
        expect(a.ws.projects[0].tasks[0].status).toBe(TaskStatus.Done);
        const b = applyAction(build(), { type: 'rag_guncelle', projectId: 'altay', rag: 'amber', ragNote: 'Tedarik gecikiyor' });
        expect(b.ws.projects[0]).toMatchObject({ rag: 'amber', ragNote: 'Tedarik gecikiyor' });
        expect(b.ws.auditLog!.map(x => x.action)).toEqual(['ai.apply', 'project.rag']);
    });

    it('tahsis: var olan satırı günceller, yoksa satır açar', () => {
        const a = applyAction(build(), { type: 'tahsis_ayarla', personId: 'dev', projectId: 'altay', year: 2026, month: 3, field: 'plan', value: 0.8 });
        expect(a.ws.allocations.find(x => x.id === 'a1')!.plan[3]).toBe(0.8);
        const b = applyAction(build(), { type: 'tahsis_ayarla', personId: 'pm', projectId: 'altay', year: 2026, month: 5, field: 'actual', value: 0.25 });
        const row = b.ws.allocations.find(x => x.personId === 'pm')!;
        expect(row.actual[5]).toBe(0.25);
        expect(describeAction(build(), { type: 'tahsis_ayarla', personId: 'pm', projectId: 'altay', year: 2026, month: 5, field: 'actual', value: 0.25 }).details.some(d => d.value.includes('yeni tahsis satırı'))).toBe(true);
    });

    it('yetkisiz eylemde hata fırlatır (yeniden doğrulama)', () => {
        expect(() => applyAction(build('mudur', null), risk)).toThrow(/yetkiniz yok/);
    });
});
