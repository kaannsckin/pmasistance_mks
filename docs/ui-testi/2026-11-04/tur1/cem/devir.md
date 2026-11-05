# Cem · Devir notları · 2026-11-04

Kendi şeridimin dışında kalan, gördüğüm ama derinleşmediğim şeyler. Her not: ne gördüm, nerede, ne bakılmalı.

## Tolga (`ui-kirici`) · 6 not

1. **Başka PY'nin projesinde düzenleme (UI-AKS-02'nin devamı).** Burak, Portföy › Dikkat gerektirenler'den ATLAS/KALKAN'a girip görev ekleyebildi. Aynı yoldan risk ekleme, görev silme/düzenleme, "Planlama"da plan kaydetme, iş paketi değiştirme denensin. Müdür de proje sayfasında "Yeni görev" görüyor (`utils/rbac.test.ts:73` müdürün düzenleyemeyeceğini söylüyor): denensin. Kanıt: `ekran/modern-burak-yetki-02-atlas-eklendi.png`.
2. **"Görevi ekle"ye iki kez basma.** Görev ekleyince hiçbir geri bildirim yok (UI-AKS-05); kullanıcı tekrar basabilir. Çift tıklama / Enter + tıklama ile iki görev oluşuyor mu?
3. **Varsayılan "Sürüm 1" (UI-AKS-01).** Görevi sonradan doğru sürüme taşıyınca "Şu anki sürüm" kartı düzeliyor mu; Excel/CSV/Jira içe aktarmada sürüm boşsa yine 1 mi oluyor; Sürüm 1 silinirse ne oluyor?
4. **Klasik portföy kartında tehlikeli düğmeler.** Proje adının hemen yanında "Projeyi sil" (çöp kutusu) ve PY'nin kendi projesinin "Proje Yön." sahibini açılır listeden değiştirebilmesi. Onay penceresi var mı, PY projeyi başkasına verip kendini kilitleyebiliyor mu? Kanıt: `ekran/klasik-burak-acilis-01.png`.
5. **Yenileme ve taslak kaybı (UI-AKS-13).** Sayfa yenilenince Portföy'e dönülüyor. Haftalık rapor "Kaydedilmedi · Taslak" iken yenileme / geri tuşu / sekmeyi kapatma: yazılan maddeler kayboluyor mu, uyarı çıkıyor mu?
6. **Taşma: Kapasite–talep tablosu.** 1440×900'de "Toplam" sütunu sağda kesik ("Top", "12,", "15"); karar için en önemli sütun. Uzun rol adlarıyla ve aşırı veriyle denensin. Kanıt: `ekran/modern-ahmet-kapasite-03-kt.png`.

## Deniz (`ui-gorsel`) · 6 not

1. **Gece ayarı uygulanmıyor olabilir.** Pilot verisinde `settings.isDarkMode=true`, sistem teması açık; tüm ekranlarım açık temada çizildi (ör. `ekran/modern-burak-acilis-01.png`). Ayar mı yok sayılıyor yoksa "sistemi izle" önceliği mi var? Ayarlar ekranında ne yazıyor?
2. **Klasik "Yeni Görev" penceresinin üstü başlık çubuğunun altında.** Pencere başlığı ve kapat düğmesi görünmüyor; form doğrudan "Görev Adı" ile başlıyor. Kanıt: `ekran/klasik-burak-gorev-03-yeni.png`.
3. **Klasik proje çubuğunda "Zekâ" sekmesi kesik.** Proje seçiliyken "✨ Z" görünüyor, "İş Paketleri" ile çakışıyor. Kanıt: `ekran/klasik-burak-gorev-02-gorevler.png`.
4. **Mor AI düğmesi (klasik) "Bölüm sorumlusuna gönder"ü örtüyor.** Sağ alttaki yüzen düğme gönder düğmesinin sağ ucunun üstünde. Kanıt: `ekran/klasik-burak-haftalik-03-rapor.png`.
5. **Modern "Haftalık durum raporu" penceresinde metin alanı 2 satır.** Raporun yalnız ilk iki satırı görünüyor; klasikte aynı pencere tam metni gösteriyor. Kanıt: `ekran/modern-burak-terim-02-durum-raporu.png` ↔ `ekran/klasik-burak-terim-04-durum-raporu.png`.
6. **Modern "Diğer araçlar" menüsü açılınca sayfa kayıyor.** Tüm sayfa ~70 px yukarı kaydı (logo ve "Portföy" başlığı kesildi); menüde "Yede…" kesik. Klasik Ctrl+K açılınca da arka plan sola kaymış görünüyor. Kanıt: `ekran/modern-ahmet-yonetim-01.png`, `ekran/klasik-burak-yetki-04-ara-atlas.png`.

## Ece (`ui-erisim`) · 3 not

1. **Escape menüleri kapatmıyor.** Proje sayfasındaki "Diğer" ve kenar çubuğundaki "Diğer araçlar" menüsü Escape ile kapanmadı; açıkken kenar çubuğundaki düğmeye tıklama ulaşmadı (menünün örtüsü yakaladı). Klavye ve ekran okuyucu ile denensin. Kanıt: `ekran/modern-ahmet-gizlilik-04-haftalik.png` (menü hâlâ açık), `ekran/modern-ahmet-yonetim-01.png`.
2. **Kayıt geri bildirimi ekran okuyucuya ulaşıyor mu?** Görev eklemede hiç canlı bölge yok (UI-AKS-05); haftalık raporda "Kaydedildi." ve "Bölüm sorumlusuna gönderildi." `role=status`. Ekran okuyucu kullanıcı görev eklendiğini nasıl anlıyor?
3. **Tarih alanı biçimi.** tr-TR yerelinde modern "Termin" alanı "mm/dd/yyyy" gösteriyor; başsız Chromium kaynaklı olabilir. Gerçek tarayıcıda ve klavyeyle tarih girişi denensin. Kanıt: `ekran/modern-burak-gorev-02-yeni.png`.

Toplam: 15 devir notu (Tolga 6, Deniz 6, Ece 3).
