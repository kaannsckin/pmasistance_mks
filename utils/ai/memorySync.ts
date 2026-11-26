import {
    maintainMemory, MemoryItem, memoryKeyOf, parseMemoryMarkdown, readMemoryRaw, renderMemoryMarkdown, writeMemoryRaw,
} from './memory';

/**
 * Asistan hafızasının bulut eşitlemesi (Supabase: public.assistant_memory).
 *
 * Satır kullanıcıya özeldir (RLS: yalnız sahibi). Her cihaz son eşitlenen
 * belgeyi "taban" olarak saklar; eşitlemede üç yönlü birleştirme yapılır:
 *   - iki tarafta da duran satır kalır,
 *   - bir tarafta yeni eklenen satır eklenir (iki cihazda ayrı eklenenler ikisi de kalır),
 *   - bir tarafta silinen satır (tabanda var, o tarafta yok) silinir; diğer cihaz onu geri getirmez,
 *   - aynı anahtarlı ("Ana proje: …") iki satırdan yenisi kalır.
 * Buluta yazım sürüm numarasıyla (iyimser kilit) yapılır; araya başka bir
 * cihaz girerse birleştirme yeniden yapılır.
 *
 * Kip: elle ("Şimdi eşitle") ya da otomatik (cihaz ayarı; asistan açılınca ve
 * hafıza değişince). Varsayılan kapalıdır: hafıza kişiseldir, buluta gitmesi
 * kullanıcının seçimidir.
 */

export const MEMORY_SYNC_SETTINGS_KEY = 'PLANASISTAN_AI_MEMORY_SYNC';

export interface MemorySyncSettings {
    auto: boolean;
}

export const loadMemorySyncSettings = (): MemorySyncSettings => {
    try {
        const v = JSON.parse(localStorage.getItem(MEMORY_SYNC_SETTINGS_KEY) || '{}');
        return { auto: v?.auto === true };
    } catch {
        return { auto: false };
    }
};

export const saveMemorySyncSettings = (s: MemorySyncSettings): void => {
    try { localStorage.setItem(MEMORY_SYNC_SETTINGS_KEY, JSON.stringify(s)); } catch { /* yoksay */ }
};

/** Cihazda, hafıza anahtarı ve çalışma alanı başına son eşitleme durumu */
interface SyncState {
    workspaceId: string;
    base: string;
    version: number;
    at: string;
}

const stateKey = (memoryKey: string) => `${memoryKey}:sync`;

export const loadSyncState = (memoryKey: string, workspaceId: string): SyncState | null => {
    try {
        const v = JSON.parse(localStorage.getItem(stateKey(memoryKey)) || 'null') as SyncState | null;
        return v && v.workspaceId === workspaceId && typeof v.base === 'string' ? v : null;
    } catch {
        return null;
    }
};

const saveSyncState = (memoryKey: string, s: SyncState): void => {
    try { localStorage.setItem(stateKey(memoryKey), JSON.stringify(s)); } catch { /* yoksay */ }
};

/** "py:p1" — bulut satırının kimlik anahtarı (uygulamadaki rol + kişi) */
export const identityKeyOf = (memoryKey: string): string => memoryKey.split(':').slice(1).join(':');

// ---------------------------------------------------------------------------
// Üç yönlü birleştirme
// ---------------------------------------------------------------------------

export interface MergeStats {
    added: number;
    removed: number;
}

/**
 * base: son eşitlemedeki belge, local: bu cihaz, remote: bulut. Kimlik satır
 * içeriğinden türediği için satır düzenlemesi "sil + ekle" sayılır.
 */
export const mergeMemory = (base: MemoryItem[], local: MemoryItem[], remote: MemoryItem[], now: Date): { items: MemoryItem[]; fromRemote: MergeStats } => {
    const ids = (xs: MemoryItem[]) => new Set(xs.map(x => x.id));
    const B = ids(base);
    const L = new Map(local.map(x => [x.id, x]));
    const R = new Map(remote.map(x => [x.id, x]));
    const out: MemoryItem[] = [];
    const seen = new Set<string>();
    const keep = (x: MemoryItem) => { if (!seen.has(x.id)) { seen.add(x.id); out.push(x); } };

    for (const x of local) {
        const r = R.get(x.id);
        if (r) {
            // İki tarafta da var: son tarih ve önem birleşir
            keep({ ...x, createdAt: r.createdAt > x.createdAt ? r.createdAt : x.createdAt, ...(x.important || r.important ? { important: true } : {}) });
        } else if (!B.has(x.id)) {
            keep(x); // bu cihazda yeni
        } // tabanda vardı, bulutta yok → başka cihazda silinmiş
    }
    let added = 0;
    for (const r of remote) {
        if (L.has(r.id) || B.has(r.id)) continue; // ortak ya da bu cihazda silinmiş
        keep(r);
        added++;
    }
    const removed = local.filter(x => !R.has(x.id) && B.has(x.id)).length;

    // Aynı anahtarlı satırlardan en yenisi kalır (eşitlikte bu cihazınki)
    const newest = new Map<string, MemoryItem>();
    for (const x of out) {
        if (x.section === 'arsiv') continue;
        const k = memoryKeyOf(x.text);
        if (!k) continue;
        const cur = newest.get(k);
        if (!cur || x.createdAt > cur.createdAt) newest.set(k, x);
    }
    const items = out.filter(x => {
        if (x.section === 'arsiv') return true;
        const k = memoryKeyOf(x.text);
        return !k || newest.get(k)?.id === x.id;
    });
    return { items: maintainMemory(items, now), fromRemote: { added, removed } };
};

