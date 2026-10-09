# Haftalık rapor AI asistanı

Haftalık rapor düzenleyicisindeki **Taslak öner** düğmesi, PY'nin haftalık notlarından, worklog'dan, müşteri görüşmelerinden ve proje kartından kurum rapor kılavuzuna uygun bir taslak çıkarır. Bu belge asistanın nasıl öğrendiğini, neyin nerede ayarlandığını ve kalitesinin nasıl ölçüldüğünü anlatır.

Kural: **model çıktısı hiçbir zaman doğrudan rapora yazılmaz.** Öneri önce önizlemede gösterilir; kullanıcı uygularsa maddeler rapora eklenir ve düzenlenebilir.

## Katmanlar

Asistan katman katman öğrenir. Her katman ayrı açılıp kapatılarak ölçülebilir (bkz. [Varyantlar](#varyantlar)).

| Katman | Kapsam | Ne öğrenilir | Nerede ayarlanır | Kim |
|---|---|---|---|---|
| Ölçüm | Hepsi | Neyin işe yaradığı | Haftalık rapor › Ayarlar › AI kalitesi | PYB destek |
| Proje kartı | Proje | Bağlam, müşteri, terimler | Rapor düzenleyici › AI önerisi › **Proje kartı** | Projenin PY'si |
| Zengin girdi | Proje | Bu hafta kapanan işler, geçen haftanın plan durumu | Otomatik (görevler ve plan değerlendirmesinden) | — |
| Kurum kılavuzu | Kurum | Kurallar | Ayarlar › AI kılavuzu ve kurallar › **Rapor kılavuzu** | PYB destek |
| Bölüm eki | Bölüm | Bölüme özgü kurallar | Aynı kartta, bölüm seçerek | PYB destek |
| Dinamik örnekler | Kişi, proje, bölüm | Üslup | Otomatik; "örnek rapor" işareti düzenleyicide | PYB destek işaretler |
| Düzeltme örnekleri | Bölüm, kurum | Tekrarlanan düzeltmeler | Otomatik (AI'nın ilk yazdığı → onaylanan hâl) | — |
| Çıktı denetimi | Hepsi | Kılavuza uyum | Otomatik (öneri önizlemesi) | — |
| Otomatik düzeltme | Hepsi | Tek turluk düzeltme | Yönetici konsolu › Yapay zekâ › **Rapor taslağında otomatik düzeltme** | Admin |
| Öğrenilmiş kurallar | Kurum, bölüm, proje | Tekrarlanan hatalar | Ayarlar › AI kılavuzu ve kurallar › **Öğrenilmiş kurallar** | PYB destek onaylar |
| İnce ayar | Kurum | Kurum dili (yalnız ölçü gösterirse) | Ayarlar › AI kalitesi › **AI ince ayarı** | PYB destek, BT |

### Sistem istemi

Sistem istemi dört parçadır:

1. Rol satırı (kurum adı ayarlanabilir) ve sabit güvenceler ("verilmeyeni uydurma", "proje kartındaki açıklamaları kullan").
2. **Kılavuz gövdesi** (düzenlenebilir) + bölüm eki + etkin öğrenilmiş kurallar.
3. Madde türleri listesi (kodda).
4. JSON çıktı sözleşmesi (kodda; çözümleyici buna bağlıdır, düzenlenemez).

Hiçbir ayar yokken istem, önceki sürümün koda gömülü isteminin aynısıdır. Tam istemi Ayarlar › AI kılavuzu ve kurallar › **Tam istemi önizle** ile görebilirsiniz.

### Örnek seçimi

- **Aday:** onaylı proje raporları; yalnız yazılan haftadan **önceki** haftalar; rapor kendisi hariç.
- **Öncelik:** altın sette ya da "örnek rapor" işaretli +3, aynı proje +2, aynı PY +1,5, aynı bölüm +1. Buna girdiyle metin benzerliği (BM25) eklenir.
- **Seçim** madde düzeyindedir: önce her türden bir madde, aynı rapordan en çok 3, aynı projeden en çok 4 madde, toplam en çok 1.500 karakter.
- Yeni bir PY'nin geçmişi olmasa da bölüm ve kurum örnekleri gelir.
- **Düzeltme örnekleri:** AI'nın ilk yazdığı ile onaylanan hâli belirgin farklı (benzerlik < 0,8) en çok 3 madde; önce aynı bölümden.

### Öğrenilmiş kurallar

- **Format sorunları:** gönderimde aynı format sorunu (ör. açılmamış kısaltma) bir bölümde en az 3 raporda görülürse o soruna karşılık gelen hazır kural önerilir. İki bölümde görülürse kurum geneli önerilir.
- **Taslak düzeltmeleri:** AI maddesinde belirsiz ifadenin kaldırılması, maddeye tarih eklenmesi ya da rutin maddenin silinmesi en az 3 kez tekrarlanırsa kural önerilir.
- **İade notları (AI):** "AI ile aday öner" son iade notlarını ve düzeltme örneklerini modele verir; en çok 5 aday kural döner.
- Önerilen kural **siz etkinleştirmeden isteme girmez.** Etkin kurallar kurum + raporun bölümü + raporun projesi süzgeciyle, kapsam başına en çok 10 kural olarak eklenir.

## Ölçüler

### Kullanımda (öneri günlüğü)

Öneri günlüğü (`reportAiLog`) her öneri için ve her gönderimde bir kayıt tutar. **Rapor metni saklanmaz**, yalnız sayılar tutulur. Son 2.000 kayıt saklanır ve bulutla paylaşılır.

| Ölçü | Tanım |
|---|---|
| Uygulama oranı | Uygulanan öneri / (uygulanan + vazgeçilen + hatalı) |
| Ret oranı | Vazgeçilen öneri / aynı payda |
| Aynen kalma (kabul) oranı | Gönderimde özgün hâliyle aynı kalan AI maddesi / uygulanan AI maddesi. Türkçe harf, büyük-küçük harf ve boşluk farkı sayılmaz |
| Düzenleme oranı | Gönderimde değiştirilmiş AI maddesi / uygulanan AI maddesi |
| Silme oranı | Gönderimde raporda olmayan AI maddesi / uygulanan AI maddesi |
| İade oranı | AI taslaklı ve gönderilmiş raporlardan en az bir kez iade edilenlerin payı |
| Gönderimde hata · uyarı | Gönderilen raporda rapor başına ortalama format hatası ve uyarısı |

Gruplama: bölüm, PY, proje ya da istem sürümü. Bir rapor iade sonrası yeniden gönderildiyse son gönderim sayılır.

### Altın sette (çevrimdışı değerlendirme)

PYB destek onaylı raporlardan bir altın set seçer. Her rapor, o haftanın kayıtlı girdisiyle yeniden önerilir ve onaylı son hâlle karşılaştırılır.

| Ölçü | Tanım |
|---|---|
| Format hatası · uyarısı | Önerinin kılavuz denetimindeki rapor başına ortalama hata ve uyarısı |
| Dayanaksız bilgi oranı | Öneride geçen ama girdide geçmeyen rakam, tarih ve özel ad / denetlenen rakam, tarih ve ad. Tarihler gün-ay olarak karşılaştırılır ("10 Eylül 2026" = "10.09"); girdideki kısaltmanın açılımı ("Bld." → Belediyesi) dayanak sayılır |
| Kapsama (recall) | Onaylı maddelerden AI'nın karşılığını yazdıkları. Eşleşme: terim benzerliği (F1) ≥ 0,5, açgözlü, her madde bir kez |
| İsabet (precision) | AI maddelerinden onaylı hâlde karşılığı olanlar |
| Tür doğruluğu | Eşleşen "bu hafta" maddelerinde türün aynı olması |
| Kısaltma | Rapor başına açılımı bilinmeyen kısaltma |
| Soru | Rapor başına eksik bilgi sorusu (bilgi amaçlı) |

**Zaman ayrımı:** değerlendirilen raporun örnekleri yalnız o haftadan önce onaylanmış raporlardan gelir; rapor kendisi asla örnek olmaz.

### Varyantlar

| Varyant | İçerik |
|---|---|
| Temel | Varsayılan kılavuz + sabit örnek; proje kartı yok |
| + Proje kartı | Temel + proje kartı |
| + Örnekler | Proje kartı + dinamik örnekler ve düzeltme örnekleri |
| + Kılavuz ve kurallar | Proje kartı + kurum/bölüm kılavuzu ve öğrenilmiş kurallar |
| Tam (üretim) | Bütün katmanlar; rapor düzenleyicide kullanılan |
| İnce ayar | Tam sistem istemi, örneksiz kullanıcı istemi; ince ayarlı model için |

En az iki varyantı koşun; karşılaştırma tablosunda her ölçütte en iyi değer yeşil görünür. Eski girdilerde proje kartı yoksa kartlı varyantlar projenin **bugünkü** kartını ekler; bu küçük bir zaman sızıntısıdır ve kartın kazancını biraz iyimser gösterebilir.

## Kalite kapısı

Üretim istemi (Tam) altın sette şu eşikleri geçmelidir. Varsayılanlar:

| Eşik | Varsayılan |
|---|---|
| Rapor başına format hatası en çok | 0,5 |
| Dayanaksız bilgi en çok | %5 |
| Onaylı maddeleri kapsama en az | %50 |
| En az yanıtlı rapor | 5 (altında karar yok) |

- Eşikleri Ayarlar › AI kalitesi › Rapor AI değerlendirmesi kartından değiştirin. Değişiklikler denetim günlüğüne yazılır.
- **Kalite kapısı zorunlu** açıksa ve son değerlendirme geçmediyse rapor düzenleyicide **uyarı** gösterilir. Öneri engellenmez.
- Kılavuz, bölüm eki, etkin kural, istem sürümü ya da model değişince kapı **bayat** sayılır ve yeniden değerlendirme ister.

## Pilot planı

1. **Bölüm seçin.** AI taslağını düzenli kullanacak, en az 5 aktif projesi olan bir bölüm.
2. **Taban çizgisi (2 hafta).** Varsayılan istemle çalışın. Altın sete o bölümden ve diğer bölümlerden en az 10 onaylı rapor ekleyin. "Temel" ve "Tam" varyantlarını koşun.
3. **Katmanları sırayla açın (4–6 hafta).** Her hafta yalnız bir katman:
   1. PY'ler proje kartlarını doldurur.
   2. Kurum kılavuzu ve bölüm eki gözden geçirilir.
   3. Birkaç iyi rapor "örnek rapor" işaretlenir.
   4. "Adayları güncelle" ve "AI ile aday öner"; uygun kurallar etkinleştirilir.
4. **Her katmandan sonra** altın sette ilgili varyantı ve "Tam"ı koşun.
5. **Haftalık ölçü tablosu** tutun:

| Hafta | Açılan katman | Uygulama | Aynen kalma | Düzenleme | Silme | İade | Gönderimde hata | Altın set: hata · dayanaksız · kapsama · isabet |
|---|---|---|---|---|---|---|---|---|
| 1 | — (taban) | | | | | | | |
| 2 | — (taban) | | | | | | | |
| 3 | Proje kartı | | | | | | | |
| … | | | | | | | | |

Kullanım ölçüleri Rapor AI kalitesi kartından ("İstem sürümü" gruplamasıyla), altın set ölçüleri değerlendirme kartından alınır.

6. **Karar.** Pilot sonunda kapı geçiliyorsa kapıyı zorunlu yapın ve diğer bölümlere açın. Geçilmiyorsa kapının kaldığı ölçüte göre katmanı iyileştirin.

## İnce ayara ne zaman geçilir

Karar kartı (Ayarlar › AI kalitesi › AI ince ayarı) ölçüye dayanır. Ayrıntı: [`INCE_AYAR_KARARI.md`](INCE_AYAR_KARARI.md) › Haftalık rapor taslağı.

- Üretim istemi kapıdan geçiyorsa **ince ayar gerekmez.**
- Geçmiyorsa önce katmanları iyileştirin. En az 300 uygun rapor ve 20 altın set raporu yoksa karar verilemez.
- En az 1.000 uygun rapor ve 50 altın set raporu varsa ve kapı hâlâ geçilmiyorsa ince ayar önerilir.

## KVKK notları

- AI'ya giden metinlerde ad maskeleme (varsayılan açık) kişi, proje ve kurum adlarını takma adla gönderir; yanıtta tarayıcıda geri çevirir.
- Öneri günlüğü metin içermez.
- `aiDraft.input` (raporun AI girdisi) proje notlarını içerir ve raporla birlikte buluta gider. Bu önceki sürümden gelen bir davranıştır. Altın set ve ince ayar veri kümesi bu alanı kullanır.
- Altın sete girdi yazılmaz: girdisi yalnız yerel notlardan üretilebilen rapor, notların bulunmadığı cihazda "girdisi yok" sayılır.
- Proje kartı proje kaydıyla buluta gider; özel değildir. Kart sayfası bunu belirtir.
- İndirilen veri kümelerinde kişi adları `[kişi]` ile maskelenir; proje ve kurum adları isteğe bağlı takma adla. Hiçbir veri otomatik olarak kurum dışına gönderilmez. Veri kurum dışına çıkacaksa KVKK değerlendirmesi ve onay gerekir.

## Kurum içi model bağlama

OpenAI uyumlu kurum içi uçlar (vLLM, Ollama, LiteLLM) şu ayarlarla bağlanır (bkz. [`AI_KURULUM.md`](AI_KURULUM.md)):

```
AI_PROVIDER=openai
AI_BASE_URL=https://llm.kurum.local/v1
AI_MODEL=<model-adı>
```

İnce ayarlı model **ayrı bir `AI_MODEL` adıyla** tanımlanır. Ardından altın sette **İnce ayar** varyantıyla değerlendirilir ve aynı kalite kapısından geçirilir. Geçmezse önceki model adına dönülür. Model adı değişince kapı bayatlar.

## Kod haritası

| Ne | Nerede |
|---|---|
| Sistem istemi, kılavuz, sürümler, etkin kurallar | `utils/ai/reportGuide.ts` |
| Girdi, kullanıcı istemi, yanıt çözümleyici | `utils/ai/weeklyReportPrompt.ts` |
| Varyantlar ve istem oluşturucu | `utils/ai/reportVariants.ts` |
| Proje kartı | `utils/ai/projectProfile.ts` |
| Örnek ve düzeltme seçimi | `utils/ai/reportExamples.ts` |
| Öneri günlüğü ve kabul ölçüleri | `utils/ai/reportAiStats.ts` |
| Dayanak denetimi, altın set, puanlama, kapı | `utils/ai/reportEval.ts` |
| Çıktı denetimi ve otomatik düzeltme | `utils/ai/reportRepair.ts` |
| Öğrenilmiş kurallar | `utils/ai/reportRules.ts` |
| İnce ayar veri kümesi ve karar kartı | `utils/ai/reportFineTune.ts` |
| Arayüz | `components/modern/weekly/ReportEditor.tsx`, `components/modern/weekly/ReportAiPanels.tsx` |
| Uygulama planı ve durum | [`RAPOR_AI_PLANI.md`](RAPOR_AI_PLANI.md) |
