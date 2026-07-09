
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

---
*Sürüm 2.x — Çoklu proje, veri havuzu, işgücü tahsisi ve yönetim ekranı; React 19 + Vite + TypeScript.*
