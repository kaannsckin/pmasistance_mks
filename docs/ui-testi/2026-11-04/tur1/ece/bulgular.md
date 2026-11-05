# Ece (ui-erisim) · Tur 1 bulguları · 2026-11-04

Kod: `claude/zealous-tesla-hidbc9@81bd671` · Arayüz: modern · Veri: pilot (risk renk denetimi için ayrıca pilot kopyası, iki risk yüksek: `veri/risk-yuksek.json`)
Betikler: `betik/b01…b22` (24 çalıştırma) · Odak sırası çizelgeleri: `odak-sirasi/` · Ekran görüntüleri: `ekran/`

## Koşu özeti

Bulgu sayısı: **14** (K1: 0 · K2: 5 · K3: 9) + kısa notlar.

| Ekran | Klavye | Anlam (ARIA) | Yakınlaştırma %200 | Renk (körlük / yüksek karşıtlık) | Hareket | Cihaz (375 / 1023 / 1024) |
|---|---|---|---|---|---|---|
| Kenar çubuğu / çekmece | sorun: ERS-02, ERS-08, ERS-10 | iyi (nav "Ana menü") · `aria-expanded` yok (ERS-08) | geçti (çekmece kayıyor) | yüksek karşıtlık: aktif öğe ayrılmıyor (ERS-04) | geçti | sorun: ERS-02, ERS-12 |
| Portföy | geçti (odak halkası 3 px, açık/koyu/Gece) | geçti (h1→h2, bölgeler adlı) | geçti (yatay kaydırma yok) | kontrast geçti · yüksek karşıtlık: ERS-04 | geçti (roket/hiper sürüş duruyor) | geçti (yatay kaydırma yok) |
| Proje genel bakış | geçti | iyi (sekme listesi, bölgeler) · kısa not: sekme deseni | geçti | yüksek karşıtlık: ERS-04 | geçti | segment 40 px (kısa not) |
| Yeni görev formu | sorun: ERS-06, ERS-07 | geçti (tüm alanlar etiketli, hata `role=alert`) | geçti (form kaydırılıyor, düğmeler görünür) | yüksek karşıtlık: ERS-04 | — | geçti (375) |
| Ayarlar penceresi | sorun: ERS-01, ERS-06 | sorun: ERS-01, ERS-03 | sorun (telefonda/dar ekranda çekmece üstte): ERS-12 | sorun: ERS-03 | — | sorun: ERS-12 |
| Komut paleti (Ctrl+K) | kısayol çalışıyor · sorun: ERS-06, ERS-14 | sorun: ERS-14 | — | — | — | — |
| Pano (Kanban) | sorun: ERS-06, ERS-10 (kart menüsü) | kart ve "işlemler" adlı · sorun: ERS-09 | — | — | geçti (tamamlamada animasyon yok) | — |
| Risk raporu / proje riskleri | geçti | iyi (hücre adlarında düzey var) | — | sorun: ERS-05, ERS-04 | — | — |
| Ekip ve tahsis (doluluk ısı haritası) | sorun: ERS-11 | iyi (hücre adında kişi, ay, oran) | — | renk körlüğünde ayrılıyor (yüzdeler yazılı) · koyu modda 4,26:1 (kısa not) | — | — |
| Yalnız yazı %200 (1280×800) | — | — | sorun: ERS-13 | — | — | — |

Odak halkası: açık sistem, koyu sistem ve uygulamanın Gece modunda (sistem açık) düğmelerde 3 px, 2 px aralıklı mavi halka; her üçünde de gözle görülüyor (`ekran/modern-light-portfoy-odak-*.png`, `modern-dark-portfoy-odak-*.png`, `modern-light-gece-odak-*.png`). Form alanlarında halka yerine ince kenarlık rengi (kısa not).

---

### UI-ERS-01 · Ayarlar penceresi açılınca odak arkada kalıyor, Esc kapatmıyor, ekran okuyucu pencereyi görmüyor
- Önem: K2
- Ekran: Ayarlar penceresi ("Uygulama Ayarları")          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. Portföy'de 17 kez Tab'a basıp kenar çubuğundaki "Ayarlar"a gel. 2. Enter. 3. Tab'a basmaya devam et. 4. Esc'e bas.
- Beklenen: Pencere açılınca odak pencerenin içine (başlığa ya da ilk denetime) geçer, Tab pencerenin içinde döner, Esc pencereyi kapatır, kapanınca odak "Ayarlar" düğmesine döner. Ekran okuyucu "Uygulama Ayarları, iletişim kutusu" der.
- Gözlenen (insan dili): Pencere açıldı ama odak bulanık arka planda, "Ayarlar" düğmesinde kaldı. Tab'a bastıkça bulanık Portföy sayfasının 15 düğmesini ("Yeni proje", "Tümünü göster", proje satırları…) tek tek gezdim; pencerenin "Kapat" düğmesine ancak 16. Tab'da ulaştım. Pencerenin sonundan sonra odak yine arka plana çıktı. Esc'e hem odak arkadayken hem pencere içindeyken bastım: pencere kapanmadı. "Kapat"la kapattığımda odak sayfanın en başına düştü. Erişilebilirlik ağacında pencere `dialog` değil; başlık ve düğmeler sayfanın sonuna eklenmiş düz öğeler, arka plan da "gizli" işaretlenmemiş. Ekran okuyucu kullanıcısı pencerenin açıldığını hiç duymaz. (WCAG 2.4.3 Odak sırası, 4.1.2 Ad-rol-değer, 2.1.2 Klavye tuzağı yok ama tersi: kaçış yok)
- Kanıt: `ekran/modern-light-ayarlar-acik.png` (odak halkası arka plandaki Ayarlar düğmesinde) · `ekran/modern-light-ayarlar-esc-sonra.png` (Esc sonrası pencere hâlâ açık, odak arkadaki logoda) · `odak-sirasi/modern-light-ayarlar.md`, `odak-sirasi/modern-dark-ayarlar.md` · ölçüm: Ayarlar açıkken 40 Tab'ın 40'ı da `[role=dialog]` dışında (pencere yok), "Kapat"a 16. Tab'da ulaşılıyor; `betik/b02-sonuc.json`, `betik/b03-sonuc.json`
- Olası kök neden: `components/SettingsModal.tsx:101-110` (dış kap `div.fixed`; `role="dialog"`, `aria-modal`, başlık bağlantısı, Esc dinleyicisi, ilk odak ve odak dönüşü yok). Modern `Sheet` bileşeni (`components/modern/ui.tsx:39-47`) bunları kısmen yapıyor; Ayarlar onu kullanmıyor.
- Kapsam: tek ekran (Ayarlar; klasik arayüzde de aynı bileşen kullanılıyorsa tüm arayüzler)
- Doğrulama: aday · 2 kez üretildi (açık ve koyu sistem teması)
- Devir: Cem: Ayarlar'ı yalnız klavyeyle açıp tema değiştirme işini deneyebilir ("bu işi engelliyor mu?").

