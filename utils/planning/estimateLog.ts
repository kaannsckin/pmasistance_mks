import { EffortRange, EstimateLogEntry, Project, WorkspaceData } from '../../types';
import { HistoryRecord, PlanningHistory } from './history';
import { ISSUE_TYPE_LABELS } from './lifecycle';

/**
 * Öneri günlüğü: yeni kayıt açılırken gösterilen öneriler ve kullanıcının
 * kararı. Kayıt kapandığında gerçekleşen değerler `taskId` ile planlama
 * geçmişinden eşlenir (yazma gerekmez). Buradan:
 *  - her kaynağın (geçmiş kayıtlar, AI, kullanıcının kör tahmini, nihai
 *    karar) efor isabeti: ortalama mutlak hata, aralığın gerçeği kapsama oranı
 *  - kapanma süresi P80'inin tutma oranı (dürüst aralık ≈ %80)
 *  - AI önerisinin kabul oranı (efor, önem, tür)
 *  - AI'nın katkısı: aynı kayıtlarda AI ile kör tahminin hatası
 * Eğitim verisi olarak CSV'ye dökülebilir (kişi adı içermez).
 */

export const MAX_LOG = 1000;

export const appendEstimateLog = (log: EstimateLogEntry[] | undefined, entry: EstimateLogEntry, max = MAX_LOG): EstimateLogEntry[] =>
    [...(log || []), entry].slice(-max);

export interface SourceAccuracy {
    n: number; // kapanmış ve eşleşmiş kayıt
    mae: number | null; // olası efor ile gerçek efor arasındaki ortalama mutlak fark (gün)
    mape: number | null; // ortanca mutlak yüzde hata
    coverage: number | null; // gerçek efor [iyimser, kötümser] içinde kalma oranı
}

