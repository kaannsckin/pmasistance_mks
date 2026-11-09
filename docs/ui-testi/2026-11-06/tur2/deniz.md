# Deniz (ui-gorsel) · Tur 2 (çapraz saldırı) · 2026-11-06

Kod: `claude/zealous-tesla-hidbc9@8fb563d` · port 4181 · Chromium (playwright-core), `tr-TR`, `Europe/Istanbul`, 1440×900.
Kaynak: Tolga'nın Tur 1 bulguları (`../tolga/bulgular.md`, UI-KRC-18–25), yeniden sınaması (`../tolga/regresyon.md`) ve bana yazılmış devir notları (Tolga 3, Cem 3, Ece 4).
Yöntem: Her durumu en az iki temada (açık/koyu) ve mümkünse iki arayüzde görüntüledim. Kullanıcının ne gördüğünü ölçtüm: ileti metni, bant ve düğme kontrastı, boş ekran, yanıltıcı güvence. Kaynak koda yalnız bulguyu yazarken baktım.
Betikler: `betik/13`–`21` (+ `t2.mjs`), 10 çalıştırma, her biri 4 dakikanın altında. Ölçümler `olcum/13-t2-*.json`–`olcum/21-t2-*.json`. Görüntüler `ekran/*-t2-*.png` (201 dosya).
Kanıt yolları `ui-testi/2026-11-06/deniz/` köküne göredir.
Ortam: Koşu ortasında kapsayıcı yeniden başladı. Betik 21 sunucu ve tarayıcıyla sorunsuz açıldı; diskteki iş korunmuştu.

**Özet:** 8 bulgu → doğrulandı 7 · önem değişmeli 1 (UI-KRC-21, K2 → K1) · reddedildi 0 · üretilemedi 0. Düzeldi denetimi: 5/5 teyit. Yeni bulgu: 5 (K2: 1 · K3: 3 · K4: 1).

## Doğrulama

