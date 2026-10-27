import { describe, expect, it } from 'vitest';
import { createProject } from '../workspace';
import { cleanProjectProfile, PROFILE_HEADER, PROFILE_LIMITS, projectProfileLines, setProjectProfile, stripProfileSection, withProfileSection } from './projectProfile';

const NOW = new Date('2026-10-09T10:00:00Z');

describe('proje kartı', () => {
    it('sınırlar, boşluk sadeleştirme, tekrar terimler ve boş kart', () => {
        const c = cleanProjectProfile({
            summary: `  ${'a'.repeat(700)}  `,
            customers: 'Gebze   Belediyesi',
            product: '',
            glossary: [
                { term: 'KYS', explanation: 'Kurumsal Yazışma Sistemi' },
                { term: 'kys', explanation: 'tekrar' },
                { term: 'Boş', explanation: ' ' },
                ...Array.from({ length: 40 }, (_, k) => ({ term: `T${k}`, explanation: 'x'.repeat(300) })),
            ],
        }, NOW)!;
        expect(c.summary).toHaveLength(PROFILE_LIMITS.summary);
        expect(c.customers).toBe('Gebze Belediyesi');
        expect(c.product).toBeUndefined();
        expect(c.glossary).toHaveLength(PROFILE_LIMITS.terms);
        expect(c.glossary![0]).toEqual({ term: 'KYS', explanation: 'Kurumsal Yazışma Sistemi' });
        expect(c.glossary![1].explanation).toHaveLength(PROFILE_LIMITS.explanation);
        expect(c.updatedAt).toBe(NOW.toISOString());
        expect(cleanProjectProfile({ summary: '  ', glossary: [] })).toBeUndefined();
    });

    it('girdi satırları ve kart bölümünü çıkarma / ekleme', () => {
        const prof = { summary: 'E-posta ürünü.', glossary: [{ term: 'MD', explanation: 'Multi-domain' }] };
        expect(projectProfileLines(prof)).toEqual(['- Özet: E-posta ürünü.', '- Terimler: MD = Multi-domain']);
        const base = 'Proje: X\nHafta: 41. hafta\nHaftalık notlar:\n- 06.10: not';
        const withCard = withProfileSection(base, prof);
        expect(withCard).toBe(`Proje: X\nHafta: 41. hafta\n${PROFILE_HEADER}\n- Özet: E-posta ürünü.\n- Terimler: MD = Multi-domain\nHaftalık notlar:\n- 06.10: not`);
        expect(withProfileSection(withCard, prof)).toBe(withCard); // iki kez eklenmez
        expect(stripProfileSection(withCard)).toBe(base);
        expect(withProfileSection(base, undefined)).toBe(base);
    });

    it('yalnız proje sahibi PY kaydeder; boş kart alanı siler', () => {
        const p = createProject('Safir'); p.id = 'a'; p.pmPersonId = 'pm1';
        const ws = { projects: [p] };
        expect(setProjectProfile(ws, { role: 'py', personId: 'pm2' }, 'a', { summary: 'x' })).toBeNull();
        expect(setProjectProfile(ws, { role: 'bolum_sorumlu', personId: 'pm1' }, 'a', { summary: 'x' })).toBeNull();
        const saved = setProjectProfile(ws, { role: 'py', personId: 'pm1' }, 'a', { summary: 'Ürün' }, NOW)!;
        expect(saved[0].aiProfile).toEqual({ summary: 'Ürün', updatedAt: NOW.toISOString() });
        const cleared = setProjectProfile({ projects: saved }, { role: 'py', personId: 'pm1' }, 'a', { summary: '' }, NOW)!;
        expect('aiProfile' in cleared[0]).toBe(false);
    });
});
