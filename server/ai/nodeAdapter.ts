import type { IncomingMessage, ServerResponse } from 'node:http';
import { Env } from './config.js';
import { handleAiRequest } from './handler.js';

/**
 * Node (connect) ara katmanı — Vite geliştirme/önizleme sunucusunda /api/ai/*
 * isteklerini handleAiRequest'e bağlar. Kurum içi bir Node sunucusunda da
 * aynı şekilde kullanılabilir.
 */

const MAX_BODY_BYTES = 1_000_000;

const readBody = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
            size += c.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('body too large'));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });

export const createAiMiddleware = (getEnv: () => Env, opts: { isDev?: boolean; mountPath?: string } = {}) =>
    async (req: IncomingMessage & { originalUrl?: string }, res: ServerResponse): Promise<void> => {
        const mount = opts.mountPath || '/api/ai';
        const host = req.headers.host || 'localhost';
        // connect, bağlama yolunu req.url'den çıkarır; originalUrl tam yolu taşır
        const pathPart = req.originalUrl || `${mount}${req.url || ''}`;
        const url = `http://${host}${pathPart}`;

        const abort = new AbortController();
        res.on('close', () => {
            if (!res.writableEnded) abort.abort();
        });

        try {
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers)) {
                if (v === undefined) continue;
                headers.set(k, Array.isArray(v) ? v.join(', ') : v);
            }
            const method = req.method || 'GET';
            const body = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? undefined : await readBody(req);
            const request = new Request(url, { method, headers, body, signal: abort.signal });
            const response = await handleAiRequest(request, getEnv(), { isDev: opts.isDev });

            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            if (!response.body) {
                res.end();
                return;
            }
            res.flushHeaders?.();
            const reader = response.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
            res.end();
        } catch (e) {
            if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('content-type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: 'AI proxy iç hatası.', code: 'upstream' }));
            } else {
                res.end();
            }
            if (!abort.signal.aborted) console.error('[ai] proxy hatası:', (e as Error)?.message);
        }
    };
