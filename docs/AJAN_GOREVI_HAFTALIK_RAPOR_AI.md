# Ajan görevi: Haftalık rapor AI asistanını kuruma, projeye ve kişiye göre öğrenen hâle getirmek

> **Kullanım:** Bu dosyanın tamamını ajana ilk mesaj olarak verin ya da "`docs/AJAN_GOREVI_HAFTALIK_RAPOR_AI.md` dosyasındaki görevi planla ve uygula" deyin.
> Satır numaraları 9 Ekim 2026 tarihli koda göredir; kod değişmiş olabilir, sembol adıyla arayın.

---

## 0. Rolün ve çalışma biçimin

Sen bu depoda çalışan kıdemli bir full-stack (TypeScript / React) mühendisisin. Görevin, PlanAsistan'daki **haftalık rapor AI asistanını** kurum rapor kılavuzuna daha iyi uyan, kurum, bölüm, proje ve kişi bazında **ölçülebilir biçimde öğrenen** bir sisteme dönüştürmek.

Çalışma sırası:

1. **Aşama 0 — Keşif ve plan** (§6): kodu oku, plan dosyasını yaz, commit'le.
2. **Fazlar F1–F9** (§7): sırayla uygula. Her faz ayrı commit (gerekirse birkaç küçük commit). Her commit'ten önce testler ve tip denetimi yeşil olmalı.
3. Her fazın sonunda plan dosyasındaki durum tablosunu güncelle.

Belirsizlikte makul varsayılanı seç; varsayımı plana ve commit mesajına yaz, ilerlemeye devam et. **Yalnız şu durumlarda dur ve sor:**

- Verinin kurum dışına çıkması gerekiyorsa.
- Mevcut bir davranışın kullanıcıya görünür biçimde kaldırılması gerekiyorsa.
- Yeni bir npm bağımlılığı şartsa.

---

## 1. Proje bağlamı

- **PlanAsistan:** TÜBİTAK BİLGEM için proje, program ve portföy yönetimi web uygulaması.
- **Teknoloji:**
  - React 19, Vite 6, TypeScript 5.8.
  - Sunucusuz uçlar `api/` altında (Vercel). AI vekil sunucusu `server/ai/` altında; OpenAI, Azure, Anthropic ve Gemini destekli, OpenAI uyumlu kurum içi uçlar (vLLM, Ollama, LiteLLM) da bağlanabiliyor.
  - Veri tarayıcıda (IndexedDB) duruyor; isteğe bağlı Supabase bulut eşitlemesi var.
- **Dil:** Arayüz metinleri, kod yorumları, belgeler ve commit mesajları **Türkçe**. Kısa, net cümleler. Örnek üslup için `utils/weeklyReport.ts` ve `utils/ai/reportAssessment.ts` dosyalarının başındaki açıklama bloklarına bak.
- **Mimari ilkeler:**
  - İş mantığı **saf fonksiyonlar** olarak `utils/` altında yazılır; her birinin yanında `*.test.ts` bulunur (vitest).
  - Arayüz `components/modern/` altındadır. Klasik arayüze yeni özellik eklenmez.
  - **Model çıktısı hiçbir zaman doğrudan veriye yazılmaz:** önce öneri olarak gösterilir, kullanıcı onaylarsa uygulanır.
  - Ekran içi AI çağrıları `useAiRun` (`components/assistant/AiButton.tsx`) üzerinden yapılır. Ad maskeleme (`utils/ai/masking.ts`) ve AI politikası (`AiPolicy.embedded`) orada zaten uygulanır. Yeni sunucu ucu gerekmez.
- **Taban çizgisi:** `npm ci` sonrasında `npx vitest run` → 88 test dosyası, 714 test geçiyor. `npx tsc --noEmit` temiz.

---

## 2. Haftalık rapor alanı (iş kuralları)

**Akış:** PY (proje yöneticisi) projesinin raporunu yazar → BS (bölüm sorumlusu) düzenler, onaylar ve bölüm eklemelerini yazar → PYB destek (PYDS) formatı denetler → hafta yayınlanır → müdürlere bölüm gruplu birleşik rapor gider. Admin bazı onay adımlarını kapatabilir (`ReportFlow`).

- PYB destek yetkisi `report.review` iznidir (`isReportSteward`).
- Rapor yapısı:
  - `thisWeek`: kategori etiketli maddeler; kategoriler `CATEGORY_META` içinde.
  - `nextWeek`: gelecek hafta planı.
  - `abbreviations`: kısaltmalar.
  - Ek alanlar: PY sağlık puanı, geçen haftanın plan değerlendirmesi (`planReview`), AI metin puanı (`aiAssessment`).
- Kurum rapor kılavuzunun özü (tam metin `REPORT_SYSTEM` içinde):
  - Kısaltmaların açılımı yazılır. Tarih, rakam ve müşteri adı net verilir; "bazı", "yakında", "ilgili birim" gibi belirsiz ifade kullanılmaz.
  - Yalnız takvim, bütçe ve riski etkileyen önemli gelişmeler yazılır; rutin iç işler yazılmaz.
  - Konuya PY kadar hâkim olmayan biri de anlayabilmelidir.
  - Toplantı maddesi zaman, yer, katılımcılar, gündem ve kararları içerir.
  - "Çalışmalara devam edildi" yerine neyin üzerinde çalışıldığı yazılır.
  - Kısa cümleler kullanılır, paragraf yazılmaz.

---

## 3. Mevcut durum: dosya haritası

