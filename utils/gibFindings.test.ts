import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { Person, TaskStatus } from '../types';
import {
    applyGibImport,
    findImportedProject,
    findPersonByName,
    formatPercent,
    isGibWorkbook,
    num,
    parseGibWorkbook,
    toIsoDate,
    WorkbookMatrices,
    workbookToMatrices,
} from './gibFindings';
import { createEmptyWorkspace, createProject } from './workspace';

// Gerçek dosyanın düzenini taklit eden küçük, uydurma bir çalışma kitabı.
// Formül sütunları (Sorumlu, Epic, İş Kodu) bilerek boş: dosyada hesaplanmış
// değer olmasa da ham girdilerden türetilmeli.
const GENEL: unknown[][] = [
    ['Kurum – PoC Bulguları Genel Önem Sıralaması'],
    ['Sıra', 'Önem Kademesi', 'Test No', 'Alan', 'Önem', 'Başlık', 'PoC Sonucu', 'Rapor Referansı', 'Rapordaki Tespit',
        'Hata Kaydı (Ek-1)', 'Beklenen Sonuç (Test Prosedürü)', 'Test Notu (Test Prosedürü)', 'Sorumlu (eforu > 0 olan ekipler)',
        'Atanan (kişi)', 'Jira / CR No', 'Durum', 'İlerleme', 'Başlangıç', 'Hedef Tarih', 'Kapanış', 'Kalan Gün', 'Gecikme',
        'Güncel Sonuç', 'Sorular', 'MS', 'MS Notları', 'EMS (gün)', 'İstemci (gün)', 'Test (gün)', 'Dizin (gün)',
        'Efor Kaynağı (CR / Task Kodu)', 'Öncelik', 'Aksiyon / Çözüm Planı', 'İş Kodu (Task / Sub-task)', 'Epic'],
    [1, '1 – Rapor 5.1 öncelikli bulgu', 'I-01', 'I. Kimlik', 'Zorunlu', 'Parola politikası', 'Karşılanmadı', 'Rapor 5.1 – Sıra 1',
        'Uzun parola desteklenmiyor.', 'HTA-01 (Kritik)', 'Uzun parola kabul edilir.', 'Not 1', null,
        'Ayşe', 'ABC-101', '', null, null, 46350, null, null, null,
        'hızlı aksiyon', 'Kural listesi?', 0, '', 2, '0,5', 0, 0, '', 10, 'Politika genişletilecek', null, null],
    [2, '2 – Zorunlu / Karşılanmadı', 'I-02', 'I. Kimlik', 'Zorunlu', 'Hesap kilitleme', 'Kısmen karşılandı', 'Test notu',
        '', '', 'Hesap kilitlenir.', '', null,
        'Ayşe, Mehmet', 'ABC-102', 'Geliştirmede', null, 46330, null, null, null, null,
        'Araştırılmalı', '', 1, '', 0, 0, 0, 0, '', '', '', null, null],
    [3, '5 – Olması beklenen / Karşılanmadı', 'D-04', 'D. Rehber', 'Olması beklenen', 'Adres defteri içe aktarma', 'Test edilemedi', '',
        '', '', '', '', null,
        '', 'ABC-103', 'Kapandı', null, null, null, 46340, null, null,
        'Karşılandı', '', 3, '', 9, 9, 9, 9, 'CR-02', 8, '', null, null],
    [4, '5 – Olması beklenen / Karşılanmadı', 'D-05', 'D. Rehber', 'Olması beklenen', 'Adres defteri dışa aktarma', 'Karşılanmadı', '',
        '', '', '', '', null,
        'Zeynep', '', 'İptal / Kapsam dışı', null, null, null, null, null, null,
        '', '', 3, '', 0, 0, 0, 0, 'CR-02', 7.5, '', null, null],
];