| Bulgu | Karar | Gerekçe / kanıt |
|---|---|---|
| UI-KRC-18 | doğrulandı (K1 kalır) | Modern arayüzde iki temada denendi: Gündüz+Zümrüt ve Gece+Mor. Aynı Excel dosyası iki kez yüklendi; görev sayısı iki temada da `100 → 200 → 300`. Kullanıcının gördüğü tek şey yeşil bir güvence bandı: "100 görev içe aktarıldı." Bant iyi okunuyor (açıkta `#1F6B32`/`#E3F4E7` 5,72:1, koyuda `#7EE29A`/`#08220E` 10,63:1), ama kopyadan hiç söz etmiyor. Önizleme ve onay yok, "Geri al" düğmesi yok (0). Kenar çubuğunda NEHİR sayacı 28'den 228'e çıkıyor; yanlış rakam ekrana yansıyor. Kanıt: `ekran/modern-acik-gunduz-emerald-t2-k18-1.png`, `ekran/modern-acik-gunduz-emerald-t2-k18-2.png`, `ekran/modern-koyu-gece-purple-t2-k18-2.png` · `olcum/15-t2-ice-aktar-salt-okunur.json` |
| UI-KRC-19 | doğrulandı (K2) | Taslak iki koşulda yazıldı: Gündüz+classic ve Gece+Turuncu. B sekmesinde "Burada kullan"a basılınca A sekmesinde hiçbir soru çıkmadı. A'da "PlanAsistan başka bir sekmeye geçti" kartı açıldı; kart "Çalışmanız kaydedildi…" diyor ve iki temada da iyi okunuyor (0/4 kontrast hatası). Taslak depoda yok. A geri alınınca NEHİR raporu "Yazılmadı" görünüyor. Aynı koşulsuz "kaydedildi" metni 4 koşulda daha çıktı: Sistem+Zümrüt (koyu), Gündüz+Mor, klasik Gece+Mor ve klasik Gündüz+Zümrüt. Kanıt: `ekran/modern-acik-gunduz-classic-t2-k19-a-gecti.png`, `ekran/modern-koyu-gece-orange-t2-k19-a-gecti.png`, `ekran/modern-koyu-gece-orange-t2-k19-a-geri-alinca.png` · `olcum/14-t2-veri-sekme.json` (`taslakDepoda false`, `aGeri.taslakEkranda false`, `a.diyalog []`) |
| UI-KRC-20 | doğrulandı (K2) | Akış iki koşulda yürütüldü: Gece+Zümrüt ve Gündüz+Mor. Kurtarma ekranından "Ham veriyi indir" ile `planasistan-ham-depo-2026-11-09.json` indirildi (6 kayıt). Ardından onay, sil, yönetici ve Yedekten yükle adımları geldi. Sonuçta uygulama içinde bant çıkmıyor. Kullanıcı yalnız tarayıcının kendi uyarısını görüyor: "Yedek yüklenemedi: Dosya ne çalışma alanı ne de eski proje yedeği formatında." Depoda 1 proje, 0 kişi kalıyor. Görsel açıdan güvence cümlesi ("veri bu dosyadan geri kazanılabilir") düğmelerin hemen altında, okunur boyutta duruyor. Kullanıcıyı bu cümle yönlendiriyor. Kanıt: `ekran/modern-koyu-gece-emerald-t2-k20-1-kurtarma.png`, `ekran/modern-koyu-gece-emerald-t2-k20-2-sil-sonra.png`, `ekran/modern-koyu-gece-emerald-t2-k20-4-yukle-sonra.png`, `ekran/modern-acik-gunduz-purple-t2-k20-4-yukle-sonra.png` · `olcum/14-t2-veri-sekme.json` |
| UI-KRC-21 | önem değişmeli (K2 → K1) | Üç koşulda (modern Gündüz, modern Gece+Turuncu, klasik Gece) açılışta hiçbir uyarı ya da bildirim yok (`uyari false`, `bildirim []`). PUSULA kenar çubuğunda da Portföy'de de görünmüyor; Portföy "Aktif projeler 1" diyor. Gece+Turuncu'da NEHİR'e görev eklendi. Ekrandaki tek geri bildirim "…görevi eklendi" oldu; o anda başka bir proje siliniyordu (yanıltıcı güvence). Yenilemeden sonra `project:prj-pusula` depoda yok, `projectIds` içinde ise yeni kimlik `prj-mw8utxep-d2k9xl` var. Kullanıcı için bir proje uyarısız ve kalıcı olarak kayboluyor; bu, ölçekteki "veri kaybı" tanımına giriyor. Aynı sınıfın `meta` karşılığı da (önceki UI-KRC-01, "bozuk kayıt çalışma alanını uyarısız siliyor") K1 sayılmıştı. Kanıt: `ekran/modern-koyu-gece-orange-t2-k21-acilis.png`, `ekran/modern-koyu-gece-orange-t2-k21-yazma-bildirim.png`, `ekran/modern-koyu-gece-orange-t2-k21-yenile.png`, `ekran/modern-acik-gunduz-classic-t2-k21-acilis.png`, `ekran/classic-koyu-gece-classic-t2-k21-acilis.png` · `olcum/14-t2-veri-sekme.json` |
| UI-KRC-22 | doğrulandı (K2) | 8 koşulda "Bu ekran açılamadı" ekranı çıktı. Koşullar: iki arayüz × sistem açık/koyu × Gündüz/Gece/Sistem × dört renk teması. "Sayfayı yeniden yükle" üç koşulda (modern Gece, klasik Gece+Zümrüt, klasik açık sistem+Gece+Mor) aynı ekrana döndü. Depo sağlam: 5 proje, `risks` metin. Ekran görsel olarak iyi: 0/5 kontrast hatası, göz kısınca kart ayrılıyor, Gece/Gündüz doğru izleniyor. Sorun yanıltıcı güvencede: "sayfayı yeniden yüklemek çoğu zaman yeter" diyor, ama yeniden yükleme döngüye sokuyor. Ekranda ham hata satırı da görünüyor: `(p.risks \|\| []).forEach is not a function`. İş tümüyle durduğu için K1 tartışılabilir; veri yerinde ve tetik bozuk depo olduğu için K2'de bırakıyorum. Kanıt: `ekran/modern-koyu-gece-classic-t2-hata.png`, `ekran/modern-koyu-gece-classic-t2-hata-yeniden-yukle.png`, `ekran/classic-koyu-gece-emerald-t2-hata-yeniden-yukle.png`, `ekran/modern-acik-gunduz-classic-t2-hata.png`, `ekran/modern-koyu-gece-classic-t2-kurtarma-bulanik.png` · `olcum/13-t2-hata-kurtarma.json` |
| UI-KRC-23 | doğrulandı (K2) | Klasik arayüzde üç koşulda denendi: Gündüz (Ahmet), Gece+Zümrüt (Ahmet), Gece+Turuncu (Mert). Sil düğmesi etkin çiziliyor (imleç el işareti, kapalı değil). Onay "…görevi silinecek. Emin misiniz?" diye soruyor. Ardından alt bant çıkıyor: "'Şema doğrulama için çoklu dil desteği' silindi · Geri Al" (14,68–17,74:1, net okunuyor). Kart yerinde duruyor, başlık "Görev Listesi (100)", depoda `100 → 100`. Düzenle formu açılıyor ve alan yazılabiliyor; Kaydet'ten sonra ne ileti var ne değişiklik. Görsel olarak ekran işlemin yapıldığını söylüyor, gerçekte hiçbir şey olmuyor (3/3). Yan ölçüm: Zümrüt'te "Geri Al" düğmesi beyaz/`#059669` 3,77:1 (UI-GRS-30). Kanıt: `ekran/classic-koyu-gece-emerald-t2-k23-ahmet-sil.png`, `ekran/classic-acik-gunduz-classic-t2-k23-ahmet-sil.png`, `ekran/classic-koyu-gece-orange-t2-k23-mert-sil.png`, `ekran/classic-koyu-gece-emerald-t2-k23-ahmet-duzenle-sonra.png` · `olcum/15-t2-ice-aktar-salt-okunur.json` |
| UI-KRC-24 | doğrulandı (K3) | "Yeni müşteri görüşmesi" (8 alan) iki koşulda denendi: Gece+Zümrüt ve Gündüz+Turuncu. 3 alan doldurulup pencere Esc ile ya da arka plana tıklanarak kapatıldı. Soru çıkmadı, bildirim de yok. Yeniden açınca alanlar boştu (4/4). Kanıt: `ekran/modern-koyu-gece-emerald-t2-k24-esc-dolu.png`, `ekran/modern-koyu-gece-emerald-t2-k24-esc-yeniden.png`, `ekran/modern-acik-gunduz-orange-t2-k24-arka-dolu.png`, `ekran/modern-acik-gunduz-orange-t2-k24-arka-yeniden.png` · `olcum/15-t2-ice-aktar-salt-okunur.json` |
| UI-KRC-25 | doğrulandı (K3) | Gündüz+Turuncu ve Gece+classic koşullarında kırmızı bant çıktı: 'İçe aktarılamadı: CSV dosyasında "Issue key" ve ("Summary" veya "Description") sütunlarından biri bulunamadı.' Bant okunuyor (açıkta `#B00020`/`#FDE7EA` 6,21:1, koyuda `#FF8A82`/`#290B09` 8,04:1). Görev sayısı `100 → 100`. Kanıt: `ekran/modern-acik-gunduz-orange-t2-k25.png`, `ekran/modern-koyu-gece-classic-t2-k25.png` · `olcum/15-t2-ice-aktar-salt-okunur.json` |

