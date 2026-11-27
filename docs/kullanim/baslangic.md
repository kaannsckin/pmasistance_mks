# İlk oturum ve roller

[← Kılavuz](README.md) · [Görevden teslim planına →](proje-planlama.md)

## Uygulama içinden kılavuzu açın

Sol üstteki PlanAsistan roketine tıklayın. Kitapta içindekilerden bölüm seçebilir ve ekran görüntüsüne tıklayarak ayrıntılarını büyütebilirsiniz. **Sürüm notları** bölümündeki listeden incelemek istediğiniz sürümü seçin.

## Çalışma alanını açın

- Kurumunuzun kullandığı PlanAsistan adresini tarayıcıda açın. Bulut kurulumu varsa hesabınızla giriş yapın ve üyeliğiniz olan çalışma alanını seçin. Bulut ayarları için çalışma alanı yöneticinizden bağlantı bilgilerini alın. [Bulut kurulumu](../../supabase/KURULUM.md)
- Yerel kullanımda uygulamayı tarayıcıda açın. Windows paketi ve kaynaktan çalıştırma yolları depo README’sinde yer alır. [Çalıştırma seçenekleri](../../README.md#-bilgisayarda-çalıştırma-exe)
- Bu kılavuzdaki sekmeleri izlemek için arayüz tercihinizin **Modern** olduğundan emin olun. Sol menünün dar görünümünde ekran adlarını simgelerin üzerine gelerek okuyabilirsiniz.
- **Portföy**’de doğru projeyi açın. Proje adını, kodunu ve sahibi olan proje yöneticisini proje başlığından kontrol edin.

## Rolünüze göre başlangıç noktası

| Rol | Başlangıç ekranı | Olağan işlem |
| --- | --- | --- |
| Proje yöneticisi (PY) | Portföy → proje | Kendi projesinin görevleri, planı, riskleri ve raporu |
| Bölüm sorumlusu | Ekip ve tahsis / Haftalık rapor | Bölüm doluluğu, gerçekleşen efor ve içerik incelemesi |
| PYB Destek | Veri havuzu / Haftalık rapor | Referans verileri, biçim incelemesi ve hafta yayını |
| PYB Sorumlusu | Yönetim / Portföy | Portföy incelemesi, plan onayı ve PMO puanı |
| Müdür | Yönetim | Sağlık, kapasite, yönetimden beklenen kararlar ve yayımlanmış rapor |
| Admin | Yönetici konsolu | Rol yetkileri, görünüm, yapay zekâ ve veri yönetimi |

Tablo varsayılan sorumlulukları özetler. Bir sekme yoksa çalışma alanı üyeliğinizi, etkin rolünüzü ve proje sahipliğini kontrol edin. Yönetici rolleri proje yöneticisinin özel günlük ve istek ekranlarına erişemez.

## Ekranları tanıyın

- **Sol menü** Portföy, Ekip ve tahsis, Takvim, Risk raporu, Haftalık rapor, Görüşmeler, Beklentiler ve Veri havuzu gibi çalışma alanı ekranlarına götürür.
- **Proje sekmeleri** aynı projenin Dashboard, Genel bakış, Pano, Liste, Zaman çizelgesi, Planlama, Whiteboard, Riskler ve Ekip görünümlerini açar. **Diğer** menüsünde rolünüze göre hedefler, müşteri istekleri, günlük ve iş paketleri bulunur.
- **Görev kodu** (örneğin `NHR-123`) görev ayrıntısını açar. Görünümü değiştirseniz de aynı koddan aynı kayda ulaşabilirsiniz.
- **Veri havuzu** kişi, bölüm, rol ve ünvanların ortak referansıdır. Tahsis girmeden önce kişinin ve rolün havuzda bulunduğunu doğrulayın.

## İlk gün kontrolü

1. Doğru çalışma alanını ve rolü seçin.
2. Portföy’den projenizi açın, sahipliği ve haftalık durumunu gözden geçirin.
3. **Liste**’de bir görev kodunu açın. Atananı, durumu, varsa Jira anahtarını ve termini kontrol edin.
4. **Ekip ve tahsis**’te doğru yılı, **Haftalık rapor**’da doğru haftayı seçin.
5. Çalışma alanı cihazda tutuluyorsa ve yedekleme yetkiniz varsa güncel JSON yedeği alın. Bulut kullanıyorsanız senkronizasyon durumunu kontrol edin.

## Sık karşılaşılan durumlar

| Durum | Kontrol edilecek yer |
| --- | --- |
| Proje listede görünmüyor | Çalışma alanı üyeliği, proje kapsamı, proje durumu ve Portföy filtresi |
| Görev düzenleme düğmesi yok | Etkin profil ve projenin sahibi olan PY |
| Plan değeri düzenlenemiyor | Proje ve yılın plan kilidi durumu, rolün tahsis yetkisi |
| Rapor yönetimde görünmüyor | Seçili hafta ve yayının tamamlanıp tamamlanmadığı |
| Whiteboard’da pano oluşturulamıyor | Profilde kişi seçimi ve projeye görüntüleme erişimi |
| Jira veya asistan bağlantısı çalışmıyor | Önce çalışma alanı ve proje eşleşmesi, ardından yönetici tarafından ilgili entegrasyonun yapılandırması |
