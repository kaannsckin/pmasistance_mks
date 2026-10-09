import { describe, expect, it } from 'vitest';
import { EvalRun, ModelEvalRun, Task, TaskStatus } from '../../types';
import { buildHistory } from '../planning/history';
import { MODEL_VERSION } from '../planning/ml/estimateModel';
import { createProject } from '../workspace';
import { ESTIMATE_PROMPT_VERSION } from './estimateSuggestion';
import { buildFineTuneDataset, fineTuneReadiness, FT_GOOD_RECORDS, personNames, redactNames } from './fineTune';

const closed = (i: number, extra: Partial<Task> = {}): Task => {
    const s = new Date('2025-01-06T09:00:00');
    s.setDate(s.getDate() + i * 2);
    while (s.getDay() % 6 === 0) s.setDate(s.getDate() + 1);
    const e = new Date(s);
    e.setDate(e.getDate() + 2 + (i % 3));
    while (e.getDay() % 6 === 0) e.setDate(e.getDate() + 1);
    return {
        id: `k${i}`, name: `Oturum ekranı hatası ${i}`, availability: true, priority: i % 4 ? 'Medium' : 'High', version: 0, predecessor: null, unit: 'Yazılım', resourceName: 'Ayşe Yılmaz',
        time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: i === 20 ? 'Ayşe Yılmaz ve İsmail Kaya ile konuşuldu; AYŞE YILMAZ onayladı.' : '', status: TaskStatus.Done, issueType: 'bug', includeInSprints: false,
        createdAt: s.toISOString(), startedAt: s.toISOString(), resolvedAt: e.toISOString(), ...extra,
    };
};
const historyOf = (n: number) => buildHistory([createProject('P', { tasks: Array.from({ length: n }, (_, i) => closed(i)), resources: [{ id: 'r', name: 'Ayşe Yılmaz', participation: 100, unit: 'Yazılım', title: '' }] })]);

const goldRun = (passed: boolean | null, aiMae: number, refMae = 1, model = 'm1'): EvalRun => ({
    id: 'g', at: '', promptVersion: ESTIMATE_PROMPT_VERSION, model, n: 30, reference: { mae: refMae, coverage: 0.8, priorityAccuracy: 0.7 },
    ai: { n: 30, mae: aiMae, coverage: 0.7, priorityAccuracy: 0.6, typeAccuracy: 0.9, lowConfidence: 0, unknownEvidence: 0 }, passed, reasons: [],
});
const mlRun = (better: boolean, modelMae: number, refMae = 1): ModelEvalRun => ({
    id: 'm', at: '', version: MODEL_VERSION, nTrain: 300, nTest: 60, cutoff: '', better, reasons: [], importance: [],
    model: { mae: modelMae, coverage: 0.8, daysMae: 1, p80Coverage: 0.8, priorityAccuracy: 0.8, typeAccuracy: 0.9 },
    reference: { mae: refMae, coverage: 0.8, daysMae: 1, p80Coverage: 0.8, priorityAccuracy: 0.8, typeAccuracy: 0.9 },
    withEstimate: { n: 0, mae: null, referenceMae: null, coverage: null, better: null },
});
const golden = (n: number) => Array.from({ length: n }, (_, i) => ({ taskId: `k${i}`, projectId: 'p', priority: 'High' as const, addedAt: '' }));

