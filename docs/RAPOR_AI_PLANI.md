# Haftalık rapor AI — uygulama planı

Görev tanımı: [`AJAN_GOREVI_HAFTALIK_RAPOR_AI.md`](AJAN_GOREVI_HAFTALIK_RAPOR_AI.md). Bu dosya fazların
somut tasarımını, varsayımları ve durumu tutar. Her faz sonunda güncellenir.

Taban çizgisi (9 Ekim 2026): `npx vitest run` → 88 dosya, 714 test; `npx tsc --noEmit` temiz.
Son durum: 96 dosya, 780 test; `npx tsc --noEmit` temiz. Tarayıcıda duman testi (sahte AI uçlarıyla): PYB destek ayar
sekmeleri, kural önerme/etkinleştirme, altın set koşusu, PY taslak önerisi, çıktı denetimi, otomatik düzeltme ve proje kartı.

## Durum

| Faz | Konu | Durum | Commit |
|---|---|---|---|
| 0 | Keşif ve plan | Tamam | Haftalık rapor AI: uygulama planı |
| F1 | İstem sürümü, öneri günlüğü, kabul oranı | Tamam | Haftalık rapor AI: öneri günlüğü ve kabul oranı |
| F2 | Altın set, çevrimdışı değerlendirme, kalite kapısı | Tamam | Haftalık rapor AI: altın set, çevrimdışı değerlendirme ve kalite kapısı |
| F3 | Proje kartı ve zengin girdi | Tamam | Haftalık rapor AI: proje kartı ve zengin girdi |
| F4 | Düzenlenebilir, sürümlü kılavuz | Tamam | Haftalık rapor AI: düzenlenebilir, sürümlü kurum ve bölüm kılavuzu |
| F5 | Dinamik örnek ve düzeltme örnekleri | Tamam | Haftalık rapor AI: dinamik üslup örnekleri ve düzeltme örnekleri |
| F6 | Çıktı denetimi ve tek turluk düzeltme | Tamam | Haftalık rapor AI: öneri önizlemesinde çıktı denetimi ve otomatik düzeltme |
| F7 | Geri bildirimden öğrenilen kurallar | Tamam | Haftalık rapor AI: geri bildirimden öğrenilen kurallar |
| F8 | İnce ayar veri kümesi ve karar kartı | Tamam | Haftalık rapor AI: ince ayar veri kümesi ve karar kartı |
| F9 | Belgeler ve deney rehberi (+ bölüm eklemesi önerisi) | Tamam | Haftalık rapor AI: belgeler, deney rehberi ve bölüm eklemesi önerisi |

## Genel kararlar

- **Arayüzün yeri.** Rapor AI'nın bütün yönetim kartları (kalite, altın set, kılavuz, kurallar, ince
  ayar) Haftalık rapor › Ayarlar sekmesindedir. Bu sekme yalnız `report.review` (PYB destek) içindir;
  yönetici konsolu `screen.admin` ister, PYB destek oraya giremeyebilir. Ayarlar sekmesine alt gezinme
  eklenir: **Genel** (mevcut kartlar) · **AI kılavuzu ve kurallar** · **AI kalitesi**. Yalnız otomatik
  düzeltme anahtarı (F6) yönetici konsolu › Yapay zekâ bölümündedir; görev bunu admin ayarı sayıyor.
- **Yetki.** Kılavuz, bölüm eki, altın set, kurallar, kapı ve örnek işareti saf fonksiyonlarda
  `isReportSteward` ile doğrulanır; App tarafındaki işleyiciler güncel veriyle yeniden denetler.
  Proje kartını `ownsProject` doğrular.
- **Denetim günlüğü.** Yeni eylem `report.ai` ("Rapor AI ayarı değişti"). Kılavuz, bölüm eki, kural,
  altın set, kapı ve değerlendirme koşuları bununla yazılır. Proje kartı değişikliği yazılmaz
  (proje içeriği; diğer proje alanları da yazılmıyor).
