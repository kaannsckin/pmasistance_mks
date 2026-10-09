import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CustomerRequest, Note, Project, UserRole, WorkspaceData } from '../types';
import { createEmptyWorkspace, normalizeWorkspace } from './workspace';

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

export interface CloudConfig {
    url: string;
    anonKey: string;
    workspaceId?: string;
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
        if (!parsed.url || !parsed.anonKey) return null;
        return { autoSync: true, ...parsed };
    } catch {
        return null;
    }
};

export const saveCloudConfig = (config: CloudConfig | null): void => {
    if (!config) {
        localStorage.removeItem(CLOUD_CONFIG_KEY);
    } else {
        localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
    }
    client = null; // yeni yapılandırmayla yeniden kurulsun
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
        settings: local.settings,
    });
};

// ---------------------------------------------------------------------------
// Supabase istemcisi + auth
// ---------------------------------------------------------------------------

let client: SupabaseClient | null = null;

export const getClient = (): SupabaseClient | null => {
    if (client) return client;
    const config = loadCloudConfig();
    if (!config) return null;
    try {
        client = createClient(config.url, config.anonKey);
        return client;
    } catch (e) {
        console.error('Supabase istemcisi kurulamadı:', e);
        return null;
    }
};

export const signUp = async (email: string, password: string): Promise<string | null> => {
    const c = getClient();
    if (!c) return 'Önce bağlantı ayarlarını kaydedin.';
    const { error } = await c.auth.signUp({ email, password });
    return error ? error.message : null;
};

export const signIn = async (email: string, password: string): Promise<string | null> => {
    const c = getClient();
    if (!c) return 'Önce bağlantı ayarlarını kaydedin.';
    const { error } = await c.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
};

export const signOut = async (): Promise<void> => {
    await getClient()?.auth.signOut();
};

export const getUserEmail = async (): Promise<string | null> => {
    const c = getClient();
    if (!c) return null;
    const { data } = await c.auth.getUser();
    return data.user?.email ?? null;
};

export const getMyCloudRole = async (workspaceId: string): Promise<UserRole | null> => {
    const c = getClient();
    if (!c) return null;
    const { data: userData } = await c.auth.getUser();
    if (!userData.user) return null;
    const { data } = await c
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userData.user.id)
        .maybeSingle();
    return (data?.role as UserRole) ?? null;
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

export const createCloudWorkspace = async (name: string, ws: WorkspaceData): Promise<{ id: string } | { error: string }> => {
    const c = getClient();
    if (!c) return { error: 'Bağlantı yapılandırılmadı.' };
    const plan = planPush(ws, {});
    const { data, error } = await c
        .from('workspaces')
        .insert({ name, core: plan.core, version: 1 })
        .select('id')
        .single();
    if (error || !data) return { error: error?.message || 'Çalışma alanı oluşturulamadı.' };
    if (plan.upserts.length) {
        const { error: rErr } = await c
            .from('workspace_projects')
            .insert(plan.upserts.map(u => ({ workspace_id: data.id, project_id: u.id, data: u.data, version: 1 })));
        if (rErr) return { error: `Projeler yazılamadı: ${rErr.message} (şema güncel mi? supabase/schema.sql)` };
    }
    // Tetikleyici private satırını version 0 ile açtı; veriyi yazıp 1'e çek
    const { error: pErr } = await c
        .from('workspace_private')
        .update({ data: plan.privateDoc, version: 1 })
        .eq('workspace_id', data.id)
        .eq('version', 0);
    if (pErr) console.warn('Özel veri yazılamadı:', pErr.message);
    const config = loadCloudConfig();
    if (config) {
        saveCloudConfig({
            ...config,
            workspaceId: data.id,
            coreVersion: 1,
            privateVersion: 1,
            projectVersions: Object.fromEntries(plan.upserts.map(u => [u.id, 1])),
            projectHashes: Object.fromEntries(plan.upserts.map(u => [u.id, u.hash])),
            coreHash: plan.coreHash,
            privateHash: pErr ? undefined : plan.privateHash,
        });
    }
    return { id: data.id };
};

// Gönderimler sırayla: üst üste binen iki gönderim aynı sürümü bekleyip kendi kendine çakışmasın
let pushChain: Promise<unknown> = Promise.resolve();
export const pushWorkspace = (ws: WorkspaceData): Promise<PushResult> => {
    const run = pushChain.then(() => pushOnce(ws));
    pushChain = run.catch(() => undefined);
    return run;
};