| Ne | Nerede |
|---|---|
| Rapor sistem istemi (kılavuz koda gömülü), örnek girdi ve çıktı, girdi oluşturucu, yanıt çözümleyici | `utils/ai/weeklyReportPrompt.ts` (`REPORT_SYSTEM` :14, `REPORT_EXAMPLE` :35, `buildReportInput` :64, `buildReportPrompt` :104, `parseReportSuggestion` :126) |
| Rapor iş mantığı: haftalar, kategoriler, akış, kaydetme, format denetimi (`lintReport` :460), kısaltma sözlüğü, birleştirme, çıktılar, ince ayar JSONL (`fineTuneLines` :755) | `utils/weeklyReport.ts` |
| Rapor düzenleyici: AI önerisi (`suggest` :328, `applySuggestion` :335), üslup örneği seçimi (:247), öneri önizlemesi (:750) | `components/modern/weekly/ReportEditor.tsx` |
| Rapor ayarları paneli (dağıtım, entegrasyonlar, kısaltma sözlüğü, "AI ince ayarı" kartı) | `components/modern/weekly/Panels.tsx` (`ReportSettingsPanel` :112) |
| Rapor sayfası ve sekmeleri (mine, inbox, status, report, settings) | `components/modern/ModernWeeklyReport.tsx` |
| Birleşik rapor ve yayında AI metin puanı | `components/modern/weekly/ConsolidatedReport.tsx`, `utils/ai/reportAssessment.ts` |
| Tahmin tarafında örnek alınacak desen: altın set, kalite kapısı, değerlendirme koşuları, ince ayar karar kartı ve veri kümesi | `utils/planning/evaluation.ts`, `utils/ai/estimateEval.ts`, `utils/ai/fineTune.ts`, `components/modern/admin/ForecastQuality.tsx`, `docs/INCE_AYAR_KARARI.md` |
| Ad maskeleme (AI trafiği) ve veri kümesi ad maskeleme | `utils/ai/masking.ts` (`buildMasker`, `collectMaskEntries`), `utils/ai/fineTune.ts` (`redactNames`, `personNames`) |
| Arama ve metin yardımcıları | `utils/rag/bm25.ts` (`buildBm25`, `searchBm25`), `utils/rag/text.ts` (`foldTr`, `terms`, `hashText`), `utils/ai/json.ts` (`extractJson`) |
| Tipler | `types.ts`: `WeeklyReport` :772, `ReportItem` :737, `ReportSettings` :896, `AiPolicy` :830, `WorkspaceData` :623, `Project` :491, `Task.resolvedAt` :60 |
| Kalıcılık ve eşitleme | `utils/workspace.ts` (`normalizeWorkspace`), `utils/cloudSync.ts` (`splitWorkspaceDoc`: bulutta paylaşılan alanlar **beyaz listeyle** seçilir; proje notları ve müşteri istekleri **özeldir**, buluta gitmez) |
| Yetki, denetim günlüğü | `utils/permissions.ts` (`report.review`), `utils/rbac.ts` (`ownsProject`), `utils/audit.ts` (`createAuditEntry`, `appendAudit`) |
| Yönetici konsolu bölümleri | `components/modern/adminSections.ts`, `components/modern/ModernAdmin.tsx` |
| Arayüz parçaları | `components/modern/ui.tsx` (`Card`, `Field`, `Sheet`, `rowSep`), `components/modern/weekly/shared.tsx` (`Pill`), `m-btn` sınıfları |

---

## 4. Tespit edilen eksikler

1. **Ölçüm yok.**
   - Rapor taslağı için altın set, kalite kapısı ya da kabul oranı yok.
   - Önerinin hangi istem sürümüyle üretildiği kaydedilmiyor.
   - Reddedilen öneri iz bırakmıyor.
   - `aiDraft` her uygulamada üzerine yazılıyor. "Sonuna ekle" kipinde AI maddeleriyle insan maddeleri ayırt edilemiyor; `source: 'ai'` alanı var, ama özgün AI metni saklanmıyor.
2. **Kılavuz koda gömülü.**
   - `REPORT_SYSTEM` içinde "TÜBİTAK BİLGEM" sabit yazılı.
   - Kurum ya da bölüm kılavuzu düzenleyemiyor; sürüm tutulmuyor.
   - `ReportSettings` içinde kılavuz alanı yok.
3. **Proje bağlamı yok.** `Project` tipinde proje tanımı, müşteri, ürün ya da terim alanı yok. Model, "konuya hâkim olmayan biri anlayabilmeli" kuralını veriyle karşılayamıyor.
4. **Girdi eksik.** `buildReportInput` şunları içermiyor:
   - Bu hafta kapanan işler. Şu an yalnız terminli açık işler giriyor (:94).
   - Geçen haftanın plan değerlendirmesindeki durumlar ("yapıldı", "ertelendi" vb.). Şu an yalnız plan listesi giriyor (:98).
5. **Üslup örnekleri zayıf.**
   - Yalnız aynı PY'nin son 3 onaylı raporundan, en fazla 8 madde alınıyor.
   - Yeni PY için hiç örnek yok.
   - Benzerliğe göre seçilmiyor.
   - PYB destek "örnek rapor" işaretleyemiyor.
   - Geçmiş bir hafta yazılırken daha sonraki raporlar da örnek olarak girebiliyor (zaman sızıntısı).
6. **Geri bildirim döngüsü kopuk.** BS ve PYB destek iade notları, sık görülen format hataları ve AI taslağı ile onaylı hâl arasındaki farklar sonraki önerilere yansımıyor.
7. **Çıktı denetlenmiyor.**
   - Öneri önizlemesinde `lintReport` çalışmıyor.
   - Girdide olmayan tarih, rakam ve adlar yakalanmıyor. AI metin puanında birebir alıntı güvencesi var; taslakta yok.
