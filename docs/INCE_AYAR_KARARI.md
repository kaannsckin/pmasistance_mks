# İnce ayar (fine-tuning) kararı

**Durum:** Karar verildi. Şimdilik ince ayar yapılmıyor; karar, uygulamadaki ölçü tabanlı **İnce ayar kararı** kartıyla düzenli olarak yeniden değerlendirilir.
**Tarih:** 8 Ekim 2026
**Kapsam:** Planlama asistanının kayıt tahmini önerisi (tür, önem, efor aralığı, kapanma süresi)

## Bağlam

Planlama asistanında dört tahmin kaynağı vardır:

1. **Geçmiş kayıt tahmini** (referans sınıfı): en benzer kapanmış kayıtların gerçek süreleri.
2. **Klasik makine öğrenmesi modeli:** tarayıcıda eğitilen gradyan artırmalı ağaçlar ve lojistik regresyon.
3. **AI önerisi:** kurum AI sunucusundaki dil modeli; istem ve benzer kayıtlardan oluşan bağlamla (RAG).
4. **Ekibin kendi tahmini** (kör tahmin).

Soru şu: AI'yı kurumun kayıt geçmişiyle ince ayarlamak tahmin isabetini anlamlı artırır mı, ve bu kazanç maliyete, bakım yüküne ve veri riskine değer mi?

## Seçenekler

| | İstem + bağlam (mevcut) | Klasik makine öğrenmesi (mevcut) | Dil modeline ince ayar |
|---|---|---|---|
| Veri ihtiyacı | Yok (bağlam her istekte) | 60+ kapanmış kayıt | 300+ (iyi sonuç için 1.000+) örnek |
| Güncellik | Anında (yeni kayıt bağlama girer) | Her açılışta yeniden eğitilir | Yeniden eğitim gerekir |
| Açıklanabilirlik | Dayanak kayıtlar gösterilir | Etkenler ve özellik önemi | Düşük |
| Maliyet | İstek başına | Yok (tarayıcıda) | Eğitim + barındırma + bakım |
| Veri riski | Bağlam istekle sunucuya gider | Veri tarayıcıdan çıkmaz | Eğitim verisi sağlayıcıya gidebilir |
| En iyi olduğu iş | Metin: eksik bilgi soruları, gerekçe, tür ve önem | Sayısal: efor ve süre | Kurum diline ve sınıflandırmasına uyum |

## Karar

1. **Şimdilik ince ayar yapılmıyor.** Gerekçeler:
   - **Sayısal tahmin için daha ucuz yollar var.** Efor ve süre tahmininde klasik model ile geçmiş kayıt tahmini zaten gerçekleşen verilerden öğreniyor. Bu yöntemler ücretsiz, açıklanabilir ve anında güncel. İnce ayarlı bir dil modelinin bu işte onları geçeceğine dair bir ölçü yok.
   - **AI'nın katkısı istem ve bağlamla sağlanıyor.** AI'nın asıl katkısı metin işlerinde: eksik bilgi soruları, gerekçe, tür ve önem önerisi.
   - **İnce ayarın sürekli maliyeti var.** Model değiştikçe yeniden yapılması gerekir. Eğitim verisi kurum dışına çıkabilir (KVKK). Ekip ve süreç değiştikçe ince ayar eskir.
2. **Karar ölçüyle yeniden değerlendirilir.** Yönetici konsolu › Tahmin kalitesi › **İnce ayar kararı** kartı, aşağıdaki ölçütleri canlı verilere uygular.

## Karar ölçütleri

Kart şu sırayla karar verir:

1. **Karar için veri yetersiz.** Aşağıdakilerden biri geçerliyse:
   - AI önerisi geçerli modelle altın sette değerlendirilmemiş (ya da son değerlendirme başka bir modelle yapılmış).
   - Altın set 20 kayıttan küçük.
2. **İnce ayar gerekmiyor.** Aşağıdakilerden biri geçerliyse:
   - AI kalite kapısından geçiyor ve efor hatası geçmiş kayıt tahmininden büyük değil.
   - Makine öğrenmesi modeli sınamada geçmiş kayıt tahmininden isabetli ve AI'dan da isabetli (iki hata da geçmiş kayıt tahminine oranlanarak karşılaştırılır).
