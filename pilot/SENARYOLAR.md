# Pilot senaryo takvimi (v3, 9 Ekim 2026)

> **Yalnız Jira ajanı (1. rutin) ve test koordinatörü (2. rutin) okur.** Rol ajanlarına verilmez: ajanlar ne olacağını önceden bilmez; olay gerçekleşmeden tepki vermek −10 puandır. Bu dosyanın içeriği notlara, isteklere, ajan istemlerine ya da commit mesajlarına "senaryo" diye yazılmaz.

**Demo:** Kasım sonu (varsayım: 26 Kasım Perşembe öğleden sonra; kesin tarih gelince bu dosya ve iki rutinin takvim istisnaları güncellenir). **Demo ortamı, ajanların çalıştığı ortamın kendisidir:** sunumda gösterilen Supabase çalışma alanı, beş ajanın altı hafta boyunca üzerinde çalıştığı alandır. Sunum "canlı gibi" düşünülür: rakamlar, raporlar, riskler ve kararlar ajanların bıraktığı hâliyle gösterilir; ayrıca sunumda bir soru canlı sorulur. Süreç bu yüzden uzatıldı; Kasım sonu bir rehavet payı değildir: her ara kapı zamanında geçilmezse demo kapsamı daraltılır.

## Takvim ve ara kapılar

Koşular Salı ve Perşembe (1. rutin 07:45, 2. rutin 08:45). Jira ajanı son koşudan bu yana geçen günleri üretir; rol ajanları aynı sabah tepki verir.

| Koşu | Jira ajanının ürettiği günler | Rol ajanlarının penceresi | Kapı / not |
|---|---|---|---|
| 13 Ekim Sal | — (atlanır) | — | Hazırlık |
| 15 Ekim Per | Yeniden kurulum (simülasyon v4) → 14 Ekim; 6 simülasyon senaryosunun kaydı | 9–14 Ekim | **K0 Kurulum** |
| 20 Ekim Sal | 15–19 Ekim | 15–19 Ekim | 42. hafta raporları yayınlanır |
| 22 Ekim Per | 20–21 Ekim | 20–21 Ekim | **K1 Akış** |
| 27 Ekim Sal | 22–26 Ekim | 22–26 Ekim | 44. hafta raporu bu koşuda (Perşembe tatil) |
| 29 Ekim Per | 27–28 Ekim | — (tatil) | |
| 3 Kasım Sal | 29 Ekim–2 Kasım | 27 Ekim–2 Kasım | Ekim ay kapanışı |
| 5 Kasım Per | 3–4 Kasım | 3–4 Kasım | **K2 Senaryo** · 1. dalga biter |
| 10 Kasım Sal | 5–9 Kasım | 5–9 Kasım | 2. dalga başlar |
| 12 Kasım Per | 10–11 Kasım | 10–11 Kasım | |
| 17 Kasım Sal | 12–16 Kasım | 12–16 Kasım | |
| 19 Kasım Per | 17–18 Kasım | 17–18 Kasım | **K3 Dondurma** |
| 24 Kasım Sal | 19–23 Kasım | 19–23 Kasım | **K4 Karar** (genel prova) |
| 26 Kasım Per | 24–25 Kasım | 24–25 Kasım | Demo günü sabahı — K4 kararına göre |
| 27 Kasım → | — | — | Pilot kapanır; rutinler "Koşu atlandı" der |

