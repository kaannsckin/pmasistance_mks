import { RagStatus, TaskStatus, WorkspaceData } from '../types';
import { MONTH_INDEXES } from './allocations';
import { riskBand, riskScore } from './risks';

/**
 * Haftalık durum raporu üreticisi — mevcut proje verisinden (görevler, RAG,
 * notlar, tahsis, riskler) AI'sız, deterministik bir taslak metin üretir.
 * PM'in Teams/e-posta'ya yapıştıracağı raporun iskeletini hazır getirir;
 * istenirse Gemini ile "parlatılır".
 */

const RAG_TR: Record<RagStatus, string> = { green: 'Yeşil (Yolunda)', amber: 'Sarı (Riskli)', red: 'Kırmızı (Kritik)' };

/** NotesView ile aynı ISO hafta hesabı */
export const getIsoWeek = (d: Date): number => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export interface StatusReport {
    projectName: string;
    week: number;
    year: number;
    text: string; // Yapıştırmaya hazır düz metin
    hasContent: boolean;
}

const fmtAA = (v: number) => (Math.round(v * 100) / 100).toString().replace('.', ',');

export const buildStatusReport = (ws: WorkspaceData, projectId: string, now: Date = new Date()): StatusReport | null => {
    const project = ws.projects.find(p => p.id === projectId);
    if (!project) return null;

    const week = getIsoWeek(now);
    const year = now.getFullYear();
    const today = now.toISOString().split('T')[0];
    const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];

    const tasks = project.tasks;
    const done = tasks.filter(t => t.status === TaskStatus.Done).length;
    const inProgress = tasks.filter(t => t.status === TaskStatus.InProgress);
    const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
    const overdue = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== TaskStatus.Done);
    const upcoming = tasks.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= in7 && t.status !== TaskStatus.Done);

    const weekNotes = project.notes.filter(n => n.weekNumber === week && n.year === year);

    // Bu ayın tahsis durumu (bu proje)
    const month = now.getMonth() + 1;
    const monthAlloc = ws.allocations.filter(a => a.projectId === projectId && a.year === year);
    const monthPlan = monthAlloc.reduce((s, a) => s + (a.plan[month] || 0), 0);
    const monthActual = monthAlloc.reduce((s, a) => s + (a.actual[month] || 0), 0);

    const topRisks = (project.risks || [])
        .filter(r => r.status !== 'closed')
        .map(r => ({ ...r, score: riskScore(r), band: riskBand(riskScore(r)) }))
        .sort((a, b) => b.score - a.score)
        .filter(r => r.band !== 'low')
        .slice(0, 3);

    // ---- Düz metin ----
    const L: string[] = [];
    L.push(`${project.name} — Haftalık Durum Raporu`);
    L.push(`Hafta ${week} / ${year}`);
    if (project.rag) L.push(`Genel Durum: ${RAG_TR[project.rag]}${project.ragNote ? ` — ${project.ragNote}` : ''}`);
    L.push('');

    L.push(`İlerleme: %${progress} (${done}/${tasks.length} görev tamamlandı)`);
    if (inProgress.length > 0) {
        L.push(`Süregelen işler (${inProgress.length}):`);
        inProgress.slice(0, 6).forEach(t => L.push(`  • ${t.name}${t.resourceName ? ` — ${t.resourceName}` : ''}`));
        if (inProgress.length > 6) L.push(`  • … ve ${inProgress.length - 6} iş daha`);
    }
    L.push('');

    if (overdue.length > 0) {
        L.push(`⚠ Termini geçen işler (${overdue.length}):`);
        overdue.slice(0, 6).forEach(t => L.push(`  • ${t.name} (termin ${t.dueDate})${t.resourceName ? ` — ${t.resourceName}` : ''}`));
        L.push('');
    }
    if (upcoming.length > 0) {
        L.push(`Önümüzdeki 7 gün terminli (${upcoming.length}):`);
        upcoming.slice(0, 6).forEach(t => L.push(`  • ${t.name} (termin ${t.dueDate})`));
        L.push('');
    }

    if (monthPlan > 0 || monthActual > 0) {
        L.push(`Bu ay işgücü (AA): plan ${fmtAA(monthPlan)} / gerçekleşen ${fmtAA(monthActual)}`);
        L.push('');
    }

    if (topRisks.length > 0) {
        L.push('Öne çıkan riskler:');
        topRisks.forEach(r => L.push(`  • [${r.score}] ${r.title}${r.owner ? ` — ${r.owner}` : ''}${r.mitigation ? ` (aksiyon: ${r.mitigation})` : ''}`));
        L.push('');
    }

    if (weekNotes.length > 0) {
        L.push('Bu haftanın notları:');
        weekNotes.forEach(n => {
            const clean = n.content.replace(/\s+/g, ' ').trim();
            L.push(`  • ${clean.length > 160 ? clean.slice(0, 157) + '…' : clean}`);
        });
        L.push('');
    }

    const text = L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const hasContent = tasks.length > 0 || weekNotes.length > 0 || monthPlan > 0 || topRisks.length > 0;

    return { projectName: project.name, week, year, text, hasContent };
};

/** Gemini "parlat" istemi — AIAssistant altyapısı kullanılabilir */
export const buildPolishPrompt = (report: StatusReport): string =>
    `Aşağıdaki proje durum raporu taslağını, verileri DEĞİŞTİRMEDEN akıcı ve profesyonel bir yönetici e-postasına dönüştür. Türkçe, kısa ve net paragraflar kullan. Sayıları ve isimleri aynen koru:\n\n${report.text}`;
