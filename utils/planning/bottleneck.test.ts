import { describe, expect, it } from 'vitest';
import { Resource, Task, TaskStatus } from '../../types';
import {
    applyPlanToSprints, applyReassignments, BottleneckSettings, DEFAULT_BOTTLENECK, defaultStartDate, milestoneRank, planBottleneck, settingsFromRules, testHoursFor,
} from './bottleneck';

const res = (name: string, unit: string, participation = 100): Resource => ({ id: name, name, unit, participation, title: '' });
let n = 0;
const task = (p: Partial<Task> & { days: number }): Task => ({
    id: p.id || `t${++n}`, name: p.name || `Görev ${n}`, availability: true, priority: p.priority || 'Medium', version: 0, predecessor: p.predecessor ?? null,
    unit: p.unit || 'EMS', resourceName: p.resourceName ?? 'Ali', time: { best: p.days, avg: p.days, worst: p.days }, jiraId: p.jiraId || '',
    notes: '', status: p.status || TaskStatus.ToDo, labels: p.labels,
});
// 30.11.2026 pazartesi; hedef 31.12 → H5 (28.12) hedef haftası, son sürüm H4 (25.12)
const settings = (over: Partial<BottleneckSettings> = {}): BottleneckSettings => ({
    ...DEFAULT_BOTTLENECK, startDate: '2026-11-30', targetDate: '2026-12-31', focus: 1, ...over,
});
const team = [res('Ali', 'EMS'), res('Ayşe', 'EMS'), res('Osman', 'EMS'), res('Test1', 'Destek')];

describe('yardımcılar', () => {
    it('test saati en yakın kademeye yuvarlanır', () => {
        expect(testHoursFor(1, 0.2, [2, 4, 6])).toBe(2);   // 1,6 saat
        expect(testHoursFor(2.5, 0.2, [2, 4, 6])).toBe(4); // 4 saat
        expect(testHoursFor(5, 0.2, [2, 4, 6])).toBe(6);   // 8 saat → üst kademe
        expect(testHoursFor(0, 0.2, [2, 4, 6])).toBe(0);
    });
    it('milestone sırası etiketteki sayıdan', () => {
        expect(milestoneRank(['GIB', 'Milestone-Gib-0'])).toBe(0);
        expect(milestoneRank(['MileStone-Gib-3'])).toBe(3);
        expect(milestoneRank(['aksiyon'])).toBe(99);
    });
    it('varsayılan başlangıç: cuma ise sonraki pazartesi', () => {
        expect(defaultStartDate(new Date(2026, 10, 27))).toBe('2026-11-30');
        expect(defaultStartDate(new Date(2026, 10, 25))).toBe('2026-11-25');
    });
});

