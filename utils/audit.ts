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
    'release.commit': 'Sürüm planı aktarıldı',
    'data.import': 'Veri içe aktarıldı',
    'identity.change': 'Kimlik/rol değişti',
    'health.fix': 'Veri düzeltmesi uygulandı',
    'health.rate': 'PMO sağlık puanı verildi',
    'access.update': 'Yetki / profil değişti',
    'config.update': 'Uygulama ayarı değişti',
    'snapshot.create': 'Anlık görüntü alındı',
    'ai.apply': 'AI önerisi uygulandı',
    'expectation.create': 'Yönetimden beklenti eklendi',
    'expectation.respond': 'Beklenti yanıtlandı',
    'expectation.close': 'Beklenti kapandı',
    'report.submit': 'Haftalık rapor gönderildi',
    'report.approve': 'Haftalık rapor onaylandı',
    'report.return': 'Haftalık rapor iade edildi',
    'report.publish': 'Haftalık rapor yayınlandı',
    'meeting.submit': 'Müşteri görüşmesi onaya sunuldu',
    'meeting.approve': 'Müşteri görüşmesi onaylandı',
    'meeting.reject': 'Müşteri görüşmesi reddedildi',
    'meeting.held': 'Müşteri görüşmesi gerçekleşti',
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
    'release.commit': 'fa-flag-checkered',
    'data.import': 'fa-file-import',
    'identity.change': 'fa-user-shield',
    'health.fix': 'fa-wrench',
    'health.rate': 'fa-heart-pulse',
    'access.update': 'fa-user-lock',
    'config.update': 'fa-sliders',
    'snapshot.create': 'fa-camera',
    'ai.apply': 'fa-wand-magic-sparkles',
    'expectation.create': 'fa-flag',
    'expectation.respond': 'fa-reply',
    'expectation.close': 'fa-circle-check',
    'report.submit': 'fa-paper-plane',
    'report.approve': 'fa-check-double',
    'report.return': 'fa-rotate-left',
    'report.publish': 'fa-bullhorn',
    'meeting.submit': 'fa-handshake',
    'meeting.approve': 'fa-circle-check',
    'meeting.reject': 'fa-circle-xmark',
    'meeting.held': 'fa-people-group',
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

/** Denetim günlüğü süzgeci: eylem grubu (ör. "report"), proje ve metin */
export const filterAudit = (
    entries: AuditEntry[],
    f: { group?: string; projectId?: string; query?: string; from?: string; to?: string },
    projectName: (id: string) => string | undefined = () => undefined,
): AuditEntry[] => {
    const q = f.query?.trim().toLocaleLowerCase('tr-TR');
    // Tarih aralığı yerel gün olarak karşılaştırılır ("YYYY-AA-GG", uçlar dahil)
    const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    return entries.filter(e =>
        (!f.from || localDay(e.at) >= f.from)
        && (!f.to || localDay(e.at) <= f.to)
        && (!f.group || e.action.split('.')[0] === f.group)
        && (!f.projectId || e.projectId === f.projectId)
        && (!q || [e.summary, e.actorName, AUDIT_ACTION_LABELS[e.action], e.projectId ? projectName(e.projectId) : ''].join(' ').toLocaleLowerCase('tr-TR').includes(q)));
};

export const AUDIT_GROUP_LABELS: Record<string, string> = {
    project: 'Proje', risk: 'Risk', plan: 'Plan', data: 'Veri', identity: 'Kimlik', health: 'Veri sağlığı',
    snapshot: 'Anlık görüntü', ai: 'AI', expectation: 'Beklenti', report: 'Haftalık rapor', meeting: 'Görüşme', access: 'Yetki', config: 'Ayar',
};

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Excel'de açılan CSV (noktalı virgül ayraçlı, UTF-8 BOM) */
export const auditToCsv = (entries: AuditEntry[], projectName: (id: string) => string | undefined = () => undefined): string => {
    const rows = [['Tarih', 'Eylem', 'Özet', 'Kişi / rol', 'Proje']];
    entries.forEach(e => rows.push([
        new Date(e.at).toLocaleString('tr-TR'),
        AUDIT_ACTION_LABELS[e.action] || e.action,
        e.summary,
        actorLabel(e),
        e.projectId ? projectName(e.projectId) || '' : '',
    ]));
    return `﻿${rows.map(r => r.map(csvCell).join(';')).join('\r\n')}`;
};
