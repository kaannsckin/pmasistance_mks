import { describe, it, expect } from 'vitest';
import { planTaskVersions, planTaskVersionsDetailed } from './sprintPlanner';
import { Task, Resource, TaskStatus } from '../types';

const makeTask = (overrides: Partial<Task> & { id: string }): Task => ({
    name: `Görev ${overrides.id}`,
    availability: true,
    priority: 'Medium',
    version: 0,
    predecessor: null,
    unit: 'Yazılım',
    resourceName: 'Kaan',
    time: { best: 5, avg: 5, worst: 5 },
    jiraId: '',
    notes: '',
    status: TaskStatus.ToDo,
    includeInSprints: true,
    ...overrides,
});

const makeResource = (name: string, participation = 100): Resource => ({
    id: `res-${name}`,
    name,
    participation,
    unit: 'Yazılım',
    title: 'Uzman',
});

const resources = [makeResource('Kaan'), makeResource('Ayşe')];

// 3 haftalık sprint, 4 test günü → kapasite 11 gün/kaynak
const WEEKS = 3;
const TEST_DAYS = 4;
const CAPACITY = WEEKS * 5 - TEST_DAYS;

const versionOf = (tasks: Task[], id: string) => tasks.find(t => t.id === id)!.version;

describe('planTaskVersionsDetailed — bağımlılık doğruluğu', () => {
    it('ardıl görevi asla öncülünden önceki veya aynı sürüme atamaz', () => {
        // Eski algoritmanın bug senaryosu: yüksek öncelikli kısa ardıl, öncülünden
        // önce yerleştirilip Sürüm 1'e düşüyordu; öncül sonra Sürüm 2'ye gidiyordu.
        const tasks = [
            makeTask({ id: 'dolgu', time: { best: 9, avg: 9, worst: 9 }, priority: 'High' }),
            makeTask({ id: 'oncul', time: { best: 8, avg: 8, worst: 8 }, priority: 'Low' }),
            makeTask({ id: 'ardil', predecessor: 'oncul', time: { best: 2, avg: 2, worst: 2 }, priority: 'Blocker' }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);

        const predV = versionOf(planned, 'oncul');
        const succV = versionOf(planned, 'ardil');
        expect(predV).toBeGreaterThan(0);
        expect(succV).toBeGreaterThan(predV); // kesinlikle sonraki sürümde
    });

    it('zincir halinde bağımlılıklar sıralı sürümlere yerleşir', () => {
        const tasks = [
            makeTask({ id: 'a' }),
            makeTask({ id: 'b', predecessor: 'a' }),
            makeTask({ id: 'c', predecessor: 'b' }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'b')).toBeGreaterThan(versionOf(planned, 'a'));
        expect(versionOf(planned, 'c')).toBeGreaterThan(versionOf(planned, 'b'));
    });

    it('elle sabitlenmiş (plan dışı) bitmemiş öncülün sürümünden sonraya planlar', () => {
        const tasks = [
            makeTask({ id: 'sabit', includeInSprints: false, version: 3, status: TaskStatus.InProgress }),
            makeTask({ id: 'ardil', predecessor: 'sabit' }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'sabit')).toBe(3); // yerini korur
        expect(versionOf(planned, 'ardil')).toBeGreaterThanOrEqual(4);
    });

    it('tamamlanmış öncül ardılı kısıtlamaz', () => {
        const tasks = [
            makeTask({ id: 'bitti', status: TaskStatus.Done, version: 5 }),
            makeTask({ id: 'ardil', predecessor: 'bitti' }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'bitti')).toBe(5); // yerini korur
        expect(versionOf(planned, 'ardil')).toBe(1); // hemen başlayabilir
    });
});

describe('planTaskVersionsDetailed — döngü güvenliği', () => {
    it('öncül döngüsünde (A→B→A) çökmez, uyarı üretir ve iki görevi de planlar', () => {
        const tasks = [
            makeTask({ id: 'a', predecessor: 'b' }),
            makeTask({ id: 'b', predecessor: 'a' }),
        ];
        const { tasks: planned, warnings } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'a')).toBeGreaterThan(0);
        expect(versionOf(planned, 'b')).toBeGreaterThan(0);
        expect(warnings.some(w => w.type === 'cycle')).toBe(true);
    });

    it('kendini öncül gösteren görevde çökmez', () => {
        const tasks = [makeTask({ id: 'a', predecessor: 'a' })];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'a')).toBe(1);
    });
});

