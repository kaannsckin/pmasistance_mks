# Ece (ui-erisim) · Tur 2 (çapraz saldırı) · 2026-11-04

Kod: `claude/zealous-tesla-hidbc9` (ortak betik `caed25d`) · Betikler: `betik/t01…t12` (13 çalıştırma; t06 bir kez yeniden çalıştırıldı) · Görüntüler: `ekran/tur2-*.png`
Yöntem: Deniz'in her K1–K3 bulgusunu %200 yakınlaştırmada (640×400), renk körlüğü süzgeçlerinde (döteranopi, protanopi, gri), yüksek karşıtlık ölçümüyle ve yalnız klavyeyle yeniden ürettim. Deniz'in K4'ünü (GRS-12) atladım.

Özet: 11 bulgu denendi. Doğrulanan 9, önem değişmeli 2 (ikisi de yeniden üretildi), reddedilen 0, üretilemeyen 0. Yeni bulgu: 2 (K2: 1, K3: 1) ve kısa notlar.

## Doğrulama

| Bulgu | Karar | Gerekçe / kanıt |
|---|---|---|
| UI-GRS-01 | doğrulandı | Sistem koyu + Gündüz: ekran siyah (`--m-bg #000000`). Ayarlar'ı klavyeyle açıp 19. Tab'daki "GÜNDÜZ MODU"na Enter, sonra "Değişiklikleri Uygula": depoda `isDarkMode: true` ama ekran değişmiyor. Klasik + sistem açık + Gece: `html.dark` var, ekran açık. Benim açımdan ek: düğmede `aria-pressed` yok, yazısı basınca "GÜNDÜZ MODU" ↔ "GECE MODU" değişiyor. Ekran okuyucu kullanıcısı yazının o anki durumu mu, yapılacak işi mi söylediğini anlayamıyor. İşletim sistemini değiştiremeyen (ortak bilgisayardaki) kullanıcının koyu temaya geçmek için tek yolu tarayıcının zorla koyu modu. K2 doğru. `ekran/tur2-modern-koyu-gunduz-portfoy.png`, `ekran/tur2-modern-koyu-geceuygulandi-portfoy.png`, `ekran/tur2-klasik-acik-gece-acilis.png`, `betik/t01-sonuc.json` |
| UI-GRS-02 | doğrulandı | Ölçümler: beyaz/`#4DA2FF` 2,65:1 (classic), beyaz/`#3CCFB4` 1,95:1 (zümrüt), "Vazgeç" 3,36:1, "VERİLERİ SIFIRLA" 3,04:1. Döteranopi süzgecinde zümrüt düğme açık gri hapa dönüyor, beyaz yazı neredeyse yok oluyor. %200 yakınlaştırmada da durum aynı. Odak halkası düğmeyle aynı renkte (`#3CCFB4`) ama 2 px aralıkla siyah zeminde 10,8:1, yani görünüyor. `ekran/tur2-modern-koyu-emerald-deuteranopi-ayarlar-alt.png`, `ekran/tur2-modern-koyu-emerald-zoom200-ayarlar.png`, `ekran/tur2-modern-koyu-emerald-ayarlar-uygula-odak.png`, `betik/t01-sonuc.json` |
| UI-GRS-03 | doğrulandı | "12"/"8" puan hap'ları ve "Orta" rozeti beyaz/`#F59E0B` 2,15:1 ölçüldü; ekranda 396 metnin 78'i eşiğin altında. Renk körlüğü açısından sorun yok: rozetlerde düzey yazılı ("Orta: 7", "Düşük: 8"), döteranopi ve protanopide renk ayrılmasa da anlam okunuyor. Sorun yalnız kontrast. `ekran/tur2-modern-acik-normal-ayrintili-rozet.png`, `ekran/tur2-modern-acik-deuteranopi-ayrintili-rozet.png`, `ekran/tur2-modern-koyu-normal-ayrintili-rozet.png`, `betik/t08-sonuc.json` |
| UI-GRS-04 | doğrulandı | Modern koyu Kapasite–talep'te "0" `#4B5563`/`#1F2937` 1,94:1 (488 metnin 207'si eşik altı, açıkta 26). Klasik koyuda tarih "16.10.2026" 1,94:1, Tahsis'te seçili "Plan" `#2563EB`/`#374151` 1,99:1. Ek: klasik Plan / Gerçekleşen / Karşılaştır düğmelerinde `aria-pressed` yok; seçim ekran okuyucuya hiç söylenmiyor, gözle de seçilmeyenlerden daha sönük. `ekran/tur2-modern-koyu-kapasite-talep.png`, `ekran/tur2-klasik-koyu-tahsis.png`, `betik/t02-sonuc.json`, `betik/t08-sonuc.json` |
| UI-GRS-05 | doğrulandı | %200 yakınlaştırmada daha kötü: koyu Ctrl+K paletinin alt kenarı görünmüyor, paletin altındaki sayfa kartı ("NEHİR Veri Platformu · NHR-2403 · Yazılmadı") paletin bir sonraki seçeneği gibi okunuyor. Sağlık skoru penceresinin üst kenarı da siyahta kayboluyor. Odak: rehber ve palet açılınca odak içeri geçiyor. Durum raporu, Sağlık skoru ve Görev ayrıntısı pencerelerinde geçmiyor; ayrı bulgu olarak yazdım (UI-ERS-15). K3 kalsın. `ekran/tur2-modern-koyu-zoom200-palet.png`, `ekran/tur2-modern-koyu-zoom200-haftalik-rehber.png`, `ekran/tur2-modern-koyu-pencere-saglik-skoru.png`, `betik/t03-sonuc.json` |
| UI-GRS-06 | doğrulandı | Görüntüde "Raporlar" menüsünün son maddesinin hemen altında kartın "9 kişi bazı aylarda kapasite üstü" satırı duruyor ve menüye aitmiş gibi görünüyor. Klavyeyle menü düğmesinin `aria-haspopup`/`aria-expanded` değerleri doğru ve Tab maddelere sırayla gidiyor. Ama ok tuşları çalışmıyor ve iki Esc'ten sonra da menü açık (Raporlar). Araçlar menüsü de Esc ile kapanmıyor (açık ve koyu temada). Bkz. Deniz'in devir notu ve UI-ERS-10. `ekran/tur2-modern-koyu-raporlar-menu-klavye.png`, `betik/t04-sonuc.json` (`raporlar`), `betik/t02-sonuc.json` (`aracMenuEscAcik_*: true`) |
| UI-GRS-07 | doğrulandı | Modern koyuda Kapasite–talep tablosu lacivert-gri (`#1F2937`) iken kenar çubuğu siyah. Ayarlar penceresi %200 yakınlaştırmada da lacivert kutu olarak açılıyor. Ayrıntılı analiz de aynı. Bu eski ekranlarda odak halkası görünüyor (3 px `#4DA2FF`, kaydırılabilir tablo kabı da odaklanıyor); kısa nota bakın. `ekran/tur2-modern-koyu-kapasite-talep.png`, `ekran/tur2-modern-koyu-kapasite-odak-04.png`, `ekran/tur2-modern-koyu-emerald-zoom200-ayarlar.png`, `ekran/tur2-modern-koyu-yonetim-ayrintili.png` |
| UI-GRS-08 | önem değişmeli (bölünsün: ısı haritası K3 → K4; risk matrisi UI-ERS-05 ile birleşsin, K3) | Gri tonlama sonucu doğru: koyu ısı haritasında %140 ile %89 aynı gri, koyu risk matrisinde Orta ile Düşük aynı gri. Döteranopi ve protanopide ısı haritasının kırmızısı zeytin-sarıya dönüyor ve mavi hücrelerden belirgin ayrılıyor; her hücrede yüzde de yazılı. Bu yüzden ısı haritası kısmının iş etkisi kozmetik. Koyu risk matrisi döteranopide Orta (parlak sarı) ile Düşük (soluk haki) arasında zor ayrılıyor; açık temadaki eşi UI-ERS-05. `ekran/modern-gri-dark-doluluk.png`, `ekran/modern-deuteranopi-dark-doluluk.png`, `ekran/modern-protanopi-dark-doluluk.png`, `ekran/modern-deuteranopi-dark-risk-matrisi.png`, `ekran/modern-gri-dark-risk-matrisi.png` (Tur 1, `betik/b11`) |
| UI-GRS-09 | doğrulandı | Döteranopi süzgecinde turuncu temada vurgu ("Yeni görev", "Pano ›", seçili proje), "Riskli" hapı, "5 gün kaldı" hapı, ilerlemenin tamamlandı/süreçte dilimleri, Yolunda/Riskli/Kritik noktaları ve kırmızı "Termini geçmiş" yazısı aynı zeytin-sarıya çöküyor. Renk körü kullanıcıda bu çakışma daha da derin. Odak halkası bu temada görünüyor (açıkta `#B54708` 4,9–5,4:1, koyuda `#FF9F5A` 6,9–10,4:1) ama halka da uyarı rengiyle aynı. `ekran/tur2-modern-acik-orange-deuteranopi-genel.png`, `ekran/tur2-modern-koyu-orange-deuteranopi-genel.png`, `betik/t05-sonuc.json` |
| UI-GRS-10 | doğrulandı | Metin kutusu 47 px yüksek; içerik 810 px (1440) ve 923 px (%200). %200 yakınlaştırmada da yalnız 2 satır görünüyor. Klavye kullanıcısı için daha ağır: pencere açılınca odak içeri girmiyor, kutuya ulaşmak için arka plandan 33 Tab geçmek gerekiyor (UI-ERS-15). Kutunun `label`'ı var ("Rapor metni"). `ekran/tur2-modern-koyu-1440-durum-raporu.png`, `ekran/tur2-modern-koyu-zoom200-durum-raporu.png`, `betik/t03-sonuc.json` |
| UI-GRS-11 | önem değişmeli (K3 → K2) | Ölçüm aynı: koyuda `#AEAEB2`/`#636366` 2,71:1, açıkta 4,09:1. Ölçek < 3:1 metin için K2 diyor. Sayı ikincil değil: kaç kişi/bölüm olduğu yalnız orada yazıyor ve seçilen segmentte tam da en sönük hâle geliyor. Ölçekten sapmak için gerekçe göremedim. `betik/t02-sonuc.json` (`veriHavuzu_koyu`, `veriHavuzu_acik`) |

