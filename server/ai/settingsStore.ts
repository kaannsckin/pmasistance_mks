import { Env } from './config.js';

/**
 * Yönetici panelinden girilen AI bağlantı ayarları — YALNIZ SUNUCUDA.
 *
 * Ayarlar ortam değişkenleriyle aynı adları taşır (AI_PROVIDER, AI_MODEL…) ve
 * okunurken ortam değişkenlerinin üzerine yazılır; boş bırakılan alan ortam
 * değişkenindeki değeri kullanır. API anahtarları AI_CONFIG_SECRET'tan türetilen
 * anahtarla AES-GCM ile şifrelenip saklanır; tarayıcıya hiçbir zaman dönmez
 * (yalnız "kayıtlı · son 4 hane" bilgisi).
 *
 * Depo:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → app_settings tablosu (RLS açık,
 *     politika yok: yalnız sunucu erişir; bkz. supabase/schema.sql)
 *   AI_SETTINGS_FILE → dosya (yerel geliştirmede vite.config varsayılanı .planasistan/ai-settings.json)
 * Erişim koruması, hız sınırı, köken listesi gibi güvenlik ayarları panelden
 * değiştirilemez; yalnız ortam değişkenidir.
 */

/** Panelden değiştirilebilen ayarlar (ortam değişkeni adlarıyla) */
export const EDITABLE_KEYS = [
    'AI_PROVIDER', 'AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY', 'AI_TEMPERATURE', 'AI_MAX_OUTPUT_TOKENS', 'AI_REASONING_EFFORT', 'AI_EXTRA_BODY',
    'AI_EMBEDDING_MODEL', 'AI_EMBEDDING_PROVIDER', 'AI_EMBEDDING_BASE_URL', 'AI_EMBEDDING_API_KEY',
] as const;
export type EditableKey = typeof EDITABLE_KEYS[number];
export const SECRET_KEYS: EditableKey[] = ['AI_API_KEY', 'AI_EMBEDDING_API_KEY'];

/** Depoda tutulan biçim: gizli alanlar şifreli */
export interface StoredAiSettings {
    values: Partial<Record<EditableKey, string>>;
    updatedAt: string;
}

export interface SettingsBackend {
    kind: 'supabase' | 'file';
    load(): Promise<StoredAiSettings | null>;
    save(s: StoredAiSettings | null): Promise<void>;
}

// ---------------------------------------------------------------- şifreleme (AES-256-GCM)

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

const keyFor = async (secret: string): Promise<CryptoKey> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`planasistan-ai-settings:${secret}`));
    return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export const encryptSecret = async (plain: string, secret: string): Promise<string> => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(secret), new TextEncoder().encode(plain)));
    return `v1:${b64(iv)}:${b64(ct)}`;
};

export const decryptSecret = async (enc: string, secret: string): Promise<string> => {
    const [v, iv, ct] = enc.split(':');
    if (v !== 'v1' || !iv || !ct) throw new Error('Şifreli değer tanınmadı.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await keyFor(secret), unb64(ct));
    return new TextDecoder().decode(plain);
};

// ---------------------------------------------------------------- depolar

const clean = (v: string | undefined) => v?.trim() || undefined;

export const supabaseBackend = (url: string, serviceKey: string, fetchImpl: typeof fetch = fetch): SettingsBackend => {
    const base = `${url.replace(/\/+$/, '')}/rest/v1/app_settings`;
    const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };
    const fail = async (res: Response, what: string) => {
        const t = await res.text().catch(() => '');
        throw new Error(`Ayar deposu ${what} (HTTP ${res.status})${/app_settings/.test(t) || res.status === 404 ? ': app_settings tablosu kurulu mu? (supabase/schema.sql)' : ''}.`);
    };
    return {
        kind: 'supabase',
        async load() {
            const res = await fetchImpl(`${base}?id=eq.ai&select=data`, { headers });
            if (!res.ok) await fail(res, 'okunamadı');
            const rows = await res.json() as { data?: StoredAiSettings }[];
            return rows[0]?.data || null;
        },
        async save(s) {
            const res = s
                ? await fetchImpl(base, { method: 'POST', headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'ai', data: s }) })
                : await fetchImpl(`${base}?id=eq.ai`, { method: 'DELETE', headers });
            if (!res.ok) await fail(res, 'yazılamadı');
        },
    };
};

export const fileBackend = (path: string): SettingsBackend => ({
    kind: 'file',
    async load() {
        const fs = await import('node:fs/promises');
        try { return JSON.parse(await fs.readFile(path, 'utf8')) as StoredAiSettings; } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw new Error('Ayar dosyası okunamadı.');
        }
    },
    async save(s) {
        const fs = await import('node:fs/promises');
        const { dirname } = await import('node:path');
        if (!s) { await fs.rm(path, { force: true }); return; }
        await fs.mkdir(dirname(path), { recursive: true });
        await fs.writeFile(path, JSON.stringify(s, null, 2), { mode: 0o600 });
    },
});

