
# PlanAsistan - Akıllı Proje, Program ve Portföy Yönetim Aracı

PlanAsistan; PERT ve Bulanık Mantık (Fuzzy PERT) yöntemleriyle proje görevlerini otomatik planlayan, birden fazla projeyi tek çalışma alanında yöneten, işgücü (adam/ay) tahsisini planlayıp gerçekleşmeyle kıyaslayan ve üst yönetime rol bazlı dashboard sunan gelişmiş bir web uygulamasıdır.

## ✨ Temel Özellikler

### Proje Yönetimi
- **Otomatik Planlama:** Topolojik liste çizelgeleme + kritik zincir önceliklendirmesi ile görevleri en verimli sürüm (sprint) takvimine yerleştirir; termin (EDD) ve kapasite farkındalıklı.
- **Kanban Panosu:** Sürüm bazlı, sürükle-bırak destekli görsel görev yönetimi; plan uyarıları (aşırı büyük görev, öncül döngüsü) banner ile gösterilir.
- **Analiz & Zaman Çizelgesi:** Proje bitiş tarihini ve kritik yolu hesaplayan Gantt şeması.
- **OKR / Hedefler, Haftalık Notlar, Müşteri İstekleri**

### Program / Portföy Yönetimi
- **Çoklu Proje Çalışma Alanı:** Portföy ekranında proje kartları; durum (Devam Eden / Teklif / Beklemede / Tamamlandı), haftalık RAG durumu (Yolunda / Riskli / Kritik) ve durum notu.
- **Veri Havuzu:** Personel (sicil, bölüm, ünvan, kullanılabilir AA, roller), bölümler, rol kataloğu ve ünvan sözlüğü — tek merkezden yönetilir.
- **İşgücü Tahsisi (Adam/Ay):** Kişi × proje × iş paketi × rol × yıl bazında aylık Plan ve Gerçekleşen girişi; Plan/Gerçekleşen/Karşılaştırma modları; kişi-ay bazlı **aşırı tahsis uyarıları**; kişi/bölüm/proje özet tabloları.
- **Onaylı Plan Kilidi:** Taslak → Onaya Gönder → Onayla & Kilitle / Reddet akışı; kilitli planda yalnızca gerçekleşen girilebilir.
- **Excel Entegrasyonu:** "İşgücü Tahsisi" formatındaki Excel dosyaları (Personel Listesi, Bölümler, Roller, Ünvanlar, Projeler, İş Paketleri, Veri Girişi Plan+Gerçekleşen) tek tıkla içe aktarılır; mükerrer kayıt oluşturmaz, günceller.

### Üst Yönetim
- **Yönetim Ekranı (Dashboard):** Portföy KPI'ları, RAG dağılımı, aylık Plan vs Gerçekleşen grafiği (kapasite çizgisiyle), bölüm bazlı AA dağılımı, aşırı tahsis listesi ve proje durum tablosu.
- **Rol Bazlı Yetkilendirme:** Müdür / PYB Sorumlusu / PYB Destek / Proje Yöneticisi / Bölüm Sorumlusu rolleri. Yönetici rolleri girdi yapamaz ve PM'e özel ekranları (Günlük, İstekler, Zekâ) göremez; veri havuzunu yalnızca PYB Destek düzenler.
- **Yönetici Paketi:** Tek tıkla çok sayfalı Excel raporu (Özet, Projeler, Aylık Plan-Gerçekleşen, Bölüm/Kişi AA, Aşırı Tahsis).

### Genel
- **Baseline & Plan Kayması:** Plan onaylandığında portföyün anlık görüntüsü otomatik alınır ("onaylanan plan = baseline"); yönetim ekranı baseline'a göre plan kaymasını (Δ) proje bazında gösterir. Manuel anlık görüntü de alınabilir.
- **Bulut Senkronizasyonu (opsiyonel, ücretsiz):** Supabase ile e-posta girişli çok kullanıcılı çalışma; yerel-öncelikli (çevrimdışı çalışmaya devam eder), sürüm kontrollü (kimsenin verisi sessizce ezilmez). Notlar ve müşteri istekleri sunucuda ayrı tabloda tutulur — **yönetici rolleri bu veriyi veritabanı politikası (RLS) gereği okuyamaz**. Kurulum: [`supabase/KURULUM.md`](./supabase/KURULUM.md) (~10 dk).
- **Excel & Jira Desteği:** Görev verilerini Excel/Jira formatında içe/dışa aktarma.
- **PWA Desteği:** Uygulama olarak yüklenip çevrimdışı kullanılabilir; veriler tarayıcıda saklanır, JSON yedeği alınabilir (eski tek proje yedekleri de içe aktarılabilir).

