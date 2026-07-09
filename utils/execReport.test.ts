import { describe, it, expect } from 'vitest';
import { buildExecReport, buildExecWorkbookData, isExecRole } from './execReport';
import { createEmptyWorkspace, createProject } from './workspace';
import { Allocation, Person, TaskStatus, WorkspaceData } from '../types';

const person = (id: string, name: string, dept = 'U310', availableAA = 1): Person => ({
    id, firstName: name, lastName: 'Test', departmentCode: dept, availableAA, roles: [],
});

const buildWs = (): WorkspaceData => {
    const p1 = createProject('Proje A', { code: 'SAP1', rag: 'red', ragNote: 'Kaynak sıkıntısı' });
    const p2 = createProject('Proje B');
    p2.status = 'teklif';
    p1.tasks = [
        { id: 't1', name: 'a', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'K', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.Done },
        { id: 't2', name: 'b', availability: true, priority: 'High', version: 1, predecessor: null, unit: 'X', resourceName: 'K', time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo },
    ];
    const allocations: Allocation[] = [
        { id: 'a1', personId: 'k1', projectId: p1.id, year: 2026, plan: { 1: 0.6, 2: 0.5 }, actual: { 1: 0.7 } },
        { id: 'a2', personId: 'k1', projectId: p2.id, year: 2026, plan: { 1: 0.6 }, actual: {} },
        { id: 'a3', personId: 'k2', projectId: p1.id, year: 2026, plan: { 1: 0.4 }, actual: { 1: 0.3 } },
        { id: 'a4', personId: 'k1', projectId: p1.id, year: 2025, plan: { 1: 1 }, actual: {} }, // farklı yıl
    ];
    return {
        ...createEmptyWorkspace(),
        projects: [p1, p2],
        people: [person('k1', 'Kaan'), person('k2', 'Ayşe', 'U320', 0.5)],
        allocations,
        planLocks: [{ projectId: p1.id, year: 2026, status: 'locked' }],
    };
};

describe('buildExecReport', () => {
    it('KPI ve aylık serileri doğru hesaplar', () => {
        const r = buildExecReport(buildWs(), 2026);
        expect(r.kpi.projectTotal).toBe(2);
        expect(r.kpi.projectCounts.devam).toBe(1);
        expect(r.kpi.projectCounts.teklif).toBe(1);
        expect(r.kpi.ragCounts.red).toBe(1);
        expect(r.kpi.ragCounts.none).toBe(1);
        expect(r.monthlyPlan[0]).toBeCloseTo(1.6); // 0.6 + 0.6 + 0.4 (2025 hariç)
        expect(r.monthlyPlan[1]).toBeCloseTo(0.5);
        expect(r.monthlyActual[0]).toBeCloseTo(1.0);
        expect(r.kpi.totalPlanAA).toBeCloseTo(2.1);
        expect(r.kpi.totalActualAA).toBeCloseTo(1.0);
        expect(r.kpi.monthlyCapacityAA).toBeCloseTo(1.5);
        expect(r.kpi.taskTotal).toBe(2);
        expect(r.kpi.taskProgressPct).toBe(50);
        // k1 Ocak: 0.6+0.6=1.2 > 1 → aşırı tahsis
        expect(r.kpi.overAllocationCount).toBe(1);
    });

    it('proje satırları plan/gerçekleşen/sapma ve kilit durumu taşır', () => {
        const r = buildExecReport(buildWs(), 2026);
        const a = r.projects.find(p => p.name === 'Proje A')!;
        expect(a.planAA).toBeCloseTo(1.5); // 0.6+0.5+0.4
        expect(a.actualAA).toBeCloseTo(1.0);
        expect(a.varianceAA).toBeCloseTo(-0.5);
        expect(a.lockStatus).toBe('locked');
        expect(a.progressPct).toBe(50);
        const b = r.projects.find(p => p.name === 'Proje B')!;
        expect(b.lockStatus).toBe('draft');
        // planAA'ya göre sıralı: A (1.5) önce
        expect(r.projects[0].name).toBe('Proje A');
    });

    it('bölüm satırları kapasiteyle gelir', () => {
        const r = buildExecReport(buildWs(), 2026);
        const u310 = r.departmentPlanRows.find(d => d.key === 'U310')!;
        expect(u310.months[0]).toBeCloseTo(1.2);
        expect(u310.capacity).toBeCloseTo(1);
    });
});

describe('buildExecWorkbookData', () => {
    it('yedi sayfayı doğru boyutlarla üretir', () => {
        const data = buildExecWorkbookData(buildExecReport(buildWs(), 2026));
        expect(Object.keys(data)).toEqual(['Özet', 'Projeler', 'Aylık Plan-Gerçekleşen', 'Bölüm AA (Plan)', 'Kişi AA (Plan)', 'Aşırı Tahsis', 'Kapasite-Talep (Rol)']);
        expect(data['Projeler']).toHaveLength(3); // başlık + 2 proje
        expect(data['Projeler'][1][0]).toBe('Proje A');
        expect(data['Projeler'][1][11]).toBe('Kilitli');
        expect(data['Aylık Plan-Gerçekleşen']).toHaveLength(14); // başlık + 12 ay + toplam
        expect(data['Aşırı Tahsis']).toHaveLength(2); // başlık + 1 kayıt
        expect(data['Aşırı Tahsis'][1][1]).toBe('Oca');
    });
});

describe('isExecRole', () => {
    it('yalnızca müdür ve PYB sorumlusunu yönetici sayar', () => {
        expect(isExecRole('mudur')).toBe(true);
        expect(isExecRole('pyb_sorumlu')).toBe(true);
        expect(isExecRole('py')).toBe(false);
        expect(isExecRole('pyb_destek')).toBe(false);
        expect(isExecRole('bolum_sorumlu')).toBe(false);
        expect(isExecRole(undefined)).toBe(false);
    });
});
