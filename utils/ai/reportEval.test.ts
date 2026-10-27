import { describe, expect, it } from 'vitest';
import { ReportEvalRun, ReportItem, WeeklyReport, WorkspaceData } from '../../types';
import { createReport, newItem } from '../weeklyReport';
import { createEmptyWorkspace, createProject } from '../workspace';
import { DEFAULT_REPORT_GATE } from './policy';
import {
    addReportGolden, appendReportEvalRun, goldenBlocker, goldenCandidates, groundingIssues, MATCH_THRESHOLD, matchItems, MIN_REPORT_GATE_CASES,
    removeReportGolden, reportGateStatus, reportGateWarning, reportGoldenJsonl, ReportDraftScore, scoreReportDraft, summarizeReportEval,
} from './reportEval';
import { buildVariantRequest } from './reportVariants';
import { REPORT_PROMPT_VERSION } from './weeklyReportPrompt';

const it_ = (text: string, category: ReportItem['category'] = 'ongoing'): ReportItem => newItem(category, text);
const sug = (thisWeek: ReportItem[], nextWeek: ReportItem[] = []) => ({ thisWeek, nextWeek, abbreviations: [] });

const INPUT = `Proje: Safir Posta (P-100)
Hafta: 41. hafta (5–9 Ekim 2026)
Haftalık notlar:
- 06.10: Gebze Bld. demo yapıldı, Ürün Yön + PY katıldı. 50 kişilik on-prem pilot onaylandı, bütçe %15 arttı.
- 2. hakediş faturası 450.000 TL kesildi
Gelecek hafta planlanan görüşmeler:
- 2026-10-14 Kocaeli Valiliği: Kabul toplantısı`;

describe('dayanak denetimi', () => {
    it('girdide geçen tarih, rakam ve adlar dayanaklıdır (Türkçe yazım ve kısaltma açılımı)', () => {
        const s = sug([
            it_("6 Ekim 2026 tarihinde Gebze Belediyesi'ne Ürün Yönetimi ve Proje Yönetimi birimlerinin katılımıyla Safir Posta demosu yapıldı. 50 kişilik pilot kurulum kararlaştırıldı.", 'meeting'),
            it_('2. hakediş faturası (450.000 TL) kesildi; proje bütçesi %15 arttı.', 'invoice'),
        ], [it_('14.10.2026 tarihinde Kocaeli Valiliği ile kabul toplantısı yapılacak.', 'plan')]);
        const g = groundingIssues(s, INPUT, [{ abbr: 'TL', expansion: 'Türk Lirası' }]);
        expect(g.issues).toEqual([]);
        expect(g.checked).toBeGreaterThan(6);
    });

    it('girdide olmayan tarih, rakam ve ad yakalanır', () => {
        const s = sug([it_('10 Eylül 2026 tarihinde Ankara Büyükşehir ile 120 kişilik pilot konuşuldu.', 'meeting'), it_('Sözleşme 10/11 tarihinde imzalandı.', 'contract')]);
        const g = groundingIssues(s, INPUT);
        const values = g.issues.map(i => `${i.kind}:${i.value}`);
        expect(values).toContain('date:10 Eylül 2026');
        expect(values).toContain('number:120');
        expect(values).toContain('name:Ankara');
        expect(values).toContain('name:Büyükşehir');
        expect(values).toContain('date:10/11');
    });

    it('cümle başı sözcük, ay adları ve sözlükteki kısaltmalar ad sayılmaz', () => {
        const s = sug([it_('Bu hafta Ekim ayı planı İG (İş Geliştirme) ile görüşüldü.')]);
        const g = groundingIssues(s, 'Proje: X', [{ abbr: 'İG', expansion: 'İş Geliştirme' }]);
        expect(g.issues).toEqual([]);
    });

    it('binlik ayırıcı ve ondalık virgül normalleştirilir', () => {
        const g = groundingIssues(sug([it_('Tutar 1.250.000 TL, oran 2,5 puan.')]), 'tutar 1250000 ve 2,5', [{ abbr: 'TL', expansion: 'Türk Lirası' }]);
        expect(g.issues).toEqual([]);
    });
});

