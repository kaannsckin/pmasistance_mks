# Deniz (ui-gorsel) · Devir notları · 2026-11-06 · Tur 1

Gördüğüm ama şeridim dışında kalanlar. Yollar `ui-testi/2026-11-06/deniz/` dizinine göredir.

## Cem (`ui-akis`)

1. **Ayarlar'da üç seçim üç farklı davranıyor (UI-GRS-28).** Arayüz kartı anında uygulanıyor ("Seçim hemen uygulanır"). Görünüm (Sistem/Gündüz/Gece) ve renk teması yalnız "Değişiklikleri Uygula"dan sonra uygulanıyor. Kullanıcı "Gece"ye basıp × ile kapatırsa ayarın bozuk olduğunu sanabilir. Kanıt: `ekran/modern-acik-gecetiklandi-classic-ayarlar.png`.
2. **Kurtarma ekranında ham hata metni.** `people=null` bozulmasında açıklamanın altında `(e.allocations || []).map is not a function` yazıyor. Depo engelliyken monospace İngilizce `Access is denied for this document.` görünüyor. Kullanıcı ne yapacağını bu satırlardan anlayamaz. Kanıt: `ekran/modern-koyu-gece-classic-bozuk-people-null.png`, `ekran/modern-koyu-sistem-classic-bozuk-depo-engelli.png`.
3. **Klasik arayüzde bulunabilirlik (UI-GRS-22, UI-GRS-16).** 1440 px'te üst gezinmede Görüşmeler, Beklentiler ve Veri Havuzu görünmüyor. PY rolüyle uzun adlı projede "Zekâ" sekmesi hâlâ "Zek" diye kesik (14 px çakışma). Bu bölümler gerçek bir işte nasıl bulunuyor?

## Tolga (`ui-kirici`)

1. **Bozuk proje kaydı boş proje gibi görünüyor.** `project:prj-nehir` içinde `tasks: 'bozuk'` olunca uygulama çökmüyor ve kurtarma ekranı da açmıyor. Liste "Bu projede henüz görev yok" diyor, kenar çubuğundaki görev sayısı kayboluyor. Bu görünüm dört koşulda da aynı (modern açık/koyu, mor, klasik koyu). Kullanıcı verisinin silindiğini sanabilir. Görev yazınca bozuk kayıt sessizce üzerine mi yazılıyor? Kanıt: `ekran/modern-koyu-gece-emerald-hata-bozuk-proje.png`, `ekran/classic-koyu-gece-classic-hata-bozuk-proje.png`; `olcum/08-durum-ekranlari.json` → `*-hata-bozuk-proje`.

## Ece (`ui-erisim`)

1. **Escape menüleri ve klasik pencereleri kapatmıyor.** Modern Yönetim › Raporlar ve Tahsis › Araçlar menüleri iki Escape'ten sonra da açık. Saydam tıklama katmanı (`div.fixed.inset-0`) kalıyor ve sayfadaki tıklamaları yutuyor; betikte 4/4 kez görüldü. Klasikte "İş Paketi Yönetimi" ve "Yeni Görev Ekle" pencereleri de Escape ile kapanmadı. Kanıt: `olcum/03-yonetim-tahsis.json` → `escMenuKalan: 4`, `olcum/05-klasik-*.json` → `escKalanModal`.
2. **Renk körlüğü (UI-GRS-24, UI-GRS-08 kalan kısmı, UI-GRS-20).** Şu üç görsel protanopi ve döteranopi süzgeçlerinde denenmeli:
   - Zümrüt temasında "tamamlandı" ve "süreçte" dilimleri
   - koyu Tahsis ısı haritasında aşırı ve normal hücreler (parlaklık oranı 1,25:1, ikinci ipucu yok)
   - klasik risk matrisinde yeşil/sarı hücreler
3. **Yakınlaştırma ve koyu mod pencere sınırı.** Bakılacaklar:
   - klasik Pano/Ekip'teki 7–9 px yazılar %200'de okunuyor mu (UI-GRS-23)
   - koyu modda kenarsız Ctrl+K paleti ve ekran rehberinin sınırı yakınlaştırmada seçiliyor mu (UI-GRS-05 kalan kısmı)
