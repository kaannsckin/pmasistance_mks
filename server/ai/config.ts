import { AiAuthMode } from '../../utils/ai/protocol.js';

/**
 * AI proxy yapılandırması — YALNIZCA sunucu ortam değişkenlerinden okunur.
 * Hiçbir değer tarayıcı paketine girmez (bkz. docs/AI_KURULUM.md).
 */

export type AiProvider = 'openai' | 'azure' | 'anthropic' | 'gemini';

export const AI_PROVIDERS: AiProvider[] = ['openai', 'azure', 'anthropic', 'gemini'];

export interface AiConfig {
    provider: AiProvider;
    apiKey: string;
    model: string;
    baseUrl: string;
    maxOutputTokens: number;
    temperature?: number;
    timeoutMs: number;
    authMode: AiAuthMode;
    accessToken?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    allowedOrigins: string[];
    rateLimitPerMin: number;
}

export type Env = Record<string, string | undefined>;

export interface ConfigResult {
    config?: AiConfig;
    /** Eksik/hatalı yapılandırmanın Türkçe açıklaması (anahtar değeri içermez) */
    problem?: string;
    authMode: AiAuthMode;
    provider?: AiProvider;
    model?: string;
}

const DEFAULT_BASE_URLS: Record<AiProvider, string | undefined> = {
    openai: 'https://api.openai.com/v1',
    azure: undefined, // kaynağa özel: https://KAYNAK.openai.azure.com/openai/v1
    anthropic: 'https://api.anthropic.com',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

const clean = (v: string | undefined): string | undefined => {
    const t = v?.trim();
    return t ? t : undefined;
};

const positiveInt = (v: string | undefined, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const resolveAuthMode = (env: Env, isDev: boolean): { mode: AiAuthMode; problem?: string } => {
    const explicit = clean(env.AI_AUTH_MODE)?.toLowerCase();
    const hasToken = !!clean(env.AI_ACCESS_TOKEN);
    const hasSupabase = !!clean(env.SUPABASE_URL) && !!clean(env.SUPABASE_ANON_KEY);

    if (explicit) {
        if (explicit === 'none') return { mode: 'none' };
        if (explicit === 'token') {
            return hasToken ? { mode: 'token' } : { mode: 'token', problem: 'AI_AUTH_MODE=token için AI_ACCESS_TOKEN tanımlanmalı.' };
        }
        if (explicit === 'supabase') {
            return hasSupabase
                ? { mode: 'supabase' }
                : { mode: 'supabase', problem: 'AI_AUTH_MODE=supabase için SUPABASE_URL ve SUPABASE_ANON_KEY tanımlanmalı.' };
        }
        return { mode: 'none', problem: `Geçersiz AI_AUTH_MODE: "${explicit}" (none | token | supabase).` };
    }
    if (hasToken) return { mode: 'token' };
    if (hasSupabase) return { mode: 'supabase' };
    // Yerel geliştirmede koruma gerekmez; yayında açık uç bırakılmaz (anahtar kotası herkese açılırdı).
    if (isDev) return { mode: 'none' };
    return {
        mode: 'none',
        problem: 'AI erişim koruması yapılandırılmamış: AI_ACCESS_TOKEN ya da SUPABASE_URL + SUPABASE_ANON_KEY tanımlayın (yalnızca kurum içi ağda AI_AUTH_MODE=none kullanılabilir).',
    };
};

export const readAiConfig = (env: Env, opts: { isDev?: boolean } = {}): ConfigResult => {
    const isDev = !!opts.isDev;
    const auth = resolveAuthMode(env, isDev);

    const providerRaw = (clean(env.AI_PROVIDER) || 'openai').toLowerCase();
    if (!AI_PROVIDERS.includes(providerRaw as AiProvider)) {
        return { authMode: auth.mode, problem: `Geçersiz AI_PROVIDER: "${providerRaw}" (${AI_PROVIDERS.join(' | ')}).` };
    }
    const provider = providerRaw as AiProvider;
    const model = clean(env.AI_MODEL)?.replace(/^models\//, '');
    const base = { authMode: auth.mode, provider, model };

    const apiKey = clean(env.AI_API_KEY);
    if (!apiKey) return { ...base, problem: 'AI_API_KEY tanımlı değil.' };
    if (!model) return { ...base, problem: 'AI_MODEL tanımlı değil.' };

    const baseUrl = (clean(env.AI_BASE_URL) || DEFAULT_BASE_URLS[provider])?.replace(/\/+$/, '');
    if (!baseUrl) return { ...base, problem: `${provider} sağlayıcısı için AI_BASE_URL tanımlanmalı.` };
    if (!/^https?:\/\//i.test(baseUrl)) return { ...base, problem: 'AI_BASE_URL http(s):// ile başlamalı.' };

    if (auth.problem) return { ...base, problem: auth.problem };

    const temperature = clean(env.AI_TEMPERATURE) !== undefined ? Number(env.AI_TEMPERATURE) : undefined;

    return {
        ...base,
        config: {
            provider,
            apiKey,
            model,
            baseUrl,
            maxOutputTokens: positiveInt(env.AI_MAX_OUTPUT_TOKENS, 4096),
            temperature: temperature !== undefined && Number.isFinite(temperature) ? temperature : undefined,
            timeoutMs: positiveInt(env.AI_TIMEOUT_MS, 55_000), // Vercel maxDuration (60 sn) dolmadan düzgün hata verilsin
            authMode: auth.mode,
            accessToken: clean(env.AI_ACCESS_TOKEN),
            supabaseUrl: clean(env.SUPABASE_URL)?.replace(/\/+$/, ''),
            supabaseAnonKey: clean(env.SUPABASE_ANON_KEY),
            allowedOrigins: (clean(env.AI_ALLOWED_ORIGINS) || '')
                .split(',')
                .map(s => s.trim().replace(/\/+$/, ''))
                .filter(Boolean),
            rateLimitPerMin: positiveInt(env.AI_RATE_LIMIT_PER_MIN, 20),
        },
    };
};