### UI-ERS-02 · 1024 px altında kapalı çekmecedeki 19 düğme Tab sırasında: odak görünmez yerlerde dolaşıyor
- Önem: K2
- Ekran: Kenar çubuğu → çekmece (tüm ekranlar)          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1023×768 ve 375×812 (mobil, dokunmatik) · rol=py (Burak), bolum_sorumlu (Selin) · veri=pilot
- Adımlar: 1. Pencereyi 1023 px genişliğe indir (ya da telefonda harici klavyeyle aç). 2. Çekmeceyi açmadan Tab'a bas.
- Beklenen: Kapalı çekmecenin içeriği Tab sırasından ve erişilebilirlik ağacından çıkar; ilk Tab görünür "Menüyü aç" düğmesine gider.
- Gözlenen (insan dili): İlk 18 Tab'da (telefonda 19) ekranda hiçbir şey vurgulanmadı. Odak ekranın solunda, görünmeyen çekmecedeki "PlanAsistan", "Menüyü kapat", "Portföy", "Ekip ve tahsis"… düğmelerinde geziyordu. 5. Tab'da Enter'a bassaydım, görmediğim "Ekip ve tahsis" açılacaktı. Görünür ilk öğeye ("Menüyü aç") 19. Tab'da (telefonda 20.) ulaştım. Ekran okuyucu da sayfaya her girişte önce görünmeyen 19 menü öğesini okuyor. 1024 px'te sorun yok (çekmece kenar çubuğuna dönüyor). (WCAG 2.4.7 Odak görünür, 2.4.3 Odak sırası, 1.3.2 Anlamlı sıra)
- Kanıt: `ekran/modern-1023-tab5-gorunmez-odak.png` (odak "Ekip ve tahsis"te, ekranda hiçbir halka yok) · `odak-sirasi/modern-1023-portfoy.md`, `odak-sirasi/modern-375-kapali-cekmece.md` (satırlar 1–19 "Ekranda: HAYIR", konum x=-265) · ölçüm: kapalı çekmece `transform: translateX(-277px)`, `visibility: visible`, `inert` yok, `aria-hidden` yok (`betik/b07-sonuc.json` → `cekmeceStil`)
- Olası kök neden: `styles/modern.css:192` (çekmece yalnız `transform` ile ekran dışına itiliyor; kapalıyken `visibility: hidden` ya da `inert` yok) · `components/modern/ModernSidebar.tsx:154-158`
- Kapsam: arayüzün tamamı (1024 px altındaki her ekran)
- Doğrulama: aday · 2 kez üretildi (1023×768 masaüstü, 375×812 telefon)
- Devir: —

