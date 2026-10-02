import { describe, expect, it } from 'vitest';
import { collect, streamOf } from '../../server/ai/testUtils';
import { readNdjson, trimHistory } from './client';
import { ChatMessage } from './protocol';

describe('readNdjson', () => {
    it('satır ortasında bölünen ve sonu satırsız biten akışı ayrıştırır', async () => {
        const evs = await collect(readNdjson(streamOf('{"type":"delta","te', 'xt":"a"}\n\n{"type":"del', 'ta","text":"ğüş"}\n{"type":"done"}')));
        expect(evs).toEqual([{ type: 'delta', text: 'a' }, { type: 'delta', text: 'ğüş' }, { type: 'done' }]);
    });

    it('bozuk satırları atlar', async () => {
        const evs = await collect(readNdjson(streamOf('çöp\n{"type":"done"}\n')));
        expect(evs).toEqual([{ type: 'done' }]);
    });
});

describe('trimHistory', () => {
    const msgs = (n: number): ChatMessage[] =>
        Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` }));

    it('en yeni mesajları korur ve kullanıcı mesajıyla başlar', () => {
        const out = trimHistory(msgs(9), 0, 4);
        expect(out.map(m => m.content)).toEqual(['m6', 'm7', 'm8']);
        expect(out[0].role).toBe('user');
    });

    it('karakter bütçesini aşan eski mesajları atar, son mesajı her zaman tutar', () => {
        const history: ChatMessage[] = [
            { role: 'user', content: 'x'.repeat(50) },
            { role: 'assistant', content: 'y'.repeat(50) },
            { role: 'user', content: 'son' },
        ];
        expect(trimHistory(history, 10, 40, 80).map(m => m.content)).toEqual(['son']);
        expect(trimHistory([{ role: 'user', content: 'z'.repeat(200) }], 0, 40, 80)).toHaveLength(1);
    });

    it('boş mesajları atlar', () => {
        expect(trimHistory([{ role: 'user', content: '  ' }, { role: 'user', content: 'a' }])).toEqual([{ role: 'user', content: 'a' }]);
    });
});