### Devir notlarına yanıt (bana yazılanlar)

- **Deniz 1 (Esc menüleri kapatmıyor):** doğrulandı. Raporlar ve Araçlar menüleri Esc ile kapanmıyor, ok tuşu da yok. UI-ERS-10'un kapsamı "tüm açılır menüler" olarak genişlemeli (Diğer araçlar, kart işlemleri, proje "Diğer", Raporlar, Araçlar).
- **Deniz 2 (renk körlüğü derinliği):** GRS-02, GRS-03 ve GRS-08 satırlarında yanıtlandı.
- **Deniz 3 (koyu pencerelerde odak ve sınır):** GRS-05 satırında ve yeni UI-ERS-15'te yanıtlandı.
- **Cem 1 (proje "Diğer" ve "Diğer araçlar" menüsü):** doğrulandı. Proje "Diğer" menüsü Enter ile açılıyor ama odak düğmede kalıyor; aşağı ok bir şey yapmıyor, Esc'ten sonra menü açık (`betik/t04-sonuc.json` → `digerMenu`). UI-ERS-10'a eklenmeli.
- **Cem 2 (kayıt geri bildirimi ekran okuyucuya ulaşıyor mu):** Görev ekleme, ayar uygulama ve kart taşıma duyurulmuyor (UI-ERS-09). Haftalık rapor sayfası açıldığında da kalıcı bir canlı bölge yok. Cem'in gördüğü `role=status` iletileri kayıt anında iletiyle birlikte ekleniyor; bazı ekran okuyucular böyle eklenen bölgeyi duyurmaz. Aşağıdaki "Düzeltmeler"e bakın.
- **Cem 3 (tarih alanı):** Klavyeyle Termin'e "11152026" yazınca değer `2026-11-15` oldu; klavyeyle tarih girişi çalışıyor. "mm/dd/yyyy" biçimi başsız Chromium'un arayüz dilinden geliyor (`navigator.language` tr-TR); ortam, bulgu değil.
- **Tolga 1 (Esc tutarsız):** UI-KRC-09 doğrulandı. Görev formuna "Yarım kalan görev adı" yazdım, Ctrl+K'ya bastım, tek Esc'e bastım: palet de form da kapandı, yazı kayboldu, odak `body`'ye düştü. Klasik görev penceresi ("Yeni Görev Ekle") Esc ile kapanmıyor; `role=dialog` yok, odak açan düğmede kalıyor. Modern "Diğer" için Cem 1'e bakın. Odak dönüşü: UI-ERS-06. `betik/t04-sonuc.json` (`krc09`), `betik/t07-sonuc.json` (`klasikForm`), `ekran/tur2-klasik-acik-gorev-penceresi.png`
- **Tolga 2 (klasik üst çubuk):** 1280 px'te sayfa 1520 px genişliyor, "Ayarlar" x=1434'te ekran dışında kalıyor. Tab ile 14. adımda ulaşılınca sayfa kayıp düğme görünür oluyor, yani klavyeyle erişilebiliyor. %200'de (640 px) klasik mobil düzene geçiyor, taşma yok. `ekran/tur2-klasik-acik-dizustu-ust-cubuk.png`, `betik/t06-sonuc.json`
- **Tolga 3 (filtre genişliği, dar ekran):** doğrulandı, dar ekranda daha ağır. Aşırı veriyle NEHİR › Liste'de "Atanan kişi" seçimi 375 px telefonda ve 640 px'te (%200) 1222 px; sayfa 1238–1246 px'e çıkıyor ve yatay kayıyor. "Herkes" kutusu ekranın sağından taşıyor, oku görünmüyor (WCAG 1.4.10). Yalnız aşırı veride oluştuğu için K3'te kalmasını öneriyorum. `ekran/tur2-modern-acik-asiri-telefon-liste.png`, `betik/t07-sonuc.json`
- **Tolga 4–5 (tarayıcı geri, çevrimdışı):** bütçe nedeniyle denenmedi; çevrimdışı benim şeridimin dışında.

