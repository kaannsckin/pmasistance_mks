import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CloudMembership, CustomerRequest, Note, Project, WorkspaceData } from '../types';
import { createEmptyWorkspace, normalizeWorkspace } from './workspace';
import { CLOUD_CONFIG_PATH, CloudConnection, normalizeCloudConnection } from './cloudConnection';

/**
 * Yerel-öncelikli bulut senkronizasyonu (Supabase).
 *
 * Veri üç parçaya ayrılır:
 *  - core: paylaşılan, projeler dışındaki her şey (havuz, tahsis, kilit,
 *    snapshot, öneri günlüğü…) ve proje sırası
 *  - projeler: her proje ayrı satır (workspace_projects), kendi sürüm
 *    numarasıyla. Yalnız değişen proje gönderilir; iki kişi farklı projelerde
 *    çalışırken çakışma olmaz, binlerce kayıtlık geçmiş her seferinde gitmez.
 *    (Projelerde notes/customerRequests boşaltılır.)
 *  - private: PM'e özel notlar + müşteri istekleri — sunucuda RLS ile yönetici
 *    rollerinden gizlenir (bkz. supabase/schema.sql)
 *
 * Eski biçim (projeler core içinde) okunur; ilk gönderimde satırlara taşınır.
 * Cihaza özel alanlar (tema, rol görünümü, aktif proje, bağlantı ayarları)
 * senkronize EDİLMEZ.
 */

export const CLOUD_CONFIG_KEY = 'PLANASISTAN_CLOUD_CONFIG';

export interface CloudConfig extends CloudConnection {
    workspaceId?: string;
    linkedUserId?: string;
    membership?: CloudMembership;
    autoSync: boolean;
    lastSyncAt?: string;
    coreVersion?: number;
    privateVersion?: number;
    /** Proje satırlarının bulutta bilinen sürümü ve son gönderilen içeriğin özeti */
    projectVersions?: Record<string, number>;
    projectHashes?: Record<string, string>;
    coreHash?: string;
    privateHash?: string;
}

export interface PrivateDoc {
    notes: Record<string, Note[]>; // projectId -> notlar
    customerRequests: Record<string, CustomerRequest[]>;
}

export const loadCloudConfig = (): CloudConfig | null => {
    try {
        const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CloudConfig;
        const connection = normalizeCloudConnection(parsed.url, parsed.anonKey);
        return connection ? { autoSync: true, ...parsed, ...connection } : null;
    } catch {
        return null;
    }
};

export const saveCloudConfig = (config: CloudConfig | null): void => {
    const previous = loadCloudConfig();
    if (!config) {
        localStorage.removeItem(CLOUD_CONFIG_KEY);
    } else {
        localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
    }
    if (!sameCloudTarget(previous, config)) cancelScheduledPush();
};

const sameCloudTarget = (a: CloudConfig | null, b: CloudConfig | null): boolean =>
    a?.url === b?.url && a?.anonKey === b?.anonKey && a?.workspaceId === b?.workspaceId && a?.linkedUserId === b?.linkedUserId;

export const getDeploymentCloudConnection = async (signal?: AbortSignal): Promise<CloudConnection | null> => {
    try {
        const response = await fetch(CLOUD_CONFIG_PATH, { signal, cache: 'no-store' });
        if (!response.ok) return null;
        const { connection } = await response.json();
        return connection ? normalizeCloudConnection(connection.url, connection.anonKey) : null;
    } catch {
        return null;
    }
};

export const checkCloudConnection = async ({ url, anonKey }: CloudConnection, signal: AbortSignal): Promise<boolean> => {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey }, signal, redirect: 'error' });
    if (!response.ok) return false;
    const settings = await response.json();
    return !!settings?.external && typeof settings.external === 'object';
};

// ---------------------------------------------------------------------------
// Belge ayırma / birleştirme (saf — test edilir)
// ---------------------------------------------------------------------------

/** Buluta giden proje: özel alanlar boşaltılmış */
const sharedProject = (p: Project): Project => ({ ...p, notes: [], customerRequests: [] });