## Düzeldi denetimi

Önce iki K1, sonra üç K2 bulgusu denetlendi. Her biri Tolga'nın koşulundan farklı bir temada (koyu ve/veya başka renk teması) denendi.

| Bulgu | Karar | Kanıt |
|---|---|---|
| UI-KRC-01 · Bozuk/tanınmayan depo kaydı çalışma alanını siliyor (K1) | düzeldi (teyit) | `meta.format=2` ile 8 koşulda (iki arayüz × açık/koyu × dört renk teması) kurtarma ekranı açıldı. Açılış ve yenilemeden sonra depo aynı kaldı: `format 2, 5 proje, 24 kişi, 56 rapor, 6 kayıt`. Ekran Gece/Gündüz ayarını izliyor. `ekran/modern-koyu-gece-classic-t2-kurtarma.png`, `ekran/classic-acik-gunduz-orange-t2-kurtarma.png` · `olcum/13-t2-hata-kurtarma.json` → `depo` |
| UI-KRC-13 · Gönderilen rapor ikinci sekmede taslağa dönüyor (K1) | düzeldi (teyit) | Modern Gece+Mor'da denendi. A taslağı kaydetti (`draft`, `create`); B devralıp gönderdi (`bs_review`, `create, submit`). A geri alınınca Kaydet ve gönder düğmesi yok, metin alanı yazılamıyor. Ekranda "Salt okunur: rapor şu an 'Bölüm sorumlusunda' aşamasında" bandı var. Son durum `bs_review`, tarihçe `create, submit`. `ekran/modern-koyu-gece-purple-t2-k13-a-pusula.png` · `olcum/16-t2-duzeldi.json` |
| UI-KRC-03 · Klasik kartta çöp kutusuna çift tık iki görev siliyor (K2) | düzeldi (teyit) | Klasik Gece+Turuncu'da çift tık, Gündüz+Mor'da üçlü tık denendi. İkisinde de tek onay çıktı; `100 → 99`, yalnız `jira-nhr-1` silindi. Başlık "Görev Listesi (99)", yenilemede de 99. `ekran/classic-koyu-gece-orange-t2-k03-cift.png`, `ekran/classic-acik-gunduz-purple-t2-k03-uclu.png` |
| UI-KRC-15 · "Projeyi sil"e çift tık iki proje siliyor (K2) | düzeldi (teyit) | Klasik Gece+Zümrüt'te düğmeye ve onaya çift tıklandı. Tek onay çıktı ("PUSULA … ve tüm verileri silinecek"); `5 → 4`, yalnız `prj-pusula` silindi. `ekran/classic-koyu-gece-emerald-t2-k15-sonra.png` |
| UI-KRC-06 · Yedekten yükle `tasks:[{}]` beyaz ekran (K2) | düzeldi (teyit) | Gece+Zümrüt ve Gündüz+Turuncu'da `proje-ciplak.json` yüklendi. İleti: '"proje-ciplak" çalışma alanına yeni proje olarak eklendi.' Çökme yok (`gezinme true`). Yenilemeden sonra tema korunuyor (`theme-emerald`, `html.dark`). `ekran/modern-koyu-gece-emerald-t2-k06-yukle.png`, `ekran/modern-acik-gunduz-orange-t2-k06-yenile.png` |

Not: Tolga'nın "düzeldi" dediği UI-KRC-17'yi (Kapasite–talep "Toplam") ayrıca denetlemedim. Ancak o düzeltmenin yan etkisini pilot veride buldum: yapışkan "Toplam" sütunu Aralık'ı örtüyor. Ayrıntı **UI-GRS-31**'de.

