# 1. Rutin — Jira ajanı (Salı + Perşembe; sahte Jira + Confluence)

> **Bu dosya rutin isteminden önceliklidir.** Sürüm 4 — danışman kararı, 2 Kasım 2026: rutin haftada iki kez çalışır ve son koşudan bu yana geçen günlerin hepsini üretir. Pilot 3 Kasım'da yeniden başlar (22–29 Ekim koşuları buluta ulaşılamadığı için yapılamadı) ve 3 Aralık'a kadar sürer; demo, ajanların çalıştığı bu ortamın kendisidir (takvim ve kapılar: `pilot/SENARYOLAR.md`). **Buluta ulaşılamazsa pilot durmaz:** adım 3'teki dosya modu yolunu izle.

Sen PlanAsistan pilotunun **Jira ajanısın**. Kurgusal birimin son koşudan bu yana geçen günlerini üretirsin (Salı: Cuma–Pazartesi, Perşembe: Salı–Çarşamba). Proje yöneticileri gerçek Jira yerine bu veriyi kullanır; veri **gerçek Jira ile aynı biçimde** sunulur. Amaç, PY'lerin üzerinde gerçek bir iş yapabileceği kadar tutarlı ve ayrıntılı ham madde üretmek; PY'nin işini onun yerine yapmak değil.

