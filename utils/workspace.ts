import { Project, ProjectData, ProjectSettings, Task, TaskStatus, WorkspaceData } from '../types';
import { migrateRolePermissions, PERMISSIONS_REV } from './permissions';

export const APP_VERSION = '2.2.0';
export const WORKSPACE_SCHEMA_VERSION = 3; // 3: veri havuzu + tahsis + plan kilidi

/** v2 çalışma alanı anahtarı */
export const WORKSPACE_STORAGE_KEY = 'PLANASISTAN_WORKSPACE_V2';
/** v1.x tek proje anahtarı — migration sonrası dokunulmaz (geri dönüş güvencesi) */
export const LEGACY_STORAGE_KEY = 'PROJE_PLANLAMA_DATA';

export const createProjectId = (): string =>
    `prj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const defaultProjectSettings = (): ProjectSettings => ({
    sprintDuration: 3,
    projectStartDate: new Date().toISOString().split('T')[0],
    tagColors: {},
    titleCosts: {},
    sprintNames: {},
    globalTestDays: 4,
});

export const createProject = (name: string, partial: Partial<Project> = {}): Project => {
    const now = new Date().toISOString();
    return {
        id: createProjectId(),
        name: name.trim() || 'Yeni Proje',
        status: 'devam',
        tasks: [],
        resources: [],
        notes: [],
        customerRequests: [],
        objectives: [],
        workPackages: [],
        settings: defaultProjectSettings(),
        createdAt: now,
        updatedAt: now,
        ...partial,
    };
};

export const createEmptyWorkspace = (): WorkspaceData => ({
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    projects: [],
    activeProjectId: null,
    currentRole: 'py',
    people: [],
    departments: [],
    roleCatalog: [],
    titles: [],
    allocations: [],
    planLocks: [],
    snapshots: [],
    settings: {
        isLocalPersistenceEnabled: true,
        isAIEnabled: true,
        theme: 'classic',
        isDarkMode: true,
    },
    appVersion: APP_VERSION,
});

/** Eski tek proje verisini (v1.x yedek/localStorage) bir Project'e dönüştürür. */
const TASK_STATUSES = new Set<string>(Object.values(TaskStatus));
const TASK_PRIORITIES = new Set<string>(['Blocker', 'High', 'Medium', 'Low']);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Eksik ya da bozuk alanlı görevi ekranların güvenle çizebileceği biçime getirir (UI-KRC-06).
 * Bozuk bir yedekten gelen `{}` görevi uygulamayı beyaz ekrana düşürüyordu; depoya yazıldıysa
 * her açılışta. Geçerli görev aynı nesne olarak döner (gereksiz yeniden yazım olmaz).
 */
export const normalizeTask = (raw: unknown, index = 0): Task => {
    const t = (raw && typeof raw === 'object' ? raw : {}) as Partial<Task> & Record<string, unknown>;
    const time = (t.time && typeof t.time === 'object' ? t.time : {}) as Partial<Task['time']>;
    const valid = typeof t.id === 'string' && t.id !== '' && typeof t.name === 'string'
        && TASK_STATUSES.has(t.status as string) && TASK_PRIORITIES.has(t.priority as string)
        && typeof t.version === 'number' && typeof time.best === 'number' && typeof time.avg === 'number' && typeof time.worst === 'number'
        && typeof t.unit === 'string' && typeof t.resourceName === 'string' && typeof t.jiraId === 'string' && typeof t.notes === 'string';
    if (valid) return t as Task;
    return {
        ...t,
        id: typeof t.id === 'string' && t.id ? t.id : `task-onarildi-${index}-${Math.random().toString(36).slice(2, 7)}`,
        name: typeof t.name === 'string' && t.name.trim() ? t.name : 'Adsız görev',
        status: TASK_STATUSES.has(t.status as string) ? (t.status as TaskStatus) : TaskStatus.ToDo,
        priority: TASK_PRIORITIES.has(t.priority as string) ? (t.priority as Task['priority']) : 'Medium',
        version: typeof t.version === 'number' && Number.isFinite(t.version) ? t.version : 0,
        predecessor: typeof t.predecessor === 'string' ? t.predecessor : null,
        unit: str(t.unit),
        resourceName: str(t.resourceName),
        jiraId: str(t.jiraId),
        notes: str(t.notes),
        time: { best: num(time.best), avg: num(time.avg), worst: num(time.worst) },
        availability: typeof t.availability === 'boolean' ? t.availability : num(time.avg) > 0,
    } as Task;
};

const normalizeTasks = (tasks: unknown): Task[] => (Array.isArray(tasks) ? tasks.map(normalizeTask) : []);

export const legacyToProject = (legacy: ProjectData, name: string): Project => {
    const s = legacy.settings || ({} as ProjectData['settings']);
    return createProject(name, {
        tasks: normalizeTasks(legacy.tasks),
        resources: legacy.resources || [],
        notes: legacy.notes || [],
        customerRequests: legacy.customerRequests || [],
        objectives: legacy.objectives || [],
        settings: {
            sprintDuration: s.sprintDuration || 3,
            projectStartDate: s.projectStartDate || new Date().toISOString().split('T')[0],
            tagColors: s.tagColors || {},
            titleCosts: s.titleCosts || {},
            sprintNames: s.sprintNames || {},
            globalTestDays: s.globalTestDays || 4,
            manMonthTableColor: s.manMonthTableColor,
            costTableColor: s.costTableColor,
        },
    });
};

/** Eski veriden workspace kur — tema/kalıcılık gibi genel ayarları da taşır. */
export const migrateLegacyWorkspace = (legacy: ProjectData, projectName = 'Projem'): WorkspaceData => {
    const project = legacyToProject(legacy, projectName);
    const s = legacy.settings || ({} as ProjectData['settings']);
    return {
        ...createEmptyWorkspace(),
        projects: [project],
        activeProjectId: project.id,
        settings: {
            isLocalPersistenceEnabled: s.isLocalPersistenceEnabled !== false,
            isAIEnabled: s.isAIEnabled !== false,
            theme: s.theme || 'classic',
            isDarkMode: s.isDarkMode || false,
        },
    };
};

/** Kayıtlı/yüklenen workspace'i normalize eder (eksik alanları tamamlar). */
export const normalizeWorkspace = (raw: Partial<WorkspaceData>): WorkspaceData => {
    const base = createEmptyWorkspace();
    const projects = (raw.projects || []).map(p => ({
        ...createProject(p.name || 'Adsız Proje'),
        ...p,
        id: p.id || createProjectId(),
        status: p.status || 'devam',
        tasks: normalizeTasks(p.tasks),
        resources: p.resources || [],
        notes: p.notes || [],
        customerRequests: p.customerRequests || [],
        objectives: p.objectives || [],
        workPackages: p.workPackages || [],
        settings: { ...defaultProjectSettings(), ...(p.settings || {}) },
    }));
    const activeId = raw.activeProjectId && projects.some(p => p.id === raw.activeProjectId)
        ? raw.activeProjectId
        : (projects[0]?.id ?? null);
    return {
        ...base,
        ...raw,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        projects,
        activeProjectId: activeId,
        people: (raw.people || []).map(p => ({ ...p, roles: p.roles || [], availableAA: p.availableAA ?? 1 })),
        departments: raw.departments || [],
        roleCatalog: raw.roleCatalog || [],
        titles: raw.titles || [],
        allocations: (raw.allocations || []).map(a => ({ ...a, plan: a.plan || {}, actual: a.actual || {} })),
        planLocks: raw.planLocks || [],
        snapshots: raw.snapshots || [],
        // Yeni eklenen yetkiler, eski sürümde özelleştirilmiş rollere bir kez eklenir
        rolePermissions: migrateRolePermissions(raw.rolePermissions, raw.rolePermissionsRev),
        rolePermissionsRev: PERMISSIONS_REV,
        settings: { ...base.settings, ...(raw.settings || {}) },
        appVersion: APP_VERSION,
    };
};

export type ImportResult =
    | { kind: 'workspace'; workspace: WorkspaceData }
    | { kind: 'legacyProject'; project: Project }
    | { kind: 'invalid'; error: string };

/**
 * JSON içe aktarma: hem v2 workspace yedeklerini hem v1.x tek proje
 * yedeklerini tanır. v1 yedeği mevcut çalışma alanına yeni proje olarak eklenir.
 */
export const parseImportedJson = (text: string, legacyName = 'İçe Aktarılan Proje'): ImportResult => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { kind: 'invalid', error: 'Dosya geçerli bir JSON değil.' };
    }
    if (!parsed || typeof parsed !== 'object') {
        return { kind: 'invalid', error: 'Dosya içeriği tanınmadı.' };
    }
    const obj = parsed as Record<string, unknown>;

    if (Array.isArray(obj.projects) && typeof obj.schemaVersion === 'number') {
        return { kind: 'workspace', workspace: normalizeWorkspace(obj as Partial<WorkspaceData>) };
    }
    if (Array.isArray(obj.tasks) || Array.isArray(obj.resources)) {
        return { kind: 'legacyProject', project: legacyToProject(obj as unknown as ProjectData, legacyName) };
    }
    return { kind: 'invalid', error: 'Dosya ne çalışma alanı ne de eski proje yedeği formatında.' };
};

/**
 * Açılışta çalışma alanını çözer:
 *  1) v2 anahtarı varsa onu kullanır,
 *  2) yoksa v1 anahtarından migration yapar (eski anahtar silinmez),
 *  3) hiçbiri yoksa null döner (çağıran taraf örnek veriyle başlatır).
 */
export const resolveWorkspaceFromStorage = (
    v2Json: string | null,
    legacyJson: string | null
): { workspace: WorkspaceData | null; migratedFromLegacy: boolean } => {
    if (v2Json) {
        try {
            return { workspace: normalizeWorkspace(JSON.parse(v2Json)), migratedFromLegacy: false };
        } catch (e) {
            console.error('Çalışma alanı okunamadı:', e);
        }
    }
    if (legacyJson) {
        try {
            return { workspace: migrateLegacyWorkspace(JSON.parse(legacyJson)), migratedFromLegacy: true };
        } catch (e) {
            console.error('Eski veri migration hatası:', e);
        }
    }
    return { workspace: null, migratedFromLegacy: false };
};

/** `pretty` yalnız dışa aktarılan dosya için; tarayıcı deposunda sıkışık JSON (kota) */
export const serializeWorkspace = (ws: WorkspaceData, pretty = true): string =>
    JSON.stringify({ ...ws, appVersion: APP_VERSION, exportDate: new Date().toISOString() }, null, pretty ? 2 : undefined);
