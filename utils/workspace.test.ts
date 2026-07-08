import { describe, it, expect } from 'vitest';
import {
    createProject,
    legacyToProject,
    migrateLegacyWorkspace,
    normalizeWorkspace,
    parseImportedJson,
    resolveWorkspaceFromStorage,
    WORKSPACE_SCHEMA_VERSION,
} from './workspace';
import { ProjectData, TaskStatus } from '../types';

const legacySample = (): ProjectData => ({
    tasks: [{
        id: 't1', name: 'Eski görev', availability: true, priority: 'High', version: 1,
        predecessor: null, unit: 'Yazılım', resourceName: 'Kaan',
        time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status: TaskStatus.ToDo,
    }],
    resources: [{ id: 'r1', name: 'Kaan', participation: 100, unit: 'Yazılım', title: 'Uzman' }],
    notes: [],
    customerRequests: [],
    objectives: [],
    settings: {
        sprintDuration: 4,
        projectStartDate: '2026-01-05',
        isLocalPersistenceEnabled: true,
        isAIEnabled: false,
        theme: 'emerald',
        isDarkMode: true,
        titleCosts: { Uzman: 100 },
        globalTestDays: 6,
    },
    appVersion: '1.9.0',
    exportDate: '2026-01-01T00:00:00.000Z',
});

describe('legacy migration', () => {
    it('v1 verisini tek projeli workspace’e dönüştürür, veri kaybetmez', () => {
        const ws = migrateLegacyWorkspace(legacySample(), 'MKS');
        expect(ws.schemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
        expect(ws.projects).toHaveLength(1);
        const p = ws.projects[0];
        expect(p.name).toBe('MKS');
        expect(p.tasks).toHaveLength(1);
        expect(p.resources[0].name).toBe('Kaan');
        expect(p.settings.sprintDuration).toBe(4);
        expect(p.settings.globalTestDays).toBe(6);
        expect(ws.activeProjectId).toBe(p.id);
    });

    it('uygulama geneli ayarları workspace seviyesine taşır', () => {
        const ws = migrateLegacyWorkspace(legacySample());
        expect(ws.settings.theme).toBe('emerald');
        expect(ws.settings.isDarkMode).toBe(true);
        expect(ws.settings.isAIEnabled).toBe(false);
        expect(ws.settings.isLocalPersistenceEnabled).toBe(true);
    });

    it('bozuk/eksik ayarlarla çökmez, varsayılanları uygular', () => {
        const broken = { tasks: [], resources: [] } as unknown as ProjectData;
        const p = legacyToProject(broken, 'Bozuk');
        expect(p.settings.sprintDuration).toBe(3);
        expect(p.workPackages).toEqual([]);
    });
});

describe('resolveWorkspaceFromStorage', () => {
    it('v2 anahtarı öncelikli', () => {
        const v2 = JSON.stringify({
            schemaVersion: 2,
            projects: [createProject('P1')],
            activeProjectId: null,
            settings: {},
        });
        const legacy = JSON.stringify(legacySample());
        const { workspace, migratedFromLegacy } = resolveWorkspaceFromStorage(v2, legacy);
        expect(migratedFromLegacy).toBe(false);
        expect(workspace!.projects[0].name).toBe('P1');
    });

    it('v2 yoksa v1’den migration yapar', () => {
        const { workspace, migratedFromLegacy } = resolveWorkspaceFromStorage(null, JSON.stringify(legacySample()));
        expect(migratedFromLegacy).toBe(true);
        expect(workspace!.projects).toHaveLength(1);
    });

    it('ikisi de yoksa null döner', () => {
        const { workspace } = resolveWorkspaceFromStorage(null, null);
        expect(workspace).toBeNull();
    });

    it('bozuk v2 JSON’unda v1’e düşer', () => {
        const { workspace, migratedFromLegacy } = resolveWorkspaceFromStorage('{bozuk', JSON.stringify(legacySample()));
        expect(migratedFromLegacy).toBe(true);
        expect(workspace).not.toBeNull();
    });
});

describe('parseImportedJson', () => {
    it('workspace yedeğini tanır', () => {
        const ws = migrateLegacyWorkspace(legacySample());
        const res = parseImportedJson(JSON.stringify(ws));
        expect(res.kind).toBe('workspace');
        if (res.kind === 'workspace') expect(res.workspace.projects).toHaveLength(1);
    });

    it('v1 tek proje yedeğini proje olarak tanır', () => {
        const res = parseImportedJson(JSON.stringify(legacySample()), 'Aktarılan');
        expect(res.kind).toBe('legacyProject');
        if (res.kind === 'legacyProject') {
            expect(res.project.name).toBe('Aktarılan');
            expect(res.project.tasks).toHaveLength(1);
        }
    });

    it('geçersiz JSON’da anlamlı hata döner', () => {
        expect(parseImportedJson('%%%').kind).toBe('invalid');
        expect(parseImportedJson('{"foo":1}').kind).toBe('invalid');
    });
});

describe('normalizeWorkspace', () => {
    it('aktif proje id’si geçersizse ilk projeye düşer', () => {
        const ws = normalizeWorkspace({
            projects: [createProject('A'), createProject('B')],
            activeProjectId: 'olmayan-id',
        });
        expect(ws.activeProjectId).toBe(ws.projects[0].id);
    });

    it('eski kayıtlardaki eksik workPackages/status alanlarını tamamlar', () => {
        const p = createProject('Eksik');
        delete (p as Partial<typeof p>).workPackages;
        delete (p as Partial<typeof p>).status;
        const ws = normalizeWorkspace({ projects: [p] });
        expect(ws.projects[0].workPackages).toEqual([]);
        expect(ws.projects[0].status).toBe('devam');
    });
});
