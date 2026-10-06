import { describe, expect, it, vi } from 'vitest';
import { compactToolResults, runAgentTurn } from './agent';
import { StreamChatResult, trimHistory } from './client';
import { ChatMessage, ChatRequestBody } from './protocol';

const tools = [{ name: 'proje_listesi', description: 'Projeleri listeler', parameters: { type: 'object' as const, properties: {} } }];

describe('runAgentTurn', () => {
    it('araç çağrısını çalıştırır, sonucu modele geri verir ve son metni döndürür', async () => {
        const bodies: ChatRequestBody[] = [];
        const replies: StreamChatResult[] = [
            { text: 'Bakıyorum.', toolCalls: [{ id: 'c1', name: 'proje_listesi', arguments: {} }] },
            { text: 'İki proje var.', toolCalls: [], stopReason: 'stop' },
        ];
        const texts: string[] = [];
        const stepLog: string[][] = [];
        const execute = vi.fn(() => ({ content: '{"proje_sayisi":2}', ok: true }));

        const r = await runAgentTurn({
            system: 'sys',
            history: [{ role: 'user', content: 'Kaç proje var?' }],
            tools,
            execute,
            stream: async (body, onDelta) => {
                bodies.push(JSON.parse(JSON.stringify(body)));
                const rep = replies.shift()!;
                onDelta(rep.text);
                return rep;
            },
            onText: t => texts.push(t),
            onSteps: s => stepLog.push(s.map(x => `${x.name}:${x.status}`)),
            labelFor: n => `etiket:${n}`,
        });

        expect(r.text).toBe('Bakıyorum.\n\nİki proje var.');
        expect(r.hitStepLimit).toBe(false);
        expect(r.steps).toEqual([{ id: 'c1', name: 'proje_listesi', label: 'etiket:proje_listesi', status: 'done' }]);
        expect(execute).toHaveBeenCalledWith({ id: 'c1', name: 'proje_listesi', arguments: {} });
        expect(stepLog).toEqual([['proje_listesi:running'], ['proje_listesi:done']]);
        expect(texts[texts.length - 1]).toBe('Bakıyorum.\n\nİki proje var.');

        // İkinci istek: kullanıcı + asistan(araç çağrısı) + araç sonucu
        expect(bodies[1].messages).toEqual([
            { role: 'user', content: 'Kaç proje var?' },
            { role: 'assistant', content: 'Bakıyorum.', toolCalls: [{ id: 'c1', name: 'proje_listesi', arguments: {} }] },
            { role: 'tool', toolCallId: 'c1', name: 'proje_listesi', content: '{"proje_sayisi":2}' },
        ]);
        expect(bodies[1].tools).toEqual(tools);
    });

    it('adım sınırında durur', async () => {
        const r = await runAgentTurn({
            system: 's', history: [{ role: 'user', content: 'x' }], tools, maxSteps: 2,
            execute: () => ({ content: '{}', ok: false }),
            stream: async () => ({ text: '', toolCalls: [{ id: `c${Math.random()}`, name: 'proje_listesi', arguments: {} }] }),
        });
        expect(r.hitStepLimit).toBe(true);
        expect(r.steps).toHaveLength(2);
        expect(r.steps.every(s => s.status === 'error')).toBe(true);
    });

    it('akış hatası (iptal) dışarı fırlatılır', async () => {
        await expect(runAgentTurn({
            system: 's', history: [{ role: 'user', content: 'x' }], tools,
            execute: () => ({ content: '{}', ok: true }),
            stream: async () => { throw new Error('iptal'); },
        })).rejects.toThrow('iptal');
    });
});

describe('compactToolResults', () => {
    it('bütçe aşılınca en eski araç sonuçlarını not ile değiştirir, son mesajı korur', () => {
        const big = 'x'.repeat(1000);
        const msgs: ChatMessage[] = [
            { role: 'user', content: 'soru' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 't', arguments: {} }] },
            { role: 'tool', toolCallId: 'a', name: 't', content: big },
            { role: 'assistant', content: '', toolCalls: [{ id: 'b', name: 't', arguments: {} }] },
            { role: 'tool', toolCallId: 'b', name: 't', content: big },
        ];
        const out = compactToolResults(msgs, 1500);
        expect(out[2].content).toMatch(/çıkarıldı/);
        expect(out[4].content).toBe(big);
        expect(out).toHaveLength(5);
        expect(compactToolResults(msgs, 100_000)).toBe(msgs);
    });
});

describe('trimHistory (turlar)', () => {
    it('araç çağrısını sonucundan ayırmaz; eski turları bütçeye göre atar', () => {
        const history: ChatMessage[] = [
            { role: 'user', content: 'eski soru' },
            { role: 'assistant', content: 'y'.repeat(500) },
            { role: 'user', content: 'yeni soru' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'c', name: 't', arguments: {} }] },
            { role: 'tool', toolCallId: 'c', name: 't', content: 'z'.repeat(300) },
        ];
        const out = trimHistory(history, 0, 40, 600);
        expect(out.map(m => m.role)).toEqual(['user', 'assistant', 'tool']);
        expect(out[0].content).toBe('yeni soru');
        expect(trimHistory(history, 0, 40, 10_000)).toHaveLength(5);
    });
});
