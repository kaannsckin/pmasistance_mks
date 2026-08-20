import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CustomerRequest, Note, UserRole, WorkspaceData } from '../types';
import { normalizeWorkspace } from './workspace';
import { bindIdentity, Identity } from './rbac';

/**
 * Yerel-öncelikli bulut senkronizasyonu (Supabase).
 *
 * Veri iki belgeye ayrılır:
 *  - core: paylaşılan her şey (projeler*, havuz, tahsis, kilit, snapshot,
 *    izin ve audit günlüğü)
 *  - private: PM'e özel notlar + müşteri istekleri — sunucuda RLS ile yönetici
 *    rollerinden gizlenir (bkz. supabase/schema.sql)
 *  (* core'daki projelerde notes/customerRequests boşaltılır)
 *
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

export const splitWorkspaceDoc = (ws: WorkspaceData): { core: Record<string, unknown>; privateDoc: PrivateDoc } => {
    const privateDoc: PrivateDoc = { notes: {}, customerRequests: {} };
    const projects = ws.projects.map(p => {
        if (p.notes.length) privateDoc.notes[p.id] = p.notes;
        if (p.customerRequests.length) privateDoc.customerRequests[p.id] = p.customerRequests;
        return { ...p, notes: [], customerRequests: [] };
    });
    const core: Record<string, unknown> = {
        schemaVersion: ws.schemaVersion,
        projects,
        people: ws.people,
        departments: ws.departments,
        roleCatalog: ws.roleCatalog,
        titles: ws.titles,
        allocations: ws.allocations,
        planLocks: ws.planLocks,
        snapshots: ws.snapshots,
        leaves: ws.leaves || [],
        auditLog: ws.auditLog || [],
    };
    return { core, privateDoc };
};

export const mergeWorkspaceDoc = (
    local: WorkspaceData,
    core: Partial<WorkspaceData>,
    privateDoc?: PrivateDoc,
    verifiedIdentity?: Identity,
): WorkspaceData => {
    const projects = (core.projects || []).map(p => ({
        ...p,
        notes: privateDoc?.notes?.[p.id] || [],
        customerRequests: privateDoc?.customerRequests?.[p.id] || [],
    }));
    const merged = normalizeWorkspace({
        ...core,
        projects,
        // Cihaza özel alanlar yerelden korunur
        activeProjectId: local.activeProjectId,
        currentRole: local.currentRole,
        currentPersonId: local.currentPersonId,
        settings: local.settings,
    });
    return verifiedIdentity ? bindIdentity(merged, verifiedIdentity) : merged;
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

export const getMyCloudIdentity = async (workspaceId: string): Promise<Identity | null> => {
    const c = getClient();
    if (!c) return null;
    const { data: userData } = await c.auth.getUser();
    if (!userData.user) return null;
    const { data } = await c
        .from('workspace_members')
        .select('role, person_id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userData.user.id)
        .maybeSingle();
    if (!data?.role) return null;
    return {
        role: data.role as UserRole,
        personId: (data.person_id as string | null) || undefined,
    };
};

/** Geriye uyumlu yardımcı; yeni kod kimliğin tamamını kullanmalı. */
export const getMyCloudRole = async (workspaceId: string): Promise<UserRole | null> =>
    (await getMyCloudIdentity(workspaceId))?.role ?? null;

// ---------------------------------------------------------------------------
// Push / Pull (iyimser sürüm kontrolü — sessiz veri ezmek yok)
// ---------------------------------------------------------------------------

export interface PushResult {
    ok: boolean;
    reason?: 'conflict' | 'error' | 'not-configured' | 'normalization-required';
    message?: string;
    coreVersion?: number;
    privateVersion?: number;
}

interface DualWriteRpcResult {
    ok: boolean;
    id?: string;
    reason?: PushResult['reason'];
    message?: string;
    coreVersion?: number;
    privateVersion?: number | null;
}

const migrationErrorMessage = (message: string): string =>
    /pull_workspace_v2|build_scoped_(core|private)_document|PGRST20[25]/i.test(message)
        ? 'Normalize okuma migration\'ı eksik. Supabase\'te 20260820_0003_normalized_read_cutover.sql dosyasını çalıştırın.'
        : /create_workspace_v2|push_workspace_v2|get_private_version|workspace_normalization_state|project_notes|customer_requests/i.test(message)
            ? 'Transaction çift-yazma migration\'ı eksik. Supabase\'te 20260820_0002_transactional_dual_write.sql dosyasını çalıştırın.'
        : message;

export const createCloudWorkspace = async (name: string, ws: WorkspaceData): Promise<{ id: string } | { error: string }> => {
    const c = getClient();
    if (!c) return { error: 'Bağlantı yapılandırılmadı.' };
    const { core, privateDoc } = splitWorkspaceDoc(ws);
    const { data, error } = await c
        .rpc('create_workspace_v2', {
            workspace_name: name,
            core_doc: core,
            private_doc: privateDoc,
        });
    if (error) return { error: migrationErrorMessage(error.message) };
    const result = data as DualWriteRpcResult | null;
    if (!result?.ok || !result.id) {
        return { error: result?.message || 'Çalışma alanı oluşturulamadı.' };
    }
    return { id: result.id };
};