| Kapı | Ne zaman | Geçme ölçütü | Geçmezse |
|---|---|---|---|
| **K0 Kurulum** | 15 Ekim, 1. rutin + 2. rutin sonrası | v4 yeniden kurulum Supabase'de; `senaryo liste` S1, S3, S6, S8, S9, S10'u gösterir; `kontrol` tümü geçti; `demo-testi` GEÇTİ (CDN uyarısı hariç) | 20 Ekim'e kadar kod düzeltmesi; senaryo tarihleri kaydırılır |
| **K1 Akış** | 22 Ekim, 2. rutin sonrası | 42. hafta raporları uçtan uca (gönderim → bölüm sorumlusu → PYB destek → yayın) MCP araçlarıyla geçti; her persona en az bir yazma aracını gerekçeli kullandı; S2 kararı uygulamada (istek dönüştü ya da reddedildi); açık yüksek bulgu yok ya da düzeltmesi planlandı | 27 Ekim'e kadar düzeltme; K2 ölçütleri değişmez |
| **K2 Senaryo** | 5 Kasım, 2. rutin sonrası | S1–S8 başarı ölçütleri (aşağıda) değerlendirildi, en az 6/8 ✓; PY ortalaması ≥ 75; DH1–DH3 ✓; gömülü bulguların en az 3/7'si bulundu | 2. dalga zayıf senaryonun telafisine ayrılır (S12); demo kapsamı daraltılır |
| **K3 Dondurma** | 19 Kasım, 2. rutin sonrası | Kod dondurulur (sonrası yalnız demo yolunu bozan hata düzeltmesi); `demo-testi` son 3 koşuda GEÇTİ; S9–S11 değerlendirildi; demo akışı (sunum metni) yazılı; `dondur --ad K3-2026-11-19` | Demo, K3'te çalışan ekranlarla sınırlanır |
| **K4 Karar** | 24 Kasım, 2. rutin sonrası | DH1–DH6 ✓; sunumu yapacak kişi demo akışını uygulamada baştan sona gezdi (canlı prova); `dondur --ad K4-2026-11-24` | Demo "dondurulmuş" ya da ertelenir |

**K4 kararı üç seçenektir:** *Canlı* — 26 Kasım sabahı iki rutin normal çalışır, sunum o sabah ajanların yaptığını da gösterir; *Dondurulmuş* — 26 Kasım koşuları atlanır, demo K4 kopyası üzerinde yapılır; *Ertele*. Karar, kullanıcı tarafından 2. rutin oturumuna `K4: canlı` (ya da `dondurulmuş`, `ertele`) yazılarak verilir; yazılmazsa varsayılan **dondurulmuş**tur.

## Demo günü protokolü

1. 24 Kasım 2. rutin sonunda K4 kopyası alınmıştır (`pilot-data/donmus/K4-2026-11-24/`).
2. *Canlı* kararında 26 Kasım: 1. ve 2. rutin normal çalışır; 2. rutin sonunda `demo-testi`. KALDI ya da kontrol KALDI ise `npm run -s pilot -- geri-yukle --ad K4-2026-11-24` ile geri dönülür ve sunum dondurulmuş yapılır. *Dondurulmuş* kararında 26 Kasım koşuları "Koşu atlandı" der.
3. Sunum: uygulamaya izleyici hesabıyla girilir ("Buluttan Çek"), müdür görünümüyle (`pilot uyeler --izleyici <e-posta>:mudur`). Demo akışı `demo-testi`nin gezdiği yoldur: Yönetim → Portföy → Ekip ve tahsis › Kapasite–talep → Risk raporu → Haftalık rapor; ardından NEHİR (PY gözüyle).
4. Canlı an: Ahmet'in demo yoklaması sorularından biri, aynı çalışma alanına bağlı Claude'a (MCP) sunumda sorulur; yanıtın rakamları ekrandakilerle aynıdır.
5. Sunum makinesinde CDN erişimi (Tailwind, ikonlar, Excel kitaplığı) önceden denenir; kurum ağı engelliyorsa ekran biçimsiz görünür (backlog BL-08).

## Senaryolar — 1. dalga (15 Ekim–5 Kasım)

**Tür:** *Anlatı* = Jira ajanı `pilot istek` ve `pilot not` ile üretir. *Simülasyon* = `pilot senaryo` kaydıyla Jira'da ve uygulamada iz bırakır (kayıt komutları aşağıda).

