# Ece (ui-erisim) · Devir notları · koşu 2, Tur 1 · 2026-11-06

Kendi şeridimin dışında gördüklerim. Derinleşmedim; her not bir kanıta bağlı.

## Cem (`ui-akis`): iş akışı, dil, rol

1. **Yeni görev formunda "Sorumlu" listesinde yalnız "Atanmadı" var.** Burak (PY) PUSULA'da "Yeni görev"i açınca `combobox "Sorumlu"` tek seçenekli; aynı projenin Liste süzgecinde "Atanan kişi" altında 5 kişi (Barış Güneş, Ece Polat, Harici Danışman, İrem Şen, Kerem Doğan) görünüyor. Görev kişiye atanamıyor olabilir. Kanıt: `betik/k01-aria-gorev-formu.txt` (Sorumlu), `betik/k01-aria-liste.txt` (Atanan kişi).
2. **Hakkında penceresinin içeriği güncel değil.** "Verileriniz sadece sizin tarayıcınızda (Local Storage) saklanır, hiçbir sunucuya gönderilmez" yazıyor; uygulamada Bulut eşitleme var, depo IndexedDB. Pencerenin yarısı "GitHub'da Nasıl Yayınlanır?" adımları. Kanıt: `ekran/modern-light-hakkinda-esc-sonra.png`, `betik/d14-aria-hakkinda.txt`.
3. **Kurtarma ekranında teknik hata metni.** Bozuk depo kaydıyla açılan "Kayıtlı çalışma alanınız açılamadı" ekranında kullanıcıya "(e.people || []).map is not a function" gösteriliyor. Ekranın geri kalanı anlaşılır. Kanıt: `ekran/modern-forced-dark-kurtarma.png`, `betik/d07-sonuc.json` → `kurtarma.metin`.
4. **"Yedek al / yükle" menü öğesi "Profil değiştir" penceresini açıyor.** Öğenin alt yazısı "Yönetici (admin) kimliğiyle"; PY olarak seçince yedekleme yerine profil değiştirme açılıyor (iki kez). Beklenen davranış mı, kullanıcı neden profil penceresine geldiğini anlıyor mu? Kanıt: `betik/d13-sonuc.json` → `digerAraclar["Yedek al / yükle"]`.
5. **Bulut eşitleme gibi eski pencerelerde geri bildirim.** UI-ERS-20 nedeniyle bu pencereler Esc'le kapanmıyor; fareyle kullanan biri için de "kapat" yolu yalnız sağ üstteki × ve karartma.
6. **Tahsis akışı.** "Tahsisi düzenle" kişinin birimine süzüp tabloyu proje proje gösteriyor; seçilen kişiye odak gitmiyor (UI-ERS-23). Ayrıca tablo hücresinde ok tuşu değeri değiştiriyor, değişiklik geri bildirimsiz (UI-ERS-22). "Bu işi gerçekten engelliyor mu?" sorusu sizin alanınız.
7. **Haftalık rapor gönderildikten sonra** görünüm listeye dönüyor; "Bölüm sorumlusuna gönderildi." iletisi ekran okuyucuya güvenilir biçimde ulaşmıyor (UI-ERS-26); gören kullanıcı için iletinin görünür kalma süresine bakılabilir.

## Tolga (`ui-kirici`): uç veri, çökme, hoyrat etkileşim

1. **Üst üste pencere.** Bulut eşitleme penceresi açıkken klavyeyle (Tab) arkadaki "Diğer araçlar"a ulaşıp "Hakkında"yı açtım; iki pencere üst üste kaldı (`ekran/modern-light-diger-araclar-4.png`). Komut paleti açıkken de Tab ile arka plandaki düğmelere ulaşılıyor (UI-ERS-21): palet + başka pencere birleşimleri denenmeli.
2. **Görünmeyen hücreye yazma.** Tahsis tablosunda sabit sütunun altında kalan hücreye yazılan değer (UI-ERS-18) ve ok tuşu/teker kazası (UI-ERS-22) depoya yazılıyor mu, geri alınabiliyor mu?
3. **Hata ekranı tetiklenemedi.** Bozuk görev (`dependencies: 7`, `tags: 5`) ve bozuk risk (`probability: 'x'`) kayıtlarıyla proje açıldı, uygulama düşmedi (`betik/d08-sonuc.json`). ErrorBoundary ekranını üretmenin yolunu bulursanız ben yüksek karşıtlık ve klavyeyle bakarım.
4. **Aşırı veride ısı haritası.** Satır başına tek Tab durağı oldu; 24 kişi için ızgaradan çıkış ~22 Tab ("kişi profili" düğmeleri). Aşırı veride (200 kişi) bu ~200 Tab'a çıkar.

## Deniz (`ui-gorsel`): tema, bölge ayrımı

1. **Risk matrisi renkleri döteranopide hâlâ çakışıyor.** Düzey harfleri (D/O/Y) anlamı taşıyor, ama Düşük ve Yüksek hücreleri açık temada aynı zeytin, koyu temada aynı haki; harfler 11 px ve köşede. Paletin kendisi sizin alanınız. Kanıt: `ekran/modern-light-deuteranopi-risk-matrisi.png`, `ekran/modern-dark-*-deuteranopi-risk-matrisi.png`.
2. **Kenar çubuğunun yapışkan alt bölümü** kaydırılan listenin üstüne biniyor, ayıran gölge/kenar yok (UI-ERS-24); yazı %200'de ve yatay telefonda "Takvim" simgesinin yarısı "Asistan"ın arkasından görünüyor.
3. **Yüksek karşıtlıkta** proje başlığındaki "Yeni görev" ve "Durum özeti" sınırsız, düz yazı gibi; aktif proje öğesi yalnız kalın yazıyla ayrılıyor (ERS-04 kısmen). Kanıt: `ekran/modern-forced-light-kayit-bildirimi.png`, `ekran/modern-forced-dark-proje.png`.
4. **Eski pencereler** (Bulut Senkronizasyonu, Hakkında) modern pencerelerden görsel olarak ayrı bir aileden; Hakkında'nın mavi başlığı ve Bulut'un düz beyaz başlığı modern `Sheet`'le tutarsız. Kanıt: `ekran/modern-light-diger-araclar-4.png`.
