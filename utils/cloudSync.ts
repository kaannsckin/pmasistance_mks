import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CustomerRequest, Note, UserRole, WorkspaceData } from '../types';
import { normalizeWorkspace } from './workspace';

/**
 * Yerel-öncelikli bulut senkronizasyonu (Supabase).
 *
 * Veri iki belgeye ayrılır:
 *  - core: paylaşılan her şey (projeler*, havuz, tahsis, kilit, snapshot)
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
    };
    return { core, privateDoc };
};

export const mergeWorkspaceDoc = (
    local: WorkspaceData,
    core: Partial<WorkspaceData>,
    privateDoc?: PrivateDoc
): WorkspaceData => {
    const projects = (core.projects || []).map(p => ({
        ...p,
        notes: privateDoc?.notes?.[p.id] || [],
        customerRequests: privateDoc?.customerRequests?.[p.id] || [],
    }));
    return normalizeWorkspace({
        ...core,
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
// Push / Pull (iyimser sürüm kontrolü — sessiz veri ezmek yok)
// ---------------------------------------------------------------------------

export interface PushResult {
    ok: boolean;
    reason?: 'conflict' | 'error' | 'not-configured';
    message?: string;
    coreVersion?: number;
    privateVersion?: number;
}

export const createCloudWorkspace = async (name: string, ws: WorkspaceData): Promise<{ id: string } | { error: string }> => {
    const c = getClient();
    if (!c) return { error: 'Bağlantı yapılandırılmadı.' };
    const { core, privateDoc } = splitWorkspaceDoc(ws);
    const { data, error } = await c
        .from('workspaces')
        .insert({ name, core, version: 1 })
        .select('id')
        .single();
    if (error || !data) return { error: error?.message || 'Çalışma alanı oluşturulamadı.' };
    // Tetikleyici private satırını version 0 ile açtı; veriyi yazıp 1'e çek
    const { error: pErr } = await c
        .from('workspace_private')
        .update({ data: privateDoc, version: 1 })
        .eq('workspace_id', data.id)
        .eq('version', 0);
    if (pErr) console.warn('Özel veri yazılamadı:', pErr.message);
    return { id: data.id };
};

export const pushWorkspace = async (ws: WorkspaceData): Promise<PushResult> => {
    const c = getClient();
    const config = loadCloudConfig();
    if (!c || !config?.workspaceId) return { ok: false, reason: 'not-configured' };

    const { core, privateDoc } = splitWorkspaceDoc(ws);
    const expectedCore = config.coreVersion ?? 0;

    const { data, error } = await c
        .from('workspaces')
        .update({ core, version: expectedCore + 1 })
        .eq('id', config.workspaceId)
        .eq('version', expectedCore)
        .select('version');

    if (error) return { ok: false, reason: 'error', message: error.message };
    if (!data || data.length === 0) return { ok: false, reason: 'conflict', message: 'Bulutta daha yeni bir sürüm var.' };

    let privateVersion = config.privateVersion;
    const expectedPriv = config.privateVersion ?? 0;
    const { data: pData, error: pErr } = await c
        .from('workspace_private')
        .update({ data: privateDoc, version: expectedPriv + 1 })
        .eq('workspace_id', config.workspaceId)
        .eq('version', expectedPriv)
        .select('version');
    if (!pErr && pData && pData.length > 0) {
        privateVersion = expectedPriv + 1;
    }
    // pErr: yönetici rolü RLS nedeniyle private yazamaz — sorun değil, atlanır

    saveCloudConfig({
        ...config,
        coreVersion: expectedCore + 1,
        privateVersion,
        lastSyncAt: new Date().toISOString(),
    });
    return { ok: true, coreVersion: expectedCore + 1, privateVersion };
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

    // Yönetici rollerinde RLS bu satırı gizler — notlar boş iner (tasarım gereği)
    const { data: pData } = await c
        .from('workspace_private')
        .select('data, version')
        .eq('workspace_id', config.workspaceId)
        .maybeSingle();

    saveCloudConfig({
        ...config,
        coreVersion: data.version as number,
        privateVersion: (pData?.version as number | undefined) ?? config.privateVersion,
        lastSyncAt: new Date().toISOString(),
    });

    const core = data.core as Partial<WorkspaceData>;
    const privateDoc = pData?.data as PrivateDoc | undefined;
    return {
        ok: true,
        privateVisible: !!pData,
        workspace: (local: WorkspaceData) => mergeWorkspaceDoc(local, core, privateDoc),
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
