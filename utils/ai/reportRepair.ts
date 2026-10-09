import { Abbreviation, ReportItem } from '../../types';
import { lintCounts, LintIssue, lintReport } from '../weeklyReport';
import { GroundingIssue, groundingIssues } from './reportEval';
import { reportAnswer } from './weeklyReportPrompt';

/**
 * Rapor önerisinin çıktı denetimi ve tek turluk otomatik düzeltme. Öneri,
 * kullanıcıya gösterilmeden önce kılavuz denetiminden (lintReport; kurum
 * sözlüğü + önerinin kendi kısaltmaları) ve dayanak denetiminden
 * (groundingIssues) geçer. Admin açtıysa ve hata ya da dayanaksız bilgi
 * varsa model bir kez daha çağrılır: önceki JSON ve sorun listesi verilir,
 * yalnız bu sorunları düzeltmesi istenir. Yeni sonuç daha kötüyse ilk sonuç
 * gösterilir. En çok bir tur yapılır.
 */

export interface SuggestionLike {
    thisWeek: ReportItem[];
    nextWeek: ReportItem[];
    abbreviations: Abbreviation[];
}

export interface SuggestionCheck {
    lint: LintIssue[];
    grounding: GroundingIssue[];
    errors: number;
    warnings: number;
    ungrounded: number;
}

export const checkSuggestion = (s: SuggestionLike, input: string, dictionary: Abbreviation[] = []): SuggestionCheck => {
    const lint = lintReport(s, dictionary);
    const c = lintCounts(lint);
    const grounding = groundingIssues(s, input, dictionary).issues;
    return { lint, grounding, errors: c.errors, warnings: c.warnings, ungrounded: grounding.length };
};

/** Düzeltme turu gerekir mi: format hatası ya da dayanaksız bilgi */
export const needsRepair = (c: SuggestionCheck): boolean => c.errors > 0 || c.ungrounded > 0;

/** Önizleme özeti: "2 format hatası, 1 uyarı, 1 dayanaksız bilgi" */
export const checkSummary = (c: SuggestionCheck): string => {
    const parts = [
        c.errors ? `${c.errors} format hatası` : '',
        c.warnings ? `${c.warnings} uyarı` : '',
        c.ungrounded ? `${c.ungrounded} dayanaksız bilgi` : '',
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Format ve dayanak denetiminden geçti';
};

const KIND_LABEL: Record<GroundingIssue['kind'], string> = { number: 'rakam', date: 'tarih', name: 'ad' };

/** Sorunların madde konumlu listesi (düzeltme istemi için) */
export const issueLines = (s: SuggestionLike, c: SuggestionCheck): string[] => {
    const where = (id?: string) => {
        if (!id) return 'Genel';
        const t = s.thisWeek.findIndex(i => i.id === id);
        if (t >= 0) return `buHafta[${t + 1}]`;
        const n = s.nextWeek.findIndex(i => i.id === id);
        return n >= 0 ? `gelecekHafta[${n + 1}]` : 'Genel';
    };
    return [
        ...c.lint.filter(i => i.level === 'error').map(i => `- ${where(i.itemId)}: ${i.message}`),
        ...c.grounding.map(g => `- ${where(g.itemId)}: girdide geçmeyen ${KIND_LABEL[g.kind]} “${g.value}”; girdide dayanağı yoksa çıkar.`),
        ...c.lint.filter(i => i.level === 'warn').map(i => `- ${where(i.itemId)} (uyarı): ${i.message}`),
    ];
};

/** Düzeltme istemi: önceki yanıt (JSON), sorunlar ve aynı girdi */
export const buildRepairPrompt = (s: SuggestionLike & { missing?: string[] }, c: SuggestionCheck, input: string): string => [
    `ÖNCEKİ YANITIN:\n${JSON.stringify({ ...reportAnswer(s), eksikBilgi: s.missing || [] })}`,
    `DENETİMDE BULUNAN SORUNLAR:\n${issueLines(s, c).join('\n')}`,
    `GİRDİ:\n${input}`,
    'Yalnız bu sorunları düzelt; girdide olmayan bilgiyi çıkar, bilgi eksikse "eksikBilgi"ye soru olarak ekle. Diğer maddeleri değiştirme. Aynı JSON biçimiyle yanıt ver.',
].join('\n\n');

/** Daha kötü mü: önce hata + dayanaksız bilgi, eşitse uyarı; madde kalmadıysa daha kötü sayılır */
export const pickBetter = <T extends SuggestionLike>(first: { s: T; check: SuggestionCheck }, second: { s: T; check: SuggestionCheck } | null): { s: T; check: SuggestionCheck; repaired: boolean } => {
    if (!second || !(second.s.thisWeek.length + second.s.nextWeek.length)) return { ...first, repaired: false };
    const bad = (c: SuggestionCheck) => c.errors + c.ungrounded;
    const better = bad(second.check) < bad(first.check) || (bad(second.check) === bad(first.check) && second.check.warnings < first.check.warnings);
    return better ? { ...second, repaired: true } : { ...first, repaired: false };
};
