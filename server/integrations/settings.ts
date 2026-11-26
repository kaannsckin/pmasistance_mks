import { Env } from '../ai/config.js';
import { decryptSecret, encryptSecret, fileBackend, resolveSettingsStore, SettingsBackend, supabaseBackend } from '../ai/settingsStore.js';

/**
 * Yönetici panelinden girilen entegrasyon ayarları (Jira, Teams, e-posta) — YALNIZ SUNUCUDA.
 *
 * AI ayarlarıyla aynı depo ve şifreleme anahtarı kullanılır (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY → app_settings tablosunda "integrations" satırı, ya da
 * AI_SETTINGS_FILE'ın yanındaki integration-settings.json; AI_CONFIG_SECRET).
 * Panelde girilen değer ortam değişkeninin (.env / planasistan.env / Vercel)
 * üzerine yazılır; boş bırakılan alan ortam değişkenindekini kullanır.
 * Jeton, parola ve webhook şifreli saklanır, tarayıcıya hiç dönmez.
 */

export const INTEGRATION_KEYS = [
    'JIRA_BASE_URL', 'JIRA_TOKEN', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_ALLOWED_PROJECTS', 'JIRA_ALLOW_UPDATE', 'JIRA_ALLOW_CREATE', 'JIRA_STORY_POINTS_FIELD',
    'TEAMS_WEBHOOK_URL', 'SLACK_WEBHOOK_URL', 'NOTION_TOKEN', 'NOTION_PARENT_PAGE_ID',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE', 'NOTIFY_ALLOWED_DOMAINS', 'REPORT_REMINDER_TO',
] as const;
export type IntegrationKey = typeof INTEGRATION_KEYS[number];
export const INTEGRATION_SECRETS: IntegrationKey[] = ['JIRA_TOKEN', 'JIRA_API_TOKEN', 'TEAMS_WEBHOOK_URL', 'SLACK_WEBHOOK_URL', 'NOTION_TOKEN', 'SMTP_PASS'];
export type IntegrationValues = Partial<Record<IntegrationKey, string>>;

