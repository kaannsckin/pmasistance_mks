import type { UserRole } from '../../types.js';

/**
 * Pilot dünyası: kurgusal bir AR-GE birimi (bölümler, ünvanlar, kişiler,
 * projeler ve pilot kullanıcıları). Adlar kurgusaldır; gerçek kişi ya da
 * projelerle ilgisi yoktur. Simülasyon (sim.ts) bu tanımdan başlar.
 */

export interface WorldPerson {
    id: string;
    first: string;
    last: string;
    dept: string;
    title: string;
    role: string;
}

export interface WorldProject {
    id: string;
    name: string;
    code: string;
    jiraKey: string;
    pm: string; // kişi id
    status: 'devam' | 'teklif' | 'beklemede';
    /** İş günü başına ortalama yeni kayıt (0: Jira akışı yok) */
    rate: number;
    /** Tür ağırlıkları: hata, hikaye, iyileştirme, görev */
    mix: [number, number, number, number];
    /** Gerçekleşen efor / tahmin çarpanı (proje "zorluğu") */
    overrun: number;
    /** Ekip: kişi id → aylık plan AA (Ocak–Aralık aynı; ayrıntı sim.ts'te) */
    team: Record<string, number>;
    /** Planın başladığı ay (1–12) */
    fromMonth: number;
    planLock?: 'submitted' | 'locked';
    modules: string[];
    customers: string[];
}

export const DEPARTMENTS = [
    { code: 'U300', name: 'Proje Yönetim Birimi', lead: 'p21' },
    { code: 'U310', name: 'Yazılım Geliştirme', lead: 'p01' },
    { code: 'U320', name: 'Test ve Doğrulama', lead: 'p08' },
    { code: 'U330', name: 'Sistem Mühendisliği', lead: 'p12' },
    { code: 'U340', name: 'Veri ve Yapay Zekâ', lead: 'p17' },
];

export const TITLES = [
    { code: 'ARŞ', name: 'Araştırmacı', monthlyCost: 115_000 },
    { code: 'UAR', name: 'Uzman Araştırmacı', monthlyCost: 150_000 },
    { code: 'BUA', name: 'Başuzman Araştırmacı', monthlyCost: 195_000 },
    { code: 'YÖN', name: 'Birim Yöneticisi', monthlyCost: 240_000 },
];

export const ROLE_NAMES: Record<string, string> = {
    U300: 'Proje Yönetimi Uzmanı',
    U310: 'Yazılım Geliştirme Mühendisi',
    U320: 'Test Mühendisi',
    U330: 'Sistem Mühendisi',
    U340: 'Veri Bilimci',
};

const p = (id: string, first: string, last: string, dept: string, title: string): WorldPerson => ({ id, first, last, dept, title, role: ROLE_NAMES[dept] });

export const PEOPLE: WorldPerson[] = [
    p('p01', 'Selin', 'Kaya', 'U310', 'BUA'),
    p('p02', 'Emre', 'Koç', 'U310', 'UAR'),
    p('p03', 'Gizem', 'Yıldız', 'U310', 'ARŞ'),
    p('p04', 'Onur', 'Çelik', 'U310', 'ARŞ'),
    p('p05', 'Ece', 'Polat', 'U310', 'UAR'),
    p('p06', 'Kerem', 'Doğan', 'U310', 'ARŞ'),
    p('p07', 'Tuğba', 'Kurt', 'U310', 'ARŞ'),
    p('p08', 'Hakan', 'Öztürk', 'U320', 'BUA'),
    p('p09', 'Merve', 'Aslan', 'U320', 'UAR'),
    p('p10', 'Barış', 'Güneş', 'U320', 'ARŞ'),
    p('p11', 'Sena', 'Tekin', 'U320', 'ARŞ'),
    p('p12', 'Derya', 'Aksoy', 'U330', 'BUA'),
    p('p13', 'Elif', 'Yılmaz', 'U330', 'UAR'),
    p('p14', 'Burak', 'Demir', 'U330', 'UAR'),
    p('p15', 'Cem', 'Bulut', 'U330', 'ARŞ'),
    p('p16', 'İrem', 'Şen', 'U330', 'ARŞ'),
    p('p17', 'Can', 'Erdem', 'U340', 'BUA'),
    p('p18', 'Deniz', 'Yavuz', 'U340', 'UAR'),
    p('p19', 'Ozan', 'Kılıç', 'U340', 'ARŞ'),
    p('p20', 'Aslı', 'Çakır', 'U340', 'ARŞ'),
    p('p21', 'Ahmet', 'Şahin', 'U300', 'YÖN'),
    p('p22', 'Zeynep', 'Arslan', 'U300', 'BUA'),
    p('p23', 'Mert', 'Aydın', 'U300', 'UAR'),
    p('p24', 'Nazlı', 'Karaca', 'U300', 'ARŞ'),
];

