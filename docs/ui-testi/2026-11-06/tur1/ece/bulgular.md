# Ece (ui-erisim) · Tur 1 bulguları · koşu 2 · 2026-11-06

Kod: `claude/zealous-tesla-hidbc9@8fb563d` · Arayüz: modern · Veri: pilot (+ `veri/risk-yuksek.json`: ATLAS'ta P5×E4, PUSULA'da P4×E4)
Betikler: `betik/r01…r09` (yeniden sınama), `betik/d01…d15`, `k01` (keşif) · 28 çalıştırma · Odak çizelgeleri: `odak-sirasi/` · Ekran görüntüleri: `ekran/`
Yeniden sınama ayrı dosyada: [`regresyon.md`](./regresyon.md) (16 bulgu: düzeldi 11, kısmen 5).

## Koşu özeti

Yeni bulgu: **10** (K1: 0 · K2: 4 · K3: 6) + kısa notlar. Kimlikler UI-ERS-17…26.

İlk izlenim: Ayarlar, Yeni görev ve bilgi pencereleri artık "doğru pencere" gibi davranıyor; Tab içeride dönüyor, Esc kapatıyor, odak açan düğmeye dönüyor. Bu düzen eski pencerelere (Bulut eşitleme, Hakkında) ve bazı menülere ulaşmamış. En çok takıldığım yer, büyütülmüş ve dar ekranda yapışkan şeritlerin, sabit sütunların odağı örtmesi oldu. Tahsis tablosu, ekran okuyucuyla da büyüteçle de neredeyse kör kullanılıyor.

### Üç gerçek iş, yalnız klavyeyle

