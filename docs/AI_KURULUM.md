# Kurumsal AI Asistanı — Kurulum

PlanAsistan'ın AI asistanı, kurumsal API anahtarını **yalnızca sunucuda** tutan küçük bir proxy üzerinden çalışır. Tarayıcıya, derlenmiş JS paketine ya da depoya hiçbir anahtar girmez.

```
Tarayıcı (asistan paneli) ──► /api/ai/chat  (proxy: anahtar burada) ──► Kurumsal LLM sağlayıcısı
   │  ▲                     ◄── NDJSON (metin + araç çağrısı) ◄──────── SSE akışı
   ▼  │
 Araçlar: rol kapsamlı, uygulama verisi üzerinde TARAYICIDA çalışır
```

| Bileşen | Dosya |
|---|---|
| Proxy çekirdeği (çatıdan bağımsız) | `server/ai/handler.ts` |
| Sağlayıcı adaptörleri | `server/ai/providers.ts` |
| Erişim koruması / hız sınırı | `server/ai/auth.ts`, `server/ai/rateLimit.ts` |
| Vercel fonksiyonları | `api/ai/chat.ts`, `api/ai/health.ts`, `api/ai/embed.ts` |
| Yerel geliştirme ara katmanı | `vite.config.ts` → `server/ai/nodeAdapter.ts` |
| Tarayıcı istemcisi | `utils/ai/client.ts` |
| Araç döngüsü / araçlar / kapsam | `utils/ai/agent.ts`, `utils/ai/tools.ts`, `utils/ai/scope.ts` |
| Sistem talimatı | `utils/ai/systemPrompt.ts` |
| Bilgi tabanı (RAG) | `utils/rag/` (kaynaklar, parçalama, BM25, hibrit arama, doküman okuyucular, kılavuz) · `server/ai/embeddings.ts` |
| Arayüz (panel, sohbet, paylaşılan durum) | `components/assistant/` |

## Asistan nasıl çalışır?

- **Her ekrandan erişim:** Sağ alttaki <kbd>✨</kbd> düğmesi sağdan açılan paneli açar; ⌘K / Ctrl+K komut paletine yazılan serbest metin "AI Asistanı'na sor" ile doğrudan sorulabilir; proje çubuğundaki **Zekâ** sekmesi aynı sohbeti tam ekranda gösterir. Sohbet ekranlar arasında korunur, yalnızca bellekte tutulur (sayfa yenilenince silinir).
- **Bağlam:** Her soruda modele kim olduğunuz (rol + kişi), hangi ekranda olduğunuz, açık proje ve görebildiğiniz projelerin adları gider — **veri gitmez**.
- **Araçlar (tool calling):** Model veriye ihtiyaç duyunca bir araç çağırır; araç **tarayıcıda**, uygulamanın test edilmiş hesap motorlarıyla çalışır ve yalnızca gereken özeti modele döndürür. Sayıları model değil, uygulama hesaplar. Panelde hangi araçların kullanıldığı etiket olarak görünür.
- **Onaylı değişiklik:** Asistan veriyi kendisi değiştirmez; değişiklik isteklerinde öneri kartı hazırlar, kullanıcı onaylarsa uygulanır (aşağıya bakın).

| Araç | Ne döndürür | Kapsam |
|---|---|---|
| `proje_listesi`, `proje_detayi`, `gorev_ara`, `risk_listesi` | Proje durumu, görevler, riskler, iş paketleri, hedefler | Görünür projeler |
| `portfoy_ozeti`, `evm_analizi`, `durum_raporu_taslagi`, `son_degisiklikler` | Sağlık skoru, dikkat gerektirenler, EVM, durum raporu, denetim günlüğü | Görünür projeler |
| `notlari_ara`, `musteri_istekleri` | Haftalık notlar, müşteri istekleri | Görünür projeler; **Müdür / PYB Sorumlusu'na hiç sunulmaz** |
| `kisi_profili`, `uygun_kisi_bul`, `doluluk_analizi`, `departman_karnesi`, `kapasite_talep`, `tahsis_ozeti`, `is_yuku_ongorusu`, `maliyet_raporu`, `veri_sagligi` | Kapasite, doluluk, tahsis, öngörü, maliyet, veri kalitesi | Tahsis / Veri Havuzu ekranlarıyla aynı (tüm roller) |