export interface EstimateStats {
    entries: number;
    sent: number; // kayda dönüşen
    closed: number; // kapanmış ve eğitime uygun
    aiShown: number;
    aiAccept: { effort: number | null; priority: number | null; type: number | null };
    blindShare: number | null; // kör tahmin girilen kayıtların payı
    reference: SourceAccuracy & { p80Coverage: number | null };
    ai: SourceAccuracy;
    blind: SourceAccuracy;
    final: SourceAccuracy;
    /** Aynı kayıtlarda AI ve kör tahmin (ikisi de varsa) */
    aiVsBlind: { n: number; aiMae: number | null; blindMae: number | null };
    advice: string[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const rate = (xs: boolean[]): number | null => (xs.length ? round2(xs.filter(Boolean).length / xs.length) : null);

const accuracy = (pairs: { e: EffortRange; actual: number }[]): SourceAccuracy => ({
    n: pairs.length,
    mae: pairs.length ? round2(pairs.reduce((s, p) => s + Math.abs(p.e.likely - p.actual), 0) / pairs.length) : null,
    mape: pairs.length ? round2(median(pairs.map(p => Math.abs(p.e.likely - p.actual) / Math.max(p.actual, 0.25)))) : null,
    coverage: rate(pairs.map(p => p.actual >= p.e.best - 1e-9 && p.actual <= p.e.worst + 1e-9)),
});

/** Kör tahmin tek değerdir; aralık olarak ±0 kabul edilir */
const point = (v: number): EffortRange => ({ best: v, likely: v, worst: v });

export const estimateStats = (ws: Pick<WorkspaceData, 'estimateLog'>, history: PlanningHistory): EstimateStats => {
    const log = ws.estimateLog || [];
    const actual = new Map<string, HistoryRecord>(history.records.map(r => [r.id, r]));
    const sent = log.filter(e => e.taskId);
    const closed = sent.filter(e => actual.has(e.taskId!));
    const pairs = (pick: (e: EstimateLogEntry) => EffortRange | undefined) => closed
        .map(e => ({ e: pick(e), actual: actual.get(e.taskId!)!.effortDays }))
        .filter((p): p is { e: EffortRange; actual: number } => !!p.e);

    const ai = log.filter(e => e.ai);
    const aiSent = ai.filter(e => e.taskId);
    const both = closed.filter(e => e.ai && e.blind?.effortDays);
    const absErr = (v: number, id: string) => Math.abs(v - actual.get(id)!.effortDays);
    const refClosed = closed.filter(e => e.reference);

    const stats: EstimateStats = {
        entries: log.length,
        sent: sent.length,
        closed: closed.length,
        aiShown: ai.length,
        aiAccept: {
            effort: rate(aiSent.map(e => e.final.source === 'ai')),
            priority: rate(aiSent.filter(e => e.ai!.priority).map(e => e.final.priority === e.ai!.priority)),
            type: rate(aiSent.filter(e => e.ai!.issueType).map(e => e.final.issueType === e.ai!.issueType)),
        },
        blindShare: rate(sent.map(e => !!e.blind?.effortDays)),
        reference: {
            ...accuracy(pairs(e => e.reference?.effort)),
            p80Coverage: rate(refClosed.map(e => actual.get(e.taskId!)!.days <= e.reference!.p80Days + 1e-9)),
        },
        ai: accuracy(pairs(e => e.ai?.effort)),
        blind: accuracy(pairs(e => (e.blind?.effortDays ? point(e.blind.effortDays) : undefined))),
        final: accuracy(pairs(e => e.final.effort)),
        aiVsBlind: {
            n: both.length,
            aiMae: both.length ? round2(both.reduce((s, e) => s + absErr(e.ai!.effort.likely, e.taskId!), 0) / both.length) : null,
            blindMae: both.length ? round2(both.reduce((s, e) => s + absErr(e.blind!.effortDays!, e.taskId!), 0) / both.length) : null,
        },
        advice: [],
    };

    const MIN = 10;
    if (stats.closed < MIN) stats.advice.push(`İsabet ölçümü için en az ${MIN} kapanmış kayıt gerekir (şu an ${stats.closed}). Kayıtlar planlama asistanından açıldıkça ve kapandıkça dolar.`);
    else {
        const p80 = stats.reference.p80Coverage;
        if (p80 !== null && p80 < 0.7) stats.advice.push(`Kapanma süresi P80'i kayıtların yalnız %${Math.round(p80 * 100)} kadarında tuttu (hedef ≈ %80): aralıklar dar, geçmiş veri ekipteki değişimi yansıtmıyor olabilir.`);
        if (p80 !== null && p80 > 0.92) stats.advice.push('Kapanma süresi P80\'i neredeyse her zaman tutuyor: aralıklar gereğinden geniş olabilir.');
        const { aiMae, blindMae, n } = stats.aiVsBlind;
        if (n >= MIN && aiMae !== null && blindMae !== null) {
            stats.advice.push(aiMae < blindMae
                ? `AI önerisi aynı kayıtlarda kör tahminden daha isabetli (ortalama hata ${aiMae} gün, kör tahmin ${blindMae} gün).`
                : `AI önerisi kör tahminden daha isabetli değil (AI ${aiMae} gün, kör tahmin ${blindMae} gün): istem ya da bağlam gözden geçirilmeli.`);
        }
    }
    return stats;
};

// ---------------------------------------------------------------- eğitim verisi

const csvCell = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const n2 = (v?: number) => (v === undefined || v === null ? '' : String(v).replace('.', ','));

/**
 * Öneri günlüğü + gerçekleşen: her satır bir öneri anı. Model eğitimi ve
 * değerlendirme için; kişi adı yoktur (sorumlu alanı yazılmaz).
 */
export const estimateLogCsv = (ws: Pick<WorkspaceData, 'estimateLog'> & { projects: Pick<Project, 'id' | 'name'>[] }, history: PlanningHistory): string => {
    const actual = new Map(history.records.map(r => [r.id, r]));
    const projectName = new Map(ws.projects.map(p => [p.id, p.name]));
    const head = ['Zaman', 'Proje', 'Kayıt', 'Tür', 'Birim', 'Açıklama var',
        'Kör efor', 'Kör önem',
        'Geçmiş yöntem', 'Geçmiş n', 'Geçmiş güven', 'Geçmiş efor (iyimser)', 'Geçmiş efor (olası)', 'Geçmiş efor (kötümser)', 'Geçmiş kapanma P50', 'Geçmiş kapanma P80', 'Geçmiş önem',
        'AI istem sürümü', 'AI model', 'AI tür', 'AI önem', 'AI efor (iyimser)', 'AI efor (olası)', 'AI efor (kötümser)', 'AI güven', 'AI işaretler', 'AI dayanak sayısı',
        'Nihai kaynak', 'Nihai önem', 'Nihai tür', 'Nihai efor (olası)', 'Sürüm',
        'Gerçek efor', 'Gerçek kapanma (iş günü)', 'Kapandı'];
    const rows = (ws.estimateLog || []).map(e => {
        const a = e.taskId ? actual.get(e.taskId) : undefined;
        return [
            e.at.slice(0, 16).replace('T', ' '), projectName.get(e.projectId) || '', e.draft.name, e.draft.issueType ? ISSUE_TYPE_LABELS[e.draft.issueType] : '', e.draft.unit || '', e.draft.hasNotes ? 'evet' : 'hayır',
            n2(e.blind?.effortDays), e.blind?.priority || '',
            e.reference?.method || '', e.reference?.n ?? '', e.reference?.confidence || '', n2(e.reference?.effort.best), n2(e.reference?.effort.likely), n2(e.reference?.effort.worst), n2(e.reference?.p50Days), n2(e.reference?.p80Days), e.reference?.priority || '',
            e.ai?.promptVersion || '', e.ai?.model || '', e.ai?.issueType || '', e.ai?.priority || '', n2(e.ai?.effort.best), n2(e.ai?.effort.likely), n2(e.ai?.effort.worst), e.ai?.confidence || '', (e.ai?.flags || []).join(','), e.ai ? e.ai.evidence.length : '',
            e.final.source, e.final.priority, e.final.issueType || '', n2(e.final.effort?.likely), e.final.version,
            n2(a?.effortDays), n2(a?.days), a ? 'evet' : 'hayır',
        ].map(csvCell).join(';');
    });
    return `﻿${[head.join(';'), ...rows].join('\n')}`;
};
