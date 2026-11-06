# Cem (ui-akis) · Tur 2 · çapraz saldırı · 2026-11-04

Kod: `claude/zealous-tesla-hidbc9@81bd671` + ortak betik `caed25d` · Port 4182 · 13 betik çalıştırması (`betik/kos2.mjs` + `betik/tur2/01…13.json`) · ekran görüntüleri `ekran/t2-*.png` (42 adet).

Koşu notu: Tur 2 API sınırı yüzünden yarıda kaldı ve sistem saatinde 5 Kasım'da sürdü. Çıktı dizinini `UI_TEST_GUN=2026-11-04` ile sabitledim. Uygulamanın "bugün"ü bu yüzden 5 Kasım 2026 Perşembe oldu ("288 gün geride", "Son gün: 5 Kasım"); bulguların hiçbiri tarihe bağlı değil.

Yöntem: Ece'nin her bulgusunu bir rolün günlük işiyle denedim. Bu işler görev eklemek, tema değiştirmek, klasik arayüze geçmek, ekran değiştirmek, tahsis düzenlemek, yüksek riskleri bulmak ve raporu okumak/onaylamaktı. Her birini fareyle, yalnız klavyeyle ve 375 px mobil dokunmayla denedim. Karar iş etkisine göre verildi. Erişilebilirlik ölçütü Ece'nin alanı; önem önerim yalnız "iş yapılıyor mu, ne kadar yavaşlıyor" sorusuna dayanıyor.

## Doğrulama

