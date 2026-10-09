import { getClient } from '../cloudSync';
import { AI_LIMITS, AiAuthMode, AiStatus, BROWSER_KEY_HEADER, ChatMessage, ChatRequestBody, ChatStreamEvent, ToolCall } from './protocol';

/**
 * Tarayıcı tarafı AI istemcisi — yalnızca kendi proxy'mizle (/api/ai) konuşur;
 * kurumun API anahtarı tarayıcıya hiç gelmez (yönetici isterse yalnız kendi
 * tarayıcısında kendi Gemini test anahtarını kullanabilir; aşağıda). Proxy başka
 * bir adresteyse VITE_AI_PROXY_URL ile verilir (gizli değildir).
 */

const PROXY_BASE = (import.meta.env.VITE_AI_PROXY_URL || '/api/ai').replace(/\/+$/, '');

/** "token" modunda kullanıcının girdiği erişim kodu (cihaza özel) */
export const AI_ACCESS_TOKEN_KEY = 'PLANASISTAN_AI_ACCESS_TOKEN';

export type AiErrorCode = 'config' | 'auth' | 'forbidden' | 'origin' | 'rate_limited' | 'bad_request' | 'upstream' | 'timeout' | 'network' | 'aborted' | 'not_found';

export class AiError extends Error {
    constructor(message: string, public code: AiErrorCode, public status?: number) {
        super(message);
        this.name = 'AiError';
    }
}

export const loadAccessToken = (): string | null => {
    try {
        return localStorage.getItem(AI_ACCESS_TOKEN_KEY);
    } catch {
        return null;
    }
};

export const saveAccessToken = (token: string | null): void => {
    try {
        if (token) localStorage.setItem(AI_ACCESS_TOKEN_KEY, token);
        else localStorage.removeItem(AI_ACCESS_TOKEN_KEY);
    } catch {
        /* depolama kapalıysa kod yalnızca bu oturumda kullanılamaz */
    }
};

/**
 * Yönetici konsolunda "Bu tarayıcıda kullan" ile girilen Gemini test anahtarı.
 * Yalnız bu tarayıcıda saklanır ve AI isteklerinde x-gemini-api-key başlığıyla
 * proxy'ye gider; proxy bu tarayıcının isteklerini sunucu ayarı yerine Gemini'ye
 * yönlendirir. Diğer kullanıcılar sunucu ayarıyla çalışmaya devam eder.
 */
export const AI_BROWSER_KEY = 'PLANASISTAN_AI_GEMINI_TEST_KEY';

export const loadBrowserKey = (): string | null => {
    try {
        return localStorage.getItem(AI_BROWSER_KEY) || null;
    } catch {
        return null;
    }
};

export const saveBrowserKey = (key: string | null): void => {
    try {
        if (key) localStorage.setItem(AI_BROWSER_KEY, key);
        else localStorage.removeItem(AI_BROWSER_KEY);
    } catch {
        /* depolama kapalıysa anahtar kullanılamaz */
    }
};

/** Google API anahtarı biçimi (sunucudaki denetimle aynı) */
export const isBrowserKeyFormat = (key: string): boolean => /^[A-Za-z0-9_.-]{20,200}$/.test(key);

/** undefined: kayıtlı anahtar · null: anahtarsız (sunucu ayarı) · metin: bu anahtar (kaydetmeden deneme) */
export type BrowserKeyChoice = string | null | undefined;

const browserKeyHeaders = (choice: BrowserKeyChoice): Record<string, string> => {
    const key = choice === undefined ? loadBrowserKey() : choice;
    return key ? { [BROWSER_KEY_HEADER]: key } : {};
};

export const authHeaders = async (mode: AiAuthMode): Promise<Record<string, string>> => {
    if (mode === 'token') {
        const t = loadAccessToken();
        return t ? { authorization: `Bearer ${t}` } : {};
    }
    if (mode === 'supabase') {
        const c = getClient();
        if (!c) return {};
        const { data } = await c.auth.getSession();
        const jwt = data.session?.access_token;
        return jwt ? { authorization: `Bearer ${jwt}` } : {};
    }
    return {};
};

