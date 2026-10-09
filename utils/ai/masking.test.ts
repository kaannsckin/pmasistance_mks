import { describe, expect, it } from 'vitest';
import { buildMasker, collectMaskEntries, harmonizeSuffix, mapStrings, MaskEntry } from './masking';

const ENTRIES: MaskEntry[] = [
    { kind: 'person', name: 'Ali Veli', aliases: ['Veli Ali'] },
    { kind: 'person', name: 'Murat Kaan Seçkin', aliases: ['Seçkin Murat Kaan'] },
    { kind: 'person', name: 'İsmail Işık' },
    { kind: 'project', name: 'Safir' },
    { kind: 'customer', name: 'Gebze Belediyesi' },
];
const m = buildMasker(ENTRIES);
const tokenOf = (name: string) => m.mask(name);

describe('ad maskeleme', () => {
    it('kişi, proje ve kurum adları takma adla gider; geri çevrilince aynı metin', () => {
        const text = 'Ali Veli ve Murat Kaan Seçkin, Safir projesinde Gebze Belediyesi için çalışıyor.';
        const masked = m.mask(text);
        expect(masked).not.toMatch(/Ali|Veli|Murat|Seçkin|Safir|Gebze/);
        expect(masked).toMatch(/^Kişi-\d{4} ve Kişi-\d{4}, Proje-\d{4} projesinde Kurum-\d{4} için çalışıyor\.$/);
        expect(m.unmask(masked)).toBe(text);
        expect(m.size).toBe(5);
    });

    it('takma adlar kalıcı: aynı ad her seferinde aynı takma ad; varlık listesinin sırası etkilemez', () => {
        const again = buildMasker([...ENTRIES].reverse());
        for (const e of ENTRIES) expect(again.mask(e.name)).toBe(tokenOf(e.name));
        expect(tokenOf('Ali Veli')).toMatch(/^Kişi-\d{4}$/);
        expect(new Set(ENTRIES.map(e => tokenOf(e.name))).size).toBe(ENTRIES.length);
    });

    it('Türkçe büyük/küçük harf, "Soyad Ad" sırası, fazla boşluk aynı takma ada gider', () => {
        const t = tokenOf('Ali Veli');
        expect(m.mask('ALİ VELİ')).toBe(t);
        expect(m.mask('veli  ali')).toBe(t);
        expect(m.mask('ismail ışık')).toBe(tokenOf('İsmail Işık'));
        expect(m.mask('murat kaan seçkin')).toBe(tokenOf('Murat Kaan Seçkin'));
    });

    it('kelime sınırı: başka kelimenin içi maskelenmez; kesme işaretli ek korunur', () => {
        expect(m.mask('Safirler ve Ali Velioğlu')).toBe('Safirler ve Ali Velioğlu');
        expect(m.mask("Ali Veli'nin görevi")).toBe(`${tokenOf('Ali Veli')}'nin görevi`);
    });

    it('modelin takma ada getirdiği ek gerçek adın ses uyumuna göre düzeltilir', () => {
        const ali = tokenOf('Ali Veli'), murat = tokenOf('Murat Kaan Seçkin'), gebze = tokenOf('Gebze Belediyesi'), safir = tokenOf('Safir');
        expect(m.unmask(`${ali}'in kapasitesi`)).toBe("Ali Veli'nin kapasitesi");
        expect(m.unmask(`${murat}'ün görevi`)).toBe("Murat Kaan Seçkin'in görevi");
        expect(m.unmask(`${ali}'e atandı`)).toBe("Ali Veli'ye atandı");
        expect(m.unmask(`${safir}'de gecikme`)).toBe("Safir'de gecikme");
        expect(m.unmask(`${gebze}'dan geldi`)).toBe("Gebze Belediyesi'den geldi");
        expect(m.unmask(`${murat}'la görüşüldü`)).toBe("Murat Kaan Seçkin'le görüşüldü");
    });

    it('bilinmeyen takma ad ve 5 haneli sayı dokunulmadan kalır', () => {
        expect(m.unmask('Kişi-0001 ve Kişi-12345')).toBe('Kişi-0001 ve Kişi-12345');
    });

    it('akış: sonda yarım kalan takma ad gösterilmez (yanlış kişi bir an bile görünmesin)', () => {
        const t = tokenOf('Ali Veli');
        expect(m.unmaskPartial(`Sorumlu ${t.slice(0, 6)}`)).toBe('Sorumlu ');
        expect(m.unmaskPartial('Sorumlu Ki')).toBe('Sorumlu ');
        expect(m.unmaskPartial(`Sorumlu ${t}'ni`)).toBe('Sorumlu ');
        expect(m.unmaskPartial(`Sorumlu ${t} oldu`)).toBe('Sorumlu Ali Veli oldu');
        expect(m.unmaskPartial('Kurumsal hedef')).toBe('Kurumsal hedef');
    });

    it('araç argümanları iç içe maskelenir ve geri çevrilir', () => {
        const args = { kisi: 'Ali Veli', liste: ['Safir', { ad: 'Gebze Belediyesi' }], n: 3 };
        const masked = mapStrings(args, m.mask);
        expect(JSON.stringify(masked)).not.toMatch(/Ali|Safir|Gebze/);
        expect(mapStrings(masked, m.unmask)).toEqual(args);
    });

    it('tek kelimelik ad yalnız büyük harfle başlıyorsa eşleşir (sıradan kelime maskelenmez)', () => {
        const w = buildMasker([{ kind: 'project', name: 'Atlas' }, { kind: 'person', name: 'umut' }]);
        expect(w.mask('Atlas projesi; dünya atlası; ATLAS')).toBe(`${w.mask('Atlas')} projesi; dünya atlası; ${w.mask('Atlas')}`);
        expect(w.mask('umut ediyoruz, Umut geldi')).toBe(`umut ediyoruz, ${w.mask('Umut')} geldi`);
        expect(w.mask('Atlas')).toMatch(/^Proje-\d{4}$/);
    });

    it('çok kısa ya da sayısal adlar ve kısa proje adları maskelenmez', () => {
        const short = buildMasker([{ kind: 'person', name: 'Al' }, { kind: 'project', name: 'ABC' }, { kind: 'customer', name: '123' }]);
        expect(short.size).toBe(0);
        expect(short.mask('Al ABC 123')).toBe('Al ABC 123');
    });
});

