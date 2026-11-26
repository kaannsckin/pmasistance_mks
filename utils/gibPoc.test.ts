import { describe, expect, it } from 'vitest';
import { PocTestItem, Project, Task, TaskStatus } from '../types';
import {
    computePocScores, importanceLine, pct, pocCategories, pocCategoryRows, pocCoefficient, pocDistribution, resultClass, signedPoints,
} from './gibPoc';
import { createProject } from './workspace';
import { GIB_KPI_IDS, refreshPocKpis, withPocKpis } from './gibPocKpi';
import { buildReport, progressSnapshot } from './reportAutomation';
import { buildGibReport } from './gibReport';

const task = (id: string, status: TaskStatus, labels: string[], jiraStatus?: string, extra: Partial<Task> = {}): Task => ({
    id: `gib-${id}`, name: `${id} · madde`, availability: true, priority: 'Medium', version: 0, predecessor: null, unit: 'EMS', resourceName: 'Ayşe',
    time: { best: 1, avg: 1, worst: 1 }, jiraId: `MPS-${id}`, notes: '', status, labels, ...(jiraStatus ? { jiraStatus } : {}), ...extra,
});
const test = (testNo: string, importance: string, weight: number, pocResult: string, currentResult?: string): PocTestItem =>
    ({ testNo, importance, weight, pocResult, ...(currentResult ? { currentResult } : {}) });

const ARALIK = 'Planlama: Aralık 2026';
const GIB = 'Planlama: GİB netleştirme';
const MUSTERI = 'Planlama: Müşteri sonrası';
const EKIP = 'Planlama: Proje ekibi';

const TESTS: PocTestItem[] = [
    test('T1', 'Zorunlu', 3, 'Karşılanmadı'),
    test('T2', 'Zorunlu', 3, 'Kısmen karşılandı'),
    test('T3', 'Zorunlu', 3, 'Test edilemedi'),
    test('T4', 'Olması beklenen', 2, 'Karşılanmadı'),
    test('T5', 'İsteğe bağlı', 1, 'Karşılanmadı', 'Karşılandı'),
    test('T6', 'Zorunlu', 3, 'Karşılandı'), // göreve dönüşmeyen test
    test('T7', 'Olması beklenen', 2, 'Değerlendirme dışı'),
];
const TASKS: Task[] = [
    task('T1', TaskStatus.InProgress, ['Zorunlu', ARALIK], 'Testte'),
    task('T2', TaskStatus.InProgress, ['Zorunlu', ARALIK], 'TESTTE'),
    task('T3', TaskStatus.ToDo, ['Zorunlu', GIB, 'GİB yanıtı bekleniyor']),
    task('T4', TaskStatus.ToDo, ['Olması beklenen', MUSTERI]),
    task('T5', TaskStatus.ToDo, ['İsteğe bağlı', EKIP]),
];
const COEFF = { categories: { [TaskStatus.InProgress]: 30 }, statuses: { TESTTE: 70 } };

const make = (over: Partial<Project> = {}): Project => ({
    ...createProject('GİB'),
    tasks: TASKS,
    poc: { tests: TESTS, settings: { coefficients: COEFF } },
    jiraSync: { discover: false, autoMinutes: 0, lastSyncAt: '2026-11-26T08:30:00.000Z' },
    workPackages: [{ id: 'wp1', name: 'EP-01 · Kimlik', description: '' }],
    ...over,
});

