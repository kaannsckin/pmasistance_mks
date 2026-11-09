# Ece (ui-erisim) · Tur 2 (çapraz saldırı) · koşu 2 · 2026-11-06

Kod: `claude/zealous-tesla-hidbc9@8fb563d` · port 4184 · Chromium (playwright-core) · veri: pilot (GRS-13 için aşırı, GRS-27 için depo engelli)
Girdi: Deniz'in `../deniz/bulgular.md` (UI-GRS-19…27; K4 olan UI-GRS-28 ve "Kısa notlar" kapsam dışı) ve `../deniz/regresyon.md`.
Betikler: `betik/t01`…`t12` (+ yardımcı `betik/t2.mjs`), sonuçlar `betik/t??-sonuc.json`. Toplam **17 çalıştırma** (t02 iki, t05 dört, t08 iki kez). Görüntüler `ekran/`, yeni odak çizelgeleri `odak-sirasi/classic-*.md`. Bütün yollar bu dizine (`ui-testi/2026-11-06/ece/`) görelidir.

Yöntemim: aynı ekranı yalnız klavyeyle (Tab, Enter, Esc, oklar), %200 yakınlaştırmada (640×400 CSS px, aygıt ölçeği 2; görüntüler 1280×800), yalnız yazı %200'de (tarayıcı yazı boyutu 16 → 32), döteranopi / protanopi / tritanopi / gri süzgecinde, yüksek karşıtlıkta (`forced-colors: active`) ve telefonda (375×812, dokunmatik) kullandım. Odak halkasını her adımda ölçtüm (outline / gölge rengi ve çevre zemine karşıtlığı).

Ortam: Koşu sırasında kapsayıcı yeniden başladı. t10 ile sunucu ve tarayıcının yeniden açıldığı doğrulandı. Sekme simgesi (`cdn-icons-png.flaticon.com`) vekilden geçmiyor; bulgu değil.

Özet:
- Doğrulama: 9 bulgu → doğrulandı **9**, reddedildi 0, üretilemedi 0, önem değişmeli 0.
- Düzeldi denetimi: 5 karar, **5'i de teyit edildi**.
- Yeni bulgu: **6**, dağılım K1: 1 · K2: 1 · K3: 4. Ayrıca kısa notlar var.

---

## Doğrulama