| # | Veri günü | Senaryo | Tür | Jira ajanı ne üretir | Beklenen tepki | Başarı ölçütü |
|---|---|---|---|---|---|---|
| S2 | 12 Ekim sinyal, 14 Ekim olay | PUSULA kapsam değişikliği: çevrimdışı mod | Anlatı | 12 Ekim haftalık koordinasyonda saha ekiplerinin bağlantı şikâyeti (PSL-92'ye atıf). 14 Ekim müşteri görüşmesi notu + `pilot istek --proje PSL --tarih 2026-10-14 --musteri "Kurum B Saha Operasyonları" --baslik "Çevrimdışı mod: bağlantısız veri girişi ve eşitleme" --aciklama "Saha ekipleri kapsama dışı bölgelerde veri giremiyor; Aralık sonuna kadar isteniyor."` Efor tahmini verilmez. | 15 Ekim: Burak isteği değerlendirir, "tahmin" işaretli eforla `oner_istek_karari` (kabul ya da ret, gerekçeli), plan onayda olduğundan revizyon önerir, Ahmet'i bilgilendirir. Ahmet öncelik kararı verir (15 ya da 20 Ekim). | İstek uygulamada karara bağlı; kapsam etkisi 42. hafta raporunda; Ahmet'in kararı rakama dayanır |
| S1 | 15–20 Ekim sinyal, 21 Ekim olay | NEHİR kritik hata zinciri | Simülasyon | Sinyal: NHR'de yeniden açılmalar artar. 21 Ekim: müşteri ortamında veri kaybı — yeni kayıt [Hata/Highest], NHR-41'e bağlı, Ozan Kılıç'a atanmış; aynı gün triyaj notu. | 22 Ekim: Burak aktarır, gerekçeli risk ve önlem açar, RAG'ı gerekçesiyle değiştirir, Selin'den test kaynağı ister, Perşembe raporunda dürüst anlatır. Selin talebi rakamla değerlendirir (B). Ahmet açıklama ister (C). | Risk, RAG ve rapor aynı olguyu aynı rakamlarla anlatır |
| S4 | 22 Ekim (2. rutin) | Haftalık rapor iadesi | Rutin 2 | — | Selin, kılavuzdaki eksik maddeyi (ör. müşteri teslim tarihi) bulduğu raporu `oner_rapor_karari` ile iade eder. Burak 27 Ekim'de karşılar; Mert biçimi denetler. | İade notunun her maddesi karşılanır. İade kendiliğinden olmadıysa zorlanmaz; raporda yazılır. |
| S3 | 19 Ekim duyuru, 26 Ekim–6 Kasım izin | ATLAS kilit kişi izni: Onur Çelik | Simülasyon | 19 Ekim ATLAS haftalık koordinasyonunda izin duyurusu (not). 26 Ekim'den itibaren Onur worklog girmez, üzerindeki işler kayar; uygulamaya izin AA'sı yazılmıştır. | 20 Ekim: Elif riski açar, işi yeniden dağıtır ya da ikame ister. 22 Ekim: Selin ikame önerir (Onur zaten 1,2 AA — G2). Plan kilitli olduğundan yalnız gerçekleşen değişir. | Termin kaymaları raporda gerekçeli; plan kilidi korunur |
| S6 | 19–30 Ekim | NEHİR bütçe aşımı: fazla mesai | Simülasyon | NHR ekibinin saati ×1,5 (Jira worklog); yeniden çalışma artar. Triyaj notlarında fazla mesai geçer. | 27 Ekim: Burak `jira_worklog` ile saat artışını görüp erken uyarır. 3 Kasım: EVM ile sapmayı açıklar, ek bütçe ya da kapsam önerir. Mert maliyet ↔ tahsis tutarlılığını doğrular. 5 Kasım: Ahmet karar verir. | Erken uyarı worklog rakamıyla; kesin sapma EVM aracından; öneri somut |
| S5 | 28 Ekim arife, 29 Ekim tatil | Bayram haftası | Takvim | Tatilde worklog ve not yok (28 Ekim yarım gün modellenmedi — BL-14). | 27 Ekim: PY'ler 44. hafta raporunu bu koşuda gönderir. Mert geciken raporu izler. | Tatile kayıt girilmez; rapor 27 Ekim'de gönderilir |
| S7 | 2 Kasım | Ay kapanışı | Simülasyon (mevcut) | Ekim gerçekleşen adam-ayı worklog'dan. | 3 Kasım: PY'ler gerçekleşeni worklog ile karşılaştırır, sapmayı açıklar; Mert kontrol eder. | Fark ±0,1 AA içinde ya da açıklamalı |
| S8 | 4 Kasım | YILDIZ teklifi kazanıldı | Simülasyon | Proje Teklif → Devam (başlangıç 1 Aralık); Kasım–Aralık ihtiyacı U320 Test Mühendisi 2 × 1,0 AA, U340 1 × 0,5 AA, en az yüklü mühendislere yazılır; olay satırı. | 5 Kasım: Selin kapasite-talebe bakıp kaydırma ya da işe alım önerir (B); Ahmet karar verir (C). | Karar kapasite-talep rakamına dayanır |

## Senaryolar — 2. dalga (10–24 Kasım)

Amaç: 1. dalgada öğrenilenin kalıcı olup olmadığını ve yük altında (iki eşzamanlı kriz, kaynak çatışması) davranışı sınamak. K2'de içerik gözden geçirilir; başlamamış senaryo `senaryo sil --id` ile kaldırılabilir.

| # | Veri günü | Senaryo | Tür | Jira ajanı ne üretir | Beklenen tepki | Başarı ölçütü |
|---|---|---|---|---|---|---|
| S9 | 7–10 Kasım sinyal, 11 Kasım olay | PUSULA kritik hata: eşitlemede mükerrer kayıt | Simülasyon | Sinyal: PSL'de yeniden açılmalar artar. 11 Kasım: yeni kayıt [Hata/Highest], PSL-92'ye bağlı, Ece Polat'a atanmış; aynı gün triyaj notu (S2'deki çevrimdışı modla ilişkisi). | 12 Kasım: Burak iki projede eşzamanlı kriz yönetir — öncelik sırasını gerekçesiyle yazar, Ahmet'e ikisini birlikte anlatır; S2 kararını yeniden değerlendirir. | İki projenin raporu tutarlı; öncelik kararı rakamlı; S2 kapsamıyla ilişki kurulmuş |
| S10 | 9 Kasım duyuru, 16–27 Kasım izin | NEHİR kilit kişi izni: Ozan Kılıç | Simülasyon | 9 Kasım NEHİR haftalık koordinasyonunda izin duyurusu (not). 16 Kasım'dan itibaren Ozan worklog girmez; S1 kaydı onun üzerindedir. | 10–12 Kasım: Burak S1 kaydını devreder ya da ikame ister; Selin U340 kaynağını S8'in (YILDIZ U340 ihtiyacı) ile çatışma içinde değerlendirir; Ahmet önceliklendirir. | Devir/ikame kararı rakamlı; kaynak çatışması açıkça çözülür |
| S11 | 17 Kasım | ATLAS müşteri isteği: senaryo karşılaştırma görünümü | Anlatı | 17 Kasım müşteri görüşmesi notu + `pilot istek --proje ATL --tarih 2026-11-17 --musteri "Kurum A Strateji Dairesi" --baslik "Karar panosunda iki senaryonun yan yana karşılaştırılması" --aciklama "Yıl sonu bütçe toplantısı için isteniyor; 15 Aralık'a kadar."` | 19 Kasım: Elif `oner_istek_karari` ile karar verir; plan kilidi ve S3 sonrası kapasiteyle ilişkilendirir. | Karar 2 iş günü içinde, eforu ve takvim etkisi gerekçede |
| S12 | K2'de seçilir | Telafi | — | 1. dalgada başarısız kalan senaryonun bir çeşidi (ör. S4 iade yaşanmadıysa yeniden). Seçilmezse yok. | — | — |

