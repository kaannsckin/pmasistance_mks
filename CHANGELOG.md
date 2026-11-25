# Sürüm notları

Her sürümün başlığı `## vX.Y.Z` biçimindedir; GitHub sürüm sayfası bu bölümü
buradan alır (`.github/workflows/exe.yml`).

## v3.5.0

**Asistan: analiz ve rapor yetenekleri**
- Asistan analist gibi çalışıyor: veriyi döküm yerine yorumluyor (kıyas, eğilim, yoğunlaşma, aykırı değer, neden ve somut öneri). Anthropic Agent Skills modeline göre 9 yetenek (oyun kitabı) eklendi: veri analizi, analitik rapor, yönetici özeti, sapma ve kök neden, risk, kapasite, tahmin, karar destek, toplantı hazırlığı. Uyan oyun kitabı otomatik yükleniyor ya da `/analiz`, `/analizrapor`, `/yonetici`, `/kokneden`, `/tahmin`, `/karar`, `/toplanti` komutlarıyla açılıyor.
- Hesap motoru (`veri_analiz`): ekli Excel/CSV'nin tüm satırları ya da uygulama verisi üzerinde profil, gruplama ve pay, pivot, trend, dağılım, aykırı değer, korelasyon. Model sayıları kafadan toplamıyor. CSV'de Türkçe ondalık virgül doğru okunuyor.
- Rapor dosyalarında gösterge kartları, bulgu / dikkat / öneri / karar kutuları ve grafikler (çubuk, çizgi, pasta) var: PowerPoint'te yerel grafik, PDF'te çizim, Word'de değer ve çubuk tablosu, Excel'de özet sayfası ve grafik verisi. Ayrıntı: [docs/ASISTAN_YETENEKLERI.md](docs/ASISTAN_YETENEKLERI.md).

