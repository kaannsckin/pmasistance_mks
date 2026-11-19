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

Excel'deki formül sütunlarının (Sorumlu, Epic, İş Kodu, İlerleme) değerleri dosyada kayıtlı olmayabilir. Bu yüzden aktarım bunları ham girdilerden yeniden hesaplar. Sütunlar başlık adıyla bulunur; yerleri değişse de okunur. Dashboard, EMS Sprintler ve Sayfa1 sayfaları aktarılmaz: bunlar türetilmiş görünümler ya da karalama notlarıdır. Uygulama aynı bilgiyi kendi ekranlarında hesaplar.

Kod: [`utils/gibFindings.ts`](../utils/gibFindings.ts) (dönüştürücü ve birleştirme), [`components/GibImportModal.tsx`](../components/GibImportModal.tsx) (pencere). Testler: [`utils/gibFindings.test.ts`](../utils/gibFindings.test.ts).
