import { PermissionKey, PlanLock, Project, UserRole, WorkspaceData } from '../types.js';
import { getPlanLockStatus } from './allocations.js';
import { can, canFor, PermissionHolder, permissionsFor } from './permissions.js';

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
    projectIds?: readonly string[];
    fullCloudProjectAccess?: boolean;
}

/** Çalışma alanındaki yetki değişiklikleriyle birlikte bir kimlik kurar */
export const identityFor = (ws: Pick<WorkspaceData, 'rolePermissions'>, role: UserRole, personId?: string): Identity => ({
    role,
    personId,
    perms: permissionsFor(role, ws.rolePermissions),
});

type WsLike = Pick<WorkspaceData, 'people' | 'projects' | 'allocations'>;

const SCOPED_PERMISSIONS = new Set<PermissionKey>(['portfolio.viewAll', 'screen.executive', 'notes.private', 'ai.use']);

export const identityOf = (ws: Pick<WorkspaceData, 'currentRole' | 'currentPersonId' | 'rolePermissions' | 'cloudMembership'>): Identity => {
    const membership = ws.cloudMembership;
    // Demo hesabı (tüm roller): kimlik cihazdaki profil seçiminden; sunucuda tam yetkili
    if (membership?.allRoles) {
        return { ...identityFor(ws, ws.currentRole ?? membership.role, ws.currentPersonId ?? membership.personId ?? undefined), fullCloudProjectAccess: true };
    }
    const identity = identityFor(ws, membership?.role ?? ws.currentRole ?? 'py', membership ? membership.personId ?? undefined : ws.currentPersonId);
    if (!membership) return identity;
    if (membership.projectIds === null) return { ...identity, fullCloudProjectAccess: true };
    return {
        ...identity,
        projectIds: membership.projectIds,
        perms: new Set([...identity.perms!].filter(permission => SCOPED_PERMISSIONS.has(permission))),
    };
};

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
    if (id.projectIds) return new Set(ws.projects.filter(p => id.projectIds!.includes(p.id)).map(p => p.id));
    if (id.fullCloudProjectAccess || can(id, 'portfolio.viewAll')) return new Set(ws.projects.map(p => p.id));
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
    return !!project && (!id.projectIds || id.projectIds.includes(projectId)) && ownsProject(project, id);
};

export const keepScopedWorkspaceEdits = (before: WorkspaceData, after: WorkspaceData): WorkspaceData => {
    const identity = identityOf(before);
    if (!identity.projectIds) return after;
    const proposed = new Map(after.projects.map(project => [project.id, project]));
    return {
        ...before,
        activeProjectId: after.activeProjectId,
        settings: after.settings,
        projects: before.projects.map(project => {
            const changed = proposed.get(project.id);
            return changed && changed.pmPersonId === project.pmPersonId && canEditProjectContent(before, identity, project.id) ? changed : project;
        }),
    };
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
    if (id.projectIds) return false;
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
    if (id.projectIds) return false;
    const project = ws.projects.find(p => p.id === projectId);
    if (project && ownsProject(project, id)) return true;
    // Bölüm sorumlusu bölümündeki bir kişi için ekleyebilir → satır formunda kişi bazlı doğrulanır
    return id.role === 'bolum_sorumlu' && !!managedDepartmentCode(ws, id);
};

const personLabel = (ws: WsLike, personId: string | undefined): string => {
    const p = personId ? ws.people.find(x => x.id === personId) : undefined;
    return p ? `${p.firstName} ${p.lastName}`.trim() : '';
};

/**
 * Tahsis hücresi neden düzenlenemiyor (düzenlenebiliyorsa null). Kullanıcıya
 * gösterilir: hangi kural engelliyor ve ne yapılmalı.
 */
export const allocationEditBlock = (ws: WsLike, id: Identity, locks: PlanLock[], projectId: string, personId: string | null, year: number, field: 'plan' | 'actual'): string | null => {
    const project = ws.projects.find(p => p.id === projectId);
    if (!project) return 'Proje bulunamadı.';
    if (identityNeedsPerson(id)) return 'Rol seçiminde kim olduğunuzu (kişiyi) seçin; PY ve bölüm sorumlusu kişiye bağlı çalışır.';
    const owns = ownsProject(project, id);
    const manages = personId ? managesPerson(ws, id, personId) : id.role === 'bolum_sorumlu';
    if (!owns && !manages) {
        if (id.role === 'py') {
            const pm = personLabel(ws, project.pmPersonId);
            const me = personLabel(ws, id.personId);
            return pm
                ? `Bu projenin PY'si ${pm}; siz ${me || 'başka bir kişi'} olarak girdiniz. Rol seçiminde ${pm} kişisini seçin ya da proje kartından PY'yi değiştirin.`
                : 'Bu projeye PY atanmamış. Proje kartından PY olarak kendinizi seçin.';
        }
        if (id.role === 'bolum_sorumlu') return 'Bölüm sorumlusu yalnız kendi bölümündeki kişilerin tahsisini düzenler.';
        return 'Tahsisi yalnız projenin PY\'si ve kişinin bölüm sorumlusu düzenler; bu rol yalnız görüntüler.';
    }
    if (field === 'plan') {
        const st = getPlanLockStatus(locks, projectId, year);
        if (st === 'submitted') return `${year} planı onaya gönderildi; onaylanana ya da reddedilene kadar değiştirilemez (gerçekleşen girilebilir).`;
        if (st === 'locked') return `${year} planı onaylanıp kilitlendi; değişiklik için müdür / PYB sorumlusu kilidi açmalı (gerçekleşen girilebilir).`;
    }
    return null;
};