describe('planBottleneck', () => {
    it('haftalar ve hedef: 1 Ocak tatili düşülür, son sürüm hedeften önceki hafta', () => {
        const r = planBottleneck({ project: { tasks: [], resources: team }, settings: settings(), scenario: 'current' });
        expect(r.targetWeek).toBe(4);
        expect(r.lastReleaseWeek).toBe(3);
        expect(r.weeks[4].workdays).toBe(4);
        expect(r.people.find(p => p.name === 'Ali')!.capacity[4]).toBe(4);
    });

    it('geliştirme → cuma sürüm → sonraki hafta test ve bulgu sorumlusu', () => {
        const t = task({ days: 3, resourceName: 'Ali' });
        const r = planBottleneck({ project: { tasks: [t], resources: team }, settings: settings({ fixers: { EMS: 'Osman' } }), scenario: 'current' });
        const p = r.tasks[0];
        expect(p.release).toBe(0);
        expect(p.testHours).toBe(4); // 3 gün × 8 × %20 = 4,8 → en yakın kademe 4
        expect(p.testWeek).toBe(1);
        expect(p.fixer).toBe('Osman');
        expect(p.fits).toBe(true);
        const tester = r.people.find(x => x.name === 'Test1')!;
        expect(tester.load.test[1]).toBeCloseTo(0.5);
        expect(r.people.find(x => x.name === 'Osman')!.load.fix[1]).toBeCloseTo(0.5);
        expect(r.people.find(x => x.name === 'Osman')!.role).toBe('fixer');
    });

    it('bulgu sorumlusu seçilmezse ekipte açık yükü en az olan kişi', () => {
        const tasks = [task({ days: 2, resourceName: 'Ali' }), task({ days: 1, resourceName: 'Ayşe' })];
        const r = planBottleneck({ project: { tasks, resources: team }, settings: settings(), scenario: 'current' });
        expect(r.fixers.EMS).toBe('Osman');
    });

    it('kişi aşırı yüklüyse taşma görünür; dengeli senaryo boştaki kişiye kaydırır', () => {
        const tasks = [1, 2, 3, 4, 5].map(() => task({ days: 5, resourceName: 'Ali' }));
        const current = planBottleneck({ project: { tasks, resources: team }, settings: settings({ fixers: { EMS: 'Osman' } }), scenario: 'current' });
        // 25 gün: 5+5+5+5 gün, H5 yalnız 4 iş günü → son parça H6
        expect(current.people.find(p => p.name === 'Ali')!.lastWeek).toBe(5);
        expect(current.tasks.filter(t => t.fits)).toHaveLength(4);
        const balanced = planBottleneck({ project: { tasks, resources: team }, settings: settings({ fixers: { EMS: 'Osman' } }), scenario: 'balanced' });
        expect(balanced.tasks.every(t => t.fits)).toBe(true);
        expect(balanced.reassignments.some(r => r.to[0] === 'Ayşe' && r.gainWeeks > 0)).toBe(true);
        // bulgu sorumlusuna geliştirme kaydırılmaz
        expect(balanced.reassignments.some(r => r.to.includes('Osman'))).toBe(false);
    });

    it('küçük iş bölünmez: her parça en az 1 gün', () => {
        // Üç geliştiricinin de son sürüm haftasında 0,4 gün boşluğu var: 1 günlük iş tek kişiye sığmaz,
        // ama üçe bölünse (0,33 g) sığardı. Parça 1 günün altına düşeceği için bölünmez.
        const devs = ['Ali', 'Ayşe', 'Can'];
        const tasks = [...devs.map(n => task({ days: 19.6, resourceName: n, status: TaskStatus.InProgress })), task({ id: 'small', days: 1, resourceName: 'Ali' })];
        const r = planBottleneck({ project: { tasks, resources: [...devs.map(n => res(n, 'EMS')), res('Osman', 'EMS'), res('Test1', 'Destek')] }, settings: settings({ fixers: { EMS: 'Osman' } }), scenario: 'balanced' });
        expect(r.tasks.find(t => t.taskId === 'small')!.people).toHaveLength(1);
    });

    it('devam eden iş dengeli senaryoda sahibinde kalır', () => {
        const tasks = [task({ days: 10, resourceName: 'Ali', status: TaskStatus.InProgress }), task({ days: 10, resourceName: 'Ali', status: TaskStatus.InProgress })];
        const r = planBottleneck({ project: { tasks, resources: team }, settings: settings(), scenario: 'balanced' });
        expect(r.reassignments).toHaveLength(0);
    });

    it('kapasite senaryosu hedefe yetişecek ek kişiyi hesaplar', () => {
        const tasks = Array.from({ length: 12 }, () => task({ days: 5, resourceName: 'Ali' }));
        const r = planBottleneck({ project: { tasks, resources: team }, settings: settings({ fixers: { EMS: 'Osman' } }), scenario: 'capacity' });
        expect(r.tasks.every(t => t.fits)).toBe(true);
        const dev = r.extra.find(e => e.unit === 'EMS' && e.role === 'dev');
        expect(dev?.count).toBeGreaterThan(0);
        expect(r.people.some(p => p.virtual)).toBe(true);
        // öneriler yalnız gerçek kişilere
        expect(r.reassignments.every(x => x.to.every(n => !n.startsWith('Ek ')))).toBe(true);
    });

    it('kapsam: yalnız seçilen milestone hedeflenir', () => {
        const tasks = [
            ...Array.from({ length: 3 }, () => task({ days: 4, resourceName: 'Ali', labels: ['Milestone-Gib-0'] })),
            ...Array.from({ length: 10 }, () => task({ days: 5, resourceName: 'Ali', labels: ['MileStone-Gib-3'] })),
        ];
        const r = planBottleneck({ project: { tasks, resources: team }, settings: settings({ scopeMilestone: 0 }), scenario: 'capacity' });
        expect(r.extra).toHaveLength(0);
        expect(r.tasks.slice(0, 3).every(t => t.fits)).toBe(true);
    });

    it('öncül: ardılı öncülün sürümünden sonraki hafta başlar', () => {
        const a = task({ id: 'a', days: 3, resourceName: 'Ali' });
        const b = task({ id: 'b', days: 1, resourceName: 'Ayşe', predecessor: 'a' });
        const r = planBottleneck({ project: { tasks: [b, a], resources: team }, settings: settings(), scenario: 'current' });
        expect(r.tasks.find(t => t.taskId === 'b')!.devStart).toBe(1);
    });

    it('eforu olmayan ve bitmiş görevler yük sayılmaz', () => {
        const tasks = [task({ days: 0 }), task({ days: 3, status: TaskStatus.Done })];
        const r = planBottleneck({ project: { tasks, resources: team }, settings: settings(), scenario: 'current' });
        expect(r.unestimated).toHaveLength(1);
        expect(r.tasks).toHaveLength(0);
    });

    it('test ekibinin kendi görevi test adımı doğurmaz', () => {
        const t = task({ days: 2, unit: 'Destek', resourceName: 'Test1' });
        const r = planBottleneck({ project: { tasks: [t], resources: team }, settings: settings(), scenario: 'current' });
        expect(r.tasks[0].testHours).toBe(0);
        expect(r.tasks[0].fits).toBe(true);
    });
});