| Bulgu | Karar | Gerekçe / kanıt |
|---|---|---|
| UI-ERS-01 | doğrulandı (K2 kalsın) | İş: "Temayı Zümrüt Ormanı yap" yalnız klavyeyle. Ayarlar'a 17 Tab. Enter'dan sonra odak arkadaki "Ayarlar" düğmesinde kaldı, belgede `role=dialog` 0. Esc pencereyi kapatmadı. "Zümrüt Ormanı"na 21 Tab gerekti; bunların 15'i bulanık arka plandaki Portföy düğmeleri. "Değişiklikleri Uygula"ya 33 Tab daha; uygulayınca odak `body`ye düştü. Tema uygulandı (`--m-accent #0F766E`). Gören klavye kullanıcısı işi ~70 Tab'da bitiriyor. Ekran okuyucu kullanıcısı pencerenin açıldığını duymuyor. K2 yerinde. `ekran/t2-modern-burak-ayar-01-acik.png`, `ekran/t2-modern-burak-ayar-02-uygula-sonra.png`, `betik/tur2/03-klavye-ayarlar.json` |
| UI-ERS-02 | önem değişmeli (K2 → K3) | 1023 px'te yalnız klavye: "Haftalık rapor"a 8 Tab, 8 durağın 8'i de görünmez çekmecede. Görünmeyen öğede Enter yine de Haftalık rapor'u açtı. "Menüyü aç"a 11 Tab (10'u görünmez). Sorun doğru: kullanıcı her sayfada 10–19 durak boyunca nerede olduğunu görmüyor. Ama gezinme işi engellenmiyor, yalnız körleşip yavaşlıyor; görünür yol ("Menüyü aç") da var. 1024 px altı ekran ile yalnız klavye kullanımının kesişimi dar. WCAG açısından K2'de kalması Ece'nin kararı; iş açısından K3. `ekran/t2-modern-burak-1023-01-gorunmez-enter.png`, `betik/tur2/09-klavye-1023-isi-palet.json` |
| UI-ERS-03 | doğrulandı (K2 kalsın) | "Yapay Zeka Asistanı" ve "Yerel Kayıt" anahtarlarında `aria-label`, `role` ve `aria-checked` yok, içleri boş. Gören kullanıcı yanındaki "Verileri tarayıcıda sakla." yazısıyla anlıyor. Ekran okuyucu kullanıcısı ise verinin saklanıp saklanmayacağını, ne yaptığını bilmeden değiştirebilir; veri kaybına giden bir ayar olduğu için K2 yerinde. Yüksek karşıtlıkta görünmeme kısmını bu turda yeniden denemedim. `betik/tur2/13-ayar-gece-mobil-portfoy.json` |
| UI-ERS-04 | doğrulandı (K2 kalsın) | İş: yüksek karşıtlıkta "Yeni görev"de önceliği "Yüksek" seçmek. Seçili düğme yalnız biraz kalın yazıyla ayrılıyor. Bir de ilk tıklama kayboldu (UI-AKS-15); seçim "Orta"da kaldığı hâlde yüksek karşıtlıkta bunu fark etmek neredeyse imkânsız. Görev yanlış öncelikle kaydedilir. `ekran/t2-modern-burak-zorlu-01-oncelik.png` |
| UI-ERS-05 | önem değişmeli (K2 → K3) | İş: müdür (Ahmet) döteranopi süzgecinde yüksek riskleri bulsun (Ece'nin `risk-yuksek.json` verisi). Matriste Düşük (kahve-zeytin) ile Yüksek (koyu zeytin) zor ayrılıyor; bu doğru. Ama aynı ekranda "Yüksek riskler · skor 15 ve üzeri" listesi her iki riski skor ve proje adıyla yazıyor ("20 Harita servis lisansının…", "16 Saha cihazlarının…"), "Yüksek risk 2 · 2 projede" kartı ve "2 Yüksek" sayacı da var. Müdürün işi renk olmadan tamamlanıyor; matris ikincil görünüm. `ekran/t2-modern-ahmet-deuter-01-risk.png`, `betik/tur2/10-renk-yazi.json` |
| UI-ERS-06 | doğrulandı (K3 kalsın) | İş: "PUSULA'ya iki görev ekle" yalnız klavyeyle. İlk "Yeni görev"e 8 Tab. Görev eklenince odak `body`ye düştü; ikinci "Yeni görev"e **20 Tab** gerekti. İyi haber: "Görev adı" alanında Enter formu gönderiyor, 29 Tab'lık formu geçmek gerekmiyor. Engellemiyor, her görevde yavaşlatıyor. `betik/tur2/01-klavye-iki-gorev.json`, `betik/tur2/02-klavye-enter-ondalik.json`, `ekran/t2-modern-burak-klavye-01-ekle-sonra.png` |
| UI-ERS-07 | önem değişmeli (K3 → K4) | Kaçış doğru: "Görevi ekle"den sonraki Tab `body`ye, sonra arka sayfaya gidiyor. Ama işi yapmak için kaçışa hiç gerek kalmıyor: adda Enter ya da 29. Tab'daki "Görevi ekle" yetiyor. Kullanıcı ancak işi bitirdikten sonra bir Tab daha basarsa dışarı çıkıyor. İş etkisi düşük. `betik/tur2/01-klavye-iki-gorev.json` (1.7–1.9) |
| UI-ERS-08 | doğrulandı (K3 kalsın) | 1023 px'te "Menüyü aç"ta Enter: çekmece açıldı, odak düğmede kaldı. Sonraki 4 Tab arka sayfaya gitti ("Ara", "Profil", "Haftalık rapor nasıl kullanılır?", "Önceki hafta"). Esc çekmeceyi kapatmadı. İşin geçici yolu ERS-02'deki kör Tab'lar. `betik/tur2/09-klavye-1023-isi-palet.json` |
| UI-ERS-09 | doğrulandı (K3 kalsın) | Benim UI-AKS-05 ile aynı kök. Klavyeyle görev ekledikten sonra canlı bölge 0. Telefonda da eklemeden sonra ekranda iz yok, yalnız "76 / 105". Haftalık raporda `role=status` ("Kaydedildi.", "Onaylandı, PYB desteğe gönderildi.") var; uygulama içinde tutarsız. `ekran/t2-modern-burak-mobil-gorev-06-sonra.png` |
| UI-ERS-10 | doğrulandı (K3 kalsın) | İş: "Klasik arayüze dön" yalnız klavyeyle. "Diğer araçlar"a 16 Tab, Enter; ↓ etkisiz. Tab önce "Ayarlar"a, sonra menü öğelerine gidiyor; 6. Tab'da "Klasik arayüze dön" → geçiş oldu. İş yapılabiliyor. Ama menü Esc ile kapanmıyor ve fareyle açık kalınca bir sonraki tıklamayı yutuyor (Tur 1). K3 yerinde. `ekran/t2-klasik-burak-ayar-03-gecis.png` |
| UI-ERS-11 | doğrulandı (K3 kalsın) | İş: Selin Aslı Çakır'ın Kasım tahsisini düzenlesin. Hücreye 47 Tab, oradan "Tahsisi düzenle"ye **288 Tab**. Enter "Tahsis tablosu"nu "U340" süzgeciyle açtı, odak `body`ye düştü. Geçici yol var (Görünüm → Tahsis tablosu + Birim süzgeci, birkaç Tab), ama kullanıcı bunu bilmez. `ekran/t2-modern-selin-klavye-01-tahsis-duzenle.png` |
| UI-ERS-12 | doğrulandı (K3 kalsın) | Selin telefonda çekmeceden "Ayarlar"a dokundu. Çekmece (x=0, 264 px) açık kaldı ve pencerenin solunu örttü ("…CE MODU", "…ygula" okunuyor). Ayar değiştirmek günlük iş değil; karartmaya dokununca düzeliyor. İlk bakışta "bozuk" sanılıyor. `ekran/t2-modern-selin-mobil-09-ayarlar.png` |
| UI-ERS-13 | doğrulandı (K3 kalsın) | Yazı boyutu %200'de içerik büyümedi. Menü "Ekip v…", "Risk ra…", "Görüş…", "Bekl…", "Veri h…", "PU…", "NE…" diye kesildi. Haftalık rapor'a gitmek simgeler sayesinde mümkün, ama yazıyı büyüten kullanıcı içerikten hiç yararlanamıyor. `ekran/t2-modern-burak-yazi200-01-portfoy.png`, `ekran/t2-modern-burak-yazi200-02-haftalik.png` |
| UI-ERS-14 | doğrulandı (K3 kalsın) | Ctrl+K → "tahsis" → ↓ ile seçim "Asistan"a geçti; girdide `aria-activedescendant` = null. Gören klavye kullanıcısı için palet çalışıyor (Enter seçileni açtı). Ekran okuyucu etkisi Ece'nin gerekçesiyle K3. `betik/tur2/09-klavye-1023-isi-palet.json` (2.9–2.15) |

Özet: Ece'nin 14 bulgusunun (K1–K3) 14'ünü de yeniden ürettim. 11'i önemiyle doğrulandı, 3'ünde önem değişikliği öneriyorum (ERS-02 K2→K3, ERS-05 K2→K3, ERS-07 K3→K4). Reddedilen 0, üretilemeyen 0. Ece'nin K4 kısa notlarını atladım.

## Yeni bulgular

### UI-AKS-15 · Görev adı boşken Durum ya da Öncelik'e tıklayınca ilk tıklama kayboluyor; seçim varsayılanda kalıyor
- Önem: K3
- Ekran: Proje › Yeni görev formu          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 ve 375×812 (mobil, dokunmatik) · zorlu renk=kapalı ve açık · rol=py (burak) · veri=pilot
- Adımlar: 1. PUSULA → "Yeni görev" (imleç "Görev adı"nda, alan boş). 2. Ad yazmadan Öncelik'te "Yüksek"e (ya da Durum'da "Süreçte"ye) bir kez tıkla. 3. Seçili düğmeye bak.
- Beklenen: "Yüksek" seçilsin; ad alanının hatası formun düzenini oynatmasın.
- Gözlenen (insan dili): Önce önceliği seçip sonra adı yazmak istedim. "Yüksek"e bastım, seçim "Orta"da kaldı. Aynı anda ad alanının altına kırmızı "Görev adı gerekli." satırı çıktı ve form 26 px aşağı kaydı (düğme y=441 → 467). Tıklamam boşa düştü. İkinci tıklamada seçildi. Fark etmeyen kullanıcı görevi "Orta" öncelikle kaydeder; yüksek karşıtlık modunda seçili düğme yalnız kalın yazıyla ayrıldığı için fark etmek daha da zor. Önce adı yazınca sorun yok. Dört kez üretildi: masaüstü "Yüksek", masaüstü "Süreçte", telefonda dokunma, yüksek karşıtlık.
- Kanıt: `ekran/t2-modern-burak-ilktik-01-yuksek-1.png` · `ekran/t2-modern-burak-ilktik-02-mobil.png` · `ekran/t2-modern-burak-zorlu-01-oncelik.png` · ölçüm: tıklamadan sonra `aria-pressed=true` → ["Yapılacak","Orta"]; ikinci tıklamada ["Yapılacak","Yüksek"] (`betik/tur2/11-ilk-tik-kayiyor.json`, `betik/tur2/12-mobil-rapor-ai.json`)
- Olası kök neden: `components/modern/TaskFormSheet.tsx:149-151` (`autoFocus` + `onBlur={() => setTouched(true)}`; hata `<span>` alanın altına sonradan ekleniyor ve formu kaydırıyor; tıklamanın `mousedown`ı ile `mouseup`ı farklı öğelere düşüyor), `:93` (`nameError` henüz bir şey yazılmadan odak çıkınca gösteriliyor)
- Kapsam: tek ekran (modern görev formu; düzenleme formu da aynı bileşen)
- Doğrulama: aday
- Devir: Ece: hatanın odak çıkar çıkmaz `role=alert` ile okunması klavye kullanıcısını da "daha yazmadım" diye şaşırtıyor (Tolga'nın dil notu).

### UI-AKS-16 · Telefonda doluluk tablosu: bu aya kaydırınca kişi adları kayboluyor
- Önem: K3
- Ekran: Ekip ve tahsis › Doluluk          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=375×812 (mobil, dokunmatik) · rol=bolum_sorumlu (selin) · veri=pilot
- Adımlar: 1. Selin olarak telefonda ☰ → "Ekip ve tahsis". 2. Tabloya in. 3. Bu ayın (Kasım) aşımlarını görmek için tabloyu sağa kaydır.
- Beklenen: Tablo bu ayla açılsın ya da kişi adı sütunu sabit kalsın; kaydırınca hangi satırın kime ait olduğu görünsün.
- Gözlenen (insan dili): Tablo Ocak ve Şubat ile açılıyor; Kasım için 9 sütun sağa kaydırdım. Kaydırınca ad sütunu da gitti (ad hücresi x=−615). Ekranda yalnız "%140, %122, %133…" kaldı; kimin aşımda olduğunu görmek için geri kaydırıp satırı saymam gerekti. Telefondan "bu ay kim aşımda?" sorusunu yanıtlamak 10'dan fazla kaydırma istiyor. İki farklı kaydırmayla üretildi (sona kadar ve Kasım'ı ortalayarak). "Birim" süzgecinde U310'u seçince 9 kişiye iniyor, ama süzgeç yine yalnız kod (UI-AKS-09).
- Kanıt: `ekran/t2-modern-selin-mobil-02b-doluluk-tam.png` (Oca/Şub ile açılış) · `ekran/t2-modern-selin-mobil-08-kasim-orta.png` (Kasım görünür, adlar yok) · ölçüm: kaydırma kabı 343 px / içerik 990 px; ad hücresi `position: static` (`betik/tur2/07-mobil-selin.json`, `betik/tur2/08-mobil-selin-kasim.json`)
- Olası kök neden: `components/modern/ModernAllocation.tsx:266-268` (`overflow-x-auto` + `minWidth: 960`; ad sütunu `sticky` değil; açılışta bu aya kaydırma yok)
- Kapsam: tek ekran (1024 px altı)
- Doğrulama: aday
- Devir: Ece: dar ekranda ızgaranın tablo yapısı (başlık bağlantısı) yok; ekran okuyucuda da satır/sütun ilişkisi kayboluyor (ERS-11 ile birlikte).

