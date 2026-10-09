import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, UserRole, WorkspaceData } from '../../types.js';
import { contentHash, mergeWorkspaceDoc, PrivateDoc, splitWorkspaceDoc } from '../../utils/cloudSync.js';
import { createEmptyWorkspace, parseImportedJson, serializeWorkspace } from '../../utils/workspace.js';

/**
 * MCP sunucusunun veri kaynakları. Uygulama yerel-öncelikli olduğu için veri
 * iki yerden okunabilir:
 *
 *  - Supabase (bulut senkronizasyonu kuruluysa): kullanıcının kendi hesabıyla
 *    oturum açılır; RLS aynen geçerlidir (yönetici rolleri notları okuyamaz).
 *    Değişiklikler iyimser sürüm kontrolüyle yazılır — tarayıcıdaki
 *    senkronizasyonla aynı kural: kimsenin verisi sessizce ezilmez.
 *  - JSON yedeği (uygulamadan "JSON yedek indir"): yalnız okunur (test ve
 *    pilot ortamında isteğe bağlı yazılabilir).
 */

export interface LoadedWorkspace {
    ws: WorkspaceData;
    /** Buluttaki üyelik rolü (yalnız Supabase) */
    memberRole?: UserRole;
    /** Notlar/istekler (özel belge) okunabildi mi */
    privateVisible: boolean;
    /** Kaynağın kısa açıklaması (durum aracında gösterilir) */
    label: string;
    /** Verinin kaynaktaki tarihi (yedeğin dışa aktarımı ya da son yükleme) */
    dataAt?: string;
}

export interface WorkspaceSource {
    kind: 'file' | 'supabase';
    /** Değişiklik yazamıyorsa nedeni; yazabiliyorsa null */
    readOnlyReason: () => string | null;
    load: (o?: { fresh?: boolean }) => Promise<LoadedWorkspace>;
    /** before: load() ile okunan, after: değiştirilmiş çalışma alanı */
    save: (before: WorkspaceData, after: WorkspaceData) => Promise<void>;
}

/** Kullanıcıya olduğu gibi gösterilecek yapılandırma / bağlantı hatası */
export class SourceError extends Error {}

/** Bulutta daha yeni bir sürüm var — öneriyi yeniden hazırlamak gerekir */
export class ConflictError extends SourceError {}

// ---------------------------------------------------------------------------
// JSON yedeği
// ---------------------------------------------------------------------------

export interface FileDeps {
    readFile: (path: string) => Promise<string>;
    mtime: (path: string) => Promise<number>;
    /** Dosyayı bütün olarak değiştirir (geçici dosya + yeniden adlandırma) */
    writeFile: (path: string, content: string) => Promise<void>;
}

const nodeFs: FileDeps = {
    readFile: p => readFile(p, 'utf8'),
    mtime: async p => (await stat(p)).mtimeMs,
    writeFile: async (p, content) => {
        const tmp = `${p}.${process.pid}.${Date.now().toString(36)}.tmp`;
        await writeFile(tmp, content, 'utf8');
        await rename(tmp, p);
    },
};

/**
 * JSON yedeği. Varsayılan salt-okunur; `writable` yalnız test ve pilot
 * ortamları içindir (PLANASISTAN_FILE_WRITE=1): değişiklik dosyaya yazılır,
 * dosya okunduktan sonra başkası değiştirdiyse çakışma verilir. Tarayıcıdaki
 * uygulama bu değişiklikleri ancak dosya yeniden içe aktarılınca görür.
 */
export const fileSource = (path: string, deps: FileDeps = nodeFs, o: { writable?: boolean } = {}): WorkspaceSource => {
    let cache: { mtime: number; loaded: LoadedWorkspace } | null = null;
    // Kaydedilecek çalışma alanı → okunduğu andaki dosya içeriğinin özeti
    const hashes = new WeakMap<WorkspaceData, string>();
    return {
        kind: 'file',
        readOnlyReason: () => (o.writable ? null : 'Veri kaynağı bir JSON yedeği; yedek dosyası yalnız okunur. Değişiklik için Supabase bağlantısı gerekir.'),
        load: async () => {
            let mtime: number;
            try {
                mtime = await deps.mtime(path);
            } catch {
                throw new SourceError(`Yedek dosyası bulunamadı: ${path}`);
            }
            if (cache && cache.mtime === mtime) return cache.loaded;
            const raw = await deps.readFile(path);
            const parsed = parseImportedJson(raw);
            if (parsed.kind !== 'workspace') {
                throw new SourceError(parsed.kind === 'invalid'
                    ? `Yedek okunamadı (${path}): ${parsed.error}`
                    : `${path} eski tek proje yedeği; uygulamadan güncel çalışma alanı yedeğini (JSON yedek indir) alın.`);
            }
            const loaded: LoadedWorkspace = {
                ws: parsed.workspace,
                privateVisible: true,
                label: `JSON yedeği (${path})${o.writable ? ' · yazılabilir' : ''}`,
                dataAt: parsed.workspace.exportDate,
            };
            hashes.set(parsed.workspace, contentHash(raw));
            cache = { mtime, loaded };
            return loaded;
        },
        save: async (before, after) => {
            if (!o.writable) throw new SourceError('JSON yedeği yalnız okunur.');
            const expected = hashes.get(before);
            if (!expected) throw new SourceError('Kaydedilecek veri bu oturumda dosyadan okunmamış.');
            if (contentHash(await deps.readFile(path)) !== expected) {
                cache = null;
                throw new ConflictError('Dosya okunduktan sonra başkası tarafından değiştirilmiş.');
            }
            // Dosyadaki kimlik ve açık proje (yedeği alan tarayıcınınki) korunur
            const out: WorkspaceData = { ...after, currentRole: before.currentRole, currentPersonId: before.currentPersonId, activeProjectId: before.activeProjectId };
            await deps.writeFile(path, serializeWorkspace(out, false));
            cache = null;
        },
    };
};

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export interface SupabaseSourceConfig {
    url: string;
    email: string;
    password: string;
    workspaceId?: string;
    /** Önbellek süresi (ms); her araç çağrısında bulut yeniden okunmasın */
    ttlMs?: number;
}