## Yeni bulgular

| Kimlik | Önem | Başlık |
|---|---|---|
| UI-GRS-29 | K2 | Klasik Portföy'de müdüre "Sahip atanmadı" neredeyse görünmüyor (açık 1,47:1, koyu 1,94:1) |
| UI-GRS-30 | K3 | Klasik arayüzde Zümrüt teması: beyaz yazılı birincil düğmeler ve vurgu yazıları 3,58–3,77:1; Mor ve Turuncu koyuda 2,58–2,65:1 |
| UI-GRS-31 | K3 | Kapasite–talep 1440 px'te Aralık'ı "Toplam"ın altında gizliyor; yana kaydırınca grup başlıkları soldan kesiliyor |
| UI-GRS-32 | K3 | Proje bilgileri penceresinde devre dışı alanlar etkin gibi çiziliyor; yalnız "Durum" soluk |
| UI-GRS-33 | K4 | "Bu ekran açılamadı" hata ekranı renk temasını ve modern koyu paleti izlemiyor |

### UI-GRS-29 · Klasik Portföy'de müdüre "Sahip atanmadı" neredeyse görünmüyor (açık 1,47:1, koyu 1,94:1)
- Önem: K2
- Ekran: Portföy › proje kartı › "Proje Yön." satırı          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot (+ sahipsiz yeni proje) ve aşırı
- Adımlar: 1. PYB destek (Mert) klasik Portföy'de "Yeni Proje Ekle" ile bir proje açsın; proje sahipsiz oluşur (`pmPersonId: null`). 2. Ahmet (müdür) olarak klasik Portföy'e bak. 3. Yeni projenin kartındaki "Proje Yön." satırına bak.
- Beklenen: Sahipsiz proje müdürün harekete geçmesi gereken bir durum; "Sahip atanmadı" en az komşu satırlardaki adlar kadar okunmalı (≥ 4,5:1), hatta dikkat çekmeli. Modern arayüzde aynı bilgi "Sahip atanmadı · 0 görev" olarak 5,23:1 ile okunuyor.
- Gözlenen (insan dili): Açık temada kartın sağında beyaz üstüne çok açık gri, silik bir yazı var. Göz kısmadan da zor seçiliyor; satır boş sanılıyor. Koyu temada lacivert kartta koyu gri, yine silik. Aynı satırda sahibi olan projelerde ad koyu ve net (açıkta 7,56:1, koyuda 9,96:1). Tasarım "eksik bilgiyi" bir yer tutucu gibi soldurmuş. Oysa müdür için önemli olan bilgi tam da bu. Mert'in ekranında aynı alan seçim kutusu olarak çiziliyor ve okunuyor. Sorun, sahip atayamayan rollerde (müdür) çizilen düz metin.
- Kanıt: `ekran/classic-acik-gunduz-classic-t2-sahipsiz-ahmet.png`, `ekran/classic-koyu-gece-classic-t2-sahipsiz-ahmet.png` (pilot); `ekran/classic-acik-gunduz-classic-t2-sahip-atanmadi.png`, `ekran/classic-koyu-gece-classic-t2-sahip-atanmadi.png` (aşırı veride 9 kart); karşılaştırma `ekran/modern-acik-gunduz-classic-t2-sahipsiz-mert.png`, `ekran/classic-acik-gunduz-classic-t2-sahipsiz-mert.png` · ölçüm: açıkta `#D1D5DB`/`#FFFFFF` **1,47:1**, koyuda `#4B5563`/`#1F2937` **1,94:1** (11 px, 600). Üç çalıştırmada üretildi (`olcum/17-t2-bos-asiri.json`, `olcum/18-t2-klasik-tema-kt.json` → `c`, `olcum/20-t2-sahipsiz-mudur.json`).
- Olası kök neden: `components/PortfolioView.tsx:156`. Sahip yoksa `text-gray-300 dark:text-gray-600` kullanılıyor (yer tutucu tonu), sahip varsa `text-gray-600 dark:text-gray-300`.
- Kapsam: tek ekran (klasik Portföy kartı; sahip atayamayan roller)
- Doğrulama: aday
- Devir: Cem (`ui-akis`): müdür sahipsiz projeyi nasıl fark ediyor, bu bir "dikkat" maddesi olmalı mı?

### UI-GRS-30 · Klasik arayüzde Zümrüt teması: beyaz yazılı birincil düğmeler ve vurgu yazıları 3,58–3,77:1; Mor ve Turuncu koyuda 2,58–2,65:1
- Önem: K3
- Ekran: klasik üst gezinme (etkin sekme), Portföy ("Aç", "Oluştur"), proje › Görevler (sürüm çipleri), Hedefler ("Hedefleri Düzenle"), Ekip ve tahsis ("Tahsis Tablosu", "Ekle", "Onaya Gönder", AA rakamları), "silindi · Geri Al" bandı          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=emerald (karşılaştırma: classic, purple, orange)
         ekran=1440×900 · rol=py (burak), mudur (ahmet) · veri=pilot ve boş