### UI-AKS-17 · Telefonda haftalık rapor maddesi ekrana sığmıyor: "Maddeyi sil" kesik, madde 2 satırlık kutuda
- Önem: K3
- Ekran: Haftalık rapor › proje raporu (yazma ve onay)          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=375×812 (mobil, dokunmatik) · rol=py (burak), bolum_sorumlu (selin) · veri=pilot
- Adımlar: 1. Burak telefonda ☰ → Haftalık rapor → PUSULA → "Madde ekle" → "Tamamlanan aşamalar" → iki satırlık bir madde yaz. 2. Selin aynı raporu telefonda onay için açsın.
- Beklenen: Madde satırının düğmeleri ekrana sığsın (gerekirse alt satıra insin); okuyucu (Selin) maddenin tamamını görsün.
- Gözlenen (insan dili): Madde satırındaki çöp kutusu ekranın sağından taşıyor ("Maddeyi sil" 357–393 px, ekran 375 px); yalnız ince bir parçası görünüyor. Metin kutusu 2 satır (47 px, içerik 68 px), maddenin başı kutunun içinde yukarı kayıyor, kendi yazdığımı okuyamıyorum. Selin'in onay ekranında da aynı: maddenin yalnız iki satırı görünüyor, ama "Onayla, PYB desteğe gönder" düğmesi hemen görünür. Raporu okumadan onaylamak, okumaktan kolay. Onayın kendisi telefonda 4 dokunmada çalıştı ("Onaylandı, PYB desteğe gönderildi.").
- Kanıt: `ekran/t2-modern-burak-mobil-rapor-02-madde.png` · `ekran/t2-modern-selin-mobil-05-rapor.png` · `ekran/t2-modern-selin-mobil-06-onay-sonra.png` · ölçüm: `betik/tur2/12-mobil-rapor-ai.json` (1.17)
- Olası kök neden: `components/modern/weekly/ReportEditor.tsx:115-123` civarı (madde başlık satırı: tür seçimi + yukarı/aşağı/sil düğmeleri tek satırda, dar ekranda sarılmıyor; metin kutusu sabit 2 satır)
- Kapsam: tek ekran (1024 px altı)
- Doğrulama: aday
- Devir: Deniz: dar ekranda madde kartının düzeni; Ece: yarısı ekran dışındaki 36×36 sil düğmesi dokunma hedefi.