describe('eşleştirme ve puan', () => {
    it('açgözlü eşleştirme eşiği 0,5; her madde bir kez', () => {
        expect(MATCH_THRESHOLD).toBe(0.5);
        const ai = [it_('Gebze Belediyesi pilot kurulumu tamamlandı'), it_('Gebze Belediyesi pilot kurulumu planlandı'), it_('Fatura kesildi')];
        const gold = [it_('Gebze Belediyesi pilot kurulumu 12 Ekim tarihinde tamamlandı'), it_('Hakediş ödemesi alındı')];
        const m = matchItems(ai, gold);
        expect(m).toHaveLength(1);
        expect(m[0]).toMatchObject({ a: 0, g: 0 });
        // Eşik altı benzerlik eşleşmez
        expect(matchItems([it_('Demo yapıldı')], [it_('Demo yapıldı ve pilot için sunucu ihtiyacı belirlendi')], 0.9)).toHaveLength(0);
    });

    it('sahte yanıtla ölçüler deterministik', () => {
        const gold = { thisWeek: [it_('Safir Posta pilot kurulumu Gebze Belediyesi için onaylandı.', 'meeting'), it_('2. hakediş faturası 450.000 TL olarak kesildi.', 'invoice')], nextWeek: [it_('Kabul toplantısı yapılacak.', 'plan')] };
        const s = { ...sug([it_('Safir Posta pilot kurulumu Gebze Belediyesi için onaylandı.', 'delivery'), it_('Bazı geliştirmelere devam edildi.')], [it_('Kabul toplantısı yapılacak.', 'plan')]), missing: ['Tarih?'] };
        const a = scoreReportDraft({ suggestion: s, gold, input: INPUT });
        const b = scoreReportDraft({ suggestion: s, gold, input: INPUT });
        expect(a).toEqual(b);
        expect(a).toMatchObject({ aiItems: 3, goldItems: 3, matched: 2, recall: 0.67, precision: 0.67, categoryMatched: 1, categoryCorrect: 0, categoryAccuracy: 0, missing: 1, ungrounded: 0 });
        expect(a.lintWarnings).toBeGreaterThan(0);
    });
});

const score = (o: Partial<ReportDraftScore>): ReportDraftScore => ({
    lintErrors: 0, lintWarnings: 0, unknownAbbr: 0, facts: 10, ungrounded: 0, ungroundedRate: 0, aiItems: 4, goldItems: 4, matched: 3,
    recall: 0.75, precision: 0.75, categoryMatched: 2, categoryCorrect: 2, categoryAccuracy: 1, missing: 0, issues: [], ...o,
});
const meta = { id: 'e', at: '2026-10-09T00:00:00Z', promptVersion: REPORT_PROMPT_VERSION, variant: 'full' as const, model: 'm1' };

describe('kalite kapısı', () => {
    it('yetersiz örnekte karar yok', () => {
        const run = summarizeReportEval(Array.from({ length: MIN_REPORT_GATE_CASES - 1 }, () => score({})), DEFAULT_REPORT_GATE, meta);
        expect(run.passed).toBeNull();
        expect(run.reasons[0]).toMatch(/Yetersiz örnek/);
    });

    it('eşikler: format hatası, dayanaksız bilgi, kapsama', () => {
        const ok = summarizeReportEval(Array.from({ length: 5 }, () => score({})), DEFAULT_REPORT_GATE, meta);
        expect(ok.passed).toBe(true);
        expect(ok.metrics).toMatchObject({ recall: 0.75, precision: 0.75, categoryAccuracy: 1, ungroundedRate: 0, lintErrorsPerReport: 0 });
        const bad = summarizeReportEval([...Array.from({ length: 4 }, () => score({})), score({ lintErrors: 3, ungrounded: 5, matched: 0 })], DEFAULT_REPORT_GATE, { ...meta, failed: 2 });
        expect(bad.passed).toBe(false);
        expect(bad.metrics.lintErrorsPerReport).toBe(0.6);
        expect(bad.metrics.ungroundedRate).toBe(0.1);
        expect(bad.metrics.recall).toBe(0.6);
        expect(bad.reasons.join(' ')).toMatch(/format hatası.*Dayanaksız/);
        expect(bad.reasons.join(' ')).toMatch(/2 raporda yanıt alınamadı/);
        const strict = summarizeReportEval(Array.from({ length: 5 }, () => score({})), { ...DEFAULT_REPORT_GATE, minRecall: 0.8 }, meta);
        expect(strict.passed).toBe(false);
    });

    it('kapı durumu: üretim varyantı, sürüm ve model değişince bayat, son kararlı koşu', () => {
        const run = (o: Partial<ReportEvalRun>): ReportEvalRun => ({ ...summarizeReportEval(Array.from({ length: 5 }, () => score({})), DEFAULT_REPORT_GATE, meta), ...o });
        expect(reportGateStatus([], REPORT_PROMPT_VERSION).status).toBe('none');
        expect(reportGateStatus([run({ variant: 'base' })], REPORT_PROMPT_VERSION).status).toBe('none');
        expect(reportGateStatus([run({ passed: true })], REPORT_PROMPT_VERSION, 'm1').status).toBe('passed');
        expect(reportGateStatus([run({ passed: true })], 'rapor-taslak-9', 'm1').status).toBe('stale');
        expect(reportGateStatus([run({ passed: true })], REPORT_PROMPT_VERSION, 'm2').status).toBe('stale');
        expect(reportGateStatus([run({ passed: false }), run({ passed: null })], REPORT_PROMPT_VERSION, 'm1').status).toBe('failed');
        expect(reportGateStatus([run({ passed: null })], REPORT_PROMPT_VERSION).status).toBe('insufficient');
    });

    it('uyarı yalnız kapı zorunlu ve geçilmediyse; öneri engellenmez', () => {
        const runs = [{ ...summarizeReportEval(Array.from({ length: 5 }, () => score({ matched: 0 })), DEFAULT_REPORT_GATE, meta) }];
        expect(runs[0].passed).toBe(false);
        expect(reportGateWarning({ reportEvalRuns: runs }, 'm1')).toBeNull();
        expect(reportGateWarning({ reportEvalRuns: runs, aiPolicy: { reportGate: { ...DEFAULT_REPORT_GATE, enforce: true } } }, 'm1')).toMatch(/kalite kapısından geçmedi/);
    });

    it('koşu kaydı en çok 50', () => {
        let runs: ReportEvalRun[] = [];
        for (let i = 0; i < 55; i++) runs = appendReportEvalRun(runs, { ...summarizeReportEval([], DEFAULT_REPORT_GATE, meta), id: String(i) });
        expect(runs).toHaveLength(50);
        expect(runs[49].id).toBe('54');
    });
});

