# Pilot senaryo takvimi (v4, 13 Ekim 2026)

> **Yalnız Jira ajanı (1. rutin) ve test koordinatörü (2. rutin) okur.** Rol ajanlarına verilmez: ajanlar ne olacağını önceden bilmez; olay gerçekleşmeden tepki vermek −10 puandır. Bu dosyanın içeriği notlara, isteklere, ajan istemlerine ya da commit mesajlarına "senaryo" diye yazılmaz.

**Takvim bir hafta kaydırıldı (13 Ekim kararı):** ajan sisteminin çalışmasında bir haftalık engel var; 13–20 Ekim uygulama haftasıdır (rutinler koşmaz, uygulama eksikleri kapatılır: [Backlog](../docs/pilot/BACKLOG.md)). Kurulum, kapılar, senaryolar ve demo yedi gün ileri alındı; takvime bağlı olaylar (28–29 Ekim bayram, Ekim ay kapanışı) yerinde kaldı.

**Demo:** Aralık başı (varsayım: 3 Aralık Perşembe öğleden sonra; kesin tarih gelince bu dosya ve iki rutinin takvim istisnaları güncellenir). **Demo ortamı, ajanların çalıştığı ortamın kendisidir:** sunumda gösterilen Supabase çalışma alanı, beş ajanın altı hafta boyunca üzerinde çalıştığı alandır. Sunum "canlı gibi" düşünülür: rakamlar, raporlar, riskler ve kararlar ajanların bıraktığı hâliyle gösterilir; ayrıca sunumda bir soru canlı sorulur. Süreç bu yüzden uzatıldı; Kasım sonu bir rehavet payı değildir: her ara kapı zamanında geçilmezse demo kapsamı daraltılır.

## Takvim ve ara kapılar

Koşular Salı ve Perşembe (1. rutin 07:45, 2. rutin 08:45). Jira ajanı son koşudan bu yana geçen günleri üretir; rol ajanları aynı sabah tepki verir.

| Koşu | Jira ajanının ürettiği günler | Rol ajanlarının penceresi | Kapı / not |
|---|---|---|---|
| 13, 15, 20 Ekim | — (atlanır) | — | Uygulama haftası (ajan sistemi engeli); kod 21 Ekim akşamına kadar main'de |
| 22 Ekim Per | Yeniden kurulum (simülasyon v4) → 21 Ekim; 6 simülasyon senaryosunun kaydı | 16–21 Ekim | **K0 Kurulum** · 43. hafta raporları |
| 27 Ekim Sal | 22–26 Ekim | 22–26 Ekim | **K1 Akış** · 43. hafta yayını; 44. hafta raporu bu koşuda (Perşembe tatil) |
| 29 Ekim Per | 27–28 Ekim | — (tatil) | 28 Ekim yarım gün |
| 3 Kasım Sal | 29 Ekim–2 Kasım | 27 Ekim–2 Kasım | Ekim ay kapanışı |
| 5 Kasım Per | 3–4 Kasım | 3–4 Kasım | |
| 10 Kasım Sal | 5–9 Kasım | 5–9 Kasım | |
| 12 Kasım Per | 10–11 Kasım | 10–11 Kasım | **K2 Senaryo** · 1. dalga biter |
| 17 Kasım Sal | 12–16 Kasım | 12–16 Kasım | 2. dalga başlar |
| 19 Kasım Per | 17–18 Kasım | 17–18 Kasım | |
| 24 Kasım Sal | 19–23 Kasım | 19–23 Kasım | |
| 26 Kasım Per | 24–25 Kasım | 24–25 Kasım | **K3 Dondurma** |
| 1 Aralık Sal | 26–30 Kasım | 26–30 Kasım | **K4 Karar** (genel prova) |
| 3 Aralık Per | 1–2 Aralık | 1–2 Aralık | Demo günü sabahı — K4 kararına göre |
| 4 Aralık → | — | — | Pilot kapanır; rutinler "Koşu atlandı" der |

