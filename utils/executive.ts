import { Project, RagStatus, TaskStatus, WorkspaceData } from '../types';
import { findOverAllocations, getPlanLockStatus } from './allocations';
import { buildProjectEVM, defaultStatusMonth, ProjectEVM } from './evm';
import { riskScore } from './risks';
import { analyzeDataHealth } from './dataHealth';

/**
 * Yönetim özeti motoru — "özet gör, istersen detaya in".
 *  - portfolioHealth: RAG + takvim(SPI) + bütçe(CPI) + risk'i tek skora indirir
 *  - attentionItems: yöneticinin dikkat etmesi gereken her şeyi tek listede
 *  - executiveSummary: sade, otomatik bir paragraf
 * Saf/test edilebilir; ExecutiveView bu veriyi render eder.
 */

export type HealthBand = 'good' | 'warn' | 'bad';

export interface ProjectHealth {
    projectId: string;
    name: string;
    score: number; // 0-100
    band: HealthBand;
    rag?: RagStatus;
    spi: number | null;
    cpi: number | null;
    highRisks: number;
    reasons: string[]; // skoru düşüren nedenler
}

export interface PortfolioHealth {
    projects: ProjectHealth[];
    orgScore: number;
    orgBand: HealthBand;
}

const round = (v: number): number => Math.round(v);
const bandOf = (score: number): HealthBand => (score >= 75 ? 'good' : score >= 50 ? 'warn' : 'bad');

const projectHighRisks = (project: Project): number =>
    (project.risks || []).filter(r => r.status !== 'closed' && riskScore(r) >= 15).length;

export const projectHealth = (ws: WorkspaceData, project: Project, year: number, statusMonth: number): ProjectHealth => {
    const evm: ProjectEVM = buildProjectEVM(ws, project.id, year, statusMonth);
    const highRisks = projectHighRisks(project);
    const reasons: string[] = [];
    let score = 100;

    // RAG
    if (project.rag === 'red') { score -= 35; reasons.push('Kritik RAG'); }
    else if (project.rag === 'amber') { score -= 15; reasons.push('Riskli RAG'); }
    else if (!project.rag) { score -= 5; }

    // Takvim (SPI) — yalnız maliyetlenebiliyorsa
    if (evm.costed && evm.spi !== null) {
        if (evm.spi < 0.9) { score -= 20; reasons.push('Takvim gerisinde (SPI<0,9)'); }
        else if (evm.spi < 1) { score -= 10; reasons.push('Takvim hafif geride'); }
    }
    // Bütçe (CPI)
    if (evm.costed && evm.cpi !== null) {
        if (evm.cpi < 0.9) { score -= 20; reasons.push('Bütçe aşımı (CPI<0,9)'); }
        else if (evm.cpi < 1) { score -= 10; reasons.push('Bütçe hafif aşımda'); }
    }
    // Risk
    if (highRisks >= 2) { score -= 15; reasons.push(`${highRisks} yüksek risk`); }
    else if (highRisks === 1) { score -= 8; reasons.push('1 yüksek risk'); }

    score = Math.max(0, Math.min(100, score));
    return {
        projectId: project.id,
        name: project.name,
        score: round(score),
        band: bandOf(score),
        rag: project.rag,
        spi: evm.costed ? evm.spi : null,
        cpi: evm.costed ? evm.cpi : null,
        highRisks,
        reasons,
    };
};

export const portfolioHealth = (ws: WorkspaceData, year: number, statusMonth?: number): PortfolioHealth => {
    const sm = statusMonth === undefined ? defaultStatusMonth(year) : statusMonth;
    const projects = ws.projects.map(p => projectHealth(ws, p, year, sm)).sort((a, b) => a.score - b.score);
    const orgScore = projects.length ? round(projects.reduce((s, p) => s + p.score, 0) / projects.length) : 100;
    return { projects, orgScore, orgBand: bandOf(orgScore) };
};

// ---------------------------------------------------------------- Dikkat

export type AttentionCategory = 'rag' | 'approval' | 'budget' | 'schedule' | 'risk' | 'overdue' | 'overalloc' | 'data';

export interface AttentionItem {
    id: string;
    severity: 'error' | 'warn';
    category: AttentionCategory;
    title: string;
    detail: string;
    projectId?: string; // tıklayınca gidilecek proje
}

const todayISO = (now: Date): string => now.toISOString().split('T')[0];