3. **Karar için veri yetersiz.** AI geride kalıyor, ama eğitime uygun kapanmış kayıt 300'den az.
4. **İnce ayar önerilir.** AI geride kalıyor, kayıt 1.000 ve üzeri, altın set 50 ve üzeri.
5. **İnce ayar düşünülebilir.** AI geride kalıyor ve veri sınırda. Önce istem ve bağlam kalitesini artırmak daha ucuzdur.

Kart ayrıca şunları gösterir: gerçek kullanımda AI'nın isabeti (öneri günlüğü), kişisel veri durumu ve AI sağlayıcısı. Her durum için sonraki adımlar da kartta yazılıdır.

## İnce ayar önerilirse uygulama adımları

1. **Veri kümesi.** Kartta "Veri kümesini hazırla" düğmesi eğitim ve doğrulama dosyalarını (sohbet biçimi JSONL) ve veri kartını üretir.
   - **Zaman ayrımı:** Her örnekte bağlam, yalnız o kayıt açılmadan önce kapanmış kayıtlardır.
   - **İstem:** Planlamadaki istemin aynısı kullanılır; önem ve tür taslağa girmez.
   - **Hedef yanıt:** Gerçekleşen efor (−%30 / +%60 aralıkla), gerçek önem ve tür, en benzer üç dayanak. Güven değeri bağlamın gücünden gelir.
   - **Altın set dışarıda:** Altın setteki kayıtlar kümeye girmez; değerlendirme bu kayıtlarla yapılır.
   - **Doğrulama:** En son kapanan %15 doğrulama kümesidir.
   - **Kişi adları:** Sorumlu alanı kümeye girmez. Metinlerde geçen kişi adları `[kişi]` ile maskelenir; Türkçe büyük-küçük harf farkı (İ/i, I/ı) gözetilir.
2. **Gizlilik.** Veri kurum dışına çıkacaksa önce KVKK değerlendirmesi ve onay alınmalıdır. Kayıt metinlerinde başka kişisel veri kalmış olabilir; örneklem alıp elle gözden geçirin. Tercih edilen yol, kurum içi açık ağırlıklı bir modele LoRA ile ince ayardır.
3. **Eğitim.** Sağlayıcının ince ayar hizmeti ya da kurum içi eğitim kullanılabilir. Düşük öğrenme oranı ve 1–3 tur (epoch) önerilir; aşırı öğrenmeyi yakalamak için doğrulama kaybı izlenmelidir.
4. **Yayına alma.** İnce ayarlı modeli sunucuda ayrı bir model adıyla tanımlayın (`AI_MODEL`). Veri kümesi aynı istemle üretildiği için istem sürümü değişmez.
5. **Değerlendirme.** Altın sette "AI ile değerlendir" çalıştırılır ve aynı kalite kapısı uygulanır. Kapı geçilemezse önceki model adına dönülür.
6. **İzleme.** AI isabeti öneri günlüğünde izlenir. Üç ayda bir yeniden değerlendirme yapılır. İstem sürümü değişirse veri kümesi yeniden üretilir.

## Riskler ve önlemler

| Risk | Önlem |
|---|---|
| Ezberleme, gelecek bilgisinin sızması | Zaman ayrımlı bağlam; altın set dışarıda; doğrulama en son kapananlar |
| Aşırı güven | Hedef güven bağlamın gücünden gelir; kapı aralık kapsamasını ölçer |
| Eskime (ekip, süreç değişimi) | Kalibrasyon kayması izlenir; üç ayda bir yeniden değerlendirme |
| Kişisel veri | Sorumlu alanı yok, adlar maskeli; kurum dışı kullanımda KVKK onayı |
| Sağlayıcıya bağımlılık | Ayrı model adı; kapı geçilemezse eski modele anında dönüş |

## Gözden geçirme

Karar kartı şu durumlarda yeniden incelenir:

- Üç ayda bir.
- Jira'dan büyük bir kayıt geçmişi aktarıldığında.
- AI sunucusunda model değiştiğinde.
- Altın set 50 kaydı aştığında.

## Haftalık rapor taslağı