**Kapsam kuralı:** Asistan, kullanıcının arayüzde görebildiğinden fazlasını göremez (`utils/ai/scope.ts`). Proje içeriği `rbac.visibleProjectIds` ile sınırlıdır; yönetici rollerinde notlar ve müşteri istekleri veriden tamamen çıkarılır; **sicil numaraları hiçbir araç çıktısında yer almaz**. Araç sonuçları 12.000 karakterle, bir yanıt 6 araç adımıyla sınırlıdır.

**Ad maskeleme (varsayılan açık):** AI'ya giden her metinde (asistan sohbeti, araç sonuçları, ekran içi AI, rapor puanlama, anlamsal arama dizinlemesi) kişi, proje ve kurum (müşteri) adları tarayıcıda, gönderilmeden önce takma adlarla değiştirilir: `Kişi-0042`, `Proje-0007`, `Kurum-0013` (`utils/ai/masking.ts`). Modelin yanıtındaki ve araç çağrılarındaki takma adlar yine tarayıcıda gerçek adlara geri çevrilir; kullanıcı gerçek adları görür, sağlayıcı görmez. Uygulamadaki veri değişmez.
- Takma ad addan türetilir, oturumlar ve dizinleme arasında aynı kalır. Aynı adın farklı yazımları (büyük/küçük harf, "Soyad Ad") aynı takma ada gider. Tek kelimelik adlar yalnız büyük harfle başlıyorsa eşleşir; böylece sıradan kelimeler maskelenmez.
- Model takma ada ek getirirse ("Kişi-0042'in") ek, gerçek adın ses uyumuna göre düzeltilir ("Ali Veli'nin").
- Adlar çalışma alanından toplanır: veri havuzundaki kişiler, proje kaynakları, görev ve sürüm kalemi sorumluları, rapor yazarı / onaylayan gibi `…ByName` alanları, bölüm sorumluları, müşteri adları ve proje adları (en az 4 harf). Serbest metinde geçen ama çalışma alanında kayıtlı olmayan bir ad maskelenemez.
- Kapatmak için: Yönetici konsolu › Yapay zekâ › Kurum geneli › **Ad maskeleme**.

## Onaylı değişiklikler ve ekran içi AI özellikleri

**Asistan veriyi kendisi değiştirmez, öneri hazırlar.** Proje Yöneticisi ve Bölüm Sorumlusu rollerinde (kişi seçiliyken) asistana şu araçlar açılır: `oner_risk_ekle`, `oner_gorev_ekle`, `oner_gorev_durumu`, `oner_rag_guncelle`, `oner_tahsis_ayarla`.
- Araç yalnızca bir **öneri kartı** üretir (ne değişecek, önce/sonra). Veri, kullanıcı karttaki **Uygula** düğmesine basmadan değişmez.
- "Uygula" anında güncel veriyle **yeniden doğrulanır**: proje sahipliği (RBAC), plan kilidi (kilitli planda yalnızca gerçekleşen), kaydın hâlâ var olması, değer aralıkları (`utils/ai/actions.ts`).
- Her uygulama denetim günlüğüne **"AI önerisi uygulandı"** (`ai.apply`) olarak yazılır ve ekranın altında **Geri Al** sunulur. Aynı karta çift tıklama iki kez uygulamaz.
- Müdür, PYB Sorumlusu ve PYB Destek rollerine öneri araçları hiç sunulmaz.