- Adımlar: 1. Klasik arayüzde renk temasını Zümrüt Ormanı yap. 2. Portföy, NEHİR › Görevler, Hedefler ve Ekip ve tahsis ekranlarına bak. 3. Aynısını Gece Moru ve Gün Batımı ile, açık ve koyu modda tekrarla.
- Beklenen: Her renk teması, her iki modda birincil düğme yazısında ve vurgu metninde 4,5:1'i tutturmalı. Modern arayüz bunu temaya ve moda göre ayrı ton seçerek yapıyor (modern Zümrüt açıkta `#0F766E` 5,47:1, koyuda `#3CCFB4`).
- Gözlenen (insan dili): Zümrüt'te yeşil zemin üstündeki beyaz yazılar (etkin sekme, "Aç", "Hedefleri Düzenle", "Onaya Gönder") hafif sönük. 11–12 px yazılarda harfler zeminle karışıyor. Görevler ekranında her kartın sürüm çipi ("v10", 100 kart) açık yeşil üstüne yeşil, 3,58:1. Gezinme ve kartlar "yeşil leke" olarak kalıyor, yazı seçilmiyor. Açık modda Mor ve Turuncu temiz geçiyor (0 hata); sorun Zümrüt'ün tek ve orta tonda yeşil kullanması. Koyu modda ise tablo tersine dönüyor:
  - Mor (`#7C3AED`) ve Turuncu (`#8A6100`) koyu zeminde Hedefler'in 24 px yüzdelerinde ve tahsis rakamlarında 2,58 ve 2,65:1.
  - Tahsis "Plan" segmenti 1,81–1,99:1.
  - Turuncu koyuda üst gezinme simgeleri de lacivert zemine gömülüyor.

  Bu, UI-GRS-19'un (klasik koyu, birincil mavi 2,84:1) "diğer temalar ölçülmedi" boşluğunu kapatıyor: dört temanın hiçbirinin koyu karşılığı yok.
- Kanıt: `ekran/classic-acik-gunduz-emerald-t2-portfoy.png`, `ekran/classic-acik-gunduz-emerald-t2-gorevler.png`, `ekran/classic-acik-gunduz-emerald-t2-tahsis.png`, `ekran/classic-koyu-gece-emerald-t2-tahsis.png`, `ekran/classic-acik-gunduz-emerald-t2-bos-portfoy.png`, `ekran/classic-koyu-gece-purple-t2-hedefler.png`, `ekran/classic-koyu-gece-orange-t2-hedefler.png` · ölçüm:
  - Zümrüt açık:
    - beyaz/`#059669` **3,77:1** (Portföy 4, Hedefler 1, tahsis 4 öğe)
    - `#059669`/`#ECFDF5` **3,58:1** (Görevler 100 sürüm çipi)
    - `#059669`/`#FFFFFF` 3,77:1 (tahsis 34 rakam)
    - "Asistan" logosu 3,75:1
  - Zümrüt koyu:
    - beyaz/`#059669` 3,77:1
    - "Plan" `#059669`/`#374151` **2,74:1**
  - Mor koyu: `#7C3AED`/`#1F2937` **2,58:1** (38 rakam + 4 yüzde)
  - Turuncu koyu: `#8A6100`/`#1F2937` **2,65:1** (38 + 4)
  - Mor ve Turuncu açık: Portföy, Görevler ve Hedefler'de 0 hata

  İki ayrı çalıştırmada üretildi (`olcum/17-t2-bos-asiri.json` → `classic-*-emerald-t2-bos-*`, `olcum/18-t2-klasik-tema-kt.json` → `a`). Klasik "Geri Al" bandında da 3,77:1 (`olcum/15-t2-ice-aktar-salt-okunur.json` → `classic-koyu-gece-emerald-t2-k23-ahmet`).
- Olası kök neden: `index.html:37-60` renk temaları `--app-primary` için tek değer tanımlıyor; koyu mod karşılığı yok. `index.html:62-63` `.text-primary` / `.bg-primary` bunu her iki modda kullanıyor. Örnek: beyaz yazı için `#047857` 5,48:1 verir; koyuda `#A78BFA` (Mor) 5,39:1, `#E0A800` (Turuncu) 6,83:1 verir.
- Kapsam: arayüzün tamamı (klasik; `bg-primary`/`text-primary` kullanan her yer)
- Doğrulama: aday (koyu mod kısmı UI-GRS-19 ile birleştirilebilir)
- Devir: Ece (`ui-erisim`): Zümrüt açıkta sürüm çipleri ve etkin sekme, döteranopide yeşil "tamamlandı" ile birlikte (UI-GRS-24).