8. **Rapor ince ayar verisi kullanıma hazır değil** (`fineTuneLines`).
   - Kişi adları maskelenmiyor; tahmin veri kümesinde maskeleme var.
   - İstem sürümü, eğitim/doğrulama ayrımı ve veri kartı yok.
   - Altın set dışarıda tutulmuyor.
   - Eğitimdeki istem ile kullanımdaki istem aynı değil: kullanımda örnek gösterim (few-shot) var, eğitimde yok.
9. (Düşük öncelik) Bölüm eklemesi raporları (`kind: 'department'`) için AI önerisi yok (`suggest`, `project` yoksa çıkıyor).

---

## 5. Hedef: katmanlı öğrenme

| Katman | Kapsam | Öğrenilen | Faz |
|---|---|---|---|
| Ölçüm: günlük, kabul oranı, altın set, değerlendirme | Hepsi | Neyin işe yaradığı | F1, F2 |
| Proje kartı ve zengin girdi | Proje | Bağlam, terimler | F3 |
| Düzenlenebilir, sürümlü kurum ve bölüm kılavuzu | Kurum, bölüm | Kurallar | F4 |
| Dinamik örnek ve düzeltme örnekleri | Kişi, proje, bölüm | Üslup | F5 |
| Çıktı denetimi ve tek turluk otomatik düzeltme | Hepsi | Kılavuza uyum | F6 |
| Geri bildirimden öğrenilen kurallar (PYB destek onaylı) | Kurum, bölüm, proje | Tekrarlanan hatalar | F7 |
| İnce ayar veri kümesi ve ölçüye dayalı karar kartı | Kurum | Kurum dili (yalnız ölçü gösterirse) | F8 |

**Kapsam dışı:**

- Gerçek bir model eğitimi çalıştırmak.
- Veriyi otomatik olarak kurum dışına göndermek.
- Yeni sunucu ucu ya da yeni npm bağımlılığı eklemek.
- Klasik arayüzde değişiklik yapmak.

---

## 6. Aşama 0: keşif ve plan

1. Şu dosyaları oku: §3'teki tüm dosyalar, ilgili testleri (`utils/weeklyReport.test.ts`, `utils/ai/weeklyReportPrompt.test.ts`, `utils/ai/reportAssessment.test.ts`, `utils/ai/fineTune.test.ts`, `utils/cloudSync.test.ts`) ve `docs/INCE_AYAR_KARARI.md`, `docs/AI_KURULUM.md`.
2. `npm ci`, `npx vitest run` ve `npx tsc --noEmit` çalıştır; taban çizgisini doğrula.
3. `docs/RAPOR_AI_PLANI.md` dosyasını yaz. İçeriği:
   - Her faz için: veri modeli değişiklikleri (yeni tip ve alanlar, hepsi opsiyonel), yeni ya da değişen saf fonksiyonlar, arayüz değişiklikleri, testler, riskler.
   - Bulut eşitleme beyaz listesine eklenecek alanlar.
   - Açık sorular ve seçtiğin varsayılanlar (§10).
   - Durum tablosu (faz, durum, commit).
4. Planı commit'le: `Haftalık rapor AI: uygulama planı`.

---

## 7. Fazlar

Her fazda **Kabul ölçütleri** karşılanmadan sonraki faza geçme.

### F1 — Ölçüm temeli: istem sürümü, öneri günlüğü, kabul oranı

**Yapılacaklar**

- `utils/ai/weeklyReportPrompt.ts` içine `REPORT_PROMPT_VERSION` sabitini ekle (ör. `'rapor-taslak-1'`). İstem ya da girdi biçimi her değiştiğinde artırılır. F4'ten sonra etkin sürüm, kılavuz ve kural sürümlerini de içerir.
- AI kökenini kaydet:
  - `ReportItem`'a opsiyonel `aiOriginal?: { text: string; category: ReportCategory }` ekle. AI'dan gelen madde uygulanırken özgün hâli burada saklanır.
  - `WeeklyReport.aiDraft` alanını opsiyonel alanlarla genişlet: `promptVersion`, `model?` (AI durumundan alınabiliyorsa), `mode: 'append' | 'replace'`, `proposed: { thisWeek: number; nextWeek: number }`, `itemIds: string[]`.
  - Birden fazla uygulamada `itemIds` birikmeli; son `input` ve `output` korunur.
- Öneri günlüğü:
  - `WorkspaceData.reportAiLog?: ReportAiLogEntry[]`.
  - Alanlar: `at`, `reportId`, `projectId?`, `departmentCode`, `promptVersion`, `variant?`, `model?`, `outcome: 'applied_append' | 'applied_replace' | 'discarded' | 'error'`, `nThis`, `nNext`, `lintErrors`, `lintWarnings`, `ungrounded?` (F6), `repaired?` (F6).
  - Ayrıca rapor gönderilirken kayıt düşülür: `outcome: 'submitted'`, AI'dan kalan, düzenlenen ve silinen madde sayıları, gönderimdeki lint sayıları.
  - **Metin saklanmaz**, yalnız sayılar tutulur.
  - Son 2.000 kayıt tutulur.
  - Alan `splitWorkspaceDoc` beyaz listesine eklenir.
- Saf fonksiyonlar (yeni dosya `utils/ai/reportAiStats.ts`):
  - `reportAcceptance(report)` → `{ aiItems, kept, edited, deleted, humanAdded, similarity }`.
    - Kept: `aiOriginal` ile son metin (`foldTr` ve boşluk normalleştirmesinden sonra) aynı.
    - Edited: farklı. Benzerlik için `terms` tabanlı token F1 kullan.
    - Deleted: `aiDraft.itemIds` içinde olup raporda olmayan maddeler.
    - Eski raporlar (alan yok) için `null` döner.
  - `reportAiStats(ws, { by: 'department' | 'pm' | 'project' | 'promptVersion', from?, to? })`. Gruplara göre şunları çıkarır:
    - Öneri sayısı, uygulama oranı, ret oranı.
    - Kabul (aynen kalma) oranı, düzenleme oranı, silme oranı.
    - İade oranı: `history` içindeki `return` olaylarından.
    - Gönderimdeki ortalama lint hatası ve uyarısı.