**Sprint planlama ve ekip takvimi**
- Görevler birden çok ardışık sprinte yayılabilir ("Sprintler arası · 2 → 3"); efor sprintlere eşit bölünür, otomatik plan ardışık sprintlerde yer arar.
- Jira sprint aktarımı ve sürüm sihirbazı geliştirildi: bitmemiş kayıt önceki sprintinde kalıp sonraki sprinte devredilebilir; önizleme devredilecek kayıtları gösterir.
- Otomatik plan öncesi kontrol: süresi, bileşeni ya da sorumlusu eksik görevler listelenir ve tek ekranda düzeltilir. Takvime "Test sonraki sprintle paralel yürüsün" seçeneği eklendi.
- Sprint ekip takvimi görev listesiyle açılır (efor, Jira'ya girilen süre, kalan süre); Tempo görünümünde günlük plan ve Jira çalışma kayıtları yan yana, gün ayrıntısında sprint görev havuzu ve "Sprint sonuna yetişmez" uyarısı.
- Sprintin son görevi bitince tamamlama animasyonu (hareketi azalt açıksa yalnız bildirim).

**Arayüz ve bulut**
- Cam teması ve cam mercek geçişleri.
- Bulut girişi e-posta koduyla ya da (tanımlıysa) parolayla; proje erişimi yönetimi. Kod gönderimindeki Supabase sunucu hataları anlaşılır gösteriliyor.
- Vercel'de `/api/ai` ve `/api/integrations` fonksiyonlarının modül bulunamadı hatasıyla çökmesi düzeltildi.

## v3.4.0

- Jira Cloud ve Data Center’dan ilk tahmin, kalan süre, harcanan süre ve alt görev toplamları alınır. Kalan süre alanı dört eşitleme yönünü destekler. Efor sütunları, sorgu alanları ve Efor durumu dashboard bileşeni eklendi.
- Görev ayrıntısı Jira geçmişini ve uygulamanın durum geçişlerini gösterir. Proje dashboard’undaki Jira darboğazları bileşeni, ortanca ve ortalama iş saatleriyle değişiklik sayılarının incelenmesini sağlar.
- Jira çalışma kayıtları salt okunurdur. Görev ayrıntısı ve hafta/ay çizelgesi yetkili kayıtları gösterir. Tarih, kişi, ekip, bileşen, sürüm ve kayıt türü filtreleriyle Excel, CSV ve PDF alınabilir.
- Kaydedilen görev filtreleri adlandırılabilir, güncellenebilir ve sabitlenebilir. Görev listesindeki seçim sprint ve manuel sürüm planına taşınabilir. Seçili termin aralığı Jira ile eşitlenebilir.

## v3.3.0

- Görev listesi ve sürüm planı havuzunda JQL benzeri sorgularla arama, sıralama ve toplu seçim yapılabiliyor. Sorgu kutusunun yanındaki bilgi kartı, tek tıkla uygulanabilen senaryolar sunuyor.
- Sık kullanılan sorgulara ad verilebiliyor ve kısayol olarak sabitlenebiliyor. Kayıtlar bu tarayıcıda proje bazında saklanıyor ve iki ekranda da kullanılabiliyor.
- Görev listesinde seçili kayıtların önceliği, atanan kişisi ve hedef sürümü topluca değiştirilebiliyor. Önizleme her görev için mevcut ve yeni değerleri gösteriyor.
- Sürüm planı aktarılınca proje sürümü oluşturuluyor veya aynı adlı sürüm kullanılıyor. Aktarılan kayıtlarda sürüm, görev ayrıntısında hedef sürüm olarak görünüyor. Eski planlarda boş hedef sürüm alanları dolduruluyor ve mevcut atamalar korunuyor.
- Jira bağlı asistan sohbetlerinde istek başına araç tanımı sınırı 48’e çıkarıldı. Böylece 42 araçla açılan sohbetler kabul ediliyor.

## v3.2.0

Kişiselleştirilebilir proje dashboard'u; Jira worklog'larından iş güçleri: kim, hangi kayıtta, ne kadar zaman harcadı ve maliyeti. Asistan uzun yanıtlarda yarıda kalmıyor veri havuzuna (ünvan, maliyet, kişi, bölüm) öneri hazırlayabiliyor ve Excel, CSV, Word, PDF, PowerPoint dosyası verebiliyor.

### Yenilikler

**Proje dashboard'u (projenin ilk ekranı)**
- Projeye girince "Dashboard" açılır; kullanıcı bileşen ekler, çıkarır, sürükleyip sıralar, genişliğini (1/4 – tam), başlığını, süzgecini (etiket, hariç etiket, iş paketi, kişi, yalnız açık), ölçüsünü (kayıt, efor, harcanan saat) ve gösterimini seçer.
- 16 bileşen: gösterge kartı (19 hazır gösterge: ilerleme, geciken, 14 günde bitecek, kapanma süresi, sprint, efor, kalan efor, harcanan süre, iş gücü maliyeti, plan/gerçekleşen AA, sağlık, risk, engelli, atanmamış, tahmini olmayan…), projeye özel gösterge, ilerleme halkası, durum dağılımı, kırılım (çubuk / halka / tablo), kilometre taşı planı (tarih aralığı, tamamlanma, kümülatif plan), iş paketi (epic) tablosu, çapraz tablo (ısı haritası), plan / gerçekleşen eğrisi, ekip / birim yükü, geciken ve yaklaşan, riskler, şu anki sprint, kim ne kadar çalıştı (worklog), son değişiklikler, not.
- Gruplama: iş akışı durumu, kategori, öncelik, kişi, birim, iş paketi, kayıt türü, sprint, hedef sürüm, bileşen, termin ayı ve etiket aileleri (MS0…MS5, "PoC: …" gibi etiketler kendiliğinden bulunur) ya da seçilen etiketler.
- Her çubuğa, hücreye ve satıra tıklayınca o kayıtların listesi açılır; listeden kayda gidilir.
- Projeye özel göstergeler (PoC skoru gibi): birim, hedef, hedef açıklaması, başlangıç değeri, yön ve tarihli ölçüm geçmişi; dashboard'da güncel değer, son değişim, hedefe ilerleme ve eğri.
- Hazır şablonlar: Genel bakış, Müşteri PoC / bulgu takibi, Sprint odaklı, Yönetici özeti. MS etiketli ya da özel göstergeli projede PoC şablonu kendiliğinden gelir.
- Kişisel düzen bu tarayıcıda saklanır; proje yöneticisi "Proje varsayılanı yap" ile düzenini herkese sunar, "Varsayılana dön" kişisel düzeni siler.
- "Asistanla yorumla": asistan dashboard'u (göstergeler, kilometre taşları, gecikmeler) yorumlar ve aksiyon önerir; asistan projenin özel göstergelerini ve kilometre taşlarını da görür.
- PoC Bulgu Takip Excel'i aktarılınca "PoC skoru" (başlangıç değeri GİB'in ilk değerlendirmesi) ve "Zorunlu açık madde" göstergeleri açılır ve her aktarımda ölçüm eklenir; Milestone sayfasındaki MS0…MS5 tarihleri proje sürümü olur ve kilometre taşı planıyla plan eğrisinde kullanılır.
- Grafik renkleri renk körlüğüne göre doğrulanmış palettir; gece modunda koyu zemine göre seçilmiş tonlar kullanılır.

