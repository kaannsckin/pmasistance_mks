import { Allocation, Project, RagStatus, Resource, RiskLevel, Task, TaskStatus, WorkspaceData } from '../../types';
import { createAllocation, getPlanLockStatus, setAllocationCell } from '../allocations';
import { appendAudit } from '../audit';
import { canEditActualCell, canEditPlanCell, canEditProjectContent, identityOf } from '../rbac';
import { createRisk, riskScore } from '../risks';

/**
 * AI'nın önerdiği veri değişiklikleri — ASLA kendiliğinden uygulanmaz.
 * Asistan bir öneri kartı üretir; kullanıcı "Uygula" derse burada yeniden
 * doğrulanır (yetki, plan kilidi, kaydın hâlâ var olması) ve uygulanır.
 * Her uygulama denetim günlüğüne 'ai.apply' olarak yazılır; App geri-al sunar.
 */

export type AiAction =
    | { type: 'risk_ekle'; projectId: string; title: string; description?: string; probability: RiskLevel; impact: RiskLevel; mitigation?: string; ownerPersonId?: string }
    | { type: 'gorev_ekle'; projectId: string; name: string; priority: Task['priority']; resourceName?: string; dueDate?: string; time?: { best: number; avg: number; worst: number }; notes?: string }
    | { type: 'gorev_durumu'; projectId: string; taskId: string; status: TaskStatus }
    | { type: 'rag_guncelle'; projectId: string; rag: RagStatus; ragNote?: string }
    | { type: 'tahsis_ayarla'; personId: string; projectId: string; year: number; month: number; field: 'plan' | 'actual'; value: number };

export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'failed';

export interface AiProposal {
    id: string;
    action: AiAction;
    title: string;
    details: { label: string; value: string }[];
    status: ProposalStatus;
    message?: string;
}

const TASK_STATUS_TR: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'Backlog', [TaskStatus.ToDo]: 'Yapılacak', [TaskStatus.InProgress]: 'Devam Ediyor', [TaskStatus.Done]: 'Tamamlandı',
};
const RAG_TR: Record<RagStatus, string> = { green: 'Yolunda', amber: 'Riskli', red: 'Kritik' };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const fullName = (ws: WorkspaceData, personId?: string): string | undefined => {
    const p = personId ? ws.people.find(x => x.id === personId) : undefined;
    return p ? `${p.firstName} ${p.lastName}`.trim() : undefined;
};

const projectOf = (ws: WorkspaceData, id: string): Project | undefined => ws.projects.find(p => p.id === id);

/** Bu tahsis için kullanılacak satır: aynı kişi+proje+yıl, tercihen iş paketsiz/rolsüz satır */
export const findAllocationRow = (ws: WorkspaceData, personId: string, projectId: string, year: number): Allocation | undefined => {
    const rows = ws.allocations.filter(a => a.personId === personId && a.projectId === projectId && a.year === year);
    return rows.find(a => !a.workPackageId && !a.role) || rows[0];
};

/** Uygulamadan önce (ve öneri anında) doğrulama — sorun varsa Türkçe açıklama, yoksa null */
export const validateAction = (ws: WorkspaceData, action: AiAction): string | null => {
    const id = identityOf(ws);
    const project = projectOf(ws, action.projectId);
    if (!project) return 'Proje bulunamadı (silinmiş olabilir).';

    if (action.type === 'tahsis_ayarla') {
        if (!ws.people.some(p => p.id === action.personId)) return 'Kişi veri havuzunda bulunamadı.';
        if (!Number.isInteger(action.month) || action.month < 1 || action.month > 12) return 'Ay 1-12 arasında olmalı.';
        if (!Number.isInteger(action.year) || action.year < 2000 || action.year > 2100) return 'Geçersiz yıl.';
        if (!Number.isFinite(action.value) || action.value < 0 || action.value > 1.5) return 'Adam-ay değeri 0 ile 1,5 arasında olmalı.';
        if (action.field === 'plan') {
            if (!canEditPlanCell(ws, id, ws.planLocks, action.projectId, action.personId, action.year)) {
                return getPlanLockStatus(ws.planLocks, action.projectId, action.year) !== 'draft'
                    ? `${project.name} · ${action.year} planı onayda/kilitli; plan değiştirilemez (gerçekleşen girilebilir).`
                    : 'Bu kişinin bu projedeki planını düzenleme yetkiniz yok.';
            }
        } else if (!canEditActualCell(ws, id, action.projectId, action.personId)) {
            return 'Bu kişinin bu projedeki gerçekleşenini girme yetkiniz yok.';
        }
        return null;
    }

    if (!canEditProjectContent(ws, id, action.projectId)) return `"${project.name}" projesinde değişiklik yetkiniz yok (yalnızca proje sahibi Proje Yöneticisi).`;
    switch (action.type) {
        case 'risk_ekle':
            if (!action.title.trim()) return 'Risk başlığı boş olamaz.';
            if (![1, 2, 3, 4, 5].includes(action.probability) || ![1, 2, 3, 4, 5].includes(action.impact)) return 'Olasılık ve etki 1-5 arasında olmalı.';
            return null;
        case 'gorev_ekle':
            if (!action.name.trim()) return 'Görev adı boş olamaz.';
            if (action.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(action.dueDate)) return 'Bitiş tarihi YYYY-AA-GG biçiminde olmalı.';
            return null;
        case 'gorev_durumu':
            return project.tasks.some(t => t.id === action.taskId) ? null : 'Görev bulunamadı (silinmiş olabilir).';
        case 'rag_guncelle':
            return null;
    }
};

