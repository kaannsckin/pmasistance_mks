import { CustomerMeeting, MeetingDetails, MeetingLocation, MeetingStatus, WorkspaceData } from '../types';
import { Identity, isExecViewer, managedDepartmentCode, ownsProject, visibleProjectIds } from './rbac';
import { isPyds, isoWeekOf } from './weeklyReport';

/**
 * Planlanan müşteri görüşmeleri: PY ya da bölüm sorumlusu görüşmeyi planlar,
 * yönetici onaylar/reddeder; görüşme yapıldıktan sonra alınan kararlar
 * yazılır ve haftalık raporun toplantı maddesine kaynak olur.
 */

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
    draft: 'Taslak',
    pending: 'Onay bekliyor',
    approved: 'Onaylandı',
    rejected: 'Reddedildi',
    held: 'Gerçekleşti',
    cancelled: 'İptal edildi',
};

export const LOCATION_LABELS: Record<MeetingLocation, string> = {
    bilgem: 'BİLGEM',
    customer: 'Müşteri yerinde',
    online: 'Çevrim içi',
    other: 'Diğer',
};

export const canPlanMeeting = (id: Identity): boolean => (id.role === 'py' || id.role === 'bolum_sorumlu') && !!id.personId;
export const canReviewMeeting = (id: Identity): boolean => isExecViewer(id.role);

export const isOwnMeeting = (m: CustomerMeeting, id: Identity): boolean =>
    !!id.personId && m.createdByPersonId === id.personId && m.createdByRole === id.role;

/** Sahibi taslak/reddedilmiş görüşmeyi düzenler; onaylıda da tarih/ayrıntı değişebilir (yeniden onaya düşer) */
export const canEditMeeting = (m: CustomerMeeting, id: Identity): boolean =>
    isOwnMeeting(m, id) && ['draft', 'pending', 'rejected', 'approved'].includes(m.status);

type WsLike = Pick<WorkspaceData, 'people' | 'projects' | 'allocations'> & Partial<Pick<WorkspaceData, 'customerMeetings'>>;

/** Yönetim ve PYB hepsini; PY kendi açtıklarını ve projelerininkileri; BS bölümününkileri görür (taslaklar yalnız sahibine) */
export const visibleMeetings = (ws: WsLike, id: Identity): CustomerMeeting[] => {
    const all = (ws.customerMeetings || []).filter(m => m.status !== 'draft' || isOwnMeeting(m, id));
    if (isExecViewer(id.role) || isPyds(id.role)) return all;
    if (id.role === 'py') {
        const mine = visibleProjectIds(ws, id);
        return all.filter(m => isOwnMeeting(m, id) || (!!m.projectId && mine.has(m.projectId)));
    }
    if (id.role === 'bolum_sorumlu') {
        const dept = managedDepartmentCode(ws, id);
        return all.filter(m => isOwnMeeting(m, id) || (!!dept && m.departmentCode === dept));
    }
    return [];
};

export type MeetingDraft = Omit<CustomerMeeting, 'id' | 'status' | 'createdByRole' | 'createdByPersonId' | 'createdByName' | 'createdAt' | 'updatedAt' | 'decisions' | 'reviewNote' | 'reviewedByName' | 'reviewedAt' | 'departmentCode'>;

