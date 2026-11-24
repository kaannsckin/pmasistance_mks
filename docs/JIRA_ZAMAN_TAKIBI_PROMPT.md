# Prompt: Jira Zaman Takibi, Kayıt Geçmişi, Worklog ve Tempo Raporları

> Bu dosya bir geliştirme ajanına (ya da geliştiriciye) verilecek iş tanımıdır.
> Her faz ayrı PR olarak teslim edilebilir. Her fazın sonunda **Done** listesinin
> tamamı karşılanmadan faz bitmiş sayılmaz.

---

## 0. Bağlam (mevcut durum — önce bunu oku)

PlanAsistan v3.3.0 (React 19 + Vite, sunucu tarafı `server/`, Vercel uçları `api/`,
yerel exe `server/local`, MCP `server/mcp`, Supabase depolama). Jira adresi ve
jetonu **yalnız sunucuda** durur; istemci `/api/integrations/*` üzerinden konuşur.

Şu an var olan:

| Alan | Nerede | Durum |
|---|---|---|
| Original estimate, time spent | `server/integrations/handler.ts` → `normalizeIssue` (`timeoriginalestimate`, `timespent`), `Task.originalEstimateHours`, `Task.actualHours` | Var |
| Remaining estimate (`timeestimate`) | — | **Yok** |
| Alt görevli toplamlar (`aggregatetimeoriginalestimate`, `aggregatetimeestimate`, `aggregatetimespent`) | — | **Yok** |
| Changelog | `expand=changelog` çekiliyor ama `transitionsOf` yalnız **status** kalemlerini alıyor | **Kısmi** |
| Worklog | `Task.jiraWorklog.entries = {author, email, date, hours}`; `fetchJiraIssueWorklogs`, `useJiraWorklogRefresh`, `ModernWorkforce`, `AllocationView`, haftalık rapor | Var ama worklog id, başlangıç saati, yorum, güncellenme zamanı **yok** |
| Worklog yazma | `JiraIssuePanel` → `POST /issue/{key}/worklog` (sadece ekleme) | Kısmi (düzenleme/silme/estimate ayarı yok) |
| Tempo | — | **Hiç yok** |

İlgili dosyalar: `server/integrations/handler.ts`, `server/integrations/settings.ts`,
`api/integrations/*.ts`, `utils/integrations.ts`, `types.ts` (Task, TaskJiraWorklog,
WorklogEntry, JiraSyncFieldId), `utils/workforce.ts`, `utils/jiraAllocation.ts`,
`utils/planning/jiraImport.ts`, `components/modern/JiraIssuePanel.tsx`,
`components/modern/WorkforceParts.tsx`, `components/modern/ModernWorkforce.tsx`,
`components/modern/TaskDetailSheet.tsx`, `components/modern/admin/IntegrationSettings.tsx`,
`components/assistant/AssistantContext.tsx`, `server/pilot/mockJira.ts`, `server/mcp/*`.

Mevcut kalıpları koru: Cloud (`search/jql` + `nextPageToken`) ve Server/DC
(`search` + `startAt`) ikili desteği, `JIRA_ALLOWED_PROJECTS` kısıtı,
`JIRA_ALLOW_UPDATE` yazma izni, Türkçe arayüz metinleri, `tr-TR` sayı biçimi,
`HOURS_PER_DAY`, mevcut `m-*` UI bileşenleri ve `Icon` seti.

---

## 1. Amaç

Jira'dan çekilen veriyi yalnız “görev listesi” olmaktan çıkarıp, uygulamada
**zaman takibi ve efor analizi** yapılabilir hale getirmek:

1. Görevin **tahmin / kalan / harcanan** sürelerini (alt görevler dahil) görmek, eşitlemek ve raporlamak.
2. Kaydın **tam değişiklik geçmişini** (kim, ne zaman, hangi alanı, neden neye) görmek ve buradan metrik üretmek.
3. **Worklog**'ları ayrıntılı (saat, yorum, kişi) görmek, uygulamadan eklemek/düzenlemek/silmek.
4. **Tempo** (varsa) worklog, faturalanabilir saat, hesap (account), ekip, plan ve onay verilerini çekip **Tempo tarzı raporlar** üretmek; Tempo yoksa aynı raporları Jira worklog'larından üretmek.

---

## 2. Faz 1 — Zaman takibi alanları (Estimate / Remaining / Spent)

