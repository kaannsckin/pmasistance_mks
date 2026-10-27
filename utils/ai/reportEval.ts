import { Abbreviation, ReportEvalMetrics, ReportEvalRun, ReportGatePolicy, ReportGoldenItem, ReportItem, ReportPromptVariant, WeeklyReport, WorkspaceData } from '../../types';
import { meetingsHeldInWeek, meetingsPlannedInWeek } from '../customerMeetings';
import { PermissionHolder } from '../permissions';
import { foldTr } from '../rag/text';
import { CATEGORY_META, findReport, isReportSteward, itemDisplay, lintCounts, lintReport, shiftWeek } from '../weeklyReport';
import { personNames, redactNames } from './fineTune';
import { aiPolicyOf } from './policy';
import { tokenF1 } from './reportAiStats';
import { buildVariantRequest, PRODUCTION_VARIANT } from './reportVariants';
import { buildReportInput, reportAnswer, reportConfigVersion } from './weeklyReportPrompt';

/**
 * Haftalık rapor taslağının çevrimdışı değerlendirmesi. PYB destek onaylı
 * raporlardan bir altın set seçer; her rapor, o haftanın girdisiyle (rapora
 * kaydedilmiş AI girdisi) yeniden önerilir ve öneri onaylı son hâlle
 * karşılaştırılır:
 *  - format: önerinin kılavuz denetimindeki hata ve uyarıları,
 *  - dayanak: öneride geçen rakam, tarih ve özel adlar girdide var mı,
 *  - kapsama ve isabet: onaylı maddelerle AI maddeleri terim benzerliğiyle
 *    açgözlü eşleştirilir (eşik 0,5),
 *  - kategori doğruluğu, açılımı bilinmeyen kısaltma, eksik bilgi sorusu.
 * Üretim istemi (full) kapıdan geçmezse ve kapı zorunluysa düzenleyicide
 * uyarı gösterilir; öneri engellenmez.
 */

const round2 = (v: number) => Math.round(v * 100) / 100;
const ratio = (a: number, b: number): number | null => (b > 0 ? round2(a / b) : null);

// ---------------------------------------------------------------- dayanak

const MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
const MONTH_RE = MONTHS.join('|');
const WEEKDAYS = ['pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar'];

export interface GroundingIssue {
    itemId: string;
    kind: 'number' | 'date' | 'name';
    value: string; // metinde geçtiği biçim
}

interface Fact { kind: GroundingIssue['kind']; key: string; value: string }

const dateKey = (d: string | number, m: string | number) => {
    const day = Number(d), month = Number(m);
    return day >= 1 && day <= 31 && month >= 1 && month <= 12 ? `${day}-${month}` : null;
};

/** Metindeki tarihler (gün-ay anahtarıyla) ve tarihler çıkarılmış kalan metin (katlanmış) */
const extractDates = (text: string): { dates: Fact[]; rest: string } => {
    let t = foldTr(text);
    // Katlama harf sayısını korur (ı→i, ü→u); korumadıysa gösterimde katlanmış biçim kullanılır
    const same = t.length === text.length;
    const dates: Fact[] = [];
    const shown = (m: string, args: unknown[]) => {
        const off = args[args.length - 2];
        return same && typeof off === 'number' && t.slice(off, off + m.length) === m ? text.slice(off, off + m.length) : m;
    };
    const add = (key: string | null, value: string) => { if (key) dates.push({ kind: 'date', key, value }); };
    const month = (mon: string) => MONTHS.indexOf(mon) + 1;
    // "5–9 Ekim 2026" (aralık: iki uç gün)
    t = t.replace(new RegExp(`(?<![\\d])(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+(${MONTH_RE})(?:\\s+\\d{4})?`, 'g'), (m, d1, d2, mon, ...rest) => {
        add(dateKey(d1, month(mon)), shown(m, rest)); add(dateKey(d2, month(mon)), shown(m, rest)); return ' '.repeat(m.length);
    });
    // "10 Eylül 2026", "10 Eylül"
    t = t.replace(new RegExp(`(?<![\\d])(\\d{1,2})\\s+(${MONTH_RE})(?:\\s+\\d{4})?`, 'g'), (m, d, mon, ...rest) => { add(dateKey(d, month(mon)), shown(m, rest)); return ' '.repeat(m.length); });
    // ISO "2026-09-10"
    t = t.replace(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g, (m, _y, mo, d, ...rest) => { add(dateKey(d, mo), shown(m, rest)); return ' '.repeat(m.length); });
    // "10.09.2026", "10.09", "10/09"
    t = t.replace(/(?<![\d.,/])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d])/g, (m, d, mo, _y, ...rest) => {
        const k = dateKey(d, mo);
        if (!k) return m;
        add(k, shown(m, rest));
        return ' '.repeat(m.length);
    });
    return { dates, rest: t };
};