### UI-ERS-03 · Ayarlar'daki iki anahtar adsız ve durumsuz; yüksek karşıtlık modunda tamamen görünmüyor
- Önem: K2
- Ekran: Ayarlar → Özellikler & Veri ("Yapay Zeka Asistanı", "Yerel Kayıt")          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz · renk teması=classic · zorlu renk (forced-colors)=açık ve kapalı
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. Ayarlar'ı aç. 2. "VERİLERİ SIFIRLA"ya kadar Tab, sonra bir Shift+Tab ("Yerel Kayıt" anahtarı). 3. Erişilebilirlik ağacına bak. 4. Space'e bas. 5. Aynı ekranı Windows yüksek karşıtlık (forced-colors) ile aç.
- Beklenen: Anahtar "Yerel Kayıt, anahtar, açık" diye okunur (`role="switch"` + `aria-checked` + ad); yüksek karşıtlıkta anahtarın çerçevesi ve topuzu görünür.
- Gözlenen (insan dili): Odak halkası anahtarın üstünde göründü ama ekran okuyucunun alacağı tek bilgi "düğme": ad yok, açık mı kapalı mı yok. Space'e basınca anahtar kapandı; değişiklik yine hiçbir öznitelikte yansımadı (yalnız renk sınıfı değişiyor). Yüksek karşıtlık modunda iki anahtar da tamamen kayboldu: kartta yalnız "Yapay Zeka Asistanı / Akıllı analiz asistanı." yazısı var, tıklanacak bir şey görünmüyor; ancak odaklanınca halkanın şekli beliriyor. Bu ayarlardan biri verinin tarayıcıda saklanıp saklanmayacağını belirliyor; ne yaptığını bilmeden değiştirilebilir. (WCAG 4.1.2 Ad-rol-değer, 1.4.11 Metin dışı kontrast)
- Kanıt: `ekran/modern-light-ayarlar-anahtar-odak.png` · `ekran/modern-forced-ayarlar.png` (anahtarlar yok) · `ekran/modern-forced-light-anahtar-odakta.png` (yalnız odak halkası) · `betik/b02-aria-ayarlar.txt` satır 64–67 (`- button` adsız) · `betik/b05-sonuc.json` → `anahtarSonra.aria: "class,style"`
- Olası kök neden: `components/SettingsModal.tsx:201-221` (anahtar `<button>`: `aria-label`, `role="switch"`, `aria-checked` yok; açık/kapalı durumu yalnız `bg-primary`/`bg-gray-300` zemin rengiyle; topuz `span` zemin rengiyle çiziliyor, yüksek karşıtlıkta siliniyor)
- Kapsam: tek ekran
- Doğrulama: aday · 2 kez üretildi (forced-colors koyu ve açık sistem; ARIA açık ve koyu)
- Devir: —

### UI-ERS-04 · Yüksek karşıtlık modunda seçili durumlar, ilerleme çubukları, risk matrisi ve pencere sınırları kayboluyor
- Önem: K2
- Ekran: Portföy, proje genel bakış, Yeni görev formu, Risk raporu, Ekip ve tahsis          Arayüz: modern
- Koşul: sistem teması=koyu ve açık · zorlu renk (forced-colors)=açık · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (Burak), mudur (Ahmet) · veri=pilot
- Adımlar: 1. İşletim sisteminde yüksek karşıtlığı aç (emülasyon: `forcedColors: 'active'`). 2. Portföy'e, bir projeye, Yeni görev formuna, Risk raporuna ve Ekip ve tahsis'e bak.
- Beklenen: Seçili öğe, ilerleme ve durum, çerçeve ya da sistem renkleriyle (`Highlight`, `ButtonBorder`) hâlâ ayırt edilir.
- Gözlenen (insan dili): Kenar çubuğunda hangi ekranda olduğumu göremedim: "Portföy" diğerlerinden farksız. "Tümü / Devam eden…" süzgecinde ve görev formundaki "Durum" ile "Öncelik" seçimlerinde seçili düğme yalnız biraz daha kalın yazıyla ayrılıyor. Proje satırlarındaki ilerleme çubukları ve renkli durum noktaları tamamen yok. Risk matrisinde hücre zeminleri ve lejant kareleri silindi: ızgarada yalnız havada duran sayılar kaldı; hangi hücrenin yüksek risk olduğu hiçbir biçimde görünmüyor. Yeni görev penceresinin çerçevesi yok; arkadaki sayfa yazılarıyla formun kenarı birbirine karışıyor. "Yeni proje", "Değişiklikleri Uygula" gibi ana düğmelerin sınırı da yok, düz yazıya dönüşüyor. Doluluk ısı haritasında aşım hücrelerinin kırmızısı gidiyor ama yüzdeler kaldığı için bilgi okunabiliyor. (WCAG 1.4.11 Metin dışı kontrast, 1.4.1 Rengin kullanımı)
- Kanıt: `ekran/modern-forced-portfoy.png` · `ekran/modern-forced-light-proje.png` · `ekran/modern-forced-light-gorev-formu.png` · `ekran/modern-forced-risk-matrisi.png` · `ekran/modern-forced-doluluk.png`
- Olası kök neden: seçili/doluluk bilgisinin yalnız `background-color` ile verilmesi ve `border-0` (ör. `components/modern/RiskParts.tsx:53-61` matris hücresi; `styles/modern.css` `.m-segment`/`.m-segmented`); `@media (forced-colors: active)` kuralı yok
- Kapsam: arayüzün tamamı
- Doğrulama: aday · 2 kez üretildi (koyu ve açık sistem teması)
- Devir: Deniz: aynı ekranları yüksek karşıtlıkta "görsel hiyerarşi" gözüyle de görmesi faydalı.

### UI-ERS-05 · Risk matrisinde düzey yalnız renkle anlatılıyor; döteranopide "Yüksek" ile "Düşük" aynı görünüyor
- Önem: K2
- Ekran: Risk raporu → Portföy risk matrisi; proje → Riskler → Risk matrisi          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz · renk teması=classic · süzgeç=döteranopi, protanopi, tritanopi, gri
         ekran=1440×900 · rol=mudur (Ahmet) · veri=pilot ve pilot kopyası (ATLAS'ta bir risk P5×E4, PUSULA'da bir risk P4×E4)
