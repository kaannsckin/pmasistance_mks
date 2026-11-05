# Deniz (ui-gorsel) · Tur 1 bulguları · 2026-11-04

Kod: `claude/zealous-tesla-hidbc9@81bd671` · port 4181 · ekran 1440×900 · veri: pilot (bir koşuda boş) · tarayıcı: Chromium (playwright-core)

## Koşu özeti

- **Taranan:** 7 ana ekran (Portföy, Yönetim, Ekip ve tahsis, Haftalık rapor, Risk raporu, proje Genel bakış / klasikte Pano, Ayarlar penceresi) × 8 temel koşul (arayüz modern/klasik × sistem açık/koyu × uygulama Gündüz/Gece), renk teması `classic`. 56 hücrenin 50'si görüntülendi (eksik 6 hücre: `tema-matrisi.md`).
- **Ek tarama:** Renk temaları (zümrüt, mor, turuncu) modern açık ve koyuda Portföy ve Genel bakış ekranlarında, koyuda Ayarlar penceresinde; klasik koyuda zümrüt. Modern koyu ve açıkta ikincil ekranlar: Yönetim › Ayrıntılı analiz, Raporlar menüsü; Tahsis › Araçlar menüsü, Kapasite–talep, Öngörü, Senaryo; Takvim, Görüşmeler, Beklentiler, Veri havuzu, Asistan, Ctrl+K paleti, Durum raporu penceresi, ekran rehberleri. Koyu modda proje sekmeleri: Pano, Liste, Zaman çizelgesi, Planlama, Riskler, Ekip.
- **Teknikler:** göz kısma (`blur 6px`) ve gri tonlama süzgeçleri, `kontrastTara`, `yuzeyAyrimi`, `kokDurum`, ekran görüntüsünden piksel örnekleme, üzerine gelme, odak ve boş süzgeç durumları.
- **Toplam:** 158 ekran görüntüsü, 23 betik çalıştırması (`betik/`).
- **Bulgu sayısı (tam biçimde 12):** K1: 0 · K2: 4 · K3: 7 · K4: 1. Ayrıca "Kısa notlar" altında 10 tek satırlık not var.
- **Ortam notu:** `cdn-icons-png.flaticon.com` vekil sunucudan geçmiyor (dış simge). Bulgu değildir.

| Kimlik | Önem | Başlık |
|---|---|---|
| UI-GRS-01 | K2 | Gece/Gündüz ayarı hiçbir arayüzde uygulanmıyor; tema yalnız işletim sistemini izliyor |
| UI-GRS-02 | K2 | Ayarlar penceresinde "Değişiklikleri Uygula" koyu modda okunmuyor (1,95–2,72:1) |
| UI-GRS-03 | K2 | Yönetim › Ayrıntılı analiz: durum rozetleri ve uyarı yazıları iki temada da 3:1'in altında |
| UI-GRS-04 | K2 | Koyu modda eski bileşenlerde sıfır değerleri, tarihler ve seçili segment okunmuyor (1,94–1,99:1) |
| UI-GRS-05 | K3 | Koyu modda açılır pencereler (rehber, Ctrl+K paleti, Durum raporu) sayfa zeminiyle aynı siyah, kenarları görünmüyor |
| UI-GRS-06 | K3 | Koyu modda açılır menüler (Raporlar, Araçlar) altlarındaki kartla aynı renkte, iki katman birbirine karışıyor |
| UI-GRS-07 | K3 | Modern koyu modda eski ekranlar klasik lacivert-gri paletle açılıyor (eski ekran sızıntısı) |
| UI-GRS-08 | K3 | Koyu modda tahsis ısı haritası ve risk matrisi yalnız tona dayanıyor; gri tonlamada seviyeler ayrılmıyor |
| UI-GRS-09 | K3 | Gün Batımı (turuncu) temasında vurgu rengi uyarı turuncusuyla aynı; nötr öğeler "riskli" gibi görünüyor |
| UI-GRS-10 | K3 | Durum raporu penceresinde 34 satırlık rapor 45 px'lik kutuya sıkışıyor |
| UI-GRS-11 | K3 | Koyu modda seçili segmentteki sayaç sönük (2,71:1) |
| UI-GRS-12 | K4 | Klasik arayüzde Risk raporu ve Haftalık rapor modern "siyah ada" olarak açılıyor |

---

