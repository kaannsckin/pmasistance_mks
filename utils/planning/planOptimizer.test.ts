import { describe, expect, it } from 'vitest';
import { Project, ReleasePlan, Task, TaskStatus } from '../../types';
import { createProject } from '../workspace';
import { applyPlanChanges, optimizePlan, OptimizeOptions, rescueScenarios, withoutFromMilestone } from './planOptimizer';

// Haftalık sprint, test sprint içinde. Sprint 1: 23–27 Kas, Sprint 2: 30 Kas–4 Ara, Sprint 3: 7–11 Ara …
const MONDAY = new Date(2026, 10, 30, 9); // Sprint 2'nin ilk günü (tam kapasite)
const WEDNESDAY = new Date(2026, 11, 2, 9); // Sprint 2'nin 3. günü (3 gün kaldı)

const task = (id: string, days: number, extra: Partial<Task> = {}): Task => ({
    id, name: `İş ${id}`, availability: true, priority: 'Medium', version: 0, predecessor: null, unit: 'U310',
    resourceName: 'Ayşe Kaya', time: { best: days, avg: days, worst: days }, jiraId: `ATL-${id}`, notes: '', status: TaskStatus.ToDo, ...extra,
});

const project = (tasks: Task[]): Project => {
    const p = createProject('ATLAS');
    p.settings = { ...p.settings, projectStartDate: '2026-11-23', sprintDuration: 1, globalTestDays: 0 };
    p.resources = [
        { id: 'r1', name: 'Ayşe Kaya', participation: 100, unit: 'U310', title: 'Uzman' },
        { id: 'r2', name: 'Can Er', participation: 100, unit: 'U310', title: 'Uzman' },
        { id: 'r3', name: 'Elif Su', participation: 100, unit: 'U320', title: 'Uzman' },
    ];
    p.tasks = tasks;
    return p;
};

const plan = (taskIds: string[], milestones: { id: string; name: string; targetDate?: string; tasks: string[] }[] = []): ReleasePlan => ({
    id: 'rp', name: 'Sürüm 1', summary: '', mode: 'manual', testDays: 0, workPackageIds: [], step: 1, status: 'draft',
    createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z',
    items: taskIds.map(id => ({ id: `i-${id}`, name: `İş ${id}`, sourceTaskId: id })),
    milestones: milestones.map(m => ({ id: m.id, name: m.name, targetDate: m.targetDate, itemIds: m.tasks.map(t => `i-${t}`) })),
});

/** Saf sezgisel (tampon yok, bölme yok, kişi değişikliği yok, baştan) — kuralları tek tek sınamak için */
const PLAIN: Partial<OptimizeOptions> = { mode: 'fresh', targetLoad: 1, split: false, reassign: false, useRemaining: false, now: MONDAY };
const sprintOf = (r: ReturnType<typeof optimizePlan>) => Object.fromEntries(r.project.tasks.map(t => [t.id, t.version]));

