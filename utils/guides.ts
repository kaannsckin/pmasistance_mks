/**
 * Sayfa rehberleri: yeni özelliklerin adım adım kullanımı ve örnek
 * senaryolar. Sayfa ilk açıldığında bir kez kendiliğinden, sonra "?"
 * düğmesiyle açılır. Görüldü bilgisi bu tarayıcıda tutulur; rehberin
 * sürümü artarsa (içerik önemli ölçüde değişirse) yeniden gösterilir.
 */

export type GuideId = 'planning' | 'forecast';

export interface GuideStep {
    id: string;
    icon: 'rocket' | 'download' | 'plus' | 'sparkles' | 'activity' | 'flag' | 'timeline' | 'refresh' | 'target' | 'gauge' | 'shield' | 'list';
    title: string;
    summary: string;
    /** Nasıl kullanılır (sıralı) */
    how: string[];
    scenario: { title: string; text: string };
    tip?: string;
    /** Planlama kipi: "?" bu kipteyken basılırsa rehber bu adımdan açılır */
    mode?: 'record' | 'release' | 'simulate';
}

export interface Guide {
    id: GuideId;
    version: number;
    title: string;
    steps: GuideStep[];
}

const PLANNING: Guide = {
    id: 'planning',
    version: 1,
    title: 'Planlama asistanı rehberi',
    steps: [
        {
            id: 'welcome', icon: 'rocket', title: 'Planlama asistanı',
            summary: 'Yeni kayıtların süresini, sürüm planlarını ve teslim tarihini, ekibinizin geçmişte işleri gerçekte ne kadar sürede kapattığına bakarak tahmin eder.',
            how: [
                'Yeni kayıt: tek bir kaydın süresi, eforu, önemi ve hangi sürüme sığacağı.',
                'Sürüm planı: bir sürümün kayıtlarını altı adımda planlayıp görevlere aktarma.',
                'Plan simülasyonu: açık işlerle olasılıklı teslim tarihi (P50 · P80 · P95).',
                "Jira'dan geçmiş: tahminlerin öğrendiği kapanmış kayıtları içe alma.",
            ],
            scenario: { title: 'İlk kez kullanıyorsanız', text: 'Önce "Jira\'dan geçmiş" ile son bir iki yılın kapanmış kayıtlarını aktarın. Başlıktaki "Eğitime uygun kapanmış kayıt" sayısı arttıkça öneriler güvenilir hâle gelir. Ardından yeni kayıtlarınızı "Yeni kayıt" kipinden açın.' },
            tip: 'Bu rehberi istediğiniz an sayfa başlığındaki "?" düğmesiyle yeniden açabilirsiniz.',
        },
        {
            id: 'jira', icon: 'download', title: "Jira'dan kayıt geçmişi",
            summary: 'Asistanın öğrendiği veri, projenin kapanmış kayıtlarıdır. Jira\'dan durum geçmişiyle birlikte aktarıldığında işe başlama ve kapanış anları kesinleşir.',
            how: [
                '"Jira\'dan geçmiş" düğmesine basın; proje anahtarı (ör. MKS) projeden dolu gelir.',
                'Dönemi (ör. son 12 ay) ve kapsamı seçin: yalnız kapanmış kayıtlar ya da açık kayıtlar dahil.',
                '"Jira\'dan getir" ile önizlemeyi görün: kaç kayıt yeni, kaçı güncellenecek, eğitime uygun kayıt sayısı nasıl değişecek.',
                '"Aktar" ile kayıtları birleştirin. Uygulamadaki sürüm, öncül, iş paketi ve kendi tahminleriniz korunur.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'MKS projesinde son 2 yılda 1.240 kayıt bulunur: 1.180 yeni, 60 güncellenecek. Önizleme "Eğitime uygun kapanmış: 35 → 1.020" der. Aktarımdan sonra yeni kayıt önerileri onlarca benzer kayda dayanır.' },
            tip: 'Jira bağlantısı sunucuda yapılandırılmamışsa aynı alanları görev listesindeki "İçe / dışa aktar › Jira CSV dosyasından" ile alabilirsiniz (durum geçmişi hariç).',
        },
        {
            id: 'record', icon: 'plus', title: 'Yeni kayıt: geçmişten tahmin', mode: 'record',
            summary: 'Başlık ve açıklama yazdıkça en benzer kapanmış kayıtlar bulunur; öneri, onların gerçek sürelerinden bir aralık olarak verilir.',
            how: [
                'Başlığı ve açıklamayı yazın; türü, birimi ve varsa iş paketini seçin.',
                'Öneri kartında kapanma süresi (P50–P80 iş günü), efor (iyimser · olası · kötümser), önem ve tür önerisini görün. "Dayanak kayıtlar" önerinin neye dayandığını gösterir.',
                '"Kayda yazılacak tahmin" bölümünden kaynağı seçin: önerilen, kendi tahmininiz, geçmiş sapmaya göre düzeltilmiş, AI ya da model.',
                '"Hangi sürüme sığar?" her sürüm için olasılığı gösterir. Sürümü seçip "Kayıtlara gönder"e basın.',
            ],
            scenario: { title: 'Örnek senaryo', text: '"Giriş ekranında oturum zaman aşımı hatası" yazdınız. Asistan 14 benzer kayıt bulur: kapanma 3–5 iş günü, efor 1,5 · 2 · 4 gün, önem Yüksek. Sürüm 12 için olasılık %85, sürüm 11 için %40 çıkar; kaydı sürüm 12\'ye gönderirsiniz.' },
        },
        {
            id: 'blind-ai', icon: 'sparkles', title: 'Kör tahmin ve AI önerisi', mode: 'record',
            summary: 'Kör tahmin açıksa öneriler siz kendi tahmininizi girene kadar gizlenir. Böylece öneriler sizi yönlendirmez ve zamanla kimin daha isabetli olduğu ölçülür.',
            how: [
                'Kendi tahmininizi (gün) girip "Önerileri göster"e basın ya da "Tahminim yok, göster" deyin.',
                '"AI önerisi al" benzer kayıtları gerçek süreleriyle AI\'ya verir; tür, önem, efor aralığı, gerekçe ve netleştirilmesi gereken sorular gelir.',
                'AI\'nın dayandığı kayıtlar doğrulanır; geçmişle çelişirse uyarı çıkar ve güven düşer.',
                'Kişi adları ve başka projelerin kayıt adları AI\'ya gönderilmez.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Siz 2 gün dediniz; geçmiş kayıtlar 3 gün, AI 2,5 gün önerdi. Kayıt kapandığında gerçek süre 3,5 gün çıkarsa öneri günlüğü bu farkı kaydeder. Birkaç ay içinde hangi kaynağın daha isabetli olduğu yönetici konsolunda görünür.' },
            tip: 'AI önerisi, yönetici konsolundaki kalite kapısından geçmediyse kapalı olabilir; geçmiş kayıt önerisi her zaman çalışır.',
        },
        {
            id: 'model', icon: 'activity', title: 'Model tahmini (makine öğrenmesi)', mode: 'record',
            summary: 'Geçmiş kayıtlardan tarayıcıda eğitilen bir model; tür, birim, proje, iş paketi, ekip tahmini ve metindeki sözcüklerden efor ve kapanma süresi tahmin eder.',
            how: [
                'Model, yalnız yönetici sınamasında geçmiş kayıt tahmininden daha isabetli çıktıysa (ya da yönetici açtıysa) görünür.',
                '"Model tahmini" kartında efor aralığı, kapanma süresi, olasılığıyla önem ve tür önerisi yer alır; "Uygula" ile alırsınız.',
                '"Etkenler" tahmini neyin uzattığını ya da kısalttığını gösterir.',
                'Kendi tahmininizi girerseniz model, onu da hesaba katan ayrı bir sürümle tahmin eder.',
            ],
            scenario: { title: 'Örnek senaryo', text: '"Aylık rapor dışa aktarma özelliği" için model 4 · 6 · 9 gün önerir. Etkenler "Tür: Yeni özellik +%40" ve "Sözcük: rapor +%25" der: raporlama işleri bu ekipte geçmişte uzun sürmüştür. Aralığı buna göre seçersiniz.' },
        },
        {
            id: 'release', icon: 'flag', title: 'Sürüm planı sihirbazı', mode: 'release',
            summary: 'Bir sürümün bütün kayıtlarını altı adımda planlar. Taslak otomatik kaydedilir; listeden "Devam et" ile kaldığınız adımdan sürdürürsünüz.',
            how: [
                'Tanım: ad, hedef tarih, özet, iş paketleri ve test süresi.',
                'Kayıtlar: tek tek ekleyin, Excel ya da Jira\'dan yapıştırın veya havuzdan seçin; isterseniz kendi tahminlerinizi girin.',
                'Öneriler: her satırda geçmiş kayıtlar, AI ve model önerisi; kaynağı seçin, elle düzeltin ya da kaydı kapsam dışı bırakın.',
                'Simülasyon: P50 · P80 · P95 teslim ve hedefe yetişme olasılığı. Hedef tutmuyorsa "Kapsam önerisi hesapla".',
                'Kilometre taşları: iş paketine ya da önceliğe göre kurun; her taşın tarihi simülasyondan gelir.',
                'Aktarım: "Planı aktar" görevleri açar, Hedefler\'e ekler ve planı taban çizgisi olarak dondurur.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Sürüm 2.0 için 18 kayıt yapıştırdınız; hedef 4 Kasım. Simülasyon hedefin %55 olasılıkla tuttuğunu söyler. "Kapsam önerisi hesapla" düşük öncelikli 3 kaydı çıkarınca olasılık %82 olur ve planı aktarırsınız. Haftalar sonra "Güncel tahmin" taban çizgisine göre kaç iş günü kaydığınızı gösterir.' },
        },
        {
            id: 'simulate', icon: 'timeline', title: 'Plan simülasyonu', mode: 'simulate',
            summary: 'Projenin açık kayıtları ekip kapasitesiyle binlerce kez çizelgelenir; teslim tarihi tek bir tarih değil, olasılık olarak verilir.',
            how: [
                'Kapsamı (tüm açık kayıtlar ya da bir sürüme kadar), hedef tarihi ve test süresini seçin.',
                'Sonuçta P50 (yarı yarıya), P80 (taahhüt için önerilen) ve P95 tarihlerini, hedefe yetişme olasılığını ve dağılım grafiğini görün.',
                '"Teslimi belirleyen kayıtlar" kritik yoldaki ve belirsizliğe en çok katkı yapan işleri sıralar.',
                'Senaryo deneyin: kayıt çıkarın, ek kişi ekleyin ya da birim içinde serbest dağıtımı açın.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Yönetim 15 Aralık\'ta teslim istiyor. Simülasyon P50 için 10 Aralık, P80 için 22 Aralık der; 15 Aralık %62 olasılıkla tutar. Yazılım birimine bir kişi eklediğinizde P80 12 Aralık\'a çekilir ve toplantıya "ek kişiyle %88" bilgisiyle gidersiniz.' },
        },
        {
            id: 'loop', icon: 'refresh', title: 'Öğrenme döngüsü',
            summary: 'Gösterilen her öneri ve verdiğiniz karar öneri günlüğüne yazılır; kayıt kapanınca gerçekle karşılaştırılır. Asistan zamanla ekibinize göre ayarlanır.',
            how: [
                'Kayıtları planlama asistanından açın; böylece öneriler ve kararlar ölçülebilir.',
                'Kayıtların durumunu (Süreçte, Tamamlandı) güncel tutun; süreler bu anlardan ölçülür.',
                'Tür ve birim alanlarını doldurun; benzer kayıt eşleşmesi ve model bunlarla iyileşir.',
                'Yönetici konsolundaki "Tahmin kalitesi" bölümü isabeti, kalibrasyonu ve modeli izler.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Üç ay sonra öneri günlüğünde 120 kapanmış kayıt vardır: geçmiş kayıt önerisinin ortalama hatası 1,1 gün, kör tahminlerin 1,8 gün. Ekip, tahmin toplantısında önce öneriye bakmaya karar verir.' },
        },
    ],
};

const FORECAST: Guide = {
    id: 'forecast',
    version: 2,
    title: 'Tahmin kalitesi rehberi',
    steps: [
        {
            id: 'overview', icon: 'target', title: 'Tahmin kalitesi',
            summary: 'Planlama asistanının tahminleri ne kadar güvenilir? Bu bölüm tahminleri geleceği görmeden, geçmiş verilerle sınar.',
            how: [
                'Her kayıt yalnız kendisinden önce kapanmış kayıtlarla tahmin edilir; her geçmiş sürüm başladığı günkü verilerle simüle edilir.',
                'Dürüst bir aralıkta gerçeklerin yaklaşık yarısı P50\'nin, yaklaşık %80\'i P80\'in altında kalır.',
                'Kartlar: geriye dönük testler, kalibrasyon, makine öğrenmesi modeli, altın set ve kalite kapısı, ince ayar kararı, öneri isabeti.',
            ],
            scenario: { title: 'Ne zaman bakmalı?', text: 'Jira\'dan büyük bir geçmiş aktarıldığında, ekip ya da süreç değiştiğinde ve ayda bir rutin olarak testleri yeniden çalıştırın.' },
            tip: 'Bu rehberi istediğiniz an başlıktaki "?" düğmesiyle yeniden açabilirsiniz.',
        },
        {
            id: 'record-backtest', icon: 'refresh', title: 'Benzer kayıt tahmini — geriye dönük test',
            summary: 'Son kapanan kayıtlar, o gün bilinen bilgiyle yeniden tahmin edilir ve gerçek kapanma süresi ile eforla karşılaştırılır.',
            how: [
                'Kayıt sayısını (100, 200 ya da 500) seçip "Testi çalıştır"a basın; test durdurulabilir.',
                'P80\'in altında kalma oranı %80 civarındaysa aralıklar dürüsttür; çok düşükse tahminler iyimser, çok yüksekse gereğinden temkinlidir.',
                'Ekibin kendi tahminiyle karşılaştırma ve birim × tür kırılımı, hangi işlerde zorlandığınızı gösterir.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Test, P80\'in kayıtların %62 kadarında tuttuğunu söyler; Test birimindeki hatalarda oran %40\'a düşer. Kalibrasyon kartında Test · Hata grubunun son 90 günde belirgin uzadığını görürsünüz: yeni test ortamı süreleri uzatmıştır.' },
        },
        {
            id: 'release-backtest', icon: 'flag', title: 'Sürüm simülasyonu — geriye dönük test',
            summary: 'Tamamlanmış sürümler başladıkları günkü tahminlerle yeniden simüle edilir; gerçek bitişin P50 ve P80 tarihlerine yetişip yetişmediği ölçülür.',
            how: [
                '"Testi çalıştır" her tamamlanmış sürümü, o güne kadar kapanmış kayıtların kalibrasyonuyla simüle eder.',
                'P80 tarihine yetişme oranı %80 civarı olmalıdır; tek nokta plan genelde çok daha az tutar.',
                'Anlamlı bir oran için en az beş tamamlanmış sürüm gerekir.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Son 8 sürümün 7\'si P80 tarihine yetişmiş, tek nokta plan ise yalnız 2 sürümde tutmuş. Yönetime taahhüdü neden P80 tarihiyle vermek gerektiğini bu tabloyla gösterirsiniz.' },
        },
        {
            id: 'calibration', icon: 'gauge', title: 'Kalibrasyon',
            summary: 'Birim ve tür grubu başına gerçekleşen efor ÷ tahmin oranı: ekibin sistematik olarak iyimser mi temkinli mi olduğunu gösterir.',
            how: [
                'Oran 1 ise tahminler isabetlidir; 1,4 tahminden yüzde 40 uzun, 0,8 yüzde 20 kısa demektir.',
                '"Son 90 gün" ve "Kayma" sütunları yakın dönemdeki değişimi gösterir.',
                'Planlamada "geçmiş sapmaya göre düzeltilmiş" seçeneği bu oranı kendi tahmininize uygular.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Yazılım · Yeni özellik grubunda oran ×1,5, son 90 günde ×1,9. Ekip yeni özellikleri sistematik olarak küçük tahmin ediyor ve fark büyüyor; tahmin toplantısında bu grubu ayrıca konuşursunuz.' },
        },
        {
            id: 'ml', icon: 'activity', title: 'Makine öğrenmesi modeli',
            summary: 'Geçmiş kayıtlardan tarayıcıda eğitilen model, geçmiş kayıt tahminiyle aynı kayıtlarda yarıştırılır; yalnız daha isabetliyse planlamada önerilir.',
            how: [
                '"Eğit ve sına" modeli, son kapanan kayıtlardan önceki kayıtlarla eğitir ve o son kayıtlarda karşılaştırır.',
                'Karar iki durum için ayrı verilir: ekip tahmini olmadan ve ekibin kendi tahmini girildiğinde.',
                '"Planlamada model önerisi": otomatik (yalnız geçtiği durumda), her zaman göster ya da kapalı.',
                '"Efora en çok etki eden özellikler" modelin neye baktığını gösterir.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Sınamada modelin efor hatası 0,8 gün, geçmiş kayıt tahmininin 1,0 gün; model aralığı gerçeğin %81 kadarını kapsıyor. Kart "Geçmiş kayıt tahmininden isabetli" der ve otomatik kipte proje yöneticileri yeni kayıtta "Model tahmini"ni görür.' },
            tip: 'Model için en az 60, sınama için en az 80 eğitime uygun kapanmış kayıt gerekir.',
        },
        {
            id: 'gold', icon: 'shield', title: 'Altın set ve AI kalite kapısı',
            summary: 'Doğruluğu onaylanmış kayıtlardan oluşan altın sette AI önerisi ölçülür; kapı zorunluysa geçmeyen AI önerisi planlamada kapanır.',
            how: [
                '"Kayıt ekle" ile doğruluğu onaylanmış kapanmış kayıtları seçin; gerekirse doğru önem ve türü düzeltin.',
                '"AI ile değerlendir" AI önerisini bu kayıtlarda, önemini ve türünü söylemeden çalıştırır.',
                'Eşikler: AI hatası, önem doğruluğu ve aralık kapsaması. İstem ya da model değişince sonuç "eski" sayılır.',
                '"Kalite kapısı zorunlu" açıksa ve sonuç geçmediyse planlamada AI tahmin önerisi kapanır.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Sunucudaki AI modeli değişti; kapı "eski" görünür. 40 kayıtlık altın sette yeniden değerlendirirsiniz ve önem doğruluğu sınırın altında kalır. Kapı zorunlu olduğundan AI önerisi kapanır, geçmiş kayıt önerisi çalışmaya devam eder.' },
        },
        {
            id: 'finetune', icon: 'sparkles', title: 'İnce ayar kararı',
            summary: "AI'yı kurumun kayıt geçmişiyle ince ayarlamanın (fine-tuning) gerekip gerekmediğini ölçülere bakarak söyler; gerekirse veri kümesini hazırlar.",
            how: [
                'Kart kayıt sayısını, altın seti, AI ve model sınamasını ve gerçek kullanımı denetler.',
                'Karar dört durumdan biridir: veri yetersiz, gerekmiyor, düşünülebilir ya da önerilir; altında gerekçe ve sonraki adımlar yazar.',
                '"Veri kümesini hazırla" eğitim ve doğrulama dosyalarını ve veri kartını üretir. Altın setteki kayıtlar dışarıda kalır, kişi adları maskelenir.',
                'İnce ayarlı model sunucuda ayrı bir model adıyla tanımlanır ve altın sette aynı kapıyla değerlendirilir; geçerse kullanıma alınır.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'Altın sette AI hatası geçmiş kayıt tahmininin 1,4 katı, makine öğrenmesi modelininki 0,85 katı. Kart "İnce ayar gerekmiyor" der: sayısal tahmini model yapar, AI gerekçe ve sorular için kalır. İnce ayarın maliyetinden ve bakım yükünden kaçınırsınız.' },
            tip: 'Ayrıntılı karar ölçütleri ve uygulama adımları depodaki docs/INCE_AYAR_KARARI.md belgesindedir.',
        },
        {
            id: 'log', icon: 'list', title: 'Kayıt tahmini önerileri',
            summary: 'Planlama asistanında gösterilen her öneri ve verilen karar saklanır; kayıt kapanınca gerçekle eşlenir.',
            how: [
                'Kaynak başına (geçmiş kayıtlar, AI, model, kör tahmin, nihai karar) ortalama hata ve aralık kapsaması görünür.',
                'AI önerisinin kabul oranı ve aynı kayıtlarda AI ile kör tahminin karşılaştırması yer alır.',
                '"Öneri günlüğü (CSV)" analiz ve eğitim verisi olarak indirilebilir; kişi adı içermez.',
            ],
            scenario: { title: 'Örnek senaryo', text: 'AI önerisinin kabul oranı düşük, ama kabul edilen kayıtlarda hata kör tahminin yarısı kadar. Proje yöneticilerine AI önerisini daha çok dikkate almalarını önerirsiniz.' },
        },
    ],
};

export const GUIDES: Record<GuideId, Guide> = { planning: PLANNING, forecast: FORECAST };

const KEY = 'PLANASISTAN_GUIDES_V1';

const read = (): Record<string, number> => {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || '{}');
        return v && typeof v === 'object' ? v : {};
    } catch {
        return {};
    }
};

/** Rehber bu tarayıcıda (bu sürümüyle) görüldü mü */
export const guideSeen = (id: GuideId): boolean => (read()[id] || 0) >= GUIDES[id].version;

export const markGuideSeen = (id: GuideId): void => {
    try {
        localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: GUIDES[id].version }));
    } catch {
        /* özel pencere ya da kapalı depolama: rehber yine çalışır, yalnız her açılışta gösterilir */
    }
};

/** "?" bir kipteyken basılırsa o kipin ilk adımı */
export const startStepFor = (guide: Guide, mode?: string): number => {
    const i = mode ? guide.steps.findIndex(s => s.mode === mode) : -1;
    return i >= 0 ? i : 0;
};
