# Deniz (ui-gorsel) · Tur 1 bulguları · 2026-11-06 (ikinci koşu)

Kod: `claude/zealous-tesla-hidbc9@8fb563d` · port 4181 · ekran 1440×900 (bir ölçüm 1440×1080) · veri: pilot, aşırı, bozulmuş pilot · tarayıcı: Chromium (playwright-core)

## Koşu özeti

- **Yeniden sınama:** 18 eski bulgu → düzeldi 10 · kısmen 6 · düzelmedi 1 · yeni sorun 1 (`regresyon.md`).
- **Taranan:** 227 görüntü; süzgeçsiz yaklaşık 175 ekran × koşul hücresi, 18 farklı koşul. Kapsananlar:
  - Klasik arayüzün tamamı, açık/Gündüz ve koyu/Gece: 9 üst ekran, Ayarlar, PY rolüyle 9 proje sekmesi, Yeni Görev penceresi.
  - Modern, iki modda:
    - Yönetim (+ Raporlar menüsü, Ayrıntılı analiz)
    - Ekip ve tahsis (+ Araçlar, Kapasite–talep, Öngörü, Senaryo)
    - Takvim, Görüşmeler, Beklentiler, Veri havuzu
    - NEHİR Planlama, Zaman çizelgesi, Liste, Pano, Durum özeti
  - Dört renk teması × açık/koyu × 3 ekran (Portföy, Genel bakış, Takvim) ve Ayarlar.
  - Kurtarma ekranı (4 bozulma, 6 koşul), "başka sekmede açık" bildirimi (4 koşul), bozuk proje kaydı (4 koşul), kayıt bildirimi (3 koşul).
  - Görünüm ayarı: 8 yükleme koşulu ve 4 gerçek tıklama akışı.
- **Teknikler:** göz kısma (`blur 6px`), gri tonlama, döteranopi, `kontrastTara`, `yuzeyAyrimi`, `kokDurum`, `tasmaTara`, piksel örnekleme, ΔE76 renk farkı, kök yazı boyutunu 20 px yapma (rem testi), üzerine gelme.
- **Betik:** 17 çalıştırma (`betik/01`–`12`; 03 iki kez, 05 üç kez, 07 iki temada). Ölçümler `olcum/`.
- **Yeni bulgu (tam biçimde 10):** K1: 0 · K2: 2 · K3: 7 · K4: 1. Ayrıca "Kısa notlar" altında 14 satır.
- **Ortam notu:** `cdn-icons-png.flaticon.com` vekil sunucudan geçmiyor. Tarih alanında `mm/dd/yyyy` tarayıcının arayüz dilinden geliyor. İkisi de bulgu değil.

| Kimlik | Önem | Başlık |
|---|---|---|
| UI-GRS-19 | K2 | Klasik koyu temada birincil renk (mavi) yazılar koyu zeminde 2,84:1; büyük hedef yüzdeleri dahil |
| UI-GRS-20 | K2 | Klasik arayüzde risk puanları, matris sayıları ve onay düğmeleri: sarı/yeşil/kırmızı zeminde beyaz yazı (2,15–2,77:1) |
| UI-GRS-21 | K3 | Klasik proje Riskler matrisinde hücreler farklı boyutta; ızgara kırık, seviye harfi yok |
| UI-GRS-22 | K3 | Klasik üst gezinme 1440 px'te kesiliyor: "Haftalık ra\|", üç bölüm görünmüyor, kaydırma ipucu yok |
| UI-GRS-23 | K3 | Klasik Pano ve Ekip ekranlarında metinlerin çoğu 7–10 px |
| UI-GRS-24 | K3 | Zümrüt temasında vurgu, "tamamlandı" yeşiliyle aynı aileden; ilerleme çubuğunda iki dilim birleşiyor |
| UI-GRS-25 | K3 | Açık modda Zaman çizelgesi sürüm sütunları zeminden ayrılmıyor (1,03:1) |
| UI-GRS-26 | K3 | Zaman şeridinde 15 sürüm çipinin hepsi "Sürü…" diye kesiliyor |
| UI-GRS-27 | K3 | Depo erişilemezken kurtarma ekranı koyu sistemde beyaz açılıyor (UI-GRS-01 düzeltmesinin yan etkisi) |
| UI-GRS-28 | K4 | Ayarlar'da Görünüm ve renk teması seçilince ekran değişmiyor; aynı pencerede Arayüz hemen uygulanıyor |

---

