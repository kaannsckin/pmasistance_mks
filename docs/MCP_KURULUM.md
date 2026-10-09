# Claude Bağlantısı (MCP) — Kurulum

PlanAsistan, **Model Context Protocol (MCP)** sunucusuyla Claude'a bağlanır. Bağlandıktan sonra Claude Desktop ya da Claude Code'da portföyünüzü doğal dille sorgulayabilir, rapor ve analiz hazırlatabilir, isterseniz onaylı değişiklik (risk/görev ekleme, görev durumu, RAG, tahsis) yaptırabilirsiniz.

Sunucu, uygulamadaki AI asistanının **araç kataloğunun aynısını** kullanır (`utils/ai/tools.ts`). Kapsam kuralları da aynıdır: yapılandırdığınız kimlik (rol + kişi) uygulamada neyi görüyorsa Claude da yalnızca onu görür. Sayıları model değil uygulamanın hesap motorları üretir, sicil numaraları hiçbir çıktıya girmez.

```
Claude Desktop / Claude Code ──stdio──► planasistan-mcp.mjs ──► Supabase (canlı veri, kendi hesabınızla, RLS geçerli)
                                         │                  └─► ya da JSON yedeği (salt-okunur)
                                         └─ araçlar: rol kapsamlı, uygulamanın hesap motorlarıyla çalışır
```

| Bileşen | Dosya |
|---|---|
| MCP protokolü (JSON-RPC, taşımadan bağımsız) | `server/mcp/protocol.ts` |
| Araç uyarlayıcısı, kimlik, öneri → uygula akışı | `server/mcp/planasistan.ts` |
| Veri kaynakları (Supabase, JSON yedeği) | `server/mcp/source.ts` |
| Ortam değişkenleri | `server/mcp/config.ts` |
| stdio giriş noktası | `server/mcp/stdio.ts` |
| Derleme | `vite.mcp.config.ts` → `dist-mcp/planasistan-mcp.mjs` |

## Örnek istekler

- "Portföyde kritik durumdaki projeleri ve nedenlerini tablo olarak ver."
- "ALTAY projesinin geciken görevleri ve en yüksek riskleri neler? Haftalık durum raporu taslağı hazırla."
- "U310 bölümünde Eylül'de kapasitesi aşılan kimler var? Uygun kişi öner."
- "2026 yılı için plan ve gerçekleşen adam-ay farkı en büyük 5 proje hangileri?"
- "Notlarda bütçe artışından bahsedilen haftaları bul." (anahtar kelime araması)
- (Değişiklik açıksa) "ALTAY'a 'Tedarik gecikmesi' riskini olasılık 4, etki 5 ile ekle." → Claude öneriyi gösterir, onaylarsanız uygular.

## 1. Derleme

Node.js 20 ya da üstü gerekir.

```bash
npm install
npm run build:mcp     # → dist-mcp/planasistan-mcp.mjs (tek dosya, bağımlılıklar içinde)
```

Çıkan dosya tek başına çalışır; istediğiniz bir klasöre kopyalayabilirsiniz. Kod güncellenince komutu yeniden çalıştırıp Claude'u yeniden başlatın.

## 2. Veri kaynağını seçin

Uygulama yerel-öncelikli çalışır (veri tarayıcıda). MCP sunucusu veriyi iki yerden okuyabilir — **yalnız birini** verin:

| | A) JSON yedeği | B) Supabase |
|---|---|---|
| Ne zaman | Bulut senkronizasyonu kurulu değilse, hızlı deneme | Bulut senkronizasyonu kuruluysa ([`supabase/KURULUM.md`](../supabase/KURULUM.md)) |
| Veri | Yedeği aldığınız andaki veri (dosya değişince yeniden okunur) | Canlı (15 sn önbellek) |
| Değişiklik | Yok (salt-okunur) | İsteğe bağlı (`PLANASISTAN_MCP_WRITE=1`) |
| Kimlik | Yedeği alan tarayıcıdaki rol + kişi (değiştirilebilir) | Bulut üyelik rolü (değiştirilebilir) |
| Notlar / istekler | Yedekte ne varsa | RLS: Müdür ve PYB Sorumlusu hesapları okuyamaz |