describe('PoC skor modeli', () => {
    it('sonuç sınıfları ve katsayı: ayrıntılı Jira durumu kategoriden önce; varsayılan yalnız Tamamlandı = 1; iptal 0', () => {
        expect(resultClass('Kısmen karşılandı')).toBe('partial');
        expect(resultClass('ÜRETİCİYE SORULACAK')).toBe('askVendor');
        expect(resultClass('hızlı aksiyon')).toBeUndefined();
        const s = { coefficients: COEFF };
        expect(pocCoefficient(task('x', TaskStatus.InProgress, [], 'Testte'), s)).toBe(0.7);
        expect(pocCoefficient(task('x', TaskStatus.InProgress, [], 'Geliştirmede'), s)).toBe(0.3);
        expect(pocCoefficient(task('x', TaskStatus.ToDo, []), s)).toBe(0);
        expect(pocCoefficient(task('x', TaskStatus.Done, []), undefined)).toBe(1);
        expect(pocCoefficient(task('x', TaskStatus.Done, []), { coefficients: { categories: { [TaskStatus.Done]: 90 } } })).toBe(0.9);
        expect(pocCoefficient(task('x', TaskStatus.Done, ['İptal / Kapsam dışı']), undefined)).toBe(0);
        expect(pocCoefficient(undefined, s)).toBe(0);
    });

    it('gereksinimdeki örnekler: p = b + (1 − b)·k; değerlendirilmemiş test tamamlanınca 3/3 ile paydaya girer', () => {
        const one = (t: PocTestItem, status: TaskStatus, jira?: string) => computePocScores({
            tasks: [task(t.testNo, status, [], jira)], poc: { tests: [t, test('R', 'Zorunlu', 3, 'Karşılanmadı')], settings: { coefficients: COEFF } },
        })!.today;
        // Zorunlu, karşılanmadı, Testte: 0,7·3 = 2,1 puan (+ referans test 0 / 3)
        expect(one(test('A', 'Zorunlu', 3, 'Karşılanmadı'), TaskStatus.InProgress, 'Testte')).toBeCloseTo(100 * 2.1 / 6);
        // Kısmen: 0,5 + 0,5·0,7 = 0,85 → 2,55 puan
        expect(one(test('A', 'Zorunlu', 3, 'Kısmen karşılandı'), TaskStatus.InProgress, 'Testte')).toBeCloseTo(100 * 2.55 / 6);
        // Test edilemedi + Testte: paydaya girmez; Tamamlandı: 3/3 ile girer
        expect(one(test('A', 'Zorunlu', 3, 'Test edilemedi'), TaskStatus.InProgress, 'Testte')).toBe(0);
        expect(one(test('A', 'Zorunlu', 3, 'Test edilemedi'), TaskStatus.Done)).toBeCloseTo(50);
    });

    it('dört skor: İlk, Doğrulanmış (Güncel Sonuç), Bugün (Jira × k), Olası (kapsam tamamlanmış)', () => {
        const s = computePocScores(make())!;
        expect(s.initial).toBeCloseTo(100 * 4.5 / 12); // T1 0 · T2 1,5 · T4 0 · T5 0 · T6 3
        expect(s.verified).toBeCloseTo(100 * 5.5 / 12); // T5 güncel sonuç: karşılandı
        expect(s.today).toBeCloseTo(100 * 8.65 / 12); // T1 2,1 · T2 2,55 · T5 1 · T6 3
        expect(s.scope).toEqual([ARALIK]); // varsayılan: ilk kategori
        expect(s.possible).toBeCloseTo(100 * 10 / 12);
        expect(s.mandatoryOpen).toBe(2);
        expect(s.tests).toBe(7);
        expect(s.evaluated).toBe(5);
        expect(s.syncAt).toBe('2026-11-26T08:30:00.000Z');
    });

    it('tüm görevler Yapılacak iken Bugün = Doğrulanmış', () => {
        const s = computePocScores(make({ tasks: TASKS.map(t => ({ ...t, status: TaskStatus.ToDo, jiraStatus: 'Yapılacak' })) }))!;
        expect(s.today).toBeCloseTo(s.verified, 10);
    });

    it('kategori katkıları: toplamı 100 − Olası; sıradan bağımsız; tek başına katkı ayrı', () => {
        const s = computePocScores(make())!;
        const by = Object.fromEntries(s.contributions.map(c => [c.name, c]));
        const gap = 100 - s.possible;
        // Eksik puan: GİB netleştirme 3 (T3 değerlendirilmemiş → p 0), Müşteri sonrası 2, Proje ekibi 0
        expect(by['GİB netleştirme'].value).toBeCloseTo(gap * 3 / 5);
        expect(by['Müşteri sonrası'].value).toBeCloseTo(gap * 2 / 5);
        expect(by['Proje ekibi'].value).toBeCloseTo(0);
        expect(s.contributions.reduce((a, c) => a + c.value, 0) + s.uncategorized).toBeCloseTo(gap);
        // Tek başına: T3 tamamlanınca 3/3 ile paydaya girer → 13/15
        expect(by['GİB netleştirme'].alone).toBeCloseTo(100 * 13 / 15 - s.possible);
        expect(by['Müşteri sonrası'].alone).toBeCloseTo(100 - s.possible);
        // Görev ve etiket sırası değişince sonuç aynı
        const shuffled = computePocScores(make({ tasks: [...TASKS].reverse().map(t => ({ ...t, labels: [...(t.labels || [])].reverse() })) }))!;
        expect(shuffled.contributions.map(c => [c.label, c.value.toFixed(6)]).sort()).toEqual(s.contributions.map(c => [c.label, c.value.toFixed(6)]).sort());
    });

    it('birden çok kapsam etiketi; tüm kategoriler kapsamdaysa Olası %100', () => {
        const s = computePocScores(make(), [ARALIK, GIB, MUSTERI, EKIP])!;
        expect(s.possible).toBeCloseTo(100);
        expect(s.contributions).toEqual([]);
        expect(computePocScores(make({ poc: { tests: TESTS, settings: { coefficients: COEFF, scopeLabels: [MUSTERI] } } }))!.scope).toEqual([MUSTERI]);
    });

    it('değerlendirilmemiş testler için "hiç girmez" kuralı', () => {
        const s = computePocScores(make({ poc: { tests: TESTS, settings: { coefficients: COEFF, unevaluated: 'never' } } }), [ARALIK, GIB])!;
        expect(s.possible).toBeCloseTo(100 * 10 / 12); // T3 tamamlansa da paydaya girmez
    });

    it('dağılımlar ve kategori tablosu', () => {
        const d = pocDistribution(TESTS);
        expect([d.total, d.met, d.partial, d.other]).toEqual([7, 1, 1, 5]);
        expect(d.byClass).toMatchObject({ unmet: 3, untestable: 1, excluded: 1 });
        expect(pocDistribution(TESTS, 'initial', 'Zorunlu')).toMatchObject({ total: 4, met: 1, partial: 1, other: 2 });
        expect(pocDistribution(TESTS, 'verified').met).toBe(2);
        expect(pocCategories(TASKS)).toEqual([ARALIK, GIB, MUSTERI, EKIP]);
        const rows = pocCategoryRows(make());
        expect(rows.map(r => [r.name, r.items])).toEqual([['Aralık 2026', 2], ['GİB netleştirme', 1], ['Müşteri sonrası', 1], ['Proje ekibi', 1]]);
        expect(importanceLine({ 'Zorunlu': 7, 'Olması beklenen': 2 }, true)).toBe('Z 7 · OB 2');
    });

    it('biçim', () => {
        expect(pct(87.0612)).toBe('%87,1');
        expect(signedPoints(6.17)).toBe('+6,2');
        expect(signedPoints(-0.04)).toBe('±0');
        expect(signedPoints(-3.21)).toBe('−3,2');
    });

    it('PoC verisi yoksa hesap yok', () => {
        expect(computePocScores(createProject('X'))).toBeUndefined();
    });
});

