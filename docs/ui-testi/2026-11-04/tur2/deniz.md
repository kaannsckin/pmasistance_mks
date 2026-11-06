# Deniz (ui-gorsel) · Tur 2 · çapraz saldırı

Kod: `claude/zealous-tesla-hidbc9` (ortak betik `caed25d`; uygulama kodu Tur 1 ile aynı) · port 4181 · 1440×900 · Chromium.
Koşum: 9 betik çalıştırması (`tur2/betik/t01`–`t09`). Ölçümler `tur2/olcum/t01`–`t09.json` altında, görüntüler `ekran/tur2-*.png` altında.
Not: Saat 2026-11-05'e geçtiği için bütün betikler `UI_TEST_GUN=2026-11-04` ile çalıştırıldı. Veri ve çıktılar Tur 1 dizininde kaldı.

**Özet:** Tolga'nın 12 bulgusunun 12'si doğrulandı; reddedilen ve üretilemeyen yok. Önem önerisi değişmedi. Yeni bulgu sayısı 6: K2: 1 · K3: 3 · K4: 2. Tur 1'den 1 devir notu geri çekildi; 1 kısa not düzeltildi.

## Doğrulama

Her satırdaki soru aynı: bozulan ekran nasıl görünüyor ve kullanıcı bir şeyin bozulduğunu görebiliyor mu?

