# Sürüm notları

Her sürümün başlığı `## vX.Y.Z` biçimindedir; GitHub sürüm sayfası bu bölümü
buradan alır (`.github/workflows/exe.yml`).

## v3.2.0

Jira worklog'larından iş güçleri: kim, hangi kayıtta, ne kadar zaman harcadı ve maliyeti. Asistan uzun yanıtlarda yarıda kalmıyor veri havuzuna (ünvan, maliyet, kişi, bölüm) öneri hazırlayabiliyor ve Excel, CSV, Word, PDF, PowerPoint dosyası verebiliyor.

### Yenilikler

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
