import type { JsonSchema } from '../../utils/ai/protocol.js';

/**
 * Model Context Protocol (MCP) — JSON-RPC 2.0 çekirdeği, taşıma katmanından
 * bağımsız. Yalnız "tools" yeteneği sunulur (initialize, ping, tools/list,
 * tools/call). stdio taşıması server/mcp/stdio.ts'te; aynı çekirdek ileride
 * bir HTTP ucuna da bağlanabilir.
 *
 * Spesifikasyon: https://modelcontextprotocol.io/specification
 */

/** Desteklenen protokol sürümleri (en yeni başta). İstemcinin istediği listedeyse o, yoksa en yenisi döner. */
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

export interface McpToolAnnotations {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}

export interface McpTool {
    name: string;
    title?: string;
    description: string;
    inputSchema: JsonSchema;
    annotations?: McpToolAnnotations;
}

export interface McpToolResult {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
}

export interface McpServerOptions {
    name: string;
    title?: string;
    version: string;
    instructions?: string;
    listTools: () => Promise<McpTool[]>;
    callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
    /** Tanılama günlüğü (stdio'da stderr; stdout yalnız protokol içindir) */
    log?: (message: string) => void;
}

type JsonRpcId = string | number | null;

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: JsonRpcId;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

export const JSONRPC = {
    parseError: -32700,
    invalidRequest: -32600,
    methodNotFound: -32601,
    invalidParams: -32602,
    internalError: -32603,
} as const;

export const errorResponse = (id: JsonRpcId, code: number, message: string): JsonRpcResponse =>
    ({ jsonrpc: '2.0', id, error: { code, message } });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const validId = (v: unknown): v is string | number => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/**
 * Tek bir JSON-RPC iletisini işler. Bildirimlere ve istemciden gelen
 * yanıtlara karşılık verilmez (null). Dizi (batch) gelirse her öğe işlenir.
 */
export const createMcpHandler = (o: McpServerOptions) => {
    const log = o.log || (() => undefined);

    const handleOne = async (msg: unknown): Promise<JsonRpcResponse | null> => {
        if (!isObj(msg) || msg.jsonrpc !== '2.0') return errorResponse(null, JSONRPC.invalidRequest, 'Geçersiz JSON-RPC iletisi.');
        const method = msg.method;
        const hasId = 'id' in msg && msg.id !== undefined;
        // İstemcinin bizim isteğimize yanıtı (sunucu istek göndermediği için yok sayılır)
        if (typeof method !== 'string') return hasId && ('result' in msg || 'error' in msg) ? null : errorResponse(null, JSONRPC.invalidRequest, 'method eksik.');
        // Bildirim (id yok): yanıt verilmez
        if (!hasId) return null;
        if (!validId(msg.id)) return errorResponse(null, JSONRPC.invalidRequest, 'Geçersiz id.');
        const id = msg.id;
        const params = isObj(msg.params) ? msg.params : {};
        const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });

        try {
            switch (method) {
                case 'initialize': {
                    const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
                    const protocolVersion = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];
                    const client = isObj(params.clientInfo) ? `${String(params.clientInfo.name || '?')} ${String(params.clientInfo.version || '')}`.trim() : '?';
                    log(`initialize: istemci ${client}, protokol ${asked || '?'} → ${protocolVersion}`);
                    return ok({
                        protocolVersion,
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: o.name, version: o.version, ...(o.title ? { title: o.title } : {}) },
                        ...(o.instructions ? { instructions: o.instructions } : {}),
                    });
                }
                case 'ping':
                    return ok({});
                case 'tools/list':
                    return ok({ tools: await o.listTools() });
                case 'tools/call': {
                    const name = params.name;
                    if (typeof name !== 'string' || !name) return errorResponse(id, JSONRPC.invalidParams, 'tools/call: name gerekli.');
                    const args = params.arguments === undefined ? {} : params.arguments;
                    if (!isObj(args)) return errorResponse(id, JSONRPC.invalidParams, 'tools/call: arguments bir nesne olmalı.');
                    return ok(await o.callTool(name, args));
                }
                default:
                    return errorResponse(id, JSONRPC.methodNotFound, `Desteklenmeyen yöntem: ${method}`);
            }
        } catch (e) {
            log(`${method} hatası: ${(e as Error)?.message}`);
            return errorResponse(id, JSONRPC.internalError, (e as Error)?.message || 'Sunucu iç hatası.');
        }
    };

    return async (msg: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null> => {
        if (Array.isArray(msg)) {
            if (msg.length === 0) return errorResponse(null, JSONRPC.invalidRequest, 'Boş toplu istek.');
            const out = (await Promise.all(msg.map(handleOne))).filter((r): r is JsonRpcResponse => r !== null);
            return out.length ? out : null;
        }
        return handleOne(msg);
    };
};