### İsterler
- **Çekme:** `ISSUE_FIELDS`'a `timeestimate`, `aggregatetimeoriginalestimate`, `aggregatetimeestimate`, `aggregatetimespent`, `timetracking`, `parent`, `subtasks` ekle. `JiraIssueRecord`'a karşılık gelen alanları (`remainingEstimateSeconds`, `aggregate*Seconds`, `parentKey`, `subtaskKeys`) ekle. Eşitleme (`jira-sync`) ve geçmiş içe aktarma (`jira-issues`) yollarının ikisi de bu alanları taşısın.
- **Model (`types.ts` → `Task`):** `remainingEstimateHours?`, `aggregateOriginalEstimateHours?`, `aggregateRemainingHours?`, `aggregateSpentHours?`, `timeTrackingAt?` (son çekim anı). Saniye → saat dönüşümü tek yardımcı fonksiyonda; `null` (Jira'da alan boş) ile `0`'ı ayır.
- **Türetilmiş metrikler (`utils/timeTracking.ts`, saf fonksiyonlar + test):**
  - İlerleme % = spent / (spent + remaining)
  - Tahmin sapması = (spent + remaining) − original; sapma % 
  - EAC (tamamlanma tahmini efor) = spent + remaining
  - Aşım bayrağı: spent > original veya remaining = 0 iken durum kapalı değil
  - Proje/sürüm/bileşen/kişi bazında toplamlar
- **Eşitleme yönü:** `JiraSyncFieldId`'ye `remaining` ekle (off / pull / push / both). Push: `PUT /issue/{key}` `fields.timetracking.remainingEstimate`. Çatışma kuralı mevcut `jiraBase` mantığıyla aynı.
- **Worklog eklerken estimate ayarı:** `JiraIssuePanel`'de worklog eklenirken `adjustEstimate` seçeneği: *otomatik* (varsayılan), *değiştirme* (`leave`), *yeni kalan* (`new&newEstimate=`), *şu kadar düş* (`manual&reduceBy=`).
- **Arayüz:**
  - Görev ayrıntısı: Jira tarzı üç çubuklu “Zaman takibi” bileşeni (Tahmin / Harcanan / Kalan, aşım kırmızı), alt görevli toplam varsa ayrı satır.
  - Görev listesi / `ModernTaskList`: “Kalan”, “Harcanan”, “Sapma %” sütunları (gizlenebilir, sıralanabilir).
  - Proje dashboard'u: “Efor durumu” bileşeni (toplam tahmin vs EAC, en çok aşan 5 kayıt), mevcut kişiselleştirilebilir bileşen altyapısına eklenir.
  - `TaskQueryPicker` / kayıtlı sorgular: “kalan > X saat”, “tahmin aşılmış”, “tahminsiz” filtreleri.
- **EVM / tahmin entegrasyonu:** `utils/evm.ts` ve `utils/forecast.ts` remaining varsa onu kullanabilsin (ayar ile; varsayılan mevcut davranış).

### Done (Faz 1)
- [ ] Cloud ve DC mock yanıtlarıyla `normalizeIssue` yeni alanları doğru dönüştürüyor (boş / 0 / alt görevli durumlar için test).
- [ ] Eşitleme sonrası görevlerde `remainingEstimateHours` ve aggregate alanlar doluyor; Jira'da alan boşsa `undefined` kalıyor.
- [ ] `remaining` alanı push/both modunda Jira'ya yazılıyor; `JIRA_ALLOW_UPDATE` kapalıysa yazılmıyor ve kullanıcıya Türkçe neden gösteriliyor.
- [ ] Worklog eklerken dört `adjustEstimate` seçeneği çalışıyor ve sonrasında görevin kalan süresi yeniden çekiliyor.
- [ ] Zaman takibi bileşeni, liste sütunları, dashboard bileşeni ve filtreler çalışıyor; açık/koyu temada ve dar ekranda bozulmuyor.
- [ ] `utils/timeTracking.ts` için birim testleri var ve geçiyor.

---

## 3. Faz 2 — Kayıt geçmişi (Issue History / Changelog)

### İsterler
- **Çekme:**
  - Cloud: `GET /rest/api/3/issue/{key}/changelog?startAt=&maxResults=100` (sayfalı) ya da toplu `POST /rest/api/3/changelog/bulkfetch` (destekleniyorsa).
  - DC: `GET /rest/api/2/issue/{key}?expand=changelog&fields=none` (DC'de tüm geçmiş tek yanıtta gelir).
  - Yeni sunucu rotası: `GET /api/integrations/jira-history?key=ABC-1` → normalize edilmiş liste. `JIRA_ALLOWED_PROJECTS` kontrolü zorunlu.
- **Model:** `JiraHistoryEntry { id, at, author, authorEmail?, items: { field, fieldId?, from, fromString, to, toString }[] }`.
- **Saklama kararı:** Ham geçmiş proje JSON'una **yazılmaz** (boyut). Görev ayrıntısı açılınca isteğe bağlı çekilir ve oturum içinde önbelleklenir (TTL ~10 dk). Proje JSON'una yalnız türetilmiş özet yazılır: `Task.historySummary = { reopenCount, assigneeChanges, estimateChanges, dueDateShifts, sprintChanges, timeInStatus: Record<string, hours>, at }`. Özet, eşitlemede zaten gelen `changelog`'dan da üretilsin (yalnız status değil, tüm kalemler işlenmeli — `transitionsOf` genişletilir).
- **Arayüz:**
  - Görev ayrıntısında “Geçmiş” sekmesi: zaman çizelgesi (en yeni üstte), alan filtresi (durum, atanan, tahmin, kalan, termin, öncelik, sprint, açıklama, etiket…), kişi filtresi. Açıklama değişikliklerinde satır bazlı fark (diff) görünümü. Uygulama içi `statusLog` ve denetim kayıtları (`utils/audit.ts`) aynı çizelgede “Uygulama” rozetiyle birleştirilebilir.
  - “Durumda geçen süre” çubuk grafiği (kayıt bazında) ve proje bazında ortalama/medyan (darboğaz analizi).
  - “Tahmin değişim geçmişi” mini grafiği (original/remaining zaman içinde).
  - Proje raporu: en çok yeniden açılan, en çok atanan değiştiren, termini en çok kayan kayıtlar.
- **Asistan:** `AssistantContext`'e `issueHistory(key)` aracı; “ABC-12 neden gecikti?” gibi sorular geçmişten yanıtlanabilsin.

### Done (Faz 2)
- [ ] `jira-history` rotası Cloud (sayfalı) ve DC'de mock ile tüm geçmişi döndürüyor; 100+ kayıtlı geçmişte sayfalama test edilmiş.
- [ ] İzinli proje dışı anahtar 403 benzeri Türkçe hata ile reddediliyor.
- [ ] Geçmiş sekmesi filtreler, diff ve uygulama kayıtlarıyla birleşik çalışıyor; 500 kalemlik geçmişte arayüz akıcı (sanal liste ya da sayfalama).
- [ ] `historySummary` eşitlemede üretiliyor, “durumda geçen süre” hesabı birim testli (yeniden açılma, iş günü/takvim günü ayrımı belgelenmiş).
- [ ] Ham geçmiş Supabase'e/proje JSON'una yazılmıyor (boyut kontrolü testi ya da gözden geçirme notu).
- [ ] Asistan geçmiş aracını kullanabiliyor.

---

## 4. Faz 3 — Ayrıntılı worklog

### İsterler
- **Model genişletme:** `TaskJiraWorklog.entries[]` → `{ id, author, email?, accountId?, started (ISO, saat dilimiyle), date, hours, comment?, updated? }`. Eski kayıtlar (id'siz) okunabilir kalmalı (geriye dönük uyumluluk, migrasyon gerekmez).
- **Artımlı çekme:** `GET /rest/api/2/worklog/updated?since=<epochMs>` + `POST /rest/api/2/worklog/list` (ids) ve `GET /rest/api/2/worklog/deleted?since=` ile yalnız değişenleri çek. Son `since` değeri proje bazında saklanır. Mevcut `useJiraWorklogRefresh` bu mekanizmaya geçirilir (fallback: mevcut issue bazlı çekim).
- **Yazma (izinli ise):** `PUT /issue/{key}/worklog/{id}` (düzenle), `DELETE /issue/{key}/worklog/{id}` (sil), her ikisinde `adjustEstimate` seçeneği. Yalnız kendi worklog'unu düzenleme kuralı Jira'ya bırakılır; 403 Türkçe mesajla gösterilir.
- **Görünümler:**
  - **Zaman çizelgesi (timesheet):** kişi × gün ızgarası (hafta/ay), satırlar kayıt, hücre toplam saat; günlük kapasite (`utils/availability.ts`) ile karşılaştırma, eksik gün vurgusu.
  - **Kayıt bazında:** görev ayrıntısında worklog listesi (yorumlarıyla), ekle/düzenle/sil.
  - **Proje/ekip bazında:** dönem filtresi, kişi/bileşen/sürüm/kayıt türü kırılımı; mevcut `ModernWorkforce` bu ayrıntıyla zenginleştirilir.
- **Gizlilik:** worklog yorumları ve kişi bazlı saat/maliyet görünürlüğü rol bazlı (mevcut rol/izin modeli kullanılır; en az “proje yöneticisi” görür, ekip üyesi kendi kaydını görür).
- **Saat dilimi:** gün gruplaması `started` alanının yerel tarihine göre (varsayılan Europe/Istanbul, ayarlanabilir).

### Done (Faz 3)
- [ ] Yeni alanlar çekiliyor; id'siz eski veride hiçbir ekran kırılmıyor.
- [ ] Artımlı çekme çalışıyor: Jira'da düzenlenen ve silinen worklog bir sonraki yenilemede uygulamaya yansıyor (mock testli).
- [ ] Düzenle/sil `JIRA_ALLOW_UPDATE` ile kapılanmış; sonrasında görevin `actualHours` ve kalan süresi güncelleniyor.
- [ ] Timesheet ızgarası hafta/ay, kişi/ekip filtreleri, kapasite karşılaştırması ile çalışıyor; xlsx olarak dışa aktarılabiliyor.
- [ ] Gece yarısına yakın (UTC farkı) worklog'lar doğru güne düşüyor (birim testi).
- [ ] Rol bazlı görünürlük uygulanmış.

---

## 5. Faz 4 — Tempo entegrasyonu ve Tempo tarzı raporlar

> Uç adlarını uygulamadan önce güncel Tempo dokümantasyonundan **doğrula**; aşağıdakiler başlangıç noktasıdır.

### Bağlantı
- Yeni ayarlar (`server/integrations/settings.ts`): `TEMPO_MODE` (`off` | `cloud` | `dc`), `TEMPO_BASE_URL` (Cloud: `https://api.tempo.io/4`, DC: Jira adresi + `/rest/tempo-timesheets/4`), `TEMPO_API_TOKEN` (**gizli** → `INTEGRATION_SECRETS`'a ekle). DC'de ayrı jeton yoksa Jira kimlik bilgisi kullanılabilir.
- `IntegrationSettings` ekranına Tempo bölümü; `health` ucu Tempo erişimini de raporlasın.
- Cloud v4 kayıtları `issue.id` ve `author.accountId` döndürür → issue id → anahtar ve accountId → kişi eşlemesi Jira'dan (önbellekli) yapılır.

### Çekilecek veri (Cloud v4 örnek uçlar)
- Worklog: `GET /worklogs?project=&from=&to=` veya `POST /worklogs/search` (sayfalı, `offset/limit`), `billableSeconds`, `timeSpentSeconds`, `attributes` (work attribute: örn. faturalanabilir, iş tipi, hesap).
- Hesaplar: `GET /accounts`, kategori/müşteri; worklog'un hesabı.
- Ekipler: `GET /teams`, `GET /teams/{id}/members`.
- Planlar (kaynak planlama): `GET /plans?from=&to=` → planlanan saat.
- Onaylar: `GET /timesheet-approvals/team/{teamId}?from=&to=` / kullanıcı bazında durum.
- Work attribute tanımları: `GET /work-attributes`.

### Raporlar (Tempo yoksa Jira worklog'larından aynı raporlar; Tempo'ya özgü sütunlar “—”)
1. **Zaman çizelgesi raporu:** kişi × gün/hafta/ay, kayıt/epik/hesap kırılımı.
2. **Faturalanabilir vs harcanan:** kişi/proje/hesap bazında billable, non-billable, oran.
3. **Hesap (account) raporu:** hesap → proje → kişi ağacı, toplam saat ve maliyet (`utils/costing.ts` ile ünvan saat ücreti).
4. **Ekip kullanım (utilization):** kaydedilen / kapasite; plan vs gerçekleşen (Tempo planları ya da uygulamadaki tahsis `utils/allocations.ts`).
5. **Onay durumu:** dönem için onaylanmamış/eksik zaman çizelgesi olan kişiler; Teams/e-posta hatırlatma (mevcut `notify` altyapısı) isteğe bağlı.
6. **Tahmin vs gerçekleşen:** Faz 1 metrikleriyle birleşik (kayıt türü, bileşen, kişi bazında sapma).
- Her raporda: dönem seçici (mevcut `DateRangePicker`), gruplama seçici, pivot tablo + grafik (dataviz kurallarına uygun), **xlsx / pdf / csv dışa aktarma** (mevcut `xlsx`, `pdfmake` kütüphaneleri), kayıtlı rapor görünümü.
- Haftalık rapor (`ReportEditor`) worklog kaynağı olarak Tempo seçilebilsin.
- `AllocationView`'daki “Gerçekleşen (worklog)” Tempo açıksa Tempo'dan (billable seçeneğiyle) alınabilsin.
- MCP (`server/mcp/reports.ts`) ve asistan: `tempoReport(type, from, to, groupBy)` aracı.

### Kapsam dışı (bu faz)
- Tempo'ya worklog **yazma** (ileride; şimdilik worklog Jira üzerinden yazılır, Tempo Jira worklog'larını zaten görür).
- Tempo plan oluşturma / onaylama işlemleri.

### Done (Faz 4)
- [ ] `TEMPO_MODE=off` iken hiçbir istek atılmıyor ve raporlar Jira worklog'larıyla çalışıyor.
- [ ] Cloud ve DC için mock Tempo yanıtlarıyla (`server/pilot/mockJira.ts` yanına `mockTempo.ts`) worklog, hesap, ekip, plan, onay normalizasyonu testli.
- [ ] Tempo jetonu istemciye hiçbir yanıtta sızmıyor (test: health ve ayar uçları maskeli dönüyor).
- [ ] Altı raporun her biri dönem/gruplama ile çalışıyor ve xlsx + pdf dışa aktarılabiliyor; rakamlar aynı veriyle Tempo arayüzündeki toplamla örnek bir dönemde elle karşılaştırılmış (sonuç PR açıklamasında).
- [ ] issueId→anahtar ve accountId→kişi eşlemesi önbellekli; eşlenemeyen kayıtlar raporda “Eşlenmemiş” grubunda görünüyor (kaybolmuyor).
- [ ] 429 yanıtlarında `Retry-After`'a uyan geri çekilme var.

---

## 6. Ortak teknik isterler (tüm fazlar)

- **Güvenlik:** tüm Jira/Tempo çağrıları sunucuda; `JIRA_ALLOWED_PROJECTS` her yeni rotada uygulanır; jeton/adres log'a yazılmaz.
- **Dağıtım üçlüsü:** her yeni rota hem Vercel (`api/integrations/*.ts`), hem yerel exe (`server/local`), hem geliştirme sunucusunda çalışır.
- **Hız ve limit:** sayfalama, istek başına kayıt sınırı, 429/5xx için üstel geri çekilme, meta veriler (status, field, account, team) için mevcut `cached` yardımcısı.
- **Veri boyutu:** proje JSON'una yalnız gerekli özet yazılır; worklog satırı ve geçmiş için üst sınır belgelenir.
- **Geriye dönük uyumluluk:** yeni alanların hepsi opsiyonel; eski proje verisi açıldığında hata yok.
- **Erişilebilirlik ve UI:** Türkçe metinler, `aria-label`'lar, açık/koyu tema, mobil genişlik.
- **Asistan/MCP:** yeni veri asistanın ekran bağlamına ve MCP araçlarına eklenir.
- **Pilot/simülasyon:** `server/pilot` senaryoları yeni alanlarla güncellenir, mevcut pilot testleri kırılmaz.

## 7. Genel Done (her PR için)

- [ ] `npm test` geçiyor (yeni normalizasyon, metrik ve rota testleri dahil).
- [ ] `npm run build`, `npm run build:mcp`, `npm run build:local` hatasız.
- [ ] TypeScript hatası yok, `any` eklenmemiş.
- [ ] Jira Cloud ve Jira DC için mock ile uçtan uca senaryo çalışıyor; gerçek bir Jira'da elle doğrulama adımları PR açıklamasında.
- [ ] Yetki kapalıyken (yazma, Tempo) arayüz düğmeleri pasif ve açıklayıcı ipucu gösteriyor.
- [ ] `CHANGELOG.md` güncel, sürüm 3.4.0 (ya da faz başına ara sürüm), `docs/` altında kurulum notu (Tempo jetonu nasıl alınır, hangi izinler gerekir).
- [ ] Ekran görüntüleri (zaman takibi bileşeni, geçmiş sekmesi, timesheet, en az iki Tempo raporu) PR'a eklenmiş.

## 8. Başlamadan netleştirilecek sorular

1. Kullanılan Jira **Cloud mu, Data Center mı** (ya da ikisi)?
2. Tempo **Cloud mu, DC mi**, lisans var mı? Hangi work attribute'lar kullanılıyor (billable, hesap, iş tipi)?
3. Worklog düzenleme/silme uygulamadan yapılsın mı, yoksa yalnız okuma mı?
4. Worklog yorumları ve kişi bazlı saatleri kimler görebilmeli?
5. “Durumda geçen süre” iş günü mü takvim günü mü?
6. Öncelik sırası: önerilen Faz 1 → 3 → 2 → 4 (en hızlı değer: kalan süre + ayrıntılı worklog).