export const splitWorkspaceDoc = (ws: WorkspaceData): { core: Record<string, unknown>; privateDoc: PrivateDoc; projects: Project[] } => {
    const privateDoc: PrivateDoc = { notes: {}, customerRequests: {} };
    const projects = ws.projects.map(p => {
        if (p.notes.length) privateDoc.notes[p.id] = p.notes;
        if (p.customerRequests.length) privateDoc.customerRequests[p.id] = p.customerRequests;
        return sharedProject(p);
    });
    const core: Record<string, unknown> = {
        schemaVersion: ws.schemaVersion,
        projectOrder: projects.map(p => p.id),
        people: ws.people,
        departments: ws.departments,
        roleCatalog: ws.roleCatalog,
        titles: ws.titles,
        allocations: ws.allocations,
        // Kişi uygunluğu (izin/tatil): kapasite ve doluluk hesaplarına girer, herkesle paylaşılır
        leaves: ws.leaves || [],
        planLocks: ws.planLocks,
        snapshots: ws.snapshots,
        // Yönetimden beklentiler PM ile yönetim arasında paylaşılır
        expectations: ws.expectations || [],
        weeklyReports: ws.weeklyReports || [],
        weeklyPublications: ws.weeklyPublications || [],
        customerMeetings: ws.customerMeetings || [],
        reportSettings: ws.reportSettings,
        // Sağlık modeli: PMO puanları (hedef değişken) ve haftalık fotoğraflar
        pmoRatings: ws.pmoRatings || [],
        healthHistory: ws.healthHistory || [],
        // Admin'in rol yetkileri, profilleri ve uygulama ayarları tüm kullanıcılara uygulanır
        rolePermissions: ws.rolePermissions || {},
        rolePermissionsRev: ws.rolePermissionsRev,
        profiles: ws.profiles || [],
        viewConfig: ws.viewConfig || {},
        // Admin'in proje yapılandırma şemaları (iş akışı, alanlar, pano) tüm kullanıcılara uygulanır
        projectSchemes: ws.projectSchemes || [],
        projectRoles: ws.projectRoles,
        healthConfig: ws.healthConfig || {},
        aiPolicy: ws.aiPolicy || {},
        // Kayıt tahmini öneri günlüğü (öğrenme döngüsü; kişi adı içermez)
        estimateLog: ws.estimateLog || [],
        // Tahmin değerlendirmesi: altın set ve kalite kapısı çalıştırmaları
        goldenSet: ws.goldenSet || [],
        evalRuns: ws.evalRuns || [],
        modelEvals: ws.modelEvals || [],
        // Haftalık rapor AI öneri günlüğü (yalnız sayılar; rapor metni yok)
        reportAiLog: ws.reportAiLog || [],
        // Rapor taslağı değerlendirmesi: altın set ve koşular
        reportGoldenSet: ws.reportGoldenSet || [],
        reportEvalRuns: ws.reportEvalRuns || [],
    };
    return { core, privateDoc, projects };
};

/**
 * Bulut parçalarından çalışma alanı. `rows`: proje satırları; yoksa (eski biçim)
 * core içindeki projeler. Sıra core.projectOrder'dan; sırada olmayan satır sona.
 */
export const mergeWorkspaceDoc = (
    local: WorkspaceData,
    core: Partial<WorkspaceData> & { projectOrder?: string[] },
    privateDoc?: PrivateDoc,
    rows?: Project[],
): WorkspaceData => {
    let source: Project[] = core.projects || [];
    if (rows && rows.length) {
        const order = new Map((core.projectOrder || []).map((id, i) => [id, i]));
        source = [...rows].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
    }
    const { projectOrder: _order, ...coreRest } = core;
    void _order;
    const projects = source.map(p => ({
        ...p,
        notes: privateDoc?.notes?.[p.id] || [],
        customerRequests: privateDoc?.customerRequests?.[p.id] || [],
    }));
    return normalizeWorkspace({
        ...coreRest,
        projects,
        // Cihaza özel alanlar yerelden korunur
        activeProjectId: local.activeProjectId,
        currentRole: local.currentRole,
        currentPersonId: local.currentPersonId,
        auditLog: local.auditLog,
        settings: local.settings,
    });
};