const MAX_LEN = 2000;
const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Değer denetimi (kaydetmeden önce): hata metni ya da null */
export const validateIntegration = (v: IntegrationValues): string | null => {
    for (const k of INTEGRATION_KEYS) {
        const x = v[k];
        if (x === undefined) continue;
        if (x.length > MAX_LEN || /[\r\n]/.test(x)) return `${k} geçersiz (tek satır, en çok ${MAX_LEN} karakter).`;
    }
    if (v.JIRA_BASE_URL && !/^https?:\/\/[^\s/]+/i.test(v.JIRA_BASE_URL)) return 'Jira adresi http(s):// ile başlamalı.';
    if (v.TEAMS_WEBHOOK_URL && !/^https:\/\//i.test(v.TEAMS_WEBHOOK_URL)) return 'Teams webhook adresi https:// ile başlamalı.';
    if (v.SLACK_WEBHOOK_URL && !/^https:\/\/hooks\.slack\.com\//i.test(v.SLACK_WEBHOOK_URL)) return 'Slack webhook adresi https://hooks.slack.com/ ile başlamalı.';
    if (v.NOTION_PARENT_PAGE_ID && !/^[0-9a-f]{32}$/i.test(v.NOTION_PARENT_PAGE_ID.replace(/-/g, ''))) return 'Notion sayfa kimliği 32 haneli olmalı (sayfa bağlantısının sonundaki kimlik).';
    if (v.JIRA_ALLOWED_PROJECTS && !/^\s*[A-Za-z][A-Za-z0-9_]{1,19}(\s*,\s*[A-Za-z][A-Za-z0-9_]{1,19})*\s*$/.test(v.JIRA_ALLOWED_PROJECTS)) return 'İzinli Jira projeleri virgülle ayrılmış proje anahtarları olmalı (ör. MKS, MPS).';
    if (v.SMTP_PORT && !/^\d{1,5}$/.test(v.SMTP_PORT)) return 'SMTP portu sayı olmalı.';
    return null;
};

/** Depo: AI ayarlarıyla aynı yer, ayrı kayıt */
export const resolveIntegrationStore = (env: Env, opts: { isDev?: boolean; fetchImpl?: typeof fetch } = {}): { backend?: SettingsBackend; secret?: string; problem?: string } => {
    const r = resolveSettingsStore(env, opts);
    if (!r.store) return { problem: r.problem };
    const supa = clean(env.SUPABASE_URL), service = clean(env.SUPABASE_SERVICE_ROLE_KEY);
    const file = clean(env.AI_SETTINGS_FILE);
    const backend = supa && service
        ? supabaseBackend(supa, service, opts.fetchImpl, 'integrations')
        : fileBackend(file.replace(/[^/\\]+$/, '') + 'integration-settings.json');
    return { backend, secret: r.store.secret };
};

const TTL_MS = 30_000;
let cache: { at: number; values: IntegrationValues; updatedAt?: string } | null = null;
export const invalidateIntegrationCache = (): void => { cache = null; };

export const loadIntegrationSettings = async (backend: SettingsBackend, secret: string): Promise<{ values: IntegrationValues; updatedAt?: string }> => {
    if (cache && Date.now() - cache.at < TTL_MS) return cache;
    const stored = await backend.load() as { values?: Record<string, string>; updatedAt?: string } | null;
    const values: IntegrationValues = {};
    for (const k of INTEGRATION_KEYS) {
        const v = stored?.values?.[k];
        if (typeof v !== 'string' || !v) continue;
        values[k] = INTEGRATION_SECRETS.includes(k) ? await decryptSecret(v, secret) : v;
    }
    cache = { at: Date.now(), values, updatedAt: stored?.updatedAt };
    return cache;
};

export const saveIntegrationSettings = async (backend: SettingsBackend, secret: string, values: IntegrationValues, now = new Date()): Promise<void> => {
    const out: Record<string, string> = {};
    for (const k of INTEGRATION_KEYS) {
        const v = clean(values[k]);
        if (!v) continue;
        out[k] = INTEGRATION_SECRETS.includes(k) ? await encryptSecret(v, secret) : v;
    }
    await backend.save(Object.keys(out).length ? { values: out as never, updatedAt: now.toISOString() } : null);
    invalidateIntegrationCache();
};

/** Panel taslağı: gizli alan gönderilmediyse kayıtlı olan kalır; boş metin silmek demektir */
export const applyIntegrationDraft = (stored: IntegrationValues, raw: unknown): IntegrationValues => {
    const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: IntegrationValues = {};
    for (const k of INTEGRATION_KEYS) {
        if (INTEGRATION_SECRETS.includes(k)) {
            if (typeof v[k] === 'string') { if (clean(v[k])) out[k] = clean(v[k]); }
            else if (stored[k]) out[k] = stored[k];
        } else if (clean(v[k])) out[k] = clean(v[k]);
    }
    return out;
};

/** İstekte kullanılacak ortam: panel ayarları ortam değişkenlerinin üzerine. Depo yoksa ya da okunamazsa ortam aynen kalır. */
export const withIntegrationSettings = async (env: Env, opts: { isDev?: boolean; fetchImpl?: typeof fetch } = {}): Promise<Env> => {
    const { backend, secret } = resolveIntegrationStore(env, opts);
    if (!backend || !secret) return env;
    try {
        const { values } = await loadIntegrationSettings(backend, secret);
        return Object.keys(values).length ? { ...env, ...values } : env;
    } catch (e) {
        console.error('[entegrasyon] panel ayarları okunamadı; ortam değişkenleri kullanılıyor:', (e as Error).message);
        return env;
    }
};

/** Gösterim: gizliler yalnız son 4 hane */
export const maskIntegration = (v: IntegrationValues): IntegrationValues =>
    Object.fromEntries(INTEGRATION_KEYS.flatMap(k => (v[k] ? [[k, INTEGRATION_SECRETS.includes(k) ? `…${v[k]!.slice(-4)}` : v[k]!]] : []))) as IntegrationValues;

export const envIntegrationValues = (env: Env): IntegrationValues =>
    Object.fromEntries(INTEGRATION_KEYS.flatMap(k => (clean(env[k]) ? [[k, clean(env[k])]] : []))) as IntegrationValues;