Bu bölüm, haftalık rapor AI asistanının (rapor taslağı önerisi) ince ayar kararını anlatır. Yukarıdaki kayıt tahmininden ayrı bir karardır. Ayrıntılı katmanlar ve ölçüler: [`RAPOR_AI.md`](RAPOR_AI.md).

### Önce denenecekler

İnce ayardan önce istem katmanları denenir. Hepsi ucuzdur ve geri alınabilir:

1. **Proje kartı** (PY): projenin ne olduğu, müşterileri, terimleri.
2. **Kurum ve bölüm kılavuzu** (PYB destek): Haftalık rapor › Ayarlar › AI kılavuzu ve kurallar.
3. **Dinamik örnekler:** onaylı raporlardan benzer maddeler ve "AI'nın ilk yazdığı → onaylanan hâl" çiftleri.
4. **Öğrenilmiş kurallar:** tekrarlanan format sorunlarından ve düzeltmelerden; PYB destek onaylar.

Her katmanın kazancı altın sette varyantlarla ölçülür (Ayarlar › AI kalitesi › Rapor AI değerlendirmesi).

### Karar ölçütleri

Karar kartı (Ayarlar › AI kalitesi › AI ince ayarı) şu kuralla çalışır:

| Durum | Karar |
|---|---|
| Üretim istemi (Tam) geçerli yapılandırmayla değerlendirilmemiş, bayat ya da altın set 20 raporun altında | Karar için veri yetersiz |
| Üretim istemi kalite kapısından geçiyor | İnce ayar gerekmiyor |
| Kapıdan geçmiyor, uygun rapor 300'ün altında | Karar için veri yetersiz (önce istemi iyileştirin) |
| Kapıdan geçmiyor, en az 1.000 rapor ve 50 altın set raporu | İnce ayar önerilir |
| Kapıdan geçmiyor, veri sınırda | İnce ayar düşünülebilir |

"Uygun rapor": onaylı, AI girdisi kayıtlı (`aiDraft.input`), son hâlinde format hatası olmayan, altın sette olmayan proje raporu. Aynı girdi bir kez sayılır.

### Veri kümesi

- **Biçim:** sohbet (system · user · assistant), JSONL; eğitim, doğrulama ve veri kartı ayrı dosyalar.
- **İstem eşitliği:** system = raporun bölümü ve projesi için bugünkü kılavuz ve etkin kurallar; user = "İnce ayar" (`ft`) varyantının istemi: sabit örnek ve dinamik örnek yok, proje kartı var. İnce ayarlı model kullanımda da bu varyantla çağrılmalıdır.
- **Hedef yanıt:** PYB destekçe onaylanmış son hâl, mevcut JSON sözleşmesiyle.
- **Altın set dışarıda:** altın setteki raporlar kümeye girmez.
- **Zaman ayrımı:** en son haftaların %15'i doğrulama kümesidir.
- **Gizlilik:** kişi adları `[kişi]` ile maskelenir. Proje ve kurum adları varsayılan olarak tutarlı takma adla (Proje-0000, Kurum-0000) maskelenir. Maskelenen ad sayıları veri kartına yazılır.

### Uygulama adımları

1. Karar "İnce ayar önerilir" ise "Veri kümesini hazırla" ile dosyaları indirin. Veri kartını ve rastgele 20 örneği elle gözden geçirin: girdiler proje notlarını içerir, başka kişisel veri kalmış olabilir.
2. **Tercih edilen yol:** kurum içi açık ağırlıklı bir modelde (vLLM, Ollama ya da LiteLLM arkasında) LoRA ile ince ayar. Veri kurum dışına çıkacaksa önce KVKK değerlendirmesi ve onay gerekir.
3. Düşük öğrenme oranı, 1–3 tur; doğrulama kaybını izleyin.
4. İnce ayarlı modeli sunucuda ayrı bir model adıyla tanımlayın: `AI_PROVIDER=openai`, `AI_BASE_URL=<kurum içi uç>`, `AI_MODEL=<ince ayarlı model>`.
5. Altın sette **İnce ayar** varyantıyla değerlendirin. Aynı kalite kapısından geçmezse önceki modele dönün.
6. Kılavuz ya da kurallar değişince veri kümesini yeniden üretin; sistem istemi kılavuzun o anki sürümünü taşır.