### Tur 1 bulgularımın yeniden üretimi ve ölçüm düzeltmesi

- **UI-ERS-13 (yalnız yazı %200):** ikinci kez üretildi. Portföy'de `main` içindeki 49 metnin yazı boyutu dağılımı `html { font-size: 200% }` öncesinde ve sonrasında birebir aynı (hepsi px). Proje sayfasında h1 34 px'te kalıyor, kenar çubuğu etiketleri 16 → 32 px büyüyüp kırpılıyor ("Ekip ve tahsis", "Risk raporu", "Haftalık rapor"…). `ekran/tur2-modern-yazi200-portfoy.png`, `ekran/tur2-modern-yazi200-proje.png`, `betik/t06-sonuc.json`
- **Dokunma hedefleri (yeni `dokunmaHedefleri` ile):** 375 px Portföy'de 21 görünür hedef var, 19 ekran dışı (kapalı çekmece) artık sayılmıyor. 4 hedef küçük ve hepsi 40 px yüksekliğindeki segment düğmeleri; Tur 1 kısa notu geçerli. Tur 1'deki "Ara 239×40" ölçümü yanlış pozitifti (çekmece içi) ama bulgulara girmemişti. `betik/t07-sonuc.json`

## Yeni bulgular

### UI-ERS-15 · Bilgi pencerelerinde (Durum raporu, Sağlık skoru, Görev ayrıntısı, Proje bilgileri) odak arkada kalıyor: pencereye girmek için 3–52 Tab
- Önem: K2
- Ekran: proje › "Durum raporu", "Sağlık skoru nasıl hesaplanır?", görev ayrıntısı (Genel bakış › Yaklaşan terminler satırı); Portföy › "…: proje bilgileri"          Arayüz: modern
- Koşul: sistem teması=koyu ve açık · uygulama ayarı=Gece ve Gündüz · renk teması=classic
         ekran=1440×900 ve 640×400 (%200 yakınlaştırma) · rol=py (Burak) · veri=pilot
