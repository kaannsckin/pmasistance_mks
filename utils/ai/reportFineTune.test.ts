import { describe, expect, it } from 'vitest';
import { ReportEvalRun, WeeklyReport, WorkspaceData } from '../../types';
import { createReport, newItem } from '../weeklyReport';
import { createEmptyWorkspace, createProject } from '../workspace';
import { DEFAULT_REPORT_GATE } from './policy';
import { buildReportFineTuneDataset, REPORT_FT_GOOD, REPORT_FT_MIN, REPORT_FT_MIN_GOLDEN, reportFineTuneReadiness, reportFineTuneSelection } from './reportFineTune';
import { reportConfigVersion } from './reportGuide';
import { ReportDraftScore, summarizeReportEval } from './reportEval';

const py = { role: 'py' as const, personId: 'pm1' };

const rep = (id: string, week: number, patch: Partial<WeeklyReport> = {}): WeeklyReport => ({
    ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week }, py),
    id, stage: 'approved',
    thisWeek: [newItem('meeting', `${week % 28 + 1} Ekim 2026 tarihinde Gebze Belediyesi ile Safir Posta demosu yapıldı; Ayşe Yılmaz sundu.`)],
    nextWeek: [newItem('plan', 'Kabul toplantısı yapılacak.')],
    aiDraft: { generatedAt: '', input: `Proje: Safir Posta\nHafta: ${week}\nNot: Ayşe Yılmaz Gebze demosunu yaptı`, output: '{}', promptVersion: 'rapor-taslak-2' },
    ...patch,
});

const ws = (reports: WeeklyReport[], golden: string[] = []): WorkspaceData => {
    const a = createProject('Safir Posta'); a.id = 'a'; a.pmPersonId = 'pm1';
    return {
        ...createEmptyWorkspace(),
        projects: [a],
        people: [{ id: 'pm1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] }],
        departments: [{ code: 'U310', name: 'Yazılım' }],
        weeklyReports: reports,
        reportGoldenSet: golden.map(reportId => ({ reportId, addedAt: '' })),
    };
};

describe('rapor ince ayar veri kümesi', () => {
    it('süzgeçler: altın set, girdisiz, format hatalı, tekrar girdi, taslak', () => {
        const reports = [
            rep('g', 1), rep('noin', 2, { aiDraft: undefined }), rep('lint', 3, { thisWeek: [newItem('ongoing', 'KYS geliştirmesi.')] }),
            rep('dup1', 4, { aiDraft: { generatedAt: '', input: 'AYNI', output: '' } }), rep('dup2', 5, { aiDraft: { generatedAt: '', input: 'AYNI', output: '' } }),
            rep('ok', 6), rep('draft', 7, { stage: 'draft' }),
        ];
        const sel = reportFineTuneSelection(ws(reports, ['g']));
        expect(sel.examples.map(r => r.id)).toEqual(['dup2', 'ok']);
        expect(sel).toMatchObject({ excludedGolden: 1, noInput: 1, lintFailed: 1, duplicates: 1 });
    });

    it('gerçek kişi adı geçmez; proje/kurum maskesi isteğe bağlı; istem eşitliği (ft); zaman ayrımı', () => {
        const reports = Array.from({ length: 20 }, (_, k) => rep(`r${k}`, 10 + k));
        const d = buildReportFineTuneDataset(ws([...reports].reverse(), ['r0']));
        const all = `${d.train}\n${d.validation}`;
        expect(all).not.toMatch(/Ayşe Yılmaz/);
        expect(all).not.toMatch(/Safir Posta/);
        expect(d.stats.personRedactions).toBeGreaterThan(0);
        expect(d.stats.entityMasks).toBeGreaterThan(0);
        expect(d.stats).toMatchObject({ train: 16, validation: 3, excludedGolden: 1 });
        // Doğrulama zamanca en yeni haftalar
        expect(d.card.donem).toEqual({ egitim: ['2026-H11', '2026-H26'], dogrulama: ['2026-H27', '2026-H29'] });
        const first = JSON.parse(d.train.split('\n')[0]);
        expect(first.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant']);
        expect(first.messages[1].content).not.toContain('ÖRNEK GİRDİ');
        expect(JSON.parse(first.messages[2].content).buHafta[0].tur).toBe('meeting');
        const unmasked = buildReportFineTuneDataset(ws(reports), { maskEntities: false });
        expect(unmasked.train).toContain('Safir Posta');
        expect(unmasked.train).not.toMatch(/Ayşe Yılmaz/);
    });
});

const score = (o: Partial<ReportDraftScore> = {}): ReportDraftScore => ({
    lintErrors: 0, lintWarnings: 0, unknownAbbr: 0, facts: 10, ungrounded: 0, ungroundedRate: 0, aiItems: 4, goldItems: 4, matched: 3,
    recall: 0.75, precision: 0.75, categoryMatched: 2, categoryCorrect: 2, categoryAccuracy: 1, missing: 0, issues: [], ...o,
});
const runOf = (passed: boolean, version = reportConfigVersion(undefined)): ReportEvalRun =>
    summarizeReportEval(Array.from({ length: 5 }, () => score(passed ? {} : { matched: 0 })), DEFAULT_REPORT_GATE, { id: 'e', at: '', promptVersion: version, variant: 'full', model: 'm' });

describe('ince ayar karar kartı', () => {
    const golden = (n: number) => Array.from({ length: n }, (_, k) => `x${k}`);
    const many = (n: number) => Array.from({ length: n }, (_, k) => rep(`t${k}`, 1 + (k % 50), { aiDraft: { generatedAt: '', input: `girdi ${k}`, output: '' } }));

    it('değerlendirme yok / bayat / altın set küçük → veri yetersiz', () => {
        expect(reportFineTuneReadiness(ws([], golden(30)), 'm').verdict).toBe('not_ready');
        expect(reportFineTuneReadiness({ ...ws([], golden(30)), reportEvalRuns: [runOf(true, 'eski')] }, 'm').verdict).toBe('not_ready');
        expect(reportFineTuneReadiness({ ...ws([], golden(REPORT_FT_MIN_GOLDEN - 1)), reportEvalRuns: [runOf(true)] }, 'm').verdict).toBe('not_ready');
    });

    it('kapıdan geçiyorsa gerek yok; geride ve veri yeterliyse önerilir; sınırdaysa düşünülebilir', () => {
        expect(reportFineTuneReadiness({ ...ws([], golden(30)), reportEvalRuns: [runOf(true)] }, 'm').verdict).toBe('not_needed');
        expect(reportFineTuneReadiness({ ...ws(many(10), golden(30)), reportEvalRuns: [runOf(false)] }, 'm').verdict).toBe('not_ready');
        expect(reportFineTuneReadiness({ ...ws(many(REPORT_FT_MIN), golden(30)), reportEvalRuns: [runOf(false)] }, 'm').verdict).toBe('consider');
        expect(reportFineTuneReadiness({ ...ws(many(REPORT_FT_GOOD), golden(60)), reportEvalRuns: [runOf(false)] }, 'm').verdict).toBe('recommended');
    });
});
