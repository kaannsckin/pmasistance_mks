/**
 * Tarayıcı ↔ AI proxy sözleşmesi (istemci ve sunucu ortak kullanır).
 *
 * Kurumun API anahtarı yalnızca sunucudadır (istisna: yöneticinin yalnız kendi
 * tarayıcısında kullandığı AI bağlantısı, BROWSER_KEY_HEADER); tarayıcı /api/ai/* uçlarıyla konuşur ve
 * hangi sağlayıcının (OpenAI-uyumlu, Azure, Anthropic, Gemini) kullanıldığını
 * bilmek zorunda değildir.
 *
 * Araç çağrısı (tool calling): araçlar TARAYICIDA çalışır (veri yerel ve rol
 * kapsamlıdır). Proxy yalnızca araç tanımlarını sağlayıcıya iletir, modelin
 * istediği çağrıları tool_call olayı olarak döndürür; tarayıcı sonucu bir
 * sonraki istekte 'tool' mesajı olarak geri gönderir. Proxy durumsuz kalır.
 */

/** Model ↔ araç çağrısı (sağlayıcıdan bağımsız) */
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    /** Sağlayıcıya özgü, aynen geri gönderilmesi gereken veri (ör. Gemini thoughtSignature) */
    meta?: Record<string, unknown>;
}

/** JSON Schema alt kümesi — tüm sağlayıcıların ortak desteklediği alanlar */
export interface JsonSchema {
    type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
    description?: string;
    enum?: (string | number)[];
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
}

export interface ToolSpec {
    name: string;
    description: string;
    parameters: JsonSchema;
}

export type ChatRole = 'user' | 'assistant' | 'tool';

export type ChatMessage =
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
    | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ChatRequestBody {
    system?: string;
    messages: ChatMessage[];
    tools?: ToolSpec[];
}

/** /api/ai/chat yanıtı: her satır bir JSON olay (NDJSON) */
export type ChatStreamEvent =
    | { type: 'delta'; text: string }
    | { type: 'tool_call'; call: ToolCall }
    | { type: 'done'; stopReason?: string }
    | { type: 'error'; message: string };

/**
 * Yönetici konsolunda "Bu tarayıcıda kullan" ile girilen AI bağlantısının
 * başlıkları. Bağlantı yalnız o tarayıcıda (24 saat) saklanır; sunucu o isteği
 * bu sağlayıcıya (sabit adrese; Azure'da *.openai.azure.com) yönlendirir —
 * bkz. server/ai/browserKey.ts.
 */
export const BROWSER_KEY_HEADER = 'x-ai-api-key';
export const BROWSER_PROVIDER_HEADER = 'x-ai-provider';
export const BROWSER_MODEL_HEADER = 'x-ai-model';
export const BROWSER_BASE_URL_HEADER = 'x-ai-base-url';
/** Eski sürümün yalnız Gemini anahtarı başlığı (önbellekteki eski istemciler için) */
export const LEGACY_BROWSER_KEY_HEADER = 'x-gemini-api-key';
/** Tarayıcıda saklanan AI bağlantısı ve erişim kodunun geçerlilik süresi */
export const BROWSER_SETTINGS_TTL_MS = 24 * 60 * 60 * 1000;

/** Proxy'nin istekleri nasıl yetkilendirdiği */
export type AiAuthMode = 'none' | 'token' | 'supabase';

/** /api/ai/health yanıtı — anahtar ya da gizli bilgi İÇERMEZ */
export interface AiStatus {
    configured: boolean;
    authMode: AiAuthMode;
    provider?: string;
    model?: string;
    /** Yapılandırma eksikse kullanıcıya gösterilecek Türkçe açıklama */
    problem?: string;
    /** Bağlantı ayarları yönetici panelinden mi, ortam değişkenlerinden mi, bu tarayıcıdaki AI bağlantısından mı */
    configSource?: 'panel' | 'env' | 'browser';
    /** Sunucu tarayıcıdaki AI bağlantısını kabul ediyor mu (AI_ALLOW_BROWSER_KEY) */
    browserKeyAllowed?: boolean;
    /** Anlamsal arama (RAG) için embedding modeli — yoksa yalnızca anahtar kelime araması */
    embeddingModel?: string;
    /** AI_EMBEDDING_MODEL verilmiş ama yapılandırma eksikse açıklama */
    embeddingProblem?: string;
}

/** /api/ai/embed isteği: belge parçaları dizinleme, sorgu arama içindir */
export interface EmbedRequestBody {
    texts: string[];
    kind: 'document' | 'query';
}

export interface EmbedResponseBody {
    vectors: number[][];
    model: string;
}

/** Sunucunun kabul ettiği üst sınırlar (istemci de geçmişi buna göre kırpar) */
export const AI_LIMITS = {
    maxMessages: 60,
    maxCharsPerMessage: 20_000,
    maxSystemChars: 40_000,
    maxTotalChars: 150_000,
    maxTools: 40,
    maxToolCallsPerMessage: 16,
    /** Araç tanımı / argüman / meta JSON'u için üst sınır (karakter) */
    maxToolJsonChars: 20_000,
    maxEmbedTexts: 64,
    maxEmbedChars: 8_000,
};

/** Sağlayıcıların ortak kabul ettiği araç adı biçimi */
export const TOOL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/;