// ---------------------------------------------------------------------------
// Supabase istemcisi + auth
// ---------------------------------------------------------------------------

let client: SupabaseClient | null = null;
let clientConnection: CloudConnection | null = null;
let loadedCloudTarget: CloudConfig | null = null;

/** Marks the target that the current tab's locally loaded data belongs to. */
export const markCachedCloudWorkspace = (config: CloudConfig | null): void => {
    loadedCloudTarget = config?.workspaceId ? config : null;
};

export const getClient = (): SupabaseClient | null => {
    const config = loadCloudConfig();
    if (!config) return null;
    if (client && clientConnection?.url === config.url && clientConnection.anonKey === config.anonKey) return client;
    try {
        client = createClient(config.url, config.anonKey);
        clientConnection = { url: config.url, anonKey: config.anonKey };
        return client;
    } catch (e) {
        console.error('Supabase istemcisi kurulamadı:', e);
        return null;
    }
};

// supabase-js 5xx yanıtlarında gövdeyi okumaz; ileti çoğu zaman "{}" olur.
export const CLOUD_CODE_SEND_FAILED = 'Supabase kod e-postasını gönderemedi. Supabase panelinde Authentication → Emails → SMTP Settings bilgilerini (sunucu, port, kullanıcı adı, şifre, doğrulanmış gönderen adresi) kontrol edin; ayrıntılı hata Logs → Auth kayıtlarında görünür.';
export const cloudAuthServerError = (error: { status?: number; message?: string }): string | null => {
    if (error.status === undefined || error.status < 500) return null;
    const message = error.message?.trim();
    return message && message !== '{}' ? `Supabase sunucu hatası (${error.status}): ${message}` : `Supabase sunucu hatası (${error.status}).`;
};

export const requestCloudCode = async (email: string): Promise<string | null> => {
    const c = getClient();
    if (!c) return 'Önce bağlantı ayarlarını kaydedin.';
    const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (!error) return null;
    if (error.status === 429) return 'Yeni bir kod istemeden önce bekleyin.';
    if (error.status !== undefined && error.status >= 500) return CLOUD_CODE_SEND_FAILED;
    return error.message && error.message !== '{}' ? error.message : 'Kod gönderilemedi. Bağlantı ayarlarını kontrol edip tekrar deneyin.';
};

/** Supabase panelinde parola tanımlanmış hesaplar (ör. yönetici) kod beklemeden girer. */
export const signInCloudWithPassword = async (email: string, password: string): Promise<string | null> => {
    const c = getClient();
    if (!c) return 'Önce bağlantı ayarlarını kaydedin.';
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (error.status === 400 || error.code === 'invalid_credentials') return 'E-posta veya parola hatalı.';
    if (error.code === 'email_not_confirmed') return 'Bu hesabın e-postası doğrulanmamış. Supabase panelinde kullanıcıyı onaylayın.';
    if (error.status === 429) return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.';
    return cloudAuthServerError(error) ?? error.message;
};

export const verifyCloudCode = async (email: string, token: string): Promise<string | null> => {
    const c = getClient();
    if (!c) return 'Önce bağlantı ayarlarını kaydedin.';
    const { error } = await c.auth.verifyOtp({ email, token, type: 'email' });
    if (!error) return null;
    if (error.status === 400 || error.status === 403) return 'Kod geçersiz veya süresi dolmuş. Kodu kontrol edin ya da yeni kod isteyin.';
    return cloudAuthServerError(error) ?? error.message;
};

export const signOut = async (): Promise<string | null> => {
    cancelScheduledPush();
    await pushChain;
    const { error } = await getClient()?.auth.signOut({ scope: 'local' }) ?? {};
    if (error) return error.message;
    const config = loadCloudConfig();
    if (config) saveCloudConfig({ url: config.url, anonKey: config.anonKey, autoSync: config.autoSync });
    return null;
};