### UI-GRS-01 · Gece/Gündüz ayarı hiçbir arayüzde uygulanmıyor; tema yalnız işletim sistemini izliyor
- Önem: K2
- Ekran: tüm ekranlar; Ayarlar › Görünüm & Temalar düğmesi          Arayüz: modern ve klasik
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot
- Adımlar: 1. İşletim sistemi açık temadayken uygulamayı modern arayüzde aç. 2. Kenar çubuğunun altındaki Ayarlar düğmesine bas. 3. "GÜNDÜZ MODU" düğmesine bas; düğmenin yazısı "GECE MODU" olur. 4. "Değişiklikleri Uygula"ya bas. 5. Sayfayı yenile.
- Beklenen: Ekran koyulaşmalı ve Gece ayarı yenilemeden sonra da korunmalı. İşletim sistemi koyuyken Gündüz seçilirse ekran açık kalmalı. Uygulamanın kendi ayarı işletim sistemi tercihinin önüne geçmeli.
- Gözlenen (insan dili): Ekran hiç değişmiyor. Ayar kaydediliyor (`isDarkMode: true` depoya yazılıyor) ve `<html>` öğesine `dark` sınıfı ekleniyor, ama ne modern ne klasik arayüz buna tepki veriyor. Tersine, işletim sistemi koyuyken uygulama "GÜNDÜZ MODU" gösteriyor, ekran ise baştan sona siyah. Düğmenin söylediğiyle ekranın gösterdiği çelişiyor. Kullanıcının tema üzerinde hiçbir denetimi yok; işletim sistemi teması neyse uygulama da o. Aynı davranış 4 renk teması ve 6 ana ekranda tekrarlandı (`tema-matrisi.md`: Gece/Gündüz ayarının sistemle çeliştiği 4 koşul sütununun hepsi ✗).
- Kanıt: `ekran/modern-acik-gunduz-classic-acilis.png` ile `ekran/modern-acik-gece-classic-acilis.png` piksel olarak aynı; `ekran/modern-acik-gecetiklandi-classic-ayarlar.png` → `ekran/modern-acik-gece-classic-uygulandi.png` (Gece uygulandıktan sonra hâlâ açık); `ekran/modern-koyu-gunduz-classic-ayarlar.png` (ekran koyu, düğme "GÜNDÜZ MODU"); `ekran/classic-acik-gece-classic-acilis.png` (klasik, Gece, açık). Ölçüm (`kokDurum`): sistem açık + Gece → `html.dark` var, `--m-bg #F2F2F7`, gövde `#F9FAFB`; sistem koyu + Gündüz → `html` sınıfsız, `--m-bg #000000`, gövde `#111827`. Depo: `settings.isDarkMode = true`.
- Olası kök neden: `tailwind.config.js:1-11` içinde `darkMode: 'class'` tanımı yok, bu yüzden Tailwind varsayılanı `media` kalıyor ve `dark:` sınıfları yalnız `prefers-color-scheme` ile çalışıyor. `App.tsx:315-320` `dark` sınıfını ekleyip kaldırıyor ama onu okuyan bir kural yok. `styles/modern.css:61-63` modern paleti bilerek `@media (prefers-color-scheme: dark)` koşuluna bağlamış ("sistem tercihi izlenir" yorumu). `components/SettingsModal.tsx:146-151` düğmesi ise yalnız kayıtlı değeri gösteriyor.
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Cem (`ui-akis`), kullanıcının bu düğmeden ne beklediğini ve düğmenin hiç gerekip gerekmediğini değerlendirsin. Ece (`ui-erisim`), koyu temaya ihtiyaç duyan ama işletim sistemini değiştiremeyen kullanıcı senaryosuna baksın.

### UI-GRS-02 · Ayarlar penceresinde "Değişiklikleri Uygula" koyu modda okunmuyor (1,95–2,72:1)
- Önem: K2
- Ekran: Ayarlar penceresi (Uygulama Ayarları), alt çubuk          Arayüz: modern
- Koşul: sistem teması=koyu · uygulama ayarı=Gece (Gündüz'de de aynı, bkz. GRS-01) · renk teması=classic, emerald, purple, orange
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. İşletim sistemi koyuyken modern arayüzde Ayarlar'ı aç. 2. Alt çubuktaki birincil düğmeye bak. 3. Renk temasını Zümrüt Ormanı yap ve yeniden aç.
- Beklenen: Penceredeki tek birincil eylem en okunaklı düğme olmalı. Modern arayüzün geri kalanında koyu modda vurgu zemini üzerinde koyu lacivert yazı (`#00172F`) kullanılıyor ve bu tutarlılık burada da sürmeli.
- Gözlenen (insan dili): Açık mavi, nane yeşili, lila ya da şeftali rengi zeminde beyaz yazı var. Gözü kısınca düğmenin yazısı kayboluyor ve geriye renkli bir hap kalıyor. Zümrütte durum en kötüsü. Aynı penceredeki "Vazgeç" (3,36:1) ve "VERİLERİ SIFIRLA" (3,04:1) da sınırın altında. Açık modda "GÜNDÜZ MODU" yazısı da 3,07:1 ölçüldü.
- Kanıt: `ekran/modern-koyu-gece-classic-ayarlar.png`, `ekran/modern-koyu-gece-emerald-ayarlar.png`, `ekran/modern-koyu-gece-purple-ayarlar.png`, `ekran/modern-koyu-gece-orange-ayarlar.png` · ölçüm: beyaz/`#4DA2FF` 2,65:1 · beyaz/`#3CCFB4` 1,95:1 · beyaz/`#A48BFF` 2,72:1 · beyaz/`#FF9F5A` 2,03:1 (16 px kalın, gereken 4,5:1); "Vazgeç" `#6B7280`/`#18212F` 3,36:1; "VERİLERİ SIFIRLA" `#DC2626`/`#1F2937` 3,04:1; açık modda "GÜNDÜZ MODU" `#D97706`/`#FFFBEB` 3,07:1.
- Olası kök neden: `components/SettingsModal.tsx:236-240` düğmesinde `text-white` sabit, zemin ise `var(--app-primary)`. Koyu modda bu değişken açık vurguya dönüyor (`styles/modern.css:92-94` ve koyu `--m-accent #4DA2FF`).
- Kapsam: tek ekran (dört renk temasının hepsinde)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), aynı düğmeyi %200 yakınlaştırmada ve renk körlüğü süzgecinde denesin.

