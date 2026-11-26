import type { Project, Task } from '../types';
import {
    categoryName, computePocScores, importanceKey, IMPORTANCE_ORDER, pocCategoryRows, PocCategoryRow, pocDistribution, PocDistribution, PocScores, scopeTaskIds,
} from './gibPoc';

/**
 * GİB Planlama Raporu (aylık sunum) verisi: sunumdaki göstergeler proje
 * verisinden üretilir. Dashboard, zamanlanmış rapor ve sunum aynı hesabı
 * (gibPoc) kullanır. Saf; PowerPoint çizimi gibReportPpt.ts'de.
 */

export interface GibReportHeading {
    /** İş paketi (epic) adı ya da "İş paketi yok" */
    name: string;
    items: number;
    byImportance: Record<string, number>;
    done: number;
}

export interface GibReportData {
    projectName: string;
    /** "Kasım 2026" */
    period: string;
    generatedAt: string;
    scores: PocScores;
    /** Sonuç dağılımı (tüm testler, GİB ilk değerlendirmesi) */
    distribution: PocDistribution;
    mandatoryDistribution: PocDistribution;
    /** Takipteki madde (görevi olan test) sayısı */
    tracked: number;
    /** Olası kapsamdaki madde sayısı ve önem dağılımı */
    scopeItems: number;
    scopeByImportance: Record<string, number>;
    scopeName: string;
    /** Kapsamdaki maddeler başlık (epic) bazında */
    headings: GibReportHeading[];
    categories: (PocCategoryRow & { contribution?: number; alone?: number; awaiting: number })[];
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const importanceOfTask = (t: Task): string => (t.labels || []).map(importanceKey).find(Boolean) || 'Diğer';

export const buildGibReport = (project: Project, opts: { now?: Date; scope?: string[]; awaitingLabel?: string } = {}): GibReportData | undefined => {
    const scores = computePocScores(project, opts.scope);
    if (!scores) return undefined;
    const now = opts.now || new Date();
    const tests = project.poc!.tests;
    const ids = new Set(tests.map(t => t.taskId || `gib-${t.testNo}`));
    const tracked = project.tasks.filter(t => ids.has(t.id));
    const scopeIds = scopeTaskIds(project.tasks, scores.scope);
    const inScope = tracked.filter(t => scopeIds.has(t.id));
    const scopeByImportance: Record<string, number> = {};
    inScope.forEach(t => { const k = importanceOfTask(t); scopeByImportance[k] = (scopeByImportance[k] || 0) + 1; });

    const wpName = (id?: string) => project.workPackages.find(w => w.id === id)?.name || 'İş paketi yok';
    const heads = new Map<string, GibReportHeading>();
    for (const t of inScope) {
        const name = wpName(t.workPackageId);
        const h = heads.get(name) || { name, items: 0, byImportance: {}, done: 0 };
        h.items++;
        const k = importanceOfTask(t);
        h.byImportance[k] = (h.byImportance[k] || 0) + 1;
        if (t.status === 'Done') h.done++;
        heads.set(name, h);
    }
    const awaiting = opts.awaitingLabel || 'GİB yanıtı bekleniyor';
    const scopeSet = new Set(scores.scope);
    const categories = pocCategoryRows(project).filter(c => !scopeSet.has(c.label)).map(c => {
        const contrib = scores.contributions.find(x => x.label === c.label);
        return {
            ...c,
            ...(contrib ? { contribution: contrib.value, alone: contrib.alone } : {}),
            awaiting: project.tasks.filter(t => (t.labels || []).includes(c.label) && (t.labels || []).includes(awaiting)).length,
        };
    });
    return {
        projectName: project.name,
        period: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
        generatedAt: now.toISOString(),
        scores,
        distribution: pocDistribution(tests, 'initial'),
        mandatoryDistribution: pocDistribution(tests, 'initial', 'Zorunlu'),
        tracked: tracked.length,
        scopeItems: inScope.length,
        scopeByImportance,
        scopeName: scores.scope.map(categoryName).join(' + ') || 'Kapsam',
        headings: [...heads.values()].sort((a, b) => b.items - a.items || a.name.localeCompare(b.name, 'tr')),
        categories,
    };
};

export { IMPORTANCE_ORDER };