- Arayüz:
  - Yönetici konsolu › "Haftalık rapor akışı" bölümüne ya da Haftalık rapor › Ayarlar'a (yalnız PYB destek) **"Rapor AI kalitesi"** kartı ekle.
  - Kartta gruplama seçici ve tablo olur; boş durum metni de bulunur.
  - `ReportEditor` içinde Vazgeç, uygula ve gönder eylemleri günlüğe yazar. Kayıt, mevcut `onSave` / `onUpdate` akışıyla çalışma alanına işlenir; yeni bir geri çağırım gerekiyorsa `ModernWeeklyReport` üzerinden geçir.

**Kabul ölçütleri**

- Eski kayıtlar bozulmadan yüklenir.
- Ekleme ve yerine koyma kiplerinde kabul ölçüleri doğru çıkar; silinen AI maddesi sayılır.
- Günlük boyutu sınırlıdır ve buluta eşitlenir.

**Testler**

- `reportAcceptance` için: ekleme kipi, yerine koyma kipi, silme, düzenleme, eski rapor.
- `reportAiStats` gruplamaları.
- `splitWorkspaceDoc` testine yeni alan.

### F2 — Rapor altın seti ve çevrimdışı değerlendirme

**Yapılacaklar**

- Tipler:
  - `ReportGoldenItem { reportId; addedAt; addedByName?; note? }` → `WorkspaceData.reportGoldenSet?`.
  - `ReportEvalRun { id; at; promptVersion; variant; model?; n; metrics; passed: boolean | null; reasons: string[] }` → `WorkspaceData.reportEvalRuns?` (son 50).
  - İkisi de bulut beyaz listesine eklenir.
- Altın sete ekleme:
  - Yalnız PYB destek, yalnız onaylı proje raporu.
  - Girdi metni gerekir: önce `aiDraft.input`.
  - `aiDraft.input` yoksa, veriler erişilebilirse `buildReportInput` ile yeniden üretilir. Proje notları PY'ye özeldir ve bulutta yoktur; bu yüzden PYB destek tarafında çoğu zaman yalnız `aiDraft.input` kullanılabilir. Girdisi olmayan rapor eklenmez ve gerekçesi gösterilir.
  - Aday önerisi: lint hatası olmayan, iade edilmemiş, farklı bölümlerden raporlar.
- Saf puanlama: `scoreReportDraft({ suggestion, gold, input, dictionary })` → madde düzeyinde ve rapor düzeyinde ölçüler.
  - **Format:** AI çıktısında `lintReport` hata ve uyarı sayısı.
  - **Dayanak:** çıktıdaki sayılar, tarihler ve özel adlar girdide geçiyor mu? Özel ad: büyük harfle başlayan, sözlükte ve kategori adlarında olmayan sözcükler; `foldTr` ile karşılaştırılır. Sonuç `ungroundedRate` olarak verilir. Bu fonksiyon F6'da yeniden kullanılır; ayrı `groundingIssues(suggestion, input)` olarak yaz.
  - **Kapsama ve isabet:** onaylı son hâlin maddeleriyle AI maddeleri açgözlü eşleştirilir (token F1 ≥ 0,5, eşik sabit ve testli). Recall ve precision bu eşleşmeden hesaplanır.
  - **Kategori doğruluğu:** eşleşen maddelerde tür aynı mı?
  - **Kısaltma:** çıktıda açılımı bilinmeyen kısaltma sayısı.
  - **Bilgi amaçlı:** `eksikBilgi` soru sayısı.
- Zaman ayrımı: altın setteki her rapor değerlendirilirken üslup örnekleri yalnız **o haftadan önce onaylanmış** raporlardan gelir; raporun kendisi asla örnek olmaz. Bu kural F5 seçicisine parametre olarak verilir.
- Varyantlar: `ReportPromptVariant = 'base' | 'card' | 'examples' | 'rules' | 'full' | 'ft'`.
  - Her faz geldikçe ilgili varyant etkinleşir.
  - İstem oluşturucu varyanta göre katmanları açar ya da kapatır.
  - `'ft'`: örnek gösterimsiz, ince ayarlı model için (F8).
- Çalıştırma:
  - "AI ile değerlendir" düğmesi seçili varyantla altın seti koşar.
  - En fazla 2 paralel çağrı, iptal edilebilir, ilerleme gösterilir.
  - Hatalı yanıtlar sayılır ve n'den düşülür.
  - Sonuç `ReportEvalRun` olarak kaydedilir.
- Kalite kapısı:
  - `AiPolicy.reportGate?: { enforce: boolean; maxLintErrorsPerReport: number; maxUngroundedRate: number; minRecall: number }`. Varsayılanlar: zorunlu değil; 0,5 / 0,05 / 0,5.
  - Zorunluysa ve geçerli istem sürümünün son koşusu geçmediyse düzenleyicide **uyarı** gösterilir; öneri engellenmez (§10).
- Arayüz:
  - Yönetici konsolu › "Tahmin kalitesi" desenini izleyen yeni bir **"Rapor AI değerlendirmesi"** bölümü ya da kartı.
  - İçerik: altın set listesi (ekle/çıkar), varyant seçimi, koşu düğmesi, varyant × ölçüt karşılaştırma tablosu, kapı ayarları.
  - Altın seti JSONL olarak indirme: `goldenJsonl` desenini izle; kişi adları maskeli.