| Bulgu | Karar | Gerekçe / kanıt |
|---|---|---|
| UI-KRC-01 (K1) | doğrulandı | Açık ve koyu sistemde üretildi (`meta.format=2` ve yenileme).<br>Depo: 5 proje / 24 kişi iken 1 proje / 0 kişiye düştü. `uiStyle: 'modern'` de kayboldu: modern kullanıcı birden klasik arayüzde açılıyor.<br>Ekranda 0 projeli klasik portföy ve turuncu "Kapsam için kişi seçilmeli" uyarısı var. Kullanıcı veri kaybı yerine bir rol ya da kişi seçimi sorunu görüyor; sorunu yanlış yerde arar.<br>Kanıt: `ekran/tur2-modern-acik-gunduz-classic-krc01-format2.png`, `ekran/tur2-modern-koyu-gece-classic-krc01-format2.png`, `tur2/olcum/t01.json` |
| UI-KRC-02 (K1) | doğrulandı | Koyu sistemde, iki sekmede: A'nın görevi depoya yazıldı (A:1). B'nin kaydından sonra A:0, B:1 oldu; A yenilenince kendi görevi listede yok.<br>Ekranın hiçbir yerinde uyarı, eşitleme belirtisi ya da "başka sekmede açık" rozeti yok. Kullanıcı kaybı ancak görevi ararken fark eder.<br>Kanıt: `ekran/tur2-modern-koyu-gece-classic-krc02-a-yenile.png`, `t02.json` → `krc02` |
| UI-KRC-03 (K2) | doğrulandı | Klasik koyuda çöp kutusuna çift tık: iki ayrı "Emin misiniz?" sorusu çıktı, iki görev silindi (100 → 98).<br>İki onay penceresi birebir aynı; görev adı yok. Ekranda yalnız "Görev Listesi (98)" sayısı değişiyor ve ikinci kartın kaybolduğu gözden kaçıyor.<br>Kanıt: `ekran/tur2-classic-koyu-gece-classic-krc03-sil-sonrasi.png`, `t03.json` → `klasik.silme` |
| UI-KRC-04 (K2) | doğrulandı | Koyu modda madde yazıp kenar çubuğundan Portföy'e geçince onay çıkmadı; geri dönünce madde yok.<br>Tek uyarı, sağ üstte küçük gri "Kaydedilmedi · Taslak" etiketi (13 px, ikincil gri). Kenar çubuğuna basan kullanıcı bunu görmez; ekranda göze çarpan bir kirli durum belirtisi yok.<br>Kanıt: `ekran/tur2-modern-koyu-gece-classic-krc04-taslak-yazildi.png`, `ekran/tur2-modern-koyu-gece-classic-krc04-geri-donunce.png`, `t03.json` → `krc04` (diyalog [], geriDonunce []) |
| UI-KRC-05 (K2) | doğrulandı | Klavyeyle `1,5` / `2.5` / `0.5` yazılınca alanlar anında `15` / `2` / boş gösteriyor; depoya `{best:15, avg:2, worst:0}` yazıldı.<br>Değişiklik ekranda görünüyor ama hiçbir işaret yok (kırmızı çerçeve ya da açıklama yok). "En iyi > En kötü" çelişkisi de işaretlenmiyor.<br>Kanıt: `ekran/tur2-modern-koyu-gece-classic-krc05-ondalik.png`, `t02.json` → `krc09_05` |
| UI-KRC-06 (K2) | doğrulandı | Açık ve koyu sistemde `proje-ciplak.json` yüklendi; "eklendi" uyarısından sonra ekranda hiçbir metin ve gezinme kalmadı.<br>Görsel ek: koyu sistemde ekran **beyaz değil, boş lacivert** (`#111827`, klasik gövde rengi). Kullanıcı bunu "uygulama yükleniyor" sanabilir; hata mesajı ya da yenileme önerisi yok. Başlıktaki "beyaz ekran" ifadesi "boş ekran" diye genelleştirilmeli.<br>Kanıt: `ekran/tur2-modern-acik-gunduz-classic-krc06-beyaz-ekran.png`, `ekran/tur2-modern-koyu-gece-classic-krc06-beyaz-ekran.png`, `t01.json` → `krc06-*` |
| UI-KRC-07 (K2) | doğrulandı | Koyu sistemde iki kez çevrimiçi yenileme, ardından çevrimdışı yenileme yapıldı. Tarayıcının kendi "İnternet bağlantısı yok" sayfası açıldı (`chrome-error://`); servis çalışanı 0, önbellek boş.<br>Uygulamanın bu durum için kendi ekranı yok.<br>Kanıt: `ekran/tur2-modern-koyu-gece-classic-krc07-cevrimdisi.png`, `t02.json` → `krc07` |
| UI-KRC-08 (K2) | doğrulandı | (a) Site verisi engelli ve (b) `people=null, allocations='x'` durumları, açık ve koyu sistemde üretildi.<br>Ekranda üst çubuk ve ortada sonsuza kadar dönen mavi simge var. Görsel ek: modern seçili olduğu hâlde kabuk **klasik**. Üst çubuktaki Portföy, Tahsis… sekmeleri etkin ve tıklanabilir görünüyor; bir şeyin bozulduğuna dair hiçbir işaret yok.<br>Normal açılışta klasik kabuk görünmüyor: ilk 1 sn'de 12 kare alındı ve ilk karede yalnız boş lacivert zemin vardı (`t07.json` → `acilisKareleri`). Yani klasik kabuk yalnız bu hata yolunda çıkıyor.<br>Kanıt: `ekran/tur2-modern-koyu-gece-classic-krc08b-meta-bozuk.png`, `ekran/tur2-modern-acik-gunduz-classic-krc08b-meta-bozuk.png`, `ekran/tur2-varsayilan-koyu-x-x-krc08a-depo-engelli.png`, `ekran/tur2-varsayilan-acik-x-x-krc08a-depo-engelli.png` |
| UI-KRC-09 (K3) | doğrulandı | Koyu modda form doluyken Ctrl+K ve tek Esc: palet de form da kapandı. Yeniden açınca ad boş.<br>Görsel ek: koyu modda palet formun üstünde, form da sayfanın üstünde **kenarsız siyah** katman. Hangi katmanın açık olduğu seçilmiyor; Esc'in neyi kapatacağını tahmin etmek zor. Bu durum UI-GRS-05'i (koyu modda pencere sınırı yok) üst üste pencerelere de genişletiyor.<br>Kanıt: `ekran/tur2-modern-koyu-gece-classic-krc09-palet-form-ustunde.png`, `ekran/tur2-modern-koyu-gece-classic-krc09-esc-sonrasi.png` |
| UI-KRC-10 (K3) | doğrulandı | Aşırı veride, açık ve koyuda: "Herkes" seçimi 1222 px; Tahsis'te "Tüm projeler" seçimi 1531 px. Sayfa genişliği: Liste 1526, Pano 1687, Tahsis 1835 px.<br>Koyu modda bu seçim, sayfanın sağ kenarına kadar uzanan gri bir şerit; filtre düğmesi gibi değil, bir bölüm ayırıcısı gibi okunuyor. Sağa kaydırınca yeni bir görsel sorun açılıyor (UI-GRS-13).<br>Kanıt: `ekran/tur2-modern-koyu-gece-classic-asiri-nehir-pano.png`, `ekran/tur2-modern-koyu-gece-classic-asiri-tahsis.png`, `t04.json` |
| UI-KRC-11 (K3) | doğrulandı | Klasik açık ve koyuda, pilot ve aşırı veride: sayfa PY'de 1600, müdürde 1660 px. Ekran dışında kalanlar: "⌘K", "Ayarlar", "Hakkında" (müdürde ayrıca kullanıcı ve yedek düğmeleri).<br>Görsel olarak iki temada da sağdaki son düğme kenarda yarıya kesik.<br>Kanıt: `ekran/tur2-classic-koyu-gece-classic-asiri-acilis.png`, `ekran/tur2-classic-acik-gunduz-classic-asiri-acilis.png`, `t06.json` → `*.baslik` |
| UI-KRC-12 (K3) | doğrulandı | Koyu modda NHRX-114 ve NHRX-144 başlıkları kartın sağından çıkıp sütun boşluğunu geçiyor ve komşu sütunun kartının altına giriyor. Siyah boşlukta beyaz yazı olduğu için açık temadan daha göze batıyor.<br>Aynı kusur Yönetim › Ayrıntılı analiz kartlarında da var: uzun kelime "Aç" düğmesinin altından geçip kart kenarını aşıyor (`ekran/tur2-modern-koyu-gece-classic-asiri-ayrintili.png`; ölçüm 405/499 px, `visible`). Uzun adlı projenin Genel bakış başlığı da ekranın sağından çıkıyor (`ekran/tur2-modern-koyu-gece-classic-asiri-uzun-ad-genel.png`, sayfa 1686 px).<br>Kanıt: `ekran/tur2-modern-koyu-gece-classic-asiri-nehir-pano.png`, `t08.json` |

