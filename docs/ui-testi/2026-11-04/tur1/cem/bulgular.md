# Cem (ui-akis) · Tur 1 bulguları · 2026-11-04

Kod: `claude/zealous-tesla-hidbc9@81bd671` · Port 4182 · 37 betik çalıştırması (`betik/kos.mjs` + `betik/plan/*.json`)

Ortak koşul (aksi yazmadıkça): sistem teması=açık · uygulama ayarı=pilot varsayılanı (`settings.isDarkMode=true`, ama ekranlar açık temada çizildi; bkz. devir.md → Deniz) · renk teması=classic · ekran=1440×900 · veri=pilot · fare.

## Koşu özeti (rol × iş)

| Rol | İş | Modern | Klasik |
|---|---|---|---|
| PY (burak) | Projeyi aç, görev ekle | **zorlandı**: kaydedildiğine dair iz yok; görev geçmiş "Sürüm 1"e düştü (UI-AKS-01, -05) | **zorlandı**: aynısı, üstelik termin girilemiyor (UI-AKS-06) |
| PY (burak) | Haftalık raporu yaz, kaydet, gönder | **tamamlandı** (geri bildirim açık) | **tamamlandı** (aynı bileşen) |
| PY (burak) | İade edilen raporu fark et ve aç | **zorlandı**: Portföy'de 12 uyarının 6.'sı, "Tümünü göster" arkasında (UI-AKS-03) | denenmedi |
| PY (burak) | Müşteri istekleri / Günlük'ü bul | **zorlandı**: "Diğer" menüsünde, aramada çıkmıyor (UI-AKS-11) | **tamamlandı** (üst düzey sekme) |
| Bölüm sorumlusu (selin) | Raporu iade et (gerekçeli) | **tamamlandı** | denenmedi (aynı bileşen) |
| Bölüm sorumlusu (selin) | Raporu onayla | denenmedi (aynı bileşen) | **tamamlandı** |
| Bölüm sorumlusu (selin) | Bölüm doluluğunu oku, aşırı tahsisi bul | **zorlandı**: kendi bölümü kodla, 24 kişi arasında (UI-AKS-09) | **zorlandı**: aynısı |
| Müdür (ahmet) | Portföy sağlığını oku | **zorlandı**: aşırı tahsis sayısı ekrandan ekrana değişiyor (UI-AKS-04) | görüldü, ayrıntılı değerlendirilmedi |
| Müdür (ahmet) | Kapasite–talep ekranında karar ver | **tamamlandı (yalnız okuma)**: "Araçlar" altında; karar düğmesi yok | denenmedi |
| Müdür (ahmet) | Haftalık raporu oku | **zorlandı**: 4 hafta önceki rapor "bu haftanın" başlığıyla açılıyor (UI-AKS-07) | **zorlandı**: aynısı |
| Müdür (ahmet) | Notları ve müşteri isteklerini **görmediğini** doğrula | **doğrulandı** (Diğer menüsünde yok, Ctrl+K'da çıkmıyor) | **doğrulandı** (İstekler/Günlük sekmeleri yok) |
| PY (burak) | Başka PY'nin projesine dokunamama | **yapılamadı (yetki açığı)**: ATLAS ve KALKAN'a görev eklendi (UI-AKS-02) | Portföy ve aramada görünmüyor (doğru) |

Önem dağılımı: K1 0 · K2 4 · K3 9 · K4 1 (tam biçimde 14 bulgu) + kısa notlar.

---

### UI-AKS-01 · Yeni görev varsayılan olarak geçmiş "Sürüm 1"e düşüyor; proje "287 gün geride" görünüyor
- Önem: K2
- Ekran: Proje › Yeni görev formu → Genel bakış "Şu anki sürüm" kartı / klasik Pano (Sürüm Planlama)          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Kenar çubuğunda "PUSULA Saha Mobil Uygulaması"na tıkla (Genel bakış: "Şu anki sürüm: Sürüm 13 · 17 Kas başlıyor"). 2. "Yeni görev" → yalnız "Görev adı"nı yaz. 3. "Görevi ekle".
- Beklenen: Sürüm alanı şu anki ya da sıradaki sürümle (Sürüm 13) ya da "Havuz" ile dolu gelsin; yeni bir görev projenin "şu anki sürüm"ünü değiştirmesin.
- Gözlenen (insan dili): Formda "Sürüm" kendiliğinden "Sürüm 1" geliyor; ben adını yazıp ekledim. Pencere kapanınca "Şu anki sürüm" kartı "Sürüm 13 · 17 Kas başlıyor"dan "Sürüm 1 · **287 gün geride** · 1 Oca – 21 Oca · 1 görev"e döndü. Yöneticime gidecek ekranda projem bir anda 287 gün gecikmiş gibi görünüyor ve neden olduğunu anlamadım. Klasikte de "Sürüm" kutusunda "1" yazıyor; görev Pano'da tek başına "SÜRÜM 1 (01.01.2026–21.01.2026)" sütununa düştü, diğer bütün işler Sürüm 9–15'te. Üç kez üretildi (PUSULA ×2, ATLAS ×1 modern; PUSULA ×1 klasik).
- Kanıt: `ekran/modern-burak-gorev-01-proje.png` (önce) · `ekran/modern-burak-gorev-02-yeni.png` (form, Sürüm 1) · `ekran/modern-burak-gorev-04-ekle-hemen.png` (sonra) · `ekran/modern-burak-yetki-02-atlas-eklendi.png` · `ekran/klasik-burak-gorev-03-yeni.png` · `ekran/klasik-burak-gorev-06-pano.png` · depo: `{"name":"Saha cihazı pil tüketimi ölçümü","version":1,…}`
- Olası kök neden: `components/modern/TaskFormSheet.tsx:38` (`emptyDraft` → `version: 1`), `components/TaskFormModal.tsx:22` ve `:79` (`version: 1`); `utils/projectOverview.ts:63-68` (`currentSprint` açık görevi olan en küçük sürümü "şu anki" sayıyor).
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Tolga: görevi sonradan doğru sürüme taşıyınca kart düzeliyor mu; toplu içe aktarmada da Sürüm 1 mi geliyor?

### UI-AKS-02 · PY, başka PY'nin projesine "Dikkat gerektirenler"den girip görev ekleyebiliyor
- Önem: K2
- Ekran: Portföy › Dikkat gerektirenler → başka PY'nin projesi › Yeni görev          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak; PUSULA/NEHİR sahibi) · veri=pilot
- Adımlar: 1. Burak olarak Portföy'ü aç. 2. "Dikkat gerektirenler"de "ATLAS Karar Destek Sistemi — 15 görev terminini aştı"ya tıkla. 3. "Yeni görev" → ad yaz → "Görevi ekle".
- Beklenen: Burak yalnız kendi projelerini düzenleyebilsin; ATLAS (PY: Elif Yılmaz) ya hiç açılmasın ya da salt okunur açılsın, "Yeni görev" görünmesin.
- Gözlenen (insan dili): Kenar çubuğumda yalnız PUSULA ve NEHİR var, ama Portföy'deki uyarıya tıklayınca Elif'in ATLAS projesi açıldı ve "Yeni görev" düğmesi çalıştı: görev eklendi (128 → 129). Aynı sayfada "Haftalık durum" kartı benim için salt okunur, yani uygulama bu projenin benim olmadığını biliyor, ama görev eklememe izin veriyor. KALKAN'da (PY: Can Erdem) da aynı oldu (77 → 78). Klasikte bu projeler Portföy'de ve Ctrl+K aramasında görünmüyor (doğru).
- Kanıt: `ekran/modern-burak-dikkat-02-atlas.png` · `ekran/modern-burak-yetki-02-atlas-eklendi.png` · `ekran/modern-burak-yetki-03-kalkan-eklendi.png` · depo: `prj-atlas` 129 görev, `prj-kalkan` (pmPersonId=p17) 78 görev, ikisinde de "Burak tarafından …" kaydı
- Olası kök neden: `utils/todoItems.ts:80-92` uyarıları tüm `ws.projects` için üretiyor; `App.tsx:306-311` (`handleTodoNavigate`) kapsam bakmadan `activeProjectId` atıyor; `components/modern/ModernProjectHeader.tsx:98` ve `App.tsx:1545` (`newTask`) `canEditProjectContent` (`utils/rbac.ts:93`) denetimi yapmıyor; karşılaştırma için `ModernProjectOverview.tsx:225` (`canEdit`) durum kartını doğru kilitliyor.
- Kapsam: arayüzün tamamı (modern)
- Doğrulama: aday
- Devir: Tolga: aynı yoldan risk ekleme, görev silme, durum değiştirme, plan kaydetme deneyleri; müdür de proje sayfasında "Yeni görev" görüyor (`utils/rbac.test.ts:73`'e göre düzenleyememeli).

### UI-AKS-03 · Portföy "Dikkat gerektirenler" başkalarının projeleriyle dolu; bana dönük uyarılar en altta, gizli
- Önem: K2
- Ekran: Portföy › Dikkat gerektirenler          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak), mudur (ahmet) · veri=pilot (+ Selin'in iade ettiği rapor)
- Adımlar: 1. Burak raporunu gönderir, Selin gerekçeyle iade eder. 2. Burak olarak uygulamayı aç (Portföy). 3. "Dikkat gerektirenler"e bak; "Tümünü göster (12)".
- Beklenen: İlk görünen beş satırda önce **bana** düşen işler olsun (raporum iade edildi, rapor son günü); yalnız kendi projelerim; üstteki özet kartlarla çelişmesin.
- Gözlenen (insan dili): İlk üç satır benim olmayan projeler: "ATLAS — 15 görev terminini aştı", "KALKAN — 11 görev…", "KALKAN Siber İzleme kritik durumda…". Hemen üstündeki kart "Dikkat isteyen proje 2 · **Kritik proje yok**" diyor; aynı ekranda hem kritik proje yok hem KALKAN kritik. Selin'in raporumu iade ettiğini ancak "Tümünü göster"e basınca, 12 maddenin 6.'sında gördüm ("PUSULA — 45. hafta raporu iade edildi"); ardından "KALKAN/YILDIZ — 2026 planı henüz onaya gönderilmedi" gibi yine bana ait olmayan satırlar. Ahmet'te de kendisinden onay bekleyen tek iş ("PUSULA — 2026 planı onayınızı bekliyor") 7 maddenin 7.'si, görünmüyor.
- Kanıt: `ekran/modern-burak-acilis-01.png` · `ekran/modern-burak-iade-01-acilis.png` · `ekran/modern-burak-dikkat-01-tumu.png` · `ekran/modern-ahmet-portfoy-02-tumu.png`
- Olası kök neden: `utils/todoItems.ts:23-168` (`buildTodoItems` `visibleProjectIds` ile süzmüyor; `:168` sıralama yalnız önem + alfabe, "bana dönük" öncelik yok); `components/modern/ModernPortfolio.tsx:189` (ilk 5).
- Kapsam: arayüzün tamamı (modern Portföy; klasikte zil rozeti denetlenmedi)
- Doğrulama: aday
- Devir: —

### UI-AKS-04 · Aşırı tahsis sayısı ekrandan ekrana değişiyor (34 → 9 kişi → 37)
- Önem: K2 (ölçekteki "yanlış rakam" tanımına göre K1 adayı; uzlaşmada sorulsun)
- Ekran: Portföy › Dikkat gerektirenler → Ekip ve tahsis (Doluluk, Bölüm özeti, Araçlar › Kapasite–talep); klasik Tahsis          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet), bolum_sorumlu (selin) · veri=pilot
- Adımlar: 1. Ahmet olarak Portföy → "Tümünü göster (7)". 2. "2026 planında 34 aşırı tahsis (kişi-ay) var"a tıkla. 3. Açılan Ekip ve tahsis'te Görünüm → "Bölüm özeti" ya da Araçlar → "Kapasite–talep".
- Beklenen: Aynı kavram (2026 planı, tüm projeler, tüm birimler) her ekranda aynı sayı; birim farklıysa (kişi / kişi-ay) açıkça yazsın.
- Gözlenen (insan dili): Portföy "34 aşırı tahsis (kişi-ay)" dedi. Tıkladım; açılan ekran "Kapasite aşımı **9** kişi". Bölüm özetine geçtim: "2026 planında **37** aşırı tahsis". Kapasite–talep ve klasik Tahsis de 37 diyor. Müdür olarak hangisini toplantıya götüreceğimi bilemedim. İki kez üretildi (Ahmet modern; Selin modern + klasik 37).
- Kanıt: `ekran/modern-ahmet-portfoy-02-tumu.png` (34) · `ekran/modern-ahmet-kapasite-02-asiri-tik.png` (9 kişi) · `ekran/modern-selin-doluluk-02-bolum-ozeti.png` (37) · `ekran/modern-ahmet-kapasite-03-kt.png` (37) · `ekran/klasik-selin-doluluk-01.png` (37)
- Olası kök neden: `utils/todoItems.ts:128` `findOverAllocations(yearAllocations, ws.people, year, 'plan')` izinleri (`leaves`) geçirmiyor; `components/AllocationView.tsx:152` aynı işlevi `leaves` ile çağırıyor (izin düşülmüş kapasite). 34 ile 37 arasındaki 3 kişi-ay izin aylarından geliyor olmalı.
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: —

### UI-AKS-05 · Görev eklenince "kaydedildi" izi yok; yeni görev görünür yerde değil
- Önem: K3
- Ekran: Proje › Yeni görev (modern) · Görevler › Yeni Görev (klasik)          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. PUSULA'yı aç. 2. Yeni görev → ad yaz → "Görevi ekle" (klasik: "Kaydet"). 3. Ekrana bak.
- Beklenen: "Görev eklendi" bildirimi ve/veya yeni görevin vurgulanarak gösterilmesi ("Görüntüle" bağlantısı).
- Gözlenen (insan dili): Pencere kapandı, başka hiçbir şey olmadı; bildirim yok, `role=status` yok. Modernde yalnız küçük sayaçlar değişti (28 → 29, 104 → 105). Eklediğimi görmek için "Liste" sekmesine geçip "Yapılacak" grubunun en altına kadar kaydırdım; görevin numarası bile yok (diğerleri "PSL-75", benimki yalnız "U310"). Klasikte başlık "Görev Listesi (105)" oldu; görev 105 kartın sonuncusu (sayfanın ~7400 px aşağısı). Haftalık raporda ise "Kaydedildi." ve "Bölüm sorumlusuna gönderildi." açıkça yazıyor; görevde neden yok?
- Kanıt: `ekran/modern-burak-gorev-05-ekle-sonra.png` · `ekran/modern-burak-gorev-06-liste.png` · `ekran/klasik-burak-gorev-05-kaydet-sonra.png` · ölçüm: canlı bölge 0; yeni kart y≈7430 px (sayfa görünümü 900 px)
- Olası kök neden: bilinmiyor (görev kaydetme sonrası bildirim çağrısı yok; `App.tsx` görev kaydetme işleyicisi)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Tolga: "Görevi ekle"ye iki kez basınca iki görev oluşuyor mu (geri bildirim olmadığı için kullanıcı tekrar basabilir).

### UI-AKS-06 · Klasik arayüzde görev formunda "Termin" alanı yok
- Önem: K3
- Ekran: Proje › Görevler › Yeni Görev / Düzenle          Arayüz: klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Klasik arayüzde PUSULA'yı aç → "Görevler". 2. "Yeni Görev". 3. Formda termin/bitiş tarihi ara.
- Beklenen: Modern formdaki "Termin" (ve "Kayıt türü") klasikte de olsun; aynı iş iki arayüzde yapılabilsin.
- Gözlenen (insan dili): Klasik formda Görev Adı, Jira Kayıt No, Atanan Kişi, Birim, İş Paketi, Hedef/Anahtar Sonuç, Öncelik, Durum, Sürüm, Öncül Görev, Zaman Tahmini, Etiketler, Açıklama var; **termin yok**. Portföy'ü "termini aşan görevler" üzerinden okuyan bir sistemde görevin terminini klasikte veremiyorum. Modernde aynı formda "Termin" var.
- Kanıt: `ekran/klasik-burak-gorev-03-yeni.png` · `ekran/modern-burak-gorev-02-yeni.png` · alan listesi (betik 24 çıktısı)
- Olası kök neden: `components/TaskFormModal.tsx` (termin alanı yok; `:46` yalnız düzenlemede `dueDate`'i koruyor) ↔ `components/modern/TaskFormSheet.tsx:189` ("Termin")
- Kapsam: tek ekran (klasik görev formu)
- Doğrulama: aday
- Devir: —

### UI-AKS-07 · Müdür "Haftalık rapor"da 4 hafta önceki raporu "bu haftanın" başlığıyla görüyor
- Önem: K3
- Ekran: Haftalık rapor (müdür görünümü)          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot (bugün 45. hafta; son yayın 41. hafta)
- Adımlar: 1. Ahmet olarak "Haftalık rapor". 2. Rehberi kapat. 3. Başlığa ve hafta seçiciye bak.
- Beklenen: Bu hafta açılsın ve "Bu haftanın raporu henüz yayınlanmadı; son yayınlanan: 41. hafta" denilsin; ya da eski hafta açılıyorsa bu açıkça söylensin.
- Gözlenen (insan dili): Alt başlık "Enstitü genelinde **bu haftanın** gelişmeleri…" diyor, altında "41. hafta · 5–9 Eki" raporu açık. Yalnız küçük yeşil "Yayınlandı · 22 gün önce" etiketi ipucu veriyor. Hızlı okuyan bir müdür bunu bu haftanın raporu sanır. Sağ üstteki "Bu hafta"ya basınca "Bu haftanın raporu henüz yayınlanmadı" çıkıyor. Klasikte aynısı.
- Kanıt: `ekran/modern-ahmet-gizlilik-04-haftalik.png` · `ekran/modern-ahmet-haftalik-02-bu-hafta.png` · `ekran/klasik-ahmet-haftalik-01.png`
- Olası kök neden: `components/modern/ModernWeeklyReport.tsx:119-122` (müdür için başlangıç haftası `latestPublication`), `:264` (sabit "bu haftanın" metni)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: —

### UI-AKS-08 · "Haftalık rapor", "Haftalık durum", "Durum raporu": üç ayrı şey, birbirine çok benzeyen adlar
- Önem: K3
- Ekran: Proje başlığı "Durum raporu" düğmesi · Genel bakış "Haftalık durum" kartı · kenar çubuğu "Haftalık rapor"          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. PUSULA'yı aç. 2. Sağ üstteki "Durum raporu"na bas. 3. Kenar çubuğundaki "Haftalık rapor"u aç.
- Beklenen: PY'nin haftalık raporu yazıp gönderdiği tek bir yer ve tek bir ad; diğerleri (yönetim için kısa durum notu, e-posta metni) ayırt edici adlarla.
- Gözlenen (insan dili): "Durum raporu" düğmesi "**Haftalık durum raporu**" başlıklı, "E-posta" ve "Kopyala" düğmeli bir pencere açıyor. İlk günümde "haftalık raporu gönder" işini burada yapıp e-postayla gönderdim sanabilirdim; asıl onay akışı (bölüm sorumlusu → PYB destek) kenar çubuğundaki "Haftalık rapor"da. Genel bakışta bir de "Haftalık durum · Yönetim ekranında bu görünür" kartı var (Yolunda/Riskli/Kritik + not). Klasikte aynı üçlü: "Durum Raporu" → "Haftalık Durum Raporu", portföy kartında "Haftalık Durum", üst menüde "Haftalık Rapor".
- Kanıt: `ekran/modern-burak-terim-02-durum-raporu.png` · `ekran/modern-burak-gorev-01-proje.png` · `ekran/modern-burak-haftalik-03-rapor.png` · `ekran/klasik-burak-terim-04-durum-raporu.png` · `terimler.md`
- Olası kök neden: `components/modern/ModernProjectHeader.tsx:94-96`, `components/modern/ModernProjectOverview.tsx:225`, `components/PortfolioView.tsx:216` (adlandırma)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: —

### UI-AKS-09 · Bölüm sorumlusu doluluk ekranında kendi bölümünü bulamıyor
- Önem: K3
- Ekran: Ekip ve tahsis (modern) · Tahsis / İşgücü Tahsisi (klasik)          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=bolum_sorumlu (selin, Yazılım Geliştirme) · veri=pilot
- Adımlar: 1. Selin olarak "Ekip ve tahsis". 2. Kendi bölümünün doluluğunu ara. 3. "Kapasite aşımı 9" kartına tıkla. 4. "Birim" süzgecini aç.
- Beklenen: Ekran varsayılan olarak benim bölümümle açılsın ya da süzgeçte bölüm adları yazsın ("U310 — Yazılım Geliştirme"); aşım kartı tıklanınca aşımdaki kişileri göstersin.
- Gözlenen (insan dili): Ekran "24 kişi" ile açılıyor; en üstte müdür Ahmet Şahin (U300), sonra Veri ve Yapay Zekâ'dan Aslı Çakır (U340)… Benim bölümüm hangisi? "Birim" süzgecinde yalnız "U300, U310, U320, U330, U340" yazıyor; "Bölüm özeti"nde de sütun başlığı "Bölüm" ama satırlar yine kod. Bölüm adlarını ancak Veri havuzu'na gidince ("U310 — Yazılım Geliştirme") öğrendim (1 geri dönüş). "Kapasite aşımı 9" kartı tıklanmıyor (1 yanlış tıklama). Klasikte süzgecin adı bu kez "Tüm Bölümler", içerik yine kod. Rol adım "Bölüm sorumlusu", ekran bana "Birim" diyor.
- Kanıt: `ekran/modern-selin-doluluk-01.png` · `ekran/modern-selin-doluluk-02-bolum-ozeti.png` · `ekran/modern-burak-gizlilik-01-veri-havuzu.png` · `ekran/klasik-selin-doluluk-01.png`
- Olası kök neden: `components/modern/ModernAllocation.tsx:238-239` (süzgeç yalnız kod, ad "Birim"); `utils/rbac.ts:83-89` `visiblePersonIds` bölüm sorumlusunu kendi bölümüyle sınırlıyor ama tahsis ekranlarında kullanılmıyor (yalnız `components/CalendarView.tsx:33`).
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: —

### UI-AKS-10 · Klasik arayüzde İngilizce durum/öncelik, "MEDİUM/HİGH" ve "Tüm Kaynak Adıler"
- Önem: K3
- Ekran: Proje › Görevler (kartlar, süzgeçler, Yeni Görev formu), Pano          Arayüz: klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Klasikte PUSULA → "Görevler". 2. Kartlara ve süzgeçlere bak. 3. "Yeni Görev" → Öncelik ve Durum açılır listelerini aç.
- Beklenen: Modern arayüzdeki gibi Türkçe: Engelleyici/Yüksek/Orta/Düşük; Bekleyen/Yapılacak/Süreçte/Tamamlandı; düzgün çoğul.
- Gözlenen (insan dili): Kartlarda öncelik "MEDİUM", "HİGH", "LOW" (İngilizce ve Türkçe büyük harf kuralıyla noktalı İ). Formda Öncelik "Blocker/High/Medium/Low", Durum "Backlog/ToDo/InProgress/Done"; ama kartın altındaki durum seçicisi "Tamamlandı", listenin süzgeci "Backlog/Yapılacak/Süreçte/Tamamlandı". Süzgeçte "Tüm **Kaynak Adıler**" yazıyor. Pano'da "TASK", "HAVUZ • BACKLOG". Modernde bunların hepsi Türkçe.
- Kanıt: `ekran/klasik-burak-gorev-02-gorevler.png` · `ekran/klasik-burak-gorev-03-yeni.png` · `ekran/klasik-burak-gorev-06-pano.png` · `ekran/modern-burak-gorev-02-yeni.png`
- Olası kök neden: `components/TaskCard.tsx:33` (ham `task.priority` + CSS `uppercase`, `tr` dilinde i→İ); `components/FilterDropdown.tsx:23` (`` `Tüm ${label}ler` ``); `components/TaskFormModal.tsx` seçenekleri ham enum değerleri.
- Kapsam: arayüzün tamamı (klasik)
- Doğrulama: aday
- Devir: —

### UI-AKS-11 · Modernde "Müşteri istekleri" ve "Günlük" Diğer menüsüne gömülü, aramada da çıkmıyor
- Önem: K3
- Ekran: Proje sekmeleri › "Diğer" · Ctrl+K arama          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Modernde PUSULA'yı aç; sekmelerde müşteri isteklerini ara. 2. Ctrl+K → "istek" yaz; sonra "not" yaz. 3. "Diğer" menüsünü aç.
- Beklenen: Klasikteki gibi görünür bir sekme ya da en azından aramada "Müşteri istekleri" / "Günlük" sonucu.
- Gözlenen (insan dili): Sekmelerde (Genel bakış, Pano, Liste, Zaman çizelgesi, Planlama, Riskler, Ekip) yoklar; üç tıklamada bulamayınca "yok" dedim ve önce aradım: "istek" yazınca "Planlama asistanı — ATLAS", "İş Paketleri — ATLAS" (benim projem bile değil) çıktı; "not" yazınca da öyle. Sonunda "Diğer"in içinde "Müşteri istekleri" ve "Günlük"ü buldum. Klasikte ikisi de proje çubuğunda üst düzey sekme ("İstekler", "Günlük"). (5 tıklama, 2 yanlış yol, ~1 dk 30 sn)
- Kanıt: `ekran/modern-burak-gorev-01-proje.png` · `ekran/modern-burak-gizlilik-04-ara-not.png` · `ekran/modern-burak-gizlilik-05-proje-diger.png` · `ekran/klasik-burak-gizlilik-01-istekler.png`
- Olası kök neden: bilinmiyor (modern proje sekme listesi ve komut paleti dizini)
- Kapsam: arayüzün tamamı (modern)
- Doğrulama: aday
- Devir: —

### UI-AKS-12 · Klasik ↔ modern gezinme adları farklı; klasikte aynı ad iki ayrı ekranı açıyor
- Önem: K3
- Ekran: Üst/yan gezinme ve proje sekmeleri          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Modernde gezinme adlarını topla. 2. "Diğer araçlar → Klasik arayüze dön". 3. Klasikte aynı ekranları bul.
- Beklenen: Aynı ekran iki arayüzde aynı adla; bir düğmenin adı açtığı sayfanın başlığıyla aynı.
- Gözlenen (insan dili): Modern "Ekip ve tahsis" klasikte "Tahsis" (sayfa başlığı "İşgücü Tahsisi"); modern "Risk raporu" klasikte "Riskler" (başlık yine "Risk raporu"); klasikte proje çubuğunda bir "Riskler" daha var ve o da "Risk Kaydı" açıyor: aynı başlıkta iki "Riskler". Modern "Liste" ↔ klasik "Görevler" ("Görev Listesi"); klasik "Pano"nun başlığı "Sürüm Planlama"; modern "Asistan (tam ekran)" ↔ klasik "Zekâ". Arayüz değiştirince kaldığım proje ve ekran korunuyor (iyi), ama aradığım düğmenin adı değişiyor.
- Kanıt: `ekran/klasik-burak-acilis-01.png` · `ekran/klasik-burak-terim-03-riskler.png` · `ekran/klasik-burak-gecis-02-sonra.png` · `ekran/modern-burak-terim-01-risk-raporu.png` · `terimler.md`
- Olası kök neden: bilinmiyor (iki gezinme bileşeninde ayrı etiketler)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: —

### UI-AKS-13 · Sayfayı yenileyince proje ve sekme kayboluyor, Portföy'e dönülüyor
- Önem: K3
- Ekran: Tüm proje ekranları          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. PUSULA → "Liste" (modern) ya da PUSULA → "Riskler / Risk Kaydı" (klasik). 2. F5 / sayfayı yenile.
- Beklenen: Aynı proje ve aynı sekme açılsın.
- Gözlenen (insan dili): Modernde yenileyince Portföy açıldı; görev listemi ve süzgeçlerimi yeniden bulmam gerekti. Klasikte proje başlıkta seçili kalıyor ama ekran yine "Proje Portföyü". Uzun bir formu ya da raporu okurken yanlışlıkla yenilersem yerimi kaybediyorum.
- Kanıt: `ekran/modern-burak-gorev-06-liste.png` → `ekran/modern-burak-gorev-07-yenile.png` · `ekran/klasik-burak-gecis-02-sonra.png` → `ekran/klasik-burak-gecis-03-yenile.png`
- Olası kök neden: `App.tsx:151` (`currentView` her açılışta `View.Portfolio`; kalıcı değil)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Tolga: haftalık rapor yazarken yenileme/geri tuşu → "Kaydedilmedi" taslak kayboluyor mu?

### UI-AKS-14 · Açıklanmamış kısaltmalar ve kodlar
- Önem: K4
- Ekran: Proje Genel bakış, Yeni görev, Haftalık rapor, Ekip ve tahsis          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py, bolum_sorumlu, mudur · veri=pilot
- Adımlar: 1. PUSULA Genel bakış "Proje sağlığı" kartını oku. 2. Haftalık rapor rehberini ve "Madde ekle" türlerini oku. 3. Ekip ve tahsis / Kapasite–talep'i oku.
- Beklenen: Kısaltma ilk geçtiği yerde açılsın ya da üzerine gelince açıklama olsun (uygulama raporlarda kısaltmaların açılmasını kendisi şart koşuyor).
- Gözlenen (insan dili): "Takvim gerisinde (SPI 0,79)" — SPI'yi bilirim ama ilk günündeki biri bilmez. Rehber "PYB destek biçimine bakar" diyor, PYB açılmıyor. Madde türünde "Toplantı, sunum, tanıtım (İG / müşteri)" — İG ne? Görev formunda "İP1 Analiz ve Tasarım", klasik tahsiste "Personel / İP / Rol", Kapasite–talep'te "0,9 AA", aşırı tahsis satırında "Aslı Çakır (Oca: 0,7/0,5)", her yerde "U310" kodları. İade penceresi örneğinde "“KYS” kısaltmasını açın" yazarken uygulamanın kendisi kısaltmaları açmıyor.
- Kanıt: `ekran/modern-burak-gorev-01-proje.png` · `ekran/modern-burak-haftalik-01.png` · `ekran/modern-burak-haftalik-04-madde.png` · `ekran/modern-ahmet-kapasite-03-kt.png` · `terimler.md`
- Olası kök neden: bilinmiyor (metinler)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: —

---

## Kısa notlar

- "Yaklaşan terminler" kartı yalnız geçmişteki terminleri listeliyor ("37 gün gecikti"); başlık "Geciken" olmalı ya da gerçekten yaklaşanlar da gösterilmeli (`modern-burak-gorev-01-proje.png`).
- Modern Portföy'de YILDIZ "beklemede" sayılıyor (süzgeçte "Teklif aşaması" yok); klasikte aynı proje "Teklif Aşaması" (`klasik-ahmet-portfoy-01.png`).
- Haftalık rapor rehberi (7 adım) taze oturumda her rol için kendiliğinden açılıyor; örnekte pilotta olmayan "Safir Posta" projesi geçiyor.
- Ctrl+K: "ATLAS" yazınca (klasik, Burak) ATLAS yerine "İş Paketleri — KALKAN Siber İzleme" ilk sırada; "not"/"istek" aramaları başka PY'nin projesine ait komutları öneriyor.
- Klasikte proje "Aç" ile açılınca "Pano" değil "Yol Haritası" geliyor; modernde "Genel bakış". İki arayüzün proje açılış ekranı farklı.
- Ekip ve tahsis varsayılanı: modern "Doluluk", klasik "Tahsis Tablosu".
- Klasik Tahsis tablosunda hücrelerde ondalık nokta ("0.8"), başlık ve toplamlarda virgül ("0,7/0,5", "9,44").
- Veri havuzunda "Ünvan" (TDK: "unvan"); Ahmet'in ünvanı "Birim Yöneticisi", rolü "Müdür".
- Kenar çubuğunda proje sırası oturumdan oturuma değişiyor (PUSULA/NEHİR yer değiştirdi).
- Klasik portföy kartında PY, "Proje Yön." açılır listesinden proje sahibini değiştirebilir görünüyor (denenmedi → Tolga).
- "Görüşmeler" ekranının başlığı "Müşteri görüşmeleri", "Beklentiler"in başlığı "Yönetimden beklentiler"; menü adları başlığı tam anlatmıyor.
- Kapasite–talep ekranında karar verdirecek bir eylem yok (yalnız tablo); müdürün "karar ver" işi bu ekranda bitmiyor.
- Olumlu: haftalık rapor gönder / iade / onay akışında geri bildirim açık ("Kaydedildi.", "Bölüm sorumlusuna gönderildi.", "Rapor iade edildi.", "Onaylandı, PYB desteğe gönderildi."); iade gerekçesi zorunlu ve PY'nin raporunun başında "İade edildi — Selin Kaya" ile görünüyor.
- Olumlu: arayüz değiştirince proje ve ekran korunuyor (modern Riskler → klasik Risk Kaydı).
- Olumlu (rol görünürlüğü): müdür, modern "Diğer" menüsünde ve klasik proje çubuğunda Müşteri istekleri / Günlük'ü görmüyor; Ctrl+K'da istek içeriği ("karanl…") aranınca sonuç çıkmıyor.
- Ortam: `cdn-icons-png.flaticon.com` yüklenemedi (bulut ortamı ağ kısıtı, bulgu değil). Tarih alanı tr-TR yerelinde "mm/dd/yyyy" gösteriyor; başsız Chromium'un yerel ayarından olabilir, gerçek tarayıcıda doğrulanmalı.
