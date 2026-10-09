/**
 * Yönetici panelinden AI bağlantı ayarları için istemci. Ayarlar sunucuda
 * (şifreli) tutulur; API anahtarı tarayıcıya yalnız gönderilirken girer,
 * sunucudan hiçbir zaman geri dönmez ("…ABCD" izi hariç). Yönetici anahtarı
 * (AI_ADMIN_TOKEN) yalnız bu sekmenin oturumunda saklanır.
 */

export const AI_SETTING_KEYS = [
    'AI_PROVIDER', 'AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY', 'AI_TEMPERATURE', 'AI_MAX_OUTPUT_TOKENS', 'AI_REASONING_EFFORT', 'AI_EXTRA_BODY',
    'AI_EMBEDDING_MODEL', 'AI_EMBEDDING_PROVIDER', 'AI_EMBEDDING_BASE_URL', 'AI_EMBEDDING_API_KEY',
] as const;
export type AiSettingKey = typeof AI_SETTING_KEYS[number];
export const AI_SECRET_KEYS: AiSettingKey[] = ['AI_API_KEY', 'AI_EMBEDDING_API_KEY'];
export type AiSettingValues = Partial<Record<AiSettingKey, string>>;

export interface AiAdminState {
    store: { available: boolean; kind?: 'supabase' | 'file'; problem?: string };
    source: 'panel' | 'env';
    updatedAt?: string;
    /** Panelde kayıtlı değerler (anahtarlar yalnız son 4 haneyle) */
    panel: AiSettingValues;
    /** Ortam değişkenlerindeki değerler (anahtarlar yalnız son 4 haneyle) */
    env: AiSettingValues;
    effective: {
        configured: boolean; provider?: string; model?: string; baseUrl?: string; problem?: string; embeddingModel?: string; embeddingProblem?: string;
        /** Gemini'de anahtarın model listesinden otomatik seçilenler */
        auto?: { model?: string; embeddingModel?: string };
    };
}

export interface AiTestPart { ok: boolean; latencyMs?: number; error?: string; status?: number; reply?: string; model?: string; dimensions?: number }
export interface AiTestResult { chat: AiTestPart; embed: AiTestPart | null; auto?: { model?: string; embeddingModel?: string } }

export class AiAdminError extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

const TOKEN_KEY = 'PLANASISTAN_AI_ADMIN';
export const loadAdminToken = (): string => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const saveAdminToken = (t: string | null): void => {
    try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* depolama yok */ }
};

const call = async <T>(action: 'get' | 'save' | 'clear' | 'test' | 'models', token: string, values?: AiSettingValues): Promise<T> => {
    let res: Response;
    try {
        res = await fetch('/api/ai/admin', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) },
            body: JSON.stringify({ action, ...(values ? { values } : {}) }),
        });
    } catch {
        throw new AiAdminError('Sunucuya ulaşılamadı.', 0);
    }
    const j = await res.json().catch(() => ({})) as { error?: string; code?: string };
    if (!res.ok) throw new AiAdminError(j.error || `İstek başarısız (${res.status}).`, res.status, j.code);
    return j as T;
};

export const getAiAdmin = (token: string) => call<AiAdminState>('get', token);
export const saveAiAdmin = (token: string, values: AiSettingValues) => call<{ ok: true }>('save', token, values);
export const clearAiAdmin = (token: string) => call<{ ok: true }>('clear', token);
export const testAiAdmin = (token: string, values?: AiSettingValues) => call<AiTestResult>('test', token, values);
/** Formdaki sağlayıcı ve anahtarla erişilebilen modeller (Gemini ve OpenAI uyumlu) */
export const modelsAiAdmin = (token: string, values?: AiSettingValues) => call<{ models: string[]; recommended?: string; error?: string }>('models', token, values);

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
/** Google AI Studio'da anahtar alma sayfası */
export const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';

/**
 * Gemini hızlı kurulumu: yalnız anahtar. Adres açıkça Gemini'ye, model ve
 * embedding "auto" (anahtarın model listesinden en güncel kararlı olan)
 * yazılır; böylece ortamda başka sağlayıcının ayarı olsa da karışmaz.
 */
export const geminiQuickValues = (apiKey: string): AiSettingValues => ({
    AI_PROVIDER: 'gemini', AI_BASE_URL: GEMINI_BASE_URL, AI_MODEL: 'auto', AI_API_KEY: apiKey.trim(),
    AI_TEMPERATURE: '', AI_MAX_OUTPUT_TOKENS: '', AI_REASONING_EFFORT: '', AI_EXTRA_BODY: '',
    AI_EMBEDDING_PROVIDER: 'gemini', AI_EMBEDDING_BASE_URL: GEMINI_BASE_URL, AI_EMBEDDING_MODEL: 'auto', AI_EMBEDDING_API_KEY: apiKey.trim(),
});

/**
 * Formdan sunucuya gidecek taslak: gizli alan boş bırakıldıysa gönderilmez
 * (kayıtlı anahtar korunur), "sil" işaretliyse boş metin gider.
 */
export const draftValues = (form: AiSettingValues, removeSecrets: Partial<Record<AiSettingKey, boolean>> = {}): AiSettingValues => {
    const out: AiSettingValues = {};
    for (const k of AI_SETTING_KEYS) {
        const v = (form[k] || '').trim();
        if (AI_SECRET_KEYS.includes(k)) {
            if (removeSecrets[k]) out[k] = '';
            else if (v) out[k] = v;
        } else out[k] = v;
    }
    return out;
};

export const PROVIDER_LABELS: Record<string, string> = {
    openai: 'OpenAI uyumlu (OpenAI, vLLM, Ollama, kurum ağ geçidi)', azure: 'Azure OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini (Google AI Studio anahtarı)',
};
export const DEFAULT_BASE_URLS: Record<string, string> = {
    openai: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com', gemini: 'https://generativelanguage.googleapis.com/v1beta', azure: '',
};