- Altın sete ekleme, kapı ayarı değişikliği ve koşular denetim günlüğüne yazılır.

**Kabul ölçütleri**

- Sahte bir AI yanıtıyla (testte) ölçüler deterministik hesaplanır.
- Zaman sızıntısı yoktur.
- Kapı karar mantığı test edilmiştir.

**Testler**

- `scoreReportDraft` ve `groundingIssues` (Türkçe büyük-küçük harf, "10 Eylül", "10.09.2026", "50 kişilik", "%15" gibi biçimler).
- Eşleştirme eşiği.
- Kapı kararı.
- Zaman ayrımlı örnek seçimi.

### F3 — Proje kartı ve zengin girdi

**Yapılacaklar**

- `Project.aiProfile?: { summary?: string; customers?: string; product?: string; glossary?: { term: string; explanation: string }[]; stakeholders?: string; reportHints?: string; updatedAt?: string }`.
  - Proje sahibi PY düzenler (`ownsProject`).
  - Proje satırıyla buluta gider; özel alan değildir. Arayüzde bunu belirten kısa bir not göster.
- Arayüz:
  - Rapor düzenleyicide "Proje kartı" bölümü ya da sayfası (görüntüle/düzenle).
  - Kart boşsa AI önerisi düğmesinin yanında "Kartı doldurursanız öneriler daha anlaşılır olur" ipucu.
  - Alan uzunlukları sınırlıdır (ör. özet 600, terim açıklaması 200 karakter, en fazla 30 terim).
- `buildReportInput` eklemeleri (yeni parametreler opsiyonel):
  - Proje kartı (özet, müşteriler, ürün, terimler; kırpılmış).
  - **Bu hafta kapanan işler:** `status === Done` ve `resolvedAt` o haftanın içinde olanlar; en fazla 10.
  - **Geçen haftanın plan değerlendirmesi:** madde ve durum, `draft.planReview` + `PLAN_REVIEW_LABELS`.
  - Toplam girdi bütçesi yaklaşık 6.000 karakter. Öncelik sırası: notlar > kapanan işler > görüşmeler > worklog > kart > diğerleri. Bütçe aşılınca alt sıradakiler kırpılır.
- `REPORT_SYSTEM`'e bir kural ekle: "Proje kartındaki açıklamaları, konuya yabancı okurun anlaması gerektiğinde kısa açıklama olarak kullan; kartta olmayan teknik ayrıntı uydurma." `REPORT_PROMPT_VERSION` değerini artır.
- `ReportEditor.suggest`, `planReview`'u ve yeni girdileri geçirir.

**Kabul ölçütleri**

- Kartı olmayan eski projelerde girdi, yeni bölümler hariç eskisiyle aynıdır (test).
- Başka haftada kapanan iş girmez.
- Bütçe aşılmaz.

**Testler**

- `buildReportInput` yeni bölümler, hafta sınırları ve bütçe.
- Kart doğrulama ve kırpma fonksiyonu.

### F4 — Düzenlenebilir, sürümlü kurum ve bölüm kılavuzu

**Yapılacaklar**

- `REPORT_SYSTEM`'i parçalara ayır:
  1. Rol satırı: kurum adı parametreli.
  2. **Kılavuz gövdesi:** düzenlenebilir.
  3. Kategori listesi: kodda kalır.
  4. **JSON çıktı sözleşmesi:** kodda kalır; düzenlenemez, çünkü çözümleyici buna bağlıdır.
- `buildReportSystem({ guide?, departmentGuide?, learnedRules? })` yaz. Hiçbir ayar yokken mevcut `REPORT_SYSTEM` metninin **birebir aynısını** üretmelidir (regresyon testi). `REPORT_SYSTEM` sabiti bu fonksiyonun varsayılan çıktısı olarak kalabilir.
- Ayarlar:
  - `ReportSettings.guide?: { institutionName?: string; text: string; version: number; updatedAt: string; updatedByName?: string }`.
  - `ReportSettings.departmentGuides?: Record<string, { text: string; version: number; updatedAt: string; updatedByName?: string }>`: bölüme özgü **ek** kurallar.
  - Uzunluk sınırı: kılavuz 6.000, bölüm eki 1.500 karakter.
- Etkin istem sürümü: `REPORT_PROMPT_VERSION` + kılavuz ve bölüm eki sürümleri (ya da içerik özeti, `hashText`). `aiDraft`, günlük ve değerlendirme koşuları bu sürümü kaydeder.
- Arayüz (Haftalık rapor › Ayarlar, yalnız PYB destek):
  - "Rapor kılavuzu" kartı: metin alanı, kaydet (sürüm +1), "varsayılana dön", son değişiklik bilgisi.
  - "Tam istemi önizle": seçilen bölüm için oluşan sistem istemini salt okunur gösterir.
  - Bölüm ekleri için bölüm seçici.
  - Değişiklikler denetim günlüğüne yazılır.
- Kılavuz değişince ilgili kapı durumu "bayat" sayılır (tahmindeki `gateStatus` mantığı gibi).
- Kurumun kendi örnek girdi ve çıktısını düzenlemesi opsiyoneldir; F5'teki altın set örnekleri bu ihtiyacı büyük ölçüde karşılar.

**Kabul ölçütleri**

- Varsayılan durumda üretilen istem eskisiyle birebir aynıdır.
- Bölüm eki yalnız o bölümün raporlarında kullanılır.
- JSON sözleşmesi düzenlenemez.

**Testler**

- `buildReportSystem` regresyonu, bölüm eki, sürüm hesabı, uzunluk sınırı.

### F5 — Dinamik örnek seçimi ve düzeltme örnekleri

