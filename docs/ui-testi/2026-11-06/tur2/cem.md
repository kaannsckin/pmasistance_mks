# Cem (ui-akis) · Tur 2 (çapraz saldırı) · 2026-11-06

Kod: `claude/zealous-tesla-hidbc9@8fb563d` · Port 4182 · Uygulama tarihi 9 Kasım 2026 (46. hafta; kapsayıcı saati).
Betikler: `betik/tur2/kos2.mjs` (Tur 1 koşucusu `kos.mjs` + `tabla` (Tab/Shift+Tab ile ada kadar ilerleyip yoldaki örtülü durakları sayar), `odak`, `tus … ortu` (odak örtülme denetimi), `insanDokun` (en az kaydırmayla görünür alana getirip merkezine dokunur, örtülüyse insan gibi biraz daha kaydırır)) · planlar `betik/tur2/plan/01…10.json` · günlükler `betik/tur2/log/01…10.log` · **10 çalıştırma**, her biri 8–59 sn · Ekran görüntüleri `ekran/*tur2*`.
Ortak koşul (aksi yazmadıkça): sistem teması=açık · görünüm=Sistem · renk teması=classic · arayüz=modern · veri=pilot · fare.
Kapsayıcı Tur 2 sırasında yeniden başladı. Diskteki iş (plan 01–09) yerinde kaldı. Ortam 10. çalıştırmayla yeniden doğrulandı: sunucu ve tarayıcı açıldı, koşu 8 sn sürdü.

Yöntem: Ece'nin her bulgusunu, o ekranda yapılan gerçek bir işle denedim. İşler: haftalık raporu yazıp göndermek, tahsis hücresini düzeltmek, Ayarlar'da gece modunu açmak, pencere açıp kapatmak, menüden ekrana gitmek. Her birinde iki soruya baktım: iş tamamlanıyor mu, yanlış sonuç çıkıyor mu? Önemi bu iş etkisine göre değerlendirdim.

## Doğrulama