## Yeni bulgular

### UI-GRS-13 · Yatay taşmada kenar çubuğu sayfayla birlikte kayıyor; koyu modda sağda lacivert bir şerit açılıyor
- Önem: K3
- Ekran: proje Liste, Pano, Ekip ve tahsis, uzun adlı projenin Genel bakış ekranı          Arayüz: modern
- Koşul: sistem teması=koyu (açıkta daha hafif) · uygulama ayarı=Gece · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) · veri=aşırı
- Adımlar: 1. Aşırı veriyle NEHİR › Pano'yu aç (sayfa 1687 px, bkz. UI-KRC-10). 2. Sayfayı sağa kaydır.
- Beklenen: Yatay kaydırma gerekiyorsa yalnız içerik bölgesi kaymalı; kenar çubuğu yerinde kalmalı ve zemin her yerde modern siyah (`#000000`) olmalı.
- Gözlenen (insan dili): Kenar çubuğu da sola kayıp kayboluyor; gezinme ve proje listesi ekrandan çıkıyor. Sağda, modern kökün bittiği yerde 250 px'lik **lacivert** bir şerit açılıyor (klasik arayüzün gövde rengi). Siyah ekranın yanında bu şerit bambaşka bir uygulamanın parçası gibi duruyor. Açık modda aynı şerit `#F9FAFB`; zeminden ancak seçiliyor.
- Kanıt: `ekran/tur2-modern-koyu-gece-classic-asiri-nehir-pano-saga-kaydir.png`, `ekran/tur2-modern-acik-gunduz-classic-asiri-nehir-liste-saga-kaydir.png` · ölçüm (piksel): koyuda içerik `#1C1C1E`/`#000000`, şerit `#111827` (x > 1193); açıkta içerik `#F2F2F7`, şerit `#F9FAFB` (x > 1354); kaydırma sonrası kenar çubuğunun yalnız 16 px'i görünüyor.
- Olası kök neden: `index.html:110` `body` için `dark:bg-gray-900` (klasik renk). Modern kök (`.ui-modern min-h-screen`) yalnız pencere genişliğinde. `components/modern/ModernSidebar.tsx:154` `lg:sticky top-0` yalnız dikeyde yapışıyor. Taşmanın kaynağı UI-KRC-10 / UI-KRC-12.
- Kapsam: arayüzün tamamı (modern; yatay taşan her ekran)
- Doğrulama: aday
- Devir: Tolga (`ui-kirici`), taşma kaynakları zaten onda; bu bulgu taşmanın görsel bedeli. Ece (`ui-erisim`), %200 yakınlaştırmada her ekran taşacağı için kenar çubuğunun kaybolması gezinmeyi keser.

