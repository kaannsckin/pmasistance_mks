# Jira zaman takibi ve kayıt geçmişi

## Bağlantı ayarları

Sunucuda `JIRA_BASE_URL` ve Jira Cloud için `JIRA_EMAIL` ile `JIRA_API_TOKEN`, Data Center için `JIRA_TOKEN` tanımlayın. Jira hesabına hedef projelerde kayıt, değişiklik geçmişi ve çalışma kaydı okuma yetkisi verin. `JIRA_ALLOWED_PROJECTS` ile erişilecek proje anahtarlarını virgülle sınırlayın. Vercel, geliştirme sunucusu ve yerel uygulama aynı entegrasyon rotalarını kullanır.

Kalan süre Jira’ya gönderilecekse Jira zaman takibini etkinleştirin, Jira hesabına ilgili kayıtları düzenleme yetkisi verin ve `JIRA_ALLOW_UPDATE=1` ayarlayın. **Planlama → Jira eşitleme → Alanlar** altında **Kalan süre** için yönü seçin. İlk çift yönlü eşitlemede Jira değeri alınır. Daha sonra iki taraf aynı anda değişirse Jira değeri kullanılır ve çakışma bildirilir. Boş Jira süre alanları çizgi, sıfır değerler `0 sa` olarak görünür. İş gücü kaydı oluşturma, düzenleme ve silme işlemleri Jira üzerinden yapılır.

## Çalışma kayıtlarına erişim

Paylaşılan kurulumda `AI_AUTH_MODE=supabase` kullanın. Bir kullanıcı, doğrulanmış Supabase e-postasıyla eşleşen Jira çalışma kayıtlarını görür. Jira e-postası gizliyse sunucudaki `JIRA_WORKLOG_ACCESS` ayarında Supabase kullanıcı UUID’sini Jira Cloud `accountId` veya Data Center kullanıcı anahtarıyla eşleyin. Proje yöneticisine Jira proje anahtarı için yetki verin. Alanlar isteğe bağlıdır ve yalnızca sunucuda bulunur.

```dotenv
JIRA_WORKLOG_ACCESS='{"SUPABASE_UUID":{"projects":["MKS"],"authorIds":["JIRA_ACCOUNT_ID"]}}'
```

Tek kişilik bir kurulumda paylaşılan bir erişim kodu kullanılıyorsa `JIRA_WORKLOG_SINGLE_USER=1` ile sunucuya bu kurulum niteliğini bildirin. Paylaşılan kurulumlara kişisel Supabase oturumuyla erişin. Ekip üyesinin adı ve e-postası veri havuzundaki kayda eşlenirse çizelge kapasiteyi ve ünvan maliyetini hesaplayabilir.

Yeni ayrıntılı çalışma kayıtları ve yorumları görev ayrıntısında istek üzerine görülür. Paylaşılan Supabase oturumunda arka plan yenilemesi görev JSON’una çalışma kaydı satırı yazmaz. Önceden paylaşılmış görev ve rapor dışa aktarımları geçmişte sakladıkları veriyi içerir. Eski kopyaların erişimini çalışma alanı yöneticisi yönetir.

## Ekranlar

- **Görev → Ayrıntılar → Zaman takibi** ilk tahmini, harcananı, kalanı ve varsa alt görevli toplamı gösterir. Dashboard’daki toplamlarda alt görevleri iki kere saymamak için kayıt düzeyindeki süreler kullanılır.
- **Görev listesi → Zaman sütunları** kalan süre, harcanan süre ve sapma yüzdesini açar. `kalan > 4 saat AND tahmin aşılmış`, `tahminsiz` ve `kalan IS EMPTY` sorguları kaydedilebilir.
- **Görev → Geçmiş** alan ve kişi filtrelerini içerir. Ham Jira geçmişi tarayıcı belleğinde en çok 10 dakika tutulur. Projeye eşitlemede yalnız özet yazılır. Tarayıcı 25 değişikliklik sayfalar gösterir.
- **Ekip ve tahsis → Zaman çizelgesi** altında bir proje, hafta veya ay seçin. Kişiyi açarak Jira kayıtlarını gün gün görün. **Kullanım ve maliyet** görünümünü kişiye veya ekibe göre gruplayın. Excel, CSV ve PDF seçili filtrelere göre hazırlanır.

Durumda geçen süre Europe/Istanbul saat diliminde, Türkiye iş günü takvimiyle 09.00–17.00 arasında hesaplanır. Arife günlerinde bitiş 13.00’tür. Çalışma kayıtlarının gün dağılımı çizelgede seçilebilen saat dilimine göre hesaplanır. Varsayılan Europe/Istanbul’dur. İş günü ve çalışma kaydı saat dilimi tercihleri farklı hesapları etkiler.

## Sınırlar

Geçmiş rotası bir kayıt için en çok 5.000 değişiklik okur. Çizelge isteğinde en çok 500 Jira kaydı ve kayıt başına 5.000 çalışma kaydı okunur. Eşitlemede Jira kısmi geçmiş gönderirse özet kısmi olarak işaretlenir ve proje darboğaz ortalamalarına girmez. Çalışma kaydı değişiklik imleci sunucu belleğinde, Jira bağlantısı ve kayıt grubu başına 15 dakika tutulur. Sunucu yeniden başlarsa ya da Jira toplu çalışma kaydı uçlarını desteklemiyorsa kayıt bazında tam okuma yapılır.

Tempo kapalıyken çizelge ve kullanım raporu Jira worklog’larından çalışır. Tempo bağlantısı, faturalandırma, hesap, plan ve onay uçları bu sürümde uygulanmadı.

## Jira’da elle doğrulama

1. Cloud ve Data Center test projelerinde birer kayıt ve alt görev hazırlayın. Bir tahmin alanını boş bırakın, bir kalan süreyi sıfır yapın.
2. Jira eşitlemesini çalıştırıp görev ve dashboard değerlerini Jira ile karşılaştırın. Test kaydında kalan süre gönderimini yazma izni kapalı ve açıkken ayrı ayrı deneyin.
3. Geçmişi 100’ü aşan bir Cloud kaydı açın. Alan ve kişi filtrelerini, açıklama değişikliklerini ve son sayfayı kontrol edin.
4. Bir proje yöneticisi ve ekip üyesiyle oturum açın. Yöneticinin ekibi, üyenin yalnız kendi kayıtlarını gördüğünü kontrol edin. Jira’dan bir worklog’u düzenleyin ve birini silin, görev ayrıntısındaki **Yenile** düğmesiyle sonucu karşılaştırın.
5. Gece yarısına yakın bir kayıtla hafta/ay çizelgesinde UTC ve Europe/Istanbul gün dağılımlarını, kapasite ve Excel toplamlarını kontrol edin.