const CR: unknown[][] = [
    ['Kurum – Epic → CR → Task → Sub-task'],
    ['Epic: 2 · CR: 2'],
    ['Epic / CR / Task / Sub-task Kodu', 'Sıra No', 'Test No', '5.1', 'Gereksinim / Başlık', 'Kısa Ad · Kapsam / Alan', 'Müşteri Önceliği (Önem)',
        'PoC Sonucu', 'Aksiyon Tipi (W)', 'Müşteriye Soru (X)', 'Aksiyon Planı / Kapsam Notu', 'Bağımlılık', 'CR Önceliği / Çalışma Türü',
        'Durum', 'İlerleme', 'Jira Anahtarı', 'EMS (gün)', 'İstemci (gün)', 'Test (gün)', 'Dizin (gün)', 'Öncelik',
        'Sorumlu (eforu > 0 olan ekipler)', 'Jira Tipi', 'Epic', 'Üst Kayıt Kodu', 'Bağlı CR'],
    ['EP-01', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Epic', null],
    ['CR-01', null, null, null, 'Güçlü parola olmalı', null, null, null, null, null, null, null, null, null, null, 'ABC-50', null, null, null, null, null, null, 'Customer Requirement', null, 'EP-01', 'CR-01'],
    ['CR-01-T01', null, 'I-01', null, 'Parola', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Task', null, 'CR-01', 'CR-01'],
    ['CR-01-T02', null, 'I-02', null, 'Kilit', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Task', null, 'CR-01', 'CR-01'],
    ['EP-02', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Epic', null],
    // CR düzeyinde efor: D-04 ve D-05 bu kaydı "Efor Kaynağı" olarak gösterir → eşit bölünür
    ['CR-02', null, null, null, 'Adres defteri taşınabilmeli', null, null, null, null, null, null, null, null, null, null, 'ABC-60', 4, 2, 0, 0, null, null, 'Customer Requirement', null, 'EP-02', 'CR-02'],
    ['CR-02-T01', null, 'D-04', null, 'İçe aktarma', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Task', null, 'CR-02', 'CR-02'],
    ['CR-02-T02', null, 'D-05', null, 'Dışa aktarma', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Task', null, 'CR-02', 'CR-02'],
];

const EPICS: unknown[][] = [
    ['Epic Listesi'],
    ['açıklama'],
    ['Jira epic alanları'],
    ['Epic No', 'Epic Adı (Jira Summary)', 'Epic Name (Jira kısa ad)', 'Hedef (Jira Description)', 'Kapsamdaki CR\'lar'],
    ['EP-01', 'GİB – Kimlik Doğrulama', 'Kimlik', 'Girişler güvenli olsun.', null],
    ['EP-02', 'GİB – Kişiler ve Rehber', 'Rehber', 'Rehber yönetilebilsin.', null],
];

const EMS: unknown[][] = [
    ['EMS – Kaynak ve Sprint Planı'],
    ['Kişi havuzu', null, null, 'Kaynak %', 'Kapasite (gün/hafta)'],
    ['Ayşe', null, null, 1, 5],
    ['Mehmet', null, null, 0.5, 2.5],
    [null, null, null, null, null],
    ['Toplam', null, null, 1.5, 7.5],
];

const EMS_WORK: unknown[][] = [
    ['EMS iş paketi detay çalışması'],
    ['açıklama'],
    ['Test No', 'Başlık', 'Task No (MPS)', 'Öncül iş', 'Kim', 'Neyin öncülü (Test No)'],
    ['I-01', 'Parola', 'ABC-101', 'Önce parola', 'Ayşe', 'I-02'],
];

const MILESTONE: unknown[][] = [
    ['Milestone Planı'],
    ['Başlangıç tarihi', 46327],
];

const GIRIS: unknown[][] = [
    ['PoC Bulgu Takip Çalışması'],
    ['3. Milestone (MS) planlaması'],
    ['MS0', 'Hızlı aksiyon maddeleri.'],
    ['4. Öncelik'],
    ['10', 'Hemen ele alınacak.'],
];

const MEETINGS: unknown[][] = [
    [null, null, 'Hata Başlığı', 'Durum', 'Doğrulama', 'öNCELİK', 'iŞ GÜCÜ', 'AÇıklamna'],
    [46084, 'GİB', 'Şifre sıfırlama çalışmıyor', 'Planlandı', 'Süreçte', null, '3 Gün', 'İlk not'],
    [null, null, null, null, null, null, null, 'Ek açıklama'],
    [null, null, 'Eksikliği'],
    ['4.4', 'GİB', 'Yedekleme test edilecek', 'Süreçte', null, '8', '10 Gün', null],
];

const TESTS: unknown[][] = [
    ['PoC Test Prosedürü'],
    ['Test No', 'Alan', 'Önem', 'Ağırlık', 'Test ve Uygulama Adımları', 'Beklenen Sonuç', 'PoC Sonucu'],
    ['A-01', 'A', 'Zorunlu', 3, '', '', 'Karşılandı'],
    ['I-01', 'I', 'Zorunlu', 3, '', '', 'Karşılanmadı'],
    ['I-02', 'I', 'Zorunlu', 3, '', '', 'Kısmen karşılandı'],
    ['D-04', 'D', 'Olması beklenen', 2, '', '', 'Test edilemedi'],
];

const WORKBOOK: WorkbookMatrices = {
    'Giriş': GIRIS,
    'Milestone': MILESTONE,
    'EMS': EMS,
    'EMS Çalışması': EMS_WORK,
    'Epic Listesi': EPICS,
    'CR Listesi': CR,
    'Test Kalemleri': TESTS,
    'Genel Liste': GENEL,
    'GİB rapor ve roplantı çıktıları': MEETINGS,
};

const NOW = '2026-11-06T09:00:00.000Z';

describe('hücre yardımcıları', () => {
    it('sayı: virgüllü ondalık ve boş', () => {
        expect(num('0,5')).toBe(0.5);
        expect(num(2)).toBe(2);
        expect(num('')).toBe(0);
        expect(num('abc')).toBe(0);
    });

    it('tarih: Excel seri sayısı, Date ve metin', () => {
        expect(toIsoDate(46327)).toBe('2026-11-01');
        expect(toIsoDate(new Date(2026, 10, 2))).toBe('2026-11-02');
        expect(toIsoDate('24.11.2026')).toBe('2026-11-24');
        expect(toIsoDate('')).toBeUndefined();
    });

    it('yüzde biçimi', () => {
        expect(formatPercent(0.45756)).toBe('%45,8');
    });
});

describe('parseGibWorkbook', () => {
    const pkg = parseGibWorkbook(WORKBOOK, { now: NOW });
    const byId = new Map(pkg.tasks.map(t => [t.id, t]));

    it('her bulgu Test No kimlikli bir görev olur', () => {
        expect(pkg.tasks.map(t => t.id)).toEqual(['gib-I-01', 'gib-I-02', 'gib-D-04', 'gib-D-05']);
        expect(byId.get('gib-I-01')!.name).toBe('I-01 · Parola politikası');
        expect(byId.get('gib-I-01')!.jiraId).toBe('ABC-101');
        expect(isGibWorkbook(Object.keys(WORKBOOK))).toBe(true);
        expect(isGibWorkbook(['Sayfa1'])).toBe(false);
    });

    it('efor ekip sütunlarından; birincil ekip birim olur', () => {
        const t = byId.get('gib-I-01')!;
        expect(t.time).toEqual({ best: 2.5, avg: 2.5, worst: 2.5 });
        expect(t.unit).toBe('EMS');
        expect(t.labels).toContain('İstemci'); // birden çok ekip etiketlenir
        expect(t.availability).toBe(true);
        expect(byId.get('gib-I-02')!.unit).toBe('Genel'); // efor girilmemiş
    });

    it('CR düzeyindeki efor ona bağlanan maddelere bölünür', () => {
        expect(byId.get('gib-D-04')!.time.avg).toBe(3); // (4 + 2) / 2
        expect(pkg.summary.totalEffortDays).toBe(8.5);
        expect(pkg.summary.effortByTeam).toEqual({ EMS: 6, 'İstemci': 2.5, Test: 0, Dizin: 0 });
        expect(pkg.summary.withoutEffort).toBe(1);
    });

    it('durum: Excel durumu, yoksa MS0 → Yapılacak, diğer MS → Bekleyen', () => {
        expect(byId.get('gib-I-01')!.status).toBe(TaskStatus.ToDo);
        expect(byId.get('gib-I-02')!.status).toBe(TaskStatus.InProgress);
        expect(byId.get('gib-D-04')!.status).toBe(TaskStatus.Done);
        expect(byId.get('gib-D-05')!.status).toBe(TaskStatus.Done);
        expect(byId.get('gib-D-05')!.includeInSprints).toBe(false);
        expect(byId.get('gib-D-05')!.labels).toContain('İptal / Kapsam dışı');
        expect(pkg.explicitStatusIds).toEqual(['gib-I-02', 'gib-D-04', 'gib-D-05']);
    });

    it('öncelik: puan 10 → Blocker; puan yoksa önem kademesinden', () => {
        expect(byId.get('gib-I-01')!.priority).toBe('Blocker');
        expect(byId.get('gib-I-02')!.priority).toBe('Medium'); // kademe 2
        expect(byId.get('gib-D-04')!.priority).toBe('Medium'); // puan 8
        expect(byId.get('gib-D-05')!.priority).toBe('Medium'); // puan 7,5
    });

    it('etiketler, tarihler ve atananlar', () => {
        const t = byId.get('gib-I-01')!;
        expect(t.labels).toEqual(['MS0', 'Rapor 5.1', 'Zorunlu', 'PoC: Karşılanmadı', 'Hızlı aksiyon', 'EMS', 'İstemci']);
        expect(t.dueDate).toBe('2026-11-24');
        expect(t.issueType).toBe('bug');
        const two = byId.get('gib-I-02')!;
        expect(two.resourceName).toBe('Ayşe');
        expect(two.notes).toContain('Atananlar: Ayşe, Mehmet');
        expect(two.startedAt).toBe('2026-11-04T09:00:00.000Z');
        expect(byId.get('gib-D-04')!.resolvedAt).toBe('2026-11-14T17:00:00.000Z');
        expect(byId.get('gib-D-04')!.resourceName).toBe('Atanmamış');
    });

    it('not: rapor, beklenen sonuç, soru ve iş kodu', () => {
        const notes = byId.get('gib-I-01')!.notes;
        expect(notes).toContain('Rapordaki tespit: Uzun parola desteklenmiyor.');
        expect(notes).toContain('Müşteriye soru: Kural listesi?');
        expect(notes).toContain('İş kodu: CR-01-T01 · CR-01 · EP-01');
        expect(notes).toContain('Efor (gün): EMS 2 · İstemci 0,5');
    });

    it('epic → iş paketi; CR Listesi sırasından türetilir', () => {
        expect(pkg.workPackages.map(w => w.id)).toEqual(['gib-EP-01', 'gib-EP-02']);
        expect(pkg.workPackages[0].name).toBe('EP-01 · Kimlik Doğrulama');
        expect(byId.get('gib-D-04')!.workPackageId).toBe('gib-EP-02');
        expect(pkg.summary.crs).toBe(2);
    });

    it('öncül: EMS çalışmasındaki "neyin öncülü"', () => {
        expect(byId.get('gib-I-02')!.predecessor).toBe('gib-I-01');
        expect(pkg.summary.predecessors).toBe(1);
    });

    it('kaynaklar: EMS kişi havuzu + havuz dışı atananlar', () => {
        expect(pkg.resources.map(r => [r.name, r.participation, r.unit])).toEqual([
            ['Ayşe', 100, 'EMS'],
            ['Mehmet', 50, 'EMS'],
            ['Zeynep', 100, 'EMS'], // D-05'in birincil ekibi (CR eforundan)
        ]);
    });

    it('toplantı çıktıları → müşteri istekleri (madde numarası geri çevrilir)', () => {
        expect(pkg.customerRequests.map(r => r.title)).toEqual(['Şifre sıfırlama çalışmıyor', 'Yedekleme test edilecek']);
        expect(pkg.customerRequests[0].description).toContain('Madde: 3.3');
        expect(pkg.customerRequests[0].description).toContain('Ek açıklama');
        expect(pkg.customerRequests[1].description).toContain('Bölüm: Eksikliği');
        expect(pkg.customerRequests[1].customerName).toBe('GİB');
    });

    it('PoC skoru güncel sonucu dikkate alır', () => {
        // A-01 karşılandı (3), I-01 Excel'de "Hızlı aksiyon" (sonuç sınıfı değil) → karşılanmadı (0),
        // I-02 araştırılmalı → kısmen (1,5); D-04 güncel "Karşılandı" (2)
        expect(pkg.summary.pocScore).toBeCloseTo((3 + 0 + 1.5 + 2) / 11);
        expect(pkg.summary.mandatoryOpen).toBe(2);
        expect(pkg.summary.testItems).toBe(4);
    });

    it('proje kartı, Jira anahtarı ve başlangıç', () => {
        expect(pkg.jiraProjectKey).toBe('ABC');
        expect(pkg.projectStartDate).toBe('2026-11-01');
        expect(pkg.aiProfile.glossary?.map(g => g.term)).toEqual(expect.arrayContaining(['MS0', 'Öncelik 10', 'CR']));
        expect(pkg.tagColors.MS0).toBeDefined();
    });

    it('Genel Liste yoksa anlaşılır hata', () => {
        expect(() => parseGibWorkbook({ Sayfa1: [] })).toThrow(/Genel Liste/);
    });

    it('sheetjs matrisiyle aynı sonucu verir', () => {
        const wb = XLSX.utils.book_new();
        Object.entries(WORKBOOK).forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name));
        const roundTrip = parseGibWorkbook(workbookToMatrices(XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' })), { now: NOW });
        expect(roundTrip.summary).toEqual(pkg.summary);
        expect(roundTrip.tasks).toEqual(pkg.tasks);
    });
});

describe('applyGibImport', () => {
    const pkg = parseGibWorkbook(WORKBOOK, { now: NOW });
    const now = new Date('2026-11-06T10:00:00.000Z');
    const mks: Person = { id: 'p-mks', firstName: 'Mehmet Kemal', lastName: 'Sarı', departmentCode: 'U310', availableAA: 1, roles: [] };

    it('yeni proje + havuza yeni PY', () => {
        const res = applyGibImport(createEmptyWorkspace(), pkg, { projectName: 'GİB', newPmName: 'MKS', now });
        const project = res.workspace.projects.find(p => p.id === res.projectId)!;
        expect(res.createdProject).toBe(true);
        expect(res.createdPerson).toBe(true);
        expect(project.name).toBe('GİB');
        expect(project.tasks).toHaveLength(4);
        expect(project.pmPersonId).toBe(res.pmPersonId);
        expect(project.jiraProjectKey).toBe('ABC');
        expect(project.settings.projectStartDate).toBe('2026-11-01');
        expect(project.workPackages).toHaveLength(2);
        expect(project.customerRequests).toHaveLength(2);
        const pm = res.workspace.people.find(p => p.id === res.pmPersonId)!;
        expect(pm.firstName).toBe('MKS');
        expect(pm.departmentCode).toBe('Tanımsız');
        expect(res.workspace.activeProjectId).toBe(project.id);
    });

    it('PY baş harfle havuzdaki kişiyle eşleşir (yeni kişi açılmaz)', () => {
        expect(findPersonByName([mks], 'MKS')?.id).toBe('p-mks');
        expect(findPersonByName([mks], 'mehmet kemal sarı')?.id).toBe('p-mks');
        const ws = { ...createEmptyWorkspace(), people: [mks] };
        const res = applyGibImport(ws, pkg, { projectName: 'GİB', newPmName: 'MKS', now });
        expect(res.createdPerson).toBe(false);
        expect(res.pmPersonId).toBe('p-mks');
        expect(res.workspace.people).toHaveLength(1);
    });

    it('yeniden aktarım: Test No ile günceller, uygulamadaki işi korur', () => {
        const first = applyGibImport(createEmptyWorkspace(), pkg, { projectName: 'GİB', newPmName: 'MKS', now });
        const pid = first.projectId;
        // Uygulamada: I-01 sürüme alınıp "Süreçte"ye çekildi, elle bir görev eklendi, not yazıldı
        const edited = {
            ...first.workspace,
            projects: first.workspace.projects.map(p => p.id !== pid ? p : {
                ...p,
                tasks: [
                    ...p.tasks.map(t => t.id === 'gib-I-01' ? { ...t, status: TaskStatus.InProgress, version: 2, comments: [{ author: 'MKS', text: 'başladık', date: NOW }] } : t),
                    { ...p.tasks[0], id: 'manual-1', name: 'Elle eklenen' },
                ],
                aiProfile: { ...p.aiProfile, summary: 'PY özeti' },
            }),
        };
        expect(findImportedProject(edited.projects, pkg)?.id).toBe(pid);

        // Excel'de I-02 kapandı, I-01'in durumu hâlâ boş
        const genel2 = GENEL.map(r => [...r]);
        genel2[3][15] = 'Kapandı';
        genel2[2][5] = 'Parola politikası (güncel)';
        const pkg2 = parseGibWorkbook({ ...WORKBOOK, 'Genel Liste': genel2 }, { now: NOW });
        const res = applyGibImport(edited, pkg2, { projectId: pid, projectName: 'GİB', pmPersonId: first.pmPersonId, now });
        const project = res.workspace.projects.find(p => p.id === pid)!;
        const t1 = project.tasks.find(t => t.id === 'gib-I-01')!;
        const t2 = project.tasks.find(t => t.id === 'gib-I-02')!;

        expect(res.createdProject).toBe(false);
        expect([res.added, res.updated, res.kept]).toEqual([0, 4, 1]);
        expect(t1.name).toBe('I-01 · Parola politikası (güncel)');
        expect(t1.status).toBe(TaskStatus.InProgress); // Excel'de durum yok → uygulamadaki korunur
        expect(t1.version).toBe(2);
        expect(t1.comments).toHaveLength(1);
        expect(t2.status).toBe(TaskStatus.Done);
        expect(t2.statusLog?.at(-1)).toMatchObject({ from: TaskStatus.InProgress, to: TaskStatus.Done });
        expect(project.tasks.some(t => t.id === 'manual-1')).toBe(true);
        expect(project.aiProfile?.summary).toBe('PY özeti');
        expect(res.workspace.projects).toHaveLength(1);
        expect(res.workspace.people).toHaveLength(1);
    });

    it('başka projeler etkilenmez', () => {
        const other = createProject('Başka');
        const ws = { ...createEmptyWorkspace(), projects: [other] };
        const res = applyGibImport(ws, pkg, { projectName: 'GİB', newPmName: 'MKS', now });
        expect(res.workspace.projects[0]).toBe(other);
        expect(res.workspace.projects).toHaveLength(2);
    });
});
