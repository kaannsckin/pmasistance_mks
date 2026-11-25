import { describe, expect, it } from 'vitest';
import {
    applyFilters, columnIndex, correlation, DataTable, distribution, groupBy, outliers, percentile, pivot, profile, tableFromGrid, topRows, trend,
} from './dataAnalysis';

const T: DataTable = {
    name: 'worklog.xlsx / Kasım',
    columns: ['Kişi', 'Bölüm', 'Tarih', 'Saat', 'Maliyet (TL)'],
    rows: [
        ['Ayşe', 'U310', '2026-09-03', 10, 6000],
        ['Ayşe', 'U310', '2026-10-05', 20, 12000],
        ['Ali', 'U320', '2026-10-06', 5, 2500],
        ['Ali', 'U320', '2026-11-02', 15, 7500],
        ['Mehmet', 'U310', '2026-11-03', 40, 24000],
        ['Zeynep', 'U330', '03.11.2026', 8, 4000],
        ['Toplam', null, null, 98, 56000],
    ],
};
const body = applyFilters(T, [{ sutun: 'Kişi', op: '!=', deger: 'Toplam' }]);

describe('hesap motoru', () => {
    it('sütun adı büyük/küçük harf, Türkçe karakter ve kısmi ad duyarsız bulunur', () => {
        expect(columnIndex(T, 'kisi')).toBe(0);
        expect(columnIndex(T, 'MALİYET')).toBe(4);
        expect(() => columnIndex(T, 'Proje')).toThrow(/Sütunlar: Kişi/);
    });

    it('profil: türler, istatistikler ve veri kalitesi uyarıları (toplam satırı yakalanır)', () => {
        const p = profile(T);
        expect(p.satir).toBe(7);
        const saat = p.sutunlar.find(c => c.sutun === 'Saat')!;
        expect(saat).toMatchObject({ tur: 'sayı', toplam: 196, max: 98 });
        expect(p.sutunlar.find(c => c.sutun === 'Tarih')!).toMatchObject({ tur: 'tarih', min: '2026-09-03', max: '2026-11-03' });
        expect(p.veri_kalitesi!.join(' ')).toMatch(/toplam satırı/);
    });

    it('süzgeç: sayı, metin, içerir, boş', () => {
        expect(applyFilters(T, [{ sutun: 'Saat', op: '>=', deger: '15' }]).length).toBe(4);
        expect(applyFilters(T, [{ sutun: 'bölüm', op: 'bos' }]).length).toBe(1);
        expect(applyFilters(T, [{ sutun: 'Kişi', op: 'icerir', deger: 'ay' }]).map(r => r[0])).toEqual(['Ayşe', 'Ayşe']);
        expect(applyFilters(T, [{ sutun: 'Tarih', op: '>=', deger: '2026-11-01' }]).length).toBe(3);
    });

    it('ozet: grupla, ölç, pay ve genel toplam; ara toplamlar genel toplamı tutar', () => {
        const r = groupBy(T, body, ['Bölüm'], [{ sutun: 'Saat', fonk: 'toplam' }, { fonk: 'say' }]);
        expect(r.genel_toplam).toEqual({ 'Saat toplam': 98 });
        expect(r.satirlar[0]).toMatchObject({ Bölüm: 'U310', 'Saat toplam': 70, 'kayıt sayısı': 3, 'pay %': 71.4 });
        const sum = r.satirlar.reduce((s, x) => s + (x['Saat toplam'] as number), 0);
        expect(sum).toBe(98);
    });

    it('pivot: satır × sütun ve satır toplamı', () => {
        const r = pivot(T, body, 'Kişi', 'Bölüm', { sutun: 'Saat', fonk: 'toplam' });
        expect(r.sutunlar).toEqual(['U310', 'U320', 'U330']);
        expect(r.satirlar[0]).toMatchObject({ Kişi: 'Mehmet', U310: 40, Toplam: 40 });
    });

    it('trend: aylık seri, değişim ve eğilim; TR tarih biçimi de okunur', () => {
        const r = trend(T, body, 'Tarih', { sutun: 'Saat', fonk: 'toplam' }, 'ay');
        expect(r.satirlar.map(s => s.donem)).toEqual(['2026-09', '2026-10', '2026-11']);
        expect(r.satirlar.map(s => s['Saat toplam'])).toEqual([10, 25, 63]);
        expect(r.satirlar[1]['değişim %']).toBe(150);
        expect(r.egilim).toBe('artış');
        expect(r.zirve).toEqual({ donem: '2026-11', deger: 63 });
    });

    it('dağılım, aykırı değer, korelasyon', () => {
        expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
        const d = distribution(T, body, 'Saat', 4);
        expect(d).toMatchObject({ adet: 6, ortanca: 12.5, min: 5, max: 40 });
        expect(d.histogram.reduce((s, h) => s + h.adet, 0)).toBe(6);
        const o = outliers(T, body, 'Saat', ['Kişi']);
        expect(o.satirlar[0]).toMatchObject({ Kişi: 'Mehmet', Saat: 40, yön: 'yüksek' });
        const c = correlation(T, body, 'Saat', 'Maliyet');
        expect(c.r).toBeGreaterThan(0.99);
        expect(c.yorum).toMatch(/güçlü pozitif/);
    });

    it('satirlar: sırala ve ilk N', () => {
        const r = topRows(T, body, { sirala: 'Maliyet', limit: 2, sutunlar: ['Kişi', 'Maliyet (TL)'] });
        expect(r.satirlar).toEqual([{ Kişi: 'Mehmet', 'Maliyet (TL)': 24000 }, { Kişi: 'Ayşe', 'Maliyet (TL)': 12000 }]);
    });

    it('tablo okuma: başlık satırı bulunur (üstteki başlık/logo atlanır), boş sütun atılır, ad çakışması çözülür', () => {
        const t = tableFromGrid('rapor.xlsx / Sayfa1', [
            ['ATLAS Bütçe Raporu'],
            [],
            ['Kalem', 'Tutar', null, 'Tutar'],
            ['Donanım', '1.250,5', null, 3],
            ['Lisans', 800, null, 4],
            [new Date(Date.UTC(2026, 10, 3)), null, null, null],
        ])!;
        expect(t.columns).toEqual(['Kalem', 'Tutar', 'Tutar (2)']);
        expect(t.rows[0]).toEqual(['Donanım', 1250.5, 3]);
        expect(t.rows[2][0]).toBe('2026-11-03');
    });
});
