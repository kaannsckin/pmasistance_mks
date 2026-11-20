import { describe, expect, it } from 'vitest';
import { splitFollowUps } from './followUps';
import { buildSuggestions } from './suggestions';

describe('takip önerileri', () => {
    it('yalnız sondaki ">> " satırları ayrılır; gövdedeki alıntılar kalır', () => {
        const r = splitFollowUps('ATLAS projesinde 20 geciken görev var.\n\n> Not: alıntı kalır\n\n>> Geciken görevlere yeni termin öner\n>> Bunu Excel olarak ver\n» "Riskleri göster"\n');
        expect(r.body).toBe('ATLAS projesinde 20 geciken görev var.\n\n> Not: alıntı kalır');
        expect(r.followUps).toEqual(['Geciken görevlere yeni termin öner', 'Bunu Excel olarak ver', 'Riskleri göster']);
    });

    it('akış sürerken yarım satır gizlenir; en çok üç, tekrarsız', () => {
        expect(splitFollowUps('Yanıt\n>').body).toBe('Yanıt');
        expect(splitFollowUps('Yanıt\n>> a1b\n>> a1b\n>> c2d\n>> e3f\n>> g4h').followUps).toEqual(['a1b', 'c2d', 'e3f']);
        expect(splitFollowUps('Öneri yok.').followUps).toEqual([]);
        expect(splitFollowUps('>> Ortada\nsonra metin').followUps).toEqual([]);
    });
});

describe('başlangıç önerileri', () => {
    it('veri durumu öne çıkar: geciken iş (düzenleyebilen için eylem), havuz eksikleri', () => {
        const py = buildSuggestions('py', 'ATLAS', { overdue: 20, canEditProject: true, hasWorklogs: true });
        expect(py[0].label).toBe('20 geciken görev: yeni termin öner');
        expect(py.map(s => s.label)).toContain('Bu ay kim ne kadar çalıştı?');
        expect(buildSuggestions('mudur', 'ATLAS', { overdue: 3 })[0].label).toBe('3 geciken görev');
        const pyb = buildSuggestions('pyb_destek', undefined, { canEditPool: true, titlesWithoutCost: 2, peopleWithoutTitle: 5 });
        expect(pyb.slice(0, 2).map(s => s.label)).toEqual(['2 ünvanın maliyeti eksik', '5 kişinin ünvanı yok']);
        expect(buildSuggestions('py')).toHaveLength(4);
    });
});
