import { Risk, RiskStatus, WorkspaceData } from '../types';
import { RiskBand, riskBand, RISK_BAND_LABELS, riskScore, RISK_STATUS_LABELS } from './risks';

/**
 * Risk raporu: proje riskleri tek kayıtta toplanır; yönetim yüksek riskleri
 * tek bakışta, her projeyi ayrı ayrı görür. Kapsam (görünür projeler)
 * çağıran tarafından verilir.
 */

declare const XLSX: any;

export interface ReportRisk extends Risk {
    projectId: string;
    projectName: string;
    projectCode?: string;
    score: number;
    band: RiskBand;
    ownerName?: string;
}

/** Açık + izlenen riskler "aktif" sayılır; kapananlar raporda ayrı tutulur */
export const isActiveRisk = (r: Pick<Risk, 'status'>): boolean => r.status !== 'closed';

const BAND_RANK: Record<RiskBand, number> = { high: 0, medium: 1, low: 2 };

/** Kapsamdaki projelerin tüm riskleri: aktifler önce, skor azalan */
export const reportRisks = (ws: Pick<WorkspaceData, 'projects' | 'people'>, projectIds?: Set<string>): ReportRisk[] => {
    const people = new Map(ws.people.map(p => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    const rows: ReportRisk[] = [];
    ws.projects.forEach(p => {
        if (projectIds && !projectIds.has(p.id)) return;
        (p.risks || []).forEach(r => {
            const score = riskScore(r);
            rows.push({
                ...r,
                projectId: p.id,
                projectName: p.name,
                projectCode: p.code,
                score,
                band: riskBand(score),
                ownerName: (r.ownerPersonId && people.get(r.ownerPersonId)) || r.owner || undefined,
            });
        });
    });
    return rows.sort((a, b) =>
        Number(!isActiveRisk(a)) - Number(!isActiveRisk(b)) || b.score - a.score || a.projectName.localeCompare(b.projectName, 'tr') || a.title.localeCompare(b.title, 'tr'));
};

/** 5×5 matris hücresi anahtarı: "olasılık-etki" */
export const cellKey = (probability: number, impact: number): string => `${probability}-${impact}`;

/** Aktif risklerin matris hücrelerine dağılımı */
export const matrixCounts = (risks: Pick<Risk, 'probability' | 'impact' | 'status'>[]): Record<string, number> => {
    const m: Record<string, number> = {};
    risks.forEach(r => {
        if (!isActiveRisk(r)) return;
        const k = cellKey(r.probability, r.impact);
        m[k] = (m[k] || 0) + 1;
    });
    return m;
};

export interface RiskKpis {
    active: number;
    high: number;
    medium: number;
    low: number;
    monitoring: number;
    closed: number;
    /** En az bir yüksek riski olan proje sayısı */
    highProjects: number;
    /** Azaltıcı aksiyonu yazılmamış yüksek riskler */
    highWithoutAction: number;
    /** Sahibi olmayan aktif riskler */
    withoutOwner: number;
}

export const riskKpis = (rows: ReportRisk[]): RiskKpis => {
    const active = rows.filter(isActiveRisk);
    const high = active.filter(r => r.band === 'high');
    return {
        active: active.length,
        high: high.length,
        medium: active.filter(r => r.band === 'medium').length,
        low: active.filter(r => r.band === 'low').length,
        monitoring: active.filter(r => r.status === 'monitoring').length,
        closed: rows.length - active.length,
        highProjects: new Set(high.map(r => r.projectId)).size,
        highWithoutAction: high.filter(r => !r.mitigation?.trim()).length,
        withoutOwner: active.filter(r => !r.ownerName).length,
    };
};

export interface ProjectRiskGroup {
    projectId: string;
    name: string;
    code?: string;
    high: number;
    medium: number;
    low: number;
    maxScore: number;
    /** Aktif riskler, skor azalan */
    risks: ReportRisk[];
    closed: number;
}

/** Proje bazlı gruplar; en riskli proje başta. Aktif riski olmayanlar sona. */
export const groupByProject = (rows: ReportRisk[]): ProjectRiskGroup[] => {
    const groups = new Map<string, ProjectRiskGroup>();
    rows.forEach(r => {
        const g = groups.get(r.projectId) || { projectId: r.projectId, name: r.projectName, code: r.projectCode, high: 0, medium: 0, low: 0, maxScore: 0, risks: [], closed: 0 };
        if (isActiveRisk(r)) {
            g[r.band]++;
            g.maxScore = Math.max(g.maxScore, r.score);
            g.risks.push(r);
        } else {
            g.closed++;
        }
        groups.set(r.projectId, g);
    });
    return [...groups.values()]
        .map(g => ({ ...g, risks: [...g.risks].sort((a, b) => b.score - a.score || BAND_RANK[a.band] - BAND_RANK[b.band]) }))
        .sort((a, b) => b.maxScore - a.maxScore || b.high - a.high || b.medium - a.medium || a.name.localeCompare(b.name, 'tr'));
};

export type RiskStatusFilter = 'active' | RiskStatus | 'all';

export interface RiskFilter {
    band?: RiskBand | 'all';
    status?: RiskStatusFilter;
    /** Matris hücresi ("olasılık-etki") */
    cell?: string | null;
    query?: string;
}

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

export const filterRisks = <T extends ReportRisk>(rows: T[], f: RiskFilter): T[] => {
    const q = lower((f.query || '').trim());
    const status = f.status || 'active';
    return rows.filter(r =>
        (status === 'all' || (status === 'active' ? isActiveRisk(r) : r.status === status)) &&
        (!f.band || f.band === 'all' || r.band === f.band) &&
        (!f.cell || cellKey(r.probability, r.impact) === f.cell) &&
        (!q || [r.title, r.description, r.projectName, r.projectCode, r.ownerName, r.mitigation].some(v => v && lower(v).includes(q)))
    );
};

/** Excel sayfası: tüm riskler (aktifler önce) */
export const riskReportSheet = (rows: ReportRisk[]): (string | number)[][] => [
    ['Proje', 'Kod', 'Risk', 'Açıklama', 'Olasılık', 'Etki', 'Skor', 'Önem', 'Sahibi', 'Azaltıcı aksiyon', 'Durum'],
    ...rows.map(r => [
        r.projectName, r.projectCode || '', r.title, r.description || '', r.probability, r.impact, r.score,
        RISK_BAND_LABELS[r.band], r.ownerName || '', r.mitigation || '', RISK_STATUS_LABELS[r.status],
    ]),
];

/** Proje özeti sayfası */
export const projectSummarySheet = (groups: ProjectRiskGroup[]): (string | number)[][] => [
    ['Proje', 'Kod', 'Yüksek', 'Orta', 'Düşük', 'En yüksek skor', 'En yüksek risk', 'Kapanan'],
    ...groups.map(g => [g.name, g.code || '', g.high, g.medium, g.low, g.maxScore || '', g.risks[0]?.title || '', g.closed]),
];

export const exportRiskReportToExcel = (rows: ReportRisk[]): void => {
    if (typeof XLSX === 'undefined') {
        alert('Excel kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edip sayfayı yenileyin.');
        return;
    }
    const wb = XLSX.utils.book_new();
    const sheets: [string, (string | number)[][], number[]][] = [
        ['Proje özeti', projectSummarySheet(groupByProject(rows)), [32, 10, 9, 9, 9, 14, 40, 10]],
        ['Risk kaydı', riskReportSheet(rows), [28, 10, 40, 40, 9, 9, 7, 9, 22, 40, 11]],
    ];
    sheets.forEach(([name, aoa, widths]) => {
        const sheet = XLSX.utils.aoa_to_sheet(aoa);
        sheet['!cols'] = widths.map(wch => ({ wch }));
        XLSX.utils.book_append_sheet(wb, sheet, name);
    });
    XLSX.writeFile(wb, `risk-raporu-${new Date().toISOString().split('T')[0]}.xlsx`);
};