### UI-GRS-19 · Klasik koyu temada birincil renk (mavi) yazılar koyu zeminde 2,84:1; büyük hedef yüzdeleri dahil
- Önem: K2
- Ekran: klasik proje › Hedefler (OKR ve birim yüzdeleri), Yönetim (plan/gerçekleşen rakamları), Ekip ve tahsis (AA değerleri), proje › İş Paketleri ("Düzenle"), proje › Ekip ("%"), Ayarlar penceresi ("Özellikler & Veri" başlığı)          Arayüz: klasik
- Koşul: sistem teması=koyu · görünüm ayarı=Gece · renk teması=classic (diğer temalar ölçülmedi)
         ekran=1440×900 · rol=py (burak), mudur (ahmet) · veri=pilot
- Adımlar: 1. Klasik arayüzde Gece seç. 2. NEHİR ya da PUSULA › Hedefler'i aç. 3. Sağ üstteki "42%" ve birim kartlarındaki "77% / 62% / 94%" yüzdelerine bak. 4. Yönetim'de plan/gerçekleşen satırlarındaki mavi rakamlara bak.
- Beklenen: Yüzdeler ekranın ana bilgisi; büyük yazı için en az 3:1, küçük rakamlar ve bağlantılar için 4,5:1. Açık modda aynı yazı 5,17:1 ile geçiyor.
- Gözlenen (insan dili): Koyu lacivert kartın üstünde orta tonda mavi yazı var. Büyük yüzdeler seçiliyor ama sönük; göz kısınca kartın en önemli rakamı başlıktan önce kayboluyor. Yönetim'deki 12 px'lik mavi rakamlar ve İş Paketleri'ndeki "Düzenle" bağlantıları koyu zemine gömülüyor. Modern arayüzde aynı mavi koyu modda açık maviye (`#4DA2FF`) dönüyor; klasikte dönmüyor.
- Kanıt: `ekran/classic-koyu-gece-classic-nehir-hedefler.png`, `ekran/classic-koyu-gece-classic-pusula-hedefler.png`, `ekran/classic-koyu-gece-classic-yonetim.png`, `ekran/classic-koyu-gece-classic-pusula-is-paketleri.png`, `ekran/classic-koyu-gece-classic-ayarlar.png`. Hepsi `#2563EB`/`#1F2937` **2,84:1**:
  - Hedefler "42", "77", "62", "94" (24 px; büyük yazı için bile 3:1'in altında)
  - Yönetim "12,38", "76,68" (12 px)
  - Tahsis "9,44" (12 px)
  - "Düzenle" (14 px)
  - "Özellikler & Veri" (12 px)

  Eşik altı metin: Yönetim 47/433, Tahsis 47/301. `kokDurum`: klasik koyuda `--app-primary #2563eb`. 2/2 üretildi (`olcum/05-klasik-dark.json`, `olcum/12-dogrulama.json`).
- Olası kök neden: `index.html:62` `.text-primary { color: var(--app-primary); }`; klasik temalarda `--app-primary` için koyu mod karşılığı yok. `styles/modern.css:263` aynı eşlemeyi yalnız modern `.m-legacy` içinde yapıyor.
- Kapsam: arayüzün tamamı (klasik koyu; `text-primary` kullanan her yer)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), renk teması zümrüt/mor/turuncu seçiliyken klasik koyuda aynı ölçüm.

### UI-GRS-20 · Klasik arayüzde risk puanları, matris sayıları ve onay düğmeleri: sarı/yeşil/kırmızı zeminde beyaz yazı (2,15–2,77:1)
- Önem: K2
- Ekran: klasik proje › Riskler (risk matrisi hücre sayıları, risk listesindeki puan hapları, "Skor: 9 · Orta"); Ekip ve tahsis (plan onay satırı: "Onayla & Kilitle", "Reddet")          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak), mudur (ahmet) · veri=pilot
- Adımlar: 1. Klasik arayüzde PUSULA › Riskler'i aç. 2. Matristeki yeşil hücrelerin içindeki "1"lere ve listedeki "12", "8" puan haplarına bak. 3. Ekip ve tahsis'te onay bekleyen planın "Onayla & Kilitle" ve "Reddet" düğmelerine bak.
- Beklenen: Puan ve sayı, rengin anlamını taşıyan asıl bilgi; en az 4,5:1 olmalı. Modern Ayrıntılı analizde aynı sorun (UI-GRS-03) düzeltildi; klasik risk ekranı ve tahsis onayı aynı çözümü almamış.
- Gözlenen (insan dili): Turuncu-sarı hapın içindeki beyaz "12" göz kısınca okunmuyor, geriye boş sarı bir hap kalıyor. Matristeki yeşil karelerin ortasındaki beyaz "1" zor seçiliyor. Plan onayındaki iki düğme (yeşil ve açık kırmızı, beyaz 11 px yazı) bu ekranın tek kalıcı kararı. Yazıları ise sayfadaki en silik yazılar. İki temada da aynı.
- Kanıt: `ekran/classic-acik-gunduz-classic-pusula-riskler.png`, `ekran/classic-koyu-gece-classic-pusula-riskler.png`, `ekran/classic-acik-gunduz-classic-tahsis.png`, `ekran/classic-koyu-gece-classic-tahsis.png`. Ölçüm:
  - puan hapları beyaz/`#F59E0B` **2,15:1** (12 px)
  - matris sayıları beyaz/`#10B981` **2,54:1** (12 px)
  - açık modda "Skor: **9**" `#F59E0B`/`#FFFFFF` 2,15:1 (11 px)
  - "Onayla & Kilitle" beyaz/`#10B981` **2,54:1** (11 px)
  - "Reddet" beyaz/`#F87171` **2,77:1** (11 px)

  2/2 üretildi (`olcum/05-klasik-dark.json`, `olcum/05-klasik-light.json`).
