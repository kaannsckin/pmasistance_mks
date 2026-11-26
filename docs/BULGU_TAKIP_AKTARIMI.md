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
| Önem Kademesi, Öncelik (puan), CR kırılımı | Etiket aileleri: "Kademe: 2", "Öncelik puanı: 7,5", "CR: CR-05" (filtre, kırılım, çapraz tablo) |
| Rapordaki tespit, beklenen sonuç, test notu, sorular, aksiyon planı, MS notu, iş kodu | Görev notu |
| Hedef Tarih · Başlangıç · Kapanış | Termin · ilk başlama · kapanış damgası |
| Epic Listesi (EP-01…EP-08) | İş paketleri. Görevin epic'i CR Listesi kırılımından bulunur. |
| EMS → Kişi havuzu (kaynak %) | Proje kaynakları (EMS birimi) |
| EMS Çalışması → "Neyin öncülü" | Görev öncülü |
| Milestone → Başlangıç tarihi | Proje başlangıcı |
| GİB rapor ve toplantı çıktıları | Müşteri istekleri (PY'ye özel alan; görevlere dönüştürülebilir) |
| Giriş (MS0/MS1, öncelik tanımları) | Proje kartı sözlüğü (haftalık rapor AI'sının bağlamı) |
| Test Kalemleri | Projenin PoC test listesi (tamamı, göreve dönüşmeyenler dahil). Skor bundan ve görevlerin Jira durumundan her an hesaplanır. |
| Öncelikli Bulgular → Olası Etki | Görev notu ("Olası etki") |
| Aralık Teslimi · Aralık Sonrası Teslim · GİB'den Yanıt Beklenenler | Planlama kategorisi etiketi (aşağıda) ve not: alt küme, karar kaynağı, sunumdaki başlık, toplantı notu, yanıt durumu |
| GİB'den Yanıt Beklenenler | Ayrıca "GİB yanıtı bekleniyor" etiketi |

**Planlama kategorileri** ("Planlama:" etiket ailesi; yalnız etiket ve filtre, sıraları yoktur):

| Etiket | Kural |
|---|---|
| Planlama: Aralık 2026 | "Aralık Teslimi" sayfası; alt kümesi "Dahil edilmeye çalışılacak" olanlar hariç |
| Planlama: GİB netleştirme | "Aralık Sonrası Teslim" alt kümesi 3 (Müşteri ile iletişime geçilecek) + "GİB'den Yanıt Beklenenler" (Aralık planında olmayanlar) |
| Planlama: Müşteri sonrası | "Aralık Sonrası Teslim" alt kümesi 2 (GİB'in ilk teslimat sonrası talebi) |
| Planlama: Proje ekibi | "Aralık Sonrası Teslim" alt kümesi 1 (Proje ekibi kısıtı) + Aralık "Dahil edilmeye çalışılacak" |

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

## PoC skoru

Skor Excel aktarımında bir kez değil, proje verisinden her an hesaplanır. Dashboard bileşeni, zamanlanmış rapor ve GİB raporu sunumu aynı hesabı kullanır ([`utils/gibPoc.ts`](../utils/gibPoc.ts)).

Her test GİB puanından başlar ve kalan açığı, bağlı görevin (`gib-<Test No>`) son Jira eşitlemesindeki durumuna PY'nin girdiği katsayı (k) kadar kapatır:

- Test puanı: p = b + (1 − b) · k
- Skor = 100 · Σ w·p / Σ w (w: Zorunlu 3, Olması beklenen 2, İsteğe bağlı 1)
- b: Güncel Sonuç varsa o, yoksa PoC sonucu (karşılandı 1, kısmen 0,5, karşılanmadı 0)
- Değerlendirilmemiş testler (test edilemedi, üreticiye sorulacak, değerlendirme dışı) paydada yoktur; varsayılan kurala göre madde tamamlanınca (k = 1) 1 puanla girer.

| Skor | Başlangıç | Katsayı | Ne için |
|---|---|---|---|
| İlk | Yalnız GİB PoC sonucu | 0 | GİB raporundaki referans |
| Doğrulanmış | Güncel Sonuç, yoksa PoC sonucu | 0 | GİB'in yeniden test edip kabul ettiği durum |
| Bugün | Doğrulanmış ile aynı | Son Jira durumu × k | Sunumdaki "Bugün" |
| Olası | Bugün ile aynı | Seçilen kapsamdaki maddeler 1 | "Aralık sonrası" gibi senaryolar |

**Kategori katkısı**: Olası kapsamın dışındaki her kategorinin katkısı, kalan açığın (100 − Olası) o kategorideki eksik ağırlıklı puan payıdır. Hesap kategorilerin sırasına bağlı değildir. "Tek başına" katkı (yalnız o kategori eklenseydi) ipucunda gösterilir; bu değerler toplanmaz.

**Ayarlar** (Proje ayarları › PoC skoru):
- **Süreç katsayısı**: her Jira durum kategorisine ya da ayrıntılı duruma 0–100 (k × 100). Ayrıntılı durum kategoriden önce gelir. Boşsa yalnız Tamamlandı = 1. İptal edilen madde 0 sayılır.
- **Değerlendirilmemiş testler**: tamamlanınca paydaya girer (varsayılan) ya da GİB yeniden değerlendirene kadar girmez.
- **Olası skorun kapsamı**: bir ya da birden çok planlama kategorisi (varsayılan: Aralık 2026).

**Güncel kalma**: her Jira eşitlemesinde (elle, otomatik ya da asistandan) son eşitleme zamanı, "PoC skoru" ve "Zorunlu açık madde" göstergelerinin günlük ölçümü ve günlük ilerleme ölçümündeki PoC skoru yazılır. Raporlar "Bugün" skorunun hangi tarihteki Jira verisine dayandığını gösterir. Excel yeniden aktarılınca test listesi yenilenir; PY'nin skor ayarları korunur.

**Çıktılar**:
- Dashboard › **PoC skoru ve katkılar**: İlk, Doğrulanmış, Bugün, Olası ve katkı köprüsü. Kategoriye tıklayınca maddeler açılır.
- Rapor otomasyonu › **PoC skoru** bölümü: dört skor, önceki ölçüme göre fark, Jira verisinin tarihi, katkılar, dönemde durumu değişen maddeler.
- **GİB raporu (PPTX)** (PoC bileşeninde): kapak, ilk değerlendirme ve sonuç dağılımı, bugün ve olası skor, başlık bazında kapsam maddeleri, kategoriler ve katkılar, yöntem.

Kontrol değerleri (İlk %40,51 · Doğrulanmış %45,76 · Olası (Aralık 2026) %87,06 · katkılar +6,17 / +3,32 / +3,45) gerçek Excel ile [`utils/gibPoc.control.test.ts`](../utils/gibPoc.control.test.ts) testinde denetlenir:

```bash
GIB_XLSX=/yol/GIB_PoC_Bulgu_Takip_lv.xlsx npx vitest run utils/gibPoc.control.test.ts
```

Kapsam dışı: Başkanlık (TÜBİTAK) gereksinim seti ayrı faza bırakıldı.

## Ekip tahsisi ve Jira

**Ekip ve tahsis → Tahsis tablosu**'nda hücreler AA (adam-ay, 1 = tam zamanlı) ya da **%** olarak girilir. Tablonun üstündeki **Birim** düğmesiyle seçilir; %100, 1 AA'dır. Seçim bu cihazda hatırlanır.

Hücre kapalıysa nedeni projenin başlığında ve hücrenin üzerine gelince yazar:
- **PY başka biri:** Tahsisi yalnız projenin PY'si (ve kişinin bölüm sorumlusu) girer. Rol seçiminde projenin PY'si olan kişiyi seçin ya da proje kartından PY'yi değiştirin. Excel aktarımında PY olarak yeni bir kişi (ör. MKS) açıldıysa, rol seçiminde o kişi seçilmelidir.
- **Plan onaya gönderildi ya da kilitlendi:** Plan değiştirilemez, gerçekleşen girilebilir. Kilidi müdür / PYB sorumlusu açar.

**Jira'dan** düğmeleri (Jira anahtarlı görevleri olan projeler için):
- **Plan (atamalar):** Jira'da birine atanmış açık işlerin kalan eforu (tahmin − harcanan) bugünden termine kadar iş günlerine yayılır. Termin yoksa iş bugünden başlayarak eforu kadar iş gününe yayılır. Sonuç önizlenir; "boş ayları doldur" ya da "üzerine yaz" ile tabloya yazılır.
- **Gerçekleşen (worklog):** Projenin Jira kayıtlarına yazılan worklog'lar kişi × ay saate toplanır ve gerçekleşen AA'ya çevrilir (saat ÷ 8 ÷ ayın iş günü). Aynı Jira projesindeki başka işlere yazılanlar alınmaz. Havuzda olmayan kişiler Veri Havuzu'na eklenir.

## Asistandan

Asistan (sağ alttaki AI düğmesi) bu işleri onaylı öneriyle ya da raporla yapar. Öneriler sohbetteki kartta "Uygula" denmeden uygulanmaz; uygulananlar denetim günlüğüne yazılır ve geri alınabilir.

- **Tahsis aralığı:** "Ayşe'yi Aralık–Mart %50 GİB'e ata" tek kart üretir (yıl geçebilir, en çok 24 ay). Kart her ayın şu anki değerini ve kapasite aşımını gösterir. Aralıktaki bir yılın planı kilitliyse öneri reddedilir.
- **Jira eşitle:** "GİB'i Jira ile eşitle" kartı, Jira'dan alınacak ve Jira'ya yazılacak alanları gösterir. Onaylanınca Planlama › Jira eşitleme'deki "Şimdi eşitle" ile aynı iş çalışır. Uygulamadaki değişiklik geri alınabilir; Jira'ya yazılan değer geri alınmaz.
- **Worklog raporu:** "GİB, ATL ve MPS'nin kasım worklog raporunu getir" proje başına saat ve gün, kişi × proje ve istenirse kayıt, gün ya da hafta kırılımı verir (en çok 92 gün, 10 proje). Uygulama projesi verilirse yalnız o projenin görevlerine bağlı Jira kayıtları sayılır; aynı Jira projesindeki başka işler "kapsam dışı" olarak ayrıca gösterilir. Jira anahtarı (MPS) verilirse Jira projesinin tamamı sayılır. Kaynak Jira worklog'larıdır; Jira Server/DC'de Tempo'nun yazdığı süreler de bunlara dahildir. Tempo'ya özgü alanlar (faturalanabilir süre, hesap) okunmaz.

Jira araçları yalnız Jira bağlıyken sunulur. Jira eşitlemesi ve tahsis önerisi yalnız projenin PY'sine sunulur; worklog raporu, kullanıcının görebildiği projelerle sınırlıdır.

## Ayarları panelden girmek

**Yönetici konsolu → Entegrasyonlar**'da `.env` / `planasistan.env` dosyasındaki Jira, Teams ve e-posta değerleri girilir: Jira adresi, jeton, izinli projeler (`JIRA_ALLOWED_PROJECTS`), Jira'ya yazma / kayıt açma, Teams webhook'u, SMTP. "Jira bağlantısını dene" kaydetmeden jeton sahibini ve erişilen projeleri gösterir.

- Panelde girilen değer dosyadakinin üzerine yazılır; boş alan dosyadakini kullanır. "Paneldekileri sil" ile dosyaya dönülür.
- Jeton, parola ve webhook sunucuda şifreli saklanır (AI ayarlarıyla aynı depo ve `AI_CONFIG_SECRET`), tarayıcıya geri gelmez.
- Kayıttan sonra yeniden başlatmak gerekmez; en geç 30 saniye içinde geçerli olur.
- Masaüstü sürümünde (exe) yönetici anahtarı istenmez; ayarlar `planasistan-veri/integration-settings.json` dosyasına yazılır. Web sürümünde AI bağlantısıyla aynı yönetici anahtarı (`AI_ADMIN_TOKEN`) ve kalıcı depo gerekir.

"MPS projesi bu sunucuda Jira erişimine açık değil" hatası: İzinli projeler alanı (`JIRA_ALLOWED_PROJECTS`) dolu ve MPS listede yok. Alanı `MKS, MPS` yapın ya da boşaltın.

Kod: [`utils/gibFindings.ts`](../utils/gibFindings.ts) (dönüştürücü ve birleştirme), [`components/GibImportModal.tsx`](../components/GibImportModal.tsx) (pencere). Testler: [`utils/gibFindings.test.ts`](../utils/gibFindings.test.ts).
