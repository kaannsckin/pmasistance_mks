# Ajan görevi: AI ajan projelerini PlanAsistan'dan yönetmek

> **Kullanım:** Bu dosyanın tamamını Codex'e ilk mesaj olarak verin ya da "`docs/AJAN_GOREVI_AI_PROJE_YONETIMI.md` dosyasındaki görevi planla ve uygula" deyin.
> Hazırlayan: Claude (sistem mühendisi rolü), 26 Kasım 2026. Kod gerçekleri bu tarihteki `main` (v3.7.0) ve `kaannsckin/Lee@a17869e` üzerinden doğrulandı; kod değişmiş olabilir, sembol adıyla arayın.
> **Uygulayıcı:** Codex. **Son kontrol ve kabul:** Claude (§14). **Karar sahibi:** K (Murat Bey, ürün sahibi ve "yönetim").

---

## 0. Rolün ve çalışma biçimin

Sen bu depoda çalışan kıdemli bir full-stack (TypeScript / React / Node) mühendisisin. Görevin, K'nın AI ajanlarla yürüttüğü yazılım projelerini (ilk örnek: `kaannsckin/Lee`) PlanAsistan'da **bir yönetici gibi izleyip yönetebileceği** bir köprü kurmak:

- Ajanların GitHub'da yürüttüğü iş, PlanAsistan'da proje, görev, ajan personası ve haftalık plan olarak görünür.
- K'nın PlanAsistan'da verdiği kararlar ve yorumlar GitHub'a, ajanların zaten okuduğu yerlere düşer.
- Bunların hiçbiri LLM çağırmaz. Köprü sıfır token harcar.

