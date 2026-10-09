import { describe, expect, it, vi } from 'vitest';
import { createMcpHandler, JSONRPC, MCP_PROTOCOL_VERSIONS } from './protocol';

const handler = (callTool = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'tamam' }] }))) => createMcpHandler({
    name: 'planasistan',
    version: '9.9.9',
    instructions: 'talimat',
    listTools: async () => [{ name: 'proje_listesi', description: 'Projeleri listeler', inputSchema: { type: 'object', properties: {} } }],
    callTool,
});

describe('MCP protokolü', () => {
    it('initialize: istenen sürüm destekleniyorsa onu, değilse en yenisini döndürür', async () => {
        const h = handler();
        const res = await h({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'claude', version: '1' } } });
        expect(res).toMatchObject({
            jsonrpc: '2.0', id: 1,
            result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'planasistan', version: '9.9.9' }, instructions: 'talimat' },
        });
        const yeni = await h({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } });
        expect((yeni as { result: { protocolVersion: string } }).result.protocolVersion).toBe(MCP_PROTOCOL_VERSIONS[0]);
    });

    it('bildirimlere ve istemci yanıtlarına karşılık vermez', async () => {
        const h = handler();
        expect(await h({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
        expect(await h({ jsonrpc: '2.0', id: 5, result: {} })).toBeNull();
    });

    it('ping, tools/list ve tools/call', async () => {
        const call = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'tamam' }] }));
        const h = handler(call);
        expect(await h({ jsonrpc: '2.0', id: 'a', method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 'a', result: {} });
        const list = await h({ jsonrpc: '2.0', id: 3, method: 'tools/list' }) as { result: { tools: { name: string }[] } };
        expect(list.result.tools.map(t => t.name)).toEqual(['proje_listesi']);
        const res = await h({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'proje_listesi', arguments: { limit: 3 } } });
        expect(call).toHaveBeenCalledWith('proje_listesi', { limit: 3 });
        expect(res).toMatchObject({ id: 4, result: { content: [{ type: 'text', text: 'tamam' }] } });
        // arguments verilmezse boş nesne
        await h({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'proje_listesi' } });
        expect(call).toHaveBeenLastCalledWith('proje_listesi', {});
    });

    it('geçersiz istekler JSON-RPC hatası döndürür', async () => {
        const h = handler();
        expect(await h({ id: 1, method: 'ping' })).toMatchObject({ error: { code: JSONRPC.invalidRequest } });
        expect(await h({ jsonrpc: '2.0', id: 1, method: 'resources/list' })).toMatchObject({ id: 1, error: { code: JSONRPC.methodNotFound } });
        expect(await h({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} })).toMatchObject({ error: { code: JSONRPC.invalidParams } });
        expect(await h({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'x', arguments: [1] } })).toMatchObject({ error: { code: JSONRPC.invalidParams } });
        expect(await h({ jsonrpc: '2.0', id: { x: 1 }, method: 'ping' })).toMatchObject({ id: null, error: { code: JSONRPC.invalidRequest } });
    });

    it('araç çağrısı istisna atarsa iç hata olarak döner, süreç düşmez', async () => {
        const h = handler(vi.fn(async () => { throw new Error('patladı'); }));
        expect(await h({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'x' } })).toMatchObject({ id: 9, error: { code: JSONRPC.internalError, message: 'patladı' } });
    });

    it('toplu istekte bildirimler atlanır', async () => {
        const h = handler();
        const res = await h([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }]);
        expect(res).toEqual([{ jsonrpc: '2.0', id: 1, result: {} }]);
        expect(await h([{ jsonrpc: '2.0', method: 'notifications/initialized' }])).toBeNull();
    });
});
