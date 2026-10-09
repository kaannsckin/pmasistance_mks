import { Abbreviation, ReportAiLogEntry, ReportItem, ReportPromptVariant, WeeklyReport, WorkspaceData } from '../../types';
import { foldTr, terms } from '../rag/text';
import { itemDisplay, lintCounts, lintReport } from '../weeklyReport';

/**
 * Haftalık rapor AI'sının ölçümü: öneri günlüğü ve kabul oranı. Günlükte
 * rapor metni saklanmaz, yalnız sayılar tutulur. AI'dan gelen madde
 * uygulanırken özgün hâli maddede (aiOriginal) durur; rapor gönderilirken
 * özgün hâl ile son hâl karşılaştırılır:
 *  - aynen kalan: Türkçe katlama ve boşluk normalleştirmesinden sonra aynı,
 *  - düzenlenen: farklı (benzerlik: terim tabanlı F1),
 *  - silinen: uygulanan AI maddelerinden raporda kalmayan,
 *  - insan eklemesi: AI'dan gelmeyen madde.
 */

export const MAX_REPORT_AI_LOG = 2000;

const round2 = (v: number) => Math.round(v * 100) / 100;
const rate = (a: number, b: number): number | null => (b > 0 ? round2(a / b) : null);
const mean = (xs: number[]): number | null => (xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/** Karşılaştırma için normalleştirilmiş metin (küçük harf, aksansız, tek boşluk) */
export const normText = (s: string): string => foldTr(s).replace(/\s+/g, ' ').trim();

/** Terim tabanlı F1 benzerliği (0–1); ikisi de boşsa 1 */
export const tokenF1 = (a: string, b: string): number => {
    const ta = terms(a), tb = terms(b);
    if (!ta.length && !tb.length) return 1;
    if (!ta.length || !tb.length) return 0;
    const count = new Map<string, number>();
    ta.forEach(t => count.set(t, (count.get(t) || 0) + 1));
    let overlap = 0;
    tb.forEach(t => {
        const c = count.get(t) || 0;
        if (c > 0) { overlap++; count.set(t, c - 1); }
    });
    return (2 * overlap) / (ta.length + tb.length);
};

export interface ReportAcceptance {
    aiItems: number; // uygulanan AI maddesi
    kept: number; // aynen kalan
    edited: number; // düzenlenen
    deleted: number; // silinen
    humanAdded: number; // AI'dan gelmeyen madde
    similarity: number | null; // raporda kalan AI maddelerinde özgün ↔ son hâl ortalama benzerliği
}

/** AI maddelerinin akıbeti; rapora hiç AI önerisi uygulanmadıysa (ya da eski kayıtsa) null */
export const reportAcceptance = (r: Pick<WeeklyReport, 'thisWeek' | 'nextWeek' | 'aiDraft'>): ReportAcceptance | null => {
    const ids = r.aiDraft?.itemIds;
    if (!ids?.length) return null;
    const aiIds = new Set(ids);
    const items: ReportItem[] = [...r.thisWeek, ...r.nextWeek];
    const present = new Set(items.map(i => i.id));
    let kept = 0, edited = 0, humanAdded = 0;
    const sims: number[] = [];
    items.forEach(i => {
        if (!aiIds.has(i.id) || !i.aiOriginal) { humanAdded++; return; }
        const now = itemDisplay(i);
        if (normText(now) === normText(i.aiOriginal.text)) { kept++; sims.push(1); } else { edited++; sims.push(tokenF1(i.aiOriginal.text, now)); }
    });
    return { aiItems: aiIds.size, kept, edited, deleted: [...aiIds].filter(id => !present.has(id)).length, humanAdded, similarity: mean(sims) };
};

export const appendReportAiLog = (log: ReportAiLogEntry[] | undefined, entry: ReportAiLogEntry): ReportAiLogEntry[] =>
    [...(log || []), entry].slice(-MAX_REPORT_AI_LOG);

/** Öneri sonrası kayıt (uygulandı / vazgeçildi / hata) */
export const suggestionLogEntry = (o: {
    report: Pick<WeeklyReport, 'id' | 'projectId' | 'departmentCode'>;
    promptVersion: string;
    variant?: ReportPromptVariant;
    model?: string;
    outcome: Exclude<ReportAiLogEntry['outcome'], 'submitted'>;
    suggestion?: { thisWeek: ReportItem[]; nextWeek: ReportItem[]; abbreviations: Abbreviation[] };
    dictionary?: Abbreviation[];
    ungrounded?: number;
    repaired?: boolean;
    at?: Date;
}): ReportAiLogEntry => {
    const c = o.suggestion ? lintCounts(lintReport(o.suggestion, o.dictionary)) : { errors: 0, warnings: 0 };
    return {
        at: (o.at || new Date()).toISOString(),
        reportId: o.report.id,
        ...(o.report.projectId ? { projectId: o.report.projectId } : {}),
        departmentCode: o.report.departmentCode,
        promptVersion: o.promptVersion,
        ...(o.variant ? { variant: o.variant } : {}),
        ...(o.model ? { model: o.model } : {}),
        outcome: o.outcome,
        nThis: o.suggestion?.thisWeek.length || 0,
        nNext: o.suggestion?.nextWeek.length || 0,
        lintErrors: c.errors,
        lintWarnings: c.warnings,
        ...(o.ungrounded !== undefined ? { ungrounded: o.ungrounded } : {}),
        ...(o.repaired ? { repaired: true } : {}),
    };
};

/** Gönderim kaydı: AI maddelerinin akıbeti ve gönderimdeki format sorunları; AI kullanılmadıysa null */
export const submitLogEntry = (r: WeeklyReport, dictionary?: Abbreviation[], at: Date = new Date()): ReportAiLogEntry | null => {
    const acc = reportAcceptance(r);
    if (!acc || !r.aiDraft) return null;
    const issues = lintReport(r, dictionary);
    const c = lintCounts(issues);
    const lintCodes: Record<string, number> = {};
    issues.forEach(i => { lintCodes[i.code] = (lintCodes[i.code] || 0) + 1; });
    return {
        at: at.toISOString(),
        reportId: r.id,
        ...(r.projectId ? { projectId: r.projectId } : {}),
        departmentCode: r.departmentCode,
        promptVersion: r.aiDraft.promptVersion || 'bilinmiyor',
        ...(r.aiDraft.variant ? { variant: r.aiDraft.variant } : {}),
        ...(r.aiDraft.model ? { model: r.aiDraft.model } : {}),
        outcome: 'submitted',
        nThis: r.thisWeek.length,
        nNext: r.nextWeek.length,
        lintErrors: c.errors,
        lintWarnings: c.warnings,
        aiItems: acc.aiItems,
        kept: acc.kept,
        edited: acc.edited,
        deleted: acc.deleted,
        humanAdded: acc.humanAdded,
        ...(issues.length ? { lintCodes } : {}),
    };
};

// ---------------------------------------------------------------- gruplu ölçüler

export type ReportAiGroupBy = 'department' | 'pm' | 'project' | 'promptVersion';

export const GROUP_BY_LABELS: Record<ReportAiGroupBy, string> = {
    department: 'Bölüm',
    pm: 'Proje yöneticisi',
    project: 'Proje',
    promptVersion: 'İstem sürümü',
};

export interface ReportAiStatsRow {
    key: string;
    label: string;
    suggestions: number; // uygulanan + vazgeçilen + hatalı
    applyRate: number | null;
    discardRate: number | null;
    errorRate: number | null;
    submitted: number; // AI taslaklı gönderilen rapor
    aiItems: number;
    keptRate: number | null; // aynen kalan / AI maddesi
    editedRate: number | null;
    deletedRate: number | null;
    returnRate: number | null; // AI taslaklı, gönderilmiş raporlarda iade edilenlerin payı
    avgLintErrors: number | null; // gönderimde
    avgLintWarnings: number | null;
}

type StatsWs = Pick<WorkspaceData, 'projects' | 'people' | 'departments'> & Partial<Pick<WorkspaceData, 'reportAiLog' | 'weeklyReports'>>;

/**
 * Öneri günlüğü ve raporlardan gruplu ölçüler. Aynı rapor birden çok kez
 * gönderildiyse (iade sonrası) yalnız son gönderimi sayılır. Tarih süzgeci
 * ISO günü (YYYY-AA-GG) ile, iki uç dahil.
 */
export const reportAiStats = (ws: StatsWs, o: { by: ReportAiGroupBy; from?: string; to?: string }): ReportAiStatsRow[] => {
    const inRange = (at: string) => (!o.from || at.slice(0, 10) >= o.from) && (!o.to || at.slice(0, 10) <= o.to);
    const pmOf = new Map(ws.projects.map(p => [p.id, p.pmPersonId || '']));
    const keyOf = (x: { departmentCode: string; projectId?: string; promptVersion?: string }): string => {
        switch (o.by) {
            case 'department': return x.departmentCode || '';
            case 'project': return x.projectId || '';
            case 'pm': return (x.projectId && pmOf.get(x.projectId)) || '';
            case 'promptVersion': return x.promptVersion || 'bilinmiyor';
        }
    };
    const labelOf = (key: string): string => {
        if (!key) return o.by === 'project' ? 'Bölüm eklemeleri' : 'Belirtilmemiş';
        if (o.by === 'department') return ws.departments.find(d => d.code === key)?.name || key;
        if (o.by === 'project') return ws.projects.find(p => p.id === key)?.name || 'Silinmiş proje';
        if (o.by === 'pm') { const p = ws.people.find(x => x.id === key); return p ? `${p.firstName} ${p.lastName}`.trim() : key; }
        return key;
    };

    const log = (ws.reportAiLog || []).filter(e => inRange(e.at));
    const lastSubmit = new Map<string, ReportAiLogEntry>();
    log.filter(e => e.outcome === 'submitted').forEach(e => lastSubmit.set(e.reportId, e));

    interface Acc { applied: number; discarded: number; errors: number; submits: ReportAiLogEntry[]; sent: number; returned: number }
    const groups = new Map<string, Acc>();
    const g = (k: string) => { if (!groups.has(k)) groups.set(k, { applied: 0, discarded: 0, errors: 0, submits: [], sent: 0, returned: 0 }); return groups.get(k)!; };
    log.forEach(e => {
        if (e.outcome === 'applied_append' || e.outcome === 'applied_replace') g(keyOf(e)).applied++;
        else if (e.outcome === 'discarded') g(keyOf(e)).discarded++;
        else if (e.outcome === 'error') g(keyOf(e)).errors++;
    });
    lastSubmit.forEach(e => g(keyOf(e)).submits.push(e));
    // İade: AI taslaklı ve en az bir kez gönderilmiş raporlar
    (ws.weeklyReports || []).forEach(r => {
        if (!r.aiDraft?.itemIds?.length) return;
        const submit = r.history.find(h => h.action === 'submit');
        if (!submit || !inRange(submit.at)) return;
        const acc = g(keyOf({ departmentCode: r.departmentCode, projectId: r.projectId, promptVersion: r.aiDraft.promptVersion }));
        acc.sent++;
        if (r.history.some(h => h.action === 'return')) acc.returned++;
    });

    return [...groups.entries()].map(([key, a]) => {
        const suggestions = a.applied + a.discarded + a.errors;
        const aiItems = a.submits.reduce((s, e) => s + (e.aiItems || 0), 0);
        const sum = (f: (e: ReportAiLogEntry) => number | undefined) => a.submits.reduce((s, e) => s + (f(e) || 0), 0);
        return {
            key,
            label: labelOf(key),
            suggestions,
            applyRate: rate(a.applied, suggestions),
            discardRate: rate(a.discarded, suggestions),
            errorRate: rate(a.errors, suggestions),
            submitted: a.submits.length,
            aiItems,
            keptRate: rate(sum(e => e.kept), aiItems),
            editedRate: rate(sum(e => e.edited), aiItems),
            deletedRate: rate(sum(e => e.deleted), aiItems),
            returnRate: rate(a.returned, a.sent),
            avgLintErrors: mean(a.submits.map(e => e.lintErrors)),
            avgLintWarnings: mean(a.submits.map(e => e.lintWarnings)),
        };
    }).sort((x, y) => y.suggestions + y.submitted - (x.suggestions + x.submitted) || x.label.localeCompare(y.label, 'tr'));
};