| Bulgu | Karar | Gerekçe / kanıt |
|---|---|---|
| UI-GRS-19 · Klasik koyu birincil mavi 2,84:1 | doğrulandı (K2 kalsın) | Klasik + Gece, PUSULA › Hedefler: "33% / 76% / 69% / 91%" (24 px) `#2563EB`/`#1F2937` **2,84:1**. Deniz'in devri üzerine öteki renk temalarında da ölçtüm. Yüzdeler temanın rengini alıyor ama koyu karşılık yok:<br>• Zümrüt `#059669` 3,90:1 (24 px'te geçer, küçük metinde kalır)<br>• Gece Moru `#7C3AED` **2,58:1**<br>• Gün Batımı `#8A6100` **2,65:1**<br>Dört temanın üçünde büyük yazı eşiği (3:1) bile tutmuyor. %200 ve yazı %200 oranı değiştirmiyor. Döteranopide mor ve mavi rakamlar koyu zemine daha da gömülüyor. Kanıt: `ekran/classic-koyu-gece-classic-pusula-hedefler.png`, `ekran/classic-koyu-gece-purple-pusula-hedefler.png`, `ekran/classic-koyu-gece-orange-pusula-hedefler.png`, `ekran/classic-koyu-gece-emerald-pusula-hedefler.png`, `ekran/classic-koyu-gece-classic-pusula-hedefler-deuteranopi.png`; `betik/t02-sonuc.json` → `A-*`. |
| UI-GRS-20 · Klasik risk puanı / matris / onay düğmeleri beyaz yazı | doğrulandı (K2 kalsın) | Açık ve koyuda aynı ölçüm:<br>• risk listesi "Skor" hapları "12" ve "8": beyaz/`#F59E0B` **2,15:1**<br>• "6" ve "4": beyaz/`#10B981` 2,54:1<br>• matris "1": 2,54:1<br>• "Onayla & Kilitle" beyaz/`#10B981` 2,54:1, "Reddet" beyaz/`#F87171` 2,77:1 (11 px)<br>Döteranopide kapanmış satırdaki soluk sarı "12" hapının içindeki beyaz rakam neredeyse yok oluyor. "Onayla & Kilitle" (gri-zeytin) ile "Reddet" (sarı-zeytin) birbirine çok yakın tonlara dönüyor; iki kalıcı kararı yalnız yazı ve simge ayırıyor. Klavyeyle "Onayla & Kilitle"ye sayfa başından **43 Tab**'da ulaşılıyor. Halka görünüyor: koyuda 1 px `#EEEEEE`, dışa 12,65:1. Kanıt: `ekran/classic-acik-gunduz-burak-risk-liste-hap-deuteranopi.png`, `ekran/classic-koyu-gece-burak-risk-liste-hap-protanopi.png`, `ekran/classic-acik-gunduz-classic-ahmet-tahsis-onay-deuteranopi.png`, `ekran/classic-koyu-gece-classic-ahmet-tahsis-onay-odak.png`; `betik/t11-sonuc.json`, `betik/t02-sonuc.json` → `C-*`. Not: ilk denememde (t02, t10) hapları kendi betik hatam yüzünden bulamadım (tablo içini dışlamıştım); t11 ile iki temada ölçüldü. |
| UI-GRS-21 · Klasik risk matrisi ızgarası kırık | doğrulandı (K3 kalsın) | Sütun genişlikleri 1440'ta açık ve koyuda **24, 88, 130, 130, 130, 118 px**, %200'de 24, 76, 112, 112, 112, 101 px. `table-layout: auto`, 6 satırın hepsinde aynı. %200 görüntüsünde de ilk sütun dar, son sütun içeri kaçık. Yüzen AI düğmesi sağ alt hücrelerin üstüne biniyor. Benim şeridimden ek: dolu hücrede seviye harfi olmaması, ekran okuyucuda ve renk körlüğünde daha ağır sonuç doğuruyor. Ayrıntı yeni bulgu **UI-ERS-29**'da. Kanıt: `ekran/classic-acik-gunduz-zoom200-pusula-riskler-matris.png`, `ekran/classic-acik-gunduz-classic-matris-suzgecsiz.png`; `betik/t02-sonuc.json` → `B-*.matris`, `zoom.matris`. |
| UI-GRS-22 · Klasik üst gezinme 1440'ta kesik | doğrulandı (K3 kalsın) | 1440 ve 1280'de gezinme 628 px görünüyor, içerik 1017 px. "Haftalık rapor" %75 görünüyor; Görüşmeler, Beklentiler, Veri Havuzu %0. Maske ya da ok yok (Müdür; PY'de 2 gizli + Görüşmeler %21). Genişliğe göre:<br>• 1024: 9 öğe de görünüyor (simge kipi)<br>• 1023: 2 gizli + Görüşmeler %11<br>• 900 ve 768: simge kipinde görünüyor<br>• **768 altında gezinme hiç yok** (UI-ERS-27)<br>Klavyeyle: 7. Tab'da gizli "Görüşmeler"e gelince şerit 389 px kayıyor, öğe ve halkası tam görünüyor; klavye kullanıcısı gizli üç öğeye ulaşıyor. Ama kısmen görünen "Haftalık rapor"a (6. Tab) gelince şerit kaymıyor ve halkanın sağı kesik kalıyor (kısa not). Klavyeyle ulaşılabildiği için K3'ü koruyorum; Cem aynı kusuru UI-AKS-24'te K2 vermiş, uzlaşmada sorulsun. Kanıt: `ekran/classic-acik-gunduz-1440-ahmet-tab-06-haftalik-rapor.png`, `ekran/classic-koyu-gece-1440-ahmet-tab-09-veri-havuzu.png`, `odak-sirasi/classic-koyu-gece-1440-ahmet.md`; `betik/t01-sonuc.json`, `betik/t08-sonuc.json`. |
| UI-GRS-23 · Klasik Pano / Ekip 7–10 px | doğrulandı (K3 kalsın) | Pano (açık): 395 metnin **379'u** 11 px altında (7 px ×45, 8 px ×174, 9 px ×35, 10 px ×125). Ekip: 36 metnin 30'u.<br>Benim yöntemimle sonuç:<br>• %200 yakınlaştırmada (aygıt ölçeği 2) bu yazılar 14–20 aygıt pikseline çıkıyor; tarihler, "BOŞ", "HAVUZ • BACKLOG" okunuyor<br>• yalnız yazı %200'de bütün metin ölçekleniyor: Pano'da en küçük 14 px, 11 px altı metin 0; Ekip'te en küçük 18 px<br>Büyüteç kullanan için geçici bir yol var; varsayılan boyutta sorun sürüyor. Önem K3 kalmalı. Kanıt: `ekran/classic-acik-gunduz-zoom200-pusula-pano.png`, `ekran/classic-acik-gunduz-yazi200-pusula-pano.png`, `ekran/classic-acik-gunduz-1440-pusula-pano.png`; `betik/t04-sonuc.json` → `A-*`. |
| UI-GRS-24 · Zümrüt: "tamamlandı" ve "süreçte" dilimleri birleşiyor | doğrulandı (K3 kalsın) | Çubuk dilimleri, açık (`#1F7A35` / `#0F766E`):<br>• süzgeçsiz: parlaklık 1,01:1<br>• döteranopi: 1,03:1, ΔE 33<br>• protanopi: **1,00:1**<br>• tritanopi: ΔE **4,5**, iki dilim aynı camgöbeği<br>Koyu (`#30D158` / `#3CCFB4`): tritanopide ΔE 6,6, öbür süzgeçlerde 1,04–1,05:1. Görüntülerde iki dilim tek parça.<br>Hafifletici: lejantta yazıyla "19 tamamlandı · 3 süreçte · 3 yapılacak" var. Çubuğun `role=img` adı "Sürüm 12: %76 tamamlandı" ise "süreçte"yi hiç söylemiyor. Kanıt: `ekran/modern-acik-gunduz-emerald-genel-surum-kart-tritanopi.png`, `ekran/modern-acik-gunduz-emerald-genel-surum-kart-protanopi.png`, `ekran/modern-koyu-gece-emerald-genel-surum-kart-deuteranopi.png`; `betik/t03-sonuc.json` → `A-*.ciftler`. |
| UI-GRS-25 · Açık modda Zaman çizelgesi sütunları zeminden ayrılmıyor | doğrulandı (K3 kalsın) | Gri tonlamada sürüm sütunları zeminden ayrılmıyor. **Yüksek karşıtlık kipinde sütunlar tamamen yok oluyor**: dolgu kalkıyor, kenarlık hiç yok. Ekranda yalnız başlıksız, sınırsız "Görevleri buraya sürükleyin" yazıları kalıyor; bırakma hedefi görünmüyor. Klavyeden hafifletici: sütunlar `region "Sürüm 1, 0 görev"` ve `heading` ile adlandırılmış. Görev kartı (`button`, `draggable`) Enter ile "Görev" penceresini açıyor ve sürüm orada yazıyor. Kanıt: `ekran/modern-acik-gunduz-classic-forced-nehir-zaman-asagi.png`, `ekran/modern-acik-gunduz-classic-1440-nehir-zaman-gri.png`; `betik/t03-sonuc.json` → `B-*`. |
| UI-GRS-26 · Sürüm çipleri "Sürü…" | doğrulandı (K3 kalsın) | Çip kutusu / içerik genişliği:<br>• 1440: 40/46 px<br>• %200: **13/46 px**<br>• yalnız yazı %200: **3/92 px**; çipte hiç yazı kalmıyor, renkli bir şerit ve ":" kırıntısı görünüyor. Ay ekseninde "Oca 2027" ile "Şub" üst üste biniyor.<br>Ekran okuyucu için sorun yok: çip `button "Sürüm 1"`, `title="Sürüm 1: 1 Oca – 21 Oca"`. Klavyeyle çipe odaklanan gören kullanıcı ise tam adı göremiyor; `title` yalnız fareyle çıkıyor. 15 çipin her biri ayrı Tab durağı (32.–46. Tab). Kanıt: `ekran/modern-acik-gunduz-classic-yazi200-nehir-zaman.png`; `betik/t03-sonuc.json` → `B-*.cipler`. |
| UI-GRS-27 · Depo engelliyken kurtarma ekranı koyu sistemde beyaz | doğrulandı (K3 kalsın) | Sistem koyu, depo engelli: `html` sınıfsız, gövde `#F9FAFB`, orta piksel `#FFFFFF`. 1440'ta ve %200'de üretildi (2/2). Yüksek karşıtlıkta sistem renkleriyle siyah; orada sorun yok. Klavye geçti:<br>• "Yeniden dene" → "Kayıtlı verinin silineceğini anlıyorum" (onay kutusu, adlı) → sayfa dışı<br>• "Veriyi sil ve baştan başla" ağaçta `[disabled]`<br>• halka `#101010`, 19:1<br>Kanıt: `ekran/modern-koyu-sistem-depo-engelli.png`, `ekran/modern-koyu-zoom200-sistem-depo-engelli.png`, `ekran/modern-koyu-forced-sistem-depo-engelli.png`; `betik/t04-sonuc.json` → `C-*`. |

## Düzeldi denetimi

Deniz'in `regresyon.md`'deki "düzeldi" kararlarından 5'i: önce K2'ler (GRS-03, GRS-14), sonra benim şeridime en yakın K3'ler.

| Bulgu | Karar | Kanıt |
|---|---|---|
| UI-GRS-03 (K2) · Ayrıntılı analiz rozet / uyarı kontrastı | düzeldi (teyit) | Ekrana klavyeyle gittim (Yönetim, sonra Raporlar menüsü; menü sorunu için bkz. UI-ERS-30). Eşik altı metin: koyuda **1/435** (yalnız `+` işareti, 4,26:1), açıkta **0/435**, koyu %200'de 0/99. Rozetler: "Kritik" 7,46:1 (koyu) ve 7,33:1 (açık), "Riskli" beyaz/`#B45309` 5,02:1. Döteranopide rozetler yazıyla ayrılıyor. Kanıt: `ekran/modern-koyu-gece-classic-ahmet-yonetim-ayrintili.png`, `ekran/modern-koyu-gece-classic-ahmet-yonetim-ayrintili-deuteranopi.png`, `ekran/modern-koyu-gece-zoom200-classic-ahmet-yonetim-ayrintili.png`; `betik/t05-sonuc.json` → `03-*`. |
| UI-GRS-14 (K2) · Klasik kart tarihi, "Riskli", "Dışa Aktar" | düzeldi (teyit) | Açıkta tarih `#6B7280`/`#FFFFFF` 4,83:1, "Riskli" 5,02:1, alt başlık 4,63:1, "Dışa Aktar" 5,02:1. Koyuda tarih 5,78:1, "Görevler" alt sekmesi 6,87:1. %200'de de aynı ölçümler. Kanıt: `ekran/classic-acik-gunduz-zoom200-ahmet-portfoy-kart.png`, `ekran/classic-acik-gunduz-ahmet-portfoy-kart-deuteranopi.png`, `ekran/classic-koyu-gece-ahmet-pusula-gorevler.png`; `betik/t05-sonuc.json` → `14-*`. |
| UI-GRS-06 (K3) · Koyu modda açılır menü kartla aynı renk | düzeldi (teyit) | Raporlar menüsünü klavyeyle (Enter) açtım. Menü `#2C2C2E`, 1 px `#545458` halka ve gölge; alttaki `#1C1C1E` karttan ayrı seçiliyor. Açan düğmenin halkası 3 px `#4DA2FF`, siyah zeminde 7,93:1. Görsel ayrım düzelmiş; menünün klavye davranışı ayrı bir kusur (UI-ERS-30). Kanıt: `ekran/modern-koyu-gece-classic-ahmet-raporlar-menu-klavye.png`; `betik/t05-sonuc.json` → `03-*.menu`. |
| UI-GRS-10 (K3) · Durum raporu metin kutusu 45 px | düzeldi (teyit) | "Durum özeti"ne odaklanıp Enter'a bastım. Odak pencereye giriyor; 3. Tab'da metin alanı. Metin alanının adı "Rapor metni", görünür yüksekliği **340 px** (içerik 857 px). %200'de de 340 px; pencere 16–384 px aralığında olduğu için metin alanının altı pencere içi kaydırmayla görülüyor. Esc'den sonra odak "Durum özeti"ne dönüyor. Ek: metin alanının odak göstergesi koyu temada zayıf (kısa not). Kanıt: `ekran/modern-koyu-gece-classic-burak-nehir-durum-ozeti-klavye.png`, `ekran/modern-koyu-gece-zoom200-classic-burak-nehir-durum-ozeti-klavye.png`; `betik/t06-sonuc.json` → `10-*`. |
| UI-GRS-13 (K3) · Aşırı veride yatay taşma | düzeldi (teyit) | Aşırı veri, NEHİR Pano (koyu) ve Liste (açık), %200 ve 375 telefonda: sayfa genişliği pencereye eşit (640/640, 375/375). Sağa kaydırma denemesinden sonra `scrollX = 0`. Liste'de 523 uzun başlık üç noktayla kırpılıyor; kart içinde, beklenen davranış. Kanıt: `ekran/modern-acik-gunduz-375-asiri-nehir-liste-saga-kaydir.png`, `ekran/modern-koyu-gece-zoom200-asiri-nehir-pano-saga-kaydir.png`; `betik/t05-sonuc.json` → `13-*`. |

## Yeni bulgular

### UI-ERS-27 · Klasik arayüzde 768 px altında ana gezinme yok: telefonda ve %200 yakınlaştırmada Haftalık rapor, Ekip ve tahsis, Yönetim'e ulaşılamıyor
- Önem: K1 (öneri; uzlaşmada sorulsun: Ayarlar'dan arayüzü Modern'e çevirmek tek çıkış olabilir, denemedim; kullanıcının bunu bilmesi beklenemez)
- Ekran: klasik üst çubuk, ana gezinme          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz, Gece · renk teması=classic
         ekran=375×812 (dokunmatik), 640×400 (1280×800'ün %200'ü), 768, 900, 1100 · rol=mudur (ahmet), py (burak) · veri=pilot ve veri yok (ilk açılış)
- Adımlar: 1. Telefonda ya da %200 yakınlaştırmayla klasik arayüzü aç. 2. Haftalık rapora gitmeye çalış: üst çubuğa bak, Tab'la gez.
- Beklenen: Dar ekranda gezinme bir menü düğmesine (☰) ya da çekmeceye taşınsın; modern arayüzde böyle.
- Gözlenen (insan dili): Telefonda üst çubukta yalnız roket logosu, zil, bulut, profil ve ayarlar düğmesi var. Yönetim, Portföy, Ekip ve tahsis, Takvim, Risk raporu, Haftalık rapor, Görüşmeler, Beklentiler ve Veri Havuzu'nun hiçbiri yok. Menü düğmesi de yok. %200'de Tab'la 30 durak gezdim: zil, bulut, profil, yedek, ayarlar, proje sekmeleri, proje kartları. Bölüm sayfalarının hiçbirine gelmedim. "⌘K" düğmesi de bu genişlikte gizli. Klavyem varsa Ctrl+K kısayolu çalışıyor: "Haftalık" yazıp Enter'a basınca Haftalık rapor açıldı. Ama ekranda bu yolu gösteren hiçbir şey yok. Telefonda klavye olmadığı için hiç yol yok. Veri olmadan ilk açılışta uygulama klasik arayüzle açılıyor; telefondan ilk kez giren biri doğrudan bu ekranla karşılaşıyor. Gezinme 768 px'te simge kipinde görünüyor, 640'ta ve 375'te kayboluyor. (WCAG 1.4.10 Yeniden akış, 2.4.5 Birden çok yol, 2.1.1 Klavye)
- Kanıt: `ekran/classic-acik-gunduz-375-ahmet-nav.png`, `ekran/classic-acik-gunduz-zoom200-ahmet-ust.png`, `ekran/varsayilan-acilis-375.png`, `ekran/classic-koyu-gece-zoom200-burak-ust.png`, `ekran/classic-acik-gunduz-zoom200-ahmet-palet-haftalik.png` (Ctrl+K yolu), `odak-sirasi/classic-acik-gunduz-zoom200-ahmet.md`, `odak-sirasi/classic-acik-gunduz-375-ahmet.md` · ölçüm: `nav` kutusu 0×0; 9 gezinme öğesi DOM'da, `display:none` atası `nav.hidden.md:flex`. Üretimler:
  - t01: açık 640, koyu 640, 375
  - t08: 640, 375; 768/900/1100'de görünür
  - t09: veri yokken 375 ve 640'ta klasik açılış, menü düğmesi yok
  - t10: koyu 640, Burak; 18 Tab'da Haftalık / Ekip yok
- Olası kök neden: `components/Header.tsx:371` (`<nav className="hidden md:flex …">`; 768 altı için yedek gezinme yok) · `components/Header.tsx:414` (⌘K düğmesi `hidden md:flex`)
- Kapsam: arayüzün tamamı (klasik, 768 px altı)
- Doğrulama: aday (4 betikte üretildi)
- Devir: Cem (`ui-akis`): bölüm sorumlusu telefondan haftalık raporu gerçekten açabiliyor mu, ilk açılışın klasik olması bilinçli mi? Deniz: dar ekranda klasik üst çubuğun boş kalan sağ yarısı.

### UI-ERS-28 · Klasik "Yeni Görev Ekle" ve "İş Paketi Yönetimi" pencerelerine odak girmiyor: forma 528 Tab'da ulaşılıyor, Esc kapatmıyor
- Önem: K2
- Ekran: klasik proje › Görevler › "Yeni Görev" penceresi; proje çubuğu › "İş Paketleri" penceresi          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz, Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot (PUSULA, 104 görev)
- Adımlar: 1. Klasik PUSULA › Görevler'de "Yeni Görev"e Tab'la gel, Enter'a bas. 2. Tab'a bas. 3. Esc'ye bas.
- Beklenen: Odak pencerenin ilk alanına ("Görev Adı") gitsin. Tab pencere içinde dönsün. Esc pencereyi kapatıp odağı "Yeni Görev"e döndürsün. Modern arayüzün görev penceresi böyle çalışıyor.
- Gözlenen (insan dili): Pencere açıldı, arka plan karardı, ama odak "Yeni Görev" düğmesinde kaldı. Tab'a basınca karanlık perdenin arkasındaki görev kartlarında ilerledim: "PSL-1", durum seçicisi, "Detay", "Düzenle", "Sil"… Odak halkası perdenin arkasında, göremediğim yerdeydi. "Görev Adı" alanına **528. Tab'da** ulaştım; İş Paketi penceresinde "Paket Adı" **539. Tab**. Formun içinde 21 alandan sonra Tab pencereden çıkıp yüzen AI düğmesine ve üst çubuğa gidiyor. Esc ne pencereyi kapatıyor ne de bir şey söylüyor. Pencerenin rolü yok, `aria-modal` yok; ekran okuyucu pencerenin açıldığını duymuyor. Klavyeyle görev eklemek pratikte mümkün değil. (WCAG 2.4.3 Odak sırası, 2.1.1 Klavye, 4.1.2 Ad, rol, değer)
- Kanıt: `ekran/classic-koyu-gece-yeni-gorev-pencere-klavye.png` (40 Tab sonrası odak arka planda, sağ altta), `ekran/classic-acik-gunduz-yeni-gorev-alana-ulasti.png`, `ekran/classic-acik-gunduz-is-paketleri-alana-ulasti.png` · ölçüm: `betik/t09-sonuc.json` → `A-yeni-gorev.alanaTab: 528`, `A-is-paketleri.alanaTab: 539`, `pencereDom: rol null, ariaModal null, DOM sırası 3317/3540`, `esc.acik: 1`; `betik/t08-sonuc.json` → `B-*` (koyu: 40 Tab'ın hepsi arka planda, Esc sonrası pencere açık). 2/2 üretildi (t08 koyu, t09 açık).
- Olası kök neden: `components/TaskFormModal.tsx:147` ve `components/WorkPackageManager.tsx:71` (`div.fixed.inset-0` kaplama; `role="dialog"`, `aria-modal`, açılışta odak taşıma, odak tuzağı ve Esc işleyicisi yok; pencere DOM'un sonunda). Modern pencerelerdeki ortak düzen buraya uygulanmamış (bkz. UI-ERS-20, aynı kalıp).
- Kapsam: arayüzün tamamı (klasik pencereler)
- Doğrulama: aday · Deniz'in devriyle (Esc kapatmıyor) örtüşüyor
- Devir: Cem (`ui-akis`): klasikte görev ekleme işi, klavyesiz de olsa pencerenin perde arkasında kalan odakla nasıl hissettiriyor?

### UI-ERS-29 · Klasik risk matrisi ve risk listesinde düzey yalnız renkle: dolu hücre ekran okuyucuya "1", döteranopide Düşük ve Yüksek aynı gri
- Önem: K3
- Ekran: klasik proje › Riskler › "Risk Matrisi" ve risk tablosu "Skor" sütunu          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz, Gece · renk teması=classic
         ekran=1440×900 ve 640×400 · rol=py (burak), mudur (ahmet) · veri=pilot
- Adımlar: 1. Klasik PUSULA › Riskler'i aç. 2. Matrise ekran okuyucuyla (erişilebilirlik ağacı) ve döteranopi / protanopi süzgeciyle bak. 3. Risk tablosunun "Skor" sütununa bak.
- Beklenen: Her hücrede düzey yazıyla da olsun: modern Risk raporundaki gibi D/O/Y harfi ve lejant (UI-GRS-08 orada düzeldi). Dolu hücrenin adı olasılık, etki, düzey ve risk sayısını söylesin.
- Gözlenen (insan dili): Boş hücreler ekran okuyucuda düzgün okunuyor: "Olasılık 3 × Etki 3 = 9 (Orta)". Ama riskin olduğu, yani tek önemli hücreler yalnız "1" diye okunuyor; hangi olasılık, hangi etki, hangi düzey söylenmiyor. Gözle de düzeyi yalnız renk anlatıyor; hücrede harf yok, lejant yok. Döteranopi ve protanopi süzgecinde açık yeşil "Düşük" ile pembe "Yüksek" hücreleri aynı açık griye dönüyor, yalnız sarı "Orta" ayrılıyor. Koyu temada protanopide dolu hücre bej, içindeki beyaz "1" zor seçiliyor. Risk tablosunda da "Skor" yalnız sayı ve renk ("6" yeşil, "12" sarı); düzey adı yok. Tablonun başlıkları var, puan hücresi "6" diye okunuyor. (WCAG 1.4.1 Rengin kullanımı, 1.3.1 Bilgi ve ilişkiler)
- Kanıt: `ekran/classic-acik-gunduz-classic-matris-deuteranopi.png`, `ekran/classic-koyu-gece-classic-matris-protanopi.png`, `ekran/classic-acik-gunduz-classic-matris-suzgecsiz.png`, `ekran/classic-acik-gunduz-burak-risk-liste-hap-deuteranopi.png` · ölçüm: `betik/t02-sonuc.json` → `B-*.aria`. Ağaçta dolu hücre `cell "1"`, boş hücre `cell "Olasılık 3 × Etki 1 = 3 (Düşük)"`; `th` 0, tablo adı yok. 2/2 (açık, koyu) + liste t11 (açık, koyu).
- Olası kök neden: `components/RiskView.tsx:222`. Düzey `title` ile veriliyor; dolu hücrede görünen "1" metni erişilebilir adı belirliyor ve `title` yok sayılıyor. `aria-label` ve görünür harf yok. Tablo başlık hücresi (`th`) kullanmıyor.
- Kapsam: tek ekran (klasik proje Riskler)
- Doğrulama: aday · Deniz'in UI-GRS-20 / UI-GRS-21 (görsel taraf) ile birleşir
- Devir: Deniz (`ui-gorsel`): klasik matrise modern Risk raporundaki harf ve lejant getirilirken ızgara (UI-GRS-21) birlikte düzeltilebilir.

### UI-ERS-30 · Dört menü klavyede menü gibi davranmıyor: ok tuşu yok, Esc kapatmıyor, Tab'la çıkınca açık kalıyor, sonraki tıklama yutuluyor
- Önem: K3
- Ekran: proje sekmeleri › "Diğer"; Liste › "İçe / dışa aktar"; Ekip ve tahsis › "Araçlar"; Yönetim › "Raporlar"          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz, Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak), mudur (ahmet) · veri=pilot
- Adımlar: 1. NEHİR › Liste'de "Diğer"e Tab'la gel, Enter'a bas. 2. ↓'ye bas. 3. Tab'la menüden çık. 4. Esc'ye bas. 5. Fareyle "Genel bakış" sekmesine tıkla.
- Beklenen: Menü açılınca odak ilk öğeye gitsin, oklar öğeler arasında gezsin. Esc ve Tab menüyü kapatsın, odak açan düğmeye dönsün. Dışarıya tıklama hem menüyü kapatsın hem tıklanan şeyi yapsın.
- Gözlenen (insan dili): Enter'dan sonra menü açılıyor ama odak düğmede kalıyor; ekran okuyucu "menü" rolünü duyurduğu için ok tuşuna basıyorum, hiçbir şey olmuyor. Tab'la öğelere girebiliyorum. Son öğeden sonra Tab sayfaya geçiyor, menü ise açık kalıp altındaki içeriği örtmeye devam ediyor. Esc'ye iki kez bastım; menü açık, `aria-expanded` hâlâ "true". Fareyle "Genel bakış"a tıkladım: menü kapandı ama sekme açılmadı, odak sayfanın başına (`body`) düştü. Raporlar menüsü açıkken görünmez katman sayfadaki "Ayrıntılı analiz" düğmesine tıklamayı da yuttu. Dört menüde de aynı. (WCAG 2.1.1 Klavye, 2.4.3 Odak sırası, 4.1.2 Ad, rol, değer)
- Kanıt: `ekran/modern-acik-gunduz-proje-diger-menu-klavye.png`, `ekran/modern-acik-gunduz-liste-ice-disa-menu-klavye.png`, `ekran/modern-acik-gunduz-tahsis-araclar-menu-klavye.png`, `ekran/modern-koyu-gece-classic-ahmet-raporlar-menu-klavye.png` · ölçüm: `betik/t06-sonuc.json` → `diger`, `iceDisa`, `araclar` (`asagi` hâlâ düğme; `tabSonra.menu: 1`; `esc.menu: 1, genis: "true"`; `disTik.hedefSeciliSonra: "false"`, odak `(body)`); `betik/t05-sonuc.json` → `03-*.escSonra`, `esc2Sonra` (Raporlar, açık ve koyu). 4 menüde, 2 betikte üretildi.
- Olası kök neden: `components/modern/ModernProjectHeader.tsx:138`, `components/modern/ModernTaskList.tsx:149`, `components/modern/ModernAllocation.tsx:190`, `components/modern/ModernExecutive.tsx:342`. `role="menu"` var, ama ok tuşu, Esc işleyicisi, odak taşıma ve odak dışına çıkınca kapatma yok. Kapatma, `div.fixed.inset-0 z-40` saydam katmana tıklamayla yapılıyor; bu da ilk tıklamayı yutuyor.
- Kapsam: arayüzün tamamı (modern açılır menüler; Haftalık rapordaki "Madde ekle" menüsü `ReportEditor.tsx:625` aynı kalıp)
- Doğrulama: aday · UI-ERS-10'un (Tur 1, kısmen) kalan kısmının genişlemesi; Cem'in UI-AKS-27'siyle ve Deniz'in devriyle (Esc) aynı kök
- Devir: yok

### UI-ERS-31 · Plan onayı klavyeyle sessiz: "Onaya Gönder", "Onayla & Kilitle", "Reddet" sonrası odak kayboluyor, hiçbir şey okunmuyor
- Önem: K3
- Ekran: Ekip ve tahsis › Görünüm: Tahsis tablosu › proje planı onay satırı          Arayüz: modern (içindeki tablo klasik bileşen)
- Koşul: sistem teması=açık · görünüm ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (burak: NEHİR "Onaya Gönder"), mudur (ahmet: PUSULA "Onayla & Kilitle", "Reddet") · veri=pilot
- Adımlar: 1. Ekip ve tahsis'te Görünüm = Tahsis tablosu, Proje = NEHİR (Burak) ya da PUSULA (Ahmet) seç. 2. "Onaya Gönder" / "Onayla & Kilitle" / "Reddet" düğmesine odaklanıp Enter'a bas. 3. Ekran okuyucunun ne söylediğine ve odağa bak.
- Beklenen: "Plan onaya gönderildi", "Plan onaylandı ve kilitlendi" gibi kısa bir duyuru `role=status` içinde okunsun. Odak, düğmenin yerine gelen düğmeye ("Kilidi Aç") ya da durum etiketine geçsin.
- Gözlenen (insan dili): Enter'a bastım; düğme kayboldu ve yerine başka bir şey geldi. Ama ekran okuyucu hiçbir şey söylemedi. Sayfada boş bir `role=status` bölgesi var, kullanılmıyor. Odak sayfanın gövdesine (`body`) düştü; işin olup olmadığını anlamak için tabloyu yeniden okumam gerekti. Üç düğmede de aynı. "Proje bilgileri › Kaydet" (Mert) de duyuru yapmıyor, ama orada odak açan düğmeye doğru dönüyor. Haftalık rapordaki UI-ERS-26 ile aynı kalıp. (WCAG 4.1.3 Durum iletileri, 2.4.3 Odak sırası)
- Kanıt: `ekran/modern-acik-gunduz-burak-onaya-gonder.png`, `ekran/modern-acik-gunduz-ahmet-onayla.png`, `ekran/modern-acik-gunduz-ahmet-reddet.png`, `ekran/modern-acik-gunduz-mert-proje-bilgileri-kaydet.png` · ölçüm: `betik/t07-sonuc.json`. `gonder`, `bas` alanlarında `canli: [], canliDegil: []`, `odak: (body)`; `bolgeler: div role=status live=polite ""`. 3 ayrı oturumda üretildi (Onaya Gönder, Onayla, Reddet).
- Olası kök neden: `components/AllocationView.tsx:250` (Onaya Gönder) ve aynı satırdaki onay/ret düğmeleri (`:255`, `:258`). Durum değişince düğme DOM'dan kalkıyor, odak taşınmıyor; ortak kayıt bildirimine (`status`) ileti gönderilmiyor.
- Kapsam: tek ekran (plan onay akışı)
- Doğrulama: aday · Cem'in UI-AKS-29'uyla aynı olay, ekran okuyucu ve odak tarafı
- Devir: yok

### UI-ERS-32 · Klasik Görevler listesinde 104 durum seçicisinin adı yok: ekran okuyucu hangi görevin durumunu değiştirdiğimi söylemiyor
- Önem: K3
- Ekran: klasik proje › Görevler › görev kartı durum seçicisi ("Tamamlandı ⌄")          Arayüz: klasik
- Koşul: sistem teması=açık · görünüm ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (burak), mudur (ahmet) · veri=pilot (PUSULA, 104 görev)
- Adımlar: 1. Klasik PUSULA › Görevler'i aç. 2. Tab'la ilk kartın durum seçicisine gel. 3. Ekran okuyucunun okuduğunu (erişilebilirlik ağacı) dinle.
- Beklenen: "Durum: Görev listesi konum izni reddedilince boş ekran açılıyor, Tamamlandı" gibi görev adını içeren bir ad.
- Gözlenen (insan dili): Tab'la her kartta bir açılır kutuya geliyorum. Ekran okuyucu yalnız "açılır kutu, Tamamlandı" diyor. Hangi göreve ait olduğunu bilmek için geri dönüp başlığı okumam gerekiyor. Form kipinde hızlı gezerken 104 aynı "açılır kutu" arka arkaya geliyor; yanlış görevin durumunu değiştirmek çok kolay. Müdür rolünde de aynı seçici, Sil ve Düzenle düğmeleri etkin görünüyor (`disabled` ya da `aria-disabled` yok); Tolga'nın UI-KRC-23'ünde bu düğmeler hiçbir şey yapmıyor. (WCAG 4.1.2 Ad, rol, değer; 2.4.6 Başlıklar ve etiketler)
- Kanıt: `ekran/classic-acik-gunduz-burak-gorev-kart-durum-secici.png` · ölçüm: `betik/t10-sonuc.json` → `B.aria`. Ağaçta `combobox:` adsız, `erisilebilirAd: (yok)`, sayfada 104 adsız seçici. `betik/t09-sonuc.json` → `C-light.adsiz.alan: 104`, `silDuzenle: disabled=false aria-disabled=null`. 2/2 (t09 Ahmet, t10 Burak).
- Olası kök neden: `components/TaskCard.tsx:88` (`<select className="text-xs bg-transparent border-none …">` için `aria-label` yok)
- Kapsam: tek ekran (klasik görev kartları)
- Doğrulama: aday
- Devir: Cem / Tolga: müdürde etkin görünen Sil / Düzenle (UI-KRC-23) için doğru durum `aria-disabled` mı, hiç gösterilmemesi mi?

---

## Devir notlarına yanıt (bana yazılanlar)

**Cem**
1. *Diğer menüsü (UI-AKS-27).* Klavyeyle doğrulandı ve aynı kalıp İçe / dışa aktar, Araçlar ve Raporlar menülerinde de var → **UI-ERS-30**. Menüden Tab'la çıkınca odak sayfada ilerliyor, menü açık kalıyor. Dışarı tıklayınca odak `body`'ye düşüyor. "Madde ekle" bu turda yeniden denenmedi (Tur 1, UI-ERS-10 kısmen).
2. *Klasik menü taşması (UI-AKS-24).* Tab'la gizli "Görüşmeler"e gelince şerit kayıyor ve öğe tam görünüyor. Kısmen görünen "Haftalık rapor"da şerit kaymıyor, halka kesik kalıyor. Genişliğe göre:
   - 1280: 3 gizli + 1 kısmen (1440 ile aynı)
   - 1024: hepsi görünüyor (simge kipi)
   - 1023: 2 gizli + 1 kısmen
   - 900 / 768: görünüyor
   - 640 (%200) ve 375: gezinmenin tamamı yok → **UI-ERS-27**
3. *Telefonda rapor maddesi ve sessiz kayıtlar.* Alt şeridin odağı örtmesi Tur 1 UI-ERS-17'de iki kez üretildi; bu turda ölçmedim. Sessiz kayıtlar doğrulandı → **UI-ERS-31** (Onaya Gönder, Onayla & Kilitle, Reddet). "Proje bilgileri › Kaydet" de sessiz, ama orada odak açan düğmeye dönüyor.

**Deniz**
1. *Esc menüleri ve klasik pencereleri kapatmıyor.* Modern Raporlar ve Araçlar menülerinde doğrulandı → UI-ERS-30. Klasik "Yeni Görev Ekle" ve "İş Paketi Yönetimi"nde doğrulandı ve daha ağır: odak pencereye hiç girmiyor → **UI-ERS-28**.
2. *Renk körlüğü.*
   - Zümrüt dilimleri: tablodaki UI-GRS-24 satırı.
   - Klasik risk matrisi: UI-GRS-20 satırı ve UI-ERS-29.
   - Koyu Tahsis ısı haritası: döteranopi ve protanopide aşırı (`#FF453A`) hücreler zeytin-sarı, normal (`#3D7CC9`) hücreler mavi kalıyor; ton farkı korunuyor. Her hücrede yüzde yazıyor, ad da var ("Aslı Çakır, Ocak: %140, kapasite aşımı"). Renk körlüğü için geçiyor; UI-GRS-08'in kalan sorunu yalnız parlaklık / gri tonlama (`ekran/modern-koyu-gece-tahsis-isi-protanopi.png`, `-deuteranopi.png`; `betik/t12-sonuc.json`).
3. *Yakınlaştırma.*
   - Klasik Pano/Ekip %200: UI-GRS-23 satırı (okunuyor).
   - Koyu Ctrl+K paleti %200'de: palet `#000000`, kenarlıksız, yalnız `rgba(0,0,0,.6)` gölge. Üst ve yan kenarı ancak arkadaki `#1C1C1E` kartların bittiği yerde seçiliyor; "Aksiyonlar" listesi sayfaya karışıyor. UI-GRS-05'in kalan kısmı yakınlaştırmada da sürüyor (`ekran/modern-koyu-gece-zoom200-ara-paleti.png`).
   - Ekran rehberi %200'de açıldı (`ekran/modern-koyu-gece-zoom200-haftalik-rehber.png`); ayrıca ölçmedim.

**Tolga**
1. *Görev formunda Ctrl+K + tek Esc.* "Silinsin mi?" onayını üretemedim. Benim koşumda Esc paleti kapattı, form açık kaldı, ama **odak `body`'ye düştü** ve ikinci Esc formu kapatmadı. UI-ERS-21'in görev formundaki hali (kısa not; `betik/t06-sonuc.json` → `ctrlkEsc`).
2. *Esc ile kapanan Yeni risk / Yeni görüşme / Yeni beklenti.* Odak üçünde de açan düğmeye ("Yeni risk", "Yeni görüşme", "Yeni beklenti") dönüyor; geçti. Uyarısız veri kaybı (UI-KRC-24) benim şeridim değil.
3. *Kurtarma ve sekme ekranlarında klavye.*
   - Kurtarma ekranı (depo engelli) geçti: onay kutusu adlı, "Veriyi sil…" ağaçta `[disabled]` ve Tab dışı, halka görünür (UI-GRS-27 satırı). "Burada kullan" Tur 1'de geçmişti, yinelemedim.
   - Klasikte müdüre görünen Sil / Düzenle / Detay etkin bildiriliyor; `disabled` ya da `aria-disabled` yok (UI-ERS-32 içinde).

## Kısa notlar

- K4 · Klasik üst gezinmede kısmen görünen "Haftalık rapor"a Tab'la gelince şerit kaymıyor; öğe %75 görünür, halkanın sağı kesik (1440, açık ve koyu; `ekran/classic-acik-gunduz-1440-ahmet-tab-06-haftalik-rapor.png`). WCAG 2.4.11 kısmen örtülme izin veriyor; kozmetik.
- K4 · Zaman çizelgesi, yalnız yazı %200: ay ekseninde "Oca 2027" ile "Şub" üst üste, "Bugün" etiketi çipin üstüne biniyor (`ekran/modern-acik-gunduz-classic-yazi200-nehir-zaman.png`).
- K4 · Modern metin alanlarının odak göstergesi koyu temada zayıf. "Durum özeti" metni ve "Yeni görev" ad alanında kenar `#38383A` → 1 px `#4DA2FF`; dış gölge `rgba(0,102,214,.2)` siyahta 1,13:1. Düğmelerdeki 3 px halkanın yanında güçlükle seçiliyor. 2.4.7 geçiyor, 2.4.13 (AAA) geçmiyor (`ekran/modern-koyu-gece-durum-ozeti-textarea-odak-yakin.png`, `ekran/modern-koyu-gece-yeni-gorev-ad-odak.png`; `betik/t07-sonuc.json` → `metinAlani`).
- K4 · Görev formunda Ctrl+K → Esc sonrası odak `body`'ye düşüyor; ikinci Esc formu kapatmıyor (UI-ERS-21'in görev formundaki hali; `betik/t06-sonuc.json` → `ctrlkEsc`).
- K3 aday (tek üretim) · Klasik Pano telefonda (375): kart başlığındaki "Yeni Görev", "Detaylı", "Otomatik planla" düğmeleri kartın sağ kenarında kırpılıyor (`overflow: hidden`, kart sağı 359 px, düğme 402–535 px). Görünmüyorlar ama odaklanabiliyorlar. Yüzen AI düğmesi "Ekip 7 üye" etiketini örtüyor. %200'de (640) düğmeler sığıyor (`ekran/classic-acik-gunduz-375-ahmet-pusula-pano.png`; `betik/t08-sonuc.json` → `A-375.pano`; kök: `components/KanbanView.tsx:248` çevresindeki başlık satırı).
- Bulgu değil · Klasik arayüz tarayıcının varsayılan odak halkasını (`outline: auto`) kullanıyor. Açık ve koyuda, dört renk temasında görünür (12,6–19:1). Telefonda (Android öykünmesi) halka turuncu `#E59700`, beyazda 2,3:1; bu tarayıcının varsayılanı, uygulamanın değil (`odak-sirasi/classic-*.md`).
- Bulgu değil · Zaman çizelgesi kartları klavyeyle odaklanıyor (3 px `#0066D6`, 5,42:1). Enter "Görev" penceresini açıyor, sürüm orada yazıyor. Sürüm sütunları `region` ve `heading` ile adlandırılmış.
