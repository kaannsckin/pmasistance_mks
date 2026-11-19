# PoC Bulgu Takip Excel'i → PlanAsistan projesi

GİB PoC'si için hazırlanan "PoC Bulgu Takip" çalışma kitabı (Genel Liste, CR / Epic listeleri, EMS planı, Test Kalemleri) uygulamaya tek adımda aktarılır. Excel'de elle tutulan takip; panoya, yol haritasına, iş paketlerine, sprint planlayıcıya, haftalık rapor AI'sına ve buluta taşınmış olur.

## Nasıl kullanılır

1. **PYB Destek** (ya da Admin) profiliyle açın. Bu profil yeni PY'yi (ör. **MKS**) Veri Havuzu'na ekleyebilir. Proje Yöneticisi profiliyle de aktarılabilir; o zaman PY havuzdaki bir kişi olmalıdır.
2. **Portföy → Excel'den aktar.** Klasik arayüzde bu bağlantı "Yeni Proje Ekle" kartının altındadır.
3. Dosyayı seçin. Önizlemede bulgu sayısı, milestone dağılımı, ekip eforu, PoC skoru ve zorunlu açık görünür.
4. **Hedef proje** için "Yeni proje oluştur"u seçip adı girin (varsayılan: GİB). **Proje yöneticisi (PY)** için havuzdan bir kişi seçin ya da yeni kişi ekleyin (varsayılan: MKS). Havuzda "MKS" adlı ya da baş harfleri M-K-S olan biri varsa o kişi kullanılır.
5. **Projeyi oluştur.** Bulut bağlıysa değişiklik birkaç saniye içinde Supabase'e gönderilir.

Excel güncellendikçe aynı dosyayı yeniden aktarın ve hedef olarak mevcut projeyi seçin. Bulgular **Test No** ile eşleşir ve Excel'den gelen alanlar güncellenir. Görev durumu yalnız Excel'de "Durum" yazılıysa değişir. Uygulamada eklenen görevler, yorumlar, sürüm planı, proje kartı ve notlar korunur.

## Eşleme

