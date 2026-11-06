# Tolga (ui-kirici) · Tur 2 · çapraz saldırı (Cem → Tolga) · 2026-11-04

Kod: `claude/zealous-tesla-hidbc9@81bd671` · port 4183 · 14 betik çalıştırması (`tolga/tur2/betik/01–12`). Ölçümler `tolga/tur2/konsol/`, görüntüler `tolga/tur2/ekran/`.
Ortak koşul (aksi yazmadıkça): sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic · ekran=1440×900 · veri=pilot. Düzeltilmiş `oturum()` kullanıldı.

## Doğrulama

| Bulgu | Karar | Gerekçe / kanıt |
|---|---|---|
| UI-AKS-01 | doğrulandı (K2) | Formda "Sürüm" varsayılanı `Sürüm 1`. Yalnız adla görev eklenince kart "Sürüm 13 · 17 Kas başlıyor"dan "Sürüm 1 · 287 gün geride · 1 Oca – 21 Oca · 1 görev"e dönüyor. Aynı koşuda ikinci görevle 2/2 üretildi. Cem'in devir sorusu: görev Düzenle › Sürüm 13'e taşınınca ya da silinince kart düzeliyor ve yenilemeden sonra da düzgün kalıyor. Sorun geri alınabilir ama ilk görünüm yanıltıcı. `tur2/ekran/t2-01-ekle-sonra-kart.png`, `t2-01-surum13-sonra-kart.png`, `konsol/t2-01-aks01.json` |
| UI-AKS-02 | doğrulandı (K2; kapsam genişledi) | Burak, Portföy › Dikkat gerektirenler › ATLAS (PY Elif) üzerinden görev ekledi (128→129). Aynı yoldan bir görevi tamamlandı işaretledi (bitti 107→108) ve bir görevi sildi (onay "Emin misiniz?"). Elif'in **Günlük notlarının 32'sini de okuyabiliyor** (müdürden gizlenen notlar başka PY'ye açık). **Müdür Ahmet** de aynı üç işlemi yapabildi (ekle, tamamla, sil). Risk ekleme denenemedi: Riskler sekmesinde ekleme düğmesi bulunamadı. Yetkisiz silme ve not okuma eklendiği için uzlaşmada K1'e yükseltilmesi tartışılmalı. `tur2/ekran/t2-02-burak-atlas-gunluk.png`, `t2-02-ahmet-atlas-sonra.png`, `konsol/t2-02-aks02.json` |
| UI-AKS-03 | doğrulandı | Burak'ın ilk 5 uyarısının ilk 3'ü başkasının projesi: ATLAS (15 görev), KALKAN (11 görev), "KALKAN Siber İzleme kritik durumda". Hemen üstteki kart "Dikkat isteyen proje 2 · Kritik proje yok" diyor. `tur2/ekran/t2-04-burak-portfoy.png`, `konsol/t2-04-aks-dom.json` |
| UI-AKS-04 | doğrulandı (K2); aşırı veride fark büyümüyor | Pilot: Portföy **34** (kişi-ay) → tıklanan ekran **9 kişi** → Bölüm özeti **37** → Kapasite–talep **37**. Aşırı: **687** → **98 kişi** → **690** → **690**. Mutlak fark iki veri setinde de 3 kişi-ay (izin kayıtlarından). Kişi ile kişi-ay birim karmaşası ölçekle büyüyor: 98 ve 690 aynı karttan "aşım" olarak okunuyor. `tur2/ekran/t2-03-pilot-doluluk.png`, `t2-03-asiri-doluluk.png`, `t2-03-asiri-kapasite-talep.png`, `konsol/t2-03-aks04.json` |
| UI-AKS-05 | doğrulandı | Görev eklenince `role=status/alert/aria-live` 0, sayfada "eklendi/kaydedildi" yok. Cem'in devir sorusu: çift tık, üçlü tık ve Enter×2 tek görev oluşturuyor (Tur 1 betik 03, 14). Geri bildirim yok ama çift kayıt da yok. `konsol/t2-04-aks-dom.json` → `aks05` |
| UI-AKS-06 | doğrulandı | Klasik formdaki 15 etiketin hiçbiri termin değil, `input[type=date]` sayısı 0. Etiketler: Görev Adı, Jira Kayıt No, Atanan Kişi, Birim, İş Paketi, Hedef, Anahtar Sonuç, Öncelik, Durum, Sürüm, Öncül Görev, Zaman Tahmini, Etiketler, Açıklama, Sürüm planlamasına dahil et. `konsol/t2-05-klasik.json` → `aks06_form` |
| UI-AKS-07 | doğrulandı | Müdür ekranında alt başlık "…**bu haftanın** gelişmeleri…" diyor ama seçili hafta "41. hafta · 5–9 Eki". Bu, "Yayınlandı · 24 gün önce" etiketli eski rapor. `tur2/ekran/t2-04-ahmet-haftalik.png` |
| UI-AKS-08 | doğrulandı | PUSULA'da "Durum raporu" düğmesi "Haftalık durum raporu" başlıklı pencere açıyor. `konsol/t2-04-aks-dom.json` → `aks08` |
| UI-AKS-09 | doğrulandı | Selin'in ekranı "Adam/ay planı · 24 kişi" ile açılıyor. "Birim" süzgecinde yalnız kodlar var: Tüm birimler, U300, U310, U320, U330, U340. `konsol/t2-04-aks-dom.json` → `aks09` |
| UI-AKS-10 | doğrulandı | Klasikte kartlarda `MEDİUM` ve "Tüm Kaynak Adıler" görünüyor. Formda Öncelik `Blocker/High/Medium/Low`, Durum `Backlog/ToDo/InProgress/Done`. `ekran/19-klasik-asiri-gorevler.png` (Tur 1), `konsol/t2-05-klasik.json` |
| UI-AKS-11 | doğrulandı | Ctrl+K'de "istek" araması: Asistan, Bilgi Bankası, Risk raporu, "Planlama asistanı — PUSULA". "Müşteri istekleri" yok. Ekran yalnız "Diğer" menüsünde (Hedefler, Müşteri istekleri, Günlük, İş paketleri, Asistan). `konsol/t2-04-aks-dom.json` → `aks11`, Tur 1 `konsol/18-asiri-xss-select-rapor.json` → `digerMenu` |
| UI-AKS-12 | doğrulandı | Klasik üst çubuk "Portföy, Tahsis, Takvim, **Riskler**, …"; proje çubuğunda bir "**Riskler**" daha var. `konsol/t2-05-klasik.json` → `aks12_ust` |
| UI-AKS-13 | doğrulandı | PUSULA › Liste'de h1 "PUSULA Saha Mobil Uygulaması"; yenileyince h1 "Portföy". Tur 1'deki UI-KRC-04 ile birleşince: yenileme hem yeri hem kaydedilmemiş taslağı götürüyor. `konsol/t2-04-aks-dom.json` → `aks13` |

Özet: **13 doğrulandı · 0 reddedildi · 0 üretilemedi.** Önem değişikliği önerisi yok; UI-AKS-02'nin K1'e yükseltilmesi uzlaşmada tartışılmalı.

## Devir notlarına yanıt (bana yazılanlar)

| Kimden | Not | Sonuç |
|---|---|---|
| Cem 1 | Başka PY'nin projesinde diğer düzenlemeler | Tamamlama, silme ve not okuma açık; müdür de düzenleyebiliyor (UI-AKS-02 satırı). Risk ekleme düğmesi bulunamadı. |
| Cem 2 | "Görevi ekle"ye iki kez basma | Dayandı: tek kayıt (Tur 1 betik 03, 14). |
| Cem 3 | Sürüm 1: taşıyınca/silince kart düzeliyor mu? | Düzeliyor (UI-AKS-01 satırı). CSV/Jira içe aktarma ve Sürüm 1'in silinmesi denenmedi. |
| Cem 4 | Klasik Portföy kartında "Projeyi sil" ve "Proje Yön." | **Bozuldu:** UI-KRC-14, UI-KRC-15 |
| Cem 5 | Rapor taslağı ve yenileme/geri tuşu | Tur 1'de UI-KRC-04. Bu turda "Klasik arayüze dön" yolu da eklendi (aşağıda). |
| Cem 6 | Kapasite–talep'te "Toplam" sütunu kesik | **Bozuldu:** UI-KRC-17 (pilot ve aşırıda aynı) |
| Deniz 1 | Boş veri setinde arayüz/rol uygulanmıyor | Betik hatasıydı (koordinatör `oturum()`'u düzeltti). Tur 1 betik 20'de `bos` + modern + ahmet modern arayüzde, müdür olarak, 0 projeyle açılıyor. Bulgu değil. |
| Deniz 2 | Klasik üst çubuk 1440'a sığmıyor | Tur 1 UI-KRC-11 ile aynı (çapraz doğrulama). |
| Deniz 3 | Zaman çizelgesi çipleri, Kapasite–talep "Toplam" | "Toplam" için UI-KRC-17. Aşırı veride (49 sürüm) şerit tamamen okunmuyor (Kısa notlar). |
| Deniz 4 | Klasikte mor AI düğmesi içeriği örtüyor | Tur 1 görüntüsünde de 4. kartın "v9" rozetini örtüyor (`ekran/19-klasik-asiri-gorevler.png`). Görsel değerlendirme Deniz'de. |
| Ece 1 | Pencere açıkken arka plan klavyeyle | 50 Tab'da odak pencereden çıkıp arkadaki "Yeni görev"e geliyor. Enter yeni pencere açmıyor; form ve yazılan korunuyor, çift kayıt yok. Veri açısından dayandı; odak tuzağı yok, bu Ece'nin şeridi. |
| Ece 2 | Palet Ayarlar'ın üstünde | Üretilemedi: Ayarlar bu oturumda `role=dialog` olarak açılmadı. Paletten Takvim'e geçiş sorunsuz. |
| Ece 3 | Aşırı veride ısı haritası | 200 kişide 2606 düğme, çizim 410 ms, sayfa 12920 px, kaydırma 229 ms. Dayandı (Tab sayısı Ece'nin şeridi). |
| Ece 4 | Logo "hiper sürüş" | 40 hızlı tıkta tek perde ve tek ileti oluştu, 5 sn içinde temizlendi, konsol temiz. Dayandı. |

## Tur 1 bulgularına ek kanıt

- **UI-KRC-04 kapsamı genişledi:** Rapor taslağı kirliyken "Diğer araçlar › Klasik arayüze dön"e basınca onay sorulmadan klasiğe geçiliyor. Taslak ekranda da depoda da yok (2/2: betik 07, 12; `tur2/ekran/t2-07-klasik-sonra.png`, `t2-12-klasik-sonra-taslak.png`).
- **UI-KRC-02'nin iş akışı sonucu** ayrı bulgu olarak yazıldı: UI-KRC-13.
- **UI-KRC-03'ün proje karşılığı** ayrı bulgu olarak yazıldı: UI-KRC-15.

## Yeni bulgular

### UI-KRC-13 · Gönderilen haftalık rapor, eski hâli açık ikinci sekmede "Kaydet"e basılınca sessizce taslağa dönüyor; gönderim tarihçeden siliniyor
- Önem: K1
- Ekran: Haftalık rapor › PUSULA (45. hafta) düzenleyici          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. A sekmesinde PUSULA raporuna madde, plan ve puan gir, "Kaydet". 2. B sekmesinde aynı raporu aç. 3. A'da "Bölüm sorumlusuna gönder" → "Bölüm sorumlusuna gönderildi." 4. B'de bir maddedeki yazım hatasını düzelt, "Kaydet".
- Beklenen: B, "Rapor başka bir aşamaya geçmiş" deyip kaydı reddeder (uygulamada bu mesaj var), ya da güncel hâli yükler.
- Gözlenen (insan dili): B "Kaydedildi." diyor. Depoda rapor `bs_review`'dan `draft`'a dönüyor, tarihçe `["create","submit"]`'tan `["create"]`'e iniyor: gönderim hiç olmamış gibi. Yenileyince A da "Taslak" gösteriyor. Burak raporunu son gün (5 Kasım Perşembe) gönderdiğini sanıyor. Bölüm sorumlusunun kuyruğunda rapor yok, iz de yok.
- Kanıt: `tur2/ekran/t2-08-b-kaydet-sonrasi.png`, `tur2/ekran/t2-08-a-yenile.png` · ölçüm: `tur2/konsol/t2-08-rapor-iki-sekme.json` (gonderildi `bs_review`, tarihçe create+submit → bKaydet `draft`, tarihçe create; mesaj "Kaydedildi.") · 2/2 üretildi
- Olası kök neden: `utils/weeklyReport.ts:298-318` (`saveReport` `existing`'i çağıran sekmenin bellekteki `ws.weeklyReports`'undan alıyor; `canEditReport` eski aşamayı, yani `draft`'ı görüp izin veriyor). Sekmeler arası eşitleme yok: UI-KRC-02 ile aynı kök (`utils/workspaceStore.ts:68`).
- Kapsam: tüm arayüzler (rapor bileşeni ortak)
- Doğrulama: aday (UI-KRC-02 ile birleştirilebilir; iş akışı etkisi ayrı olduğu için ayrı yazıldı)
- Devir: Cem: kullanıcı gönderildiğinden emin olabilmek için neyi görmeli?

### UI-KRC-14 · Klasik Portföy'de PY, kendi projesinin sahibini tek seçimle ya da tek ok tuşuyla, onaysız başkasına veriyor ve projeye erişimini kaybediyor
- Önem: K2
- Ekran: Portföy › proje kartı "Proje Yön." açılır listesi          Arayüz: klasik
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Klasik arayüzde Burak olarak Portföy. 2. NEHİR kartındaki "Proje Yön." listesine odaklan (ya da tıkla). 3. ↓ tuşuna bir kez bas (ya da başka bir kişi seç).
- Beklenen: Sahiplik devri onay ister ("NEHİR'i Can Erdem'e devretmek üzeresiniz; artık düzenleyemeyeceksiniz"). Tercihen PY kendi sahipliğini değiştiremez, bunu müdür/PYB yapar.
- Gözlenen (insan dili): Tek ↓ tuşu NEHİR'i Can Erdem'e (p17) verdi. Fareyle seçimde de PUSULA Elif'e geçti. Kart o an Burak'ın portföyünden kayboluyor, kenar çubuğundan da gidiyor. Yenileyince de yok, Burak bunu geri alamıyor. Onay penceresi yok, bildirim yok. Listede "Sahip atanmadı" seçeneği de var, yani proje sahipsiz bırakılabiliyor.
- Kanıt: `tur2/ekran/t2-05-burak-pm-degisti.png`, `tur2/ekran/t2-09-pm-ok-tusu.png` · ölçüm: `tur2/konsol/t2-05-klasik.json` (`prj-pusula:p14` → `p13`), `tur2/konsol/t2-09-pm-sil.json` (`prj-nehir:p14` → `p17`, diyalog []) · 2/2 üretildi (fare + klavye)
- Olası kök neden: `components/PortfolioView.tsx:141-144` (`canManageOwner` PY'ye de açık; `onChange` doğrudan `onSetOwner` çağırıyor, onay ya da geri alma yok)
- Kapsam: tek ekran (klasik Portföy kartı)
- Doğrulama: aday
- Devir: Cem: PY'nin kendi sahipliğini değiştirebilmesi rol tasarımına uygun mu? Ece: odaklanmış listede ok tuşu değeri anında değiştiriyor.

### UI-KRC-15 · "Projeyi sil"e çift tık iki projeyi tüm verileriyle siliyor
- Önem: K2
- Ekran: Portföy › proje kartı çöp kutusu ("Projeyi sil")          Arayüz: klasik
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak; PUSULA ve NEHİR sahibi) · veri=pilot
- Adımlar: 1. Klasik arayüzde Burak olarak Portföy. 2. PUSULA kartının çöp kutusuna çift tıkla. 3. Onayları kabul et.
- Beklenen: Yalnız PUSULA silinir. Çift tık ikinci bir silme başlatmaz; tercihen geri alma olur.
- Gözlenen (insan dili): İlk onay "PUSULA … silinecek", ikincisi "NEHİR … silinecek" diyor. Kartlar kaydığı için ikinci tık NEHİR'in çöp kutusuna denk geliyor. İkisi de kabul edilince Burak'ın **iki projesi** (204 görev, notlar, riskler) gidiyor, geri alma yok. Onay metni proje adını söylüyor, bu UI-KRC-03'tekinden iyi. Ama aynı yerde art arda gelen iki onaya refleksle "Tamam" demek kolay. UI-KRC-03'teki not burada da geçerli: Playwright'ta ikinci tık onay kapandıktan sonra işliyor.
- Kanıt: `tur2/ekran/t2-09-py-projeyi-sil-cift.png` · ölçüm: `tur2/konsol/t2-09-pm-sil.json`, `tur2/konsol/t2-11-tekrar-denetim.json` (5 → 3 proje: `prj-pusula`, `prj-nehir` gitti; yenileyince de yok) · 2/2 üretildi
- Olası kök neden: `components/PortfolioView.tsx:132` (`window.confirm` sonrası `onDelete`; çift tık koruması ve geri alma yok)
- Kapsam: tek ekran (klasik Portföy; müdürde düğme yok)
- Doğrulama: aday
- Devir: Cem: proje silme için geri alma/çöp kutusu beklentisi.

### UI-KRC-16 · Bölüm sorumlusu hiçbir şey değiştirmeden onaylayınca tarihçeye "düzenledi" kaydı düşüyor
- Önem: K3
- Ekran: Haftalık rapor › bölüm sorumlusu onayı          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=py (burak) → bolum_sorumlu (selin) · veri=pilot
- Adımlar: 1. Burak PUSULA raporunu gönderir. 2. Selin raporu açar; hiçbir alana dokunmaz (ekranda "kaydedilmemiş" uyarısı yok). 3. "Onayla, PYB desteğe gönder".
- Beklenen: Tarihçe `create, submit, bs_approve`.
- Gözlenen (insan dili): Tarihçe `create:Burak, submit:Burak, edit:Selin Kaya, bs_approve:Selin Kaya` oluyor. İçerik (maddeler, plan, puan, kısaltmalar) bire bir aynı. Denetim izi Selin'in raporu değiştirdiğini söylüyor; "kim neyi değiştirdi" sorusunun yanıtı yanlış. Yapay zekâ/sağlık modeline giden "düzenleme" verisi de kirleniyor.
- Kanıt: `tur2/konsol/t2-11-tekrar-denetim.json` (`selinAcinca` tarihçe 2 olay → `onayda` 4 olay, içerik aynı), `tur2/konsol/t2-06-onay-iade.json` (`create, submit, edit, bs_approve`) · 2/2 üretildi
- Olası kök neden: `utils/weeklyReport.ts:318` (`saveReport` içerik değişmese de her seferinde `editReport` çağırıyor), `utils/weeklyReport.ts:236` (aşama `draft` değilse ve düzenleyen farklıysa koşulsuz `edit` olayı ekliyor)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Cem: Akış geçmişinde bu olay kullanıcıya nasıl görünüyor?

### UI-KRC-17 · Kapasite–talep tablosunda kararın dayandığı "Toplam" sütunu 1440 px'te kesik
- Önem: K3
- Ekran: Ekip ve tahsis › Araçlar › Kapasite–talep          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gece (veri varsayılanı) · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot ve aşırı
- Adımlar: 1. Ahmet olarak Ekip ve tahsis › Araçlar › Kapasite–talep. 2. Tablonun sağ ucuna bak.
- Beklenen: Ay sütunları ve "Toplam" pencereye sığar; ya da "Toplam" sabit (yapışkan) sütun olur.
- Gözlenen (insan dili): Sağdaki başlık "To", değerler "12,", "1" diye kesiliyor. Tablo 1150 px, kabı 1094 px, son başlığın sağ kenarı 1455 px (pencere 1440). Yatay kaydırma tablonun içinde var ama kaydırma çubuğu tablonun en altında. Aşırı veride tablo binlerce piksel uzun olduğu için "Toplam"ı görmenin tek yolu en alta inip yana kaydırmak. Aynı ölçü pilot ve aşırı veride aynı; veriden bağımsız.
- Kanıt: `tur2/ekran/t2-03-asiri-kapasite-talep.png`, `tur2/ekran/t2-03-pilot-kapasite-talep.png` · ölçüm: `tur2/konsol/t2-03-aks04.json` → `ktTablo` ({tablo:1150, kap:1094, sonSag:1455, pencere:1440}) · 2/2 üretildi (pilot + aşırı); Cem ve Deniz de gördü
- Olası kök neden: bilinmiyor (Kapasite–talep tablosu; sütun genişlikleri sabit, "Toplam" yapışkan değil)
- Kapsam: tek ekran
- Doğrulama: aday (Cem devri + Deniz devri ile çapraz)
- Devir: Deniz: yapışkan sütun / görsel çözüm. Ece: 1280 px ve yakınlaştırmada.

## Geri çekilenler

Yok. Tur 1 bulgularının hiçbiri eski `oturum()` yarışına dayanmıyor: UI-KRC-01 ve -08 düzeltilmiş oturumla yeniden üretilmişti. `boş` veriyle bulgu yazılmamıştı.

## Kısa notlar

- Dayanan saldırılar:
  - Bölüm sorumlusu "Onayla"ya çift tık → tek `bs_approve`.
  - "İade et" onayına çift tık → tek `return`, gerekçe kaydedildi.
  - Yalnız boşluktan oluşan görev adı reddediliyor.
  - Logoya 40 hızlı tık sorunsuz.
  - Aşırı veride ısı haritası 410 ms'de çiziliyor.
- Zaman çizelgesi şeridi aşırı veride (49 sürüm) okunmuyor: yıl etiketi ay etiketinin üstüne biniyor ("Oca 2000Mar"), sürüm çiplerinde yalnız ":" görünüyor. Görsel olarak 2/2 (`ekran/12-modern-nehir-zaman.png`, `tur2/ekran/t2-12-zaman-asiri.png`). DOM ölçümüm çakışmayı yakalamadı. K4, Deniz'e.
- Başka PY'nin projesinde Günlük (notlar) okunabiliyor. Rol görünürlüğü olduğu için ayrıntısı UI-AKS-02 satırında; karar Cem'in.
- Denenmedi: CSV/Excel/Jira içe aktarmada boş sürüm, Sürüm 1'in silinmesi, başka PY'nin projesine risk ekleme (düğme bulunamadı).