**İş güçleri (Ekip ve tahsis → İş güçleri)**
- Jira kaydıyla eşitlenen görevlerin worklog'ları (billing hours) kişi kırılımıyla çekilir: kayıtta kim, hangi gün, kaç saat çalışmış.
- Arka planda yenilenir: Jira'daki harcanan süresi değişen kayıtlar dakikada en çok 50'şer istenir; "Jira'dan yenile" ile tümü yeniden çekilir.
- Kişi, kayıt (ATL-12) ya da konuya göre arama; dönem ve proje süzgeci; Kişiler ve Kayıtlar görünümü.
- Kişi ayrıntısı: hangi kayıtta ne kadar zaman harcadığı, payı, aylık dağılımı ve maliyeti (ünvanın aylık maliyeti ÷ ayın iş saati).
- Worklog yazarları havuzdaki kişilerle e-posta, yoksa ad soyad üzerinden eşleşir; eşleşmeyenler ve maliyeti tanımsız saatler ayrıca gösterilir.
- "Gerçekleşen tahsise işle": seçili dönemin saatleri adam-ay olarak gerçekleşen tahsise yazılır (yalnız boş aylar ya da üzerine yaz).
- Görev ayrıntısında "Harcanan süre (Jira)": kayıtta kim kaç saat çalışmış ve maliyeti.

