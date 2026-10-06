import {
    ExpectationCategory, ExpectationLink, ExpectationStatus, ExpectationUrgency, ManagementExpectation,
    Project, Risk, Task, WorkspaceData,
} from '../types';
import { Identity, isExecViewer, isSteward, managedDepartmentCode, visibleProjectIds } from './rbac';

/**
 * Yönetimden beklentiler: PM ve bölüm sorumlusunun yönetimden karar/onay/
 * destek beklediği konular. Aciliyet (kritik/önemli/normal) ve kategoriyle
 * kaydedilir; yönetim panelinde hatırlatma olarak sayılır, yönetim yanıtlar.
 */

export const URGENCY_ORDER: ExpectationUrgency[] = ['critical', 'important', 'normal'];

export const URGENCY_LABELS: Record<ExpectationUrgency, string> = {
    critical: 'Kritik',
    important: 'Önemli',
    normal: 'Normal',
};

/** Aciliyeti seçerken yol gösteren kısa tarif */
export const URGENCY_HINTS: Record<ExpectationUrgency, string> = {
    critical: 'İş duruyor ya da ciddi kayıp var; bu hafta karar gerekli',
    important: 'Yakında takvimi/bütçeyi etkiler; iki hafta içinde',
    normal: 'Bilgi ya da planlı karar; acil değil',
};

export const CATEGORY_ORDER: ExpectationCategory[] = ['budget', 'schedule', 'approval', 'customer', 'resource', 'procurement', 'technical', 'other'];

export const CATEGORY_LABELS: Record<ExpectationCategory, string> = {
    budget: 'Bütçe',
    schedule: 'Takvim',
    approval: 'Onay',
    customer: 'Müşteri',
    resource: 'Kaynak / personel',
    procurement: 'Satın alma',
    technical: 'Teknik',
    other: 'Diğer',
};

export const STATUS_LABELS: Record<ExpectationStatus, string> = {
    open: 'Yanıt bekliyor',
    acknowledged: 'İnceleniyor',
    resolved: 'Karşılandı',
    withdrawn: 'Geri çekildi',
};

/** Yanıt bekleyen ya da incelenen beklenti "aktif" sayılır */
export const isActiveExpectation = (e: Pick<ManagementExpectation, 'status'>): boolean =>
    e.status === 'open' || e.status === 'acknowledged';

// ---------------------------------------------------------------- yetki ve kapsam

/** Beklenti açabilenler: proje yöneticisi ve bölüm sorumlusu (kişi seçili) */
export const canRaiseExpectation = (id: Identity): boolean =>
    (id.role === 'py' || id.role === 'bolum_sorumlu') && !!id.personId;

/** Yanıtlayan/kapatan: yönetim (müdür, PYB sorumlusu) */
export const canRespondExpectation = (id: Identity): boolean => isExecViewer(id.role);

export const isOwnExpectation = (e: ManagementExpectation, id: Identity): boolean =>
    !!id.personId && e.createdByPersonId === id.personId && e.createdByRole === id.role;

/** Sahibi aktif beklentiyi düzenleyebilir/geri çekebilir */
export const canEditExpectation = (e: ManagementExpectation, id: Identity): boolean =>
    isOwnExpectation(e, id) && isActiveExpectation(e);

type WsLike = Pick<WorkspaceData, 'people' | 'projects' | 'allocations' | 'expectations'>;

/**
 * Görünürlük: yönetim ve PYB herkesinkini; PM kendi açtıklarını ve kendi
 * projelerine ait olanları; bölüm sorumlusu kendi açtıklarını ve bölümününkileri.
 */
export const visibleExpectations = (ws: WsLike, id: Identity): ManagementExpectation[] => {
    const all = ws.expectations || [];
    if (isExecViewer(id.role) || isSteward(id.role)) return all;
    if (id.role === 'py') {
        const mine = visibleProjectIds(ws, id);
        return all.filter(e => isOwnExpectation(e, id) || (!!e.projectId && mine.has(e.projectId)));
    }
    if (id.role === 'bolum_sorumlu') {
        const dept = managedDepartmentCode(ws, id);
        return all.filter(e => isOwnExpectation(e, id) || (!!dept && e.departmentCode === dept));
    }
    return [];
};

