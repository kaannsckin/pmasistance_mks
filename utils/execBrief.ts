import { WorkspaceData } from '../types';
import { attentionItems, executiveSummary, portfolioHealth } from './executive';
import { orgCapacity } from './deptScorecard';
import { topPortfolioRisks } from './risks';
import { recentChanges } from './recentChanges';

/**
 * Yönetici brifingi — "detay görmeden her şeye tek bakışta eriş". Mevcut
 * motorları (sağlık + dikkat + departman karnesi + top riskler) tek okunur
 * düz metne indirir; panoya kopyalanabilir / .txt olarak indirilebilir.
 * Saf/test edilebilir; ExecBriefModal render eder.
 */

const pct = (u: number | null): string => (u === null ? '—' : `%${Math.round(u * 100)}`);

export const buildExecutiveBrief = (ws: WorkspaceData, year: number, now: Date = new Date()): string => {
    const lines: string[] = [];
    const health = portfolioHealth(ws, year);

    lines.push(`YÖNETİCİ BRİFİNGİ — ${year}`);
    lines.push(now.toLocaleDateString('tr-TR'));
    lines.push('');

    lines.push(`GENEL DURUM (Portföy sağlığı %${health.orgScore})`);
    lines.push(executiveSummary(ws, year, now));
    lines.push('');

    const attn = attentionItems(ws, year, now);
    lines.push(`DİKKAT GEREKTİRENLER (${attn.length})`);
    if (attn.length === 0) lines.push('- Kritik uyarı yok.');
    else attn.slice(0, 8).forEach(a => lines.push(`- [${a.severity === 'error' ? 'KRİTİK' : 'UYARI'}] ${a.title} — ${a.detail}`));
    lines.push('');

    const org = orgCapacity(ws, year);
    lines.push('DEPARTMAN YÜKÜ');
    lines.push(`Toplam ${org.totalHeadcount} kişi · kapasite ${org.totalCapacityAA} AA · plan ${org.totalPlannedAA} AA · doluluk ${pct(org.utilization)}.`);
    const flagged = org.departments.filter(d => d.band !== 'good').slice(0, 6);
    if (flagged.length === 0) lines.push('- Tüm bölümler dengeli doluluğa sahip.');
    else flagged.forEach(d => lines.push(`- ${d.name}: doluluk ${pct(d.utilization)}${d.overAllocatedPeople > 0 ? `, ${d.overAllocatedPeople} aşırı tahsis` : ''}${d.reasons.length ? ` (${d.reasons.join(', ')})` : ''}`));
    lines.push('');

    const risks = topPortfolioRisks(ws).slice(0, 5);
    lines.push('EN KRİTİK RİSKLER');
    if (risks.length === 0) lines.push('- Açık risk yok.');
    else risks.forEach(r => lines.push(`- ${r.projectName}: ${r.title} (skor ${r.score})`));
    lines.push('');

    const changes = recentChanges(ws, now, 7);
    lines.push(`SON DEĞİŞİKLİKLER (son 7 gün, ${changes.length})`);
    if (changes.length === 0) lines.push('- Kayıtlı değişiklik yok.');
    else changes.slice(0, 6).forEach(c => lines.push(`- ${c.summary}`));

    return lines.join('\n');
};
