import { Project, ProjectKpi } from '../../types';

/** Projeye özel göstergelerin (KPI) saf yardımcıları — aktarım gibi hafif yerlerden de kullanılır */

/** Ölçüm ekler; aynı güne ikinci ölçüm öncekinin yerine geçer. Tarih sırası korunur. */
export const addKpiPoint = (k: ProjectKpi, p: { date: string; value: number; note?: string }): ProjectKpi => {
    const points = [...k.points.filter(x => x.date !== p.date), { date: p.date, value: p.value, ...(p.note ? { note: p.note } : {}) }]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-60);
    return { ...k, points };
};

export const newKpiId = (): string => `kpi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Proje gösterge listesine ekler ya da aynı kimlikliyi değiştirir */
export const upsertKpi = (project: Project, kpi: ProjectKpi): Project => {
    const list = project.kpis || [];
    return { ...project, kpis: list.some(k => k.id === kpi.id) ? list.map(k => (k.id === kpi.id ? kpi : k)) : [...list, kpi] };
};