export const getCloudUser = async (): Promise<{ id: string; email: string } | null> => {
    const c = getClient();
    if (!c) return null;
    const { data } = await c.auth.getUser();
    return data.user?.email ? { id: data.user.id, email: data.user.email } : null;
};

export const getCloudMembership = async (workspaceId: string, signal = AbortSignal.timeout(8000)): Promise<{ membership: CloudMembership | null; userId?: string; error?: string }> => {
    const c = getClient();
    if (!c) return { membership: null };
    const { data: session, error: sessionError } = await c.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return { membership: null, error: sessionError?.message };
    const { data, error } = await c
        .from('workspace_members')
        .select('role, person_id, project_ids, access_admin')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .abortSignal(signal)
        .maybeSingle();
    if (error) return { membership: null, error: cloudError(error) };
    return { userId, membership: data ? { role: data.role, personId: data.person_id, projectIds: data.project_ids, accessAdmin: data.access_admin } : null };
};

export interface CloudWorkspaceOption { id: string; name: string }
export interface CloudMember extends CloudMembership { id: string; email: string; owner: boolean }
export const sameCloudMembership = (a?: CloudMembership | null, b?: CloudMembership | null): boolean =>
    a?.role === b?.role && a?.personId === b?.personId && a?.accessAdmin === b?.accessAdmin
    && JSON.stringify(a?.projectIds) === JSON.stringify(b?.projectIds);

export const applyCloudMembership = (workspace: WorkspaceData, membership: CloudMembership, workspaceId: string): WorkspaceData => ({
    ...workspace, cloudMembership: membership, cloudWorkspaceId: workspaceId, currentRole: membership.role,
    currentPersonId: membership.personId ?? undefined,
});

const schemaMissing = (code?: string) => ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code || '');
export const CLOUD_SCHEMA_MESSAGE = 'Supabase projesinde PlanAsistan şeması eksik veya eski. Kurulum SQL’ini çalıştırıp tekrar deneyin.';
const cloudError = (error: { code?: string; message: string }): string => schemaMissing(error.code) ? CLOUD_SCHEMA_MESSAGE : error.message;

export const listCloudWorkspaces = async (): Promise<{ workspaces: CloudWorkspaceOption[] } | { error: string; needsSchema: boolean }> => {
    const c = getClient();
    if (!c) return { error: 'Bağlantı yapılandırılmadı.', needsSchema: false };
    const { data, error } = await c.rpc('list_planasistan_workspaces');
    if (error) {
        const needsSchema = schemaMissing(error.code);
        return { error: needsSchema ? CLOUD_SCHEMA_MESSAGE : error.message, needsSchema };
    }
    return { workspaces: data || [] };
};

export const listCloudMembers = async (workspaceId: string): Promise<{ members: CloudMember[] } | { error: string }> => {
    const c = getClient();
    if (!c) return { error: 'Bağlantı yapılandırılmadı.' };
    const { data, error } = await c.rpc('list_planasistan_members', { p_workspace: workspaceId });
    if (error) return { error: cloudError(error) };
    return { members: (data || []).map(row => ({
        id: row.user_id, email: row.email, role: row.role, personId: row.person_id, projectIds: row.project_ids,
        accessAdmin: row.access_admin, owner: row.owner,
    })) };
};

export const saveCloudMember = async (workspaceId: string, email: string, membership: CloudMembership, remove = false): Promise<string | null> => {
    const c = getClient();
    if (!c) return 'Bağlantı yapılandırılmadı.';
    const { error } = await c.rpc('save_planasistan_member', {
        p_workspace: workspaceId, p_email: email, p_role: membership.role, p_person_id: membership.personId,
        p_project_ids: membership.projectIds, p_access_admin: membership.accessAdmin, p_remove: remove,
    });
    return error ? cloudError(error) : null;
};

// ---------------------------------------------------------------------------
// Değişiklik tespiti ve gönderim planı (saf — test edilir)
// ---------------------------------------------------------------------------