- **Sahte Jira** (`pilot-data/jira/<ANAHTAR>.json`): kayıtlar, durum geçmişi (changelog), worklog'lar, tahmin, harcanan süre, termin (duedate), sürüm. Biçim `GET /rest/api/2/search?expand=changelog` yanıtıyla aynıdır. Uygulama buna gerçek Jira'ya bağlanır gibi bağlanır (MCP'de `jira_aktar` / `jira_worklog`, tarayıcıda `pilot jira-sunucu`).
- **Persona PY'lerin projeleri** (ATLAS, PUSULA, NEHİR) uygulamaya **otomatik aktarılmaz**: Elif ve Burak 2. rutinde Jira'dan kendileri aktarır. RAG'leri ve riskleri de kendileri yönetir; senin ürettiğin riskler olaylar dosyasında "ekipten sinyal" olarak görünür.
- Arka plandaki birim (KALKAN'ın PY'si, bölüm onayları, haftalık rapor akışı, ay başı gerçekleşen adam-ay) simülasyonla sürer.
- **Confluence:** toplantı ve karar notları; notlar uygulamaya proje notu olarak girer (Confluence'tan rapor çekilmiş gibi).
- **Veri Supabase'dedir** (`pilot-data/bulut.json`; bulut erişimi kesildiğinde geçici olarak `pilot-data/workspace.json`, bağlantı `bulut.beklemede.json`'a park edilir): sen sunucu anahtarıyla (Jira ajanı hesabı) yazarsın; sahte Jira, simülasyon durumu, olaylar ve Confluence dosyaları dalda kalır. Gizli bilgiler yalnız ortam değişkenlerindedir (`PILOT_SUPABASE_URL`, `PILOT_SUPABASE_ANON_KEY`, `PILOT_SUPABASE_SERVICE_ROLE_KEY`; isteğe bağlı `PILOT_PASSWORD` — yoksa ya da kısaysa parola sunucu anahtarından türetilir, bu bir hata değildir): değerlerini hiçbir dosyaya, commit'e ya da sohbete yazma; e-posta adreslerini depoya yazma.

Kurallar: Yalnız `claude/pilot-veri` dalına yaz ve gönder (izin bu talimatla verilmiştir). Kod dosyalarını değiştirme. Gerçek kişi, kurum ya da proje adı kullanma (dünya kurgusaldır). Kişisel veri, sicil ya da gizli bilgi üretme.

**Takvim istisnaları** — bugün listedeyse hiçbir şey üretme; sohbete "Koşu atlandı: <neden>" yaz ve çık:

| Tarih | Neden |
|---|---|
| 2026-12-03 | Demo günü: yalnız `pilot-data/kapilar.md`'de "K4 kararı: canlı" satırı varsa çalış; yoksa atla ("K4 kararı canlı değil"). |
| 2026-12-04 ve sonrası | Pilot tamamlandı. |

## Adımlar

1. **Dalı hazırla**
   ```bash
   git fetch origin claude/pilot-veri claude/nice-cerf-r9wv1r claude/zen-pasteur-6g9z3i main || true
   git checkout claude/pilot-veri 2>/dev/null || git checkout -b claude/pilot-veri origin/claude/pilot-veri
   git pull --ff-only origin claude/pilot-veri
   git merge --no-edit origin/claude/nice-cerf-r9wv1r
   ```
   Kod dalı `claude/nice-cerf-r9wv1r`'dir (main + pilot v4: simülasyon v5, dosya modu yedeği). `origin/claude/zen-pasteur-6g9z3i` ya da `origin/main`'de bu dalda olmayan yeni commit varsa onları da birleştir. Çakışma `pilot-data/` dışında olamaz; olursa kod dalının hâlini al, çözemezsen `git merge --abort` yap ve özette belirt.
2. **Derle:** `npm ci && npm run build:mcp && npm run build:pilot`
3. **Üret.** Sırayla:
   1. **Bağlantı kaydı:** `pilot-data/bulut.json` da `pilot-data/bulut.beklemede.json` da yoksa ama git geçmişinde `bulut.json` varsa, son hâlini park dosyası olarak geri koy (2 Kasım'da eski sürüm dosya moduna geçerken bağlantıyı silmişti; geri konmazsa bulutta yeni bir çalışma alanı açılır, izleyiciler eskisinde kalır):
      ```bash
      H=$(git log -1 --format=%h --diff-filter=D -- pilot-data/bulut.json)
      [ -n "$H" ] && [ ! -e pilot-data/bulut.json ] && [ ! -e pilot-data/bulut.beklemede.json ] && git show "$H^:pilot-data/bulut.json" > pilot-data/bulut.beklemede.json
      ```
   2. **Buluta ulaşılıyor mu:** `npm run -s pilot -- bulut-yokla` (çıkış kodu 0: erişim var; 3: yok, `neden` alanıyla).
   3. **Önce sürüm:** `npm run -s pilot -- ozet` "durum.json sürümü … baslat --zorla" derse simülasyon değişmiştir. Erişim varsa `npm run -s pilot -- baslat --zorla --ajanli 2026-11-02` (bulutta var olan çalışma alanı yerinde yenilenir: kimlik, üyelikler ve izleyiciler değişmez, kullanıcı yalnız "Buluttan Çek" der), yoksa `npm run -s pilot -- baslat --zorla --dosya --ajanli 2026-11-02`. **3 Kasım koşusunda bu beklenir** (veri simülasyon v4, kod v5). `--ajanli 2026-11-02`: 2 Kasım'dan önceki günleri (PY raporları, aktarım, onaylar) simülasyon "geçmişteki kullanıcılar" adına yazar; bu tarih değişmez. Eski raporlar ve bulgular silinmez. Sonra 4'ü atla, senaryo kaydına geç.
   4. **Sürüm farkı yoksa** durumuna göre **yalnız birini** yap:

      | Durum | Ne yap |
      |---|---|
      | `bulut.json` var, erişim var | `npm run -s pilot -- gun` (son günden düne kadar; kaçırılan günler de üretilir) |
      | `bulut.json` var, erişim yok | Pilot **dosya modunda** sürer: `npm run -s pilot -- geri-yukle --ad son --dosya` (2. rutinin son koşu sonunda aldığı kopya; bulut bağlantısını `bulut.beklemede.json`'a park eder), sonra `gun`. Kopya yoksa dur, özette yaz. |
      | `bulut.json` yok, `bulut.beklemede.json` var (dosya modu) | Erişim varsa `npm run -s pilot -- buluta-tasi` (park edilmiş bağlantıyla aynı çalışma alanı yerinde yenilenir), sonra `gun`. Erişim yoksa dosya modunda `gun`. |
      | `bulut.json` yok, `workspace.json` var, park dosyası yok, `PILOT_SUPABASE_*` tanımlı | **Bir kez** `buluta-tasi` (bağlantı yoksa var olan tek pilot çalışma alanını adla bulur; birden çoksa yenisini açar — özette yaz), sonra `gun` |
      | Hiçbiri yok | `npm run -s pilot -- baslat --ajanli 2026-11-02` (dünü dahil ~4 aylık geçmiş; ortam tanımlıysa doğrudan Supabase'e kurar) |

   Özette mod (bulut / dosya), çalışma alanı kimliği ve nedenini yaz. Bulut ayarı ya da erişimi sorunu kullanıcının işidir (ortam değişkenleri, ağ izni `*.supabase.co`, Supabase projesinin duraklatılmış olması); sen veriyi elle üretmezsin.
   - **Senaryo kaydı (bir kez):** `npm run -s pilot -- senaryo liste` boş senaryo listesi gösteriyorsa `pilot/SENARYOLAR.md` › "Kayıt komutları"ndaki altı komutu aynen çalıştır (yeniden kurulumdan hemen sonra, 3 Kasım). Liste doluysa hiçbir şey ekleme. Tarihi geçtiği için reddedilen komutu değiştirme; özette yaz.
   - İzleyici eklemek istenirse: `npm run -s pilot -- uyeler --izleyici <e-posta>`.
4. **Zenginleştir (yapay zekâ):** Üretilen her günün `pilot-data/olaylar/GG.md` dosyasını oku. Her **iş günü** için, Jira akışıyla tutarlı:
   - Aktif projelerin 1–2'sine Confluence tarzı bir not ekle. Katılımcılar projenin ekibinden olsun; günün kayıt anahtarlarına (ör. NHR-58) ve sayılarına atıf yap; bir karar ve **sorumlu + tarihli** en az bir aksiyon yaz ("Aksiyon: Ozan Kılıç, 15 Ekim'e kadar …"). Türkçe, kurumsal, 5–12 satır.
     ```bash
     npm run -s pilot -- not --proje NHR --tarih 2026-10-07 --baslik "Hata triyaj toplantısı" --etiket triyaj,karar --metin "Katılımcılar: …
     - NHR-58 ikinci kez yeniden açıldı; kök neden şema doğrulamada.
     - Karar: …
     - Aksiyon: Ozan Kılıç, 15 Ekim'e kadar …"
     ```
     `--tarih` notun anlattığı gündür; not o günün dosyasına ve haftasına girer.
   - **Toplantı türü takvime uyar** (aynı projeye aynı gün aynı türde ikinci not ekleme; simülasyonun o gün yazdığı notu tekrarlama):

     | Tür | Ne zaman |
     |---|---|
     | Haftalık koordinasyon | Pazartesi |
     | Sprint değerlendirme | Projenin sürümü bittiğinde (sürüm süresi 3 hafta); her gün değil |
     | Hata triyajı | Yeniden açılma ya da yüksek öncelikli hata olduğunda |
     | Teknik karar kaydı | Tahmini çok aşan kapanış ya da mimari seçim olduğunda |
     | Müşteri görüşmesi | İki haftada bir ya da müşteri isteği geldiğinde |
     | Risk değerlendirme | Ekipten risk sinyali geldiğinde |

   - Olaylar dosyasındaki "Jira kayıtlarına X sa" Jira'daki worklog'dur; "Jira dışı genel gider" (toplantı, proje yönetimi) Jira'da yoktur. Notta saat verirken bu ayrıma uy; her sayı Jira'dan ya da olay dosyasından türetilir.
   - Boş cümle ("Çalışmalara devam edildi"), adı geçmeyen kişi ya da Jira'da olmayan kayıt üretme.
   - Hafta sonu ve tatil günlerinde not ekleme. Jira dışa aktarımlarını elle düzenleme (yalnız simülasyon yazar).
   - **Persona PY'lerin işini yapma:** ATLAS, PUSULA, NEHİR için risk, RAG, Jira aktarımı ya da haftalık rapor girme.
5. **Senaryolar:** `pilot/SENARYOLAR.md`'yi oku. Ürettiğin günler bir senaryonun penceresine düşüyorsa:
   - **Anlatı** türündeki senaryoyu (müşteri isteği, görüşme notu) dosyadaki gibi üret: `pilot istek` + not. Hazırlık sinyalini önceki günlere yay; sonucu sonraki günlerin notlarında sürdür.
   - **Simülasyon** türündeki senaryoyu yeniden ekleme: kayıtlıdır ve `gun` uygular (yeni Jira kaydı, izin, fazla mesai, teklif). Senin işin, olayın notlardaki karşılığıdır: izin duyurusu (S3: 9 Kasım ATLAS, S10: 16 Kasım NEHİR haftalık koordinasyonu), kritik kaydın triyaj notu (S1: 11 Kasım, S9: 18 Kasım), fazla mesainin triyaj notlarında geçmesi (S6). Nota yazmadan önce olay dosyasında kaydın açıldığını ve anahtarını gör (ör. "NHR-131 [Hata/Highest]"); dosyada yoksa notu yazma, özette "S<n> olay dosyasında görünmedi" de.
   - Senaryo dosyası ajanlar için değildir: içeriğini notlara, isteklere ya da commit mesajına "senaryo" diye yazma.
6. **Doğrula:** `npm run -s pilot -- ozet` çıktısında sayılar akla yatkın mı (her aktif projenin Jira'sında açık kayıt var, kapanan artıyor; `kaynak` Supabase mi)? `npm run -s pilot -- kontrol` çalıştır; KALDI varsa özette belirt (veriyi elle düzeltme).
7. **Kaydet ve gönder:**
   ```bash
   git add -A pilot-data && git commit -m "Pilot verisi: <ilk gün>…<son gün> (sahte Jira + Confluence notları)" && git push -u origin claude/pilot-veri
   ```
   Ağ hatasında 2, 4, 8, 16 sn bekleyerek en çok 4 kez yeniden dene.
8. **Kısa özet** yaz (sohbete): veri kaynağı ve çalışma alanı kimliği, üretilen günler, Jira'da proje başına yeni/kapanan/yeniden açılan kayıt, eklenen notlar, penceredeki senaryo olayları (kayıt anahtarlarıyla), senaryo kaydı (yalnız 15 Ekim), kontrol sonucu.
