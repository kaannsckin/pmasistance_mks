import { describe, expect, it } from 'vitest';
import { WeeklyReport } from '../../types';
import { createReport, newItem } from '../weeklyReport';
import { DEFAULT_GATE, DEFAULT_REPORT_GATE, DEFAULT_SCORING, aiPolicyOf, updateAiPolicy } from './policy';
import { assessmentInput, assessmentUsable, finalizeAssessment, needsAssessment, parseAssessment, reportContentHash, ruleTextScore } from './reportAssessment';

const NOW = new Date(2026, 9, 7, 10);
const actor = { role: 'py' as const, personId: 'pm1', name: 'Ayşe Yılmaz' };
const report = (): WeeklyReport => ({
    ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week: 41 }, actor, NOW),
    thisWeek: [newItem('delivery', '6 Ekim 2026 tarihinde Gebze Belediyesine sürüm 2.3 teslim edildi.'), newItem('schedule_budget', 'Test ortamı kurulamadığı için entegrasyon testleri bir hafta ertelendi.')],
    nextWeek: [newItem('plan', '13 Ekim 2026 tarihinde kabul toplantısı yapılacak.')],
    pmScore: 9,
    pmScoreNote: 'Her şey yolunda.',
    planReview: [{ itemId: 'x', text: 'eski plan', status: 'done' }],
});

describe('assessmentInput', () => {
    it('yalnız rapor maddelerini verir; PY puanı ve plan değerlendirmesi girmez', () => {
        const input = assessmentInput({ name: 'Safir Posta', code: 'P-100' }, report());
        expect(input).toContain('Proje: Safir Posta (P-100)');
        expect(input).toContain('- [Müşteriye yapılan teslimatlar] 6 Ekim 2026 tarihinde Gebze Belediyesine sürüm 2.3 teslim edildi.');
        expect(input).toContain('- 13 Ekim 2026 tarihinde kabul toplantısı yapılacak.');
        expect(input).not.toContain('Her şey yolunda');
        expect(input).not.toContain('eski plan');
        expect(input).not.toMatch(/\b9\/10\b/);
    });
});

describe('parseAssessment', () => {
    it('puanı 1–10 tam sayıya sıkıştırır; birebir geçmeyen alıntıları ve bilinmeyen sinyalleri atar', () => {
        const r = report();
        const text = '```json\n{"puan": 6.6, "gerekce": "Teslimat var ancak  testler ertelendi.", "kanitlar": ["“entegrasyon testleri bir hafta ertelendi”", "Proje tamamen durdu", "kısa"], "sinyaller": ["takvim_kaymasi", "somut_teslimat", "uydurma", "takvim_kaymasi"]}\n```';
        const a = parseAssessment(text, r, NOW);
        expect(a).toEqual({
            score: 7,
            rationale: 'Teslimat var ancak testler ertelendi.',
            evidence: ['entegrasyon testleri bir hafta ertelendi'],
            signals: ['takvim_kaymasi', 'somut_teslimat'],
            at: NOW.toISOString(),
            inputHash: reportContentHash(r),
        });
        expect(parseAssessment('{"puan": 14}', r).score).toBe(10);
        expect(parseAssessment('{"puan": 0}', r).score).toBe(1);
    });

    it('puan yoksa ya da yanıt JSON değilse hata', () => {
        expect(() => parseAssessment('{"gerekce": "x"}', report())).toThrow('puan');
        expect(() => parseAssessment('Rapor iyi görünüyor.', report())).toThrow();
    });
});

describe('needsAssessment', () => {
    it('değerlendirmesi olmayan ya da içeriği sonradan değişen proje raporu', () => {
        const r = report();
        expect(needsAssessment(r)).toBe(true);
        const assessed = { ...r, aiAssessment: parseAssessment('{"puan": 8}', r, NOW) };
        expect(needsAssessment(assessed)).toBe(false);
        expect(needsAssessment({ ...assessed, pmScore: 3 })).toBe(false); // PY puanı metin değildir
        expect(needsAssessment({ ...assessed, nextWeek: [] })).toBe(true); // içerik değişti
        expect(needsAssessment({ ...r, thisWeek: [], nextWeek: [] })).toBe(false); // boş rapor
        expect(needsAssessment({ ...r, kind: 'department', projectId: undefined })).toBe(false);
    });
});