// ---------------------------------------------------------------------------
// Eşitleme
// ---------------------------------------------------------------------------

export interface MemoryRemote {
    get: () => Promise<{ content: string; version: number } | null>;
    insert: (content: string) => Promise<{ ok: true; version: number } | { ok: false; conflict: boolean; error?: string }>;
    /** expectedVersion eşleşirse yazar; eşleşmezse conflict */
    update: (content: string, expectedVersion: number) => Promise<{ ok: true; version: number } | { ok: false; conflict: boolean; error?: string }>;
}

export interface MemorySyncResult {
    ok: boolean;
    /** Buluttan gelen yeni satır ve buluttaki silmeyle düşen satır sayısı */
    pulled: number;
    removed: number;
    /** Buluta yazıldı mı */
    pushed: boolean;
    at?: string;
    error?: string;
}

export class MemorySyncError extends Error {}

export const syncMemory = async (memoryKey: string, workspaceId: string, remote: MemoryRemote, now: () => Date = () => new Date()): Promise<MemorySyncResult> => {
    try {
        return await syncOnce(memoryKey, workspaceId, remote, now);
    } catch (e) {
        const msg = e instanceof MemorySyncError ? e.message : (e as Error)?.message ? `Bulut hafızası eşitlenemedi: ${(e as Error).message}` : 'Bulut hafızası eşitlenemedi.';
        return { ok: false, pulled: 0, removed: 0, pushed: false, error: msg };
    }
};

const syncOnce = async (memoryKey: string, workspaceId: string, remote: MemoryRemote, now: () => Date): Promise<MemorySyncResult> => {
    for (let attempt = 0; attempt < 3; attempt++) {
        const today = now().toISOString().slice(0, 10);
        const state = loadSyncState(memoryKey, workspaceId);
        const localMd = readMemoryRaw(memoryKey) || '';
        const cloud = await remote.get();
        const base = parseMemoryMarkdown(state?.base || '', today);
        const local = parseMemoryMarkdown(localMd, today);
        const remoteItems = parseMemoryMarkdown(cloud?.content || '', today);
        const { items, fromRemote } = mergeMemory(base, local, remoteItems, now());
        const merged = renderMemoryMarkdown(items);

        let version = cloud?.version ?? 0;
        let pushed = false;
        const remoteSame = !!cloud && renderMemoryMarkdown(maintainMemory(remoteItems, now())) === merged;
        if (!remoteSame) {
            const r = cloud ? await remote.update(merged, cloud.version) : await remote.insert(merged);
            if ('conflict' in r) {
                if (r.conflict) continue; // başka cihaz araya girdi: yeniden oku ve birleştir
                return { ok: false, pulled: 0, removed: 0, pushed: false, error: r.error || 'Bulut hafızası yazılamadı.' };
            }
            version = 'version' in r ? r.version : version;
            pushed = true;
        }
        // Yerel belge yalnız değiştiyse yazılır; olay yayınlanmaz (otomatik eşitleme döngüsü olmasın)
        if (renderMemoryMarkdown(maintainMemory(local, now())) !== merged) writeMemoryRaw(memoryKey, merged, false);
        const at = now().toISOString();
        saveSyncState(memoryKey, { workspaceId, base: merged, version, at });
        return { ok: true, pulled: fromRemote.added, removed: fromRemote.removed, pushed, at };
    }
    return { ok: false, pulled: 0, removed: 0, pushed: false, error: 'Hafıza aynı anda başka bir cihazda değişiyor; biraz sonra tekrar deneyin.' };
};

// ---------------------------------------------------------------------------
// Supabase bağdaştırıcısı
// ---------------------------------------------------------------------------

interface SupabaseLike {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const MEMORY_SCHEMA_MESSAGE = 'Bulutta asistan hafızası tablosu yok. Supabase SQL Editor\'da supabase/schema.sql dosyasını yeniden çalıştırın.';

const isMissingTable = (e: { code?: string; message?: string } | null | undefined): boolean =>
    !!e && (e.code === '42P01' || e.code === 'PGRST205' || /assistant_memory/.test(e.message || '') && /does not exist|not find|schema cache/i.test(e.message || ''));

const errText = (e: { code?: string; message?: string }): string => (isMissingTable(e) ? MEMORY_SCHEMA_MESSAGE : e.message || 'Bulut hatası.');

export const supabaseMemoryRemote = (client: SupabaseLike, workspaceId: string, userId: string, identityKey: string): MemoryRemote => {
    const row = () => client.from('assistant_memory');
    return {
        get: async () => {
            const { data, error } = await row().select('content, version').eq('workspace_id', workspaceId).eq('user_id', userId).eq('identity_key', identityKey).maybeSingle();
            if (error) throw new MemorySyncError(errText(error));
            return data ? { content: String(data.content || ''), version: Number(data.version) || 0 } : null;
        },
        insert: async content => {
            const { error } = await row().insert({ workspace_id: workspaceId, user_id: userId, identity_key: identityKey, content, version: 1 });
            if (!error) return { ok: true, version: 1 };
            return { ok: false, conflict: error.code === '23505', error: errText(error) };
        },
        update: async (content, expected) => {
            const { data, error } = await row().update({ content, version: expected + 1 })
                .eq('workspace_id', workspaceId).eq('user_id', userId).eq('identity_key', identityKey).eq('version', expected).select('version');
            if (error) return { ok: false, conflict: false, error: errText(error) };
            return Array.isArray(data) && data.length ? { ok: true, version: expected + 1 } : { ok: false, conflict: true };
        },
    };
};
