# Tolga (ui-kirici) · Tur 1 bulguları (ikinci koşu) · 2026-11-06

Kod: `claude/zealous-tesla-hidbc9@8fb563d` · port 4183 · Chromium (playwright-core), `tr-TR`, `Europe/Istanbul`, 1440×900.
Betikler: `ui-testi/2026-11-06/tolga/betik/` (01–25, yardımcı `y.mjs`) · ölçümler ve konsol: `konsol/` · görüntüler: `ekran/` · üretilen dosyalar: `veri/` (`yedek/`, `aktar/`, ham depo indirmeleri).
Veri: `pilot`, `asiri` (önceki koşudan), kendi bozuk yedek ve içe aktarma dosyalarım. 30 betik çalıştırması (yeniden çalıştırmalar dahil).
Yeniden sınama sonuçları ayrı dosyada: `regresyon.md` (13 düzeldi · 3 kısmen · 1 yeni sorun).

Ortak koşul (aksi yazılmadıkça): sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic · ekran=1440×900 · veri=pilot.

## Koşu özeti: saldırı × sonuç

| Saldırı | Sonuç |
|---|---|
| Depo `meta`: format 2, format `"1"`, yok, `null`, yarım JSON metni, `projectIds` yok, alan türleri bozuk | dayandı (kurtarma ekranı, depo dokunulmadı) |
| Depo `meta`: `workspace` alanı tümüyle yok | dayandı ama sessiz (boş çalışma alanı açılıyor; veri zaten yoktu; Kısa notlar) |
| Depo proje kaydı: yarım JSON metni | **bozuldu** (UI-KRC-21) |
| Depo proje kaydı: `risks:"metin"` | **bozuldu** (UI-KRC-22) |
| Depo proje kaydı: `tasks` yok, `tasks:"metin"`, görev `null`, ad nesne, süre metin, termin bozuk | dayandı |
| Depo proje kaydı: 40 MB açıklama | dayandı (açılış ~15 sn) |
| Kurtarma ekranı: Yeniden dene (dışarıdan düzeltilince), sil düğmesi onaysız kapalı, çift tık | dayandı |
| Kurtarma ekranı: Ham veriyi indir → Veriyi sil → Yedekten yükle | **bozuldu** (UI-KRC-20) |
| Site verisi tamamen engelli; kurtarma ekranında "Veriyi sil" | dayandı ama metin yanıltıcı (Kısa notlar) |
| Hatırlanan ekran: `sessionStorage` `999`, `-1`, `abc`, boş, JSON, `1e309`; silinmiş etkin proje | dayandı |
| Tek etkin sekme: 2 ve 3 sekme, etkin sekmeyi kapatma, dondurma (CDP), aynı anda açılış, 6 sn meşgul ana iş parçacığı, 6 tur ping-pong | dayandı (tek yazar, depo tutarlı) |
| Tek etkin sekme: kaydedilmemiş rapor taslağı / açık görev formu varken devir | **bozuldu** (UI-KRC-19) |
| Rapor taslağı: kenar çubuğu, Ctrl+K, profil değiştir, klasik arayüz, yenile, geri, sekme kapat | dayandı (onay / beforeunload) |
| Görev formu ve görev düzenleme: Esc, arka plan, Ctrl+K+Esc, Ctrl+K → Takvim | dayandı (onay) |
| Yeni risk / Yeni müşteri görüşmesi / Yeni beklenti: Esc, arka plan, Ctrl+K | **bozuldu** (UI-KRC-24) |
| Ondalık süre: `1,5`, `1.5`, `0,5`, `2.5`, `1,25`, `  2 ` | dayandı |
| Ondalık süre: `1e3`, `-5`, `-0`, `٫5`, `١٫٥`, `1.234,5`, `1e12` | sessiz düzeltme (Kısa notlar) |
| Yedekten yükle: 12 tuhaf dosya (boş, `null`, `[]`, `{}`, BOM, `__proto__`, görevsiz/çıplak/null görev, `people:null`) | dayandı; `people:null` sessiz (UI-KRC-08 kısmen) |
| Excel içe aktarma: uygulamanın kendi dışa aktardığı dosyayı geri yükleme (×2) | **bozuldu** (UI-KRC-18) |
| Jira CSV içe aktarma: uygulamanın kendi Jira CSV dışa aktarımı | **bozuldu** (UI-KRC-25) |
| Jira CSV: noktalı virgül, yalnız başlık, boş, 3000 satır + HTML, yinelenen anahtar | dayandı (3000 satır 4,7 sn; `onerror` çalışmadı); yinelenen anahtar UI-KRC-18'de |
| Jira CSV: kapanmayan tırnak | sessiz bozuk kayıt (Kısa notlar) |
| Excel: çöp bayt, CSV'nin adı .xlsx, boş .xlsx; CSV şablonu: yanlış dosya | dayandı (hata bandı) |
| Salt okunur roller, modern (ahmet, mert): düğme, Ctrl+K, 5 kısayol, liste, pano sürükle, durum notu | dayandı (yazma yolu yok, depo değişmedi) |
| Salt okunur roller, klasik (ahmet, mert): Sil, Düzenle | **bozuldu** (UI-KRC-23: sahte "silindi", düzenleme sessizce atılıyor) |
| Sahiplik devri: klasik ok tuşu + vazgeç, modern proje bilgileri | dayandı (onay, geri dönüyor) |
| Silme çift tık: klasik görev (çift/üçlü/onayla-tekrar), proje, modern menü | dayandı |
| Çevrimdışı: tek ziyaret, iki yenileme, çevrimdışı yazma + yenileme, derin yol | dayandı |
| Asılı ağ (her istek 25 sn) | denenemedi: `context.route` servis çalışanı isteklerini yakalamadı (sayfa 0,9 sn'de açıldı) |
| Aşırı veride taşma: filtre seçimleri, Pano kartı, Kapasite–talep, klasik üst çubuk | dayandı (UI-KRC-10/-11/-12/-17 düzeldi) |

Bulgu sayısı: **K1: 1 · K2: 5 · K3: 2** (toplam 8) + Kısa notlar.

---

### UI-KRC-18 · Excel'den içe aktarma her seferinde bütün görevleri yeniden ekliyor: dışa aktarılan dosya geri yüklenince 100 görev 200, sonra 300 oluyor
- Önem: K1
- Ekran: Proje › Liste › "İçe / dışa aktar" › "Excel dosyasından"          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. NEHİR › Liste › İçe / dışa aktar › Dışa aktar › "Excel". 2. Aynı pencereden "Excel dosyasından" ile indirilen dosyayı seç. 3. Aynı dosyayı bir kez daha seç.
- Beklenen: Uygulama aynı Jira anahtarlı görevleri tanır ve günceller ya da atlar. En azından önizleme/onay gösterir ("100 görevin 100'ü zaten var"), işlemden sonra geri almaya izin verir. "Excel'de düzenle, geri yükle" yaygın bir iş akışı.
- Gözlenen (insan dili): Yeşil bant "100 görev içe aktarıldı." diyor ve NEHİR'in görev sayısı 100 → 200 oluyor, ikinci yüklemede 300. NHR-1 artık listede üç kez var, aynı ad, aynı kişi, aynı anahtarla. Önizleme, onay ya da "Geri al" yok. Yenilemeden sonra da 300. İlerleme yüzdesi, gecikme sayısı ve iş yükü bu kopyalarla hesaplanıyor (yanlış rakam). Kaynak listesi de her yüklemede yeniden ekleniyor. Komşu yol: Jira CSV ile mevcut bir anahtar (`NHR-1`) yüklemek de güncellemiyor, yeni bir NHR-1 ekliyor. Aynı dosyada iki kez geçen anahtar (`KRC-9`) iki görev olarak giriyor.
- Kanıt: `ekran/12-ice-excel-sonra.png`, `ekran/13-excel-disa-excel-proje-verileri-yedek.png` · ölçüm: `konsol/12-ice-aktar-akis.json` (`gorev 100 → 200`), `konsol/13-ice-aktar-tuhaf.json` (1. satır `100 → 200, nhr1Sayisi 2, geriAl []`; 2. satır `200 → 300, nhr1Sayisi 3`; `jira-mevcut-anahtar` `504 → 505`; yenile 3505) · 3/3 üretildi
- Olası kök neden: `App.tsx:1884` ve `App.tsx:1902` (`onDataImport` → `setTasks(prev => [...prev, ...nt])`, `setResources(prev => [...prev, ...nr])`; anahtar karşılaştırması yok), `components/modern/ModernTaskList.tsx:84-96` (`handleFile` doğrudan aktarıyor; önizleme, onay ve geri alma yok)
- Kapsam: arayüzün tamamı (Excel ve Jira CSV; klasik "CSV'den Aktar" aynı `onDataImport`'u kullanıyor)
- Doğrulama: aday
- Devir: Cem: kullanıcı yeniden içe aktarmada "güncelle" mi bekler, "ekle" mi? Ölçekteki K1 örneği ("iki kez basınca iki görev") ile aynı sınıf; uzlaşmada K2 tartışılabilir.

### UI-KRC-19 · Sekme devrinde ("Burada kullan") kaydedilmemiş rapor taslağı ve açık form uyarısız siliniyor; eski sekme "Çalışmanız kaydedildi" diyor
- Önem: K2
- Ekran: Haftalık rapor düzenleyici, görev formu → "PlanAsistan başka bir sekmeye geçti" ekranı          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. A sekmesinde Haftalık rapor › NEHİR, "Madde ekle" ile bir madde yaz (Kaydet'e basma). 2. Aynı uygulamayı B sekmesinde aç, "Burada kullan"a bas. 3. A'ya dön, "Burada kullan"a bas.
- Beklenen: Devir, kaydedilmemiş iş olduğunu A'ya sorar ya da taslağı saklar. Kenar çubuğu, Ctrl+K ve yenilemede bu zaten soruluyor. Eski sekme, kaydedilmeyen bir şey varsa "kaydedildi" demez.
- Gözlenen (insan dili): A hiçbir şey sormadan "PlanAsistan başka bir sekmeye geçti — Çalışmanız kaydedildi ve uygulama başka bir sekmede açıldı" ekranına geçiyor. Yazılan madde depoda yok, B'de yok. A geri alındığında Haftalık rapor listesine dönüyor, taslak da yok. Aynısı açık görev formunda oluyor: "Görevi ekle"ye basılmadan devredilen formdaki görev kayboluyor. Kullanıcı ekranda "kaydedildi" yazısını gördüğü için aramıyor. Not: Devrin kendisi sağlam. Dondurma, eşzamanlı açılış, meşgul ana iş parçacığı ve ping-pong'da tek yazar kaldı. Sorun yalnız kaydedilmemiş (formdaki) içeriğin denetlenmemesi.
- Kanıt: `ekran/06-sekme-devral.png`, `ekran/19-p1-a-geri-alinca.png` · ölçüm: `konsol/06-rapor-taslak.json` → `sekme-devral` (`yerelDiyalog []`, `taslakDepoda false`), `konsol/19-rapor-sekme-P1P2P3.json` → P1 (`aDiyalog []`, `depoda false`, geri alınca `taslak false`), `konsol/05-sekme-yaris-S4S5.json` → S4 (görev formu, `depo []`, A "Çalışmanız kaydedildi") · 3/3 üretildi
- Olası kök neden: `utils/tabLock.ts:80-102` (devral iletisinde `beforeRelease` yalnız bekleyen depo yazımlarını bitiriyor; `useUnsavedGuard` ile işaretlenen kirli durum sorulmuyor ya da saklanmıyor), `components/OtherTabNotice.tsx:26` (koşulsuz "Çalışmanız kaydedildi")
- Kapsam: arayüzün tamamı (useUnsavedGuard kullanan iki form: görev formu ve haftalık rapor)
- Doğrulama: aday (UI-KRC-02 "yeni sorun" ve UI-KRC-04 "kısmen" kararlarının ayrıntısı)
- Devir: Cem: devirde ne görmek isterdi ("A'da kaydedilmemiş rapor var, yine de devral?")? Ece: devir ekranında odak.

### UI-KRC-20 · Kurtarma ekranının "Ham veriyi indir" dosyası uygulamaya geri yüklenemiyor; "Veriyi sil ve baştan başla"dan sonra veri geri gelmiyor
- Önem: K2
- Ekran: "Kayıtlı çalışma alanınız açılamadı" kurtarma ekranı → Diğer araçlar › Yedekten yükle          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak), yüklemede admin · veri=pilot (depo bozuk)
- Adımlar: 1. Depo kaydı tanınmayan ya da bozuk olsun (ör. `meta.format=2` ya da `allocations:"metin"`): kurtarma ekranı açılır. 2. "Ham veriyi indir" (1,4 MB; 24 kişi, 411 görev). 3. "Kayıtlı verinin silineceğini anlıyorum" + "Veriyi sil ve baştan başla". 4. Yönetici kimliğiyle Diğer araçlar › Yedekten yükle › indirilen dosya.
- Beklenen: Ekran "İndirdiğiniz dosya… veri bu dosyadan geri kazanılabilir" ve "Geri alınamaz; önce ham veriyi indirin" diyor. Kullanıcı bunu yaptıysa aynı dosyayla verisine dönebilmeli: Yedekten yükle ham dosyayı tanımalı ya da kurtarma ekranında "Bu dosyadan geri yükle" olmalı.
- Gözlenen (insan dili): Yedekten yükle "Yedek yüklenemedi: Dosya ne çalışma alanı ne de eski proje yedeği formatında." diyor. Çalışma alanı silme sonrası hâliyle kalıyor: 1 örnek proje, 5 görev, 0 kişi. Kullanıcı ekranın söylediği her adımı yaptı, yine de 411 görevi ve 24 kişiyi geri alamıyor. Kod tabanında bu dosya türünü okuyan bir içe aktarma yok. Aynı "Ham veriyi indir" düğmesi hata ekranında da var (UI-KRC-22), orada da aynı çıkmaz.
- Kanıt: `ekran/03-b-sil-sonra.png`, `ekran/03-b-ham-yedekten-yukle.png`, `ekran/21-a-ham-yuklenemedi.png` · ölçüm: `konsol/03-kurtarma-ABCD.json` → B (`indir {ad: planasistan-ham-depo-2026-11-06.json, boyut 1426678, ust [tur, disaAktarim, kayitlar]}`, `yukleSonra.diyalog`), `konsol/21-kurtarma-tekrar-abcde.json` → a (`ham {kayitlar 6, kisi 24, gorev 411}`, aynı uyarı); dosyalar `veri/ham-indir-format2.json`, `veri/ham-indir-alan-bozuk.json` · 2/2 üretildi (iki farklı bozulma)
- Olası kök neden: `utils/workspace.ts:189-207` (`parseImportedJson` yalnız `{projects, schemaVersion}` ve `{tasks|resources}` tanıyor), `utils/workspaceStore.ts:68` (ham döküm biçimi `{tur:'planasistan-ham-depo', kayitlar}`; karşılığı olan bir okuyucu yok)
- Kapsam: tüm arayüzler (kurtarma ve hata ekranı ortak)
- Doğrulama: aday
- Devir: Cem: "veri bu dosyadan geri kazanılabilir" cümlesini kullanıcı "ben geri yükleyebilirim" diye mi okur? Uzlaşmada K1 (talimata uyan kullanıcıda veri kaybı) tartışılabilir.

### UI-KRC-21 · Bozuk proje kaydı açılışta uyarısız gizleniyor, ilk kayıtta depodan kalıcı olarak siliniyor
- Önem: K2
- Ekran: açılış, Portföy          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot (bir proje kaydı bozuk)
- Adımlar: 1. Depoda `project:prj-pusula` kaydını yarıda kesilmiş JSON metniyle değiştir (kaydın ilk 5000 karakteri: ad, kod, görevlerin bir kısmı). 2. Uygulamayı aç. 3. Başka bir projeye (NEHİR) bir görev ekle. 4. Yenile.
- Beklenen: `meta` bozulunca nasıl yapılıyorsa öyle: uygulama okuyamadığı kaydı ezmez, kullanıcıyı uyarır ("PUSULA okunamadı; ham veriyi indirin"). Kurtarma ekranının kendi sözü: "Verinizin üzerine yazılmasın diye uygulama hiçbir şey kaydetmedi."
- Gözlenen (insan dili): Uygulama hiçbir uyarı vermeden açılıyor. PUSULA kenar çubuğundan ve Portföy'den kayboluyor, Burak'ta yalnız NEHİR var. Kullanıcı başka bir projede tek bir görev ekleyince PUSULA'nın depo kaydı siliniyor. `meta.projectIds` içinde `prj-pusula`'nın yerine, depoda kaydı olmayan yeni bir kimlik (`prj-mw8u4y1o-kh4qgj`) yazılıyor. Kurtarma ekranı hiç çıkmadığı için "Ham veriyi indir" fırsatı da yok. NEHİR kaydıyla da aynı (`5 → 4` kayıt).
- Kanıt: `ekran/03-c-bozuk-proje-acilis.png`, `ekran/21-e-bozuk-proje-silindi.png` · ölçüm: `konsol/03-kurtarma-ABCD.json` → C (`nehirKaydi` yazmadan sonra "ham metin aynen duruyor", `metaNehir false`; yenilemede `projeKaydi 4`), `konsol/21-kurtarma-tekrar-abcde.json` → e (`yazmaSonra.pusulaKaydi "string"`, `yenileSonra.pusulaKaydi "undefined"`, `projectIds` içinde `prj-mw8u4y1o-kh4qgj`, anahtarlar `meta, atlas, kalkan, nehir, yildiz`) · 2/2 üretildi (NEHİR, PUSULA)
- Olası kök neden: `utils/workspaceStore.ts:40` (proje kaydı yalnız `!!p` ile süzülüyor; metin kayıt `Project` sayılıyor ve normalleştirmede yeni kimlik alıyor), `utils/workspaceStore.ts:41-42` (yeni kimlik `projectIds`'e girince eski anahtar "yetim" sayılıp temizleniyor). `meta` için yazılan "okunamayan depo" koruması (`:61`) proje kayıtlarına uygulanmıyor.
- Kapsam: tüm arayüzler
- Doğrulama: aday (önceki koşunun Kısa notundaki "eksik proje kaydı" ile aynı aile; artık kayıt varken de siliniyor)
- Devir: Deniz: kurtarma/hata ekranlarının görünümü. Cem: kullanıcıya hangi mesaj.

### UI-KRC-22 · Tek projedeki tek bir bozuk alan tüm uygulamayı "Bu ekran açılamadı" hata ekranına kilitliyor; "Sayfayı yeniden yükle" aynı ekrana dönüyor
- Önem: K2
- Ekran: açılış → hata ekranı          Arayüz: modern + klasik
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot (`project:prj-pusula.risks = "metin"`)
- Adımlar: 1. Depoda bir projenin `risks` alanını metin yap (dizi yerine). 2. Uygulamayı aç. 3. "Sayfayı yeniden yükle"ye bas. 4. Arayüzü klasiğe çevirip yenile.
- Beklenen: Sorunlu proje (ya da yalnız onun riskleri) atlanır ve uyarılır, diğer dört proje kullanılabilir kalır. Ya da `meta` bozulmasındaki gibi kurtarma seçenekleri sunulur.
- Gözlenen (insan dili): Beyaz ekran yok, yeni hata ekranı çıkıyor: "Bu ekran açılamadı… sayfayı yeniden yüklemek çoğu zaman yeter." Ama yeniden yükleme her seferinde aynı ekrana dönüyor, klasik arayüzde de aynısı. Ekranda yalnız "Sayfayı yeniden yükle" ve "Ham veriyi indir" var. İndirilen dosya da geri yüklenemiyor (UI-KRC-20). Kullanıcı, tek bir projedeki tek bir alan yüzünden beş projenin hiçbirine ulaşamıyor; çıkış yolu yok. Depo bozulmuyor, veri yerinde.
- Kanıt: `ekran/21-c-hata-ekrani.png` · ölçüm: `konsol/14-hata-ekrani.json` → `riskler-metin` (açılış ve yenilemede `metinUzunlugu 269, gezinme false`), `konsol/21-kurtarma-tekrar-abcde.json` → c (`dugme:Sayfayı yeniden yükle` aynı ekran, `indirme planasistan-ham-depo-2026-11-09.json`, `klasik` aynı ekran, depo 5 proje sağlam), konsol `TypeError: (p.risks || []).forEach is not a function` · 2/2 üretildi (NEHİR, PUSULA)
- Olası kök neden: `utils/risks.ts:52`, `utils/risks.ts:70` (`(p.risks || []).forEach`; dizi olmayan değer atılmıyor; aynı kalıp `utils/riskReport.ts:32`, `utils/personProfile.ts:116`, `utils/dataHealth.ts:112`), proje kayıtları açılışta doğrulanmıyor (`utils/workspaceStore.ts:40`), `components/ErrorBoundary.tsx` (tüm uygulamayı sarıyor; kurtarma ekranındaki "Veriyi sil"/atla seçeneği yok)
- Kapsam: tüm arayüzler
- Doğrulama: aday (UI-KRC-08'in komşu yolu)
- Devir: Deniz: hata ekranının temalarda görünümü (koyu sistem temasında da açık zemin mi?). Cem: "çoğu zaman yeter" sözü yeniden yükleme işe yaramadığında ne demeli?

### UI-KRC-23 · Klasik arayüzde müdür ve PYB destek görevi "siliyor" ve "düzenliyor": onay ve "silindi / Geri Al" bildirimi çıkıyor ama hiçbir şey olmuyor
- Önem: K2
- Ekran: Proje › Görevler (kart görünümü): çöp kutusu, kalem          Arayüz: klasik
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) ve pyb_destek (mert) · veri=pilot
- Adımlar: 1. Ahmet olarak klasik arayüzde NEHİR › Görevler. 2. İlk kartın çöp kutusuna bas, "…görevi silinecek. Emin misiniz?" sorusuna Tamam de. 3. İlk kartın kalemine bas, Görev Adı'nı değiştir, Kaydet.
- Beklenen: Salt okunur rol (bu sürümün notu: "müdür ve PYB destek proje içeriğine salt okunur") için Sil/Düzenle düğmeleri görünmez ya da kapalıdır. Modern arayüzde böyle: yazma düğmesi yok. Görünüyorsa basınca "yetkiniz yok" denir.
- Gözlenen (insan dili): Düğmeler görünüyor ve çalışıyormuş gibi davranıyor. Onay görev adını söylüyor, ardından alt bantta "'Şema doğrulama için çoklu dil desteği' silindi · Geri Al" çıkıyor. Kart ise yerinde duruyor ("Görev Listesi (100)"), depoda da 100 görev var. Düzenleme formu açılıyor, alanlar yazılabilir, Kaydet'e basınca form kapanıyor. Ad değişmiyor, hiçbir uyarı yok. Müdür bir görevi sildiğini ya da düzelttiğini sanıyor, ama ikisi de olmamış. Klasik arayüzde "CSV'den Aktar" ve kart durum seçimleri de müdüre açık görünüyor. Veri tarafındaki koruma çalışıyor (depo değişmedi), sorun arayüzün yanlış bilgi vermesi.
- Kanıt: `ekran/17-ahmet-klasik-sil-sonra.png`, `ekran/17-ahmet-klasik-duzenle.png`, `ekran/17-mert-klasik-sil-sonra.png`, `ekran/16-ahmet-classic.png` · ölçüm: `konsol/17-klasik-salt-okunur.json` (ahmet ve mert: `mesaj ["…silindi"]`, `silDepo "100 → 100"`, `duzenlenebilir true`, `duzenleDepo false`, yenilemede 100), `konsol/16-salt-okunur.json` (modern: yazma düğmesi 0, Ctrl+K/kısayol/sürükle depoyu değiştirmedi) · 2/2 üretildi (iki rol)
- Olası kök neden: `App.tsx:1698` (`editTask` yetki denetimsiz formu açıyor), `App.tsx:1701-1706` (`deleteTask` `canWriteActive`'e bakmadan onay soruyor ve `showUndo(... silindi)` gösteriyor), `App.tsx:535-536` (merkezi koruma yazmayı sessizce yutuyor), `components/TaskCard.tsx` (Sil/Düzenle düğmeleri rol bilmeden çiziliyor)
- Kapsam: arayüzün tamamı (klasik)
- Doğrulama: aday
- Devir: Cem: rol görünürlüğü; klasikte müdürün görmesi gereken düğmeler. Ece: kapalı düğmelerin erişilebilir adı/durumu.

### UI-KRC-24 · Kaydedilmemiş iş uyarısı yalnız görev formunda ve raporda var: Yeni risk, Yeni müşteri görüşmesi ve Yeni beklenti Esc, arka plan ve Ctrl+K ile uyarısız kapanıyor
- Önem: K3
- Ekran: Proje › Riskler › "Yeni risk"; Görüşmeler › "Yeni görüşme"; Beklentiler › "Yeni beklenti"          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Görüşmeler › "Yeni görüşme": Konu, Müşteri ve Adres alanlarını doldur. 2. Esc'e bas (ya da pencerenin dışına tıkla). 3. "Yeni görüşme"yi yeniden aç.
- Beklenen: Görev formundaki gibi "Kaydedilmedi. Yazdıklarınız silinsin mi?" onayı ya da taslağın korunması.
- Gözlenen (insan dili): Üç formda da Esc ya da arka plana tık pencereyi sorusuz kapatıyor. Yeniden açınca bütün alanlar boş. "Yeni müşteri görüşmesi" sekiz alanlı uzun bir form, yanlışlıkla dışarı tıklamak hepsini siliyor. Yeni risk formu açıkken Ctrl+K → "Takvim" de sorusuz Takvim'e geçiyor, görev formunda ise aynı hareket onay soruyor. "Yeni proje" penceresi yazılan adı koruyor. Bu sürümde uyarı yalnız iki forma eklenmiş, kullanıcı için tutarsız.
- Kanıt: `ekran/23-yeni-risk-esc.png`, `ekran/23-gorusme-esc.png` (yeniden açılınca boş form), `ekran/23-beklenti-arka.png`, `ekran/23-gorev-duzenle-esc.png` (karşılaştırma: onay var) · ölçüm: `konsol/23-kirli-formlar.json` (her form için `esc` ve `arka`: `diyalog []`, `hala false`, `yenidenAcinca []`), `konsol/24-ctrlk-form.json` (`risk.diyalog []`, `h1 "Takvim"`, tur 1 ve 2) · 3 form × 2 yol, Ctrl+K 2/2
- Olası kök neden: `useUnsavedGuard` yalnız `components/modern/TaskFormSheet.tsx:68` ve `components/modern/weekly/ReportEditor.tsx:298`'de. `components/modern/RiskParts.tsx` (RiskSheet), `components/modern/ModernMeetings.tsx`, `components/modern/ModernExpectations.tsx` kullanmıyor. `components/modern/ui.tsx` `Sheet` Esc ve arka planda doğrudan kapanıyor.
- Kapsam: arayüzün tamamı (modern Sheet formları)
- Doğrulama: aday (UI-KRC-09 "kısmen" kararının ayrıntısı; birleştirilebilir)
- Devir: Ece: Esc ile kapanan pencerede odak nereye dönüyor? Cem: hangi formlar taslak saklamalı?

### UI-KRC-25 · Uygulamanın kendi Jira CSV dışa aktarımı, kendi "Jira CSV dosyasından" içe aktarımıyla okunamıyor
- Önem: K3
- Ekran: Proje › Liste › İçe / dışa aktar › "Jira CSV" (dışa) ve "Jira CSV dosyasından" (içe)          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=veri varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. NEHİR › Liste › İçe / dışa aktar › Dışa aktar › "Jira CSV". 2. İçe aktar › "Jira CSV dosyasından" ile aynı dosyayı seç.
- Beklenen: Uygulamanın ürettiği dosya kendi içe aktarımında tanınır (ya da birleştirme kuralı açıklanır).
- Gözlenen (insan dili): Kırmızı bant: 'İçe aktarılamadı: CSV dosyasında "Issue key" ve ("Summary" veya "Description") sütunlarından biri bulunamadı.' Dosyada iki sütun da var. Dışa aktarım başlığı `Issue Key` (büyük K), içe aktarım `Issue key` (küçük k) arıyor. BOM'u silmek sonucu değiştirmiyor, yalnız `K`'yi küçültünce içe giriyor. O durumda da 100 görev kopya olarak ekleniyor (UI-KRC-18). Bir kullanıcı "Jira'ya aktarmadan önce dosyayı kontrol edeyim" diye geri yüklediğinde uygulama kendi dosyasını reddediyor. Gerçek Jira dışa aktarımlarının başlığı `Issue key` olduğu için gerçek dosyalar etkilenmeyebilir.
- Kanıt: `ekran/12-ice-jira-sonra.png` · ölçüm: `konsol/12-ice-aktar-akis.json` → `disa.jira.bas` (`Issue Type,Summary,…,Issue Key`), `konsol/13-ice-aktar-tuhaf.json` (`disa-jira-jira_import.csv` ve `jira-bombsuz.csv` hata; `jira-issue-key-bom.csv` ve `jira-issue-key-bomsuz.csv` `100 görev içe aktarıldı`) · 2/2 üretildi
- Olası kök neden: `utils/exporter.ts:160` (`'Issue Key'`) ↔ `utils/importer.ts:120` (`headers.indexOf('Issue key')`, büyük/küçük harf duyarlı)
- Kapsam: tek ekran (modern Liste içe/dışa aktarım)
- Doğrulama: aday
- Devir: Cem: hata metni kullanıcıya hangi sütunun eksik olduğunu söylemiyor.

---

## Kısa notlar

- **Yedekten yükle, `people:null` + `allocations:"metin"`:** Hâlâ sessiz başarısız (diyalog yok, yalnız `pageerror`). UI-KRC-08 "kısmen" kararının nedeni (`konsol/09-yedek.json`, `konsol/21-kurtarma-tekrar-abcde.json` → d).
- **Site verisi engelli:** Kurtarma ekranı "Kayıtlı çalışma alanınız açılamadı… Access is denied for this document" diyor ve "Veriyi sil ve baştan başla" öneriyor. Silinecek kayıt yok, düğme bir şey yapmıyor. "İndirdiğiniz dosyayı…" cümlesi indirme düğmesi yokken de görünüyor. Hata İngilizce (`ekran/03-d-depo-engelli-1.png`, `ekran/21-b-depo-engelli-sil.png`) → Cem.
- **`meta.format:"1"` (metin):** Ekran "(biçim: 1) Büyük olasılıkla daha yeni bir sürümle kaydedildi" diyor. Yanıltıcı ama veri korunuyor (`ekran/02-format-metin-1.png`) → Cem.
- **"Veriyi sil ve baştan başla":** Metin "boş bir çalışma alanıyla açar" diyor. Uygulama ise 5 görevli bir örnek projeyle, klasik arayüzde ve "kişi seçilmedi" uyarısıyla açılıyor (`ekran/03-b-sil-sonra.png`) → Cem/Deniz.
- **`meta`'da `workspace` alanı yok:** Kurtarma ekranı çıkmıyor, boş çalışma alanı açılıyor ve `meta` kişi 0 ile yeniden yazılıyor. Veri zaten kayıp olduğu için Kısa notta (`konsol/02-depo-bozma-format-2_meta-yok_meta-yarim-json_meta-null_meta-alan-bozuk_meta-workspace-yok.json` → `meta-workspace-yok`).
- **Ondalık süre, sessiz düzeltmeler:** `1e3` → 13, `1e12` → 112, `-5` → 5, `٫5` (Arapça ondalık ayırıcı) → 5, `١٫٥` → boş (0), `1.234,5` → 1,23. Uyarı yok, alan karakterleri yazarken süzüyor (`konsol/07-gorev-form.json`).
- **Klasik görev formunda süre:** "En kötü" boşken "En iyi 5" uyarısız kaydediliyor (`{best:5, avg:1, worst:0}`). Önceki koşunun "en iyi > en kötü" notu klasikte sürüyor (`konsol/25-klasik-ondalik.json`).
- **Yedekten yükle, `tasks:[null, 5, "metin"]`:** 3 "Adsız görev" olarak giriyor. `dueDate:"2026-02-30"` sessizce "2 Mar" oluyor (`ekran/10-liste-gorev-tuhaf.png`).
- **Jira CSV, kapanmayan tırnak:** Uyarısız tek bir görev oluşuyor, adı `KRC kapanmayan tırnak,açıklama,Ozan Kılıç,High,,U3…`, ikinci satır yutuluyor (`ekran/13-jira-jira-bozuk-tirnak.png`).
- **Excel çöp dosya:** Hata bandı doğru ama ~7 sn sürüyor ve ileti "Geçerli başlık satırı (Tasklar içeren) bulunamadı" (İngilizce-Türkçe karışık) → Cem.
- **Yedekten yüklenen çalışma alanı kimliği değiştiriyor:** Yönetici çalışma alanı yedeği yükleyince, dosyadaki `currentRole/currentPersonId`'ye (ör. "PYB Destek · Mert Aydın") ve dosyadaki arayüze (klasik) geçiyor (`ekran/09-ws-gorev-ciplak.png`) → Cem.
- **Ctrl+K + Esc görev formunda:** Tek Esc paleti kapatmakla kalmıyor, formun "silinsin mi?" onayını da tetikliyor. Veri korunuyor ama iki katman tek tuşla kapanmaya çalışıyor → Ece.
- **Etkin sekme kapanınca:** Edilgen sekmeler kendiliğinden devralmıyor, kullanıcı "Burada kullan"a basmalı. Tasarım tercihi olabilir (`ekran/04-b-c-kapaninca.png`).
- **Kapasite–talep, aşırı veri:** 200 karakterlik bölüm/proje başlık satırı kabın sağından taşıp kesiliyor (`ekran/20-asiri-kapasite-talep.png`) → Deniz.
- **Servis çalışanı:** Tek ziyaretten sonra önbellekte yalnız `/` ve `/index.html` vardı (JS/CSS yok). Çevrimdışı yenileme yine de açıldı (tarayıcının HTTP önbelleğinden). İkinci ziyarette varlıklar da önbelleğe giriyor. Ağ önce stratejisi nedeniyle çevrimiçiyken eski sürüm gösterilmiyor. Yeni bir yayın simülasyonu yapılmadı.
- **Ortam:** Dış kaynak `cdn-icons-png.flaticon.com` yüklenmiyor (sekme simgesi, bulgu değil). Headless Chromium tarih alanını `mm/dd/yyyy` gösteriyor. Koşu ortasında kapsayıcı yeniden başladı, saat 9 Kasım'a geçti.
- **Dayanıklılık olumlu:**
  - Tek etkin sekme dondurma, eşzamanlı açılış ve ping-pong'a dayandı.
  - 3000 satırlık Jira CSV 4,7 sn'de içe girdi; `<img onerror>` çalışmadı.
  - Bozuk `sessionStorage` ekran kaydı ve silinmiş etkin proje sorunsuz.
  - Görev adı nesne, görev `null`, süre metin, termin bozuk: çökme yok.
  - Modern arayüzde salt okunur rollerin hiçbir yazma yolu bulunamadı (düğme, Ctrl+K, 5 kısayol, sürükle, durum notu).