describe('uygulama', () => {
    it('öneriler sorumluyu değiştirir; bölünecek işler atlanır', () => {
        const t1 = task({ id: 'x', days: 2 }), t2 = task({ id: 'y', days: 2 });
        const out = applyReassignments([t1, t2], [
            { taskId: 'x', from: 'Ali', to: ['Ayşe'], days: 2, gainWeeks: 1 },
            { taskId: 'y', from: 'Ali', to: ['Ayşe', 'Osman'], days: 2, gainWeeks: 1 },
        ], team);
        expect(out[0].resourceName).toBe('Ayşe');
        expect(out[1]).toBe(t2);
    });

    it('plan sprintlere yazılır: başlangıç haftasının sprinti ve süreklilik', () => {
        const t = task({ id: 'z', days: 8, resourceName: 'Ali' });
        const r = planBottleneck({ project: { tasks: [t], resources: team }, settings: settings(), scenario: 'current' });
        const sprintOf = (d: Date) => Math.floor((d.getTime() - new Date(2026, 10, 30).getTime()) / (7 * 86_400_000)) + 1;
        const { tasks, changed } = applyPlanToSprints([t], r, sprintOf);
        expect(changed).toBe(1);
        expect(tasks[0].version).toBe(1);
        expect(tasks[0].sprintSpan).toBe(2);
    });
});

describe('fazla mesai ve proje kuralları', () => {
    it('kişi %100 üstüne çıkabilir; aşan kısım mesai olarak görünür', () => {
        const tasks = [task({ days: 6, resourceName: 'Ali' })];
        const normal = planBottleneck({ project: { tasks, resources: team }, settings: settings(), scenario: 'current' });
        expect(normal.tasks[0].release).toBe(1);
        const ot = planBottleneck({ project: { tasks, resources: team }, settings: settings({ personMaxLoad: { Ali: 120 } }), scenario: 'current' });
        const ali = ot.people.find(p => p.name === 'Ali')!;
        expect(ot.tasks[0].release).toBe(0);
        expect(ali.maxLoad).toBeCloseTo(1.2);
        expect(ali.overtime).toBeCloseTo(1);
        expect(ali.capacity[0]).toBe(5); // normal kapasite değişmez
        expect(ot.people.find(p => p.name === 'Ayşe')!.maxLoad).toBe(1);
    });

    it('genel üst sınır herkese uygulanır', () => {
        const r = planBottleneck({ project: { tasks: [task({ days: 6, resourceName: 'Ayşe' })], resources: team }, settings: settings({ maxLoad: 130 }), scenario: 'current' });
        expect(r.tasks[0].release).toBe(0);
    });

    it('proje kurallarından ayar: eksikler varsayılan', () => {
        const s = settingsFromRules({ targetDate: '2026-12-31', maxLoad: 120, fixers: { EMS: 'Osman' } }, { useJiraRemainingEstimate: true }, {}, new Date(2026, 10, 27));
        expect(s.startDate).toBe('2026-11-30');
        expect(s.targetDate).toBe('2026-12-31');
        expect(s.testUnit).toBe('Destek');
        expect(s.testRatio).toBe(0.2);
        expect(s.maxLoad).toBe(120);
        expect(s.useRemaining).toBe(true);
        expect(settingsFromRules(undefined, {}, {}, new Date(2026, 10, 27)).targetDate).toBe('2026-12-31');
    });
});