// ---------------------------------------------------------------- altın set ve zaman ayrımı

const py = { role: 'py' as const, personId: 'pm1', name: 'Ayşe Yılmaz' };
const steward = { role: 'pyb_destek' as const };
const approved = (id: string, week: number, patch: Partial<WeeklyReport> = {}): WeeklyReport => ({
    ...createReport({ kind: 'project', projectId: 'a', departmentCode: 'U310', year: 2026, week }, py),
    id, stage: 'approved',
    thisWeek: [newItem('delivery', `Hafta ${week}: Sürüm teslim edildi (Ayşe Yılmaz onayladı) 12 Ekim 2026.`)],
    nextWeek: [newItem('plan', '14 Ekim 2026 tarihinde kabul toplantısı yapılacak.')],
    aiDraft: { generatedAt: '', input: `Proje: Safir Posta\nHafta: ${week}\nNot: Ayşe Yılmaz teslim etti`, output: '{}' },
    ...patch,
});

const goldWs = (): WorkspaceData => {
    const a = createProject('Safir Posta'); a.id = 'a'; a.pmPersonId = 'pm1';
    return {
        ...createEmptyWorkspace(),
        projects: [a],
        people: [{ id: 'pm1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U310', availableAA: 1, roles: [] }],
        weeklyReports: [approved('w39', 39), approved('w40', 40), approved('w41', 41), approved('w42', 42), approved('noin', 38, { aiDraft: undefined })],
    };
};

describe('altın set', () => {
    it('yalnız PYB destek, onaylı ve girdisi olan rapor; gerekçe', () => {
        const ws = goldWs();
        expect(addReportGolden(ws, { role: 'py' }, 'w41', 'X')).toBeNull();
        expect(goldenBlocker(ws, ws.weeklyReports!.find(r => r.id === 'noin')!)).toMatch(/Girdisi yok/);
        expect(addReportGolden(ws, steward, 'noin', 'X')).toBeNull();
        const items = addReportGolden(ws, steward, 'w41', 'Destek')!;
        expect(items).toHaveLength(1);
        expect(goldenBlocker({ ...ws, reportGoldenSet: items }, ws.weeklyReports!.find(r => r.id === 'w41')!)).toMatch(/Zaten/);
        expect(removeReportGolden({ ...ws, reportGoldenSet: items }, steward, 'w41')).toEqual([]);
        expect(removeReportGolden({ ...ws, reportGoldenSet: items }, { role: 'py' }, 'w41')).toBeNull();
    });

    it('adaylar: iadesi olan ve girdisi olmayan rapor önerilmez', () => {
        const ws = goldWs();
        ws.weeklyReports![0].history.push({ at: '', action: 'return', byRole: 'bolum_sorumlu' });
        expect(goldenCandidates(ws).map(r => r.id)).toEqual(['w42', 'w41', 'w40']);
    });

    it('zaman ayrımı: üslup örnekleri yalnız o haftadan önce onaylananlar, rapor kendisi hariç', () => {
        const ws = goldWs();
        const w41 = ws.weeklyReports!.find(r => r.id === 'w41')!;
        const req = buildVariantRequest({ variant: 'full', ws, report: w41, input: 'GİRDİ' });
        expect(req.prompt).toContain('Hafta 40:');
        expect(req.prompt).toContain('Hafta 39:');
        expect(req.prompt).not.toContain('Hafta 41:');
        expect(req.prompt).not.toContain('Hafta 42:');
        expect(buildVariantRequest({ variant: 'base', ws, report: w41, input: 'GİRDİ' }).prompt).not.toContain('Hafta 40:');
        const ft = buildVariantRequest({ variant: 'ft', ws, report: w41, input: 'GİRDİ' }).prompt;
        expect(ft).not.toContain('ÖRNEK GİRDİ');
        expect(ft).toContain('ŞİMDİKİ GİRDİ');
    });

    it('JSONL: kişi adları maskeli, hedef onaylı son hâl', () => {
        const ws = { ...goldWs(), reportGoldenSet: [{ reportId: 'w41', addedAt: '' }, { reportId: 'yok', addedAt: '' }] };
        const out = reportGoldenJsonl(ws);
        expect(out.n).toBe(1);
        expect(out.jsonl).not.toMatch(/Ayşe Yılmaz/);
        expect(out.redactions).toBeGreaterThan(0);
        const line = JSON.parse(out.jsonl);
        expect(JSON.parse(line.messages[2].content).buHafta[0].tur).toBe('delivery');
    });
});
