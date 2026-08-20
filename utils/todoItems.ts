import { TaskStatus, View, WorkspaceData } from '../types';
import { canApprovePlan, canEnterData, findOverAllocations, getPlanLockStatus, MONTHS_TR } from './allocations';
import { isExecRole } from './execReport';
import { identityOf, visiblePersonIds, visibleProjectIds } from './rbac';

/**
 * Yapılacaklar paneli: tamamen mevcut veriden türetilen, role göre filtrelenen
 * akıllı hatırlatıcılar. Backend yok — her açılışta/veri değişiminde hesaplanır.
 */

export interface TodoItem {
    id: string;
    severity: 'danger' | 'warn' | 'info';
    icon: string; // fa-solid ikon adı
    text: string;
    view: View; // tıklanınca gidilecek ekran
    projectId?: string; // proje bağlamı gerekiyorsa (önce proje açılır)
}

const SEVERITY_ORDER: Record<TodoItem['severity'], number> = { danger: 0, warn: 1, info: 2 };

export const buildTodoItems = (ws: WorkspaceData, now: Date = new Date()): TodoItem[] => {
    const role = ws.currentRole;
    const year = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const items: TodoItem[] = [];
    const identity = identityOf(ws);
    const projectIds = visibleProjectIds(ws, identity);
    const personIds = visiblePersonIds(ws, identity);
    const scopedProjects = ws.projects.filter(p => projectIds.has(p.id));
    const scopedAllocations = ws.allocations.filter(a => projectIds.has(a.projectId) && personIds.has(a.personId));
    const projectName = new Map(scopedProjects.map(p => [p.id, p.name]));

    const yearAllocations = scopedAllocations.filter(a => a.year === year);
    const projectsWithPlan = new Set(
        yearAllocations.filter(a => Object.values(a.plan).some(v => (v || 0) > 0)).map(a => a.projectId)
    );

    // 1) Onay bekleyen planlar (onaylayan roller)
    if (canApprovePlan(role)) {
        ws.planLocks.filter(l => l.status === 'submitted' && projectIds.has(l.projectId)).forEach(l => {
            items.push({
                id: `approve-${l.projectId}-${l.year}`,
                severity: 'warn',
                icon: 'fa-hourglass-half',
                text: `${projectName.get(l.projectId) || 'Proje'} — ${l.year} planı onayınızı bekliyor`,
                view: View.Allocations,
            });
        });
    }

    if (canEnterData(role)) {
        // 2) Girilmemiş gerçekleşen aylar (bu yıl, geçmiş aylar)
        const missingMonths: number[] = [];
        for (let m = 1; m < currentMonth; m++) {
            const planSum = yearAllocations.reduce((s, a) => s + (a.plan[m] || 0), 0);
            const actualSum = yearAllocations.reduce((s, a) => s + (a.actual[m] || 0), 0);
            if (planSum > 0 && actualSum === 0) missingMonths.push(m);
        }
        if (missingMonths.length > 0) {
            items.push({
                id: `missing-actuals-${year}`,
                severity: 'warn',
                icon: 'fa-pen-to-square',
                text: `Gerçekleşen girilmemiş aylar: ${missingMonths.map(m => MONTHS_TR[m - 1]).join(', ')} (${year})`,
                view: View.Allocations,
            });
        }

        // 3) Onaya gönderilmemiş taslak planlar (plan verisi olan projeler)
        projectsWithPlan.forEach(pid => {
            if (getPlanLockStatus(ws.planLocks, pid, year) === 'draft') {
                items.push({
                    id: `draft-${pid}-${year}`,
                    severity: 'info',
                    icon: 'fa-paper-plane',
                    text: `${projectName.get(pid) || 'Proje'} — ${year} planı henüz onaya gönderilmedi`,
                    view: View.Allocations,
                });
            }
        });
    }

    // 4) Termini geçen görevler (proje bazında; yönetici de görür)
    const today = now.toISOString().split('T')[0];
    scopedProjects.forEach(p => {
        const overdue = p.tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== TaskStatus.Done);
        if (overdue.length > 0) {
            items.push({
                id: `overdue-${p.id}`,
                severity: 'danger',
                icon: 'fa-calendar-xmark',
                text: `${p.name} — ${overdue.length} görev terminini aştı`,
                view: View.Tasks,
                projectId: p.id,
            });
        }
    });

    // 5) Kritik (kırmızı) RAG projeleri
    scopedProjects.filter(p => p.rag === 'red').forEach(p => {
        items.push({
            id: `rag-${p.id}`,
            severity: 'danger',
            icon: 'fa-heart-pulse',
            text: `${p.name} kritik durumda${p.ragNote ? ` — ${p.ragNote}` : ''}`,
            view: isExecRole(role) ? View.Executive : View.Portfolio,
        });
    });

    // 6) Aşırı tahsisler (bu yıl planı)
    const overs = findOverAllocations(yearAllocations, ws.people.filter(p => personIds.has(p.id)), year, 'plan');
    if (overs.length > 0) {
        items.push({
            id: `over-${year}`,
            severity: 'warn',
            icon: 'fa-triangle-exclamation',
            text: `${year} planında ${overs.length} aşırı tahsis (kişi-ay) var`,
            view: View.Allocations,
        });
    }

    // 7) Veri havuzu eksikleri (PYB Destek)
    if (role === 'pyb_destek') {
        const missingTitle = ws.people.filter(p => !p.titleCode).length;
        if (missingTitle > 0) {
            items.push({
                id: 'pool-missing-title',
                severity: 'info',
                icon: 'fa-user-pen',
                text: `${missingTitle} personelin ünvanı eksik (maliyet hesabına girmiyor)`,
                view: View.DataPool,
            });
        }
        const uncostedTitles = ws.titles.filter(t => !t.monthlyCost).length;
        if (ws.titles.length > 0 && uncostedTitles > 0) {
            items.push({
                id: 'pool-uncosted-titles',
                severity: 'info',
                icon: 'fa-coins',
                text: `${uncostedTitles} ünvanın aylık maliyeti girilmemiş`,
                view: View.DataPool,
            });
        }
    }

    return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.text.localeCompare(b.text, 'tr'));
};

/** Zil rozetinde gösterilecek sayı (info hariç) */
export const todoBadgeCount = (items: TodoItem[]): number =>
    items.filter(i => i.severity !== 'info').length;
