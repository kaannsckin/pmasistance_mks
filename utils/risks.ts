import { Risk, RiskStatus, WorkspaceData } from '../types';

/** Risk skoru = olasılık × etki (1-25) ve önem bandı */
export type RiskBand = 'low' | 'medium' | 'high';

export const riskScore = (r: Pick<Risk, 'probability' | 'impact'>): number => r.probability * r.impact;

export const riskBand = (score: number): RiskBand => {
    if (score >= 15) return 'high';
    if (score >= 8) return 'medium';
    return 'low';
};

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
    low: 'Düşük', medium: 'Orta', high: 'Yüksek',
};

export const RISK_BAND_HEX: Record<RiskBand, string> = {
    low: '#10b981', medium: '#f59e0b', high: '#ef4444',
};

export const RISK_STATUS_LABELS: Record<RiskStatus, string> = {
    open: 'Açık', monitoring: 'İzleniyor', closed: 'Kapandı',
};

export const createRisk = (partial: Partial<Risk> = {}): Risk => ({
    id: `risk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    probability: 3,
    impact: 3,
    status: 'open',
    createdAt: new Date().toISOString(),
    ...partial,
});

export interface PortfolioRisk extends Risk {
    projectId: string;
    projectName: string;
    score: number;
    band: RiskBand;
}

/** Portföy geneli açık/izlenen riskler, skora göre azalan (kapananlar hariç) */
export const topPortfolioRisks = (ws: WorkspaceData): PortfolioRisk[] => {
    const rows: PortfolioRisk[] = [];
    ws.projects.forEach(p => {
        (p.risks || []).forEach(r => {
            if (r.status === 'closed') return;
            rows.push({ ...r, projectId: p.id, projectName: p.name, score: riskScore(r), band: riskBand(riskScore(r)) });
        });
    });
    return rows.sort((a, b) => b.score - a.score || a.projectName.localeCompare(b.projectName, 'tr'));
};

export interface RiskSummary {
    total: number; // açık + izlenen
    high: number;
    medium: number;
    low: number;
    closed: number;
}

export const summarizeRisks = (ws: WorkspaceData): RiskSummary => {
    let high = 0, medium = 0, low = 0, closed = 0;
    ws.projects.forEach(p => (p.risks || []).forEach(r => {
        if (r.status === 'closed') { closed++; return; }
        const b = riskBand(riskScore(r));
        if (b === 'high') high++; else if (b === 'medium') medium++; else low++;
    }));
    return { total: high + medium + low, high, medium, low, closed };
};
