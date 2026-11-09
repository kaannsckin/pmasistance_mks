# Cem (ui-akis) · Tur 1 (ikinci koşu) · bağımsız keşif · 2026-11-06

Kod: `claude/zealous-tesla-hidbc9@8fb563d` · Port 4182 · 29 betik çalıştırması (`betik/kos.mjs` + `betik/plan/01…29.json`, 27–29 günlükleri `betik/log/`) · Ekran görüntüleri `ekran/` · Yeniden sınama: `regresyon.md`.

Ortak koşul (aksi yazmadıkça): sistem teması=açık · görünüm=pilot varsayılanı · renk teması=classic · ekran=1440×900 · veri=pilot · fare.
Tarih: 1–26 numaralı koşularda uygulama tarihi 6 Kasım 2026 Cuma (45. hafta). Kapsayıcı yeniden başladıktan sonraki 27–29 numaralı koşularda tarih 9 Kasım 2026 Pazartesi (46. hafta). Aşağıdaki bulguların hiçbiri tarihe bağlı değil.

## Koşu özeti (rol × iş)

| Rol | İş | Modern | Klasik |
|---|---|---|---|
| PY (burak) | Projeyi aç, görev ekle | **tamamlandı**: 4 tıklama, "… görevi eklendi" bildirimi, Sürüm 13 | **tamamlandı**: 5 tıklama, Termin girilebiliyor, Türkçe seçenekler |
| PY (burak) | Haftalık raporu yaz ve gönder | **tamamlandı**: 9 tıklama, "Kaydedildi." ve "Bölüm sorumlusuna gönderildi." | denenmedi (aynı bileşen) |
| PY (burak) | İade edilen raporu fark et | **tamamlandı**: Portföy'de ilk beş maddenin 4.'sü | denenmedi |
| PY (burak) | Planın reddedildiğini fark et | **yapılamadı**: ret hiçbir yerde görünmüyor (UI-AKS-21) | denenmedi |
| PY (burak), boş veri | İlk proje → ilk görevler → ilk haftalık rapor | **tamamlandı**: 2 + 4 + 8 tıklama, boş durum metinleri yol gösteriyor | denenmedi |
| Bölüm sorumlusu (selin) | Bölümün doluluğunu oku | **zorlandı**: süzgeçte artık bölüm adları var, ama ekran 24 kişiyle açılıyor, Bölüm özeti yalnız kodla (AKS-09 kalanı) | **zorlandı**: aynısı |
| Bölüm sorumlusu (selin) | Tahsis gir | **yanlış sonuç**: "0,5" yazınca 5 AA kaydedildi (UI-AKS-20). PUSULA'nın neden düzenlenemediği belli değil (UI-AKS-28) | denenmedi (aynı bileşen) |
| Bölüm sorumlusu (selin) | Raporu iade et / onayla; PYB iadesini gör | **tamamlandı**: gerekçe zorunlu, "İade edildi — Mert Aydın" görünüyor | denenmedi |
| Müdür (ahmet) | Portföy sağlığını oku | **tamamlandı**: aşırı tahsis sayıları tutarlı | görüldü |
| Müdür (ahmet) | Planı onayla / reddet | **zorlandı**: uyarı en altta ve yanlış ekrana gidiyor (UI-AKS-26); Reddet gerekçesiz ve bildirimsiz (UI-AKS-21) | denenmedi |
| Müdür (ahmet) | Haftalık raporu oku | **tamamlandı**: başlık hangi haftayı gösterdiğini söylüyor | denenmedi |
| Müdür (ahmet) | Notları ve müşteri isteklerini görmediğini doğrula | **doğrulandı**: Diğer menüsünde yoklar, Ctrl+K "istek" sonuç vermiyor | klasik görev kartlarında "Sil" görüyor (UI-AKS-22) |
| PYB destek (mert) | Veri havuzunda kişi ve bölüm düzenle | **tamamlandı**: "Gizem Yıldız güncellendi.", "U320 güncellendi." | Veri Havuzu menüde görünmüyor (UI-AKS-24) |
| PYB destek (mert) | Excel içe aktar | **yapılamadı**: biçim ekranda yazmıyor, yanlış dosyada başarı mesajı (UI-AKS-25) | denenmedi |
| PYB destek (mert) | Raporu denetle, iade et, formatı onayla | **tamamlandı**: iade penceresi raporun nereye döneceğini söylüyor | denenmedi |
| PYB destek (mert) | Haftayı yayınla | **tamamlandı**: eksik raporlar için onay sorusu, "Hafta yayınlandı…" | denenmedi |
| PYB destek (mert) | Yeni proje aç, sahibini ata | **tamamlandı**: 2 + 4 tıklama, Elif'in menüsünde görünüyor; kayıt bildirimi yok (UI-AKS-29) | denenmedi |
| PYB destek (mert) | Proje içinde neyi yapabildiğini anla | **zorlandı**: "Kişi ekle" görünüyor ama sessizce çalışmıyor (UI-AKS-23) | **yanıltıcı**: "Sil" "silindi" diyor ama silmiyor (UI-AKS-22) |

Önem dağılımı (tam biçimde 11 bulgu): **K1 1 · K2 5 · K3 5 · K4 0**. Bunlara ek olarak kısa notlar var.

---