/** Sayılar: binlik ayırıcı ve ondalık virgül normalleştirilir ("450.000" → 450000, "2,5" → 2.5, "%15" → 15) */
const extractNumbers = (folded: string): Fact[] =>
    (folded.match(/(?<![\p{L}\d])\d+(?:[.,]\d+)*/gu) || []).map(raw => {
        const thousands = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw);
        const n = Number((thousands ? raw.replace(/\./g, '') : raw).replace(',', '.'));
        return { kind: 'number' as const, key: Number.isFinite(n) ? String(n) : raw, value: raw };
    });

const WORD_RE = /(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{N}]*(?:['’]\p{L}+)?/gu;
const SENTENCE_START = /(^|[.!?:;"“(\-–]\s*)$/u;
const tokensOf = (s: string) => foldTr(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2);
const skeleton = (w: string) => w.replace(/[aeiou]/g, '');

/** Özel ad adayları: cümle başında olmayan, büyük harfle başlayan sözcükler (kesme işaretli ek atılır) */
const extractNames = (text: string, exclude: Set<string>): Fact[] => {
    const out: Fact[] = [];
    for (const m of text.matchAll(WORD_RE)) {
        if (SENTENCE_START.test(text.slice(0, m.index))) continue;
        const word = m[0].split(/['’]/)[0];
        const key = foldTr(word);
        if (key.length < 2 || exclude.has(key) || /^\d/.test(key)) continue;
        out.push({ kind: 'name', key, value: word });
    }
    return out;
};

/** Sözcük girdide geçiyor mu: aynı gövde (ilk 5 harf), girdideki kısaltmanın açılımı ("Yön" → Yönetimi, "Bld" → Belediyesi) */
const nameGrounded = (w: string, inputTokens: Set<string>): boolean => {
    if (inputTokens.has(w)) return true;
    for (const t of inputTokens) {
        if (t.length >= 4 && w.length >= 4 && t.slice(0, 5) === w.slice(0, 5)) return true;
        if (t.length >= 3 && w.startsWith(t)) return true;
        if (t.length >= 3 && !/[aeiou]/.test(t) && skeleton(w).startsWith(t)) return true;
    }
    return false;
};

const excludedWords = (dictionary: Abbreviation[], abbreviations: Abbreviation[]): Set<string> => {
    const s = new Set<string>([...MONTHS, ...WEEKDAYS]);
    [...dictionary, ...abbreviations].forEach(a => { tokensOf(a.abbr).forEach(t => s.add(t)); tokensOf(a.expansion).forEach(t => s.add(t)); });
    Object.values(CATEGORY_META).forEach(c => tokensOf(c.label).forEach(t => s.add(t)));
    return s;
};

/**
 * Öneride geçen rakam, tarih ve özel adların girdide dayanağı var mı.
 * Türkçe büyük-küçük harf ve aksandan bağımsızdır; tarihler gün-ay olarak
 * karşılaştırılır ("10 Eylül 2026" = "10.09"). Sezgiseldir: yalnız uyarı.
 */
export const groundingIssues = (
    suggestion: { thisWeek: ReportItem[]; nextWeek: ReportItem[]; abbreviations?: Abbreviation[] },
    input: string,
    dictionary: Abbreviation[] = [],
): { issues: GroundingIssue[]; checked: number } => {
    const inDates = new Set(extractDates(input).dates.map(d => d.key));
    const inNumbers = new Set(extractNumbers(extractDates(input).rest).map(n => n.key));
    const inTokens = new Set(tokensOf(input));
    const exclude = excludedWords(dictionary, suggestion.abbreviations || []);
    const issues: GroundingIssue[] = [];
    let checked = 0;
    [...suggestion.thisWeek, ...suggestion.nextWeek].forEach(item => {
        const text = itemDisplay(item);
        const { dates, rest } = extractDates(text);
        const facts = [...dates, ...extractNumbers(rest), ...extractNames(text, exclude)];
        const seen = new Set<string>();
        facts.forEach(f => {
            const k = `${f.kind}:${f.key}`;
            if (seen.has(k)) return;
            seen.add(k);
            checked++;
            const ok = f.kind === 'date' ? inDates.has(f.key) : f.kind === 'number' ? inNumbers.has(f.key) || inDates.has(f.key) : nameGrounded(f.key, inTokens);
            if (!ok) issues.push({ itemId: item.id, kind: f.kind, value: f.value });
        });
    });
    return { issues, checked };
};

// ---------------------------------------------------------------- eşleştirme ve puan

/** Onaylı madde ile AI maddesinin "aynı gelişme" sayılması için terim F1 eşiği */
export const MATCH_THRESHOLD = 0.5;

/** Açgözlü eşleştirme: en benzer çiftten başlayarak, her madde en çok bir kez */
export const matchItems = (ai: ReportItem[], gold: ReportItem[], threshold = MATCH_THRESHOLD): { a: number; g: number; f1: number }[] => {
    const pairs: { a: number; g: number; f1: number }[] = [];
    ai.forEach((x, a) => gold.forEach((y, g) => { const f1 = tokenF1(itemDisplay(x), itemDisplay(y)); if (f1 >= threshold) pairs.push({ a, g, f1 }); }));
    pairs.sort((p, q) => q.f1 - p.f1 || p.a - q.a || p.g - q.g);
    const usedA = new Set<number>(), usedG = new Set<number>();
    return pairs.filter(p => {
        if (usedA.has(p.a) || usedG.has(p.g)) return false;
        usedA.add(p.a); usedG.add(p.g);
        return true;
    });
};

export interface ReportDraftScore {
    lintErrors: number;
    lintWarnings: number;
    unknownAbbr: number;
    facts: number;
    ungrounded: number;
    ungroundedRate: number | null;
    aiItems: number;
    goldItems: number;
    matched: number;
    recall: number | null;
    precision: number | null;
    categoryMatched: number;
    categoryCorrect: number;
    categoryAccuracy: number | null;
    missing: number;
    issues: GroundingIssue[];
}

/** Tek raporun önerisi ↔ onaylı son hâli */
export const scoreReportDraft = (o: {
    suggestion: { thisWeek: ReportItem[]; nextWeek: ReportItem[]; abbreviations: Abbreviation[]; missing?: string[] };
    gold: Pick<WeeklyReport, 'thisWeek' | 'nextWeek'>;
    input: string;
    dictionary?: Abbreviation[];
}): ReportDraftScore => {
    const lint = lintReport(o.suggestion, o.dictionary);
    const c = lintCounts(lint);
    const g = groundingIssues(o.suggestion, o.input, o.dictionary);
    const mThis = matchItems(o.suggestion.thisWeek, o.gold.thisWeek);
    const mNext = matchItems(o.suggestion.nextWeek, o.gold.nextWeek);
    const aiItems = o.suggestion.thisWeek.length + o.suggestion.nextWeek.length;
    const goldItems = o.gold.thisWeek.length + o.gold.nextWeek.length;
    const matched = mThis.length + mNext.length;
    const categoryCorrect = mThis.filter(p => o.suggestion.thisWeek[p.a].category === o.gold.thisWeek[p.g].category).length;
    return {
        lintErrors: c.errors,
        lintWarnings: c.warnings,
        unknownAbbr: lint.filter(i => i.code === 'abbr').length,
        facts: g.checked,
        ungrounded: g.issues.length,
        ungroundedRate: g.checked ? round2(g.issues.length / g.checked) : 0,
        aiItems, goldItems, matched,
        recall: ratio(matched, goldItems),
        precision: ratio(matched, aiItems),
        categoryMatched: mThis.length,
        categoryCorrect,
        categoryAccuracy: ratio(categoryCorrect, mThis.length),
        missing: o.suggestion.missing?.length || 0,
        issues: g.issues,
    };
};

/** Güvenilir kapı kararı için gereken en az yanıtlı rapor */
export const MIN_REPORT_GATE_CASES = 5;

const pct = (v: number) => `%${Math.round(v * 100)}`;
const dec = (v: number) => String(round2(v)).replace('.', ',');

/** Rapor puanlarından koşu kaydı ve kapı kararı (oranlar toplamdan, rapor başı değerler ortalamadan) */
export const summarizeReportEval = (
    scores: ReportDraftScore[],
    gate: ReportGatePolicy,
    meta: { id: string; at: string; promptVersion: string; variant: ReportPromptVariant; model?: string; failed?: number; skipped?: number },
): ReportEvalRun => {
    const n = scores.length;
    const sum = (f: (s: ReportDraftScore) => number) => scores.reduce((a, s) => a + f(s), 0);
    const perReport = (f: (s: ReportDraftScore) => number) => (n ? round2(sum(f) / n) : null);
    const metrics: ReportEvalMetrics = {
        lintErrorsPerReport: perReport(s => s.lintErrors),
        lintWarningsPerReport: perReport(s => s.lintWarnings),
        ungroundedRate: n ? ratio(sum(s => s.ungrounded), sum(s => s.facts)) ?? 0 : null,
        recall: ratio(sum(s => s.matched), sum(s => s.goldItems)),
        precision: ratio(sum(s => s.matched), sum(s => s.aiItems)),
        categoryAccuracy: ratio(sum(s => s.categoryCorrect), sum(s => s.categoryMatched)),
        unknownAbbrPerReport: perReport(s => s.unknownAbbr),
        missingPerReport: perReport(s => s.missing),
    };
    const reasons: string[] = [];
    let passed: boolean | null = null;
    if (n < MIN_REPORT_GATE_CASES) {
        reasons.push(`Yetersiz örnek: kapı kararı için en az ${MIN_REPORT_GATE_CASES} raporun yanıtı gerekir (${n}).`);
    } else {
        const le = metrics.lintErrorsPerReport ?? 0, ug = metrics.ungroundedRate ?? 0, rc = metrics.recall ?? 0;
        if (le > gate.maxLintErrorsPerReport) reasons.push(`Rapor başına format hatası ${dec(le)}; üst sınır ${dec(gate.maxLintErrorsPerReport)}.`);
        if (ug > gate.maxUngroundedRate) reasons.push(`Dayanaksız bilgi oranı ${pct(ug)}; üst sınır ${pct(gate.maxUngroundedRate)}.`);
        if (rc < gate.minRecall) reasons.push(`Onaylı maddeleri kapsama ${pct(rc)}; alt sınır ${pct(gate.minRecall)}.`);
        passed = reasons.length === 0;
        if (passed) reasons.push('Kalite kapısı geçildi.');
    }
    if (meta.failed) reasons.push(`${meta.failed} raporda yanıt alınamadı ya da çözümlenemedi.`);
    if (meta.skipped) reasons.push(`${meta.skipped} raporun girdisi bulunamadı (koşulmadı).`);
    return { id: meta.id, at: meta.at, promptVersion: meta.promptVersion, variant: meta.variant, ...(meta.model ? { model: meta.model } : {}), n, failed: meta.failed || 0, ...(meta.skipped ? { skipped: meta.skipped } : {}), metrics, passed, reasons };
};

export const MAX_REPORT_EVAL_RUNS = 50;
export const appendReportEvalRun = (runs: ReportEvalRun[] | undefined, run: ReportEvalRun): ReportEvalRun[] => [...(runs || []), run].slice(-MAX_REPORT_EVAL_RUNS);

// ---------------------------------------------------------------- kapı

export type ReportGateStatus = 'none' | 'passed' | 'failed' | 'stale' | 'insufficient';

export const REPORT_GATE_LABELS: Record<ReportGateStatus, string> = {
    none: 'Henüz değerlendirilmedi',
    passed: 'Kapıdan geçti',
    failed: 'Kapıdan geçmedi',
    stale: 'İstem, kılavuz ya da model değişti; yeniden değerlendirin',
    insufficient: 'Yetersiz örnek',
};

/**
 * Üretim varyantının son koşusuna göre kapı durumu. Koşu başka bir
 * yapılandırma sürümüyle (istem, kılavuz, kural) ya da modelle yapıldıysa
 * bayattır. Son koşu karar veremediyse aynı sürüm ve modeldeki son kararlı koşu geçerlidir.
 */
export const reportGateStatus = (runs: ReportEvalRun[] | undefined, configVersion: string, model?: string): { status: ReportGateStatus; run?: ReportEvalRun } => {
    const list = [...(runs || [])].reverse().filter(r => r.variant === PRODUCTION_VARIANT);
    const run = list[0];
    if (!run) return { status: 'none' };
    if (run.promptVersion !== configVersion || (model && run.model && run.model !== model)) return { status: 'stale', run };
    if (run.passed === null) {
        const decisive = list.find(r => r.passed !== null && r.promptVersion === configVersion && (r.model || '') === (run.model || ''));
        return decisive ? { status: decisive.passed ? 'passed' : 'failed', run: decisive } : { status: 'insufficient', run };
    }
    return { status: run.passed ? 'passed' : 'failed', run };
};

/** Zorunlu kapı geçilmediyse düzenleyicide gösterilecek uyarı; aksi hâlde null */
export const reportGateWarning = (ws: Partial<Pick<WorkspaceData, 'aiPolicy' | 'reportEvalRuns' | 'reportSettings'>>, model?: string): string | null => {
    if (!aiPolicyOf(ws).reportGate.enforce) return null;
    const { status } = reportGateStatus(ws.reportEvalRuns, reportConfigVersion(ws.reportSettings), model);
    return status === 'failed'
        ? 'AI taslak önerisi, PYB desteğin altın set değerlendirmesinde kalite kapısından geçmedi. Öneriyi özellikle dikkatli gözden geçirin.'
        : null;
};

// ---------------------------------------------------------------- altın set

type GoldWs = Pick<WorkspaceData, 'projects' | 'people'> & Partial<Pick<WorkspaceData, 'weeklyReports' | 'customerMeetings' | 'reportGoldenSet' | 'reportSettings'>>;

/**
 * Raporun AI girdisi: önce rapora kaydedilmiş girdi (aiDraft.input); yoksa
 * proje notları bu cihazda varsa yeniden üretilir. Notlar PY'ye özeldir ve
 * bulutta yoktur; girdi altın kayda yazılmaz.
 */
export const goldenInput = (ws: GoldWs, r: WeeklyReport, dictionary: Abbreviation[] = []): string | null => {
    if (r.aiDraft?.input) return r.aiDraft.input;
    const project = ws.projects.find(p => p.id === r.projectId);
    if (!project || r.kind !== 'project') return null;
    const notes = project.notes.filter(n => n.year === r.year && n.weekNumber === r.week);
    if (!notes.length && !r.worklog?.length) return null;
    const prev = shiftWeek(r.year, r.week, -1);
    const next = shiftWeek(r.year, r.week, 1);
    const meetings = (ws.customerMeetings || []);
    return buildReportInput({
        project, year: r.year, week: r.week, worklog: r.worklog,
        heldMeetings: meetingsHeldInWeek(meetings, r.projectId, r.year, r.week),
        plannedMeetings: meetingsPlannedInWeek(meetings, r.projectId, next.year, next.week),
        previous: findReport(ws.weeklyReports || [], prev.year, prev.week, r.projectId, 'project'),
        dictionary,
    });
};

export interface ReportGoldCase {
    item: ReportGoldenItem;
    report?: WeeklyReport;
    input: string | null;
}

export const reportGoldCases = (ws: GoldWs, dictionary: Abbreviation[] = []): ReportGoldCase[] =>
    (ws.reportGoldenSet || []).map(item => {
        const report = (ws.weeklyReports || []).find(r => r.id === item.reportId && r.stage === 'approved' && r.kind === 'project');
        return { item, report, input: report ? goldenInput(ws, report, dictionary) : null };
    });

/** Altın sete uygun mu: onaylı proje raporu ve girdisi var; değilse gerekçe */
export const goldenBlocker = (ws: GoldWs, r: WeeklyReport, dictionary: Abbreviation[] = []): string | null => {
    if (r.kind !== 'project') return 'Yalnız proje raporları eklenebilir.';
    if (r.stage !== 'approved') return 'Yalnız onaylı raporlar eklenebilir.';
    if ((ws.reportGoldenSet || []).some(g => g.reportId === r.id)) return 'Zaten altın sette.';
    if (!goldenInput(ws, r, dictionary)) return 'Girdisi yok: rapora AI önerisiyle başlanmamış ve haftanın proje notları bu cihazda bulunmuyor.';
    return null;
};

/**
 * Aday öneri: onaylı, format hatası olmayan, hiç iade edilmemiş ve girdisi
 * olan raporlar; bölümler arasında dönüşümlü (en yeniler önce).
 */
export const goldenCandidates = (ws: GoldWs, dictionary: Abbreviation[] = [], limit = 30): WeeklyReport[] => {
    const ok = (ws.weeklyReports || [])
        .filter(r => !goldenBlocker(ws, r, dictionary) && !r.history.some(h => h.action === 'return') && lintCounts(lintReport(r, dictionary)).errors === 0)
        .sort((a, b) => b.year - a.year || b.week - a.week);
    const byDept = new Map<string, WeeklyReport[]>();
    ok.forEach(r => byDept.set(r.departmentCode, [...(byDept.get(r.departmentCode) || []), r]));
    const queues = [...byDept.values()];
    const out: WeeklyReport[] = [];
    for (let i = 0; out.length < limit && queues.some(q => i < q.length); i++) queues.forEach(q => { if (i < q.length && out.length < limit) out.push(q[i]); });
    return out;
};

/** Altın sete ekleme (yalnız PYB destek; uygunsuzsa null) */
export const addReportGolden = (ws: GoldWs, who: PermissionHolder, reportId: string, byName: string | undefined, dictionary: Abbreviation[] = [], now: Date = new Date()): ReportGoldenItem[] | null => {
    const r = (ws.weeklyReports || []).find(x => x.id === reportId);
    if (!isReportSteward(who) || !r || goldenBlocker(ws, r, dictionary)) return null;
    return [...(ws.reportGoldenSet || []), { reportId, addedAt: now.toISOString(), ...(byName ? { addedByName: byName } : {}) }];
};

export const removeReportGolden = (ws: GoldWs, who: PermissionHolder, reportId: string): ReportGoldenItem[] | null =>
    isReportSteward(who) && (ws.reportGoldenSet || []).some(g => g.reportId === reportId) ? (ws.reportGoldenSet || []).filter(g => g.reportId !== reportId) : null;

/**
 * Altın set → sohbet biçiminde JSONL (değerlendirme dışarıda yapılacaksa).
 * İstem seçilen varyantla, hedef onaylı son hâldir; kişi adları maskelenir.
 */
export const reportGoldenJsonl = (ws: GoldWs, variant: ReportPromptVariant = PRODUCTION_VARIANT, dictionary: Abbreviation[] = []): { jsonl: string; n: number; redactions: number } => {
    const names = personNames(ws);
    let redactions = 0;
    const lines = reportGoldCases(ws, dictionary).filter(c => c.report && c.input).map(c => {
        const req = buildVariantRequest({ variant, ws, report: c.report!, input: c.input! });
        const line = JSON.stringify({ messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }, { role: 'assistant', content: JSON.stringify(reportAnswer(c.report!)) }] });
        const red = redactNames(line, names);
        redactions += red.hits;
        return red.text;
    });
    return { jsonl: lines.join('\n'), n: lines.length, redactions };
};