**Ekranlara gömülü AI** (Ayarlar'da AI açıksa görünür; çıktı hiçbir zaman kendiliğinden kaydedilmez):

| Ekran | Düğme | Ne yapar |
|---|---|---|
| Durum Raporu | AI ile e-postaya dönüştür | Taslağı verileri değiştirmeden yönetici e-postasına çevirir; "Taslağa dön" ile geri alınır |
| Yönetim → Brifing | AI ile yönetici özeti yaz | Brifing verilerinden üst yönetime özet paragraf |
| Riskler | AI Risk Önerisi | Gecikmeler, notlar, PESTEL ve hedeflerden yeni risk önerir; seçilenler eklenir (yalnızca proje sahibi) |
| PESTEL / SWOT | AI ile taslak öner | Madde önerir; tek tek ya da tümü eklenir (yalnızca proje sahibi) |
| Görev formu | AI ile tahmin et | Benzer görevlerin tahminlerinden iyimser/ortalama/kötümser süre + gerekçe |

Yapılandırılmış çıktılar (öneri listeleri, süre tahmini) JSON modu gerektirmez: model yanıtından JSON güvenle ayıklanır ve doğrulanır (`utils/ai/json.ts`, `utils/ai/embedded.ts`); geçersiz/tekrar eden öneriler atılır.

## Bilgi tabanı (RAG)

Asistan, serbest metin içeriğinde `bilgi_ara` aracıyla arama yapar ve yanıtında kullandığı pasajları **[1], [2]** biçiminde kaynak göstererek verir. Yanıtın altındaki kaynaklara tıklayınca ilgili ekran açılır; kılavuz ve doküman kaynakları önizlenir.

**Kaynaklar:**
- **Uygulama içeriği** (rol kapsamlı): haftalık notlar, görev açıklama/yorum/alt görevleri, risk açıklama ve aksiyonları, müşteri istekleri, PESTEL/SWOT maddeleri, hedefler, iş paketleri, proje durum notları.
- **Kullanım kılavuzu**: uygulamayla gelen `utils/rag/guide.md`; "nasıl yapılır" soruları için.
- **Kurumsal dokümanlar**: Bilgi Bankası'na yüklenen PDF, Word (.docx), Markdown ve metin dosyaları. Metin tarayıcıda çıkarılır; taranmış (görüntü) PDF'lerde OCR yapılmaz.

**Akış:** kaynaklar → parçalama (~900 karakter, örtüşmeli) → BM25 anahtar kelime dizini (anında, bellekte) → embedding (isteğe bağlı, arka planda; yalnızca değişen parçalar) → hibrit arama (Reciprocal Rank Fusion) → kaynaklı yanıt.

- **Anahtar kelime araması her zaman çalışır**: Türkçe ek ve aksan duyarsızdır ("butce" → "bütçesi", "gecikmeler" → "gecikme").
- **Anlamsal arama** `AI_EMBEDDING_MODEL` tanımlanınca açılır. Embedding vektörleri cihazda (IndexedDB) "model:içerik özeti" anahtarıyla önbelleğe alınır, metin saklanmaz. İçerik değişmedikçe yeniden hesaplanmaz.
- **Kapsam:** Dizin her aramada kullanıcının güncel yetki kapsamından kurulur. Görünmeyen projeler dizine girmez; yönetici rollerinde notlar ve müşteri istekleri dizine girmez.
- **Dokümanlar bu cihazda (tarayıcıda) saklanır**, ekiple paylaşılmaz. Ekip genelinde paylaşılan bir doküman kütüphanesi için sunucu depolaması (ör. Supabase Storage) gerekir.
- **Doğruluk ölçümü:** `utils/rag/eval.test.ts` gerçekçi Türkçe sorulardan oluşan bir değerlendirme setiyle recall@3 ve MRR ölçer; `npm run test` her çalıştığında raporlar. Yalnızca anahtar kelime aramasıyla şu an recall@3 = 0,94, MRR = 0,95.

## 1. Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `AI_PROVIDER` | — | `openai` (varsayılan) · `azure` · `anthropic` · `gemini` |
| `AI_API_KEY` | ✔ | Kurumsal API anahtarı |
| `AI_MODEL` | ✔ | Model / dağıtım adı |
| `AI_BASE_URL` | azure'da ✔ | Uç nokta kökü. OpenAI-uyumlu kurum içi ağ geçitleri için de kullanılır |
| `AI_ACCESS_TOKEN` | koruma* | Paylaşılan erişim kodu (token modu) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | koruma* | Supabase oturumu + çalışma alanı üyeliği (supabase modu) |
| `AI_AUTH_MODE` | — | `token` · `supabase` · `none` — verilmezse yukarıdakilerden otomatik seçilir |
| `AI_ALLOWED_ORIGINS` | — | Proxy farklı bir adresteyse izinli uygulama kökenleri (virgülle) |
| `AI_MAX_OUTPUT_TOKENS` | — | Yanıt başına üst sınır (varsayılan 4096) |
| `AI_TEMPERATURE` | — | Örn. `0.3` |
| `AI_REASONING_EFFORT` | — | Akıl yürüten modellerde `reasoning_effort`: `none` · `minimal` · `low` · `medium` · `high` (OpenAI-uyumlu uçlar) |
| `AI_EXTRA_BODY` | — | Ağ geçidine özgü ek gövde alanları, JSON nesnesi (ör. `{"chat_template_kwargs":{"enable_thinking":false}}`); model/mesaj/araç alanlarını ezemez |
| `AI_RATE_LIMIT_PER_MIN` | — | Kişi/IP başına dakikalık istek sınırı (varsayılan 60; araç kullanan bir soru 2-4 istek üretir) |
| `AI_TIMEOUT_MS` | — | Sağlayıcı zaman aşımı (varsayılan 55000) |
| `AI_CA_CERTS` | — | Kurumsal sertifika zinciri (PEM; ara + kök). Sunucu ara sertifikayı göndermiyorsa ya da kök Node.js'in listesinde yoksa gerekir. `*.tubitak.gov.tr` için gerekmez, TÜBİTAK zinciri hazır gelir |
| `AI_EMBEDDING_MODEL` | — | Anlamsal arama için embedding modeli; verilmezse yalnızca anahtar kelime araması |
| `AI_EMBEDDING_PROVIDER` | Anthropic'te ✔ | `openai` · `azure` · `gemini` · `voyage`; varsayılan sohbet sağlayıcısı (Anthropic embedding sunmaz) |
| `AI_EMBEDDING_API_KEY` | farklı sağlayıcıda ✔ | Aynı sağlayıcıda `AI_API_KEY` kullanılır |
| `AI_EMBEDDING_BASE_URL` | — | Aynı sağlayıcıda `AI_BASE_URL`, yoksa sağlayıcının varsayılanı |
| `AI_EMBEDDING_DIMENSIONS` | — | Destekleyen modellerde vektör boyutu (ör. 512) |
| `AI_EMBED_RATE_LIMIT_PER_MIN` | — | Embedding isteği sınırı (varsayılan 120/dk; ilk dizinleme 32'şer parçalık partilerle yapılır) |

| `AI_ADMIN_TOKEN` | panel için ✔ | Yönetici panelinden bağlantı ayarı ve test için yönetici anahtarı (aşağıya bakın) |
| `AI_CONFIG_SECRET` | panel için ✔ | Panelde girilen API anahtarlarını şifreleyen anahtar (en az 32 karakter rastgele) |
| `SUPABASE_SERVICE_ROLE_KEY` | panel için* | Panel ayarlarının deposu: Supabase `app_settings` tablosu (`SUPABASE_URL` ile). **Yalnız sunucuda** tanımlanır |
| `AI_SETTINGS_FILE` | panel için* | Supabase yerine kendi Node sunucunuzda ayar dosyası yolu |

\* **Yayında erişim koruması zorunludur.** Ne `AI_ACCESS_TOKEN` ne de Supabase tanımlıysa proxy istekleri reddeder (aksi halde kurumsal anahtarın kotası internete açılırdı). Yalnızca kurum içi kapalı ağda `AI_AUTH_MODE=none` bilinçli olarak seçilebilir. Yerel geliştirmede (`npm run dev`) koruma gerekmez.

### Yönetici panelinden yapılandırma ve bağlantı testi

Yönetici konsolu › Yapay zekâ › **AI bağlantısı** kartında sağlayıcı, adres, model, API anahtarı, üretim ayarları ve embedding ayarları girilir; **Bağlantıyı test et** formdaki değerlerle (kaydetmeden) sağlayıcıya kısa bir istek atar, embedding modeli varsa onu da dener ve yanıt süresini ya da hatanın nedenini gösterir (anahtar reddi, model bulunamadı, adrese ulaşılamadı…).

- **Anahtar tarayıcıya girmez:** Panelde girilen değerler sunucuda saklanır ve okunurken ortam değişkenlerinin üzerine yazılır; boş alan ortam değişkenini kullanır. API anahtarları `AI_CONFIG_SECRET`'tan türetilen anahtarla AES-GCM ile şifrelenir; sunucu anahtarı tarayıcıya hiç döndürmez (yalnız son 4 hane gösterilir). Anahtar çalışma alanı verisine, yedeğe ya da bulut eşitlemeye girmez.
- **Yetki:** Uç (`/api/ai/admin`) yalnız `AI_ADMIN_TOKEN` ile çalışır; yönetici anahtarı panelde bir kez girilir ve yalnız o sekmenin oturumunda tutulur. Tanımlı değilse yayında panelden yapılandırma kapalıdır (yerel geliştirmede açıktır). Deneme sayısı IP başına sınırlıdır.
- **Depo:** Vercel'de `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` ile Supabase `app_settings` tablosu (`supabase/schema.sql`; RLS açık ve politika yok, yalnız sunucu erişir). Kendi Node sunucunuzda `AI_SETTINGS_FILE`. Yerel geliştirmede `.planasistan/ai-settings.json` (depoya girmez).
- **Panelden değişmeyenler:** Erişim koruması (`AI_AUTH_MODE`, `AI_ACCESS_TOKEN`), hız sınırları, izinli kökenler, zaman aşımı ve sertifikalar yalnız ortam değişkenidir.
- **Geri dönüş:** "Ortam değişkenlerine dön" panel ayarlarını siler. Ayar değişikliği denetim günlüğüne (anahtar olmadan) yazılır. Sunucusuz örnekler ayarları 30 sn önbellekte tutar; değişiklik en geç bu sürede tüm örneklere yayılır.

### Hızlı başlangıç: Google Gemini API (yalnız anahtar, test için)

Google AI Studio'nun "Get started" adımlarıyla alınan anahtar tek başına yeterlidir:

1. Google hesabıyla [Google AI Studio](https://aistudio.google.com/apikey)'yu açın, **Create API key** ile anahtar oluşturup kopyalayın.
2. **Sunucuda hiç ayar yoksa — yalnız bu tarayıcıda:** Yönetici konsolu › Yapay zekâ › AI bağlantısı › **Bu tarayıcıda AI bağlantısı** kutusunda sağlayıcı olarak Google Gemini'yi seçip anahtarı yapıştırın ve **Dene ve bu tarayıcıda kullan** deyin (ayrıntı aşağıda). Yönetici anahtarı, depo ya da yeniden yayın gerekmez; bağlantı 24 saat geçerlidir.
   **Herkes için panelden:** (AI_ADMIN_TOKEN ve depo kuruluysa) **Hızlı kurulum: Google Gemini API** kutusuna yapıştırıp **Gemini ile kur** deyin. Bağlantı test edilir ve sunucuya kaydedilir.
   **Ya da ortam değişkeniyle:** yalnız `GEMINI_API_KEY=<anahtar>` tanımlayın (Google SDK'larının kullandığı ad). Başka AI anahtarı yoksa sağlayıcı `gemini` olur. Yayında erişim koruması (`AI_ACCESS_TOKEN` ya da Supabase) yine gerekir.
3. **Model seçimi otomatik:** Model verilmemişse (ya da `auto` ise) sunucu anahtarla Gemini'nin model listesini (`GET https://generativelanguage.googleapis.com/v1beta/models`, `x-goog-api-key` başlığı) alır. Sohbet için en yüksek sürümlü kararlı **Flash** modelini seçer (önizleme, lite, görüntü ve ses modelleri hariç). Anlamsal arama için Gemini embedding modelini 768 boyutla seçer. Liste 1 saat önbellekte tutulur; Google yeni model yayımladığında ya da eskisini kaldırdığında seçim kendiliğinden güncellenir. Belirli bir modeli sabitlemek için `AI_MODEL` yazın ya da paneldeki **Listele** ile seçin. Anlamsal aramayı kapatmak için `AI_EMBEDDING_MODEL=none` verin.
4. **Sınırlar:** Ücretsiz katman denemek içindir. Dakikalık istek sınırı düşüktür; asistan araç kullanan bir soruda 2–4 istek atar, sınır aşılırsa "kota/hız sınırı" uyarısı çıkar. Google'ın koşullarına göre ücretsiz katmanda gönderilen içerik Google ürünlerini geliştirmek için kullanılabilir. Kurum verisiyle kalıcı kullanımda faturalı katmanı ve KVKK değerlendirmesini tercih edin. Gemini API her ülkede sunulmaz; bölge desteklenmiyorsa hata mesajı bunu söyler.

#### Bu tarayıcıda AI bağlantısı (sunucuda ayar gerekmez, 24 saat)

Sunucuda (Vercel ortam değişkenlerinde) hiç AI ayarı yokken, panel kapalıyken (AI_ADMIN_TOKEN yok) ya da kurum modeli dururken başka bir sağlayıcıyı denemek için tüm AI bilgileri yönetici konsolundan girilir:

- **Girilenler:** sağlayıcı (Google Gemini, OpenAI, Anthropic, Azure OpenAI), API anahtarı, model (Gemini'de boş bırakılırsa otomatik seçilir), Azure'da kaynak adresi; sunucu erişim kodu istiyorsa (`AI_ACCESS_TOKEN`) AI erişim kodu. **Dene ve bu tarayıcıda kullan** bağlantıyı kısa bir sohbet isteğiyle dener, çalışıyorsa kaydeder.
- **24 saat:** bağlantı ve erişim kodu bu tarayıcının deposunda (`localStorage`) 24 saat tutulur. Süre dolunca silinir; asistan "AI bağlantısının süresi doldu" der ve bu bölüm "Süresi doldu" etiketiyle açılıp bilgileri yeniden ister. **Değiştir / süreyi yenile** ile süre baştan başlar. Eski sürümde kaydedilmiş Gemini test anahtarı ve erişim kodu ilk okunuşta bu biçime 24 saatle taşınır.
- Bilgiler çalışma alanı verisine, buluta ve sunucu deposuna girmez. Her AI isteğinde `x-ai-api-key`, `x-ai-provider`, `x-ai-model` (Azure'da `x-ai-base-url`) başlıklarıyla uygulamanın proxy'sine gider; proxy o istek için bu bağlantıyı kullanır. Anahtar loglanmaz ve saklanmaz. Eski istemcilerin `x-gemini-api-key` başlığı Gemini bağlantısı olarak kabul edilir.
- **Adresler sabittir:** Gemini `generativelanguage.googleapis.com`, OpenAI `api.openai.com`, Anthropic `api.anthropic.com`; Azure'da yalnız `https://KAYNAK.openai.azure.com/…` kabul edilir. Başlıkla başka bir adrese istek gönderilemez; sunucudaki kurum anahtarı kullanılmaz ve hiçbir yanıtta dönmez. Kurum modeline özgü üretim ayarları (sıcaklık, en çok çıktı, akıl yürütme, ek alanlar) ve embedding ayarları taşınmaz.
- **Anlamsal arama:** Gemini'de otomatik seçilen Gemini embedding modeli, OpenAI'de `text-embedding-3-small` aynı anahtarla kullanılır; Anthropic ve Azure'da anahtar kelime araması yapılır.
- **Erişim koruması:** sunucuda erişim kodu ya da Supabase tanımlıysa aynen geçerlidir. Sunucuda hiç koruma tanımlı değilse bağlantılı istekler koruma aramaz (istek kurumun değil, isteği gönderenin kendi anahtarıyla gider); bağlantısız istekler yine reddedilir. Hız sınırı ve izinli kökenler geçerlidir; bağlantılı istekler ayrıca istemci IP'si başına dakikada 180 ile sınırlıdır.
- Yalnız bu tarayıcı etkilenir: diğer kullanıcılar ve cihazlar sunucu ayarıyla çalışır. Durum kartında kaynak "Bu tarayıcıdaki AI bağlantısı (24 saat)" görünür; anahtar geçersizleşirse asistan nedenini ve nereden değiştirileceğini söyler. **Kaldır** ile silinir.
- Gönderilen veri sunucu ayarındakiyle aynıdır: asistan sorunuza göre proje, görev ve kişi bilgilerini sağlayıcıya gönderir. Ad maskeleme açıkken (varsayılan) kişi, proje ve kurum adları takma adla gider; sicil numaraları her durumda maskelenir.
- Gemini modeli otomatik seçildiyse ve yoğunsa (HTTP 503) proxy isteği kısa bir beklemeyle bir kez yeniden dener, olmazsa sıradaki kararlı Flash modeline, sonra Flash-Lite'a geçer (kota dolduğunda, HTTP 429, beklemeden geçer).
- Paylaşılan bilgisayarda kullanmayın. Kalıcı ve herkes için kurulum sunucu ayarıyla (ortam değişkeni ya da panel deposu) yapılır. Kurum bu kipi istemiyorsa sunucuya `AI_ALLOW_BROWSER_KEY=0` ekleyin; o zaman bağlantılı istekler sessizce kurum modeline düşmez, "kapalı" uyarısı verir.

## 2. Sağlayıcı örnekleri

```bash
# OpenAI
AI_PROVIDER=openai
AI_MODEL=<model-adı>

# Azure OpenAI (v1 uç noktası)
AI_PROVIDER=azure
AI_BASE_URL=https://<kaynak>.openai.azure.com/openai/v1
AI_MODEL=<dağıtım-adı>

# Anthropic
AI_PROVIDER=anthropic
AI_MODEL=<model-adı>

# Google Gemini (Google AI Studio anahtarıyla; model ve embedding otomatik — aşağıya bakın)
GEMINI_API_KEY=<AIza…>
# ya da açıkça: AI_PROVIDER=gemini, AI_API_KEY=<anahtar>, AI_MODEL=<model-adı | auto>

# TÜBİTAK BİLGEM AI API (OpenAI-uyumlu)
AI_PROVIDER=openai
AI_BASE_URL=https://ai-api.bilgem.tubitak.gov.tr/v1
AI_MODEL=general            # Qwen3.8 Flash Next · 256K bağlam  (alternatif: code → DeepSeek Flash v4.1 · 1M bağlam)
AI_REASONING_EFFORT=medium  # varsayılan "en yüksek" yavaş olabilir; sohbet için medium/low önerilir
AI_MAX_OUTPUT_TOKENS=8192   # akıl yürütme token'ları da bu sınıra dahildir

# Kurum içi / OpenAI-uyumlu (vLLM, Ollama, LiteLLM, kurumsal ağ geçidi)
AI_PROVIDER=openai
AI_BASE_URL=https://llm.kurum.local/v1
AI_MODEL=<model-adı>

# Anlamsal arama (isteğe bağlı) — aynı sağlayıcı
AI_EMBEDDING_MODEL=<embedding-modeli>

# Anthropic sohbet + ayrı embedding sağlayıcısı
AI_PROVIDER=anthropic
AI_EMBEDDING_PROVIDER=voyage
AI_EMBEDDING_API_KEY=...
AI_EMBEDDING_MODEL=<embedding-modeli>
```

## 3. Yerel geliştirme

Proje kökünde `.env.local` oluşturun (`*.local` git'e girmez; şablon: `.env.example`):

```bash
AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL=...
```

`npm run dev` → Zekâ sekmesi. Vite, `/api/ai/*` isteklerini aynı proxy koduna yönlendirir; değişkenler yalnızca Node tarafında okunur.

## 4. Vercel'de yayın

1. Vercel → Project → **Settings → Environment Variables**: `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL` (+ gerekirse `AI_BASE_URL`) ve bir erişim koruması (`AI_ACCESS_TOKEN` **veya** `SUPABASE_URL` + `SUPABASE_ANON_KEY`).
2. Yeniden dağıtın. `api/ai/*` otomatik olarak sunucusuz fonksiyon olur (`vercel.json`'da süre sınırı 60 sn).
3. Doğrulama: `https://<site>/api/ai/health` → `{"configured":true,...}`. Bu yanıt anahtar içermez.

**Erişim modları:**
- **token:** Kullanıcılar Zekâ ekranında erişim kodunu bir kez girer (yalnızca o cihazda saklanır). Kodu değiştirmek için `AI_ACCESS_TOKEN`'ı güncelleyip yeniden dağıtmanız yeterli.
- **supabase:** Bulut senkronizasyonuyla giriş yapmış ve `workspace_members` tablosunda üyeliği olan kullanıcılar asistanı kullanır; ayrı kod gerekmez.

## 5. Başka barındırma seçenekleri

- **GitHub Pages / statik barındırma:** Sunucu kodu çalışmaz. Proxy'yi ayrı bir yerde çalıştırın, derlemede `VITE_AI_PROXY_URL=https://proxy.kurum.local/api/ai` verin ve proxy'de `AI_ALLOWED_ORIGINS` ile uygulamanın adresine izin verin. (`VITE_AI_PROXY_URL` gizli değildir.)
- **Kurum içi Node sunucusu:** `server/ai/nodeAdapter.ts` içindeki `createAiMiddleware`, connect/express uyumlu bir ara katmandır:

  ```ts
  import express from 'express';
  import { createAiMiddleware } from './server/ai/nodeAdapter';
  const app = express();
  app.use('/api/ai', createAiMiddleware(() => process.env));
  app.use(express.static('dist'));
  app.listen(8080);
  ```

## 6. Akıl yürüten modeller ve kurum içi API'ler

- **Düşünme çıktısı gösterilmez:** Ağ geçidi düşünmeyi ayrı alanda (`reasoning_content`) veriyorsa yok sayılır; metin içinde `<think>…</think>` olarak geliyorsa istemci ayıklar.
- **Hız:** "En yüksek" akıl yürütme her araç adımını yavaşlatır. Vercel'deki 60 sn süre sınırına takılmamak için `AI_REASONING_EFFORT=medium` (ya da `low`) ve gerekirse `AI_TIMEOUT_MS` / `vercel.json` `maxDuration` ayarı önerilir.
- **Araç çağrısı:** Asistan veriye araçlarla eriştiği için modelin/sunucunun OpenAI biçiminde *tool calling* desteklemesi gerekir (vLLM'de `--enable-auto-tool-choice --tool-call-parser …`). Desteklenmiyorsa asistan bunu açık bir hata mesajıyla bildirir.
- **Sertifika:** BİLGEM sunucusu ara sertifikayı göndermiyor ve TÜBİTAK kök sertifikası (Sürüm 2) Node.js'in güven listesinde yok; tarayıcı sorunsuz açsa da Node.js bağlantıyı reddeder. Proxy bu yüzden `*.tubitak.gov.tr` adreslerinde TÜBİTAK Kamu SM zincirini (`server/ai/certs.ts`) kendiliğinden ekler; yalnızca bu isteklerde, Node.js'in kendi listesine ek olarak. Başka bir kurumsal API'de aynı sorun varsa zinciri `AI_CA_CERTS` ile verin. Doğrulama hiçbir koşulda kapatılmaz.
- **Bağlantı hataları:** Asistan, ulaşılamayan sağlayıcıda nedeni yazar: *sertifika doğrulanamadı* → `AI_CA_CERTS`; *alan adı çözümlenemedi* / *bağlantı kurulamadı* → adres yanlış ya da sunucu bu ağdan (ör. Vercel'den) erişilebilir değil. Vercel'de aynı bilgi fonksiyon loglarında `[ai] sağlayıcıya bağlanılamadı` satırında görünür.
- **Ağ erişimi:** Proxy'nin API'ye ulaşabilmesi gerekir. API yalnızca kurum ağından erişilebiliyorsa proxy Vercel yerine kurum içinde çalıştırılmalıdır (bkz. 5. bölüm, Node ara katmanı); veri de böylece kurum dışına çıkmaz.
- **Embedding:** Kurum API'sinde embedding modeli yoksa RAG anahtar kelime aramasıyla çalışır; varsa `AI_EMBEDDING_MODEL` ile açılır.

## 7. Güvenlik notları

- Kurum anahtarı yalnızca sunucudadır: proxy'nin ortam değişkeninde ya da yönetici panelinden girildiyse sunucu deposunda şifreli; `/health` yalnızca sağlayıcı ve model adını gösterir. Tek istisna yöneticinin kendi tarayıcısında 24 saatliğine kullandığı AI bağlantısıdır (yalnız o tarayıcıda; adresler sabit; `AI_ALLOW_BROWSER_KEY=0` ile kapatılır).
- Mesaj içerikleri loglanmaz; sağlayıcı hata mesajları kısaltılıp anahtar içermeden iletilir.
- Model yanıtları HTML olarak yorumlanmaz (`components/Markdown.tsx`), bu yüzden modelin ürettiği betik çalışamaz.
- İstek boyutu, mesaj sayısı ve sistem talimatı sınırlıdır (`utils/ai/protocol.ts` → `AI_LIMITS`).
- Hız sınırı sunucusuz örnek başınadır; kotayı tamamen korumaz. Asıl koruma erişim modudur.
