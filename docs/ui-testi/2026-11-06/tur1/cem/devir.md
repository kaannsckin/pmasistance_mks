# Cem (ui-akis) · Devir notları · 2026-11-06

Toplam 12 not: Tolga 6 · Deniz 3 · Ece 3. Her notta ilgili bulgu ve başlangıç ekranı var.

## Tolga (ui-kirici)

1. **Ondalık giriş (UI-AKS-20, K1 adayı).** Tahsis hücresine "0,5" yazınca 5 AA, "1,25" yazınca 125 AA kaydediliyor; `max=1.5` uygulanmıyor. Şunları dene: klasik Ekip ve tahsis, "Gerçekleşen" modu, Veri havuzu › "Kullanılabilir AA / ay", Ekip › Kişi ekle › "Bu ayki katılım", "0,5"i kopyalayıp yapıştırma, eksi değer, 1,5 üstü değer. Ayrıca Ekip ve tahsis şeridindeki "kişi-ay" sayısının bu hatayla nasıl şiştiğine bak.
2. **Plan onayı (UI-AKS-21).** "Reddet" ve "Onayla & Kilitle" soru sormadan çalışıyor. Çift tıklamayı dene. Yanlışlıkla "Onayla & Kilitle"ye basınca geri dönüş yolu "Kilidi Aç" → plan "Taslak"a düşüyor; bu sırada kim neyi görüyor? Reddedilen planın "henüz onaya gönderilmedi" diye görünmesi veri tarafında da ayırt edilemiyor mu (`planLocks` yalnız `decidedAt`/`decidedByRole` taşıyor)?
3. **Klasik silme (UI-AKS-22).** Mert'te ve Ahmet'te "Sil" "… silindi" diyor ama silmiyor. Bildirimdeki "Geri al"a basınca ne oluyor? Mert'in klasik Portföy'deki "Projeyi sil" düğmesi ve "Proje Yön." seçicisi gerçekten yazıyor mu? Kart durum seçicisinin sessizce geri dönmesini hızlı ardışık değişikliklerle dene.
4. **Mert'te sessiz yazma düğmeleri (UI-AKS-23).** "Kişi ekle" dışında Mert'te görünüp sessizce düşen başka düğme var mı: Ekip › "İçe aktar", Adam/ay planı hücreleri, Hedefler, İş paketleri, Müşteri istekleri, Proje bilgileri › Durum.
5. **Excel içe aktarma (UI-AKS-25).** Başarı mesajı içeriğe bakmıyor. Bozuk/boş dosya, yalnız "Personel Listesi" başlığı olan dosya, aynı sicille iki satır, bilinmeyen bölüm kodu ve tahsis sayfası olan dosyanın mevcut planı ezip ezmediğini dene. Doğru sayfa adı: "Personel Listesi" (`utils/poolImporter.ts:86`).
6. **Kilitli plana satır (UI-AKS-28).** "Onay Bekliyor" ve "Kilitli" planlarda "Yeni Satır › Ekle" alanı etkin görünüyor. Satır ekleniyor mu, eklenirse kilit ne oluyor?

## Deniz (ui-gorsel)

1. **Klasik üst menü taşması (UI-AKS-24).** 1440 px'te "Görüşmeler", "Beklentiler", "Veri Havuzu" ve proje çubuğunda "Zekâ" kırpılıyor; kenarda yarım bir simge kalıyor, kaydırılabildiğine dair bir işaret yok. Renk temaları ve koyu temada taşma göstergesine bak.
2. **Pasifliği görünmeyen düğmeler (UI-AKS-23).** Mert'in Portföy › Proje bilgileri penceresinde Gidişat düğmeleri (Belirtilmedi/Yolunda/Riskli/Kritik) etkinmiş gibi çiziliyor ama tıklanmıyor. "Durum" seçicisi ise soluk. Pasif durumun görsel dili tutarsız.
3. **Modern içinde klasik "ada".** Modern Ekip ve tahsis › Tahsis tablosu, klasik bileşenle (Başlık Düzeni, küçük yazı, farklı düğme stili) çiziliyor (UI-AKS-30). Ahmet'in kenar çubuğunda YILDIZ projesi "Asistan" satırının altında yarım kalıyor (`ekran/modern-ahmet-portfoy-01.png`).

## Ece (ui-erisim)

1. **Diğer menüsü (UI-AKS-27).** Esc menüyü kapatmıyor; dışarıya ilk tıklama yutuluyor. Klavyeyle menüden çıkınca odak nereye gidiyor? Aynı örtü kalıbı Liste › "İçe / dışa aktar", Ekip ve tahsis › "Araçlar" ve rapordaki "Madde ekle" menüsünde de var.
2. **Klasik menü taşması (UI-AKS-24).** Kırpık "Veri Havuzu"na Tab ile gidince görünür hâle kayıyor mu? Ayrıca 1280 ve 1024 px'te ve %200 yakınlaştırmada kaç öğe kayboluyor?
3. **Telefonda rapor maddesi (UI-AKS-17'nin kalanı) ve sessiz kayıtlar (UI-AKS-29).** Metin kutusu 70 px, içerik 133 px; alttaki "Bölüm sorumlusuna gönder" şeridi kutunun üstüne biniyor (`ekran/mobil-burak-rapor-01-madde.png`). Ayrıca Onaya Gönder / Onayla & Kilitle / Reddet / Proje bilgileri kayıtları canlı bölgede hiçbir şey okutmuyor.
