import type { Rng } from '../../utils/planning/random.js';

/**
 * Pilot verisinin metinleri: Jira kayıt başlıkları/açıklamaları, Confluence
 * tarzı toplantı notları, riskler ve müşteri istekleri için şablonlar.
 * Tohumlu rastgele seçim — aynı tohum aynı metni üretir.
 */

export const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

export type SimIssueType = 'Hata' | 'Hikaye' | 'İyileştirme' | 'Görev';

/** Proje alanı: hata, istek ve risk şablonları alana göre seçilir (mobil hatası veri platformunda çıkmaz) */
export type Domain = 'karar' | 'mobil' | 'veri' | 'guvenlik' | 'test';

interface BugTemplate {
    t: string;
    /** Yalnız bu alanlarda (yoksa hepsinde) */
    d?: Domain[];
    /** Ciddi hata: öncelik Highest/High */
    ciddi?: boolean;
}

const BUG: BugTemplate[] = [
    { t: '{m} ekranında kaydetme sonrası liste yenilenmiyor', d: ['karar', 'mobil', 'test'] },
    { t: '{m} içinde tarih alanı yanlış saat dilimiyle gösteriliyor' },
    { t: '{m} büyük veri setinde zaman aşımına düşüyor', d: ['karar', 'veri', 'guvenlik'] },
    { t: '{m} yetkisiz kullanıcıya düzenleme düğmesini gösteriyor', d: ['karar', 'mobil', 'veri'], ciddi: true },
    { t: '{m} Türkçe karakterli aramada sonuç döndürmüyor', d: ['karar', 'mobil', 'veri'] },
    { t: '{m} dışa aktarılan dosyada sütunlar kayıyor', d: ['karar', 'veri', 'guvenlik'] },
    { t: '{m} çevrimdışıyken uygulama kapanıyor', d: ['mobil'], ciddi: true },
    { t: '{m} düşük bağlantıda fotoğraf yüklemesi yarıda kalıyor', d: ['mobil'] },
    { t: '{m} konum izni reddedilince boş ekran açılıyor', d: ['mobil'] },
    { t: '{m} hata mesajı kullanıcıya teknik ayrıntı gösteriyor' },
    { t: '{m} sayfalamada son sayfa boş geliyor', d: ['karar', 'veri', 'guvenlik'] },
    { t: '{m} eşzamanlı güncellemede veri kaybı', d: ['veri', 'karar'], ciddi: true },
    { t: '{m} şema değişikliğinden sonra eski kayıtları reddediyor', d: ['veri'], ciddi: true },
    { t: '{m} gece yükleme işinde yinelenen kayıt üretiyor', d: ['veri'] },
    { t: '{m} kural eşleşmesinde yanlış alarm üretiyor', d: ['guvenlik'] },
    { t: '{m} yoğun log akışında olay kaçırıyor', d: ['guvenlik'], ciddi: true },
    { t: '{m} harita yakınlaştırmada katmanları yanlış çiziyor', d: ['karar'] },
];

const FEATURE = [
    '{m} için PDF dışa aktarım',
    '{m} için toplu düzenleme',
    '{m} için rol bazlı erişim ayarı',
    '{m} için filtre kaydetme',
    '{m} için bildirim tercihleri',
    '{m} için Excel içe aktarma',
    '{m} için denetim kaydı ekranı',
    '{m} için çoklu dil desteği',
];

const IMPROVEMENT = [
    '{m} sorgu performansının iyileştirilmesi',
    '{m} arayüzünün sadeleştirilmesi',
    '{m} günlük kayıtlarının yapılandırılması',
    '{m} hata yönetiminin iyileştirilmesi',
    '{m} test kapsamının artırılması',
    '{m} önbellek süresinin ayarlanabilir olması',
];

const TASK = [
    '{m} test ortamının kurulması',
    '{m} kullanıcı kılavuzunun güncellenmesi',
    '{m} sürüm notlarının hazırlanması',
    '{m} bağımlılık güncellemeleri',
    '{m} kabul testi senaryolarının yazılması',
    '{m} güvenlik taramasının yapılması',
];