## 🛠️ Yerel Geliştirme

```bash
npm install
npm run dev      # http://localhost:3000
npm run test     # birim testleri (vitest)
npm run build    # üretim derlemesi (dist/)
```

## 🚀 Yayınlama

- **Vercel:** Depoyu Vercel'e bağlamak yeterli — `vite build` otomatik çalışır.
- **GitHub Pages:** `npm run build` sonrası `dist/` klasörünü Pages'e yayınlayın.

## 🗺️ Yol Haritası

**Tamamlananlar:** Sprint planlayıcı yeniden yazımı (topolojik çizelgeleme, döngü güvenliği, termin/kritik zincir farkındalığı) · Çoklu proje çalışma alanı + portföy ekranı · Veri havuzu + U310 Excel içe aktarma · İşgücü tahsisi (Plan/Gerçekleşen/Karşılaştırma, aşırı tahsis uyarıları) · Onaylı plan kilidi · Üst yönetim ekranı + rol bazlı yetkilendirme · Yönetici Paketi (Excel) · Baseline & plan kayması · Supabase bulut senkronizasyonu (RLS ile not gizliliği) · İki katmanlı navigasyon (çalışma alanı ↔ proje bağlam çubuğu) · **Rol bazlı kapasite-talep analizi** (Tahsis → Kapasite-Talep sekmesi: bölüm × rol bazında Planlı-Proje / Kaynak-İşgücü / İhtiyaç-Teklif / Personel Açığı; işe alım ihtiyacı göstergesi; yönetici paketinde ayrı sayfa) · **PowerPoint yönetici paketi** (kapak, KPI panosu, plan-gerçekleşen grafiği, portföy tablosu, bölüm dağılımı, kaynak sağlığı — tek tıkla .pptx) · **Aylık otomatik baseline** (ayın ilk açılışında portföy fotoğrafı kendiliğinden alınır) · **Maliyet katmanı** (tahsis × ünvan aylık maliyeti → proje/bölüm ₺ plan-gerçekleşen; Yönetim kartı + Excel/PPT sayfası) · **Görev→Tahsis köprüsü** (sprint planındaki görev eforlarını aylık AA önerisine çevirir; boş ay doldur / üzerine yaz) · **Yapılacaklar paneli** (header zili: role göre onay bekleyen plan, girilmemiş gerçekleşen, geciken görev, kritik RAG, aşırı tahsis, havuz eksikleri) · **Kişi sayfası** (Veri Havuzu'nda profil düğmesi: bir kişinin tüm projelerdeki aylık doluluğu, kapasite aşımı, proje dağılımı, çapraz görevleri ve rolleri tek ekranda) · **Risk kaydı** (proje bağlam çubuğunda Riskler sekmesi: 5×5 olasılık×etki matrisi, sahibi/aksiyon/durum; Yönetim ekranında portföy geneli en kritik riskler; Excel/PPT'de risk sayfası)

**Backlog (Supabase kurulumu tamamlanınca):**
1. **Supabase Realtime:** Ekip üyelerinin değişikliklerini sayfa yenilemeden anlık görme; hücre bazlı canlı eşzamanlılık.
2. **Normalize veritabanı şeması:** Tahsis/görev verilerinin ayrı tablolara açılması → alan bazlı yazma RBAC'ının sunucu tarafında zorlanması ve çakışmasız eşzamanlı düzenleme.
3. Supabase kurulum doğrulaması (`supabase/dogrula.mjs` — anahtar/URL hazır, çalıştırılması bekliyor).

---
*Sürüm 2.x — Çoklu proje, veri havuzu, işgücü tahsisi ve yönetim ekranı; React 19 + Vite + TypeScript.*
