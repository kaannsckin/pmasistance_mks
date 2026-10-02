/**
 * Tarayıcı ↔ AI proxy sözleşmesi (istemci ve sunucu ortak kullanır).
 *
 * API anahtarı yalnızca sunucudadır; tarayıcı /api/ai/* uçlarıyla konuşur ve
 * hangi sağlayıcının (OpenAI-uyumlu, Azure, Anthropic, Gemini) kullanıldığını
 * bilmek zorunda değildir.
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
    role: ChatRole;
    content: string;
}

export interface ChatRequestBody {
    system?: string;
    messages: ChatMessage[];
}

/** /api/ai/chat yanıtı: her satır bir JSON olay (NDJSON) */
export type ChatStreamEvent =
    | { type: 'delta'; text: string }
    | { type: 'done'; stopReason?: string }
    | { type: 'error'; message: string };

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
}

/** Sunucunun kabul ettiği üst sınırlar (istemci de geçmişi buna göre kırpar) */
export const AI_LIMITS = {
    maxMessages: 40,
    maxCharsPerMessage: 20_000,
    maxSystemChars: 40_000,
    maxTotalChars: 120_000,
};
