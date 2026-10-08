import { describe, expect, it } from 'vitest';
import { EvalRun, Task, TaskStatus } from '../../types';
import { estimateGate, goldenJsonl } from '../ai/estimateEval';
import { DEFAULT_GATE } from '../ai/policy';
import { createProject } from '../workspace';
import {
    appendEvalRun, backtestRecord, backtestTargets, calibrationTrend, gateStatus, goldCases, goldenFromRecord, MIN_GATE_CASES, releaseCases,
    scoreGoldRun, scoreReleaseCase, summarizeRecordBacktest, summarizeReleaseBacktest,
} from './evaluation';
import { buildHistory } from './history';
import { runMonteCarlo } from './monteCarlo';

/** n iş günü süren kapanmış kayıt; `start` Pazartesi olmalı */
const closed = (id: string, start: string, days: number, extra: Partial<Task> = {}): Task => {
    const s = new Date(`${start}T09:00:00`);
    const e = new Date(s);
    let left = days - 1;
    while (left > 0) { e.setDate(e.getDate() + 1); if (e.getDay() % 6 !== 0) left--; }
    return {
        id, name: `Oturum ekranı hatası ${id}`, availability: true, priority: 'High', version: 0, predecessor: null, unit: 'Yazılım', resourceName: '',
        time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status: TaskStatus.Done, issueType: 'bug',
        createdAt: s.toISOString(), startedAt: s.toISOString(), resolvedAt: e.toISOString(), includeInSprints: false, ...extra,
    };
};
// Haftalık başlayan, 2–4 iş günü süren kayıtlar (Mart–Haziran 2026)
const weekly = (n: number, from = '2026-03-02') => Array.from({ length: n }, (_, i) => {
    const d = new Date(`${from}T09:00:00`);
    d.setDate(d.getDate() + i * 7);
    return closed(`k${i}`, d.toISOString().slice(0, 10), 2 + (i % 3));
});

describe('benzer kayıt tahmininin geriye dönük testi', () => {
    it('kayıt yalnız kendisinden önce kapanmış kayıtlarla tahmin edilir', () => {
        const h = buildHistory([createProject('P', { tasks: weekly(12) })]);
        const first = h.records.find(r => r.id === 'k0')!;
        const last = h.records.find(r => r.id === 'k11')!;
        expect(backtestRecord(first, h)).toBeNull(); // öncesinde kayıt yok
        const item = backtestRecord(last, h)!;
        expect(item).toMatchObject({ id: 'k11', actualDays: last.days });
        expect(item.p80).toBeGreaterThanOrEqual(item.p50);
        expect(backtestTargets(h, 3).map(r => r.id)).toEqual(['k11', 'k10', 'k9']);
    });

    it('özet: yüzdelik kapsama, hata, ekip tahmini karşılaştırması ve gruplar', () => {
        const items = Array.from({ length: 20 }, (_, i) => ({
            id: `x${i}`, unit: 'Yazılım', issueType: 'bug' as const, actualDays: i < 16 ? 3 : 9, actualEffort: 2, p50: 3, p80: 4, p90: 6,
            effort: { best: 1, likely: 2, worst: 3 }, teamEstimate: 4,
        }));
        const s = summarizeRecordBacktest(items, 2);
        expect(s).toMatchObject({ n: 20, skipped: 2, coverage: { p50: 0.8, p80: 0.8, p90: 0.8 }, effort: { mae: 0, coverage: 1 } });
        expect(s.vsTeam).toEqual({ n: 20, teamMae: 2, referenceMae: 0 });
        expect(s.groups[0]).toMatchObject({ label: 'Yazılım · Hata', n: 20, p80: 0.8 });
        expect(s.advice.join(' ')).toMatch(/dürüst/);
        expect(s.advice.join(' ')).toMatch(/Geçmiş kayıt tahmini, ekibin kendi tahmininden daha isabetli/);
    });
});

