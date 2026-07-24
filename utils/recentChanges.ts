import { AuditAction, AuditEntry, WorkspaceData } from '../types';

/**
 * "Ne değişti?" akışı — denetim günlüğünden yöneticiye dönük değişim özeti.
 * Son N gün içindeki portföy değişikliklerini (RAG, risk, onay, proje, veri)
 * en yeni başta döner. Rol anahtarı / anlık görüntü gibi "değişiklik olmayan"
 * kayıtlar elenir. Saf/test edilebilir; ExecutiveView ve brifing kullanır.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Akışta gösterilmeyen (portföy değişimi sayılmayan) aksiyonlar
const FEED_EXCLUDE = new Set<AuditAction>(['identity.change', 'snapshot.create']);

export interface RecentChange extends AuditEntry {
    projectName?: string;
}

export const recentChanges = (ws: WorkspaceData, now: Date = new Date(), days = 7): RecentChange[] => {
    const cutoff = now.getTime() - days * DAY_MS;
    const projName = new Map(ws.projects.map(p => [p.id, p.name]));
    return (ws.auditLog || [])
        .filter(e => !FEED_EXCLUDE.has(e.action) && new Date(e.at).getTime() >= cutoff)
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(e => ({ ...e, projectName: e.projectId ? projName.get(e.projectId) : undefined }));
};

export const recentChangeCount = (ws: WorkspaceData, now: Date = new Date(), days = 7): number =>
    recentChanges(ws, now, days).length;

/** İnsan-okur göreli zaman ("az önce", "3 sa önce", "2 gün önce") */
export const relativeTime = (iso: string, now: Date = new Date()): string => {
    const diff = now.getTime() - new Date(iso).getTime();
    if (diff < 0) return 'az önce';
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'az önce';
    if (min < 60) return `${min} dk önce`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} sa önce`;
    const day = Math.floor(hr / 24);
    return `${day} gün önce`;
};