export const pushWorkspace = async (ws: WorkspaceData): Promise<PushResult> => {
    const c = getClient();
    const config = loadCloudConfig();
    if (!c || !config?.workspaceId) return { ok: false, reason: 'not-configured' };

    // İstemcideki rol/kişi değiştirilmişse belgeyi sunucuya göndermeyi reddet.
    // Sunucuda transaction RPC + RLS ayrıca zorlanır; bu erken kontrol hatalı
    // yerel kimliği daha ağ isteği yapılmadan reddeder.
    const verifiedIdentity = await getMyCloudIdentity(config.workspaceId);
    if (!verifiedIdentity) {
        return { ok: false, reason: 'error', message: 'Bulut üyeliği doğrulanamadı.' };
    }
    const localPersonId = ws.currentPersonId || undefined;
    if (ws.currentRole !== verifiedIdentity.role || localPersonId !== verifiedIdentity.personId) {
        return { ok: false, reason: 'error', message: 'Yerel kimlik bulut üyeliğiyle uyuşmuyor. Önce buluttan yeniden çekin.' };
    }

    const { core, privateDoc } = splitWorkspaceDoc(ws);
    const expectedCore = config.coreVersion ?? 0;

    const expectedPriv = config.privateVersion ?? 0;
    const { data, error } = await c.rpc('push_workspace_v2', {
        ws: config.workspaceId,
        expected_core_version: expectedCore,
        core_doc: core,
        expected_private_version: expectedPriv,
        private_doc: privateDoc,
    });

    if (error) {
        const conflict = error.code === '40001' || /sürüm.*(çakış|değiş)/i.test(error.message);
        return {
            ok: false,
            reason: conflict ? 'conflict' : 'error',
            message: migrationErrorMessage(error.message),
        };
    }

    const result = data as DualWriteRpcResult | null;
    if (!result?.ok) {
        return {
            ok: false,
            reason: result?.reason || 'error',
            message: result?.message || 'Transaction çift-yazma tamamlanamadı.',
        };
    }

    const coreVersion = result.coreVersion ?? expectedCore + 1;
    const privateVersion = typeof result.privateVersion === 'number'
        ? result.privateVersion
        : config.privateVersion;

    saveCloudConfig({
        ...config,
        coreVersion,
        privateVersion,
        lastSyncAt: new Date().toISOString(),
    });
    return { ok: true, coreVersion, privateVersion };
};

export interface PullResult {
    ok: boolean;
    message?: string;
    privateVisible?: boolean;
    identity?: Identity;
    workspace?: (local: WorkspaceData) => WorkspaceData;
}

interface PullWorkspaceRpcResult {
    ok: boolean;
    reason?: 'error' | 'normalization-required';
    message?: string;
    core?: Partial<WorkspaceData>;
    coreVersion?: number;
    privateDoc?: PrivateDoc | null;
    privateVersion?: number | null;
    privateVisible?: boolean;
}

export const pullWorkspace = async (): Promise<PullResult> => {
    const c = getClient();
    const config = loadCloudConfig();
    if (!c || !config?.workspaceId) return { ok: false, message: 'Bağlantı yapılandırılmadı.' };

    const verifiedIdentity = await getMyCloudIdentity(config.workspaceId);
    if (!verifiedIdentity) return { ok: false, message: 'Çalışma alanı üyeliğiniz veya rolünüz doğrulanamadı.' };

    const { data, error } = await c.rpc('pull_workspace_v2', { ws: config.workspaceId });
    if (error) return { ok: false, message: migrationErrorMessage(error.message) };

    const result = data as PullWorkspaceRpcResult | null;
    if (!result?.ok) {
        return {
            ok: false,
            message: result?.message || 'Normalize çalışma alanı okunamadı.',
        };
    }
    if (!result.core || typeof result.coreVersion !== 'number') {
        return { ok: false, message: 'Sunucu eksik normalize çalışma alanı verisi döndürdü.' };
    }

    const privateDoc = result.privateVisible && result.privateDoc
        ? result.privateDoc
        : undefined;
    const privateVersion = typeof result.privateVersion === 'number'
        ? result.privateVersion
        : config.privateVersion;

    saveCloudConfig({
        ...config,
        coreVersion: result.coreVersion,
        privateVersion,
        lastSyncAt: new Date().toISOString(),
    });

    return {
        ok: true,
        privateVisible: result.privateVisible === true,
        identity: verifiedIdentity,
        workspace: (local: WorkspaceData) => mergeWorkspaceDoc(local, result.core!, privateDoc, verifiedIdentity),
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
        } else if (!result.ok) {
            console.warn('Otomatik transaction çift-yazma tamamlanamadı:', result.message);
        }
    }, delayMs);
};
