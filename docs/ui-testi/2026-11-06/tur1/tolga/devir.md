# Tolga · devir notları · 2026-11-06 (Tur 1, ikinci koşu)

Kök: `/home/user/pmasistance_mks/ui-testi/2026-11-06/tolga/`. Bulgular `bulgular.md` (UI-KRC-18–25), yeniden sınama `regresyon.md`.

## Herkese: hazır bozuk dosyalar ve veri

- **`asiri` veri seti:** Değişmedi: `ui-testi/2026-11-06/veri/asiri/workspace.json` (67 proje, NEHİR'de 620 görev, 200 kişi). `oturum({ veri: 'asiri' })`.
- **Bozuk yedekler:** `tolga/veri/yedek/`. 12 dosya: boş, `null`, `[]`, `{}`, BOM, `__proto__`, çıplak/null görev, `people:null`. Yönetici kimliğiyle Diğer araçlar › Yedekten yükle.
  - `ws-people-null.json`: hâlâ sessiz başarısız.
- **İçe aktarma dosyaları:** `tolga/veri/aktar/`.
  - Uygulamanın kendi dışa aktarımları: `disa-excel-…xlsx`, `disa-jira-…csv`, `disa-msproject-…csv`.
  - Jira CSV türevleri: 3000 satır, noktalı virgül, kapanmayan tırnak, yinelenen anahtar.
  - Çöp `.xlsx`.
- **Ham depo dökümleri:** `tolga/veri/ham-indir-format2.json`, `tolga/veri/ham-indir-alan-bozuk.json`. Kurtarma ekranının "Ham veriyi indir" çıktısı; uygulamaya geri yüklenemiyor (UI-KRC-20).
- **Bozma tarifi:** Depoyu bozup kurtarma ya da hata ekranını açmak için `tolga/betik/02-depo-bozma.mjs` ve `14-hata-ekrani.mjs`.
  - `node …/02-depo-bozma.mjs format-2` → kurtarma ekranı.
  - `node …/14-hata-ekrani.mjs riskler-metin` → "Bu ekran açılamadı" hata ekranı.

## Deniz (`ui-gorsel`), 3 not

1. Yeni ekranları temalarda görüntüle:
   - kurtarma ekranı "Kayıtlı çalışma alanınız açılamadı": `ekran/02-format-2.png`
   - hata ekranı "Bu ekran açılamadı": `ekran/21-c-hata-ekrani.png`
   - sekme ekranları "başka bir sekmede açık / başka bir sekmeye geçti": `ekran/04-b-ikinci-sekme.png`, `ekran/06-sekme-devral.png`

   Üçü de açık zeminli tek kart. Koyu sistem temasında ve Gece ayarında nasıl görünüyor? Kırmızı "Veriyi sil ve baştan başla" düğmesi kapalıyken okunuyor mu?
2. "Veriyi sil ve baştan başla" sonrası uygulama klasik arayüzde ve örnek projeyle açılıyor (`ekran/03-b-sil-sonra.png`). Kullanıcı modern seçmişti.
3. Aşırı veride Kapasite–talep'te 200 karakterlik başlık satırı kabın sağından taşıyor (`ekran/20-asiri-kapasite-talep.png`). "Toplam" artık yapışkan, ama Aralık sütunu onun altında kalıyor.

## Cem (`ui-akis`), 6 not

1. **Yanlış güvence veren metinler:**
   - Sekme devrinde "Çalışmanız kaydedildi" diyor, kaydedilmemiş taslak gidiyor (UI-KRC-19).
   - Klasikte müdüre "… silindi · Geri Al" diyor, hiçbir şey silinmiyor (UI-KRC-23).
   - Kurtarma ekranı "veri bu dosyadan geri kazanılabilir" diyor, uygulama o dosyayı okumuyor (UI-KRC-20).

   Kullanıcı bu üç metni nasıl okur?
2. **Kurtarma/hata ekranı dili:**
   - Site verisi engelliyken "Kayıtlı çalışma alanınız açılamadı… Access is denied" diyor ve silme öneriyor; silinecek kayıt yok.
   - `format:"1"` için "daha yeni bir sürümle kaydedildi" diyor.
   - Hata ekranında "sayfayı yeniden yüklemek çoğu zaman yeter" yazıyor, ama yeniden yükleme aynı ekrana dönüyor (UI-KRC-22).
3. **İçe aktarma beklentisi:** Aynı Excel'i yeniden içe aktaran PY "güncelle" mi bekler, "ekle" mi (UI-KRC-18)? Hata metinleri karışık dilde: "Tasklar içeren", "Issue key".
4. **Rol görünürlüğü:** Klasik arayüzde müdür ve PYB destek "CSV'den Aktar", Sil, Düzenle ve kart durum seçimlerini görüyor. Modernde hiçbiri yok. Rol tasarımına göre klasikte ne görünmeli?
5. **Yedekten yükleme kimliği değiştiriyor:** Yönetici çalışma alanı yedeği yükleyince dosyadaki kişi/rol ("PYB Destek · Mert Aydın") ve arayüz (klasik) etkin oluyor (`ekran/09-ws-gorev-ciplak.png`). Bilinçli mi?
6. **Hangi formlar taslak saklamalı / sormalı?** Yeni risk, Yeni müşteri görüşmesi (8 alan) ve Yeni beklenti sorusuz kapanıyor (UI-KRC-24).

## Ece (`ui-erisim`), 3 not

1. Görev formunda Ctrl+K + tek Esc paleti kapatmakla kalmıyor, formun "silinsin mi?" onayını da tetikliyor. Üst üste pencerede Esc sırası (`konsol/07-gorev-form.json` → `esc.ctrlk-esc`).
2. Esc ile sorusuz kapanan risk, görüşme ve beklenti pencerelerinde odak nereye dönüyor (UI-KRC-24)?
3. Sekme devri ve kurtarma/hata ekranlarında klavye: "Burada kullan", "Kayıtlı verinin silineceğini anlıyorum" onay kutusu, kapalı "Veriyi sil" düğmesinin erişilebilir durumu. Klasikte müdüre görünen ama işlemeyen Sil/Düzenle düğmelerinin adı/durumu (UI-KRC-23).

Toplam 12 devir notu: Deniz 3 · Cem 6 · Ece 3.