### UI-AKS-18 · AI düğmeleri kullanıcıya "AI_API_KEY tanımlı değil." diyor
- Önem: K3
- Ekran: Haftalık rapor › "Taslak öner" (modern) · Görev formu › "AI ile tahmin et" (klasik)          Arayüz: modern + klasik
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Haftalık rapor → PUSULA → sağdaki büyük mavi "Taslak öner". 2. Klasikte Görevler → Yeni Görev → ad yaz → "AI ile tahmin et".
- Beklenen: AI kapalıysa düğme ya görünmesin ya da sade bir dille ne olduğunu ve kime başvurulacağını söylesin ("AI önerisi bu kurulumda açık değil; yöneticinize başvurun").
- Gözlenen (insan dili): Rapor ekranındaki en göze batan düğme "Taslak öner". Bastım, altında pembe kutuda "AI_API_KEY tanımlı değil." yazdı. Bu bir sunucu ayarının adı; PY olarak ne yapacağımı bilmiyorum, hatayı ben mi yaptım onu da bilmiyorum. Klasik görev formundaki "AI ile tahmin et" de aynı metni gösterdi. Pilotta AI anahtarı yoksa en belirgin eylem her seferinde başarısız oluyor. İki arayüzde, iki ayrı ekranda üretildi.
- Kanıt: `ekran/t2-modern-burak-devir-05-ai-hata.png` · `ekran/t2-klasik-burak-ai-01-tahmin.png` · `betik/tur2/04-devir-gorev-rapor.json` (2.11), `betik/tur2/12-mobil-rapor-ai.json` (2.7)
- Olası kök neden: `server/ai/config.ts:102` (`problem: 'AI_API_KEY tanımlı değil.'` metni arayüze olduğu gibi aktarılıyor)
- Kapsam: tüm arayüzler
- Doğrulama: aday
- Devir: Tolga: AI hata mesajındaki "bkz. docs/AI_KURULUM.md" bu koşuda görülmedi; başka bir hata yolunda olabilir.