**Görev dağılımı (K'nın kararı, 26 Kasım):**

- **Planın sahibi Claude'dur.** Bu belge plandır. Codex planı yeniden yazmaz.
- Codex plana itirazını ya da eksik bulduğu noktayı "Codex inceleme notları" bölümüne ya da PR yorumuna yazar. Claude planı revize eder ve bölüm 16'da yanıtlar.
- Codex yalnız durum dosyasını yazar: `docs/AJAN_YONETIMI_DURUM.md`. Bu dosyada faz durumu, ölçümler, aldığı varsayımlar ve harcanan AI kullanımı (bölüm 10.2) bulunur.

Çalışma sırası:

1. **F0: Doğrulama** (§9). Taban çizgisini ve plandaki kod gerçeklerini doğrula, durum dosyasını aç, commit'le. Plan metnini değiştirme.
2. **Fazlar F1–F9** (§9). Sırayla uygula. Her faz ayrı commit; her commit'ten önce `npx vitest run` ve `npx tsc --noEmit` yeşil olmalı.
3. Her fazın sonunda durum dosyasını güncelle (faz durumu ve AI kullanımı).
4. Bitince PR aç (§13). Claude son kontrolü yapar (§14), K merge eder.

Belirsizlikte makul varsayılanı seç; varsayımı plan dosyasına ve commit mesajına yaz, ilerle. **Yalnız şu durumlarda dur ve sor:**

- Yeni bir npm bağımlılığı şartsa. Varsayılan: GitHub REST çağrıları `fetch` ile yapılır, Octokit eklenmez.
- Bir GitHub deposuna **gerçek** yazma (yorum, label) denemesi gerekiyorsa. Testler sahte `fetch` ile yapılır; canlı yazma yalnız K'nın verdiği test deposunda ve K'nın onayıyla denenir.
- Mevcut bir davranışın (özellikle Jira eşitlemesi) kullanıcıya görünür biçimde değişmesi gerekiyorsa.
- Supabase şemasında (`supabase/schema.sql`) değişiklik gerekiyorsa. Bu görev şema değişikliği **gerektirmeyecek** biçimde tasarlandı (§7).

---

## 1. Yönetici özeti

**İstek (K):** "Codex, Claude ve Copilot ile oluşturduğum ajanların yürüttüğü AI projelerimi, iş hayatımda projeleri yönettiğim gibi PlanAsistan'dan yönetmek istiyorum. Ajanlar uygulamayı, pilottaki personalar gibi kendi profilleriyle kullanan çalışanlar gibi olsun. Ben yönetim olarak raporları okuyayım, beklentilerini yanıtlayayım, planlama ajanının planına yorum yapayım. Bunu yaparken token maliyetini ve benim insan kontrolümü (human in the loop) koruyalım. Ajan yönetim verisi, uygulamayı paylaştığım başka kişilere görünmesin."

**Karar (bu konuşmada varılan):**

- **GitHub, ajanların çalıştığı yer (yürütme düzlemi) olarak kalır.** Lee'deki issue-first düzen, 20 `/plan-*` skill'i, CI kapıları ve Copilot ataması GitHub'a bağlıdır. Lee daha önce Linear'dan GitHub'a bilerek geçti (K-2026-09-24-01). Canlı işi PlanAsistan'a taşımak bu göçü tekrarlatır; yapılmaz.
- **PlanAsistan, K'nın yönetim düzlemi olur.** Proje, görev, persona, beklenti, plan yorumu, haftalık plan ve ajan koşu özeti burada görünür.
- **İkisi arasında deterministik bir köprü (gateway) kurulur.**
  - İçe alım: GitHub → PlanAsistan, Jira eşitleme hattının yeniden kullanımıyla.
  - Geri kanal: PlanAsistan → GitHub. Yalnız issue yorumu, Lee'nin gelen kutusu biçiminde bir satır ve tek bir dar label geçişi.
- **Lee'de değişiklik neredeyse yok.** Yalnız `plan-inbox` skill'ine "K kararı / yorumu" madde türü eklenir. Bu, Claude'un Lee'de ayrı bir PR'ıdır; **bu görevin kapsamı dışındadır.**
- **Gizlilik:** Ajan yönetim verisi kurumun paylaşılan Supabase projesine **konmaz**. Önce yerel kip, gerekince K'ya ait ayrı bir Supabase projesi kullanılır. Tüm çalışma alanını şifrelemek önerilmez; gerekçe §6'da.

**Bu görevde yapılmayanlar (sonraki işler):** uzak MCP (HTTP + OAuth, pilot BL-16), ajanların PlanAsistan'a MCP ile yazması, GitHub webhook'ları, uçtan uca şifreleme, PR merge'ünün PlanAsistan'dan yapılması.

---

## 2. Bağlam

### 2.1 PlanAsistan

- **Teknoloji:**
  - React 19, Vite 6, TypeScript 5.8.
  - Sunucusuz uçlar `api/` altında (Vercel); aynı uçlar yerel sürümde `server/local/main.ts` ile 127.0.0.1'de çalışır.
  - Veri tarayıcıda (IndexedDB). İsteğe bağlı Supabase bulut eşitlemesi var.
- **Dil:** Arayüz, kod yorumları, belgeler ve commit mesajları Türkçe; kısa, net cümleler.
- **Mimari ilkeler** (`docs/AJAN_GOREVI_HAFTALIK_RAPOR_AI.md` §1 ile aynı):
  - İş mantığı `utils/` altında saf fonksiyon; yanında `*.test.ts`.
  - Arayüz `components/modern/` altında. Klasik arayüze yeni özellik eklenmez.
  - Dışarı yazan her işlem önce **öneri** olarak gösterilir; kullanıcı onaylarsa uygulanır.
  - Sırlar (token, anahtar) yalnız sunucu ortam değişkeninde durur; tarayıcıya ve çalışma alanı verisine girmez. Jira'da da böyle: `JIRA_TOKEN` sunucu env'inde, tarayıcı `/api/integrations/*` vekiline gider.
- **Görev kodu kuralı (`AGENTS.md`):**
  - Görev listelenen her ekranda görev kodu `components/modern/TaskKeyButton.tsx` ile düğme olarak gösterilir.
  - Projede karşılığı olmayan anahtar düz etiket olarak gösterilir.
  - Bu görevde eklenen her yeni liste bu kurala uyar.
- **Taban çizgisi (26 Kasım 2026):** `npx vitest run` → 169 test dosyası (1 atlanan), 1373 test geçiyor, 4 atlanan. `npx tsc --noEmit` temiz.

### 2.2 Yeniden kullanılacak mevcut parçalar

| Parça | Yer | Bu görevde ne için |
|---|---|---|
| Jira kayıt biçimi | `utils/integrations.ts` › `JiraIssueRecord` (sunucudaki eşi `server/integrations/handler.ts`) | GitHub issue'su bu biçime çevrilir |
| Jira birleştirme | `utils/planning/jiraImport.ts` › `mergeJiraIssues`, `previewJiraImport` | Anahtarla birleştirme, planlama alanlarını koruma, önizleme |
| Jira eşitleme arayüzü | `components/modern/planning/JiraSync.tsx`, `useJiraAutoSync.ts` | GitHub eşitleme arayüzünün şablonu |
| Entegrasyon vekili | `server/integrations/handler.ts` › `handleIntegrationRequest`, `api/integrations/*.ts`, `server/local/main.ts` | Yeni `github` rotası |
| Kimlik doğrulama | `server/ai/auth.ts` › `authorize` (`none` / `token` / `supabase` kipleri) | Yazma rotalarının korunması (§8.2) |
| İş akışı şemaları | `docs/PROJE_YAPILANDIRMA.md`, `Task.jiraStatus`, `BoardStatusKey = jira:<ad>` | Lee `durum:*` durumlarının panoda görünmesi |
| Yönetimden beklentiler | `types.ts` › `ManagementExpectation`, `utils/expectations.ts`, `components/modern/ModernExpectations.tsx` | `karar` issue'ları ve "K'dan bu hafta istenen" maddeleri |
| Görev yorumları | `Task.comments` | Plan yorumları |
| Haftalık notlar | `types.ts` › `Note` (`weekNumber`, `year`, `content`, `tags`) | Lee haftalık plan md'leri |
| Bulut ayrımı | `utils/cloudSync.ts` › `splitWorkspaceDoc` | Yeni alanların bulutta kaybolmaması (§7.4) |
| Kural setleri ve rapor otomasyonu | `docs/OTOMASYON.md` | Karar süresi bildirimi (F8) |
| Denetim günlüğü | `utils/audit.ts` › `appendAudit` | Dışarı yazılan her işlemin kaydı |

### 2.3 Lee'nin işletim modeli (köprünün uyacağı sözleşme)

Kaynak: `kaannsckin/Lee` → `AGENTS.md`, `docs/agents/ISSUE_WORKFLOW.md`, `docs/agents/PLAN_LOOP.md`, `docs/agents/runtime.json`, `.claude/scripts/plan_loop.py`.

| Kavram | Lee'de | Not |
|---|---|---|
| Canlı iş | GitHub issue'su; başlık `[LEE-LOCAL-NNN] kısa başlık` | Katalogda 242 görev: 144 bitti, 71 bloklu, 26 hazır, 1 iptal |
| Durum | Tek `durum:*` label'ı: `draft`, `ready`, `blocked`, `in-progress`, `in-review`, `rework`; kapanış `completed` / `not_planned` / `duplicate` | Geçişler `PLAN_LOOP.md` "Durum makinesi" |
| Sahip | `sahip:<rol>` (orchestrator, planning-advisor, backend, ios, engine, qa, security, design) + `runtime:claude` / `codex` / `copilot` | Atama claim değildir |
| Öncelik, kilometre taşı | `P0`…`P3`, `MS0`…`MS11` | |
| K kararı | `karar` label'ı; `/plan-write` K'ya soruyu **seçenekleriyle tek yorumda** yazar ve K'yı assignee yapar | **48 saat karar süresi**; sessizlik onay değildir |
| Karar kaydı | `docs/ROADMAP.md` "Karar kaydı" (K-YYYY-AA-GG-NN) | **Tek yazar: orchestrator.** Köprü buraya yazmaz |
| Gelen kutuları | Sabit issue'lar: Claude #288, Codex #289, koordinatör notları #287 (`docs/agents/runtime.json` › `plan_loop`) | Mesaj biçimi aşağıda |
| Yorum şablonu | `**Plan \| Başladı \| Devir \| Dönüş \| Review \| Kapanış** · … actual executor/model/reasoning + agent/run · … Sonuç: passed/failed/skipped/not-run` | Ajan koşu özeti bu satırlardan çıkarılır (F7) |
| Haftalık plan | `docs/planning/weekly/YYYY-Www.md`; "K'dan bu hafta istenen" bölümü var | Bu bir **sprint planıdır**, PlanAsistan'ın durum raporu (`WeeklyReport`) değil |
| Katalog | `docs/tasks/registry.json` (~217 KB; efor, bağımlılık) | İsteğe bağlı okunur (F2b), yazılmaz |

Lee gelen kutusu mesaj biçimi (`plan_loop.py` › `inbox_format` / `inbox_parse`). İlk dört satır başlıktır; maddeler `- [ ]` ile yazılır; `inbox_unread` göndereni kısıtlamaz, yalnız `To:` alanına bakar:

```
From: <gönderen>
To: claude
Date: YYYY-AA-GG
Why: <neden>
- [ ] <madde>
```

### 2.4 Mevcut MCP sunucusunun durumu (konuşmadaki denetimin özeti)

- `server/mcp/` çalışıyor: `server/mcp` + `server/pilot` testlerinde 91 test geçiyor; `npm run build:mcp` tek dosya üretiyor (`dist-mcp/planasistan-mcp.mjs`, ~2,4 MB).
- Yaklaşık 30 araç var; rol kapsamı uygulamayla aynı, RLS geçerli. Yazma iki adımlı: `oner_*` aracı öneri hazırlar, kullanıcı onayından sonra `oneriyi_uygula` yazar. Pilotta 5 ajan bu yolla kendi Supabase hesaplarıyla çalıştı.
- **Sınırlar:**
  - Yalnız yerel bağlantı (stdio); uzak HTTP + OAuth yok (BL-16).
  - Ajan kimliği e-posta ve parolayla; parola istemci yapılandırmasında düz metin.
  - MCP değişiklikleri uygulama denetim günlüğüne düşmez.
  - Token ölçümü yok.
  - Araç kataloğu 17.673 / 18.000 karakter; yeni araç sığmaz.
  - Pilot kuralı: pilot süresince araç sözleşmesi değişmez (demo 3 Aralık).
- **Bu görev MCP'ye dokunmaz.**

---

## 3. Gereksinimler

| ID | Gereksinim | Kabul ölçütü (özet) |
|---|---|---|
| G-01 | Lee issue'ları PlanAsistan'da görev olarak görünür; kaynak GitHub'dır | Kalıcı kimlik `repo#numara`. Görünen anahtar `GH-412` → `LEE-LOCAL-086` olunca **aynı görev** güncellenir. `durum:draft` → Backlog. İptal kayıtları ilerlemeye girmez (§7.5). Aynı eşitleme iki kez koşunca değişiklik 0 |
| G-02 | Ajanlar persona olarak görünür (ör. "Claude · Orchestrator", "Claude · iOS", "Codex · Backend", "Copilot") | `runtime:*` + `sahip:*` → `resourceName`; personalar veri havuzunda "AI Ajan" ünvanıyla |
| G-03 | `karar` issue'ları "Yönetimden beklentiler"de görünür | Ajanın soru yorumu, seçenekleri, P0–P3 aciliyeti, issue bağlantısı kayıtta. Son tarih = `karar` label'ının eklendiği an + 48 saat (issue olaylarından); bir kez yazılır, yeni yorumlarla ilerlemez (§8.6) |
| G-04 | K'nın beklenti yanıtı GitHub'a düşer ve Lee tarafında **doğrulanabilir** bir insan kararıdır | Önizleme ve onaydan sonra issue'ya "K kararı" yorumu, #288'e gelen kutusu satırı. İkisi de K'nın GitHub hesabından yazılır, hedef issue'yu ve yanıtlanan soru yorumunun kimliğini taşır (§8.3). Yeniden deneme yalnız eksik adımı tamamlar; etkisi bir kez görülür (§8.7) |
| G-05 | K, plana (göreve) yorum yazabilir; tür seçer: Not / Değişiklik iste / Onayla | §8.4'teki biçim ve kurallar; yalnız `durum:ready` iken "Değişiklik iste" label'ı `durum:draft`'a çevirir |
| G-06 | Haftalık plan md'leri haftalık not olarak görünür; "K'dan bu hafta istenen" maddeleri beklenti olur | Hafta ve yıl doğru; madde başına bir beklenti; tekrar içe alımda kopya yok |
| G-07 | Ajan koşuları görünür: kim, hangi model, sonuç | Başladı / Dönüş / Kapanış yorumlarından; bilinmeyen alan "bilinmiyor"; token yoksa boş |
| G-08 | Karar süresi yaklaşınca ya da aşılınca K'ya bildirim gider | Mevcut kanallar (Teams / Slack / e-posta) ve kural seti; günlük tek özet |
| G-09 | Köprü LLM kullanmaz; ajan tarafındaki ek okuma en az düzeyde kalır | Kodda AI çağrısı yok; GitHub'a yazılan her mesaj ≤ 1500 karakter |
| G-10 | Lee'nin tek-yazar kuralı bozulmaz | Köprü `docs/ROADMAP.md`, `registry.json`, `INDEX`, `NOW`, `memory` dosyalarına ve kod dosyalarına **yazmaz**; `karar` label'ını kaldırmaz |
| G-11 | Gizlilik: ajan yönetim verisi ve Lee içeriği paylaşılan kullanıcılara görünmez | §6'daki dağıtım seçenekleri belgelenir. GitHub rotasının **okuma ve yazma** op'ları yalnız §8.2'deki yetki tablosuna göre çalışır. Başka bir çalışma alanının üyesi Lee issue'larını okuyamaz (kabul testi §11.2) |
| G-12 | Güvenlik: issue içeriği veri sayılır; arayüzde düz metin işlenir | XSS testi; içerikten komut, talimat ya da URL yürütülmez |

---

## 4. Kararlar

| ID | Karar | Gerekçe |
|---|---|---|
| D-01 | GitHub yürütme düzlemi, PlanAsistan yönetim düzlemidir | §1; Linear ve GitHub da aynı deseni kullanır: kod GitHub'da, yönetim aracı otomatik senkron ve insana soru kanalı sağlar |
| D-02 | İçe alım, Jira gibi **kullanıcının oturumundan** tetiklenir: "GitHub'dan eşitle" düğmesi + açıkken otomatik eşitleme. Sunucu yalnız vekildir, veriyi saklamaz | Veri yalnız K'nın çalışma alanına, K'nın kimliğiyle yazılır; service role yazımı yok; webhook gerekmez |
| D-03 | Geri kanal yalnız üç işlem yapar: issue yorumu ekle, gelen kutusu issue'suna yorum ekle, `durum:ready → durum:draft` label geçişi | En küçük yetki; Lee'nin kendi kanallarını kullanır |
| D-04 | Köprü ROADMAP'e, registry'ye yazmaz ve `karar` label'ını kaldırmaz; kararı kayda orchestrator geçirir | Lee'nin tek-yazar kuralı (G-10) |
| D-05 | Lee durumları Task'a şöyle eşlenir: `jiraStatus` = label adı, `status` = kategori (§7.1). Yeni `TaskStatus` değeri eklenmez | `TaskStatus` 4 değerli; iş akışı şemaları Jira adlarıyla zaten çalışıyor |
| D-06 | Şema değişikliği yok. Yeni alanlar mevcut tiplerde **isteğe bağlı** alanlardır (§7.2) | Bulut eşitlemesi ve RLS dokunulmadan çalışır |
| D-07 | GitHub kimliği: kapsamı Lee ile sınırlı, süreli bir **fine-grained PAT**. İzinler: Issues okuma-yazma, Contents salt-okunur, Metadata salt-okunur; sunucu env'inde `GITHUB_TOKEN`. GitHub App sonraki iş | Tek kullanıcı için en basit yol; yorum K'nın hesabından düşer, Lee'de "K" zaten bu hesap |
| D-08 | Yazma varsayılanda **kapalı** (`GITHUB_ALLOW_WRITE` yoksa kuru çalıştırma: gönderilecek metin döner, GitHub'a gitmez) | Güvenli varsayılan; canlı deneme bilinçli açılır |
| D-09 | K'nın bulut rolü kendi ayrı alanında `all_roles = true` (demo bayrağı) ya da `pyb_destek` + `access_admin`; beklenti yanıtlama izni rol yetkilerinden verilir | `expectation.respond` varsayılan olarak `mudur` / `pyb_sorumlu`'da; Müdür `workspace_private`'ı (notlar) okuyamaz, oysa haftalık plan notu orada |
| D-10 | Ajanların PlanAsistan'a MCP ile yazması bu görevde yok | Pilot sözleşmesi ve kapsam; köprü tek başına değer üretir |

---

## 5. Mimari

```mermaid
flowchart LR
    subgraph GH["GitHub · kaannsckin/Lee (yürütme düzlemi)"]
        I["Issue'lar<br/>durum:* · sahip:* · runtime:* · karar"]
        C["Yorumlar<br/>Başladı · Dönüş · Kapanış · K sorusu"]
        IN["Gelen kutusu #288<br/>(Claude hub)"]
        W["docs/planning/weekly/*.md"]
    end
    subgraph SRV["PlanAsistan sunucu vekili (Vercel ya da yerel 127.0.0.1)"]
        R["/api/integrations/github<br/>op: meta · issues · comments · file · post-comment · relabel<br/>GITHUB_TOKEN yalnız burada"]
    end
    subgraph APP["PlanAsistan (tarayıcı, K'nın oturumu)"]
        S["GitHub eşitleme<br/>önizleme → onay"]
        M["utils/integrations/github*.ts<br/>saf eşleme fonksiyonları"]
        T["Proje · görevler · personalar"]
        E["Yönetimden beklentiler"]
        Q["Giden kutusu<br/>(gönderilecek yorumlar, önizleme → onay)"]
    end
    I & C & W --> R --> S --> M --> T & E
    E -- "K yanıtı" --> Q
    T -- "plan yorumu" --> Q
    Q -- "onaylı gönderim" --> R -- "yorum / satır / label" --> I & IN
    IN -. "ajanın sonraki koşusu: /plan-inbox" .-> I
```

**Akışlar:**

1. **İçe alım.** K "GitHub'dan eşitle" der ya da otomatik eşitleme zamanı gelir. Tarayıcı vekilden açık issue'ları ve son eşitlemeden beri güncellenen kapalı issue'ları sayfa sayfa ister (`since` parametresi). Saf fonksiyon her issue'yu `JiraIssueRecord`'a çevirir. `previewJiraImport` / `mergeJiraIssues` ile önizleme gösterilir. Onayla birleştirilir. İlk kurulumdan sonra küçük değişiklikler sessiz uygulanabilir; Jira otomatik eşitlemesiyle aynı kural.
2. **Beklentiler.** `karar` label'lı açık issue'lar ve haftalık md'deki "K'dan bu hafta istenen" maddeleri `ManagementExpectation` olur (anahtar: kaynak; tekrar içe alımda güncellenir, kopyalanmaz).
3. **Geri kanal.** K yanıt ya da yorum yazar. Metin "Giden kutusu"na **önizleme** olarak düşer. K "GitHub'a gönder" der. Vekil önce idempotentlik işaretini arar, sonra yazar. Sonuç (yorum URL'si) kayda ve denetim günlüğüne yazılır.
4. **Ajan tarafı.** Lee orchestrator'ı bir sonraki koşusunda (Claude günlük 09.00, haftalık pazartesi 00.00) `/plan-inbox read` ile #288'deki satırı okunmamış madde olarak görür, kararı karar kaydına geçirir ve `karar` label'ını kaldırır. Bu adım Lee'dedir.

---

## 6. Gizlilik ve veri güvenliği (sistem mühendisi değerlendirmesi)

### 6.1 Soru: "Ajan proje yönetim hafızası Supabase'de mi tutulacak? Başkalarıyla paylaştığımda görünmesini istemiyorum. Özel alan açıp şifrelemek mantıklı mı?"

Üç ayrı "hafıza" var; her biri farklı yerde:

| Veri | Nerede durur | Kim görür |
|---|---|---|
| Ajanların kendi hafızası (`docs/memory.md`, issue'lar, karar kaydı) | **GitHub, Lee reposu**. PlanAsistan yalnız aynasını tutar | Repoya erişimi olanlar |
| PlanAsistan'daki ayna ve K'nın kararları, yorumları | Yerel kipte **yalnız K'nın tarayıcısında** (IndexedDB); bulut açıksa Supabase'de | Aşağıdaki tablo |
| Uygulama içi AI asistanının kişisel hafızası (`hafiza.md`) | Supabase `assistant_memory` tablosu | **Yalnız sahibi** (RLS: `memory_select_own`); aynı çalışma alanındaki başka üyeler de göremez |

Aynı Supabase projesinde kim neyi görebilir (`supabase/schema.sql` ile doğrulandı):

| Kim | Görür mü | Dayanak |
|---|---|---|
| Uygulamanın başka kullanıcıları (çalışma alanına üye değil) | **Hayır** | `has_full_workspace_access` / `can_access_workspace_project` yalnız üyelikle açılır; `list_planasistan_workspaces` yalnız üye olunanları döner |
| Çalışma alanına eklediğiniz üyeler | Rolüne göre evet | `workspaces.core` (beklentiler, raporlar burada) tüm üyelere açık; `workspace_private` (notlar) Müdür ve PYB Sorumlusu'na kapalı |
| Supabase projesinin sahibi / ortak yöneticileri (Dashboard, SQL editörü) | **Evet, düz metin** | RLS panel ve service role için geçerli değildir |
| Vercel ortam değişkenlerine erişimi olanlar | **Evet** (`SUPABASE_SERVICE_ROLE_KEY` ile) | Rapor cron'u bulut verisini service role ile okur (`docs/OTOMASYON.md`) |
| AI sağlayıcısı | Asistan kullanılırsa, AI politikasına göre | Bu görevin köprüsü AI kullanmaz |

**Sonuç:** RLS, uygulamanın diğer kullanıcılarına karşı yeterli. Ama uygulamayı paylaştığınız kişiler aynı Supabase projesinin ya da Vercel dağıtımının **yöneticisi** de olabiliyorsa, ya da proje kurum projesiyse, RLS sizi onlara karşı korumaz. Kişisel AI projelerinizin kurum veritabanında durması ayrıca veri yönetişimi açısından da doğru değil.

### 6.2 Öneri: kademeli yalıtım

| Seviye | Kurulum | Kime karşı korur | Ne zaman |
|---|---|---|---|
| **0 · Yerel kip (başlangıç önerisi)** | PlanAsistan yerel sürümü (`npm run build:local && npm run local` ya da exe) 127.0.0.1'de; `GITHUB_TOKEN` yerel `planasistan.env`'de; bulut kapalı | Herkese: veri yalnız bilgisayarınızda | F1–F9 için yeterli; ajanlar PlanAsistan'a yazmıyor, siz GitHub'dan çekiyorsunuz |
| **1 · Ayrı çalışma alanı, aynı Supabase** | Kurumun dağıtımında yalnız sizin üye olduğunuz alan | Uygulamanın diğer kullanıcılarına | **Önerilmez**: proje ve Vercel yöneticileri görür, kişisel veri kurum DB'sine girer |
| **2 · Ayrı Supabase projesi + ayrı dağıtım** | Sizin hesabınızda yeni Supabase projesi (`schema.sql` aynen) ve ayrı bir Vercel projesi ya da yerel sürüm; tek üye sizsiniz | Kurumun yöneticilerine ve diğer kullanıcılara | Birden çok cihaz gerekince ya da ajanlar MCP ile yazacaksa (sonraki iş) |

### 6.3 Şifreleme değerlendirmesi

- **Zaten var:** Supabase veriyi diskte şifreli tutar; aktarım TLS'tir. Bu, fiziksel erişime karşı korur; proje yöneticisine karşı korumaz.
- **Tüm çalışma alanını uygulama düzeyinde (uçtan uca) şifrelemek önerilmez:**
  1. RLS politikaları veri içini okur (`can_edit_workspace_project(..., data->>'pmPersonId')`, `project_shared_data` kısıtı). Şifreli veride kurallar çalışmaz.
  2. Sunucu tarafı özellikler (rapor cron'u, MCP, ileride webhook) veriyi okuyamaz; anahtarı sunucuya koymak da şifrelemenin anlamını kaldırır.
  3. Anahtar yönetimi (kayıp = veri kaybı, cihazlar arası paylaşım) yeni bir risk getirir.
  4. Aynanın kaynağı GitHub'da zaten düz metin. Aynayı kaynaktan daha sıkı korumak gerçek bir kazanç sağlamaz. Asıl koruma yalıtımdır (Seviye 0 / 2).
- **Şifrelenecek olan sırlardır:**
  - `GITHUB_TOKEN` yalnız sunucu env'inde durur. Veritabanına konacaksa mevcut `AI_CONFIG_SECRET` desenindeki gibi (`server/ai/settingsStore.ts`, AES ile `app_settings`, politikasız tablo) şifreli saklanır.
  - Tarayıcıya, çalışma alanı JSON'una, yedeğe, loga girmez.
- **Sonraki iş, istenirse:** yalnız K'ya özel serbest metin alanları için (ör. kararın iç gerekçesi) parola türevli anahtarla istemci tarafı alan şifrelemesi. Bu görevde yok.

**Codex için gereklilik:** Kod üç kipte de (yerel, ayrı Supabase, paylaşılan Supabase) çalışmalı; dağıtım seçimi K'nındır. Belgede (F9) Seviye 0 ve 2'nin kurulumu adım adım yazılır.

---

## 7. Veri modeli ve eşleme

### 7.1 Issue → görev

| GitHub | Task alanı | Kural |
|---|---|---|
| Başlıktaki `[LEE-LOCAL-NNN]` | `jiraId` | Yoksa `GH-<numara>`. Anahtar `TaskKeyButton` ile gösterilir |
| Başlık (önek atılmış) | `name` | |
| Gövde | `JiraIssueRecord.description` → `mergeJiraIssues` bunu `Task.notes`'a yazar | **Düz metin**; HTML'e çevrilmez (G-12). En çok 20.000 karakter, fazlası kesilir ve "devamı GitHub'da" bağlantısı |
| `durum:draft` | `status = Backlog`, `jiraStatus = "durum:draft"` | |
| `durum:ready` | `ToDo`, `jiraStatus = "durum:ready"` | |
| `durum:blocked` | `ToDo`, `jiraStatus = "durum:blocked"`, `labels` + `engel` | Bloklu iş sürüyor sayılmaz |
| `durum:in-progress` / `in-review` / `rework` | `InProgress`, `jiraStatus` = label adı | |
| Açık, `durum:*` yok | `Backlog` | |
| Kapalı `completed` | `Done`, `resolution = "Tamamlandı"` | |
| Kapalı `not_planned` / `duplicate` | `Done`, `resolution = "Yapılmayacak"` / `"Tekrar"`, `cancelled = true` | İlerlemeye ve teslim göstergelerine girmez (§7.5) |
| `P0` / `P1` / `P2` / `P3` | `priority = Blocker` / `High` / `Medium` / `Low` | Yoksa `Medium` |
| `MS0`…`MS11` | `fixVersions` + `labels` | |
| `runtime:*` + `sahip:*` | `resourceName` = persona adı (§7.3) | `runtime:*` yoksa "Atanmamış" |
| Diğer label'lar (`karar`, `parent` …) | `labels` | |
| `created_at`, `closed_at`, `updated_at` | `JiraIssueRecord.created` / `resolved` (merge bunları `createdAt` ve kapanış bilgisine çevirir), `Task.updatedAt` | |
| `html_url`, numara | `github` (yeni, §7.2) | |
| PR'lar | İçe alınmaz | Issue'ya bağlı PR bağlantısı `github.prUrls` olarak tutulabilir (gövde ya da timeline'daki `Closes #N` / `Refs #N`; zorunlu değil) |

Çeviri saf bir fonksiyondur: `githubIssueToRecord(issue, opts): JiraIssueRecord`. `statusCategory` `new` / `indeterminate` / `done`'dan seçilir. `mergeJiraIssues` **değiştirilmez**; iki eksiği köprünün kendi saf adımları kapatır.

Bu eksikler v3.7.0'da doğrulandı (Codex notu, Claude teyidi):

- `statusOf`, `new` kategorisini durum adında "backlog/bekleme" yoksa `ToDo` yapar. Bu yüzden `durum:draft` ToDo olur.
- Birleştirme yalnız anahtarla eşleşir (`keyOf(t.jiraId)`). Anahtar değişince ikinci görev açılır.

Eşitleme hattı bu yüzden üç adımdır:

1. **`rekeyByGithubRef(tasks, issues)`.** Birleştirmeden önce çalışır. Kalıcı kimlik `task.github.repo` + `task.github.number`'dır. Gelen issue'nun anahtarı görevdekinden farklıysa (`GH-412` → `LEE-LOCAL-086`) görevin `jiraId`'si yeni anahtara çevrilir. Görev kimliği, planlama alanları ve yorumlar korunur. Aynı repo ve numaraya bağlı iki görev bulunursa (eski veri) birleştirilmez; uyarı üretilir, K karar verir.
2. **`mergeJiraIssues`.** Olduğu gibi kullanılır.
3. **`applyLeeStatus(tasks, issues)`.** Birleştirmeden sonra çalışır. §7.1 tablosunu kesin uygular: `durum:draft` ve `durum:*`'suz açık issue → Backlog; iptal edilen → `cancelled = true`. Eşleme `mergeJiraIssues`'a bırakılmaz.

### 7.2 Yeni isteğe bağlı alanlar (şema değişikliği yok)

```ts
// types.ts — hepsi isteğe bağlı; eski veriler etkilenmez
interface GithubRef { repo: string; number: number; url: string }

// Project
github?: {
  repo: string;                 // "kaannsckin/Lee"
  inboxIssue?: number;          // 288; boşsa repo'daki docs/agents/runtime.json › plan_loop.inbox.claude okunur
  weeklyPath?: string;          // "docs/planning/weekly"
  lastSyncAt?: string;          // ISO; artımlı eşitleme için
  personaMap?: Record<string, string>; // "codex/backend" → "Codex · Backend"
};

// Task
github?: GithubRef & { prUrls?: string[] };  // kalıcı kimlik: repo + number (§7.1)
cancelled?: boolean;            // iptal / tekrar: ilerlemeye girmez (§7.5)
agentRuns?: AgentRun[];         // en çok 20, en yeni sonda (F7)

interface AgentRun {
  at: string; kind: 'Başladı' | 'Devir' | 'Dönüş' | 'Review' | 'Kapanış';
  executor?: string; model?: string; result?: 'passed' | 'failed' | 'skipped' | 'not-run' | 'mixed';
  url: string;                  // yorumun bağlantısı
}

// ManagementExpectation
source?: GithubRef & {
  kind: 'karar' | 'weekly'; week?: string;
  questionCommentId?: number;   // yanıtlanan soru yorumunun kimliği (§8.3)
  questionCommentUrl?: string;
  requestedAt?: string;         // `karar` label'ının eklendiği an; bir kez yazılır (§8.6)
  requestedAtSource?: 'event' | 'ilk-gozlem';  // olaydan mı, ilk gözlemden mi
};
options?: string[];             // ajanın sunduğu seçenekler (A/B/C …), varsa
thread?: { author: string; text: string; date: string; githubCommentUrl?: string }[];
outbound?: OutboundState;       // giden kutusu durumu

// Task.comments öğesine
// { author, text, date, kind?: 'not' | 'degisiklik' | 'onay', outbound?: OutboundState }

interface OutboundState {
  status: 'taslak' | 'gonderiliyor' | 'gonderildi' | 'kismi' | 'hata';
  marker: string;               // idempotentlik işareti (§8.3)
  createdAt: string;            // işaret aramasının başlangıcı (§8.7)
  steps: {                      // her adım ayrı izlenir; yeniden deneme yalnız eksik adımı yapar
    issueComment?: StepState;
    inbox?: StepState;
    relabel?: StepState;        // yalnız "Değişiklik iste"
  };
}
interface StepState { status: 'bekliyor' | 'tamam' | 'atlandi' | 'hata'; url?: string; at?: string; note?: string }
```

### 7.3 Personalar

- İlk eşitlemede görülen her `runtime:<r>` + `sahip:<s>` ikilisi için veri havuzunda bir kişi oluşturulur. Varsayılan adlar: `Claude · Orchestrator`, `Claude · iOS`, `Codex · Backend`, `Copilot · Uygulayıcı`; biçim `<Runtime> · <Rol>`, rol adı Türkçe karşılığıyla.
  - Ünvan: "AI Ajan", maliyetsiz. Bölüm: "AI".
  - **Sicil alanı boş kalır.**
- `personaMap` ile adlar değiştirilebilir. Kişi oluşturma bir öneri olarak gösterilir; K onaylar.
- K'nın kendisi: "Yönetim" kişisi (K).

### 7.4 Bulut eşitlemesi tuzağı

`utils/cloudSync.ts` › `splitWorkspaceDoc` çekirdek belgeyi **beyaz listeyle** kurar.

- Yeni alanlar mevcut nesnelerin içinde olduğu için (Project, Task, ManagementExpectation) otomatik taşınır.
- **Yeni bir üst düzey `WorkspaceData` alanı eklenirse** beyaz listeye ve okuma yoluna da eklenmelidir; yoksa bulutta sessizce kaybolur. Bu görev üst düzey alan **eklememeyi** hedefler. Eklemek zorunda kalırsan F0 planına yaz ve test et.
- `Project.notes` buluta `workspace_private` ile gider. Haftalık plan notlarını Müdür rolü okuyamaz; D-09 bu yüzden var.

### 7.5 İptal edilen kayıtlar ve ilerleme

Bugün `utils/progress.ts` › `taskProgressPercent`, `status === Done` olan her görevi %100 sayar; çözüm (`resolution`) bakılmaz. Lee'de `not_planned` ile kapanan iş teslim değildir. Bu kural değişmeden içe alınırsa ilerleme şişer.

- **Kural:** `cancelled === true` olan görev ilerleme paydasına ve payına girmez. Teslim sayılarına da girmez (`done`). Kaynak, mevcut ilerleme modeli (`progressOf` / `projectProgress`).
- **Kapsam:** Yalnız `cancelled` alanı olan görevler. Jira hattı bu alanı yazmaz, bu yüzden Jira kullanıcıları için davranış **değişmez**. Jira'daki "Won't Do" kayıtlarının da dışlanması ayrı bir K kararıdır, bu görevde yok.
- **F0'da:** `status === Done` ya da `TaskStatus.Done` sayan diğer hesapları (sağlık, EVM, hız, Monte Carlo verimi, yönetim ekranı) `grep` ile listele. Hangilerinin `cancelled`'ı dışlaması gerektiğini durum dosyasına yaz. En az `progressOf` ve proje kartındaki teslim göstergesi dışlar. Diğerleri için Claude'a not düş; plan revizyonuyla karar verilir.
- **Kabul örneği:** 2 tamamlanan + 1 iptal + 1 yapılacak görev → ilerleme %67 (2/3), %75 değil. `done` = 2.

---

## 8. Sunucu vekili ve geri kanal

### 8.1 Rota

- `api/integrations/github.ts` (Vercel) ve yerel sunucuda aynı rota: `POST /api/integrations/github`, gövde `{ op, ... }`.
- İş mantığı `server/integrations/github.ts` içinde, `handleIntegrationRequest` desenine uygun.

| op | Ne yapar | Yazma mı |
|---|---|---|
| `meta` | Yapılandırma durumu: token var mı, izinli repolar, yazma açık mı, kimlik kipi | Hayır |
| `issues` | `GET /repos/{repo}/issues?state=all&since=&per_page=100&page=` (PR'ları ayıklar) | Hayır |
| `comments` | Tek issue'nun yorumları (son sayfadan, `per_page` ≤ 50) ya da `since` ile repo geneli | Hayır |
| `file` | `GET /repos/{repo}/contents/{path}`; yalnız izinli yollar: `docs/planning/weekly/*.md`, `docs/agents/runtime.json`, isteğe bağlı `docs/tasks/registry.json` | Hayır |
| `post-comment` | Issue'ya yorum ekler (§8.3 kurallarıyla) | **Evet** |
| `relabel` | Yalnız `durum:ready` → `durum:draft`: önce `durum:ready` silinir, 404'te durur, başarılıysa `durum:draft` eklenir (§8.7) | **Evet** |
| `events` | Tek issue'nun olayları; `karar` label'ının eklendiği anı bulmak için (§8.6) | Hayır |

Ortam değişkenleri:

| Değişken | Anlamı |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT (D-07) |
| `GITHUB_ALLOWED_REPOS` | Virgüllü liste, ör. `kaannsckin/Lee`. Listede olmayan repoya hiçbir istek gitmez |
| `GITHUB_ALLOW_WRITE` | `1` değilse yazma op'ları kuru çalışır: gönderilecek gövdeyi `{ dryRun: true }` ile döner |
| `GITHUB_USERS` | Barındırılan kurulumda GitHub rotasını **okuyup yazabilecek** doğrulanmış e-postalar (Supabase kipi), virgüllü. Pratikte yalnız K (§8.2) |
| `GITHUB_K_LOGIN` | K'nın GitHub kullanıcı adı. Yazılan yorumların yazarı sunucuda bununla doğrulanır (§8.7) |
| `GITHUB_API_URL` | İsteğe bağlı; varsayılan `https://api.github.com`. Testte sahte sunucu |
| `AI_CA_CERTS` | Kurum ağında mevcut sertifika deseni geçerli |

### 8.2 Erişim kuralları

Mevcut entegrasyon yetkisi (`server/ai/auth.ts` › `verifySupabase`) **herhangi bir** çalışma alanına üyeliği yeterli sayar (`workspace_members?select=role&limit=1`). Bu, Jira ve AI için uygundur ama Lee içeriği için yetmez: paylaşılan bir dağıtımda başka bir alanın üyesi Lee issue'larını okuyabilirdi. GitHub rotası bu yüzden **kendi yetki kontrolünü** yapar; okuma da yazma da aynı tabloya bağlıdır.

| Kurulum | Nasıl tanınır | Okuma (`meta` hariç) | Yazma |
|---|---|---|---|
| **Yerel sürüm** | `server/local/main.ts` rotayı `{ local: true }` ile çağırır; sunucu 127.0.0.1'e bağlıdır ve istek döngü adresinden gelir | İzinli | Yalnız `GITHUB_ALLOW_WRITE=1` ise; değilse kuru çalıştırma |
| **Barındırılan (Vercel), `supabase` kipi** | `authorize` sonucu `verifiedEmail` | Yalnız `verifiedEmail ∈ GITHUB_USERS` ise; değilse **403** | Aynı koşul + `GITHUB_ALLOW_WRITE=1`; değilse kuru çalıştırma |
| **Barındırılan, `none` ya da `token` kipi** | `resolveAuthMode` | **403** | **403** |

- `local: true` bayrağını yalnız yerel sunucu geçirir. Vercel fonksiyonu (`api/integrations/github.ts`) bu bayrağı hiçbir zaman geçirmez; bayrak istekten okunmaz.
- `GITHUB_USERS` (eski adıyla `GITHUB_WRITERS`) yalnız K'nın e-postasını içerir. Sunucudaki PAT K'nın hesabıdır; listedeki herkes GitHub'a K olarak yazar.
- `meta` op'u yetkisiz de çalışır ama yalnız "yapılandırılmış mı / yazma açık mı" bilgisini döner. Repo adı, issue ve token bilgisi dönmez.
- Hız sınırı: kişi başına dakikada en çok 10 yazma (`server/ai/rateLimit.ts`).
- Her yazma sunucu loguna yazılır: kim, repo, issue, op, işaret. Metnin kendisi loglanmaz.

### 8.3 Yazılan metinlerin biçimi (saf fonksiyonlar, testli)

Ortak kurallar:

- Her mesajın son satırı gizli bir idempotentlik işaretidir: `<!-- planasistan:v1 kind=<tür> ref=<kayıt-id> issue=<hedef no> soru=<soru yorum id ya da -> -->`.
- Aynı işaretin daha önce yazılıp yazılmadığı §8.7'deki gibi aranır (son 50 yorum değil).
- Metin en çok 1500 karakter (G-09). Uzunsa kısaltılır ve "ayrıntı PlanAsistan'da" denir.
- Sicil, parola, token, e-posta ve sağlık verisi yazılmaz. Metin içinde `@kullanıcı` varsa ters tırnağa alınır; istenmeyen bildirim gitmesin.
- Ham kullanıcı metni Markdown olarak gider. Başındaki ``` / `~~~` dengesizliği kapatılır.

**a) Karar yanıtı → ilgili issue'ya yorum**

```
**K kararı** · PlanAsistan · 2026-11-27
Soru: <beklenti başlığı> (yanıtlanan soru: <soru yorumunun bağlantısı>)
Yanıt: <seçilen seçenek ya da metin>
Gerekçe: <isteğe bağlı>
Kayda geçirme: orchestrator (ROADMAP karar kaydı); `karar` label'ını kaydı yazan kaldırır.
<!-- planasistan:v1 kind=karar ref=<expectationId> issue=<NNN> soru=<soru yorum id> -->
```

**b) Gelen kutusu satırı → #288** (`inbox_parse` ile birebir uyumlu; ilk dört satır başlık)

```
From: K (PlanAsistan)
To: claude
Date: 2026-11-27
Why: #NNN K kararı
- [ ] #NNN: <≤200 karakter özet> → <a'daki yorumun bağlantısı>
<!-- planasistan:v1 kind=inbox ref=<expectationId> issue=<NNN> soru=<soru yorum id> -->
```

**İnsan kararının doğrulanabilirliği (iki depolu kabul koşulu).** Lee'nin `inbox_unread`'i bugün göndereni yorum metnindeki `From:` satırından okur ve yorumun yazarına bakmaz. Biçimin doğru çözülmesi, kararı K'nın verdiğini kanıtlamaz. Bu yüzden:

- **PlanAsistan tarafı (bu görev):**
  - (a) ve (b) K'nın PAT'iyle yazılır; GitHub yorumun yazarını K'nın hesabı olarak kaydeder.
  - Vekil, yazdığı yorumun yanıtındaki `user.login`'in `GITHUB_K_LOGIN` olduğunu doğrular; değilse adımı `hata` sayar.
  - İşaret hedef issue'yu ve soru yorumunun kimliğini taşır. Ajan soruyu sonradan yeniden sorarsa (yeni soru yorumu), eski yanıt o soruya uygulanmaz.
- **Lee tarafı (Claude'un Lee PR'ı; bu görev dışı, canlı yazmanın ön koşulu):** `/plan-inbox`, `From: K` maddesini ancak şu dördü tutarsa karar kaydına geçirir:
  1. Gelen kutusu yorumunun yazarı (`user.login`) Lee'de tanımlı K kullanıcı adıdır.
  2. Maddedeki bağlantı, işaretteki `issue` numarasında, aynı yazarın (a) yorumuna gider.
  3. (a)'daki `soru` kimliği, o issue'daki en güncel `karar` sorusudur.
  4. Aynı `ref` daha önce işlenmemiştir.

  Tutmazsa madde işlenmez; hub K'ya sorar.
- **Sıra:** Lee PR'ı merge olmadan `GITHUB_ALLOW_WRITE=1` canlı Lee'de açılmaz (§15).

**c) Plan yorumu → ilgili issue**

```
**K yorumu** · PlanAsistan · <Not | Değişiklik isteği | Onay>
<metin>
<!-- planasistan:v1 kind=plan-yorum ref=<taskId>:<yorumId> issue=<NNN> soru=- -->
```

### 8.4 Plan yorumu türlerinin kuralı

| Tür | Issue yorumu | Gelen kutusu satırı | Label |
|---|---|---|---|
| Not | Evet | Hayır | Yok |
| Değişiklik iste | Evet | Evet (`Why: #NNN plan değişikliği`) | Yalnız o an `durum:ready` ise `durum:draft` (§8.7 "label geçişi"). `in-progress` / `in-review` / `rework`'te label değişmez; arayüz "iş sürüyor, karar ajanda" uyarısını gösterir |
| Onayla | Evet | Evet (`Why: #NNN K onayı`) | Yok |

Bu kural Lee'nin "yeni açık soru çıkan ready → draft" geçişine dayanır (`PLAN_LOOP.md`). Süren bir işin planı geri çekilmez.

### 8.5 Haftalık plan md'si

- `docs/planning/weekly/YYYY-Www.md` dosyaları `file` op'uyla okunur.
- Her dosya bir `Note` olur: `weekNumber` ve `year` dosya adından; `content` md metni (düz metin gösterilir); `tags` `["ajan-plan"]`. Kayıt kimliği dosya yolundan türer; tekrar içe alımda güncellenir.
- "K'dan bu hafta istenen" başlığının altındaki numaralı her madde bir beklenti olur:
  - kategori `approval`; aciliyet `important`; son tarih haftanın pazartesisi + 2 gün;
  - `source.kind = 'weekly'`;
  - maddedeki `#N` / `PR #N` bağlantıları `links`'e eklenir.
  - Başlık bulunamazsa beklenti üretilmez; not yine içe alınır.
- Bu beklentilere verilen yanıt hangi issue'ya yazılır? Maddede tek bir `#N` varsa o issue'ya yorum + #288 satırı. Birden çoksa ya da hiç yoksa yalnız #288 satırı (`Why: Hafta Www beklentisi`).

### 8.6 Karar süresi (48 saat)

- **Başlangıç anı:** `karar` label'ının issue'ya eklendiği an. `GET /repos/{repo}/issues/{n}/events` içindeki en son `labeled` olayından (`label.name == "karar"`) alınır; `requestedAtSource = 'event'`.
- **Yedek:** Olay okunamazsa beklentinin **ilk görüldüğü an**; `requestedAtSource = 'ilk-gozlem'`. Arayüzde "yaklaşık" diye gösterilir.
- **Bir kez yazılır.** `requestedAt` sonraki eşitlemelerde yeniden hesaplanmaz. `updated_at` asla kullanılmaz; her yeni yorum onu ileri taşır.
- **Yeni tur:** Label kaldırılıp yeniden eklenirse (yeni `labeled` olayı) yeni bir karar turu başlar. Eski beklenti `resolved` kalır, yenisi açılır.
- **Son tarih** = `requestedAt + 48 saat`.

**Bildirim nereye, ne zaman ulaşır** (F8):

| Kurulum | Yeni kritik talep ne zaman görülür | Bildirim |
|---|---|---|
| Yerel sürüm | Yalnız uygulama açıkken: açılışta ve 15 dakikada bir eşitlemede | Uygulama içi uyarı ve tarayıcı bildirimi (izin verilirse). **Uygulama kapalıyken PlanAsistan bildirim göndermez** |
| Barındırılan (Seviye 2) | Aynı: kullanıcı oturumundan tetiklenen eşitleme (D-02) | Aynı. Arka planda sunucu eşitlemesi bu görevde yok (sonraki iş: webhook / cron) |

Uygulama kapalıyken K'yı uyaran kanal **Lee'nin kendisidir**: 48 saat karar süresi yükseltmesi ve günlük Slack raporu (Lee `CLAUDE.md` › Çalışma sözleşmesi). F9 belgesi bunu açıkça yazar. PlanAsistan bu kanalın yerine geçmez.

### 8.7 Gönderim anlamı: en az bir kez teslim, bir kez etki

Son 50 yorumu taramak iki durumda tek teslimi garanti etmez: iki sekme aynı anda gönderirse ya da önceki yorum pencerenin dışında kalırsa. Hedef bu yüzden "tek teslim" değil, **"etkisi bir kez"**:

1. **Adımlar ayrı izlenir.** Bir beklenti yanıtı en çok üç adımdır: issue yorumu → gelen kutusu satırı → (yalnız "Değişiklik iste") label geçişi. Her adımın durumu `outbound.steps`'te tutulur. Yeniden deneme yalnız `tamam` olmayan adımı yapar. Issue yorumu başarılı, gelen kutusu başarısız ise yeniden denemede yalnız gelen kutusu satırı yazılır.
2. **İşaret araması tam yapılır.** Her yazmadan hemen önce hedef issue'nun yorumları `since = outbound.createdAt` ile **sayfa sayfa sonuna kadar** okunur ve aynı işaret aranır. Varsa adım `tamam` sayılır, bağlantısı kaydedilir, yeniden yazılmaz.
3. **Aynı tarayıcıda eşzamanlı gönderim kilitlenir.** `navigator.locks.request('pa-gh-' + marker, …)`. Sekmeler aynı IndexedDB'yi paylaştığı için gönderim başlarken durum `gonderiliyor` yazılır; başka sekme bu durumu görünce bekler.
4. **Kalan risk tüketicide kapanır.** Farklı cihazlardan aynı anda gönderim gibi nadir bir durumda aynı işaret iki kez yazılabilir. Lee tarafı aynı `ref`'i bir kez işler (§8.3, Lee koşulu 4). Bu yüzden ikinci kopya etki üretmez. Köprü yorum **silmez**.
5. **Label geçişi ezmez.**
   - Tüm label'ları yeniden yazan istek (`PUT .../labels`) **kullanılmaz**.
   - Önce `DELETE /repos/{repo}/issues/{n}/labels/durum:ready` yapılır. 404 dönerse issue o an `durum:ready` değildir: adım `atlandi` olur, nedeni not edilir, `durum:draft` **eklenmez**.
   - Silme başarılıysa `POST .../labels` ile yalnız `durum:draft` eklenir.
   - Böylece arada ajanın koyduğu `durum:in-progress` ezilmez. İkinci adım başarısız olursa `durum:*`'suz kalan issue yeniden denemede tamamlanır.
6. **Yazar doğrulaması.** Her yazmanın yanıtındaki `user.login` `GITHUB_K_LOGIN` değilse adım `hata` olur (§8.3).

---

## 9. Fazlar

Her faz: kod, test, plan dosyasında durum. Fazlar **sırayla**; F4 F3'e, F5 F4'e bağlıdır.

### F0 — Doğrulama (≈0,5 gün)

Plan Claude'undur (§0); bu fazda plan metni değişmez.

- §2.2'deki dosyaları oku. `JiraSync.tsx` akışını çıkar.
- §7.1'deki eşleme eksiklerini (draft → ToDo, anahtar değişince ikinci görev) ve §7.5'teki ilerleme davranışını örnek girdilerle yeniden üret. Bunları F1'in ilk testleri yap; şimdilik kırmızı olarak işaretlenir.
- §7.5'teki `Done` sayan hesapların listesini çıkar.
- `docs/AJAN_YONETIMI_DURUM.md` dosyasını oluştur:
  - faz durumu tablosu;
  - taban test sayısı;
  - aldığın varsayımlar;
  - üst düzey alan gerekip gerekmediği (§7.4);
  - `Done` sayan hesaplar listesi;
  - AI kullanım tablosu (§10.2).
- Planla çelişen bir kod gerçeği bulursan durma; durum dosyasına yaz, Claude'a not düş, çelişmeyen kısımla devam et.
- **Kabul:** durum dosyası commit'lendi.

### F1 — Tipler ve saf eşleme (≈1 gün)

- §7.2 tipleri.
- `utils/integrations/github.ts` (saf fonksiyonlar):
  - `parseLeeKey`, `labelsToStatus`, `priorityOf`, `personaOf`, `githubIssueToRecord`;
  - `rekeyByGithubRef`, `applyLeeStatus` (§7.1); `cancelled`'ı dışlayan ilerleme düzeltmesi (§7.5);
  - `kararRequestedAt` (olaylardan, §8.6);
  - `parseAgentComment` (F7 için de);
  - `buildKararComment`, `buildInboxMessage`, `buildPlanComment`, `outboundMarker`, `findMarker`;
  - `parseWeeklyPlan` (hafta, yıl, "K'dan bu hafta istenen" maddeleri).
- Testler §11.1.
- **Kabul:** `buildInboxMessage` çıktısı Lee'deki `inbox_parse` mantığıyla aynı başlıkları ve maddeleri verir. Lee'nin `plan_loop.py` testine benzer bir test yaz; Python'u çağırma, beklenen çözümlemeyi TypeScript'te yeniden kur.

### F2 — Sunucu vekili, okuma (≈1,5 gün)

- `server/integrations/github.ts`, `api/integrations/github.ts`, yerel sunucuda rota.
- Okuma op'ları: `meta`, `issues`, `comments`, `events`, `file`.
- **§8.2 yetki tablosu bu fazda tam uygulanır:** okuma da `GITHUB_USERS` / yerel kural ister. Mevcut `authorize` yeterli sayılmaz.
- Repo izin listesi, sayfalama (en çok 20 sayfa), 403/404/429 hataları Türkçe mesajla. 429'da `retry-after`.
- **Kabul:**
  - sahte `fetch` ile testler §11.2;
  - `GITHUB_ALLOWED_REPOS` dışı repo 403;
  - başka çalışma alanının üyesi (listede değil) okumada 403;
  - token hiçbir yanıtta ve logda görünmez.

### F2b — İsteğe bağlı: registry'den efor ve bağımlılık (≈0,5 gün)

- `docs/tasks/registry.json` yalnız eşitlemede bir kez okunur. Görev başına `effort` (S/M/L/XL → `time` tahmini için PERT varsayılanı) ve `dependencies` (→ `predecessor`) alınır.
- Dosya okunamazsa eşitleme yine tamamlanır.
- **Kabul:** registry yokken ve varken iki test.

### F3 — Eşitleme arayüzü ve personalar (≈1,5 gün)

- Proje ayarlarında "GitHub deposu" (repo, gelen kutusu issue'su, haftalık klasör).
- `components/modern/planning/GithubSync.tsx`: `JiraSync.tsx` deseni. Önizleme (yeni / güncellenecek / değişmeyen / kapanan), onay, son eşitleme zamanı. Proje açıkken otomatik eşitleme varsayılanda 15 dk; Jira otomatik eşitlemesi gibi kapatılabilir.
- Persona öneri kartı (§7.3).
- Proje için "Lee ajan iş akışı" yapılandırma önerisi: `durum:*` adlarıyla durumlar ve kategoriler. Yönetici konsolundaki iş akışı şemalarıyla; mevcut şema motoru kullanılır, yenisi yazılmaz.
- Görev listelerinde anahtar `TaskKeyButton`.
- **Kabul:**
  - Sahte veriyle Lee benzeri 30 issue eşitlenir. İkinci eşitlemede değişiklik 0.
  - PY'nin elle girdiği planlama alanları (tahmin, öncül, iş paketi) korunur.
  - Kapanan issue Done olur.
  - `durum:draft` Backlog'dur.
  - `GH-412` → `LEE-LOCAL-086` yeniden adlandırması aynı görevi günceller (görev sayısı değişmez).
  - `not_planned` kayıt ilerlemeye girmez.

### F4 — Beklentiler: içe alım ve yanıt (≈1,5 gün)

- `karar` label'lı açık issue'lar → beklenti.
  - Soru metni: issue'nun son yorumlarında `karar` etiketinin eklendiği andan sonraki ilk ajan yorumu. Bulunamazsa issue başlığı.
  - Seçenekler: soru metnindeki `A)`, `B)` / `- A:` gibi satırlardan.
  - Aciliyet: P0 → `critical`, P1 → `important`, diğer → `normal`.
  - Son tarih: §8.6. `karar` label'ının eklendiği an + 48 saat; olay okunamazsa ilk gözlem anı. Bir kez yazılır; `updated_at` kullanılmaz.
  - Soru yorumunun kimliği (`questionCommentId`) kaydedilir.
  - Açan: persona.
- Label kalkınca ya da issue kapanınca beklenti `resolved` olur; K'nın yanıtı korunur.
- Yanıt arayüzü:
  - `ModernExpectations.tsx` içinde seçenek düğmeleri ve serbest metin;
  - yanıt **giden kutusuna** taslak olarak düşer.
- **Kabul:** §11.1 ve §11.3 senaryoları; Müdür rolüyle yanıtlanabilir; D-09 rol notu belgede.

### F5 — Geri kanal: giden kutusu ve yazma (≈2 gün)

- Yazma op'ları (`post-comment`, `relabel`); §8.2 erişim kuralları; §8.3 biçim ve yazar doğrulaması; §8.7 adım adım gönderim, tam işaret araması, sekme kilidi ve ezmeyen label geçişi.
- "Giden kutusu" paneli: gönderilecek her mesajın **tam metni**, hedef issue ve tür. Tek tek ya da toplu "GitHub'a gönder". Kuru çalıştırma kipinde düğme "Önizlemeyi doğrula" der.
- Gönderim sonucu kayda (`outbound`) ve `appendAudit`'e yazılır.
- Hata (403, 404, 422, ağ) kayıtta `hata` durumuyla kalır; yeniden denenebilir.
- **Kabul:**
  - Aynı yanıt iki kez gönderilince GitHub'a tek yorum düşer. İşaret 50'den eski bir sayfada olsa bile.
  - Issue yorumu başarılı, gelen kutusu başarısız → yeniden deneme yalnız gelen kutusu satırını yazar.
  - Kuru çalıştırma hiçbir yazma isteği yapmaz.
  - Barındırılan `none` / `token` kipinde okuma ve yazma 403.
  - `relabel`: issue o an `durum:in-progress` ise (DELETE 404) `durum:draft` eklenmez, mevcut label'lar değişmez.
  - Yanıttaki yorum yazarı `GITHUB_K_LOGIN` değilse adım `hata`.

### F6 — Plan yorumları ve haftalık plan (≈1,5 gün)

- Görev ayrıntısında "Ajana yorum" alanı: tür seçimi (Not / Değişiklik iste / Onayla), §8.4 kuralları. Giden kutusu üzerinden gönderilir.
- Haftalık plan md içe alımı (§8.5): projenin "Notlar" bölümünde haftalık not, "K'dan bu hafta istenen" maddeleri beklenti olur.
- **Kabul:** W45 benzeri örnek md'den 5 beklenti ve 1 not; tekrar içe alımda kopya yok.

### F7 — Ajan koşuları ve "AI Ajanlar" görünümü (≈1,5 gün)

- `parseAgentComment` ile Başladı / Devir / Dönüş / Review / Kapanış yorumları çözülür:
  - alanlar: actual executor, model, sonuç;
  - kaynak: eşitleme sırasında yalnız `updated_at`'i son eşitlemeden yeni olan issue'ların yorumları (API bütçesi).
- `Task.agentRuns`, en çok 20 kayıt.
- Projede "AI Ajanlar" sekmesi ya da kartı. Persona başına:
  - açık işler (durum dağılımı), son koşu, son 30 günde passed / failed oranı;
  - bekleyen `karar` sayısı ve en yakın son tarih;
  - model dağılımı.
- **Token / maliyet:** Lee yorumlarında token alanı bugün yok. Alan boş kalır, "bilinmiyor" yazılır. Sayı uydurulmaz, tahmin gösterilmez.
- **Kabul:** gerçek Lee yorum örneklerinden kurulmuş fixture'larla ayrıştırma testleri; bilinmeyen biçim hata vermez, atlanır.

### F8 — Karar süresi bildirimi (≈1 gün)

- Mevcut kural setlerine tetikleyici: "Beklentinin son tarihine N saat kaldı / son tarih geçti" (N varsayılan 12). Zaten varsa yeniden kullan.
- Eylem: uygulama içi uyarı ve tarayıcı bildirimi; mevcut kanallar (Teams / Slack / e-posta) isteğe bağlı. Günde en çok bir özet; anlık bildirim yalnız `critical` için.
- **Kapsam sınırı (§8.6 tablosu):** Bildirim yalnız eşitleme koştuğunda, yani uygulama açıkken üretilir. Uygulama kapalıyken yeni talep algılanmaz. Sunucu tarafı arka plan eşitlemesi bu görevde yok. Uygulama dışındaki uyarı kanalı Lee'nin kendi 48 saat yükseltmesi ve günlük Slack raporudur. F9 belgesi bunu ve Vercel Hobby'nin günde bir cron sınırını yazar.
- **Kabul:** kural motoru testleri; çift bildirim yok; son tarih yeniden eşitlemede kaymaz.

### F9 — Belgeler (≈1 gün)

- `docs/GITHUB_AJAN_KOPRUSU.md`:
  - kurulum: PAT oluşturma ve izinleri, env değişkenleri;
  - §6 kademeleri (Seviye 0 ve 2 adım adım);
  - Lee eşlemesi; giden kutusu kullanımı; sorun giderme.
- `README.md` belgeler tablosu ve yetenek haritası; `.env.example`'a yeni değişkenler (değersiz); `CHANGELOG.md`.
- Lee tarafı için tek paragraflık "Lee'de yapılacak" notu: `plan-inbox` skill'ine "K kararı / yorumu" madde türü. Bu Claude'un Lee PR'ıdır; burada yalnız belgelenir.
- **Kabul:** belgedeki her komut ve değişken adı kodla eşleşir.

**Toplam efor:** ≈12–13 iş günü (F2b ile).

---

## 10. Token ve maliyet modeli

Üç gider ayrı izlenir; biri ötekinin yerine sayılmaz:

1. **İşletim:** köprünün çalışırken harcadığı (10.1).
2. **Geliştirme:** bu görevi AI ajanların yazması ve incelemesi (10.2).
3. **Altyapı:** yerel ya da bulut (10.3).

### 10.1 Köprünün işletimi

| Kalem | Token | Not |
|---|---|---|
| İçe alım, eşleme, geri kanal (F1–F8) | **0** | LLM çağrısı yok (G-09). GitHub API: PAT ile saatte 5000 istek; artımlı eşitleme tipik olarak 3–10 istek |
| Ajan tarafındaki ek okuma | Mesaj başına birkaç yüz token | Ajan yorumu zaten okuduğu yerden (kendi issue'su, #288) okur; 1500 karakter sınırı |
| Lee'deki mevcut maliyet (bilgi) | Orchestrator oturum başına ~43 KB giriş metni (~12–15 bin token) | Sonraki iş fırsatı: PlanAsistan'ın kısa bir "yönetim brifi" üretmesi. Bu görevde yok |
| Sonraki iş: ajanların MCP ile rapor / risk yazması | Ajan başına günde 1–3 çağrı; Sonnet 5.5 ile ayda ~$1–3 | Araç kataloğunun sabit yükü (~5–6 bin token) önbellekle 1/10 fiyatına okunur |
| Sonraki iş: haftalık özet | Haiku 5.5 + Batch API ile ayda < $1 | İsteğe bağlı |

Referans fiyatlar ($ / 1M token, giriş / çıkış): Opus 5.5 4 / 20; Sonnet 5.5 2 / 10; Haiku 5.5 0,10 / 0,50. Önbellekten okuma Opus 5.5'te 0,20, Sonnet 5.5'te 0,10. Batch API %50 indirimli. Codex/GPT tarafı OpenAI fiyatlarına tabidir. Abonelikle çalışılıyorsa ölçü dolar değil kotadır.

Köprünün model çağrısı sıfırdır. Ama ajanların kodlama, inceleme, tekrar ve köprünün yazdığı mesajları okuma kullanımı sürer. Bu kullanım 10.2'de ve Lee'nin kendi bütçesinde izlenir.

### 10.2 Geliştirme bütçesi (bu görevi AI ajanlar yapar)

Bu görevi insan değil AI ajanlar geliştirir. Bütçe bu yüzden insan-günle değil, ajanların gerçek kullanımıyla ifade edilir. §9'daki "gün" değerleri yalnız göreli büyüklüktür.

| Birim | Nerede ölçülür | Kim yazar |
|---|---|---|
| Abonelik kotası (Codex / ChatGPT planı, Claude planı) | İlgili uygulamanın kullanım ekranı: faz başı ve sonu yüzdesi ya da kalan | Codex (kendi), Claude (inceleme) |
| Ek kredi | Sağlayıcının kredi ekranı | Aynı |
| API ücreti (API anahtarıyla çalışılıyorsa) | Sağlayıcının kullanım ve maliyet raporu, $ | Aynı |
| Oturum ve tekrar sayısı | Faz başına oturum, "rework" turu | Aynı |

Kurallar:

- Codex her fazın sonunda durum dosyasındaki AI kullanım tablosunu doldurur: faz, oturum sayısı, birim, başlangıç → bitiş değeri, not.
- Ölçülemeyen değer "bilinmiyor" yazılır; tahmin yazılmaz.
- **Bütçe kapısı:** K bir toplam bütçe verir (kota yüzdesi, kredi ya da $). Verilmezse Codex F0 sonunda F0'ın gerçek kullanımını ve kalan fazlar için kaba bir projeksiyonu durum dosyasına yazıp K'ya sorar.
- Herhangi bir faz projeksiyonun 2 katını aşarsa Codex durur ve sorar.
- Claude'un incelemesi ayrı satırdır: PR başına bir son kontrol oturumu, her "rework" turu için bir yeniden inceleme.

### 10.3 Altyapı

| Kurulum | Gider |
|---|---|
| Yerel sürüm (Seviye 0) | Ek gider yok. GitHub REST API PAT ile ücretsiz (saatte 5000 istek) |
| Ayrı Supabase + Vercel (Seviye 2) | K'nın seçeceği planlara bağlı; ücretsiz katmanlar kişisel kullanımda büyük olasılıkla yeter. Güncel fiyatlar K tarafından doğrulanır. Ayrı satır olarak izlenir |

---

## 11. Test planı

### 11.1 Birim (saf fonksiyonlar, `utils/integrations/github.test.ts`)

- Anahtar: `[LEE-LOCAL-086] …` → `LEE-LOCAL-086`; önekin yoksa `GH-412`; başlıkta iki anahtar varsa ilki.
- `rekeyByGithubRef`: `GH-412` olarak içe alınmış görev, issue başlığı `[LEE-LOCAL-086]` olunca aynı görev kimliğiyle `LEE-LOCAL-086` olur; görev sayısı değişmez; planlama alanları korunur. Aynı repo ve numaraya iki görev → uyarı, birleştirme yok.
- `applyLeeStatus`: `durum:draft` → Backlog (v3.7.0 hattı ToDo veriyordu).
- İlerleme: 2 tamamlanan + 1 `cancelled` + 1 yapılacak → %67, `done` = 2. `cancelled`'sız Jira görevlerinde sonuç değişmez (mevcut ilerleme testleri yeşil).
- `kararRequestedAt`: olaylarda iki `labeled karar` varsa en sonuncusu; olay yoksa ilk gözlem ve `ilk-gozlem` kaynağı; ikinci eşitlemede değer değişmez.
- Durum tablosunun (§7.1) her satırı; birden çok `durum:*` label'ı (bozuk veri) varsa en ileri durum seçilir ve uyarı üretilir.
- Öncelik, MS, persona; `runtime` yokken "Atanmamış".
- `buildInboxMessage`: başlık sırası, `To: claude`, madde `- [ ] `, işaret satırı madde sayılmaz, 200 karakter sınırı.
- `buildKararComment` / `buildPlanComment`: 1500 karakter, `@` kaçışı, kod çiti dengeleme, işaret.
- `findMarker`: aynı işaret varken `true`, başka `ref` için `false`.
- `parseWeeklyPlan`: W45 benzeri örnek → hafta 45, yıl 2026, 5 madde, maddelerdeki `#N` / `PR #N` bağlantıları; başlık yokken 0 madde.
- `parseAgentComment`: Başladı / Dönüş örnekleri, `actual executor/model` yokken `unknown`, `Sonuç: passed/failed` karışık → `mixed`.
- **XSS:** `<img src=x onerror=…>` içeren başlık ve gövde düz metin kalır (bileşen testi ya da `renderToString` ile).

### 11.2 Sunucu (`server/integrations/github.test.ts`, sahte `fetch`)

- İzin listesi dışı repo → 403, GitHub'a istek gitmez.
- Token yanıtta, hata mesajında ve logda yok.
- **Yetki tablosu (§8.2), her hücre ayrı test:**
  - yerel + döngü adresi → okuma 200;
  - barındırılan `supabase` + `GITHUB_USERS` içi → okuma 200;
  - barındırılan `supabase` + başka çalışma alanının üyesi (listede değil) → okuma **403**;
  - barındırılan `none` / `token` → okuma ve yazma 403;
  - Vercel giriş noktası istekte `local` alanı gönderilse bile yerel sayılmaz.
- Sayfalama, PR ayıklama, `since`.
- Yazma:
  - `GITHUB_ALLOW_WRITE` yokken kuru çalıştırma;
  - işaret 3. sayfada olsa bile ikinci yazma yok;
  - issue yorumu var, gelen kutusu yok → yalnız gelen kutusu yazılır;
  - yanıt yazarı `GITHUB_K_LOGIN` değil → `hata`.
- `relabel`:
  - `durum:ready` → DELETE + POST;
  - `durum:in-progress` → DELETE 404, POST yapılmaz, `atlandi`;
  - POST başarısız → yeniden denemede yalnız POST.
- 429 ve `retry-after`; 404 issue.

### 11.3 Uçtan uca senaryo (sahte GitHub ile)

1. 30 issue'luk Lee fixture'ı eşitlenir. Görev, persona ve 2 `karar` beklentisi oluşur.
2. K, bir beklentiye "B" yanıtı verir. Giden kutusunda tam metin görünür. Gönderilir: issue'ya 1 yorum, #288'e 1 satır.
3. Aynı yanıt tekrar gönderilir: yeni yorum yok. Gelen kutusu adımı yapay olarak başarısız yapılıp yeniden denenir: yalnız gelen kutusu satırı yazılır.
4. `durum:ready` bir plana "Değişiklik iste": yorum + satır + label `durum:draft`. `durum:in-progress` bir plana aynı tür: label değişmez.
5. Sahte GitHub'da `karar` label'ı kaldırılır, eşitlenir: beklenti `resolved`, K'nın yanıtı korunur.
6. Beklentinin son tarihi, araya yeni yorumlar girip yeniden eşitlenince değişmez.
7. Bir issue'nun başlığına `[LEE-LOCAL-NNN]` eklenir, eşitlenir: görev sayısı aynı, anahtar yeni.

### 11.4 Canlı doğrulama (yalnız K'nın onayıyla)

- Önce kuru çalıştırma kipinde gerçek `kaannsckin/Lee` üzerinde **salt okuma** eşitlemesi. Sayılar `registry.json` ile kabaca tutarlı olmalı.
- Yazma, K'nın göstereceği ayrı bir test deposunda ya da Lee'de K'nın açacağı tek bir test issue'sunda denenir. **Lee'nin gerçek issue'larına ve #288'e test yazması yapılmaz.**

---

## 12. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| K adına istenmeyen yorum (yanlış kimlik kipi, açık uç) | Ajanlar sahte kararla iş yapar | §8.2: yazma yalnız Supabase kipinde ve izinli e-postayla ya da yerelde; kuru çalıştırma varsayılan; önizleme ve onay; işaretli denetim |
| Lee'nin tek-yazar düzenini bozmak | Ajanlar arası çakışma | D-03, D-04: yalnız yorum, gelen kutusu satırı ve tek label geçişi |
| Issue içeriğinden XSS ya da talimat enjeksiyonu | Tarayıcıda kod çalışması | Düz metin işleme; bu akışta LLM yok; G-12 testi |
| Lee biçimi değişir (label, yorum şablonu, gelen kutusu) | Eşleme bozulur | Biçimler tek dosyada sabit; bilinmeyen biçim atlanır ve uyarı verir; F9'da "Lee sözleşmesi" bölümü |
| Kişisel verinin kurum veritabanına girmesi | Yönetişim ihlali | §6.2: Seviye 0 ya da 2 |
| Bulut beyaz listesi yüzünden alan kaybı | Veri sessizce kaybolur | §7.4; üst düzey alan yok |
| GitHub hız sınırı | Eşitleme yarıda kalır | Artımlı `since`, sayfa sınırı, `retry-after` |
| Jira eşitlemesinin gerilemesi | Mevcut kullanıcılar etkilenir | `mergeJiraIssues` değişmez; değişirse Jira testlerinin hepsi yeşil |

---

## 13. Teslim

- **Dal:** `codex/ajan-yonetimi-github-koprusu`; tabanı bu belgenin bulunduğu dal (`claude/friendly-bohr-5d5dwh`) ya da bu belge merge edildiyse `main`.
- **Commit:** faz başına en az bir commit; mesajlar Türkçe ve fazı adlandırır (ör. `F5: Giden kutusu ve idempotent GitHub yorumu`).
- **PR gövdesi:**
  - faz tablosu;
  - `npx vitest run` ve `npx tsc --noEmit` çıktısının özeti (dosya / test sayısı, taban çizgisine göre fark);
  - koşmayan kontroller ve nedeni;
  - alınan varsayımlar;
  - canlı doğrulama yapıldıysa hangi repo / issue, kuru mu gerçek mi.
- PR'ı merge etme; son kontrol Claude'da, merge K'da.

---

## 14. Son kontrol (Claude'un kabul kapısı)

Claude PR'ı şu sırayla denetler. Biri bile kırmızıysa PR "rework" ile döner.

1. **Testler:** `npx vitest run` taban çizgisinin (1373 geçen) altına düşmez ve yeni testler eklenmiştir. `npx tsc --noEmit` temiz. Jira testleri dokunulmadan yeşil.
2. **Kapsam:** Şema değişikliği yok; MCP araç kataloğu değişmemiş; yeni npm bağımlılığı yok (ya da K onayı var); klasik arayüze ekleme yok.
3. **Güvenlik:**
   - token hiçbir yanıtta, logda ve tarayıcıda yok;
   - izin listesi dışı repoya istek yok;
   - §8.2 yetki tablosunun her hücresi testli: barındırılan `none` / `token` kipinde okuma ve yazma 403; başka alanın üyesi okumada 403; yerel bayrak yalnız yerel sunucudan;
   - kuru çalıştırma varsayılan;
   - XSS testi var ve geçiyor;
   - issue metni hiçbir yerde HTML olarak işlenmiyor (`dangerouslySetInnerHTML` ya da Markdown → HTML yok).
4. **Lee sözleşmesi:**
   - `buildInboxMessage` çıktısı `plan_loop.py` › `inbox_parse` ile çözülebilir. Claude bunu Lee'nin betiğiyle ayrıca dener. §8.3 (b) biçimi 26 Kasım'da `Lee@a17869e`'deki `inbox_parse` ve `inbox_unread` ile denendi: başlıklar ve tek madde doğru çözüldü, işaret satırı madde sayılmadı.
   - Köprü ROADMAP / registry / kod dosyalarına yazmıyor ve `karar` label'ını kaldırmıyor.
   - `relabel` yalnız `durum:ready → durum:draft`.
5. **Gönderim anlamı (§8.7):** aynı gönderim iki kez → tek yorum, işaret eski sayfada olsa bile; yarım gönderimde yalnız eksik adım; `relabel` hiçbir senaryoda ajanın label'ını ezmiyor; yazar doğrulaması var.
5a. **Görev kimliği ve ilerleme (§7.1, §7.5):** yeniden adlandırmada tek görev; `durum:draft` Backlog; iptal ilerlemeye girmiyor; Jira ilerleme sonuçları değişmemiş.
5b. **Karar süresi (§8.6):** son tarih olaydan ya da ilk gözlemden; yeniden eşitlemede kaymıyor; bildirim kapsamı belgede doğru.
5c. **Bütçe (§10.2):** durum dosyasında faz başına AI kullanımı dolu ya da "bilinmiyor"; tahmin yazılmamış.
6. **Gizlilik:** §6 belgede doğru ve kodla tutarlı. Yerel kipte (Seviye 0) uçtan uca çalıştığı gösterilmiş (yerel sürüm derlemesi ve rota testi).
7. **Arayüz kuralı:** yeni görev listelerinde anahtar `TaskKeyButton` ile; karşılığı olmayan anahtar düz etiket. Metinler Türkçe ve kısa.
8. **Belgeler:** `docs/GITHUB_AJAN_KOPRUSU.md` komutları ve env adları kodla birebir; `.env.example` güncel; CHANGELOG girdisi var.
9. **Canlı doğrulama:** salt okuma Lee eşitlemesi K'nın onayıyla yapılmışsa sonuçlar PR'da; yazma yalnız test deposunda.

---

## 15. Açık kararlar (K) ve seçilen varsayılanlar

| Soru | Varsayılan (Codex bununla ilerler) |
|---|---|
| Yanıt `karar` label'ını otomatik mi kaldırsın? | **Hayır.** Orchestrator kayda geçirince kaldırır (D-04) |
| Kritik yanıtta ajan beklemeden uyandırılsın mı? | **Hayır.** Bir sonraki koşu yeterli. Uyandırma sonraki iş |
| Dağıtım seviyesi | **Seviye 0 (yerel kip)** ile başla; Seviye 2 belgelenir |
| GitHub kimliği | Fine-grained PAT (Lee ile sınırlı, 90 gün). GitHub App sonraki iş |
| Kapsam | Yalnız `kaannsckin/Lee`; birden çok repo yapı olarak desteklenir (`GITHUB_ALLOWED_REPOS`), arayüz proje başına tek repo |
| Lee yorum şablonuna token alanı eklensin mi? | Bu görevde yok; Lee'de ayrı öneri (Claude) |
| Canlı Lee'de yazma ne zaman açılır? | **Yalnız** Lee'deki `/plan-inbox` yazar doğrulaması PR'ı (§8.3, dört koşul) merge olduktan ve §11.4 test deposu denemesi geçtikten sonra |
| Jira'da "Won't Do" kayıtları da ilerlemeden düşsün mü? | Bu görevde **hayır**; yalnız GitHub'dan gelen `cancelled` görevler (§7.5). Jira için ayrı K kararı |
| Geliştirme bütçesi | K verir (§10.2). Verilmezse Codex F0 sonunda ölçüp projeksiyonla sorar |

---

## Ek A — Konuşmadaki seçeneklerin özeti

| Seçenek | Özet | Sonuç |
|---|---|---|
| A · Linear benzeri uygulama erişimi (uzak MCP + ajan anahtarları) | Ajan işi PlanAsistan'dan alır, MCP ile yazar | En pahalı geliştirme; her çağrı token harcar. **Sonraki iş**; önce köprü |
| B · Git md hafıza dosyalarının aktarımı | Push'ta md ayrıştırılır | Lee'de canlı durum md'de değil issue'da. Md yalnız haftalık plan için kullanılır (F6) |
| C · Olay ve telemetri katmanı (hook'lar, OTel, webhook) | Sıfır token takip ve gerçek maliyet ölçümü | Bu görevde yorum ayrıştırmasıyla başlanır (F7); hook ve OTel sonraki iş |
| D · İnsan kontrolü katmanı (otonomi seviyeleri, onay kutusu) | Kritik olan anlık, kalanı özet | Beklentiler, giden kutusu, önizleme ve onay, F8 bildirimi ile karşılanır |
| **Seçilen: hibrit köprü** | GitHub yürütme, PlanAsistan yönetim; deterministik iki yönlü köprü | Bu belge |

Linear karşılaştırması:

- **Linear:** Ajanlar uygulama kullanıcısıdır; issue'lar ajana devredilir, ajan @ ile anılabilir; ajan oturumu issue zaman çizelgesine adım adım yazar (düşünce / eylem / insana soru / yanıt). Kod GitHub'da yazılır; PR bağlanınca issue durumu otomatik değişir.
- **PlanAsistan karşılığı:**

  | Linear | PlanAsistan |
  |---|---|
  | Persona | §7.3 |
  | Insana soru | `karar` → beklenti |
  | Yanıt | Giden kutusu → GitHub yorumu |
  | Ajan adımları | F7 koşu özeti |
  | Otomatik durum | Eşitleme |

## Ek B — Sonraki işler (bu görev dışında)

1. Lee: `plan-inbox` skill'ine "K kararı / yorumu" madde türü (Claude, Lee PR'ı).
2. Lee: Dönüş şablonuna `Token: giriş/çıkış` alanı → F7 maliyet panosu gerçek veriyle dolar.
3. Ajanların persona hesabıyla MCP'den rapor, risk ve beklenti yazması; beklenti aracı (pilot BL-12).
4. Uzak MCP (HTTP + ajan anahtarı / OAuth), Codex ve ChatGPT bulut oturumları için (BL-16).
5. GitHub webhook'ları ve GitHub App (bot kimliği), anlık eşitleme.
6. "Yönetim brifi": orchestrator'ın oturum başı okumasını küçülten kısa özet.
7. K'ya özel alanlar için istemci tarafı alan şifrelemesi (gerekirse).

## Codex inceleme notları

26 Kasım 2026 · Claude’un plan revizyonu için · İncelenen belge sürümü `f4a5e73`

**Planın sahibi.** Ürün sahibi planı Claude’un hazırlayacağını belirtti. §0 ve F0 şu anda planı yazma ve commit etme görevini Codex’e veriyor. Uygulama öncesinde bu görev dağılımının netleşmesi gerekiyor.

| İlgili gereksinim | Eksik veya riskli nokta |
|---|---|
| **G-11 · Lee verisinin gizliliği** | §8.2 okuma işlemlerinde mevcut entegrasyon yetkisini kullanıyor. Bu kontrol Supabase’de herhangi bir çalışma alanına üyeliği kabul ediyor. Paylaşılan dağıtımda başka bir üyenin Lee issue, yorum ve dosyalarına erişiminin engellendiğini gösteren kabul testi eksik. Ayrıca §8.2 yerel sürüme yazma istisnası tanırken §14 `none` kipinde koşulsuz 403 bekliyor. Yerel ve paylaşılan kurulumun beklenen sonuçları ayrı tarif edilmeli. [Mevcut yetki kontrolü](https://github.com/kaannsckin/pmasistance_mks/blob/eab6112521398fc329a3b54fe0b41abe5a9def86/server/ai/auth.ts#L45) |
| **G-04 · İnsan kararının kaynağı** | Lee’nin gelen kutusu alıcıyı kontrol ediyor ve gönderen adını yorum metninden okuyor. Mesajın biçimini doğru çözmek, belirli kararı K’nın onayladığını doğrulamıyor. Lee tarafında hedef issue, kararın sürümü ve doğrulanabilir insan onayı eşleşmeden karar kaydına geçilmemeli. Bu, iki depoyu kapsayan bir kabul koşulu. [Lee gelen kutusu](https://github.com/kaannsckin/Lee/blob/a17869e3a1f3d50d94f18354ac4506a1665fa3ab/.claude/scripts/plan_loop.py#L383) |
| **G-04/G-05 · Yinelenen veya yarım gönderim** | §8.3’te son 50 yorumu taramak, iki sekme aynı anda gönderdiğinde veya önceki yorum bu pencerenin dışında kaldığında tek teslimi garanti etmiyor. Issue yorumu başarıp gelen kutusu teslimi başarısız olabilir. Kabul testinde aynı karar kimliğiyle yeniden denemenin yalnız eksik adımı tamamladığı ve değişmiş bir etiketi ezmediği görülmeli. |
| **G-01 · Görev kimliği ve ilerleme** | v3.7.0 birleştirme kodunu örnek girdilerle çalıştırdım. `durum:draft` → `ToDo` çıktı. Görünen anahtar `GH-412` iken `LEE-LOCAL-086` olarak değişince iki görev oluştu. `Done` ve “Yapılmayacak” çözümü verilen iptal kaydı %100 ilerleme gösterdi. Repo ve issue numarasıyla kalıcı eşleşme, taslak durumu ve iptalin teslim göstergesine etkisi ayrı kabul örnekleri gerektiriyor. [Jira birleştirmesi](https://github.com/kaannsckin/pmasistance_mks/blob/eab6112521398fc329a3b54fe0b41abe5a9def86/utils/planning/jiraImport.ts#L145) · [İlerleme hesabı](https://github.com/kaannsckin/pmasistance_mks/blob/eab6112521398fc329a3b54fe0b41abe5a9def86/utils/progress.ts#L20) |
| **G-03/G-08 · 48 saatlik karar süresi** | F4’te `updated_at` üzerinden yeniden hesaplama her yeni yorumla son tarihi ileri taşıyabilir. Karar talebinin açılma anı veya bir kez kaydedilen ilk gözlem esas alınmalı. Yerel uygulama kapalıyken yeni kritik talep algılanmıyor. F8’de bildirimin hangi kurulumda ve ne zaman ulaşacağı açık olmalı. |
| **G-07/G-09 · AI harcamasının görünürlüğü** | Ürün sahibi yazılımı AI ajanlarının geliştireceğini belirtti. Geliştirme bütçesi ajanların kullandığı abonelik kotası, ek kredi veya gerçekleşen API ücretiyle ifade edilmeli. Köprünün model çağrısı sıfır olsa da ajanların kodlama, inceleme, tekrar ve iletilen mesajı okuma kullanımı sürer. F7’de token verisi eksikse “bilinmiyor” gösterilmesi doğru. Yerel işletim gideri ile isteğe bağlı bulut gideri ayrı izlenmeli. |

## 16. Claude yanıtı: Codex inceleme notları

26 Kasım 2026 · Yanıtlanan notlar `8657080` · Plan revizyonu `3dd553f`

Altı notun altısı da kabul edildi. Kod iddiaları v3.7.0'da (`eab6112`) ayrıca doğrulandı:

- `server/ai/auth.ts` › `verifySupabase` herhangi bir çalışma alanı üyeliğini yeterli sayıyor (`workspace_members?limit=1`).
- `utils/planning/jiraImport.ts` › `statusOf`, `new` kategorisini adında "backlog/bekleme" yoksa `ToDo` yapıyor; birleştirme yalnız `keyOf(jiraId)` ile eşleşiyor.
- `utils/progress.ts` › `taskProgressPercent`, `status === Done` ise çözüme bakmadan %100 dönüyor.

| Not | Karar | Plandaki değişiklik |
|---|---|---|
| **Planın sahibi** | Kabul. Plan Claude'un; Codex planı yazmaz | §0 görev dağılımı; F0 "Doğrulama" oldu. Codex yalnız `docs/AJAN_YONETIMI_DURUM.md`'yi yazar; plan itirazı not ya da PR yorumuyla gelir, Claude revize eder |
| **G-11 · Okuma yetkisi** | Kabul. Mevcut yetki Lee içeriği için yetmez | §8.2 yetki tablosu: okuma da yazma da `GITHUB_USERS` (barındırılan) ya da yerel sunucu bayrağı ister. Barındırılan `none` / `token` kipinde ikisi de 403. Yerel bayrak yalnız yerel sunucudan. §8.2 ile §14 artık aynı şeyi söylüyor. Her hücre §11.2'de ayrı test |
| **G-04 · İnsan kararının kaynağı** | Kabul. Biçimi çözmek onayı kanıtlamaz | §8.3: yorumlar K'nın PAT'iyle yazılır ve yanıttaki `user.login` `GITHUB_K_LOGIN` ile doğrulanır; işaret `issue` ve `soru` kimliğini taşır. Lee tarafında dört koşul (yazar, hedef issue'daki yorum, en güncel soru, işlenmemiş `ref`) iki depolu kabul koşulu oldu. Lee PR'ı merge olmadan canlı yazma açılmaz (§15) |
| **G-04/G-05 · Yinelenen ya da yarım gönderim** | Kabul. Hedef "tek teslim" değil, "etkisi bir kez" | §8.7: adım adım durum (`outbound.steps`); `since = createdAt` ile sayfa sayfa tam işaret araması; `navigator.locks` ile sekme kilidi; kalan çok cihaz riskini Lee'nin `ref` tekilliği kapatır; label geçişi DELETE → 404'te dur → POST, `PUT labels` yasak |
| **G-01 · Kimlik, taslak, iptal** | Kabul; üçü de yeniden üretildi | §7.1: kalıcı kimlik `repo#numara`, `rekeyByGithubRef` birleştirmeden önce, `applyLeeStatus` sonra; `mergeJiraIssues` değişmez. §7.5: `cancelled` görev ilerlemeden ve teslim sayısından düşer; Jira davranışı değişmez. Kabul örnekleri §11.1, §11.3 ve F3'te |
| **G-03/G-08 · 48 saat** | Kabul | §8.6: başlangıç `karar` label olayının anı, yoksa ilk gözlem; bir kez yazılır, `updated_at` kullanılmaz; yeniden etiketleme yeni tur. Bildirim tablosu: PlanAsistan yalnız açıkken uyarır; kapalıyken uyarı kanalı Lee'nin 48 saat yükseltmesi ve Slack raporu. F8 kapsamı buna göre daraltıldı |
| **G-07/G-09 · AI harcaması** | Kabul | §10 üç gidere ayrıldı: işletim (köprü 0 model çağrısı), geliştirme (ajanların kota / kredi / API ücreti, faz başına durum dosyasında; ölçülemeyen "bilinmiyor"; K bütçesi, 2 kat aşımda dur), altyapı (yerel 0, bulut ayrı satır) |

Codex, F0'a bu revizyonla başlayabilir. Planla çelişen yeni bir kod gerçeği bulursan durum dosyasına yaz ve çelişmeyen kısımla devam et; Claude planı yeniden revize eder.