**Asistan**
- Uzun yanıtlar artık yarıda kesilmiyor: yanıt sınıra takılırsa asistan kaldığı yerden kendiliğinden devam eder (en çok iki kez); yanıtlar kısa tutulur, uzun listeler özetlenip ilgili ekran önerilir.
- Yeni Jira yetenekleri: iş gücü raporu (kişi, kayıt ya da proje bazında saat ve maliyet) ve bir kaydın Jira'daki worklog'larını doğrudan okuma.
- Veri havuzu önerileri (PYB Destek): ünvan ve aylık maliyet ekleme/güncelleme, kişi ekleme, kişinin ünvanını, bölümünü, e-postasını ya da AA'sını güncelleme, bölüm ekleme. Ekteki Excel tablosu tek kartta onaylanır; havuzdaki ünvanlar adına göre eşleşir, yenilere kısaltma üretilir, toplam/ortalama satırları atlanır. Her kart "Uygula" denmeden uygulanmaz, denetim günlüğüne yazılır ve geri alınabilir.
- Veri havuzunu listeleme: ünvanlar ve maliyetleri, bölümler, eksiği olan kişiler.
- Toplu görev güncelleme önerisi: termin (tarih ya da ± gün kaydırma), atanan, öncelik, süre ve etiketler; birden çok görev tek kartta ("geciken görevleri iki hafta kaydır", "Ayşe'nin işlerini Mehmet'e ver").
- "Tümünü uygula": bir yanıttaki bütün öneri kartları sırayla uygulanır; tek "Geri Al" hepsini geri alır.
- Takip önerileri: her yanıtın altında, konuşmaya özgü en çok üç sonraki adım çipi (tıklayınca sorulur).
- Akıllı başlangıç önerileri: boş sohbette verideki duruma göre öneriler (geciken görev sayısı ve yeni termin önerisi, maliyeti eksik ünvanlar, ünvanı olmayan kişiler, bu ay kim ne kadar çalıştı).
- Hafıza: "bundan sonra süreleri gün olarak ver, hatırla" gibi kalıcı tercihler kimlik başına bu tarayıcıda saklanır ve her soruda uygulanır; başlıktaki hafıza düğmesinden görülür ve silinir. Hafızaya yalnız kullanıcının kendi mesajındaki açık istekle yazılır (eklenen dosyadaki bir talimat yazamaz); şifre, sicil gibi hassas bilgiler kaydedilmez.
- "Asistana sor": görev ayrıntısı ve kişi profili penceresinden kaydı asistana getirir; asistan kaydı açıklar ve sonraki sorularda ("bu görev için yeni termin öner") aynı kayda bakar. Kayıt, sohbet kutusunun üstünde "Bağlam" olarak görünür ve kaldırılabilir. Ekranda açık görev ve kişi de asistana iletilir.
- "/" komutları: sohbet kutusunda "/" yazınca komut menüsü açılır (/ozet, /geciken, /riskler, /rapor, /isgucu, /kapasite, /excel, /pdf, /sunum, /bu, /hatirla, /unut, /yardim). Komutlar açık projeye ve ekrandaki kayda göre isteğe dönüşür; komuttan sonra yazılan metin eklenir ("/excel riskler").
- Sohbet geçmişi: sohbetler kimlik başına bu tarayıcıda saklanır (en çok 30); sayfa yenilenince son sohbet geri gelir. "Sohbetler" listesinden eski sohbet açılır ya da silinir, "Yeni sohbet" öncekini geçmişte bırakır. Yeniden açılan sohbetteki onay bekleyen öneriler uygulanamaz.
- Modern arayüzde sohbet kutusundaki yazı ataş simgesinin altına girmiyor.
- Proje başlığındaki "Diğer" menü düğmesi ekran okuyucuya doğru (sekme + menü) bildiriliyor.
- Dosya çıktısı: asistan istenen veriyi Excel, CSV, Word, PDF ya da PowerPoint dosyası olarak hazırlar. Sohbetteki karttan seçilen biçim, yanındaki düğmelerden diğer biçimler indirilir. Tablolar uygulamanın okuma araçlarının sonucundan doğrudan doldurulur (sayılar yeniden yazılmaz; dosyada ekrandaki 50 satır sınırı 1 000'e çıkar). Dosya tarayıcıda üretilir, hiçbir yere yüklenmez; PDF'de Türkçe karakterler için yazı tipi gömülür.
- Eklenen Excel dosyaları boş hücreler atılarak okunur ve tek mesaj sınırı iki katına çıktı; büyük tablolar artık yarıda kesilmiyor.

## v3.1.0

Jira tarzı yapılandırılabilir pano ve iş akışları; asistanın ajan modu.

### Yenilikler

**Pano**
- Yapılandırılabilir proje panosu: kolonlar, kolona durum ve etiket kuralları, WIP sınırı (en az / en çok), hızlı filtreler, kulvarlar (acil işler, kişi, öncelik, iş paketi, bileşen, hedef sürüm), panoda arama ve kişiye göre süzme.
- Kart taşınınca projenin iş akışı kuralları uygulanır; tanımsız geçişte uyarı verilir.
- Telefonda kolonlar sekmeyle seçilir.

**İş akışı ve proje yapılandırması (Yönetici konsolu → Proje yapılandırması)**
- Türkçe, ayrıntılı iş akışı durumları (Analizde, Kod İncelemede, Testte, Engellendi…); hesaplar her durumun kategorisini kullanır.
- Jira'daki şema mantığıyla yapılandırmalar: iş akışı, kayıt türleri, zorunlu alanlar ve pano birlikte tanımlanır, projelere atanır.
- İş akışı tasarımcısı; projeye özel iş akışı (izin verilirse proje yöneticisi düzenler).
- Geçiş kuralları: koşullar, doğrulayıcılar, sonrası işlemler; geçişte alan güncelleme ve Çözüm alanı.
- Projeye özel bileşen ve sürüm listeleri, proje rolleri ve bildirim şeması.
- İsteğe bağlı: durum geçişleri Jira'ya da yazılır (geçiş notu yorum, harcanan süre worklog olarak).

**Asistan**
- Dosya ekleme: eklenen dosyaların metni soruyla birlikte yorumlanır.
- Ajan modu: asistan istenen ekranı, görevi, kişi profilini ya da pencereyi açar (veri değiştirmez).
- Jira'dan okuma: kayıtların Jira'daki güncel hâli, Jira'da arama ve bağlantı bilgisi.

**Diğer**
- Planlama sürümleri "sprint" olarak adlandırıldı.
- Yeni ekranlar dört temaya ve gece moduna uyumlu; klasik arayüze gömülen modern parçalar klasik renk seçimini korur.

## v3.0.0 — 20 Kasım 2026

PlanAsistan'ın ilk resmi sürümü ve ilk masaüstü paketi.

### İndirme ve kurulum (Windows)

1. Bu sayfanın altındaki **PlanAsistan-win-x64.zip** dosyasını indirip bir klasöre çıkarın.
2. **PlanAsistan.exe** dosyasına çift tıklayın. Kurulum ya da Node.js gerekmez; tarayıcıda `http://localhost:5180` kendiliğinden açılır.
3. Windows "kişisel bilgisayarınızı korudu" uyarısı gösterirse: **Ek bilgi → Yine de çalıştır** (dosya imzasızdır).
4. Jira, yapay zekâ, Teams ve e-posta ayarları exe'nin yanında oluşan `planasistan.env` dosyasından ya da **Yönetici konsolu → Entegrasyonlar** ekranından girilir. Ayrıntılar paketteki `BENIOKU.txt` dosyasında.

Linux için **PlanAsistan-linux-x64.zip** aynı şekilde çalışır.

Uygulama yalnız bu bilgisayardan erişilebilir (127.0.0.1). Projeler tarayıcının yerel deposunda tutulur; düzenli yedek için **Dışa aktar** ya da bulut eşitlemesini kullanın.

### Yenilikler

**Masaüstü sürümü**
- Tek dosyalık, kurulumsuz exe: arayüz ve sunucu (AI vekili, Jira, Teams, e-posta) tek süreçte çalışır.
- Yazı tipleri ve tüm kitaplıklar pakette: kurum ağı dış sunucuları engellese de uygulama eksiksiz açılır.

**Modern arayüz temaları**
- Renk seçimi yerine dört tema: **Baloncuk**, **Aurora**, **Pro** ve **Kil**. Temalar yazı tipini, köşe ve gölge dilini, zemini ve hareketleri birlikte değiştirir.
- **Gündüz / Gece / Sistem** seçimi; gece modu artık hem klasik hem modern arayüzde çalışıyor. Varsayılan "Sistem": mevcut görünüm kendiliğinden değişmez.
- Telefonda Pano kolonları sekmeyle seçilir. Kenar çubuğunun alt kısmı (profil, ayarlar) her zaman görünür.
- Erişilebilirlik: tüm temalar gündüz ve gece modunda WCAG AA kontrast denetiminden geçti; "hareketi azalt" tercihine uyulur.
- Sürprizler: yazı alanı dışında `egg` yazın.

**Jira**
- Canlı eşitleme: kapsamlı okuma, otomatik eşitleme, uygulamadan Jira'ya güncelleme.
- Alan bazında eşitleme yönü (yok · Jira → uygulama · uygulama → Jira · çift yönlü); çakışmada Jira esas alınır ve bildirilir.
- Jira'daki atananlar Veri Havuzu'na ve proje ekibine eklenir.

**Ekip tahsisi**
- Hücreler adam-ay ya da yüzde olarak girilir; kapalı hücrenin nedeni yazılır.
- Jira'dan plan (kalan efor termine yayılır) ve Jira worklog'larından gerçekleşen.

**Yapay zekâ ve asistan**
- TÜBİTAK BİLGEM sağlayıcısı: yalnız API anahtarıyla bağlantı.
- Asistan önerileri: ay aralığına tahsis, Jira eşitleme, Jira worklog raporu. Öneriler onaysız uygulanmaz, denetim günlüğüne yazılır ve geri alınabilir.

**Entegrasyon ayarları**
- Jira, Teams ve SMTP değerleri Yönetici konsolundan girilir, şifreli saklanır; yeniden başlatma gerekmez.

**Veri aktarımı**
- GİB PoC bulgu takip Excel'inden proje aktarımı; yeni sayfalar, etiketler ve notlar.

**Pilot düzeltmeleri**
- Yayın yalnız onaylı raporları dondurur (B-030).
- PY kendi raporunu bölüm sorumlusu olarak onaylayamaz (B-016).
- Bölüm sorumlusunun uygun kişi araması aday sayılmaz (B-008).
- Rolsüz tahsis satırı sahte "Rol atanmamış" açığı üretmez (B-025).
- Haftalık rapor gönderim anının EVM'siyle denetlenir (B-029).

### Bilinen sınırlar
- Exe imzasızdır; Windows ilk açılışta uyarı gösterebilir.
- Vercel'deki ayarlar exe'ye kendiliğinden gelmez; `planasistan.env` dosyasına kopyalanmalıdır.
- Port değişirse (`PORT=`) tarayıcı verileri farklı adreste aranır; önce yedek alın.