## Kayıt komutları (1. rutin, 15 Ekim, yeniden kurulumdan hemen sonra)

`senaryo liste` boşsa bu altı komut **bir kez** çalıştırılır (sonra yeniden çalıştırılmaz; senaryolar `pilot-data/durum.json`'da saklanır ve `gun` ilgili günü üretirken uygulanır). Tarihi geçmiş senaryo reddedilir; o durumda özete yazılır, uydurulmaz.

```bash
npm run -s pilot -- senaryo ekle --id S1 --tur kritik-hata --proje NHR --tarih 2026-10-21 --baslik "Müşteri ortamında veri kaybı: gece yükleme işi kayıtları siliyor" --aciklama "Kurum C ortamında 20 Ekim gece yüklemesinden sonra son 3 günün kayıtları eksik. Geri yükleme yapıldı, kök neden bilinmiyor." --oncelik Highest --tip Hata --atanan "Ozan Kılıç" --bagli NHR-41 --tahmin 24 --hazirlik 6
npm run -s pilot -- senaryo ekle --id S3 --tur izin --kisi "Onur Çelik" --baslangic 2026-10-26 --bitis 2026-11-06 --neden "Yıllık izin"
npm run -s pilot -- senaryo ekle --id S6 --tur fazla-mesai --proje NHR --baslangic 2026-10-19 --bitis 2026-10-30 --carpan 1.5
npm run -s pilot -- senaryo ekle --id S8 --tur teklif-kazanildi --proje YLD --tarih 2026-11-04 --baslangic 2026-12-01 --ihtiyac "U320:2:1.0,U340:1:0.5"
npm run -s pilot -- senaryo ekle --id S9 --tur kritik-hata --proje PSL --tarih 2026-11-11 --baslik "Eşitleme sonrası saha kayıtları çift görünüyor" --aciklama "Bağlantı geri geldiğinde çevrimdışı girilen kayıtlar ikinci kez gönderiliyor; saha ekipleri raporlarda mükerrer kayıt görüyor." --oncelik Highest --tip Hata --atanan "Ece Polat" --bagli PSL-92 --tahmin 20 --hazirlik 4
npm run -s pilot -- senaryo ekle --id S10 --tur izin --kisi "Ozan Kılıç" --baslangic 2026-11-16 --bitis 2026-11-27 --neden "Yıllık izin"
```

Danışman doğrulaması (9 Ekim, 14 Ekim'e kadar üretilmiş veriyle): altı komut kabul edildi; 25 Kasım'a kadar üretimde S1 ve S9 kayıtları ilgili günde açıldı, izin satırları olay dosyalarında göründü, `kontrol` tümü geçti, `demo-testi` 28/28 GEÇTİ. Ajan müdahalesi olmadan 25 Kasım'da portföy sağlığı 64, NEHİR 43 (SPI 0,85 · CPI 0,84), PUSULA 63, ATLAS 61, KALKAN 72; kapasite-talepte 2 rol açığı. Ajanların işi bu tabloyu değiştirir; değişimin yönü ve gerekçesi puanlanır.

## Gömülü bulgular (puanlamada kullanılır; ajanlara söylenmez)

Veride bilerek bırakılmış, gerçek bir birimde de görülen sorunlar. Ajanın bulması "bulgu kalitesi" ve "veriyle tutarlılık" puanına yazılır; koordinatör raporda hangisinin kim tarafından ne zaman bulunduğunu işaretler (K2 ölçütü: en az 3/7).

| # | Bulgu | Kim bulmalı | Nerede görünür |
|---|---|---|---|
| G1 | Aslı Çakır NEHİR'de yıl boyu 0,7 AA planlı, efektif kapasitesi 0,5 — NEHİR gecikmesinin yapısal nedenlerinden | Selin, Burak | `doluluk_analizi`, `kisi_profili` |
| G2 | Onur Çelik ve Deniz Yavuz Nisan'dan beri ATLAS + KALKAN'da 1,2 AA (S3 ile birleşince ATLAS riski) | Selin, Elif | `doluluk_analizi` |
| G3 | Maliyet raporunda maliyetlenemeyen 1 kişi (ünvan ya da oran eksik) | Mert | `maliyet_raporu` |
| G4 | NEHİR algı farkı: RAG "Riskli", kurallara göre "Kritik" | Ahmet, Mert, Selin | `proje_detayi` › `algi_farki` |
| G5 | Burak'ın geçmiş haftalarda iyimser RAG verme eğilimi | Selin, Ahmet | RAG geçmişi, `son_degisiklikler` |
| G6 | YILDIZ teklif planı Kasım'da U320'yi (Hakan Öztürk, Barış Güneş, Merve Aslan) kapasite üstüne çıkarıyor — S8'den önce bile | Selin | `doluluk_analizi`, `kapasite_talep` |
| G7 | Ay ortasında Ekim CPI'sı şişkin görünüyor (gerçekleşen ay kapanışında girildiği için; bilinen ürün açığı BL-07) | Mert, Ahmet | `evm_analizi` ↔ `jira_worklog` |
