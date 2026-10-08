import { describe, expect, it } from 'vitest';
import { IssueType, ModelEvalRun, Task, TaskStatus } from '../../../types';
import { createProject } from '../../workspace';
import { buildHistory } from '../history';
import { mulberry32 } from '../random';
import { evaluateEstimateModel, importanceOf, MIN_TRAIN, MODEL_VERSION, predictEstimate, trainEstimateModel } from './estimateModel';
import { buildFeatureSpace, encode, recordInput } from './features';
import { contributionsGbm, predictGbm, trainGbm } from './gbm';
import { modelEstimateEnabled } from './runModel';
import { predictSoftmax, trainSoftmax } from './softmax';

/**
 * Yapay geçmiş: efor türe (özellik 5 gün, hata 1,5 gün), birime (Test ×0,6)
 * ve metne ("rapor" ×1,8) bağlı; önem metinden ("acil" → engelleyici).
 */
const BASE: Record<IssueType, number> = { bug: 1.5, feature: 5, improvement: 3, task: 2, other: 2 };
const TYPES: IssueType[] = ['bug', 'feature', 'improvement', 'task'];
const synthetic = (n: number, seed = 3) => {
    const rand = mulberry32(seed);
    const tasks: Task[] = [];
    for (let i = 0; i < n; i++) {
        const type = TYPES[i % 4];
        const unit = i % 3 === 0 ? 'Test' : 'Yazılım';
        const report = Math.floor(i / 4) % 2 === 0; // her türde hem raporlu hem raporsuz
        const urgent = i % 7 === 0;
        const noise = Math.exp((rand() - 0.5) * 0.5);
        const effort = BASE[type] * (unit === 'Test' ? 0.6 : 1) * (report ? 1.8 : 1) * noise;
        const days = Math.max(1, Math.ceil(effort * 1.3));
        const s = new Date('2025-01-06T09:00:00');
        s.setDate(s.getDate() + i * 2);
        while (s.getDay() % 6 === 0) s.setDate(s.getDate() + 1);
        const e = new Date(s);
        let left = days - 1;
        while (left > 0) { e.setDate(e.getDate() + 1); if (e.getDay() % 6 !== 0) left--; }
        tasks.push({
            id: `s${i}`, name: `${report ? 'Aylık rapor' : 'Oturum ekranı'} ${type === 'bug' ? 'hatası' : 'geliştirmesi'}${urgent ? ' acil' : ''} ${i}`,
            availability: true, priority: urgent ? 'Blocker' : report ? 'Medium' : 'High', version: 0, predecessor: null, unit, resourceName: '',
            time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status: TaskStatus.Done, issueType: type, includeInSprints: false,
            createdAt: s.toISOString(), startedAt: s.toISOString(), resolvedAt: e.toISOString(), actualHours: Math.round(effort * 8 * 10) / 10, estimateSource: 'jira',
        });
    }
    return buildHistory([createProject('Sentetik', { tasks })]);
};

describe('gradyan artırmalı ağaçlar ve lojistik regresyon', () => {
    it('basit ilişkiyi öğrenir; katkılar tahmini verir', () => {
        const rand = mulberry32(1);
        const X = Array.from({ length: 300 }, () => Float64Array.from([rand() * 4, rand() < 0.5 ? 1 : 0, rand()]));
        const y = X.map(x => 2 * x[0] + 3 * x[1]);
        const m = trainGbm(X, y, { rounds: 200, learningRate: 0.1, maxDepth: 3 });
        const err = X.reduce((s, x, i) => s + Math.abs(predictGbm(m, x) - y[i]), 0) / X.length;
        expect(err).toBeLessThan(0.35);
        expect(m.gain[2]).toBeLessThan(m.gain[0] * 0.1); // gürültü özelliği önemsiz
        const x = Float64Array.from([3, 1, 0.5]);
        const { bias, contrib } = contributionsGbm(m, x, 3);
        expect(bias + contrib.reduce((a, b) => a + b, 0)).toBeCloseTo(predictGbm(m, x), 9);
        expect(contrib[1]).toBeGreaterThan(1); // ikili özellik +3 civarı
        // Aynı tohum aynı model
        expect(trainGbm(X, y, { rounds: 20 })).toEqual(trainGbm(X, y, { rounds: 20 }));
    });

    it('softmax sınıfları ayırır; maskeli özellik kullanılmaz', () => {
        const X = Array.from({ length: 120 }, (_, i) => Float64Array.from([i % 3 === 0 ? 1 : 0, i % 3 === 1 ? 1 : 0, i % 3]));
        const y = X.map((_, i) => i % 3);
        const m = trainSoftmax(X, y, 3, [true, true, false]);
        expect(m.weights.every(w => w[2] === 0)).toBe(true);
        const acc = X.filter((x, i) => { const p = predictSoftmax(m, x); return p.indexOf(Math.max(...p)) === y[i]; }).length / X.length;
        expect(acc).toBe(1);
    });
});