describe('sürüm simülasyonunun geriye dönük testi', () => {
    it('tamamlanmış sürüm, başladığı günkü verilerle simüle edilip gerçekle karşılaştırılır', () => {
        const done = [
            closed('a', '2026-09-07', 3, { version: 1, includeInSprints: true, resourceName: 'Ayşe' }),
            closed('b', '2026-09-07', 2, { version: 1, includeInSprints: true, resourceName: 'Ayşe' }),
            closed('c', '2026-09-08', 4, { version: 1, includeInSprints: true, resourceName: 'Ali' }),
        ];
        const open = { ...closed('d', '2026-09-21', 2, { version: 2, includeInSprints: true }), status: TaskStatus.ToDo, resolvedAt: undefined };
        const p = createProject('Geçmiş', {
            resources: [{ id: 'r1', name: 'Ayşe', participation: 100, unit: 'Yazılım', title: '' }, { id: 'r2', name: 'Ali', participation: 100, unit: 'Yazılım', title: '' }],
            tasks: [...weekly(10), ...done, open],
        });
        const h = buildHistory([p]);
        const cases = releaseCases([p], h, {}, { iterations: 300 });
        expect(cases).toHaveLength(1); // sürüm 2 açık
        const c = cases[0];
        expect(c).toMatchObject({ version: 1, start: '2026-09-07', taskCount: 3 });
        expect(c.actualOffset).toBeGreaterThan(0);
        const row = scoreReleaseCase(c, runMonteCarlo(c.input));
        expect(row.p80).toBeGreaterThanOrEqual(row.p50);
        expect(typeof row.hit80).toBe('boolean');
        const s = summarizeReleaseBacktest([row, { ...row, hit80: false }, { ...row, hit80: true }]);
        expect(s.n).toBe(3);
        expect(s.advice[0]).toMatch(/en az 5/);
    });
});

describe('kalibrasyon izleme', () => {
    it('birim × tür grubunda oran ve son dönem kayması', () => {
        // Tahmin 1 gün; eskiler 1 günde, son 90 gündekiler 3 günde kapanır → oran artar
        const old = Array.from({ length: 8 }, (_, i) => closed(`o${i}`, '2026-03-02', 1, { time: { best: 1, avg: 1, worst: 1 }, name: `Eski ${i}` }));
        const recent = Array.from({ length: 6 }, (_, i) => closed(`n${i}`, '2026-09-07', 3, { time: { best: 1, avg: 1, worst: 1 }, name: `Yeni ${i}` }));
        const h = buildHistory([createProject('K', { tasks: [...old, ...recent] })]);
        const rows = calibrationTrend(h, new Date('2026-10-08T10:00:00'));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ label: 'Yazılım · Hata', n: 14, recentN: 6 });
        expect(rows[0].drift!).toBeGreaterThan(0.5);
    });
});

