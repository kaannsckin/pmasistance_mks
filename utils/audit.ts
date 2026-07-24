import { AuditAction, AuditEntry, UserRole, WorkspaceData } from '../types';
import { ROLE_LABELS } from './allocations';

/**
 * Denetim günlüğü — kritik aksiyonları (kim/ne zaman/ne) kaydeder.
 * Saf: appendAudit yeni bir workspace kopyası döner (en yeni kayıt başta).
 * localStorage şişmesini önlemek için son MAX_ENTRIES kayıt tutulur.
 */

const MAX_ENTRIES = 500;

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
    'project.create': 'Proje oluşturuldu',
    'project.delete': 'Proje silindi',
    'project.owner': 'Proje sahibi değişti',
    'project.rag': 'RAG durumu değişti',
    'risk.add': 'Risk eklendi',
    'risk.close': 'Risk kapatıldı',
    'plan.submit': 'Plan onaya gönderildi',
    'plan.approve': 'Plan onaylandı/kilitlendi',
    'plan.reject': 'Plan reddedildi',
    'plan.unlock': 'Plan kilidi açıldı',
    'data.import': 'Veri içe aktarıldı',
    'identity.change': 'Kimlik/rol değişti',
    'health.fix': 'Veri düzeltmesi uygulandı',
    'snapshot.create': 'Anlık görüntü alındı',
};

export const AUDIT_ACTION_ICONS: Record<AuditAction, string> = {
    'project.create': 'fa-folder-plus',
    'project.delete': 'fa-folder-minus',
    'project.owner': 'fa-user-gear',
    'project.rag': 'fa-heart-pulse',
    'risk.add': 'fa-shield-halved',
    'risk.close': 'fa-shield-heart',
    'plan.submit': 'fa-paper-plane',
    'plan.approve': 'fa-lock',
    'plan.reject': 'fa-rotate-left',
    'plan.unlock': 'fa-lock-open',
    'data.import': 'fa-file-import',
    'identity.change': 'fa-user-shield',
    'health.fix': 'fa-wrench',
    'snapshot.create': 'fa-camera',
};

const newId = (): string => `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const actorName = (ws: WorkspaceData): string | undefined => {
    const p = ws.people.find(x => x.id === ws.currentPersonId);
    return p ? `${p.firstName} ${p.lastName}`.trim() : undefined;
};

/** Aktif kimlikle bir denetim kaydı üretir (workspace'e eklemeden). */
export const createAuditEntry = (
    ws: WorkspaceData,
    action: AuditAction,
    summary: string,
    projectId?: string,
): AuditEntry => ({
    id: newId(),
    at: new Date().toISOString(),
    actorRole: ws.currentRole || 'py',
    actorPersonId: ws.currentPersonId,
    actorName: actorName(ws),
    action,
    summary,
    projectId,
});

/** Kaydı workspace günlüğüne ekler (en yeni başta, MAX_ENTRIES ile sınırlı). */
export const appendAudit = (
    ws: WorkspaceData,
    action: AuditAction,
    summary: string,
    projectId?: string,
): WorkspaceData => {
    const entry = createAuditEntry(ws, action, summary, projectId);
    const log = [entry, ...(ws.auditLog || [])].slice(0, MAX_ENTRIES);
    return { ...ws, auditLog: log };
};

/** Rol etiketi + kişi adı ("Proje Yöneticisi · Ali Veli") */
export const actorLabel = (entry: Pick<AuditEntry, 'actorRole' | 'actorName'>): string => {
    const role = ROLE_LABELS[entry.actorRole as UserRole] || entry.actorRole;
    return entry.actorName ? `${role} · ${entry.actorName}` : role;
};
