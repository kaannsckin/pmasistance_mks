import { describe, it, expect } from 'vitest';
import { applyPoolImport, parsePoolSheets, PoolSheets } from './poolImporter';
import { createEmptyWorkspace, createProject } from './workspace';

/** Gerçek U310 İşgücü Tahsisi dosyasının yapısını taklit eden fixture */
const sampleSheets = (): PoolSheets => ({
    'Personel Listesi': [
        ['AD SOYAD', 'SİCİL', 'AD', 'SOYAD', 'EMY', 'BÖLÜM', 'UNVAN', 'Kullanılabilir AA', 'Rol-01', 'Rol-02'],
        ['=CONCATENATE(...)', '1234', 'MURAT KAAN', 'SEÇKİN', 'U300', 'U310', 'ARŞ', 1, 'Proje Yönetici Yardımcısı', ''],
        ['=CONCATENATE(...)', '5678', 'AYŞE', 'YILMAZ', 'U300', 'U310', 'UAR', 0.5, 'Yazılım Geliştirme Mühendisi, Proje Teknik Lideri', ''],
        ['=CONCATENATE(...)', '', 'YENİ AD  1', 'YENİ SOYAD 1', '', '', '', 1, '', ''], // şablon satırı — atlanmalı
    ],
    'Bölümler': [
        ['Kodu', 'Adı', 'Bölüm Sorumlusu', 'Dahili', 'Faaliyet Kodu'],
        ['U310', 'Yazılım Bölümü', 'Mehmet Demir', '1234', 'U310'],
        ['', '', '', '', ''], // boş satır — atlanmalı
        ['B700', 'Gömülü Sistemler', '', '', 'B700'],
    ],
    'Roller': [
        ['BÖLÜM', 'ROLLER', 'Personel Sayısı'],
        ['B700', 'Yazılım Geliştirme Mühendisi', 0],
        ['B700', 'Proje Teknik Lideri', 0],
        ['B700', 'Yazılım Geliştirme Mühendisi', 0], // tekrar — dedupe edilmeli
    ],
    'Diğer Tablolar': [
        [],
        ['', 'Kısaltma', 'Ünvan', '', 'Yetkinlik', 'Açıklama'],
        ['', 'ADA', 'Aday Araştırmacı', '', 'Mekanik Tasarım', ''],
        ['', 'ARŞ', 'Araştırmacı', '', 'Kablaj', ''],
        ['', '', '', '', '', ''],
    ],
    'Projeler': [
        ['Kısa Adı', 'SAP Kodu', 'Proje Yöneticisi', 'Proje Teknik Lideri', 'Açık Adı', 'Faaliyet Kodu'],
        ['Proje 1', '100857', 'Murat Kaan Seçkin', '', 'Proje 1 Açık Ad', ''],
        ['Proje 2', '100654', 'Murat Kaan Seçkin', '', '', ''],
    ],
    'İş Paketleri': [
        ['PROJE Proje 1', 'PROJE Proje 2'],
        ['Proje Yönetimi', 'Proje Yönetimi İP'],
        ['Sistem Mühendisliği İP', 'FPGA İP'],
        ['', 'Doğrulama ve Geçerleme İP'],
    ],
    'Veri Girişi': [
        ['AD - SOYAD', 'SİCİL', 'BÖLÜM', 'UNVAN', 'ROL', 'PROJE', 'Proje Durumu', 'Kayıt Tipi', 'Yıl',
         'OCAK', 'OCAK.G', 'ŞUBAT', 'ŞUBAT.G', 'MART', 'MART.G', 'NİSAN', 'NİSAN.G', 'MAYIS', 'MAYIS.G',
         'HAZİRAN', 'HAZİRAN.G', 'TEMMUZ', 'TEMMUZ.G', 'AĞUSTOS', 'AĞUSTOS.G', 'EYLÜL', 'EYLÜL.G',
         'EKİM', 'EKİM.G', 'KASIM', 'KASIM.G', 'ARALIK', 'ARALIK.G', 'Yıllık AA', 'Yıllık AA.G'],
        ['MURAT KAAN SEÇKİN', '1234', 'U310', 'ARŞ', 'Proje Yönetici Yardımcısı', 'Proje 1', 'Devam Eden', 'Planlanan', 2026,
         0.35, 0.4, '0,35', '', 0.35, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['BİLİNMEYEN KİŞİ', '', 'U310', '', '', 'Proje 1', 'Devam Eden', 'Planlanan', 2026,
         0.2, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ],
});

describe('parsePoolSheets', () => {
    it('personeli şablon satırlarını atlayarak okur; virgüllü çoklu rolleri ayırır', () => {
        const res = parsePoolSheets(sampleSheets());
        expect(res.people).toHaveLength(2);
        const kaan = res.people[0];
        expect(kaan.sicil).toBe('1234');
        expect(kaan.departmentCode).toBe('U310');
        expect(kaan.titleCode).toBe('ARŞ');
        expect(kaan.availableAA).toBe(1);
        const ayse = res.people[1];
        expect(ayse.availableAA).toBe(0.5);
        expect(ayse.roles).toEqual(['Yazılım Geliştirme Mühendisi', 'Proje Teknik Lideri']);
    });

    it('bölüm, rol kataloğu (dedupe) ve ünvanları okur', () => {
        const res = parsePoolSheets(sampleSheets());
        expect(res.departments.map(d => d.code)).toEqual(['U310', 'B700']);
        expect(res.departments[0].leadName).toBe('Mehmet Demir');
        expect(res.roleCatalog).toHaveLength(2); // tekrar satır dedupe edildi
        expect(res.titles).toEqual([
            { code: 'ADA', name: 'Aday Araştırmacı' },
            { code: 'ARŞ', name: 'Araştırmacı' },
        ]);
    });

    it('projeleri ve kolon bazlı iş paketlerini okur', () => {
        const res = parsePoolSheets(sampleSheets());
        expect(res.projects).toHaveLength(2);
        expect(res.projects[0]).toMatchObject({ shortName: 'Proje 1', sapCode: '100857' });
        expect(res.workPackagesByProject['Proje 1']).toEqual(['Proje Yönetimi', 'Sistem Mühendisliği İP']);
        expect(res.workPackagesByProject['Proje 2']).toHaveLength(3);
    });

    it('Veri Girişi satırlarını plan + gerçekleşen (.G) çiftleriyle okur; virgüllü ondalığı çözer', () => {
        const res = parsePoolSheets(sampleSheets());
        expect(res.allocationRows).toHaveLength(2);
        const row = res.allocationRows[0];
        expect(row.year).toBe(2026);
        expect(row.plan[1]).toBeCloseTo(0.35);
        expect(row.plan[2]).toBeCloseTo(0.35); // "0,35" string
        expect(row.actual[1]).toBeCloseTo(0.4); // OCAK.G
        expect(row.actual[2]).toBeUndefined();
    });

    it('eksik sayfalarda çökmez', () => {
        const res = parsePoolSheets({ 'Bölümler': [['Kodu', 'Adı'], ['U310', 'Yazılım']] });
        expect(res.people).toHaveLength(0);
        expect(res.departments).toHaveLength(1);
    });
});

describe('applyPoolImport', () => {
    it('havuzu birleştirir: yeni proje oluşturur, mevcut projeyi adıyla eşler, İP ekler', () => {
        const ws = { ...createEmptyWorkspace(), projects: [createProject('Proje 1')] };
        const { workspace, summary } = applyPoolImport(ws, parsePoolSheets(sampleSheets()));
        expect(summary.peopleAdded).toBe(2);
        expect(summary.projectsMatched).toBe(1); // Proje 1 mevcut
        expect(summary.projectsCreated).toBe(1); // Proje 2 oluşturuldu
        const p1 = workspace.projects.find(p => p.name === 'Proje 1')!;
        expect(p1.code).toBe('100857'); // SAP kodu eşlenen projeye yazıldı
        expect(p1.workPackages.map(w => w.name)).toContain('Sistem Mühendisliği İP');
    });

    it('tahsisleri kişi/proje eşleyerek ekler; eşleşmeyeni uyarıyla atlar', () => {
        const { workspace, summary } = applyPoolImport(createEmptyWorkspace(), parsePoolSheets(sampleSheets()));
        expect(summary.allocationsAdded).toBe(1); // sadece Kaan eşleşti
        expect(summary.warnings.some(w => w.includes('BİLİNMEYEN KİŞİ'))).toBe(true);
        const a = workspace.allocations[0];
        expect(a.year).toBe(2026);
        expect(a.plan[1]).toBeCloseTo(0.35);
        expect(a.actual[1]).toBeCloseTo(0.4);
        expect(a.role).toBe('Proje Yönetici Yardımcısı');
    });

    it('ikinci içe aktarma kişi/tahsisi çoğaltmaz, günceller', () => {
        const first = applyPoolImport(createEmptyWorkspace(), parsePoolSheets(sampleSheets()));
        const second = applyPoolImport(first.workspace, parsePoolSheets(sampleSheets()));
        expect(second.summary.peopleAdded).toBe(0);
        expect(second.summary.peopleUpdated).toBe(2);
        expect(second.summary.allocationsAdded).toBe(0);
        expect(second.summary.allocationsUpdated).toBe(1);
        expect(second.workspace.people).toHaveLength(2);
        expect(second.workspace.allocations).toHaveLength(1);
    });
});
