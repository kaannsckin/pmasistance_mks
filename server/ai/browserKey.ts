import { BROWSER_KEY_HEADER } from '../../utils/ai/protocol.js';
import { Env } from './config.js';
import { GEMINI_BASE_URL } from './gemini.js';

/**
 * Tarayıcıdaki Gemini test anahtarı: yönetici konsolunda "Bu tarayıcıda kullan"
 * ile girilen Google AI Studio anahtarı yalnız o tarayıcıda saklanır ve AI
 * isteklerinde x-gemini-api-key başlığıyla gelir. Sunucuda hiçbir ek ayar
 * gerekmez: o istek için sağlayıcı Gemini'ye, model ve anlamsal arama anahtarın
 * model listesinden otomatik seçilene çevrilir. Adres sabittir
 * (generativelanguage.googleapis.com) — başlıkla başka adrese istek
 * gönderilemez; sunucudaki anahtar kullanılmaz. Erişim koruması, hız sınırı ve
 * izinli kökenler aynen geçerlidir. Kurum kapatmak isterse: AI_ALLOW_BROWSER_KEY=0.
 */

export const browserKeyAllowed = (env: Env): boolean =>
    !/^(0|false|no|off|hayır|hayir)$/i.test(env.AI_ALLOW_BROWSER_KEY?.trim() || '');

/** Google API anahtarı biçimi (başlıkta yalnız URL güvenli karakterler) */
const KEY_PATTERN = /^[A-Za-z0-9_.-]{20,200}$/;

const WHERE = 'Yönetici konsolu › Yapay zekâ';

/** İstekteki anahtar; başlık yoksa boş, kullanılamıyorsa nedeni */
export const readBrowserKey = (request: Request, env: Env): { key?: string; problem?: string } => {
    const raw = request.headers.get(BROWSER_KEY_HEADER)?.trim();
    if (!raw) return {};
    if (!browserKeyAllowed(env)) return { problem: `Bu sunucuda tarayıcıdaki Gemini test anahtarı kapalı (AI_ALLOW_BROWSER_KEY=0); anahtarı ${WHERE} bölümünden kaldırın.` };
    if (!KEY_PATTERN.test(raw)) return { problem: `Bu tarayıcıdaki Gemini test anahtarı geçersiz biçimde; ${WHERE} bölümünden yeniden girin.` };
    return { key: raw };
};

/** Sağlayıcıya özgü üretim ayarları Gemini'ye taşınmaz (Gemini varsayılanları kullanılır) */
const DROP = ['AI_TEMPERATURE', 'AI_MAX_OUTPUT_TOKENS', 'AI_REASONING_EFFORT', 'AI_EXTRA_BODY', 'AI_EMBEDDING_DIMENSIONS', 'GEMINI_API_KEY'];

/** Sunucu ortamı + tarayıcı anahtarı → yalnız bu istek için Gemini yapılandırması */
export const browserKeyEnv = (env: Env, key: string): Env => {
    const next: Env = {
        ...env,
        AI_PROVIDER: 'gemini', AI_BASE_URL: GEMINI_BASE_URL, AI_API_KEY: key, AI_MODEL: 'auto',
        AI_EMBEDDING_PROVIDER: 'gemini', AI_EMBEDDING_BASE_URL: GEMINI_BASE_URL, AI_EMBEDDING_API_KEY: key, AI_EMBEDDING_MODEL: 'auto',
    };
    for (const k of DROP) delete next[k];
    return next;
};

/** Durum açıklamasına anahtarın nerede olduğu eklenir (sunucu ayarı sanılmasın) */
export const browserKeyProblem = (problem: string): string =>
    `Bu tarayıcıdaki Gemini test anahtarı: ${problem.replace(/\.?$/, '.')} Anahtarı ${WHERE} bölümünden değiştirin ya da kaldırın.`;