| Kapı | Ne zaman | Geçme ölçütü | Geçmezse |
|---|---|---|---|
| **K0 Kurulum** | 22 Ekim, 1. rutin + 2. rutin sonrası | v4 yeniden kurulum Supabase'de; `senaryo liste` S1, S3, S6, S8, S9, S10'u gösterir; `kontrol` tümü geçti; `demo-testi` GEÇTİ (dış kaynak uyarısı hariç) | 27 Ekim'e kadar kod düzeltmesi; senaryo tarihleri kaydırılır |
| **K1 Akış** | 27 Ekim, 2. rutin sonrası | 43. hafta raporları uçtan uca (gönderim → bölüm sorumlusu → PYB destek → yayın) MCP araçlarıyla geçti; her persona en az bir yazma aracını gerekçeli kullandı; S2 kararı uygulamada (istek dönüştü ya da reddedildi); açık yüksek bulgu yok ya da düzeltmesi planlandı | 3 Kasım'a kadar düzeltme; K2 ölçütleri değişmez |
| **K2 Senaryo** | 12 Kasım, 2. rutin sonrası | S1–S8 başarı ölçütleri (aşağıda) değerlendirildi, en az 6/8 ✓; PY ortalaması ≥ 75; DH1–DH3 ✓; gömülü bulguların en az 3/6'sı bulundu | 2. dalga zayıf senaryonun telafisine ayrılır (S12); demo kapsamı daraltılır |
| **K3 Dondurma** | 26 Kasım, 2. rutin sonrası | Kod dondurulur (sonrası yalnız demo yolunu bozan hata düzeltmesi); `demo-testi` son 3 koşuda GEÇTİ; S9–S11 değerlendirildi; demo akışı (sunum metni) yazılı; `dondur --ad K3-2026-11-26` | Demo, K3'te çalışan ekranlarla sınırlanır |
| **K4 Karar** | 1 Aralık, 2. rutin sonrası | DH1–DH6 ✓; sunumu yapacak kişi demo akışını uygulamada baştan sona gezdi (canlı prova); `dondur --ad K4-2026-12-01` | Demo "dondurulmuş" ya da ertelenir |

**K4 kararı üç seçenektir:** *Canlı* — 3 Aralık sabahı iki rutin normal çalışır, sunum o sabah ajanların yaptığını da gösterir; *Dondurulmuş* — 3 Aralık koşuları atlanır, demo K4 kopyası üzerinde yapılır; *Ertele*. Karar, kullanıcı tarafından 2. rutin oturumuna `K4: canlı` (ya da `dondurulmuş`, `ertele`) yazılarak verilir; yazılmazsa varsayılan **dondurulmuş**tur.

## Demo günü protokolü

1. 1 Aralık 2. rutin sonunda K4 kopyası alınmıştır (`pilot-data/donmus/K4-2026-12-01/`).
2. *Canlı* kararında 3 Aralık: 1. ve 2. rutin normal çalışır; 2. rutin sonunda `demo-testi`. KALDI ya da kontrol KALDI ise `npm run -s pilot -- geri-yukle --ad K4-2026-12-01` ile geri dönülür ve sunum dondurulmuş yapılır. *Dondurulmuş* kararında 3 Aralık koşuları "Koşu atlandı" der.
3. Sunum: uygulamaya izleyici hesabıyla girilir ("Buluttan Çek"), müdür görünümüyle (`pilot uyeler --izleyici <e-posta>:mudur`). Demo akışı `demo-testi`nin gezdiği yoldur: Yönetim → Portföy → Ekip ve tahsis › Kapasite–talep → Risk raporu → Haftalık rapor; ardından NEHİR (PY gözüyle).
4. Canlı an: Ahmet'in demo yoklaması sorularından biri, aynı çalışma alanına bağlı Claude'a (MCP) sunumda sorulur; yanıtın rakamları ekrandakilerle aynıdır.
5. Stil, ikon ve Excel kitaplıkları pakete gömülüdür ([BL-08](../docs/pilot/BACKLOG.md)); kurum ağında yalnız Geist yazı tipi (yoksa sistem yazı tipi) ve sekme simgesi dışarıdan gelir. Sunum makinesinde uygulama yine de önceden açılıp denenir.

## Senaryolar — 1. dalga (22 Ekim–12 Kasım)

**Tür:** *Anlatı* = Jira ajanı `pilot istek` ve `pilot not` ile üretir. *Simülasyon* = `pilot senaryo` kaydıyla Jira'da ve uygulamada iz bırakır (kayıt komutları aşağıda).

