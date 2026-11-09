# Tolga (ui-kirici) · Tur 2 · çapraz saldırı (Cem'in akışları kötü yoldan) · 2026-11-06

Kod: `claude/zealous-tesla-hidbc9@8fb563d` · port 4183 · uygulama tarihi 9 Kasım 2026 (46. hafta) · 1440×900 · `tr-TR`.
Betikler: `tolga/betik/26…35-*.mjs` (yardımcı `y2.mjs`) · ölçüm ve konsol: `tolga/konsol/26…35-*.json|txt` · görüntüler: `tolga/ekran/26…35-*.png` · üretilen Excel dosyaları: `tolga/veri/aktar2/`.
11 betik çalıştırması (31 bir kez düzeltilip yeniden çalıştırıldı), her biri 25–140 sn. Konsolda `pageerror` ya da `console.error` yok. Tek dış hata `cdn-icons-png.flaticon.com`: ortam kısıtı.
Yöntem: Cem'in akışları çift/üçlü tık, yarıda bırakma, yenileme, uç değer, yapıştırma, teker ve ok tuşu ile tekrarlandı. Her işten sonra IndexedDB deposu (`depoOku`) okunup ekranla karşılaştırıldı.

## Doğrulama

| Bulgu | Karar | Gerekçe / kanıt |
|---|---|---|
| UI-AKS-20 · "0,5" → 5 AA | doğrulandı (K1) | Selin, NEHİR, Tuğba Kurt'un Aralık hücresi. Girilen → depoya yazılan: `0,5`→**5**, `1,25`→**125**, `0,05`→**5**, `,5`→**5**, `1e3`→**1000**, `2`→2 (sınır 1,5, uyarı yok), `0.5`→0,5. `-1` girilince hücredeki 0,64 sessizce silindi. Pano üzerinden yapıştırılan "0,5" de 5 oldu. Odaktaki değer "05" / "125" / "1e3" (`validity.valid=false`), bildirim yok. Yenilemeden sonra ekran ile depo aynı (5). Şerit 37 → 38 kişi-ay oldu. Plan Σ 1044,79 AA'ya çıktı. Yönetim özeti "Plan 1176.2 AA" gösterdi. Klasik Ekip ve tahsis'te aynısı oldu (`0,5`→5, `1,25`→125). "Gerçekleşen" modunda da 0,8 → 5 oldu. Veri havuzu › "Kullanılabilir AA / ay" **dayandı**: "Kullanılabilir AA 0 ile 1,5 arasında olmalı." yazıyor ve Kaydet pasif. Ekip › "Bu ayki katılım" bir kaydırıcı, bu hatadan etkilenmiyor. Kanıt: `ekran/26-a-modern-05.png`, `ekran/26-a-modern-1e3.png`, `ekran/26-a-modern-yenile.png`, `ekran/26-b-klasik-125.png`, `ekran/26-c-gerceklesen-05.png`, `ekran/26-d-veri-havuzu-aa-05.png`, `konsol/26-ondalik-tahsis.json`, `konsol/32-duzeldi-denetim.json` → `d.yonetim` |
| UI-AKS-21 · Ret gerekçesiz, PY göremiyor | doğrulandı (K2) | Ahmet "Reddet"e çift tıkladı: tek geçiş oldu (draft), diyalog, gerekçe ve bildirim yok. Burak'ın Portföy'ünde "PUSULA … 2026 planı henüz onaya gönderilmedi" yazıyor. Burak çift tıkla yeniden gönderdi, tek `plan.submit` kaydı oluştu. Veri tarafı: `planLocks` reddi ayırmıyor; ret ile kilit açma aynı biçimde (`status:draft`, `decidedAt`, `decidedByRole:"mudur"`). Ama `auditLog` ayırıyor: `plan.reject` ile `plan.unlock`. Arayüz bunu kullanmıyor. Yeniden gönderimde eski `decidedAt` / `decidedByRole` kayıtta kalıyor (status "submitted" iken). "Onayla & Kilitle"ye çift tık **dayandı**: tek kilit oluştu, tek anlık görüntü alındı (1→2). İkinci tık "Kilidi Aç"a düşmüyor: düğme x=1295'te, tık x=1233'te. Kanıt: `ekran/27-b-reddet-cift.png`, `ekran/27-b-burak-reddedilmis.png`, `ekran/27-a-onayla-cift-kabul.png`, `konsol/27-plan-onay.json` |
| UI-AKS-22 · Klasikte salt okunur "Sil" sahte | doğrulandı (K2) | Mert, klasik, PUSULA: onay sorusu çıktı, '"…" silindi' bildirimi geldi, depo 104 → 104. Bildirimdeki "Geri Al"a basınca da 104 kaldı. Kart durum seçicisinde 100 ms arayla üç değer seçtim: her seferinde sessizce "Done"a döndü, depo değişmedi, uyarı yok. Bu bulgu benim Tur 1 UI-KRC-23 bulgumla aynı: birleştirilmeli. Ek olarak: Mert klasik Portföy'de "Projeyi sil" ile ATLAS'ı **gerçekten sildi** (5 → 4 proje, 128 görev) ve "Proje Yön." seçicisi onay sormadan PUSULA'nın yöneticisini Ahmet Şahin yaptı (p14 → p21). Yetki kuralı `project.assignOwner`, yani tasarım gereği olabilir; Cem'e devir. Kanıt: `ekran/28-m-mert-projeyi-sil.png`, `konsol/28-geri-al-klasik.json` → `mert` |
| UI-AKS-23 · Mert "Kişi ekle" sessiz düşüyor | doğrulandı (K2) | Mert, PUSULA › Ekip › Kişi ekle › kişi seçildi › "Ekle"ye çift tık. Pencere kapandı, bildirim yok, `resources` 5 → 5, proje kaydı değişmedi. "İçe aktar" düğmesi yok. Hedefler sekmesinde "Yeni hedef" ve "… hedefini düzenle" görünüyor. Formun Kaydet'i pasif kaldı, depo değişmedi. Öteki "Diğer" sekmelerine örtü yüzünden ulaşamadım (UI-AKS-27). Kanıt: `ekran/29-mert-kisi-ekle-cift.png`, `ekran/34-g-mert-hedef.png`, `konsol/29-mert-yazma.json` |
| UI-AKS-24 · Klasik üst menü kırpılıyor | doğrulandı (K2) | Ölçüm: `nav` için `scrollWidth 919 > clientWidth 589–615`. 1440 px'te Burak ve Mert: "Görüşmeler [KIRPIK]", "Beklentiler [GÖRÜNMEZ]", "Veri Havuzu [GÖRÜNMEZ]". Ahmet'te durum daha kötü: "Haftalık rapor [KIRPIK]" + 3 öğe görünmüyor (`scrollWidth 1017 > 628`). Mert'te 1280 px'te de aynı; proje çubuğunda "Zekâ [KIRPIK]". Kanıt: `ekran/28-n-klasik-menu-mert.png`, `ekran/29-yetim-tahsis-klasik.png` (üstte "Gö" kesik), `konsol/28-geri-al-klasik.json` → `menu_*` |
| UI-AKS-25 · Excel biçimi yok, başarısızlıkta "içe aktarıldı" | doğrulandı (K2) | Şu dosyaların hepsinde yeşil "Excel içe aktarıldı." ve "Excel içe aktarma tamamlandı. Personel: 0 yeni, 0 güncellendi…" çıktı: yalnız başlık satırı olan dosya, çöp bayt (`cop.xlsx`) ve boş `.xlsx`. Kişi sayısı değişmedi. Aynı ekranda daha ağır sonuçlar var: UI-KRC-27 (kısmi satır mevcut kişiyi siliyor) ve UI-KRC-28 (kilitli plan değişiyor). Kanıt: `ekran/30-excel-yalnizbaslik.png`, `konsol/30-excel-havuz.json` → `yalnizBaslik`, `cop`, `bos` |
| UI-AKS-26 · Onay uyarısı en altta, yanlış ekrana | doğrulandı (K3) | Ahmet'in Portföy'ünde ilk beş madde terminlerle ilgili; plan onayı ilk beşte yok. "Tümünü göster" › "PUSULA … onayınızı bekliyor" (çift tık) → "Ekip ve tahsis", seçimler `Doluluk · 2026 · Tüm projeler · Tüm birimler`, Onayla düğmesi yok. Kanıt: `ekran/31-a-ahmet-uyari-tik.png`, `konsol/31-menu-pencere.json` → `aks26` |
| UI-AKS-27 · Diğer menüsü Esc'le kapanmıyor, ilk tık yutuluyor | doğrulandı (K3) | Esc'den sonra menü açık kaldı. Tıklama noktasındaki öğe `DIV.fixed inset-0 z-40`. "Genel bakış"a ilk tıkta seçili sekme "Liste" kaldı, ikinci tıkta değişti. Playwright'ın normal tıklaması bile "subtree intercepts pointer events" hatası verdi. Menü açıkken Ctrl+K › "Takvim" ile gitmek **dayandı**: örtü kalmadı, ardından Portföy'e tık çalıştı. Kanıt: `ekran/31-b-diger-ctrlk.png`, `konsol/31-menu-pencere.json` → `aks27` |
| UI-AKS-28 · "Yetkiniz yok veya plan kilitli" | doğrulandı (K3) | Kilitli ATLAS'ta ve onaydaki PUSULA'da Selin ile Burak'ın satır düğmeleri pasif, `aria-label="Yetkiniz yok veya plan kilitli"`. "Yeni Satır › Ekle" etkin ve **gerçekten satır ekliyor**: ayrı bulgu UI-KRC-28. Kanıt: `ekran/27-c-selin-atlas-satir.png` |
| UI-AKS-29 · Plan ve tahsis işlemleri sessiz | doğrulandı (K3) | Şu işlemlerden sonra `role=status` metni boş kaldı: "Onaya Gönder", "Onayla & Kilitle" (iki kez), "Reddet", "Yeni Satır › Ekle" (3 kez). Görevlerden Öner `window.alert` ile konuşuyor. Proje bilgileri kaydını ayrıca denemedim. Kanıt: `konsol/27-plan-onay.json` (`bildirim: []`) |
| UI-AKS-30 · Terim karmaşası | doğrulandı (kısmen, K3) | Burak "Taslak öner" → "Yapay zekâ bu ortamda henüz kurulmamış. Yöneticiniz Yönetici › AI bağlantısı ekranından kurabilir." Modern Tahsis tablosunda Başlık Düzeni: "Yeni Satır", "Onaya Gönder", "Onayla & Kilitle", "Görevlerden Öner". Yönetim'de "Plan 1176.2 AA" (nokta) yazıyor. "PMO puanı" metni **üretilemedi**: uygulama tarihi 46. haftaya geçti, Enstitü raporunda rapor yok ("Bu hafta incelemeye gönderilmiş rapor yok"). Kanıt: `ekran/35-burak-taslak-oner.png`, `ekran/35-mert-enstitu.png`, `konsol/35-oner-tekrar.json` |

