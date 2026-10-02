import { describe, expect, it } from 'vitest';
import { AiConfig, readAiConfig } from './config';
import { buildUpstreamRequest, extractUpstreamError, parseUpstreamEvents, UpstreamStreamError } from './providers';
import { parseSSE } from './sse';
import { collect, streamOf } from './testUtils';

const cfg = (env: Record<string, string>): AiConfig => {
    const r = readAiConfig({ AI_API_KEY: 'gizli', AI_MODEL: 'm1', AI_AUTH_MODE: 'none', ...env });
    if (!r.config) throw new Error(r.problem);
    return r.config;
};

const req = { system: 'sistem', messages: [{ role: 'user' as const, content: 'merhaba' }, { role: 'assistant' as const, content: 'selam' }, { role: 'user' as const, content: 'nasılsın' }] };

describe('parseSSE', () => {
    it('satır ortasında bölünmüş parçaları ve \\r\\n sonlarını birleştirir', async () => {
        const evs = await collect(parseSSE(streamOf('event: a\r\nda', 'ta: {"x":1}\r\n\r\n: yorum\n', 'data: s1\ndata: s2\n\n', 'data: son')));
        expect(evs).toEqual([
            { event: 'a', data: '{"x":1}' },
            { event: undefined, data: 's1\ns2' },
            { event: undefined, data: 'son' },
        ]);
    });
});