### UI-GRS-03 · Yönetim › Ayrıntılı analiz: durum rozetleri ve uyarı yazıları iki temada da 3:1'in altında
- Önem: K2
- Ekran: Yönetim › Ayrıntılı analiz ("Yönetim Ekranı"): Proje Sağlık Panosu, Departman Karnesi, Portföy Riskleri; klasikte Yönetim          Arayüz: modern ve klasik
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. Yönetim'e git. 2. "Ayrıntılı analiz"e bas. 3. Proje Sağlık Panosu ile Portföy Riskleri bölümlerine kaydır.
- Beklenen: Durum ("Orta", "Riskli", risk puanı "12") ve neden yazıları ("Takvim gerisinde (SPI 0,79)…") en az 4,5:1 olmalı. Müdürün karar verirken okuduğu satırlar bunlar.
- Gözlenen (insan dili): Açık modda proje kartlarının altındaki turuncu neden satırı ("Takvim gerisinde…, Bütçe…") beyaz zeminde silik, 10–12 px boyutunda ve sonu üç noktayla kesiliyor. "Orta: 7", "Düşük: 8" rozetlerinde ve "12"/"8" puan hap'larında beyaz yazı sarı ya da yeşil zeminde duruyor; göz kısınca rakam okunmuyor. Koyu modda da aynı rozetler aynı oranda. Ekranda 423 metnin 73–78'i eşiğin altında.
- Kanıt: `ekran/modern-acik-gunduz-classic-yonetim-ayrintili-amber.png`, `ekran/modern-koyu-gece-classic-yonetim-ayrintili-grafik.png`, `ekran/modern-acik-gunduz-classic-yonetim-ayrintili-tam.png`, `ekran/classic-koyu-gece-classic-yonetim.png` · ölçüm: `#F59E0B` yazı/`#FFFFFF` 2,15:1 (12 px) · beyaz/`#F59E0B` 2,15:1 ("Orta", "Riskli", "12") · beyaz/`#10B981` 2,54:1 ("Düşük") · beyaz/`#EF4444` 3,76:1 ("Yüksek: 0") · eşik altı metin: koyuda 73/423, açıkta 78/423, klasik koyuda 74/421.
- Olası kök neden: `components/ExecutiveView.tsx:29` ve `:44` sabit `#f59e0b`/`#10b981`/`#ef4444` zeminleri beyaz yazıyla kullanıyor. `:351` ve `:399` satırlarındaki `text-[10px] text-amber-500` açık zeminde kullanılıyor.
- Kapsam: tek ekran (iki arayüzde de aynı bileşen)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), renk körlüğü süzgecinde Orta ile Düşük rozetlerinin ayrılıp ayrılmadığına baksın.