const newId = () => `mt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const personName = (ws: Pick<WorkspaceData, 'people'>, id?: string) => {
    const p = id ? ws.people.find(x => x.id === id) : undefined;
    return p ? `${p.firstName} ${p.lastName}`.trim() : undefined;
};

const clean = (d: MeetingDraft): MeetingDraft => ({
    ...d,
    title: d.title.trim(),
    customer: d.customer.trim(),
    location: d.location.trim(),
    ourParticipants: d.ourParticipants.trim(),
    customerParticipants: d.customerParticipants.trim(),
    agenda: d.agenda.trim(),
    expectedOutcome: d.expectedOutcome.trim(),
    needs: d.needs?.trim() || undefined,
    projectId: d.projectId || undefined,
});

export const createMeeting = (ws: WorkspaceData, d: MeetingDraft, submit: boolean, now: Date = new Date()): CustomerMeeting => {
    const person = ws.people.find(p => p.id === ws.currentPersonId);
    return {
        id: newId(),
        ...clean(d),
        departmentCode: person?.departmentCode || undefined,
        status: submit ? 'pending' : 'draft',
        createdByRole: ws.currentRole || 'py',
        createdByPersonId: ws.currentPersonId,
        createdByName: personName(ws, ws.currentPersonId),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
    };
};

/** Düzenleme; onaylanmış görüşmenin ayrıntısı değişirse yeniden onaya düşer */
export const updateMeeting = (m: CustomerMeeting, d: MeetingDraft, submit: boolean, now: Date = new Date()): CustomerMeeting => ({
    ...m,
    ...clean(d),
    status: submit || m.status === 'approved' || m.status === 'pending' ? 'pending' : m.status === 'rejected' ? 'rejected' : 'draft',
    updatedAt: now.toISOString(),
});

export const reviewMeeting = (ws: WorkspaceData, m: CustomerMeeting, approve: boolean, note: string, now: Date = new Date()): CustomerMeeting => ({
    ...m,
    status: approve ? 'approved' : 'rejected',
    reviewNote: note.trim() || undefined,
    reviewedByName: personName(ws, ws.currentPersonId) || (ws.currentRole === 'mudur' ? 'Müdür' : undefined),
    reviewedAt: now.toISOString(),
    updatedAt: now.toISOString(),
});

export const markHeld = (m: CustomerMeeting, decisions: string, now: Date = new Date()): CustomerMeeting => ({
    ...m, status: 'held', decisions: decisions.trim() || undefined, updatedAt: now.toISOString(),
});

export const setMeetingStatus = (m: CustomerMeeting, status: MeetingStatus, now: Date = new Date()): CustomerMeeting => ({ ...m, status, updatedAt: now.toISOString() });

/** Tarihi geçmiş ama sonucu yazılmamış onaylı görüşme */
export const awaitingOutcome = (m: CustomerMeeting, now: Date = new Date()): boolean => m.status === 'approved' && new Date(m.date).getTime() < now.getTime();

export type MeetingScope = 'upcoming' | 'pending' | 'past' | 'all';

/** Yaklaşan: onaylı/bekleyen ve tarihi gelmemiş; geçmiş: gerçekleşen, iptal ya da tarihi geçen */
export const filterMeetings = (list: CustomerMeeting[], scope: MeetingScope, now: Date = new Date()): CustomerMeeting[] => {
    const t = now.getTime();
    const upcoming = (m: CustomerMeeting) => ['draft', 'pending', 'approved'].includes(m.status) && new Date(m.date).getTime() >= t;
    const filtered = list.filter(m =>
        scope === 'all' ? true
            : scope === 'pending' ? m.status === 'pending'
                : scope === 'upcoming' ? upcoming(m) || awaitingOutcome(m, now)
                    : !upcoming(m) && !awaitingOutcome(m, now));
    const asc = scope === 'upcoming' || scope === 'pending';
    return filtered.sort((a, b) => (asc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
};

/** Haftalık rapor için: o hafta gerçekleşen görüşmelerin toplantı ayrıntısı */
export const meetingsHeldInWeek = (list: CustomerMeeting[], projectId: string | undefined, year: number, week: number): CustomerMeeting[] =>
    list.filter(m => m.status === 'held' && (!projectId || m.projectId === projectId) && (() => {
        const w = isoWeekOf(new Date(m.date));
        return w.year === year && w.week === week;
    })());

export const meetingToDetails = (m: CustomerMeeting): MeetingDetails => ({
    date: m.date.slice(0, 10),
    place: m.locationType === 'online' ? 'çevrim içi' : m.locationType === 'bilgem' ? (m.location || 'BİLGEM') : (m.location || m.customer),
    participants: [m.customer, m.customerParticipants, m.ourParticipants].filter(Boolean).join('; '),
    agenda: m.agenda || m.title,
    decisions: m.decisions || '',
});

/** Gelecek haftanın planlanmış (onaylı) görüşmeleri — "gelecek hafta" maddesine kaynak */
export const meetingsPlannedInWeek = (list: CustomerMeeting[], projectId: string | undefined, year: number, week: number): CustomerMeeting[] =>
    list.filter(m => (m.status === 'approved' || m.status === 'pending') && (!projectId || m.projectId === projectId) && (() => {
        const w = isoWeekOf(new Date(m.date));
        return w.year === year && w.week === week;
    })());