| Bulgu | Karar | Gerekçe / kanıt |
|---|---|---|
| UI-ERS-17 · Haftalık rapor alt şeridi odağı örtüyor (K2) | **doğrulandı (K2)** | İşi %200'de (640×400) yalnız klavyeyle baştan sona yaptım: rapor 49 tuşta gönderildi, iş **tamamlanıyor**. Ama "Plan ekle"ye Enter'a basınca açılan yeni metin kutusu bütünüyle şeridin altında kaldı (`TAMAMEN-ÖRTÜLÜ`). Plan cümlesini **görmeden yazdım**; ekranda yalnız mavi odak çizgisinin ucu görünüyordu. Telefonda (375×812) parmakla da aynısı oldu: "Plan ekle"ye dokundum, yeni kutu şeridin altında açıldı (kutu 730–802 px, şerit 661–800 px). Yazdığım plan görünmedi; insan burada ikinci kez "Plan ekle"ye basar. Şerit telefonda ekranın %17'si (139 px). Masaüstünde (1440×900) bile puan düğmeleri 7–10 ve "Tek cümlelik gerekçe" alanı Tab'la gelince şeridin altında yarım kalıyor. Yani sorun yalnız klavyede değil, dokunmada da var. K2 yerinde: yazılan metin okunamıyor. `ekran/modern-burak-tur2-200-rapor-04-plan-yazildi.png`, `ekran/mobil-burak-tur2-rapor-06-plan-yazildi.png` · `betik/tur2/log/01.log` [1.18–1.20], `02.log` [4.9–4.12, 1.15] |
| UI-ERS-18 · Tahsis tablosunda sabit "Personel" sütunu odağı örtüyor (K2) | **doğrulandı (K2)** | İş: Selin olarak %200'de, klavyeyle bir ayı düzeltmek. İki ayrı oturumda (03 ve 06) Tab ile Ağu/Eyl'e gidip Shift+Tab ile geri döndüm. Haz hücresi yarı yarıya, May hücresi bütünüyle sabit sütunun altında kaldı. Durumu ağırlaştıran bir şey daha gördüm: 400 px yükseklikte düzenlediğim tablonun (KALKAN) ay başlığı ekranın üstünde kalmıştı (`kendiBaslikY: -122`). Ekranda görünen tek ay başlığı ("Oca Şub Mar Nis May") alttaki NEHİR tablosuna aitti ve sütunları bu satırla hizalı değildi. Hangi ayda olduğumu ne hücreden ne başlıktan anlayabildim. Türkçe alışkanlıkla "0,3" yazdım: görmediğim Haziran hücresine **3 AA** kaydedildi (`prj-kalkan "6": 3`). Değerin 3 olması UI-AKS-20'nin (virgül) sonucu; ama bu bulgu yüzünden kullanıcı yanlışı göremiyor. Telefonda sabit sütun 241 px, yani ekranın %64'ü; aynı anda tek ay ("Oca") görünüyor. `ekran/modern-selin-tur2-200-tahsis-02-geri-uc.png`, `ekran/modern-selin-tur2-200-tahsis-04-uretim2.png` · `betik/tur2/log/03.log` [2.13–2.21, 4.5], `06.log` [1.13–1.22] |
| UI-ERS-19 · Tahsis hücreleri adsız, ay başlıkları başlık değil (K2) | **doğrulandı (K2)** | Yöntemim zaten adla bulmak (`getByRole(…, { name })`). İş: "Tuğba Kurt'un Aralık tahsisini bul." `spinbutton` adında "Tuğba Kurt" geçen **hiçbir** hücre yok. "Aralık/Ara" ile 7 hücre çıkıyor, hepsinin adı boş (`""`). Ad taşıyan hücreler yalnız aşımda olanlar; o ad da değer değişince değişiyor ("Aşırı tahsis: Onur Çelik Nis toplamı 1,2 / kapasite 0,9"). Ekran okuyucu kullanan bölüm sorumlusu, aşım dışındaki hiçbir hücreyi kişi ve ayla bulamaz; bu iş onun için yapılamıyor. `betik/tur2/log/03.log` [1.7–1.8], `06.log` [1.8] |
| UI-ERS-20 · Bulut eşitleme ve Hakkında pencere değil (K2) | **doğrulandı (K2)** | İş: Hakkında'yı açıp okumak, sonra kapatmak. Esc pencereyi kapatmadı, odak `body`'de kaldı. Klavyeyle "Kapat"a ancak **14. Tab'da** ulaştım; önceki 13 durak karartmanın arkasındaki Portföy düğmeleriydi ve hepsi görünmüyordu (`TAMAMEN-ÖRTÜLÜ fixed:div "PlanAsistan Hakkında"`). Tuzak yok ama kullanıcı 13 kez görmediği bir şeye basıyor. Bulut eşitleme'de de odak `body`'de, Esc çalışmıyor. Bu pencerede gerçek eylemler var ("Kaydet", "Şimdi Gönder", "Buluttan Çek"), bu yüzden K2'yi koruyorum. `ekran/modern-burak-tur2-hakkinda-01.png`, `ekran/modern-burak-tur2-bulut-01.png` · `betik/tur2/log/05.log` [3.7–3.23] |
| UI-ERS-21 · Komut paleti: Tab'dan sonra Esc kapatmıyor (K3) | **doğrulandı (K3)** | İş: Ctrl+K ile NEHİR'e gitmek. Mutlu yol sorunsuz: "NEH" yazıp Enter'a bastım, proje açıldı (1 tuş). Yanlışlıkla Tab'a basınca benim koşumda odak arka sayfaya değil, paletin sonuç listesine (kapsayıcı `div`) gitti. Ece'nin koşusunda ilk Tab arka sayfaya gitmişti; bu ayrıntı tutmadı. Asıl zarar ise aynen çıktı: Esc'e iki kez bastım, palet açık kaldı ("Esc" ipucu köşede yazmasına rağmen). Enter de hiçbir şey yapmadı. Kullanıcı ancak dışarı tıklayarak kurtuluyor. `ekran/modern-burak-tur2-palet-01-tab-esc.png` · `betik/tur2/log/05.log` [4.2–4.17] |
| UI-ERS-22 · Tahsis tablosunda ok tuşu değeri değiştiriyor, sessizce (K3) | **önem değişmeli (K3 → K2)** | Üç kez ürettim, iki arayüzde. (1) Modern, 1440, fare: Tuğba Kurt'un Aralık hücresine tıklayıp "alt satıra geçmek" için ↓'e bastım. Değer 0,64'ten 0,6'ya, bir ↓ daha 0,55'e indi. 0,64 adım ızgarasında olmadığı için ilk basış değeri yuvarladı. Odak aynı hücrede kaldı; bildirim yok, "Geri al" yok. Depoda 0,55, sayfayı yenileyince de 0,55. (2) Modern, %200, klavye: Onur Çelik'in KALKAN/Nisan değeri ↓ ile 0,4'ten 0,35'e indi ve kaydedildi. (3) Klasik: aynı hücrede ↓ ile 0,64 → 0,6, kaydedildi. Onaya gidecek plan rakamı farkına varılmadan değişiyor; geri dönüş yolu da yok. Ölçekte "yanlış anlamaya yol açıyor / sessiz yanlış rakam" K2'ye denk düşüyor. K1 değil, çünkü değer hücrede görünüyor ve bir tuşa basılması gerekiyor. Kapsam: **tüm arayüzler**. UI-AKS-29 ("tahsis işlemleri sessiz") ile bağlanabilir. `ekran/modern-selin-tur2-tahsis-02-ok-sonra.png` · `betik/tur2/log/03.log` [1.10–1.25], `06.log` [1.10, 1.22], `07.log` [5.7–5.11] |
| UI-ERS-23 · "Tahsisi düzenle"den sonra odak kayboluyor (K3) | **doğrulandı (K3)** | Klavyeyle (Ahmet): ısı haritası hücresi → Enter → "Tahsisi düzenle"ye 23 Tab → Enter. Odak `body`'ye düştü; sonraki Tab "Kilidi Aç"a gitti. Fareyle iş tamamlanıyor: Selin "Tuğba Kurt, Kasım" → "Tahsisi düzenle" yapınca Birim U310'a süzüldü, satır ekranda (y=525) ve 12 hücrenin 12'si açık. Yani etki yalnız klavyede, K3 yerinde. Ece'nin devrine yanıt: müdür doğru satırı fareyle buluyor ama o satırda **hiçbir hücreyi düzenleyemiyor** (ayrı bulgu: UI-AKS-35). `betik/tur2/log/06.log` [2.2–2.9, 3.2–3.7] |
| UI-ERS-24 · Kısa ekranda çekmecenin alt bölümü menüyü örtüyor (K3) | **doğrulandı (K3, kapsam genişliyor)** | 812×375, Selin, parmakla: menüde yalnız "Portföy" ve "Ekip ve tahsis" görünüyor. "Haftalık rapor"a ulaşmak için menüyü 136 px kaydırmak gerekti; kaydırınca dokunma çalıştı. %200'de klavyeyle "Takvim", "Risk raporu" ve "Haftalık rapor" alt bölümün altında kaldı. Bu üçü yolda görünmeyen 3 durak olarak sayıldı. **Yeni:** sorun masaüstünde de var. 1440×900'de müdürün (5 proje) kenar çubuğunda "YILDIZ Test Otomasyonu" bütünüyle "Asistan / Ahmet Şahin" bölümünün altında; ekranda 4 proje görünüyor, Portföy 5 diyor. Geçici yol var (Portföy listesi), bu yüzden K3. `ekran/mobil-selin-tur2-yatay-01-menu.png`, `ekran/modern-ahmet-tur2-risk-02-yuksek-secili.png` (solda 4 proje) · `betik/tur2/log/05.log` [5.4], `01.log` [1.4], `06.log` [2.4] |
| UI-ERS-25 · Ayarlar radyo grupları oklarla çalışmıyor (K3) | **doğrulandı (K3)** | İş: gece modunu yalnız klavyeyle açmak. "Sistem"de iki kez → bastım: odak ve seçim yerinde kaldı. Tab ile "Gece"ye gidip Space'e, sonra "Değişiklikleri Uygula"ya bastım: ekran koyulaştı (`html.dark`, zemin #000). İş 31 tuşta **tamamlanıyor**; bu yüzden K3 doğru. Renk teması düğmelerinde `aria-pressed`, `aria-checked` ve `role` boş, yani hangisinin seçili olduğu ağaçta yok. `ekran/modern-burak-tur2-ayarlar-02-uygula-sonra.png` · `betik/tur2/log/04.log` [1.5–1.17], `04.log` [2.13] |
| UI-ERS-26 · Haftalık raporda Kaydet/Gönder sonrası odak ve duyuru (K3) | **doğrulandı (K3)** | 1440'ta klavyeyle: Kaydet'ten de Gönder'den de sonra odak `body`. "Kaydedildi." ve "Bölüm sorumlusuna gönderildi." iletileri sayfa açılışında var olmayan, sonradan eklenen `role=status` öğelerinde çıktı (`acilistaVardi: false`); açılıştaki kalıcı bölge boş kaldı. Ece'nin devrine yanıt: gözle kullanan kullanıcı gönderildiğini **görüyor**. Listede yeşil "Bölüm sorumlusuna gönderildi." kutusu ve satırda "Bölüm sorumlusunda" etiketi çıkıyor (640'ta da). Kaydet'ten sonra da "Kaydedildi." kutusu ekranda; 1440'ta ve telefonda iki kez ölçtüm. Etki yalnız ekran okuyucu tarafında; K3 yerinde. `ekran/modern-burak-tur2-200-rapor-08-gonder-sonra.png`, `ekran/modern-burak-tur2-kaydet-01-1440.png` · `betik/tur2/log/02.log` [1.14–1.23], `08.log`, `09.log` |

Özet: **doğrulandı 9 · reddedildi 0 · üretilemedi 0 · önem değişmeli 1** (UI-ERS-22: K3 → K2).

## Düzeldi denetimi

Ece'nin "düzeldi" dediği K2 bulgularının beşini de (01, 02, 03, 05, 15) gerçek bir işle denedim. UI-ERS-04 "kısmen" olduğu için kapsam dışı.

| Bulgu | Karar | Kanıt |
|---|---|---|
| UI-ERS-01 · Ayarlar: odak arkada, Esc yok, dialog değil | **düzeldi (teyit)** | Gece modunu klavyeyle açma işi: "Ayarlar" 17. Tab, Enter ile odak `dialog "Uygulama Ayarları"` içinde (`aria-modal=true`). 30 Tab'ın sonunda odak hâlâ pencere içinde. Uygula'dan sonra odak "Ayarlar"a döndü; yeniden açıp Esc'e basınca kapandı ve odak yine "Ayarlar"a döndü. `betik/tur2/log/04.log` [1.2–1.22] |
| UI-ERS-02 · Kapalı çekmecedeki düğmeler Tab sırasında | **düzeldi (teyit)** | 1023×768'de klavyeyle Haftalık rapor'a gitme işi: 1. Tab "Menüyü aç", Enter, 8 Tab "Haftalık rapor" (görünür), Enter; sayfa açıldı. Toplam 9 tuş. Çekmece kapalıyken 30 Tab sayfa içinde dolaştı ve hiçbir çekmece öğesine uğramadı. `betik/tur2/log/05.log` [1.2–1.6], `04.log` [4.3] |
| UI-ERS-03 · Ayarlar anahtarları adsız/durumsuz | **düzeldi (teyit; ad ve durum)** | Asistanı kapatma işi: `getByRole('switch', { name: 'Yapay Zeka Asistanı' })` bulundu. Tıklayınca `aria-checked` true'dan false'a geçti; Uygula'dan sonra kenar çubuğundan "Asistan" kalktı. "Yerel Kayıt" anahtarı da adla bulundu. Yüksek karşıtlık bölümünü denetlemedim (Ece ve Deniz şeridi). `betik/tur2/log/04.log` [2.15–2.21], `ekran/modern-burak-tur2-ayarlar-04-gece-moru-uygula.png` |
| UI-ERS-05 · Risk matrisinde düzey yalnız renkle | **düzeldi (teyit)** | Müdür olarak döteranopi süzgeciyle "yüksek riskleri bul" işi: renkler zeytin ve sarı tonlarına çöküyor, ama her dolu hücrede D/O/Y harfi var. Hücre adı düzeyi söylüyor ("Olasılık 5 × Etki 4 = 20, Yüksek: 1 risk", 2 hücre). Hücreye tıklayınca liste süzüldü. Ayrıca "Yüksek riskler" kartı iki riski yazıyla veriyor. `ekran/modern-ahmet-tur2-risk-02-yuksek-secili.png` · `betik/tur2/log/05.log` [2.5–2.8] |
| UI-ERS-15 · Bilgi pencerelerinde odak arkada kalıyor | **düzeldi (teyit)** | PUSULA'da "Durum özeti"ni klavyeyle açtım (7 Tab): odak `dialog "Durum özeti"` içinde (`aria-modal=true`), 15 Tab sonra hâlâ içeride. Esc'te odak "Durum özeti"ne döndü. "Sağlık skoru nasıl hesaplanır?" penceresinde de aynısı. `ekran/modern-burak-tur2-durum-ozeti-01.png` · `betik/tur2/log/04.log` [5.2–5.12] |

Sonuç: **5/5 düzeldi (teyit)**, düzelmemiş 0.

## Yeni bulgular

### UI-AKS-31 · Ayarlar'da "Yerel Kayıt"ı kapatınca kayıtlı bütün projeler hemen siliniyor; uyarı yok, bildirimler "eklendi" demeyi sürdürüyor
- Önem: K1
- Ekran: Ayarlar › Özellikler & Veri › "Yerel Kayıt — Verileri tarayıcıda sakla."          Arayüz: modern (klasik aynı pencereyi kullanıyor)
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Ayarlar'ı aç. 2. "Yerel Kayıt" anahtarını kapat. 3. "Değişiklikleri Uygula". 4. (İsteğe bağlı) bir görev ekle. 5. Sayfayı yenile ya da sekmeyi kapatıp aç.
- Beklenen: Anahtarın ne yapacağı açıkça yazmalı (ör. "Kapatırsanız bu tarayıcıdaki 5 proje silinir; sekmeyi kapatınca çalışmanız kaybolur"). Kapatırken onay sorulmalı. Kayıt kapalıyken bunu söyleyen kalıcı bir uyarı görünmeli. Mevcut veri sessizce silinmemeli.
- Gözlenen (insan dili): Açıklama "Verileri tarayıcıda sakla." diyordu. Kapatınca bir şey olmayacağını, yalnız yeni kayıtların tutulmayacağını sandım. Uygula'ya bastım; ne bildirim çıktı ne bir uyarı. Ekranda 5 proje durmaya devam etti, ama depoda proje sayısı aynı anda 5'ten **0**'a düştü. Ardından görev ekledim, yeşil "… görevi eklendi" bildirimi çıktı. Sayfayı yeniledim: Portföy "Henüz proje yok", kenar çubuğu "Kapsamınızda proje yok" diyordu. Görevler, riskler, notlar dahil bütün projeler gitmişti. Tahsisler ve beklentiler ise duruyordu: Portföy'de "2026 planında 9 kişi kapasite üstü" uyarısı boş portföyün üstünde kaldı. Anahtarı aynı oturumda yeniden açarsam projeler geri yazılıyor (5). Yenilemeden ya da sekmeyi kapatmadan önce fark etmezsem veri kalıcı olarak gidiyor. (3 üretim: 06 · 07/1 · 07/2; hiçbir şey eklemeden yalnız kapatıp yenilemek de yetiyor.)
- Kanıt: `ekran/modern-burak-tur2-ayarlar-06-yerel-kayit-kapali.png` (anahtar ve açıklaması) · `ekran/modern-burak-tur2-yerel-01-uygula-sonra.png` (Uygula'dan sonra ekranda 5 proje, depoda 0) · `ekran/modern-burak-tur2-ayarlar-07-yenile-sonra.png` (yenileme sonrası boş portföy, üstte kapasite uyarısı) · `ekran/modern-burak-tur2-yerel-02-yenile-sonra.png` · ölçüm: `betik/tur2/log/07.log` [1.2] `projeSayisi: 5`, [1.8] `projeSayisi: 0, ayar: false`, [1.10] `ekrandakiProjeler: 5`, [2.7] yenileme sonrası `0`; `06.log` [5.10] "görevi eklendi", [5.15] `projeSayisi: 0`
- Olası kök neden: `App.tsx:439-441` (kalıcılık kapalıyken depoya `{ ...workspace, projects: [], activeProjectId: null }` yazılıyor; değişen projeler kaydedici tarafından silinmiş sayılıyor) · `components/SettingsModal.tsx:230-237` (açıklama tek cümle, onay ve uyarı yok)
- Kapsam: tüm arayüzler (Ayarlar penceresi iki arayüzde ortak)
- Doğrulama: aday (3 üretim)
- Devir: Tolga: bulut eşitleme bağlıyken boş proje listesi buluta da gönderiliyor mu (`scheduleAutoPush`), başka cihaz "Buluttan Çek" yapınca ne alıyor? Ece: anahtarın erişilebilir açıklaması (`aria-describedby`) bu uyarıyı da taşımalı.

### UI-AKS-32 · Boş haftalık raporda "1 format hatası düzeltilmeli" yazıyor; hatanın ne olduğu şeritte değil, sağ sütunda
- Önem: K3
- Ekran: Haftalık rapor › proje raporu düzenleyici › alt şerit ve "Format denetimi" kartı          Arayüz: modern ve klasik (aynı bileşen)
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900, 640×400 · rol=py (burak) · veri=pilot
- Adımlar: 1. Haftalık rapor › rehberi kapat. 2. "Yazılmadı" durumundaki bir projeyi (PUSULA ya da NEHİR) aç. 3. Hiçbir şey yazmadan alt şeride bak.
- Beklenen: Gönder düğmesi neden kapalıysa şerit bunu sade dille söylemeli: "Göndermeden önce: bu hafta en az bir gelişme yazın". Boş rapora "format hatası" denmemeli.
- Gözlenen (insan dili): Raporu ilk açtığımda daha tek harf yazmamıştım, ama altta "Göndermeden önce: 1 format hatası düzeltilmeli. · Proje sağlığı puanı verilmedi" yazıyordu. "Hangi format? Ben bir şey yazmadım ki" diye düşündüm. Asıl nedeni sağ sütundaki "Format denetimi · 1 hata · 1 uyarı" kartında buldum: "Bu hafta gelişmeler bölümü boş. Gelecek hafta planı yazılmamış." %200'de ve telefonda bu kart sayfanın en altında; şeridin yanında ne bağlantı var ne açıklama. Klasik arayüzde de aynı metin çıkıyor.
- Kanıt: `ekran/modern-burak-tur2-200-rapor-01-acildi.png` (boş rapor, şerit "1 format hatası") · `ekran/modern-burak-tur2-nehir-04-format-denetimi.png` (sağdaki kart) · `ekran/klasik-burak-tur2-haftalik-02-rapor.png` · ölçüm: `betik/tur2/log/06.log` [4.4], `02.log` [1.5], `09.log` [2.7]
- Olası kök neden: `components/modern/weekly/ReportEditor.tsx:910-911` (şerit yalnız hata sayısını yazıyor; boş bölüm denetimi de "format hatası" sayılıyor)
- Kapsam: tek ekran (iki arayüz)
- Doğrulama: aday (PUSULA 640, NEHİR 1440, PUSULA klasik)
- Devir: Ece: şeritteki neden metni Gönder düğmesine `aria-describedby` ile bağlanınca (Ece'nin kısa notu) bu metin de anlaşılır olmalı.

### UI-AKS-33 · "Uygulama Ayarları"ndaki Planlama Parametreleri aslında açık projenin ayarı; hangi proje olduğu yazmıyor, Portföy'de girilen değer sessizce atılıyor
- Önem: K3
- Ekran: Ayarlar › Planlama Parametreleri (Sprint Süresi (Hafta), Proje Başlangıç Tarihi)          Arayüz: modern ve klasik
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Portföy'deyken Ayarlar'ı aç, Sprint Süresi'ni 2 yap, "Değişiklikleri Uygula". 2. Ayarlar'ı yeniden aç. 3. PUSULA'yı açıp aynısını yap. 4. NEHİR'e geçip Ayarlar'ı aç.
- Beklenen: Proje ayarları proje ekranında olmalı, ya da pencere "PUSULA Saha Mobil Uygulaması için" demeli. Proje açık değilken bu alanlar ya gizlenmeli ya da kapalı olmalı ve nedeni yazmalı. Değişiklik bir yere yazılmayacaksa kullanıcıya söylenmeli.
- Gözlenen (insan dili): Pencerenin adı "Uygulama Ayarları"; ben sprint süresinin bütün projeler için olduğunu sandım. Portföy'de 2 yazıp Uygula'ya bastım, bildirim çıkmadı. Pencereyi yeniden açınca yine 3 yazıyordu; hiçbir projenin değeri değişmemişti (iki kez denedim: 2 ve 4). Portföy'de "Proje Başlangıç Tarihi" bugünün tarihini gösteriyor (2026-11-09), proje açıkken ise projenin tarihini (2026-01-01). PUSULA açıkken 2 yazınca yalnız PUSULA 2 oldu, diğer dört proje 3'te kaldı. Pencerede hangi projeyi değiştirdiğimi söyleyen tek kelime yok.
- Kanıt: `ekran/modern-burak-tur2-ayarlar-03-acik.png` (başlık "Uygulama Ayarları", Planlama Parametreleri) · `ekran/modern-burak-tur2-ayarlar-08-nehir-planlama.png` · ölçüm: `betik/tur2/log/07.log` [3.3, 3.13, 3.16] (Portföy'de 2 ve 4 girildi, bütün projeler 3'te), `10.log` [1.4] `projeAdiPenceredeVar: false`, [1.8] yalnız PUSULA 2
- Olası kök neden: `App.tsx:1318-1335` (`handleSaveSettings`: sprint ve başlangıç tarihi yalnız `if (activeProject)` ise o projeye yazılıyor, değilse atılıyor) · `components/SettingsModal.tsx:184-200` (alanlar uygulama ayarlarında, proje adı yok)
- Kapsam: tek ekran (iki arayüz)
- Doğrulama: aday (Portföy'de 2, proje açıkken 1 üretim)
- Devir: —

### UI-AKS-34 · "VERİLERİ SIFIRLA" her rolde görünüyor; sıfırladıktan sonra hiçbir ileti yok, arayüz klasiğe ve rol "Proje Yöneticisi · kişi seçilmedi"ye dönüyor
- Önem: K3
- Ekran: Ayarlar › Özellikler & Veri › "VERİLERİ SIFIRLA"          Arayüz: modern (sonrası klasik)
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet), bolum_sorumlu (selin), py (burak) · veri=pilot
- Adımlar: 1. Müdür (ya da bölüm sorumlusu) olarak Ayarlar'ı aç. 2. "VERİLERİ SIFIRLA". 3. Tarayıcı onayında "Tamam".
- Beklenen: Geri alınamaz bu düğme yalnız yedekleme yetkisi olan role görünmeli. Onay penceresi neyin silineceğini (yalnız bu tarayıcı mı, bulut da mı) ve önce yedek almayı söylemeli. Sıfırlamadan sonra "Veriler silindi" iletisi çıkmalı ve kullanıcı aynı arayüzde kalmalı.
- Gözlenen (insan dili): Müdür olarak her şeyi salt okunur görüyorum (tahsis hücreleri kapalı, görev kartında düzenleme yok). Ama Ayarlar'da, renk teması düğmelerinin hemen altında büyük kırmızı "VERİLERİ SIFIRLA" duruyor. Onay penceresinde yalnız "Tüm veriler silinecek! Onaylıyor musunuz?" yazıyor. Onayladım, sayfa yeniden açıldı: hiçbir ileti yok. Modern arayüz kendiliğinden **klasik** arayüze döndü. Sağ üstte "Proje Yöneticisi · kişi seçilmedi ⚠" yazıyor ve sarı "Kapsam için kişi seçilmeli" kutusu çıktı. Portföy "Proje 0" diyor, oysa depoda bir "Örnek Proje" oluşmuş. Müdür olduğum, hangi arayüzde olduğum ve neyin silindiği ekrandan anlaşılmıyor. Uygulama bozuldu sandım. (2 üretim: Ahmet, Selin.)
- Kanıt: `ekran/modern-burak-tur2-ayarlar-05-sifirla.png` (düğme) · `ekran/modern-ahmet-tur2-sifirla-sonra.png`, `ekran/modern-selin-tur2-sifirla-sonra.png` (klasik, "kişi seçilmedi") · ölçüm: `betik/tur2/log/06.log` [6.6–6.10] (`projeler: ["Örnek Proje"], rol: "py", kisi: 0`), `07.log` [4.6–4.9], `04.log` [3.2] (müdürün Ayarlar düğmeleri)
- Olası kök neden: `components/SettingsModal.tsx:247` (`window.confirm`, yetki denetimi yok) · `App.tsx:892-897` (`handleResetData`: depoyu temizleyip yeniden yüklüyor; ileti yok, varsayılan çalışma alanı klasik arayüz ve kişisiz PY rolüyle açılıyor)
- Kapsam: tüm arayüzler
- Doğrulama: aday (2 üretim)
- Devir: Tolga: bulut bağlıyken sıfırlama sonrası boş çalışma alanı buluta gidiyor mu?

### UI-AKS-35 · Müdüre "Tahsisi düzenle" gösteriliyor; götürdüğü tabloda o kişinin 12 hücresinin 12'si kapalı ve nedeni yazmıyor
- Önem: K3
- Ekran: Ekip ve tahsis › Doluluk › kişi ayrıntı paneli › "Tahsisi düzenle" → Tahsis tablosu          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot
- Adımlar: 1. Ekip ve tahsis'te "Cem Bulut, Kasım" (ya da "Tuğba Kurt, Kasım") hücresine tıkla. 2. Paneldeki "Tahsisi düzenle"ye tıkla.
- Beklenen: Rol düzenleyemiyorsa düğme "Tahsisi gör" olmalı ya da hiç çıkmamalı. Tablo, kişinin satırını vurgulamalı ve satırın neden kilitli olduğunu söylemeli ("Taslak plan: PY düzenler" / "Plan kilitli: Kilidi Aç").
- Gözlenen (insan dili): Panelde mavi, birincil "Tahsisi düzenle" düğmesi var. Tıkladım; tablo açıldı ve ekran Tuğba Kurt'un NEHİR satırına kaydı. Ama satırdaki 12 hücrenin 12'si gri ve kapalı. Satır vurgulanmamış, yanında açıklama yok. NEHİR başlığında yalnız "Taslak" etiketi var. Sayfadaki düğmeler "Kilidi Aç", "Onayla & Kilitle", "Reddet". Düzenleme sözü veren düğmenin beni düzenleyemeyeceğim bir yere götürdüğünü ancak hücrelere tıklayınca anladım. (2 üretim: Cem Bulut 12/12 kapalı, Tuğba Kurt 12/12 kapalı.)
- Kanıt: `ekran/modern-ahmet-tur2-tahsis-01-panel.png` ("Tahsisi düzenle") · `ekran/modern-ahmet-tur2-tahsis-03-tugba.png` (Tuğba Kurt satırı gri) · ölçüm: `betik/tur2/log/06.log` [2.16] `acikHucre: 0, kapaliHucre: 12`, [2.17] düğmeler · `08.log` [3.7] `acik: 0, kapali: 12`, [3.8] sayfada "yetki/kilit" sözü yok
- Olası kök neden: `components/modern/ModernAllocation.tsx:399` (düğme rol yetkisine bakmadan çiziliyor) · `:151-156` (`editInGrid` satırı vurgulamıyor) · ilgili: UI-AKS-28 (neden düzenleyemediğim belli değil)
- Kapsam: tek ekran
- Doğrulama: aday (2 üretim)
- Devir: Ece: düğmenin adı rol durumunu söylemeli (UI-ERS-23 ile birlikte).

### UI-AKS-36 · "Hakkında" penceresi uygulamayı yanlış anlatıyor: "Local Storage", "hiçbir sunucuya gönderilmez", "GitHub'da Nasıl Yayınlanır?"
- Önem: K3
- Ekran: Diğer araçlar › Hakkında ("PlanAsistan Hakkında")          Arayüz: modern (klasikte üst çubuktaki "Hakkında")
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Kenar çubuğunda "Diğer araçlar" › "Hakkında". 2. Pencereyi oku.
- Beklenen: Pencere uygulamanın ne olduğunu, sürümünü ve verinin nerede tutulduğunu doğru anlatır: bu tarayıcıda, istenirse Bulut eşitleme ile sunucuda. Yedekleme için menüdeki gerçek adı ("Yedek al / yükle") kullanır.
- Gözlenen (insan dili): Alt başlık "Akıllı Proje Planlama & GitHub Pages Rehberi". Pencerenin yarısı "GitHub'da Nasıl Yayınlanır?" adımları ("Settings", "Pages", "Branch… Save butonuna basın"); bir proje yöneticisinin işiyle ilgisi yok. "Veri Güvenliği" bölümü "Verileriniz sadece sizin tarayıcınızda (Local Storage) saklanır, hiçbir sunucuya gönderilmez" diyor. Oysa aynı menüdeki "Bulut eşitleme" penceresi verinin Supabase'e gönderildiğini anlatıyor. "JSON export/import" diye bir düğme de yok; menüde "Yedek al / yükle" var. Kurum verisinin nereye gittiğini merak eden kullanıcıya iki pencere birbirine ters şey söylüyor.
- Kanıt: `ekran/modern-burak-tur2-hakkinda-01.png` · ölçüm: `betik/tur2/log/05.log` [3.6] (pencere metni), [3.21] (Bulut penceresi metni) · ilk üretim Ece: `ece/betik/d14-aria-hakkinda.txt`
- Olası kök neden: `components/AboutModal.tsx:33` ("GitHub'da Nasıl Yayınlanır?"), `:70` ("Local Storage… hiçbir sunucuya gönderilmez"), `:74` ("JSON export/import")
- Kapsam: tek pencere (iki arayüz)
- Doğrulama: aday (Ece d14 + Cem 05)
- Devir: —

### UI-AKS-37 · "Yedek al / yükle" menü öğesi yedekleme değil "Profil değiştir" penceresini açıyor; pencerede yedekten tek söz yok
- Önem: K3
- Ekran: Diğer araçlar › "Yedek al / yükle · Yönetici (admin) kimliğiyle" (klasikte üst çubuk "Yedek al / yükle: Admin kimliğiyle")          Arayüz: modern ve klasik
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. "Diğer araçlar". 2. "Yedek al / yükle".
- Beklenen: Ya yedek penceresi açılır, ya da açılan pencere "Yedek almak için Yönetici profiline geçin" der ve hangi profili seçeceğimi gösterir.
- Gözlenen (insan dili): Yedek almak istedim. Menüde "Yedek al / yükle" vardı ve altında küçük harflerle "Yönetici (admin) kimliğiyle" yazıyordu. Tıkladım; "Profil değiştir · Hangi profille çalışmak istiyorsunuz?" penceresi açıldı. İçinde 4 PY, 5 bölüm sorumlusu, PYB destek… listeleniyor; "yedek" kelimesi yok, "Yönetici (admin)" diye bir profil de ilk ekranda görünmüyor. Neden bu pencerede olduğumu ve yedeğe nasıl ulaşacağımı anlamadım; bu benim için "yedek yok" demek. Menü öğesinin altındaki "Yönetici (admin)" ile klasikteki "Admin" de aynı şeye iki ad.
- Kanıt: `ekran/modern-burak-tur2-yedek-01.png` · ölçüm: `betik/tur2/log/05.log` [3.3] (menü adları), [3.30] (açılan pencere metni) · ilk üretim Ece: `ece/betik/d13-sonuc.json` → `digerAraclar["Yedek al / yükle"]`
- Olası kök neden: `components/modern/ModernSidebar.tsx:140` (yetki yoksa öğe `onOpenProfile` açıyor, pencereye amaç taşınmıyor) · `components/Header.tsx:410` (klasik karşılığı)
- Kapsam: tüm arayüzler
- Doğrulama: aday (Ece 2 + Cem 1)
- Devir: —

### UI-AKS-38 · Ayarlar ve çevresinde aynı şeye iki ad, yanıltıcı ad ve İngilizce kalıntılar
- Önem: K4
- Ekran: Ayarlar › Görünüm & Temalar; Diğer araçlar › Bulut eşitleme; klasik Ekip ve tahsis          Arayüz: modern ve klasik
- Koşul: sistem teması=açık · görünüm ayarı=Sistem · renk teması=classic
         ekran=1440×900 · rol=py (burak), bolum_sorumlu (selin) · veri=pilot
- Adımlar: 1. Ayarlar'ı aç, "Görünüm & Temalar"ı oku. 2. Diğer araçlar › Bulut eşitleme. 3. Klasik arayüzde Ekip ve tahsis'in sekmelerini oku.
- Beklenen: Gece modu ile renk teması karışmayacak adlar taşır. Bir işlev her yerde tek adla anılır. Kullanıcıya teknik altyapı terimi gösterilmez.
- Gözlenen (insan dili):
  - "Gece" (görünüm) düğmesinin hemen altında "Gece Moru" renk teması var. Gece modunu arayan biri "Gece Moru"na basıyor: ekran açık kalıyor, yalnız vurgu mora dönüyor (Uygula sonrası `html` sınıfı boş, zemin açık).
  - Menüde "Bulut eşitleme", pencere başlığında "Bulut Senkronizasyonu", klasik üst çubukta "Bulut senkronizasyonu (Supabase)". Pencerede "Supabase · Yerel-Öncelikli · Ücretsiz Katman" ve "veritabanı politikası (RLS) gereği" geçiyor.
  - Klasik Ekip ve tahsis'te bir sekmenin adı "Jira Billed Hours". Aynı ekranda "Tahsis Tablosu" büyük harfle; modernde "Tahsis tablosu". Klasik "Veri Havuzu", modern "Veri havuzu".
- Kanıt: `ekran/modern-burak-tur2-ayarlar-03-acik.png` · `ekran/modern-burak-tur2-ayarlar-04-gece-moru-uygula.png` · `ekran/modern-burak-tur2-bulut-01.png` · `ekran/klasik-selin-tur2-tahsis-01.png` · ölçüm: `betik/tur2/log/04.log` [2.20], `05.log` [3.20–3.21], `07.log` [5.2, 5.5]
- Olası kök neden: `components/SettingsModal.tsx` (tema adları) · `components/CloudSyncModal.tsx:154-155, 265` · `components/AllocationView.tsx:688`, `components/BilledHoursImportModal.tsx:84`
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Deniz: UI-GRS-28 ile birleştirilebilir (önizleme olmaması + "Gece Moru" adı).

Yeni bulgu: **8** (K1: 1 · K2: 0 · K3: 6 · K4: 1).

## Devir notlarına yanıt

| Kimden | Not | Sonuç |
|---|---|---|
| Ece #1 | Yeni görevde "Sorumlu" yalnız "Atanmadı" | **üretilemedi**: PUSULA'da Sorumlu listesinde 25 seçenek var (önce proje ekibi: Burak Demir, Ece Polat, Kerem Doğan, Barış Güneş, İrem Şen; sonra birim kodlu herkes). Görevi Kerem Doğan'a atadım. `betik/tur2/log/05.log` [6.4–6.5], `ekran/modern-burak-tur2-gorev-sorumlu.png` |
| Ece #2 | Hakkında içeriği güncel değil | doğrulandı → **UI-AKS-36** |
| Ece #3, Deniz #2, Tolga #2 | Kurtarma ekranında teknik hata metni | Pilot verisini `people: null` ile bozarak yükledim. Uygulama veriyi düzeltip açıldı ("Sahip atanmadı"); ekranı kendim **üretemedim** (`betik/tur2/log/07.log` oturum 6). Deniz'in görüntüsüne baktım (`deniz/ekran/modern-koyu-gece-classic-bozuk-people-null.png`): başlık, "hiçbir şey kaydetmedi" güvencesi ve "Ham veriyi indir" anlaşılır. `(e.allocations \|\| []).map is not a function` satırı küçük ve gri; kullanıcı onu atlar ama "neyi yanlış yaptım?" kaygısı yaratır. K4 öneririm: satır "Teknik ayrıntı" altına alınsın. |
| Ece #4 | "Yedek al / yükle" Profil değiştir'i açıyor | doğrulandı → **UI-AKS-37** |
| Ece #5 | Eski pencerelerde kapatma yolu | UI-ERS-20 satırında: fareyle ×, "Anladım, Kapat" ve karartma çalışıyor; Esc çalışmıyor. |
| Ece (ERS-17/19/22/23/26 devirleri) | Gerçek iş denemeleri | Doğrulama tablosunda ilgili satırlarda. |
| Deniz #1 | Ayarlar'da üç seçim üç farklı davranıyor (UI-GRS-28) | İşle denedim: "Gece"ye bastım, arka ekran değişmedi, × ile kapattım. Ayar uygulanmadı; yeniden açınca "Sistem" seçiliydi. Ne "kaydedilmemiş değişiklik" sorusu çıktı ne bir ipucu. Aynı pencerede Arayüz kartı anında uygulanıyor. İlk gününde biri "gece modu bozuk" der ve vazgeçer. Uygula'dan sonra çalışıyor, ama ileti yok. İş etkisine göre **K4 → K3** öneririm. "Gece Moru" adı bu karışıklığı büyütüyor (UI-AKS-38). `betik/tur2/log/04.log` [2.5–2.10] |
| Deniz #3 | Klasik üst menüde bulunabilirlik | Tur 1'de UI-AKS-24 olarak yazıldı; bu turda yeniden denemedim. |
| Tolga #1 | Yanlış güvence veren metinler (KRC-19/20/23) | KRC-23 Tur 1'deki UI-AKS-22 ile aynı. KRC-19 (sekme devri) ve KRC-20 bu turda denenmedi (iki sekme ve dosya gerekiyor). Aynı türden bir yanlış güvence bu turda çıktı: "Yerel Kayıt" kapalıyken "görevi eklendi" (UI-AKS-31). |
| Tolga #3, #5, #6 | İçe aktarma beklentisi, yedekten yükleme kimliği, taslak saklayan formlar | Bu turda denenmedi (görevde istenen ekranların dışında). İçe aktarma için Tur 1'deki UI-AKS-25 geçerli. |
| Tolga #4 | Klasikte müdür/PYB'nin gördüğü Sil/Düzenle | Tur 1'deki UI-AKS-22/23. Bu turda Ayarlar'da aynı sorunun benzeri çıktı: müdüre "VERİLERİ SIFIRLA" (UI-AKS-34). |

## Bu turun sonraki ajanlara notları

- Tolga: UI-AKS-31 (Yerel Kayıt) ve UI-AKS-34 (sıfırlama), bulut eşitleme açıkken de denensin. Yerelde silinen veri buluta yayılıyorsa önem değişmez ama kapsam büyür.
- Ece: UI-ERS-17'nin dokunmada da sürdüğü görüldü. "Plan ekle" sonrası yeni kutu şeridin altında açılıyor; düzeltme yalnız `scroll-padding` değil, yeni öğeyi görünür alana kaydırmak da olmalı.
- Ece / Deniz: UI-ERS-24 1440×900'de müdürün 5. projesinde de var; kapsam "arayüzün tamamı, masaüstü dahil".
