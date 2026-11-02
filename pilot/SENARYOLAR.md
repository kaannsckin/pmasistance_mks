# Pilot senaryo takvimi (v5, 2 Kasım 2026)

> **Yalnız Jira ajanı (1. rutin) ve test koordinatörü (2. rutin) okur.** Rol ajanlarına verilmez: ajanlar ne olacağını önceden bilmez; olay gerçekleşmeden tepki vermek −10 puandır. Bu dosyanın içeriği notlara, isteklere, ajan istemlerine ya da commit mesajlarına "senaryo" diye yazılmaz.

**Pilot 3 Kasım'da yeniden başlar (2 Kasım kararı).** 22–29 Ekim koşuları yapılamadı: pilotun Supabase sunucusuna ulaşılamıyordu (27 Ekim: vekil 502; 2 Kasım sabahı: Cloudflare 521 "Web server is down"; aynı gün yeniden erişilebilir oldu) ve rutinler bu durumda durmak üzere yazılmıştı. K0 ve K1 hiç yapılmadı. Demo tarihi kaymaz; takvim tek dalgada sıkıştırıldı. Bundan sonra bulut erişimi kesilirse pilot durmaz, dosya modunda sürer (1. rutin, adım 3); bulut dönünce aynı çalışma alanına taşınır.

**Demo:** 3 Aralık Perşembe öğleden sonra (varsayım; kesin tarih gelince bu dosya ve iki rutinin takvim istisnaları güncellenir). **Demo ortamı, ajanların çalıştığı ortamın kendisidir:** sunumda gösterilen çalışma alanı, beş ajanın dört hafta boyunca üzerinde çalıştığı alandır. Sunum "canlı gibi" düşünülür: rakamlar, raporlar, riskler ve kararlar ajanların bıraktığı hâliyle gösterilir; ayrıca sunumda bir soru canlı sorulur. Kaybedilen iki hafta geri gelmez: her ara kapı zamanında geçilmezse demo kapsamı daraltılır, tarih değil.

## Takvim ve ara kapılar

Koşular Salı ve Perşembe (1. rutin 07:45, 2. rutin 08:45). Jira ajanı son koşudan bu yana geçen günleri üretir; rol ajanları aynı sabah tepki verir.

| Koşu | Jira ajanının ürettiği günler | Rol ajanlarının penceresi | Kapı / not |
|---|---|---|---|
| 3 Kasım Sal | Yeniden kurulum (simülasyon v5, ajanlı dönem 2 Kasım) → 2 Kasım; 6 simülasyon senaryosunun kaydı | 27 Ekim–2 Kasım | **K0 Kurulum** · Ekim ay kapanışı (S7) · 44. hafta yayını |
| 5 Kasım Per | 3–4 Kasım | 3–4 Kasım | 45. hafta raporları · S2 |
| 10 Kasım Sal | 5–9 Kasım | 5–9 Kasım | **K1 Akış** · 45. hafta yayını · S3 duyurusu, S6 başlar |
| 12 Kasım Per | 10–11 Kasım | 10–11 Kasım | S1 |
| 17 Kasım Sal | 12–16 Kasım | 12–16 Kasım | Onur'un izni başlar · S10 duyurusu |
| 19 Kasım Per | 17–18 Kasım | 17–18 Kasım | **K2 Senaryo** · S9 |
| 24 Kasım Sal | 19–23 Kasım | 19–23 Kasım | S8 · S11 · Ozan'ın izni başlar |
| 26 Kasım Per | 24–25 Kasım | 24–25 Kasım | **K3 Dondurma** |
| 1 Aralık Sal | 26–30 Kasım | 26–30 Kasım | **K4 Karar** (genel prova) |
| 3 Aralık Per | 1–2 Aralık | 1–2 Aralık | Demo günü sabahı — K4 kararına göre · Kasım ay kapanışı |
| 4 Aralık → | — | — | Pilot kapanır; rutinler "Koşu atlandı" der |