### UI-AKS-20 · Tahsis tablosunda "0,5" yazınca 5 AA kaydediliyor (Türkçe ondalık virgül sessizce siliniyor)
- Önem: K1
- Ekran: Ekip ve tahsis › Görünüm: Tahsis tablosu › plan hücreleri          Arayüz: modern (klasik Ekip ve tahsis aynı bileşeni kullanıyor, klasikte denenmedi)
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=bolum_sorumlu (selin) · veri=pilot
- Adımlar: 1. Selin olarak Ekip ve tahsis'i aç; Görünüm'ü "Tahsis tablosu", Proje'yi "NEHİR Veri Platformu" yap. 2. Tuğba Kurt satırında Aralık hücresine tıkla, içeriği seç, klavyeden `0,5` yaz. 3. Tab'a bas.
- Beklenen: Hücreye 0,5 AA yazılsın. Virgül kabul edilmiyorsa hücre bunu açıkça söylesin ("ondalık için nokta kullanın"). 1,5'in üstündeki değerler (kutunun kendi sınırı `max=1.5`) kaydedilmeden önce uyarı versin.
- Gözlenen (insan dili): Yarım adam-ay girmek istedim ve Türkçede hep yazdığım gibi "0,5" yazdım. Hücrede "05" kaldı; satırın yıllık toplamı ve proje toplamı bir anda büyüdü, hiçbir uyarı çıkmadı. Depoda değer **5** olarak duruyor, yani bir kişiye bir ayda beş adam-ay. "1,25" yazınca **125** oldu. Nokta ile "0.5" yazınca doğru kaydediliyor. Yeni eklediğim Gizem Yıldız satırında Kasım için "0,5" yazdım; hücre kırmızı çerçeve aldı ve üstteki şerit "37 kişi-ay"dan "38 kişi-ay"a çıktı. Ama nedenini söyleyen bir şey yoktu. Ardından Burak bu planı "Onaya Gönder" ile müdüre gönderebildi; Gizem'in Kasım hücresinde "5" yazıyordu. Hücreler değeri "0.4" (noktalı) gösteriyor, başlıktaki toplamlar ise "24,78" (virgüllü); ekran kullanıcıyı virgül yazmaya yöneltiyor. Üç kez üretildi: `insertText` ile "0,5", gerçek tuş vuruşuyla "0,5" ve "1,25".
- Kanıt: `ekran/modern-selin-plan-02-satir-eklendi.png` (hücrede "05", yıllık 5) · `ekran/modern-selin-ondalik-01-virgul.png` · `ekran/modern-selin-ondalik-02-125.png` · `ekran/modern-burak-plan-03-gonderildi.png` (5 AA'lık satır onaya gitmiş) · depo: `plan: {"11":5}`, `plan['12']`: "0,5" → `5`, "0.5" → `0.5`, "1,25" → `125`; odaktaki değer `"05"`, `validity.valid=false`
- Olası kök neden: `components/AllocationView.tsx:201-210`. Hücre `type="number"`; tr yerelinde virgül düşüyor ve "05" kalıyor; `parseFloat(raw)` doğrudan `onSetCell`'e gidiyor. `max={1.5}` yalnız HTML özniteliği, değişiklikte denetlenmiyor. Aynı kalıp `components/modern/ModernDataPool.tsx:88` ("Kullanılabilir AA / ay") ve `components/DataPoolView.tsx:247,316` alanlarında da var (denenmedi).
- Kapsam: arayüzün tamamı (tahsis hücreleri; aynı bileşen klasikte de kullanılıyor)
- Doğrulama: aday
- Devir: Tolga, aynı girişi klasik Ekip ve tahsis'te, Veri havuzu "Kullanılabilir AA / ay" alanında ve "Gerçekleşen" modunda denesin; yapıştırma ("0,5" kopyala-yapıştır) ve 1,5 üstü değerlere de baksın.

### UI-AKS-21 · Müdür planı "Reddet" ile gerekçesiz ve bildirimsiz reddediyor; PY reddedildiğini hiçbir yerde göremiyor
- Önem: K2
- Ekran: Ekip ve tahsis › Tahsis tablosu › "Onayla & Kilitle" / "Reddet" → PY'nin Portföy'ü ve Tahsis tablosu          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) → py (burak) · veri=pilot
- Adımlar: 1. Ahmet olarak Ekip ve tahsis'i aç; Görünüm "Tahsis tablosu", Proje "PUSULA" (rozet "Onay Bekliyor"). 2. "Reddet"e bas. 3. Burak olarak aç; Portföy'e ve Ekip ve tahsis › PUSULA'ya bak.
- Beklenen: Haftalık rapor iadesinde olduğu gibi ret gerekçesi zorunlu olsun, "Plan reddedildi" bildirimi gelsin. PY'nin ekranında "2026 planı reddedildi — Ahmet Şahin: <gerekçe>" yazsın. "Onayla & Kilitle" gibi geri dönüşü zor bir işlem en azından onay sorsun.
- Gözlenen (insan dili): "Reddet"e bastım: ne bir soru, ne bir gerekçe kutusu, ne bir bildirim geldi. Yalnız sağ üstteki rozet "Onay Bekliyor"dan "Taslak"a döndü. Burak olarak açınca Portföy'ümde "PUSULA Saha Mobil Uygulaması — 2026 planı henüz onaya gönderilmedi" yazıyordu, yani plan hiç gönderilmemiş gibi görünüyordu. Tahsis tablosunda da ret, reddeden kişi ya da gerekçe izi yok. Neyi düzeltmem gerektiğini bilmeden "Onaya Gönder"e basıp aynı planı yeniden gönderdim (bu da bildirimsiz oldu). "Onayla & Kilitle" de soru sormadan ve bildirim vermeden kilitliyor; tersine "Kilidi Aç" onay soruyor. Haftalık rapor iadesinde gerekçe zorunlu ve PY raporun başında "İade edildi — Selin Kaya" görüyor; plan onayında aynı özen yok. İki kez üretildi (betik 11 ve 12).
- Kanıt: `ekran/modern-ahmet-plan-06-tablo-pusula.png` (önce: Onayla & Kilitle / Reddet) · `ekran/modern-ahmet-plan-07-reddet-pencere.png` (sonra: pencere yok, rozet "Taslak") · `ekran/modern-burak-plan-06-reddedilmis-tablo.png` · `ekran/modern-ahmet-plan-08-kilitli.png` · depo: `{"status":"draft","decidedAt":"2026-11-06T13:55:42Z","decidedByRole":"mudur"}` (gerekçe alanı yok); Burak Portföy: "PUSULA … 2026 planı henüz onaya gönderilmedi"
- Olası kök neden: `components/AllocationView.tsx:251-257`: "Onayla & Kilitle" ve "Reddet" doğrudan `onLockAction(…)` çağırıyor; gerekçe ve onay yok (karşılaştırma için `:260` "Kilidi Aç" `window.confirm` kullanıyor). `utils/todoItems.ts:70-79` `draft` durumunu reddedilmiş plandan ayırmıyor (`decidedAt`/`decidedByRole` bakılmıyor).
- Kapsam: arayüzün tamamı (aynı bileşen klasik Ekip ve tahsis'te de var)
- Doğrulama: aday
- Devir: Tolga, Reddet'e çift tıklamayı ve "Onayla & Kilitle"yi yanlışlıkla basıp geri almayı denesin (Kilidi Aç → Taslak: plan sessizce yeniden düzenlenebilir mi?).

### UI-AKS-22 · Klasikte salt okunur roller görev kartlarında "Sil" görüyor; silme "silindi" diyor ama görev silinmiyor
- Önem: K2
- Ekran: Proje › Görevler (Görev Listesi kartları) · Portföy kartları          Arayüz: klasik
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=pyb_destek (mert); mudur (ahmet) aynı düğmeleri görüyor · veri=pilot
- Adımlar: 1. Mert olarak klasik arayüzde PUSULA'yı seç → "Görevler". 2. Bir kartta çöp kutusuna ("Sil") bas. 3. "… görevi silinecek. Emin misiniz?" sorusuna "Tamam" de. 4. Listeye bak, sayfayı yenile.
- Beklenen: Proje içeriğine salt okunur olan rolde "Sil" ve kartın durum seçicisi gösterilmesin (modernde gösterilmiyor) ya da pasif olsun ve nedenini söylesin. Gösteriliyorsa ve iş yapılmıyorsa, "silindi" denmesin.
- Gözlenen (insan dili): Uygulama silmeden önce adıyla sordu, onayladım, altta '"Görev listesi konum izni reddedilince boş ekran açılıyor" silindi' bildirimi çıktı. Ama görev listede duruyor, başlık hâlâ "Görev Listesi (104)". Yenileyince de yerinde. Bildirim olmayan bir şeyi söylüyor: ya sildiğimi sanıp giderim ya da uygulamanın bozuk olduğunu düşünürüm. Bir kartın durum seçicisinde "Süreçte"yi seçtim; seçim hiçbir şey demeden "Tamamlandı"ya geri döndü. Portföy kartlarında "Projeyi sil" düğmesi ve "Proje Yön." seçicisi de etkin görünüyor (denemedim). Ahmet'in klasik Görevler ekranında da 104 "Sil" düğmesi ve 105 etkin durum seçicisi var. Modernde aynı roller bu düğmeleri hiç görmüyor (liste işlemleri 0): iki arayüz birbiriyle çelişiyor. İki kez üretildi (iki ayrı görevle, betik 25 ve 26).
- Kanıt: `ekran/klasik-mert-gorev-01-liste.png` · `ekran/klasik-mert-sil-01-sonra.png` (bildirim + görev yerinde) · `ekran/klasik-mert-sil-02-yenile.png` · depo: görev sayısı 104 → 104 (her iki silmede); Ahmet ölçümü `{"etkinDurum":105,"silDugme":104,"yeniGorev":false}`
- Olası kök neden: `App.tsx:1701-1706`: `deleteTask` yetkiye bakmadan `showUndo("… silindi")` çağırıyor; asıl engel `App.tsx:551`'de `setTasks` içinde (`canEditProjectContent`) sessizce uygulanıyor. `App.tsx:1860-1863` ve `:1879-1882`: klasik görev listelerine `onDeleteTask`/`onStatusChange` `canEdit` denetimi olmadan veriliyor.
- Kapsam: arayüzün tamamı (klasik)
- Doğrulama: aday
- Devir: Tolga, bildirimdeki "Geri al"a basınca ne olduğunu, Mert'in klasik Portföy'de "Projeyi sil" ve "Proje Yön." değişikliğinin gerçekten yazıp yazmadığını ve müdürün aynı yolunu denesin.

### UI-AKS-23 · PYB destek proje Ekip sekmesinde "Kişi ekle" görüyor; ekleme sessizce yapılmıyor ve neyi yapabileceği ekrandan anlaşılmıyor
- Önem: K2
- Ekran: Proje › Ekip › "Kişi ekle" · Portföy › Proje bilgileri · yeni proje Genel bakış › "Başlayalım"          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=pyb_destek (mert) · veri=pilot
- Adımlar: 1. Mert olarak PUSULA'yı aç → "Ekip". 2. Mavi "Kişi ekle" düğmesine bas → "Personel havuzundan seç": Gizem Yıldız → "Ekle". 3. Listeye bak.
- Beklenen: Rol proje içeriğine salt okunursa düğme gösterilmesin (Ahmet'te gösterilmiyor) ya da sayfada bir kez "Bu projenin içeriğini PY düzenler; siz görüntülüyorsunuz" yazsın. Düğme gösteriliyorsa iş yapılsın ya da reddedildiği söylensin.
- Gözlenen (insan dili): Pencere açıldı, kişiyi seçtim, "Ekle"ye bastım; pencere kapandı ve hiçbir mesaj çıkmadı. Liste yine 5 kişi; Gizem yok. Eklediğimi sanıp çıkabilirdim. NEHİR'de Emre Koç ile tekrar denedim: aynısı oldu (5 → 5). Proje sayfasında "salt okunur" ya da "düzenleme yetkiniz yok" diyen bir ibare yok. "Yeni görev" ve liste işlemleri sessizce yok, Gidişat kartının düğmeleri yok, ama "Kişi ekle" duruyor. Kendi açtığım yeni projede "Excel'den aktar" ve "Ekibi tanımla" düğmeleri de görünüyor. Portföy › "Proje bilgileri"nde Gidişat düğmeleri (Belirtilmedi / Yolunda / Riskli / Kritik) normal görünüyor ama tıklayınca tepki vermiyor; pasif oldukları görsel olarak belli değil. Aynı pencerede proje adını ve proje yöneticisini ise değiştirebiliyorum. Yani neyi yapabildiğimi ancak deneyip başarısız olarak öğreniyorum. Aynı yetkideki Ahmet'in Ekip sekmesinde "Kişi ekle" yok. İki kez üretildi (PUSULA, NEHİR).
- Kanıt: `ekran/modern-mert-proje-03-kisi-ekle.png` (pencere) · `ekran/modern-mert-yetki-01-kisi-eklendi.png` (sonra: 5 kişi, mesaj yok) · `ekran/modern-mert-yetki-03-kisi-ekle-nehir.png` · `ekran/modern-mert-yetki-02-proje-bilgileri.png` · `ekran/modern-mert-yeniproje-02-olustu.png` · depo: `prj-pusula.resources` 5 → 5, `prj-nehir.resources` 5 → 5; `rag` "amber" değişmedi
- Olası kök neden: `App.tsx:1770`: `ModernTeam`'e `canEdit={!isManagementRole(identity.role)}` veriliyor. `pyb_destek` yönetim rolü sayılmadığı için düğme çıkıyor, yazma ise proje güncellemesinde sessizce reddediliyor (`utils/rbac.ts:105` `canWriteProject` `pyb_destek`'i dışlıyor). `components/modern/ModernProjectOverview.tsx:195-196` boş proje düğmeleri yetkiye bakmıyor.
- Kapsam: arayüzün tamamı (modern)
- Doğrulama: aday
- Devir: Tolga, Mert'te görünüp sessizce düşen başka yazma düğmeleri var mı baksın: Ekip › "İçe aktar", Adam/ay planı, Hedefler › "Hedef ekle", İş paketleri, Müşteri istekleri.

### UI-AKS-24 · Klasik üst menü 1440 px'te kırpılıyor: Görüşmeler, Beklentiler, Veri Havuzu görünmüyor
- Önem: K2 (geçici yol var: Ctrl+K ya da menünün üzerinde yatay kaydırma. Ama ilk gününde biri bunları bilmez; düzeltmenin yan etkisi)
- Ekran: Klasik üst gezinme (ve proje çubuğu)          Arayüz: klasik
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak), pyb_destek (mert) · veri=pilot
- Adımlar: 1. Klasik arayüzü 1440×900'de aç. 2. Üst menüye bak. 3. Mert olarak Veri Havuzu'nu ara.
- Beklenen: Ana menünün bütün öğeleri yaygın bir masaüstü genişliğinde görünsün. Sığmıyorsa görünür bir "Diğer" ya da kaydırma oku olsun.
- Gözlenen (insan dili): Menü "Portföy · Ekip ve tahsis · Takvim · Risk raporu · Haftalık rapor"dan sonra kesiliyor, kenarda yarım bir simge kalıyor. Görüşmeler, Beklentiler ve Veri Havuzu yok gibi görünüyor. Kaydırma çubuğu da görünmüyor. Mert için asıl çalışma ekranı Veri Havuzu; ilk günümde menüde göremeyince "klasikte yok" derdim. Proje çubuğunda da "Zekâ" kırpılıyor. 4 Kasım'da aynı genişlikte, kısa adlarla ("Tahsis", "Riskler") sekiz öğenin hepsi sığıyordu. Adlar moderne eşitlenince (UI-AKS-12 düzeltmesi) menü taşmış. Müdürde menünün başına bir de "Yönetim" ekleniyor; kodda öyle görünüyor, denemedim. İki rolde üretildi.
- Kanıt: `ekran/klasik-burak-acilis-01.png` · `ekran/klasik-mert-portfoy-01.png` · karşılaştırma: `ui-testi/2026-11-04/cem/ekran/klasik-burak-acilis-01.png` · ölçüm (betik 24): `["Görüşmeler [KIRPIK]","Beklentiler [KIRPIK]","Veri Havuzu [KIRPIK]","Zekâ [KIRPIK]"]`
- Olası kök neden: `components/Header.tsx:371`: `nav` için `min-w-0 overflow-x-auto` verilmiş, ama taşmayı gösteren bir menü ya da ok yok. `:372-380` uzayan etiketler ve müdür için ek "Yönetim" öğesi.
- Kapsam: arayüzün tamamı (klasik)
- Doğrulama: aday
- Devir: Deniz (taşma göstergesi, kırpılan simge), Ece (1280 ve 1024 px genişlik, yakınlaştırma, klavyeyle kırpık öğeye ulaşma).

