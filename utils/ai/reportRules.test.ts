import { describe, expect, it } from 'vitest';
import { LearnedRule, ReportAiLogEntry, ReportItem, ReportSettings, WeeklyReport } from '../../types';
import { createReport, DEFAULT_REPORT_SETTINGS, newItem } from '../weeklyReport';
import { activeRulesFor, LEARNED_RULES_HEADER, reportSystemFor, RULES_PER_SCOPE } from './reportGuide';
import {
    applyRuleAction, buildRulePrompt, editRuleCandidates, LINT_RULE_TEXT, lintRuleCandidates, mergeCandidates, parseRuleSuggestions, RULE_MIN_EVIDENCE, ruleActionLabel, ruleEvidence,
} from './reportRules';

const NOW = new Date('2026-10-09T10:00:00Z');
const steward = { role: 'pyb_destek' as const };

const submitted = (reportId: string, dept: string, codes: string[], at = '2026-10-08T10:00:00Z'): ReportAiLogEntry => ({
    at, reportId, departmentCode: dept, promptVersion: 'v', outcome: 'submitted', nThis: 1, nNext: 1, lintErrors: 0, lintWarnings: 0,
    lintCodes: Object.fromEntries(codes.map(c => [c, 1])),
});

describe('lint adayları', () => {
    it('eşik bölüm bazında; rapor başına bir kez; iade sonrası son gönderim', () => {
        const log = [
            submitted('r1', 'U310', ['abbr']), submitted('r2', 'U310', ['abbr', 'vague']), submitted('r3', 'U310', ['abbr']),
            submitted('r4', 'U320', ['abbr']),
            // r5 ilk gönderimde abbr vardı, son gönderimde yok
            submitted('r5', 'U320', ['abbr']), submitted('r5', 'U320', [], '2026-10-09T10:00:00Z'),
        ];
        const c = lintRuleCandidates({ reportAiLog: log });
        expect(RULE_MIN_EVIDENCE).toBe(3);
        expect(c).toEqual([{ id: 'lint:abbr:department:U310', text: LINT_RULE_TEXT.abbr, scope: 'department', scopeId: 'U310', source: 'lint', evidenceCount: 3 }]);
    });

    it('iki bölümde eşiği geçen sorun kurum geneli aday olur', () => {
        const log = ['a', 'b', 'c'].flatMap(k => [submitted(`x${k}`, 'U310', ['generic']), submitted(`y${k}`, 'U320', ['generic'])]);
        const c = lintRuleCandidates({ reportAiLog: log });
        expect(c).toEqual([{ id: 'lint:generic:institution:', text: LINT_RULE_TEXT.generic, scope: 'institution', source: 'lint', evidenceCount: 6 }]);
    });
});

describe('düzenleme adayları', () => {
    const ai = (before: string, after: string): ReportItem => ({ ...newItem('ongoing', after, { source: 'ai' }), aiOriginal: { text: before, category: 'ongoing' } });
    const rep = (id: string, dept: string, items: ReportItem[], output = '{}', stage: WeeklyReport['stage'] = 'bs_review'): WeeklyReport => ({
        ...createReport({ kind: 'project', projectId: 'p', departmentCode: dept, year: 2026, week: 41 }, { role: 'py' }), id, stage, thisWeek: items, nextWeek: [],
        aiDraft: { generatedAt: '', input: '', output, itemIds: items.map(i => i.id) },
    });
    it('belirsiz ifade kaldırma, tarih ekleme ve rutin madde silme sayılır', () => {
        const reports = [1, 2, 3].map(k => rep(`r${k}`, 'U310', [
            ai('Bazı geliştirmeler yapıldı.', `Safir Posta arşiv modülü ${k}. sürümü 7 Ekim 2026 tarihinde teslim edildi.`),
        ], JSON.stringify({ buHafta: [{ tur: 'ongoing', metin: 'Bazı geliştirmeler yapıldı.' }, { tur: 'ongoing', metin: 'Sprint planlama toplantısı yapıldı.' }] })));
        const c = editRuleCandidates({ weeklyReports: [...reports, rep('draft', 'U310', [ai('Bazı işler.', '7 Ekim 2026 iş.')], '{}', 'draft')] });
        const ids = c.map(x => x.id).sort();
        expect(ids).toEqual(['edit:date_added:department:U310', 'edit:routine_deleted:department:U310', 'edit:vague_removed:department:U310']);
        expect(c.find(x => x.id.startsWith('edit:routine'))!.examples![0]).toMatch(/^Silindi: Sprint planlama/);
        expect(c.every(x => x.evidenceCount === 3)).toBe(true);
    });
    it('eşik altı aday yok', () => {
        expect(editRuleCandidates({ weeklyReports: [rep('r', 'U310', [ai('Bazı işler yapıldı.', 'Kabul 7 Ekim 2026 tarihinde yapıldı.')])] })).toEqual([]);
    });
});