describe('halüsinasyon güvenceleri', () => {
    const run = (score: number, extra: Partial<{ kanitlar: string[]; sinyaller: string[] }> = {}) =>
        parseAssessment(JSON.stringify({ kanitlar: extra.kanitlar ?? ['Gebze Belediyesine sürüm 2.3 teslim edildi'], sinyaller: extra.sinyaller ?? ['somut_teslimat'], gerekce: `g${score}`, puan: score }), report(), NOW);

    it('kural tabanlı gösterge: somut/tarihli maddeler yükseltir, genel ifade ve olumsuzluk düşürür', () => {
        expect(ruleTextScore(report())).toBe(6); // 4 + 4×½ + 1 (tarihli plan) − 1,5 (erteleme)
        expect(ruleTextScore({ thisWeek: [newItem('ongoing', 'Geliştirme çalışmalarına devam edildi.')], nextWeek: [] })).toBe(2);
        expect(ruleTextScore({
            thisWeek: [newItem('delivery', '6 Ekim 2026 tarihinde sürüm teslim edildi.'), newItem('milestone', 'Faz 1 kabul edildi.'), newItem('invoice', '250.000 TL hakediş faturası kesildi.')],
            nextWeek: [newItem('plan', '13 Ekim 2026 tarihinde demo yapılacak.')],
        })).toBe(9);
        expect(ruleTextScore({ thisWeek: [], nextWeek: [] })).toBe(3);
    });

    it('tekrarlar: skor medyan, dağılım ve çoğunluk sinyalleri; tutarlıysa güven yüksek', () => {
        const a = finalizeAssessment([run(6), run(7), run(6)], report(), DEFAULT_SCORING, NOW);
        expect(a).toMatchObject({ score: 6, runs: [6, 7, 6], spread: 1, ruleScore: 6, flags: [], confidence: 'high', promptVersion: 'rapor-puan-2', signals: ['somut_teslimat'] });
        expect(a.rationale).toBe('g6');
    });

    it('tutarsız, kanıtsız, kurala uymayan ya da çelişkili puan düşük güvenlidir', () => {
        expect(finalizeAssessment([run(7), run(8), run(3)], report(), DEFAULT_SCORING, NOW).flags).toEqual(['inconsistent']);
        expect(finalizeAssessment([run(6, { kanitlar: ['rapörda olmayan uydurma cümle'] })], report(), DEFAULT_SCORING, NOW).flags).toEqual(['no_evidence']);
        expect(finalizeAssessment([run(10, { sinyaller: ['somut_teslimat'] })], report(), DEFAULT_SCORING, NOW).flags).toEqual([]); // fark 4 = sınır
        expect(finalizeAssessment([run(1)], report(), DEFAULT_SCORING, NOW).flags).toEqual(['rule_gap', 'signal_conflict']);
        const conflict = finalizeAssessment([run(9, { sinyaller: ['engel'] })], report(), { ...DEFAULT_SCORING, maxRuleGap: 9 }, NOW);
        expect(conflict).toMatchObject({ flags: ['signal_conflict'], confidence: 'low' });
        expect(assessmentUsable(conflict, { lowConfidence: 'exclude' })).toBe(false);
        expect(assessmentUsable(conflict, { lowConfidence: 'flag' })).toBe(true);
        expect(assessmentUsable(parseAssessment('{"puan": 8}', report(), NOW), { lowConfidence: 'exclude' })).toBe(true); // eski kayıt
    });
});

describe('AI politikası', () => {
    it('varsayılanlar ve sadeleştirme', () => {
        expect(aiPolicyOf(undefined)).toEqual({ enabled: true, chat: true, embedded: true, proposals: true, blindEstimate: true, estimateGate: DEFAULT_GATE, modelEstimate: 'auto', scoring: DEFAULT_SCORING, maskNames: true, reportGate: DEFAULT_REPORT_GATE, reportAutoRepair: false });
        // Ad maskeleme varsayılanda açık; yalnız kapatılınca saklanır
        expect(updateAiPolicy(undefined, { maskNames: false })).toEqual({ maskNames: false });
        expect(updateAiPolicy({ maskNames: false }, { maskNames: true })).toBeUndefined();
        expect(aiPolicyOf({ aiPolicy: { scoring: { runs: 4, minEvidence: 9, maxSpread: 0, maxRuleGap: 3, lowConfidence: 'flag' } } }).scoring)
            .toEqual({ runs: 3, minEvidence: 3, maxSpread: 1, maxRuleGap: 3, lowConfidence: 'flag' });
        let p = updateAiPolicy(undefined, { chat: false });
        expect(p).toEqual({ chat: false });
        p = updateAiPolicy(p, { scoring: { runs: 5 } });
        expect(p).toEqual({ chat: false, scoring: { ...DEFAULT_SCORING, runs: 5 } });
        expect(updateAiPolicy(p, { chat: true, scoring: { runs: 3 } })).toBeUndefined();
        // Kör tahmin varsayılanda açık; yalnız kapatılınca saklanır
        expect(updateAiPolicy(undefined, { blindEstimate: false })).toEqual({ blindEstimate: false });
        expect(updateAiPolicy({ blindEstimate: false }, { blindEstimate: true })).toBeUndefined();
        // Kalite kapısı: eşikler sınırlanır, varsayılana dönünce atılır
        const g = updateAiPolicy(undefined, { estimateGate: { enforce: true, minCoverage: 2 } });
        expect(g).toEqual({ estimateGate: { ...DEFAULT_GATE, enforce: true, minCoverage: 1 } });
        expect(updateAiPolicy(g, { estimateGate: { enforce: false, minCoverage: DEFAULT_GATE.minCoverage } })).toBeUndefined();
        // Model önerisi varsayılanda otomatik
        expect(updateAiPolicy(undefined, { modelEstimate: 'off' })).toEqual({ modelEstimate: 'off' });
        expect(updateAiPolicy({ modelEstimate: 'off' }, { modelEstimate: 'auto' })).toBeUndefined();
        // Rapor kalite kapısı: eşikler sınırlanır, varsayılana dönünce atılır
        const rg = updateAiPolicy(undefined, { reportGate: { enforce: true, maxUngroundedRate: 3 } });
        expect(rg).toEqual({ reportGate: { ...DEFAULT_REPORT_GATE, enforce: true, maxUngroundedRate: 1 } });
        expect(updateAiPolicy(rg, { reportGate: { enforce: false, maxUngroundedRate: DEFAULT_REPORT_GATE.maxUngroundedRate } })).toBeUndefined();
        // Rapor otomatik düzeltmesi varsayılanda kapalı; yalnız açılınca saklanır
        expect(updateAiPolicy(undefined, { reportAutoRepair: true })).toEqual({ reportAutoRepair: true });
        expect(updateAiPolicy({ reportAutoRepair: true }, { reportAutoRepair: false })).toBeUndefined();
    });
});

