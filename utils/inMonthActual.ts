import { WorkspaceData, WorklogEntry } from '../types';
import { MONTH_INDEXES } from './allocations';
import { effectiveWorkdays, isHalfDay, isWorkday } from './planning/workdays';

/**
 * Ay içi tahmini gerçekleşen adam-ay (BL-22, danışman Soru 9). Gerçekleşen
 * adam-ay ay kapanışında (Billed Hours, PYB) kesinleşir; EVM ve maliyet son
 * kapanan aya kadar hesaplanır (BL-07). Açık ayda ise PY'nin haftalık rapora
 * çektiği worklog'dan bir tahmin üretilir — ayrı gösterilir, EVM'e girmez.
 *
 * Worklog her günü kapsamayabilir (rapor Perşembe çekilir, Cuma gelmez); bu
 * yüzden plan da yalnız worklog'u olan iş günlerine oranlanır: tahmin, "kayıt
 * olan günlerde plana göre ne kadar harcandı" sorusunu yanıtlar.
 */

const HOURS_PER_DAY = 8;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface InMonthEstimate {
    year: number;
    month: number;
    /** Worklog'u olan iş günü sayısı (arife 0,5) */
    coveredDays: number;
    lastDate: string;
    hours: number;
    /** Kayıtlı saatlerin adam-ay karşılığı (saat / (8 × ayın iş günü)) */
    estimatedAA: number;
    /** Ayın planının kayıtlı günlere düşen payı */
    planToDateAA: number;
    /** estimated / planToDate; plan yoksa null */
    ratio: number | null;
}

const entryKey = (e: WorklogEntry) => `${e.date.slice(0, 10)}|${e.author}|${e.issueKey || ''}|${e.summary}|${e.hours}`;

/** Projenin açık aylarındaki (son kapanan aydan sonra, bugüne kadar) tahmini gerçekleşeni; veri yoksa boş */
export const inMonthEstimates = (
    ws: Pick<WorkspaceData, 'allocations' | 'weeklyReports'>,
    projectId: string,
    now: Date = new Date(),
): InMonthEstimate[] => {
    const year = now.getFullYear();
    const current = now.getMonth() + 1;
    // Son kapanan ay: gerçekleşeni girilmiş son ay (hiç yoksa yıl başından itibaren açık sayılır)
    let closed = 0;
    ws.allocations.forEach(a => { if (a.year === year) MONTH_INDEXES.forEach(m => { if (m > closed && m < current && (a.actual[m] || 0) > 0) closed = m; }); });
    const seen = new Set<string>();
    const byMonth = new Map<number, WorklogEntry[]>();
    (ws.weeklyReports || []).forEach(r => {
        if (r.projectId !== projectId) return;
        (r.worklog || []).forEach(e => {
            const d = new Date(`${e.date.slice(0, 10)}T00:00:00`);
            if (d.getFullYear() !== year || d > now) return;
            const m = d.getMonth() + 1;
            if (m <= closed || m > current || !(e.hours > 0)) return;
            const k = entryKey(e);
            if (seen.has(k)) return;
            seen.add(k);
            byMonth.set(m, [...(byMonth.get(m) || []), e]);
        });
    });
    return [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([month, entries]) => {
        const days = [...new Set(entries.map(e => e.date.slice(0, 10)))].map(d => new Date(`${d}T00:00:00`)).filter(isWorkday);
        const coveredDays = days.reduce((n, d) => n + (isHalfDay(d) ? 0.5 : 1), 0);
        const monthDays = effectiveWorkdays(year, month);
        const hours = entries.reduce((s, e) => s + e.hours, 0);
        const plan = ws.allocations.filter(a => a.projectId === projectId && a.year === year).reduce((s, a) => s + (a.plan[month] || 0), 0);
        const estimatedAA = monthDays > 0 ? hours / (HOURS_PER_DAY * monthDays) : 0;
        const planToDateAA = monthDays > 0 ? plan * Math.min(1, coveredDays / monthDays) : 0;
        return {
            year, month, coveredDays, hours: r2(hours),
            lastDate: entries.map(e => e.date.slice(0, 10)).sort().slice(-1)[0],
            estimatedAA: r2(estimatedAA), planToDateAA: r2(planToDateAA),
            ratio: planToDateAA > 0 ? r2(estimatedAA / planToDateAA) : null,
        };
    });
};