**Yapılacaklar**

- Saf seçici `selectStyleExamples({ reports, projects, report, input, now, before })`. Yeni dosya: `utils/ai/reportExamples.ts`.
  - **Aday:** onaylı proje raporları; hafta, yazılan haftadan önce (`before`); raporun kendisi hariç.
  - **Öncelik puanı:** altın sette ya da örnek işaretli +3, aynı proje +2, aynı PY +1,5, aynı bölüm +1.
  - **Sıralama:** öncelik + BM25 benzerliği (girdi ↔ rapor metni; `buildBm25` / `searchBm25`).
  - **Seçim madde düzeyindedir:** kategori çeşitliliği gözetilir; aynı rapordan en fazla 3, aynı projeden en fazla 4 madde alınır.
  - Bütçe yaklaşık 1.500 karakter.
- **Düzeltme örnekleri:** `aiOriginal` ile onaylı son hâli belirgin farklı olan maddeler (token F1 < 0,8). Aynı bölüm önce gelir, sonra kurum geneli; en fazla 3 çift. İstemde "AI'nın ilk yazdığı → kurumda onaylanan hâl" başlığıyla verilir.
- `buildReportPrompt` artık seçicinin çıktısını alır. `ReportEditor` içindeki `styleExamples` hesabı (:247) bu seçiciyle değiştirilir.
- Varyantlar: `'examples'` dinamik seçim; `'base'` eski davranışa yakın (yalnız sabit örnek).

**Kabul ölçütleri**

- Gelecek hafta sızıntısı yoktur.
- Yeni bir PY için bile bölüm ya da kurum örnekleri gelir.
- Bütçe aşılmaz.

**Testler**

- Seçicinin zaman ayrımı, kendini dışlama, öncelik, çeşitlilik, bütçe.
- Düzeltme çifti üretimi.

### F6 — Çıktı denetimi ve tek turluk otomatik düzeltme

**Yapılacaklar**

- Öneri önizlemesinde (`ReportEditor` :750) öneri `lintReport` (sözlük + önerinin kısaltmaları) ve `groundingIssues` ile denetlenir.
  - Sorunlar madde düzeyinde gösterilir: hata kırmızı, uyarı sarı; dayanaksız rakam ve tarih vurgulanır.
  - Özet satırı: "2 format hatası, 1 dayanaksız bilgi".
- `AiPolicy.reportAutoRepair?: boolean` (varsayılan kapalı). Açıksa ve hata ya da dayanaksız bilgi varsa **bir kez** ikinci çağrı yapılır.
  - Çağrıda önceki JSON ve sorun listesi verilir; "yalnız bu sorunları düzelt, girdide olmayan bilgiyi çıkar, aynı JSON biçimiyle yanıt ver" denir.
  - Yanıt yeniden çözümlenir ve denetlenir; sonuç daha kötüyse ilk sonuç gösterilir.
  - Günlüğe `repaired: true` yazılır.
- Admin AI ayarlarına `reportAutoRepair` anahtarını ekle (mevcut AI politikası arayüzünün yanına).

**Kabul ölçütleri**

- Denetim saf fonksiyonlarla yapılır ve test edilir.
- En fazla bir düzeltme turu yapılır.
- İptal ve hata durumları kullanıcıya doğru gösterilir.

**Testler**

- Düzeltme istemi oluşturucu.
- "Daha kötüyse ilkini koru" karşılaştırması.

### F7 — Geri bildirimden öğrenilen kurallar

**Yapılacaklar**

- `ReportSettings.learnedRules?: LearnedRule[]`.
  - Alanlar: `id`, `text`, `scope: 'institution' | 'department' | 'project'`, `scopeId?`, `source: 'return' | 'lint' | 'edit' | 'manual'`, `status: 'proposed' | 'active' | 'retired'`, `evidenceCount`, `examples?: string[]` (en fazla 2, kısa), `createdAt`, `approvedByName?`.
- Kural tabanlı aday üretimi (saf, `utils/ai/reportRules.ts`):
  - **Lint:** gönderimdeki lint kodlarının bölüm ya da PY bazında sıklığı (F1 günlüğü) eşiği aşınca o koda karşılık gelen hazır kural metni önerilir. Örnek: `abbr` → "Kısaltmanın açılımını ilk geçtiği yerde parantez içinde yaz."
  - **Düzenleme:** AI → onaylı hâl düzenlemelerinde tekrarlanan desenler. Belirsiz ifadenin kaldırılması, rutin maddenin silinmesi, maddeye tarih eklenmesi gibi desenler sayılır.
- AI destekli aday üretimi (opsiyonel düğme): son N iade notunu (`history` içindeki `return` notları) ve sık düzenleme örneklerini modele verir, en fazla 5 aday kural ister.
  - Yanıt yalnız **öneri** olarak listelenir; PYB destek onaylamadan etkin olmaz.
  - Çağrı `useAiRun` ile yapılır, maskeleme uygulanır.
- Etkin kurallar `buildReportSystem` içinde "ÖĞRENİLMİŞ KURUM KURALLARI" başlığıyla eklenir:
  - Kapsam başına en fazla 10 kural.
  - Kapsam süzgeci: kurum + raporun bölümü + raporun projesi.
  - Kural kümesinin özeti istem sürümüne girer.
- Arayüz (Ayarlar, PYB destek):
  - "Öğrenilmiş kurallar" kartı: öneriler (kanıt sayısı ve örnekleriyle), etkinleştir / düzenle / emekliye ayır, elle kural ekle.
  - Değişiklikler denetim günlüğüne yazılır.
- F2'de `'rules'` varyantı bu kurallarla koşar; kazanç böylece ölçülür.

