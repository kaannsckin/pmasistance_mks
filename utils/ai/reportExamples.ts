import { ReportCategory, WeeklyReport, WorkspaceData } from '../../types';
import { PermissionHolder } from '../permissions';
import { buildBm25, searchBm25 } from '../rag/bm25';
import { isReportSteward, itemDisplay } from '../weeklyReport';
import { tokenF1 } from './reportAiStats';
import { weekBefore } from './weeklyReportPrompt';

/**
 * Dinamik üslup örnekleri ve düzeltme örnekleri. Aday: kurumda onaylanmış
 * proje raporları, yalnız yazılan haftadan ÖNCEKİ haftalar; rapor kendisi
 * asla (değerlendirmede zaman sızıntısı olmasın). Sıralama: öncelik (altın
 * set ya da "örnek" işareti +3, aynı proje +2, aynı PY +1,5, aynı bölüm +1)
 * ve girdiyle BM25 benzerliği. Seçim madde düzeyindedir: türler çeşitlenir,
 * aynı rapordan en çok 3, aynı projeden en çok 4 madde; toplam bütçe sınırlı.
 * Yeni bir PY'nin geçmişi olmasa da bölüm ya da kurum örnekleri gelir.
 *
 * Düzeltme örnekleri: AI'nın ilk yazdığı ile onaylanan hâli belirgin farklı
 * (terim F1 < 0,8) maddeler; önce aynı bölüm, sonra kurum geneli.
 */

export const EXAMPLE_BUDGET = 1500;
export const EXAMPLE_PER_REPORT = 3;
export const EXAMPLE_PER_PROJECT = 4;
export const CORRECTION_LIMIT = 3;
export const CORRECTION_THRESHOLD = 0.8;
const ITEM_CLIP = 300;
const PAIR_CLIP = 250;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const PRIORITY = { golden: 3, project: 2, pm: 1.5, department: 1 } as const;

type ExWs = Pick<WorkspaceData, 'projects'> & Partial<Pick<WorkspaceData, 'weeklyReports' | 'reportGoldenSet'>>;
type Target = Pick<WeeklyReport, 'id' | 'year' | 'week' | 'projectId' | 'departmentCode'>;

export interface StyleExample {
    text: string;
    category: ReportCategory;
    reportId: string;
    projectId?: string;
    score: number;
}

/** Zaman ayrımlı aday raporlar: onaylı, yazılan haftadan önce, kendisi hariç */
const candidates = (ws: ExWs, report: Target, before: { year: number; week: number }) =>
    (ws.weeklyReports || []).filter(r => r.stage === 'approved' && r.kind === 'project' && r.id !== report.id && weekBefore(r, before));

/** Raporun öncelik puanı (BM25 hariç) */
export const examplePriority = (ws: ExWs, report: Target, r: WeeklyReport, golden = new Set((ws.reportGoldenSet || []).map(g => g.reportId))): number => {
    const pmOf = (id?: string) => ws.projects.find(p => p.id === id)?.pmPersonId;
    const pm = pmOf(report.projectId);
    return (golden.has(r.id) || r.exemplar ? PRIORITY.golden : 0)
        + (r.projectId && r.projectId === report.projectId ? PRIORITY.project : 0)
        + (pm && pmOf(r.projectId) === pm ? PRIORITY.pm : 0)
        + (r.departmentCode && r.departmentCode === report.departmentCode ? PRIORITY.department : 0);
};