/** Öneri kartında gösterilecek başlık ve ayrıntılar */
export const describeAction = (ws: WorkspaceData, action: AiAction): { title: string; details: { label: string; value: string }[] } => {
    const project = projectOf(ws, action.projectId);
    const pName = project?.name || '?';
    switch (action.type) {
        case 'risk_ekle':
            return {
                title: `Risk ekle: ${action.title}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Olasılık × Etki', value: `${action.probability} × ${action.impact} = ${action.probability * action.impact}` },
                    ...(action.ownerPersonId ? [{ label: 'Sahibi', value: fullName(ws, action.ownerPersonId) || '?' }] : []),
                    ...(action.mitigation ? [{ label: 'Aksiyon', value: action.mitigation }] : []),
                    ...(action.description ? [{ label: 'Açıklama', value: action.description }] : []),
                ],
            };
        case 'gorev_ekle':
            return {
                title: `Görev ekle: ${action.name}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Öncelik', value: action.priority },
                    ...(action.resourceName ? [{ label: 'Atanan', value: action.resourceName }] : []),
                    ...(action.dueDate ? [{ label: 'Bitiş', value: action.dueDate }] : []),
                    ...(action.time ? [{ label: 'Süre (gün)', value: `${action.time.best} / ${action.time.avg} / ${action.time.worst}` }] : []),
                    ...(action.notes ? [{ label: 'Açıklama', value: action.notes }] : []),
                ],
            };
        case 'gorev_durumu': {
            const task = project?.tasks.find(t => t.id === action.taskId);
            return {
                title: `Görev durumu: ${task?.name || '?'}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Durum', value: `${task ? TASK_STATUS_TR[task.status] : '?'} → ${TASK_STATUS_TR[action.status]}` },
                ],
            };
        }
        case 'rag_guncelle':
            return {
                title: `RAG durumu: ${pName}`,
                details: [
                    { label: 'RAG', value: `${project?.rag ? RAG_TR[project.rag] : 'Belirsiz'} → ${RAG_TR[action.rag]}` },
                    ...(action.ragNote ? [{ label: 'Durum notu', value: action.ragNote }] : []),
                ],
            };
        case 'tahsis_ayarla': {
            const row = findAllocationRow(ws, action.personId, action.projectId, action.year);
            const cur = row?.[action.field][action.month] || 0;
            return {
                title: `${action.field === 'plan' ? 'Plan' : 'Gerçekleşen'} tahsis: ${fullName(ws, action.personId) || '?'}`,
                details: [
                    { label: 'Proje', value: pName },
                    { label: 'Ay', value: `${MONTHS[action.month - 1]} ${action.year}` },
                    { label: 'Adam-ay', value: `${cur.toLocaleString('tr-TR')} → ${action.value.toLocaleString('tr-TR')}` },
                    ...(!row ? [{ label: 'Not', value: 'Bu kişi için projede yeni tahsis satırı açılacak' }] : []),
                ],
            };
        }
    }
};

const newTaskId = (): string => `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const touch = (ws: WorkspaceData, projectId: string, fn: (p: Project) => Project): WorkspaceData => ({
    ...ws,
    projects: ws.projects.map(p => (p.id === projectId ? { ...fn(p), updatedAt: new Date().toISOString() } : p)),
});

/**
 * Eylemi uygular (saf). Önce validateAction çağrılmalı; burada da yeniden
 * kontrol edilir ve sorun varsa hata fırlatılır.
 */
export const applyAction = (ws: WorkspaceData, action: AiAction): { ws: WorkspaceData; summary: string } => {
    const err = validateAction(ws, action);
    if (err) throw new Error(err);
    const project = projectOf(ws, action.projectId)!;
    let next: WorkspaceData;
    let summary: string;

    switch (action.type) {
        case 'risk_ekle': {
            const risk = createRisk({
                title: action.title.trim(),
                description: action.description?.trim() || undefined,
                probability: action.probability,
                impact: action.impact,
                mitigation: action.mitigation?.trim() || undefined,
                ownerPersonId: action.ownerPersonId,
                owner: fullName(ws, action.ownerPersonId),
            });
            next = touch(ws, project.id, p => ({ ...p, risks: [...(p.risks || []), risk] }));
            next = appendAudit(next, 'risk.add', `"${project.name}" · risk eklendi: ${risk.title} (skor ${riskScore(risk)})`, project.id);
            summary = `"${project.name}" projesine risk eklendi: ${risk.title}`;
            break;
        }
        case 'gorev_ekle': {
            const time = action.time || { best: 0, avg: 0, worst: 0 };
            const task: Task = {
                id: newTaskId(), name: action.name.trim(), availability: time.avg > 0, priority: action.priority, version: 1,
                predecessor: null, unit: '', resourceName: action.resourceName || '', time, jiraId: '', notes: action.notes?.trim() || '',
                status: TaskStatus.ToDo, labels: [], includeInSprints: true, ...(action.dueDate ? { dueDate: action.dueDate } : {}),
            };
            next = touch(ws, project.id, p => {
                // Havuzdan atanan kişi proje kaynağı değilse eklenir (görev formuyla aynı davranış)
                let resources = p.resources;
                const assignee = task.resourceName.trim().toLocaleLowerCase('tr-TR');
                if (assignee && !resources.some(r => r.name.trim().toLocaleLowerCase('tr-TR') === assignee)) {
                    const person = ws.people.find(pp => `${pp.firstName} ${pp.lastName}`.trim().toLocaleLowerCase('tr-TR') === assignee);
                    if (person) {
                        const res: Resource = { id: `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: task.resourceName, participation: 100, unit: person.departmentCode || '', title: person.titleCode || 'Uzman' };
                        resources = [...resources, res];
                    }
                }
                return { ...p, tasks: [...p.tasks, task], resources };
            });
            summary = `"${project.name}" projesine görev eklendi: ${task.name}`;
            break;
        }
        case 'gorev_durumu': {
            const task = project.tasks.find(t => t.id === action.taskId)!;
            next = touch(ws, project.id, p => ({ ...p, tasks: p.tasks.map(t => (t.id === action.taskId ? { ...t, status: action.status } : t)) }));
            summary = `"${project.name}" · ${task.name}: ${TASK_STATUS_TR[task.status]} → ${TASK_STATUS_TR[action.status]}`;
            break;
        }
        case 'rag_guncelle': {
            const before = project.rag;
            next = touch(ws, project.id, p => ({ ...p, rag: action.rag, ragNote: action.ragNote ?? p.ragNote }));
            if (before !== action.rag) {
                next = appendAudit(next, 'project.rag', `"${project.name}" RAG: ${before ? RAG_TR[before] : 'Belirsiz'} → ${RAG_TR[action.rag]}`, project.id);
            }
            summary = `"${project.name}" RAG durumu: ${RAG_TR[action.rag]}`;
            break;
        }
        case 'tahsis_ayarla': {
            let base = ws;
            let row = findAllocationRow(ws, action.personId, action.projectId, action.year);
            if (!row) {
                const created = createAllocation(ws.allocations, action.personId, action.projectId, action.year);
                if (!created) throw new Error('Tahsis satırı oluşturulamadı.');
                base = { ...ws, allocations: [...ws.allocations, created] };
                row = created;
            }
            next = setAllocationCell(base, row.id, action.field, action.month, action.value || undefined);
            summary = `${fullName(ws, action.personId)} · ${project.name} · ${MONTHS[action.month - 1]} ${action.year} ${action.field === 'plan' ? 'plan' : 'gerçekleşen'}: ${action.value.toLocaleString('tr-TR')} AA`;
            break;
        }
    }
    next = appendAudit(next, 'ai.apply', `AI önerisiyle: ${summary}`, project.id);
    return { ws: next, summary };
};