### UI-GRS-04 · Koyu modda eski bileşenlerde sıfır değerleri, tarihler ve seçili segment okunmuyor (1,94–1,99:1)
- Önem: K2
- Ekran: Tahsis › Araçlar › Kapasite–talep ve Senaryo (modern); klasikte Portföy kartları, Tahsis ("Plan" segmenti), proje Pano ("Kompakt" segmenti)          Arayüz: modern ve klasik
- Koşul: sistem teması=koyu · uygulama ayarı=Gece · renk teması=classic
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. Ekip ve tahsis › Araçlar › Kapasite–talep'i aç. 2. "İhtiyaç - Teklif" ve "Personel Açığı" satırlarındaki ay değerlerine bak. 3. Klasik arayüzde Tahsis'e geç ve sağ üstteki Plan / Gerçekleşen / Karşılaştır anahtarına bak.
- Beklenen: Sıfır değerler bile okunabilir olmalı, en az 4,5:1. Seçili segment, seçili olmayanlardan daha belirgin olmalı.
- Gözlenen (insan dili): Kapasite–talep tablosunda "0" değerleri koyu gri zeminde neredeyse görünmüyor; tablo yarı boş gibi duruyor. 515 metnin 207'si eşiğin altında. Klasik Tahsis'te seçili "Plan" seçeneği, seçili olmayan "Gerçekleşen" ve "Karşılaştır" seçeneklerinden daha sönük: seçim ters okunuyor. Klasik Portföy kartlarındaki son güncelleme tarihi ve Pano'daki "KOMPAKT" etiketi de aynı durumda.
- Kanıt: `ekran/modern-koyu-gece-classic-tahsis-kapasite-talep.png`, `ekran/modern-koyu-gece-classic-tahsis-senaryo.png`, `ekran/classic-koyu-gece-classic-tahsis.png`, `ekran/classic-koyu-gece-classic-genel.png`, `ekran/classic-koyu-gece-classic-portfoy.png` · ölçüm: "0" `#4B5563`/`#1F2937` 1,94:1 (12 px); "Plan" ve "Kompakt" `#2563EB`/`#374151` 1,99:1; tarih "16.10.2026" `#4B5563`/`#1F2937` 1,94:1 (11 px); eşik altı metin: Kapasite–talep 207/515, Senaryo 88/369, klasik proje Pano 231/483.
- Olası kök neden: Eski bileşenlerde açık tema renkleri (`text-gray-600`, `text-blue-600`) koyu zemin karşılığı olmadan kalmış. Modern katmandaki eski ekran yumuşatması (`styles/modern.css:205-209`) yalnız `prefers-color-scheme: light` için yazılmış; koyu mod için eşleme yok.
- Kapsam: arayüzün tamamı (koyu modda eski bileşenler)
- Doğrulama: aday
- Devir: yok

### UI-GRS-05 · Koyu modda açılır pencereler (rehber, Ctrl+K paleti, Durum raporu) sayfa zeminiyle aynı siyah, kenarları görünmüyor
- Önem: K3
- Ekran: ekran rehberleri (Haftalık rapor, Planlama…), komut paleti (Ctrl+K), proje › Durum raporu penceresi          Arayüz: modern (rehber klasikte de açılıyor)
- Koşul: sistem teması=koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=mudur, py · veri=pilot
- Adımlar: 1. İşletim sistemi koyuyken modern arayüzde Haftalık rapor'u ilk kez aç; rehber kendiliğinden açılır. 2. Ctrl+K'ya bas. 3. Bir projede "Durum raporu"na bas.
- Beklenen: Açılır pencere, karartılmış sayfanın üstünde ayrı bir kart olarak seçilmeli. Koyu modda bu, pencerenin zemini sayfadan daha açık olarak (yükseltilmiş yüzey) ya da ince bir kenarlıkla sağlanır.
- Gözlenen (insan dili): Pencere zifiri siyah, altındaki karartılmış sayfa da siyah. Pencerenin üst ve alt kenarı hiç seçilmiyor. Yanlarda yalnız arkadaki metinlerin ortadan kesildiği yer bir sınır gibi okunuyor ("Haftalı|", "Yazılım |"); sayfa yırtılmış gibi duruyor. Gölge siyah zeminde görünmüyor. Açık modda aynı pencere net ayrılıyor (`ekran/modern-acik-gunduz-classic-haftalik-rehber.png`).
- Kanıt: `ekran/modern-koyu-gunduz-classic-haftalik-rehber.png`, `ekran/modern-koyu-gece-classic-proje-planlama-rehber.png`, `ekran/modern-koyu-gece-classic-ara-paleti.png`, `ekran/modern-koyu-gece-classic-proje-durum-raporu.png`, `ekran/classic-koyu-gece-classic-haftalik-rehber.png` · ölçüm: pencere `#000000`, dışı `#000000`–`#0F0F10` → 1,0:1–1,1:1, kenarlık yok, gölge `rgba(0,0,0,.6)` siyah üstünde görünmez (`yuzeyAyrimi`: "1 k0 g1 #000000/#000000 640×760"); piksel örnekleri: pencere içi `#000000`, alt kenarın 20 px altı `#0B0B0C`.
- Olası kök neden: Üç bileşen de pencere zemini olarak `m-bg` (sayfa zemini) kullanıyor: `components/modern/GuideTour.tsx:82`, `components/CommandPalette.tsx:106`, `components/modern/ui.tsx:47` (ortak Sheet, ona dayanan bütün pencereler). Koyu modda `--m-bg` `#000000` (`styles/modern.css:65`).
- Kapsam: arayüzün tamamı (modern koyu moddaki bütün Sheet ve rehberler)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), odak pencereye taşınıyor mu ve pencerenin sınırı yakınlaştırmada seçiliyor mu, baksın.

