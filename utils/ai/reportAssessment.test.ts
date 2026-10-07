import { describe, expect, it } from 'vitest';
import { WeeklyReport } from '../../types';
import { createReport, newItem } from '../weeklyReport';
import { assessmentInput, needsAssessment, parseAssessment, reportContentHash } from './reportAssessment';

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