/** "token" modunda kod girilmiş mi / "supabase" modunda oturum var mı */
export const hasCredentials = async (mode: AiAuthMode): Promise<boolean> =>
    mode === 'none' || !!(await authHeaders(mode)).authorization;

export const fetchAiStatus = async (signal?: AbortSignal, browserKey?: BrowserKeyChoice): Promise<AiStatus & { unreachable?: boolean }> => {
    try {
        const res = await fetch(`${PROXY_BASE}/health`, { signal, cache: 'no-store', headers: browserKeyHeaders(browserKey) });
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as AiStatus;
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        return {
            configured: false,
            authMode: 'none',
            unreachable: true,
            problem: 'AI sunucusuna ulaşılamadı. Uygulama AI proxy\'si olmadan yayınlanmış olabilir (bkz. docs/AI_KURULUM.md).',
        };
    }
};

/** NDJSON akışını olaylara böler (parçalar satır ortasında kesilebilir) */
export async function* readNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const parse = (line: string): ChatStreamEvent | null => {
        const t = line.trim();
        if (!t) return null;
        try {
            return JSON.parse(t) as ChatStreamEvent;
        } catch {
            return null;
        }
    };
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf('\n')) !== -1) {
                const ev = parse(buffer.slice(0, idx));
                buffer = buffer.slice(idx + 1);
                if (ev) yield ev;
            }
        }
        const ev = parse(buffer + decoder.decode());
        if (ev) yield ev;
    } finally {
        reader.releaseLock();
    }
}

const messageSize = (m: ChatMessage): number =>
    m.content.length + (m.role === 'assistant' && m.toolCalls ? JSON.stringify(m.toolCalls).length : 0);

const clip = (m: ChatMessage): ChatMessage =>
    m.content.length > AI_LIMITS.maxCharsPerMessage ? { ...m, content: m.content.slice(0, AI_LIMITS.maxCharsPerMessage) } : m;

/**
 * Sohbet geçmişini sunucu sınırlarına sığdırır. Mesajlar "tur"lara bölünür
 * (her tur bir kullanıcı mesajıyla başlar ve araç çağrı/sonuçlarını içerir);
 * turlar bölünmez — araç çağrısı sonucu olmadan gönderilmez. Son tur her
 * zaman korunur, eskiler sığdığı kadar eklenir.
 */
export const trimHistory = (
    messages: ChatMessage[],
    systemChars = 0,
    maxMessages = AI_LIMITS.maxMessages,
    maxChars = AI_LIMITS.maxTotalChars
): ChatMessage[] => {
    const usable = messages
        .filter(m => m.role !== 'user' || m.content.trim())
        .filter(m => m.role !== 'assistant' || m.content.trim() || (m.toolCalls && m.toolCalls.length))
        .map(clip);
    const turns: ChatMessage[][] = [];
    usable.forEach(m => {
        if (m.role === 'user' || turns.length === 0) turns.push([m]);
        else turns[turns.length - 1].push(m);
    });
    while (turns.length && turns[0][0].role !== 'user') turns.shift();

    const out: ChatMessage[][] = [];
    let total = systemChars;
    let count = 0;
    for (let i = turns.length - 1; i >= 0; i--) {
        const size = turns[i].reduce((sum, m) => sum + messageSize(m), 0);
        const isLast = out.length === 0;
        if (!isLast && (total + size > maxChars || count + turns[i].length > maxMessages)) break;
        total += size;
        count += turns[i].length;
        out.unshift(turns[i]);
    }
    return out.flat();
};

/**
 * Akıl yürüten modellerin (Qwen3, DeepSeek-R1 vb.) <think> düşünme çıktısını
 * gizler. Ağ geçidi düşünmeyi ayrı alanda (reasoning_content) veriyorsa zaten
 * görünmez; vermiyorsa metin içindeki bloklar burada ayıklanır:
 *  - tam <think>…</think> blokları silinir
 *  - eşsiz </think> (açılışı şablonun eklediği düşünme) → öncesi silinir
 *  - kapanmamış <think> (hâlâ düşünüyor) → sonrası henüz gösterilmez
 */