- **AI çağrıları.** Ekran içi tek çağrılar `useAiRun` ile. Toplu koşular için aynı dosyaya
  `useAiBatch` eklenir: aynı `complete` (ad maskeleme ve politika) üzerinden, en fazla 2 paralel,
  iptal edilebilir, ilerleme bildirir. Yeni sunucu ucu yok.
- **Üretimdeki varyant `full`'dur.** Boş katman isteme bir şey eklemez; bu yüzden ayar yokken
  `full` istemi eski istemin aynısıdır (sabit örnek + kılavuz).
- **İstem sürümü.** `REPORT_PROMPT_VERSION` istem veya girdi biçimi değişince artar (F1: 1, F3: 2,
  F5: 3, F6/F7: gerekirse). Etkin sürüm `reportPromptVersion(settings, dept, project)` =
  taban + varsa `·k<kılavuz sürümü>` + `·b<bölüm eki sürümü>` + `·r<kural özeti>`. Varsayılan
  ayarlarda etkin sürüm tabanın kendisidir. Kalite kapısı için yapılandırmanın tamamını kapsayan
  `reportConfigVersion(settings)` kullanılır; kılavuz, bölüm eki ya da kural değişince kapı "bayat" olur.

## F1 — Ölçüm temeli

**Veri modeli (hepsi opsiyonel)**

- `ReportItem.aiOriginal?: { text; category }` — AI maddesi uygulanırken özgün hâli.
- `WeeklyReport.aiDraft` genişler: `promptVersion?`, `variant?`, `model?`, `mode?: 'append' | 'replace'`,
  `proposed?: { thisWeek; nextWeek }`, `itemIds?: string[]` (uygulamalar boyunca birikir).