- Olası kök neden: `components/RiskView.tsx:156`, `:221`, `:272`, `:317` (`RISK_BAND_HEX` zemin + `text-white` / `color: '#fff'`); `components/AllocationView.tsx:255` (`bg-emerald-500 text-white`), `:258` (`bg-red-400 text-white`).
- Kapsam: arayüzün tamamı (klasik)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), döteranopide yeşil "1" hücreleri ile sarı puan hapları.

### UI-GRS-21 · Klasik proje Riskler matrisinde hücreler farklı boyutta; ızgara kırık, seviye harfi yok
- Önem: K3
- Ekran: klasik proje › Riskler › "Risk Matrisi (3 aktif risk)"          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Klasik arayüzde PUSULA › Riskler'i aç. 2. 5×5 matrise bak.
- Beklenen: Eşit kareli düzenli bir 5×5 ızgara; eksen etiketleri satır ve sütunlarla hizalı. Portföy Risk raporundaki matris gibi dolu hücrede seviye harfi (D/O/Y) olmalı.
- Gözlenen (insan dili): İlk sütunun kareleri öbürlerinin üçte ikisi kadar, son sütununkiler biraz küçük. Bu yüzden sol ve sağ kenar içeri çekilmiş, satırlar merdiven gibi kayık duruyor. Matris bozuk yüklenmiş bir tablo gibi görünüyor. "Olasılık →" etiketi 3. satırın yanına sıkışmış. Portföy Risk raporundaki matriste dolu hücrede "D/O/Y" harfi var, burada yok. İki matris aynı veriyi farklı dille gösteriyor.
- Kanıt: `ekran/classic-acik-gunduz-classic-pusula-riskler-tam.png`, `ekran/classic-koyu-gece-classic-pusula-riskler.png`; karşılaştırma `ekran/classic-koyu-gece-classic-risk.png` · ölçüm: sütun genişlikleri (etiket, 1…5) **24, 88, 130, 130, 130, 118 px** (6 satırın hepsinde aynı; `olcum/10-kenar-rem-surum.json` → `klasik-matris`). 3/3 üretildi (05 açık, 05 koyu, 10).
- Olası kök neden: `components/RiskView.tsx:207` `table.w-full` sabit düzensiz (`table-fixed` yok). Hücreler `aspect-square` (`:220`); otomatik tablo düzeni boş ve dolu sütunlara farklı genişlik dağıtıyor.
- Kapsam: tek ekran
- Doğrulama: aday
- Devir: yok

### UI-GRS-22 · Klasik üst gezinme 1440 px'te kesiliyor: "Haftalık ra|", üç bölüm görünmüyor, kaydırma ipucu yok
- Önem: K3
- Ekran: klasik üst çubuk, ana gezinme          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Sistem, Gündüz, Gece · renk teması=classic
         ekran=1440×900 · rol=mudur (ahmet), py (burak) · veri=pilot