| # | Veri günü | Senaryo | Tür | Jira ajanı ne üretir | Beklenen tepki | Başarı ölçütü |
|---|---|---|---|---|---|---|
| S2 | 19 Ekim sinyal, 21 Ekim olay | PUSULA kapsam değişikliği: çevrimdışı mod | Anlatı | 19 Ekim haftalık koordinasyonda saha ekiplerinin bağlantı şikâyeti (PSL-92'ye atıf). 21 Ekim müşteri görüşmesi notu + `pilot istek --proje PSL --tarih 2026-10-21 --musteri "Kurum B Saha Operasyonları" --baslik "Çevrimdışı mod: bağlantısız veri girişi ve eşitleme" --aciklama "Saha ekipleri kapsama dışı bölgelerde veri giremiyor; Aralık sonuna kadar isteniyor."` Efor tahmini verilmez. | 22 Ekim: Burak isteği değerlendirir, "tahmin" işaretli eforla `oner_istek_karari` (kabul ya da ret, gerekçeli), plan onayda olduğundan revizyon önerir, Ahmet'i bilgilendirir. Ahmet öncelik kararı verir (22 ya da 27 Ekim). | İstek uygulamada karara bağlı; kapsam etkisi 43. hafta raporunda; Ahmet'in kararı rakama dayanır |
| S1 | 22–25 Ekim sinyal, 26 Ekim olay | NEHİR kritik hata zinciri | Simülasyon | Sinyal: NHR'de yeniden açılmalar artar. 26 Ekim: müşteri ortamında veri kaybı — yeni kayıt [Hata/Highest], NHR-41'e bağlı, Ozan Kılıç'a atanmış; aynı gün triyaj notu. | 27 Ekim: Burak aktarır, gerekçeli risk ve önlem açar, RAG'ı gerekçesiyle değiştirir, Selin'den test kaynağı ister, aynı koşuda gönderdiği 44. hafta raporunda dürüst anlatır. Selin talebi rakamla değerlendirir (B). Ahmet açıklama ister (C). | Risk, RAG ve rapor aynı olguyu aynı rakamlarla anlatır |
| S4 | 27 Ekim (2. rutin) | Haftalık rapor iadesi | Rutin 2 | — | Selin, kılavuzdaki eksik maddeyi (ör. müşteri teslim tarihi) bulduğu raporu `oner_rapor_karari` ile iade eder. Burak 3 Kasım'da karşılar; Mert biçimi denetler. | İade notunun her maddesi karşılanır. İade kendiliğinden olmadıysa zorlanmaz; raporda yazılır. |
| S3 | 26 Ekim duyuru, 2–13 Kasım izin | ATLAS kilit kişi izni: Onur Çelik | Simülasyon | 26 Ekim ATLAS haftalık koordinasyonunda izin duyurusu (not). 2 Kasım'dan itibaren Onur worklog girmez, üzerindeki işler kayar; uygulamaya izin AA'sı yazılmıştır. | 27 Ekim: Elif riski açar, işi yeniden dağıtır ya da ikame ister. Selin aynı koşuda ya da 3 Kasım'da ikame önerir (Onur zaten 1,2 AA — G2). Plan kilitli olduğundan yalnız gerçekleşen değişir. | Termin kaymaları raporda gerekçeli; plan kilidi korunur |
| S6 | 22–30 Ekim | NEHİR bütçe aşımı: fazla mesai | Simülasyon | NHR ekibinin saati ×1,5 (Jira worklog); yeniden çalışma artar. Triyaj notlarında fazla mesai geçer. | 27 Ekim: Burak `jira_worklog` ile saat artışını görüp erken uyarır. 3 Kasım: EVM ile sapmayı açıklar, ek bütçe ya da kapsam önerir. Mert maliyet ↔ tahsis tutarlılığını doğrular. 5 Kasım: Ahmet karar verir. | Erken uyarı worklog rakamıyla; kesin sapma EVM aracından; öneri somut |
| S5 | 28 Ekim arife, 29 Ekim tatil | Bayram haftası | Takvim | Tatilde worklog ve not yok; 28 Ekim yarım gün: worklog yarıya iner, 13:00'ten sonra kayıt yok (BL-14). | 27 Ekim: PY'ler 44. hafta raporunu bu koşuda gönderir. Mert geciken raporu izler. | Tatile kayıt girilmez; rapor 27 Ekim'de gönderilir |
| S7 | 2 Kasım | Ay kapanışı | Simülasyon (mevcut) | Ekim gerçekleşen adam-ayı worklog'dan. | 3 Kasım: PY'ler gerçekleşeni worklog ile karşılaştırır, sapmayı açıklar; Mert kontrol eder. | Fark ±0,1 AA içinde ya da açıklamalı |
| S8 | 11 Kasım | YILDIZ teklifi kazanıldı | Simülasyon | Proje Teklif → Devam (başlangıç 1 Aralık); Kasım–Aralık ihtiyacı U320 Test Mühendisi 2 × 1,0 AA, U340 1 × 0,5 AA, en az yüklü mühendislere yazılır; olay satırı. | 12 Kasım: Selin kapasite-talebe bakıp kaydırma ya da işe alım önerir (B); Ahmet karar verir (C). | Karar kapasite-talep rakamına dayanır |

## Senaryolar — 2. dalga (17 Kasım–1 Aralık)

Amaç: 1. dalgada öğrenilenin kalıcı olup olmadığını ve yük altında (iki eşzamanlı kriz, kaynak çatışması) davranışı sınamak. K2'de içerik gözden geçirilir; başlamamış senaryo `senaryo sil --id` ile kaldırılabilir.

| # | Veri günü | Senaryo | Tür | Jira ajanı ne üretir | Beklenen tepki | Başarı ölçütü |
|---|---|---|---|---|---|---|
| S9 | 14–17 Kasım sinyal, 18 Kasım olay | PUSULA kritik hata: eşitlemede mükerrer kayıt | Simülasyon | Sinyal: PSL'de yeniden açılmalar artar. 18 Kasım: yeni kayıt [Hata/Highest], PSL-92'ye bağlı, Ece Polat'a atanmış; aynı gün triyaj notu (S2'deki çevrimdışı modla ilişkisi). | 19 Kasım: Burak iki projede eşzamanlı kriz yönetir — öncelik sırasını gerekçesiyle yazar, Ahmet'e ikisini birlikte anlatır; S2 kararını yeniden değerlendirir. | İki projenin raporu tutarlı; öncelik kararı rakamlı; S2 kapsamıyla ilişki kurulmuş |
| S10 | 16 Kasım duyuru, 23 Kasım–4 Aralık izin | NEHİR kilit kişi izni: Ozan Kılıç | Simülasyon | 16 Kasım NEHİR haftalık koordinasyonunda izin duyurusu (not). 23 Kasım'dan itibaren Ozan worklog girmez; S1 kaydı onun üzerindedir. | 17–19 Kasım: Burak S1 kaydını devreder ya da ikame ister; Selin U340 kaynağını S8'in (YILDIZ U340 ihtiyacı) ile çatışma içinde değerlendirir; Ahmet önceliklendirir. | Devir/ikame kararı rakamlı; kaynak çatışması açıkça çözülür |
| S11 | 24 Kasım | ATLAS müşteri isteği: senaryo karşılaştırma görünümü | Anlatı | 24 Kasım müşteri görüşmesi notu + `pilot istek --proje ATL --tarih 2026-11-24 --musteri "Kurum A Strateji Dairesi" --baslik "Karar panosunda iki senaryonun yan yana karşılaştırılması" --aciklama "Yıl sonu bütçe toplantısı için isteniyor; 15 Aralık'a kadar."` | 26 Kasım: Elif `oner_istek_karari` ile karar verir; plan kilidi ve S3 sonrası kapasiteyle ilişkilendirir. | Karar 2 iş günü içinde, eforu ve takvim etkisi gerekçede |
| S12 | K2'de seçilir | Telafi | — | 1. dalgada başarısız kalan senaryonun bir çeşidi (ör. S4 iade yaşanmadıysa yeniden). Seçilmezse yok. | — | — |

