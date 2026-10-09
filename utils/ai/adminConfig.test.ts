import { describe, expect, it } from 'vitest';
import { draftValues, GEMINI_BASE_URL, geminiQuickValues } from './adminConfig';

describe('AI bağlantı formu', () => {
    it('boş anahtar gönderilmez (kayıtlı kalır); sil işaretliyse boş gider; diğer alanlar olduğu gibi', () => {
        const d = draftValues({ AI_PROVIDER: 'openai', AI_MODEL: ' m1 ', AI_API_KEY: '', AI_EMBEDDING_API_KEY: 'sk-e' }, { AI_API_KEY: false });
        expect(d.AI_MODEL).toBe('m1');
        expect('AI_API_KEY' in d).toBe(false);
        expect(d.AI_EMBEDDING_API_KEY).toBe('sk-e');
        expect(d.AI_BASE_URL).toBe(''); // boş → ortam değişkeni
        expect(draftValues({ AI_API_KEY: 'yeni' }, { AI_API_KEY: true }).AI_API_KEY).toBe('');
    });

    it('Gemini hızlı kurulum: yalnız anahtar; adres açık, model ve embedding otomatik, ortamdaki başka ayar silinir', () => {
        const v = geminiQuickValues(' AIza-x ');
        expect(v).toMatchObject({ AI_PROVIDER: 'gemini', AI_BASE_URL: GEMINI_BASE_URL, AI_MODEL: 'auto', AI_API_KEY: 'AIza-x', AI_EMBEDDING_MODEL: 'auto', AI_EMBEDDING_API_KEY: 'AIza-x', AI_REASONING_EFFORT: '' });
        // Form taslağı üzerinden gönderildiğinde anahtar korunur
        expect(draftValues(v).AI_API_KEY).toBe('AIza-x');
    });
});