- Adımlar: 1. Klasik arayüzü müdür olarak aç. 2. Üst çubuktaki gezinmeye bak. 3. "Haftalık rapor"a bas.
- Beklenen: Bütün ana bölümler görünmeli. Görünmüyorsa kesildiği belli olmalı (solma, ok, "Diğer" menüsü).
- Gözlenen (insan dili): Gezinme "Haftalık ra" yazısının ortasında bıçakla kesilmiş gibi bitiyor. Görüşmeler, Beklentiler ve Veri Havuzu hiç görünmüyor; kaydırma çubuğu, solma ya da ok yok. PY'de "Haftalık rapor"un yanında yarım bir simge kalıyor. "Haftalık rapor" seçilince şerit kayıyor ve bu kez soldaki "Yönetim" simgesi kesiliyor. Kullanıcı bu üç bölümün var olduğunu ekrandan anlayamaz.
- Kanıt: `ekran/classic-acik-sistem-classic-acilis.png`, `ekran/classic-koyu-gece-classic-portfoy.png`, `ekran/classic-acik-gunduz-classic-pusula-ekip.png` (PY), `ekran/classic-koyu-gece-classic-haftalik.png` (sola kaymış şerit) · ölçüm: gezinme x=274..904, görünür 628 px, içerik 1017 px (`scrollWidth`); 389 px gizli; `overflow-x: auto`, maske yok (`olcum/05-klasik-*.json` → `navKirpma`). 4 koşulda üretildi (01, 02, 05 açık/koyu).
- Olası kök neden: `components/Header.tsx:371` (`nav … min-w-0 overflow-x-auto`); taşan öğeler için görsel ipucu yok. Önceki koşudaki 1600–1660 px'lik sayfa taşmasının (UI-KRC-11) düzeltmesi taşmayı gezinmenin içine almış görünüyor.
- Kapsam: arayüzün tamamı (klasik üst çubuk)
- Doğrulama: aday
- Devir: Cem (`ui-akis`), Görüşmeler/Beklentiler/Veri Havuzu klasikte nasıl bulunuyor; Ece (`ui-erisim`), klavyeyle gizli öğelere geçince şerit kayıyor mu.

### UI-GRS-23 · Klasik Pano ve Ekip ekranlarında metinlerin çoğu 7–10 px
- Önem: K3
- Ekran: klasik proje › Pano (Sürüm Planlama), proje › Ekip (Ekip Yönetimi)          Arayüz: klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. Klasik arayüzde PUSULA › Pano'yu aç. 2. Sürüm başlıklarının altındaki tarih aralıklarına, "BOŞ", "HAVUZ • BACKLOG", "KOMPAKT / DETAYLI" yazılarına bak. 3. Ekip'te birim etiketlerine ("U310") ve sütun başlıklarına bak.
- Beklenen: Gövde yazısı en az 12 px; ikincil etiketler 11 px'in altına inmemeli. Modern arayüzde en küçük metin 12 px.
- Gözlenen (insan dili): Pano'da tarih aralıkları ("01.01.2026 - 21.01.2026"), boş durum ("BOŞ"), havuz başlığı ve segment yazıları noktalı çizgi gibi okunuyor. Harf aralıklı büyük harfler küçüklüğü daha da belirginleştiriyor. 1440 px'lik ekranın ortasında 7–8 px yazı var. Koyuda bu yazıların çoğu gri ve 2,13:1 (UI-GRS-04 ile birleşince Pano'da 184/398 metin eşik altında). Rem testi geçti: kök yazı boyutu 20 px olunca bütün metin ölçekleniyor. Sorun dönüşümde değil, varsayılan boyutlarda.
- Kanıt: `ekran/classic-acik-gunduz-classic-pusula-pano.png`, `ekran/classic-koyu-gece-classic-pusula-pano.png`, `ekran/classic-acik-gunduz-classic-pusula-ekip.png`, `ekran/classic-acik-gunduz-classic-pano-kok20px.png` · ölçüm (Pano, açık): 422 metnin **383'ü 11 px altında**. Dağılım: 7 px ×45, 8 px ×174, 9 px ×36, 10 px ×128, 12 px ×35. Ekip'te "U310", "İÇE AKTAR" 9 px. Modern Genel bakış: 121 metin, en küçüğü 12 px. Rem testi: klasik 422/422, modern 121/121 ölçekleniyor (`olcum/10-kenar-rem-surum.json` → `*-yazi`). 4 Kasım görüntüsünde de aynı boyutlar var (`../../2026-11-04/deniz/ekran/classic-koyu-gece-classic-genel.png`); gerileme değil, eski kusur.
- Olası kök neden: `components/KanbanColumn.tsx` ve `components/KanbanCard.tsx` içinde 13 yerde `text-[7px]`, `text-[8px]`, `text-[9px]`.
- Kapsam: arayüzün tamamı (klasik eski bileşenler)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), %200 yakınlaştırmada bu yazıların okunup okunmadığı.