/** İçerik özeti (iki FNV-1a 32 bit; yalnız "değişti mi" için) */
export const contentHash = (value: unknown): string => {
    const text = JSON.stringify(value) ?? '';
    let a = 0x811c9dc5, b = 0x01000193 ^ text.length;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193);
        b = Math.imul(b ^ c, 0x5bd1e995);
    }
    return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}-${text.length.toString(36)}`;
};

// Aynı proje nesnesinin özeti bir kez hesaplanır (değişmez güncellemeler)
const hashCache = new WeakMap<Project, string>();
const projectHash = (p: Project, shared: Project): string => {
    let h = hashCache.get(p);
    if (!h) { h = contentHash(shared); hashCache.set(p, h); }
    return h;
};

export interface PushPlan {
    core: Record<string, unknown>;
    coreHash: string;
    coreChanged: boolean;
    privateDoc: PrivateDoc;
    privateHash: string;
    privateChanged: boolean;
    /** Değişen ya da yeni projeler; `expected` yoksa bulutta satırı yok (eklenir) */
    upserts: { id: string; data: Project; hash: string; expected?: number }[];
    /** Yerelde silinmiş, bulutta satırı olan projeler */
    deletes: { id: string; expected: number }[];
}

/** Son gönderimden bu yana değişen parçalar */
export const planPush = (ws: WorkspaceData, config: Pick<CloudConfig, 'projectVersions' | 'projectHashes' | 'coreHash' | 'privateHash'>): PushPlan => {
    const { core, privateDoc, projects } = splitWorkspaceDoc(ws);
    const versions = config.projectVersions || {};
    const hashes = config.projectHashes || {};
    const upserts: PushPlan['upserts'] = [];
    projects.forEach((shared, i) => {
        const hash = projectHash(ws.projects[i], shared);
        if (hashes[shared.id] !== hash || versions[shared.id] === undefined) upserts.push({ id: shared.id, data: shared, hash, expected: versions[shared.id] });
    });
    const ids = new Set(projects.map(p => p.id));
    const deletes = Object.entries(versions).filter(([id]) => !ids.has(id)).map(([id, expected]) => ({ id, expected }));
    const coreHash = contentHash(core);
    const privateHash = contentHash(privateDoc);
    return { core, coreHash, coreChanged: coreHash !== config.coreHash, privateDoc, privateHash, privateChanged: privateHash !== config.privateHash, upserts, deletes };
};

/** Buluttan inen çalışma alanının özetleri (çekimden hemen sonra gereksiz gönderim olmasın) */
export const syncedHashes = (ws: WorkspaceData): Pick<CloudConfig, 'projectHashes' | 'coreHash' | 'privateHash'> => {
    const plan = planPush(ws, {});
    return { projectHashes: Object.fromEntries(plan.upserts.map(u => [u.id, u.hash])), coreHash: plan.coreHash, privateHash: plan.privateHash };
};

// ---------------------------------------------------------------------------
// Push / Pull (iyimser sürüm kontrolü — sessiz veri ezmek yok)
// ---------------------------------------------------------------------------

export interface PushResult {
    ok: boolean;
    reason?: 'conflict' | 'error' | 'not-configured';
    message?: string;
    coreVersion?: number;
    privateVersion?: number;
    /** Gönderilen proje sayısı (değişmeyenler gitmez) */
    projectsSent?: number;
}

export const createCloudWorkspace = async (id: string, name: string, ws: WorkspaceData): Promise<{ id: string } | { error: string }> => {
    const c = getClient();
    const config = loadCloudConfig();
    if (!c || !config) return { error: 'Bağlantı yapılandırılmadı.' };
    const { data: session } = await c.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return { error: 'Önce e-posta adresinizle giriş yapın.' };
    const plan = planPush(ws, {});
    const { data, error } = await c.rpc('create_planasistan_workspace', {
        p_id: id, p_name: name, p_core: plan.core, p_projects: plan.upserts.map(u => u.data), p_private: plan.privateDoc,
    });
    if (error || data !== id) return { error: schemaMissing(error?.code) ? CLOUD_SCHEMA_MESSAGE : error?.message || 'Çalışma alanı oluşturulamadı.' };
    const latest = loadCloudConfig();
    if (!latest || !sameCloudTarget(latest, config)) return { error: 'Çalışma alanı oluşturuldu. Güncel bağlantıda listeden seçin.' };
    saveCloudConfig({
        ...latest,
        workspaceId: id,
        linkedUserId: userId,
        membership: { role: 'pyb_destek', personId: null, projectIds: null, accessAdmin: true },
        coreVersion: 1,
        privateVersion: 1,
        projectVersions: Object.fromEntries(plan.upserts.map(u => [u.id, 1])),
        projectHashes: Object.fromEntries(plan.upserts.map(u => [u.id, u.hash])),
        coreHash: plan.coreHash,
        privateHash: plan.privateHash,
        lastSyncAt: new Date().toISOString(),
    });
    loadedCloudTarget = loadCloudConfig();
    clearConflictFlag();
    return { id };
};

// Gönderimler sırayla: üst üste binen iki gönderim aynı sürümü bekleyip kendi kendine çakışmasın
let pushChain: Promise<unknown> = Promise.resolve();
export const pushWorkspace = (ws: WorkspaceData): Promise<PushResult> => {
    const target = loadCloudConfig();
    const run = pushChain.then(() => sameCloudTarget(loadCloudConfig(), target)
        ? pushOnce(ws) : { ok: false, reason: 'not-configured' } as const);
    pushChain = run.catch(() => undefined);
    return run;
};

const pushOnce = async (ws: WorkspaceData): Promise<PushResult> => {
    const c = getClient();
    const config = loadCloudConfig();
    if (!c || !config?.workspaceId) return { ok: false, reason: 'not-configured' };
    if (!sameCloudTarget(loadedCloudTarget, config)) {
        return { ok: false, reason: 'not-configured', message: 'Önce veritabanındaki çalışma alanını açın.' };
    }
    const { data: session } = await c.auth.getSession();
    if (!session.session || (config.linkedUserId && config.linkedUserId !== session.session.user.id)) {
        return { ok: false, reason: 'not-configured', message: 'Eşitlemek için çalışma alanına yeniden bağlanın.' };
    }
    const workspaceId = config.workspaceId;
    const access = await getCloudMembership(workspaceId);
    if (access.userId !== session.session.user.id || !access.membership || !sameCloudMembership(access.membership, config.membership)) {
        return { ok: false, reason: 'not-configured', message: access.error || 'Erişim değişti. Eşitlemek için çalışma alanını yeniden açın.' };
    }
    const scoped = access.membership.projectIds !== null;
    const plan = planPush(ws, config);
    if (scoped && (plan.deletes.length || plan.upserts.some(row => row.expected === undefined))) {
        return { ok: false, reason: 'error', message: 'Bu proje kapsamında proje ekleme veya silme yetkiniz yok.' };
    }
    const versions = { ...(config.projectVersions || {}) };
    const hashes = { ...(config.projectHashes || {}) };
    let coreVersion = config.coreVersion ?? 0;
    let privateVersion = config.privateVersion;
    let coreHash = config.coreHash;
    let privateHash = config.privateHash;
    let conflict: string | null = null;
    let error: string | null = null;
    let sent = 0;
    // Başarılı parçalar her durumda kaydedilir (yarıda kalan gönderim tekrarlanmasın)
    const remember = () => {
        const latest = loadCloudConfig();
        if (!latest || !sameCloudTarget(latest, config)) return;
        saveCloudConfig({
            ...latest, linkedUserId: session.session.user.id, coreVersion, privateVersion, projectVersions: versions, projectHashes: hashes, coreHash, privateHash,
            lastSyncAt: conflict || error ? latest.lastSyncAt : new Date().toISOString(),
        });
        loadedCloudTarget = loadCloudConfig();
    };

    // 1. Projeler: her satır kendi sürümüyle
    for (const u of plan.upserts) {
        if (u.expected === undefined) {
            const { error: e } = await c.from('workspace_projects').insert({ workspace_id: workspaceId, project_id: u.id, data: u.data, version: 1 });
            // Aynı proje başkası tarafından eklenmiş (benzersizlik ihlali) → çakışma
            if (e) { if (e.code === '23505') conflict = `"${u.data.name}" projesi bulutta başkası tarafından da eklenmiş.`; else error = e.message; break; }
            versions[u.id] = 1;
        } else {
            const { data, error: e } = await c
                .from('workspace_projects')
                .update({ data: u.data, version: u.expected + 1 })
                .eq('workspace_id', workspaceId)
                .eq('project_id', u.id)
                .eq('version', u.expected)
                .select('version');
            if (e) { error = e.message; break; }
            if (!data || data.length === 0) { conflict = `"${u.data.name}" projesinde bulutta daha yeni bir sürüm var.`; break; }
            versions[u.id] = u.expected + 1;
        }
        hashes[u.id] = u.hash;
        sent++;
    }
    if (!conflict && !error) {
        for (const d of plan.deletes) {
            const { data, error: e } = await c
                .from('workspace_projects')
                .delete()
                .eq('workspace_id', workspaceId)
                .eq('project_id', d.id)
                .eq('version', d.expected)
                .select('project_id');
            if (e) { error = e.message; break; }
            if (!data || data.length === 0) {
                // Satır zaten yoksa sorun değil; varsa başkası değiştirmiş
                const { data: still } = await c.from('workspace_projects').select('version').eq('workspace_id', workspaceId).eq('project_id', d.id).maybeSingle();
                if (still) { conflict = 'Silinen bir proje bulutta başkası tarafından değiştirilmiş.'; break; }
            }
            delete versions[d.id];
            delete hashes[d.id];
        }
    }

    // 2. Çekirdek belge (yalnız değiştiyse; proje sırası da içinde)
    if (!scoped && !conflict && !error && plan.coreChanged) {
        const { data, error: e } = await c
            .from('workspaces')
            .update({ core: plan.core, version: coreVersion + 1 })
            .eq('id', workspaceId)
            .eq('version', coreVersion)
            .select('version');
        if (e) error = e.message;
        else if (!data || data.length === 0) conflict = 'Bulutta daha yeni bir sürüm var.';
        else { coreVersion += 1; coreHash = plan.coreHash; }
    }

    // 3. Özel belge (notlar, istekler). RLS ile gizleniyorsa sürümü bilinmez.
    if (!conflict && !error && plan.privateChanged && (privateVersion !== undefined || config.privateHash !== undefined)) {
        const expectedPriv = privateVersion ?? 0;
        const version = scoped
            ? await c.rpc('save_planasistan_project_private', { p_workspace: workspaceId, p_version: expectedPriv, p_private: plan.privateDoc })
            : await c.from('workspace_private').update({ data: plan.privateDoc, version: expectedPriv + 1 })
                .eq('workspace_id', workspaceId).eq('version', expectedPriv).select('version').maybeSingle();
        if (version.error) error = cloudError(version.error);
        else if (version.data == null) conflict = 'Özel çalışma alanı verisinin buluttaki sürümü değişmiş.';
        else { privateVersion = expectedPriv + 1; privateHash = plan.privateHash; }
    }

    remember();
    if (conflict) return { ok: false, reason: 'conflict', message: conflict, projectsSent: sent };
    if (error) return { ok: false, reason: 'error', message: error, projectsSent: sent };
    return { ok: true, coreVersion, privateVersion, projectsSent: sent };
};

export interface PullResult {
    ok: boolean;
    accessDenied?: boolean;
    message?: string;
    privateVisible?: boolean;
    workspace?: (local: WorkspaceData) => WorkspaceData;
}

export const pullWorkspace = async (targetId?: string, signal = AbortSignal.timeout(15000)): Promise<PullResult> => {
    cancelScheduledPush();
    await pushChain;
    const c = getClient();
    const config = loadCloudConfig();
    const workspaceId = targetId ?? config?.workspaceId;
    if (!c || !config || !workspaceId) return { ok: false, message: 'Bağlantı yapılandırılmadı.' };
    const { data: session } = await c.auth.getSession();
    if (!session.session) return { ok: false, message: 'Önce e-posta adresinizle giriş yapın.' };

    const { data: raw, error } = await c.rpc('read_planasistan_workspace', { p_workspace: workspaceId }).abortSignal(signal);
    if (error) return { ok: false, message: cloudError(error) };
    if (!raw) return { ok: false, accessDenied: true, message: 'Bu çalışma alanına erişiminiz yok. Yöneticiniz erişim atayabilir.' };
    const { core, private: privateDoc, privateVersion, projects: rows, version, membership } = raw as {
        core: Partial<WorkspaceData> & { projectOrder?: string[] };
        private: PrivateDoc | null;
        privateVersion: number | null;
        projects: { project_id: string; data: Project; version: number }[];
        version: number;
        membership: CloudMembership;
    };
    const projectRows = rows.map(r => r.data);
    // Eski biçim (projeler core içinde, satır yok): sürüm bilinmez → ilk gönderimde satırlar eklenir
    const projectVersions = Object.fromEntries(rows.map(r => [r.project_id, r.version]));
    const pulled = mergeWorkspaceDoc(createEmptyWorkspace(), core, privateDoc ?? undefined, projectRows);
    const hashes = syncedHashes(pulled);
    const latest = loadCloudConfig();
    if (signal.aborted || !latest || !sameCloudTarget(latest, config)) return { ok: false, message: 'Çalışma alanı güncellenemedi. Tekrar deneyin.' };
    const sameWorkspace = workspaceId === config.workspaceId && config.linkedUserId === session.session.user.id
        && sameCloudMembership(config.membership, membership);
    saveCloudConfig({
        ...latest,
        workspaceId,
        linkedUserId: session.session.user.id,
        membership,
        coreVersion: version,
        privateVersion: privateVersion ?? undefined,
        projectVersions,
        projectHashes: rows && rows.length ? hashes.projectHashes : {},
        // Eski biçimde core da yeniden yazılmalı (projeler satırlara taşınınca core'dan çıkar)
        coreHash: rows.length || !core.projects?.length ? hashes.coreHash : undefined,
        privateHash: privateDoc ? hashes.privateHash : undefined,
        lastSyncAt: new Date().toISOString(),
    });
    loadedCloudTarget = loadCloudConfig();

    return {
        ok: true,
        privateVisible: !!privateDoc,
        workspace: (local: WorkspaceData) => applyCloudMembership(
            mergeWorkspaceDoc(sameWorkspace ? local : { ...local, auditLog: undefined }, core, privateDoc ?? undefined, projectRows), membership, workspaceId),
    };
};

// ---------------------------------------------------------------------------
// Otomatik gönderim (debounce) — App her workspace değişiminde çağırır
// ---------------------------------------------------------------------------

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastConflict = false;

const cancelScheduledPush = () => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
};

export const hasPendingConflict = (): boolean => lastConflict;
export const clearConflictFlag = (): void => { lastConflict = false; };

export const scheduleAutoPush = (ws: WorkspaceData, delayMs = 4000): void => {
    const config = loadCloudConfig();
    if (!config?.workspaceId || !config.autoSync) return;
    cancelScheduledPush();
    pushTimer = setTimeout(async () => {
        pushTimer = null;
        const c = getClient();
        if (!c || !sameCloudTarget(loadCloudConfig(), config) || !loadCloudConfig()?.autoSync) return;
        const result = await pushWorkspace(ws);
        if (!result.ok && result.reason === 'conflict') {
            lastConflict = true;
            console.warn('Bulut çakışması: başka bir cihaz/kullanıcı daha yeni veri yazdı. Bulut penceresinden "Buluttan Çek" yapın.');
        }
    }, delayMs);
};
