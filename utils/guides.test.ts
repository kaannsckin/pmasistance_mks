import { afterEach, describe, expect, it } from 'vitest';
import { GUIDES, guideSeen, markGuideSeen, startStepFor } from './guides';

describe('sayfa rehberleri', () => {
    it('her adımda başlık, açıklama, kullanım adımları ve örnek senaryo var', () => {
        Object.values(GUIDES).forEach(g => {
            expect(g.steps.length).toBeGreaterThanOrEqual(5);
            expect(new Set(g.steps.map(s => s.id)).size).toBe(g.steps.length);
            g.steps.forEach(s => {
                expect(s.title.trim()).not.toBe('');
                expect(s.summary.length).toBeGreaterThan(40);
                expect(s.how.length).toBeGreaterThanOrEqual(2);
                expect(s.scenario.text.length).toBeGreaterThan(60);
            });
        });
    });

    it('"?" açık kipin adımından başlar', () => {
        const g = GUIDES.planning;
        expect(startStepFor(g)).toBe(0);
        expect(g.steps[startStepFor(g, 'release')].id).toBe('release');
        expect(g.steps[startStepFor(g, 'simulate')].id).toBe('simulate');
        expect(g.steps[startStepFor(g, 'record')].id).toBe('record');
        expect(startStepFor(GUIDES.forecast, 'release')).toBe(0);
    });

    describe('görüldü bilgisi', () => {
        const original = (globalThis as { localStorage?: Storage }).localStorage;
        afterEach(() => { (globalThis as { localStorage?: Storage }).localStorage = original; });
        it('tarayıcıda saklanır; sürüm artınca yeniden gösterilir; depolama yoksa hata vermez', () => {
            const mem = new Map<string, string>();
            (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
            expect(guideSeen('planning')).toBe(false);
            markGuideSeen('planning');
            expect(guideSeen('planning')).toBe(true);
            expect(guideSeen('forecast')).toBe(false);
            mem.set('PLANASISTAN_GUIDES_V1', JSON.stringify({ planning: GUIDES.planning.version - 1 }));
            expect(guideSeen('planning')).toBe(false);
            (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error('kapalı'); }, setItem: () => { throw new Error('kapalı'); } };
            expect(guideSeen('planning')).toBe(false);
            expect(() => markGuideSeen('planning')).not.toThrow();
        });
    });
});
