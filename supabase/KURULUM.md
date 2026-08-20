# PlanAsistan Bulut Senkronizasyonu — Supabase Kurulumu (Ücretsiz)

Bu kılavuz ~10 dakikada tamamlanır ve tamamen **ücretsiz katmanda** çalışır
(500 MB veritabanı, 50.000 aylık aktif kullanıcı — küçük/orta ekipler için
fazlasıyla yeterli).

## 1. Supabase projesi oluşturun

1. [supabase.com](https://supabase.com) → **Start your project** → GitHub ile giriş yapın.
2. **New Project** deyin: bir ad (örn. `planasistan`), güçlü bir veritabanı
   şifresi ve bölge (Frankfurt `eu-central-1` Türkiye'ye en yakını) seçin.
3. Proje açılınca **Project Settings → API** sayfasından iki değeri kopyalayın:
   - **Project URL** (örn. `https://xxxx.supabase.co`)
   - **anon public** anahtarı (uzun JWT — bu anahtar istemcide kullanılmak
     üzere tasarlanmıştır, RLS ile korunur)

## 2. Veritabanı şemasını kurun

1. Dashboard'da **SQL Editor** → **New query**.
2. Bu klasördeki [`schema.sql`](./schema.sql) dosyasının **tamamını** yapıştırıp
   **Run** deyin. "Success" görmelisiniz.

Bu şema üç tablo kurar ve **Row Level Security** politikalarını açar:

| Tablo | İçerik | Kim erişir |
|---|---|---|
| `workspaces` | Sunucu içi legacy core uyumluluk kopyası + sürüm | İstemci yalnız güvenli metadata sütunlarını okur; `core` kapalıdır |
| `workspace_private` | Sunucu içi geçiş/uyumluluk kopyası | `0002` sonrasında istemci erişimine kapalı |
| `workspace_members` | Üyelik + rol + uygulamadaki kişi eşlemesi | Üyeler görür; PYB Destek/Müdür yönetir |

> Not: "Yönetici notları göremez" kuralı artık yalnızca arayüz gizlemesi
> değil — veritabanı politikası. Yönetici rolündeki bir kullanıcı API ile
> uğraşsa bile `workspace_private` verisini çekemez.

### 2.1 Normalize veri katmanını hazırlayın (v2 geçişi)

`schema.sql` başarıyla çalıştıktan sonra SQL Editor'de migration'ları sırayla
ve her birini ayrı sorguda çalıştırın:

1. [`migrations/20260820_0001_normalized_rbac.sql`](./migrations/20260820_0001_normalized_rbac.sql)
2. [`migrations/20260820_0002_transactional_dual_write.sql`](./migrations/20260820_0002_transactional_dual_write.sql)
3. [`migrations/20260820_0003_normalized_read_cutover.sql`](./migrations/20260820_0003_normalized_read_cutover.sql)

`0001` ile `0002` arasında uygulamadan bulut yazımı yapılmamalıdır. `0002`,
backfill kaynak sürümüyle mevcut belge sürümü farklıysa veri kaybını önlemek
için `PZ003` hatasıyla kurulumu durdurur.

Canlı ve mevcut workspace içeren bir kurulumda `0003` hemen çalıştırılmaz.
Önce `0002` uyumlu uygulama sürümüyle bütün workspace'lerde PYB Destek hesabı
bir kez **Buluttan Çek → Şimdi Gönder** yapmalıdır. `0003`, normalize edilmemiş
veya core/private sürümü geride tek bir workspace dahi bulursa `PZ004` ile
durur; tam legacy belge erişimini yarım geçişte kapatmaz. Yeni/boş kurulumda
üç migration doğrudan sırayla çalıştırılabilir.

Bu migration mevcut JSON belgelerini **silmez veya değiştirmez**. Proje, kişi,
tahsis ve plan kilidi verilerini satır bazında tutacak paralel tabloları kurar;
sunucu tarafındaki kapsam kuralları da bu tablolarda zorlanır:

| Rol | Proje görünürlüğü | Yazma yetkisi |
|---|---|---|
| Müdür | Tüm projeler | Yalnız gönderilmiş planı onaylama/reddetme/kilidi açma |
| PYB Sorumlusu | Tüm projeler | Yalnız gönderilmiş planı onaylama/reddetme/kilidi açma |
| PYB Destek | Tüm projeler | Veri havuzu; proje sahibi ve proje durumu |
| Proje Yöneticisi | `workspace_members.person_id` ile sahip olduğu projeler | Kendi proje içeriği ve projesindeki tahsisler |
| Bölüm Sorumlusu | Kendi bölümünden tahsis bulunan projeler | Yalnız kendi bölümü personelinin tahsisleri |

Ek korumalar:

- Görev/risk/hedef gibi proje alt kayıtları proje sahibi PY dışında yazılamaz.
- Plan `submitted` veya `locked` durumundayken plan hücresi API üzerinden de
  değiştirilemez; gerçekleşen hücreleri kapsam içindeki kullanıcı yazabilir.
- Plan durumları yalnız `draft → submitted → locked` veya yetkili ret/kilit
  açma geçişleriyle değişir.
- Proje notları ve müşteri istekleri yalnız proje sahibi PY tarafından okunur.
- Uygulama private uyumluluk belgesini indirmez. `pull_workspace_v2`, özel
  not/istek satırlarını yalnız proje sahibi PY için sahiplik RLS'iyle toplar.
- Audit kayıtları doğrudan eklenemez; sunucunun gerçek üyelik kimliğini kullanan
  `append_audit_event` RPC'siyle append-only yazılır.

`0002` migration'ı belge güncellemesini ve rol kapsamındaki normalize tablo
yazımlarını `push_workspace_v2` RPC'sinde **tek transaction** olarak birleştirir.
Bir RLS, kilit veya constraint kontrolü başarısız olursa belge sürümü dahil tüm
işlem geri alınır; yarım çift-yazma oluşmaz.

Mevcut bir çalışma alanındaki ilk transaction senkronunu **PYB Destek** hesabı
başlatmalıdır. Uygulamadaki **Şimdi Gönder** işlemi normalization state yoksa
backfill'i otomatik olarak aynı transaction içinde yapar. `py`, bölüm sorumlusu
ve yönetim rolleri state oluşmadan yazamaz. Geçiş sırası:

1. `schema.sql`, `0001` ve `0002` dosyalarını sırayla çalıştırın.
2. `0002` çift-yazma uyumlu uygulama sürümünü yayınlayın.
3. Her workspace için PYB Destek hesabıyla **Buluttan Çek**, ardından
   **Şimdi Gönder** yapın.
4. Her workspace'te `workspace_normalization_state.source_core_version` ile
   `workspaces.version` değerlerinin eşit olduğunu doğrulayın.
5. `0003` migration'ını çalıştırın ve normalize-okuma uygulama sürümünü
   yayınlayın.

`0003` sonrasında `pull_workspace_v2` tek transaction snapshot'ında yalnız
oturumun RLS ile görebildiği projeleri, kişileri, tahsisleri, kilitleri,
snapshot/audit kayıtlarını ve PY'ye özel veriyi belge biçiminde döndürür.
Tarayıcının `workspaces.core`, `workspace_private`, `project_notes` veya
`customer_requests` tablolarını doğrudan okumasına ihtiyaç kalmaz.

Backfill sonucu `workspace_normalization_state` tablosuna kaynak `core/private`
sürümlerini kaydeder ve aynı çalışma alanında yanlışlıkla ikinci kez çalışmayı
reddeder.

## 3. E-posta doğrulamasını kolaylaştırın (opsiyonel ama önerilir)

Küçük ekip içi kullanım için: **Authentication → Providers → Email** altında
**Confirm email** seçeneğini kapatabilirsiniz; üyeler e-posta + şifreyle anında
giriş yapar. (Açık bırakırsanız her üye ilk kayıtta doğrulama e-postası alır.)

## 4. Uygulamayı bağlayın

1. PlanAsistan'da sağ üstteki **bulut simgesine** tıklayın.
2. **Project URL** ve **anon** anahtarını yapıştırıp kaydedin.
3. E-posta + şifre ile **kayıt olun / giriş yapın**.
4. **"Bu çalışma alanını buluta taşı"** deyin — mevcut tüm veriniz buluta
   yazılır ve size bir **Çalışma Alanı ID**'si verilir.

## 5. Ekip üyelerini ekleyin

1. Her üye uygulamada aynı Supabase URL/anahtar ile **kayıt olur**.
2. Siz (veya PYB Destek/Müdür rolündeki biri) SQL Editor'de üyeyi ekleyin:

```sql
-- Üyenin auth.users id'sini bulun:
select id, email from auth.users order by created_at desc;

-- Üyeliği rolüyle ekleyin:
insert into public.workspace_members (workspace_id, user_id, role)
values ('ÇALIŞMA-ALANI-ID', 'KULLANICI-ID', 'pyb_destek');
-- roller: mudur | pyb_sorumlu | pyb_destek | py | bolum_sorumlu
```

`py` ve `bolum_sorumlu` rollerinde `person_id` de verilmelidir. Bu değer,
uygulamadaki Veri Havuzu'nda yer alan kişinin `id` alanıdır:

```sql
insert into public.workspace_members (workspace_id, user_id, role, person_id)
values ('ÇALIŞMA-ALANI-ID', 'KULLANICI-ID', 'py', 'PERSON-ID');
```

Müdür, PYB Sorumlusu ve PYB Destek rollerinde `person_id` boş bırakılır.
Buluta bağlı kullanımda uygulamadaki rol ve kişi seçimi bu üyelik kaydından
zorunlu olarak gelir; kullanıcı arayüzden başka bir rolü taklit edemez.

3. Üye, uygulamadaki bulut penceresine **Çalışma Alanı ID**'sini yapıştırıp
   **Bağlan** der → veri buluttan iner.

## Kurulumu doğrulama (önerilir)

Bilgisayarınızda (Node 18+ kuruluysa) tek komutla tüm kurulumu test edin:

```bash
node supabase/dogrula.mjs https://PROJENIZ.supabase.co ANON_ANAHTARINIZ
```

Betik; bağlantıyı, anahtarı, temel tabloları, normalize state'i ve auth
ayarlarını kontrol edip Türkçe rapor verir. `--e2e` bayrağıyla çalıştırırsanız
geçici bir test kullanıcısıyla atomik workspace oluşturma, normalize backfill,
transaction çift-yazma, normalize/RLS kapsamlı pull ve legacy core/private
uyumluluk belgelerinin istemciye kapalı olduğu uçtan uca doğrulanır; test
verisi otomatik temizlenir.

## 6. Günlük kullanım

- **Otomatik senkron** açıkken her değişiklik birkaç saniye içinde buluta gider.
- Uygulama **çevrimdışı da çalışır** (yerel-öncelikli); bağlantı gelince
  "Şimdi Gönder / Buluttan Çek" ile eşitlersiniz.
- Çakışma olursa (iki kişi aynı anda yazdıysa) uygulama sizi uyarır ve
  buluttaki güncel veriyi çekmenizi ister — kimsenin verisi sessizce ezilmez.

## Bilinen sınırlar

- Çakışma kontrolü hâlâ workspace belge sürümü bazındadır; iki farklı satırı
  aynı anda değiştiren kullanıcılar da önce çekme uyarısı alabilir.
- Okumalar normalize tablolardan RLS kapsamıyla yapılır; legacy core/private
  JSON belgeleri geçiş uyumluluğu için sunucuda tutulmaya devam eder. Sonraki
  sadeleştirme adımında bu uyumluluk kopyaları kaldırılabilir.
- Ücretsiz Supabase projeleri ~1 hafta hareketsizlikte uykuya geçer; ilk
  istek birkaç saniye gecikir (veri kaybı olmaz).
