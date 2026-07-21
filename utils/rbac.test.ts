import { describe, it, expect } from 'vitest';
import {
    canAddAllocationToProject, canCreateProject, canEditActualCell, canEditAllocationCell,
    canEditPlanCell, canEditProjectContent, Identity, identityNeedsPerson,
    managesPerson, ownsProject, seesAllProjects, visiblePersonIds, visibleProjectIds,
} from './rbac';
import { createEmptyWorkspace, createProject } from './workspace';
import { Person, WorkspaceData } from '../types';

const person = (id: string, dept: string): Person => ({
    id, firstName: id, lastName: 'T', departmentCode: dept, availableAA: 1, roles: [],
});

const buildWs = (): WorkspaceData => {
    const pA = createProject('Proje A'); pA.pmPersonId = 'pm1';
    const pB = createProject('Proje B'); pB.pmPersonId = 'pm2';
    return {
        ...createEmptyWorkspace(),
        projects: [pA, pB],
        people: [person('pm1', 'U310'), person('pm2', 'U320'), person('worker', 'U310')],
        allocations: [
            { id: 'a1', personId: 'worker', projectId: pB.id, year: 2026, plan: { 1: 0.5 }, actual: {} },
        ],
    };
};

const py = (personId?: string): Identity => ({ role: 'py', personId });
const bolum = (personId?: string): Identity => ({ role: 'bolum_sorumlu', personId });

describe('görünürlük kapsamı', () => {
    it('müdür/pyb her projeyi görür; py yalnız sahip olduğunu', () => {
        const ws = buildWs();
        expect(seesAllProjects('mudur')).toBe(true);
        expect(visibleProjectIds(ws, { role: 'mudur' }).size).toBe(2);
        const pmScope = visibleProjectIds(ws, py('pm1'));
        expect(pmScope.size).toBe(1);
        expect(pmScope.has(ws.projects[0].id)).toBe(true);
        expect(pmScope.has(ws.projects[1].id)).toBe(false);
    });

    it('bölüm sorumlusu, bölümü personelinin çalıştığı projeleri görür', () => {
        const ws = buildWs();
        // worker (U310) Proje B'de çalışıyor → U310 bölüm sorumlusu Proje B'yi görür
        const scope = visibleProjectIds(ws, bolum('pm1')); // pm1 U310
        expect(scope.has(ws.projects[1].id)).toBe(true);
        expect(scope.size).toBe(1);
    });

    it('kişi seçilmemiş py hiçbir proje görmez ve uyarı gerektirir', () => {
        const ws = buildWs();
        expect(visibleProjectIds(ws, py(undefined)).size).toBe(0);
        expect(identityNeedsPerson(py(undefined))).toBe(true);
        expect(identityNeedsPerson(py('pm1'))).toBe(false);
        expect(identityNeedsPerson({ role: 'mudur' })).toBe(false);
    });

    it('bölüm sorumlusu yalnız kendi bölümü kişilerini görür', () => {
        const ws = buildWs();
        const ids = visiblePersonIds(ws, bolum('pm1')); // U310
        expect(ids.has('pm1')).toBe(true);
        expect(ids.has('worker')).toBe(true);
        expect(ids.has('pm2')).toBe(false); // U320
    });
});

describe('proje içerik düzenleme (sahip PM)', () => {
    it('yalnız sahip PM projesini düzenler', () => {
        const ws = buildWs();
        expect(ownsProject(ws.projects[0], py('pm1'))).toBe(true);
        expect(ownsProject(ws.projects[0], py('pm2'))).toBe(false);
        expect(canEditProjectContent(ws, py('pm1'), ws.projects[0].id)).toBe(true);
        expect(canEditProjectContent(ws, py('pm2'), ws.projects[0].id)).toBe(false);
        expect(canEditProjectContent(ws, { role: 'mudur' }, ws.projects[0].id)).toBe(false);
    });

    it('proje oluşturmayı py ve pyb_destek yapar', () => {
        expect(canCreateProject(py('x'))).toBe(true);
        expect(canCreateProject({ role: 'pyb_destek' })).toBe(true);
        expect(canCreateProject({ role: 'mudur' })).toBe(false);
        expect(canCreateProject(bolum('x'))).toBe(false);
    });
});

describe('tahsis hücresi düzenleme', () => {
    it('proje sahibi PM, projesindeki herkesin tahsisini düzenler', () => {
        const ws = buildWs();
        expect(canEditAllocationCell(ws, py('pm2'), ws.projects[1].id, 'worker')).toBe(true); // pm2 owns B
        expect(canEditAllocationCell(ws, py('pm2'), ws.projects[0].id, 'worker')).toBe(false); // A değil
    });

    it('bölüm sorumlusu, bölümü personelinin tahsisini her projede düzenler', () => {
        const ws = buildWs();
        // U310 sorumlusu → worker (U310) tahsisini Proje B'de düzenler
        expect(canEditAllocationCell(ws, bolum('pm1'), ws.projects[1].id, 'worker')).toBe(true);
        expect(managesPerson(ws, bolum('pm1'), 'worker')).toBe(true);
        expect(managesPerson(ws, bolum('pm1'), 'pm2')).toBe(false); // U320
        // pm2 (U320) tahsisini U310 sorumlusu düzenleyemez
        expect(canEditAllocationCell(ws, bolum('pm1'), ws.projects[1].id, 'pm2')).toBe(false);
    });

    it('yönetici rolleri hiçbir hücreyi düzenleyemez', () => {
        const ws = buildWs();
        expect(canEditAllocationCell(ws, { role: 'mudur' }, ws.projects[0].id, 'worker')).toBe(false);
        expect(canEditActualCell(ws, { role: 'pyb_sorumlu' }, ws.projects[0].id, 'worker')).toBe(false);
    });

    it('plan hücresi kilitliyken düzenlenemez, gerçekleşen düzenlenebilir', () => {
        const ws = buildWs();
        const locks = [{ projectId: ws.projects[1].id, year: 2026, status: 'locked' as const }];
        expect(canEditPlanCell(ws, py('pm2'), locks, ws.projects[1].id, 'worker', 2026)).toBe(false);
        expect(canEditActualCell(ws, py('pm2'), ws.projects[1].id, 'worker')).toBe(true);
        // Taslak yılda plan açık
        expect(canEditPlanCell(ws, py('pm2'), locks, ws.projects[1].id, 'worker', 2027)).toBe(true);
    });

    it('canAddAllocationToProject: sahip PM veya bölüm sorumlusu', () => {
        const ws = buildWs();
        expect(canAddAllocationToProject(ws, py('pm1'), ws.projects[0].id)).toBe(true);
        expect(canAddAllocationToProject(ws, py('pm1'), ws.projects[1].id)).toBe(false);
        expect(canAddAllocationToProject(ws, bolum('pm1'), ws.projects[0].id)).toBe(true);
        expect(canAddAllocationToProject(ws, { role: 'mudur' }, ws.projects[0].id)).toBe(false);
    });
});