### UI-AKS-19 · Telefonda Portföy: PY'nin projeleri 1,6 ekran aşağıda, ilk ekranda yalnız "Yeni proje"
- Önem: K4
- Ekran: Portföy          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=pilot varsayılanı · renk teması=classic
         ekran=375×812 (mobil, dokunmatik) · rol=py (burak) · veri=pilot
- Adımlar: 1. Burak telefonda uygulamayı açar. 2. Projesine gitmek ister.
- Beklenen: İlk ekranda kendi projeleri ya da projeye giden kısa yol olsun.
- Gözlenen (insan dili): İlk ekranı tam genişlikte dört özet kartı ve tek mavi düğme "Yeni proje" dolduruyor; PY için günlük iş bu değil. "Projeler" başlığı 1319 px'te (1,6 ekran aşağıda); arada başkalarının projeleriyle dolu "Dikkat gerektirenler" var (UI-AKS-03). Projeme ☰ menüsünden iki dokunmada gittim; yol var ama ilk bakışta görünmüyor.
- Kanıt: `ekran/t2-modern-burak-mobil-gorev-01-acilis.png` · ölçüm: `betik/tur2/13-ayar-gece-mobil-portfoy.json` (2.1)
- Olası kök neden: bilinmiyor (`components/modern/ModernPortfolio.tsx` bölüm sırası)
- Kapsam: tek ekran
- Doğrulama: aday
- Devir: —