describe('plan optimizasyonu: temel kurallar', () => {
    it('taş sırası, öncül (bir sonraki sprint), kişi kapasitesi; sürüm dışı yük önceden düşülür', () => {
        const p = project([
            task('a', 3), task('b', 3, { predecessor: 'a' }), task('c', 2, { priority: 'High' }),
            task('x', 2, { version: 2 }), // sürüm dışı: Ayşe'nin Sprint 2'sinden 2 gün
            task('d', 1, { resourceName: 'Can Er' }),
        ]);
        const pl = plan(['a', 'b', 'c', 'd'], [
            { id: 'm1', name: 'MS1', targetDate: '2026-12-11', tasks: ['a', 'b'] },
            { id: 'm2', name: 'MS2', targetDate: '2026-12-31', tasks: ['c'] },
        ]);
        const r = optimizePlan(p, pl, PLAIN);
        expect(sprintOf(r)).toMatchObject({ a: 2, b: 3, c: 3, d: 2, x: 2 });
        expect(r.after).toMatchObject({ lateMilestones: 0, overloads: 0, unplanned: 0, endDate: '2026-12-11' });
        expect(r.before.unplanned).toBe(4);
        expect(r.changes.find(c => c.taskId === 'b')?.reason).toBe('planlanmamıştı');
        expect(r.project.tasks.find(t => t.id === 'x')).toBe(p.tasks.find(t => t.id === 'x'));
    });

    it('sürmekte olan sprintte yalnız kalan günler sayılır (Çarşamba: 3 gün)', () => {
        const p = project([task('a', 3), task('x', 2, { version: 2 })]);
        expect(sprintOf(optimizePlan(p, plan(['a']), PLAIN)).a).toBe(2);
        expect(sprintOf(optimizePlan(p, plan(['a']), { ...PLAIN, now: WEDNESDAY })).a).toBe(3);
    });

    it('hedef doluluk tampon bırakır (%80 → kişi başı 4 gün)', () => {
        const p = project([task('a', 2.5), task('b', 2.5)]);
        expect(sprintOf(optimizePlan(p, plan(['a', 'b']), PLAIN))).toMatchObject({ a: 2, b: 2 });
        expect(sprintOf(optimizePlan(p, plan(['a', 'b']), { ...PLAIN, targetLoad: 0.8 }))).toMatchObject({ a: 2, b: 3 });
    });

    it('izin ve resmi tatil: Aralık\'ı izinli geçiren kişinin işi Ocak\'a kalır', () => {
        const p = project([task('a', 3)]);
        const people = [{ id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] }];
        const r = optimizePlan(p, plan(['a']), { ...PLAIN, people, leaves: [{ id: 'l', personId: 'p1', year: 2026, month: 12, aa: 1 }] });
        // 28 Ara–1 Oca haftası: Aralık günleri izin, 1 Ocak tatil → kapasite 0; ilk uygun hafta 4–8 Ocak = Sprint 7
        expect(sprintOf(r).a).toBe(7);
    });

    it('kritik zincir önce: uzun ardıl zinciri olan iş öne alınır, sürüm bir sprint erken biter', () => {
        // Ayşe: q (3) ve p (3); Can: s (3, öncül p). Sıra q,p olsaydı s Sprint 4'e kalırdı.
        const p = project([task('q', 3), task('p', 3), task('s', 3, { predecessor: 'p', resourceName: 'Can Er' })]);
        const r = optimizePlan(p, plan(['q', 'p', 's']), PLAIN);
        expect(sprintOf(r)).toMatchObject({ p: 2, q: 3, s: 3 });
    });
});