Özet: 11 bulgu · **doğrulandı 11** (UI-AKS-30 kısmen) · reddedildi 0 · üretilemedi 0 · önem değişmeli 0.

## Düzeldi denetimi

| Bulgu | Karar | Kanıt |
|---|---|---|
| UI-AKS-01 · Yeni görev "Sürüm 1"e düşüyor (K2) | düzeldi (teyit) | Modern: form "Sürüm 13" ile açılıyor. Ad yazılınca Esc → "Görev kaydedilmedi. Yazdıklarınız silinsin mi?" → yeniden açılınca yine "Sürüm 13". "Görevi ekle"ye çift tık → **1** görev (104 → 105), `version:13`, `priority:"High"`, bildirim var, yenilemeden sonra yine 1 görev. Klasik: Kaydet'e üçlü tık → 1 görev, `version:13`. `ekran/32-a-modern-cift-ekle.png`, `konsol/32-duzeldi-denetim.json` → `aks01_15_modern`, `aks01_klasik` |
| UI-AKS-02 · PY başka PY'nin projesine yazıyor (K2) | düzeldi (teyit) | Kötü yol: depoda Burak için `activeProjectId = prj-atlas` (Elif'in projesi) hatırlatıldı. Modern Portföy'le açıldı, ATLAS ekranda yok, yazma düğmesi yok. Ctrl+K "ATL-2401" yalnız "AI Asistanı'na sor" önerdi. Klasik: "Proje Portföyü" açıldı, ATLAS yok, "Yeni Görev" yok. ATLAS görevleri 128 → 128. `ekran/32-c-burak-atlas-modern.png`, `ekran/32-c-burak-atlas-classic.png` |
| UI-AKS-04 · Aşırı tahsis sayısı ekrandan ekrana değişiyor (K2) | düzeldi (teyit) | Uç değerle (NEHİR, Tuğba, Aralık = 1000 AA) dört ekran aynı sayıyı verdi: Portföy "10 kişi kapasite üstü (38 kişi-ay)", tıklayınca açılan "Kapasite aşımı 10", Yönetim "38 kişi-ay aşırı tahsis", tahsis şeridi "10 kişi … (38 kişi-ay)". Sayılar tutarlı ama girdi yanlış (UI-AKS-20). `konsol/34-kalanlar.json` → `aks04`, `ekran/32-d-yonetim-1e3.png` |
| UI-AKS-13 · Yenileyince proje/sekme kayboluyor (K3) | düzeldi (teyit) | NEHİR › Pano'da 150 ms arayla üç kez yeniledim; NEHİR › Pano açıldı. Yarım görev formu açıkken yenileme `beforeunload` ile durdu; form ve "KRC yarım form" metni yerinde. Konsol temiz. `ekran/32-e-yenile.png` |
| UI-AKS-15 · Ad boşken ilk tıklama kayboluyor (K3) | düzeldi (teyit) | Ad boşken "Yüksek"e çift tık: seçim "Yüksek"te kaldı (çift tık geri almadı). Boş adla "Görevi ekle": "Görev adı gerekli." çıktı, pencere açık kaldı, "Yüksek" seçili kaldı. Ad yazılıp eklenince depoda `priority:"High"`. `konsol/32-duzeldi-denetim.json` → `aks01_15_modern` |

