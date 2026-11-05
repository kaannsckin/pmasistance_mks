# Tolga (ui-kirici) · Tur 1 bulguları · 2026-11-04

Kod: `claude/zealous-tesla-hidbc9@81bd671` · port 4183 · Chromium (playwright-core), `tr-TR`, `Europe/Istanbul`, 1440×900.
Betikler: `ui-testi/2026-11-04/tolga/betik/` (01–24) · konsol ve ölçümler: `konsol/` · görüntüler: `ekran/`.
Veri: `pilot`, `bos` (koordinatörün), `aşırı` (benim, `veri/asiri/workspace.json`), `bos-tahsis` (benim, `tolga/veri/bos-tahsis/`).

> Not (koordinatör düzeltmesi): `ortak.mjs`'nin eski `oturum()`'unda veri, uygulama bir kez açıldıktan sonra yükleniyordu. `boş` veri setiyle "örnek proje" bulgusu yazmadım. Depo bozma senaryolarında (09/10) kendi bağlamımı kullandım ve bozmadan önce depoyu okuyup doğruladım. UI-KRC-01 ve UI-KRC-08'i düzeltilmiş `oturum()` ile de yeniden ürettim (betik 20, 24).

## Koşu özeti: saldırı × sonuç

| Saldırı | Sonuç |
|---|---|
| `aşırı` veri seti açılışı (67 proje, NEHİR'de 620 görev, 200 kişi, 387 tahsis) | dayandı (çökme yok, ekran başına ≤ 1,3 sn) |
| HTML / markdown / `javascript:` bağlantısı / `onerror` metinleri | dayandı (hepsi metin; diyalog yok, `javascript:` bağlantısı 0) |
| Görev formu: çift tık, üçlü tık, Enter×2, 80 ms arayla iki tık (modern + klasik) | dayandı (tek kayıt) |
| Görev formu: Esc / arka plana tık / Ctrl+K + Esc ile yarıda bırakma | **bozuldu** (UI-KRC-09) |
| Görev formu: ondalık süre (`1,5`, `2.5`, `0.5`) | **bozuldu** (UI-KRC-05) |
| Görev formu: boş ad | dayandı ("Görev adı gerekli.") |
| Klasik görev kartı: çöp kutusuna çift tık | **bozuldu** (UI-KRC-03) |
| Haftalık rapor: Kaydet'e çift tık, "Bölüm sorumlusuna gönder"e çift tık | dayandı (tek rapor, tek `submit`) |
| Haftalık rapor: kaydetmeden yenile / kenar çubuğu / tarayıcı geri | **bozuldu** (UI-KRC-04) |
| Haftalık rapor: "Haftalık raporlar" bağlantısıyla çıkış | dayandı (onay soruyor) |
| Aynı çalışma alanı iki sekmede | **bozuldu** (UI-KRC-02) |
| Çevrimdışı açılış (PWA) | **bozuldu** (UI-KRC-07) |
| Çevrimdışı ilk ziyaret | beklenen (tarayıcı hata sayfası) |
| IndexedDB `meta.format` farklı / `meta` yok / metin / null | **bozuldu** (UI-KRC-01) |
| IndexedDB `meta.workspace` alan türleri bozuk | **bozuldu** (UI-KRC-08) |
| Site verisi tamamen engelli (localStorage + IndexedDB SecurityError) | **bozuldu** (UI-KRC-08) |
| Yalnız localStorage engelli · yalnız IndexedDB yok · `open()` hata veriyor | dayandı (IndexedDB ya da localStorage'a geçiyor) |
| Proje kaydı eksik · `tasks` alanı yok · görevlerin yarısında `time/name` null | dayandı (çökme yok; proje uyarısız gizleniyor, Kısa notlar) |
| Yedekten yükle: bozuk JSON · çalışma alanı onayı | dayandı (mesaj var / onay soruyor) |
| Yedekten yükle: `{"name":…,"tasks":[{}]}` | **bozuldu** (UI-KRC-06) |
| Hızlı gezinme: 20 geçiş × 100 ms (modern + klasik, aşırı veri) | dayandı |
| İşlem ortasında pencere 1440 → 375 → 1440 | dayandı (form ve yazılan korunuyor) |
| Yıl sınırı saati (28 Ara, 31 Ara 23:59:30, 1 Oca, 4 Oca) | dayandı (ISO 53. hafta doğru, rapor `2026-W53`) |
| Boş veri (`bos` müdür/PY, modern/klasik; `bos-tahsis`) 9–11 ekran | dayandı (konsol temiz) |
| AI isteği 3 sn gecikip 500 döner; "Taslak öner"e çift tık | dayandı (düğme kilitleniyor, hata mesajı var) |
| Aşırı veride taşma: Liste, Pano, Ekip ve tahsis, klasik üst çubuk | **bozuldu** (UI-KRC-10, -11, -12) |

Bulgu sayısı: **K1: 2 · K2: 6 · K3: 4** (toplam 12) + Kısa notlar.

---

### UI-KRC-01 · Tanınmayan ya da bozuk depo kaydı açılışta tüm çalışma alanını uyarısız siliyor
- Önem: K1
- Ekran: açılış (tüm uygulama)          Arayüz: modern (klasikte de aynı açılış yolu)
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Pilot veriyle oturum aç (5 proje, 24 kişi, 55 rapor, 33 tahsis). 2. IndexedDB `planasistan/workspace` içindeki `meta` kaydında `format`'ı 1'den 2'ye çevir. Bu, depo biçimini değiştiren bir sonraki sürümün yazdığı kaydı ya da eski sürüme geri dönmeyi temsil eder. 3. Sayfayı yenile ve hiçbir şeye dokunma.
- Beklenen: Uygulama biçimi tanımıyorsa veriye dokunmaz ve kullanıcıyı uyarır ("Bu veri daha yeni bir sürümle kaydedilmiş…", yedek alma yolu gösterir). En azından mevcut kaydı ezmez.
- Gözlenen (insan dili): Uygulama "hiç veri yokmuş" gibi klasik arayüzde, 0 projeli boş portföy ve "kişi seçilmedi" uyarısıyla açılıyor. Bu sırada, hiçbir tıklama yapılmadan, depodaki `meta` yeni bir örnek çalışma alanıyla eziliyor: projectIds 5→1, kişi 24→0, rapor 55→0, tahsis 33→0. Eski proje kayıtları depoda yetim kalıyor ama hiçbir ekrandan erişilemiyor. Kullanıcıya hiçbir mesaj gösterilmiyor. `meta` silindiğinde, metin olduğunda ya da `null` olduğunda da aynı yol işliyor: örnek çalışma alanı açılıyor ve `meta` yeniden yazılıyor.
- Kanıt: `ui-testi/2026-11-04/tolga/ekran/10-format-2-acilis.png`, `ekran/09-format-99.png` · ölçüm: `konsol/10-format-ve-depo-yok.json` (once {format:2, projectIds:5, kisi:24, rapor:55, tahsis:33} → acilisSonrasi {format:1, projectIds:1, kisi:0, tahsis:0}), `konsol/20-bos-veri.json` → `format2`, `konsol/09-bozuk-depo.json` (meta-yok / meta-metin / meta-null) · 4/4 üretildi (09, 10×2, 20; 20 numaralı betik düzeltilmiş `oturum()` ile)
- Olası kök neden: `utils/workspaceStore.ts:39` (`format !== STORE_FORMAT` → `null`), `App.tsx:191-224` (`stored === null` olunca örnek proje kuruluyor, `WorkspacePersister` `saved=null` ile başlıyor ve ilk kayıtta `meta`'yı yazıyor; yetimler de temizlik listesine girmiyor)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Deniz: boş açılan bu ekranın (klasik kabuk, uyarı kutusu) temalardaki görünümü. Cem: kullanıcı bunu "verilerim gitti" diye mi okur, hangi mesajı beklerdi?

### UI-KRC-02 · Aynı çalışma alanı iki sekmede açıkken son yazan kazanıyor, öteki sekmenin işi sessizce kayboluyor
- Önem: K1
- Ekran: NEHİR › Liste (Yeni görev) ve Haftalık rapor          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Uygulamayı A ve B sekmelerinde aç. 2. A'da NEHİR'e "KRC sekme A görevi" ekle. 3. B'de (yenilemeden) NEHİR'e "KRC sekme B görevi" ekle. 4. A'yı yenile.
- Beklenen: İki görev de kalır ya da B, A'nın değişikliğini görüp birleştirir. Bu olmuyorsa en azından "başka sekmede değişiklik var" uyarısı çıkar.
- Gözlenen (insan dili): A'nın görevi yok oluyor; depoda yalnız B'ninki var. Raporda da aynı şey oluyor: A'da kaydedilen NEHİR raporu, B PUSULA raporunu kaydedince siliniyor. Bir sekmede yazılan her şey, eski hâli açık duran öteki sekme bir şey kaydettiği anda eziliyor. Hiçbir uyarı yok.
- Kanıt: `ekran/11-iki-sekme-a-yenile.png` · ölçüm: `konsol/11-iki-sekme.json` (aSonrasi {A:1,B:0} → bSonrasi {A:0,B:1}; rapor45 yalnız `prj-pusula`) · 2/2 üretildi
- Olası kök neden: `utils/workspaceStore.ts:68` (`WorkspacePersister` proje ve `meta` kayıtlarını bellekteki hâlden bütün olarak yazıyor; sürüm ya da zaman damgası denetimi yok) + `App.tsx:326-333`. Sekmeler arası eşitleme yok: kodda `BroadcastChannel`, `storage` olayı ve `navigator.locks` yok.
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Cem: iki sekme (ör. biri portföy, biri rapor) gerçek kullanımda ne kadar olası?

### UI-KRC-03 · Klasik görev kartında çöp kutusuna çift tık iki görevi siliyor; onay metni hangi görevi sildiğini söylemiyor
- Önem: K2
- Ekran: Proje › Görevler (kart görünümü)          Arayüz: klasik
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Klasik arayüzde NEHİR › Görevler. 2. Bir kartın çöp kutusuna çift tıkla. 3. Çıkan "Emin misiniz?" sorularına Tamam de.
- Beklenen: Tıklanan tek görev silinir; onay penceresi görev adını söyler; tercihen "Geri al" olur.
- Gözlenen (insan dili): İki kez "Emin misiniz?" soruluyor ve **iki görev** siliniyor: tıklanan ve listede onun yerine kayan sonraki görev. Yenileyince ikisi de yok, geri alma da yok. Onay metni aynı ("Emin misiniz?") olduğu için kullanıcı ikinci sorunun başka bir görev için olduğunu anlayamıyor. Not: Playwright'ta ikinci tık onay kapandıktan sonra işliyor. Gerçek tarayıcıda çift tıkın ikincisi onay penceresi açıkken düşebilir. Ama "onayla, sonra aynı yere bir kez daha tıkla" yolu aynı sonucu verir.
- Kanıt: `ekran/16-klasik-sil-cift-tik.png` · ölçüm: `konsol/16-sil-cift-tik.json` (100→98; `jira-nhr-1`, `jira-nhr-2`), `konsol/19-klasik-sil-tasma.json` (3. kart: 100→98; `jira-nhr-3`, `jira-nhr-4`) · 2/2 üretildi
- Olası kök neden: `App.tsx:1543`, `App.tsx:1735`, `App.tsx:1777` (`window.confirm('Emin misiniz?')`; görev adı yok, geri alma yok), `components/TaskCard.tsx:108` (sil düğmesi, çift tık koruması yok)
- Kapsam: tek ekran (klasik görev kartları; modern menüden silmede tek görev siliniyor ama aynı genel onay metni kullanılıyor)
- Doğrulama: aday
- Devir: Cem: onay metni ve geri alma beklentisi.

### UI-KRC-04 · Haftalık rapor taslağı kenar çubuğuyla gezinince, yenileyince ya da tarayıcı geri tuşuna basınca uyarısız kayboluyor
- Önem: K2
- Ekran: Haftalık rapor › NEHİR (45. hafta) düzenleyici          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Haftalık rapor › NEHİR. 2. "Madde ekle" › "Devam eden faaliyetler", bir cümle yaz (Kaydet'e basma). 3. Kenar çubuğunda "Portföy"e tıkla. 4. Haftalık rapor › NEHİR'e geri dön.
- Beklenen: "Kaydedilmemiş değişiklikler var" onayı. Sayfanın üstündeki "Haftalık raporlar" bağlantısında bu onay zaten var. Ya da taslağın kendiliğinden saklanması.
- Gözlenen (insan dili): Onay çıkmadan Portföy açılıyor; geri dönünce madde yok, depoda da rapor yok. Kaydetmeden sayfayı yenilemek de aynı sonucu veriyor: yazılan madde, plan ve sağlık puanı gidiyor, onay sorulmuyor. Tarayıcı geri tuşu ise uygulamadan tümüyle çıkıyor (`about:blank`), yine onaysız. Uygulama yalnız "Haftalık raporlar" bağlantısında soruyor ("Kaydedilmemiş değişiklikler var. Çıkılsın mı?"). Bu, kullanıcıda başka çıkış yollarının da korunduğu sanısını yaratıyor.
- Kanıt: `ekran/07-kenar-cubugu-sonrasi-rapor.png`, `ekran/06-a-yenileme-sonrasi.png`, `ekran/06-c-geri-tusu.png` · ölçüm: `konsol/07-rapor-kenar-gonder.json` (tur 1-2: diyalog [], geriDonunceTaslak [], depo []), `konsol/06-rapor-saldiri.json` (A-yenileme-sonrasi-depo [], C_url → about:blank) · kenar çubuğu 2/2, yenileme 3/3, geri tuşu 2/2
- Olası kök neden: `components/modern/weekly/ReportEditor.tsx:507-509` (`dirty` denetimi yalnız `back()` içinde). Kenar çubuğu gezintisi düzenleyicinin `dirty` durumunu bilmiyor. Kod tabanında `beforeunload` dinleyicisi yok.
- Kapsam: tek ekran (haftalık rapor düzenleyici)
- Doğrulama: aday
- Devir: Cem: taslağın kendiliğinden kaydedilmesi beklentisi. Ece: tarayıcı geri tuşu uygulama içinde gezinmiyor (geçmiş kaydı yok).

### UI-KRC-05 · Süre tahmininde ondalık kayboluyor: "1,5" gün 15 gün, "2.5" gün 2 gün, "0.5" gün 0 olarak kaydediliyor
- Önem: K2
- Ekran: Yeni görev formu › Süre tahmini (gün)          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. NEHİR › Yeni görev. 2. Klavyeyle En iyi=`1,5`, Olası=`2.5`, En kötü=`0.5` yaz. 3. Kaydet (klasikte "Kaydet").
- Beklenen: 1,5 / 2,5 / 0,5 gün saklanır ya da alan "yalnız tam gün" diyerek uyarır.
- Gözlenen (insan dili): Alanlar `15`, `2` ve boş (0) gösteriyor. Klasik arayüzde görev `{best:15, avg:2, worst:0}` olarak kaydediliyor: yarım gün yazan kullanıcının tahmini on kat büyüyor ya da sıfıra iniyor. Ayrıca "en iyi" "en kötü"den büyük olduğu hâlde uyarısız kaydediliyor. Ek gözlem: `-5` → 0, `1e12` → 1. Not: Headless Chromium'un sayı alanı en-US yerel ayarında `,` karakterini yutuyor, bu yüzden `1,5` → `15` oluyor. Türkçe yerel ayarlı Chrome'da `1,5` → `1.5` → `parseInt` → **1** olur. Yarım gün her iki durumda da kayboluyor.
- Kanıt: `ekran/04-ondalik-sure.png`, `ekran/14-klasik-ondalik.png` · ölçüm: `konsol/04-rapor-kesif.json` → `ondalik`, `konsol/14-klasik-gorev-saldiri.json` → `ondalikDepoda.sure [{best:15, avg:2, worst:0}]`, `konsol/03-gorev-cift-tik.json` → `ucSayilar` · modern 2/2 (03, 04), klasik 1/1 (aynı kök neden)
- Olası kök neden: `components/modern/TaskFormSheet.tsx:131-132` (`parseInt(e.target.value, 10)`, `inputMode="numeric"`), `components/TaskFormModal.tsx:126-132` (`parseInt(value, 10)`)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Cem: kullanıcı yarım günü nasıl girmeyi bekliyor (gün mü, saat mi)?

### UI-KRC-06 · Yedekten yükle: tek alanı eksik bir görev içeren proje dosyası beyaz ekrana düşürüyor
- Önem: K2
- Ekran: Diğer araçlar › Yedekten yükle          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=admin · veri=pilot
- Adımlar: 1. Yönetici kimliğiyle "Diğer araçlar" › "Yedekten yükle". 2. İçeriği `{"name":"KRC çıplak proje","tasks":[{}]}` olan `.json` dosyasını seç. 3. "… yeni proje olarak eklendi." uyarısını kapat.
- Beklenen: Dosya reddedilir ("görev kaydı eksik") ya da eksik alanlar varsayılanla doldurulur. Uygulama ayakta kalır.
- Gözlenen (insan dili): "Eklendi" mesajından hemen sonra ekran bembeyaz oluyor. Gezinme çubuğu da dahil her şey kayboluyor (`Cannot read properties of undefined (reading 'push')`). Yenileyince uygulama dönüyor, proje eklenmemiş. Küçültme: `{"name":…}` reddediliyor (mesaj var); `{"tasks":[]}` ve `{"name":…,"tasks":[]}` sorunsuz ekleniyor; yalnız `tasks:[{}]` (alanları eksik görev) çöktürüyor. Uygulamada hata sınırı (ErrorBoundary) yok, bu yüzden herhangi bir çizim hatası tüm ekranı siliyor.
- Kanıt: `ekran/21-yedek-proje-ciplak.png`, `ekran/22-beyaz-modern-proje-ciplak.png` · ölçüm: `konsol/21-yedek-yukle.json`, `konsol/22-yedek-beyaz-ekran.json` (metinUzunlugu 0, gezinme false) · 2/2 üretildi; dosyalar `tolga/veri/yedek/`
- Olası kök neden: `utils/workspace.ts:167-168` (`Array.isArray(obj.tasks)` yetiyor; görev öğeleri doğrulanmadan `legacyToProject`'e gidiyor) + `index.tsx`/`App.tsx`'te `componentDidCatch`/ErrorBoundary yok
- Kapsam: arayüzün tamamı (beyaz ekran tüm uygulamayı götürüyor)
- Doğrulama: aday
- Devir: Deniz: beyaz ekranın temalarda görünümü (koyu sistem temasında da açık gri boşluk). Cem: kullanıcıya gösterilmesi gereken hata metni.

### UI-KRC-07 · Uygulama çevrimdışı açılmıyor; README'deki "PWA + service worker, çevrimdışı çalışır" sözü karşılanmıyor
- Önem: K2
- Ekran: açılış          Arayüz: modern (aynısı klasik)
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Uygulamayı çevrimiçi aç, iki kez yenile (servis çalışanına fırsat ver). 2. Ağı kes (`context.setOffline(true)`). 3. Yenile.
- Beklenen: Uygulama kabuğu önbellekten açılır; veri zaten IndexedDB'de olduğu için çalışmaya devam edilir. README'de "Yerel-öncelikli … çevrimdışı çalışır", "PWA + service worker" yazıyor.
- Gözlenen (insan dili): Tarayıcının "İnternet bağlantısı yok" sayfası (`ERR_INTERNET_DISCONNECTED`) açılıyor; uygulama hiç yüklenmiyor. Kayıtlı servis çalışanı 0, önbellek (`caches`) boş. `dist/`'te yalnız manifest var, servis çalışanı dosyası ve kaydı yok. Yani "Ana ekrana ekle" ile kurulan uygulama sahada ağ yokken açılmıyor.
- Kanıt: `ekran/08-cevrimdisi-acilis.png` · ölçüm: `konsol/08-cevrimdisi.json` (`sw: {kayit:0, hazir:"zaman-asimi", denetci:false, onbellek:[]}`, `cevrimdisiYenileHata: net::ERR_INTERNET_DISCONNECTED`) · 1/1 ölçüm + kod doğrulaması (kaynakta `serviceWorker` geçmiyor)
- Olası kök neden: servis çalışanı yok: `index.html` yalnız `<link rel="manifest">` içeriyor, kaynakta `navigator.serviceWorker.register` yok, `vite.config.ts`'te PWA eklentisi yok. İddia: `README.md:17`, `README.md:209`, `README.md:698`
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Ece: telefondan/sahadan kullanım senaryosunda çevrimdışı açılış.

### UI-KRC-08 · Açılış sırasındaki hata yakalanmıyor: sonsuz yükleme, hata mesajı yok (site verisi engelli ya da depoda bozuk alan)
- Önem: K2
- Ekran: açılış          Arayüz: tümü (yükleme sırasında klasik kabuk görünüyor)
- Koşul: sistem teması=açık · uygulama ayarı=— · renk teması=—
         ekran=1440×900 · rol=py · veri=pilot
- Adımlar (a): 1. Tarayıcıda site verisini engelle (Chrome "Tüm çerezleri engelle": `localStorage` ve `indexedDB.open` `SecurityError` atar). 2. Uygulamayı aç.
- Adımlar (b): 1. Pilot veriyle aç. 2. Depodaki `meta.workspace.people`'ı `null`, `allocations`'ı metin yap. 3. Yenile.
- Beklenen: "Tarayıcı deposuna erişilemiyor / veri okunamadı" mesajı ve yedekten yükleme ya da bellek içi çalışma seçeneği.
- Gözlenen (insan dili): Üst çubuk çiziliyor, ortada dönen simge sonsuza kadar kalıyor; tıklanacak hiçbir şey yok. Konsolda yakalanmamış istisna var: (a) `Failed to read the 'localStorage' property…`, (b) `(e.allocations || []).map is not a function`. Aynı (b) içeriğindeki dosya "Yedekten yükle" ile seçilince de mesajsız, sessizce başarısız oluyor (yalnız konsolda istisna).
- Kanıt: `ekran/10-tum-depolama-engelli.png`, `ekran/24-meta-people-null-tekrar.png`, `ekran/09-meta-people-null.png` · ölçüm: `konsol/10-format-ve-depo-yok.json` (tum-depolama-engelli tur 1-2), `konsol/24-tekrar.json` → `metaBozuk` (main boş, hata 1), `konsol/21-yedek-yukle.json` (ws-people-null: diyalog yok, sayfa hatası) · (a) 2/2, (b) 2/2 (09 ve 24; 24 düzeltilmiş `oturum()` ile)
- Olası kök neden: `App.tsx:198-200` (`localStorage.getItem` `try` dışında, async açılışta reddedilen söz yakalanmıyor, `isInitialized` hiç `true` olmuyor); (b) için `normalizeWorkspace` (`utils/workspace.ts`) alan türlerini doğrulamıyor. Hata sınırı yok.
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Deniz: yükleme ekranı modern seçiliyken bile klasik kabukla çiziliyor. Cem: kullanıcıya ne söylenmeli?

### UI-KRC-09 · Görev formu Esc'e, arka plana tıklamaya ve Ctrl+K + Esc'e basınca uyarısız kapanıyor, yazılanlar kayboluyor
- Önem: K3
- Ekran: NEHİR › Yeni görev (alt sayfa)          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot / aşırı
- Adımlar: 1. Yeni görev formunda ad ve açıklama yaz. 2. Ctrl+K'ye bas (arama paleti formun üstünde açılır). 3. Bir kez Esc'e bas.
- Beklenen: Tek Esc yalnız en üstteki paleti kapatır, form ve yazılanlar yerinde kalır. Doldurulmuş form, Esc'le ya da arka plana tıklamayla kapanmadan önce sorar.
- Gözlenen (insan dili): Tek Esc paletle birlikte görev formunu da kapatıyor, yazılan ad gidiyor. Palet olmadan da Esc ya da arka plana yanlışlıkla tıklamak, dolu formu onaysız kapatıyor. Yeniden açınca alanlar boş (ad ve açıklama kayboldu). Klasik arayüzde ise Esc formu hiç kapatmıyor (tutarsız).
- Kanıt: `ekran/15-ctrlk-form-ustunde.png` · ölçüm: `konsol/15-hizli-gezinme.json` (`ctrlKFormUstunde.dialog: 2` → `birEscSonra.formAcik: false`), `konsol/16-sil-cift-tik.json` → `ctrlKEsc2.formAcik: false`, `konsol/03-gorev-cift-tik.json` (`yenidenAcincaAd: ""`, `yenidenAcincaAciklama: ""`, `arkaPlanSonrasiFormAcik: false`) · Ctrl+K+Esc 2/2, Esc 1/1, arka plan 1/1
- Olası kök neden: `components/modern/ui.tsx:39-45` (`Sheet` Esc'i `window` üzerinde dinliyor ve koşulsuz `onClose` çağırıyor; arka plan `onClick={onClose}`; "kirli form" denetimi yok), `components/CommandPalette.tsx:97` (Esc'te `preventDefault` var ama `stopPropagation` yok)
- Kapsam: arayüzün tamamı (modern `Sheet` kullanan tüm formlar)
- Doğrulama: aday
- Devir: Ece: üst üste pencerelerde Esc sırası ve odak dönüşü; klasik formun Esc ile kapanmaması.

### UI-KRC-10 · Uzun kişi/proje adı filtre açılır listesini 1222 px'e şişiriyor; sayfa yatay kayıyor
- Önem: K3
- Ekran: NEHİR › Liste ve Pano ("Atanan kişi"), Ekip ve tahsis ("Proje")          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) / py (burak) · veri=aşırı
- Adımlar: 1. `aşırı` veriyle NEHİR › Liste'yi aç (40 kaynak; birinin adı 80 karakterlik tek kelime, en uzun seçenek 152 karakter). 2. Sayfayı sağa kaydır.
- Beklenen: Filtre düğmesi sabit/sınırlı genişlikte kalır, uzun ad seçenek listesinde kırpılır.
- Gözlenen (insan dili): "Herkes" (Atanan kişi) filtresi 1222 px genişliğe çıkıp sağ kenardan taşıyor; sayfa yatay kaydırma çubuğu açıyor (Liste 1526 px, Pano 1687 px). Okunun ve filtrenin sağ yarısı görünmüyor. Ekip ve tahsis'te "Tüm projeler" filtresi 200 karakterlik proje adı yüzünden aynı şekilde şişiyor (sayfa 1835 px).
- Kanıt: `ekran/12-modern-nehir-liste.png`, `ekran/12-modern-nehir-pano.png`, `ekran/12-modern-tahsis.png` · ölçüm: `konsol/18-asiri-xss-select-rapor.json` (`genisSecim [{ad:"Atanan kişi", gen:1222, enUzunSecenek:152}]`, sayfa 1526), `konsol/12-asiri-tasma-modern.json` (Liste 1526, Pano 1687, Tahsis 1835) · 2/2 üretildi
- Olası kök neden: `components/modern/ModernTaskList.tsx:121`, `components/modern/ModernBoard.tsx:67`, `components/modern/ModernAllocation.tsx:233` (`select.m-pill`'de `max-width` yok; doğal `select` genişliği en uzun seçeneğe göre hesaplanıyor)
- Kapsam: arayüzün tamamı (m-pill seçimleri)
- Doğrulama: aday
- Devir: Deniz: aşırı veride filtre çubuğu. Ece: dar ekranda/yakınlaştırmada etkisi.

### UI-KRC-11 · Klasik üst çubuk 1440 px'te sığmıyor: "Hızlı git", "Ayarlar", "Hakkında" ekran dışında, sayfa yatay kayıyor
- Önem: K3
- Ekran: üst çubuk (tüm ekranlar)          Arayüz: klasik
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) / mudur (ahmet) · veri=pilot ve aşırı
- Adımlar: 1. Klasik arayüzü 1440×900'de aç (pilot veri yeterli). 2. Sağ üst köşeye bak / sayfayı sağa kaydır.
- Beklenen: Üst çubuk pencereye sığar ya da sarılır/daralır; düğmeler ekranda kalır.
- Gözlenen (insan dili): Sağ uçtaki düğme yarıya kesilmiş. "Hızlı git", "Ayarlar" ve "Hakkında" pencerenin dışında kalıyor, sayfa yatay kayıyor: PY'de 1600 px, müdürde ("Yönetim" sekmesi eklenince) 1660 px. Bu durum veriden bağımsız, pilot veride de var.
- Kanıt: `ekran/19-klasik-asiri-gorevler.png`, `ekran/12-classic-portfoy.png`, `ui-testi/2026-11-04/duman/ekran/classic-light.png` · ölçüm: `konsol/13-klasik-gorev.json` (`baslikTasma {sayfa:1600, pencere:1440, disari:["Hızlı git…","Ayarlar","Hakkında"]}`), `konsol/12-asiri-tasma-classic.json` (1660), `konsol/19-klasik-sil-tasma.json` (1660) · 3/3 üretildi
- Olası kök neden: `components/Header.tsx` (üst çubuk satırı `nowrap`/sabit genişlikte; daralma ya da taşma menüsü yok)
- Kapsam: arayüzün tamamı (klasik)
- Doğrulama: aday
- Devir: Deniz: klasik başlık görsel düzeni. Ece: 1280 px ve yakınlaştırmada daha da kötü olmalı.

### UI-KRC-12 · Pano kartında boşluksuz uzun kelime kartın 287 px dışına taşıyor, komşu sütunun altına giriyor
- Önem: K3
- Ekran: NEHİR › Pano (kanban kartı başlığı)          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) / py (burak) · veri=aşırı
- Adımlar: 1. `aşırı` veriyle NEHİR › Pano. 2. Adında 80 karakterlik boşluksuz kelime olan karta bak (ör. NHRX-144).
- Beklenen: Uzun kelime kart içinde kırılır (`overflow-wrap:anywhere`) ya da üç noktayla kesilir.
- Gözlenen (insan dili): Başlık kartın sağ kenarını aşıp yandaki sütunun kartlarının altına giriyor ve orada kesiliyor. Metin x=943'e kadar uzanırken kart x=656'da bitiyor. Liste görünümünde aynı ad üç noktayla düzgün kesiliyor.
- Kanıt: `ekran/12-modern-nehir-pano.png`, `ekran/24-pano-tasma-tekrar.png` · ölçüm: `konsol/24-tekrar.json` (`kutu 284, icerik 623, metinSag 943, kartSag 656`), `konsol/12-asiri-tasma-modern.json` (`kirpma: visible`) · 2/2 üretildi
- Olası kök neden: `components/modern/ModernBoard.tsx:120` (başlık `span`'ında `break-words`/`min-w-0` yok)
- Kapsam: tek ekran
- Doğrulama: aday
- Devir: Deniz: kart ve sütun ayrımı.

---

## Kısa notlar

- Proje kaydı depoda eksik ya da `tasks` alanı olmayan proje açılışta **uyarısız** listeden düşüyor; `meta` yeniden yazılınca kalıcı olarak gidiyor (`konsol/09-bozuk-depo.json`: eksik-proje-kaydi 5→4, proje-tasks-yok). Veri zaten bozuk olduğu için Kısa notta.
- IndexedDB sürümü uygulamanınkinden büyükse (`VersionError`, sürüm 7) uygulama uyarısız örnek çalışma alanıyla açılıyor ve localStorage'a yazıyor. IndexedDB'deki veri ezilmiyor ama görünmüyor (`konsol/09b-bozuk-depo-ek.json`).
- Klasik görev formu "en iyi > en kötü" süreyi uyarısız kaydediyor (modern formda `timeError` var) (`konsol/14-klasik-gorev-saldiri.json`).
- Sayı alanları sessiz düzeltme yapıyor: `-5` → 0, `1e12` → 1 (UI-KRC-05 ile aynı `parseInt` kökü).
- Klasik görev penceresi Esc ile kapanmıyor; modern "Diğer" menüsü Esc'ten sonra açık kalıyor (5 menü öğesi) (Ece'ye devredildi).
- Klasik kartlarda öncelik etiketleri `MEDİUM`, `HİGH` görünüyor: İngilizce kelime `tr` yerel ayarıyla büyük harfe çevrilince noktalı İ çıkıyor (Cem/Deniz'e devredildi).
- Haftalık rapor format denetimi büyük harfli Türkçe kelimeyi ("İSTANBUL") kısaltma sayıp açılım istiyor (Cem'e devredildi).
- AI hata mesajı son kullanıcıya geliştirici belgesini gösteriyor: "… (bkz. docs/AI_KURULUM.md)" (`konsol/23-ai-yavas-hata.json`) (Cem'e devredildi).
- Görev formunda "Görev adı gerekli." mesajı, kullanıcı ada hiç yazmadan başka alana geçince hemen çıkıyor (`ekran/04-ondalik-sure.png`) (Cem'e devredildi).
- Tarayıcı geri tuşu uygulama içinde gezinmiyor, doğrudan çıkıyor (UI-KRC-04'ün bir yolu; gezinme geçmişi yok).
- Tam sayfa görüntülerde modern kenar çubuğunun zemini görünüm yüksekliğinde (900 px) bitiyor (`ekran/12-modern-portfoy-tam.png`). Ekran görüntüsü yan etkisi olabilir (Deniz'e devredildi).
- Pilot verisinde `settings.isDarkMode=true` olduğu hâlde ekranlar açık temada çiziliyor (Deniz'e devredildi; benim şeridim değil).
- Ortam: dış kaynak `cdn-icons-png.flaticon.com` (sekme simgesi) yüklenmiyor; bulgu değil. Headless Chromium tarih alanını `mm/dd/yyyy` gösteriyor (tarayıcı arayüz dili en-US); bulgu değil.
- Dayanıklılık olumlu: 67 proje / 620 görev / 200 kişide ekran geçişleri 0,4–1,3 sn; HTML/markdown/`javascript:` metinleri hiçbir ekranda çalışmadı; yıl sınırında ISO 53. hafta doğru.
