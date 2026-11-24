# PlanAsistan bulut veritabanı

## Kurulum ve güncelleme

1. [Supabase](https://supabase.com/dashboard) panelinde PlanAsistan için kullandığınız projeyi açın. Supabase’i ilk kez kullanıyorsanız bir proje oluşturun. **Connect** ekranındaki proje adresini ve **Publishable** anahtarını alın. Eski projelerde **anon public** anahtarı da kullanılabilir.
2. Supabase **SQL Editor** ekranında [schema.sql](./schema.sql) dosyasını bir kez çalıştırın. Mevcut PlanAsistan şemasını da aynı dosyayla güncelleyebilirsiniz. Şema eksikse uygulama SQL dosyasını indirme ve SQL Editor’ı açma seçeneklerini gösterir.
3. Supabase **Authentication → Email Templates** bölümünde **Magic Link** ve **Confirm signup** şablonlarına e-posta kodunu ekleyin. Örneğin HTML içeriği `<p>PlanAsistan giriş kodunuz: <strong>{{ .Token }}</strong></p>` olabilir. Giriş sırasında kullanıcı bu kodu uygulamaya yazar. Birden fazla gerçek kullanıcıya kod göndermek için Supabase’de kurumunuzun SMTP servisini tanımlayın.
4. PlanAsistan’da **Bulut veritabanı** ekranını açın. İlk bağlantıda adres ve anahtarı girip **Bağlantıyı doğrula** deyin. **Kod gönder** düğmesini kullanın, e-postaya gelen kodu girin ve **Kodu doğrula** deyin.
5. Verileriniz Supabase’deyse girişten sonra mevcut çalışma alanınızı listeden açın. İlk veri aktarımında **Bu cihazdaki verileri buluta taşı → Verileri aktar ve bağlan** ile yerel projeleriniz ve özel notlarınız yeni bir çalışma alanına kaydedilir.

## Ekibin yalnızca giriş yapması için

PlanAsistan’ı ekip için sunan kurulumda aşağıdaki iki değişkeni bir kez tanımlayın. Vercel’de bunlar ortam değişkenleri, yerel Windows uygulamasında `planasistan.env` ayarları, Vite geliştirmede `.env.local` ayarlarıdır.

```dotenv
SUPABASE_URL=https://proje.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
```

Her kullanıcı e-postasına gelen tek kullanımlık kodla giriş yapar. Çalışma alanı sahibi **Bulut veritabanı → Kullanıcı ve proje erişimleri** bölümünden doğrulanmış e-postayı, rolü, varsa personel kaydını ve proje kapsamını kaydeder. Kullanıcı **Listeyi yenile** dediğinde çalışma alanını adıyla görür. Aynı ekrandan erişim değiştirilebilir veya kaldırılabilir.

- **Tüm projeler** çalışma alanının tamamına erişim verir. **Yalnız seçilen projeler** kapsamındaki hesaplar seçilen projeleri ve izinli özel kayıtları görür. Bu kapsamda Proje Yöneticisi kendi projesinin görevlerini, sprint ve sürüm planlarını ve özel kayıtlarını düzenleyebilir. Ortak veri havuzu ve çalışma alanı genelindeki düzenlemeler tüm proje kapsamına bağlıdır.
- Çalışma alanı sahibi başka bir kullanıcıya **Kullanıcı erişimlerini yönetebilir** yetkisini verebilir. Mevcut çalışma alanlarında şema güncellemesi sırasında sahip bu yetkiyi alır. Daha önce atanmış üyelikler ve rolleri korunur. Proje Yöneticisi ve Bölüm Sorumlusu rollerini personel kaydıyla eşleştirebilirsiniz.
- Bağlı çalışma alanı açılırken erişim doğrulanır. Tarayıcı yeniden odağa geldiğinde ve kullanım sırasında erişim tekrar kontrol edilir. Kullanıcı bağlıyken uygulamada yerel profil değiştirici yerine bulut hesabıyla çalışır.

`service_role`, `sb_secret_` ve veritabanı parolaları bu kurulum ekranı için kullanılmaz. Üyelik ve özel veri kısıtları Postgres satır düzeyi güvenlik politikalarıyla uygulanır. Notları ve müşteri isteklerini PY, Bölüm Sorumlusu ve PYB Destek rolleri indirebilir.

## Veri saklama ve eşitleme

- Otomatik eşitleme açıkken, değişen projeler birkaç saniye içinde veritabanına gönderilir. **Şimdi gönder** ve **Buluttan çek** işlemleri de kullanılabilir.
- Tarayıcı, çevrimdışı çalışma için proje kopyasını varsayılan olarak saklar. **Ayarlar → Yerel Kayıt** kapatılırsa proje kopyası saklanmaz ve uygulama bağlı çalışma alanını açılışta veritabanından yükler. Cihaz ayarları tarayıcıda durur. Bu kipi kullanırken pencereyi kapatmadan önce değişikliklerin gönderildiğinden emin olun.
- Aynı projede ya da ortak veride eşzamanlı düzenleme varsa uygulama sürüm çakışmasını bildirir. Farklı proje satırları ayrı sürümler taşır.

Kurulumu komut satırından denetlemek için Node.js ile `node supabase/dogrula.mjs PROJE_ADRESI PUBLIC_ANAHTAR` çalıştırılabilir. `--e2e` geçici bir test alanıyla veritabanı politikalarını denetler. E-posta teslimatını ve kod girişini uygulama üzerinden doğrulayın.
