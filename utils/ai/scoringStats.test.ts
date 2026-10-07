import { describe, expect, it } from 'vitest';
import { AiReportAssessment, PmoRating, WeeklyReport } from '../../types';
import { createReport } from '../weeklyReport';
import { scoringStats } from './scoringStats';

const NOW = new Date(2026, 9, 7, 10); // 41. hafta
const actor = { role: 'py' as const, personId: 'pm1', name: 'PY' };
const rep = (projectId: string, week: number, a: Partial<AiReportAssessment>): WeeklyReport => ({
    ...createReport({ kind: 'project', projectId, departmentCode: 'U310', year: 2026, week }, actor, NOW),
    aiAssessment: { score: 5, rationale: '', evidence: [], signals: [], at: '', inputHash: '', ...a },
});
const rating = (projectId: string, week: number, score: number): PmoRating => ({ id: `${projectId}${week}`, projectId, year: 2026, week, score, byRole: 'pyb_destek', at: '' });

describe('scoringStats', () => {
    it('güven, bayraklar, dağılım ve PMO uyumu; pencere dışı sayılmaz', () => {
        const s = scoringStats({
            weeklyReports: [
                rep('a', 41, { score: 8, runs: [8, 8, 7], spread: 1, ruleScore: 7, confidence: 'high', flags: [] }),
                rep('b', 41, { score: 3, runs: [3, 7, 4], spread: 4, ruleScore: 8, confidence: 'low', flags: ['inconsistent', 'rule_gap'] }),
                rep('a', 40, { score: 6 }), // eski tek değerlendirme
                rep('a', 20, { score: 9 }), // pencere dışı
            ],
            pmoRatings: [rating('a', 41, 7), rating('b', 41, 6)],
        }, NOW);
        expect(s).toMatchObject({ assessed: 3, low: 1, byFlag: { inconsistent: 1, rule_gap: 1 }, avgSpread: 2.5, pmo: { n: 2, mae: 2, r: null }, rule: { n: 2, mae: 3 } });
        expect(s.advice[0]).toMatch(/%33'inin güveni düşük/);
        expect(s.advice[1]).toMatch(/en az 10 eşleşen/);
    });

    it('yeterli eşleşmede büyük sapma uyarısı', () => {
        const reports = Array.from({ length: 10 }, (_, i) => rep(`p${i}`, 41, { score: 9, confidence: 'high' }));
        const s = scoringStats({ weeklyReports: reports, pmoRatings: reports.map((r, i) => rating(`p${i}`, 41, 4)) }, NOW);
        expect(s.pmo).toMatchObject({ n: 10, mae: 5 });
        expect(s.advice).toEqual([expect.stringMatching(/ortalama 5 puan sapıyor/)]);
    });
});