export const PROJECTS: WorldProject[] = [
    {
        id: 'prj-atlas', name: 'ATLAS Karar Destek Sistemi', code: 'ATL-2401', jiraKey: 'ATL', pm: 'p13', status: 'devam',
        rate: 1.4, mix: [0.32, 0.3, 0.2, 0.18], overrun: 1.15, fromMonth: 1, planLock: 'locked',
        team: { p13: 0.3, p02: 0.8, p03: 0.6, p04: 0.8, p09: 0.5, p15: 0.6, p18: 0.6 },
        modules: ['harita katmanı', 'senaryo motoru', 'rapor ekranı', 'kullanıcı yönetimi', 'veri aktarımı', 'bildirim servisi'],
        customers: ['Kurum A Planlama Dairesi', 'Kurum A Bilgi İşlem'],
    },
    {
        id: 'prj-pusula', name: 'PUSULA Saha Mobil Uygulaması', code: 'PSL-2402', jiraKey: 'PSL', pm: 'p14', status: 'devam',
        rate: 1.0, mix: [0.38, 0.27, 0.2, 0.15], overrun: 1.3, fromMonth: 3, planLock: 'submitted',
        team: { p14: 0.4, p05: 0.9, p06: 0.7, p10: 0.6, p16: 0.5 },
        modules: ['çevrimdışı senkronizasyon', 'görev listesi', 'fotoğraf yükleme', 'giriş ekranı', 'konum servisi'],
        customers: ['Kurum B Saha Operasyonları'],
    },
    {
        id: 'prj-nehir', name: 'NEHİR Veri Platformu', code: 'NHR-2403', jiraKey: 'NHR', pm: 'p14', status: 'devam',
        rate: 1.0, mix: [0.45, 0.2, 0.2, 0.15], overrun: 1.55, fromMonth: 2,
        team: { p14: 0.4, p07: 0.8, p19: 0.9, p20: 0.7, p11: 0.6 },
        modules: ['veri boru hattı', 'şema doğrulama', 'API geçidi', 'izleme panosu', 'yetkilendirme'],
        customers: ['Kurum C Veri Yönetimi'],
    },
    {
        id: 'prj-kalkan', name: 'KALKAN Siber İzleme', code: 'KLK-2404', jiraKey: 'KLK', pm: 'p17', status: 'devam',
        rate: 0.6, mix: [0.3, 0.3, 0.25, 0.15], overrun: 1.1, fromMonth: 4,
        team: { p17: 0.2, p18: 0.6, p04: 0.4, p08: 0.3, p12: 0.3 },
        modules: ['olay toplayıcı', 'kural motoru', 'alarm panosu', 'raporlama'],
        customers: ['Kurum A Siber Güvenlik Merkezi'],
    },
    {
        id: 'prj-yildiz', name: 'YILDIZ Test Otomasyonu', code: 'YLD-2405', jiraKey: 'YLD', pm: 'p12', status: 'teklif',
        rate: 0, mix: [0.25, 0.25, 0.25, 0.25], overrun: 1, fromMonth: 11,
        team: { p08: 0.5, p09: 0.3, p10: 0.3 },
        modules: ['test senaryosu editörü', 'koşturucu'],
        customers: ['Kurum D'],
    },
];

export interface Persona {
    /** CLI'daki kısa ad */
    id: string;
    personId: string;
    role: UserRole;
    unvan: string;
    /** Varsayılan proje (MCP PLANASISTAN_PROJECT) */
    project?: string;
    karakter: string;
    gunluk: string[];
}