/** Madde düzeyinde üslup örnekleri (sıralı); bütçe ve çeşitlilik kurallarıyla */
export const selectStyleExamples = (o: { ws: ExWs; report: Target; input: string; before?: { year: number; week: number }; budget?: number }): StyleExample[] => {
    const before = o.before || o.report;
    const pool = candidates(o.ws, o.report, before);
    if (!pool.length) return [];
    const golden = new Set((o.ws.reportGoldenSet || []).map(g => g.reportId));
    const idx = buildBm25(pool.map(r => ({ title: '', text: r.thisWeek.map(itemDisplay).join('\n') })));
    const sim = new Map(searchBm25(idx, o.input, pool.length).map(h => [h.index, h.score]));
    const maxSim = Math.max(0, ...sim.values());
    // Rapor puanı: öncelik + normalleştirilmiş benzerlik (0–2); eşitlikte yeni hafta önce
    const ranked = pool
        .map((r, i) => ({ r, score: examplePriority(o.ws, o.report, r, golden) + (maxSim ? (2 * (sim.get(i) || 0)) / maxSim : 0) }))
        .sort((a, b) => b.score - a.score || b.r.year - a.r.year || b.r.week - a.r.week);
    const budget = o.budget ?? EXAMPLE_BUDGET;
    const out: StyleExample[] = [];
    const perReport = new Map<string, number>(), perProject = new Map<string, number>();
    const seenText = new Set<string>();
    const cats = new Set<ReportCategory>();
    let used = 0;
    const tryAdd = (r: WeeklyReport, score: number, text: string, category: ReportCategory): boolean => {
        const t = clip(text.trim(), ITEM_CLIP);
        const key = t.toLocaleLowerCase('tr-TR');
        if (!t || seenText.has(key) || used + t.length > budget) return false;
        if ((perReport.get(r.id) || 0) >= EXAMPLE_PER_REPORT || (perProject.get(r.projectId || '') || 0) >= EXAMPLE_PER_PROJECT) return false;
        seenText.add(key);
        perReport.set(r.id, (perReport.get(r.id) || 0) + 1);
        perProject.set(r.projectId || '', (perProject.get(r.projectId || '') || 0) + 1);
        cats.add(category);
        used += t.length;
        out.push({ text: t, category, reportId: r.id, projectId: r.projectId, score: Math.round(score * 100) / 100 });
        return true;
    };
    // 1. tur: her türden bir madde (en iyi raporlardan); 2. tur: kalan bütçe sırayla
    ranked.forEach(({ r, score }) => r.thisWeek.forEach(i => { if (!cats.has(i.category)) tryAdd(r, score, itemDisplay(i), i.category); }));
    ranked.forEach(({ r, score }) => r.thisWeek.forEach(i => tryAdd(r, score, itemDisplay(i), i.category)));
    return out;
};

export interface CorrectionPair {
    ai: string;
    approved: string;
    reportId: string;
    sameDepartment: boolean;
}

/** AI'nın ilk yazdığı → kurumda onaylanan hâl çiftleri (en çok 3; önce aynı bölüm, yeni hafta önce) */
export const correctionPairs = (o: { ws: ExWs; report: Target; before?: { year: number; week: number }; limit?: number }): CorrectionPair[] => {
    const before = o.before || o.report;
    const pairs: (CorrectionPair & { year: number; week: number; f1: number })[] = [];
    candidates(o.ws, o.report, before).forEach(r => [...r.thisWeek, ...r.nextWeek].forEach(i => {
        if (!i.aiOriginal) return;
        const now = itemDisplay(i);
        const f1 = tokenF1(i.aiOriginal.text, now);
        if (f1 >= CORRECTION_THRESHOLD || !now.trim()) return;
        pairs.push({ ai: clip(i.aiOriginal.text, PAIR_CLIP), approved: clip(now, PAIR_CLIP), reportId: r.id, sameDepartment: r.departmentCode === o.report.departmentCode, year: r.year, week: r.week, f1 });
    }));
    return pairs
        .sort((a, b) => Number(b.sameDepartment) - Number(a.sameDepartment) || b.year - a.year || b.week - a.week || a.f1 - b.f1)
        .slice(0, o.limit ?? CORRECTION_LIMIT)
        .map(({ ai, approved, reportId, sameDepartment }) => ({ ai, approved, reportId, sameDepartment }));
};

/** "Örnek rapor" işareti (yalnız PYB destek, onaylı proje raporu); uygunsuzsa null */
export const setReportExemplar = (ws: Pick<WorkspaceData, 'weeklyReports'>, who: PermissionHolder, reportId: string, on: boolean): WeeklyReport[] | null => {
    const reports = ws.weeklyReports || [];
    const r = reports.find(x => x.id === reportId);
    if (!isReportSteward(who) || !r || r.kind !== 'project' || r.stage !== 'approved') return null;
    return reports.map(x => {
        if (x.id !== reportId) return x;
        const { exemplar: _e, ...rest } = x;
        void _e;
        return on ? { ...rest, exemplar: true } : rest;
    });
};