**Kabul ölçütleri**

- Aday üretimi deterministik ve test edilmiştir.
- Onaysız kural isteme girmez.
- Kapsam süzgeci doğrudur.

**Testler**

- Aday üretimi (eşik, kapsam), istem eklemesi, sınırlar.

### F8 — İnce ayar veri kümesi ve karar kartı (rapor)

**Yapılacaklar**

- `fineTuneLines`'ı `utils/ai/reportFineTune.ts` içine taşı ve yeniden yaz: `buildReportFineTuneDataset(ws, opts)` → `{ train, validation, card, stats }`. Tahmin tarafındaki `buildFineTuneDataset` desenini izle.
  - **Örnekler:** onaylı, `aiDraft.input`'u olan, son hâlinde lint hatası olmayan raporlar. `reportGoldenSet` dışarıda tutulur. Tekrarlar ayıklanır.
  - **İstem eşitliği:** system = o raporun etkin kılavuzuyla `buildReportSystem`; user = `'ft'` varyantının (örneksiz) kullanımdaki istemi. İnce ayarlı model aynı varyantla çağrılmalıdır; bunu veri kartına yaz.
  - **Hedef yanıt:** onaylı son hâl, mevcut JSON sözleşmesiyle.
  - **Gizlilik:**
    - Kişi adları `redactNames` ile `[kişi]` olarak maskelenir.
    - Proje ve kurum adları için seçenek sunulur (varsayılan açık): `buildMasker(collectMaskEntries(ws))` ile tutarlı takma adlar.
    - Maskelenen ad sayısı veri kartına yazılır.
  - **Zaman ayrımı:** en son haftaların %15'i doğrulama kümesidir.
  - **Veri kartı:** oluşturulma zamanı, amaç, istem sürümleri ve dağılımı, kayıt sayıları, dönem, kategori ve bölüm dağılımı, gizlilik notu, değerlendirme yöntemi (altın set + aynı kapı).
- Karar kartı `reportFineTuneReadiness(ws)`, tahmin tarafındaki `fineTuneReadiness` mantığının raporlara uyarlanmasıdır:
  - Eşikler: en az 300 örnek, iyi sonuç için 1.000; altın set en az 20, güvenilir karar için 50.
  - En iyi ince ayarsız varyant (`full`) geçerli istem sürümüyle kapıdan geçiyorsa → "İnce ayar gerekmiyor".
  - Değerlendirme yoksa ya da bayatsa → "Karar için veri yetersiz".
  - Geride kalıyor ve veri yeterliyse → "İnce ayar önerilir"; sınırdaysa → "Düşünülebilir".
- Arayüz: Panels'teki "AI ince ayarı" kartını karar kartı + "Veri kümesini hazırla" (eğitim, doğrulama ve veri kartı indirme) ile değiştir.
- `docs/INCE_AYAR_KARARI.md`'ye "Haftalık rapor taslağı" bölümü ekle: ölçütler, adımlar ve kurum içi açık ağırlıklı modelde LoRA önerisi.

**Kabul ölçütleri**

- İndirilen veride gerçek kişi adı geçmez (test).
- Altın set kümede yoktur.
- Doğrulama kümesi zamanca en yenidir.
- Karar kuralları test edilmiştir.

**Testler**

- Veri kümesi üretimi (maskeleme, ayrım, filtreler, istem eşitliği).
- Karar kartı dalları.

### F9 — Belgeler ve deney rehberi

**Yapılacaklar**

- `docs/RAPOR_AI.md` adlı yeni belgede şunlar olmalı:
  - Katmanlar ve her birinin nerede ayarlandığı.
  - Ölçü tanımları (kabul, düzenleme ve silme oranı; iade oranı; dayanaksız bilgi oranı; recall ve precision; kategori doğruluğu).
  - **Pilot planı:**
    - Bir bölüm seçilir.
    - 2 hafta mevcut istemle taban çizgisi alınır.
    - Ardından 4–6 hafta katmanlar sırayla açılır.
    - Her katmandan sonra altın sette varyant karşılaştırması yapılır.
    - Haftalık ölçü tablosu tutulur.
  - Kapı eşikleri ve nasıl değiştirileceği.
  - İnce ayara ne zaman geçileceği.
  - KVKK notları.
  - Kurum içi model bağlama: `AI_PROVIDER=openai` + `AI_BASE_URL` (vLLM, Ollama, LiteLLM); ince ayarlı model ayrı `AI_MODEL` adıyla tanımlanır ve aynı kapıdan geçirilir.
- `README.md` AI bölümüne kısa bağlantı ekle.
- (Düşük öncelik, zaman kalırsa) Bölüm eklemesi raporları için AI önerisi. Girdi: bölüm projelerinin bu haftaki onaylı ya da gönderilmiş raporları ve bölüm görüşmeleri.

---

## 8. Teknik kurallar ve tuzaklar

- **Geriye uyumluluk:**
  - Tüm yeni alanlar opsiyoneldir.
  - `normalizeWorkspace` eski veriyi bozmaz.
  - `WORKSPACE_SCHEMA_VERSION` yalnız gerçekten gerekiyorsa artırılır.
  - Yedek içe ve dışa aktarma (`utils/workspace.ts`, `parseImportedJson`) yeni alanları taşır.
- **Bulut eşitleme:**
  - Workspace düzeyindeki her yeni alan `splitWorkspaceDoc` içindeki `core` nesnesine eklenmeli ve `utils/cloudSync.test.ts`'de doğrulanmalıdır. Eklenmezse veri sessizce yalnız yerelde kalır.
  - Proje alanları proje satırıyla gider.
  - `notes` ve `customerRequests` özeldir; buluta gitmez.