- Adımlar: 1. PUSULA projesini aç. 2. 7 Tab ile "Durum raporu"na gel, Enter. 3. Tab'a bas.
- Beklenen: Pencere açılınca odak pencerenin içine (başlığa, "Kapat"a ya da metin kutusuna) geçer. Bu, aynı ailedeki "Yeni görev", "Yeni proje" ve "Profil değiştir" pencerelerinde böyle.
- Gözlenen (insan dili): Pencere açıldı, ama odak halkası karartmanın arkasında, "Durum raporu" düğmesinde kaldı. Tab'a bastıkça arka sayfadaki "Yeni görev", sekmeler, "Sağlık skoru…", kartlar, Riskler… geçti. Pencerenin ilk öğesine 33. Tab'da ulaştım. Koyu modda pencerenin kenarı da görünmediği için (GRS-05) odağın nerede olduğunu kestirmek iyice zor. Sağlık skoru penceresine 52, görev ayrıntısına 10, proje bilgilerine 3 Tab gerekti. Pencere `aria-modal="true"` olduğu için ekran okuyucu arka planı gizliyor; odak ise gizlenen arka planda duruyor, yani ekran okuyucu kullanıcısı hiçbir şey duymadan Tab'a basıyor. Esc pencereyi kapatıyor, odak `body`'ye düşüyor (UI-ERS-06). (WCAG 2.4.3 Odak sırası, 2.4.11 Odak gizlenmemeli)
- Kanıt: `betik/t03-sonuc.json` (koyu, 1440 ve %200: `durum.odak: "Durum raporu" DIŞ`, 10 Tab'ın 10'u dışarıda) · `betik/t04-sonuc.json` (koyu: `durumRaporu.iceriyeTab: 33`, `saglik.iceriyeTab: 52`, `profil.ilkOdak: İÇ`) · `betik/t09-sonuc.json` (açık: 33 / 52, `projeBilgileri.iceriyeTab: 3`, `yeniProje.ilkOdak: İÇ`) · `betik/t10-sonuc.json` (görev ayrıntısı: 10) · `ekran/tur2-modern-koyu-1440-durum-raporu.png` (halka arkadaki düğmede) · `ekran/tur2-modern-koyu-zoom200-durum-raporu.png`
- Olası kök neden: `components/modern/ui.tsx:39-47` (ortak `Sheet` açılışta odağı pencereye taşımıyor; yalnız içinde `autoFocus`lu alan olan formlar, ör. `components/modern/TaskFormSheet.tsx:149`, doğru çalışıyor) · `components/modern/sheets/StatusReportSheet.tsx:32`, `components/modern/HealthModelSheet.tsx:65`, `components/modern/TaskDetailSheet.tsx:75`
- Kapsam: arayüzün tamamı (autoFocus'suz bütün Sheet pencereleri)
- Doğrulama: aday · 3 kez üretildi (koyu 1440, koyu %200, açık 1440)
- Devir: Deniz: GRS-05 ile aynı pencereler; kenarlık düzeltilirken odak da birlikte düzeltilmeli. Cem: "durum raporunu kopyalayıp Teams'e yapıştır" işini yalnız klavyeyle denesin.

### UI-ERS-16 · Yönetim › Ayrıntılı analiz: 20 düğmenin adı yalnız "Aç", yıl seçimi etiketsiz, portföy tablosundaki satırlara klavyeyle girilemiyor
- Önem: K3
- Ekran: Yönetim › Ayrıntılı analiz ("Yönetim Ekranı"): Dikkat Gerektirenler, Proje Portföy Durumu          Arayüz: modern (eski bileşen)
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=mudur (Ahmet) · veri=pilot
- Adımlar: 1. Yönetim › "Ayrıntılı analiz". 2. Yıl seçiminden itibaren Tab'la ilerle ve her durakta duyulan adı not et. 3. Sayfanın altındaki "Proje Portföy Durumu" tablosuna Tab ile ulaşmayı dene.
- Beklenen: Her düğmenin adı neyi açtığını söyler ("Aç: PUSULA Saha Mobil Uygulaması, bütçe aşımı"). Yıl seçiminin etiketi vardır. Fareyle tıklanınca projeyi açan tablo satırı klavyeyle de açılır.
- Gözlenen (insan dili): Yıl seçiminde ekran okuyucu yalnız "2026, açılan kutu" diyor; neyin yılı olduğu yok. Ardından "Anlık Görüntü Al", "Brifing", "Yönetici Paketi", "Sunum" ve sonra art arda yirmi kez "Aç, düğme". Düğmelerde yalnız `title="Projeyi aç"` var; ad yine "Aç", hangi projeyi ya da hangi uyarıyı açtığı söylenmiyor. Ekran okuyucunun düğme listesinde 20 aynı "Aç" görünüyor. Sayfanın altındaki "Proje Portföy Durumu" tablosunda satıra fareyle tıklayınca proje açılıyor; 160 Tab boyunca odak tek bir satıra bile gelmedi (satırlarda `tabindex` yok, içlerinde odaklanabilir öğe yok). (WCAG 2.4.6 Başlıklar ve etiketler, 2.4.4 Bağlantı amacı, 3.3.2 Etiketler, 2.1.1 Klavye)
- Kanıt: `betik/t08-sonuc.json` (açık: `ayniAd: ["Aç ×20"]`, `etiketsiz: select`) · `betik/t11-sonuc.json` (koyu: `acDugmeleri.sayi: 20`, `title: "Projeyi aç"`, `aria: null`; `srTur` 5–9: "Aç") · `betik/t12-sonuc.json` (5 satır, `tabindex: null`, `tabIleSatiraGelen: 0`) · `ekran/tur2-modern-koyu-ayrintili-ac-odak.png`, `ekran/tur2-modern-acik-ayrintili-portfoy-tablosu.png`, `ekran/tur2-modern-acik-yonetim-ayrintili.png`
- Olası kök neden: `components/ExecutiveView.tsx:252` (düğme metni "Aç", bağlam yalnız `title`te) · `:180` (yıl `select`inde `aria-label`/`label` yok) · `:654` (`<tr onClick>`, `tabindex`/klavye işleyicisi yok; aynı desen `:519`)
- Kapsam: tek ekran (modern ve klasik Yönetim ekranında aynı bileşen)
- Doğrulama: aday · 2 kez üretildi (açık ve koyu)
- Devir: Cem: müdürün "bütçe aşımı olan projeyi aç" işini ekran okuyucu adlarıyla değerlendirsin.

### Kısa notlar (Tur 2)

- K4 · Eski ekran düğmelerinde (Ayrıntılı analiz üst düğmeleri) odak halkası rengi geçişle geliyor. Tab'dan ~0,1–0,2 sn sonra "Sunum (PPT)" halkası `#8AB9EC`, "Yönetici Paketi" `#4E95E3` (zemin `#F2F2F7`; ölçüm anında 1,07–1,9:1). Hızlı Tab'da halka bir an soluk. `betik/t05-sonuc.json`, `ekran/tur2-modern-acik-ayrintili-odak-sunum.png`
- K4 · Kapasite–talep tablosunda 14 sütun başlığı (`th`) var ama satır başlığı yok. Ekran okuyucu bir hücrede "0"ı yalnız ay adıyla duyuyor; "Personel Açığı / Test Mühendisi" bağlamı yok. `betik/t08-sonuc.json` (`kapasiteTablo`)
- K4 · Ayrıntılı analizde `h1` yok (en üst başlık h2 "Yönetim Ekranı"). Aylık Plan grafiğinin SVG'sinin adı yalnız ilk çubuğun değeri ("Oca Plan: 13,1 AA"). `betik/t08-sonuc.json`
- K4 · Komut paleti `role="dialog"` ama `aria-modal` yok (Durum raporu ve rehberde var). `betik/t03-sonuc.json`
- Geçti · Modern odak halkası dört renk teması × açık/koyu temada dış zeminle 4,24–10,78:1 (aktif menü, "Yeni proje", seçili segment). `betik/t05-sonuc.json`, `ekran/tur2-modern-*-orange-odak-*.png`, `ekran/tur2-modern-*-emerald-odak-*.png`

### Düzeltmeler (Tur 1)

Geri çektiğim bulgu yok. Bir bulgunun başlığı daralmalı:

- **UI-ERS-09:** başlıktaki "uygulamada canlı bölge yok" fazla genel. Haftalık raporda kayıt ve gönderme iletileri `role=status` ile çıkıyor (Cem). Doğru ifade şu: "Görev ekleme, ayar uygulama ve kart taşıma duyurulmuyor; sayfa açılışında kalıcı canlı bölge yok, haftalık rapordaki durum iletileri iletiyle birlikte ekleniyor." Önem K3 kalır.

## Önem itirazları

- **UI-ERS-02 (Cem: K2 → K3): katılmıyorum, K2 kalsın.** 1280 px bir ekranı %200 büyüten her kullanıcı 640 px'e, yani bu kipe düşüyor. Bu kullanıcı her sayfada 18–19 durak boyunca odağı göremiyor ve görmediği bir öğede Enter onu beklemediği bir ekrana götürüyor (Cem de bunu üretti). Bu, "yanlış anlamaya yol açıyor" tanımına giriyor.
- **UI-ERS-05 (Cem: K2 → K3): katılıyorum, K3.** Aynı ekrandaki "Yüksek riskler" listesi, "Yüksek risk 2" kartı ve "2 Yüksek" sayacı bilgiyi renksiz veriyor, iş tamamlanıyor. GRS-08'in risk matrisi kısmı da bu bulguyla K3 olarak birleşmeli.
- **UI-ERS-07 (Cem: K3 → K4): katılıyorum, K4.** Yeni görev formunda iş kaçışa gerek kalmadan bitiyor. Odak tuzağı olmayan pencerenin ağır sonucu, yani odağın pencereye hiç girmemesi, UI-ERS-15'te K2 olarak ayrıca yazıldı.
