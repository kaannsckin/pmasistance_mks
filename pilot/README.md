# PlanAsistan pilotu — sahte veri + yapay zekâ kullanıcıları

Uygulamayı, gerçek veri olmadan, her gün "kullanılıyormuş gibi" sınamak için iki rutin:

| Rutin | Ne yapar | Talimat |
|---|---|---|
| **1. Veri** | Kurgusal birimin bir gününü üretir: Jira akışı (yeni kayıt, işe başlama, worklog, kapanış, yeniden açılma), ay başında worklog → gerçekleşen adam-ay, Confluence tarzı toplantı/karar notları, Cuma haftalık rapor ve RAG, ara sıra risk, müşteri isteği, yönetimden beklenti. Ardından yapay zekâ günün akışına uygun gerçekçi notlar ekler. | [`RUTIN_1_VERI.md`](./RUTIN_1_VERI.md) |
| **2. Kullanıcılar** | Otomatik kontrolleri çalıştırır, sonra beş pilot kullanıcısı (yapay zekâ ajanı) uygulamayı MCP üzerinden kendi rolleriyle kullanır, birbirine yazar, yanıtlar; günün raporu ve bulgular çıkar. | [`RUTIN_2_KULLANICILAR.md`](./RUTIN_2_KULLANICILAR.md) |

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

## Elle kullanım

```bash
npm ci && npm run build:mcp && npm run build:pilot

npm run -s pilot -- baslat                 # dünü dahil ~4 aylık geçmiş (tohum 2026)
npm run -s pilot -- gun                    # bir sonraki günler (varsayılan: düne kadar)
npm run -s pilot -- not --proje ATL --baslik "Müşteri toplantısı" --metin "- Karar: …"
npm run -s pilot -- ozet

npm run -s pilot -- araclar elif           # Elif'in görebildiği MCP araçları
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
| `durum.json` | Simülasyon durumu (Jira kayıtları, saatler) |
| `olaylar/GG.md` | Günün akışı — kullanıcılar bunu okur |
| `confluence/*.md` | Toplantı/karar notları |
| `gunluk/GG/` | 2. rutinin kontrol sonucu, kullanıcı çıktıları ve sohbet |
| `raporlar/GG.md`, `raporlar/OZET.md` | Günlük rapor ve gün gün özet tablosu |
| `bulgular.json` | Açık/kapanan bulgular (tekrar edenler izlenir) |

## Main'e alma ölçütü

`raporlar/OZET.md` her gün güncellenir. Öneri: **art arda 3 iş günü** otomatik kontrollerin tamamı geçtiyse ve açık "yüksek" önemde bulgu yoksa PR main'e alınabilir.