### UI-AKS-25 · Excel içe aktarma biçimi söylemiyor; tanınmayan dosyada "Excel içe aktarıldı." diyor
- Önem: K2
- Ekran: Veri havuzu › "Excel içe aktar"          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=pyb_destek (mert) · veri=pilot
- Adımlar: 1. Mert olarak Veri havuzu → "Excel içe aktar". 2. Sayfa adı "Personel", sütunları "Sicil, Ad, Soyad, Bölüm, Ünvan, E-posta, Rol" olan bir dosya seç (bir kişi güncellemesi, bir yeni kişi).
- Beklenen: Dosya seçilmeden önce beklenen biçim (sayfa ve sütun adları) gösterilsin ya da indirilebilir bir şablon olsun. Tanınmayan dosyada "‘Personel Listesi’ sayfası bulunamadı; şablonu indirin" gibi bir uyarı çıksın. Başarı mesajı yalnız gerçekten bir şey alındığında gösterilsin.
- Gözlenen (insan dili): Düğme hiçbir pencere açmadan doğrudan dosya seçiciyi açtı; ekranda biçimle ilgili tek kelime yok. Dosyamı seçince yeşil "Excel içe aktarıldı." şeridi ve "Excel içe aktarma tamamlandı. Personel: 0 yeni, 0 güncellendi …" uyarısı çıktı. Neden hiçbir şey alınmadığını söyleyen bir şey yok; kişi sayısı 24'te kaldı. İkinci bir tahminle (sayfa "Kişiler"; sütunlar "Ad Soyad, Sicil No, Bölüm Kodu, Unvan") aynısı oldu. Sayfanın adını, kodda gördüğüm "Personel Listesi" yapınca aynı kişi eklendi (24 → 25). Yani özellik çalışıyor, ama biçimi ekrandan öğrenmenin yolu yok ve uygulama başarısızlığa "başarılı" diyor.
- Kanıt: `ekran/modern-mert-veri-07-excel.png` (pencere yok) · `ekran/modern-mert-veri-08-excel-sonra.png` · `ekran/modern-mert-veri-09-excel-tahmin2.png` · uyarı metni (betik 15, 29): "Personel: 0 yeni, 0 güncellendi" ×2, "Personel: 1 yeni" (doğru sayfa adıyla) · depo: 24 → 24, 24 → 24, 24 → 25 · deneme dosyaları `veri/personel-tahmin.xlsx`, `veri/kisiler-tahmin2.xlsx`, `veri/personel-listesi.xlsx`
- Olası kök neden: `components/modern/ModernDataPool.tsx:250-255`: içe aktarma sonucuna bakmadan `ok('Excel içe aktarıldı.')` gösteriliyor. `utils/poolImporter.ts:86-91`: "Personel Listesi" sayfası yoksa uyarı eklenmiyor; uyarı yalnız sayfa bulunup başlık satırı bulunamazsa ekleniyor.
- Kapsam: tek ekran (klasik Veri Havuzu'nda denenmedi)
- Doğrulama: aday
- Devir: Tolga, bozuk dosya, aynı sicille iki satır, eksik bölüm kodu ve büyük dosya denesin; tahsis sayfalarıyla içe aktarmanın mevcut planı nasıl ezdiğine baksın.

### UI-AKS-26 · Müdürün plan onayı uyarısı listenin en altında ve onaya değil genel doluluğa götürüyor
- Önem: K3
- Ekran: Portföy › Dikkat gerektirenler → Ekip ve tahsis          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot
- Adımlar: 1. Ahmet olarak Portföy → "Tümünü göster (7)". 2. "PUSULA Saha Mobil Uygulaması — 2026 planı onayınızı bekliyor"a tıkla (7. madde). 3. Açılan ekranda onay düğmesini ara.
- Beklenen: Benden eylem bekleyen tek madde ilk beşte görünsün. Tıklayınca PUSULA'nın 2026 planı Onayla / Reddet düğmeleriyle açılsın.
- Gözlenen (insan dili): Madde ancak "Tümünü göster"e basınca, en altta görünüyor (UI-AKS-03'ün kalanı). Tıklayınca "Ekip ve tahsis · Doluluk · Tüm projeler · 24 kişi" açıldı; onayla ilgili hiçbir şey yok. Görünüm'ü "Tahsis tablosu", Proje'yi "PUSULA" yapınca "Onayla & Kilitle / Reddet" çıktı (2 ek seçim, 1 geri dönüş, ~1 dk). Yönetim ekranında "Bekleyen plan onayları · Onayla" kartı varmış; Portföy uyarısı oraya da götürmüyor. İki kez üretildi (betik 10'un 1. ve 3. oturumu).
- Kanıt: `ekran/modern-ahmet-portfoy-01.png` · `ekran/modern-ahmet-portfoy-02-tumu.png` · `ekran/modern-ahmet-plan-01-tik.png` (Doluluk, onay yok) · `ekran/modern-ahmet-plan-06-tablo-pusula.png` · `ekran/modern-ahmet-yonetim-01.png`
- Olası kök neden: `utils/todoItems.ts:47-48`: madde yalnız `view: View.Allocations` taşıyor, proje ve görünüm bilgisi yok. Sıralama önceki bulgudaki gibi önem + alfabe, "benden eylem bekleyen" önceliği yok.
- Kapsam: tek ekran (modern Portföy; klasik zil denetlenmedi)
- Doğrulama: aday
- Devir: —

### UI-AKS-27 · Proje "Diğer" menüsü Esc ile kapanmıyor; dışarıya ilk tıklama yutuluyor
- Önem: K3
- Ekran: Proje sekmeleri › "Diğer" (Hedefler, Müşteri istekleri, Günlük, İş paketleri, Asistan)          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak), pyb_destek (mert) · veri=pilot
- Adımlar: 1. PUSULA → "Liste". 2. "Diğer"e bas (menü açılır). 3. Esc'ye bas. 4. "Genel bakış" sekmesine tıkla.
- Beklenen: Esc menüyü kapatsın. Dışarıya tıklama menüyü kapatırken tıklanan sekmeyi de açsın.
- Gözlenen (insan dili): Esc'den sonra menü açık kaldı. "Genel bakış"a tıkladım: menü kapandı ama sekme değişmedi, "Liste" seçili kaldı. Ancak ikinci tıklamada açıldı. Tıkladığım noktada görünmez, tam ekran bir örtü var. Müşteri istekleri ve Günlük artık bu menüde; menüyü açıp vazgeçen her kullanıcı bir tıklama kaybediyor ve "düğme çalışmıyor" sanıyor. Aynı örtü kalıbı Liste'nin "İçe / dışa aktar" menüsünde, Zaman çizelgesinde, Ekip ve tahsis › "Araçlar"da ve rapordaki "Madde ekle" menüsünde de var (denenmedi). İki rolde üretildi.
- Kanıt: `ekran/modern-burak-istek-03-proje-diger.png` (menü açık) · `ekran/modern-burak-diger-01-ilk-fare.png` (ilk tıklamadan sonra: menü kapalı, "Liste" seçili) · ölçüm (betik 3): Esc sonrası `menuAcik:true`; 1. tıklama `secili:["Liste"]`, 2. tıklama `["Genel bakış"]`; betik 19 (Mert): tıklama noktasındaki öğe `div.fixed.inset-0.z-40`
- Olası kök neden: `components/modern/ModernProjectHeader.tsx:135-138`: tam ekran örtü (`fixed inset-0 z-40`) tıklamayı yalnız menüyü kapatmak için tüketiyor; menüde Esc dinleyicisi yok. Aynı kalıp `ModernTaskList.tsx:148`, `ModernTimeline.tsx:54`, `ModernAllocation.tsx:189`, `weekly/ReportEditor.tsx:624`.
- Kapsam: arayüzün tamamı (modern açılır menüler)
- Doğrulama: aday
- Devir: Ece (klavye: Esc, menüden çıkınca odak nereye gidiyor).

