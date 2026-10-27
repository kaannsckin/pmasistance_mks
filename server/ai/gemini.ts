import { Env } from './config.js';
import { describeNetworkError, upstreamFetch } from './tls.js';

/**
 * Google Gemini API (Google AI Studio anahtarı) ile "yalnız anahtar" kurulum.
 *
 * Google AI Studio'da (aistudio.google.com → Get API key → Create API key)
 * alınan anahtar yeterlidir:
 *   - GEMINI_API_KEY ortam değişkeni tek başına tanımlıysa sağlayıcı gemini
 *     olur (Google SDK'larının kullandığı ad);
 *   - model verilmemişse anahtarla model listesi (GET {base}/models) alınır ve
 *     en güncel kararlı Flash modeli seçilir; embedding modeli verilmemişse
 *     Gemini embedding modeli seçilir (anlamsal arama da hazır olur).
 * Model adları sık değiştiği için koda sabitlenmez; liste 1 saat önbellekte.
 * İstekler x-goog-api-key başlığıyla, generativelanguage.googleapis.com/v1beta'ya gider.
 */

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
/** Otomatik seçilen embedding'de vektör boyutu (dizin küçük kalsın) */
export const GEMINI_AUTO_DIMENSIONS = '768';

export interface GeminiModel {
    id: string;
    methods: string[];
}

const clean = (v: string | undefined) => v?.trim() || undefined;

/** GEMINI_API_KEY → AI_API_KEY (+ sağlayıcı gemini), başka anahtar yoksa. GOOGLE_API_KEY başka Google servisleri için olabileceğinden kullanılmaz. */
export const geminiKeyAlias = (env: Env): Env => {
    if (clean(env.AI_API_KEY)) return env;
    const key = clean(env.GEMINI_API_KEY);
    if (!key) return env;
    const provider = clean(env.AI_PROVIDER)?.toLowerCase();
    if (provider && provider !== 'gemini') return env;
    return { ...env, AI_PROVIDER: 'gemini', AI_API_KEY: key };
};