describe('altın set ve kalite kapısı', () => {
    const setup = () => {
        const h = buildHistory([createProject('G', { tasks: weekly(16) })]);
        const golden = h.records.slice(0, 12).map(r => goldenFromRecord(r));
        return { h, golden, cases: goldCases(golden, h) };
    };

    it('kaydın kendisi geçmişten çıkarılır; önem ve tür taslağa girmez', () => {
        const { cases } = setup();
        expect(cases).toHaveLength(12);
        expect(cases.every(c => !c.ref.matches.some(m => m.record.id === c.record.id))).toBe(true);
        const line = JSON.parse(goldenJsonl(cases.slice(0, 1)));
        expect(line.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant']);
        expect(line.messages[1].content).not.toContain('Kullanıcının seçtiği tür');
        expect(JSON.parse(line.messages[2].content)).toMatchObject({ onem: 'High', tur: 'bug' });
    });

    it('eşiklere göre geçer ya da kalır; az örnekte karar verilmez', () => {
        const { cases } = setup();
        const meta = { id: 'e1', at: '2026-10-08T10:00:00Z', promptVersion: 'kayit-tahmin-1', model: 'm1' };
        const good = new Map(cases.map(c => [c.record.id, { effort: { best: c.record.effortDays * 0.5, likely: c.record.effortDays, worst: c.record.effortDays * 2 }, priority: 'High' as const, issueType: 'bug' as const, confidence: 'high' as const, unknownEvidence: false }]));
        const pass = scoreGoldRun(cases, good, DEFAULT_GATE, meta);
        expect(pass).toMatchObject({ passed: true, ai: { n: 12, mae: 0, coverage: 1, priorityAccuracy: 1, typeAccuracy: 1 } });
        const bad = new Map(cases.map(c => [c.record.id, { effort: { best: 20, likely: 30, worst: 40 }, priority: 'Low' as const, confidence: 'low' as const, unknownEvidence: true }]));
        const fail = scoreGoldRun(cases, bad, DEFAULT_GATE, meta);
        expect(fail.passed).toBe(false);
        expect(fail.reasons).toHaveLength(3);
        // Okunamayan önem yanlış sayılır; geçmiş kayıt ölçüsü yanıtlanan kayıtlarda
        const noPriority = new Map(cases.map(c => [c.record.id, { ...good.get(c.record.id)!, priority: undefined }]));
        const np = scoreGoldRun(cases, noPriority, DEFAULT_GATE, meta);
        expect(np).toMatchObject({ passed: false, ai: { priorityAccuracy: 0 } });
        const half = new Map([...good].slice(0, 10));
        expect(scoreGoldRun(cases, half, DEFAULT_GATE, meta).reference.mae).toBe(scoreGoldRun(cases.filter(c => half.has(c.record.id)), null, DEFAULT_GATE, meta).reference.mae);
        const few = new Map([...good].slice(0, MIN_GATE_CASES - 1));
        expect(scoreGoldRun(cases, few, DEFAULT_GATE, meta).passed).toBeNull();
        expect(scoreGoldRun(cases, null, DEFAULT_GATE, meta)).toMatchObject({ ai: null, passed: null });
    });

    it('kapı durumu istem sürümü ve modele göre; zorunluysa ve geçmediyse AI önerisi engellenir', () => {
        const run = (passed: boolean | null, model = 'm1'): EvalRun => ({ id: 'r', at: '', promptVersion: 'kayit-tahmin-1', model, n: 12, reference: { mae: 1, coverage: 1, priorityAccuracy: 1 }, ai: { n: 12, mae: 1, coverage: 1, priorityAccuracy: 1, typeAccuracy: 1, lowConfidence: 0, unknownEvidence: 0 }, passed, reasons: [] });
        expect(gateStatus([], 'kayit-tahmin-1').status).toBe('none');
        expect(gateStatus([run(true)], 'kayit-tahmin-1', 'm1').status).toBe('passed');
        expect(gateStatus([run(true), run(false)], 'kayit-tahmin-1', 'm1').status).toBe('failed');
        expect(gateStatus([run(true)], 'kayit-tahmin-1', 'm2').status).toBe('stale');
        expect(gateStatus([run(null)], 'kayit-tahmin-1').status).toBe('insufficient');
        // Karar veremeyen yeni koşu (AI çoğu kayıtta hata verdi) geçmeyen kapıyı kaldırmaz
        expect(gateStatus([run(false), run(null)], 'kayit-tahmin-1', 'm1').status).toBe('failed');
        expect(estimateGate({ evalRuns: [run(false), run(null)], aiPolicy: { estimateGate: { ...DEFAULT_GATE, enforce: true } } }, 'm1').blocked).toBe(true);
        expect(gateStatus([run(true)], 'kayit-tahmin-2').status).toBe('none');
        expect(estimateGate({ evalRuns: [run(false)] }, 'm1').blocked).toBe(false); // zorunlu değil
        expect(estimateGate({ evalRuns: [run(false)], aiPolicy: { estimateGate: { ...DEFAULT_GATE, enforce: true } } }, 'm1').blocked).toBe(true);
        expect(appendEvalRun(Array.from({ length: 60 }, () => run(true)), run(false))).toHaveLength(50);
    });
});