### UI-GRS-24 · Zümrüt temasında vurgu, "tamamlandı" yeşiliyle aynı aileden; ilerleme çubuğunda iki dilim birleşiyor
- Önem: K3
- Ekran: proje Genel bakış › "Şu anki sürüm" ilerleme çubuğu; kenar çubuğu seçili satırı, bağlantılar          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=emerald
         ekran=1440×900 · rol=py (burak), mudur · veri=pilot
- Adımlar: 1. Ayarlar'da "Zümrüt Ormanı"nı seç. 2. NEHİR Veri Platformu'nu aç. 3. "Sürüm 12" kartındaki ilerleme çubuğuna bak ("19 tamamlandı · 3 süreçte · 3 yapılacak").
- Beklenen: "Tamamlandı" ve "süreçte" iki ayrı durum; çubukta açıkça ayrı dilimler olmalı. Diğer temalarda vurgu mavi, mor ya da altın olduğu için ayrılıyor.
- Gözlenen (insan dili): Açık modda koyu yeşil ile koyu camgöbeği yan yana; çubuk tek parça yeşil gibi görünüyor ve iki dilimin sınırı ancak yakından seçiliyor. Koyuda parlak yeşil ile turkuaz, biraz daha iyi ama yine aynı aile. Gri tonlamada iki dilim tamamen birleşiyor, "süreçte" dilimi kayboluyor. Lejanttaki iki nokta da aynı renk gibi. UI-GRS-09'daki turuncu–uyarı çakışmasının yeşil karşılığı.
- Kanıt: `ekran/modern-acik-gunduz-emerald-genel-surum-kart.png`, `ekran/modern-acik-gunduz-emerald-genel-surum-kart-gri.png`, `ekran/modern-koyu-gece-emerald-genel.png`, `ekran/modern-koyu-gece-emerald-genel-surum-kart-gri.png`. Ölçüm (çubuk dilimleri):
  - açık: `#1F7A35` / `#0F766E`, ΔE76 **35,9**, parlaklık oranı **1,01:1**
  - koyu: `#30D158` / `#3CCFB4`, ΔE76 **49,9**, parlaklık oranı **1,04:1**
  - karşılaştırma, aynı çubukta mavi temada: `#0066D6` / `#1F7A35`, ΔE 112; mor temada ΔE 143

  2/2 üretildi (`olcum/06-renk-temalari.json`, `olcum/11-kenar-ayar-zumrut.json` → `*-cubuk`).
- Olası kök neden: `styles/modern.css:57` ve `:93` zümrüt `--m-accent` (`#0F766E` / `#3CCFB4`) `--m-ok` ile aynı ton ailesinde. İlerleme çubuğunda "süreçte" dilimi vurgu rengini kullanıyor.
- Kapsam: arayüzün tamamı (zümrüt teması; vurguyla durumun yan yana geldiği her yer)
- Doğrulama: aday
- Devir: Ece (`ui-erisim`), döteranopi ve protanopide aynı kart.

### UI-GRS-25 · Açık modda Zaman çizelgesi sürüm sütunları zeminden ayrılmıyor (1,03:1)
- Önem: K3
- Ekran: proje › Zaman çizelgesi, sürüm sütunları ve Havuz sütunu          Arayüz: modern
- Koşul: sistem teması=açık · görünüm ayarı=Gündüz · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. NEHİR › Zaman çizelgesi'ni aç. 2. Şeridin altındaki sürüm sütunlarına bak (Sürüm 1–8 boş, 9 ve sonrası dolu). 3. Gözünü kıs.
- Beklenen: Her sürüm görevlerin bırakılacağı ayrı bir kap olarak seçilmeli. Boş sürüm de bir hedef alanı gibi görünmeli.
- Gözlenen (insan dili): Sütunlar zeminden yalnızca bir ton koyu; kenar yok. Boş sürümler ("Görevleri buraya sürükleyin") sayfaya basılmış soluk yazılar gibi duruyor. Göz kısınca boş Sürüm 8 tamamen kayboluyor. Dolu sürümlerde yalnız beyaz görev kartları kalıyor; hangi kartın hangi sürüme ait olduğu sütun sınırından değil, kartların dizilişinden çıkarılıyor. Havuz sütunu da aynı. Koyu modda sütun `#242426` siyah zeminde net ayrılıyor.
- Kanıt: `ekran/modern-acik-gunduz-classic-nehir-zaman-cizelgesi.png`, `ekran/modern-acik-gunduz-classic-nehir-zaman-cizelgesi-bulanik.png`, `ekran/modern-acik-gunduz-classic-nehir-zaman-surum-gorevli.png`, `ekran/modern-acik-gunduz-classic-nehir-zaman-surum-gorevli-bulanik.png`; karşılaştırma `ekran/modern-koyu-gece-classic-nehir-zaman-surum-gorevli.png`. Ölçüm:
  - açıkta sütun `#EFEFF4` / zemin `#F2F2F7` **1,03:1**, kenarlık 0
  - `yuzeyAyrimi` 117/117 bölge zayıf
  - koyuda sütun `#242426` / `#000000` geçiyor; içindeki kart `#1C1C1E` / sütun `#242426` 1,1:1, siyah gölge görünmüyor, ama gözle seçiliyor

  2/2 üretildi (07 ve 10).