Sonuç: 5/5 düzeldi (teyit), düzelmemiş 0.

## Yeni bulgular

### UI-KRC-26 · "Geri al" bütün çalışma alanını silmeden önceki ana döndürüyor: silmeden sonraki 7 sn içinde yapılan başka değişiklikler sessizce kayboluyor
- Önem: K1
- Ekran: görev silme bildirimi › "Geri al" (modern Liste, klasik Görevler); proje silme bildirimi aynı yolu kullanıyor          Arayüz: modern + klasik
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. NEHİR › Liste › bir görevin işlemleri › Sil › onayla. 2. Bildirim duruyorken başka bir görevi "Tamamlandı olarak işaretle". 3. Bildirimdeki "Geri al"a bas.
- Beklenen: "Geri al" yalnız silinen görevi geri getirsin. Sonradan yapılan değişikliklere dokunmasın.
- Gözlenen (insan dili): Silinen görev geri geldi (100 → 99 → 100). Ama arada "tamamlandı" yaptığım "İzleme panosu sayfalamada son sayfa boş geliyor" görevi de sessizce "Süreçte"ye döndü. Yenileyince de "Süreçte". Bildirim ekranlar arasında da duruyor. Görevi sildim, Ekip ve tahsis'e geçtim, Burak'ın Aralık hücresini 0,32 → 0,3 yaptım, "Geri al"a bastım: tahsis değeri de 0,32'ye döndü (3,7 sn içinde). Bildirim "…silindi" diyor ama bütün çalışma alanını geri sarıyor. Klasikte aynısı oldu: kart silindi, başka kartın durumu Done → Backlog yapıldı, "Geri Al"dan sonra durum "Done"a döndü. 3/3 üretildi (modern Liste, modern ekranlar arası tahsis, klasik).
- Kanıt: `ekran/28-u1-modern-geri-al-sonra.png` · `ekran/28-u3-tahsis-geri-al-oncesi.png` · `ekran/28-u3-tahsis-geri-al-sonra.png` · `ekran/28-u2-klasik-geri-al-sonra.png` · ölçüm: `konsol/28-geri-al-klasik.json` → `u1_modern.sonuc.degisenDurum: [{istenen:"Done", simdi:"InProgress"}]`, `u3_tahsis: tahsisAra 0.3 → tahsisSon 0.32`, `u2_klasik.sonuc.degisenDurum: [{istenen:"Backlog", simdi:"Done"}]`
- Olası kök neden: `App.tsx:518-527`. `showUndo` bütün `WorkspaceData` anlık görüntüsünü saklıyor; `handleUndo` `setWorkspace(undo.snapshot)` çağırıyor. Görüntüyü veren yerler: `App.tsx:1704-1706` (görev silme, Tur 1 UI-KRC-03 düzeltmesiyle eklenmiş), `App.tsx:665/679` (proje silme), `App.tsx:2013` (AI önerisi). Geri alma, silinen kaydı yerine koyan bir işlem olmalı.
- Kapsam: tüm arayüzler (görev silme, proje silme, AI önerisi)
- Doğrulama: aday
- Devir: Cem ("Geri al" bildiriminin ekranlar arası kalıp kalmaması gerektiği)

