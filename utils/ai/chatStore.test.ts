import { describe, expect, it } from 'vitest';
import { chatOwner, chatTitle, EXPIRED_PROPOSAL_NOTE, MAX_MESSAGES_PER_CHAT, restoreMessages, StoredMessage, summarize, toStored } from './chatStore';

describe('sohbet geçmişi', () => {
    it('başlık ilk kullanıcı mesajından; sahip kimlik başına', () => {
        expect(chatTitle([{ role: 'assistant', content: 'x' }, { role: 'user', content: '  ATLAS   geciken görevler  ' }])).toBe('ATLAS geciken görevler');
        expect(chatTitle([{ role: 'user', content: 'a'.repeat(80) }])).toHaveLength(58);
        expect(chatTitle([])).toBe('Yeni sohbet');
        expect(chatOwner('py', 'p13')).toBe('py:p13');
        expect(chatOwner('pyb_destek')).toBe('pyb_destek:-');
    });

    it('kaydederken akış alanı atılır ve en son 200 mesaj tutulur', () => {
        const msgs = Array.from({ length: 205 }, (_, i) => ({ id: i, role: 'user' as const, content: `m${i}`, streaming: true }));
        const stored = toStored(msgs);
        expect(stored).toHaveLength(MAX_MESSAGES_PER_CHAT);
        expect(stored[0]).toEqual({ id: 5, role: 'user', content: 'm5' });
    });

    it('geri yüklenen sohbette bekleyen öneriler uygulanamaz; uygulanmışlar korunur', () => {
        const m: StoredMessage = { id: 1, role: 'assistant', content: 'x', proposals: [{ id: 'a', status: 'pending' }, { id: 'b', status: 'applied', message: 'ok' }, { id: 'c', status: 'running' }] };
        const [r] = restoreMessages([m, { id: 2, role: 'user', content: 'y' }]);
        expect(r.proposals).toEqual([
            { id: 'a', status: 'rejected', message: EXPIRED_PROPOSAL_NOTE },
            { id: 'b', status: 'applied', message: 'ok' },
            { id: 'c', status: 'rejected', message: EXPIRED_PROPOSAL_NOTE },
        ]);
    });

    it('liste en yeni önce', () => {
        const s = summarize([
            { id: 'a', owner: 'o', title: 'A', updatedAt: '2026-11-20T10:00:00Z', messages: [] },
            { id: 'b', owner: 'o', title: 'B', updatedAt: '2026-11-22T10:00:00Z', messages: [{ id: 1, role: 'user', content: 'x' }] },
        ]);
        expect(s.map(c => [c.id, c.count])).toEqual([['b', 1], ['a', 0]]);
    });
});
