import type { Rng } from '../../utils/planning/random.js';

/**
 * Pilot verisinin metinleri: Jira kayıt başlıkları/açıklamaları, Confluence
 * tarzı toplantı notları, riskler ve müşteri istekleri için şablonlar.
 * Tohumlu rastgele seçim — aynı tohum aynı metni üretir.
 */

export const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

export type SimIssueType = 'Hata' | 'Hikaye' | 'İyileştirme' | 'Görev';

const BUG = [
    '{m} ekranında kaydetme sonrası liste yenilenmiyor',
    '{m} içinde tarih alanı yanlış saat dilimiyle gösteriliyor',
    '{m} büyük veri setinde zaman aşımına düşüyor',
    '{m} yetkisiz kullanıcıya düzenleme düğmesini gösteriyor',
    '{m} Türkçe karakterli aramada sonuç döndürmüyor',
    '{m} dışa aktarılan dosyada sütunlar kayıyor',
    '{m} çevrimdışıyken uygulama kapanıyor',
    '{m} hata mesajı kullanıcıya teknik ayrıntı gösteriyor',
    '{m} sayfalamada son sayfa boş geliyor',
    '{m} eşzamanlı güncellemede veri kaybı',
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

export const issueText = (rng: Rng, type: SimIssueType, modules: string[]): { summary: string; description: string } => {
    const m = pick(rng, modules);
    const pool = type === 'Hata' ? BUG : type === 'Hikaye' ? FEATURE : type === 'İyileştirme' ? IMPROVEMENT : TASK;
    const raw = pick(rng, pool).replace('{m}', m);
    return { summary: raw.charAt(0).toLocaleUpperCase('tr-TR') + raw.slice(1), description: pick(rng, DESC[type]) };
};

export const RISKS = [
    { title: 'Kilit personelin izin dönemi', mitigation: 'Bilgi aktarımı yapılacak, yedek kişi atanacak' },
    { title: 'Müşteri kapsam değişikliği talebi', mitigation: 'Değişiklik kontrol kurulunda değerlendirilecek' },
    { title: 'Test ortamının geç hazırlanması', mitigation: 'Bilgi İşlem ile haftalık takip toplantısı' },
    { title: 'Donanım tedarikinde gecikme', mitigation: 'Alternatif tedarikçi araştırılacak' },
    { title: 'Performans hedefinin tutturulamaması', mitigation: 'Erken yük testi ve mimari gözden geçirme' },
    { title: 'Entegrasyon arayüzünün belgelenmemesi', mitigation: 'Karşı ekip ile arayüz kontrol belgesi hazırlanacak' },
    { title: 'Hata yükünün sürüm takvimini aşması', mitigation: 'Hata ayıklama sprinti planlanacak' },
    { title: 'Lisans yenilemesinin gecikmesi', mitigation: 'Satın alma süreci erkene çekilecek' },
];

export const REQUESTS = [
    { title: 'Raporlara kurum logosu eklenmesi', description: 'Resmi yazışmalarda kullanılmak üzere.' },
    { title: 'Aylık özetin e-postayla gönderilmesi', description: 'Yöneticilere her ayın ilk iş günü.' },
    { title: 'Mobil cihazda karanlık tema', description: 'Saha ekipleri gece kullanımı için istedi.' },
    { title: 'Eski kayıtların arşivlenmesi', description: 'Beş yıldan eski kayıtlar ayrı ekranda.' },
    { title: 'Kullanıcı eğitimi takvimi', description: 'Yeni sürüm öncesi iki oturum.' },
    { title: 'Veri saklama süresinin uzatılması', description: 'Mevzuat değişikliği nedeniyle.' },
];

export const MEETINGS = ['Sprint değerlendirme toplantısı', 'Haftalık koordinasyon', 'Müşteri ilerleme toplantısı', 'Teknik tasarım gözden geçirme', 'Risk değerlendirme toplantısı', 'Test sonuçları değerlendirmesi'];

export const DECISIONS = [
    'Rapor ekranındaki dışa aktarım bir sonraki sürüme kaydırıldı.',
    'Kritik hatalar kapanmadan yeni özellik geliştirmeye başlanmayacak.',
    'Test ortamı hazır olana kadar kabul testleri hazırlık ortamında yapılacak.',
    'Müşterinin ek isteği kapsam dışı; değişiklik talebi olarak yazılacak.',
    'Performans ölçümleri her sprint sonunda tekrarlanacak.',
    'Kod gözden geçirme zorunlu hâle getirildi.',
];

export const ACTIONS = [
    '{a} test senaryolarını Perşembe\'ye kadar güncelleyecek.',
    '{a} müşteriyle kapsam netleştirme toplantısı ayarlayacak.',
    '{a} performans ölçüm raporunu paylaşacak.',
    '{a} açık hataların önceliklendirmesini yapacak.',
    '{a} sürüm notlarını hazırlayacak.',
];