## Kayıt komutları (1. rutin, 22 Ekim, yeniden kurulumdan hemen sonra)

`senaryo liste` boşsa bu altı komut **bir kez** çalıştırılır (sonra yeniden çalıştırılmaz; senaryolar `pilot-data/durum.json`'da saklanır ve `gun` ilgili günü üretirken uygulanır). Tarihi geçmiş senaryo reddedilir; o durumda özete yazılır, uydurulmaz.

```bash
npm run -s pilot -- senaryo ekle --id S1 --tur kritik-hata --proje NHR --tarih 2026-10-26 --baslik "Müşteri ortamında veri kaybı: gece yükleme işi kayıtları siliyor" --aciklama "Kurum C ortamında 25 Ekim gece yüklemesinden sonra son 3 günün kayıtları eksik. Geri yükleme yapıldı, kök neden bilinmiyor." --oncelik Highest --tip Hata --atanan "Ozan Kılıç" --bagli NHR-41 --tahmin 24 --hazirlik 4
npm run -s pilot -- senaryo ekle --id S3 --tur izin --kisi "Onur Çelik" --baslangic 2026-11-02 --bitis 2026-11-13 --neden "Yıllık izin"
npm run -s pilot -- senaryo ekle --id S6 --tur fazla-mesai --proje NHR --baslangic 2026-10-22 --bitis 2026-10-30 --carpan 1.5
npm run -s pilot -- senaryo ekle --id S8 --tur teklif-kazanildi --proje YLD --tarih 2026-11-11 --baslangic 2026-12-01 --ihtiyac "U320:2:1.0,U340:1:0.5"
npm run -s pilot -- senaryo ekle --id S9 --tur kritik-hata --proje PSL --tarih 2026-11-18 --baslik "Eşitleme sonrası saha kayıtları çift görünüyor" --aciklama "Bağlantı geri geldiğinde çevrimdışı girilen kayıtlar ikinci kez gönderiliyor; saha ekipleri raporlarda mükerrer kayıt görüyor." --oncelik Highest --tip Hata --atanan "Ece Polat" --bagli PSL-92 --tahmin 20 --hazirlik 4
npm run -s pilot -- senaryo ekle --id S10 --tur izin --kisi "Ozan Kılıç" --baslangic 2026-11-23 --bitis 2026-12-04 --neden "Yıllık izin"
```

Doğrulama (13 Ekim, kaydırılmış takvimle, dosya modunda): 22 Ekim kurulumundan (→ 21 Ekim) hemen sonra altı komut kabul edildi; 30 Kasım'a kadar üretimde S1 (26 Ekim) ve S9 (18 Kasım) kayıtları ilgili günde açıldı, S8 11 Kasım'da YILDIZ'ı "Devam"a aldı, izin satırları olay dosyalarında göründü. Ajan müdahalesi olmadan 30 Kasım'da portföy sağlığı 62, NEHİR 28 (SPI 0,83 · CPI 0,82), PUSULA 65, KALKAN 66, ATLAS 70, YILDIZ 81; kapasite-talepte 2 rol açığı (2,2 ve 0,7 AA). S6 Ekim içinde kalır ki bütçe aşımı demodan önce kapanan ayda (Ekim) görünsün. Ajanların işi bu tabloyu değiştirir; değişimin yönü ve gerekçesi puanlanır.

## Gömülü bulgular (puanlamada kullanılır; ajanlara söylenmez)

Veride bilerek bırakılmış, gerçek bir birimde de görülen sorunlar. Ajanın bulması "bulgu kalitesi" ve "veriyle tutarlılık" puanına yazılır; koordinatör raporda hangisinin kim tarafından ne zaman bulunduğunu işaretler (K2 ölçütü: en az 3/6). G7 12 Ekim'de ürün düzeltmesiyle (BL-07) kalktı; puanlamada kullanılmaz.

| # | Bulgu | Kim bulmalı | Nerede görünür |
|---|---|---|---|
| G1 | Aslı Çakır NEHİR'de yıl boyu 0,7 AA planlı, efektif kapasitesi 0,5 — NEHİR gecikmesinin yapısal nedenlerinden | Selin, Burak | `doluluk_analizi`, `kisi_profili` |
| G2 | Onur Çelik ve Deniz Yavuz Nisan'dan beri ATLAS + KALKAN'da 1,2 AA (S3 ile birleşince ATLAS riski) | Selin, Elif | `doluluk_analizi` |
| G3 | Maliyet raporunda maliyetlenemeyen 1 kişi (ünvan ya da oran eksik) | Mert | `maliyet_raporu` |
| G4 | NEHİR algı farkı: RAG "Riskli", kurallara göre "Kritik" | Ahmet, Mert, Selin | `proje_detayi` › `algi_farki` |
| G5 | Burak'ın geçmiş haftalarda iyimser RAG verme eğilimi | Selin, Ahmet | RAG geçmişi, `son_degisiklikler` |
| G6 | YILDIZ teklif planı Kasım'da U320'yi (Hakan Öztürk, Barış Güneş, Merve Aslan) kapasite üstüne çıkarıyor — S8'den önce bile | Selin | `doluluk_analizi`, `kapasite_talep` |
| ~~G7~~ | ~~Ay ortasında Ekim CPI'sı şişkin görünüyor~~ — kaldırıldı (12 Ekim): EVM artık gerçekleşeni girilmiş son aya kadar hesaplanır ([BL-07](../docs/pilot/BACKLOG.md)) | — | — |