| Kapı | Ne zaman | Geçme ölçütü | Geçmezse |
|---|---|---|---|
| **K0 Kurulum** | 3 Kasım, 1. rutin + 2. rutin sonrası | v5 yeniden kurulum yapıldı (bulutta ya da dosya modunda; mod raporda yazılı); `senaryo liste` S1, S3, S6, S8, S9, S10'u gösterir; `kontrol` tümü geçti; `demo-testi` GEÇTİ; beş ajan çalıştı ve her biri en az bir yazma aracını gerekçeli kullandı | 5 Kasım'a kadar kod ya da talimat düzeltmesi |
| **K1 Akış** | 10 Kasım, 2. rutin sonrası | 45. hafta raporları uçtan uca (5 Kasım gönderim → bölüm sorumlusu → 10 Kasım PYB destek ve yayın → müdür okur) MCP araçlarıyla geçti; S2 kararı uygulamada (istek dönüştü ya da reddedildi); açık yüksek bulgu yok ya da düzeltmesi planlandı | 12 Kasım'a kadar düzeltme; K2 ölçütleri değişmez |
| **K2 Senaryo** | 19 Kasım, 2. rutin sonrası | S1, S2, S4, S7 başarı ölçütleri ile S3 ve S6'nın erken tepkisi değerlendirildi, en az 4/6 ✓; PY ortalaması ≥ 75; DH1–DH3 ✓; gömülü bulguların en az 3/6'sı bulundu | Kalan iki koşudan biri zayıf senaryonun telafisine ayrılır (S12); demo kapsamı daraltılır |
| **K3 Dondurma** | 26 Kasım, 2. rutin sonrası | Kod dondurulur (sonrası yalnız demo yolunu bozan hata düzeltmesi); `demo-testi` son 3 koşuda GEÇTİ; S8–S11'e ilk tepkiler değerlendirildi; demo akışı (sunum metni) yazılı; veri buluttaysa son iki koşu bulutta geçti; `dondur --ad K3-2026-11-26` | Demo, K3'te çalışan ekranlarla sınırlanır |
| **K4 Karar** | 1 Aralık, 2. rutin sonrası | DH1–DH7 ✓; sunumu yapacak kişi demo akışını uygulamada baştan sona gezdi (canlı prova); `dondur --ad K4-2026-12-01` | Demo "dondurulmuş" ya da ertelenir |

**K4 kararı üç seçenektir:** *Canlı* — 3 Aralık sabahı iki rutin normal çalışır, sunum o sabah ajanların yaptığını (ve Kasım ay kapanışını) da gösterir; *Dondurulmuş* — 3 Aralık koşuları atlanır, demo K4 kopyası üzerinde yapılır (Kasım henüz kapanmamıştır: S6'nın bütçe etkisi EVM'de değil, ay içi tahmini gerçekleşende görünür); *Ertele*. Karar, kullanıcı tarafından 2. rutin oturumuna `K4: canlı` (ya da `dondurulmuş`, `ertele`) yazılarak verilir; yazılmazsa varsayılan **dondurulmuş**tur.

## Demo günü protokolü

1. 1 Aralık 2. rutin sonunda K4 kopyası alınmıştır (`pilot-data/donmus/K4-2026-12-01/`).
2. *Canlı* kararında 3 Aralık: 1. ve 2. rutin normal çalışır; 2. rutin sonunda `demo-testi`. KALDI ya da kontrol KALDI ise `npm run -s pilot -- geri-yukle --ad K4-2026-12-01` ile geri dönülür ve sunum dondurulmuş yapılır. *Dondurulmuş* kararında 3 Aralık koşuları "Koşu atlandı" der.
3. Sunum: uygulamaya izleyici hesabıyla girilir ("Buluttan Çek"), müdür görünümüyle (`pilot uyeler --izleyici <e-posta>:mudur`). Pilot o gün dosya modundaysa (bulut erişimi yok) uygulama `pilot-data/workspace.json` ile açılır (Admin kimliği › Yedekten yükle) ve kimlik müdür seçilir; MCP aynı dosyaya bağlanır. Demo akışı `demo-testi`nin gezdiği yoldur: Yönetim → Portföy → Ekip ve tahsis › Kapasite–talep → Risk raporu → Haftalık rapor; ardından NEHİR (PY gözüyle).
4. Canlı an: Ahmet'in demo yoklaması sorularından biri, aynı çalışma alanına bağlı Claude'a (MCP) sunumda sorulur; yanıtın rakamları ekrandakilerle aynıdır.
5. Stil, ikon ve Excel kitaplıkları pakete gömülüdür ([BL-08](../docs/pilot/BACKLOG.md)); kurum ağında yalnız Geist yazı tipi (yoksa sistem yazı tipi) ve sekme simgesi dışarıdan gelir. Sunum makinesinde uygulama yine de önceden açılıp denenir.

## Senaryolar (3 Kasım–1 Aralık, tek dalga)

**Tür:** *Anlatı* = Jira ajanı `pilot istek` ve `pilot not` ile üretir. *Simülasyon* = `pilot senaryo` kaydıyla Jira'da ve uygulamada iz bırakır (kayıt komutları aşağıda). 28–29 Ekim bayramı (eski S5) geçmişte kaldı: yeniden kurulum onu arife yarım günüyle üretir.

