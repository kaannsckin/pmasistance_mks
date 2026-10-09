# Pilot senaryo takvimi (v2, 10 Ekim 2026)

> **Yalnız Jira ajanı (1. rutin) ve test koordinatörü (2. rutin) okur.** Rol ajanlarına verilmez: ajanlar ne olacağını önceden bilmez; olay gerçekleşmeden tepki vermek −10 puandır.

Koşular Salı ve Perşembe. Jira ajanı her koşuda son koşudan bu yana geçen günleri üretir; rol ajanları aynı sabah tepki verir. Senaryo, **veri günü** penceresi o koşuya düştüğünde üretilir.

| Koşu | Jira ajanının ürettiği günler | Rol ajanlarının penceresi |
|---|---|---|
| 15 Ekim Per | 9–14 Ekim | 9–14 Ekim |
| 20 Ekim Sal | 15–19 Ekim | 15–19 Ekim |
| 22 Ekim Per | 20–21 Ekim | 20–21 Ekim |
| 27 Ekim Sal | 22–26 Ekim | 22–26 Ekim |
| 29 Ekim Per | 27–28 Ekim (rol ajanları tatil) | — |
| 3 Kasım Sal | 29 Ekim–2 Kasım | 27 Ekim–2 Kasım |
| 5 Kasım Per | 3–4 Kasım | 3–4 Kasım |
| 10 ve 12 Kasım | prova (yeni senaryo yok) | — |

**Tür:** *Anlatı* = Jira ajanı bugünkü komutlarla üretir (`pilot istek`, `pilot not`). *Simülasyon* = Jira'da ve uygulamada iz bırakır; `pilot senaryo` komutu olmadan **üretilmez** (aşağıda geliştirme notu).

## Senaryolar

