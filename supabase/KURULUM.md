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
| `workspaces` | Projeler, veri havuzu, tahsisler, kilitler, snapshot'lar | Tüm üyeler |
| `workspace_private` | **Notlar ve müşteri istekleri** | Yalnızca PY, Bölüm Sorumlusu, PYB Destek — **Müdür ve PYB Sorumlusu sunucu düzeyinde okuyamaz** |
| `workspace_members` | Üyelik + rol + uygulamadaki kişi eşlemesi | Üyeler görür; PYB Destek/Müdür yönetir |

> Not: "Yönetici notları göremez" kuralı artık yalnızca arayüz gizlemesi
> değil — veritabanı politikası. Yönetici rolündeki bir kullanıcı API ile
> uğraşsa bile `workspace_private` verisini çekemez.

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

Betik; bağlantıyı, anahtarı, üç tablonun kurulu olup olmadığını ve auth
ayarlarını kontrol edip Türkçe rapor verir. `--e2e` bayrağıyla çalıştırırsanız
geçici bir test kullanıcısıyla uçtan uca senaryo da doğrulanır (çalışma alanı
oluşturma, üyelik tetikleyicisi ve **Müdür rolünün notları okuyamadığının RLS
kanıtı**); test verisi otomatik temizlenir.

## 6. Günlük kullanım

- **Otomatik senkron** açıkken her değişiklik birkaç saniye içinde buluta gider.
- Uygulama **çevrimdışı da çalışır** (yerel-öncelikli); bağlantı gelince
  "Şimdi Gönder / Buluttan Çek" ile eşitlersiniz.
- Çakışma olursa (iki kişi aynı anda yazdıysa) uygulama sizi uyarır ve
  buluttaki güncel veriyi çekmenizi ister — kimsenin verisi sessizce ezilmez.

## Bilinen sınırlar (v1)

- Senkronizasyon belge bazlıdır: aynı anda iki kişinin yazması çakışma
  uyarısı üretir (alan bazlı birleştirme normalize şema fazında gelecek).
- Rollerin **yazma** kısıtları istemcide uygulanır; sunucu tarafında kesin
  olan kısıtlar: üyelik zorunluluğu, `workspace_private` görünürlüğü ve üye
  yönetimi yetkisi.
- Ücretsiz Supabase projeleri ~1 hafta hareketsizlikte uykuya geçer; ilk
  istek birkaç saniye gecikir (veri kaybı olmaz).