describe('plan optimizasyonu: seçenekler', () => {
    it('kararlı kip: uygun yerleşim korunur; baştan kipte öne çekilir', () => {
        const p = project([task('a', 2, { version: 4 })]);
        expect(optimizePlan(p, plan(['a']), { ...PLAIN, mode: 'stable' }).changes).toEqual([]);
        expect(optimizePlan(p, plan(['a']), PLAIN).changes).toEqual([expect.objectContaining({ taskId: 'a', from: 4, to: 2, reason: 'boşalan kapasiteye öne alındı' })]);
    });

    it('büyük iş: bölme açıksa ardışık sprintlere yayılır, kapalıysa taşma uyarısı', () => {
        const p = project([task('big', 8)]);
        const split = optimizePlan(p, plan(['big']), { ...PLAIN, split: true });
        expect(split.changes[0]).toMatchObject({ to: 2, fromSpan: 1, toSpan: 2 });
        expect(split.changes[0].reason).toMatch(/2 sprinte bölündü/);
        expect(applyPlanChanges(p, split.changes).tasks[0].sprintSpan).toBe(2);
        const noSplit = optimizePlan(p, plan(['big']), PLAIN);
        expect(noSplit.warnings.map(w => w.kind)).toContain('oversized');
    });

    it('kişi değişikliği: yalnız aynı birimde ve en az bir sprint kazandırırsa; atanmamışa kişi önerir', () => {
        const busy = project([task('t', 3), task('y', 5, { version: 2 }), task('z', 5, { version: 3 })]); // Ayşe 2 sprint dolu
        const r = optimizePlan(busy, plan(['t']), { ...PLAIN, reassign: true });
        expect(r.changes).toEqual([expect.objectContaining({ taskId: 't', to: 2, fromResource: 'Ayşe Kaya', toResource: 'Can Er', reason: 'kişi değişikliği: 2 sprint erken' })]);
        // U320'deki Elif boş olsa da önerilmez; Ayşe boşsa kişi değişmez
        expect(optimizePlan(project([task('t', 3)]), plan(['t']), { ...PLAIN, reassign: true }).changes[0].toResource).toBeUndefined();
        // Can da doluyken tek boş kişi başka birimdeki Elif: yine de Elif'e verilmez, Ayşe'de Sprint 4'e kalır
        const allBusy = project([task('t', 3), task('y', 5, { version: 2 }), task('z', 5, { version: 3 }),
            task('cy', 5, { version: 2, resourceName: 'Can Er' }), task('cz', 5, { version: 3, resourceName: 'Can Er' })]);
        expect(optimizePlan(allBusy, plan(['t']), { ...PLAIN, reassign: true }).changes[0]).toMatchObject({ to: 4 });
        expect(optimizePlan(allBusy, plan(['t']), { ...PLAIN, reassign: true }).changes[0].toResource).toBeUndefined();
        // Ayşe'nin 1 günlük işi var ama t yine Sprint 2'ye sığıyor: Can daha boş olsa da el değiştirmez
        const light = project([task('t', 3), task('k', 1, { version: 2 })]);
        expect(optimizePlan(light, plan(['t']), { ...PLAIN, reassign: true }).changes[0]).toMatchObject({ to: 2 });
        expect(optimizePlan(light, plan(['t']), { ...PLAIN, reassign: true }).changes[0].toResource).toBeUndefined();
        const un = project([task('u', 2, { resourceName: '' })]);
        expect(optimizePlan(un, plan(['u']), PLAIN).warnings.map(w => w.kind)).toContain('unassigned');
        expect(optimizePlan(un, plan(['u']), { ...PLAIN, reassign: true }).changes[0]).toMatchObject({ toResource: 'Ayşe Kaya', reason: 'kişi önerildi' });
        expect(applyPlanChanges(busy, r.changes).tasks[0]).toMatchObject({ resourceName: 'Can Er', unit: 'U310' });
    });

    it('devam eden iş yerinde kalır; yükü Jira kalan süresiyle sayılır', () => {
        const p = project([task('w', 5, { version: 2, status: TaskStatus.InProgress, remainingEstimateHours: 8 }), task('a', 4)]);
        const r = optimizePlan(p, plan(['w', 'a']), { ...PLAIN, useRemaining: true });
        expect(sprintOf(r)).toMatchObject({ w: 2, a: 2 }); // w'den 1 gün kaldı → a sığar
        expect(sprintOf(optimizePlan(p, plan(['w', 'a']), PLAIN)).a).toBe(3); // kalan bilinmiyorsa tam
    });

    it('geçmiş sapma düzeltmesi başlamamış işi büyütür', () => {
        const p = project([task('a', 3), task('b', 2)]);
        expect(sprintOf(optimizePlan(p, plan(['a', 'b']), PLAIN))).toMatchObject({ a: 2, b: 2 });
        expect(sprintOf(optimizePlan(p, plan(['a', 'b']), { ...PLAIN, calibrate: () => 1.5 }))).toMatchObject({ a: 2, b: 3 });
    });

    it('biten sprintte kalan sürüm işi devredilir; sürüm dışı eski işler uyarılır', () => {
        const p = project([task('old', 2, { version: 1 }), task('junk', 3, { version: 1, resourceName: 'Can Er' })]);
        const r = optimizePlan(p, plan(['old']), PLAIN);
        expect(r.changes[0]).toMatchObject({ from: 1, to: 2, reason: 'devir: biten sprintte kalmıştı' });
        expect(r.warnings.map(w => w.kind)).toContain('stale-outside');
    });
});