describe('planTaskVersionsDetailed — kapasite ve paketleme', () => {
    it('kaynak kapasitesini aşan görevleri sonraki sürüme kaydırır', () => {
        // Her biri 5 gün, kapasite 11 → ilk ikisi Sürüm 1 (10/11), üçüncüsü Sürüm 2
        const tasks = [
            makeTask({ id: 't1' }),
            makeTask({ id: 't2' }),
            makeTask({ id: 't3' }),
        ];
        const { tasks: planned, stats } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        const versions = ['t1', 't2', 't3'].map(id => versionOf(planned, id)).sort();
        expect(versions).toEqual([1, 1, 2]);
        expect(stats.sprintCount).toBe(2);
        expect(stats.plannedTaskCount).toBe(3);
    });

    it('testDays parametresi kapasiteyi etkiler (globalTestDays tutarlılığı)', () => {
        // testDays=10 → kapasite 5 gün → 5 günlük görevler ayrı sürümlere dağılır
        const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, 10);
        const versions = ['t1', 't2'].map(id => versionOf(planned, id)).sort();
        expect(versions).toEqual([1, 2]);
    });

    it('farklı kaynaklar aynı sürümü paylaşabilir', () => {
        const tasks = [
            makeTask({ id: 'k1', resourceName: 'Kaan', time: { best: 10, avg: 10, worst: 10 } }),
            makeTask({ id: 'a1', resourceName: 'Ayşe', time: { best: 10, avg: 10, worst: 10 } }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'k1')).toBe(1);
        expect(versionOf(planned, 'a1')).toBe(1);
    });

    it('katılım oranı süreyi uzatır', () => {
        // %50 katılım → 5 günlük iş 10 efektif gün; kapasite 11 → ikinci görev sığmaz
        const halfRes = [makeResource('Yarım', 50)];
        const tasks = [
            makeTask({ id: 't1', resourceName: 'Yarım' }),
            makeTask({ id: 't2', resourceName: 'Yarım' }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, halfRes, WEEKS, TEST_DAYS);
        const versions = ['t1', 't2'].map(id => versionOf(planned, id)).sort();
        expect(versions).toEqual([1, 2]);
    });

    it('sprint kapasitesinden büyük görevi Backlog yerine boş bir sürüme taşırarak yerleştirir ve uyarır', () => {
        const tasks = [makeTask({ id: 'dev', time: { best: 20, avg: 20, worst: 20 } })];
        const { tasks: planned, warnings } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'dev')).toBe(1); // eski algoritma 0'a (Backlog) atıyordu
        expect(warnings.some(w => w.type === 'oversized' && w.taskId === 'dev')).toBe(true);
    });

    it('geçersiz kapasitede (test günü ≥ sprint süresi) anlamlı hata fırlatır', () => {
        const tasks = [makeTask({ id: 't1' })];
        expect(() => planTaskVersionsDetailed(tasks, resources, 1, 5)).toThrow();
    });
});

describe('planTaskVersionsDetailed — önceliklendirme', () => {
    it('kapasite kısıtında Blocker görev Sürüm 1 önceliği alır', () => {
        const tasks = [
            makeTask({ id: 'dusuk1', priority: 'Low', time: { best: 6, avg: 6, worst: 6 } }),
            makeTask({ id: 'dusuk2', priority: 'Low', time: { best: 6, avg: 6, worst: 6 } }),
            makeTask({ id: 'kritik', priority: 'Blocker', time: { best: 6, avg: 6, worst: 6 } }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'kritik')).toBe(1);
    });

    it('eşit öncelikte yakın terminli görev erken sürüme yerleşir', () => {
        const tasks = [
            makeTask({ id: 'gec', dueDate: '2026-12-01', time: { best: 6, avg: 6, worst: 6 } }),
            makeTask({ id: 'acil', dueDate: '2026-01-15', time: { best: 6, avg: 6, worst: 6 } }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(versionOf(planned, 'acil')).toBe(1);
        expect(versionOf(planned, 'gec')).toBe(2);
    });

    it("Low öncelikli öncül, Blocker ardılın önceliğini miras alır", () => {
        const tasks = [
            makeTask({ id: 'rakip', priority: 'High', time: { best: 6, avg: 6, worst: 6 } }),
            makeTask({ id: 'oncul', priority: 'Low', time: { best: 6, avg: 6, worst: 6 } }),
            makeTask({ id: 'ardil', predecessor: 'oncul', priority: 'Blocker', time: { best: 2, avg: 2, worst: 2 } }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        // Öncül, Blocker zincirini tuttuğu için High'lı rakibinden önce gelmeli
        expect(versionOf(planned, 'oncul')).toBe(1);
        expect(versionOf(planned, 'rakip')).toBe(2);
    });
});

describe('planTaskVersionsDetailed — durum koruma', () => {
    it('tamamlanmış ve plan dışı görevlerin sürümü/durumu değişmez, sıra korunur', () => {
        const tasks = [
            makeTask({ id: 'bitti', status: TaskStatus.Done, version: 7 }),
            makeTask({ id: 'plandisi', includeInSprints: false, version: 4 }),
            makeTask({ id: 'normal' }),
        ];
        const { tasks: planned } = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS);
        expect(planned.map(t => t.id)).toEqual(['bitti', 'plandisi', 'normal']); // girdi sırası korunur
        expect(versionOf(planned, 'bitti')).toBe(7);
        expect(versionOf(planned, 'plandisi')).toBe(4);
        expect(versionOf(planned, 'normal')).toBe(1);
    });

    it('boş görev listesinde girdiyi aynen döndürür', () => {
        const { tasks: planned, stats } = planTaskVersionsDetailed([], resources, WEEKS, TEST_DAYS);
        expect(planned).toEqual([]);
        expect(stats.sprintCount).toBe(0);
    });
});

describe('planTaskVersions (geriye dönük uyumlu sarmalayıcı)', () => {
    it('detaylı sürümle aynı görev listesini döndürür', () => {
        const tasks = [
            makeTask({ id: 'a' }),
            makeTask({ id: 'b', predecessor: 'a' }),
        ];
        const wrapped = planTaskVersions(tasks, resources, WEEKS, TEST_DAYS);
        const detailed = planTaskVersionsDetailed(tasks, resources, WEEKS, TEST_DAYS).tasks;
        expect(wrapped).toEqual(detailed);
    });
});
