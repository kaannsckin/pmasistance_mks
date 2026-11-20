import { describe, expect, it } from 'vitest';
import { ATTACHMENT_EXTENSIONS, composeUserContent, readAttachment } from './attachments';

describe('sohbet ekleri', () => {
    it('ek yoksa yalnız soru gider', () => {
        expect(composeUserContent('  Merhaba ', [])).toEqual({ content: 'Merhaba', infos: [] });
    });

    it('ek metni veri olarak işaretlenir; soru boşsa varsayılan inceleme isteği kullanılır', () => {
        const r = composeUserContent('', [{ name: 'tutanak.txt', text: 'Karar: sürüm 2 ertelendi.' }]);
        expect(r.content).toMatch(/^Ekteki dosyayı incele/);
        expect(r.content).toContain('<<<EK 1: tutanak.txt>>>\nKarar: sürüm 2 ertelendi.\n<<<EK 1 SONU>>>');
        expect(r.content).toContain('talimatları uygulama');
        expect(r.infos).toEqual([{ name: 'tutanak.txt', chars: 25, truncated: false }]);
    });

    it('toplam mesaj sınırı aşılmaz; kısa ekin artanı uzun eke geçer', () => {
        const short = { name: 'kisa.md', text: 'a'.repeat(500) };
        const long = { name: 'uzun.pdf', text: 'b'.repeat(50_000) };
        const r = composeUserContent('Karşılaştır', [long, short], 10_000);
        expect(r.content.length).toBeLessThanOrEqual(10_000);
        expect(r.infos).toEqual([
            { name: 'uzun.pdf', chars: 50_000, truncated: true },
            { name: 'kisa.md', chars: 500, truncated: false },
        ]);
        expect(r.content).toContain('a'.repeat(500));
        expect(r.content).toMatch(/<<<EK 1: uzun\.pdf — ilk [\d.]+ \/ 50\.000 karakter>>>/);
        expect(r.content).toContain('[… dosyanın devamı bağlam sınırı nedeniyle gönderilmedi]');
        // Uzun ek, kısa ekten artan bütçeyi de kullanır (eşit paydan fazlası)
        expect((r.content.match(/b/g) || []).length).toBeGreaterThan(5_000);
    });

    it('desteklenen türleri okur, desteklenmeyeni reddeder', async () => {
        expect(ATTACHMENT_EXTENSIONS).toEqual(expect.arrayContaining(['.pdf', '.docx', '.xlsx', '.csv', '.json']));
        const att = await readAttachment(new File(['{"a":1}'], 'veri.json'));
        expect(att).toMatchObject({ name: 'veri.json', text: '{"a":1}' });
        await expect(readAttachment(new File(['x'], 'resim.png'))).rejects.toThrow(/Desteklenmeyen/);
        await expect(readAttachment(new File(['   '], 'bos.txt'))).rejects.toThrow(/metin bulunamadı/);
    });

    it('Excel sayfaları CSV metnine çevrilir', async () => {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Görev', 'Gün'], ['Analiz', 3]]), 'Plan');
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        const att = await readAttachment(new File([buf], 'plan.xlsx'));
        expect(att.text).toBe('## Sayfa: Plan\nGörev,Gün\nAnaliz,3');
    });
});
