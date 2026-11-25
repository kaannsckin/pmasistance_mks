import { describe, expect, it } from 'vitest';
import { Project, Task, TaskStatus } from '../../types';
import { createProject } from '../workspace';
import { buildSprintWindows } from '../taskToAllocation';
import { capacityModel, remainingEffort, UNASSIGNED } from './capacity';

const project = (start: string, weeks = 1, testDays = 0): Project => {
    const p = createProject('ATLAS');
    p.settings = { ...p.settings, projectStartDate: start, sprintDuration: weeks, globalTestDays: testDays };
    p.resources = [
        { id: 'r1', name: 'Ayşe Kaya', participation: 100, unit: 'U310', title: 'Uzman' },
        { id: 'r2', name: 'Can Er', participation: 50, unit: 'U310', title: 'Uzman' },
    ];
    return p;
};
const people = [{ id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] }];

describe('kapasite modeli', () => {
    it('katılım, sprint içi test oranı ve projede olmayan kişi', () => {
        const p = project('2026-11-23', 2, 2); // 10 gün sprint, 8 gün net
        const w = buildSprintWindows(p, 1)[0];
        const cap = capacityModel({ project: p });
        expect(cap(w, 'Ayşe Kaya')).toMatchObject({ days: 8, full: 8, holidays: 0 });
        expect(cap(w, 'Can Er').days).toBe(4);
        expect(cap(w, 'Havuzdan Biri').days).toBe(8); // kaynak kaydı yok → tek kişi
        expect(cap(w, UNASSIGNED).days).toBe(8);
    });

    it('resmi tatil düşülür (29 Ekim Perşembe)', () => {
        const p = project('2026-10-26');
        const w = buildSprintWindows(p, 1)[0];
        expect(capacityModel({ project: p })(w, 'Ayşe Kaya')).toMatchObject({ days: 4, holidays: 1 });
    });

    it('izin ay oranıyla günlere düşer; ad soyaddan eşleşir', () => {
        const p = project('2026-12-07');
        const w = buildSprintWindows(p, 1)[0];
        const cap = capacityModel({ project: p, people, leaves: [{ id: 'l', personId: 'p1', year: 2026, month: 12, aa: 0.5 }] });
        expect(cap(w, 'Ayşe Kaya')).toMatchObject({ days: 2.5, leaveDays: 2.5 });
        expect(cap(w, 'Can Er').days).toBe(2.5); // izni yok, katılım %50
    });

    it('sürmekte olan sprint: bugünden önceki günler sayılmaz; hedef doluluk tampon bırakır', () => {
        const p = project('2026-11-23');
        const w = buildSprintWindows(p, 1)[0];
        const wednesday = new Date(2026, 10, 25, 9);
        expect(capacityModel({ project: p, fromDate: wednesday })(w, 'Ayşe Kaya')).toMatchObject({ days: 3, elapsed: 2 });
        expect(capacityModel({ project: p, targetLoad: 0.8 })(w, 'Ayşe Kaya').days).toBe(4);
    });
});

describe('kalan efor', () => {
    const t = (extra: Partial<Task>): Task => ({
        id: 't', name: 'İş', availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'U310', resourceName: 'Ayşe Kaya',
        time: { best: 4, avg: 4, worst: 4 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
    });
    it('başlamamış iş: PERT, istenirse geçmiş sapmayla düzeltilir (0,5–3 arası)', () => {
        expect(remainingEffort(t({}))).toBe(4);
        expect(remainingEffort(t({}), { calibrate: () => 1.25 })).toBe(5);
        expect(remainingEffort(t({}), { calibrate: () => 10 })).toBe(12);
        expect(remainingEffort(t({ status: TaskStatus.Done }))).toBe(0);
    });
    it('başlamış iş: Jira kalanı, yoksa harcanan saat, yoksa sprintte kalan oran (en az %25); sapma uygulanmaz', () => {
        expect(remainingEffort(t({ status: TaskStatus.InProgress, remainingEstimateHours: 12 }), { useRemaining: true })).toBe(1.5);
        expect(remainingEffort(t({ status: TaskStatus.InProgress, actualHours: 16 }), { calibrate: () => 2 })).toBe(2);
        expect(remainingEffort(t({ status: TaskStatus.InProgress }), { remainingFraction: 0.6 })).toBe(2.4);
        expect(remainingEffort(t({ status: TaskStatus.InProgress }), { remainingFraction: 0 })).toBe(1);
    });
});