describe('kurtarma senaryoları', () => {
    // MS1 hedefi 4 Ara (Sprint 2). Ayşe'de 3 iş (3+3+2 gün) → 2 sprint sürer: 1 hafta geç. Can boş.
    const p = project([task('a', 3), task('b', 3, { priority: 'Low' }), task('c', 2, { priority: 'High' })]);
    const pl = plan(['a', 'b', 'c'], [{ id: 'm1', name: 'MS1', targetDate: '2026-12-04', tasks: ['a', 'b', 'c'] }]);

    it('gecikmede işe yarayan seçenekleri hesaplar: kişi değişikliği, kapsam daraltma, yeni hedef', () => {
        const base = optimizePlan(p, pl, { ...PLAIN });
        expect(base.after).toMatchObject({ lateMilestones: 1, latenessDays: 7 });
        const sc = rescueScenarios(p, pl, base);
        const ids = sc.map(s => s.id);
        expect(ids).toContain('reassign');
        expect(sc.find(s => s.id === 'reassign')!.result.after.lateMilestones).toBe(0);
        const descope = sc.find(s => s.id === 'descope-m1')!;
        expect(descope.descope).toEqual({ milestoneId: 'm1', taskIds: ['b'] }); // en düşük öncelikli
        expect(descope.result.after.milestones[0].status).toBe('ok');
        expect(sc.find(s => s.id === 'retarget-m1')!.retarget).toEqual({ milestoneId: 'm1', date: '2026-12-11' });
        // Tampon %100 zaten: "tamponsuz" senaryosu önerilmez; işe yaramayan "bölme" de çıkmaz
        expect(ids).not.toContain('full');
        expect(ids).not.toContain('split');
    });

    it('gecikme yoksa senaryo yok; taştan çıkarma planı bozmaz', () => {
        expect(rescueScenarios(p, plan(['a']), optimizePlan(p, plan(['a']), PLAIN))).toEqual([]);
        const reduced = withoutFromMilestone(pl, 'm1', ['b']);
        expect(reduced.milestones[0].itemIds).toEqual(['i-a', 'i-c']);
        expect(reduced.items).toHaveLength(3);
    });
});

describe('hız kontrolü', () => {
    it('plan geçmiş hızın belirgin üstündeyse uyarır ve hedef doluluk önerir', () => {
        const DEC7 = new Date(2026, 11, 7, 9); // Sprint 3; Sprint 1-2 bitti
        const p = project([
            task('d1', 2, { version: 1, status: TaskStatus.Done }), task('d2', 2, { version: 2, status: TaskStatus.Done }),
            task('a', 3),
        ]);
        const r = optimizePlan(p, plan(['a']), { ...PLAIN, now: DEC7, targetLoad: 0.85 });
        expect(r.velocity).toMatchObject({ perSprint: 2, sprints: 2, teamCapacity: 15, planned: 12.8, recommendedLoad: 0.3 });
        expect(r.warnings[0].kind).toBe('velocity');
        // Hız yeterliyse uyarı yok
        const fast = project([
            task('d1', 12, { version: 1, status: TaskStatus.Done }), task('d2', 12, { version: 2, status: TaskStatus.Done }), task('a', 3),
        ]);
        const ok = optimizePlan(fast, plan(['a']), { ...PLAIN, now: DEC7, targetLoad: 0.85 });
        expect(ok.velocity?.recommendedLoad).toBeUndefined();
        expect(ok.warnings.map(w => w.kind)).not.toContain('velocity');
    });
});
