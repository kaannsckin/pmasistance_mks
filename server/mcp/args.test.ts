import { describe, expect, it } from 'vitest';
import { AI_TOOLS } from '../../utils/ai/tools';
import { validateArgs } from './args';

const schema = (name: string) => AI_TOOLS.find(t => t.spec.name === name)!.spec.parameters;

describe('araç argümanı denetimi', () => {
    it('bilinmeyen parametre geçerli parametreleri sayan bir hata verir', () => {
        const r = validateArgs('gorev_ara', schema('gorev_ara'), { gecikme: true });
        expect('error' in r && r.error).toContain('"gecikme" bu aracın parametresi değil');
        expect('error' in r && r.error).toContain('geciken (true|false)');
    });

    it('geçersiz seçenek reddedilir (tahsis_ozeti alan: gerceklesen)', () => {
        const r = validateArgs('tahsis_ozeti', schema('tahsis_ozeti'), { alan: 'gerceklesen' });
        expect('error' in r && r.error).toContain('geçerli: plan, actual');
    });

    it('metin olarak gelen sayı ve mantıksal değerler dönüştürülür; boşlar atılır', () => {
        const r = validateArgs('gorev_ara', schema('gorev_ara'), { geciken: 'true', limit: '5', kisi: '' });
        expect(r).toEqual({ args: { geciken: true, limit: 5 } });
        expect('error' in validateArgs('gorev_ara', schema('gorev_ara'), { limit: 'beş' })).toBe(true);
        expect('error' in validateArgs('oner_tahsis_ayarla', schema('oner_tahsis_ayarla'), { kisi: 'A', proje: 'B', ay: 2.5, aa: 1 })).toBe(true);
    });

    it('zorunlu parametre eksikse söyler; seçenekli metin listesi kabul edilir', () => {
        const r = validateArgs('bilgi_ara', schema('bilgi_ara'), { kaynak: 'not' });
        expect('error' in r && r.error).toContain('Zorunlu parametre eksik: sorgu');
        expect(validateArgs('bilgi_ara', schema('bilgi_ara'), { sorgu: 'x', kaynak: ['not', 'risk'] })).toEqual({ args: { sorgu: 'x', kaynak: ['not', 'risk'] } });
        expect('error' in validateArgs('bilgi_ara', schema('bilgi_ara'), { sorgu: 'x', kaynak: ['not', 'yok'] })).toBe(true);
    });
});
