import { describe, it, expect } from 'vitest';
import { applyAllocationSuggestions, suggestAllocationsFromTasks } from './taskToAllocation';
import { createEmptyWorkspace, createProject } from './workspace';
import { Person, Project, Task, TaskStatus, WorkspaceData } from '../types';

const task = (id: string, version: number, resourceName: string, days: number): Task => ({
    id, name: `Görev ${id}`, availability: true, priority: 'Medium', version,
    predecessor: null, unit: 'Yazılım', resourceName,
    time: { best: days, avg: days, worst: days }, // PERT = days
    jiraId: '', notes: '', status: TaskStatus.ToDo, includeInSprints: true,
});

const person = (id: string, first: string, last: string): Person => ({
    id, firstName: first, lastName: last, departmentCode: 'U310', availableAA: 1, roles: [],
});

// 2026-01-05 Pazartesi; 3 haftalık sprint (15 iş günü), 4 test günü
const buildProject = (): Project => {
    const p = createProject('Köprü Testi');
    p.settings.projectStartDate = '2026-01-05';
    p.settings.sprintDuration = 3;
    p.settings.globalTestDays = 4;
    p.resources = [
        { id: 'r1', name: 'Kaan Test', participation: 100, unit: 'Yazılım', title: 'Uzman' },
        { id: 'r2', name: 'Ayşe Demir', participation: 50, unit: 'Yazılım', title: 'Uzman' },
    ];
    return p;
};

describe('suggestAllocationsFromTasks', () => {
    it('sprint 1 görevini takvimdeki aya AA olarak yayar (21 gün = 1 AA)', () => {
        const p = buildProject();
        p.tasks = [task('t1', 1, 'Kaan Test', 10.5)]; // 10.5 gün → 0.5 AA
        const r = suggestAllocationsFromTasks(p, [person('p1', 'Kaan', 'Test')], 2026);
        expect(r.suggestions).toHaveLength(1);
        const s = r.suggestions[0];
        expect(s.matched).toBe(true);
        expect(s.personId).toBe('p1');
        // Sprint 1: 5-23 Ocak, tamamı Ocak içinde → tüm efor Ocak'a
        expect(s.months[1]).toBeCloseTo(0.5, 2);
        expect(Object.keys(s.months)).toHaveLength(1);
        expect(r.sprintCount).toBe(1);
    });

    it('ay sınırını aşan sprintte eforu iş günü oranıyla böler', () => {
        const p = buildProject();
        // Sprint 1: 5-23 Oca; test 26-29 Oca; Sprint 2: 30 Oca - 19 Şub (1 iş günü Ocak, 14 iş günü Şubat)
        p.tasks = [task('t2', 2, 'Kaan Test', 15)];
        const r = suggestAllocationsFromTasks(p, [person('p1', 'Kaan', 'Test')], 2026);
        const s = r.suggestions[0];
        const jan = s.months[1] || 0;
        const feb = s.months[2] || 0;
        expect(jan + feb).toBeCloseTo(15 / 21, 1); // toplam ≈ 0.71 AA
        expect(feb).toBeGreaterThan(jan); // ağırlık Şubat'ta
        expect(jan).toBeCloseTo((15 / 15) * (1 / 21), 2); // 1/15 pay × 15 gün = 1 gün ≈ 0.05 AA
    });

    it('katılım oranı efektif süreyi artırır; havuzda eşleşmeyen kaynak uyarıya düşer', () => {
        const p = buildProject();
        p.tasks = [
            task('t3', 1, 'Ayşe Demir', 5), // %50 katılım → 10 efektif gün
            task('t4', 1, 'Bilinmeyen Kişi', 5),
        ];
        const r = suggestAllocationsFromTasks(p, [person('p2', 'Ayşe', 'Demir')], 2026);
        const ayse = r.suggestions.find(s => s.personLabel === 'Ayşe Demir')!;
        expect(ayse.months[1]).toBeCloseTo(10 / 21, 2);
        expect(r.unmatched).toEqual(['Bilinmeyen Kişi']);
        const unknown = r.suggestions.find(s => !s.matched)!;
        expect(unknown.resourceName).toBe('Bilinmeyen Kişi');
    });

    it('hedef yıl dışına taşan eforu kırpar ve işaretler', () => {
        const p = buildProject();
        p.settings.projectStartDate = '2026-12-21'; // geç Aralık başlangıcı → sprint Ocak 2027'ye taşar
        p.tasks = [task('t5', 1, 'Kaan Test', 15)];
        const r = suggestAllocationsFromTasks(p, [person('p1', 'Kaan', 'Test')], 2026);
        expect(r.clippedOutsideYear).toBe(true);
        const s = r.suggestions[0];
        expect(s.months[12]).toBeGreaterThan(0);
        expect(s.totalAA).toBeLessThan(15 / 21); // bir kısmı 2027'ye kırpıldı
    });

    it('Backlog (version 0) ve plan dışı görevleri saymaz', () => {
        const p = buildProject();
        p.tasks = [
            task('t6', 0, 'Kaan Test', 10),
            { ...task('t7', 1, 'Kaan Test', 10), includeInSprints: false },
        ];
        const r = suggestAllocationsFromTasks(p, [person('p1', 'Kaan', 'Test')], 2026);
        expect(r.suggestions).toHaveLength(0);
    });
});

describe('applyAllocationSuggestions', () => {
    const setup = () => {
        const p = buildProject();
        const ws: WorkspaceData = {
            ...createEmptyWorkspace(),
            projects: [p],
            people: [person('p1', 'Kaan', 'Test')],
            allocations: [
                { id: 'a1', personId: 'p1', projectId: p.id, year: 2026, plan: { 1: 0.3 }, actual: {} },
            ],
        };
        return { p, ws };
    };
    const suggestion = (projectDummy: Project) => [{
        resourceName: 'Kaan Test', personId: 'p1', personLabel: 'Kaan Test',
        months: { 1: 0.5, 2: 0.4 }, totalAA: 0.9, matched: true,
    }];

    it('fill modu dolu ayı korur, boş ayı doldurur', () => {
        const { p, ws } = setup();
        const { workspace, applied, skippedCells } = applyAllocationSuggestions(ws, p.id, 2026, suggestion(p), 'fill');
        const row = workspace.allocations[0];
        expect(row.plan[1]).toBe(0.3); // korundu
        expect(row.plan[2]).toBe(0.4); // dolduruldu
        expect(applied).toBe(1);
        expect(skippedCells).toBe(1);
        expect(ws.allocations[0].plan[2]).toBeUndefined(); // orijinal değişmedi
    });

    it('overwrite modu öneri olan ayları değiştirir', () => {
        const { p, ws } = setup();
        const { workspace } = applyAllocationSuggestions(ws, p.id, 2026, suggestion(p), 'overwrite');
        const row = workspace.allocations[0];
        expect(row.plan[1]).toBe(0.5);
        expect(row.plan[2]).toBe(0.4);
    });

    it('satır yoksa köprü satırı oluşturur; eşleşmeyen öneri uygulanmaz', () => {
        const { p, ws } = setup();
        ws.allocations = [];
        const sugs = [
            ...suggestion(p),
            { resourceName: 'Yabancı', personId: undefined, personLabel: 'Yabancı', months: { 1: 1 }, totalAA: 1, matched: false },
        ];
        const { workspace, applied } = applyAllocationSuggestions(ws, p.id, 2026, sugs, 'fill');
        expect(applied).toBe(1);
        expect(workspace.allocations).toHaveLength(1);
        expect(workspace.allocations[0].personId).toBe('p1');
        expect(workspace.allocations[0].workPackageId).toBeUndefined();
    });
});
