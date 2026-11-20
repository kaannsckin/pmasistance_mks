# Sürüm notları

Her sürümün başlığı `## vX.Y.Z` biçimindedir; GitHub sürüm sayfası bu bölümü
buradan alır (`.github/workflows/exe.yml`).

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
