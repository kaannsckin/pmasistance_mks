import { PermissionKey, PlanLock, Project, UserRole, WorkspaceData } from '../types';
import { getPlanLockStatus } from './allocations';
import { can, canFor, PermissionHolder, permissionsFor } from './permissions';

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
 *  | PYB Destek      | Her şey                        | Veri havuzu (tümü); rapor denetimi/yayını |
 *  | Proje Yöneticisi| Sahip olduğu projeler          | Kendi projelerinin görev/plan/risk        |
 *  | Bölüm Sorumlusu | Bölümü personelinin işi         | Bölümü personelinin tahsisi (tüm projeler)|
 *  | Admin           | Her şey (salt okunur)          | Rol yetkileri ve kişi profilleri          |
 *
 * Özellik yetkileri (yönetim ekranı, plan onayı, veri havuzu…) rol bazlıdır ve
 * admin tarafından değiştirilebilir: utils/permissions.ts. Bu dosyadaki
 * sahiplik/kapsam kuralları ise kimlik kuralıdır, değiştirilmez.
 *
 * Not: Bu istemci tarafı kapsamdır; sunucu tarafı zorlama Supabase RLS fazında.
 */

export interface Identity {
    role: UserRole;
    personId?: string;
    /** Rolün geçerli yetkileri (admin değişiklikleriyle); yoksa varsayılanlar */
    perms?: ReadonlySet<PermissionKey>;
}

/** Çalışma alanındaki yetki değişiklikleriyle birlikte bir kimlik kurar */
export const identityFor = (ws: Pick<WorkspaceData, 'rolePermissions'>, role: UserRole, personId?: string): Identity => ({
    role,
    personId,
    perms: permissionsFor(role, ws.rolePermissions),
});

type WsLike = Pick<WorkspaceData, 'people' | 'projects' | 'allocations'>;

export const identityOf = (ws: Pick<WorkspaceData, 'currentRole' | 'currentPersonId' | 'rolePermissions'>): Identity =>
    identityFor(ws, ws.currentRole || 'py', ws.currentPersonId);

/** Portföyün tamamını görebilir mi (rol adı → varsayılan yetki, kimlik → geçerli yetki) */
export const seesAllProjects = (who: UserRole | PermissionHolder | undefined): boolean => canFor(who, 'portfolio.viewAll');

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
    if (can(id, 'portfolio.viewAll')) return new Set(ws.projects.map(p => p.id));
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
export const canCreateProject = (id: Identity): boolean => can(id, 'project.create');

/** Proje sahipliğini/durumunu atayabilir mi? (sahip PM veya veri sorumlusu) */
export const canAssignProjectOwner = (ws: WsLike, id: Identity, projectId: string): boolean =>
    can(id, 'project.assignOwner') || canEditProjectContent(ws, id, projectId);

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