## Tur 1 bulgularıma ek kanıt

- UI-AKS-01 (varsayılan "Sürüm 1"): telefonda da üretildi; "Şu anki sürüm: Sürüm 1 · 288 gün geride" (`betik/tur2/06-mobil-burak-gorev.json`). Ece de bağımsız üretmiş (`ece/devir.md` → Cem 1): **doğrulandı (Ece)**.
- UI-AKS-03 (Dikkat gerektirenler kapsamı): Deniz bağımsız üretmiş (`deniz/devir.md` → Cem 1): **doğrulandı (Deniz)**.
- UI-AKS-05 (görev eklemede geri bildirim yok): Ece'nin UI-ERS-09'u ve Tur 2 telefon denemesi: **doğrulandı (Ece)**.
- UI-AKS-09 (bölüm kodları): Selin'in "Tahsisi düzenle"si tabloyu yine yalnız "U340" koduyla süzüyor (`ekran/t2-modern-selin-klavye-01-tahsis-duzenle.png`).
- UI-AKS-12 (ad tutarsızlığı): Ctrl+K'da "tahsis" → "İşgücü Tahsisi" (kenar çubuğunda "Ekip ve tahsis"); Deniz de aynısını bildirdi.

## Bana gelen devirler (yanıtlar)

**Tolga**
1. **Silme onayı (UI-KRC-03):** Modernde liste › işlemler › Sil ve klasikte kart › Sil, ikisi de yalnız "Emin misiniz?" diyor (`betik/tur2/05-devir-sil-taslak.json`). Kullanıcı ikinci "Emin misiniz?" sorusunu ilk silmenin tekrarı sanır; ikinci görevin gittiğini fark etmez. Beklenti: "“PSL-75 Çevrimdışı senkronizasyon…” silinsin mi? Bu işlem geri alınamaz." ya da onay yerine birkaç saniyelik "Görev silindi · Geri al". K2 uygun.
2. **Rapor taslağı (UI-KRC-04):** Ürettim. Madde yazdım, kenar çubuğundan Portföy'e gittim, geri döndüm: madde yok, hiçbir şey sorulmadı; liste "Yazılmadı" diyor. Ekrandaki küçük "Kaydedilmedi" etiketi tek ipucu. Raporlar hafta içinde parça parça yazıldığı için beklenti taslağın kendiliğinden kaydedilmesi; en azından her çıkışta sorulması. Perşembe son gününde yazılanın kaybolması iş açısından ağır; K2 uygun. `ekran/t2-modern-burak-devir-08-taslak-geri.png`
3. **Ondalık süre (UI-KRC-05):** Türkçe yazan kullanıcı "1,5" yazar; etiket "Süre tahmini (gün)" olduğu için birim belli. Ben "1,5 / 2,5 / 0,5" yazdım; alanlar "15 / 25 / 05" oldu, "En iyi ≤ olası ≤ en kötü olmalı." uyarısı çıktı ve görev eklenmedi. Kullanıcı nedenini anlamaz. Sıralama tutsaydı görev on kat büyük tahminle kaydedilirdi. Beklenti: virgül ve nokta kabul edilsin, yarım gün yazılabilsin. K2 uygun. `ekran/t2-modern-burak-devir-02-ondalik.png`
4. **Dil:**
   - "Görev adı gerekli." gerçekten daha yazmadan, alandan ilk çıkışta görünüyor. Üstelik formu kaydırıp ilk tıklamayı yutuyor → UI-AKS-15.
   - AI hatasında "bkz. docs/AI_KURULUM.md" bu koşuda karşıma çıkmadı. Gördüğüm "AI_API_KEY tanımlı değil." → UI-AKS-18.
   - Format denetiminin "İSTANBUL"u kısaltma sayması: **üretilemedi** (bu koşuda). "Toplantı" türü ayrı alanlarla (yer, katılımcılar…) açıldı, metni tek alana yazamadım.
   - UI-KRC-01 (sessiz silme): kendi şeridimde denemedim. Beklenti, veriyi silmeden önce açık bir uyarı ve yedek önerisi.
