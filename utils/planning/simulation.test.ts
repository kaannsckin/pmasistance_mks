import { describe, expect, it } from 'vitest';
import { Project, Resource, Task, TaskStatus } from '../../types';
import { createProject } from '../workspace';
import { buildHistory, calibrator, weeklyThroughput } from './history';
import { finishOn, probabilityBy, runMonteCarlo, SimInput, SimTask, simulateThroughput } from './monteCarlo';
import { runSimulationAsync } from './runSimulation';
import { betaPert, mulberry32, quantile, weightedQuantile } from './random';
import { estimateFromHistory } from './referenceClass';
import { buildSimulation, dateAtOffset, offsetOf } from './simulationInput';
import { sprintFit } from './sprintFit';

const NOW = new Date('2026-10-07T10:00:00'); // Çarşamba

const task = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `${id} kaydı`, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: 'Yazılım', resourceName: '',
    time: { best: 2, avg: 3, worst: 6 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});
const res = (name: string, extra: Partial<Resource> = {}): Resource => ({ id: name, name, participation: 100, unit: 'Yazılım', title: 'Uzman', ...extra });

/** Kapanmış geçmiş kayıt: başlama ve kapanış (iş günü sayısı `days`) */
const closed = (id: string, days: number, extra: Partial<Task> = {}): Task => {
    const start = new Date('2026-03-02T09:00:00'); // Pazartesi
    // days iş günü sonra kapanış (hafta sonlarını atla)
    const end = new Date(start);
    let left = days - 1;
    while (left > 0) { end.setDate(end.getDate() + 1); if (end.getDay() !== 0 && end.getDay() !== 6) left--; }
    return task(id, { status: TaskStatus.Done, startedAt: start.toISOString(), createdAt: start.toISOString(), resolvedAt: end.toISOString(), issueType: 'bug', ...extra });
};

const lane = (rate = 1, H = 400) => ({ rate: new Array(H).fill(rate), base: rate });
const simTask = (id: string, value: number, extra: Partial<SimTask> = {}): SimTask => ({ id, dist: { kind: 'fixed', value }, lane: 0, pred: -1, ...extra });
const input = (tasks: SimTask[], extra: Partial<SimInput> = {}): SimInput => ({
    tasks, lanes: [lane()], pools: [], order: tasks.map((_, i) => i), testDays: 0, iterations: 200, seed: 7, ...extra,
});

describe('rastgele sayı ve dağılımlar', () => {
    it('tohumlu üreteç aynı diziyi verir', () => {
        const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
        const xs = [a(), a(), a()];
        expect([b(), b(), b()]).toEqual(xs);
        expect(c()).not.toBe(xs[0]);
        expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
    });

    it('beta-PERT sınırlar içinde ve ortalaması (a + 4m + b) / 6', () => {
        const rng = mulberry32(1);
        const xs = Array.from({ length: 20000 }, () => betaPert(2, 4, 12, rng));
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...xs)).toBeLessThanOrEqual(12);
        const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
        expect(mean).toBeCloseTo((2 + 16 + 12) / 6, 1);
        expect(betaPert(5, 5, 5, rng)).toBe(5);
    });

    it('yüzdelikler', () => {
        expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
        expect(quantile([1, 2, 3, 4, 5], 0.8)).toBeCloseTo(4.2);
        expect(weightedQuantile([{ value: 1, weight: 1 }, { value: 10, weight: 9 }], 0.5)).toBe(10);
    });
});