describe('ince ayar kararı', () => {
    const h = historyOf(40);
    const big = { records: Array.from({ length: FT_GOOD_RECORDS }, (_, i) => ({ ...h.records[i % h.records.length], id: `b${i}` })), report: h.report };

    it('ölçü yoksa ya da eskiyse karar verilmez', () => {
        expect(fineTuneReadiness({}, h).verdict).toBe('not_ready');
        const stale = fineTuneReadiness({ evalRuns: [goldRun(false, 2)], goldenSet: golden(30) }, h, { model: 'yeni-model' });
        expect(stale.verdict).toBe('not_ready');
        expect(stale.checks.find(c => c.label.startsWith('AI'))!.status).toBe('warn');
        expect(fineTuneReadiness({ evalRuns: [goldRun(false, 2)], goldenSet: golden(5) }, h, { model: 'm1' }).verdict).toBe('not_ready');
    });

    it('AI geçiyor ya da klasik model daha iyiyse ince ayar gerekmez', () => {
        expect(fineTuneReadiness({ evalRuns: [goldRun(true, 0.9)], goldenSet: golden(30) }, h, { model: 'm1' }).verdict).toBe('not_needed');
        const ml = fineTuneReadiness({ evalRuns: [goldRun(false, 1.4)], modelEvals: [mlRun(true, 0.8)], goldenSet: golden(30) }, big, { model: 'm1' });
        expect(ml.verdict).toBe('not_needed');
        expect(ml.headline).toMatch(/makine öğrenmesi modeli AI'dan isabetli/);
        expect(ml).toMatchObject({ aiRatio: 1.4, mlRatio: 0.8 });
    });

    it('karar veremeyen değerlendirme ya da efor tahmininde geride olmayan AI "önerilir" demez', () => {
        const big2 = { records: Array.from({ length: FT_GOOD_RECORDS }, (_, i) => ({ ...h.records[i % h.records.length], id: `c${i}` })), report: h.report };
        expect(fineTuneReadiness({ evalRuns: [{ ...goldRun(null, 0.5), ai: { ...goldRun(null, 0.5).ai!, n: 5 } }], goldenSet: golden(60) }, big2, { model: 'm1' }).verdict).toBe('not_ready');
        const pr = fineTuneReadiness({ evalRuns: [{ ...goldRun(false, 0.6), reasons: ['Önem doğruluğu %40; alt sınır %60.'] }], goldenSet: golden(60) }, big2, { model: 'm1' });
        expect(pr.verdict).toBe('consider');
        expect(pr.headline).toMatch(/geride değil/);
        expect(pr.headline).toMatch(/Önem doğruluğu/);
    });

    it('AI geride kalıyorsa veri hacmine göre: az → bekle, sınırda → düşün, yeterli → öner', () => {
        const runs = { evalRuns: [goldRun(false, 1.5)], modelEvals: [mlRun(false, 1.1)] };
        expect(fineTuneReadiness({ ...runs, goldenSet: golden(30) }, h, { model: 'm1' }).verdict).toBe('not_ready'); // 40 kayıt
        const mid = { records: big.records.slice(0, 500), report: h.report };
        expect(fineTuneReadiness({ ...runs, goldenSet: golden(30) }, mid, { model: 'm1' }).verdict).toBe('consider');
        const rec = fineTuneReadiness({ ...runs, goldenSet: golden(60) }, big, { model: 'm1' });
        expect(rec.verdict).toBe('recommended');
        expect(rec.next.join(' ')).toMatch(/veri kümesini/);
    });
});

describe('ince ayar veri kümesi', () => {
    it('kişi adları Türkçe harf büyüklüğüne duyarsız maskelenir', () => {
        const names = personNames({ people: [{ id: 'p', firstName: 'İsmail', lastName: 'Kaya' } as never], projects: [createProject('P', { resources: [{ id: 'r', name: 'Ayşe Yılmaz', participation: 100, unit: '', title: '' }, { id: 't', name: 'Tekad', participation: 100, unit: '', title: '' }] })] });
        expect([...names].sort((a, b) => a.localeCompare(b, 'tr'))).toEqual(['Ayşe Yılmaz', 'İsmail Kaya']); // tek sözcüklü ad maskelenmez (yanlış eşleşme riski)
        const r = redactNames('Ayşe Yılmaz, AYŞE YILMAZ ve ismail kaya geldi; Ayşe Yılmazlar değil.', names);
        expect(r).toEqual({ text: '[kişi], [kişi] ve [kişi] geldi; Ayşe Yılmazlar değil.', hits: 3 });
        // ASCII yazım ve büyük harf; kısa çizgili ve özel karakterli adlar desenini bozmaz
        expect(redactNames('ALI KAYA ve Ayse Yilmaz geldi', ['Ali Kaya', 'Ayşe Yılmaz']).hits).toBe(2);
        expect(redactNames('Ayşe Yılmaz-Kaya ile Front-end Ekibi (2) toplandı', ['Ayşe Yılmaz-Kaya', 'Front-end Ekibi (2)'])).toEqual({ text: '[kişi] ile [kişi] toplandı', hits: 2 });
    });

    it('zaman ayrımlı bağlam, altın set dışarıda, doğrulama son kapananlar, kişi adı yok', async () => {
        const h = historyOf(40);
        const ws = { goldenSet: golden(3), people: [], projects: [createProject('P', { resources: [{ id: 'r', name: 'Ayşe Yılmaz', participation: 100, unit: 'Yazılım', title: '' }] })] };
        const progress: number[] = [];
        const d = await buildFineTuneDataset(ws, h, { now: new Date('2026-10-08T10:00:00Z'), onProgress: done => progress.push(done), chunk: 10 });
        expect(d.stats.excludedGolden).toBe(3);
        expect(d.stats.noContext).toBeGreaterThan(0); // ilk kayıtların öncesinde kapanmış kayıt yok
        expect(d.stats.train + d.stats.validation + d.stats.noContext).toBe(37);
        expect(d.stats.validation).toBe(Math.round((d.stats.train + d.stats.validation) * 0.15));
        expect(progress.at(-1)).toBe(37);
        const lines = [...d.train.split('\n'), ...d.validation.split('\n')].map(l => JSON.parse(l));
        expect(lines.every(l => l.messages.map((m: { role: string }) => m.role).join() === 'system,user,assistant')).toBe(true);
        expect(lines.some(l => l.messages[1].content.includes('k0'))).toBe(false);
        const all = d.train + d.validation;
        expect(/Ayşe Yılmaz|AYŞE YILMAZ/i.test(all)).toBe(false);
        expect(d.stats.redactions).toBeGreaterThan(0);
        expect(all).not.toContain('Kullanıcının seçtiği tür'); // önem ve tür taslağa girmez
        expect(JSON.parse(lines[0].messages[2].content)).toMatchObject({ tur: 'bug', efor: { olasi: expect.any(Number) } });
        expect(d.card).toMatchObject({ istem_surumu: ESTIMATE_PROMPT_VERSION, kayit: { altin_set_haric: 3 }, gizlilik: { sorumlu_alani: 'yok' } });
        // Doğrulama kümesindeki kayıtlar eğitimdekilerden sonra kapanmış
        const dates = (d.card.donem as { egitim: string[]; dogrulama: string[] });
        expect(dates.dogrulama[0] >= dates.egitim[1]).toBe(true);
    });
});