- `WorkspaceData.reportAiLog?: ReportAiLogEntry[]` — son 2.000 kayıt, **metin yok**.
  `ReportAiLogEntry`: `at, reportId, projectId?, departmentCode, promptVersion, variant?, model?,
  outcome ('applied_append' | 'applied_replace' | 'discarded' | 'error' | 'submitted'), nThis, nNext,
  lintErrors, lintWarnings, ungrounded?, repaired?` ve gönderimde `aiItems?, kept?, edited?, deleted?,
  humanAdded?, lintCodes?` (F7'nin lint sıklığı için kod → sayı).

**Saf fonksiyonlar** — `utils/ai/reportAiStats.ts`

- `normText`, `tokenF1` (`terms` tabanlı), `reportAcceptance(report)`, `appendReportAiLog`,
  `suggestionLogEntry(...)`, `submitLogEntry(report, dictionary, at)`,
  `reportAiStats(ws, { by, from?, to? })` → gruplar: öneri, uygulama/ret/hata oranı, kabul/düzenleme/silme
  oranı, iade oranı (AI taslaklı ve gönderilmiş raporlarda `return` olayı olanların payı), gönderimdeki
  ortalama lint hata/uyarı.

**Arayüz**

- `ReportEditor`: uygula → `aiOriginal` ve `aiDraft` alanları; Vazgeç, uygula ve hata günlüğe yazılır
  (yeni `onLogAi` geri çağırımı, `ModernWeeklyReport` üzerinden App'e). Gönderim kaydını App'teki
  `handleSaveReport` taslaktan ilk ilerletmede düşer (tek yer, yetki denetiminden sonra).
- Ayarlar › AI kalitesi: **Rapor AI kalitesi** kartı (gruplama seçici, tablo, boş durum).

**Bulut:** `reportAiLog` beyaz listeye. **Testler:** kabul ölçüleri (ekle, yerine koy, sil, düzenle, eski
rapor), gruplamalar, sınır, `splitWorkspaceDoc`.

**Risk:** madde kimliği değişirse (madde silinip yeniden yazılırsa) silinmiş + insan eklemesi sayılır;
bu bilinçli bir sadeleştirmedir.

## F2 — Altın set ve çevrimdışı değerlendirme

**Veri modeli**

- `ReportGoldenItem { reportId; addedAt; addedByName?; note? }` → `WorkspaceData.reportGoldenSet?`.
- `ReportEvalRun { id; at; promptVersion; variant; model?; n; failed; metrics; passed; reasons }` →
  `WorkspaceData.reportEvalRuns?` (son 50).
- `AiPolicy.reportGate?: { enforce; maxLintErrorsPerReport; maxUngroundedRate; minRecall }` —
  varsayılan `false / 0,5 / 0,05 / 0,5`. Kapı ayarını PYB destek değiştirir (ayrı işleyici,
  `report.review`); diğer AI politikası admin'de kalır.

**Saf fonksiyonlar** — `utils/ai/reportEval.ts`

- `groundingIssues(suggestion, input)` — sayılar (`%15`, `50 kişilik`, `450.000`), tarihler
  (`10 Eylül 2026`, `10.09.2026`, `10/09`) ve özel adlar girdide geçiyor mu. Özel ad: büyük harfle
  başlayan, cümle başı olmayan, sözlükte ve kategori adlarında olmayan sözcük; `foldTr` ve ilk 5 harf
  karşılaştırması (Türkçe ekler). Tarihler gün+ay olarak normalize edilir.
- `matchItems(ai, gold, threshold = MATCH_THRESHOLD /* 0,5 */)` — açgözlü eşleştirme.
- `scoreReportDraft({ suggestion, gold, input, dictionary })` → madde ve rapor düzeyi ölçüler.
- `summarizeReportEval(scores, gate, meta)` → `ReportEvalRun`; `MIN_REPORT_GATE_CASES = 5`.
- `reportGateStatus(runs, configVersion, model?)` ve `reportGateWarning(...)`.
- `goldenInput(ws, report)` — önce `aiDraft.input`; yoksa proje notları yereldeyse `buildReportInput`.
- `goldenCandidates(ws)` — onaylı, lint hatası yok, iade yok, girdisi var; bölümler arasında dönüşümlü.
- Varyantlar: `ReportPromptVariant = 'base' | 'card' | 'examples' | 'rules' | 'full' | 'ft'`.
  `base`: varsayılan kılavuz + sabit örnek, kartsız girdi. `card`: base + proje kartı. `examples`: card +
  dinamik örnekler ve düzeltme çiftleri. `rules`: card + kurum/bölüm kılavuzu ve öğrenilmiş kurallar.
  `full`: hepsi (üretim). `ft`: full sistem istemi, örneksiz kullanıcı istemi (ince ayarlı model için).
  `buildVariantRequest({ variant, ws, report, input, now })` → `{ system, prompt }`; değerlendirmede
  örnekler yalnız **o haftadan önce onaylanmış** raporlardan gelir, rapor kendisi hariç.

**Arayüz:** Ayarlar › AI kalitesi › **Rapor AI değerlendirmesi** (altın set ekle/çıkar, aday listesi,
varyant seçimi, koşu, iptal, varyant × ölçüt tablosu, kapı ayarları, maskeli JSONL indirme).
Düzenleyicide kapı zorunlu ve son koşu geçmediyse uyarı (öneri engellenmez).

**Varsayım:** girdisi yalnız yerel notlardan yeniden üretilebilen rapor altın sete eklenebilir; girdi
altın kayda yazılmaz (notlar özeldir, buluta gitmemeli). Başka cihazda bu kayıtlar "girdisi yok"
sayılıp koşudan düşer ve gösterilir.

## F3 — Proje kartı ve zengin girdi

- `Project.aiProfile?: { summary?; customers?; product?; glossary?: { term; explanation }[];
  stakeholders?; reportHints?; updatedAt? }` — proje satırıyla buluta gider.
- `utils/ai/projectProfile.ts`: `cleanProjectProfile` (özet 600, diğer metinler 300, terim 60, açıklama
  200, en çok 30 terim), `projectProfileLines`, `setProjectProfile(ws, identity, projectId, profile)`.
- `buildReportInput` yeni opsiyonel girdiler: `planReview`, `closedTasks` (bu hafta `Done` ve
  `resolvedAt` hafta içinde; en çok 10), kart. Toplam bütçe `REPORT_INPUT_BUDGET = 6000`; öncelik
  notlar > kapanan işler > görüşmeler > worklog > kart > diğerleri; aşılınca alt sıradan kırpılır.
- Sistem istemine kart kuralı; `REPORT_PROMPT_VERSION` → `rapor-taslak-2`.
- Düzenleyicide "Proje kartı" sayfası (sahibi PY düzenler, diğerleri görür); boşsa ipucu.

**Risk:** proje kartı bulutta paylaşılır; arayüzde not var. Eski girdiyle eşitlik testi kartsız proje ve
plan değerlendirmesi olmadan yapılır.

## F4 — Düzenlenebilir, sürümlü kılavuz

- `REPORT_SYSTEM` parçaları: rol satırı (kurum adı), sabit güvence satırları, **kılavuz gövdesi**
  (`DEFAULT_REPORT_GUIDE`), kategori listesi, JSON sözleşmesi. `buildReportSystem({ institutionName?,
  guide?, departmentGuide?, learnedRules? })`; ayarsız çıktı F3 sonrası metnin birebir aynısı (testte
  donmuş metinle).
- `ReportSettings.guide?`, `ReportSettings.departmentGuides?` (kılavuz 6.000, bölüm eki 1.500 karakter).
  Saf `saveReportGuide`, `saveDepartmentGuide`, `resetReportGuide` (sürüm +1, yetki).
- Ayarlar › AI kılavuzu ve kurallar: kılavuz kartı, bölüm eki, tam istem önizleme.

## F5 — Dinamik örnekler

- `utils/ai/reportExamples.ts`: `selectStyleExamples({ reports, projects, people, report, input, before,
  golden })` ve `correctionPairs(...)`. Öncelik: altın set / örnek işaretli +3, aynı proje +2, aynı PY
  +1,5, aynı bölüm +1; BM25 benzerliği eklenir. Madde düzeyi, rapor başına ≤ 3, proje başına ≤ 4, bütçe
  1.500 karakter. Düzeltme çiftleri: `tokenF1 < 0,8`, aynı bölüm önce, en çok 3.
- `WeeklyReport.exemplar?: boolean` — PYB destek onaylı raporu "örnek" işaretler (`setReportExemplar`).
- `REPORT_PROMPT_VERSION` → `rapor-taslak-3`.

## F6 — Çıktı denetimi ve otomatik düzeltme

- Öneri önizlemesinde `lintReport` + `groundingIssues`, madde düzeyinde; özet satırı.
- `AiPolicy.reportAutoRepair?: boolean` (varsayılan kapalı; admin › Yapay zekâ).
- `buildRepairPrompt(raw, issues)`, `suggestionBadness`, `pickBetter` — en çok bir tur; kötüyse ilk sonuç.

## F7 — Öğrenilmiş kurallar

- `ReportSettings.learnedRules?: LearnedRule[]`; `utils/ai/reportRules.ts`: `lintRuleCandidates`
  (gönderim günlüğündeki `lintCodes`, bölüm/PY bazında, eşik `RULE_MIN_EVIDENCE = 3`),
  `editRuleCandidates` (belirsiz ifade kaldırma, rutin madde silme, tarih ekleme),
  `mergeCandidates`, `activeRulesFor(settings, dept, projectId)` (kapsam başına ≤ 10),
  AI aday istemi ve çözümleyicisi (en çok 5, hep "öneri").
- Ayarlar › AI kılavuzu ve kurallar: **Öğrenilmiş kurallar** kartı.

## F8 — İnce ayar veri kümesi ve karar kartı

- `utils/ai/reportFineTune.ts`: `buildReportFineTuneDataset(ws, opts)`, `reportFineTuneReadiness(ws, model?)`.
  `fineTuneLines` buraya taşınır (eski dışa aktarım bu modülün yeni işlevine yönlenir).
- Ayarlar › AI kalitesi: karar kartı + "Veri kümesini hazırla".
- `docs/INCE_AYAR_KARARI.md`'ye rapor bölümü.

## F9 — Belgeler

- `docs/RAPOR_AI.md`, `README.md` bağlantısı. Zaman kalırsa bölüm eklemesi raporu için AI önerisi.

## Bulut eşitleme beyaz listesi (`splitWorkspaceDoc` › `core`)

`reportAiLog`, `reportGoldenSet`, `reportEvalRuns`. `reportSettings` (kılavuz, bölüm ekleri, kurallar)
ve `aiPolicy` (kapı, otomatik düzeltme) zaten listede. `Project.aiProfile` proje satırıyla gider.
`WeeklyReport` alanları (`aiDraft`, `aiOriginal`, `exemplar`) rapor listesiyle gider.

## Riskler

- **`aiDraft.input` proje notlarını içerir** ve rapor ile buluta gider. Bu mevcut davranıştır,
  değiştirilmedi; altın set ve veri kümesi bu alanı kullanır. Veri kümesinde kişi adları maskelenir.
- Günlük kişi adı içermez; yalnız kimlik ve sayılar.
- Dayanak denetimi sezgiseldir (özel ad tespiti); hatalı pozitif olabilir, bu yüzden yalnız uyarıdır.
- `useAiBatch` asistan sağlayıcısının `complete` işlevini kullanır; asistan kapalıysa koşu çalışmaz.
- **Kart katmanında küçük zaman sızıntısı:** eski girdilerde kart yoksa kartlı varyantlar projenin bugünkü kartını
  ekler; kartın kazancı biraz iyimser görünebilir. Örnekler ve düzeltme çiftleri ise sıkı zaman ayrımlıdır.
- **İnce ayar veri kümesinde sistem istemi** kılavuzun bugünkü sürümüdür (geçmiş kılavuz sürümleri saklanmıyor);
  veri kartına yazıldı.
- **Önceki hata düzeltildi:** `lintReport`'taki `\b` sınırları Türkçe harfle başlayan/biten sözcüklerde
  çalışmıyordu ("bazı", "birkaç", "çeşitli", "iç toplantı"); düzeltme sonrası mevcut raporlarda daha çok uyarı
  görülebilir (uyarılar göndermeyi engellemez).

## Açık sorular ve seçilen varsayılanlar

| Soru | Varsayılan |
|---|---|
| Bölüm kılavuz ekini kim düzenler? | Yalnız PYB destek (`report.review`). |
| Altın sete hangi raporlar girer? | PYB destek seçer; sistem lint hatasız, iadesiz, farklı bölümlerden aday önerir. |
| Kalite kapısı zorunlu mu? | Hayır; zorunluysa yalnız uyarı. |
| Otomatik düzeltme açık mı? | Kapalı; admin açar. |
| Veri kümesinde proje ve kurum adları? | Maskeli (varsayılan açık); kişi adları her zaman. |
| Öğrenilmiş kural kendiliğinden etkinleşir mi? | Hayır. |
| Model adı | AI durumundan (`status.model`) alınır; yoksa boş. |
| Rapor AI kartları nerede? | Haftalık rapor › Ayarlar (PYB destek); otomatik düzeltme anahtarı admin'de. |
| Altın kayda girdi yazılsın mı? | Hayır (özel notlar buluta taşınmasın); `aiDraft.input` ya da yerelde yeniden üretim. |
| Lint adayları PY bazında da üretilsin mi? | Hayır; aday kapsamı bölüm ya da kurum. Proje kapsamlı kural elle eklenir. |
| Elle eklenen kural | Doğrudan etkin (PYB desteğin kendi kararı). |
| Kılavuza dönüşte sürüm | Etkin istem sürümü içerik özetidir; aynı içeriğe dönülünce aynı sürüm (kapı yeniden geçerli). |
| Yerine koyma kipinde ölçüm | Yalnız son önerinin maddeleri ölçülür; sonuna eklemede önceki AI maddeleri birikir. |
| Bölüm eklemesi önerisi | Bölüm projelerinin bu haftaki gönderilmiş/onaylı raporları + bölüm görüşmeleri; proje örnekleri yok. |
| Kalite kapısı ve kılavuz kimde? | Haftalık rapor › Ayarlar (PYB destek, `report.review`); otomatik düzeltme anahtarı yönetici konsolunda. |
