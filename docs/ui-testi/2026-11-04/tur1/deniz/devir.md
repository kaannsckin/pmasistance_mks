# Deniz · Devir notları · Tur 1 · 2026-11-04

Kendi şeridim dışında gördüklerim. Derinleşmedim; tek gözlem ve kanıtla bırakıyorum.

## Tolga (`ui-kirici`): 4 not

1. **Boş veri setinde arayüz ve rol seçimi uygulanmıyor.** `veri: 'bos'`, `arayuz: 'modern'`, `persona: 'ahmet'` (müdür) ile açılan oturum klasik arayüzde açıldı. Üst çubukta "Proje Yöneticisi · kişi seçilmedi" ve "Kapsam için kişi seçilmeli" uyarısı var. Boş çalışma alanında `settings`, `currentRole` ve `currentPersonId` yüklenirken ezilmiş olabilir. Ortam mı uygulama mı, bilmiyorum. Kanıt: `ekran/modern-koyu-gece-classic-bos-portfoy.png`, `ekran/modern-acik-gunduz-classic-bos-tahsis.png`. Dosya adlarında "modern" yazıyor ama görüntü klasik arayüz. Koşul: iki sistem temasında da aynı.
2. **Klasik üst çubuk 1440 px'e sığmıyor.** Sağdaki kullanıcı ve Ayarlar düğmeleri ekranın dışında kalıyor. Ayarlar'a basınca sayfa yatayda ~150 px kayıyor (arkadaki logo "lanAsistan" diye kesiliyor). Kanıt: `ekran/classic-acik-gecetiklandi-classic-ayarlar.png` (arka plan), `ekran/classic-acik-gunduz-classic-acilis.png` (sağ kenar). Ece'nin dar ekran şeridiyle de kesişiyor.
3. **Kırpılmalar:** Zaman çizelgesindeki sürüm çipleri "Sürü…" diye kırpılmış ve hiçbir sürümün adı okunmuyor (`ekran/modern-koyu-gece-classic-proje-zaman-cizelgesi.png`). Kapasite–talep tablosunun sağdaki "Top…" sütunu kesik (`ekran/modern-koyu-gece-classic-tahsis-kapasite-talep.png`). Durum raporu metin kutusu 45 px'e sıkışıyor (bkz. UI-GRS-10).
4. **Klasik arayüzde sağ alttaki mor yapay zekâ düğmesi içeriğin üstüne biniyor.** Riskler listesindeki "Açık" rozetlerini ve Pano'daki "Ekip 7 üye" rozetini örtüyor. Kanıt: `ekran/classic-koyu-gunduz-classic-genel.png` (sağ alt), `ekran/classic-koyu-gece-classic-genel.png`.

## Ece (`ui-erisim`): 3 not

1. **Escape açılır menüleri kapatmıyor.** Yönetim › Raporlar ve Tahsis › Araçlar menüleri iki kez Escape'e basıldıktan sonra da açık kalıyor (ölçüm: `menuEscSonra: true`). Menü açıkken görünmez bir katman diğer bütün tıklamaları yutuyor. Kanıt: `betik/olcum-ikincil-koyu.json`, `ekran/modern-koyu-gece-classic-yonetim-raporlar-menu.png`.
2. **Renk körlüğü derinliği:** UI-GRS-08'deki ısı haritası (kırmızı ↔ mavi) ve risk matrisi (turuncu ↔ yeşil ↔ bordo) koyu modda gri tonlamada ayrılmıyor. Protanopi ve deuteranopi süzgeçleriyle doğrulanmalı. UI-GRS-03'teki Orta/Düşük rozetleri ve UI-GRS-02'deki zümrüt düğme de aynı denetime girmeli.
3. **Koyu moddaki pencerelerde odak ve sınır:** UI-GRS-05'teki pencerelerin sınırı görünmüyor. Klavyeyle açıldığında odağın pencereye geçip geçmediğine ve %200 yakınlaştırmada pencerenin nerede bittiğinin anlaşılıp anlaşılmadığına bakılmalı.

## Cem (`ui-akis`): 4 not

1. **Rol görünürlüğü:** PY Burak Demir'in Portföy'ünde "Dikkat gerektirenler" listesi, onun olmayan ATLAS ve KALKAN projelerinin satırlarını da gösteriyor ("Tümünü göster (11)"). Proje listesinde ise yalnız PUSULA ve NEHİR var. İki kez üretildi. Kanıt: `ekran/modern-koyu-gece-classic-portfoy-py-burak.png`, `betik/15-burak-portfoy.mjs`. Aynı ekrandaki "Geciken görevler 50" ve "Dikkat isteyen proje 2" kartları ise yalnız onun projelerini sayıyor gibi görünüyor; liste ile kartlar birbirini tutmuyor.
2. **Ad tutarsızlıkları:** kenar çubuğunda "Ekip ve tahsis", Ctrl+K paletinde ve klasikte "İşgücü Tahsisi"; "Beklentiler" ↔ "Yönetimden beklentiler"; "Yönetim" ↔ Ayrıntılı analizde "Yönetim Ekranı"; "Risk raporu" ↔ klasikte "Riskler". Kanıt: `ekran/modern-koyu-gece-classic-ara-paleti.png`, `ekran/modern-koyu-gece-classic-yonetim-ayrintili.png`.
3. **Gece/Gündüz düğmesinin anlamı (UI-GRS-01):** Kullanıcı bu düğmeye basınca ne bekliyor? Düğme hiçbir şey yapmıyor ve koyu sistemde "GÜNDÜZ MODU" yazıyor. Kaldırılmalı mı, yoksa sistem tercihini ezmeli mi?
4. **Klasik ↔ modern geçişi (UI-GRS-12, UI-GRS-07):** Klasikte modern "siyah ada", modernde klasik "lacivert ada" var. Bilinçli bir geçiş tasarımı mı? Ayrıca Durum raporu penceresinde (UI-GRS-10) raporu gözden geçirip paylaşma işi bu hâlde yapılabiliyor mu?