- Adımlar: 1. Ahmet olarak Risk raporu'nu aç. 2. Döteranopi süzgecini uygula. 3. Matristeki dolu hücrelere ve lejanta bak.
- Beklenen: Hücrenin düzeyi (Düşük/Orta/Yüksek) renk dışında da görülür: hücrede kısa düzey yazısı ya da desen/simge; lejant kareleri renk körlüğünde ayrılır.
- Gözlenen (insan dili): Hücredeki sayı risk sayısı, düzey değil; düzeyi yalnız zemin rengi söylüyor. Döteranopi süzgecinde iki yüksek risk hücresi (5×4 ve 4×4) koyu zeytin, düşük risk hücreleri de koyu zeytin-kahve göründü; ikisinde de beyaz yazı var, yan yana koyunca bile zor ayrılıyor. Lejanttaki "Düşük" ve "Yüksek" kareleri aynı renk. Boş hücrelerin bölge tonları (açık yeşil/açık turuncu/açık pembe) tümüyle aynı bej oluyor. Gri tonlamada da Yüksek ile Düşük yalnız biraz koyuluk farkıyla ayrılıyor. Ekran okuyucu için hücre adları düzeyi söylüyor ("Olasılık 4 × Etki 2 = 8, Orta: 1 risk"), sorun gören ama renk ayıramayan kullanıcıda. Ekip ve tahsis ısı haritası ise yüzdeler yazılı olduğu için tüm süzgeçlerde okunuyor (iyi örnek). (WCAG 1.4.1 Rengin kullanımı)
- Kanıt: `ekran/modern-normal-riskyuksek-matris.png` ↔ `ekran/modern-deuteranopi-riskyuksek-matris.png`, `modern-protanopi-riskyuksek-matris.png`, `modern-tritanopi-riskyuksek-matris.png`, `modern-gri-riskyuksek-matris.png` · pilot verisiyle: `ekran/modern-deuteranopi-light-risk-matrisi.png` · proje matrisi: `ekran/modern-deuteranopi-riskyuksek-proje-riskler.png` · ölçüm: Düşük hücre `#1F7A35`, Orta `#E07800` (normal görüşte)
- Olası kök neden: `components/modern/RiskParts.tsx:53-61` (düzey yalnız `RISK_TONE[band].solid` zemini; hücre içeriği yalnız sayı)
- Kapsam: arayüzün tamamı (portföy ve proje risk matrisi)
- Doğrulama: aday · 2 kez üretildi (pilot ve yüksek riskli pilot kopyası)
- Devir: Deniz: risk paletinin renk körlüğüne uygun hâle getirilmesi (marka uyumu onun alanı).