describe('readAiConfig', () => {
    it('anahtar/model yoksa sorun bildirir, anahtarı sızdırmaz', () => {
        expect(readAiConfig({}, { isDev: true }).problem).toMatch(/AI_API_KEY/);
        expect(readAiConfig({ AI_API_KEY: 'k' }, { isDev: true }).problem).toMatch(/AI_MODEL/);
        expect(readAiConfig({ AI_API_KEY: 'k', AI_MODEL: 'm', AI_PROVIDER: 'xyz' }, { isDev: true }).problem).toMatch(/AI_PROVIDER/);
        expect(readAiConfig({ AI_API_KEY: 'k', AI_MODEL: 'm', AI_PROVIDER: 'azure' }, { isDev: true }).problem).toMatch(/AI_BASE_URL/);
    });

    it('yayında erişim koruması olmadan yapılandırılmış sayılmaz; geliştirmede sayılır', () => {
        const env = { AI_API_KEY: 'k', AI_MODEL: 'm' };
        expect(readAiConfig(env).config).toBeUndefined();
        expect(readAiConfig(env).problem).toMatch(/erişim koruması/);
        expect(readAiConfig(env, { isDev: true }).config?.authMode).toBe('none');
        expect(readAiConfig({ ...env, AI_ACCESS_TOKEN: 't' }).config?.authMode).toBe('token');
        expect(readAiConfig({ ...env, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' }).config?.authMode).toBe('supabase');
        expect(readAiConfig({ ...env, AI_AUTH_MODE: 'token' }).problem).toMatch(/AI_ACCESS_TOKEN/);
    });
});

describe('buildUpstreamRequest', () => {
    it('openai: Bearer + system mesajı + max_completion_tokens (resmi uç nokta)', () => {
        const r = buildUpstreamRequest(cfg({ AI_PROVIDER: 'openai' }), req);
        expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
        expect(r.headers.authorization).toBe('Bearer gizli');
        const body = JSON.parse(r.body);
        expect(body.messages[0]).toEqual({ role: 'system', content: 'sistem' });
        expect(body.messages).toHaveLength(4);
        expect(body.stream).toBe(true);
        expect(body.max_completion_tokens).toBe(4096);
    });

    it('openai-uyumlu özel uç nokta max_tokens kullanır', () => {
        const r = buildUpstreamRequest(cfg({ AI_PROVIDER: 'openai', AI_BASE_URL: 'http://llm.kurum.local/v1/' }), req);
        expect(r.url).toBe('http://llm.kurum.local/v1/chat/completions');
        expect(JSON.parse(r.body).max_tokens).toBe(4096);
    });

    it('azure: api-key başlığı', () => {
        const r = buildUpstreamRequest(cfg({ AI_PROVIDER: 'azure', AI_BASE_URL: 'https://k.openai.azure.com/openai/v1' }), req);
        expect(r.headers['api-key']).toBe('gizli');
        expect(r.headers.authorization).toBeUndefined();
    });

    it('anthropic: x-api-key + sürüm başlığı + ayrı system alanı', () => {
        const r = buildUpstreamRequest(cfg({ AI_PROVIDER: 'anthropic', AI_MAX_OUTPUT_TOKENS: '1000' }), req);
        expect(r.url).toBe('https://api.anthropic.com/v1/messages');
        expect(r.headers['x-api-key']).toBe('gizli');
        expect(r.headers['anthropic-version']).toBe('2023-06-01');
        const body = JSON.parse(r.body);
        expect(body.system).toBe('sistem');
        expect(body.max_tokens).toBe(1000);
        expect(body.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
    });

    it('gemini: model rolü + systemInstruction + SSE', () => {
        const r = buildUpstreamRequest(cfg({ AI_PROVIDER: 'gemini', AI_MODEL: 'models/gemini-x' }), req);
        expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:streamGenerateContent?alt=sse');
        expect(r.headers['x-goog-api-key']).toBe('gizli');
        const body = JSON.parse(r.body);
        expect(body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
        expect(body.systemInstruction.parts[0].text).toBe('sistem');
    });
});

describe('parseUpstreamEvents', () => {
    it('openai akışı', async () => {
        const s = streamOf(
            'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Mer"}}]}\n\ndata: {"choices":[{"delta":{"content":"haba"},"finish_reason":"stop"}]}\n\n',
            'data: [DONE]\n\n'
        );
        const evs = await collect(parseUpstreamEvents(cfg({ AI_PROVIDER: 'openai' }), parseSSE(s)));
        expect(evs).toEqual([{ type: 'delta', text: 'Mer' }, { type: 'delta', text: 'haba' }, { type: 'done', stopReason: 'stop' }]);
    });

    it('anthropic akışı', async () => {
        const s = streamOf(
            'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Selam"}}\n\n',
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n',
            'event: message_stop\ndata: {"type":"message_stop"}\n\n'
        );
        const evs = await collect(parseUpstreamEvents(cfg({ AI_PROVIDER: 'anthropic' }), parseSSE(s)));
        expect(evs).toEqual([{ type: 'delta', text: 'Selam' }, { type: 'done', stopReason: 'max_tokens' }]);
    });

    it('anthropic akış içi hata → UpstreamStreamError', async () => {
        const s = streamOf('event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n');
        await expect(collect(parseUpstreamEvents(cfg({ AI_PROVIDER: 'anthropic' }), parseSSE(s)))).rejects.toBeInstanceOf(UpstreamStreamError);
    });

    it('gemini akışı — düşünce parçaları gösterilmez', async () => {
        const s = streamOf(
            'data: {"candidates":[{"content":{"parts":[{"text":"iç düşünce","thought":true},{"text":"Yanıt "}]}}]}\r\n\r\n',
            'data: {"candidates":[{"content":{"parts":[{"text":"tamam"}]},"finishReason":"STOP"}]}\r\n\r\n'
        );
        const evs = await collect(parseUpstreamEvents(cfg({ AI_PROVIDER: 'gemini' }), parseSSE(s)));
        expect(evs).toEqual([{ type: 'delta', text: 'Yanıt ' }, { type: 'delta', text: 'tamam' }, { type: 'done', stopReason: 'stop' }]);
    });

    it('gemini engellenen istem → hata', async () => {
        const s = streamOf('data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n');
        await expect(collect(parseUpstreamEvents(cfg({ AI_PROVIDER: 'gemini' }), parseSSE(s)))).rejects.toThrow(/güvenlik/);
    });
});

describe('extractUpstreamError', () => {
    it('farklı sağlayıcı hata gövdelerinden kısa açıklama çıkarır', () => {
        expect(extractUpstreamError('{"error":{"message":"Invalid model"}}')).toBe('Invalid model');
        expect(extractUpstreamError('[{"error":{"code":400,"message":"API key not valid"}}]')).toBe('API key not valid');
        expect(extractUpstreamError('{"error":"bad"}')).toBe('bad');
        expect(extractUpstreamError('{"error":{"type":"x"}}')).toBe('');
        expect(extractUpstreamError('düz   metin')).toBe('düz metin');
    });
});
