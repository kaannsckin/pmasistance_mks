import { describe, it, expect } from 'vitest';
import { contentHash, mergeWorkspaceDoc, planPush, splitWorkspaceDoc, syncedHashes } from './cloudSync';
import { PERMISSIONS_REV } from './permissions';
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
        const { core, privateDoc, projects } = splitWorkspaceDoc(ws);
        expect(projects.every(p => p.notes.length === 0 && p.customerRequests.length === 0)).toBe(true);
        // Projeler core'a girmez (ayrı satırlar); yalnız sıraları
        expect('projects' in core).toBe(false);
        expect(core.projectOrder).toEqual(ws.projects.map(p => p.id));
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
        const { core, privateDoc, projects } = splitWorkspaceDoc(ws);
        const local = { ...createEmptyWorkspace(), currentRole: 'mudur' as const, settings: { theme: 'orange' } };
        const merged = mergeWorkspaceDoc(local as WorkspaceData, core as Partial<WorkspaceData>, privateDoc, [...projects].reverse());
        expect(merged.projects.map(p => p.id)).toEqual(ws.projects.map(p => p.id)); // sıra core'dan
        expect(merged.projects[0].notes).toHaveLength(2);
        expect(merged.projects[0].customerRequests).toHaveLength(1);
        expect(merged.allocations).toHaveLength(1);
        expect(merged.currentRole).toBe('mudur'); // yerelden
        expect(merged.settings.theme).toBe('orange'); // yerelden
    });

    it('sağlık modelinin PMO puanları ve haftalık fotoğrafları paylaşılır', () => {
        const ws: WorkspaceData = {
            ...buildWs(),
            pmoRatings: [{ id: 'r', projectId: 'p', year: 2026, week: 41, score: 7, byRole: 'pyb_destek', at: '2026-10-07T00:00:00Z' }],
            healthHistory: [{ year: 2026, week: 41, takenAt: '2026-10-07T00:00:00Z', model: 'uzman-1', projects: [{ projectId: 'p', score: 70, coverage: 0.5, x: { rag: 1 } }] }],
        };
        const { core, privateDoc } = splitWorkspaceDoc(ws);
        const merged = mergeWorkspaceDoc(createEmptyWorkspace(), core as Partial<WorkspaceData>, privateDoc);
        expect(merged.pmoRatings).toEqual(ws.pmoRatings);
        expect(merged.healthHistory).toEqual(ws.healthHistory);
    });

    it('admin yetkileri ve profiller paylaşılır', () => {
        const ws: WorkspaceData = { ...buildWs(), rolePermissions: { py: ['project.create', 'health.rate'] }, rolePermissionsRev: PERMISSIONS_REV, profiles: [{ id: 'p1', role: 'mudur', personId: 'k1' }], viewConfig: { mudur: { minRiskScore: 15 } }, healthConfig: { bandGood: 80 } };
        const { core, privateDoc } = splitWorkspaceDoc(ws);
        const merged = mergeWorkspaceDoc(createEmptyWorkspace(), core as Partial<WorkspaceData>, privateDoc);
        expect(merged.rolePermissions).toEqual(ws.rolePermissions);
        expect(core.rolePermissionsRev).toBe(PERMISSIONS_REV); // güncel sürüm: kaldırılan yetki geri eklenmez
        expect(merged.profiles).toEqual(ws.profiles);
        expect(merged.viewConfig).toEqual(ws.viewConfig);
        expect(merged.healthConfig).toEqual(ws.healthConfig);
    });

    it('private belge yokken (yönetici RLS) notlar boş iner, çekirdek veri tam gelir', () => {
        const ws = buildWs();
        const { core, projects } = splitWorkspaceDoc(ws);
        const merged = mergeWorkspaceDoc(createEmptyWorkspace(), core as Partial<WorkspaceData>, undefined, projects);
        expect(merged.projects[0].notes).toEqual([]);
        expect(merged.projects[0].customerRequests).toEqual([]);
        expect(merged.people).toHaveLength(1);
        expect(merged.allocations).toHaveLength(1);
    });
});

describe('proje satırları ve değişiklik planı', () => {
    it('ilk gönderimde her şey; sonra yalnız değişen proje, değişmeyen core ve not belgesi gitmez', () => {
        const ws = buildWs();
        const first = planPush(ws, {});
        expect(first.upserts.map(u => [u.id, u.expected])).toEqual(ws.projects.map(p => [p.id, undefined]));
        expect(first.coreChanged && first.privateChanged).toBe(true);
        const synced = { projectVersions: Object.fromEntries(ws.projects.map(p => [p.id, 3])), ...syncedHashes(ws) };
        expect(planPush(ws, synced)).toMatchObject({ upserts: [], deletes: [], coreChanged: false, privateChanged: false });
        // Bir projenin görevi değişti: yalnız o, beklenen sürümüyle
        const edited = { ...ws, projects: [{ ...ws.projects[0], name: 'Proje A2' }, ws.projects[1]] };
        const plan = planPush(edited, synced);
        expect(plan.upserts.map(u => [u.id, u.expected])).toEqual([[ws.projects[0].id, 3]]);
        expect(plan.coreChanged).toBe(false);
        // Yalnız not değişti: proje gitmez, not belgesi gider
        const noted = { ...ws, projects: [{ ...ws.projects[0], notes: [] }, ws.projects[1]] };
        expect(planPush(noted, synced)).toMatchObject({ upserts: [], privateChanged: true, coreChanged: false });
        // Proje silindi: satırı sürümüyle silinir, sıra değiştiği için core gider
        const removed = { ...ws, projects: [ws.projects[1]] };
        expect(planPush(removed, synced)).toMatchObject({ deletes: [{ id: ws.projects[0].id, expected: 3 }], coreChanged: true });
    });

    it('eski biçim (projeler core içinde, satır yok) okunur ve ilk gönderimde satırlara taşınır', () => {
        const ws = buildWs();
        const { core, privateDoc, projects } = splitWorkspaceDoc(ws);
        const legacyCore = { ...core, projectOrder: undefined, projects };
        const merged = mergeWorkspaceDoc(createEmptyWorkspace(), legacyCore as Partial<WorkspaceData>, privateDoc, []);
        expect(merged.projects.map(p => p.name)).toEqual(['Proje A', 'Proje B']);
        expect(merged.projects[0].notes).toHaveLength(2);
        // Çekimden sonra sürüm bilinmiyor: hepsi eklenir, core da (projesiz) yeniden yazılır
        const plan = planPush(merged, { projectVersions: {}, projectHashes: {} });
        expect(plan.upserts).toHaveLength(2);
        expect(plan.upserts.every(u => u.expected === undefined)).toBe(true);
        expect(plan.coreChanged).toBe(true);
    });

    it('içerik özeti kararlı ve değişikliğe duyarlı', () => {
        expect(contentHash({ a: 1, b: [1, 2] })).toBe(contentHash({ a: 1, b: [1, 2] }));
        expect(contentHash({ a: 1, b: [1, 2] })).not.toBe(contentHash({ a: 1, b: [2, 1] }));
        expect(contentHash('x'.repeat(10000))).not.toBe(contentHash('x'.repeat(10001)));
    });
});