export const attentionItems = (ws: WorkspaceData, year: number, now: Date = new Date(), statusMonth?: number): AttentionItem[] => {
    const sm = statusMonth === undefined ? defaultStatusMonth(year) : statusMonth;
    const items: AttentionItem[] = [];
    const today = todayISO(now);

    ws.projects.forEach(p => {
        if (p.rag === 'red') items.push({ id: `rag-${p.id}`, severity: 'error', category: 'rag', title: `Kritik: ${p.name}`, detail: p.ragNote || 'Kırmızı RAG — acil müdahale', projectId: p.id });
        else if (p.rag === 'amber') items.push({ id: `rag-${p.id}`, severity: 'warn', category: 'rag', title: `Riskli: ${p.name}`, detail: p.ragNote || 'Sarı RAG — izlemede', projectId: p.id });

        if (getPlanLockStatus(ws.planLocks, p.id, year) === 'submitted')
            items.push({ id: `appr-${p.id}`, severity: 'warn', category: 'approval', title: `Onay bekliyor: ${p.name}`, detail: `${year} planı onayınızı bekliyor`, projectId: p.id });

        const overdue = p.tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== TaskStatus.Done).length;
        if (overdue > 0) items.push({ id: `due-${p.id}`, severity: 'warn', category: 'overdue', title: `${overdue} geciken görev: ${p.name}`, detail: 'Termini geçmiş, tamamlanmamış görevler', projectId: p.id });

        const evm = buildProjectEVM(ws, p.id, year, sm);
        if (evm.costed && evm.cpi !== null && evm.cpi < 1)
            items.push({ id: `cpi-${p.id}`, severity: evm.cpi < 0.9 ? 'error' : 'warn', category: 'budget', title: `Bütçe aşımı: ${p.name}`, detail: `CPI ${evm.cpi.toLocaleString('tr-TR')} · tahmini aşım hesaba katılmalı`, projectId: p.id });
        if (evm.costed && evm.spi !== null && evm.spi < 0.9)
            items.push({ id: `spi-${p.id}`, severity: 'warn', category: 'schedule', title: `Takvim sapması: ${p.name}`, detail: `SPI ${evm.spi.toLocaleString('tr-TR')} · plan gerisinde`, projectId: p.id });

        const high = projectHighRisks(p);
        if (high > 0) items.push({ id: `risk-${p.id}`, severity: high >= 2 ? 'error' : 'warn', category: 'risk', title: `${high} yüksek risk: ${p.name}`, detail: 'Skoru 15+ açık/izlenen risk', projectId: p.id });
    });

    const over = findOverAllocations(ws.allocations.filter(a => a.year === year), ws.people, year, 'plan', ws.leaves || []);
    if (over.length > 0) {
        const names = Array.from(new Set(over.map(o => o.personName))).slice(0, 3).join(', ');
        items.push({ id: 'overalloc', severity: 'warn', category: 'overalloc', title: `${over.length} aşırı tahsis (kişi-ay)`, detail: `${names}${over.length > 3 ? ' ve diğerleri' : ''} kapasitesini aşıyor` });
    }

    const health = analyzeDataHealth(ws);
    if (health.counts.error > 0)
        items.push({ id: 'data', severity: 'error', category: 'data', title: `${health.counts.error} veri hatası`, detail: 'Yetim tahsis / eşleşmeyen atama — Veri Sağlığı denetimini açın' });

    const sevRank = { error: 0, warn: 1 };
    return items.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
};

// ---------------------------------------------------------------- Özet

const round1 = (v: number): number => Math.round(v * 10) / 10;

export const executiveSummary = (ws: WorkspaceData, year: number, now: Date = new Date()): string => {
    const projects = ws.projects;
    const rag = { green: 0, amber: 0, red: 0, none: 0 };
    projects.forEach(p => { if (p.rag) rag[p.rag]++; else rag.none++; });
    const devam = projects.filter(p => p.status === 'devam').length;
    const teklif = projects.filter(p => p.status === 'teklif').length;

    const yearAllocs = ws.allocations.filter(a => a.year === year);
    const sum = (field: 'plan' | 'actual'): number => yearAllocs.reduce((s, a) => s + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((t, m) => t + (a[field][m] || 0), 0), 0);
    const planAA = round1(sum('plan'));
    const actualAA = round1(sum('actual'));
    const over = findOverAllocations(yearAllocs, ws.people, year, 'plan', ws.leaves || []).length;
    const highRisk = projects.reduce((s, p) => s + projectHighRisks(p), 0);
    const health = portfolioHealth(ws, year);

    const parts: string[] = [];
    parts.push(`${year}: ${projects.length} proje (${devam} devam, ${teklif} teklif).`);
    const ragBits: string[] = [];
    if (rag.red) ragBits.push(`${rag.red} kritik`);
    if (rag.amber) ragBits.push(`${rag.amber} riskli`);
    if (rag.green) ragBits.push(`${rag.green} yolunda`);
    if (ragBits.length) parts.push(`${ragBits.join(', ')}.`);
    parts.push(`Portföy sağlığı %${health.orgScore}.`);
    parts.push(`Plan ${planAA} AA, gerçekleşen ${actualAA} AA.`);
    if (over > 0) parts.push(`${over} aşırı tahsis var.`);
    if (highRisk > 0) parts.push(`${highRisk} yüksek risk izleniyor.`);
    return parts.join(' ');
};
