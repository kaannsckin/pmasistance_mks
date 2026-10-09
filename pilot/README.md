# PlanAsistan pilotu — sahte veri + yapay zekâ kullanıcıları

Uygulamayı, gerçek veri olmadan, her gün "kullanılıyormuş gibi" sınamak için iki rutin:

| Rutin | Ne yapar | Talimat |
|---|---|---|
| **1. Jira ajanı** (07:45) | Kurgusal birimin bir gününü üretir. **Sahte Jira**: yeni kayıt, işe başlama, worklog, kapanış, yeniden açılma; gerçek Jira REST API'siyle aynı biçimde. Ayrıca Confluence tarzı toplantı/karar notları, arka plandaki birim (haftalık rapor akışı, ay başı gerçekleşen adam-ay, KALKAN'ın PY'si), ara sıra müşteri isteği ve yönetimden beklenti. Yapay zekâ günün akışına uygun notlar ekler. | [`RUTIN_1_VERI.md`](./RUTIN_1_VERI.md) |
| **2. Rol ajanları** (08:45) | Otomatik kontroller; sonra 5 rol ajanı uygulamayı MCP üzerinden kendi rolleriyle **günde bir kez** kullanır. PY'ler güne Jira'dan aktarımla başlar (`jira_aktar`). Ajanlar dünkü mesajları yanıtlar, yenilerini bırakır (ertesi gün okunur). Günün raporu ve bulgular PR'a yorum olarak düşer. | [`RUTIN_2_KULLANICILAR.md`](./RUTIN_2_KULLANICILAR.md) |

Veri ve raporlar **`claude/pilot-veri`** dalında tutulur (kod dalına karışmaz): `pilot-data/`.

## Kurgusal birim

5 bölüm (U300 PYB, U310 Yazılım, U320 Test, U330 Sistem, U340 Veri ve YZ), 24 kişi, 5 proje:

| Proje | Jira | PY | Durum | Özellik |
|---|---|---|---|---|
| ATLAS Karar Destek Sistemi | ATL | Elif Yılmaz | Devam, plan **kilitli** | Dengeli; ekipte kapasite üstü iki kişi (KALKAN ile paylaşılan) |
| PUSULA Saha Mobil Uygulaması | PSL | Burak Demir | Devam, plan onayda | Sınırda; PY bazen raporu geç gönderir |
| NEHİR Veri Platformu | NHR | Burak Demir | Devam | Hata yükü yüksek, yeniden açılan kayıtlar; giderek kritikleşir |
| KALKAN Siber İzleme | KLK | Can Erdem | Devam | Küçük ekip |
| YILDIZ Test Otomasyonu | — | Derya Aksoy | Teklif | Jira akışı yok; Kasım'dan itibaren plan |

Veri kalitesi denetimi için bilerek konmuş kusurlar: ünvanı olmayan bir kişi (maliyetlenemez), yarı zamanlı ama fazla tahsisli bir kişi, "Harici Danışman"a atanmış (havuz dışı) kayıtlar, tahminsiz kayıtlar.

## Pilot kullanıcıları

| Persona | Kişi | Rol | Ne test eder |
|---|---|---|---|
| `elif` | Elif Yılmaz | Proje Yöneticisi (ATLAS) | Proje durumu, gecikme, risk, görev ve rapor; kilitli plan |
| `burak` | Burak Demir | Proje Yöneticisi (PUSULA + NEHİR) | İki proje karşılaştırması, hata yükü, kaynak talebi |
| `selin` | Selin Kaya | Bölüm Sorumlusu (U310) | Doluluk, aşırı tahsis, uygun kişi, departman karnesi |
| `mert` | Mert Aydın | PYB Destek | Veri tutarlılığı, maliyet ↔ tahsis, raporlar |
| `ahmet` | Ahmet Şahin | Müdür | Portföy özeti, EVM, kapasite-talep; notları göremez |

Kimlikler, karakterler ve günlük işler: `server/pilot/world.ts` (`npm run -s pilot -- personalar`).

## Sahte Jira

Proje yöneticileri gerçek Jira yerine 1. rutinin ürettiği Jira'yı kullanır. Biçim gerçek Jira ile aynıdır: `pilot-data/jira/<ANAHTAR>.json` dosyaları `GET /rest/api/2/search?expand=changelog` yanıtıdır (alanlar, durum geçmişi, worklog, termin). `server/pilot/mockJira.ts`, uygulamanın kullandığı Jira REST uçlarını (`search`, `search/jql`, `issue/{key}`, `issue/{key}/worklog`, `status`, `field`, `project/{key}`) bu dosyalardan sunar. Uygulamanın Jira istemcisi (`server/integrations/handler.ts`) **değiştirilmeden** buna bağlanır:

