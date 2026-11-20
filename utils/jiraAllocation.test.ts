import { describe, expect, it } from 'vitest';
import { Person, Task, TaskStatus, WorklogEntry } from '../types';
import { suggestAllocationsFromJira, worklogsToBilled, yearRange } from './jiraAllocation';
import { allocationEditBlock } from './rbac';
import { createProject } from './workspace';

const task = (id: string, extra: Partial<Task>): Task => ({
    id, name: id, jiraId: `MPS-${id}`, status: TaskStatus.ToDo, availability: true, priority: 'Medium', version: 0, predecessor: null,
    unit: 'EMS', resourceName: 'Ayşe Yılmaz', time: { best: 10, avg: 10, worst: 10 }, notes: '', ...extra,
});
const people: Person[] = [{ id: 'p-ayse', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] }];

describe('Jira → tahsis', () => {
    it('plan: kalan efor bugünden termine iş günlerine yayılır; atanmamış ve kapalı kayıtlar sayılmaz', () => {
        const project = { tasks: [
            task('1', { dueDate: '2026-12-31', actualHours: 16 }), // kalan 8 gün, 23.11–31.12
            task('2', { resourceName: 'Atanmamış' }),
            task('3', { status: TaskStatus.Done }),
            task('4', { resourceName: 'Mehmet Kaya', time: { best: 3, avg: 3, worst: 3 } }), // termin yok → 3 iş günü
        ] };
        const r = suggestAllocationsFromJira(project, people, 2026, new Date(2026, 10, 23)); // 23 Kasım 2026 Pazartesi
        expect(r.taskCount).toBe(2);
        expect(r.skipped).toBe(1);
        const ayse = r.suggestions.find(s => s.personId === 'p-ayse')!;
        // 23–30 Kasım: 6 iş günü, Aralık: 23 iş günü → 8 gün × 6/29 ve × 23/29
        expect(ayse.months[11]).toBeCloseTo(Math.round((8 * 6 / 29) / 21 * 100) / 100, 2);
        expect(ayse.months[12]).toBeCloseTo(Math.round((8 * 23 / 29) / 21 * 100) / 100, 2);
        expect(r.unmatched).toEqual(['Mehmet Kaya']);
        expect(r.suggestions.find(s => s.resourceName === 'Mehmet Kaya')!.months).toEqual({ 11: 0.14 });
    });

    it('termini geçmiş iş bugüne yazılır ve bildirilir; yıl dışı pay kırpılır', () => {
        const r = suggestAllocationsFromJira({ tasks: [task('1', { dueDate: '2026-11-01', time: { best: 2, avg: 2, worst: 2 } }), task('2', { dueDate: '2027-02-26' })] }, people, 2026, new Date(2026, 10, 23));
        expect(r.overdue).toBe(1);
        expect(r.clippedOutsideYear).toBe(true);
    });

    it('gerçekleşen: yalnız bu projenin Jira kayıtlarına yazılan worklog\'lar kişi × ay saate toplanır', () => {
        const project = { name: 'GİB', tasks: [task('1', {}), task('2', {})] };
        const w = (date: string, author: string, issueKey: string, hours: number): WorklogEntry => ({ date, author, issueKey, hours, summary: '', source: 'jira' });
        const r = worklogsToBilled([
            w('2026-11-03', 'Ayşe Yılmaz', 'MPS-1', 6), w('2026-11-04', 'Ayşe Yılmaz', 'MPS-2', 2), w('2026-10-30', 'Ayşe Yılmaz', 'MPS-1', 4),
            w('2026-11-05', 'Ayşe Yılmaz', 'MPS-999', 8), // başka işin kaydı
            w('2025-12-30', 'Ayşe Yılmaz', 'MPS-1', 8), // başka yıl
        ], project, 2026);
        expect(r.records).toEqual([
            { projectName: 'GİB', personName: 'Ayşe Yılmaz', month: 11, hours: 8 },
            { projectName: 'GİB', personName: 'Ayşe Yılmaz', month: 10, hours: 4 },
        ]);
        expect(r.skipped).toBe(1);
        expect(yearRange(2026, new Date(2026, 10, 19))).toEqual({ from: '2026-01-01', to: '2026-11-19' });
    });
});

describe('tahsis neden düzenlenemiyor', () => {
    const pm: Person = { id: 'p-mks', firstName: 'MKS', lastName: '', departmentCode: 'U310', availableAA: 1, roles: [] };
    const me: Person = { id: 'p-ben', firstName: 'Murat', lastName: 'S', departmentCode: 'U310', availableAA: 1, roles: [] };
    const project = { ...createProject('GİB'), id: 'gib', pmPersonId: 'p-mks' };
    const ws = { people: [pm, me], projects: [project], allocations: [] };

    it('başka kişi olarak PY: projenin PY\'si söylenir', () => {
        expect(allocationEditBlock(ws, { role: 'py', personId: 'p-ben' }, [], 'gib', null, 2026, 'plan')).toMatch(/PY'si MKS; siz Murat S/);
        expect(allocationEditBlock(ws, { role: 'py' }, [], 'gib', null, 2026, 'plan')).toMatch(/kişiyi\) seçin/);
    });

    it('sahip PY: kilit durumuna göre plan engellenir, gerçekleşen açık kalır', () => {
        const id = { role: 'py' as const, personId: 'p-mks' };
        expect(allocationEditBlock(ws, id, [], 'gib', null, 2026, 'plan')).toBeNull();
        const locks = [{ projectId: 'gib', year: 2026, status: 'locked' as const }];
        expect(allocationEditBlock(ws, id, locks as never, 'gib', null, 2026, 'plan')).toMatch(/kilitlendi/);
        expect(allocationEditBlock(ws, id, locks as never, 'gib', null, 2026, 'actual')).toBeNull();
    });
});