export const stripReasoning = (text: string): string => {
    if (!text.includes('think>')) return text;
    let t = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    const close = t.indexOf('</think>');
    if (close !== -1) t = t.slice(close + '</think>'.length);
    const open = t.indexOf('<think>');
    if (open !== -1) t = t.slice(0, open);
    return t.replace(/^\s+/, '');
};

export interface StreamChatOptions {
    authMode: AiAuthMode;
    signal?: AbortSignal;
    /** Kayıtlı tarayıcı anahtarı yerine (bağlantı testi) */
    browserKey?: BrowserKeyChoice;
    onDelta?: (text: string, full: string) => void;
}

export interface StreamChatResult {
    text: string;
    toolCalls: ToolCall[];
    stopReason?: string;
}

export const streamChat = async (body: ChatRequestBody, opts: StreamChatOptions): Promise<StreamChatResult> => {
    let res: Response;
    try {
        res = await fetch(`${PROXY_BASE}/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(await authHeaders(opts.authMode)), ...browserKeyHeaders(opts.browserKey) },
            body: JSON.stringify(body),
            signal: opts.signal,
        });
    } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw new AiError('İptal edildi.', 'aborted');
        throw new AiError('AI sunucusuna ulaşılamadı; bağlantınızı kontrol edin.', 'network');
    }

    if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null) as { error?: string; code?: AiErrorCode } | null;
        throw new AiError(err?.error || `AI isteği başarısız (HTTP ${res.status}).`, err?.code || 'upstream', res.status);
    }

    let full = '';
    let stopReason: string | undefined;
    const toolCalls: ToolCall[] = [];
    try {
        for await (const ev of readNdjson(res.body)) {
            if (ev.type === 'delta') {
                full += ev.text;
                opts.onDelta?.(ev.text, stripReasoning(full));
            } else if (ev.type === 'tool_call') {
                toolCalls.push(ev.call);
            } else if (ev.type === 'done') {
                stopReason = ev.stopReason;
            } else if (ev.type === 'error') {
                throw new AiError(ev.message, 'upstream');
            }
        }
    } catch (e) {
        if (e instanceof AiError) throw e;
        if ((e as Error)?.name === 'AbortError' || opts.signal?.aborted) throw new AiError('İptal edildi.', 'aborted');
        throw new AiError('AI yanıt akışı kesildi.', 'network');
    }
    return { text: stripReasoning(full), toolCalls, stopReason };
};

const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new AiError('İptal edildi.', 'aborted'));
        }, { once: true });
    });

/**
 * Metinler için embedding vektörleri (RAG). Hız sınırına takılırsa sunucunun
 * bildirdiği süre kadar bekleyip en çok 3 kez yeniden dener.
 */
export const embedTexts = async (
    texts: string[],
    kind: 'document' | 'query',
    authMode: AiAuthMode,
    signal?: AbortSignal
): Promise<number[][]> => {
    for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
            res = await fetch(`${PROXY_BASE}/embed`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...(await authHeaders(authMode)), ...browserKeyHeaders(undefined) },
                body: JSON.stringify({ texts, kind }),
                signal,
            });
        } catch (e) {
            if ((e as Error)?.name === 'AbortError') throw new AiError('İptal edildi.', 'aborted');
            throw new AiError('AI sunucusuna ulaşılamadı.', 'network');
        }
        if (res.status === 429 && attempt < 3) {
            const wait = Math.min(60, Number(res.headers.get('retry-after')) || 5);
            await sleep(wait * 1000, signal);
            continue;
        }
        const json = await res.json().catch(() => null) as { vectors?: number[][]; error?: string; code?: AiErrorCode } | null;
        if (!res.ok || !json?.vectors) {
            throw new AiError(json?.error || `Embedding isteği başarısız (HTTP ${res.status}).`, json?.code || 'upstream', res.status);
        }
        return json.vectors;
    }
};
