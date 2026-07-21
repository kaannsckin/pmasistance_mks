import { describe, it, expect } from 'vitest';
import { analyzeDataHealth, applyHealthFix } from './dataHealth';
import { createEmptyWorkspace, createProject } from './workspace';
import { Person, TaskStatus, WorkspaceData } from '../types';

const person = (id: string, first: string, last: string, extra: Partial<Person> = {}): Person => ({
    id, firstName: first, lastName: last, departmentCode: 'U310', availableAA: 1, roles: [], ...extra,
});

const buildWs = (): WorkspaceData => {
    const p = createProject('Proje A');
    p.pmPersonId = 'pm1';
    p.tasks = [
        { id: 't1', name: 'İş', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Ali Veli', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo },
        { id: 't2', name: 'Hayalet İş', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'Hayalet Kişi', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo },
    ];
    p.risks = [
        { id: 'r1', title: 'Bağlanabilir', probability: 3, impact: 3, status: 'open', createdAt: '', owner: 'Ali Veli' }, // ad eşleşir, id yok
        { id: 'r2', title: 'Yetim sahip', probability: 2, impact: 2, status: 'open', createdAt: '', owner: 'Kimse Yok' },
    ];
    return {
        ...createEmptyWorkspace(),
        projects: [p],
        people: [person('pm1', 'Ali', 'Veli', { sicil: '123', titleCode: 'ARŞ' })],
        titles: [{ code: 'ARŞ', name: 'Araştırmacı' }], // maliyet yok
        allocations: [
            { id: 'a1', personId: 'pm1', projectId: p.id, year: 2026, plan: { 1: 0.5 }, actual: {} },
            { id: 'a2', personId: 'ghost', projectId: p.id, year: 2026, plan: { 1: 0.5 }, actual: {} }, // yetim kişi
            { id: 'a3', personId: 'pm1', projectId: 'yok-proje', year: 2026, plan: { 1: 0.5 }, actual: {} }, // yetim proje
        ],
    };
};

describe('analyzeDataHealth', () => {
    it('yetim tahsisleri (kişi/proje) hata olarak bulur', () => {
        const rep = analyzeDataHealth(buildWs());
        expect(rep.byCategory.orphanAllocationPerson).toBe(1);
        expect(rep.byCategory.orphanAllocationProject).toBe(1);
        const orphan = rep.issues.find(i => i.category === 'orphanAllocationPerson')!;
        expect(orphan.severity).toBe('error');
        expect(orphan.fix).toEqual({ kind: 'deleteAllocation', allocationId: 'a2' });
    });

    it('eşleşmeyen görev atamasını uyarı olarak bulur (havuza ekle önerir)', () => {
        const rep = analyzeDataHealth(buildWs());
        const iss = rep.issues.find(i => i.category === 'unmatchedTaskAssignee');
        expect(iss).toBeTruthy();
        expect(iss!.fix).toEqual({ kind: 'addPersonFromName', name: 'Hayalet Kişi' });
        // Ali Veli havuzda var → görev ataması sorun değil
        expect(rep.issues.some(i => i.title.includes('Ali Veli') && i.category === 'unmatchedTaskAssignee')).toBe(false);
    });

    it('risk sahibi ad eşleşiyorsa "bağlanabilir", yoksa "eşleşmeyen"', () => {
        const ws = buildWs();
        const rep = analyzeDataHealth(ws);
        const link = rep.issues.find(i => i.category === 'unlinkedRiskOwner')!;
        expect(link.fix).toEqual({ kind: 'linkRiskOwner', projectId: ws.projects[0].id, riskId: 'r1', personId: 'pm1' });
        const unmatched = rep.issues.find(i => i.category === 'unmatchedRiskOwner' && i.title.includes('Kimse Yok'));
        expect(unmatched).toBeTruthy();
        expect(unmatched!.fix).toEqual({ kind: 'addPersonFromName', name: 'Kimse Yok' });
    });

    it('tahsisli kişinin ünvan maliyeti yoksa info verir', () => {
        const rep = analyzeDataHealth(buildWs());
        expect(rep.byCategory.missingTitleCost).toBe(1);
    });

    it('temiz workspace’te sorun yok', () => {
        const p = createProject('Temiz'); p.pmPersonId = 'k1';
        const ws: WorkspaceData = {
            ...createEmptyWorkspace(),
            projects: [p],
            people: [person('k1', 'Kaan', 'Test', { departmentCode: 'U310' })],
            allocations: [{ id: 'a1', personId: 'k1', projectId: p.id, year: 2026, plan: {}, actual: {} }],
        };
        const rep = analyzeDataHealth(ws);
        expect(rep.counts.error).toBe(0);
        expect(rep.counts.warn).toBe(0);
    });
});

describe('applyHealthFix', () => {
    it('deleteAllocation yetim satırı kaldırır', () => {
        const ws = buildWs();
        const next = applyHealthFix(ws, { kind: 'deleteAllocation', allocationId: 'a2' });
        expect(next.allocations.some(a => a.id === 'a2')).toBe(false);
        expect(next.allocations).toHaveLength(2);
    });

    it('addPersonFromName havuza kişi ekler (ad/soyad ayrışır, mükerrer eklemez)', () => {
        const ws = buildWs();
        const next = applyHealthFix(ws, { kind: 'addPersonFromName', name: 'Hayalet Kişi' });
        const added = next.people.find(p => p.firstName === 'Hayalet' && p.lastName === 'Kişi');
        expect(added).toBeTruthy();
        // ikinci kez uygulama mükerrer eklemez
        const again = applyHealthFix(next, { kind: 'addPersonFromName', name: 'Hayalet Kişi' });
        expect(again.people.filter(p => p.firstName === 'Hayalet').length).toBe(1);
    });

    it('linkRiskOwner riski havuz kişisine bağlar', () => {
        const ws = buildWs();
        const next = applyHealthFix(ws, { kind: 'linkRiskOwner', projectId: ws.projects[0].id, riskId: 'r1', personId: 'pm1' });
        const risk = next.projects[0].risks!.find(r => r.id === 'r1')!;
        expect(risk.ownerPersonId).toBe('pm1');
        expect(risk.owner).toBe('Ali Veli');
        // artık analizde "bağlanabilir" kalmaz
        expect(analyzeDataHealth(next).byCategory.unlinkedRiskOwner).toBe(0);
    });
});