### UI-ERS-06 · Pencere, menü ve paletler kapanınca odak sayfanın en başına düşüyor
- Önem: K3
- Ekran: Yeni görev formu, Ayarlar, Pano kart "işlemler" menüsü, Komut paleti          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. PUSULA projesinde (kenar çubuğundan Enter ile girip) 8 Tab ile "Yeni görev"e gel, Enter. 2. Ad yaz, Esc'e bas (ya da "Kapat"a ya da "Görevi ekle"ye). 3. Tab'a bas.
- Beklenen: Pencere kapanınca odak açan düğmeye ("Yeni görev") döner; kart menüsünde seçim yapınca odak aynı karta döner.
- Gözlenen (insan dili): Her üç kapanışta da odak `body`'ye düştü; sonraki Tab beni sayfanın en başındaki "PlanAsistan" logosuna götürdü. Kaldığım "Yeni görev"e dönmek için yine 20 Tab gerekti (17 kenar çubuğu + "Portföy", "Durum raporu", "Yeni görev"). Pano'da bir kartı "işlemler → Süreçte" ile taşıdıktan sonra da odak kayboldu; taşıdığım kartı bulmak için sütunları baştan gezmem gerekti. Ayarlar'da "Kapat" ve "Değişiklikleri Uygula" sonrası ve komut paletini Esc ile kapattıktan sonra da aynı. (WCAG 2.4.3 Odak sırası)
- Kanıt: `betik/b06-sonuc.json` (esc1, esc2, xKapat, enter, ekle → `odak: "(body)"`, sonraki Tab "PlanAsistan — ana ekrana dön") · `betik/b21-sonuc.json` (ayarUygula, panoTasi → `(body)`) · `betik/b02-sonuc.json` → `paletEscOdak: "(body)"` · `ekran/modern-light-pano-surecte-sonra.png`
- Olası kök neden: `components/modern/ui.tsx:39-47` (`Sheet` Esc'i dinliyor ama açılıştaki odaklı öğeyi saklayıp kapanışta geri vermiyor) · `components/CommandPalette.tsx:89-97` (`onClose` sonrası odak dönüşü yok) · `components/modern/TaskActionsMenu.tsx:47`
- Kapsam: arayüzün tamamı
- Doğrulama: aday · 2+ kez üretildi (Esc iki kez, ayrıca X, Ekle, Uygula, kart menüsü, palet)
- Devir: Cem: "görev ekle, sonra bir tane daha ekle" işini yalnız klavyeyle denemesi; her seferinde 20 Tab.

### UI-ERS-07 · "Yeni görev" penceresinde Tab dışarı kaçıyor: arka sayfa pencere açıkken kullanılabiliyor
- Önem: K3
- Ekran: Yeni görev formu (ve modern `Sheet` kullanan diğer pencereler)          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. "Yeni görev" penceresini aç. 2. 28 kez Tab'a bas ("Görevi ekle"ye kadar). 3. Bir kez daha Tab.
- Beklenen: Pencere `aria-modal="true"` olduğu için Tab son öğeden ilk öğeye ("Kapat" ya da "Görev adı") döner.
- Gözlenen (insan dili): Pencere açılınca odak doğru yere, "Görev adı" alanına geldi; alanların hepsi etiketli, güzel. Ama "Görevi ekle"den sonraki Tab'da odak pencereden çıktı: önce hiçbir yere (görünmez `body`), sonra karartmanın arkasındaki "PlanAsistan" logosuna. Karartmanın altında halkayı seçmek zor; Enter'a bassam pencere açıkken arka sayfada gezinmeye başlayacaktım. Ekran okuyucu pencerenin modal olduğunu duyuyor ama klavye öyle davranmıyor. (WCAG 2.4.3 Odak sırası; ARIA APG modal dialog)
- Kanıt: `odak-sirasi/modern-light-gorev-formu.md`, `odak-sirasi/modern-dark-gorev-formu.md` (satır 29 `(body)`, 30 "PlanAsistan" DIŞ) · `betik/b04-sonuc.json`
- Olası kök neden: `components/modern/ui.tsx:39-47` (`Sheet`te odak tuzağı yok, arka plan `inert` değil)
- Kapsam: arayüzün tamamı (Sheet kullanan pencereler)
- Doğrulama: aday · 2 kez üretildi (açık ve koyu sistem)
- Devir: Tolga: pencere açıkken Tab ile arka plandaki "Yeni görev"/"Yeni proje"ye ulaşıp Enter'la ikinci pencere açmayı denesin (üst üste pencere, çift kayıt).

### UI-ERS-08 · Açık çekmece klavyeyle kullanılamıyor: odak içeri girmiyor, Tab karartmanın arkasına gidiyor, Esc kapatmıyor
- Önem: K3
- Ekran: Çekmece (1024 px altı)          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1023×768 ve 375×812 · rol=py (Burak), bolum_sorumlu (Selin) · veri=pilot
- Adımlar: 1. 1023 px'te 19 Tab ile "Menüyü aç"a gel (bkz. ERS-02), Enter. 2. Tab'a bas. 3. Esc'e bas.
- Beklenen: Çekmece açılınca odak çekmecedeki ilk öğeye geçer, Tab çekmecede kalır, Esc çekmeceyi kapatıp odağı "Menüyü aç"a verir; "Menüyü aç" `aria-expanded` ile durumunu söyler.
- Gözlenen (insan dili): Çekmece açıldı ama odak "Menüyü aç"ta kaldı. Tab'a basınca çekmeceye değil, karartmanın arkasındaki "Ara", "Profil", "Yeni proje" ve "Dikkat gerektirenler" satırlarına gittim; halka gri perdenin arkasında soluk görünüyor. Çekmecedeki menüye ancak Shift+Tab ile geri giderek ulaşılabiliyor. Esc çekmeceyi kapatmadı (telefonda da). Karartmaya dokununca kapanıyor; bu fareyle/dokunarak çalışıyor, klavyeyle değil. `aria-expanded` yok, ekran okuyucu menünün açıldığını duymuyor. (WCAG 2.4.3 Odak sırası, 2.1.1 Klavye, 4.1.2 Ad-rol-değer)
- Kanıt: `ekran/modern-1023-cekmece-acik-8tab.png` (çekmece açık, odak halkası karartmanın arkasında "NEHİR…" satırında) · `ekran/modern-375-cekmece-esc.png` (Esc sonrası çekmece açık) · `betik/b08-sonuc.json` → `acinca.odak: "Menüyü aç"`, `acikTab`, `esc.cekmeceX: 0`
- Olası kök neden: `App.tsx:1957` ("Menüyü aç": `aria-expanded`/`aria-controls` yok, açılınca odak taşınmıyor) · `components/modern/ModernSidebar.tsx:154-158` (Esc dinleyicisi yok; karartma yalnız `onClick`)
- Kapsam: arayüzün tamamı (1024 px altı)
- Doğrulama: aday · 2 kez üretildi (1023 klavye, 375 dokunma + Esc)
- Devir: —

### UI-ERS-09 · "Kaydedildi" bilgisi hiçbir yerde duyurulmuyor; uygulamada canlı bölge yok
- Önem: K3
- Ekran: Yeni görev formu, Ayarlar, Pano          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. Klavyeyle yeni görev ekle ("Görevi ekle"). 2. Ayarlar'da sprint süresini değiştirip "Değişiklikleri Uygula". 3. Pano'da bir kartı "işlemler → Süreçte" ile taşı.
- Beklenen: Her işlemden sonra kısa bir durum iletisi (`role="status"`/`aria-live="polite"`): "Görev eklendi", "Ayarlar kaydedildi", "Kart Süreçte sütununa taşındı".
- Gözlenen (insan dili): Üç işlemde de ekranda bir bildirim çıkmadı; sayfa sessizce değişti (görev sayısı 104'ten 105'e, kart başka sütuna). Ekran okuyucu tarafında hiç bir şey duyulmuyor: sayfa açılışında belgede tek bir `aria-live`/`role=status` bölgesi yok, işlemler sırasında eklenen metinler de canlı bölgede değil. Pencere kapanınca odak da kaybolduğu için (ERS-06) kullanıcı işin olup olmadığını anlamak için sayfayı baştan dinlemek zorunda. İyi örnek: boş adla "Görevi ekle"ye basınca "Görev adı gerekli." `role="alert"` ile duyuruluyor. (WCAG 4.1.3 Durum iletileri)
- Kanıt: `betik/b21-sonuc.json` (`canliBaslangic: []`, `ayarUygula.eklenen: []`, `panoTasi.eklenen: … CANLI-DEĞİL`) · `betik/b06-sonuc.json` (`ekle.canli: []`, `canliBolgeler: []`) · `ekran/modern-light-gorev-ekle-sonra.png`, `ekran/modern-light-ayarlar-uygula-sonra.png`
- Olası kök neden: bilinmiyor (ortak bir bildirim/duyuru bileşeni yok gibi; yalnız bazı alt ekranlarda yerel `role="status"` var, ör. `components/modern/planning/ReleasePlanner.tsx:138`)
- Kapsam: arayüzün tamamı
- Doğrulama: aday · 2 kez üretildi (görev ekleme iki oturumda; ayrıca ayar ve pano)
- Devir: Cem: görsel geri bildirim de yok ("Kaydedildi mi?" sorusu onun alanı).

### UI-ERS-10 · "Diğer araçlar" menüsü klavyeyle menü gibi davranmıyor: ok tuşu yok, Esc kapatmıyor, öğeler "Ayarlar"dan sonra
- Önem: K3
- Ekran: Kenar çubuğu alt kısmı → "Diğer araçlar" (…) menüsü; ayrıca Pano kart "işlemler" menüsü          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · hareket=azalt ve normal · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. 16 Tab ile "Diğer araçlar"a gel, Enter. 2. Aşağı ok. 3. Tab. 4. Esc.
- Beklenen: `role="menu"` olduğu için açılınca odak ilk öğeye ("Profil değiştir") geçer, oklarla gezilir, Esc kapatıp odağı düğmeye verir.
- Gözlenen (insan dili): Menü açıldı, odak düğmede kaldı. Aşağı ok hiçbir şey yapmadı. Tab beni menüye değil yandaki "Ayarlar" düğmesine götürdü; menü öğelerine ancak ondan sonraki Tab'larda (2.–6.) ulaştım. Esc menüyü kapatmadı; fareyle açtığımda da Esc kapatmadı, yalnız boş bir yere tıklayınca kapandı. Pano'daki kart "işlemler" menüsünde de ok tuşları çalışmıyor (Tab ile öğelere geçiliyor, iş görülüyor). "Klasik arayüze dön", "Yedek al / yükle", "Bulut eşitleme", "Hakkında" yalnız bu menüde. (WCAG 2.1.1 Klavye, 4.1.2 Ad-rol-değer; ARIA APG menu button)
- Kanıt: `betik/b14-sonuc.json` (`menuOkAsagi: "Diğer araçlar"`, `menuTab: "Ayarlar"`, `menuEsc.acik: true`) · `betik/b16-sonuc.json` (`menuAcikTur`: öğeler 2.–6. Tab'da) · `betik/b13-sonuc.json` (`escSonraMenuAcik: true`, iki koşulda) · `ekran/modern-reduce-diger-araclar.png`
- Olası kök neden: `components/modern/ModernSidebar.tsx:113` ve `:254-256` (menü `role="menu"` ama odak yönetimi, ok tuşu ve Esc dinleyicisi yok; menü DOM'da "Ayarlar" düğmesinden sonra) · `components/modern/TaskActionsMenu.tsx:47`
- Kapsam: tek bileşen (iki menü)
- Doğrulama: aday · 2+ kez üretildi (fare ve klavye; hareket azalt açık/kapalı)
- Devir: —

### UI-ERS-11 · Doluluk ısı haritası 312 ayrı Tab durağı: altındaki "Tahsisi düzenle"ye 311 Tab
- Önem: K3
- Ekran: Ekip ve tahsis → Doluluk (aylık ısı haritası)          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=mudur (Ahmet) · veri=pilot (24 kişi × 12 ay)
- Adımlar: 1. Ahmet olarak "Ekip ve tahsis"i aç. 2. Isı haritasının ilk hücresine Tab'la gel. 3. Altındaki ayrıntı panelindeki "Tahsisi düzenle"ye kadar Tab'a bas.
- Beklenen: Izgara tek Tab durağıdır (`role="grid"` + ok tuşlarıyla hücre gezme) ya da "ızgarayı atla" bağlantısı vardır; satır/sütun başlıkları tablo olarak duyurulur.
- Gözlenen (insan dili): Her kişi ve her ay ayrı bir düğme; "Ahmet Şahin, Ocak"tan "Tahsisi düzenle"ye 311 kez Tab'a bastım. Bir hücreyi seçince ayrıntı paneli ızgaranın altında açılıyor; Aslı Çakır'ın Kasım hücresini seçip paneldeki "Tahsisi düzenle"ye gitmek için kalan ~290 hücreyi geçmem gerekiyor. Hücre adları iyi ("Aslı Çakır, Kasım: %140, kapasite aşımı"), ama tablo yapısı yok (`table`/`grid` rolü yok), ok tuşlarıyla satır/sütun gezilemiyor. (WCAG 2.4.1 Blokları atlama, 2.1.1 Klavye; 1.3.1 Bilgi ve ilişkiler)
- Kanıt: `betik/b22-sonuc.json` (`ilkHucre: 25`, `hucredenDuzenleye: 311`) · `betik/b11-sonuc.json` (`dolulukOdaklanabilir.odak: 312`, `tablo: false`, `rol: []`) · `ekran/modern-normal-ekip-tahsis.png`
- Olası kök neden: `components/modern/ModernAllocation.tsx:290-300` (her hücre ayrı `<button>`, ızgara rolü ve gezinti yok)
- Kapsam: tek ekran
- Doğrulama: aday · 2 kez üretildi (sayım + gerçek Tab turu)
- Devir: Tolga: aşırı veride (ör. 200 kişi) bu sayı binleri bulur; performansla birlikte bakabilir.

### UI-ERS-12 · Telefonda çekmeceden "Ayarlar"a dokununca çekmece açık kalıyor ve Ayarlar penceresinin üstünü örtüyor
- Önem: K3
- Ekran: Çekmece → Ayarlar          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gündüz · renk teması=classic
         ekran=375×812 (mobil, dokunmatik) ve 640×400 (%200 yakınlaştırma) · rol=bolum_sorumlu (Selin), py (Burak) · veri=pilot
- Adımlar: 1. Telefonda ☰ "Menüyü aç"a dokun. 2. Çekmecenin altındaki ayar (≡) simgesine dokun.
- Beklenen: Çekmece kapanır, Ayarlar penceresi tek başına görünür (diğer çekmece öğelerinde olduğu gibi).
- Gözlenen (insan dili): Ayarlar arkada açıldı ama çekmece önde kaldı; pencerenin sol üç çeyreği çekmecenin altında. "Kapat" ve "…ygula" düğmesinin yarısı görünüyor, "GECE MODU" "CE MODU" olarak okunuyor. Sağdaki gri şeride dokununca çekmece kapandı ve Ayarlar ortaya çıktı; yolu bulan çıkıyor ama ilk bakışta pencere bozuk sanılıyor. %200 yakınlaştırmada (640 px) aynı. (WCAG 1.3.2 Anlamlı sıra; uygulama tutarlılığı)
- Kanıt: `ekran/modern-375-ayarlar-cekmeceden-1.png`, `ekran/modern-375-ayarlar-cekmeceden-2.png` · `ekran/modern-zoom200-ayarlar.png` · `ekran/modern-375-ayarlar-karartmaya-dokun.png` (geçici yol) · `betik/b18-sonuc.json` (`cekmeceX: 0`, `ustteki: "çekmece"`, iki kez)
- Olası kök neden: `components/modern/ModernSidebar.tsx:255` ("Ayarlar" `onClick={onOpenSettings}`; diğer gezinme öğeleri `go()` ile `onClose()` çağırıyor, bu çağırmıyor)
- Kapsam: tek ekran (1024 px altı)
- Doğrulama: aday · 3 kez üretildi (375 iki kez, 640 bir kez)
- Devir: —

### UI-ERS-13 · Yalnız yazıyı büyütünce (tarayıcı yazı boyutu %200) içerik büyümüyor, yalnız menü büyüyüp kırpılıyor
- Önem: K3
- Ekran: Portföy (ve modern arayüzün tamamı)          Arayüz: modern
- Koşul: sistem teması=açık · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1280×800 · `html { font-size: 200% }` · rol=py (Burak) · veri=pilot
- Adımlar: 1. Tarayıcının yazı boyutunu "çok büyük" yap (ya da kök yazı boyutunu %200'e çıkar). 2. Portföy'e bak.
- Beklenen: Metinler kök yazı boyutuyla birlikte büyür, kırpılmadan sarılır.
- Gözlenen (insan dili): Sayfa başlığı, kartlar, liste satırları hiç büyümedi (piksel sabit). Yalnız kenar çubuğundaki menü etiketleri iki katına çıktı ve kırpıldı: "Ekip v…", "Risk ra…", "Haft…", "Görüş…", projeler "PU…", "NE…". Yani yazıyı büyüten kullanıcı içerikten yararlanamıyor, menüyü de okuyamıyor. Tarayıcı yakınlaştırması (%200 = 640 px) ise sorunsuz: yatay kaydırma yok, form ve pencereler sığıyor. (WCAG 1.4.4 Metni yeniden boyutlandırma; yakınlaştırma geçtiği için kısmi)
- Kanıt: `ekran/modern-yazi200-portfoy.png` · `ekran/modern-zoom200-portfoy.png`, `ekran/modern-zoom200-proje.png`, `ekran/modern-zoom200-gorev-formu.png` (yakınlaştırma geçti) · `betik/b09-sonuc.json` → `yazi200.tasma`
- Olası kök neden: `styles/modern.css:126,148,160,172` ve bileşenlerdeki `text-[15px]` gibi px yazı boyutları; menü etiketleri ise rem tabanlı (karışık birim)
- Kapsam: arayüzün tamamı
- Doğrulama: aday · 1 kez üretildi (deterministik CSS ölçümü; Tur 2'de tekrar)
- Devir: Deniz: karışık birim (px/rem) tasarım tutarlılığı açısından.

### UI-ERS-14 · Komut paletinde ok tuşuyla seçilen sonuç ekran okuyucuya söylenmiyor
- Önem: K3
- Ekran: Komut paleti (Ctrl+K)          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · uygulama ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (Burak) · veri=pilot
- Adımlar: 1. Ctrl+K. 2. "NEH" yaz. 3. Aşağı ok.
- Beklenen: Odak arama kutusunda kalırken `aria-activedescendant` seçili seçeneği gösterir; ekran okuyucu "Veri Havuzu, 2/4" gibi okur.
- Gözlenen (insan dili): Kısayol çalıştı, odak arama kutusuna geldi, halka görünür (iyi). Aşağı okla vurgu "NEHİR Veri Platformu"ndan "Veri Havuzu"na geçti ama arama kutusunda `aria-activedescendant` yok; seçili seçenek yalnız `aria-selected` ile işaretli, odak ona hiç gitmiyor. Ekran okuyucu ok tuşlarında sessiz kalır; Enter'a basınca neyin açılacağını bilmiyorum. Esc ile kapatınca odak da `body`'ye düştü (ERS-06). Ayrıca palet Ayarlar penceresinin üstünde açılabiliyor (iki pencere üst üste). (WCAG 4.1.2 Ad-rol-değer; ARIA APG combobox)
- Kanıt: `ekran/modern-light-komut-paleti-neh.png` · `betik/b02-sonuc.json` → `paletOk: { activedesc: null, sel: "Veri Havuzu" }` (açık ve koyu) · `betik/b02-aria-palet.txt`
- Olası kök neden: `components/CommandPalette.tsx:115` (`role="combobox"` girdisinde `aria-activedescendant`/`aria-controls` yok) ve `:134` (`aria-selected` var, seçeneklerin `id`'si bağlanmıyor)
- Kapsam: tek bileşen
- Doğrulama: aday · 2 kez üretildi (açık ve koyu sistem)
- Devir: Tolga: palet ile Ayarlar üst üste açıkken Esc/Enter sırası.

---

## Kısa notlar

- K4 · Proje görünüm sekmeleri (`tablist` "Proje görünümleri") sekme rolünde ama ok tuşuyla geçilmiyor, her biri ayrı Tab durağı, `tabpanel`/`aria-controls` yok (`betik/b17-sonuc.json` → `sekmeOk`).
- K4 · Ayarlar'da "Arayüz" `radiogroup`unda sol/sağ ok seçim değiştirmiyor; renk teması düğmeleri (Gök Mavisi…) ve "GECE MODU" seçili durumunu (`aria-pressed`) bildirmiyor (`betik/b03-sonuc.json`).
- K4 · Arama düğmesinin görünür kısayol ipucu "⌘K" (Mac simgesi), Linux/Windows'ta erişilebilir adı "Ctrl+K"; görünen ile söylenen farklı.
- K4 · Atlama bağlantısı ("İçeriğe geç") yok; masaüstünde ana içeriğe 17 Tab. `nav`/`main` işaretleri olduğu için ekran okuyucuda geçici yol var.
- K4 · Aynı adla iki düğme: kenar çubuğundaki "+" ve sayfadaki "Yeni proje" ikisi de "Yeni proje".
- K4 · Boş adla "Görevi ekle"de hata `role="alert"` + `aria-invalid` ile doğru duyuruluyor ama odak "Görev adı" alanına taşınmıyor, düğmede kalıyor.
- K4 · Form alanlarında (girdi, seçim kutusu) odak yalnız 1 px mavi kenarlık + %20 saydam gölge; düğmelerdeki 3 px halkaya göre çok zayıf, %200 yakınlaştırmada izlemek zor (`ekran/modern-light-gorev-odak-05.png`).
- K4 · Koyu sistem temasında doluluk hücreleri: beyaz yazı / `#3D7CC9` zemin 4,26:1 (13 px, 138 hücre; gereken 4,5:1) (`betik/b11-sonuc.json`).
- K4 · Telefonda (375 px) segment düğmeleri (Genel bakış/Pano…, Tümü/Devam eden…) 40 px yüksek; "Sağlık skoru nasıl hesaplanır?" 36×36 (uygulama ölçüsü 44). "Sürüm planlamasına dahil" onay kutusu 16×16 ama etiketi tıklanabilir.
- Geçti · Hareketi azalt: modern logodaki roket ve 7 tıklamadaki "hiper sürüş" (yıldız, şok halkası, perde) `reduce` açıkken hiç çalışmıyor; normalde 0,9–1,6 sn. Görev tamamlamada animasyon yok (`betik/b16-sonuc.json`, `ekran/modern-no-preference-logo-7tik.png`).
- Doğrulanmadı · Klasik arayüz CSS'inde `hyper-launch`, `hyper-screen-shake`, `hyper-flash`, `star-fly` animasyonları için `prefers-reduced-motion` kuralı görünmüyor (yalnız modern `.m-*` için var; `betik/b15-sonuc.json`). Klasik bu koşunun odağı dışında; Tur 2'de klasik arayüzde denenmeli. "hyper-flash"/"screen-shake" varsa WCAG 2.3.3 açısından önemli.
- Geçti · Ekip ve tahsis ısı haritası dört süzgeçte de ayrılıyor (mavi ↔ kırmızı + yüzdeler yazılı).
- Geçti · %200 yakınlaştırmada (640×400) Portföy, proje, görev formu ve Ayarlar'da yatay kaydırma yok; görev formunun "Görevi ekle" düğmesi alt şeritte sabit, Tab ile görünür.
- Geçti · Metin kontrastı Portföy ve proje genel bakışta açık/koyu sistemde eşik altı öğe yok; Risk raporu açıkta geçti.
- Ortam · Dış simge sunucusu (cdn-icons-png.flaticon.com) ve Google yazı tipi vekilde reddedildi (ortam kısıtı). Tarih alanı `tr-TR` yerel ayarına rağmen "mm/dd/yyyy" görünüyor: başsız Chromium arayüz dilinden; bulgu sayılmadı.
- Ortam/araç · `oturum({ proje })` modern arayüzde projeyi açmıyor (Portföy'de başlıyor); projeye kenar çubuğundan klavyeyle girildi. `dokunmaHedefleri` ekran dışındaki kapalı çekmece öğelerini de "görünür" sayıyor.
