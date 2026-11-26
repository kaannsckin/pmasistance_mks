import type { Project, ProjectKpi } from '../types';
import { addKpiPoint, upsertKpi } from './dashboard/kpi';
import { computePocScores, syncLabel } from './gibPoc';

/**
 * PoC göstergeleri ("PoC skoru", "Zorunlu açık madde"): proje PoC test
 * listesinden ve görevlerin son Jira durumundan hesaplanıp tarihli ölçüm
 * olarak eklenir. Excel aktarımında, her Jira eşitlemesinde ve günlük ölçümde
 * çağrılır; aynı güne ikinci ölçüm öncekinin yerine geçer.
 */

export const GIB_KPI_IDS = { score: 'gib-kpi-poc', mandatory: 'gib-kpi-zorunlu' } as const;

// Gösterge 1 ondalıkla saklanır: kartta ve PoC bileşeninde aynı değer görünür
const round1 = (v: number) => Math.round(v * 10) / 10;

export const POC_SCORE_NOTE = 'Bugün skoru: GİB sonucu (Güncel Sonuç varsa o) + görevin son Jira durumundaki süreç katsayısı. Ağırlık Zorunlu 3, Olması beklenen 2, İsteğe bağlı 1.';

export const withPocKpis = (project: Project, day: string, source = 'Jira eşitlemesi'): Project => {
    const s = computePocScores(project);
    if (!s) return project;
    const note = `${source} · Jira verisi: ${syncLabel(s.syncAt)}`;
    let p = project;
    const cur = (p.kpis || []).find(k => k.id === GIB_KPI_IDS.score);
    const base: ProjectKpi = cur
        ? { ...cur, baseline: cur.baseline ?? round1(s.initial), note: POC_SCORE_NOTE }
        : { id: GIB_KPI_IDS.score, name: 'PoC skoru', unit: 'percent', higherIsBetter: true, source: 'import', points: [], baseline: round1(s.initial), note: POC_SCORE_NOTE };
    p = upsertKpi(p, addKpiPoint(base, { date: day, value: round1(s.today), note }));
    const curM = (p.kpis || []).find(k => k.id === GIB_KPI_IDS.mandatory);
    const baseM: ProjectKpi = curM || { id: GIB_KPI_IDS.mandatory, name: 'Zorunlu açık madde', unit: 'number', higherIsBetter: false, target: 0, source: 'import', points: [] };
    p = upsertKpi(p, addKpiPoint(baseM, { date: day, value: s.mandatoryOpen, note }));
    return p;
};

/** Son ölçüm bugünkü skordan farklıysa (ya da bugün ölçüm yoksa) günceller; değişiklik yoksa aynı nesne */
export const refreshPocKpis = (project: Project, day: string, source?: string): Project => {
    const s = computePocScores(project);
    if (!s) return project;
    const k = (project.kpis || []).find(x => x.id === GIB_KPI_IDS.score);
    const last = k?.points[k.points.length - 1];
    if (last && last.date === day && last.value === round1(s.today)) {
        const m = (project.kpis || []).find(x => x.id === GIB_KPI_IDS.mandatory);
        const lm = m?.points[m.points.length - 1];
        if (lm && lm.date === day && lm.value === s.mandatoryOpen) return project;
    }
    return withPocKpis(project, day, source);
};
