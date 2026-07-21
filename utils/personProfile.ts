import { Person, RiskStatus, TaskStatus, WorkspaceData } from '../types';
import { MONTH_INDEXES } from './allocations';
import { RiskBand, riskBand, riskScore } from './risks';

/**
 * Kişi profili: bir kişinin TÜM projelerdeki durumunu tek yerde toplar.
 * Bölüm Sorumlusu'nun "Ayşe'nin durumu ne?" ve PM'in kaynak pazarlığı için.
 * Saf/test edilebilir — UI PersonDetailModal bu veriyi render eder.
 */

export interface PersonProjectLoad {
    projectId: string;
    projectName: string;
    months: number[]; // 12 (plan)
    total: number;
    role?: string;
}

export interface PersonTaskRef {
    taskId: string;
    taskName: string;
    projectId: string;
    projectName: string;
    status: TaskStatus;
    dueDate?: string;
    overdue: boolean;
}

export interface PersonRiskRef {
    riskId: string;
    title: string;
    projectId: string;
    projectName: string;
    score: number;
    band: RiskBand;
    status: RiskStatus;
}

export interface PersonProfile {
    person: Person;
    year: number;
    capacity: number; // availableAA (aylık)
    monthlyPlan: number[]; // 12 (tüm projeler toplamı)
    monthlyActual: number[];
    totalPlanAA: number;
    totalActualAA: number;
    byProject: PersonProjectLoad[]; // plan AA'ya göre azalan
    overMonths: number[]; // kapasiteyi aşan aylar (1-12)
    tasks: PersonTaskRef[]; // isme göre eşleşen görevler (tüm projeler)
    risks: PersonRiskRef[]; // sahibi bu kişi olan riskler (tüm projeler)
    projectCount: number;
    roles: string[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const trKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');

export const buildPersonProfile = (ws: WorkspaceData, personId: string, year: number, now: Date = new Date()): PersonProfile | null => {
    const person = ws.people.find(p => p.id === personId);
    if (!person) return null;

    const projectName = new Map(ws.projects.map(p => [p.id, p.name]));
    const cap = person.availableAA ?? 1;
    const monthlyPlan = Array(12).fill(0) as number[];
    const monthlyActual = Array(12).fill(0) as number[];
    const byProjectMap = new Map<string, PersonProjectLoad>();

    ws.allocations.filter(a => a.personId === personId && a.year === year).forEach(a => {
        let row = byProjectMap.get(a.projectId);
        if (!row) {
            row = { projectId: a.projectId, projectName: projectName.get(a.projectId) || 'Bilinmeyen Proje', months: Array(12).fill(0), total: 0, role: a.role };
            byProjectMap.set(a.projectId, row);
        }
        MONTH_INDEXES.forEach(m => {
            const v = a.plan[m] || 0;
            monthlyPlan[m - 1] += v;
            monthlyActual[m - 1] += a.actual[m] || 0;
            row!.months[m - 1] += v;
            row!.total += v;
        });
    });

    const overMonths = MONTH_INDEXES.filter(m => monthlyPlan[m - 1] > cap + 1e-9);

    // İsme göre görevler (tüm projeler) — tahsis kaydı adla eşleşiyorsa görev de eşleşir
    const fullName = trKey(`${person.firstName} ${person.lastName}`);
    const today = now.toISOString().split('T')[0];
    const tasks: PersonTaskRef[] = [];
    ws.projects.forEach(p => {
        p.tasks.forEach(t => {
            if (trKey(t.resourceName || '') === fullName) {
                tasks.push({
                    taskId: t.id,
                    taskName: t.name,
                    projectId: p.id,
                    projectName: p.name,
                    status: t.status,
                    dueDate: t.dueDate,
                    overdue: !!t.dueDate && t.dueDate < today && t.status !== TaskStatus.Done,
                });
            }
        });
    });
    tasks.sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1) || a.taskName.localeCompare(b.taskName, 'tr'));

    // Sahibi bu kişi olan riskler (havuz ataması: ownerPersonId; eski kayıtlar için ad eşleşmesi)
    const risks: PersonRiskRef[] = [];
    ws.projects.forEach(p => {
        (p.risks || []).forEach(r => {
            const isOwner = r.ownerPersonId
                ? r.ownerPersonId === personId
                : !!r.owner && trKey(r.owner) === fullName;
            if (!isOwner) return;
            const score = riskScore(r);
            risks.push({
                riskId: r.id,
                title: r.title,
                projectId: p.id,
                projectName: p.name,
                score,
                band: riskBand(score),
                status: r.status,
            });
        });
    });
    risks.sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || b.score - a.score);

    const byProject = Array.from(byProjectMap.values())
        .map(r => ({ ...r, months: r.months.map(round2), total: round2(r.total) }))
        .filter(r => r.total > 0)
        .sort((a, b) => b.total - a.total);

    return {
        person,
        year,
        capacity: cap,
        monthlyPlan: monthlyPlan.map(round2),
        monthlyActual: monthlyActual.map(round2),
        totalPlanAA: round2(monthlyPlan.reduce((a, b) => a + b, 0)),
        totalActualAA: round2(monthlyActual.reduce((a, b) => a + b, 0)),
        byProject,
        overMonths,
        tasks,
        risks,
        projectCount: byProject.length,
        roles: person.roles,
    };
};