| # | Veri günü | Senaryo | Tür | Jira ajanı ne üretir | Beklenen tepki | Başarı ölçütü |
|---|---|---|---|---|---|---|
| S2 | 12 Ekim sinyal, 14 Ekim olay | PUSULA kapsam değişikliği: çevrimdışı mod | Anlatı | 12 Ekim haftalık koordinasyonda saha ekiplerinin bağlantı şikâyeti (PSL-92'ye atıf). 14 Ekim müşteri görüşmesi notu + `pilot istek --proje PSL --tarih 2026-10-14 --musteri "Kurum B Saha Operasyonları" --baslik "Çevrimdışı mod: bağlantısız veri girişi ve eşitleme" --aciklama "Saha ekipleri kapsama dışı bölgelerde veri giremiyor; Aralık sonuna kadar isteniyor."` Efor tahmini verilmez. | 15 Ekim: Burak isteği değerlendirir, "tahmin" işaretli efor verir, plan onayda olduğundan revizyon önerir, müşteriye yanıtlar, Ahmet'i bilgilendirir. Ahmet öncelik kararı verir (15 ya da 20 Ekim). | İsteğin kararı yazılı; kapsam etkisi 15 Ekim raporunda; Ahmet'in kararı rakama dayanır |
| S1 | 15–19 Ekim sinyal, 21 Ekim olay | NEHİR kritik hata zinciri | Simülasyon | Sinyal: NHR'de yeniden açılmalar artar (simülasyon). 21 Ekim: müşteri ortamında veri kaybı — yeni kayıt [Hata/Highest], NHR-41'e bağlı; aynı gün triyaj notu. | 22 Ekim: Burak aktarır, gerekçeli risk ve önlem açar, RAG'ı gerekçesiyle değiştirir, Selin'den test kaynağı ister, Perşembe raporunda dürüst anlatır. Selin talebi rakamla değerlendirir (B). Ahmet açıklama ister (C). | Risk, RAG ve rapor aynı olguyu aynı rakamlarla anlatır |
| S4 | 22 Ekim (2. rutin) | Haftalık rapor iadesi | Rutin 2 | — | Selin, kılavuzdaki eksik maddeyi (ör. müşteri teslim tarihi) bulduğu raporu iade eder. Burak 27 Ekim'de karşılar; Mert biçimi denetler. | İade notunun her maddesi karşılanır. İade kendiliğinden olmadıysa zorlanmaz; raporda yazılır. |
| S3 | 19 Ekim duyuru, 26 Ekim–6 Kasım izin | ATLAS kilit kişi izni: Onur Çelik | Simülasyon | 19 Ekim ATLAS haftalık koordinasyonunda izin duyurusu. 26 Ekim'den itibaren Onur worklog girmez, üzerindeki işler kayar. | 20 Ekim: Elif riski açar, işi yeniden dağıtır ya da ikame ister. 22 Ekim: Selin ikame önerir. Plan kilitli olduğundan yalnız gerçekleşen değişir. | Termin kaymaları raporda gerekçeli; plan kilidi korunur |
| S5 | 28 Ekim arife, 29 Ekim tatil | Bayram haftası | Takvim | Tatilde worklog ve not yok (simülasyon 29 Ekim'i tatil sayar; 28 Ekim yarım gün henüz modellenmedi). | 27 Ekim: PY'ler raporun son gününün tatile denk geldiğini görüp raporu bu koşuda gönderir. Mert geciken raporu izler. | Tatile kayıt girilmez; rapor 27 Ekim'de gönderilir |
| S6 | 19–30 Ekim | NEHİR bütçe aşımı: fazla mesai | Simülasyon | NHR ekibinin saati ×1,5 (Jira worklog); Ekim gerçekleşeni ay kapanışında planın üstünde çıkar. Triyaj notlarında fazla mesai geçer. | 27 Ekim: Burak `jira_worklog` ile saat artışını görüp erken uyarır. 3 Kasım: EVM ile sapmayı açıklar, ek bütçe ya da kapsam önerir. Mert maliyet ↔ tahsis tutarlılığını doğrular. 5 Kasım: Ahmet karar verir. | Erken uyarı worklog rakamıyla; kesin sapma EVM aracından; öneri somut |
| S7 | 2 Kasım | Ay kapanışı | Simülasyon (mevcut) | Ekim gerçekleşen adam-ayı worklog'dan. | 3 Kasım: PY'ler gerçekleşeni worklog ile karşılaştırır, sapmayı açıklar; Mert kontrol eder. | Fark ±0,1 AA içinde ya da açıklamalı |
| S8 | 4 Kasım | YILDIZ teklifi kazanıldı | Simülasyon | Proje Teklif → Devam (başlangıç 1 Aralık); Kasım–Aralık ihtiyacı U320 Test Mühendisi 2 × 1,0 AA, U340 Veri Mühendisi 1 × 0,5 AA; boş YLD Jira projesi. | 5 Kasım: Selin kapasite-talebe bakıp kaydırma ya da işe alım önerir (B); Ahmet karar verir (C). | Karar kapasite-talep rakamına dayanır |

## Simülasyon desteği (geliştirme notu)

S1, S3, S6 ve S8 için simülasyona deterministik bir senaryo dosyası gerekir: `npm run -s pilot -- senaryo ekle …` kaydı `pilot-data/senaryolar.json`'a yazar, `gun` ilgili günü üretirken uygular. Gerekenler:

| Tür | Etki |
|---|---|
| `kritik-hata` | Belirli günde belirli projeye yeni Jira kaydı (tür, öncelik, atanan, bağlı kayıt); isteğe bağlı olarak önceki günlerde yeniden açılma olasılığını artırır |
| `izin` | Kişi tarih aralığında worklog girmez; uygulamaya aylık izin AA'sı yazılır; işleri ekipte başkasına geçmez (kayar) |
| `fazla-mesai` | Proje ekibinin saatini tarih aralığında çarpanla artırır; ay kapanışında gerçekleşen AA'ya yansır |
| `teklif-kazanildi` | Proje durumunu değiştirir, başlangıç tarihini ve rol bazında plan ihtiyacını yazar, boş Jira projesi açar |

Komut gelene kadar bu dört senaryo ertelenir; takvim, komutun geldiği tarihe göre koordinatörce kaydırılır.
