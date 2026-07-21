import { PlanLock, Project, UserRole, WorkspaceData } from '../types';
import { getPlanLockStatus } from './allocations';

/**
 * RBAC — kimlik + sahiplik + net kapsam.
 *
 * Kimlik = { rol, kişi }. Rol ekranı belirler; kişi (py/bölüm sorumlusu için)
 * KAPSAMI belirler:
 *
 *  | Rol             | Görür                          | Düzenler                                  |
 *  |-----------------|--------------------------------|-------------------------------------------|
 *  | Müdür           | Her şey                        | Hiçbir şey (salt-okunur yönetim)          |
 *  | PYB Sorumlusu   | Her şey                        | Hiçbir şey; plan onaylar/kilitler         |
 *  | PYB Destek      | Her şey                        | Veri havuzu (tümü); plan onaylar/kilitler |
 *  | Proje Yöneticisi| Sahip olduğu projeler          | Kendi projelerinin görev/plan/risk        |
 *  | Bölüm Sorumlusu | Bölümü personelinin işi         | Bölümü personelinin tahsisi (tüm projeler)|
 *
 * Not: Bu istemci tarafı kapsamdır; sunucu tarafı zorlama Supabase RLS fazında.
 */

export interface Identity {
    role: UserRole;
    personId?: string;
}

type WsLike = Pick<WorkspaceData, 'people' | 'projects' | 'allocations'>;

export const identityOf = (ws: WorkspaceData): Identity => ({
    role: ws.currentRole || 'py',
    personId: ws.currentPersonId,
});

export const isExecViewer = (role: UserRole | undefined): boolean =>
    role === 'mudur' || role === 'pyb_sorumlu';

export const isSteward = (role: UserRole | undefined): boolean => role === 'pyb_destek';

/** Portföyün tamamını görebilen roller */
export const seesAllProjects = (role: UserRole | undefined): boolean =>
    isExecViewer(role) || isSteward(role);

/** py/bölüm sorumlusu rollerinin çalışması için bir kişi seçilmiş olmalı */
export const identityNeedsPerson = (id: Identity): boolean =>
    (id.role === 'py' || id.role === 'bolum_sorumlu') && !id.personId;

/** Bölüm sorumlusunun yönettiği bölüm (aktif kişinin bölümü) */
export const managedDepartmentCode = (ws: WsLike, id: Identity): string | undefined => {
    if (id.role !== 'bolum_sorumlu' || !id.personId) return undefined;
    return ws.people.find(p => p.id === id.personId)?.departmentCode || undefined;
};

/** Proje sahibi PM mi? */
export const ownsProject = (project: Project, id: Identity): boolean =>
    id.role === 'py' && !!id.personId && project.pmPersonId === id.personId;

/** Bu kişi, aktif bölüm sorumlusunun bölümünde mi? */
export const managesPerson = (ws: WsLike, id: Identity, personId: string): boolean => {
    const dept = managedDepartmentCode(ws, id);
    if (!dept) return false;
    return ws.people.find(p => p.id === personId)?.departmentCode === dept;
};

/** Görünür proje id kümesi (kapsam) */
export const visibleProjectIds = (ws: WsLike, id: Identity): Set<string> => {
    if (seesAllProjects(id.role)) return new Set(ws.projects.map(p => p.id));
    if (id.role === 'py') return new Set(ws.projects.filter(p => ownsProject(p, id)).map(p => p.id));
    if (id.role === 'bolum_sorumlu') {
        const dept = managedDepartmentCode(ws, id);
        if (!dept) return new Set();
        const myPeople = new Set(ws.people.filter(p => p.departmentCode === dept).map(p => p.id));
        return new Set(ws.allocations.filter(a => myPeople.has(a.personId)).map(a => a.projectId));
    }
    return new Set();
};

/** Görünür kişi id kümesi (bölüm sorumlusu → kendi bölümü; diğerleri → tümü) */
export const visiblePersonIds = (ws: WsLike, id: Identity): Set<string> => {
    if (id.role === 'bolum_sorumlu') {
        const dept = managedDepartmentCode(ws, id);
        return new Set(ws.people.filter(p => p.departmentCode === dept).map(p => p.id));
    }
    return new Set(ws.people.map(p => p.id));
};

/** Proje içeriğini (görev/risk/hedef/RAG/durum) düzenleyebilir mi? → yalnız sahip PM */
export const canEditProjectContent = (ws: WsLike, id: Identity, projectId: string): boolean => {
    const project = ws.projects.find(p => p.id === projectId);
    return !!project && ownsProject(project, id);
};

/** Yeni proje oluşturabilir mi? */
export const canCreateProject = (id: Identity): boolean =>
    id.role === 'py' || id.role === 'pyb_destek';

/** Proje sahipliğini/durumunu atayabilir mi? (sahip PM veya veri sorumlusu) */
export const canAssignProjectOwner = (ws: WsLike, id: Identity, projectId: string): boolean =>
    id.role === 'pyb_destek' || canEditProjectContent(ws, id, projectId);

/**
 * Bir tahsis hücresini (kişi × proje) düzenleyebilir mi?
 *  - proje sahibi PM: projesindeki herkesin tahsisini
 *  - bölüm sorumlusu: bölümü personelinin tahsisini (tüm projeler)
 */
export const canEditAllocationCell = (ws: WsLike, id: Identity, projectId: string, personId: string): boolean => {
    const project = ws.projects.find(p => p.id === projectId);
    if (project && ownsProject(project, id)) return true;
    if (managesPerson(ws, id, personId)) return true;
    return false;
};

/** Plan hücresi düzenlenebilir mi? (kapsam + kilit taslak) */
export const canEditPlanCell = (ws: WsLike, id: Identity, locks: PlanLock[], projectId: string, personId: string, year: number): boolean =>
    canEditAllocationCell(ws, id, projectId, personId) && getPlanLockStatus(locks, projectId, year) === 'draft';

/** Gerçekleşen hücresi düzenlenebilir mi? (kapsam, kilitten bağımsız) */
export const canEditActualCell = (ws: WsLike, id: Identity, projectId: string, personId: string): boolean =>
    canEditAllocationCell(ws, id, projectId, personId);

/** Bu projeye yeni tahsis satırı ekleyebilecek mi (kişiden bağımsız ön kontrol) */
export const canAddAllocationToProject = (ws: WsLike, id: Identity, projectId: string): boolean => {
    const project = ws.projects.find(p => p.id === projectId);
    if (project && ownsProject(project, id)) return true;
    // Bölüm sorumlusu bölümündeki bir kişi için ekleyebilir → satır formunda kişi bazlı doğrulanır
    return id.role === 'bolum_sorumlu' && !!managedDepartmentCode(ws, id);
};