- Olası kök neden: `styles/modern.css:16` `--m-fill-2: #EFEFF4`, sayfa `--m-bg: #F2F2F7` ile neredeyse aynı. `components/modern/ModernTimeline.tsx:321` ve `:353` sütunları kenarsız `m-fill-2` ile çiziyor.
- Kapsam: tek ekran
- Doğrulama: aday
- Devir: yok

### UI-GRS-26 · Zaman şeridinde 15 sürüm çipinin hepsi "Sürü…" diye kesiliyor
- Önem: K3
- Ekran: proje › Zaman çizelgesi › zaman şeridi (üstteki sürüm çipleri)          Arayüz: modern
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Gündüz ve Gece · renk teması=classic
         ekran=1440×900 · rol=py (burak) · veri=pilot
- Adımlar: 1. NEHİR › Zaman çizelgesi'ni aç. 2. Ay ekseni üstündeki sürüm çiplerini oku.
- Beklenen: Şeritte hangi sürümün nerede olduğu okunabilmeli (en azından sürüm numarası).
- Gözlenen (insan dili): 15 çipin 15'inde de "Sürü…" yazıyor; bazılarında "Sür…". Şerit, aynı kelimenin tekrarlandığı renkli bir dizi gibi. Kırmızı (kapasite aşımı) çiplerin hangi sürüm olduğu yalnız fareyle üzerine gelince öğreniliyor. Bugünün çipinde kırmızı "Bugün" çizgisi kesik yazının tam üstünden geçiyor.
- Kanıt: `ekran/modern-acik-gunduz-classic-nehir-zaman-cizelgesi.png`, `ekran/modern-koyu-gece-classic-nehir-zaman-cizelgesi.png` · ölçüm (`tasmaTara`): "Sürüm 1" kutu 40 px / içerik 46 px, "Sürüm 2" 40/49, "Sürüm 3" 40/49 … (`text-overflow: ellipsis`; ekranda 18 kırpılan öğe). 2/2 üretildi (07 açık ve koyu).
- Olası kök neden: `components/modern/ModernTimeline.tsx:290` `<span className="truncate">{label}</span>`; çip genişliği sürüm süresine göre (≈40 px), etiket tam ad.
- Kapsam: tek ekran
- Doğrulama: aday
- Devir: Cem (`ui-akis`), kullanıcı şeritten bir sürümü bulmaya çalışırken.

### UI-GRS-27 · Depo erişilemezken kurtarma ekranı koyu sistemde beyaz açılıyor (UI-GRS-01 düzeltmesinin yan etkisi)
- Önem: K3
- Ekran: kurtarma ekranı ("Kayıtlı çalışma alanınız açılamadı") · tarayıcı deposu erişilemez          Arayüz: modern seçili (ekran ortak)
- Koşul: sistem teması=koyu · görünüm ayarı=okunamıyor (Sistem varsayılır) · renk teması=—
         ekran=1440×900 · rol=— · veri=depo engelli (`localStorage` ve IndexedDB SecurityError)