| # | Veri günü | Senaryo | Tür | Jira ajanı ne üretir | Beklenen tepki | Başarı ölçütü |
|---|---|---|---|---|---|---|
| S7 | 2 Kasım | Ekim ay kapanışı | Simülasyon (mevcut) | Ekim gerçekleşen adam-ayı worklog'dan (yeniden kurulumda). | 3 Kasım: PY'ler gerçekleşeni worklog ile karşılaştırır, sapmayı açıklar; Mert kontrol eder ve 44. haftayı yayınlar. | Fark ±0,1 AA içinde ya da açıklamalı |
| S2 | 2 Kasım sinyal, 4 Kasım olay | PUSULA kapsam değişikliği: çevrimdışı mod | Anlatı | 2 Kasım haftalık koordinasyonda saha ekiplerinin bağlantı şikâyeti (PSL-92'ye atıf; 3 Kasım koşusunda, yeniden kurulumdan sonra). 4 Kasım müşteri görüşmesi notu + `pilot istek --proje PSL --tarih 2026-11-04 --musteri "Kurum B Saha Operasyonları" --baslik "Çevrimdışı mod: bağlantısız veri girişi ve eşitleme" --aciklama "Saha ekipleri kapsama dışı bölgelerde veri giremiyor; Ocak sonuna kadar isteniyor."` Efor tahmini verilmez. | 5 Kasım: Burak isteği değerlendirir, "tahmin" işaretli eforla `oner_istek_karari` (kabul ya da ret, gerekçeli), plan onayda olduğundan revizyon önerir, Ahmet'i bilgilendirir. Ahmet öncelik kararı verir (5 ya da 10 Kasım). | İstek uygulamada karara bağlı; kapsam etkisi 45. hafta raporunda; Ahmet'in kararı rakama dayanır |
| S4 | 5 ya da 12 Kasım (2. rutin) | Haftalık rapor iadesi | Rutin 2 | — | Selin, kılavuzdaki eksik maddeyi (ör. müşteri teslim tarihi) bulduğu raporu `oner_rapor_karari` ile iade eder. PY bir sonraki koşuda karşılar; Mert biçimi denetler. | İade notunun her maddesi karşılanır. İade kendiliğinden olmadıysa zorlanmaz; raporda yazılır. |
| S3 | 9 Kasım duyuru, 16–27 Kasım izin | ATLAS kilit kişi izni: Onur Çelik | Simülasyon | 9 Kasım ATLAS haftalık koordinasyonunda izin duyurusu (not). 16 Kasım'dan itibaren Onur worklog girmez (ATLAS ve KALKAN), üzerindeki işler kayar; uygulamaya izin AA'sı yazılmıştır. | 10 Kasım: Elif riski açar, işi yeniden dağıtır ya da ikame ister. Selin aynı koşuda ya da 12 Kasım'da ikame önerir (Onur zaten 1,2 AA — G2). Plan kilitli olduğundan yalnız gerçekleşen değişir. | Termin kaymaları raporda gerekçeli; plan kilidi korunur |
| S6 | 9–20 Kasım | NEHİR bütçe aşımı: fazla mesai | Simülasyon | NHR ekibinin saati ×1,5 (Jira worklog); yeniden çalışma artar. Triyaj notlarında fazla mesai geçer. | 12 ya da 17 Kasım: Burak `jira_worklog` ve ay içi tahmini gerçekleşenle (`evm_analizi` › `ay_ici_tahmin`) saat artışını görüp erken uyarır, ek bütçe ya da kapsam önerir. Mert maliyet ↔ tahsis tutarlılığını doğrular. 19 ya da 24 Kasım: Ahmet karar verir. | Erken uyarı worklog rakamıyla; öneri somut; Kasım kapanışı (3 Aralık) EVM'de doğrular |
| S1 | 5–10 Kasım sinyal, 11 Kasım olay | NEHİR kritik hata zinciri | Simülasyon | Sinyal: NHR'de yeniden açılmalar artar. 11 Kasım: müşteri ortamında veri kaybı — yeni kayıt [Hata/Highest], NHR-41'e bağlı, Ozan Kılıç'a atanmış; aynı gün triyaj notu. | 12 Kasım: Burak aktarır, gerekçeli risk ve önlem açar, RAG'ı gerekçesiyle değiştirir, Selin'den test kaynağı ister, aynı koşuda gönderdiği 46. hafta raporunda dürüst anlatır. Selin talebi rakamla değerlendirir (B). Ahmet açıklama ister (C). | Risk, RAG ve rapor aynı olguyu aynı rakamlarla anlatır |
| S10 | 16 Kasım duyuru, 23 Kasım–4 Aralık izin | NEHİR kilit kişi izni: Ozan Kılıç | Simülasyon | 16 Kasım NEHİR haftalık koordinasyonunda izin duyurusu (not). 23 Kasım'dan itibaren Ozan worklog girmez; S1 kaydı onun üzerindedir. | 17–19 Kasım: Burak S1 kaydını devreder ya da ikame ister; Selin U340 kaynağını değerlendirir; Ahmet önceliklendirir. | Devir/ikame kararı rakamlı; S1 kaydı izinden önce sahipli |
| S9 | 14–17 Kasım sinyal, 18 Kasım olay | PUSULA kritik hata: eşitlemede mükerrer kayıt | Simülasyon | Sinyal: PSL'de yeniden açılmalar artar. 18 Kasım: yeni kayıt [Hata/Highest], PSL-92'ye bağlı, Ece Polat'a atanmış; aynı gün triyaj notu (S2'deki çevrimdışı modla ilişkisi). | 19 Kasım: Burak iki projede eşzamanlı kriz yönetir — öncelik sırasını gerekçesiyle yazar, Ahmet'e ikisini birlikte anlatır; S2 kararını yeniden değerlendirir. | İki projenin raporu tutarlı; öncelik kararı rakamlı; S2 kapsamıyla ilişki kurulmuş |
| S8 | 19 Kasım | YILDIZ teklifi kazanıldı | Simülasyon | Proje Teklif → Devam (başlangıç 1 Aralık); Aralık ihtiyacı U320 Test Mühendisi 2 × 1,0 AA, U340 1 × 0,5 AA, en az yüklü mühendislere yazılır (denemede U340'ta Aslı Çakır — G1'i büyütür); başlangıçtan önceki teklif planı silinir; olay satırı. | 24 Kasım: Selin kapasite-talebe bakıp kaydırma ya da işe alım önerir, Aslı'nın aşırı yükünü yakalar (B); Ahmet karar verir (C). | Karar kapasite-talep rakamına dayanır |
| S11 | 23 Kasım | ATLAS müşteri isteği: senaryo karşılaştırma görünümü | Anlatı | 23 Kasım müşteri görüşmesi notu + `pilot istek --proje ATL --tarih 2026-11-23 --musteri "Kurum A Strateji Dairesi" --baslik "Karar panosunda iki senaryonun yan yana karşılaştırılması" --aciklama "Yıl sonu bütçe toplantısı için isteniyor; 15 Aralık'a kadar."` | 24 ya da 26 Kasım: Elif `oner_istek_karari` ile karar verir; plan kilidi ve S3 sonrası kapasiteyle ilişkilendirir. | Karar 2 iş günü içinde, eforu ve takvim etkisi gerekçede |
| S12 | K2'de seçilir | Telafi | — | K2'de başarısız kalan senaryonun bir çeşidi (ör. S4 iade yaşanmadıysa yeniden). Seçilmezse yok. | — | — |