### UI-GRS-06 · Koyu modda açılır menüler (Raporlar, Araçlar) altlarındaki kartla aynı renkte, iki katman birbirine karışıyor
- Önem: K3
- Ekran: Yönetim › Raporlar menüsü; Ekip ve tahsis › Araçlar menüsü (proje başlığı, görev listesi ve istekler menüleri de aynı bileşen)          Arayüz: modern
- Koşul: sistem teması=koyu · uygulama ayarı=Gece · renk teması=classic
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. Yönetim'e git. 2. Sağ üstte "Raporlar"a bas.
- Beklenen: Menü, üstüne açıldığı karttan ayrı bir katman olarak seçilmeli.
- Gözlenen (insan dili): Menü "Kaynak doluluğu" kartının üstüne iniyor; ikisi de `#1C1C1E`. Menünün nerede bittiği seçilmiyor. Kartın alt satırı ("9 kişi bazı aylarda kapasite üstü") menünün son maddesi gibi okunuyor. Araçlar menüsünde de "Atıl" kartının "kişinin…" yazısı menü maddelerinin hemen yanında, menüden çıkmış gibi duruyor.
- Kanıt: `ekran/modern-koyu-gece-classic-yonetim-raporlar-menu.png`, `ekran/modern-koyu-gece-classic-tahsis-araclar.png` · ölçüm: menü `#1C1C1E`/kart `#1C1C1E` 1,0:1, kenarlık yok; menü/sayfa `#1C1C1E`/`#000000` 1,23:1; gölge yalnız alt kenarda 2–3 px'lik `#111112` koyulaşma bırakıyor.
- Olası kök neden: Menüler `m-surface m-pop` kullanıyor (`components/modern/ModernExecutive.tsx:342`, `components/modern/ModernAllocation.tsx:188`, `ModernProjectHeader.tsx:135`, `ModernTaskList.tsx:146`, `ModernRequests.tsx:140`). Koyu modda `--m-pop-shadow` siyah (`styles/modern.css:85`) ve görünür bir kenarlık yok.
- Kapsam: arayüzün tamamı
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), Escape bu menüleri kapatmıyor (`devir.md`).

### UI-GRS-07 · Modern koyu modda eski ekranlar klasik lacivert-gri paletle açılıyor (eski ekran sızıntısı)
- Önem: K3
- Ekran: Ayarlar penceresi; Yönetim › Ayrıntılı analiz; Tahsis › Kapasite–talep, Öngörü, Senaryo          Arayüz: modern
- Koşul: sistem teması=koyu · uygulama ayarı=Gece · renk teması=classic (zümrütte de aynı)
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. Modern arayüzde, koyu sistemde Yönetim › Ayrıntılı analiz'i aç. 2. Ekip ve tahsis › Araçlar › Kapasite–talep'i aç. 3. Ayarlar'ı aç.
- Beklenen: Modern arayüzün koyu paleti nötr siyah ve gri (`#000000` / `#1C1C1E` / `#2C2C2E`). İçinde açılan her ekran ve pencere aynı malzemeden olmalı.
- Gözlenen (insan dili): Bu ekranlara geçince zemin birden lacivertimsi griye dönüyor (Tailwind `gray-800/900`). Kartların renkli kenarlıkları, küçük (11–12 px) yazıları, 24 px'lik başlıkları ve "Yönetim Ekranı" gibi farklı adları var. Kenar çubuğu nötr siyahken içerik mavi-gri; yan yana iki ayrı uygulama gibi duruyor. Ayarlar penceresi modern Portföy'ün üstünde lacivert bir kutu olarak açılıyor. Açık modda bu fark daha az göze batıyor, çünkü eski ekran yumuşatması yalnız açık temada etkin.
- Kanıt: `ekran/modern-koyu-gece-classic-yonetim-ayrintili.png`, `ekran/modern-koyu-gece-classic-tahsis-kapasite-talep.png`, `ekran/modern-koyu-gece-classic-tahsis-ongoru.png`, `ekran/modern-koyu-gece-classic-ayarlar.png`; karşılaştırma için `ekran/modern-koyu-gunduz-classic-yonetim.png` · ölçüm: Ayarlar kutusu `#1F2937` (modern yüzey `#1C1C1E` olmalıydı); Öngörü ekranında `#111827`×2 ve `#1F2937`×2 büyük yüzey; Ayrıntılı analiz kartları `#1E293B` tonunda.
- Olası kök neden: `styles/modern.css:205-209` `.m-legacy` eşlemeleri yalnız `@media (prefers-color-scheme: light)` içinde; koyu mod için `dark:bg-gray-800/900` karşılığı yok. `components/SettingsModal.tsx:103` `bg-white dark:bg-gray-800`. Eski ekranlar `components/modern/ModernExecutive.tsx:276` ve `ModernAllocation.tsx:391` içinde `m-legacy` ile sarılıyor.
- Kapsam: arayüzün tamamı (modern koyu)
- Doğrulama: aday
- Devir: Cem (`ui-akis`), "Yönetim" ile "Yönetim Ekranı" ve "Ekip ve tahsis" ile "İşgücü Tahsisi" ad farkına baksın.