### UI-GRS-14 · Klasik arayüzde kart tarihi, "Riskli" rozeti ve "Dışa Aktar" düğmesi okunmuyor (1,47–2,15:1)
- Önem: K2
- Ekran: klasik Portföy (proje kartları), proje › Görevler (araç çubuğu, alt sekme)          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=mudur, py · veri=pilot, aşırı
- Adımlar: 1. Klasik arayüzde, açık sistemde Portföy'e bak: kartın altındaki son güncelleme tarihi ve "Riskli" rozeti. 2. Görevler'e geç: sarı "Dışa Aktar" düğmesi. 3. Koyu sistemde seçili alt sekme "Görevler".
- Beklenen: Metin 4,5:1, düğme etiketi en az 4,5:1 olmalı; seçili sekme seçili olmayanlardan daha belirgin olmalı.
- Gözlenen (insan dili): Açık temada kart tarihleri beyaz zeminde neredeyse görünmüyor (açık gri). "Riskli" rozetinde sarı zemin üstünde beyaz yazı var; göz kısınca rozet boş bir sarı hap. Görevler'deki "Dışa Aktar" düğmesinde de sarı zeminde beyaz yazı var; yanındaki düğmeler okunurken bu silik. Koyuda seçili "Görevler" alt sekmesi mavi yazıyla, seçili olmayanlardan daha sönük. Tur 1'deki UI-GRS-04 klasik koyu temadaydı; bu bulgu klasik açık temayı ve düğmeleri kapsıyor.
- Kanıt: `ekran/tur2-classic-acik-gunduz-classic-portfoy.png`, `ekran/tur2-classic-acik-gunduz-classic-asiri-gorevler.png`, `ekran/tur2-classic-koyu-gece-classic-asiri-gorevler.png` · ölçüm: tarih `#D1D5DB`/`#FFFFFF` 1,47:1 (11 px); "Riskli" beyaz/`#F59E0B` 2,15:1 (11 px); "Dışa Aktar" beyaz/`#EAB308` 1,92:1 (iki temada); koyuda alt sekme "Görevler" `#2563EB`/`#1F2937` 2,84:1; "Excel'den Aktar" beyaz/`#16A34A` 3,30:1; alt başlık "Çoklu Proje & Program Yönetimi" `#9CA3AF`/`#F9FAFB` 2,43:1 · 2/2 üretildi (`t03.json`, `t09.json`).
- Olası kök neden: `components/PortfolioView.tsx:221` (`text-gray-300 dark:text-gray-600`); `components/TaskGallery.tsx` "Dışa Aktar" (`bg-yellow-500 text-white`); "Riskli" rozeti için `PortfolioView.tsx:42` amber eşlemesi ile beyaz yazı.
- Kapsam: arayüzün tamamı (klasik)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), renk körlüğü süzgecinde sarı rozet ve düğmeler.

