# Ece → devir notları · Tur 1 · 2026-11-04

Şeridimin dışında gördüklerim. Derinleşmedim; kanıt yolları `ui-testi/2026-11-04/ece/` altına göre.

## Cem (ui-akis): 3 not

1. **Yeni görevin varsayılan sürümü geçmiş bir sürüm; ekleyince "Şu anki sürüm" kartı geriye atlıyor.** PUSULA'da "Yeni görev" formu "Sürüm" alanını "Sürüm 1" (1–21 Oca) ile açıyor. Yalnız ad yazıp "Görevi ekle" dedim; Genel bakış'taki "Şu anki sürüm" kartı "Sürüm 13 · 17 Kas başlıyor · 19 görev"den "Sürüm 1 · 287 gün geride · 1 görev"e döndü. Rakam ve akış mantığı senin alanın: varsayılan sürüm doğru mu, kart neden geçmiş sürümü "şu anki" sayıyor? Kanıt: `ekran/modern-light-gorev-formu.png` (Sürüm 1 seçili), `ekran/modern-light-proje-pusula.png` (önce), `ekran/modern-light-gorev-ekle-sonra.png` (sonra).
2. **İşlemlerden sonra görsel geri bildirim yok.** Görev ekleme, Ayarlar'da "Değişiklikleri Uygula" ve Pano'da kart taşıma sonrası ekranda "Kaydedildi/Eklendi" türü hiçbir ileti çıkmıyor (ekran okuyucu tarafı UI-ERS-09). "Kaydedildi mi?" sorusunu sen de sorarsın. Kanıt: `ekran/modern-light-gorev-ekle-sonra.png`, `ekran/modern-light-ayarlar-uygula-sonra.png`, `ekran/modern-light-pano-surecte-sonra.png`.
3. **Yalnız klavyeyle gerçek iş.** UI-ERS-01 (Ayarlar), UI-ERS-06 (odak kaybı: her pencereden sonra 20 Tab) ve UI-ERS-02/08 (1024 px altında çekmece) bulgularını "bu işi gerçekten engelliyor mu?" diye bir işle dene: ör. "PUSULA'ya iki görev ekle, birini Süreçte'ye taşı" ya da "temayı Zümrüt yap".

## Deniz (ui-gorsel): 4 not

1. **Uygulamanın Gece modu, sistem teması açıkken modern arayüze yansımıyor.** `gece: true`, sistem açık: `<html class="dark">` var ama `--m-bg #F2F2F7`, `--m-surface #FFFFFF`; ekran tamamen açık. Ayar kaydediliyor, uygulanmıyor gibi. Tema matrisi senin alanın. Kanıt: `ekran/modern-light-gece-portfoy.png`, `betik/b19-sonuc.json` → `kok`.
2. **"Diğer araçlar" menüsünde "Yedek al / yükle" "Yede…" diye kırpılıyor** ("Admin kimliğiyle" eki yer kaplıyor). Kanıt: `ekran/modern-reduce-diger-araclar.png`.
3. **Risk paleti renk körlüğüne dayanıklı değil** (UI-ERS-05): döteranopide Düşük `#1F7A35` ile Yüksek kırmızısı aynı zeytin tonu. Marka uyumlu yeni palet ya da desen senin kararın. Ayrıca koyu temada doluluk hücreleri beyaz/`#3D7CC9` 4,26:1 (kısa not).
4. **Yüksek karşıtlık (forced-colors) modunda görsel hiyerarşi düzleşiyor** (UI-ERS-04): aktif menü, segment seçimi, pencere çerçevesi, ilerleme çubukları kayboluyor. Yazı boyutlarında px/rem karışımı (UI-ERS-13) da tasarım tutarlılığına dokunuyor.

## Tolga (ui-kirici): 4 not

1. **Pencere açıkken arka plan klavyeyle kullanılabiliyor** (UI-ERS-01, UI-ERS-07). Ayarlar açıkken Tab ile arkadaki "Yeni proje"ye, "Yeni görev" açıkken arkadaki düğmelere ulaşılıyor. Enter'la ikinci pencere açmayı, iki pencereden aynı anda kaydetmeyi dene (çift kayıt, üst üste pencere).
2. **Komut paleti Ayarlar penceresinin üstünde açılıyor ve Ayarlar Esc ile kapanmıyor.** Paletten başka bir ekrana geçince Ayarlar açık kalıyor mu, kaydedilmemiş değişiklik ne oluyor? Kanıt: `ekran/modern-light-komut-paleti-neh.png`.
3. **Doluluk ısı haritası her hücre için ayrı düğme** (pilotta 312). Aşırı veride (yüzlerce kişi) Tab sayısı, çizim süresi ve kaydırma davranışı (UI-ERS-11).
4. **Logo "hiper sürüş"** (hareket normalken 7 hızlı tık: tam ekran perde, yıldızlar, şok halkası, "Hiper sürüş!" iletisi). Ard arda tıklamada birikiyor mu, iletiler üst üste biniyor mu? Kanıt: `ekran/modern-no-preference-logo-7tik.png`.