const DESC: Record<SimIssueType, string[]> = {
    Hata: [
        'Saha testinde bildirildi. Adımlar: ekranı aç, kaydı güncelle, kaydet. Beklenen: güncel değer görünür. Gerçekleşen: eski değer kalıyor.',
        'Müşteri ortamında tekrarlandı; günlüklerde ilgili istek 30 sn sonra kesiliyor.',
        'Regresyon testinde yakalandı. Önceki sürümde sorun yoktu.',
    ],
    Hikaye: [
        'Kullanıcı olarak bu işlemi tek adımda yapabilmek istiyorum; böylece haftalık raporlamayı hızlandırırım. Kabul kriterleri ekte.',
        'Müşteri toplantısında talep edildi; kapsam ve kabul kriterleri ürün sahibiyle netleştirildi.',
    ],
    'İyileştirme': [
        'Ölçümlere göre mevcut çözüm hedef sürenin üzerinde; iyileştirme sonrası ölçüm tekrarlanacak.',
        'Kullanıcı geri bildirimlerinde en çok şikâyet edilen konu.',
    ],
    'Görev': [
        'Sürüm öncesi yapılması gereken iş. Sorumlu ekip içinde paylaşıldı.',
        'Bir sonraki kilometre taşı için ön koşul.',
    ],
};

export const issueText = (rng: Rng, type: SimIssueType, modules: string[], domain?: Domain): { summary: string; description: string; ciddi: boolean } => {
    const m = pick(rng, modules);
    const bugs = BUG.filter(b => !domain || !b.d || b.d.includes(domain));
    const bug = type === 'Hata' ? pick(rng, bugs) : undefined;
    const pool = type === 'Hikaye' ? FEATURE : type === 'İyileştirme' ? IMPROVEMENT : TASK;
    const raw = (bug ? bug.t : pick(rng, pool)).replace('{m}', m);
    return { summary: raw.charAt(0).toLocaleUpperCase('tr-TR') + raw.slice(1), description: pick(rng, DESC[type]), ciddi: !!bug?.ciddi };
};

export interface RiskTemplate { title: string; mitigation: string }
export interface RequestTemplate { title: string; description: string }

/** Her alanda görülebilen riskler */
export const RISKS: RiskTemplate[] = [
    { title: 'Kilit personelin izin dönemi', mitigation: 'Bilgi aktarımı yapılacak, yedek kişi atanacak' },
    { title: 'Müşteri kapsam değişikliği talebi', mitigation: 'Değişiklik kontrol kurulunda değerlendirilecek' },
    { title: 'Test ortamının geç hazırlanması', mitigation: 'Bilgi İşlem ile haftalık takip toplantısı' },
    { title: 'Lisans yenilemesinin gecikmesi', mitigation: 'Satın alma süreci erkene çekilecek' },
];

/** Alana özgü riskler */
export const DOMAIN_RISKS: Record<Domain, RiskTemplate[]> = {
    karar: [
        { title: 'Harita servis lisansının yenilenmemesi', mitigation: 'Açık kaynak harita katmanına geçiş planı hazırlanacak' },
        { title: 'Kurum A veri paylaşım protokolünün gecikmesi', mitigation: 'Protokol taslağı hukuk birimine erken gönderilecek' },
        { title: 'Senaryo motorunun yanıt süresi hedefini aşması', mitigation: 'Önbellek ve ön hesaplama ile yük testi yapılacak' },
    ],
    mobil: [
        { title: 'Saha cihazlarının tedarikinde gecikme', mitigation: 'Alternatif tedarikçi ve geçici cihaz havuzu araştırılacak' },
        { title: 'Mobil işletim sistemi güncellemesiyle uyumsuzluk', mitigation: 'Beta sürümlerle erken uyumluluk testi' },
        { title: 'Çevrimdışı eşitlemede veri çakışması', mitigation: 'Çakışma çözüm kuralları müşteriyle netleştirilecek' },
        { title: 'Saha testine kullanıcı katılımının düşük kalması', mitigation: 'Saha amirleriyle test takvimi birlikte planlanacak' },
    ],
    veri: [
        { title: 'Hata yükünün sürüm takvimini aşması', mitigation: 'Hata ayıklama sprinti planlanacak' },
        { title: 'Şema doğrulamada veri kaybı', mitigation: 'Yüklemeler öncesi yedek ve geri alma prosedürü' },
        { title: 'Kurum C kaynak sistem arayüzünün belgelenmemesi', mitigation: 'Karşı ekip ile arayüz kontrol belgesi hazırlanacak' },
        { title: 'Performans hedefinin tutturulamaması', mitigation: 'Erken yük testi ve mimari gözden geçirme' },
    ],
    guvenlik: [
        { title: 'Log hacminin öngörülenin üstüne çıkması', mitigation: 'Depolama genişlemesi ve örnekleme politikası' },
        { title: 'Kural motorunda yanlış alarm oranının yükselmesi', mitigation: 'Kural ayarı için analistlerle haftalık gözden geçirme' },
        { title: 'Sızma testi onayının gecikmesi', mitigation: 'Bağımsız test firmasıyla takvim erkene çekilecek' },
    ],
    test: [
        { title: 'Test senaryosu kapsamının eksik kalması', mitigation: 'Gereksinim izlenebilirlik matrisi hazırlanacak' },
    ],
};