### UI-GRS-15 · Klasik "Yeni Görev" penceresinin başlığı ve kapat düğmesi üst çubuğun altında kalıyor; koyu modda devre dışı alan beyaz bir blok
- Önem: K3
- Ekran: klasik proje › Görevler › Yeni Görev (Yeni Görev Ekle penceresi)          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Klasik arayüzde NEHİR › Görevler. 2. "Yeni Görev"e bas.
- Beklenen: Pencere, üst çubuk dahil bütün sayfanın üstünde açılmalı. Başlık ve kapat düğmesi görünmeli; arka plan, üst çubuk da dahil, karartılmalı.
- Gözlenen (insan dili): Pencere doğrudan "Görev Adı" alanıyla başlıyor; "Yeni Görev Ekle" başlığı ve × düğmesi üst çubuğun arkasında. Üst çubuk ve sağ alttaki mor yapay zekâ düğmesi karartılmıyor; parlak kalıyorlar. Pencere, sayfanın alt yarısına yapışmış bir panel gibi görünüyor. Koyu modda "Anahtar Sonuç" alanı (hedef seçilmeyince devre dışı) koyu pencerenin ortasında açık gri bir blok; içindeki "Sonuç Seçin" yazısı okunmuyor.
- Kanıt: `ekran/tur2-classic-acik-gunduz-classic-yeni-gorev-penceresi.png`, `ekran/tur2-classic-koyu-gece-classic-yeni-gorev-penceresi.png`, `ekran/tur2-classic-koyu-gece-classic-yeni-gorev.png` · ölçüm: üst çubuk alt kenarı y=110, z-index 50; pencere kaplaması z-index 40; başlık y=63, kapat düğmesi y=61, (720, 60) noktasında en üstteki öğe üst çubuk. Devre dışı seçim: zemin `#F3F4F6`, yazı `#F9FAFB` → ~1,05:1 · 2/2 üretildi (`t03.json`, `t09.json`); Cem de gözledi.
- Olası kök neden: `components/TaskFormModal.tsx:150` (`fixed inset-0 … z-40`) < `components/Header.tsx:304` (`sticky top-0 z-50`); `components/TaskFormModal.tsx:234` `disabled:bg-gray-100` için koyu karşılık yok (`inputStyle` `dark:text-gray-50`, `:48`).
- Kapsam: tek ekran (klasik `TaskFormModal`; z-40 kullanan başka klasik pencereler de etkilenebilir)
- Doğrulama: aday (gözlem Cem'den)
- Devir: Ece (`ui-erisim`), kapat düğmesi görünmüyorsa çıkış yolu yalnız "İptal" ve Esc kalıyor (Tolga'ya göre klasik formda Esc çalışmıyor).

### UI-GRS-16 · Klasik proje çubuğunda uzun proje adında "Zekâ" sekmesi "İş Paketleri"nin altına giriyor
- Önem: K3
- Ekran: klasik üst çubuk › proje alt çubuğu          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Klasik arayüzde PY olarak PUSULA Saha Mobil Uygulaması'nı seç (uzun ad; PY'de "İstekler" ve "Günlük" sekmeleri de var).
- Beklenen: Sekmeler sığmıyorsa daralmalı, kaymalı ya da "Diğer"e taşınmalı; üst üste binmemeli.
- Gözlenen (insan dili): "Zekâ" sekmesinden yalnız yıldız simgesi ve "Z" harfi görünüyor; geri kalanı "İş Paketleri"nin arkasında. Sekme okunmuyor ve tıklama alanı komşuyla çakışıyor. Kısa adlı NEHİR'de sorun yok; sorun proje adının uzunluğuna bağlı.
- Kanıt: `ekran/tur2-classic-koyu-gece-classic-pusula-proje-cubugu-yakin.png`, `ekran/tur2-classic-koyu-gece-classic-pusula-proje-cubugu.png`; Cem: `ui-testi/2026-11-04/cem/ekran/klasik-burak-gorev-02-gorevler.png` (açık) · ölçüm: "Zekâ" x=1061–1131, "İş Paketleri" x=1103–1207 → 28 px çakışma (`t06.json` → `koyu-pilot-burak.zeka`); NEHİR'de 995–1064 ile 1103 arasında çakışma yok (`t03.json`).
- Olası kök neden: `components/Header.tsx` proje alt çubuğu: sol sekme grubu ile sağdaki "İş Paketleri / Durum Raporu" grubu daralmıyor; proje seçici genişliği sabit değil.
- Kapsam: tek ekran (klasik proje çubuğu)
- Doğrulama: aday (gözlem Cem'den, Deniz üretti)
- Devir: Tolga (`ui-kirici`), aşırı uzun proje adı ve 1280 px'te kaç sekmenin kaybolduğuna baksın.

### UI-GRS-17 · Kenar çubuğunun alt düğmeleri açılınca kenar çubuğu 72 px kayıyor, logo görünümden çıkıyor; "Yedek al / yükle" kırpılıyor
- Önem: K4
- Ekran: modern kenar çubuğu › "Diğer araçlar" (…) menüsü ve Ayarlar düğmesi          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot
- Adımlar: 1. Kenar çubuğunun altında "…" (Diğer araçlar) düğmesine bas. 2. Menüyü kapat. 3. Ayarlar düğmesine bas.
- Beklenen: Menü açılınca sayfa yerinde durmalı; menü maddeleri tam okunmalı.
- Gözlenen (insan dili): Menü açılır açılmaz kenar çubuğunun içeriği yukarı kayıyor; "PlanAsistan" logosu ve ana ekran düğmesi görünümden çıkıyor, "Ara" kutusu en üste yapışıyor. Menü kapandıktan sonra da kayma kalıyor. Ayarlar düğmesi aynı kaymayı yapıyor (Tur 1'de de görüldü). Menüde "Yedek al / yükle" maddesi "Yede…" diye kırpılıyor, çünkü yanındaki "Admin kimliğiyle" eki yer kaplıyor.
- Kanıt: `ekran/tur2-modern-koyu-gece-classic-diger-araclar-menu.png`, Tur 1 `ekran/modern-acik-gece-classic-uygulandi.png` (Ayarlar sonrası logo yok), Cem: `cem/ekran/modern-ahmet-yonetim-01.png` · ölçüm: `nav.m-sidebar` `scrollTop` 0 → 72, logo y 19 → −53, içerik başlığı yerinde (y=57); "Yedek al / yükle" `scrollWidth > clientWidth` (`t07.json` → `digerAraclar`).
- Olası kök neden: `components/modern/ModernSidebar.tsx:154` (`h-screen … overflow-y-auto`): alttaki düğme odaklanınca ya da menü açılınca kaydırılabilir kenar çubuğu, menüyü görünür kılmak için kayıyor. Kesin neden bilinmiyor.
- Kapsam: tek bileşen (modern kenar çubuğu)
- Doğrulama: aday (gözlem Cem ve Ece'den, Deniz üretti)
- Devir: yok

### UI-GRS-18 · Bozuk açılış ve hata ekranlarında görsel hata durumu tasarımı yok: ekran ya boş ya "yükleniyor" ya da yanlış uyarı gösteriyor
- Önem: K4 (işlevsel etkisi UI-KRC-01/06/08'de sayıldı; bu bulgu yalnız görsel dili kapsıyor)
- Ekran: açılış; yedekten yükleme sonrası          Arayüz: modern seçili (görünen kabuk klasik)
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=py, admin · veri=pilot (bozulmuş)
- Adımlar: UI-KRC-01, UI-KRC-06 ve UI-KRC-08 adımları.
- Beklenen: Hata, kullanıcının seçtiği arayüz ve temada, ayrı bir durum olarak görünmeli: simge, başlık, ne olduğu, yapılabilecekler (yenile, yedekten yükle).
- Gözlenen (insan dili): Üç farklı arıza, üç farklı yanıltıcı görüntüyle çıkıyor. Hiçbiri "hata" gibi görünmüyor:
  - Boş lacivert ya da açık gri sayfa: arıza mı, yükleniyor mu?
  - Klasik kabuk ve sonsuz dönen simge, çalışır görünen sekmelerle: "biraz bekle" mesajı veriyor.
  - Klasik boş portföy ve turuncu "Kapsam için kişi seçilmeli" uyarısı: yanlış teşhis.

  Modern kullanıcı her üçünde de bir anda klasik arayüze düşüyor. Uygulamanın hiçbir yerinde ortak bir hata durumu bileşeni yok.
- Kanıt: `ekran/tur2-modern-koyu-gece-classic-krc06-beyaz-ekran.png`, `ekran/tur2-modern-koyu-gece-classic-krc08b-meta-bozuk.png`, `ekran/tur2-modern-koyu-gece-classic-krc01-format2.png` · ölçüm: `t01.json` → `ekran.modern: false` (üçünde de), `kok: theme-classic bg-gray-50 dark:bg-gray-900`.
- Olası kök neden: `App.tsx:191-224` açılış yolu; hata sınırı (ErrorBoundary) yok; ayarlar yüklenmeden kabuk klasik varsayılanla çiziliyor.
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Cem (`ui-akis`), hata metni ve kullanıcının beklediği eylem.

## Geri çekilenler

- **Tur 1 devir notu, Tolga #1 ("Boş veri setinde arayüz ve rol seçimi uygulanmıyor"): geri çekildi.** Neden ortak betikteki veri yükleme yarışıydı (`caed25d`). Düzeltilmiş `oturum()` ile boş veri seti modern arayüzde, müdür rolüyle ve 0 projeyle açılıyor (`ekran/tur2-modern-*-bos-*.png`, `tur2/olcum/t05.json` → `*-kok.modern: true`).
- **Tur 1 görüntüleri `ekran/modern-*-bos-*.png` (8 dosya) geçersiz.** Görüntüler klasik arayüzü gösteriyor. Yerlerine `ekran/tur2-modern-koyu-gece-classic-bos-*.png` ve `ekran/tur2-modern-acik-gunduz-classic-bos-*.png` (7 ekran × 2 tema) geçer. Modern boş durumlarda yeni görsel sorun yok: kontrast 0/24–0/440, yalnız bilinen segment sayacı (UI-GRS-11, 2,71:1).
- **Tur 1 kısa notu "Klasik açık temada küçük gri yazılar (boş veriyle ölçüldü)": geri çekilmedi, kaynağı düzeltildi.** Pilot veride aynı değerler yeniden ölçüldü (2,43:1, 2,31:1) ve not UI-GRS-14'e taşındı.
- Tur 1 bulgularından eski veri yükleme yarışına dayanan başka bulgu yok. UI-GRS-01 düzeltilmiş `oturum()` ile yeniden üretildi:
  - sistem açık + Gece → `html.dark`, `--m-bg #F2F2F7`;
  - sistem koyu + Gündüz → `--m-bg #000000`, depoda `isDarkMode=false`.

  Kaynak: `t03.json` → `grs01-*`. Tur 1'deki öbür bulgular pilot veriyle alındı; ayarlar (arayüz, renk teması) o koşullarda ekrana uygulanmıştı.

## Bana yazılan devir notları

| Kimden | Not | Sonuç |
|---|---|---|
| Cem 1 | Gece ayarı uygulanmıyor olabilir | UI-GRS-01 (Tur 1), düzeltilmiş betikle yeniden doğrulandı |
| Cem 2 | Klasik "Yeni Görev" penceresinin üstü başlık çubuğunun altında | doğrulandı → UI-GRS-15 |
| Cem 3 | Klasik proje çubuğunda "Zekâ" kesik | doğrulandı (yalnız uzun proje adında) → UI-GRS-16 |
| Cem 4 | Mor yapay zekâ düğmesi "Bölüm sorumlusuna gönder"i örtüyor | doğrulandı, küçük: düğme gönder düğmesinin sağ 4 px'ini ve yapışkan çubuğun köşesini örtüyor (`ekran/tur2-classic-koyu-gece-classic-pusula-haftalik-fab-yakin.png`, `t06.json` → `fab`). K4; Tolga'nın Tur 1 FAB notuyla birleşir. |
| Cem 5 | Modern Durum raporu penceresinde metin alanı 2 satır | UI-GRS-10 (Tur 1) ile aynı |
| Cem 6 | "Diğer araçlar" açılınca sayfa kayıyor, "Yede…" kesik | doğrulandı → UI-GRS-17. Kayan yalnız kenar çubuğu; içerik yerinde (h1 y=57 sabit). |
| Tolga 1 | Beyaz ekran, sonsuz yükleme, boş açılışı temalarda görüntüle | yapıldı → Doğrulama tablosu (KRC-01/06/08) ve UI-GRS-18 |
| Tolga 2 | Aşırı veride taşmalar | yapıldı → KRC-10/11/12 doğrulandı, UI-GRS-13 yeni |
| Tolga 3a | `isDarkMode=true` ama ekran açık | UI-GRS-01 |
| Tolga 3b | Tam sayfa görüntüde kenar çubuğu zemini 900 px'te bitiyor | bulgu değil: kenar çubuğu `h-screen lg:sticky`; gerçek dikey kaydırmada yerinde kalıyor, tam sayfa görüntünün yan etkisi. Yatay kaydırmada ise gerçekten kayboluyor → UI-GRS-13. |
| Tolga 3c | Klasik kartlarda `MEDİUM`/`HİGH` | doğrulandı (klasik koyu Görevler: "MEDİUM", "HİGH", "LOW"; `ekran/tur2-classic-koyu-gece-classic-gorevler.png`). Dil ve terim Cem'in; görsel olarak İngilizce büyük harf etiketler Türkçe arayüzde tutarsız. |
| Ece 1 | Gece modu sistem açıkken modern arayüze yansımıyor | UI-GRS-01 |
| Ece 2 | "Yede…" kırpılıyor | UI-GRS-17 |
| Ece 3 | Risk paleti renk körlüğüne dayanıklı değil (UI-ERS-05) | doğrulandı. Döteranopi süzgecinde açık temada Düşük (`#1F7A35`) ile Yüksek lejant karesi aynı zeytin tonu. Kenar çubuğunda Kritik (KALKAN) ve Yolunda (YILDIZ) noktaları da aynı (`ekran/tur2-modern-acik-gunduz-classic-risk-doteranopi.png`). UI-GRS-08 koyu modda gri tonlamada aynı sonucu bulmuştu. Kararım: palet yalnız tonla seviye anlatmamalı. Matris hücresine seviye harfi ya da desen, kenar çubuğu noktasına şekil (●▲■) eklenmeli; parlaklık sırası iki temada da Düşük < Orta < Yüksek olacak biçimde yeniden ayarlanmalı. |
| Ece 4 | Yüksek karşıtlık (forced-colors) modunda hiyerarşi düzleşiyor (UI-ERS-04) | doğrulandı. Kartların yüzeyi, rozet zeminleri, ilerleme çubuğu ve seçili segment kayboluyor; seçili sekme yalnız kalın yazıyla seçiliyor (`ekran/tur2-modern-koyu-gece-classic-zorlu-renk-genel.png`). Ece'nin bulgusu; tasarım tarafında kart ve segmentlere `forced-colors` için kenarlık gerekir. px/rem karışımına bu turda bakılmadı. |

## Kısa notlar

- Boş çalışma alanında Yönetim, büyük ve yeşil "Portföy sağlığı **100** · sorunlu proje yok" gösteriyor; Portföy'de "Her şey yolunda" var. Proje yokken "sağlıklı" görünmek yanıltıcı (`ekran/tur2-modern-koyu-gece-classic-bos-yonetim.png`). Anlam Cem'in; görsel olarak yeşil vurgu yerine nötr boş durum olmalı.
- Boş çalışma alanında müdürün Portföy'ünde "Yeni proje" çağrısı yok; ekran yalnız "Kapsamınızda görüntülenecek proje yok." diyor (`ekran/tur2-modern-acik-gunduz-classic-bos-portfoy.png`). Cem'e.
- Modern koyu modda açılışın ilk karesi boş lacivert (`#111827`), hemen ardından siyah modern kabuk geliyor. Kısa bir renk sıçraması; UI-GRS-13 ile aynı kök (`index.html:110`) (`t07.json` → `acilisKareleri[0]`).
- Aşırı veride Tahsis koyu modda beyaz/`#3D7CC9` doluluk hücreleri 4,26:1 ile yine sınırın hemen altında (180/3285 metin) (Tur 1 kısa notu, Ece'nin notu).
- Aşırı veride Ayrıntılı analiz koyu modda 2480 metnin 650'si eşik altında (UI-GRS-03'ün rozetleri çoğalınca).
