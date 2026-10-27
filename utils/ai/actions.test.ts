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

describe('risk güncelleme, istek kararı, not', () => {
    const withData = (): WorkspaceData => {
        const ws = build();
        ws.projects[0].risks = [{ id: 'r1', title: 'Tedarik gecikmesi', probability: 4, impact: 3, status: 'open', createdAt: '2026-10-01T09:00:00.000Z' }];
        ws.projects[0].customerRequests = [
            { id: 'q1', title: 'Çevrimdışı mod', description: 'Saha ekipleri bağlantısız çalışmak istiyor.', customerName: 'Kurum B', createdAt: '2026-10-14T09:00:00.000Z', status: 'New' },
            { id: 'q2', title: 'Eski istek', description: '', customerName: 'Kurum B', createdAt: '2026-09-01T09:00:00.000Z', status: 'Rejected' },
        ];
        return ws;
    };

    it('riski kapatır: durum değişir, risk.close ve ai.apply yazılır; değişiklik yoksa reddedilir', () => {
        const close: AiAction = { type: 'risk_guncelle', projectId: 'altay', riskId: 'r1', status: 'closed', reason: 'Tedarikçi teslim etti' };
        expect(validateAction(withData(), { ...close, status: 'open' })).toMatch(/değişen/);
        expect(validateAction(withData(), { ...close, projectId: 'other' })).toMatch(/yetkiniz yok/);
        expect(describeAction(withData(), close).details).toEqual(expect.arrayContaining([{ label: 'Durum', value: 'Açık → Kapandı' }]));
        const { ws } = applyAction(withData(), close);
        expect(ws.projects[0].risks![0].status).toBe('closed');
        expect(ws.auditLog!.map(a => a.action)).toEqual(['ai.apply', 'risk.close']);
        expect(ws.auditLog![1].summary).toContain('Tedarikçi teslim etti');
    });

    it('olasılık, etki, aksiyon ve sahibi günceller', () => {
        const { ws } = applyAction(withData(), { type: 'risk_guncelle', projectId: 'altay', riskId: 'r1', probability: 5, impact: 4, mitigation: 'İkinci tedarikçi', ownerPersonId: 'dev' });
        expect(ws.projects[0].risks![0]).toMatchObject({ status: 'open', probability: 5, impact: 4, mitigation: 'İkinci tedarikçi', owner: 'Can Er' });
    });

    it('isteği kabul eder: görev açılır, istek göreve bağlanır, gerekçe nota düşer', () => {
        const accept: AiAction = {
            type: 'istek_karari', projectId: 'altay', requestId: 'q1', decision: 'kabul', reason: '3 hafta ek efor; Ocak sürümüne alındı.', day: '2026-10-15',
            task: { priority: 'High', resourceName: 'Can Er', dueDate: '2027-01-15', time: { best: 10, avg: 15, worst: 22 } },
        };
        const { ws } = applyAction(withData(), accept);
        const p = ws.projects[0];
        const task = p.tasks.find(t => t.name === 'Çevrimdışı mod')!;
        expect(task).toMatchObject({ status: TaskStatus.ToDo, priority: 'High', resourceName: 'Can Er', dueDate: '2027-01-15', availability: true });
        expect(task.notes).toContain('Talep eden: Kurum B');
        expect(p.customerRequests[0]).toMatchObject({ status: 'Converted', convertedTaskId: task.id });
        const note = p.notes[p.notes.length - 1];
        expect(note.content).toContain('Gerekçe: 3 hafta ek efor');
        expect(note.tags).toEqual(expect.arrayContaining(['müşteri-isteği', 'karar']));
        expect(note.createdAt.slice(0, 10)).toBe('2026-10-15');
    });

    it('isteği reddeder; karara bağlanmış istek ve boş gerekçe reddedilir', () => {
        const reject: AiAction = { type: 'istek_karari', projectId: 'altay', requestId: 'q1', decision: 'ret', reason: 'Sözleşme kapsamı dışında.' };
        const { ws } = applyAction(withData(), reject);
        expect(ws.projects[0].customerRequests[0].status).toBe('Rejected');
        expect(ws.projects[0].tasks).toHaveLength(1);
        expect(validateAction(withData(), { ...reject, requestId: 'q2' })).toMatch(/zaten karara/);
        expect(validateAction(withData(), { ...reject, reason: ' ' })).toMatch(/gerekçe/);
    });

    it('proje notu ekler (etiketler ayrıştırılır); boş not reddedilir', () => {
        const { ws } = applyAction(withData(), { type: 'not_ekle', projectId: 'altay', content: '#karar Test kaynağı istendi\n[ ] Selin Hanım\'a talep', day: '2026-10-22' });
        const note = ws.projects[0].notes[ws.projects[0].notes.length - 1];
        expect(note).toMatchObject({ tags: ['karar'], weekNumber: 43, year: 2026 });
        expect(validateAction(withData(), { type: 'not_ekle', projectId: 'altay', content: '  ' })).toMatch(/boş/);
        expect(validateAction(withData(), { type: 'not_ekle', projectId: 'altay', content: 'x', day: '22.10.2026' })).toMatch(/YYYY/);
    });
});
