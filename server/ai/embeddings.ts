import { AI_LIMITS, EmbedRequestBody } from '../../utils/ai/protocol.js';
import { AiProvider, Env } from './config.js';

/**
 * Embedding yapılandırması ve sağlayıcı adaptörleri (RAG anlamsal arama).
 * İsteğe bağlıdır: AI_EMBEDDING_MODEL tanımlı değilse uygulama yalnızca
 * anahtar kelime (BM25) aramasıyla çalışır.
 *
 *  - openai / azure : POST {base}/embeddings
 *  - voyage         : POST {base}/embeddings (input_type: document | query)
 *  - gemini         : POST {base}/models/{model}:batchEmbedContents
 *  Anthropic embedding sunmaz → sohbet sağlayıcısı anthropic ise
 *  AI_EMBEDDING_PROVIDER ayrıca verilmelidir.
 */

export type EmbeddingProvider = 'openai' | 'azure' | 'gemini' | 'voyage';
export const EMBEDDING_PROVIDERS: EmbeddingProvider[] = ['openai', 'azure', 'gemini', 'voyage'];

export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    apiKey: string;
    model: string;
    baseUrl: string;
    dimensions?: number;
    rateLimitPerMin: number;
}

const DEFAULT_BASE: Record<EmbeddingProvider, string | undefined> = {
    openai: 'https://api.openai.com/v1',
    azure: undefined,
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    voyage: 'https://api.voyageai.com/v1',
};

const clean = (v: string | undefined): string | undefined => {
    const t = v?.trim();
    return t ? t : undefined;
};

export const readEmbeddingConfig = (env: Env): { config?: EmbeddingConfig; problem?: string } => {
    const model = clean(env.AI_EMBEDDING_MODEL)?.replace(/^models\//, '');
    if (!model) return {};
    const chatProvider = (clean(env.AI_PROVIDER) || 'openai').toLowerCase() as AiProvider;
    const explicit = clean(env.AI_EMBEDDING_PROVIDER)?.toLowerCase();
    const provider = (explicit || (chatProvider === 'anthropic' ? undefined : chatProvider)) as EmbeddingProvider | undefined;
    if (!provider) return { problem: 'Anthropic embedding sunmaz; AI_EMBEDDING_PROVIDER (openai | azure | gemini | voyage) tanımlayın.' };
    if (!EMBEDDING_PROVIDERS.includes(provider)) return { problem: `Geçersiz AI_EMBEDDING_PROVIDER: "${provider}".` };
    const sameAsChat = provider === chatProvider;
    const apiKey = clean(env.AI_EMBEDDING_API_KEY) || (sameAsChat ? clean(env.AI_API_KEY) : undefined);
    if (!apiKey) return { problem: 'Embedding için AI_EMBEDDING_API_KEY tanımlanmalı.' };
    const baseUrl = (clean(env.AI_EMBEDDING_BASE_URL) || (sameAsChat ? clean(env.AI_BASE_URL) : undefined) || DEFAULT_BASE[provider])?.replace(/\/+$/, '');
    if (!baseUrl) return { problem: `${provider} embedding için AI_EMBEDDING_BASE_URL tanımlanmalı.` };
    const dims = Number(env.AI_EMBEDDING_DIMENSIONS);
    const rate = Number(env.AI_EMBED_RATE_LIMIT_PER_MIN);
    return {
        config: {
            provider, apiKey, model, baseUrl,
            dimensions: Number.isInteger(dims) && dims > 0 ? dims : undefined,
            rateLimitPerMin: Number.isInteger(rate) && rate > 0 ? rate : 120,
        },
    };
};

export const validateEmbedBody = (raw: unknown): { body?: EmbedRequestBody; error?: string } => {
    const texts = (raw as any)?.texts;
    const kind = (raw as any)?.kind ?? 'document';
    if (kind !== 'document' && kind !== 'query') return { error: 'kind document ya da query olmalı.' };
    if (!Array.isArray(texts) || texts.length === 0) return { error: 'En az bir metin gerekli.' };
    if (texts.length > AI_LIMITS.maxEmbedTexts) return { error: `Bir istekte en fazla ${AI_LIMITS.maxEmbedTexts} metin.` };
    for (const t of texts) {
        if (typeof t !== 'string' || !t.trim()) return { error: 'Metinler boş olamaz.' };
        if (t.length > AI_LIMITS.maxEmbedChars) return { error: 'Metin çok uzun.' };
    }
    return { body: { texts, kind } };
};

export const buildEmbedRequest = (c: EmbeddingConfig, body: EmbedRequestBody): { url: string; headers: Record<string, string>; body: string } => {
    const json = { 'content-type': 'application/json' };
    switch (c.provider) {
        case 'openai':
        case 'azure':
            return {
                url: `${c.baseUrl}/embeddings`,
                headers: c.provider === 'azure' ? { ...json, 'api-key': c.apiKey } : { ...json, authorization: `Bearer ${c.apiKey}` },
                body: JSON.stringify({ model: c.model, input: body.texts, ...(c.dimensions ? { dimensions: c.dimensions } : {}) }),
            };
        case 'voyage':
            return {
                url: `${c.baseUrl}/embeddings`,
                headers: { ...json, authorization: `Bearer ${c.apiKey}` },
                body: JSON.stringify({ model: c.model, input: body.texts, input_type: body.kind, ...(c.dimensions ? { output_dimension: c.dimensions } : {}) }),
            };
        case 'gemini':
            return {
                url: `${c.baseUrl}/models/${encodeURIComponent(c.model)}:batchEmbedContents`,
                headers: { ...json, 'x-goog-api-key': c.apiKey },
                body: JSON.stringify({
                    requests: body.texts.map(t => ({
                        model: `models/${c.model}`,
                        content: { parts: [{ text: t }] },
                        taskType: body.kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
                        ...(c.dimensions ? { outputDimensionality: c.dimensions } : {}),
                    })),
                }),
            };
    }
};

/** Sağlayıcı yanıtı → giriş sırasıyla vektörler (6 ondalık; yanıt boyutu küçülsün) */
export const parseEmbedResponse = (c: EmbeddingConfig, json: any, count: number): number[][] => {
    let vecs: number[][] = [];
    if (c.provider === 'gemini') {
        vecs = (json?.embeddings || []).map((e: any) => e?.values || []);
    } else {
        const data: any[] = Array.isArray(json?.data) ? [...json.data] : [];
        data.sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
        vecs = data.map(d => d?.embedding || []);
    }
    if (vecs.length !== count || vecs.some(v => !Array.isArray(v) || v.length === 0)) {
        throw new Error('Embedding yanıtı beklenen biçimde değil.');
    }
    return vecs.map(v => v.map((x: number) => Math.round(x * 1e6) / 1e6));
};