### UI-GRS-08 · Koyu modda tahsis ısı haritası ve risk matrisi yalnız tona dayanıyor; gri tonlamada seviyeler ayrılmıyor
- Önem: K3
- Ekran: Ekip ve tahsis (Doluluk ısı haritası); Risk raporu › Portföy risk matrisi          Arayüz: modern (risk matrisi klasikte de aynı bileşen)
- Koşul: sistem teması=koyu · uygulama ayarı=Gece · renk teması=classic
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. Ekip ve tahsis'i aç; sayfaya `grayscale(1)` süzgeci uygula. 2. Risk raporu'nu aç; matrise kaydır ve aynı süzgeci uygula.
- Beklenen: Aşırı tahsis (%140) ile normal (%89) hücreler, risk matrisinde de Orta ile Düşük bölgeler renk olmadan da, en azından parlaklıkla ayrılmalı. Açık modda bu sağlanıyor.
- Gözlenen (insan dili): Koyu modda aşırı tahsis kırmızısı ile normal tahsis mavisi aynı parlaklıkta. Gri tonlamada Aslı Çakır'ın %140 satırı ile Barış Güneş'in %89 satırı tek gri şerit oluyor. Risk matrisinde dolu Orta (turuncu) ve Düşük (yeşil) hücreler aynı açık gri; boş bölge hücreleri (yeşilimsi, kahverengimsi, bordo) tek koyu gri oluyor. "Bu hücre hangi bölgede?" sorusu yalnız renk tonuyla yanıtlanabiliyor. Açık modda ısı haritası 3,72:1 ile ayrılıyor.
- Kanıt: `ekran/modern-koyu-gece-classic-tahsis-gri.png`, `ekran/modern-koyu-gece-classic-risk-matris.png`, `ekran/modern-koyu-gece-classic-risk-matris-gri.png`; karşılaştırma `ekran/modern-acik-gunduz-classic-tahsis-gri.png`, `ekran/modern-acik-gunduz-classic-risk-matris-gri.png` · ölçüm (göreli parlaklık oranı): koyuda aşırı `#FF453A` ile normal `#3D7CC9` 1,25:1; açıkta `#B00020` ile `#8CBDF0` 3,72:1; koyu matriste dolu Orta `#FF9F0A` ile Düşük `#30D158` 1,02:1 (açıkta `#E07800`/`#1F7A35` 1,76:1); koyu boş bölgeler Düşük `#1F3927` ile Orta `#40311B` 1,0:1, Orta ile Yüksek `#402222` 1,14:1.
- Olası kök neden: `styles/modern.css:78-81` ve `:88-89` koyu palet (`--m-ok`, `--m-warn`, `--m-bad`, `--m-heat-*`) seviyeleri yalnız tonla ayırıyor; ısı haritasında aşırı hücre için ikinci bir ipucu (kenarlık, desen, simge) yok. Klasik koyu Tahsis'te aşırı hücreler kırmızı kenarlıkla ayrılıyor; o çözüm modernde kullanılmamış.
- Kapsam: tek ekran ×2 (Tahsis, Risk raporu)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), protanopi ve deuteranopi süzgeçlerinde aynı iki görseli denesin (kırmızı/yeşil çifti).