const version = (s: string) => s.split('.').map(Number);
const newer = (a: string, b: string) => {
    const x = version(a), y = version(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
};

/** Kararlı "gemini-X.Y-<tür>" modelleri, sürüm başına bir tane (son ekli -001 yerine eksizi), yeniden eskiye */
const stableByVersion = (ids: string[], kind: string): string[] => {
    const re = new RegExp(`^gemini-(\\d+(?:\\.\\d+)?)-${kind}(-\\d{3})?$`);
    const best = new Map<string, { id: string; suffix: boolean }>();
    for (const id of ids) {
        const hit = re.exec(id);
        if (!hit) continue;
        const cur = best.get(hit[1]);
        if (!cur || (cur.suffix && !hit[2])) best.set(hit[1], { id, suffix: !!hit[2] });
    }
    return [...best.entries()].sort((a, b) => (newer(a[0], b[0]) ? -1 : newer(b[0], a[0]) ? 1 : 0)).map(([, v]) => v.id);
};

/**
 * Sohbet modelleri tercih sırasıyla. İlki otomatik seçilen: en yüksek sürümlü
 * kararlı "gemini-X.Y-flash" (önizleme, lite, görüntü / ses / canlı türevleri
 * hariç); yoksa gemini-flash-latest; yoksa önizleme olmayan herhangi bir Flash;
 * yoksa genel amaçlı bir Gemini modeli. Sonrakiler model yoğunken ya da kotası
 * dolduğunda denenen yedeklerdir (her modelin kapasitesi ve ücretsiz kotası
 * ayrıdır): daha eski kararlı Flash'lar, sonra kararlı Flash-Lite'lar.
 */
export const rankGeminiChatModels = (models: GeminiModel[]): string[] => {
    const chat = models.filter(m => m.methods.includes('generateContent') && m.id.startsWith('gemini')).map(m => m.id);
    const NOT_GENERAL = /(preview|exp|lite|image|tts|audio|live|thinking|vision|robotics|computer|native)/;
    const flash = stableByVersion(chat, 'flash');
    const lite = stableByVersion(chat, 'flash-lite');
    const general = [
        chat.find(id => id === 'gemini-flash-latest'),
        chat.find(id => /flash/.test(id) && !NOT_GENERAL.test(id)),
        chat.find(id => !NOT_GENERAL.test(id)),
    ];
    // gemini-flash-latest çoğunlukla en yeni Flash'ı gösterir; yedek olarak sürümlü modellerden sonra gelir
    const ordered = flash.length ? [...flash, ...lite, ...general, chat[0]] : [...general, ...lite, chat[0]];
    return [...new Set(ordered.filter((id): id is string => !!id))];
};

export const pickGeminiChatModel = (models: GeminiModel[]): string | undefined => rankGeminiChatModels(models)[0];

/** Embedding modeli: en yüksek numaralı kararlı gemini-embedding-NNN; yoksa diğer gemini-embedding, text-embedding */
export const pickGeminiEmbeddingModel = (models: GeminiModel[]): string | undefined => {
    const emb = models.filter(m => m.methods.includes('embedContent') || m.methods.includes('batchEmbedContents'));
    const numbered = emb.map(m => ({ id: m.id, n: Number(/^gemini-embedding-(\d{3})$/.exec(m.id)?.[1]) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    return numbered[0]?.id
        || emb.find(m => /^gemini-embedding/.test(m.id) && !/(exp|preview)/.test(m.id))?.id
        || emb.find(m => /^text-embedding/.test(m.id))?.id
        || emb[0]?.id;
};

/** Anahtarın görebildiği modeller (sayfalı; en çok 5 sayfa) */
export const listGeminiModels = async (apiKey: string, baseUrl: string, env: Env, fetchImpl?: typeof fetch): Promise<GeminiModel[]> => {
    const base = baseUrl.replace(/\/+$/, '');
    const f = fetchImpl || upstreamFetch(base, env);
    const out: GeminiModel[] = [];
    let token: string | undefined;
    for (let page = 0; page < 5; page++) {
        let res: Response;
        try {
            res = await f(`${base}/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { headers: { 'x-goog-api-key': apiKey } });
        } catch (e) {
            throw new Error(`Gemini API'ye ulaşılamadı: ${describeNetworkError(e)}.`);
        }
        const body = await res.json().catch(() => ({})) as { models?: { name?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string; error?: { message?: string; status?: string } };
        if (!res.ok) {
            const msg = body.error?.message || `HTTP ${res.status}`;
            if (res.status === 400 && /api key/i.test(msg)) throw new Error('Gemini API anahtarı geçersiz; Google AI Studio\'dan yeni anahtar alın.');
            if (res.status === 403) throw new Error(`Gemini API anahtarı reddedildi (${msg}).`);
            throw new Error(`Gemini model listesi alınamadı (${msg}).`);
        }
        (body.models || []).forEach(m => {
            const id = (m.name || '').replace(/^models\//, '');
            if (id) out.push({ id, methods: Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [] });
        });
        token = body.nextPageToken;
        if (!token) break;
    }
    return out;
};

// Anahtar başına model listesi önbelleği (anahtar değeri saklanmaz, özeti tutulur)
const TTL_OK = 60 * 60_000, TTL_FAIL = 60_000;
const cache = new Map<string, { at: number; ttl: number; models?: GeminiModel[]; error?: string }>();
const keyId = async (apiKey: string, base: string) => {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${base}|${apiKey}`)));
    return Array.from(d.slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
};
export const clearGeminiCache = (): void => cache.clear();

export interface GeminiAuto {
    model?: string;
    /** Otomatik seçilen model yoğunken / kotası dolunca sırayla denenen yedekler */
    fallbacks?: string[];
    embeddingModel?: string;
}

/**
 * Sağlayıcı gemini ve anahtar varsa eksik model / embedding modelini doldurur.
 * Model listesi alınamazsa ortam olduğu gibi döner, nedeni `problem`de.
 */
export const withGeminiDefaults = async (env: Env, fetchImpl?: typeof fetch): Promise<{ env: Env; auto: GeminiAuto; problem?: string }> => {
    const provider = (clean(env.AI_PROVIDER) || 'openai').toLowerCase();
    const apiKey = clean(env.AI_API_KEY);
    if (provider !== 'gemini' || !apiKey) return { env, auto: {} };
    const embProvider = clean(env.AI_EMBEDDING_PROVIDER)?.toLowerCase();
    // Boş ya da "auto": seçilir. "none" embedding'i kapatır (dolu sayılır).
    const isAuto = (v: string | undefined) => !clean(v) || clean(v)!.toLowerCase() === 'auto';
    const needModel = isAuto(env.AI_MODEL);
    const needEmb = isAuto(env.AI_EMBEDDING_MODEL) && (!embProvider || embProvider === 'gemini');
    if (!needModel && !needEmb) return { env, auto: {} };
    const base = (clean(env.AI_BASE_URL) || GEMINI_BASE_URL).replace(/\/+$/, '');
    const id = await keyId(apiKey, base);
    let hit = cache.get(id);
    if (!hit || Date.now() - hit.at > hit.ttl) {
        try {
            hit = { at: Date.now(), ttl: TTL_OK, models: await listGeminiModels(apiKey, base, env, fetchImpl) };
        } catch (e) {
            hit = { at: Date.now(), ttl: TTL_FAIL, error: (e as Error).message };
        }
        if (cache.size > 100) cache.clear();
        cache.set(id, hit);
    }
    if (!hit.models) {
        // "auto" sağlayıcıya model adı olarak gitmesin
        const next: Env = { ...env };
        if (needModel) delete next.AI_MODEL;
        if (needEmb) delete next.AI_EMBEDDING_MODEL;
        return { env: next, auto: {}, problem: hit.error };
    }
    const auto: GeminiAuto = {};
    const next: Env = { ...env };
    if (needModel) {
        const ranked = rankGeminiChatModels(hit.models);
        auto.model = ranked[0];
        if (ranked.length > 1) auto.fallbacks = ranked.slice(1, 3);
        if (auto.model) next.AI_MODEL = auto.model; else delete next.AI_MODEL;
    }
    if (needEmb) {
        auto.embeddingModel = pickGeminiEmbeddingModel(hit.models);
        if (auto.embeddingModel) {
            next.AI_EMBEDDING_MODEL = auto.embeddingModel;
            if (!clean(env.AI_EMBEDDING_DIMENSIONS)) next.AI_EMBEDDING_DIMENSIONS = GEMINI_AUTO_DIMENSIONS;
        } else delete next.AI_EMBEDDING_MODEL;
    }
    const problem = needModel && !auto.model ? 'Gemini anahtarının erişebildiği sohbet modeli bulunamadı.' : undefined;
    return { env: next, auto, problem };
};