### UI-AKS-28 · Tahsis tablosunda neden düzenleyemediğim belli değil: "Yetkiniz yok veya plan kilitli"
- Önem: K3
- Ekran: Ekip ve tahsis › Tahsis tablosu          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=bolum_sorumlu (selin), py (burak) · veri=pilot
- Adımlar: 1. Selin olarak Ekip ve tahsis → Görünüm "Tahsis tablosu" → Proje "PUSULA". 2. Bir hücreye tıkla.
- Beklenen: Tek ve açık bir cümle: "Plan onayda (Ahmet Şahin); onaylanana ya da reddedilene kadar düzenlenemez" ya da "Bu projenin planını yalnız PY ve bölüm sorumlusu düzenler". Düzenlenemeyen planda "Yeni Satır" alanı da pasif olsun.
- Gözlenen (insan dili): Hücreler soluk gri, tıklanmıyor; sağ üstte küçük bir "Onay Bekliyor" rozeti var. Açıklama olarak yalnız bir düğmenin ipucunda "Yetkiniz yok veya plan kilitli" yazıyor. Hangisi? Yetkim mi yok, plan mı kilitli, kim açabilir? Aynı ekranın üstündeki "Yeni Satır: Personel… · Proje… · Ekle" alanı etkin görünüyor (kilitli plana satır ekleniyor mu, denemedim). Burak KALKAN'da (başka PY'nin projesi) birebir aynı metni gördü; iki farklı neden aynı cümleyle anlatılıyor. Ayrıca kimin "Onaya Gönder"mesi gerektiği yazmıyor: düğmeyi hem Selin hem Burak görüyor.
- Kanıt: `ekran/modern-selin-tahsis-01-tablo.png` · `ekran/modern-burak-yetki-04-kalkan-tahsis.png` · `ekran/modern-selin-plan-01-nehir.png` (Selin'de "Onaya Gönder")
- Olası kök neden: `components/AllocationView.tsx:403-407` (`planEditable` yanlışsa tek metin "Yetkiniz yok veya plan kilitli"; kilit ile yetki ayrılmıyor)
- Kapsam: tek ekran (aynı bileşen klasik Ekip ve tahsis'te de var)
- Doğrulama: aday
- Devir: Tolga, "Onay Bekliyor" ve "Kilitli" planlara "Yeni Satır › Ekle" ile satır eklemeyi denesin.

### UI-AKS-29 · Kayıt bildirimleri yarım kalmış: proje, plan ve tahsis işlemleri sessiz
- Önem: K3
- Ekran: Portföy › Yeni proje / Proje bilgileri › Kaydet · Ekip ve tahsis › Yeni Satır › Ekle / Onaya Gönder / Onayla & Kilitle / Reddet          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=pyb_destek (mert), bolum_sorumlu (selin), py (burak), mudur (ahmet) · veri=pilot ve boş
- Adımlar: 1. Mert: Portföy › "… : proje bilgileri" › Proje yöneticisi = Elif Yılmaz › Kaydet. 2. Selin: Tahsis tablosu › Yeni Satır (Gizem Yıldız, NEHİR, rol) › Ekle. 3. Burak: "Onaya Gönder". 4. Ahmet: "Onayla & Kilitle".
- Beklenen: Görev ve rapor işlemlerindeki gibi kısa bir doğrulama: "Proje yöneticisi Elif Yılmaz olarak kaydedildi", "Gizem Yıldız NEHİR planına eklendi", "Plan onaya gönderildi (Ahmet Şahin)", "Plan onaylandı ve kilitlendi".
- Gözlenen (insan dili): Bu sürümde görev ekleme, haftalık rapor (kaydet, gönder, iade, onay, format onayı, yayın) ve veri havuzu ("Gizem Yıldız güncellendi.", "U320 güncellendi.") açıkça bildiriyor; bu güzel. Ama proje bilgilerini kaydedince pencere kapanıyor ve hiçbir şey denmiyor; değiştiğini Portföy satırından okumam gerekiyor. Tahsis satırı eklemek, Onaya Gönder, Onayla & Kilitle ve Reddet de sessiz; yalnız küçük bir rozet değişiyor ("Taslak" → "Onay Bekliyor" → "Kilitli"). Yeni proje oluşturunca da bildirim yok (proje sayfası açıldığı için bu kabul edilebilir). Aynı uygulamada bazı kayıtlar konuşuyor, bazıları susuyor; susanların kaydedilip kaydedilmediğinden emin olamıyorum.
- Kanıt: `ekran/modern-mert-yeniproje-04-sahip.png` · `ekran/modern-selin-plan-02-satir-eklendi.png` · `ekran/modern-burak-plan-03-gonderildi.png` · `ekran/modern-ahmet-plan-08-kilitli.png` · `ekran/modern-mert-yeniproje-02-olustu.png` · ölçüm: bu işlemlerden sonra `role=status` metni yok (betik 08, 12, 20)
- Olası kök neden: bilinmiyor (bu işleyicilerde bildirim çağrısı yok: plan kilidi işlemi `onLockAction`, proje bilgileri kaydı, `onAddAllocation`)
- Kapsam: arayüzün tamamı (modern)
- Doğrulama: aday
- Devir: Ece (bildirimlerin canlı bölgede okunup okunmadığı).

### UI-AKS-30 · Yeni terim karmaşası: "PMO puanı" ↔ PYB, "PYB sorumlusu", "Yönetici › AI bağlantısı", modernde Başlık Düzeni
- Önem: K3
- Ekran: Haftalık rapor › Enstitü raporu (PYB destek) · yayın bildirimi · AI hata mesajı · Ekip ve tahsis › Tahsis tablosu · Yönetim          Arayüz: modern + klasik
- Koşul: sistem teması=açık · görünüm ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=pyb_destek (mert), py (burak), mudur (ahmet) · veri=pilot
- Adımlar: 1. Mert: Haftalık rapor → "Enstitü raporu" → puanlama ve "Haftayı yayınla". 2. Burak: Haftalık rapor → "Taslak öner". 3. Ahmet: Ekip ve tahsis → Tahsis tablosu; Yönetim.
- Beklenen: Birim ve roller her yerde aynı adla geçsin. Kısaltma ilk geçtiği yerde açılsın. Mesajın gösterdiği ekran menüde aynı adla bulunsun. Modern arayüzün geri kalanı gibi cümle düzeni kullanılsın.
- Gözlenen (insan dili): Enstitü raporunda "Raporu okurken her projeye bu hafta için 1–10 **PMO** puanı verin" yazıyor; uygulamanın geri kalanı birimi "PYB (Proje Yönetim Birimi)" diye anıyor ve PMO açılmıyor. Yayın bildirimi "müdür ve **PYB sorumlusu** raporu … görebilir" diyor; ekranda PYB sorumlusu diye bir rol görmedim (Mert "PYB Destek"). AI mesajı "Yöneticiniz **Yönetici › AI bağlantısı** ekranından kurabilir" diyor. Menülerde "Yönetici" yok, müdürde "Yönetim" var; PYB destek rehberi ise AI ayarlarını "Haftalık rapor › Ayarlar"da gösteriyor. Aynı ayar için üç ayrı yer adı geçiyor. "AI metin puanı … Onaylı rapor metinleri 3 kez bağımsız 1–10 puanlanır; sağlık skorunun girdisidir" cümlesi ilk günündeki biri için anlaşılmaz. Modern Tahsis tablosundaki düğmeler Başlık Düzeninde: "Yeni Satır", "Onaya Gönder", "Onayla & Kilitle", "Kilidi Aç", "Görevlerden Öner", "Onay Bekliyor". Modernin geri kalanı cümle düzeninde ("Yeni görev", "Yeni proje"). Yönetim özet cümlesinde "Plan 176.8 AA, gerçekleşen 145.7 AA" (ondalık nokta), hemen altındaki kartlarda "SPI 0,87" (virgül). Ayrıntılı sözlük: `terimler.md`.
- Kanıt: `ekran/modern-mert-haftalik-07-enstitu.png` · `ekran/modern-mert-haftalik-08-yayinlandi.png` · `ekran/modern-burak-haftalik-03-ai.png` · `ekran/modern-ahmet-plan-08-kilitli.png` · `ekran/modern-ahmet-yonetim-01.png` · `terimler.md`
- Olası kök neden: bilinmiyor (metinler; Tahsis tablosu modernde klasik `components/AllocationView.tsx` bileşenini kullanıyor, Başlık Düzeni oradan geliyor)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: —

---

## Kısa notlar

- Mert'in kenar çubuğunda "Haftalık rapor 5" (sonra 6) rozeti var, ama ekranda "Onay bekleyen 0" (sonra 1) yazıyor. Rozetin neyi saydığı belli değil (`ekran/modern-mert-haftalik-01.png`).
- Ahmet'in kenar çubuğunda YILDIZ projesi "Asistan" satırının altında yarım kalıyor (`ekran/modern-ahmet-portfoy-01.png`) → Deniz.
- Kenar çubuğunda proje sırası oturumdan oturuma hâlâ değişiyor (PUSULA/NEHİR/KALKAN).
- "Yaklaşan terminler" kartı hâlâ yalnız gecikmiş işleri listeliyor ("39 gün gecikti").
- Klasikte proje "Aç" ile Yol Haritası açılıyor, modernde Genel bakış (önceki kısa not; değişmedi).
- Yeni projelerin kodu yok. Başlıkta "Burak Demir · Başlangıç 6 Kas 2026" yazıyor, eski projelerde "PSL-2402" gibi bir kod var; "Yeni proje" formunda yalnız "Proje adı" alanı var.
- Boş veride ilk iki görevi ekleyince "Proje sağlığı 100 · Sağlıklı · güven düşük" yazıyor. Hiç veri yokken 100 puan, yönetim ekranında yanıltıcı görünebilir (`ekran/modern-bos-burak-05-iki-gorev.png`).
- Bugün açılan yeni proje için aynı gün "Son gün geçti: 5 Kasım Perşembe — 1 proje raporu henüz gönderilmedi" uyarısı çıkıyor.
- Haftalık rapor "Proje sağlığı puanı verilmedi" durumunda da gönderilebiliyor. Puanın isteğe bağlı olup olmadığı ekranda yazmıyor.
- Rehber örneğinde pilotta olmayan "Safir Posta" projesi hâlâ geçiyor.
- Klasik Portföy'de Mert için "Projeyi sil" düğmeleri ve "Proje Yön." seçicileri etkin görünüyor (denenmedi → Tolga, bkz. UI-AKS-22).
- Tahsis tablosundaki aşım şeridi aynı kişiyi ay ay sayıyor: "Aslı Çakır (Oca…) · Aslı Çakır (Şub…) · … +33 diğer". Kişi bazında gruplansa okunurdu.
- Mert (PYB destek) projede Müşteri istekleri ve Günlük'ü görüyor; bunun bu rol için beklenip beklenmediği belirtilmemiş (müdür görmüyor, doğru).
- Müdürün Yönetim ekranında "Bekleyen plan onayları · Onayla" var ama "Reddet" yok; ret için Tahsis tablosuna gitmek gerekiyor.
- Olumlu: Haftalık rapor zinciri (PY → bölüm sorumlusu → PYB destek iade → bölüm sorumlusu → PYB format onayı → yayın) baştan sona açık bildirimlerle çalışıyor. PYB iade penceresi raporun nereye döneceğini söylüyor ("Bölüm sorumlusunda aşamasına döner"), Selin raporun başında "İade edildi — Mert Aydın" ve gerekçeyi görüyor, yayında eksik raporlar için onay sorusu var.
- Olumlu: Boş veriyle ilk gün 14 tıklamada bitiyor. Boş durum metinleri yol gösteriyor ("Henüz proje yok. 'Yeni proje' ile başlayın.", "Başlayalım · Yeni görev · Excel'den aktar · Ekibi tanımla"), yeni projede "Sürüm 1 · 20 gün kaldı" doğru.
- Olumlu (rol görünürlüğü): Ahmet modern "Diğer" menüsünde Müşteri istekleri ve Günlük'ü görmüyor, Ctrl+K "istek" sonuç vermiyor. Modernde müdür ve PYB destek "Yeni görev"i ve liste işlemlerini görmüyor.
- Ortam: `cdn-icons-png.flaticon.com` yüklenemedi (ağ kısıtı, bulgu değil). Tarih alanı "mm/dd/yyyy" gösteriyor (başsız Chromium yerel ayarı olabilir). Koşunun ortasında kapsayıcı yeniden başladı; 27–29 numaralı koşularda uygulama tarihi 9 Kasım (46. hafta).