/** Yerel geliştirmede AI_CONFIG_SECRET yoksa kullanılan anahtar (yayında kullanılmaz) */
const DEV_SECRET = 'planasistan-yerel-gelistirme';

export interface SettingsStore {
    backend: SettingsBackend;
    secret: string;
}

/** Kalıcı depo ve şifreleme anahtarı; kurulmamışsa nedeni */
export const resolveSettingsStore = (env: Env, opts: { isDev?: boolean; fetchImpl?: typeof fetch } = {}): { store?: SettingsStore; problem?: string } => {
    const secret = clean(env.AI_CONFIG_SECRET) || (opts.isDev ? DEV_SECRET : undefined);
    const supa = clean(env.SUPABASE_URL), service = clean(env.SUPABASE_SERVICE_ROLE_KEY);
    const file = clean(env.AI_SETTINGS_FILE);
    const backend = supa && service ? supabaseBackend(supa, service, opts.fetchImpl) : file ? fileBackend(file) : undefined;
    if (!backend) return { problem: 'Panelden ayar için sunucuda kalıcı depo gerekir: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ya da kendi sunucunuzda AI_SETTINGS_FILE).' };
    if (!secret) return { problem: 'Anahtarların şifrelenmesi için sunucuda AI_CONFIG_SECRET tanımlanmalı (en az 32 karakter rastgele değer).' };
    if (!opts.isDev && secret.length < 16) return { problem: 'AI_CONFIG_SECRET en az 16 karakter olmalı.' };
    return { store: { backend, secret } };
};

// ---------------------------------------------------------------- okuma (önbellekli)

const TTL_MS = 30_000;
let cache: { key: string; at: number; values: Partial<Record<EditableKey, string>>; updatedAt?: string } | null = null;

export const invalidateSettingsCache = (): void => { cache = null; };

/** Depodaki ayarlar, gizli alanlar çözülmüş */
export const loadSettings = async (store: SettingsStore): Promise<{ values: Partial<Record<EditableKey, string>>; updatedAt?: string }> => {
    const key = `${store.backend.kind}`;
    if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache;
    const stored = await store.backend.load();
    const values: Partial<Record<EditableKey, string>> = {};
    for (const k of EDITABLE_KEYS) {
        const v = stored?.values?.[k];
        if (typeof v !== 'string' || !v) continue;
        values[k] = SECRET_KEYS.includes(k) ? await decryptSecret(v, store.secret) : v;
    }
    cache = { key, at: Date.now(), values, updatedAt: stored?.updatedAt };
    return cache;
};

/** Ayarları kaydeder; gizli alanlar şifrelenir. Boş değer alanı ortam değişkenine bırakır. */
export const saveSettings = async (store: SettingsStore, values: Partial<Record<EditableKey, string>> | null, now = new Date()): Promise<void> => {
    if (!values || !Object.keys(values).length) {
        await store.backend.save(null);
    } else {
        const out: StoredAiSettings['values'] = {};
        for (const k of EDITABLE_KEYS) {
            const v = values[k]?.trim();
            if (!v) continue;
            out[k] = SECRET_KEYS.includes(k) ? await encryptSecret(v, store.secret) : v;
        }
        await store.backend.save(Object.keys(out).length ? { values: out, updatedAt: now.toISOString() } : null);
    }
    invalidateSettingsCache();
};

/**
 * İstekte kullanılacak ortam: panel ayarları ortam değişkenlerinin üzerine yazılır.
 * Depo yoksa ya da okunamazsa ortam değişkenleri olduğu gibi kullanılır.
 */
export const effectiveEnv = async (env: Env, opts: { isDev?: boolean; fetchImpl?: typeof fetch } = {}): Promise<{ env: Env; source: 'panel' | 'env'; problem?: string }> => {
    const { store } = resolveSettingsStore(env, opts);
    if (!store) return { env, source: 'env' };
    try {
        const { values } = await loadSettings(store);
        if (!Object.keys(values).length) return { env, source: 'env' };
        return { env: { ...env, ...values }, source: 'panel' };
    } catch (e) {
        console.error('[ai] panel ayarları okunamadı; ortam değişkenleri kullanılıyor:', (e as Error).message);
        return { env, source: 'env', problem: 'Panel ayarları okunamadı; ortam değişkenleri kullanılıyor.' };
    }
};

/** Gizli değerin kullanıcıya gösterilen izi: yalnız son 4 karakter */
export const secretHint = (v: string | undefined): string | undefined => (v ? `…${v.slice(-4)}` : undefined);