### UI-KRC-27 · Veri havuzu Excel içe aktarma mevcut kişiyi "güncellerken" unvanını, EMY'sini ve rollerini siliyor, kapasitesini 1 AA yapıyor; aynı adlı başka kişiyi mevcut kişinin üstüne yazıyor
- Önem: K1
- Ekran: Veri havuzu › "Excel içe aktar"          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=pyb_destek (mert) · veri=pilot
- Adımlar: 1. Mert olarak Veri havuzu › Excel içe aktar. 2. "Personel Listesi" sayfasında yalnız `SİCİL, AD, SOYAD, BÖLÜM` sütunları olan, tek satırlık bir dosya seç: `S40117, Selin, Kaya, U310`. 3. Selin Kaya'nın kartına bak.
- Beklenen: Dosyada olmayan sütunlar mevcut değerlere dokunmasın. Sicil uyuşmuyorsa aynı ad başka bir kişi sayılsın ya da sorulsun. Önce bir önizleme ("1 kişi güncellenecek: rolleri silinecek…") ve geri alma olsun.
- Gözlenen (insan dili): Uyarı "Personel: 0 yeni, 1 güncellendi" diyor. Selin'in ünvanı (BUA), EMY'si (U300) ve rolü ("Yazılım Geliştirme Mühendisi") silindi, kapasitesi 0,3 AA'dan 1 AA'ya çıktı. Yenileyince de böyle. Hakan Öztürk'te de aynısı oldu: dosyada ünvan sütunu yok, sonuç "Ünvan yok · 1 AA" (önce BUA, 0,5 AA, "Test Mühendisi"). Farklı sicilli (`S48888`) ama aynı adlı "Gizem Yıldız" satırı mevcut Gizem'i ad üzerinden buldu: sicili S40391 → S48888, bölümü U310 → U330 oldu, rolü silindi, kapasitesi 0,9 → 1. Aynı sicilli iki ayrı kişi ("Kaan Yeni", "Kerem Başka") tek kişiye indi; sonuç "1 yeni, 1 güncellendi", Kaan yok. Kapasite, doluluk ve aşım hesabının girdisi: bu değer "güncellendi" denerek sessizce değişiyor (yarı zamanlı kişi tam zamanlı görünüyor). 3 kişide, 2 koşuda üretildi.
- Kanıt: `ekran/30-excel-kismiguncelle.png` · `ekran/33-d-hakan-havuz.png` ("Ünvan yok 1 AA") · ölçüm: `konsol/30-excel-havuz.json` → `kismiGuncelle.selin` (önce `{unvan:"BUA",emy:"U300",aa:0.3,roller:[…]}` → sonra `{aa:1,roller:[]}`), `adDegisik.gizem`, `ayniSicil.yeniler: ["Kerem Başka"]`; `konsol/33-ikinci-uretim.json` → `excel.hakan` · dosyalar `veri/aktar2/personel-kismi-selin.xlsx`, `personel-kismi-hakan.xlsx`, `personel-ad-eslesme.xlsx`, `personel-ayni-sicil.xlsx`
- Olası kök neden: `utils/poolImporter.ts:122-131`. Dosyada olmayan sütunlar için kişi `titleCode/emy: undefined`, `roles: []`, `availableAA: 1` ile kuruluyor (`aaRaw > 0 ? aaRaw : 1`, yani 0 kapasite de 1 oluyor). `:317-321`'de `Object.assign(existing, { ...np, id })` bu boş değerlerle mevcut kişinin üstüne yazıyor. `:311-315`'te sicil uyuşmayınca ad-soyad eşleşmesine düşülüyor. `App.tsx:818-833` önizleme ya da geri alma sunmuyor.
- Kapsam: tek ekran (Veri havuzu içe aktarma; klasik Veri Havuzu aynı `applyPoolImport`'u kullanıyorsa orada da)
- Doğrulama: aday
- Devir: Cem (içe aktarma "güncelle" ne anlama gelmeli; önizleme metni)

### UI-KRC-28 · Kilitli ve onay bekleyen plan iki yoldan değişiyor: "Yeni Satır › Ekle" satır ekliyor (eklenen satır silinemiyor), Excel "Veri Girişi" değerleri ezip 50 AA bile yazıyor
- Önem: K2
- Ekran: Ekip ve tahsis › Tahsis tablosu › Yeni Satır · Veri havuzu › Excel içe aktar ("Veri Girişi" sayfası)          Arayüz: modern (klasik aynı bileşen)
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=bolum_sorumlu (selin), py (burak), pyb_destek (mert); görüntüleyen mudur (ahmet) · veri=pilot
- Adımlar: A) 1. Selin olarak Tahsis tablosu › Proje ATLAS (rozet "Kilitli"). 2. Yeni Satır: Gizem Yıldız, ATLAS › "Ekle". B) 1. Mert olarak Veri havuzu › Excel içe aktar. 2. "Veri Girişi" sayfasında `Emre Koç · S40254 · Yazılım Geliştirme Mühendisi · ATLAS Karar Destek Sistemi · 2026 · OCAK…ARALIK = 1,4` satırı olan dosyayı seç. 3. Ahmet olarak ATLAS'a bak.
- Beklenen: Kilitli ya da onaydaki plan hiçbir yoldan değişmesin. "Yeni Satır"da kilitli projeler seçilemesin. İçe aktarma kilitli planı atlayıp bunu söylesin ("ATLAS planı kilitli, 1 satır atlandı"). 1,5 AA'nın üstündeki değerler reddedilsin.
- Gözlenen (insan dili): A) Kilitli ATLAS "9 satır"dan "10 satır"a çıktı. Yeni satır rolsüz ve boş; hücreleri pasif, "Satırı sil" düğmesi de pasif ("Yetkiniz yok veya plan kilitli"). Yani satırı ekleyen kişi onu geri silemiyor. Onaydaki PUSULA'da Selin ve Burak'ta aynısı oldu (7 → 8). Soru, uyarı ya da bildirim yok. "Ekle"ye çift tık tek satır ekledi. B) İçe aktarma "Tahsis: 0 yeni, 1 güncellendi" dedi. Kilitli ATLAS'ta Emre'nin 12 ayı 0,8 → 1,4 oldu. Müdürün ekranında rozet hâlâ "Kilitli", hücreler "1.4", Plan Σ 63,13 → 70,49 AA. Onaylı plan, müdürün onayladığı rakamları artık göstermiyor ve bunun izi yok (anlık görüntü sayısı 1'de kaldı). Onaydaki PUSULA'da Ece Polat'ın Aralık değeri 0,72 → **50** oldu. A 3/3, B 2/2 üretildi.
- Kanıt: `ekran/27-c-selin-atlas-satir.png` ("10 satır", boş Gizem satırı, "Kilitli") · `ekran/27-c-burak-pusula-satir.png` · `ekran/30-excel-vgkilitli.png` · `ekran/33-c-mudur-kilitli-atlas.png` · ölçüm: `konsol/27-plan-onay.json` → `satir_selin_ATLAS.satir: "9 → 10"`, `yeniSatirHucre: [{etkin:0, sil:["Yetkiniz yok veya plan kilitli:pasif"]}]`; `konsol/30-excel-havuz.json` → `vgKilitli.atlasEmre`, `vgOnayda.pusulaEce: [0.72] → [50]`; `konsol/33-ikinci-uretim.json` → `excel.atlas {kilit:"locked", emreOca:1.4}`, `mudur.ust.toplam`
- Olası kök neden: `App.tsx:732-741`. `handleAddAllocation` kilit durumuna bakmıyor. `components/AllocationView.tsx:174-177` `addableProjects` kilitli projeleri süzmüyor. Satır silme ise `planEditable`e bağlı (`:403-407`), o yüzden ekleyen silemiyor. `utils/poolImporter.ts:396-425` `applyPoolImport` tahsisleri `planLocks`a bakmadan birleştiriyor, değerlere üst sınır koymuyor (`num` `:41-48`).
- Kapsam: arayüzün tamamı (Tahsis tablosu modern/klasik, Excel içe aktarma)
- Doğrulama: aday
- Devir: Cem (kilitli planda kim neyi değiştirebilmeli; müdüre "onaydan sonra değişti" uyarısı)

### UI-KRC-29 · Silinen projenin tahsis satırları "Bilinmeyen Proje" olarak kalıyor, kapasite aşımı sayısına girmeye devam ediyor ve hiçbir rolde silinemiyor
- Önem: K2
- Ekran: Portföy › "Projeyi sil" → Ekip ve tahsis › Tahsis tablosu / Doluluk          Arayüz: klasik (silme), tahsis ekranı modern ve klasikte ortak
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak), pyb_destek (mert) · veri=pilot
- Adımlar: 1. Burak olarak klasik Portföy'de NEHİR kartında "Projeyi sil" › onayla. 2. 7 sn bekle ("Geri Al" kaybolsun). 3. Ekip ve tahsis › Tahsis Tablosu.
- Beklenen: Proje silinince tahsis satırları ve plan kilidi de silinsin. Ya da silmeden önce "7 tahsis satırı da silinecek" denip satırlar arşivlensin. Aşım sayısı silinen projeyi saymasın.
- Gözlenen (insan dili): Onay penceresi "projesi ve tüm verileri silinecek" diyor. Proje gitti, ama tahsis tablosunda "Bilinmeyen Proje · 7 satır · Plan Σ 45,43 AA" grubu duruyor. 84 hücrenin hiçbiri düzenlenemiyor, "Satırı sil" düğmelerinin hepsi pasif. Satırları kaldırmanın yolu yok. Üstteki şerit silmeden önce ve sonra aynı: "9 kişi kapasite üstü (37 kişi-ay)". Var olmayan bir projenin yükü kişilerin doluluğuna ve aşım sayısına girmeye devam ediyor (Deniz Yavuz'un kırmızı aşım hücreleri). Mert ATLAS'ı silince 9 satır, "Kilitli" rozetiyle kaldı; `planLocks` kaydı da kalıyor. 2/2 üretildi (Burak/NEHİR, Mert/ATLAS).
- Kanıt: `ekran/33-a-burak-yetim-tahsis.png` · `ekran/29-yetim-tahsis-klasik.png` · ölçüm: `konsol/33-ikinci-uretim.json` → `yetim.depo {projeler: 4, nehirTahsis: 7}`, `yetimHucreEtkin {hucre:84, etkin:0, silEtkin:0}`, `serit` önce/sonra aynı; `konsol/29-mert-yazma.json` → `yetim.depo {atlasTahsis: 9, atlasKilit: ["locked"]}`
- Olası kök neden: `App.tsx:664-680`. `handleDeleteProject` yalnız `projects` listesini süzüyor; `allocations`, `planLocks` (ve muhtemelen `leaves`/`expectations` gibi `projectId` taşıyan kayıtlar) temizlenmiyor. `components/AllocationView.tsx:337` adı bulunamayan projeyi "Bilinmeyen Proje" diye çiziyor ve `canAddAllocationToProject` yanlış döndüğü için düzenlemeye kapatıyor.
- Kapsam: arayüzün tamamı
- Doğrulama: aday
- Devir: Deniz ("Bilinmeyen Proje" grubunun görünümü), Cem (PYB destek klasikte proje silebiliyor: rol tasarımı)

### UI-KRC-30 · Tahsis hücresi odaktayken fare tekerleği ve ok tuşları planı sessizce değiştiriyor; sayfa kaymıyor, değişiklik anında kaydediliyor, geri alınamıyor
- Önem: K2
- Ekran: Ekip ve tahsis › Tahsis tablosu › plan hücreleri          Arayüz: modern + klasik
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×700 ve 1440×900 · rol=bolum_sorumlu (selin) · veri=pilot
- Adımlar: 1. Selin olarak NEHİR'in Tahsis tablosunu aç. 2. Tuğba Kurt'un Mayıs hücresine (0,8) tıkla. 3. İmleç hücrenin üstündeyken sayfayı aşağı kaydırmak için tekerleği 3 tık çevir.
- Beklenen: Teker sayfayı kaydırsın. Değeri yalnız klavyeyle bilinçli girilen sayı değiştirsin. Değişiklik geri alınabilsin (Ctrl+Z ya da "Geri al").
- Gözlenen (insan dili): Sayfa yerinden oynamadı (`scrollY` 14 → 14). Onun yerine hücre 0,8 → 0,65 oldu ve depoya yazıldı. Hiçbir bildirim yok. Ok tuşu da aynı: iki kez ↑ 0,8 → 0,9 yaptı, teker 0,9 → 1 yaptı. Ctrl+Z bir şey yapmıyor, "Geri al" düğmesi yok. Tahsis tablosu uzun bir ekran ve kullanıcı bir hücreye tıkladıktan sonra tekerle kaydırmaya çalışacak; planı fark etmeden değiştiriyor. Modern ve klasikte üretildi, 2 koşu (betik 26 ve 33).
- Kanıt: `ekran/33-b-teker-modern.png` · `ekran/33-b-teker-classic.png` · ölçüm: `konsol/33-ikinci-uretim.json` → `teker_modern {once:0.8, sonra:0.65, kaydirma:{once:[14], sonra:[14]}}`, `teker_classic {once:0.8, sonra:0.65}`; `konsol/26-ondalik-tahsis.json` → `modern.okTeker {once:[0.8], ikiOkYukari:[0.9], teker:[1], ctrlZ:[1], geriAlDugmesi:0}`
- Olası kök neden: `components/AllocationView.tsx:201-210`. `type="number"` + `step={0.05}`: tarayıcı odaktaki sayı kutusunda tekerleği ve okları değere uyguluyor. `onChange` her olayda doğrudan `onSetCell`'e gidiyor (onay ya da `onBlur` kaydı yok). Aynı kalıp UI-AKS-20'nin de kökü: `type="text" inputMode="decimal"` ve virgülü kabul eden ayrıştırma ikisini birlikte çözer.
- Kapsam: arayüzün tamamı (tahsis hücreleri; "Gerçekleşen" modu da aynı hücreyi kullanıyor)
- Doğrulama: aday (Ece UI-ERS-22'de ok tuşunu gördü: depoya yazıldığını ve geri alınamadığını bu bulgu gösteriyor)
- Devir: Ece (klavye kullanıcısı için ok tuşunun hücreden hücreye gitmesi mi beklenir)

### UI-KRC-31 · "Görevlerden Öner › Uygula" mevcut satırı güncellemek yerine rolsüz ikinci satır ekliyor: "elle girilmiş değerlere dokunma" seçiliyken kişinin yükü ikiye katlanıyor
- Önem: K2
- Ekran: Ekip ve tahsis › Tahsis tablosu › "Görevlerden Öner"          Arayüz: modern + klasik
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Burak olarak NEHİR'in Tahsis tablosunu aç ("Taslak"). 2. "Görevlerden Öner". 3. Varsayılan "Boş ayları doldur — elle girilmiş değerlere dokunma" seçiliyken "Uygula".
- Beklenen: Öneri kişinin bu projedeki mevcut satırının boş aylarına yazılsın, dolu aylara dokunulmasın. "Üzerine yaz" seçilirse aynı satırdaki değerler değişsin. Mesaj kaç hücrenin değiştiğini ve kaçının korunduğunu söylesin; geri alınabilsin.
- Gözlenen (insan dili): Mesaj "Görev planından tahsis uygulandı: 4 kişi güncellendi." diyor. Gerçekte mevcut satırların hiçbir hücresi değişmedi (0 hücre); 4 yeni, rolsüz satır eklendi (7 → 11 satır). Tuğba Kurt artık iki satırda: Aralık 0,64 (elle girilen) + 0,48 (öneri) = 1,12 AA. Kapasitesi 0,9. Şerit 9 → 11 kişi, 37 → 48 kişi-ay aşım gösteriyor. Plan Σ 45,43 → 51,89 AA. "Üzerine yaz" seçeneğinde birebir aynı sonuç çıktı: iki seçenek arasında fark yok. "Uygula"ya çift tık tek uygulama yaptı. "Geri al" yok. 3/3 üretildi (modern çift tık / doldur, modern üzerine yaz, klasik doldur).
- Kanıt: `ekran/34-h-gorevlerden-oner.png` (seçenekler) · `ekran/35-oner-modern.png` · `ekran/35-oner-classic.png` · ölçüm: `konsol/35-oner-tekrar.json` → `oner_*.fark {satir:"7 → 11", eskiSatirdaDegisenHucre:0, yeniSatirlar:["p20 rol=-","p19 rol=-","p11 rol=-","p07 rol=-"]}`, `tugbaAralik {satirlar:[0.64,0.48], toplam:1.12}`, `ustSonra.serit "11 kişi … (48 kişi-ay)"`; `konsol/34-kalanlar.json` → `oner`
- Olası kök neden: `utils/taskToAllocation.ts:194-201`. Hedef satır yalnız `!a.workPackageId && !a.role` olan satırlar arasında aranıyor; pilotta bütün satırlar rollü olduğu için her kişiye yeni satır açılıyor. "Doldur" ve "üzerine yaz" bu yeni ve boş satıra uygulandığından ikisi de aynı sonucu veriyor. `App.tsx:765-771` mesajı `applied` sayısını "güncellendi" diye bildiriyor ve `alert`'i durum güncelleyicinin içinde çağırıyor.
- Kapsam: arayüzün tamamı (Tahsis tablosu modern/klasik)
- Doğrulama: aday
- Devir: Cem (öneri ekranının "dokunma" sözü ile sonucu)

Yeni bulgu sayısı: **K1: 2 · K2: 4 · K3: 0** (toplam 6).

## Kısa notlar

- **Dayandı:**
  - "Onayla & Kilitle"ye çift tık, onay sorusu kabul de ret de (tek kilit, tek anlık görüntü).
  - "Reddet"e çift tık; "Onaya Gönder"e çift tık.
  - "Yeni Satır › Ekle"ye çift tık (tek satır).
  - Görevlerden Öner "Uygula"ya çift tık (tek uygulama).
  - Görev formunda "Görevi ekle"ye çift tık, klasik Kaydet'e üçlü tık (tek görev).
  - Diğer menüsü + Ctrl+K (örtü kalmıyor).
  - 1500 satırlık personel dosyası: soyadı `<img src=x onerror=alert(i)>`, 4 sn, `alert` çalışmadı, metin olarak görünüyor.
  - Çöp ve boş `.xlsx`: çökme yok. Ama "tamamlandı" diyor: UI-AKS-25.
- Excel "Veri Girişi"nde proje adında tek harf farkı ("Uygulamasi") sessizce yeni bir proje açıyor (5 → 6). Uyarı yalnız `alert`in alt satırında.
- Excel'de bilinmeyen bölüm kodu (`U999`) uyarısız kabul ediliyor; boş bölüm "Tanımsız" oluyor.
- Tahsis hücresine `-1` yazınca hücredeki 0,64 sessizce siliniyor. Hücre her tuş vuruşunda kaydediliyor ("0.75" yazarken 0 → 0,7 → 0,75).
- Plan reddedilip yeniden gönderilince `planLocks` kaydında eski `decidedAt` / `decidedByRole` kalıyor; durum "submitted" ama bir "karar" alanı dolu.
- Bulut eşitleme penceresi açıkken Ctrl+K çalışıyor. Seçilen ekran (Asistan paneli) pencerenin arkasında açılıyor. Dört Esc Bulut penceresini kapatmıyor ve örtüsü kenar çubuğu tıklamalarını yutuyor ("Takvim" tıklanamadı). × ile kapanıyor. Çökme ve veri etkisi yok. → Ece (pencere yığını, odak).
- Tarayıcının Geri tuşu uygulama içi gezinmeyi geri almıyor, uygulamadan çıkıyor (uyarıdan Ekip ve tahsis'e geçip Geri: önceki sayfaya gidildi). Uygulama içi geçmiş kaydı yok gibi görünüyor; Tur 1'de rapor taslağı bu yolla `beforeunload`a takılmıştı.
- Mert klasik Portföy'de "Projeyi sil" ile projeyi gerçekten siliyor ve "Proje Yön." onaysız yazıyor; tek görevi ise silemiyor (UI-AKS-22). → Cem (rol tasarımı).
- Veri havuzu "Kullanılabilir AA / ay" ipucu "0,5 = yarı zamanlı" diyor, ama "0,5" yazınca "05" görünüyor ve "0 ile 1,5 arasında olmalı" hatası çıkıyor (veri bozulmuyor). → Cem (dil).
- Ortam: `cdn-icons-png.flaticon.com` yüklenemedi (ağ kısıtı). Uygulama tarihi 46. hafta; Enstitü raporu boş olduğu için "PMO puanı" metnine ulaşılamadı.
