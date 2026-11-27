# İlerleme modeli, ekip analizi, kural setleri ve rapor otomasyonu

## İlerleme modeli (durum yüzdeleri)

Proje ayarları › **İlerleme**. Varsayılan ilerleme yalnız Tamamlandı'yı sayar. Yoldaki
her duruma tamamlanma yüzdesi verilir (ör. Geliştirmede %30, Kod İncelemede %60,
**Testte %75**). Tamamlanan iş her zaman %100'dür.

- Ayrıntılı iş akışı durumu yüzdesi kategori yüzdesinden (Bekleyen, Yapılacak, Süreçte) önce gelir.
- Kayıtlar **eşit** (adet) ya da **eforuyla ağırlıklı** sayılır.
- Aynı model şunlarda kullanılır: genel bakış, sprint ve sürüm ilerlemesi, Plan'daki taşlar, dashboard "İlerleme (kayıt)" kartı, yönetici raporu, zamanlanmış raporlar ve asistan. Bir dashboard kartı kendi yüzdelerini kullanabilir.

Kod: `utils/progress.ts`.

## Ekip › Takımlar ve Bileşenler

**Takım**, proje rolüdür (Geliştirici, Test, Analist…). Üyeler Proje ayarları › Roller'de atanır.
Görev, atananı takım üyesiyse o takımındır. Bir kişi birden çok takımda olabilir.

| Gösterge | Anlamı |
|---|---|
| İlerleme | Durum yüzdeleriyle |
| Açık / süreçte, geciken | Termini geçmiş açık iş |
| Biten | Seçilen dönemde (14 / 30 / 90 gün) kapanan |
| Açık efor | Açık işlerin olası süresi (gün) |
| Hata | Açık hata · dönemde açılan / kapanan |
| Kapanma | Ortanca açılış → kapanış süresi |
| Tahmin | Ortanca gerçekleşen ÷ tahmin (×1,3 üstü uyarı) |
| 8 hafta | Haftalık biten kayıt eğilimi |

**Bulgular** kendiliğinden çıkar:
- açık işlerin en az %25'i gecikmiş
- tek kişide açık eforun en az %45'i (darboğaz)
- hata birikiyor (açılan > kapanan × 1,5)
- tahminler düşük
- kişi başı süreçteki iş 2'yi aşıyor
- açık Blocker

Satıra tıklayınca kişi yükü ve açık işler açılır.

Bileşenler sekmesi aynı göstergeleri bileşen bazında gösterir. Ek olarak bileşen sorumlusunu ve bileşende çalışan takımları listeler.

Asistan: `ekip_analizi` (kirilim `takim` | `bilesen`, `gun`). Kod: `utils/teamAnalytics.ts`.

## Kural setleri (otomasyon)

Pano › **Kurallar** ya da proje menüsü › **Kural setleri**.

**Tetikleyici → koşul → eylem.** Örnek: *Durum Çözüldü olduğunda, atanan Ayşe Kaya ise → durumu Testte yap.*

| Bölüm | Seçenekler |
|---|---|
| Tetikleyici | Durum değişince (hedef / kaynak durum), görev oluşturulunca, alan değişince (ileri), her gün |
| Koşul | Durum, önceki durum, kategori, atanan, atananın rolü (takım), birim, bileşen, tür, öncelik, etiket, hedef sürüm, sprint, efor, termine kalan gün, gecikmiş, çözüm, başlık |
| Karşılaştırma | =, ≠, şunlardan biri, şunlardan biri değil, içerir, boş, dolu, >, < |
| Eylem | Durum, atama (kişi, bileşen sorumlusu, kaldır), öncelik, sprint, hedef sürüm, termin, etiket ekle/çıkar, çözüm, yorum, bildirim (atanan, rol üyeleri, Teams) |

- **Basit kip**: tek tetikleyici, en çok 3 VE koşulu, tek eylem.
- **İleri kip**: VE/VEYA grupları (iç içe), çok eylem, alan tetikleyicisi.
- **Ne zaman çalışır**: görev değişikliklerinin hepsinde. Bunlar elle düzenleme, panoda taşıma, toplu düzenleme, Jira eşitlemesi, içe aktarma ve asistan önerisidir. Değişikliği yapan kişinin uygulamasında çalışır. Günlük kurallar günde bir kez çalışır: uygulama açılınca ya da açıkken gün dönünce.
- **Jira'ya da uygula** (kural başına): durum geçişi, öncelik, termin, çözüm ve yorum Jira kaydına yazılır. Sunucuda JIRA_ALLOW_UPDATE açık olmalıdır. Atama ve etiket yalnız uygulamada değişir. Kapalıyken Jira eşitlemesi kuralın yaptığı durum değişikliğini geri alabilir.
- **Güvenlik**:
  - Bir kural aynı görevde aynı zincirde bir kez çalışır.
  - Kuralın yaptığı değişiklik başka kuralı tetikleyebilir; zincir en çok 3 adımdır, döngü oluşmaz.
  - Kaydetmeden önce önizleme "şu an kaç görev uyuyor" sorusunu yanıtlar.
  - Geçmiş sekmesi her çalışmayı görev koduyla gösterir; son 200 çalışma tutulur.
  - Kural geriye dönük çalışmaz.