describe('kural yönetimi ve isteme ekleme', () => {
    const s0: ReportSettings = { ...DEFAULT_REPORT_SETTINGS };
    it('yalnız PYB destek; aday öneri olur, onaysız isteme girmez', () => {
        const log = [1, 2, 3].map(k => submitted(`r${k}`, 'U310', ['abbr']));
        expect(applyRuleAction(s0, { reportAiLog: log }, { role: 'bolum_sorumlu' }, { kind: 'refresh' })).toBeNull();
        const s1 = applyRuleAction(s0, { reportAiLog: log }, steward, { kind: 'refresh' }, 'Destek', NOW)!;
        expect(s1.learnedRules).toHaveLength(1);
        expect(s1.learnedRules![0]).toMatchObject({ status: 'proposed', source: 'lint', scope: 'department', scopeId: 'U310' });
        expect(activeRulesFor(s1, 'U310')).toEqual([]);
        expect(reportSystemFor(s1, 'U310')).not.toContain(LEARNED_RULES_HEADER);
        const s2 = applyRuleAction(s1, {}, steward, { kind: 'status', id: s1.learnedRules![0].id, status: 'active' }, 'Destek', NOW)!;
        expect(s2.learnedRules![0].approvedByName).toBe('Destek');
        expect(reportSystemFor(s2, 'U310')).toContain(`${LEARNED_RULES_HEADER}\n- ${LINT_RULE_TEXT.abbr}`);
        // Kapsam süzgeci: başka bölüm görmez
        expect(reportSystemFor(s2, 'U320')).not.toContain(LEARNED_RULES_HEADER);
        // Yeniden üretim etkin kurala dokunmaz
        const s3 = applyRuleAction(s2, { reportAiLog: [...log, submitted('r9', 'U310', ['abbr'])] }, steward, { kind: 'refresh' }, undefined, NOW)!;
        expect(s3.learnedRules![0]).toMatchObject({ status: 'active', evidenceCount: 3 });
        const retired = applyRuleAction(s3, {}, steward, { kind: 'status', id: s3.learnedRules![0].id, status: 'retired' })!;
        expect(activeRulesFor(retired, 'U310')).toEqual([]);
    });

    it('elle ekleme doğrudan etkin; kapsam ve proje süzgeci; kapsam başına en çok 10', () => {
        let s = applyRuleAction(s0, {}, steward, { kind: 'add', text: 'Proje kuralı', scope: 'project', scopeId: 'p1' }, 'Destek', NOW)!;
        expect(applyRuleAction(s0, {}, steward, { kind: 'add', text: 'x', scope: 'department' })).toBeNull(); // bölüm yok
        for (let i = 0; i < RULES_PER_SCOPE + 3; i++) s = applyRuleAction(s, {}, steward, { kind: 'add', text: `Kurum kuralı ${i}`, scope: 'institution' }, undefined, NOW)!;
        expect(activeRulesFor(s, 'U310', 'p1').filter(t => t.startsWith('Kurum'))).toHaveLength(RULES_PER_SCOPE);
        expect(activeRulesFor(s, 'U310', 'p1')).toContain('Proje kuralı');
        expect(activeRulesFor(s, 'U310', 'p2')).not.toContain('Proje kuralı');
        const id = s.learnedRules![0].id;
        const edited = applyRuleAction(s, {}, steward, { kind: 'edit', id, text: '  Yeni metin  ' })!;
        expect(edited.learnedRules![0].text).toBe('Yeni metin');
        expect(ruleActionLabel({ kind: 'edit', id, text: '' }, edited)).toBe('Kural düzenlendi: Yeni metin');
    });

    it('birleştirme: mevcut öneri güncellenir, yeni aday eklenir', () => {
        const base: LearnedRule[] = [{ id: 'a', text: 'A', scope: 'institution', source: 'lint', status: 'proposed', evidenceCount: 3, createdAt: '' }];
        const out = mergeCandidates(base, [{ id: 'a', text: 'A', scope: 'institution', source: 'lint', evidenceCount: 5 }, { id: 'b', text: 'B', scope: 'institution', source: 'edit', evidenceCount: 4 }], NOW);
        expect(out.map(r => [r.id, r.evidenceCount, r.status])).toEqual([['a', 5, 'proposed'], ['b', 4, 'proposed']]);
    });
});

describe('AI destekli adaylar', () => {
    it('kanıt: iade notları ve düzeltme çiftleri; istem ve çözümleme (en çok 5, tekrar yok)', () => {
        const r: WeeklyReport = {
            ...createReport({ kind: 'project', projectId: 'p', departmentCode: 'U310', year: 2026, week: 41 }, { role: 'py' }), stage: 'approved',
            thisWeek: [{ ...newItem('ongoing', 'Kabul testleri 7 Ekim 2026 tarihinde tamamlandı.'), aiOriginal: { text: 'Testler yapıldı.', category: 'ongoing' } }],
        };
        r.history.push({ at: '', action: 'return', byRole: 'bolum_sorumlu', note: 'Fatura tutarı eksik.' });
        const e = ruleEvidence({ weeklyReports: [r] });
        expect(e.returnNotes).toEqual(['Fatura tutarı eksik.']);
        expect(e.edits).toEqual([{ ai: 'Testler yapıldı.', approved: 'Kabul testleri 7 Ekim 2026 tarihinde tamamlandı.' }]);
        expect(buildRulePrompt(e)).toContain('İADE NOTLARI:\n- Fatura tutarı eksik.');
        const parsed = parseRuleSuggestions('{"kurallar":[{"metin":"Fatura maddesinde tutar yaz.","kanit":3},{"metin":"fatura maddesinde tutar yaz."},"Test maddesinde tarih ver.",{"metin":""},{"metin":"4"},{"metin":"5"},{"metin":"6"}]}', NOW);
        expect(parsed.map(p => p.text)).toEqual(['Fatura maddesinde tutar yaz.', 'Test maddesinde tarih ver.', '4', '5', '6']);
        expect(parsed[0]).toMatchObject({ source: 'return', scope: 'institution', evidenceCount: 3 });
        expect(() => parseRuleSuggestions('üzgünüm')).toThrow();
        const s = applyRuleAction({ ...DEFAULT_REPORT_SETTINGS }, {}, steward, { kind: 'candidates', candidates: parsed }, undefined, NOW)!;
        expect(s.learnedRules!.every(x => x.status === 'proposed')).toBe(true);
    });
});