- **Yetki:**
  - Kılavuz, bölüm eki, altın set, kurallar, kapı ve veri kümesi yalnız `report.review` (`isReportSteward`) yetkisiyle yönetilir.
  - Proje kartını proje sahibi PY düzenler.
  - Yetki, saf kaydetme fonksiyonlarında da doğrulanır (`saveReport` örneği).
- **Denetim günlüğü:** kılavuz ve kural değişiklikleri, altın set ve kapı ayarları `appendAudit` ile kaydedilir. Gerekirse `AuditAction`'a yeni eylemler ve etiketleri eklenir.
- **AI çağrıları:**
  - Yalnız `useAiRun` ile yapılır (maskeleme ve politika).
  - Toplu koşularda en fazla 2 paralel çağrı olur; hepsi iptal edilebilir.
  - Hata mesajları Türkçe ve eyleme dönük olur.
- **Gizlilik:**
  - Günlüklerde rapor metni saklanmaz.
  - İndirilen veri kümelerinde kişi adları maskelenir.
  - Hiçbir veri otomatik olarak kurum dışına gönderilmez.
  - `aiDraft.input` zaten proje notlarını içeriyor ve rapor ile birlikte paylaşılıyor. Bu mevcut davranıştır; değiştirme, ama planda risk olarak not et.
- **Boyut:**
  - Günlük en fazla 2.000 kayıt, değerlendirme koşuları en fazla 50.
  - Örnek ve kural metinleri kısa tutulur.
  - İstem bütçeleri sabitlerle tanımlanır ve testlerde doğrulanır.
- **Türkçe metin:**
  - `toLocaleLowerCase('tr-TR')` ve `foldTr` kullan.
  - Düzenli ifadelerde `\p{L}` ile `u` bayrağı kullan.
  - Tarih biçimleri: "10 Eylül 2026", "10.09.2026", "10/09".
- **Arayüz:**
  - Mevcut modern bileşenler kullanılır (`Card`, `Field`, `Sheet`, `Pill`, `m-btn`, `m-input`).
  - Dokunma hedefleri en az 44 px; ikon düğmelerde `aria-label`.
  - Kısa Türkçe metin ve boş durum mesajları yazılır.
  - Karanlık mod mevcut sınıflarla çalışır.
- **Bağımlılık:** yeni npm paketi eklenmez.
- **Testler:**
  - Her saf fonksiyonun birim testi yazılır; mevcut 714 test bozulmaz.
  - Yeni testler ilgili kaynak dosyanın yanına konur.

---

## 9. Çalışma düzeni ve teslim

- Her faz için sıra:
  1. Kodla.
  2. `npx vitest run` ve `npx tsc --noEmit` çalıştır.
  3. Kendi diff'ini eleştirel oku: geriye uyumluluk, yetki, eşitleme beyaz listesi, zaman sızıntısı, gizlilik.
  4. Commit'le.
  5. Push'la.
- **Commit mesajları:** Türkçe; konu satırı en fazla 72 karakter; mevcut üslupta. Örnek: `Haftalık rapor AI: öneri günlüğü ve kabul oranı`. Gövdede ne ve neden yazılır; varsayımlar belirtilir.
- **Dal:** sana atanan geliştirme dalında çalış. İstenmedikçe PR açma.
- **Durum takibi:** her faz sonunda `docs/RAPOR_AI_PLANI.md` içindeki durum tablosunu ve açık soruları güncelle.
- **Öncelik:** zaman sınırlıysa **F1 → F2 → F3** zorunlu çekirdektir (ölçmeden iyileştirme doğrulanamaz). F4–F6 ikinci dalga, F7–F9 üçüncü dalgadır. Bir dalgayı bitirmeden sonrakine başlama.

### Bitti tanımı

- [ ] F1–F9 kabul ölçütleri karşılandı (ya da kalanlar planda gerekçesiyle "ertelendi" olarak işaretlendi).
- [ ] Tüm testler ve tip denetimi yeşil; yeni saf fonksiyonların testleri var.
- [ ] Yeni workspace alanları bulut beyaz listesinde ve normalize ediliyor.
- [ ] Varsayılan ayarlarda üretilen sistem istemi eskisiyle birebir aynı (regresyon testi).
- [ ] Altın sette en az iki varyant karşılaştırılabiliyor; sonuç tablosu arayüzde görünüyor.
- [ ] İndirilen rapor veri kümesinde gerçek kişi adı yok.
- [ ] `docs/RAPOR_AI.md`, `docs/INCE_AYAR_KARARI.md` ve `docs/RAPOR_AI_PLANI.md` güncel.

---

## 10. Açık sorular ve varsayılanlar

Ajan bu varsayılanlarla ilerler ve planda belirtir; ürün sahibi sonra değiştirebilir.

| Soru | Varsayılan |
|---|---|
| Bölüm kılavuz ekini kim düzenler? | Yalnız PYB destek (`report.review`). BS için ayrı yetki sonra eklenebilir. |
| Altın sete hangi raporlar girer? | PYB destek elle seçer; sistem lint hatası olmayan, iade edilmemiş, farklı bölümlerden adayları önerir. |
| Rapor kalite kapısı zorunlu mu? | Hayır; zorunlu yapılırsa öneriyi engellemez, uyarı gösterir. |
| Otomatik düzeltme turu açık mı? | Kapalı; admin açar. |
| Veri kümesinde proje ve kurum adları maskelensin mi? | Evet (varsayılan açık); kişi adları her zaman maskelenir. |
| Öğrenilmiş kural kendiliğinden etkinleşir mi? | Hayır; her zaman PYB destek onayı gerekir. |
| Model adı kaydı | AI durumu model adını veriyorsa kaydedilir; yoksa boş bırakılır. |
