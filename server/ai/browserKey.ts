import { BROWSER_BASE_URL_HEADER, BROWSER_KEY_HEADER, BROWSER_MODEL_HEADER, BROWSER_PROVIDER_HEADER, LEGACY_BROWSER_KEY_HEADER } from '../../utils/ai/protocol.js';
import { AiProvider, Env, resolveAuthMode } from './config.js';
import { GEMINI_BASE_URL } from './gemini.js';

/**
 * Tarayıcıdaki AI bağlantısı: yönetici konsolunda "Bu tarayıcıda kullan" ile
 * girilen sağlayıcı, model ve API anahtarı yalnız o tarayıcıda (24 saat)
 * saklanır ve AI isteklerinde x-ai-* başlıklarıyla gelir. Sunucuda hiçbir ek
 * ayar gerekmez: o istek için sunucu ayarı yerine bu bağlantı kullanılır,
 * sunucudaki anahtar kullanılmaz.
 *
 * Adresler sabittir (Gemini, OpenAI, Anthropic); yalnız Azure'da kaynağa özel
 * *.openai.azure.com adresi verilebilir — başlıkla başka bir adrese istek
 * gönderilemez. Hız sınırı ve izinli kökenler aynen geçerlidir; sunucuda erişim
 * koruması (AI_ACCESS_TOKEN / Supabase) tanımlıysa o da geçerlidir. Tanımlı
 * değilse koruma aranmaz: istek kurumun değil, isteği gönderenin anahtarıyla
 * gider. Kurum kapatmak isterse: AI_ALLOW_BROWSER_KEY=0.
 */

export const browserKeyAllowed = (env: Env): boolean =>
    !/^(0|false|no|off|hayır|hayir)$/i.test(env.AI_ALLOW_BROWSER_KEY?.trim() || '');

/** API anahtarı biçimi (başlıkta yalnız URL güvenli karakterler) */
const KEY_PATTERN = /^[A-Za-z0-9_.-]{20,200}$/;
const MODEL_PATTERN = /^[A-Za-z0-9_.:/-]{1,120}$/;
/** Azure OpenAI kaynağı: https://KAYNAK.openai.azure.com[/yol] */
const AZURE_PATTERN = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.openai\.azure\.com(\/[A-Za-z0-9._/-]*)?$/;

export const BROWSER_PROVIDERS: AiProvider[] = ['gemini', 'openai', 'anthropic', 'azure'];

const FIXED_BASE_URLS: Partial<Record<AiProvider, string>> = {
    gemini: GEMINI_BASE_URL,
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
};

const WHERE = 'Yönetici konsolu › Yapay zekâ';

export interface BrowserConnection {
    provider: AiProvider;
    key: string;
    model?: string;
    baseUrl?: string;
}

/** İstekteki bağlantı; başlık yoksa boş, kullanılamıyorsa nedeni */
export const readBrowserKey = (request: Request, env: Env): { conn?: BrowserConnection; problem?: string } => {
    const h = (name: string) => request.headers.get(name)?.trim() || '';
    const key = h(BROWSER_KEY_HEADER) || h(LEGACY_BROWSER_KEY_HEADER);
    if (!key) return {};
    if (!browserKeyAllowed(env)) return { problem: `Bu sunucuda tarayıcı bağlantısı kapalı (AI_ALLOW_BROWSER_KEY=0); bağlantıyı ${WHERE} bölümünden kaldırın.` };
    if (!KEY_PATTERN.test(key)) return { problem: `Bu tarayıcıdaki API anahtarı geçersiz biçimde; ${WHERE} bölümünden yeniden girin.` };
    const provider = (h(BROWSER_PROVIDER_HEADER) || 'gemini').toLowerCase() as AiProvider;
    if (!BROWSER_PROVIDERS.includes(provider)) return { problem: `Bu tarayıcıdaki sağlayıcı tanınmadı; ${WHERE} bölümünden yeniden girin.` };
    const model = h(BROWSER_MODEL_HEADER).replace(/^models\//, '');
    if (model && !MODEL_PATTERN.test(model)) return { problem: `Bu tarayıcıdaki model adı geçersiz; ${WHERE} bölümünden yeniden girin.` };
    if (!model && provider !== 'gemini') return { problem: `Bu tarayıcıdaki bağlantıda model adı eksik; ${WHERE} bölümünden girin.` };
    if (provider === 'azure') {
        const baseUrl = h(BROWSER_BASE_URL_HEADER).replace(/\/+$/, '');
        if (!AZURE_PATTERN.test(baseUrl)) return { problem: `Azure adresi https://KAYNAK.openai.azure.com/openai/v1 biçiminde olmalı; ${WHERE} bölümünden düzeltin.` };
        return { conn: { provider, key, model, baseUrl } };
    }
    return { conn: { provider, key, model: model || undefined } };
};

/** Sağlayıcıya özgü üretim ayarları ve kurumun embedding ayarları taşınmaz */
const DROP = [
    'AI_TEMPERATURE', 'AI_MAX_OUTPUT_TOKENS', 'AI_REASONING_EFFORT', 'AI_EXTRA_BODY', 'GEMINI_API_KEY',
    'AI_EMBEDDING_MODEL', 'AI_EMBEDDING_PROVIDER', 'AI_EMBEDDING_BASE_URL', 'AI_EMBEDDING_API_KEY', 'AI_EMBEDDING_DIMENSIONS',
];

/** Sunucu ortamı + tarayıcı bağlantısı → yalnız bu istek için yapılandırma (metin: Gemini anahtarı) */
export const browserKeyEnv = (env: Env, input: BrowserConnection | string): Env => {
    const conn: BrowserConnection = typeof input === 'string' ? { provider: 'gemini', key: input } : input;
    const next: Env = { ...env };
    for (const k of DROP) delete next[k];
    Object.assign(next, {
        AI_PROVIDER: conn.provider,
        AI_BASE_URL: conn.provider === 'azure' ? conn.baseUrl : FIXED_BASE_URLS[conn.provider],
        AI_API_KEY: conn.key,
        AI_MODEL: conn.model || (conn.provider === 'gemini' ? 'auto' : ''),
    });
    // Anlamsal arama: Gemini ve OpenAI'de aynı anahtarla; Anthropic ve Azure'da anahtar kelime araması
    if (conn.provider === 'gemini') Object.assign(next, { AI_EMBEDDING_PROVIDER: 'gemini', AI_EMBEDDING_BASE_URL: GEMINI_BASE_URL, AI_EMBEDDING_API_KEY: conn.key, AI_EMBEDDING_MODEL: 'auto' });
    if (conn.provider === 'openai') Object.assign(next, { AI_EMBEDDING_PROVIDER: 'openai', AI_EMBEDDING_BASE_URL: FIXED_BASE_URLS.openai, AI_EMBEDDING_API_KEY: conn.key, AI_EMBEDDING_MODEL: 'text-embedding-3-small' });
    // Sunucuda erişim koruması tanımlı değilse aranmaz: istek gönderenin kendi anahtarıyla gider
    if (resolveAuthMode(env, false).problem && !env.AI_AUTH_MODE?.trim()) next.AI_AUTH_MODE = 'none';
    return next;
};

/** Durum açıklamasına bağlantının nerede olduğu eklenir (sunucu ayarı sanılmasın) */
export const browserKeyProblem = (problem: string): string =>
    `Bu tarayıcıdaki AI bağlantısı: ${problem.replace(/\.?$/, '.')} Bağlantıyı ${WHERE} bölümünden değiştirin ya da kaldırın.`;