### UI-GRS-09 · Gün Batımı (turuncu) temasında vurgu rengi uyarı turuncusuyla aynı; nötr öğeler "riskli" gibi görünüyor
- Önem: K3
- Ekran: proje Genel bakış, kenar çubuğu, Portföy          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=orange
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. Ayarlar'da "Gün Batımı"nı seç. 2. NEHİR Veri Platformu'nu aç.
- Beklenen: Vurgu rengi (seçim, bağlantı, "süreçte") ile durum renkleri (Riskli = turuncu, Kritik = kırmızı) karışmamalı. Aynı anlam aynı renk, farklı anlam farklı renk olmalı.
- Gözlenen (insan dili): "6 gün kaldı" bilgisi, "Riskli" haplarıyla aynı turuncu hapta duruyor. İlerleme çubuğundaki "süreçte" dilimi turuncu. Kenar çubuğunda seçili proje turuncu boyanıyor, yanındaki "riskli" noktası da turuncu. "Pano ›", "Tümü (28) ›" bağlantıları da turuncu. Göz her turuncuyu "dikkat" diye okuyor; sayfa olduğundan daha alarmlı görünüyor. Portföy'de de ilerleme çubukları turuncu; hemen yanlarında turuncu "Riskli" hapı ve turuncu durum noktası var, bu yüzden ilerleme de bir uyarı gibi okunuyor. Diğer üç temada bu çakışma yok.
- Kanıt: `ekran/modern-koyu-gece-orange-genel.png`, `ekran/modern-acik-gunduz-orange-genel.png`, `ekran/modern-koyu-gece-orange-portfoy.png`; karşılaştırma `ekran/modern-koyu-gunduz-classic-genel.png` · ölçüm: koyuda vurgu `#FF9F5A` ile uyarı `#FF9F0A` (yeşil kanalı aynı, yalnız mavi farklı); açıkta vurgu `#B54708` ile uyarı `#E07800`; vurgu dolgusu `#FDEFE4` ile uyarı dolgusu `#FFF1DB` arasındaki kontrast 1,0:1.
- Olası kök neden: `styles/modern.css:59` ve `:94` (turuncu tema vurgusu) ile `:27` ve `:79` (`--m-warn`) aynı renk ailesinde.
- Kapsam: arayüzün tamamı (turuncu tema)
- Doğrulama: aday
- Devir: Cem (`ui-akis`), kullanıcı "6 gün kaldı"yı uyarı olarak mı okuyor, baksın.

### UI-GRS-10 · Durum raporu penceresinde 34 satırlık rapor 45 px'lik kutuya sıkışıyor
- Önem: K3
- Ekran: proje › Durum raporu (Haftalık durum raporu penceresi)          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak), mudur · veri=pilot
- Adımlar: 1. NEHİR Veri Platformu'nu aç. 2. Sağ üstte "Durum raporu"na bas.
- Beklenen: Paylaşmadan önce düzenlenecek rapor metninin büyük kısmı görünmeli. Bileşen kendisi en az 340 px yükseklik istiyor.
- Gözlenen (insan dili): Metin kutusunda yalnız iki satır görünüyor ("NEHİR Veri Platformu — Haftalık Durum Raporu / Hafta 45 / 2026"). Pencerenin geri kalanı boş, rapor görünmüyor; kullanıcı kutunun içinde kaydırmak ya da köşeden büyütmek zorunda. Pencere yarım yüklenmiş gibi görünüyor.
- Kanıt: `ekran/modern-acik-gunduz-classic-proje-durum-raporu.png`, `ekran/modern-koyu-gece-classic-proje-durum-raporu.png` · ölçüm: `#sr-text` görünür 45 px, içerik 923 px (34 satır); hesaplanan `min-height: 44px`.
- Olası kök neden: `components/modern/sheets/StatusReportSheet.tsx:57` `m-input … min-h-[340px]`; `styles/modern.css:170-171` `.ui-modern .m-input { min-height: 44px }` daha özgül olduğu için 340 px'i eziyor.
- Kapsam: tek ekran
- Doğrulama: aday
- Devir: Cem (`ui-akis`), raporu kopyalayıp paylaşma işinin bu hâlde yapılıp yapılamadığına baksın.

### UI-GRS-11 · Koyu modda seçili segmentteki sayaç sönük (2,71:1)
- Önem: K3 (ölçek < 3:1 için K2 diyor; ana etiket okunduğu ve sayı ikincil olduğu için K3 öneriyorum, uzlaşmada karar verilsin)
- Ekran: Veri havuzu (Personel 24 · Bölümler 5…), Görüşmeler, Beklentiler, proje Riskler sekmesi          Arayüz: modern
- Koşul: sistem teması=koyu · uygulama ayarı=Gece · renk teması=classic
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. Veri havuzu'nu aç. 2. Seçili "Personel 24" segmentine bak.
- Beklenen: Seçili segment en okunur olanı olmalı.
- Gözlenen (insan dili): Seçili hap gri (`#636366`) ve içindeki "24" seçili olmayanlardaki sayılardan daha sönük. Seçince sayı kayboluyor gibi; seçim ters okunuyor. Açık modda aynı sayaç 4,09:1 ile sınırda.
- Kanıt: `ekran/modern-koyu-gece-classic-veri-havuzu.png`, `ekran/modern-koyu-gece-classic-gorusmeler.png`, `ekran/modern-koyu-gece-classic-proje-riskler.png` · ölçüm: `#AEAEB2`/`#636366` 2,71:1 (14 px); açık modda `#6C6C70`/`#E3E3E8` 4,09:1.
- Olası kök neden: `styles/modern.css:166-168` koyu modda seçili segment zeminini `#636366` yapıyor; sayaç `m-text-3` (`--m-label-3 #AEAEB2`, `:104`) olarak kalıyor.
- Kapsam: arayüzün tamamı (m-segment)
- Doğrulama: aday
- Devir: yok

