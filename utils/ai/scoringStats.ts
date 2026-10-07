import { AiAssessmentFlag, WorkspaceData } from '../../types';
import { pmoRatingFor } from '../healthModel';
import { isoWeekOf, shiftWeek } from '../weeklyReport';

/**
 * AI metin puanlamasının izlenmesi (admin): son N haftada kaç değerlendirme
 * yapıldı, kaçının güveni düşük ve neden, tekrarlar arası ortalama dağılım,
 * PMO puanıyla (insan etiketi) ve kural tabanlı göstergeyle uyum. Uyumsuzluk
 * büyükse öneri üretir — puanın sağlık skorundaki ağırlığı insan ölçüsüne
 * göre yönetilir.
 */

export interface ScoringStats {
    weeks: number;
    assessed: number;
    low: number;
    byFlag: Partial<Record<AiAssessmentFlag, number>>;
    avgSpread: number | null;
    pmo: { n: number; mae: number | null; r: number | null };
    rule: { n: number; mae: number | null };
    advice: string[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

const pearson = (xs: number[], ys: number[]): number | null => {
    const n = xs.length;
    if (n < 5) return null;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxx > 0 && syy > 0 ? round2(sxy / Math.sqrt(sxx * syy)) : null;
};

export const MIN_AGREEMENT_PAIRS = 10;

export const scoringStats = (ws: Pick<WorkspaceData, 'weeklyReports' | 'pmoRatings'>, now: Date = new Date(), weeks = 12): ScoringStats => {
    const cur = isoWeekOf(now);
    const from = shiftWeek(cur.year, cur.week, -(weeks - 1));
    const inWindow = (y: number, w: number) => (y > from.year || (y === from.year && w >= from.week)) && (y < cur.year || (y === cur.year && w <= cur.week));
    const list = (ws.weeklyReports || []).filter(r => r.kind === 'project' && r.aiAssessment && inWindow(r.year, r.week));
    const byFlag: Partial<Record<AiAssessmentFlag, number>> = {};
    let low = 0;
    const spreads: number[] = [];
    const ai: number[] = [], pmo: number[] = [];
    const ruleGaps: number[] = [];
    list.forEach(r => {
        const a = r.aiAssessment!;
        if (a.confidence === 'low') low++;
        (a.flags || []).forEach(f => { byFlag[f] = (byFlag[f] || 0) + 1; });
        if (typeof a.spread === 'number' && (a.runs?.length || 0) > 1) spreads.push(a.spread);
        if (typeof a.ruleScore === 'number') ruleGaps.push(Math.abs(a.score - a.ruleScore));
        const rating = r.projectId ? pmoRatingFor(ws.pmoRatings, r.projectId, r.year, r.week) : undefined;
        if (rating) { ai.push(a.score); pmo.push(rating.score); }
    });
    const mae = ai.length ? round1(ai.reduce((s, v, i) => s + Math.abs(v - pmo[i]), 0) / ai.length) : null;
    const advice: string[] = [];
    if (list.length && low / list.length > 0.3) advice.push(`Değerlendirmelerin %${Math.round((low / list.length) * 100)}'inin güveni düşük: rapor metinleri çok genel olabilir ya da model tutarsız; tekrar sayısını artırın ve rapor kılavuzunu hatırlatın.`);
    if (ai.length < MIN_AGREEMENT_PAIRS) advice.push(`PMO puanıyla uyumu ölçmek için en az ${MIN_AGREEMENT_PAIRS} eşleşen değerlendirme gerekir (şu an ${ai.length}).`);
    else if (mae !== null && mae > 2) advice.push(`AI puanı PMO puanından ortalama ${String(mae).replace('.', ',')} puan sapıyor: sağlık skorundaki ağırlığını düşürmeyi ya da kapatmayı düşünün.`);
    else if (mae !== null) advice.push(`AI puanı PMO puanıyla uyumlu (ortalama fark ${String(mae).replace('.', ',')} puan).`);
    return {
        weeks,
        assessed: list.length,
        low,
        byFlag,
        avgSpread: spreads.length ? round1(spreads.reduce((s, v) => s + v, 0) / spreads.length) : null,
        pmo: { n: ai.length, mae, r: pearson(ai, pmo) },
        rule: { n: ruleGaps.length, mae: ruleGaps.length ? round1(ruleGaps.reduce((s, v) => s + v, 0) / ruleGaps.length) : null },
        advice,
    };
};