describe('PoC göstergeleri, günlük ölçüm ve rapor', () => {
    it('gösterge: Bugün skoru ölçülür, başlangıç İlk skor; aynı değer tekrar yazılmaz', () => {
        const p = withPocKpis(make(), '2026-11-26');
        const k = p.kpis!.find(x => x.id === GIB_KPI_IDS.score)!;
        expect(k.baseline).toBeCloseTo(37.5);
        expect(k.points).toEqual([{ date: '2026-11-26', value: 72.1, note: expect.stringContaining('Jira verisi') }]);
        expect(p.kpis!.find(x => x.id === GIB_KPI_IDS.mandatory)!.points[0].value).toBe(2);
        expect(refreshPocKpis(p, '2026-11-26')).toBe(p);
        // Jira'da T4 tamamlandı → yeni değer
        const moved = { ...p, tasks: p.tasks.map(t => (t.id === 'gib-T4' ? { ...t, status: TaskStatus.Done } : t)) };
        expect(refreshPocKpis(moved, '2026-11-26').kpis!.find(x => x.id === GIB_KPI_IDS.score)!.points.at(-1)!.value).toBeCloseTo(100 * 10.65 / 12, 1);
    });

    it('günlük ölçüm PoC skorunu ve eşitleme zamanını taşır', () => {
        const snap = progressSnapshot(make(), new Date('2026-11-26T09:00:00Z'));
        expect(snap.poc).toBeCloseTo(72.08, 2);
        expect(snap.pocSyncAt).toBe('2026-11-26T08:30:00.000Z');
        expect(progressSnapshot(createProject('X'), new Date()).poc).toBeUndefined();
    });

    it('zamanlanmış raporda PoC bölümü: dört skor, önceki ölçüme göre fark, Jira verisi tarihi, katkılar', () => {
        const now = new Date('2026-11-26T09:00:00Z');
        const r = buildReport(make(), { name: 'Günlük', blocks: ['progress', 'poc'], cadence: 'daily' }, {
            now, previous: { day: '2026-11-25', pct: 10, done: 0, total: 5, open: 5, bugsOpen: 0, poc: 70 },
        });
        const sec = r.sections.find(s => s.title === 'PoC skoru')!;
        expect(sec.summary).toContain('Bugün %72,1 (önceki ölçüm %70,0, +2,1 puan)');
        expect(sec.summary).toContain('Jira verisi: 26 Kas 2026');
        expect(sec.lines[0]).toBe('İlk %37,5 · Doğrulanmış %45,8 · Bugün %72,1 · Olası (Aralık 2026) %83,3');
        expect(sec.lines.join('\n')).toContain('GİB netleştirme +10,0');
        expect(r.sections.map(s => s.title)).toEqual(['İlerleme', 'PoC skoru']);
    });

    it('GİB raporu verisi: kapsam, başlık bazında, kategoriler ve yanıt beklenenler', () => {
        const d = buildGibReport(make({ tasks: TASKS.map(t => (t.id === 'gib-T1' ? { ...t, workPackageId: 'wp1' } : t)) }), { now: new Date('2026-11-26T09:00:00Z') })!;
        expect(d.period).toBe('Kasım 2026');
        expect([d.tracked, d.scopeItems]).toEqual([5, 2]);
        expect(d.scopeByImportance).toEqual({ 'Zorunlu': 2 });
        expect(d.headings.map(h => [h.name, h.items])).toEqual([['EP-01 · Kimlik', 1], ['İş paketi yok', 1]]);
        expect(d.categories.map(c => c.name)).toEqual(['GİB netleştirme', 'Müşteri sonrası', 'Proje ekibi']);
        expect(d.categories[0].awaiting).toBe(1);
        expect(d.distribution.total).toBe(7);
    });
});
