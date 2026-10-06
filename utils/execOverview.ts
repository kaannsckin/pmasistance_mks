import { PlanLockStatus, ProjectStatus, RagStatus, TaskStatus, WorkspaceData } from '../types';
import { buildExecReport } from './execReport';
import { HealthBand, portfolioHealth } from './executive';

/**
 * Modern yönetim ekranının veri katmanı. Onlarca projede yönetici her projeyi
 * tek tek görmek yerine önce dağılımı ve yalnızca dikkat isteyenleri görür;
 * tam liste ayrı ekrandaki tabloda süzülür ve sıralanır.
 */

export interface ExecProjectRow {
    projectId: string;
    name: string;
    code?: string;
    status: ProjectStatus;
    rag?: RagStatus;
    ragNote?: string;
    pmName?: string;
    score: number; // 0-100 sağlık skoru
    band: HealthBand;
    reasons: string[];
    spi: number | null;
    cpi: number | null;
    highRisks: number;
    progressPct: number;
    taskTotal: number;
    overdueTasks: number;
    planAA: number;
    actualAA: number;
    lockStatus: PlanLockStatus;
}

export const buildExecProjectRows = (ws: WorkspaceData, year: number, now: Date = new Date()): ExecProjectRow[] => {
    const report = buildExecReport(ws, year);
    const health = new Map(portfolioHealth(ws, year).projects.map(h => [h.projectId, h]));
    const people = new Map(ws.people.map(p => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    const projects = new Map(ws.projects.map(p => [p.id, p]));
    const today = now.toISOString().slice(0, 10);
    return report.projects.map(r => {
        const h = health.get(r.projectId);
        const p = projects.get(r.projectId);
        return {
            projectId: r.projectId,
            name: r.name,
            code: r.code,
            status: r.status,
            rag: r.rag,
            ragNote: r.ragNote,
            pmName: p?.pmPersonId ? people.get(p.pmPersonId) : undefined,
            score: h?.score ?? 100,
            band: h?.band ?? 'good',
            reasons: h?.reasons ?? [],
            spi: h?.spi ?? null,
            cpi: h?.cpi ?? null,
            highRisks: h?.highRisks ?? 0,
            progressPct: r.progressPct,
            taskTotal: r.taskCount,
            overdueTasks: (p?.tasks || []).filter(t => t.dueDate && t.dueDate.slice(0, 10) < today && t.status !== TaskStatus.Done).length,
            planAA: r.planAA,
            actualAA: r.actualAA,
            lockStatus: r.lockStatus,
        };
    });
};

export interface HealthDistribution {
    bad: number;
    warn: number;
    good: number;
    total: number;
}

export const healthDistribution = (rows: ExecProjectRow[]): HealthDistribution => {
    const d = { bad: 0, warn: 0, good: 0, total: rows.length };
    rows.forEach(r => { d[r.band]++; });
    return d;
};

const BAND_RANK: Record<HealthBand, number> = { bad: 0, warn: 1, good: 2 };

/**
 * Dikkat isteyen projeler: sağlık skoru düşük (kritik/izlemede), PM'in
 * kırmızı/sarı işaretlediği ya da geciken görevi olanlar; en kötüsü başta.
 * Tamamlanan projeler hariç.
 */
export const attentionProjects = (rows: ExecProjectRow[], limit = 5): ExecProjectRow[] =>
    rows
        .filter(r => r.status !== 'tamamlandi' && (r.band !== 'good' || r.overdueTasks > 0 || r.rag === 'red' || r.rag === 'amber'))
        .sort((a, b) => BAND_RANK[a.band] - BAND_RANK[b.band] || a.score - b.score || b.overdueTasks - a.overdueTasks || a.name.localeCompare(b.name, 'tr'))
        .slice(0, limit);

/** Bir projenin neden dikkat istediğini kısa etiketlerle anlatır */
export const attentionReasons = (row: ExecProjectRow): string[] => {
    const out = [...row.reasons];
    if (row.overdueTasks > 0) out.push(`${row.overdueTasks} geciken görev`);
    if (row.lockStatus === 'submitted') out.push('Plan onay bekliyor');
    return out;
};

export type ExecSortKey = 'health' | 'name' | 'progress' | 'spi' | 'cpi' | 'risks' | 'overdue' | 'plan';
export type SortDir = 'asc' | 'desc';

export interface ExecRowFilter {
    query?: string;
    band?: HealthBand | 'all';
    status?: ProjectStatus | 'all';
}

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

export const filterExecRows = (rows: ExecProjectRow[], f: ExecRowFilter): ExecProjectRow[] => {
    const q = lower((f.query || '').trim());
    return rows.filter(r =>
        (!f.band || f.band === 'all' || r.band === f.band) &&
        (!f.status || f.status === 'all' || r.status === f.status) &&
        (!q || lower(r.name).includes(q) || lower(r.code || '').includes(q) || lower(r.pmName || '').includes(q))
    );
};

/** null değerler (maliyetlenmemiş SPI/CPI) yöne bakılmaksızın sona gider */
export const sortExecRows = (rows: ExecProjectRow[], key: ExecSortKey, dir: SortDir): ExecProjectRow[] => {
    const val = (r: ExecProjectRow): number | string | null => {
        switch (key) {
            case 'health': return r.score;
            case 'name': return lower(r.name);
            case 'progress': return r.progressPct;
            case 'spi': return r.spi;
            case 'cpi': return r.cpi;
            case 'risks': return r.highRisks;
            case 'overdue': return r.overdueTasks;
            case 'plan': return r.planAA;
        }
    };
    const sign = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va === null && vb === null) return a.name.localeCompare(b.name, 'tr');
        if (va === null) return 1;
        if (vb === null) return -1;
        const c = typeof va === 'string' ? va.localeCompare(vb as string, 'tr') : (va as number) - (vb as number);
        return c !== 0 ? c * sign : a.name.localeCompare(b.name, 'tr');
    });
};