### UI-GRS-12 · Klasik arayüzde Risk raporu ve Haftalık rapor modern "siyah ada" olarak açılıyor
- Önem: K4
- Ekran: Riskler (portföy), Haftalık Rapor          Arayüz: klasik
- Koşul: sistem teması=koyu · uygulama ayarı=Gece ve Gündüz · renk teması=classic
         ekran=1440×900 · rol=mudur · veri=pilot
- Adımlar: 1. Klasik arayüzde, koyu sistemde üst menüden Riskler'e ya da Haftalık Rapor'a bas.
- Beklenen: Klasik arayüzde açılan ekran klasik paleti (lacivert-gri `#111827`/`#1F2937`) ve klasik tipografiyi kullanmalı.
- Gözlenen (insan dili): Klasik lacivert sayfanın ortasında köşeleri yuvarlak, zifiri siyah büyük bir pano açılıyor. İçindeki kartlar nötr gri, yazılar iOS tarzı büyük başlıklar. Klasikten modern'e açılan bir pencere gibi duruyor; iki görsel dil yan yana. Açık temada beyaz ve `#F2F2F7` olduğu için fark daha az göze batıyor.
- Kanıt: `ekran/classic-koyu-gece-classic-risk.png`, `ekran/classic-koyu-gece-classic-haftalik.png` · ölçüm: ada `#000000` / klasik zemin `#111827` 1,18:1 (`yuzeyAyrimi`: `main > div.ui-modern.rounded-3xl`).
- Olası kök neden: Modern bileşenler klasik arayüzde `div.ui-modern.rounded-3xl` sarmalayıcısıyla gösteriliyor ve koyu modern palet (`styles/modern.css:63-`) olduğu gibi geliyor.
- Kapsam: tüm arayüzler (klasik koyu)
- Doğrulama: aday
- Devir: Cem (`ui-akis`), klasik ↔ modern farkının birincil sahibi; bu "ada"nın bilinçli bir geçiş tasarımı olup olmadığına karar versin.

---

## Kısa notlar

- K4 · `meta[name=theme-color]` ölçülen 8 koşulun hepsinde `#2563eb`; koyu modda değişmiyor. `App.tsx:321-322` değeri `<html>` öğesinden okuyor, oysa `theme-*` ve `ui-modern` sınıfları kök `div`te. Bu yüzden zümrüt, mor ve turuncu temada da mavi kalması bekleniyor (koddan çıkarım, ölçülmedi).
- K4 · Modern koyu modda gövde zemini klasik `#111827` (`body.bg-gray-50` → koyu). Modern kök `#000000` olduğundan normalde görünmüyor, ama esnek kaydırma ya da kısa sayfa sonunda lacivert şerit görünebilir.
- K4 · Portföy proje listesinde üzerine gelme zemini satırın "…" sütununu kapsamıyor (1096 px'lik satırın 1036 px'i boyanıyor); `ekran/modern-acik-gece-classic-uygulandi.png` görüntüsünde PUSULA satırı.
- K4 · Ayarlar penceresindeki "Modern" küçük önizlemesi renk temasından bağımsız hep mavi; "Klasik" önizlemesi ise temayı izliyor (`ekran/modern-koyu-gece-emerald-ayarlar.png`).
- K4 · Ayrıntılı analiz › "Aylık Plan vs Gerçekleşen" grafiğinde y ekseni değeri yok; yalnız "Kapasite 16,75" çizgisi var (`ekran/modern-koyu-gece-classic-yonetim-ayrintili-grafik.png`).
- K4 · Klasik açık temada küçük gri yazılar sınırın altında: "Çoklu Proje & Program Yönetimi" alt başlığı `#9CA3AF`/`#F9FAFB` 2,43:1, "⌘K" 2,31:1, "MKS" 2,53:1 (10–12 px; boş veriyle ölçüldü, pilot üst bilgisi aynı).
- Ölçüm şüphesi, göz geçti: modern kartlar zeminden açıkta 1,12:1, koyuda 1,23:1 ayrılıyor, kenarlık ya da görünür gölge yok. Göz kısma görüntülerinde (`*-bulanik.png`) kartlar, kenar çubuğu ve liste satırları ayrı bloklar olarak seçiliyor. Bulgu değil.
- Ölçüm yanılgısı: Zaman çizelgesindeki "Bugün" etiketi 1,49:1 ölçüldü, ama yazı 2 px'lik kırmızı çizginin değil kartın (`#1C1C1E`) üstünde duruyor. Gözle okunuyor, bulgu değil.
- Odak halkası (3 px vurgu) koyu modda 6,4–7,9:1, açık modda 4,9–5,4:1: iyi (`ekran/modern-*-portfoy-odak.png`).
- Boş süzgeç durumu ("Bu filtrede proje yok.") iki temada da okunur ve kartın içinde duruyor (`ekran/modern-*-portfoy-bos-suzgec.png`).