- Adımlar: 1. İşletim sistemi koyu temadayken site verisi engelli bir tarayıcıda uygulamayı aç.
- Beklenen: Görünüm ayarı okunamıyorsa "Sistem" uygulanmalı, yani ekran koyu olmalı. Öteki bozulmalarda (biçim 2, yarım JSON, `people=null`) kurtarma ekranı koyu sistemde koyu açılıyor; 4 Kasım'da bu koşulda da ekran koyuydu.
- Gözlenen (insan dili): Koyu masaüstünde göz alıcı beyaz (`#F9FAFB`) bir sayfa açılıyor, ortada beyaz bir kart. Kart okunuyor ama gece çalışan kullanıcı için ani bir parlama. Uygulamanın geri kalanı koyu sistemde her zaman koyu.
- Kanıt: `ekran/modern-koyu-sistem-classic-depo-engelli-2.png`, `ekran/modern-koyu-sistem-classic-bozuk-depo-engelli.png`; karşılaştırma `ekran/modern-koyu-gece-classic-bozuk-format2.png` (koyu) ve `../../2026-11-04/deniz/ekran/tur2-varsayilan-koyu-x-x-krc08a-depo-engelli.png` (4 Kasım, koyu) · ölçüm: `matchMedia('(prefers-color-scheme: dark)') = true`, `html` sınıfsız, gövde `rgb(249, 250, 251)`, piksel (100,100) `#F9FAFB`, (720,450) `#FFFFFF`. 2/2 üretildi (`olcum/09-tasma-bozuk.json`, `olcum/12-dogrulama.json`).
- Olası kök neden: `index.html:19-24`. `localStorage.getItem` hata verince `catch`'e düşülüyor ve hemen ardındaki `matchMedia` denetimi hiç çalışmıyor. `tailwind.config.js:10` `darkMode: 'class'` olduğu için artık sistem tercihine kendiliğinden düşülmüyor. `App.tsx:418-419` ayarlar yüklenmeden (`settingsLoaded`) koyu sınıfı uygulamıyor; depo engelliyken ayarlar hiç yüklenmiyor.
- Kapsam: tek ekran (depo erişilemez durumdaki kurtarma ekranı; aynı yol ilk çizimde her ekranı etkiler)
- Doğrulama: aday
- Devir: Tolga (`ui-kirici`), depo engelliyken başka ekran yolları (ör. "Yeniden dene" sonrası).

### UI-GRS-28 · Ayarlar'da Görünüm ve renk teması seçilince ekran değişmiyor; aynı pencerede Arayüz hemen uygulanıyor
- Önem: K4
- Ekran: Ayarlar › Görünüm & Temalar (Sistem / Gündüz / Gece; Gök Mavisi, Zümrüt Ormanı, Gece Moru, Gün Batımı)          Arayüz: modern ve klasik
- Koşul: sistem teması=açık ve koyu · görünüm ayarı=Sistem → Gece / Gündüz · renk teması=classic → purple
         ekran=1440×900 · rol=mudur (ahmet) · veri=pilot
- Adımlar: 1. Ayarlar'ı aç. 2. "Gece"ye bas. 3. "Gece Moru"na bas. 4. Ekrana bak. 5. "Değişiklikleri Uygula"ya bas.
- Beklenen: Penceredeki üç seçim aynı davranmalı. Arayüz kartlarının altında "Seçim hemen uygulanır" yazıyor; Görünüm ve tema da hemen önizlenmeli ya da bunların "Uygula" beklediği açıkça yazmalı.
- Gözlenen (insan dili): "Gece" seçiliyken pencerenin arkasındaki ekran beyaz kalıyor; "Gece Moru" seçiliyken vurgu mavi kalıyor. Kullanıcı ayarın çalışmadığını sanabilir. Ancak "Değişiklikleri Uygula"dan sonra ekran değişiyor ve tercih yenilemeden sonra da kalıyor (UI-GRS-01 düzeldi). Yani ayar çalışıyor, ama aynı penceredeki Arayüz seçimi anında uygulanıyor; davranışlar tutarsız. "Vazgeç" seçimi doğru biçimde geri alıyor.
- Kanıt: `ekran/modern-acik-gecetiklandi-classic-ayarlar.png` (Gece seçili, ekran açık), `ekran/modern-acik-gecetiklandi-classic-uygulandi.png` (Uygula sonrası koyu), `ekran/modern-acik-gunduz-classic-ayarlar-mor-secildi.png`, `ekran/classic-acik-gecetiklandi-classic-ayarlar.png` · ölçüm:
  - "Gece"ye basınca `--m-bg` `#F2F2F7` kalıyor; "Uygula" sonrası `#000000`
  - "Gece Moru"na basınca `--m-accent` `#0066D6` kalıyor
  - "Vazgeç" sonrası `#0066D6` / `#F2F2F7`

  4/4 tıklama akışında aynı (`olcum/02-gorunum.json` → `tik-*`, `olcum/11-kenar-ayar-zumrut.json` → `ayarlar-onizleme`).
- Olası kök neden: `components/SettingsModal.tsx:88` Görünüm seçimi yerel taslakta (`scheme`) tutuluyor, yalnız `onSave` ile uygulanıyor. `:14` ve `:145` Arayüz seçimi kaydetmeden uygulanıyor.
- Kapsam: tek ekran (Ayarlar penceresi, iki arayüzde)
- Doğrulama: aday
- Devir: Cem (`ui-akis`), kullanıcı "Gece"ye basıp pencereyi × ile kapatınca ne bekliyor.

---

## Kısa notlar