Kod: `utils/automation.ts`. Uygulama bağlantısı `App.tsx` › `storeProjectChange` ve `runDailyRules`.

## Rapor otomasyonu

Proje menüsü › **Rapor otomasyonu**.

**Periyot** (Türkiye saati) şunlardan biridir:
- her gün
- hafta içi
- haftada bir gün

**Kanallar** şunlardır:
- Teams kanalı
- Slack kanalı
- Notion (her rapor yeni sayfa olur)
- e-posta

**İçerik bölümleri** şunlardır:

| Bölüm | İçerik |
|---|---|
| İlerleme | Durum yüzdeli %, önceki günlük ölçüme göre fark, biten ve açık iş farkı |
| Dönemde olanlar | Son rapordan bu yana biten, yeni ve durum değişen işler |
| Hatalar | Açık hata, açılan / kapanan, açık işlerin ve dönemde açılanların yüzde kaçı hata |
| Geciken işler | Sayı, açık işlere oranı, en geç kalanlar |
| Şu anki sprint | %, biten / toplam, süreçte, kalan gün |
| Kilometre taşları | Sürüm planındaki taşların ilerlemesi ve hedef tarihi |
| Takım bazında | Proje rolleri; yoksa birimler |
| Blocker işler, yüksek riskler | Açık Blocker işler ve skoru 15 ve üzeri riskler |

**Kapsam** tüm proje ya da tek bir hedef sürüm olabilir. Rapora sabit bir not eklenebilir.
Ekranda canlı önizleme ve **Şimdi gönder (deneme)** düğmesi vardır.

### Kim gönderir

| Sunucu | Davranış |
|---|---|
| `CRON_SECRET` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` tanımlı (bulut kullanılıyor) | Vercel cron (`/api/integrations/cron-reminder?route=report`) bulut verisinden zamanı gelen raporları gönderir; uygulama kapalıyken de. Gönderim günü ve günlük ölçümler `app_settings` tablosunun `report-runs` satırında tutulur; proje verisine yazılmaz. |
| Tanımlı değil | Saati gelince, uygulaması açık olan ve projeyi düzenleyebilen bir üyenin tarayıcısı gönderir (aynı tarayıcıda iki sekme çift göndermez). |

Vercel Hobby planında cron günde bir kez çalışır (`0 5 * * *` = 08:00 TR). Bu durumda o günün raporlarının hepsi saati beklenmeden gönderilir.

Pro planda iki ayar yapılır:
- `vercel.json`'daki rapor cron'u saatlik yapılır (`0 * * * *`).
- `REPORT_CRON_HOURLY=1` tanımlanır.

Böylece her rapor kendi saatinde gider.

### Kanal ayarları (yönetici › Entegrasyonlar)

| Değişken | Açıklama |
|---|---|
| `TEAMS_WEBHOOK_URL` | Teams kanalı iş akışı (Workflows) adresi |
| `SLACK_WEBHOOK_URL` | Slack › Apps › Incoming Webhooks ile alınan `https://hooks.slack.com/…` adresi |
| `NOTION_TOKEN` | Notion › Settings › Connections › iç entegrasyon jetonu |
| `NOTION_PARENT_PAGE_ID` | Raporların ekleneceği sayfanın kimliği (bağlantının sonundaki 32 hane). Sayfa entegrasyonla paylaşılmalı (⋯ › Connections). |
| SMTP_* | E-posta. Alıcılar izinli alan adlarından olmalı (NOTIFY_ALLOWED_DOMAINS). |

Adresler ve jetonlar sunucuda şifreli tutulur; proje verisine yalnız kanal seçimi yazılır.

**"Teams sunucusuna ulaşılamadı" hatası.** Sunucu kanal adresine bağlanamadı. İletide nedeni yazar:
- *alan adı çözümlenemedi / bağlantı kurulamadı*: Sunucu (çoğunlukla kurum ağındaki yerel sürüm) internete çıkamıyor. Kurum vekil sunucu kullanıyorsa `HTTPS_PROXY` tanımlayın. Kurum içi adresler (ör. Jira) `NO_PROXY` ile doğrudan gider. Vekil kullanılmıyorsa güvenlik duvarında Teams iş akışı adresinin alan adına (ör. `*.logic.azure.com`, `*.powerplatform.com`) izin verilmelidir.
- *TLS sertifikası doğrulanamadı*: Kurum ağı trafiği kendi sertifikasıyla açıyor. Kurum kök sertifikasını `AI_CA_CERTS` (yerel sürümde `AI_CA_CERTS_FILE`) ile verin.
- *zamanında yanıt vermedi*: 20 saniye içinde yanıt gelmedi. Adres ve ağ erişimi denetlenmeli.

Kod: `utils/reportAutomation.ts` (tarayıcı ve sunucu ortak), `server/integrations/reports.ts`.
