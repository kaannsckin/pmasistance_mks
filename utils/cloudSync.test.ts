import { describe, it, expect } from 'vitest';
import { mergeWorkspaceDoc, splitWorkspaceDoc } from './cloudSync';
import { createEmptyWorkspace, createProject } from './workspace';
import { Note, WorkspaceData } from '../types';

const note = (id: string): Note => ({
    id, content: `not ${id}`, createdAt: '2026-01-01T00:00:00Z', weekNumber: 1, year: 2026, tags: [], mentions: [],
});

const buildWs = (): WorkspaceData => {
    const p1 = createProject('Proje A');
    p1.notes = [note('n1'), note('n2')];
    p1.customerRequests = [{ id: 'r1', title: 'İstek', description: '', customerName: 'X', createdAt: '2026-01-01', status: 'New' }];
    const p2 = createProject('Proje B'); // notu yok
    return {
        ...createEmptyWorkspace(),
        projects: [p1, p2],
        activeProjectId: p1.id,
        currentRole: 'py',
        people: [{ id: 'k1', firstName: 'Kaan', lastName: 'T', departmentCode: 'U310', availableAA: 1, roles: [] }],
        allocations: [{ id: 'a1', personId: 'k1', projectId: p1.id, year: 2026, plan: { 1: 0.5 }, actual: {} }],
        settings: { theme: 'purple', isDarkMode: true, isAIEnabled: false, isLocalPersistenceEnabled: true },
    };
};

describe('splitWorkspaceDoc', () => {
    it('notları ve istekleri core belgeden çıkarıp private belgeye taşır', () => {
        const ws = buildWs();
        const { core, privateDoc } = splitWorkspaceDoc(ws);
        const coreProjects = core.projects as WorkspaceData['projects'];
        expect(coreProjects.every(p => p.notes.length === 0 && p.customerRequests.length === 0)).toBe(true);
        expect(privateDoc.notes[ws.projects[0].id]).toHaveLength(2);
        expect(privateDoc.customerRequests[ws.projects[0].id]).toHaveLength(1);
        expect(privateDoc.notes[ws.projects[1].id]).toBeUndefined();
        // Cihaza özel alanlar core'a girmez
        expect('settings' in core).toBe(false);
        expect('currentRole' in core).toBe(false);
        expect('activeProjectId' in core).toBe(false);
        // Paylaşılan veri core'da
        expect((core.allocations as unknown[]).length).toBe(1);
        expect((core.people as unknown[]).length).toBe(1);
    });

    it('orijinal workspace nesnesini değiştirmez', () => {
        const ws = buildWs();
        splitWorkspaceDoc(ws);
        expect(ws.projects[0].notes).toHaveLength(2);
    });
});

describe('mergeWorkspaceDoc', () => {
    it('split → merge gidiş-dönüşü veri kaybetmez, kişisel alanları yerelden korur', () => {
        const ws = buildWs();
        const { core, privateDoc } = splitWorkspaceDoc(ws);
        const local = { ...createEmptyWorkspace(), currentRole: 'py' as const, currentPersonId: 'k1', settings: { theme: 'orange' } };
        const merged = mergeWorkspaceDoc(local as WorkspaceData, core as Partial<WorkspaceData>, privateDoc);
        expect(merged.projects[0].notes).toHaveLength(2);
        expect(merged.projects[0].customerRequests).toHaveLength(1);
        expect(merged.allocations).toHaveLength(1);
        expect(merged.currentRole).toBe('py'); // yerelden
        expect(merged.currentPersonId).toBe('k1'); // yerelden
        expect(merged.settings.theme).toBe('orange'); // yerelden
    });

    it('doğrulanmış bulut kimliği yerel rol/kişinin üzerine yazılır', () => {
        const ws = buildWs();
        const { core, privateDoc } = splitWorkspaceDoc(ws);
        const local = { ...createEmptyWorkspace(), currentRole: 'mudur' as const };
        const merged = mergeWorkspaceDoc(
            local as WorkspaceData,
            core as Partial<WorkspaceData>,
            privateDoc,
            { role: 'py', personId: 'k1' },
        );
        expect(merged.currentRole).toBe('py');
        expect(merged.currentPersonId).toBe('k1');
    });

    it('private belge yokken (yönetici RLS) notlar boş iner, çekirdek veri tam gelir', () => {
        const ws = buildWs();
        const { core } = splitWorkspaceDoc(ws);
        const merged = mergeWorkspaceDoc(createEmptyWorkspace(), core as Partial<WorkspaceData>, undefined);
        expect(merged.projects[0].notes).toEqual([]);
        expect(merged.projects[0].customerRequests).toEqual([]);
        expect(merged.people).toHaveLength(1);
        expect(merged.allocations).toHaveLength(1);
    });
});