describe('kayıt tahmin modeli', () => {
    const h = synthetic(240);

    it('özellik uzayı kişi adı içermez; ekip tahmini yalnız kendi tahminse', () => {
        const space = buildFeatureSpace(h.records);
        expect(space.labels).toContain('Tür: Yeni özellik');
        expect(space.labels).toContain('Birim: Test');
        expect(space.labels.some(l => l.includes('rapor'))).toBe(true);
        expect(space.labels).toContain('Sözcük: "aylık"'); // katlanmış kök ("aylik") yerine kayıtlardaki yazılış
        expect(space.labels.some(l => /sorumlu|kişi/i.test(l))).toBe(false);
        const x = encode(space, recordInput(h.records[0]));
        expect(x[space.priorityIndex + 1]).toBe(1); // jira tahmini (oranı var)
    });

    it('türe, birime ve metne göre efor; aralık, kapanma süresi, önem ve etkenler', () => {
        const m = trainEstimateModel(h.records, { now: new Date('2026-10-08T10:00:00Z') })!;
        expect(m).toMatchObject({ version: MODEL_VERSION, n: 240 });
        const feature = predictEstimate(m, { name: 'Aylık rapor geliştirmesi', issueType: 'feature', unit: 'Yazılım', projectId: h.records[0].projectId });
        const bug = predictEstimate(m, { name: 'Oturum ekranı hatası', issueType: 'bug', unit: 'Test', projectId: h.records[0].projectId });
        expect(feature.effort.likely).toBeGreaterThan(6); // 5 × 1,8 ≈ 9
        expect(bug.effort.likely).toBeLessThan(1.5); // 1,5 × 0,6 ≈ 0,9
        expect(feature.effort.best).toBeLessThanOrEqual(feature.effort.likely);
        expect(feature.effort.worst).toBeGreaterThan(feature.effort.likely);
        expect(feature.days.p80).toBeGreaterThanOrEqual(feature.days.p50);
        expect(feature.factors[0].effect).toBeGreaterThan(0);
        expect(feature.factors.map(f => f.label).join(' ')).toMatch(/Yeni özellik|rapor/);
        expect(bug.factors.some(f => f.effect < 0)).toBe(true);
        const urgent = predictEstimate(m, { name: 'Oturum ekranı hatası acil', issueType: 'bug', unit: 'Yazılım' });
        expect(urgent.priority?.value).toBe('Blocker');
        // Tür, taslakta ekip tahmini olmasa da metinden (geçmişteki kayıtların hepsi tahminli olsa da)
        expect(predictEstimate(m, { name: 'Oturum ekranı hatası', unit: 'Yazılım' }).issueType?.value).toBe('bug');
        // Ekip tahmini verilirse onu da kullanan model seçilir
        expect(m.estimated).not.toBeNull();
        expect(predictEstimate(m, { name: 'Oturum ekranı hatası', issueType: 'bug', unit: 'Yazılım', ownEstimateDays: 2 }).effort.likely).toBeGreaterThan(0);
        expect(importanceOf(m)[0].share).toBeGreaterThan(0.1);
        expect(trainEstimateModel(h.records.slice(0, MIN_TRAIN - 1))).toBeNull();
    });

    it('zaman ayrımlı sınama: geçmiş kayıt tahminiyle aynı kayıtlarda karşılaştırılır', () => {
        const run = evaluateEstimateModel(h, { now: new Date('2026-10-08T10:00:00Z'), id: 'r1' });
        expect(run.nTest).toBeGreaterThanOrEqual(20);
        expect(run.nTrain + 48).toBeLessThanOrEqual(240 + 1);
        expect(run.model.mae).not.toBeNull();
        expect(run.reference.mae).not.toBeNull();
        expect(run.model.mae!).toBeLessThan(run.reference.mae! * 1.5);
        expect(typeof run.better).toBe('boolean');
        expect(run.withEstimate.n).toBe(run.nTest); // sentetik kayıtların hepsinde ekip tahmini var
        expect(run.withEstimate.mae).not.toBeNull();
        expect(run.reasons[0]).toMatch(/Model efor hatası/);
        expect(run.importance.length).toBeGreaterThan(0);
        // Gelecek sızmaz: eğitim kümesinin hepsi sınamanın ilk kapanışından önce
        expect(h.records.filter(r => r.resolvedAt < run.cutoff)).toHaveLength(run.nTrain);
        const few = evaluateEstimateModel(synthetic(50));
        expect(few.better).toBeNull();
        expect(few.reasons[0]).toMatch(/en az 80/);
    });

    it('planlamada gösterim: politika, son sınama ve yeterli veri', () => {
        const run = (better: boolean | null, own: boolean | null = null, version = MODEL_VERSION) => ({ version, better, withEstimate: { better: own } } as ModelEvalRun);
        const none = { withEstimate: false, withoutEstimate: false };
        expect(modelEstimateEnabled({}, 100)).toEqual(none); // sınanmadı
        expect(modelEstimateEnabled({ modelEvals: [run(true)] }, 100)).toEqual({ withEstimate: false, withoutEstimate: true });
        expect(modelEstimateEnabled({ modelEvals: [run(false, true)] }, 100)).toEqual({ withEstimate: true, withoutEstimate: false });
        expect(modelEstimateEnabled({ modelEvals: [run(true), run(false)] }, 100)).toEqual(none);
        expect(modelEstimateEnabled({ modelEvals: [run(true, true, 'eski')] }, 100)).toEqual(none);
        expect(modelEstimateEnabled({ modelEvals: [run(true, true)] }, MIN_TRAIN - 1)).toEqual(none);
        expect(modelEstimateEnabled({ aiPolicy: { modelEstimate: 'on' } }, 100)).toEqual({ withEstimate: true, withoutEstimate: true });
        expect(modelEstimateEnabled({ aiPolicy: { modelEstimate: 'off' }, modelEvals: [run(true, true)] }, 100)).toEqual(none);
    });
});