describe('Monte Carlo motoru', () => {
    it('kapasite: %50 katılım süreyi iki katına çıkarır; kapasitesiz günler atlanır', () => {
        const half = { cum: (() => { const c = new Float64Array(401); for (let k = 0; k < 400; k++) c[k + 1] = c[k] + 0.5; return c; })(), rate: new Array(400).fill(0.5), base: 0.5, H: 400 };
        expect(finishOn(half, 0, 5)).toBeCloseTo(10);
        // 3–5. günler izinli (kapasite 0): 6 günlük iş 9. günün sonunda biter
        const rate = new Array(400).fill(1); rate[3] = rate[4] = rate[5] = 0;
        const cum = new Float64Array(401); rate.forEach((r, k) => { cum[k + 1] = cum[k] + r; });
        expect(finishOn({ cum, rate, base: 1, H: 400 }, 0, 6)).toBeCloseTo(9);
    });

    it('tek kişi sırayla, iki kişi paralel, öncül sırayı zorlar', () => {
        expect(runMonteCarlo(input([simTask('a', 5), simTask('b', 5)])).release.p50).toBe(10);
        expect(runMonteCarlo(input([simTask('a', 5), simTask('b', 5, { lane: 1 })], { lanes: [lane(), lane()] })).release.p50).toBe(5);
        const chained = runMonteCarlo(input([simTask('a', 5), simTask('b', 5, { lane: 1, pred: 0 })], { lanes: [lane(), lane()] }));
        expect(chained.release.p50).toBe(10);
        expect(chained.tasks.map(t => t.criticality)).toEqual([1, 1]);
    });

    it('birim havuzu boştaki kişiye verir; test süresi sona eklenir', () => {
        const r = runMonteCarlo(input([simTask('a', 4, { lane: -1, pool: 0 }), simTask('b', 4, { lane: -1, pool: 0 })], { lanes: [lane(), lane()], pools: [[0, 1]], testDays: 3 }));
        expect(r.devEnd.p50).toBe(4);
        expect(r.release.p50).toBe(7);
    });

    it('aynı tohum aynı sonucu verir; belirsizlik tek nokta plandan geç teslim üretir', () => {
        const tasks = [simTask('a', 0, { dist: { kind: 'pert', min: 2, mode: 3, max: 12 } }), simTask('b', 0, { dist: { kind: 'pert', min: 2, mode: 3, max: 12 } })];
        const a = runMonteCarlo(input(tasks, { iterations: 3000 }));
        const b = runMonteCarlo(input(tasks, { iterations: 3000 }));
        expect(a.release).toEqual(b.release);
        expect(a.deterministic).toBe(Math.ceil(2 * (2 + 12 + 12) / 6));
        expect(a.release.p80).toBeGreaterThan(a.deterministic);
        expect(probabilityBy(a, a.release.max)).toBe(1);
        expect(probabilityBy(a, a.release.min - 1)).toBe(0);
    });

    it('kalibrasyon çarpanı eforu ölçekler; belirsiz kayıt teslime daha çok katkı yapar', () => {
        const cal = runMonteCarlo(input([simTask('a', 10, { calibration: [2] })]));
        expect(cal.release.p50).toBe(20);
        const r = runMonteCarlo(input([simTask('sabit', 5), simTask('belirsiz', 0, { dist: { kind: 'pert', min: 1, mode: 3, max: 20 } })], { iterations: 2000 }));
        expect(r.tasks[1].sensitivity).toBeGreaterThan(0.9);
        expect(r.tasks[0].sensitivity).toBe(0);
    });

    it('süreçteki iş yalnız kalan eforla, termin olasılığı ve hedef olasılığı', () => {
        const r = runMonteCarlo(input([simTask('a', 10, { doneEffort: 6, dueOffset: 4 }), simTask('b', 2, { halfDone: true })], { targetOffset: 4 }));
        expect(r.release.p50).toBe(5); // 4 + 1
        expect(r.tasks[0].dueProbability).toBe(1);
        expect(r.targetProbability).toBe(0);
        // en az %15 kalır
        expect(runMonteCarlo(input([simTask('a', 10, { doneEffort: 20 })])).release.p50).toBe(2);
    });

    it('arka plan çalıştırıcı: worker yoksa aynı sonucu ana iş parçacığında verir; iptal edilebilir', async () => {
        const inp = input([simTask('a', 0, { dist: { kind: 'pert', min: 1, mode: 2, max: 6 } })]);
        expect((await runSimulationAsync(inp)).release).toEqual(runMonteCarlo(inp).release);
        const ctrl = new AbortController();
        const p = runSimulationAsync(inp, ctrl.signal);
        ctrl.abort();
        await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('geçmiş hız yöntemi: haftalık kapanışlardan teslim', () => {
        const r = simulateThroughput([2, 2, 2, 2], 8, { iterations: 500, seed: 1, testDays: 2 })!;
        expect(r.p50).toBe(4 * 5 + 2);
        expect(r.perWeek).toBe(2);
        expect(simulateThroughput([0, 0], 3, { iterations: 10, seed: 1, testDays: 0 })).toBeNull();
    });
});

describe('planlama geçmişi ve kalibrasyon', () => {
    it('efor eşdeğeri: harcanan saat varsa o, yoksa süre × katılım ÷ eşzamanlı iş', () => {
        const p = createProject('Geçmiş', {
            resources: [res('Ayşe', { participation: 50 })],
            tasks: [
                closed('h1', 10, { resourceName: 'Ayşe' }), // h2 ile aynı aralık: eşzamanlılık 2
                closed('h2', 10, { resourceName: 'Ayşe' }),
                closed('h3', 4, { actualHours: 16, resourceName: 'Ali' }),
            ],
        });
        const h = buildHistory([p]);
        const byId = new Map(h.records.map(r => [r.id, r]));
        expect(byId.get('h1')!.concurrency).toBeCloseTo(2, 1);
        expect(byId.get('h1')!.effortDays).toBeCloseTo((10 * 0.5) / 2, 1);
        expect(byId.get('h3')).toMatchObject({ effortDays: 2, effortBasis: 'logged' });
        // tahmin PERT 3,3 gün → oran = 2,5 / 3,3
        expect(byId.get('h1')!.ratio).toBeCloseTo(2.5 / 3.3, 2);
    });

    it('kalibrasyon en özel yeterli gruptan seçilir', () => {
        const tasks = [
            ...Array.from({ length: 8 }, (_, i) => closed(`a${i}`, 6, { unit: 'Yazılım', issueType: 'bug', time: { best: 3, avg: 3, worst: 3 } })),
            ...Array.from({ length: 8 }, (_, i) => closed(`b${i}`, 3, { unit: 'Test', issueType: 'feature', time: { best: 3, avg: 3, worst: 3 } })),
        ];
        const h = buildHistory([createProject('K', { tasks })]);
        const cal = calibrator(h);
        expect(cal({ unit: 'Yazılım', issueType: 'bug' })!.scope).toBe('unit_type');
        expect(cal({ unit: 'Test', issueType: 'bug' })!.scope).toBe('unit');
        expect(cal({ unit: 'Donanım', issueType: 'feature' })!.scope).toBe('type');
        expect(cal({ unit: 'Donanım' })!.scope).toBe('all');
        expect(cal({ unit: 'Yazılım', issueType: 'bug' })!.median).toBeGreaterThan(cal({ unit: 'Test', issueType: 'feature' })!.median);
    });

    it('haftalık kapanış: içinde bulunulan hafta ve toplu kapatma sayılmaz', () => {
        const at = (d: string) => task(`t${d}`, { status: TaskStatus.Done, createdAt: '2026-08-03T09:00:00', resolvedAt: `${d}T12:00:00` });
        const p = createProject('H', { tasks: [at('2026-10-06'), at('2026-09-30'), at('2026-09-29'), at('2026-09-22'), at('2026-09-15'), at('2026-09-08'), at('2026-09-09')] });
        const weeks = weeklyThroughput(buildHistory([p]).report, p.id, NOW)!;
        expect(weeks).toEqual([2, 1, 1, 2]);
    });
});

describe('benzer kayıtlardan tahmin', () => {
    const history = () => {
        const login = Array.from({ length: 6 }, (_, i) => closed(`l${i}`, 4 + i, { name: `Giriş ekranında oturum açma hatası ${i}`, unit: 'Yazılım', priority: 'High' }));
        const report = Array.from({ length: 6 }, (_, i) => closed(`r${i}`, 20 + i, { name: `Aylık rapor dışa aktarma özelliği ${i}`, unit: 'Yazılım', issueType: 'feature' }));
        return buildHistory([createProject('P', { tasks: [...login, ...report] })]);
    };

    it('metni ve nitelikleri benzeyen kayıtların gerçek süreleri', () => {
        const est = estimateFromHistory({ name: 'Oturum açma ekranı hatası', issueType: 'bug', unit: 'Yazılım' }, history());
        expect(est.method).toBe('similar');
        expect(est.matches[0].record.name).toMatch(/oturum/i);
        expect(est.duration!.p50).toBeLessThan(10);
        expect(est.effort!.best).toBeLessThanOrEqual(est.effort!.likely);
        expect(est.effort!.likely).toBeLessThanOrEqual(est.effort!.worst);
        expect(est.priority).toMatchObject({ value: 'High' });
    });

    it('benzer kayıt yoksa gruba, o da yoksa tüm geçmişe düşer; veri yoksa tahmin yok', () => {
        const h = history();
        const g = estimateFromHistory({ name: 'Veri tabanı yedekleme', issueType: 'feature' }, h);
        expect(g.method).toBe('group');
        expect(g.methodLabel).toBe('Aynı türdeki kayıtlar');
        expect(g.duration!.p50).toBeGreaterThan(15);
        expect(g.confidence).not.toBe('high');
        expect(estimateFromHistory({ name: 'Herhangi bir iş' }, h).method).toBe('all');
        expect(estimateFromHistory({ name: 'x' }, buildHistory([])).method).toBe('none');
    });

    it('görünmeyen projelerin kayıtları kanıtta gizli işaretlenir', () => {
        const h = history();
        const est = estimateFromHistory({ name: 'Oturum açma hatası', issueType: 'bug' }, h, { visibleProjectIds: new Set(['başka']) });
        expect(est.matches.every(m => !m.visible)).toBe(true);
    });
});

describe('simülasyon girdisi', () => {
    it('kapsam, şerit, havuz, öncül sırası ve uyarılar', () => {
        const p: Project = createProject('S', {
            settings: { sprintDuration: 2, projectStartDate: '2026-10-05', globalTestDays: 2 },
            resources: [res('Ayşe'), res('Ali', { unit: 'Test', participation: 50 })],
            tasks: [
                task('a', { resourceName: 'Ayşe', version: 2 }),
                task('b', { predecessor: 'a', unit: 'Test', version: 1 }), // atanmamış → Test havuzu
                task('c', { status: TaskStatus.Done }),
                task('d', { time: { best: 4, avg: 4, worst: 4 }, version: 1 }), // tek değer, kalibrasyon yok
                task('e', { time: { best: 0, avg: 0, worst: 0 }, version: 1 }), // tahmin yok, geçmiş yok
                task('f', { unit: 'Donanım', version: 3 }), // birimde kimse yok
            ],
        });
        const built = buildSimulation(p, buildHistory([p]), {}, { now: NOW });
        expect(built.start).toBe('2026-10-07');
        expect(built.tasks.map(t => t.id)).toEqual(['a', 'b', 'd', 'f']);
        expect(built.skipped.map(s => s.id)).toEqual(['e']);
        expect(built.scopeCount).toBe(5);
        const [a, b, d, f] = built.input.tasks;
        expect(a.lane).toBe(0);
        expect(b).toMatchObject({ lane: -1, pred: 0 });
        expect(d.dist).toEqual({ kind: 'pert', min: 3.2, mode: 4, max: 6.4 });
        expect(f.lane).toBe(-2);
        // öncül önce gelir (b sürüm 1'de olsa da a'yı bekler)
        expect(built.input.order.indexOf(0)).toBeLessThan(built.input.order.indexOf(1));
        expect(built.warnings.map(w => w.kind).sort()).toEqual(['default_spread', 'no_estimate', 'no_team']);
        expect(built.input.lanes[1].base).toBe(0.5);
        // Sürüm 1'e kadar kapsamı
        expect(buildSimulation(p, buildHistory([p]), {}, { now: NOW, scope: 1 }).tasks.map(t => t.id)).toEqual(['b', 'd']);
        const r = runMonteCarlo(built.input);
        expect(r.release.p50).toBeGreaterThan(r.devEnd.p50);
    });

    it('tarih ↔ iş günü ofseti (tatiller düşülür)', () => {
        expect(dateAtOffset('2026-10-26', 4)).toEqual(new Date(2026, 9, 30)); // 29 Ekim tatil
        expect(offsetOf('2026-10-26', '2026-10-30')).toBe(4);
        expect(offsetOf('2026-10-26', '2026-10-20')).toBe(0);
    });

    it('izin ayında kapasite düşer', () => {
        const p = createProject('İ', { resources: [res('Ayşe Kaya')], tasks: [task('a', { resourceName: 'Ayşe Kaya', time: { best: 10, avg: 10, worst: 10 } })] });
        const people = [{ id: 'k1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U1', availableAA: 1, roles: [] }];
        const free = runMonteCarlo(buildSimulation(p, buildHistory([p]), { people }, { now: NOW, testDays: 0 }).input);
        const onLeave = runMonteCarlo(buildSimulation(p, buildHistory([p]), { people, leaves: [{ id: 'l', personId: 'k1', year: 2026, month: 10, aa: 1 }] }, { now: NOW, testDays: 0 }).input);
        expect(onLeave.release.p50).toBeGreaterThan(free.release.p50 + 5);
    });
});

describe('yeni kayıt hangi sürüme sığar', () => {
    it('boş sürüme sığar; dolu sürümde olasılık düşer ve sonraki önerilir', () => {
        const p = createProject('F', {
            settings: { sprintDuration: 2, projectStartDate: '2026-10-05', globalTestDays: 2 },
            resources: [res('Ayşe')],
            tasks: [task('dolu', { version: 1, resourceName: 'Ayşe', time: { best: 7, avg: 8, worst: 9 } }), task('ikinci', { version: 2, time: { best: 1, avg: 1, worst: 2 } })],
        });
        const fit = sprintFit(p, buildHistory([p]), { unit: 'Yazılım', effort: { kind: 'pert', min: 2, mode: 3, max: 4 } }, { now: NOW, iterations: 500 });
        expect(fit.unitHasTeam).toBe(true);
        const [s1, s2, s3] = fit.rows;
        expect(s1.version).toBe(1);
        expect(s1.probability!).toBeLessThan(0.2); // 8 günlük işin yanında 8 iş günü kalmış
        expect(s2.probability!).toBeGreaterThan(0.95);
        expect(s3.isNew).toBe(true);
        expect(fit.recommended).toBe(2);
        const none = sprintFit(p, buildHistory([p]), { unit: 'Donanım', effort: { kind: 'fixed', value: 1 } }, { now: NOW });
        expect(none.unitHasTeam).toBe(false);
        expect(none.recommended).toBeNull();
    });
});