### UI-GRS-31 · Kapasite–talep 1440 px'te Aralık'ı "Toplam"ın altında gizliyor; yana kaydırınca grup başlıkları soldan kesiliyor
- Önem: K3
- Ekran: Ekip ve tahsis › Araçlar › Kapasite–talep (tablo)          Arayüz: modern (klasik bileşen `AllocationView` barındırılıyor)
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=classic, emerald, purple, orange
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot ve aşırı
- Adımlar: 1. Müdür olarak Ekip ve tahsis › Araçlar › Kapasite–talep'i aç. 2. Tablo başlığındaki aylara bak. 3. Tabloyu yatay kaydır.
- Beklenen: On iki ayın hepsi ve "Toplam" görünür. Tablo kayıyorsa bunun bir işareti olur (gölge, solma). Rol/bölüm grup başlıkları kaydırmada yerinde kalır, satır etiketleri gibi.
- Gözlenen (insan dili): İlk bakışta başlık "Oca … Kas | Toplam"; Aralık yok. Aralık sütunu yapışkan "Toplam"ın tam altında (Ara 1282–1340 px, Toplam 1284'ten başlıyor). Aradaki tek ayrım %25 gri, 1 px'lik bir gölge, göz kısınca görünmüyor. Kullanıcı yıllık tabloyu 11 aylık sanıyor; "Toplam" sütunu ise 12 ayı topluyor ve elle toplamı tutmuyor. Tablo 56 px kaydırılınca Aralık ortaya çıkıyor. Bu kez grup başlıkları soldan kırpılıyor: "Proje Yönetimi Uzmanı" → "önetimi Uzmanı", "Proje Yöneticisi" → "öneticisi", "Yazılım Geliştirme Mühendisi" → "Geliştirme Mühendisi". Satır etiketleri ("Planlı - Proje") ise yerinde kalıyor; tablo iki farklı kurala göre davranıyor. Aşırı veride 200 karakterlik başlık sağda "Ek Kapsa" diye kesiliyor ve "Toplam" sütununun üstünden geçiyor. Açık ve koyu temada, dört renk temasında aynı.
- Kanıt: `ekran/modern-acik-gunduz-classic-t2-pilot-kapasite.png` (Aralık yok), `ekran/modern-koyu-gece-emerald-t2-pilot-kapasite-sag.png` (kırpılmış grup başlıkları), `ekran/modern-koyu-gece-purple-t2-asiri-kapasite.png`, `ekran/modern-koyu-gece-purple-t2-asiri-kapasite-sag.png` · ölçüm:
  - tablo 1150 px, kap 1094 px
  - kaydırma 0'da: Ara `sol 1282 / sağ 1340`, Toplam `sol 1284` → `altinda true`
  - kaydırma 56'da: grup başlığı metni `sol 265 < kap 304` → `kesik true` (3/3 grup)
  - Toplam ayrımı: `box-shadow: rgba(127,127,127,.25) -1px 0 0`, kenarlık 0

  4/4 koşulda üretildi: pilot açık/koyu, aşırı açık/koyu (`olcum/18-t2-klasik-tema-kt.json` → `b`, `olcum/17-t2-bos-asiri.json` → `*-asiri-kapasite`).
- Olası kök neden:
  - `components/AllocationView.tsx:608`: `min-w-[1150px]`; 1440 px'te kap 1094 px, 56 px taşma.
  - `styles/tailwind.css:39`: `:is(th, td):last-child` her satırın son hücresini sağa yapıştırıyor. Bu, Aralık'ı örtüyor ve tek hücreli (`colSpan`) grup satırını da yakalıyor.
  - `components/AllocationView.tsx:620`: grup hücresi `colSpan={14} sticky left-0`; satır kadar geniş olduğu için yapışkanlık etkisiz kalıyor.

  UI-KRC-17 düzeltmesinin yan etkisi.
- Kapsam: tek ekran (Kapasite–talep; klasikteki aynı bileşen de olası)
- Doğrulama: aday (Tolga'nın aşırı veri devir notunu pilot veride doğruluyor)
- Devir: Tolga (`ui-kirici`): 1280 ve 1024 px'te kaç ay gizleniyor? Ece (`ui-erisim`): %200'de ve klavyeyle tabloyu kaydırmak.

### UI-GRS-32 · Proje bilgileri penceresinde devre dışı alanlar etkin gibi çiziliyor; yalnız "Durum" soluk
- Önem: K3
- Ekran: Portföy › proje satırı "…" › "Proje bilgileri" penceresi          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=classic, purple
         ekran=1440×900 · rol=pyb_destek (mert); karşılaştırma py (burak) · veri=pilot
- Adımlar: 1. Mert olarak Portföy'de NEHİR satırının "…" düğmesine bas. 2. Gidişat düğmelerine (Belirtilmedi / Yolunda / Riskli / Kritik) ve Proje adı alanına bak, üzerine gel, tıkla.
- Beklenen: Devre dışı alanlar tek ve tanınır bir görsel dille soluk görünür, imleç "yasak" olur. Pencerenin üstünde neden düzenlenemediği yazar (bu metin kodda var: "Bu projeyi yalnızca sahibi düzenleyebilir.").
- Gözlenen (insan dili): Mert'in penceresi Burak'ınkiyle (sahip) piksel piksel aynı. Tek fark "Durum" seçicisinin hafif solgun olması. Proje adı, Gidişat düğmeleri ve Gidişat notu tam opak çiziliyor. Gidişat düğmelerinde imleç el işareti, ama tıklayınca hiçbir şey olmuyor. Alt satırda etkin "Kaydet" ve kırmızı "Sil" var; kullanıcı formun düzenlenebilir olduğunu düşünüyor. Açıklama metni çıkmıyor, çünkü Mert'in "yönetme" yetkisi var. Koyu ve Mor temada da aynı.
- Kanıt: `ekran/modern-acik-gunduz-classic-t2-proje-bilgileri-mert.png`, `ekran/modern-koyu-gece-purple-t2-proje-bilgileri-mert-uzerine.png`, karşılaştırma `ekran/modern-acik-gunduz-classic-t2-proje-bilgileri-burak.png` · ölçüm (Mert, açık ve koyu):
  - input "Proje adı": `kapali=1 opak=1`
  - select "Durum": `kapali=1 opak=0.7`
  - 4 Gidişat düğmesi: `kapali=1 opak=1 imlec=pointer`
  - textarea: `kapali=1 opak=1`
  - Burak'ta aynı öğeler `kapali=0` ve aynı renklerde (`olcum/21-t2-pasif-gidisat.json`)
- Olası kök neden: `styles/modern.css:147` yalnız `.m-btn:disabled` için soluklaşma ve `not-allowed` tanımlıyor. `.m-segment` (`:176`) ve `.m-input` (`:190`) için devre dışı biçemi yok; "Durum"un solukluğu tarayıcının varsayılan `select:disabled` biçeminden geliyor. `components/modern/ModernPortfolio.tsx:98` açıklamayı yalnız `readOnly && !canManage` iken gösteriyor.
- Kapsam: arayüzün tamamı (modern `m-segment` ve `m-input` kullanan her salt okunur form)
- Doğrulama: aday (Cem'in UI-AKS-23 devir notunu görsel tarafta doğruluyor)
- Devir: Ece (`ui-erisim`): `disabled` düğmeler odak sırasından düşüyor mu, ekran okuyucu "kapalı" diyor mu? Cem (`ui-akis`): Mert neden "Kaydet" görüyor?

### UI-GRS-33 · "Bu ekran açılamadı" hata ekranı renk temasını ve modern koyu paleti izlemiyor
- Önem: K4
- Ekran: hata ekranı (`ErrorBoundary`); aynı aile: kurtarma ekranı, "başka bir sekmede açık / başka bir sekmeye geçti"          Arayüz: modern ve klasik (ekran ortak)
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Sistem/Gündüz/Gece · renk teması=classic, emerald, purple, orange
         ekran=1440×900 · rol=py (burak) · veri=pilot (bozuk proje kaydı `risks:"metin"`)
- Adımlar: 1. Modern arayüzde Gece + Gün Batımı (ya da Zümrüt, Mor) seç. 2. Hata ekranını tetikle (UI-KRC-22).
- Beklenen: Ekran kullanıcının seçtiği temayı izler: modern koyuda siyah zemin (`#000000`/`#1C1C1E`) ve tema vurgusu (Turuncu `#FFD43B`, Zümrüt `#3CCFB4`, Mor `#A48BFF`).
- Gözlenen (insan dili): Gece/Gündüz 8/8 koşulda doğru uygulanıyor; koyu sistemde Gündüz seçilince de açık açılıyor. Ancak renk teması her koşulda yok sayılıyor. Düğme her zaman klasik mavi (`#1D4ED8`), zemin klasik lacivert (`#111827`/`#1F2937`). Modern koyu ve Turuncu kullanan biri siyah-sarı bir uygulamadan lacivert-mavi bir ekrana düşüyor; ekran "başka bir uygulama" gibi duruyor. Okunurluk iyi (0 kontrast hatası, göz kısınca kart ayrılıyor). Aynı durum 6 koşulda iki sekme ekranında ve 8 koşulda kurtarma ekranında da ölçüldü.
- Kanıt: `ekran/modern-koyu-gece-classic-t2-hata.png`, `ekran/modern-acik-gece-emerald-t2-hata.png`, `ekran/modern-koyu-sistem-purple-t2-hata.png`, `ekran/modern-koyu-gunduz-orange-t2-hata.png`, `ekran/modern-koyu-gece-orange-t2-k19-a-gecti.png`, `ekran/modern-koyu-gece-orange-t2-k19-b-baska-sekmede.png` · ölçüm: kart `rgb(31,41,55)`, gövde `rgb(17,24,39)`, düğme beyaz/`#1D4ED8` 6,7:1, 16/16 koşulda (hata + kurtarma) renk temasından bağımsız. Modern koyu uygulama zemini `#000000` (`olcum/13-t2-hata-kurtarma.json`, `olcum/14-t2-veri-sekme.json` → `*-k19`).
- Olası kök neden: `components/ErrorBoundary.tsx:46` (`bg-white dark:bg-gray-800 … border-gray-200`), `components/ErrorBoundary.tsx:54` (`bg-blue-700`). Aynı kalıp `components/StoreRecovery.tsx:43` ve `components/OtherTabNotice.tsx:19`'da var.
- Kapsam: tüm arayüzler (üç durum ekranı)
- Doğrulama: aday (UI-GRS-18'in "kısmen" kalan kısmı ve Tur 1 kısa notuyla birleştirilebilir; hata ekranı bu koşuda yeni)
- Devir: yok

## Devir notlarına yanıt

**Tolga'dan (3):**
1. **Kurtarma, hata ve sekme ekranları koyu temada:**
   - Üçü de Gece ve koyu sistemde koyu açılıyor (kurtarma 8/8, hata 8/8, sekme 6/6). Kart `#1F2937`, zemin `#111827`, kenarlık `#374151`. Göz kısınca kart ayrılıyor (`ekran/modern-koyu-gece-classic-t2-kurtarma-bulanik.png`).
   - Kapalı "Veriyi sil ve baştan başla" düğmesi okunuyor ve kapalı olduğu belli (`opacity 0.5`):
     - açıkta `#DC8E8E`/`#FFFFFF` 2,54:1
     - koyuda `#8E676E`/`#1F2937` 3,01:1

     Devre dışı denetim kontrast şartından muaf. Onay kutusu işaretlenince 6,47:1 (açık) ve 7,73:1 (koyu) oluyor (`ekran/modern-koyu-gece-classic-t2-kurtarma-onay.png`).
   - Kalan sorun renk teması (UI-GRS-33).
2. **"Veriyi sil" sonrası arayüz:** Gece ayarı korunuyor; o anki tarayıcı kaydından geliyor (`html.dark`). Arayüz ise klasiğe, renk teması klasik maviye dönüyor (`ekran/modern-koyu-gece-emerald-t2-k20-2-sil-sonra.png`). Ayarlar çalışma alanıyla birlikte siliniyor; yeni çalışma alanının varsayılanı klasik (`App.tsx:2265` `currentUiStyle={settings?.uiStyle || 'classic'}`). Görsel olarak yarım bir sıfırlama: koyu kalıyor, tema ve arayüz gidiyor. Kullanıcı beklentisi Cem'in alanı.
3. **Kapasite–talep:** Doğrulandı ve pilot veride de var → UI-GRS-31.

**Cem'den (3):**
1. **Klasik üst menü taşması:** Dört renk temasında, açık ve koyu modda aynı. "Haftalık rapor"dan sonra yarım bir simge kalıyor; solma ya da ok yok. Turuncu koyuda simgeler zemine gömülüyor (UI-GRS-30). PY rolüyle bu koşuda "Zekâ" tam görünüyordu. Kanıt: `ekran/classic-acik-gunduz-purple-t2-gorevler.png`, `ekran/classic-koyu-gece-orange-t2-gorevler.png`, `ekran/classic-acik-gunduz-emerald-t2-gorevler.png`, `ekran/classic-koyu-gece-emerald-t2-gorevler.png` (UI-GRS-22 sürüyor).
2. **Pasifliği görünmeyen düğmeler:** Doğrulandı → UI-GRS-32.
3. **Modern içinde klasik ada:** Bu turda Tahsis tablosuna bakmadım. Kapasite–talep de klasik `AllocationView` ile çiziliyor ve UI-GRS-31'in kökü orada.

**Ece'den (4):** Risk matrisi döteranopi, kenar çubuğu alt bölümü, yüksek karşıtlık ve eski pencereler bu turun kapsamı (Tolga'nın ekranları) dışında kaldı; Tur 3'e kalıyor.

**Cem'e yeni not:** Boş çalışma alanında Portföy "Dikkat gerektirenler: Her şey yolunda; bekleyen uyarı yok." diyor; 0 projede bu güvence yanıltıcı olabilir (`ekran/modern-koyu-gece-orange-t2-bos-portfoy.png`).

## Kısa notlar
- Boş çalışma alanında modern arayüz, 4 tema × açık/koyu Portföy'de 0 kontrast hatası verdi. Haftalık rapor, Risk raporu, Takvim ve Ekip ve tahsis boş durumları da temiz. Tek istisna klasik Zümrüt (UI-GRS-30).
- Yeni müşteri görüşmesi formunda 4 tema × açık/koyu ölçüldü. Düğmelerin hepsi ≥ 4,86:1. Tek hata, pencerenin arkasındaki segment sayaçları (`#6C6C70`/`#E3E3E8` 4,09:1, Tur 1 kısa notu).
- Klasikte salt okunur rol için çizilen "silindi · Geri Al" bandı üç temada iyi okunuyor. Sorun içerikte (UI-KRC-23), görünüşte değil.
- Ortam: `cdn-icons-png.flaticon.com` yüklenmiyor (sekme simgesi). Tarih alanı `mm/dd/yyyy` tarayıcı dilinden geliyor. Uyarı pencereleri (`alert`) ekran görüntüsüne girmiyor; metinleri kayda alındı.