## Kayıt komutları (1. rutin, 3 Kasım, yeniden kurulumdan hemen sonra)

`senaryo liste` boşsa bu altı komut **bir kez** çalıştırılır (sonra yeniden çalıştırılmaz; senaryolar `pilot-data/durum.json`'da saklanır ve `gun` ilgili günü üretirken uygulanır). Tarihi geçmiş senaryo reddedilir; o durumda özete yazılır, uydurulmaz.

```bash
npm run -s pilot -- senaryo ekle --id S1 --tur kritik-hata --proje NHR --tarih 2026-11-11 --baslik "Müşteri ortamında veri kaybı: gece yükleme işi kayıtları siliyor" --aciklama "Kurum C ortamında 10 Kasım gece yüklemesinden sonra son 3 günün kayıtları eksik. Geri yükleme yapıldı, kök neden bilinmiyor." --oncelik Highest --tip Hata --atanan "Ozan Kılıç" --bagli NHR-41 --tahmin 24 --hazirlik 6
npm run -s pilot -- senaryo ekle --id S3 --tur izin --kisi "Onur Çelik" --baslangic 2026-11-16 --bitis 2026-11-27 --neden "Yıllık izin"
npm run -s pilot -- senaryo ekle --id S6 --tur fazla-mesai --proje NHR --baslangic 2026-11-09 --bitis 2026-11-20 --carpan 1.5
npm run -s pilot -- senaryo ekle --id S8 --tur teklif-kazanildi --proje YLD --tarih 2026-11-19 --baslangic 2026-12-01 --ihtiyac "U320:2:1.0,U340:1:0.5"
npm run -s pilot -- senaryo ekle --id S9 --tur kritik-hata --proje PSL --tarih 2026-11-18 --baslik "Eşitleme sonrası saha kayıtları çift görünüyor" --aciklama "Bağlantı geri geldiğinde çevrimdışı girilen kayıtlar ikinci kez gönderiliyor; saha ekipleri raporlarda mükerrer kayıt görüyor." --oncelik Highest --tip Hata --atanan "Ece Polat" --bagli PSL-92 --tahmin 20 --hazirlik 4
npm run -s pilot -- senaryo ekle --id S10 --tur izin --kisi "Ozan Kılıç" --baslangic 2026-11-23 --bitis 2026-12-04 --neden "Yıllık izin"
```

Doğrulama (2 Kasım, simülasyon v5, `claude/pilot-veri` verisinin kopyasında): yeniden kurulum 2 Kasım'a kadar üretti (ajanlı dönem 2 Kasım; 44. hafta raporları PYB destek onayında bekliyor), altı komut kabul edildi; 2 Aralık'a kadar üretimde S1 (NHR, 11 Kasım) ve S9 (PSL, 18 Kasım) kayıtları açıldı, S8 19 Kasım'da YILDIZ'ı "Devam"a aldı, izin satırları 16 ve 23 Kasım'da göründü; `kontrol` 30/30 (dosya modu) ve 34/34 (bulut, eski veriyle). Her koşu günü yalnız PY'lerin Jira aktarımı taklit edildi (başka ajan işi yok); sağlık skorları o günün saatiyle ölçüldü:

| Gün | Portföy | NEHİR | PUSULA | KALKAN | ATLAS | YILDIZ |
|---|---|---|---|---|---|---|
| 3 Kasım (K0) | 66 | 43 | 53 | 79 | 87 | teklif |
| 19 Kasım (K2) | 62 | 30 | 59 | 74 | 83 | teklif |
| 1 Aralık (K4) | 63 | 31 | 67 | 58 | 76 | 81 |
| 3 Aralık (demo; Kasım kapandı) | 57 | 20 (SPI 0,78 · CPI 0,78) | 58 | 54 | 72 | 81 |

Kapasite-talepte 3 Aralık'ta 2 rol açığı (2,3 AA). Ajanların işi bu tabloyu değiştirir (risk, söz tutma, rapor, RAG, beklenti girdileri); değişimin yönü ve gerekçesi puanlanır.

## Gömülü bulgular (puanlamada kullanılır; ajanlara söylenmez)

Veride bilerek bırakılmış, gerçek bir birimde de görülen sorunlar. Ajanın bulması "bulgu kalitesi" ve "veriyle tutarlılık" puanına yazılır; koordinatör raporda hangisinin kim tarafından ne zaman bulunduğunu işaretler (K2 ölçütü: en az 3/6). G7 12 Ekim'de ürün düzeltmesiyle (BL-07) kalktı; puanlamada kullanılmaz.

| # | Bulgu | Kim bulmalı | Nerede görünür |
|---|---|---|---|
| G1 | Aslı Çakır NEHİR'de yıl boyu 0,7 AA planlı, efektif kapasitesi 0,5 — NEHİR gecikmesinin yapısal nedenlerinden; S8 Aralık'ta ona 0,5 AA daha yazar | Selin, Burak | `doluluk_analizi`, `kisi_profili` |
| G2 | Onur Çelik ve Deniz Yavuz Nisan'dan beri ATLAS + KALKAN'da 1,2 AA (S3 ile birleşince ATLAS riski) | Selin, Elif | `doluluk_analizi` |
| G3 | Maliyet raporunda maliyetlenemeyen 1 kişi (ünvan ya da oran eksik) | Mert | `maliyet_raporu` |
| G4 | NEHİR algı farkı: RAG "Riskli", kurallara göre "Kritik" | Ahmet, Mert, Selin | `proje_detayi` › `algi_farki` |
| G5 | Burak'ın geçmiş haftalarda iyimser RAG verme eğilimi | Selin, Ahmet | RAG geçmişi, `son_degisiklikler` |
| G6 | YILDIZ teklif planı Kasım'da U320'yi (Hakan Öztürk, Barış Güneş, Merve Aslan) kapasite üstüne çıkarıyor — 19 Kasım'a (S8) kadar; S8 başlangıçtan önceki teklif planını siler | Selin | `doluluk_analizi`, `kapasite_talep` |
| ~~G7~~ | ~~Ay ortasında Ekim CPI'sı şişkin görünüyor~~ — kaldırıldı (12 Ekim): EVM artık gerçekleşeni girilmiş son aya kadar hesaplanır ([BL-07](../docs/pilot/BACKLOG.md)) | — | — |