/** Beklenti açarken seçilebilecek projeler */
export const expectationProjects = (ws: WsLike, id: Identity): Project[] => {
    const ids = visibleProjectIds(ws, id);
    return ws.projects.filter(p => ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
};

// ---------------------------------------------------------------- oluşturma ve güncelleme

export interface ExpectationDraft {
    title: string;
    description?: string;
    category: ExpectationCategory;
    urgency: ExpectationUrgency;
    projectId?: string;
    needBy?: string;
    links?: ExpectationLink[];
}

const newId = () => `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const personName = (ws: Pick<WorkspaceData, 'people'>, personId?: string): string | undefined => {
    const p = personId ? ws.people.find(x => x.id === personId) : undefined;
    return p ? `${p.firstName} ${p.lastName}`.trim() : undefined;
};

const clean = (d: ExpectationDraft) => ({
    title: d.title.trim(),
    description: d.description?.trim() || undefined,
    category: d.category,
    urgency: d.urgency,
    projectId: d.projectId || undefined,
    needBy: d.needBy || undefined,
    links: d.links && d.links.length ? d.links : undefined,
});

/** Aktif kimlik adına yeni beklenti */
export const createExpectation = (ws: WorkspaceData, draft: ExpectationDraft, now: Date = new Date()): ManagementExpectation => {
    const at = now.toISOString();
    const person = ws.people.find(p => p.id === ws.currentPersonId);
    return {
        id: newId(),
        ...clean(draft),
        status: 'open',
        departmentCode: person?.departmentCode || undefined,
        createdAt: at,
        updatedAt: at,
        createdByRole: ws.currentRole || 'py',
        createdByPersonId: ws.currentPersonId,
        createdByName: personName(ws, ws.currentPersonId),
    };
};

export const updateExpectationDraft = (e: ManagementExpectation, draft: ExpectationDraft, now: Date = new Date()): ManagementExpectation => ({
    ...e,
    ...clean(draft),
    updatedAt: now.toISOString(),
});

/** Yönetim yanıtı: inceleniyor ya da karşılandı (yanıt metniyle) */
export const respondExpectation = (
    ws: WorkspaceData,
    e: ManagementExpectation,
    status: 'acknowledged' | 'resolved',
    response: string | undefined,
    now: Date = new Date(),
): ManagementExpectation => ({
    ...e,
    status,
    response: response?.trim() || e.response,
    respondedAt: now.toISOString(),
    respondedByRole: ws.currentRole,
    respondedByName: personName(ws, ws.currentPersonId),
    updatedAt: now.toISOString(),
});

export const setExpectationStatus = (e: ManagementExpectation, status: ExpectationStatus, now: Date = new Date()): ManagementExpectation => ({
    ...e,
    status,
    updatedAt: now.toISOString(),
});

// ---------------------------------------------------------------- sayım, sıralama, süre

export type UrgencyCounts = Record<ExpectationUrgency, number> & { total: number; unanswered: number };

/** Aktif beklentilerin aciliyete göre sayısı ("3 kritik · 4 önemli · 5 normal") */
export const urgencyCounts = (list: ManagementExpectation[]): UrgencyCounts => {
    const c: UrgencyCounts = { critical: 0, important: 0, normal: 0, total: 0, unanswered: 0 };
    list.forEach(e => {
        if (!isActiveExpectation(e)) return;
        c[e.urgency]++;
        c.total++;
        if (e.status === 'open') c.unanswered++;
    });
    return c;
};

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Termine kalan gün (negatif: gecikti); termin yoksa null */
export const daysUntilNeed = (e: Pick<ManagementExpectation, 'needBy'>, now: Date = new Date()): number | null => {
    if (!e.needBy) return null;
    const d = new Date(e.needBy);
    return isNaN(d.getTime()) ? null : Math.round((dayStart(d) - dayStart(now)) / DAY);
};

/** Beklentinin kaç gündür açık olduğu */
export const waitingDays = (e: Pick<ManagementExpectation, 'createdAt'>, now: Date = new Date()): number =>
    Math.max(0, Math.round((dayStart(now) - dayStart(new Date(e.createdAt))) / DAY));

/** "bugün açıldı" / "5 gündür bekliyor" */
export const waitingLabel = (e: Pick<ManagementExpectation, 'createdAt'>, now: Date = new Date()): string => {
    const d = waitingDays(e, now);
    return d === 0 ? 'bugün açıldı' : `${d} gündür bekliyor`;
};

const URGENCY_RANK: Record<ExpectationUrgency, number> = { critical: 0, important: 1, normal: 2 };

/**
 * Aktifler önce: aciliyet → termini geçmiş → en yakın termin → en uzun
 * bekleyen. Kapananlar en son güncellenen başta.
 */
export const sortExpectations = (list: ManagementExpectation[], now: Date = new Date()): ManagementExpectation[] =>
    [...list].sort((a, b) => {
        const aa = isActiveExpectation(a), ba = isActiveExpectation(b);
        if (aa !== ba) return aa ? -1 : 1;
        if (!aa) return b.updatedAt.localeCompare(a.updatedAt);
        const du = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
        if (du) return du;
        const da = daysUntilNeed(a, now), db = daysUntilNeed(b, now);
        if (da !== db) {
            if (da === null) return 1;
            if (db === null) return -1;
            return da - db;
        }
        return a.createdAt.localeCompare(b.createdAt);
    });

export interface ExpectationFilter {
    scope?: 'active' | 'closed' | 'all';
    urgency?: ExpectationUrgency | 'all';
    category?: ExpectationCategory | 'all';
    projectId?: string | 'all';
    query?: string;
}

const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

export const filterExpectations = (list: ManagementExpectation[], f: ExpectationFilter, projectName?: (id: string) => string | undefined): ManagementExpectation[] => {
    const q = lower((f.query || '').trim());
    const scope = f.scope || 'active';
    return list.filter(e =>
        (scope === 'all' || (scope === 'active') === isActiveExpectation(e)) &&
        (!f.urgency || f.urgency === 'all' || e.urgency === f.urgency) &&
        (!f.category || f.category === 'all' || e.category === f.category) &&
        (!f.projectId || f.projectId === 'all' || e.projectId === f.projectId) &&
        (!q || [e.title, e.description, e.createdByName, e.response, e.projectId ? projectName?.(e.projectId) : undefined].some(v => v && lower(v).includes(q)))
    );
};

// ---------------------------------------------------------------- eklentiler

export interface ResolvedLink {
    link: ExpectationLink;
    project?: Project;
    task?: Task;
    risk?: Risk;
    /** Görev/risk silinmişse true (etiket yine de gösterilir) */
    missing: boolean;
}

export const resolveLink = (ws: Pick<WorkspaceData, 'projects'>, link: ExpectationLink): ResolvedLink => {
    if (link.kind === 'url') return { link, missing: !link.url };
    const project = ws.projects.find(p => p.id === link.projectId);
    if (link.kind === 'task') {
        const task = project?.tasks.find(t => t.id === link.refId);
        return { link, project, task, missing: !task };
    }
    const risk = (project?.risks || []).find(r => r.id === link.refId);
    return { link, project, risk, missing: !risk };
};

/** Bağlantı adresi yalnız http(s) olabilir (javascript: vb. engellenir) */
export const safeUrl = (raw: string): string | null => {
    const v = raw.trim();
    if (!v) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
    try {
        const u = new URL(withScheme);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
    } catch {
        return null;
    }
};