/** Alana özgü müşteri istekleri */
export const DOMAIN_REQUESTS: Record<Domain, RequestTemplate[]> = {
    karar: [
        { title: 'Senaryo karşılaştırma raporunun PDF çıktısı', description: 'Planlama kurulunda dağıtılmak üzere iki senaryonun yan yana çıktısı.' },
        { title: 'Harita katmanlarına ilçe sınırlarının eklenmesi', description: 'İl düzeyi analiz yetersiz kalıyor; ilçe kırılımı isteniyor.' },
        { title: 'Kurum A için tek oturum açma entegrasyonu', description: 'Kullanıcılar kurum hesabıyla giriş yapmak istiyor.' },
        { title: 'Senaryo sonuçlarının Excel\'e aktarılması', description: 'Bütçe birimi sonuçları kendi tablolarında işlemek istiyor.' },
    ],
    mobil: [
        { title: 'Fotoğraflara konum ve saat damgası', description: 'Saha denetimlerinde kanıt olarak kullanılacak.' },
        { title: 'Görev listesinde öncelik filtresi', description: 'Saha ekipleri acil işleri ayrı görmek istiyor.' },
        { title: 'Saha formlarına imza alanı', description: 'Teslim tutanaklarının uygulamada imzalanması.' },
        { title: 'Gece kullanımı için karanlık tema', description: 'Gece vardiyasındaki ekipler istedi.' },
    ],
    veri: [
        { title: 'Veri saklama süresinin on yıla uzatılması', description: 'Mevzuat değişikliği nedeniyle.' },
        { title: 'Şema değişikliklerinde e-posta bildirimi', description: 'Kaynak sistem sahipleri değişiklikten önce haberdar olmak istiyor.' },
        { title: 'Aylık veri kalitesi özeti', description: 'Yöneticilere her ayın ilk iş günü eksik ve hatalı kayıt özeti.' },
        { title: 'Yeni kaynak sistem bağlantısı', description: 'Kurum C\'nin arşiv sistemi platforma eklenecek.' },
    ],
    guvenlik: [
        { title: 'Alarm eskalasyon kurallarının özelleştirilmesi', description: 'Gece saatlerinde farklı nöbet zinciri isteniyor.' },
        { title: 'Haftalık tehdit özeti raporu', description: 'Yönetime her Pazartesi tek sayfalık özet.' },
        { title: 'Ek log biçimi desteği', description: 'Yeni güvenlik duvarlarının log biçimi okunmalı.' },
    ],
    test: [
        { title: 'Test sonuçlarının sürüm notuna otomatik eklenmesi', description: 'Kabul toplantılarında kullanılacak.' },
    ],
};

/** Eski çağrılar için: tüm alanların istekleri */
export const REQUESTS: RequestTemplate[] = Object.values(DOMAIN_REQUESTS).flat();

export const MEETINGS = ['Müşteri ilerleme toplantısı', 'Teknik tasarım gözden geçirme', 'Risk değerlendirme toplantısı', 'Test sonuçları değerlendirmesi'];

export const DECISIONS = [
    'Rapor ekranındaki dışa aktarım bir sonraki sürüme kaydırıldı.',
    'Kritik hatalar kapanmadan yeni özellik geliştirmeye başlanmayacak.',
    'Test ortamı hazır olana kadar kabul testleri hazırlık ortamında yapılacak.',
    'Müşterinin ek isteği kapsam dışı; değişiklik talebi olarak yazılacak.',
    'Performans ölçümleri her sprint sonunda tekrarlanacak.',
    'Kod gözden geçirme zorunlu hâle getirildi.',
];

/** {a}: sorumlu, {t}: termin (ör. "15 Ekim") */
export const ACTIONS = [
    '{a}, {t} tarihine kadar test senaryolarını güncelleyecek.',
    '{a}, {t} tarihine kadar müşteriyle kapsam netleştirme toplantısı ayarlayacak.',
    '{a}, {t} tarihine kadar performans ölçüm raporunu paylaşacak.',
    '{a}, {t} tarihine kadar açık hataların önceliklendirmesini yapacak.',
    '{a}, {t} tarihine kadar sürüm notlarını hazırlayacak.',
];

export const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
/** 'YYYY-AA-GG' → "15 Ekim" */
export const gunAy = (day: string): string => `${Number(day.slice(8, 10))} ${AYLAR[Number(day.slice(5, 7)) - 1]}`;
