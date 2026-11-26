# Plan optimizasyonu

Planlama › **Plan** › **Optimize et** (ve asistanın `plan_optimizasyonu` aracı) sürümün
açık işlerini sprintlere ve kişilere yerleştirir, kilometre taşlarının hedefe
yetişip yetişmediğini gösterir ve gecikme varsa kurtarma seçenekleri hesaplar.
Hiçbir değişiklik onaysız uygulanmaz.

Kod: `utils/planning/capacity.ts` (kapasite ve kalan efor), `utils/planning/planOptimizer.ts`
(çizelgeleme, metrikler, senaryolar), `components/modern/planning/PlanOptimizerSheet.tsx` (ekran).

## Amaç (öncelik sırasıyla)

1. Kilometre taşlarını hedef tarihlerine yetiştirmek (toplam gecikmeyi en aza indirmek)
2. Kişi kapasitesini aşmamak (hedef doluluk tamponuyla)
3. Sürümü olabildiğince erken bitirmek
4. Planı gereksiz yere değiştirmemek (kararlı kip)

## Kapasite modeli

```
kişi × sprint kapasitesi = katılım × (net gün ÷ sprint iş günü) × Σ gün (1 − o ayın izin oranı) × hedef doluluk
```

| Etken | Kural |
|---|---|
| Hafta sonu, resmi tatil | Sayılmaz (Türkiye takvimi, dini bayramlar dahil) |
| İzin | Kişinin ay bazındaki izin AA'sı gün oranına çevrilir (1 AA = tam ay); kaynak adı veri havuzundaki ad soyadla eşleşir |
| Bu sprint | Yalnız bugünden sonraki iş günleri sayılır |
| Test | Sprint içi test (net gün < sprint günü) her güne oransal yansır; test 0 gün = test sprint içinde |
| Hedef doluluk | Varsayılan %85: toplantı, destek, beklenmeyen iş için tampon |
| Sürüm dışı işler | Açık olanların yükü önceden düşülür; biten sprintlerde kalmış sürüm dışı işler sayılmaz (uyarılır) |

## Kalan efor

- Başlamamış iş: PERT eforu; "Geçmiş sapmaya göre düzelt" açıksa benzer kapanmış işlerin
  gerçekleşen ÷ tahmin ortancasıyla çarpılır (birim + tür, yoksa birim, tür, tüm geçmiş; 0,5–3 arası).
- Başlamış iş: Jira kalan süresi (seçenek açıksa), yoksa tahmin − harcanan saat, yoksa
  sprintte kalan gün oranı (en az %25). Sapma düzeltmesi başlamış işe uygulanmaz.

## Çizelgeleme

Kaynak kısıtlı liste çizelgeleme. Öncül bağımlılığı çözülen işler şu anahtarla seçilir:

1. Kilometre taşı (hedef tarih sırasıyla; taşsız işler sonda)
2. Blocker önce
3. **Kritik zincir**: işin kendisi + en uzun ardıl zincirinin eforu (uzun zinciri olan iş önce başlar)
4. Öncelik, termin, plan sırası

Her iş, öncülü bittiği sprintten **sonraki** sprintten başlayarak kapasitesi yeten en erken sprinte konur.

| Seçenek | Davranış |
|---|---|
| Yalnız gerekeni değiştir (varsayılan) | İşin mevcut yeri hâlâ uygunsa korunur; haftalık takipte plan çalkalanmaz |
| Baştan dağıt | Bütün açık işler yeniden yerleştirilir |
| Büyük işleri böl | Kişinin sprint kapasitesini aşan iş en çok 4 ardışık sprinte yayılır |
| Kişi değişikliğine izin ver | Yalnız **aynı birimde**, yalnız iş en az bir sprint erken bitecekse başka kişiye verilir; atanmamış işe kişi önerilir |
| Jira kalan süresi | Başlamış işin yükü Jira kalan süresinden |

Devam eden işler yerinde kalır (iş başlamış; sprinti ya da kişisi değiştirilmez).
Biten sprintte kalmış sürüm işleri bugünden itibaren yeniden yerleşir (devir).

## Hız kontrolü

Plan, sprint başına `ekip kapasitesi × hedef doluluk` kadar iş yapılacağını varsayar. Ekip
son biten sprintlerde (en az 2) bunun belirgin altında (1,25 kat tolerans) iş bitirdiyse
uyarı çıkar ve hıza uyan hedef doluluk önerilir. Kâğıt üstü kapasiteyle kurulan ama
gerçekleşen hızı aşan plan tutmaz.

## Kurtarma senaryoları

Bir taş gecikiyorsa her seçenek ayrı bir optimizasyonla hesaplanır; yalnız gecikmeyi
azaltanlar listelenir:

- Aynı birimde iş dağılımı (kişi değişikliği)
- Büyük işleri böl
- Tamponsuz çalış (%100 doluluk)
- Hepsi birlikte
- Baştan dağıt
- **Kapsamı daralt**: taşın en düşük öncelikli, sonra en büyük işleri tek tek taştan çıkarılır
  (Blocker hiç), hedef tutunca durulur. Görevler sürümde kalır, taş sonrasına planlanır.
- **Hedefi güncelle**: plan değişmez, taş hedefi tahmini bitişe çekilir.

## Metrikler

Önce/sonra: geciken taş, toplam gecikme (takvim günü), kapasite aşımı (kişi × sprint,
tam kapasiteye göre), planlanmamış iş, sürüm bitişi. Önce planlanmamış iş varsa gecikme
ölçülemez ("—").

## Sınırlar

- Sezgisel yöntem: hızlı ve açıklanabilir, ama her durumda en iyi çözümü garanti etmez.
- Sprint çözünürlüğü: aynı sprintte öncül ve ardıl birlikte planlanmaz (bitiş-başlangıç + 1 sprint).
- Beceri eşleşmesi birim düzeyindedir (aynı birim = yapabilir varsayılır).
- Olasılıklı teslim tarihi (P50/P80) için Plan simülasyonu sekmesi kullanılır.

## Asistan

`plan_optimizasyonu` (yalnız tarayıcı sohbetinde): taş tahminleri önce/sonra, hız kontrolü,
senaryolar ve gerekçeli değişiklikler döner. `oner=true` (isteğe bağlı `senaryo`) ile
motorun hesapladığı değişiklikler `plan_uygula` öneri kartı olur; model değişiklikleri
kendisi yazmaz. Kart uygulanırken görevlerin sprinti öneriden sonra değiştiyse reddedilir.