**A) JSON yedeği:** Uygulamada sağ üstteki **JSON yedek indir** ile çalışma alanı yedeğini alın ve dosya yolunu `PLANASISTAN_WORKSPACE_FILE` olarak verin. Yeni yedek aynı dosyanın üzerine kaydedilirse Claude bir sonraki soruda güncel veriyi görür.

**B) Supabase:** Uygulamanın Bulut penceresinde kullandığınız proje adresi ve anon anahtar ile **kendi** e-posta/parolanız. Hesap bir çalışma alanının üyesi olmalıdır; birden fazlaysa `PLANASISTAN_WORKSPACE_ID` ile seçin.

## 3. Claude'a ekleyin

### Claude Desktop

Ayarlar › Geliştirici › **Yapılandırmayı düzenle** ile `claude_desktop_config.json` dosyasını açın (Windows: `%APPDATA%\Claude\claude_desktop_config.json`, macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`) ve ekleyin:

```json
{
  "mcpServers": {
    "planasistan": {
      "command": "node",
      "args": ["C:\\PlanAsistan\\dist-mcp\\planasistan-mcp.mjs"],
      "env": {
        "PLANASISTAN_WORKSPACE_FILE": "C:\\Users\\ad.soyad\\Downloads\\planasistan-yedek.json"
      }
    }
  }
}
```

Supabase ile (canlı veri + onaylı değişiklik):

```json
{
  "mcpServers": {
    "planasistan": {
      "command": "node",
      "args": ["/Users/ad/PlanAsistan/dist-mcp/planasistan-mcp.mjs"],
      "env": {
        "PLANASISTAN_SUPABASE_URL": "https://xxxx.supabase.co",
        "PLANASISTAN_SUPABASE_ANON_KEY": "eyJ...",
        "PLANASISTAN_EMAIL": "ad.soyad@kurum.gov.tr",
        "PLANASISTAN_PASSWORD": "...",
        "PLANASISTAN_ROLE": "py",
        "PLANASISTAN_PERSON": "Ayşe Kaya",
        "PLANASISTAN_MCP_WRITE": "1"
      }
    }
  }
}
```

Claude Desktop'ı tamamen kapatıp yeniden açın. Sohbet kutusundaki araç menüsünde **planasistan** görünür. İlk deneme için: *"PlanAsistan bağlantısı çalışıyor mu?"* — Claude `planasistan_durum` aracıyla kaynak, kimlik ve değişiklik iznini gösterir.

> `node` PATH'te değilse `command` alanına tam yolu yazın (ör. `C:\\Program Files\\nodejs\\node.exe`).

### Claude Code

```bash
claude mcp add planasistan \
  -e PLANASISTAN_WORKSPACE_FILE=/yol/planasistan-yedek.json \
  -- node /yol/PlanAsistan/dist-mcp/planasistan-mcp.mjs
```

Supabase için `-e` ile aynı değişkenleri verin. `claude mcp list` bağlantıyı gösterir; oturumda `/mcp` ile durum görülür.

## Ortam değişkenleri

| Değişken | Açıklama |
|---|---|
| `PLANASISTAN_WORKSPACE_FILE` | A) JSON yedeğinin yolu |
| `PLANASISTAN_SUPABASE_URL`, `PLANASISTAN_SUPABASE_ANON_KEY` | B) Supabase proje adresi ve anon anahtar |
| `PLANASISTAN_EMAIL`, `PLANASISTAN_PASSWORD` | B) Supabase hesabınız |
| `PLANASISTAN_WORKSPACE_ID` | B) Birden fazla çalışma alanı üyeliğiniz varsa seçilecek olan |
| `PLANASISTAN_ROLE` | `mudur`, `pyb_sorumlu`, `pyb_destek`, `py`, `bolum_sorumlu`, `admin`. Verilmezse: Supabase'de üyelik rolü, yedekte yedeği alan tarayıcıdaki rol |
| `PLANASISTAN_PERSON` | Kişi adı soyadı (veri havuzundan). **Proje Yöneticisi ve Bölüm Sorumlusu rollerinde zorunlu** (kapsamı belirler) |
| `PLANASISTAN_PROJECT` | Proje belirtilmeyen sorularda kullanılacak proje (ad ya da kod). Verilmezse ve tek proje görünüyorsa o proje |
| `PLANASISTAN_MCP_WRITE` | `1`: değişiklik araçlarını açar (yalnız Supabase, yalnız Proje Yöneticisi / Bölüm Sorumlusu kimliği) |
| `JIRA_BASE_URL` + `JIRA_TOKEN` (ya da `JIRA_EMAIL` + `JIRA_API_TOKEN`), `JIRA_ALLOWED_PROJECTS`, `JIRA_STORY_POINTS_FIELD` | Uygulama sunucusuyla aynı Jira ayarları. Verilirse `jira_aktar` (PY: Jira kayıt geçmişini projeye aktarır; önizleme önerisi → onay, Planlama › "Jira'dan geçmiş" ile aynı birleştirme) ve `jira_worklog` (worklog özeti) araçları açılır. Kurum sertifikası gerekiyorsa `AI_CA_CERTS` |
| `PLANASISTAN_FILE_WRITE` | `1`: **yalnız test/pilot için** JSON yedeğini yazılabilir yapar; değişiklik dosyaya yazılır (dosya okunduktan sonra değiştiyse çakışma verilir). Uygulama değişikliği ancak dosya yeniden içe aktarılınca görür. Bkz. [`pilot/README.md`](../pilot/README.md) |

## Kimlik ve yetki

- Claude, uygulamadaki **aynı kapsam kurallarına** tabidir (`utils/ai/scope.ts`, `utils/rbac.ts`): Proje Yöneticisi kendi projelerini, Bölüm Sorumlusu bölümünün işlerini görür; Müdür ve PYB Sorumlusu'na not ve müşteri isteği araçları hiç sunulmaz.
- Rol, uygulamadaki profil seçimi gibi ayardan değiştirilebilir (`PLANASISTAN_ROLE`); bu, uygulamanın bugünkü istemci tarafı RBAC modeliyle aynıdır. Sunucu tarafı koruma Supabase RLS'tir: notlar ve müşteri istekleri, hesabın bulut rolü izin vermiyorsa hiçbir ayarla okunamaz.
- Yönetici konsolu › Yapay zekâ ayarlarına uyulur: AI kurum genelinde kapalıysa MCP araçları çalışmaz; "değişiklik önerileri" kapalıysa öneri araçları sunulmaz.

## Değişiklikler (onaylı, iki adım)

Değişiklik varsayılanda **kapalıdır**. `PLANASISTAN_MCP_WRITE=1` ile ve Supabase kaynağında, Proje Yöneticisi ya da Bölüm Sorumlusu kimliğiyle açılır. Akış uygulamadaki öneri kartıyla aynıdır:

1. Claude bir `oner_*` aracı çağırır (`oner_risk_ekle`, `oner_gorev_ekle`, `oner_gorev_durumu`, `oner_rag_guncelle`, `oner_tahsis_ayarla`). Araç yetkiyi ve plan kilidini doğrular, **hiçbir şeyi değiştirmeden** bir öneri (`oneri_id`, özet, "0,5 → 1" gibi ayrıntılar) döndürür.
2. Claude öneriyi size gösterir. Onaylarsanız `oneriyi_uygula` çağrılır: öneri **güncel buluttaki veriyle yeniden doğrulanır** (yetki, plan kilidi, kaydın hâlâ var olması), sonra iyimser sürüm kontrolüyle yazılır. Arada başkası aynı projeyi değiştirdiyse hiçbir şey ezilmez; Claude çakışmayı bildirir. `oneriyi_uygula` MCP'de "veri değiştiren" araç olarak işaretlidir; Claude uygulamaları araç çağrısından önce ayrıca onay ister (istemcideki izin ayarınıza bağlı).
3. Uygulamada değişikliği görmek için Bulut penceresinden **Buluttan Çek** yapın.

> Claude'a değişiklik yaptırmadan önce tarayıcıdaki değişikliklerin buluta gönderilmiş olduğundan emin olun (otomatik senkronizasyon birkaç saniyede gönderir). Aksi hâlde tarayıcı sonraki gönderimde çakışma bildirir; "Buluttan Çek" yerel, gönderilmemiş değişiklikleri buluttakiyle değiştirir.

Öneriler 30 dakika geçerlidir. Proje silme/oluşturma, haftalık rapor ve plan onayı gibi işlemler MCP üzerinden yapılmaz.

## Araçlar

| Araç | Ne yapar |
|---|---|
| `planasistan_durum` | Bağlantı, veri kaynağı, kimlik, varsayılan proje ve değişiklik izni |
| `proje_listesi`, `proje_detayi`, `gorev_ara`, `risk_listesi`, `portfoy_ozeti`, `evm_analizi`, `durum_raporu_taslagi` | Proje, görev, risk, sağlık skoru, EVM, durum raporu |
| `kisi_profili`, `uygun_kisi_bul`, `doluluk_analizi`, `departman_karnesi`, `kapasite_talep`, `tahsis_ozeti`, `is_yuku_ongorusu`, `maliyet_raporu` | Kapasite, doluluk, tahsis, öngörü, maliyet |
| `notlari_ara`, `musteri_istekleri` | Haftalık notlar ve müşteri istekleri (yönetici rollerine sunulmaz) |
| `bilgi_ara` | Notlar, görev/risk açıklamaları, istekler, PESTEL/SWOT, hedefler ve kullanım kılavuzunda anahtar kelime araması |
| `veri_sagligi`, `son_degisiklikler` | Yetkisi olan rollerde veri kalitesi ve denetim günlüğü |
| `jira_aktar`, `jira_worklog` | Jira bağlıysa: Jira kayıt geçmişini projeye aktarma (PY, onaylı) ve worklog özeti |
| `oner_*`, `oneriyi_uygula` | Onaylı değişiklik (yukarıya bakın) |

## Güvenlik ve veri

- **Veri Claude'a gider:** Araç sonuçları (proje, görev, tahsis özetleri…) kullandığınız Claude hesabının modeline iletilir. Kurumunuzun veri sınıflandırma ve yapay zekâ kullanım kurallarına uygun olduğundan emin olun; uygulamadaki AI asistanı kurum içi bir sağlayıcıya bağlanabilirken MCP bağlantısı Claude'u kullanır.
- **Parola düz metindir:** MCP istemcilerinin yapılandırma dosyası parolayı açık tutar. Dosyanın yalnız sizin okuyabildiğinizden emin olun; mümkünse yalnız bu iş için, gereken en düşük rolde bir Supabase hesabı kullanın.
- stdout yalnızca protokol içindir; sunucunun günlükleri stderr'e yazılır (Claude Desktop: `~/Library/Logs/Claude/mcp-server-planasistan.log`, Windows'ta `%APPDATA%\Claude\logs\`). Uygulanan her değişiklik bu günlüğe yazılır; uygulamanın denetim günlüğü cihaza özel olduğu (buluta senkronize edilmediği) için MCP değişiklikleri orada görünmez.

## Sınırlamalar

- **claude.ai web ve mobil:** Uzak (HTTP) MCP bağlayıcısı ve OAuth girişi gerektirir; bu sürümde yalnız yerel (stdio) bağlantı vardır — Claude Desktop ve Claude Code. Protokol çekirdeği taşımadan bağımsızdır, HTTP ucu sonraki adımdır.
- **Bilgi Bankası dokümanları** tarayıcıda (IndexedDB) tutulduğu için MCP'de aranmaz; `bilgi_ara` yalnız anahtar kelime araması yapar (anlamsal arama yok).
- Değişiklikler beş türle sınırlıdır (risk ekle, görev ekle, görev durumu, RAG, tahsis hücresi) ve yalnız Supabase kaynağında yapılır.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Claude'da planasistan araçları yok | Yapılandırma JSON'u geçerli mi, `args` içindeki yol doğru mu? Claude'u tamamen kapatıp açın; günlük dosyasına bakın |
| "Veri kaynağı yapılandırılmamış" | `PLANASISTAN_WORKSPACE_FILE` ya da Supabase değişkenlerinden birini verin |
| "… rolü kapsamı kişiye göre belirlenir" | `PLANASISTAN_PERSON` ile adınızı soyadınızı verin (veri havuzundaki gibi) |
| "Supabase girişi başarısız" | E-posta/parola; hesabın e-postası doğrulanmış mı |
| "birden fazla çalışma alanının üyesi" | Mesajdaki id'lerden birini `PLANASISTAN_WORKSPACE_ID` olarak verin |
| "bulutta daha yeni bir sürüm var" | Başkası aynı anda değiştirdi; Claude'dan tekrar denemesini isteyin |
| Değişiklik araçları yok | `planasistan_durum` nedenini söyler: `PLANASISTAN_MCP_WRITE`, kaynak, rol ya da yönetici politikası |