interface CloudState {
    workspaceId: string;
    workspaceName?: string;
    rawCore: Record<string, unknown>;
    coreVersion: number;
    projectVersions: Record<string, number>;
    privateVersion?: number;
    /** Eski biçim: projeler core içinde, satır yok → yazılmaz */
    legacy: boolean;
}

const DEFAULT_TTL_MS = 15_000;

/** Oturum jetonu geçersiz / süresi dolmuş (PostgREST) */
const isAuthError = (e: { message?: string; code?: string } | null): boolean =>
    !!e && (e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt/i.test(e.message || ''));

export const supabaseSource = (cfg: SupabaseSourceConfig, client: SupabaseClient): WorkspaceSource => {
    let userId: string | null = null;
    let target: { id: string; name?: string; role: UserRole } | null = null;
    let cache: { at: number; loaded: LoadedWorkspace } | null = null;
    // Kaydedilmek üzere verilen her çalışma alanı, okunduğu bulut sürümüyle eşlenir
    const states = new WeakMap<WorkspaceData, CloudState>();

    const signIn = async (): Promise<string> => {
        if (userId) return userId;
        const { data, error } = await client.auth.signInWithPassword({ email: cfg.email, password: cfg.password });
        if (error?.name === 'AuthRetryableFetchError') throw new SourceError(`Supabase sunucusuna ulaşılamadı (${cfg.url}): adresi ve ağ bağlantısını kontrol edin.`);
        if (error || !data.user) throw new SourceError(`Supabase girişi başarısız (${cfg.email}): ${error?.message || 'kullanıcı yok'}`);
        userId = data.user.id;
        return userId;
    };

    const resolveTarget = async (): Promise<{ id: string; name?: string; role: UserRole }> => {
        if (target) return target;
        const uid = await signIn();
        let q = client.from('workspace_members').select('workspace_id, role').eq('user_id', uid);
        if (cfg.workspaceId) q = q.eq('workspace_id', cfg.workspaceId);
        const { data, error } = await q;
        if (error) throw new SourceError(`Üyelik okunamadı: ${error.message} (şema güncel mi? supabase/schema.sql)`);
        const rows = (data || []) as { workspace_id: string; role: UserRole }[];
        if (rows.length === 0) {
            throw new SourceError(cfg.workspaceId
                ? `${cfg.email} bu çalışma alanının üyesi değil: ${cfg.workspaceId}`
                : `${cfg.email} hiçbir çalışma alanının üyesi değil. Uygulamadaki Bulut penceresinden çalışma alanı oluşturun ya da üye olun.`);
        }
        if (rows.length > 1) {
            const { data: ws } = await client.from('workspaces').select('id, name').in('id', rows.map(r => r.workspace_id));
            const names = new Map(((ws || []) as { id: string; name: string }[]).map(w => [w.id, w.name]));
            throw new SourceError(`${cfg.email} birden fazla çalışma alanının üyesi; PLANASISTAN_WORKSPACE_ID ile birini seçin: ${rows.map(r => `${r.workspace_id} (${names.get(r.workspace_id) || 'adsız'})`).join(', ')}`);
        }
        target = { id: rows[0].workspace_id, role: rows[0].role };
        return target;
    };

    const load = async (o: { fresh?: boolean } = {}): Promise<LoadedWorkspace> => {
        if (!o.fresh && cache && Date.now() - cache.at < (cfg.ttlMs ?? DEFAULT_TTL_MS)) return cache.loaded;
        const readCore = (id: string) => client.from('workspaces').select('name, core, version').eq('id', id).maybeSingle();
        let t = await resolveTarget();
        let { data, error } = await readCore(t.id);
        if (isAuthError(error)) {
            // Uzun süre açık kalan istemcide oturum düşmüş olabilir: bir kez yeniden giriş
            userId = null;
            target = null;
            t = await resolveTarget();
            ({ data, error } = await readCore(t.id));
        }
        if (error || !data) throw new SourceError(`Çalışma alanı okunamadı: ${error?.message || 'bulunamadı (üyeliğinizi kontrol edin)'}`);
        const { data: rows, error: rErr } = await client.from('workspace_projects').select('project_id, data, version').eq('workspace_id', t.id);
        if (rErr) throw new SourceError(`Projeler okunamadı: ${rErr.message} (şema güncel mi? supabase/schema.sql)`);
        // Yönetici rollerinde RLS bu satırı gizler — notlar boş gelir (tasarım gereği)
        const { data: pData } = await client.from('workspace_private').select('data, version').eq('workspace_id', t.id).maybeSingle();

        const rawCore = (data.core || {}) as Record<string, unknown>;
        const projectRows = ((rows || []) as { project_id: string; data: Project; version: number }[]);
        const ws = mergeWorkspaceDoc(createEmptyWorkspace(), rawCore as Partial<WorkspaceData>, pData?.data as PrivateDoc | undefined, projectRows.map(r => r.data));
        const state: CloudState = {
            workspaceId: t.id,
            workspaceName: data.name as string | undefined,
            rawCore,
            coreVersion: data.version as number,
            projectVersions: Object.fromEntries(projectRows.map(r => [r.project_id, r.version])),
            privateVersion: pData ? (pData.version as number) : undefined,
            legacy: projectRows.length === 0 && Array.isArray(rawCore.projects) && (rawCore.projects as unknown[]).length > 0,
        };
        states.set(ws, state);
        const loaded: LoadedWorkspace = {
            ws,
            memberRole: t.role,
            privateVisible: !!pData,
            label: `Supabase (${new URL(cfg.url).host} · ${state.workspaceName || t.id})`,
            dataAt: new Date().toISOString(),
        };
        cache = { at: Date.now(), loaded };
        return loaded;
    };

    const save = async (before: WorkspaceData, after: WorkspaceData): Promise<void> => {
        const state = states.get(before);
        if (!state) throw new SourceError('Kaydedilecek veri bu oturumda buluttan okunmamış.');
        if (state.legacy) throw new SourceError('Bulut verisi eski biçimde (projeler satırlara taşınmamış). Uygulamadan bir kez senkronize edin, sonra tekrar deneyin.');
        cache = null; // ne olursa olsun bir sonraki okuma buluttan
        const a = splitWorkspaceDoc(before);
        const b = splitWorkspaceDoc(after);
        const prev = new Map(a.projects.map(p => [p.id, contentHash(p)]));
        if (a.projects.some(p => !b.projects.some(q => q.id === p.id))) throw new SourceError('Proje silme MCP üzerinden desteklenmez.');

        for (const p of b.projects) {
            const hash = contentHash(p);
            if (prev.get(p.id) === hash) continue;
            const expected = state.projectVersions[p.id];
            if (expected === undefined) {
                const { error } = await client.from('workspace_projects').insert({ workspace_id: state.workspaceId, project_id: p.id, data: p, version: 1 });
                if (error) {
                    if (error.code === '23505') throw new ConflictError(`"${p.name}" projesi bulutta başkası tarafından da eklenmiş.`);
                    throw new SourceError(`"${p.name}" yazılamadı: ${error.message}`);
                }
                continue;
            }
            const { data, error } = await client.from('workspace_projects')
                .update({ data: p, version: expected + 1 })
                .eq('workspace_id', state.workspaceId).eq('project_id', p.id).eq('version', expected)
                .select('version');
            if (error) throw new SourceError(`"${p.name}" yazılamadı: ${error.message}`);
            if (!data || data.length === 0) throw new ConflictError(`"${p.name}" projesinde bulutta daha yeni bir sürüm var (başka biri az önce değiştirmiş).`);
        }

        if (contentHash(a.core) !== contentHash(b.core)) {
            // Bu sürümün tanımadığı alanlar (daha yeni bir istemcinin yazdıkları) korunur
            const { projects: _legacyProjects, ...known } = state.rawCore;
            void _legacyProjects;
            const { data, error } = await client.from('workspaces')
                .update({ core: { ...known, ...b.core }, version: state.coreVersion + 1 })
                .eq('id', state.workspaceId).eq('version', state.coreVersion)
                .select('version');
            if (error) throw new SourceError(`Çalışma alanı yazılamadı: ${error.message}`);
            if (!data || data.length === 0) throw new ConflictError('Bulutta daha yeni bir sürüm var (başka biri az önce değiştirmiş).');
        }

        if (contentHash(a.privateDoc) !== contentHash(b.privateDoc)) {
            if (state.privateVersion === undefined) throw new SourceError('Notlar ve müşteri istekleri bu rol için yazılamaz.');
            const { data, error } = await client.from('workspace_private')
                .update({ data: b.privateDoc, version: state.privateVersion + 1 })
                .eq('workspace_id', state.workspaceId).eq('version', state.privateVersion)
                .select('version');
            if (error) throw new SourceError(`Notlar yazılamadı: ${error.message}`);
            if (!data || data.length === 0) throw new ConflictError('Notlarda bulutta daha yeni bir sürüm var.');
        }
    };

    return {
        kind: 'supabase',
        readOnlyReason: () => null,
        load,
        save,
    };
};