const pushOnce = async (ws: WorkspaceData): Promise<PushResult> => {
    const c = getClient();
    const config = loadCloudConfig();
    if (!c || !config?.workspaceId) return { ok: false, reason: 'not-configured' };
    const workspaceId = config.workspaceId;
    const plan = planPush(ws, config);
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
    const remember = () => saveCloudConfig({
        ...config, coreVersion, privateVersion, projectVersions: versions, projectHashes: hashes, coreHash, privateHash,
        lastSyncAt: new Date().toISOString(),
    });

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
    if (!conflict && !error && plan.coreChanged) {
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

    // 3. Özel belge (notlar, istekler); yönetici rolü RLS nedeniyle yazamaz — sorun değil, atlanır
    if (!conflict && !error && plan.privateChanged) {
        const expectedPriv = privateVersion ?? 0;
        const { data: pData, error: pErr } = await c
            .from('workspace_private')
            .update({ data: plan.privateDoc, version: expectedPriv + 1 })
            .eq('workspace_id', workspaceId)
            .eq('version', expectedPriv)
            .select('version');
        if (!pErr && pData && pData.length > 0) { privateVersion = expectedPriv + 1; privateHash = plan.privateHash; }
    }

    remember();
    if (conflict) return { ok: false, reason: 'conflict', message: conflict, projectsSent: sent };
    if (error) return { ok: false, reason: 'error', message: error, projectsSent: sent };
    return { ok: true, coreVersion, privateVersion, projectsSent: sent };
};

export interface PullResult {
    ok: boolean;
    message?: string;
    privateVisible?: boolean;
    workspace?: (local: WorkspaceData) => WorkspaceData;
}

export const pullWorkspace = async (): Promise<PullResult> => {
    const c = getClient();
    const config = loadCloudConfig();
    if (!c || !config?.workspaceId) return { ok: false, message: 'Bağlantı yapılandırılmadı.' };

    const { data, error } = await c
        .from('workspaces')
        .select('core, version')
        .eq('id', config.workspaceId)
        .maybeSingle();
    if (error || !data) return { ok: false, message: error?.message || 'Çalışma alanı bulunamadı (üyeliğinizi kontrol edin).' };

    const { data: rows, error: rErr } = await c
        .from('workspace_projects')
        .select('project_id, data, version')
        .eq('workspace_id', config.workspaceId);
    if (rErr) return { ok: false, message: `Projeler okunamadı: ${rErr.message} (şema güncel mi? supabase/schema.sql)` };

    // Yönetici rollerinde RLS bu satırı gizler — notlar boş iner (tasarım gereği)
    const { data: pData } = await c
        .from('workspace_private')
        .select('data, version')
        .eq('workspace_id', config.workspaceId)
        .maybeSingle();

    const core = data.core as Partial<WorkspaceData> & { projectOrder?: string[] };
    const privateDoc = pData?.data as PrivateDoc | undefined;
    const projectRows = (rows || []).map(r => r.data as Project);
    // Eski biçim (projeler core içinde, satır yok): sürüm bilinmez → ilk gönderimde satırlar eklenir
    const projectVersions = Object.fromEntries((rows || []).map(r => [r.project_id as string, r.version as number]));
    const pulled = mergeWorkspaceDoc(createEmptyWorkspace(), core, privateDoc, projectRows);
    const hashes = syncedHashes(pulled);
    saveCloudConfig({
        ...config,
        coreVersion: data.version as number,
        privateVersion: (pData?.version as number | undefined) ?? config.privateVersion,
        projectVersions,
        projectHashes: rows && rows.length ? hashes.projectHashes : {},
        // Eski biçimde core da yeniden yazılmalı (projeler satırlara taşınınca core'dan çıkar)
        coreHash: rows && rows.length ? hashes.coreHash : undefined,
        privateHash: pData ? hashes.privateHash : undefined,
        lastSyncAt: new Date().toISOString(),
    });

    return {
        ok: true,
        privateVisible: !!pData,
        workspace: (local: WorkspaceData) => mergeWorkspaceDoc(local, core, privateDoc, projectRows),
    };
};

// ---------------------------------------------------------------------------
// Otomatik gönderim (debounce) — App her workspace değişiminde çağırır
// ---------------------------------------------------------------------------

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastConflict = false;

export const hasPendingConflict = (): boolean => lastConflict;
export const clearConflictFlag = (): void => { lastConflict = false; };

export const scheduleAutoPush = (ws: WorkspaceData, delayMs = 4000): void => {
    const config = loadCloudConfig();
    if (!config?.workspaceId || !config.autoSync) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
        pushTimer = null;
        const c = getClient();
        if (!c) return;
        const { data } = await c.auth.getSession();
        if (!data.session) return; // oturum yoksa sessizce bekle
        const result = await pushWorkspace(ws);
        if (!result.ok && result.reason === 'conflict') {
            lastConflict = true;
            console.warn('Bulut çakışması: başka bir cihaz/kullanıcı daha yeni veri yazdı. Bulut penceresinden "Buluttan Çek" yapın.');
        }
    }, delayMs);
};