- K4 · Kurtarma ekranı ve "PlanAsistan başka bir sekmede açık" bildirimi, modern arayüz ve Zümrüt/Gün Batımı teması seçiliyken klasik lacivert palette (`#111827`/`#1F2937`) ve mavi `#2563EB` düğmeyle açılıyor; Gece/Gündüz ise doğru izleniyor. Kanıt: `ekran/modern-koyu-gece-orange-ikinci-sekme-b.png`, `ekran/modern-acik-gece-emerald-kurtarma.png`; kök: `components/StoreRecovery.tsx:43`, `components/OtherTabNotice.tsx:19`. UI-GRS-18'in kalan kısmı.
- K4 · `meta[name=theme-color]` 30'dan fazla koşulun hepsinde `#2563eb`; koyu modda ve dört temada değişmiyor. `App.tsx:424` değeri `<html>`'den okuyor, tema sınıfı ise kök `div`te (4 Kasım kısa notu, ölçüldü).
- K4 · Açık modda üçüncül yazı dolgu zeminde 4,09:1 (`#6C6C70`/`#E3E3E8`). Örnekler: seçili olmayan segment sayaçları (Görüşmeler, Beklentiler, Veri havuzu, klasikte barındırılan modern ekranlar dahil) ve Zaman çizelgesi avatar baş harfleri (100/599 metin).
- K4 · Tahsis ısı haritasında koyu modda beyaz/`#3D7CC9` "%89" hücreleri 4,26:1; pilot veride 138/458 metin (önceden yalnız aşırı veride not edilmişti).
- K4 · Kenar çubuğunun alt bölümünde ad ve rol 1440 px'te bile kırpılıyor ("Ahmet Ş…", "Burak De…", "Proje Yöne…", 81 px). Altıncı satırdaki proje (YILDIZ) yapışkan alt bölümün altında kalıyor, ancak teker ile görünüyor (gezinme 900/972 px); listenin devam ettiğine dair solma ya da gölge yok (`ekran/modern-acik-gunduz-classic-kenar-alt.png`).
- K4 · Kayıt bildirimi ("… görevi eklendi") içerik alanına değil pencereye ortalanıyor (x=563–877); iki kartın arasındaki boşluğun üstüne biniyor. Koyuda lacivert hap siyah zeminde zayıf seçiliyor (`ekran/modern-koyu-gece-classic-kayit-bildirimi.png`).
- K4 · Klasik Yeni Görev penceresi açıkken mor yapay zekâ düğmesi karartmanın üstünde tam parlaklıkta kalıyor (`ekran/classic-koyu-gece-classic-pusula-yeni-gorev.png`).
- K4 · Ayrıntılı analiz › "Dikkat Gerektirenler"de 17 kartın hepsi aynı kırmızımsı kenar ve zeminde. Bütçe aşımı, onay bekleyen plan ve takvim sapması aynı alarm düzeyinde görünüyor (`ekran/modern-koyu-gece-classic-yonetim-ayrintili.png`, klasikte de aynı).
- K4 · Klasik koyu Ayarlar penceresi: "Vazgeç" `#6B7280`/`#18202F` 3,36:1, "VERİLERİ SIFIRLA" `#DC2626`/`#1F2937` 3,04:1, "Özellikler & Veri" 2,84:1 (modern tarafı UI-GRS-02'de).
- K4 · Öngörü (koyu) sapma rakamları `#059669` ve `#EF4444` `#242426` üstünde 4,11:1 (5/120). Kapasite–talep (açık) "İhtiyaç - Teklif" satırı `#A855F7`/`#FFFFFF` 3,96:1 (10/515).
- Gözle doğrulandı, bulgu değil: modern kart/zemin açıkta 1,12:1, koyuda 1,23:1, kenarlık yok. Göz kısma görüntülerinde Pano, Takvim ve Planlama kartları ayrı bloklar (`ekran/modern-koyu-gece-classic-nehir-pano-bulanik.png`).
- Ölçüm yanılgısı: Zaman çizelgesi "Bugün" etiketi 1,36–1,49:1 ölçülüyor, ama yazı kırmızı çizginin değil kartın üstünde; gözle okunuyor.
- Bulgu değil: Takvim'de içinde bulunulan ay hücresi durum rengini koruyor (yeşil dolgu + 2 px mavi iç halka; `olcum/12-dogrulama.json` → `takvim-*`).
- Olumlu: Gök Mavisi ve Gece Moru temalarında vurgu durum renklerinden net ayrılıyor (ΔE 112–143). Dört temada Ayarlar'ın birincil düğmesi 6,6–12,7:1. Rem testi iki arayüzde de tam ölçekleniyor, yatay taşma yok.
