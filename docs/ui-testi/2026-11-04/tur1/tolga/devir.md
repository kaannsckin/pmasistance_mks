# Tolga · devir notları · 2026-11-04 (Tur 1)

## Herkese: `aşırı` veri seti

- **Yol:** `/home/user/pmasistance_mks/ui-testi/2026-11-04/veri/asiri/workspace.json` (kopyası `tolga/veri/asiri/`). Kullanım: `kosu.oturum({ veri: 'asiri', … })`.
- **Üretici:** `tolga/veri/uret.mjs`. Rastgelelik yok; pilot verisini temel alır, personalar (`ahmet`, `burak`, `selin`, `mert`, `elif`) ve sahiplikleri aynen geçerli.
- **İçerik:** 67 proje (5 pilot + 62 uç), 1490 görev, **NEHİR'de 620 görev**, 200 kişi, 7 bölüm (biri 200 karakter adlı, biri sorumlusuz), 387 tahsis (negatif, 0,0001, 12,75 AA; yetim kayıt), 22 görevsiz proje.
  - Uç metinler: 200 karakterlik ad, 80 karakterlik boşluksuz kelime, `İıĞğŞşÇçÖöÜü istanbul İSTANBUL`, emoji, RTL, sıfır genişlikli boşluk, HTML, markdown + `javascript:` bağlantısı, `0`/`-1`/`null`/`undefined` adlı projeler.
  - Uç tarihler: 1900, 1970, 2028-02-29, 2199; proje başlangıcı 1999.
  - NEHİR'de **44. hafta taslak raporu** var: 46 madde, uzun metin, HTML. Burak ile "Önceki hafta"ya geçerek açılır.
  - PUSULA'nın adı 200 karakter ama hâlâ "PUSULA" ile başlıyor.
- **Görünürlük:** burak (PY) 10 proje, ahmet (müdür) 67 proje görür.
- **Boş tahsis:** `/home/user/pmasistance_mks/ui-testi/2026-11-04/tolga/veri/bos-tahsis/workspace.json`. Pilot projeleri var; tahsis, izin, rapor, yayın ve beklenti yok.
- **Bozuk yedek dosyaları:** `tolga/veri/yedek/`. `proje-ciplak.json` beyaz ekran üretir (UI-KRC-06).

## Deniz (`ui-gorsel`)

1. Bozulan ekranları temalarda görüntüle:
   - beyaz ekran: UI-KRC-06, `ekran/21-yedek-proje-ciplak.png`
   - sonsuz yükleme: UI-KRC-08, `ekran/10-tum-depolama-engelli.png`. Modern seçiliyken bile klasik kabukla çiziliyor.
   - uyarısız boş açılış: UI-KRC-01, `ekran/10-format-2-acilis.png`
2. Aşırı veride görsel taşmalar:
   - Pano kartından taşan başlık (UI-KRC-12)
   - şişen filtre seçimleri (UI-KRC-10)
   - klasik üst çubuğun 1440 px'e sığmaması (UI-KRC-11)
3. Gözüme çarpan, şeridim dışındaki iki konu:
   - Pilot verisinde `settings.isDarkMode=true` ama modern ve klasik ekranlar açık temada çiziliyor. Ayar uygulanıyor mu?
   - Tam sayfa görüntüde modern kenar çubuğu zemini 900 px'te bitiyor (`ekran/12-modern-portfoy-tam.png`).
   - Klasik kartlarda `MEDİUM`/`HİGH` yazıyor.

## Cem (`ui-akis`)

1. **Silme onayı:** "Emin misiniz?" hangi görevin silindiğini söylemiyor, geri alma yok. Klasikte çift tık iki görev siliyor (UI-KRC-03). Kullanıcı ne beklerdi?
2. **Haftalık rapor taslağı:** yalnız "Haftalık raporlar" bağlantısı kaydedilmemiş değişikliği soruyor. Kenar çubuğu, yenileme ve geri tuşu sormuyor (UI-KRC-04). Taslağın kendiliğinden kaydedilmesi beklenir mi?
3. **Süre tahmini:** yarım gün girilemiyor; `1,5` → 15 (UI-KRC-05). Kullanıcı ondalığı nasıl yazıyor, birimi gün mü sanıyor?
4. **Dil:**
   - AI hata mesajında "bkz. docs/AI_KURULUM.md" yazıyor.
   - "Görev adı gerekli." daha yazmadan çıkıyor.
   - Format denetimi "İSTANBUL"u kısaltma sayıyor.
   - UI-KRC-01'de veriler sessizce gidiyor, hiçbir mesaj yok.
5. **Tur 2 için:** başarıyla tamamladığın akışların listesini bırak. Görev ekleme ve rapor göndermeyi kötü yoldan tekrar edeceğim; çift tık ve yeniden gönderme zaten dayanıyor.

## Ece (`ui-erisim`)

1. **Esc tutarsız:**
   - Modern formda tek Esc, Ctrl+K paletiyle birlikte alttaki formu da kapatıyor ve yazılanı siliyor (UI-KRC-09).
   - Klasik görev penceresi Esc ile hiç kapanmıyor.
   - Modern "Diğer" menüsü (proje sekmeleri) Esc'ten sonra açık kalıyor (5 menü öğesi).
   - Odak nereye dönüyor?
2. **Klasik üst çubuk:** 1440 px'te bile sığmıyor (UI-KRC-11). 1280 px ve %200 yakınlaştırmada ölç.
3. **Filtre seçimleri:** uzun adla 1222 px'e şişiyor (UI-KRC-10); dar ekranda etkisine bak.
4. **Tarayıcı geri tuşu:** uygulamadan çıkarıyor, gezinme geçmişi yok (UI-KRC-04'ün bir yolu).
5. **Sahada telefondan kullanım:** uygulama çevrimdışı açılmıyor (UI-KRC-07).
