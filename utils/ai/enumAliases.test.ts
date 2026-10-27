import { describe, expect, it } from 'vitest';
import { normalizeEnumArgs, normalizeEnumValue } from './enumAliases';
import type { JsonSchema } from './protocol';

describe('seçenekli parametrelerde Türkçe karşılıklar (B-009)', () => {
    it('RAG: Yolunda/Riskli/Kritik ve renk adları koda çevrilir', () => {
        const rag = ['green', 'amber', 'red'];
        expect(['Yolunda', 'yeşil', 'Riskli', 'SARI', 'Kritik', 'kırmızı', 'RED'].map(v => normalizeEnumValue(v, rag)))
            .toEqual(['green', 'green', 'amber', 'amber', 'red', 'red', 'red']);
    });

    it('aynı sözcük parametreye göre farklı koda gider; tanınmayan değer olduğu gibi kalır', () => {
        expect(normalizeEnumValue('kritik', ['Blocker', 'High', 'Medium', 'Low'])).toBe('Blocker');
        expect(normalizeEnumValue('tamamlandı', ['Backlog', 'ToDo', 'InProgress', 'Done'])).toBe('Done');
        expect(normalizeEnumValue('tamamlandı', ['devam', 'teklif', 'beklemede', 'tamamlandi'])).toBe('tamamlandi');
        expect(normalizeEnumValue('kapandı', ['open', 'monitoring', 'closed'])).toBe('closed');
        expect(normalizeEnumValue('devam ediyor', ['Backlog', 'ToDo', 'InProgress', 'Done'])).toBe('InProgress');
        expect(normalizeEnumValue('gerceklesen', ['plan', 'actual'])).toBe('gerceklesen');
        expect(normalizeEnumValue(3, ['a'])).toBe(3);
    });

    it('argümanlar şemaya göre çevrilir; değişiklik yoksa aynı nesne döner', () => {
        const schema: JsonSchema = { type: 'object', properties: { rag: { type: 'string', enum: ['green', 'amber', 'red'] }, not: { type: 'string' } } };
        expect(normalizeEnumArgs(schema, { rag: 'Kritik', not: 'Kritik' })).toEqual({ rag: 'red', not: 'Kritik' });
        const same = { rag: 'red' };
        expect(normalizeEnumArgs(schema, same)).toBe(same);
    });
});