| İş | Tab sayısı (sayfa açılışından) | Ek tuş | Ekran okuyucunun duyduğu | Takıldığım yer |
|---|---|---|---|---|
| Görev oluştur (PUSULA, Yüksek öncelik, termin) | **47** (projeye 12, "Yeni görev"e 8, "Yüksek"e 7, Termin'e 6, "Görevi ekle"ye 14) | Space, Enter, rakamlar | "Yeni görev, iletişim kutusu", "Görev adı, düzenleme", "Yüksek, düğme, basılı", ekledikten sonra "…" görevi eklendi" (kalıcı `status`) | Yok: odak "Yeni görev"e döndü, form içinde 29 durakta dönüyor |
| Görevi düzenle (Liste → ara → satır → Düzenle → Kaydet) | **17** + Düzenle'ye 7 + Kaydet'e 29 | Enter | "Görev, iletişim kutusu", "Görevi düzenle, iletişim kutusu", "…görevi kaydedildi" | Kaydet sonrası odak `body`; sonraki Tab sayfanın başı (UI-ERS-06 kısmen) |
| Tahsis hücresi düzenle (Burak, NEHİR, Tahsis tablosu) | **32** (Ekip ve tahsis 4, Görünüm 18, ilk açık hücre 10) | ↓ (görünüm seçimi), yazma | Hücre adı yalnız aşım hücresinde ("Aşırı tahsis: Aslı Çakır Oca toplamı 0,7 / kapasite 0,5"); 84 açık hücrenin 71'inde yalnız "0,4, döndürme kutusu" | UI-ERS-18, 19, 22, 23 |
| Haftalık raporu yaz ve gönder (Burak, PUSULA) | **45** (Haftalık rapor 7, proje satırı 16, Madde ekle 3, Plan ekle 1, puan 7, Kaydet 10, Gönder 1) | Enter, Tab ile menü | Rehber "iletişim kutusu"; "Madde ekle, menü açık"; "7 / 10, basılı"; "Kaydedildi." ve "Bölüm sorumlusuna gönderildi." yeni eklenen `status` içinde | Madde ekle menüsünde oklar/Esc yok (ERS-10 kısmen), Kaydet/Gönder sonrası odak `body` (ERS-06 kısmen), telefonda ve %200'de alt şerit odağı örtüyor (UI-ERS-17) |

Çizelgeler: `odak-sirasi/modern-light-gorev-formu.md`, `modern-light-gorev-ayrinti.md`, `modern-light-tahsis-duzenleyici.md`, `modern-light-haftalik.md`, `modern-light-haftalik-editor.md`.

### Ekran × denetim

| Ekran | Klavye | Anlam (ARIA) | Yakınlaştırma / yazı %200 | Renk (körlük / yüksek karşıtlık) | Hareket | Cihaz (320 / 375 / 768 / 812×375) |
|---|---|---|---|---|---|---|
| Portföy | geçti (atlama bağlantısı yok, kısa not) | geçti | geçti (yazı 2×, yatay kaydırma yok) | geçti; 4 tema × 3 süzgeç durum yazılı | — | geçti; telefonda "Projeler" önce, 768/812'de "Dikkat gerektirenler" önce; segmentler 40 px |
| Çekmece / kenar çubuğu | geçti (ERS-02, 08 düzeldi) | geçti (`aria-expanded`) | yazı %200'de alt bölüm listeyi örtüyor | forced: aktif proje yalnız kalın (ERS-04 kısmen) | — | **sorun:** 812×375 UI-ERS-24 |
| Ayarlar | geçti (odak, Esc, dönüş) | anahtarlar geçti · **sorun:** radyo grupları UI-ERS-25 | geçti (640) | forced geçti | — | geçti (375) |
| Komut paleti | **sorun:** UI-ERS-21 | geçti (`aria-activedescendant`) | — | — | — | — |
| Proje Genel bakış / Liste / Pano | Pano kart menüsü ERS-10 kısmen; sekmelerde ok yok (kısa not) | geçti | geçti | 4 tema × döteranopi: renkler çöküyor ama her durum yazılı | — | geçti |
| Görev formu / ayrıntı / düzenle | geçti; düzenle-Kaydet odak (ERS-06 kısmen) | geçti | geçti | forced: pencere sınırı var | — | — |
| Ekip ve tahsis · Doluluk | geçti (tek durak + oklar) | `grid` rolü yok (kısa not) | **sorun:** hücre yazısı 13 px sabit (ERS-13 kısmen) | geçti (yüzdeler yazılı) | — | 375'te Ocak hücresi sabit sütunun altında (UI-ERS-18) |
| Ekip ve tahsis · Tahsis tablosu | **sorun:** UI-ERS-22, 23 | **sorun:** UI-ERS-19 | **sorun:** UI-ERS-18 | — | — | **sorun:** UI-ERS-18 (375) |
| Haftalık rapor | menü ERS-10 kısmen; Kaydet odak ERS-06 kısmen | duyuru ERS-09 kısmen | **sorun:** UI-ERS-17 | — | — | **sorun:** UI-ERS-17 (375); 320'de 10 px yatay kaydırma (kısa not) |
| Risk raporu / matris | geçti | geçti (düzey hücre adında ve harfte) | — | geçti (D/O/Y harfleri; renkler döteranopide hâlâ çakışıyor) | — | — |
| Yönetim / Ayrıntılı analiz | geçti (ERS-16 düzeldi) | `h1` yok (kısa not) | geçti (yazı 2×) | — | — | — |
| Bulut eşitleme, Hakkında | **sorun:** UI-ERS-20 | **sorun:** UI-ERS-20 | — | — | — | — |
| Kurtarma ekranı | geçti (3 durak, halka görünür) | geçti (`role=alert`, h1) | — | forced açık/koyu geçti; "Ham veriyi indir" sınırsız | geçti (animasyon yok) | — |
| Başka sekme bildirimi | geçti (odak "Burada kullan"da) | geçti (`role=alert`, h1) | — | forced açık/koyu geçti | geçti | — |
| Kayıt bildirimi (görev eklendi) | — | geçti (kalıcı polite `status`) | — | forced: çerçeveli kutu | geçti (yalnız 200 ms geçiş) | — |
| Hata ekranı | **denenemedi:** bozuk görev/risk kaydı uygulamayı düşürmedi (veri düzeltiliyor) | | | | | |

Odak halkası: dört renk teması × açık/koyu temada "Yeni görev" üzerinde 3 px, 2 px aralıklı halka görünüyor (`ekran/modern-*-odak-yeni-gorev.png`, `betik/d09-sonuc.json`).

---

### UI-ERS-17 · Haftalık rapor düzenleyicide yapışkan alt şerit, Tab'la gelinen düğmeleri tamamen örtüyor
- Önem: K2
- Ekran: Haftalık rapor › proje raporu düzenleyici (alt şerit: "Göndermeden önce… / Kaydet / Bölüm sorumlusuna gönder")          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=375×812 (mobil, dokunmatik) ve 640×400 (1280×800'ün %200'ü) · rol=py (Burak) · veri=pilot
- Adımlar: 1. Haftalık rapor'u aç, rehberi Esc ile kapat. 2. "PUSULA Saha Mobil Uygulaması" satırında Enter. 3. Tab'a basarak düzenleyicide ilerle.
- Beklenen: Odaklanan düğme ekranda görünür; sayfa onu şeridin üstüne kaydırır (`scroll-padding-bottom` ya da şerit kadar alt boşluk).
- Gözlenen (insan dili): Telefonda 4. Tab'da odak "Plan ekle"ye geçti ama ekranda hiçbir halka yok: düğme, ekranın altındaki "Göndermeden önce: 1 format hatası düzeltilmeli… Kaydet / Bölüm sorumlusuna gönder" şeridinin tam altında kaldı. 15. Tab'da "Akış geçmişi", 18. Tab'da "Excel/CSV içe aktar" da aynı biçimde kayboldu. Enter'a bassam görmediğim bir şeyi açacaktım. Telefonda şerit 139 px, ekranın %17'si; %200 yakınlaştırmada şerit 87 px, üstteki uygulama çubuğu 56 px, 400 px'lik ekranın üçte biri sabit. %200'de "Haftalık raporlar" (geri) düğmesi üst çubuğun altında, "Plan ekle", "Madde türü", "Maddeyi sil" alt şeridin altında kaldı. (WCAG 2.4.11 Odak gizlenmemeli (en az), 2.4.7 Odak görünür)
- Kanıt: `ekran/modern-375-haftalik-odak-ortulu-1.png` (odak "Plan ekle"de, şeridin altında, halka görünmüyor) · `ekran/modern-375-haftalik-odak-ortulu-2.png` · `ekran/modern-zoom200-haftalik-odak-ortulu-1.png` · ölçüm: `betik/d11-sonuc.json` (375: 22 Tab'da 3 tamamen örtülü; 640: 2 örtülü), `betik/d10-sonuc.json` (ilk üretim: 375'te 5, 640'ta 5 örtülü durak)
- Olası kök neden: `components/modern/weekly/ReportEditor.tsx:906-907` (`sticky bottom-3 z-30` şerit; sayfada şerit yüksekliği kadar `scroll-padding-bottom`/alt boşluk yok) · üst çubuk için aynı: `App.tsx` mobil başlık `sticky top-0`
- Kapsam: tek ekran (1024 px altı ve yakınlaştırma)
- Doğrulama: aday · 2 kez üretildi (d10 ve d11; her birinde 375 ve 640)
- Devir: Cem: telefonda haftalık raporu baştan sona yazma işini deneyebilir; şerit dokunarak kullanımda da içeriği örtüyor mu.

### UI-ERS-18 · Tahsis tablosunda sabit "Personel" sütunu, geri Tab'la gelinen hücreleri örtüyor: hangi aya yazdığımı göremiyorum
- Önem: K2
- Ekran: Ekip ve tahsis › Görünüm: Tahsis tablosu (ayrıca Doluluk ısı haritası, 375)          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=640×400 (%200) ve 375×812 (mobil) · rol=py (Burak); ısı haritası için mudur (Ahmet) · veri=pilot
- Adımlar: 1. Ekip ve tahsis'i aç, "Görünüm" seçiminde ↓ ile "Tahsis tablosu". 2. NEHİR tablosundaki ilk açık hücreye Tab (10 Tab). 3. 11–13 kez Tab ile Aralık'a git. 4. Shift+Tab ile Ocak'a geri dön.
- Beklenen: Odaklanan hücre kaydırılarak sabit sütunun sağında görünür.
- Gözlenen (insan dili): Geri gelirken tarayıcı hücreyi tablonun sol kenarına kaydırıyor; orada sabit "Aslı Çakır / U340 · Veri Bilimci" sütunu duruyor. %200'de 13 geri adımın 5'inde (Tem, Haz, May, Şub, Oca) hücre tamamen, 2'sinde yarı yarıya sütunun altında kaldı. Telefonda 11 adımın 11'inde de hücre sütunun altında. Ekranda yalnız komşu hücrenin kırmızı kenarı görünüyor; yazdığım değer görünmeyen hücreye gidiyor. Bu tabloda sayı yazmak işin kendisi; yanlış aya değer girmek çok kolay. Doluluk ısı haritasında telefonda Home ile Ocak'a gidince hücrenin sol yarısı da ad sütunun altında kaldı. (WCAG 2.4.11 Odak gizlenmemeli (en az))
- Kanıt: `ekran/modern-zoom200-tahsis-tablosu-geri-odak.png` (odak Ocak hücresinde, sabit sütunun altında) · `ekran/modern-375-tahsis-tablosu-geri-odak.png` · `ekran/modern-375-isi-home-odak.png` · ölçüm: `betik/d11-sonuc.json` → `tahsis640.geriTab` (5 TAMAMEN-ÖRTÜLÜ), `betik/d15-sonuc.json` → `t375.geri` (11/11 ÖRTÜLÜ), `betik/d11-sonuc.json` → `375.isi` (Home: KISMEN-ÖRTÜLÜ)
- Olası kök neden: `components/AllocationView.tsx:368,382` (`th`/`td` `sticky left-0`, kaydırma kabında sütun genişliği kadar `scroll-padding-left` yok) · ısı haritası: `components/modern/ModernAllocation.tsx:271,283` (`.m-sticky-col`)
- Kapsam: tek ekran (iki görünüm)
- Doğrulama: aday · 2 kez üretildi (640 ve 375, ayrı oturumlar)
- Devir: Tolga: yanlış hücreye yazılan değerin kalıcı olup olmadığını ve aşım uyarısının doğru kişiye gidip gitmediğini denesin.

### UI-ERS-19 · Tahsis tablosunda 84 açık hücrenin 71'i adsız, ay başlıkları başlık olarak tanınmıyor
- Önem: K2
- Ekran: Ekip ve tahsis › Tahsis tablosu (NEHİR, Taslak)          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 ve 375×812 · rol=py (Burak), mudur (Ahmet, salt okunur) · veri=pilot
- Adımlar: 1. Tahsis tablosuna geç. 2. Ekran okuyucuyla açık bir hücreye Tab (ör. Burak Demir, Ocak). 3. Erişilebilirlik ağacına bak.
- Beklenen: Hücre "Burak Demir, Ocak, plan, 0,4" gibi okunur (`aria-label` ya da `th scope="col"` + satır başlığı). Tablo sütun ve satır başlıklarını duyurur.
- Gözlenen (insan dili): Tab ile gelince ekran okuyucu yalnız "0,4, döndürme kutusu" diyor; kimin, hangi ayın, hangi projenin değeri olduğu yok. Yalnız kapasiteyi aşan hücreler `title` ile adlandırılmış ("Aşırı tahsis: Aslı Çakır Oca toplamı 0,7 / kapasite 0,5"); 84 açık hücrenin 71'inde ad yok. Sayfada 75 `th` var ama erişilebilirlik ağacında tek bir sütun başlığı (`columnheader`) yok: başlık satırı "hücre, Oca", "hücre, Şub" diye okunuyor, satırdaki kişi adı da satır başlığı değil. Ekran okuyucunun tablo gezinme komutları bile ay adını vermiyor. (WCAG 1.3.1 Bilgi ve ilişkiler, 4.1.2 Ad-rol-değer, 2.4.6 Etiketler)
- Kanıt: `betik/d15-sonuc.json` → `t375.columnheader: 0`, `rowheader: 0`, `basliklar.th: 75`, `adsizAcikHucre: "71/84"` · `betik/d02-sonuc.json` → `tablo[].th: 15, thScope: null` · `betik/d01-aria-duzenle.txt` satır 39–75 (`cell "Oca"`, `spinbutton [disabled]: "0.5"` adsız) · `betik/d02-aria-tablo.txt` · `ekran/modern-light-tahsis-hucre-odak.png`
- Olası kök neden: `components/AllocationView.tsx:196-215` (`cellInput`: `aria-label` yok, yalnız aşımda `title`) · `:365-368` (`th`'lerde `scope` yok; ağaçta `columnheader` çıkmıyor, tablonun ya da atasının CSS'i tablo anlamını düşürüyor olabilir: bilinmiyor)
- Kapsam: tek ekran (dört proje tablosu)
- Doğrulama: aday · 2 kez üretildi (d02 masaüstü, d15 telefon; Ahmet'in salt okunur görünümünde de aynı ağaç)
- Devir: Cem: ekran okuyucu kullanan bir bölüm sorumlusunun "Aslı'nın Ocak tahsisini düşür" işini bu adlarla değerlendirsin.

### UI-ERS-20 · "Bulut eşitleme" ve "Hakkında" pencereleri pencere değil: odak girmiyor, Tab arka sayfada, Esc kapatmıyor
- Önem: K2
- Ekran: Kenar çubuğu › Diğer araçlar › Bulut eşitleme ("Bulut Senkronizasyonu"), Hakkında ("PlanAsistan Hakkında")          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. "Diğer araçlar"a Tab, Enter (odak "Profil değiştir"de, iyi). 2. ↓ ↓ ile "Bulut eşitleme", Enter. 3. Tab'a bas. 4. Esc'e bas. 5. Aynısını "Hakkında" (↓ ↓ ↓) için yap.
- Beklenen: Ayarlar ve Profil değiştir'de olduğu gibi: `dialog`, odak pencerenin içinde, Tab içeride döner, Esc kapatır, odak "Diğer araçlar"a döner.
- Gözlenen (insan dili): Pencere açıldı ama odak hiçbir yerde değil (`body`). Tab'a basınca karartmanın arkasındaki Portföy'ün "Yeni proje", "NEHİR Veri Platformu — 26 görev terminini aştı"… düğmelerinde dolaştım; 8 Tab'ın 8'i de pencerenin dışında. Esc pencereyi kapatmadı. Arka plan erişilebilirlik ağacında açık; pencere ağaçta `dialog` olarak yok, ekran okuyucu bir pencere açıldığını duymuyor. İlk denemede Bulut penceresi açıkken klavyeyle arkadaki "Diğer araçlar"a ulaşıp Hakkında'yı da açtım: iki pencere üst üste kaldı. Bu, önceki koşudaki UI-ERS-01'in (Ayarlar) aynısı; düzeltme bu iki eski pencereye uygulanmamış. (WCAG 2.4.3 Odak sırası, 4.1.2 Ad-rol-değer, 2.1.1 Klavye)
- Kanıt: `ekran/modern-light-bulut-penceresi.png`, `ekran/modern-light-hakkinda-esc-sonra.png` (Esc sonrası pencere açık) · `ekran/modern-light-diger-araclar-4.png` (iki pencere üst üste) · `betik/d14-sonuc.json` (`dialogRol: []`, `odak: (body)`, `tab` 6/6 dışarıda, `esc.katman: 1`, `arkaPlanErisilebilir: true`) · `betik/d13-sonuc.json`, `betik/d12-sonuc.json` (ilk üretimler: `disari: 8`) · `betik/d14-aria-bulut.txt`, `betik/d14-aria-hakkinda.txt`
- Olası kök neden: `components/CloudSyncModal.tsx:150` ve `components/AboutModal.tsx:10` (düz `div.fixed`; `role="dialog"`, `aria-modal`, ilk odak, odak tuzağı, Esc ve odak dönüşü yok; modern `Sheet` kullanılmıyor)
- Kapsam: iki pencere (her iki arayüzde aynı bileşenler kullanılıyorsa tüm arayüzler)
- Doğrulama: aday · 3 kez üretildi (d12, d13, d14)
- Devir: Tolga: üst üste açılan iki pencerede Bulut "Kaydet"/"Şimdi Gönder" ile arkadaki pencerenin etkileşimi. Cem: Hakkında içeriği güncel değil ("Local Storage", "GitHub'da Nasıl Yayınlanır?").

### UI-ERS-21 · Komut paletinden Tab ile arka sayfaya çıkılıyor, palet açık kalıyor ve Esc artık kapatmıyor; Esc ile kapanınca odak kayboluyor
- Önem: K3
- Ekran: Komut paleti (Ctrl+K)          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Sistem ve Gece · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. Portföy'de "Yeni proje"ye odaklan, Ctrl+K. 2. Esc → odak nerede? 3. Yeniden Ctrl+K, bu kez Tab (ya da Shift+Tab). 4. Esc.
- Beklenen: Palet modal: Tab arama kutusunda kalır (ya da sonuçlarda döner); Esc her durumda kapatır; odak "Yeni proje"ye döner.
- Gözlenen (insan dili): Ctrl+K ile palet açılıyor, odak arama kutusunda; ok tuşlarıyla seçilen sonuç artık okunuyor (ERS-14 düzeldi). Ama Esc'le kapatınca odak `body`'ye düştü, "Yeni proje"ye dönmedi. Palet açıkken Tab'a basınca odak karartmanın arkasına, "PlanAsistan — ana ekrana dön", "Ara…", "Portföy" düğmelerine gitti; Shift+Tab'da arkadaki "NEHİR Veri Platformu: proje bilgileri"ne. Palet ekranda açık durmaya devam etti; bu durumda Esc'e bastım, palet kapanmadı (Esc yalnız arama kutusunda dinleniyor). Paletin köşesinde "Esc" ipucu yazdığı için kafam karıştı. `aria-modal` olmadığı için ekran okuyucu arka planı da okuyor. (WCAG 2.4.3 Odak sırası, 2.1.2'nin tersi: kaçış var ama dönüş yok; ARIA APG modal dialog)
- Kanıt: `ekran/modern-gece-palet-disari-esc.png` (palet açık, odak halkası arkadaki "…" düğmesinde) · `betik/r01-sonuc.json` → `paletTab` (açık ve koyu: 1. Tab `(body)`, 2. Tab "PlanAsistan…"; `paletEsc.pencere` hâlâ açık) · `betik/r08-sonuc.json` → `paletShiftTab`, `paletShiftTabEsc.acik: 1`, `paletEsc: (body)` · `betik/d14-sonuc.json` → `paletEsc: (body)` (Yeni proje'den açıldı)
- Olası kök neden: `components/CommandPalette.tsx:93-97` (Esc yalnız girdinin `onKeyDown`'ında), `:109-110` (dış kap `div.fixed` + `role="dialog"`; `aria-modal`, odak tuzağı ve açılıştaki odağı saklayıp geri verme yok)
- Kapsam: tek bileşen
- Doğrulama: aday · 3 kez üretildi (r01 açık/koyu, r08, d14)
- Devir: Tolga: palet açıkken arkadaki düğmeye Tab+Enter ile ikinci pencere açma (palet + Ayarlar/Proje bilgileri üst üste).

### UI-ERS-22 · Tahsis tablosunda ok tuşları hücre değiştirmiyor, değeri değiştiriyor ve değişiklik sessizce uygulanıyor
- Önem: K3
- Ekran: Ekip ve tahsis › Tahsis tablosu          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 ve 375×812 · rol=py (Burak) · veri=pilot
- Adımlar: 1. Doluluk ısı haritasında hücreler arasında oklarla gez (çalışıyor). 2. Görünüm'ü "Tahsis tablosu" yap. 3. Bir hücreye Tab, ↓ (ya da ↑) bas.
- Beklenen: Aynı ekranın iki görünümünde oklar aynı işi yapar ya da tabloda ok tuşu değeri değiştiriyorsa bu açıkça söylenir; değişiklik duyurulur, geri alınabilir.
- Gözlenen (insan dili): Isı haritasında oklarla gezmeyi öğrendim; tabloda da sağ oka bastım, hiçbir şey olmadı, aşağı oka bastım: Aslı Çakır'ın Ocak değeri 0,6'dan 0,55'e indi. İkinci denemede iki kez yukarı ok 0,7'yi 0,8'e çıkardı. Aşım iletisi hemen "toplamı 0,8" diye güncellendi, yani değer uygulandı; ama ne ekranda ne canlı bölgede bir "kaydedildi/değişti" duyurusu var. Yanlışlıkla bastığım okla birinin tahsisini değiştirdim ve fark etmedim. (WCAG 3.2.2 Girişte değişiklik, 4.1.3 Durum iletileri; tutarlılık 3.2.4)
- Kanıt: `betik/d02-sonuc.json` → `tabloOk` ("ArrowDown → … toplamı 0,55"), `enterSonra.duyuru: []` · `betik/d15-sonuc.json` → `t375.okSonra` (`once: 0.7`, `sonra: 0.8`, duyuru yok) · `ekran/modern-light-tahsis-hucre-sonra.png`
- Olası kök neden: `components/AllocationView.tsx:201-210` (`<input type="number" step={0.05}>` + her `onChange`'de `onSetCell`; ok tuşları tarayıcının sayı adımına gidiyor, duyuru yok)
- Kapsam: tek ekran
- Doğrulama: aday · 2 kez üretildi (d02, d15)
- Devir: Tolga: fare tekerleğiyle aynı kaza (odaklı sayı alanında teker) ve değişikliğin depoya yazılıp yazılmadığı. Cem: tahsis değişikliğinin geri bildirimi.

### UI-ERS-23 · "Tahsisi düzenle"den sonra odak kayboluyor; seçtiğim kişinin satırına değil başka projenin "Kilidi Aç"ına gidiyorum
- Önem: K3
- Ekran: Ekip ve tahsis › Doluluk › ayrıntı paneli › "Tahsisi düzenle"          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=mudur (Ahmet) · veri=pilot
- Adımlar: 1. Isı haritasında oklarla bir kişiye (ör. Burak Demir ya da Cem Bulut, Kasım) gel, Enter. 2. "Tahsisi düzenle"ye Tab (19–21 Tab), Enter. 3. Tab.
- Beklenen: Görünüm tabloya geçer ve odak seçilen kişinin satırına (ya da o kişinin Kasım hücresine) gider; ekran okuyucu yeni görünümü duyurur.
- Gözlenen (insan dili): Görünüm "Tahsis tablosu"na geçti ama odak `body`'ye düştü. İlk Tab beni ATLAS tablosunun "Kilidi Aç" düğmesine götürdü; seçtiğim kişi başka bir projenin tablosunda, ekranda çok aşağıda. Ekran okuyucu görünüm değişikliğini duyurmadı, hangi tablonun açıldığını bilmiyorum. (WCAG 2.4.3 Odak sırası, 3.2.2 Girişte değişiklik)
- Kanıt: `betik/d01-sonuc.json` → `duzenleAcinca.odak: (body)`, `duzenleTur` 1. "Kilidi Aç" · `betik/d15-sonuc.json` → `ahmet.sonra.odak: (body)`, `gorunum: "Tahsis tablosu"`, `sonrakiTab[0]: "Kilidi Aç"` · `ekran/modern-light-tahsisi-duzenle-sonra.png`, `odak-sirasi/modern-light-tahsis-duzenleyici.md`
- Olası kök neden: `components/modern/ModernAllocation.tsx:151-156` (`editInGrid` görünümü ve süzgeci değiştiriyor; odağı kişinin satırına taşımıyor, düğme kaybolunca odak düşüyor)
- Kapsam: tek ekran
- Doğrulama: aday · 2 kez üretildi (d01 Burak satırı, d15 Cem Bulut satırı)
- Devir: Cem: "Tahsisi düzenle" kişinin birimine süzüyor ama tablo projeye göre; müdür doğru satırı bulabiliyor mu.

### UI-ERS-24 · Yatay telefonda (812×375) çekmecenin alt bölümü menü öğelerini örtüyor; Tab'la gelinen "Haftalık rapor" görünmüyor
- Önem: K3
- Ekran: Çekmece (1024 px altı); ayrıca kenar çubuğu, yazı %200 (1280×800)          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=812×375 (mobil, dokunmatik); 1280×800 + tarayıcı yazı boyutu 32 px · rol=bolum_sorumlu (Selin), mudur (Ahmet) · veri=pilot
- Adımlar: 1. Telefonu yatay tut, ☰ "Menüyü aç"a dokun. 2. Menüye bak; sonra klavyeyle Tab ile aşağı in.
- Beklenen: Menü listesi kendi alanında kayar; alt bölüm ("Asistan", profil, Diğer araçlar, Ayarlar) listeyi örtmez; Tab'la gelinen öğe görünür.
- Gözlenen (insan dili): Çekmecede yalnız "Portföy" ve "Ekip ve tahsis" görünüyor; "Takvim"in simgesinin üst kenarı "Asistan"ın arkasından görünüyor. Takvim, Risk raporu ve Haftalık rapor alt bölümün altında; Görüşmeler, Beklentiler, Veri havuzu ve projeler ekranın dışında. Bütün çekmece kayıyor (tekerle/kaydırarak öğeler gelir), ama ilk bakışta menü 2 öğeden ibaret sanılıyor. Tab ile "Haftalık rapor"a geldiğimde odak alt bölümün altında kaldı, halka görünmedi. Masaüstünde yazıyı %200 yapınca aynısı: "Veri havuzu" "Asistan"ın altında. (WCAG 2.4.11 Odak gizlenmemeli, 1.4.10 Yeniden akış)
- Kanıt: `ekran/modern-812x375-cekmece-klavye.png` (odak "Haftalık rapor"da, görünmüyor) · `ekran/modern-812x375-cekmece-acik.png` · `ekran/modern-812x375-gezinme-teker-sonra.png` · `ekran/modern-yazi200-isi-haritasi.png` (sol: "Beklentiler" kırpık) · ölçüm: `betik/d13-sonuc.json` → `812x375.once` (Takvim "örtülü(Asistan)", Haftalık rapor "örtülü(SK Selin Kaya)", 7 öğe ekran dışı; `nav` 375/880 px kayıyor), `yazi200-1280.once` (Veri havuzu örtülü) · `betik/d12-sonuc.json` → `yatay.tur` (Haftalık rapor y=324, alt bölümün altında)
- Olası kök neden: `components/modern/ModernSidebar.tsx:183` (tüm `nav` `overflow-y-auto`) ve `:260` (alt bölüm `sticky -bottom-4 … m-surface`: listenin üstüne biniyor; listede alt bölüm kadar `scroll-padding-bottom` yok)
- Kapsam: arayüzün tamamı (kısa yükseklikli ekran ve büyük yazı)
- Doğrulama: aday · 2 kez üretildi (d12, d13; ayrıca d06'da görüntü)
- Devir: Deniz: alt bölüm ile liste arasındaki ayrım (gölge/kenar) kaydırıldığını belli etmiyor.

### UI-ERS-25 · Ayarlar'da "Görünüm" ve "Arayüz" radyo grupları ok tuşlarıyla çalışmıyor; renk teması düğmeleri seçimi söylemiyor
- Önem: K3
- Ekran: Ayarlar › Arayüz (Klasik/Modern), Görünüm & Temalar (Sistem/Gündüz/Gece), renk teması (Gök Mavisi…)          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. Ayarlar'ı aç, Tab ile "Sistem"e gel. 2. → (sağ ok) iki kez, sonra Space. 3. "Değişiklikleri Uygula".
- Beklenen: Ekran okuyucu "Sistem, radyo düğmesi, seçili, 1/3" diyor; bu rol için oklar seçimi Gündüz → Gece'ye taşır, grup tek Tab durağıdır. Renk teması düğmeleri seçili olanı söyler (`aria-pressed` ya da radyo grubu).
- Gözlenen (insan dili): "Radyo düğmesi" duyduğum için sağ oka bastım: odak "Sistem"de kaldı, seçim değişmedi. Space'e basıp uyguladım; tema hâlâ açık (Gece'ye geçmedi). Gece'yi seçmenin yolu Tab ile her seçeneğe ayrı ayrı gidip Space'e basmak; beş radyo da ayrı Tab durağı (`tabIndex=0`). Altındaki dört renk teması düğmesi ("Gök Mavisi", "Zümrüt Ormanı"…) yalnız "düğme"; hangisinin seçili olduğu ağaçta yok, gözle yalnız açık mavi zeminle görülüyor. (WCAG 4.1.2 Ad-rol-değer, 2.1.1 Klavye; ARIA APG radio group)
- Kanıt: `betik/r08-sonuc.json` → `ayarlar.radyoTabIndex` (5 radyo `:0`), `okSag.odak: "Sistem"`, `uygula.htmlSinif: ""`, `zemin: rgb(242,242,247)` · `betik/r01-aria-ayarlar.txt` satır 50–62 (`radio "Sistem" [checked]`; `button "Gök Mavisi"` durumsuz) · `ekran/modern-light-ayarlar-gorunum-ok.png`, `ekran/modern-ayarlar-gece-uygulandi.png` (hâlâ açık)
- Olası kök neden: `components/SettingsModal.tsx:122-160` (`role="radio"` düğmelerde ok tuşu işleyicisi ve dolaşan `tabIndex` yok) · `:170-177` (renk teması düğmesi, seçim yalnız sınıfla)
- Kapsam: tek ekran
- Doğrulama: aday · 2 kez üretildi (r01 Tab turu + aria, r08 ok tuşu denemesi)
- Devir: —

### UI-ERS-26 · Haftalık raporda "Kaydet" ve "Gönder" sonrası odak kayboluyor ve iletiler sonradan eklenen bölgeye yazılıyor
- Önem: K3
- Ekran: Haftalık rapor › proje raporu düzenleyici          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot (PUSULA ve NEHİR)
- Adımlar: 1. Raporu yalnız klavyeyle doldur (bkz. iş tablosu). 2. "Kaydet"e Enter. 3. "Bölüm sorumlusuna gönder"e Enter.
- Beklenen: Odak düğmede kalır ya da durum iletisine gider; "Kaydedildi." ve "Gönderildi." sayfa açılışında var olan canlı bölgeden (uygulamada zaten kalıcı bir `status` var) duyurulur.
- Gözlenen (insan dili): "Kaydet"e basınca odak `body`'ye düştü; neyse ki sonraki Tab "Bölüm sorumlusuna gönder"e gitti. "Kaydedildi." yazısı, o anda sayfaya iletisiyle birlikte eklenen yeni bir `role=status` içinde çıktı; görev eklemede kullanılan kalıcı duyuru bölgesi boş kaldı. Gönderince sayfa listeye döndü, odak yine `body`; "Bölüm sorumlusuna gönderildi." de yeni eklenen bölgede. NVDA/Chrome gibi bazı birleşimler sonradan eklenip hemen dolan bölgeyi okumaz; ekran okuyucu kullanıcısı raporun gidip gitmediğini sayfayı baştan dinleyerek anlamak zorunda. Bu, önceki koşuda Tur 2'de düzeltme notu olarak yazdığım durumun aynısı; yeni ekranda da sürüyor. (WCAG 4.1.3 Durum iletileri, 2.4.3 Odak sırası)
- Kanıt: `betik/d05-sonuc.json` → `adim` ("Kaydet Enter: (body)", "Gönder Enter: (body)") · `betik/r08-sonuc.json` → `haftalik.kaydet.duyuru.canli: ["YENİ-BÖLGE(status): Kaydedildi."]`, `gonder.odak: (body)` · `ekran/modern-light-haftalik-kaydet-sonra.png`, `ekran/modern-light-haftalik-nehir-gonderildi.png`
- Olası kök neden: `components/modern/weekly/ReportEditor.tsx` (kayıt/gönderme iletisi koşullu render edilen yerel `role=status`; uygulamanın ortak duyuru bölgesi kullanılmıyor) · gönderimden sonra görünüm değişince odak hedefi yok
- Kapsam: tek ekran (UI-ERS-06 ve 09'un haftalık rapordaki kalıntısı; birleştirmede onlarla bağlanabilir)
- Doğrulama: aday · 2 kez üretildi (PUSULA d05, NEHİR r08)
- Devir: Cem: gönderimden sonra listeye dönüşte "gönderildi" bilgisini gören kullanıcı da görmüyor olabilir.

---

## Kısa notlar

- K4 · Proje görünüm sekmeleri (`tablist`) hâlâ ok tuşuyla geçilmiyor; her sekme ayrı Tab durağı (`betik/r03-sonuc.json` → `sekmeOkSag`).
- K4 · Atlama bağlantısı yok; proje sayfasına girince odak kenar çubuğunda kalıyor, "Yeni görev"e her seferinde 8 Tab (`betik/k01-sonuc.json`).
- K4 · Doluluk ısı haritası tek durak ve oklarla iyi çalışıyor, ama `grid`/`table` rolü yok; ekran okuyucu tarama kipinde 300 düğmeyi alt alta okuyor. Ctrl+Home ve PageDown etkisiz (`betik/d01-sonuc.json` → `oklar`).
- K4 · Yönetim › Ayrıntılı analizde `h1` yok; "Durum ayı" seçiminin etiketi seçenekleri de içine alıyor (`betik/r09-sonuc.json` → `sel`).
- K4 · 320 px'te bölüm sorumlusunun Haftalık rapor ekranı 330 px genişliyor: hafta seçici satırının "Sonraki hafta" düğmesi 10 px taşıyor (`betik/d12-sonuc.json` → `t320.tasan`; WCAG 1.4.10).
- K4 · Haftalık raporda "Bölüm sorumlusuna gönder" devre dışıyken Tab sırasında yok; nedeni ("Göndermeden önce: 1 format hatası…") düğmeye `aria-describedby` ile bağlı değil (`betik/d05-sonuc.json` → `gonderDugme`).
- K4 · Haftalık rapordaki proje satırına Enter'dan sonra düzenleyici açılıyor ama odak `body`'ye düşüyor; ekran okuyucu yeni ekranın başlığını duymuyor (`betik/d04-sonuc.json` → `projeAcinca`).
- K4 · Görev formunda Termin alanının 4. durağı (takvim simgesi) odak halkasız (`odak-sirasi/modern-light-gorev-formu.md` satır 16).
- K4 · Telefonda segment ve sekme düğmeleri 40 px, ısı haritası "kişi profili" düğmeleri 35 px yüksek (uygulama ölçüsü 44; WCAG 24 px geçiyor) (`betik/d06-sonuc.json`).
- K4 · Yüksek karşıtlıkta proje ekranındayken kenar çubuğundaki aktif proje yalnız kalın yazıyla ayrılıyor; "Yeni görev", "Durum özeti", "Ham veriyi indir" sınırsız (ERS-04 kısmen; `ekran/modern-forced-dark-proje.png`).
- K4 · Yazı %200'de kenar çubuğu simgeleri büyümüyor (px), etiketler büyüyor (`ekran/modern-yazi200-portfoy.png`).
- Geçti · Yeni ekranlar: başka sekme bildirimi (`role=alert`, h1, odak "Burada kullan"da) ve kurtarma ekranı (`role=alert`, 3 durak, onay kutusuyla korunan silme) yüksek karşıtlık açık/koyu ve hareketi azalt altında okunuyor; animasyon yok (`ekran/modern-forced-light-baska-sekme.png`, `ekran/modern-forced-dark-kurtarma.png`, `betik/d07-sonuc.json`).
- Geçti · Görev eklendi bildirimi forced-colors'ta çerçeveli; hareketi azalt açıkken yalnız 200 ms satır geçişi (`ekran/modern-forced-light-kayit-bildirimi.png`).
- Geçti · Dört renk teması × döteranopi/protanopi/tritanopi: Portföy ve proje Genel bakışta her durum (Riskli, gecikti, tamamlandı/süreçte) yazıyla da veriliyor; turuncu temada vurgu artık uyarı kırmızısından ayrı (koyu altın) (`ekran/modern-light-orange-*-proje-genel.png`).
- Geçti · Telefonda Portföy sırası: 320/375'te "Projeler" önce, 768 ve yatay 812'de "Dikkat gerektirenler" önce; ısı haritasında ad sütunu yatay kaydırmada sabit kalıyor (`betik/d06-sonuc.json` → `ekipYapiskan`).
- Denenemedi · Hata ekranı (ErrorBoundary): bozuk görev ve risk kayıtlarıyla proje açıldı, uygulama veriyi düzeltip çalıştı; ekranı tetikleyemedim (`betik/d08-sonuc.json`). Klasik arayüzde logo 7 tık denemesi logo yerine "Portföy" düğmesine gitti; klasik hareket denetimi yapılamadı.
- Ortam · `cdn-icons-png.flaticon.com` vekilde reddedildi (ortam kısıtı). Koşu sırasında kapsayıcı yeniden başladı; tarih 9 Kasım'a geçti, bu yüzden d11 sonrası görüntülerde haftalık rapor "46. hafta" görünüyor. Tarih alanının "mm/dd/yyyy" görünmesi başsız Chromium'un arayüz dilinden.