5. **Başarıyla tamamlanan akışlar** (kötü yoldan tekrar için):
   - Görev ekleme, modern: PUSULA → "Yeni görev" → ad → "Görevi ekle" (3 tık). Klavyeyle: 8 Tab → Enter → ad → Enter.
   - Görev ekleme, telefon: ☰ → PUSULA → "Yeni görev" → ad → "Görevi ekle".
   - Görev ekleme, klasik: "Aç" → "Görevler" → "Yeni Görev" → ad → "Kaydet".
   - Haftalık rapor, modern ve klasik: Haftalık rapor → "Rehberi kapat" → PUSULA satırı → "Madde ekle" → tür → metin → "Plan ekle" → metin → "7 / 10" → "Kaydet" → "Bölüm sorumlusuna gönder".
   - İade, modern: Selin → Haftalık rapor → "Onay bekleyen" → satır → "İade et" → gerekçe → "İade et"; Burak'ta "İade edildi — Selin Kaya".
   - Onay: klasik masaüstü ve modern telefon → "Onayla, PYB desteğe gönder".
   - Arayüz geçişi: "Diğer araçlar" → "Klasik arayüze dön" (fare ve klavye).
   - Tema: Ayarlar → "Zümrüt Ormanı" → "Değişiklikleri Uygula".

**Deniz**
1. **Dikkat gerektirenler:** UI-AKS-03 ile aynı; doğrulama olarak işlendi (yukarıda).
2. **Ad tutarsızlıkları:** Ctrl+K'daki "İşgücü Tahsisi"yi doğruladım. "Yönetim Ekranı"nı bu turda açmadım. Hepsi UI-AKS-12 altında birleşmeli.
3. **Gece/Gündüz (UI-GRS-01):** Kullanıcı olarak denedim. Ayarlar'da "GÜNDÜZ MODU"na bastım, etiket "GECE MODU" oldu. "Değişiklikleri Uygula"dan sonra ekran hiç değişmedi (gövde `rgb(249,250,251)`), ama depoda `isDarkMode: true`. Kullanıcı basınca ekranın hemen kararmasını bekler; değişmeyince "bozuk" der. Düğme kaldırılmamalı, sistem tercihini ezmeli. Sistemi izlemek isteniyorsa üçüncü bir seçenek ("Sistem") olmalı; etiket de durumu değil eylemi söylemeli ("Gece moduna geç"). K2 uygun. `ekran/t2-modern-burak-gece-01-uygula-sonra.png`
4. **Durum raporu (UI-GRS-10):** Metin kutusu 47 px, içerik 810 px (32 satır). "Kopyala" çalışıyor ("Kopyalandı"), "E-posta" düğmesi de var; yani paylaşma yapılabiliyor. Pencerenin kendi vaadi olan "düzenleyip paylaşabilirsiniz" kısmındaki gözden geçirme ise pratikte yapılamıyor. Kutu dikey büyütülebiliyor (`resize: vertical`), ama bunun ipucu yok. İş açısından K3. Siyah ve lacivert "adalar" bilinçli olsa da kullanıcıda "başka bir uygulamaya geçtim" hissi bırakıyor; UI-AKS-12 (iki arayüz arasındaki ad farkı) ile birlikte ele alınmalı. `ekran/t2-modern-burak-devir-06-durum-raporu.png`

**Ece**
1. Varsayılan sürüm ve 2. geri bildirim yok: Tur 1 bulgularım UI-AKS-01 ve UI-AKS-05 ile aynı; yukarıda "doğrulandı (Ece)" olarak işlendi.
3. Yalnız klavyeyle gerçek işler: "iki görev ekle", "temayı Zümrüt yap", "klasik arayüze dön", "1023 px'te ekran değiştir" ve "tahsis düzenle" işleri yapıldı; sonuçlar Doğrulama tablosunda.

## Geri çekilenler

Yok. Tur 1 bulgularından hiçbiri Tur 2'de çürütülmedi.
