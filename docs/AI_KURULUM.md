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

\* **Yayında erişim koruması zorunludur.** Ne `AI_ACCESS_TOKEN` ne de Supabase tanımlıysa proxy istekleri reddeder (aksi halde kurumsal anahtarın kotası internete açılırdı). Yalnızca kurum içi kapalı ağda `AI_AUTH_MODE=none` bilinçli olarak seçilebilir. Yerel geliştirmede (`npm run dev`) koruma gerekmez.

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

# Google Gemini
AI_PROVIDER=gemini
AI_MODEL=<model-adı>

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

- Anahtar yalnızca proxy'nin ortam değişkenindedir; `/health` yalnızca sağlayıcı ve model adını gösterir.
- Mesaj içerikleri loglanmaz; sağlayıcı hata mesajları kısaltılıp anahtar içermeden iletilir.
- Model yanıtları HTML olarak yorumlanmaz (`components/Markdown.tsx`), bu yüzden modelin ürettiği betik çalışamaz.
- İstek boyutu, mesaj sayısı ve sistem talimatı sınırlıdır (`utils/ai/protocol.ts` → `AI_LIMITS`).
- Hız sınırı sunucusuz örnek başınadır; kotayı tamamen korumaz. Asıl koruma erişim modudur.
