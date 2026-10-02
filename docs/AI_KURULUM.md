# Kurumsal AI Asistanı — Kurulum

PlanAsistan'ın AI asistanı, kurumsal API anahtarını **yalnızca sunucuda** tutan küçük bir proxy üzerinden çalışır. Tarayıcıya, derlenmiş JS paketine ya da depoya hiçbir anahtar girmez.

```
Tarayıcı (Zekâ ekranı) ──► /api/ai/chat  (proxy: anahtar burada) ──► Kurumsal LLM sağlayıcısı
                       ◄── NDJSON akışı ◄──────────────────────────── SSE akışı
```

| Bileşen | Dosya |
|---|---|
| Proxy çekirdeği (çatıdan bağımsız) | `server/ai/handler.ts` |
| Sağlayıcı adaptörleri | `server/ai/providers.ts` |
| Erişim koruması / hız sınırı | `server/ai/auth.ts`, `server/ai/rateLimit.ts` |
| Vercel fonksiyonları | `api/ai/chat.ts`, `api/ai/health.ts` |
| Yerel geliştirme ara katmanı | `vite.config.ts` → `server/ai/nodeAdapter.ts` |
| Tarayıcı istemcisi | `utils/ai/client.ts` |

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
| `AI_RATE_LIMIT_PER_MIN` | — | Kişi/IP başına dakikalık istek sınırı (varsayılan 20) |
| `AI_TIMEOUT_MS` | — | Sağlayıcı zaman aşımı (varsayılan 55000) |

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

# Kurum içi / OpenAI-uyumlu (vLLM, Ollama, LiteLLM, kurumsal ağ geçidi)
AI_PROVIDER=openai
AI_BASE_URL=https://llm.kurum.local/v1
AI_MODEL=<model-adı>
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

## 6. Güvenlik notları

- Anahtar yalnızca proxy'nin ortam değişkenindedir; `/health` yalnızca sağlayıcı ve model adını gösterir.
- Mesaj içerikleri loglanmaz; sağlayıcı hata mesajları kısaltılıp anahtar içermeden iletilir.
- Model yanıtları HTML olarak yorumlanmaz (`components/Markdown.tsx`), bu yüzden modelin ürettiği betik çalışamaz.
- İstek boyutu, mesaj sayısı ve sistem talimatı sınırlıdır (`utils/ai/protocol.ts` → `AI_LIMITS`).
- Hız sınırı sunucusuz örnek başınadır; kotayı tamamen korumaz. Asıl koruma erişim modudur.