/** Pilot kullanıcıları — 2. rutinin 5 ajanı bu kimliklerle çalışır */
export const PERSONAS: Persona[] = [
    {
        id: 'elif', personId: 'p13', role: 'py', unvan: 'Proje Yöneticisi — ATLAS', project: 'ATL-2401',
        karakter: 'Düzenli, verilere dayanır; sprint ilerlemesini, gecikmeleri ve riskleri her sabah kontrol eder. Belirsiz bir sayı görünce kaynağını sorar.',
        gunluk: [
            'Güne Jira\'dan güncelleyerek başla: jira_aktar ile önizlemeyi gör, mantıklıysa --onayla ile aktar',
            'ATLAS durumunu, geciken ve yaklaşan görevleri incele; gerekiyorsa görev durumunu güncelle',
            'Dünkü Jira akışına, toplantı notlarına ve ekipten gelen risk sinyallerine göre risk ekleyip eklemeyeceğine karar ver',
            'Ekibinin bu ay ve gelecek ay doluluğuna bak; aşırı yüklü kişi varsa Selin\'e (bölüm sorumlusu) yaz',
            'Haftanın durumuna göre RAG\'ı güncelle (Cuma mutlaka); durum raporu taslağını hazırlat',
        ],
    },
    {
        id: 'burak', personId: 'p14', role: 'py', unvan: 'Proje Yöneticisi — PUSULA ve NEHİR', project: undefined,
        karakter: 'İki projeyi birden yürüttüğü için yoğun; hızlı karar verir, bazen kayıtları geç günceller. NEHİR\'deki hata yükünden endişeli.',
        gunluk: [
            'İki projeyi de Jira\'dan güncelle (jira_aktar); yoğun günlerde birini atlayabilirsin',
            'PUSULA ve NEHİR\'i karşılaştır; hangisi daha riskli, neden; RAG\'ları güncelle',
            'NEHİR\'deki hata oranını ve yeniden açılan kayıtları incele; gerekirse risk ekle',
            'Kapasite yetmiyorsa uygun kişi ara ve Selin\'den ya da Ahmet Bey\'den destek iste',
            'Müşteri isteklerini gözden geçir',
        ],
    },
    {
        id: 'selin', personId: 'p01', role: 'bolum_sorumlu', unvan: 'Bölüm Sorumlusu — U310 Yazılım Geliştirme',
        karakter: 'Bölümünün kapasitesini korur; aşırı tahsise karşı titizdir. Proje yöneticilerinin kaynak taleplerini rakamlarla değerlendirir.',
        gunluk: [
            'U310 doluluk ısı haritası ve aşırı tahsisleri kontrol et',
            'Gelen kaynak taleplerini uygun kişi aracıyla değerlendir, yanıt ver',
            'Gerekirse bölüm personelinin tahsisini düzeltmeyi öner (plan kilidine dikkat)',
            'Departman karnesine ve iş yükü öngörüsüne bak',
        ],
    },
    {
        id: 'mert', personId: 'p23', role: 'pyb_destek', unvan: 'PYB Destek — veri havuzu ve raporlama',
        karakter: 'Titiz; veri kalitesi, tutarsız rakamlar ve eksik kayıtlar onun işi. Bulduğu her tutarsızlığı kayda geçirir.',
        gunluk: [
            'Portföy genelinde veri tutarlılığını kontrol et (tahsis toplamları, eksik PY, kapanmış ama tarihsiz kayıtlar)',
            'Maliyet raporu ile tahsis özetinin birbirini tuttuğunu doğrula; Jira worklog saatlerini (jira_worklog) gerçekleşen adam-ayla karşılaştır',
            'Haftalık raporların durumuna ve son değişikliklere bak',
            'Bulduğun tutarsızlıkları ilgili kişiye yaz',
        ],
    },
    {
        id: 'ahmet', personId: 'p21', role: 'mudur', unvan: 'Müdür',
        karakter: 'Özet ister; önce sonucu, sonra gerekçeyi bekler. Kritik projeler için proje yöneticisinden açıklama ister.',
        gunluk: [
            'Portföy özetine ve dikkat gerektiren konulara bak',
            'Kritik/riskli projelerin yöneticilerine soru sor',
            'EVM ve maliyet sapmalarını incele',
            'Kapasite-talep dengesine bakıp işe alım ihtiyacı olup olmadığına karar ver',
        ],
    },
];

export const personById = (id: string): WorldPerson => {
    const found = PEOPLE.find(x => x.id === id);
    if (!found) throw new Error(`Pilot dünyasında kişi yok: ${id}`);
    return found;
};

export const fullName = (x: WorldPerson): string => `${x.first} ${x.last}`;