- **MCP'de** (2. rutin): `jira_aktar` (Planlama › "Jira'dan geçmiş" ile aynı birleştirme; önizleme önerisi → onay) ve `jira_worklog`.
- **Tarayıcıdaki uygulamada**: `npm run -s pilot -- jira-sunucu` sahte Jira'yı `http://127.0.0.1:8787` adresinde açar. `.env.local`'a `JIRA_BASE_URL=http://127.0.0.1:8787` ve `JIRA_TOKEN=pilot` yazıp `npm run dev` ile açın. Sonra `pilot-data/workspace.json`'ı **JSON yedek yükle** ile yükleyin; Planlama › "Jira'dan geçmiş" ve haftalık rapordaki "Jira'dan çek" pilot verisiyle çalışır. Sahte Jira salt-okunurdur ("Jira'ya gönder" reddedilir).

Persona PY'lerin projeleri (ATLAS, PUSULA, NEHİR) uygulamaya otomatik aktarılmaz: Jira her gün ilerler, uygulamadaki görev listesi PY aktarana kadar bayat kalır. RAG ve riskleri de PY'ler kendileri günceller; simülasyonun ürettiği riskler olaylar dosyasında "ekipten sinyal" olarak görünür.

## Elle kullanım

```bash
npm ci && npm run build:mcp && npm run build:pilot

npm run -s pilot -- baslat                 # dünü dahil ~4 aylık geçmiş (tohum 2026)
npm run -s pilot -- gun                    # bir sonraki günler (varsayılan: düne kadar)
npm run -s pilot -- not --proje ATL --baslik "Müşteri toplantısı" --metin "- Karar: …"
npm run -s pilot -- ozet

npm run -s pilot -- araclar elif           # Elif'in görebildiği MCP araçları
npm run -s pilot -- arac elif jira_aktar                 # Jira'dan aktarım önizlemesi (öneri)
npm run -s pilot -- arac elif jira_aktar --onayla        # önizleme + aktarım
npm run -s pilot -- arac mert jira_worklog '{"proje":"NHR-2403","baslangic":"2026-10-01"}'
npm run -s pilot -- arac elif proje_detayi
npm run -s pilot -- arac burak gorev_ara '{"proje":"NHR-2403","geciken":true}'
npm run -s pilot -- arac elif oner_risk_ekle '{"baslik":"…","olasilik":3,"etki":4}'            # öneri (uygulanmaz)
npm run -s pilot -- arac elif oner_risk_ekle '{"baslik":"…","olasilik":3,"etki":4}' --onayla   # öneri + uygula
npm run -s pilot -- kontrol --cikti pilot-data/gunluk/$(date +%F)/kontrol.md
```

`arac` komutu MCP sunucusunu (Claude'un bağlandığı sunucunun aynısı) persona kimliğiyle çalıştırır; veri `pilot-data/workspace.json`'dur ve değişiklikler (yalnız pilot için) bu dosyaya yazılır. Aynı dosya uygulamada **JSON yedek yükle** ile açılıp ekranlarda incelenebilir.

`pilot-data/` içeriği:

| Yol | İçerik |
|---|---|
| `workspace.json` | Uygulamanın çalışma alanı (JSON yedeği biçiminde) |
| `jira/<ANAHTAR>.json` | Sahte Jira — Jira REST arama yanıtı biçiminde kayıtlar, changelog, worklog |
| `durum.json` | Simülasyonun iç durumu (kayıtların gerçek eforu, saat toplamları) |
| `olaylar/GG.md` | Günün akışı — kullanıcılar bunu okur |
| `confluence/*.md` | Toplantı/karar notları |
| `gunluk/GG/` | 2. rutinin kontrol sonucu, ajan çıktıları ve günün mesajları (`sohbet.md`; ertesi gün yanıtlanır) |
| `raporlar/GG.md`, `raporlar/OZET.md` | Günlük rapor ve gün gün özet tablosu |
| `bulgular.json` | Açık/kapanan bulgular (tekrar edenler izlenir) |

## Main'e alma ölçütü

`raporlar/OZET.md` her gün güncellenir. Öneri: **art arda 3 iş günü** otomatik kontrollerin tamamı geçtiyse ve açık "yüksek" önemde bulgu yoksa PR main'e alınabilir.