describe('ek uyumu', () => {
    it('ilgi, belirtme, yönelme, bulunma, ayrılma, vasıta', () => {
        expect(harmonizeSuffix('Seçkin', 'nin')).toBe('in');
        expect(harmonizeSuffix('Ali', 'ın')).toBe('nin');
        expect(harmonizeSuffix('Burak', 'i')).toBe('ı');
        expect(harmonizeSuffix('Ayşe', 'a')).toBe('ye');
        expect(harmonizeSuffix('Ahmet', 'de')).toBe('te');
        expect(harmonizeSuffix('Okul', 'den')).toBe('dan');
        expect(harmonizeSuffix('Gül', 'la')).toBe('le');
        expect(harmonizeSuffix('Ankara', 'deki')).toBe('daki');
        expect(harmonizeSuffix('Ali', 'lerden')).toBe('lerden');
    });
});

describe('çalışma alanından adlar', () => {
    it('kişiler (iki sıra), proje ve kaynak adları, rapor/onay alanları, müşteri adları', () => {
        const ws = {
            people: [{ id: 'p1', firstName: 'Ali', lastName: 'Veli', departmentCode: 'U310', availableAA: 1, roles: [] }],
            projects: [{
                id: 'x', name: 'Safir', resources: [{ id: 'r1', name: 'Ayşe Kaya' }],
                tasks: [{ id: 't', name: 'Görev', resourceName: 'Mehmet Demir, Zeynep Ak' }],
                customerRequests: [{ id: 'c', customerName: 'Gebze Belediyesi' }],
            }],
            weeklyReports: [{ id: 'w', authorName: 'Elif Su', history: [{ byName: 'Can Öz' }] }],
        } as never;
        const entries = collectMaskEntries(ws);
        const names = entries.map(e => `${e.kind}:${e.name}`);
        expect(names).toEqual(expect.arrayContaining([
            'person:Ali Veli', 'project:Safir', 'person:Ayşe Kaya', 'person:Mehmet Demir', 'person:Zeynep Ak', 'customer:Gebze Belediyesi', 'person:Elif Su', 'person:Can Öz',
        ]));
        expect(entries.find(e => e.name === 'Ali Veli')?.aliases).toEqual(['Veli Ali']);
        const masker = buildMasker(entries);
        expect(masker.mask('Ayşe Kaya, Elif Su ve Can Öz')).not.toMatch(/Ayşe|Elif|Can Öz/);
    });
});