| Excel | PlanAsistan |
|---|---|
| Genel Liste satırı (Test No · Başlık) | Görev: `gib-<Test No>` kimliği, ad `I-09 · Başlık` |
| Jira / CR No | Görevin Jira anahtarı; en sık önek proje Jira anahtarı olur (MPS) |
| Durum (Açık · Analizde · Yanıt bekleniyor · Geliştirmede · Testte · Kapandı · İptal) | Yapılacak · Süreçte · Tamamlandı. İptal edilen görev planlamaya girmez. Durum boşsa MS0 Yapılacak, diğer MS'ler Bekleyen olur. |
| Öncelik (10 / 9 / 8 / 7,5) | Blocker / High / Medium / Medium. Puan yoksa önem kademesine bakılır: Kademe 1 High, 2–4 Medium, diğerleri Low. |
| EMS / İstemci / Test / Dizin (gün) | Efor (gün). En çok eforu olan ekip görevin birimi olur. Efor Kaynağı bir CR'ı gösteriyorsa CR eforu bağlı maddelere eşit bölünür. |
| Atanan (kişi) | Kaynak: ilk kişi. Birden çok kişi varsa hepsi notta listelenir. |
| MS, Önem, PoC Sonucu, Güncel Sonuç, Rapor 5.1 | Etiketler (MS'ler renkli) |
| Rapordaki tespit, beklenen sonuç, test notu, sorular, aksiyon planı, MS notu, iş kodu | Görev notu |
| Hedef Tarih · Başlangıç · Kapanış | Termin · ilk başlama · kapanış damgası |
| Epic Listesi (EP-01…EP-08) | İş paketleri. Görevin epic'i CR Listesi kırılımından bulunur. |
| EMS → Kişi havuzu (kaynak %) | Proje kaynakları (EMS birimi) |
| EMS Çalışması → "Neyin öncülü" | Görev öncülü |
| Milestone → Başlangıç tarihi | Proje başlangıcı |
| GİB rapor ve toplantı çıktıları | Müşteri istekleri (PY'ye özel alan; görevlere dönüştürülebilir) |
| Giriş (MS0/MS1, öncelik tanımları) | Proje kartı sözlüğü (haftalık rapor AI'sının bağlamı) |
| Test Kalemleri | PoC skoru ve zorunlu açık. Önizlemede ve denetim günlüğünde görünür. |
| Öncelikli Bulgular → Olası Etki | Görev notu ("Olası etki") |
| Aralık Teslimi · Aralık Sonrası Teslim | Etiket ("Aralık teslimi" / "Aralık sonrası teslim") ve not: alt küme, karar kaynağı, sunumdaki başlık, toplantı notu |
| GİB'den Yanıt Beklenenler | Etiket "GİB yanıtı bekleniyor" ve not: yanıt durumu ve açıklama |

Excel'deki formül sütunlarının (Sorumlu, Epic, İş Kodu, İlerleme) değerleri dosyada kayıtlı olmayabilir. Bu yüzden aktarım bunları ham girdilerden yeniden hesaplar. Sütunlar başlık adıyla bulunur; yerleri değişse de okunur. Dashboard, Milestone (başlangıç tarihi dışında), Rehber, EMS Sprintler ve Sayfa1 sayfaları aktarılmaz: bunlar türetilmiş görünümler ya da karalama notlarıdır. Uygulama aynı bilgiyi kendi ekranlarında hesaplar.

## Jira ile eşitleme

Aktarımda proje, Jira / CR No sütunundaki anahtarların önekiyle (ör. **MPS**) Jira'ya bağlanır ve hazır bir eşitleme ayarı alır. **Planlama → Jira eşitleme → Şimdi eşitle** ile Excel'deki her Jira No'nun güncel hâli Jira'dan çekilir (50'şer anahtarlık isteklerle; tüm Jira taranmaz). Jira'da bulunamayan anahtarlar bildirilir.

Her alan için yön seçilir:

| Yön | Anlamı |
|---|---|
| Eşitleme yok | Alan uygulamada (Excel'de) kalır |
| Jira → Uygulama | Jira'daki değer alınır. Jira'da termin ya da atanan boşsa uygulamadaki silinmez. |
| Uygulama → Jira | Uygulamadaki değer Jira'ya yazılır (sunucuda `JIRA_ALLOW_UPDATE=1` gerekir) |
| Çift yönlü | Son eşitlemeden beri hangi taraf değiştiyse o kazanır. İki taraf da değiştiyse Jira esas alınır ve çakışma bildirilir. İlk eşitlemede Jira esastır. |

Jira'ya yalnız durum (iş akışı geçişiyle), termin, öncelik ve başlık yazılabilir. Atanan, açıklama, etiket, süre, bileşen, sürüm ve tür yalnız Jira'dan alınır.

Aktarımın önerdiği ayar ("Excel takibi önerisi"): durum, atanan, termin, harcanan süre ve düzeltme sürümü Jira'dan gelir. Başlık, not, etiketler, öncelik puanı ve ekip birimi Excel'de kalır. Excel yeniden aktarıldığında Jira'dan alınan alanlar ezilmez.

**Kişiler:** "Jira'daki atanan kişileri … otomatik ekle" açıkken (aktarımda açık gelir) Jira'daki atananlar, Veri Havuzu'nda yoksa e-postalarıyla kişi olarak açılır. Proje ekibinde yoksa da kaynak olarak eklenir; birimleri, görevlerinde en sık geçen birimdir. Aynı kişi ikinci kez açılmaz.

Eşitleme elle ya da proje ayarındaki aralıkla otomatik çalışır (uygulama açıkken). Her eşitleme denetim günlüğüne yazılır: güncellenen, kapanan, Jira'ya yazılan kayıtlar, çakışmalar ve eklenen kişiler. Kod: [`utils/planning/jiraFieldSync.ts`](../utils/planning/jiraFieldSync.ts), [`utils/planning/jiraPeople.ts`](../utils/planning/jiraPeople.ts).

## Ekip tahsisi ve Jira

**Ekip ve tahsis → Tahsis tablosu**'nda hücreler AA (adam-ay, 1 = tam zamanlı) ya da **%** olarak girilir. Tablonun üstündeki **Birim** düğmesiyle seçilir; %100, 1 AA'dır. Seçim bu cihazda hatırlanır.

Hücre kapalıysa nedeni projenin başlığında ve hücrenin üzerine gelince yazar:
- **PY başka biri:** Tahsisi yalnız projenin PY'si (ve kişinin bölüm sorumlusu) girer. Rol seçiminde projenin PY'si olan kişiyi seçin ya da proje kartından PY'yi değiştirin. Excel aktarımında PY olarak yeni bir kişi (ör. MKS) açıldıysa, rol seçiminde o kişi seçilmelidir.
- **Plan onaya gönderildi ya da kilitlendi:** Plan değiştirilemez, gerçekleşen girilebilir. Kilidi müdür / PYB sorumlusu açar.

**Jira'dan** düğmeleri (Jira anahtarlı görevleri olan projeler için):
- **Plan (atamalar):** Jira'da birine atanmış açık işlerin kalan eforu (tahmin − harcanan) bugünden termine kadar iş günlerine yayılır. Termin yoksa iş bugünden başlayarak eforu kadar iş gününe yayılır. Sonuç önizlenir; "boş ayları doldur" ya da "üzerine yaz" ile tabloya yazılır.
- **Gerçekleşen (worklog):** Projenin Jira kayıtlarına yazılan worklog'lar kişi × ay saate toplanır ve gerçekleşen AA'ya çevrilir (saat ÷ 8 ÷ ayın iş günü). Aynı Jira projesindeki başka işlere yazılanlar alınmaz. Havuzda olmayan kişiler Veri Havuzu'na eklenir.

## Ayarları panelden girmek

**Yönetici konsolu → Entegrasyonlar**'da `.env` / `planasistan.env` dosyasındaki Jira, Teams ve e-posta değerleri girilir: Jira adresi, jeton, izinli projeler (`JIRA_ALLOWED_PROJECTS`), Jira'ya yazma / kayıt açma, Teams webhook'u, SMTP. "Jira bağlantısını dene" kaydetmeden jeton sahibini ve erişilen projeleri gösterir.

- Panelde girilen değer dosyadakinin üzerine yazılır; boş alan dosyadakini kullanır. "Paneldekileri sil" ile dosyaya dönülür.
- Jeton, parola ve webhook sunucuda şifreli saklanır (AI ayarlarıyla aynı depo ve `AI_CONFIG_SECRET`), tarayıcıya geri gelmez.
- Kayıttan sonra yeniden başlatmak gerekmez; en geç 30 saniye içinde geçerli olur.
- Masaüstü sürümünde (exe) yönetici anahtarı istenmez; ayarlar `planasistan-veri/integration-settings.json` dosyasına yazılır. Web sürümünde AI bağlantısıyla aynı yönetici anahtarı (`AI_ADMIN_TOKEN`) ve kalıcı depo gerekir.

"MPS projesi bu sunucuda Jira erişimine açık değil" hatası: İzinli projeler alanı (`JIRA_ALLOWED_PROJECTS`) dolu ve MPS listede yok. Alanı `MKS, MPS` yapın ya da boşaltın.

Kod: [`utils/gibFindings.ts`](../utils/gibFindings.ts) (dönüştürücü ve birleştirme), [`components/GibImportModal.tsx`](../components/GibImportModal.tsx) (pencere). Testler: [`utils/gibFindings.test.ts`](../utils/gibFindings.test.ts).
