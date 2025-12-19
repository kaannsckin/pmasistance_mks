diff --git a/README.md b/README.md
index 28e139d83ab025600d669d628d4914d0a852b105..ed2b70686151b9b41d3f3843a9a4bf06277901f0 100644
--- a/README.md
+++ b/README.md
@@ -1,34 +1,75 @@
+# PlanAsistan MKS
 
-# PlanAsistan - Akıllı Proje Planlama Aracı
+PlanAsistan MKS; PERT/Fuzzy PERT planlama, sprint bazlı Kanban yönetimi, ekip ve iş paketi takibi, müşteri istekleri ve günlük notlar için tek sayfalık bir proje asistanıdır. Yapay zekâ destekli analiz ekranı ile görev, kaynak ve not verilerinizi bağlamlı şekilde yorumlamanıza yardımcı olur.
 
-PlanAsistan, PERT ve Bulanık Mantık (Fuzzy PERT) yöntemlerini kullanarak proje görevlerini otomatik olarak planlayan, kaynakları yöneten ve sürüm takvimi oluşturan gelişmiş bir web uygulamasıdır.
+## ✨ Öne Çıkan Özellikler
 
-## 🚀 GitHub Üzerinden Canlı Kullanım (Deployment)
+- **Akıllı planlama ve görünürlük**: PERT temelli görev planlama, kritik yol ve zaman çizelgesi görünümü.
+- **Sprint/kanban panosu**: Sprint sütunları, test periyodu ve sürükle-bırak kartlar.
+- **Görev galerisi**: Durum/etiket filtreleri, hızlı düzenleme ve detay modalı.
+- **Ekip & maliyet yönetimi**: Kaynaklar, ünvan bazlı maliyetler ve kapasite bilgileri.
+- **İş paketleri (work packages)**: Paket bazlı görev gruplanması.
+- **Müşteri istekleri**: Yeni isteklerin kaydı ve görevleştirme akışı.
+- **Notlar ve hatırlatıcılar**: Günlük notlar, etiketli hatırlatıcılar.
+- **Yedekleme/geri yükleme**: JSON olarak dışa aktarma ve içe aktarma.
+- **AI asistanı**: Google Gemini API anahtarıyla proje verilerine dayalı analiz ve öneriler.
+- **PWA desteği**: Manifest + Service Worker ile çevrimdışı kullanım.
 
-Bu uygulamayı GitHub üzerinden canlıya almak ve bir web sitesi gibi kullanmak için şu adımları izleyin:
+## 🧰 Teknoloji Yığını
 
-1.  **GitHub Pages'i Etkinleştirin:**
-    - GitHub deponuzun (repository) üst menüsünden **Settings** sekmesine gidin.
-    - Sol sütundan **Pages** seçeneğine tıklayın.
-    - **Branch** kısmından `main` (veya kodlarınızın olduğu ana dal) seçin ve yanındaki klasörü `/(root)` olarak bırakıp **Save** deyin.
-    
-2.  **Erişim:**
-    - Birkaç dakika sonra sayfanın üstünde "Your site is live at..." şeklinde bir link belirecektir. Uygulamanıza bu link üzerinden her yerden erişebilirsiniz.
+- **React 19 + TypeScript**
+- **Vite** (geliştirme ve build)
+- **Tailwind CSS** (yardımcı sınıf yaklaşımı)
+- **Google Gemini SDK** (`@google/genai`)
 
-## ✨ Temel Özellikler
+## 🚀 Kurulum & Çalıştırma
 
-- **Otomatik Planlama:** PERT algoritması ile görevleri en verimli sürüm (sprint) takvimine yerleştirir.
-- **Kanban Panosu:** Sürüm bazlı, sürükle-bırak destekli görsel görev yönetimi.
-- **Analiz & Zaman Çizelgesi:** Proje bitiş tarihini ve kritik yolu hesaplayan Gantt şeması.
-- **Akıllı Notlar:** `#anımsatıcı` etiketi ile notlarınızdan otomatik hatırlatıcılar oluşturun.
-- **Excel & Jira Desteği:** Verilerinizi Excel veya Jira formatında içe/dışa aktarın.
-- **PWA Desteği:** Bilgisayarınıza veya telefonunuza uygulama olarak yükleyip çevrimdışı kullanabilirsiniz.
+### Gereksinimler
 
-## 🛠️ Yerel Geliştirme
+- Node.js 18+ (önerilir)
+- npm
 
-Projeyi kendi bilgisayarınızda çalıştırmak isterseniz:
-1. Depoyu indirin: `git clone https://github.com/kullaniciadi/depo-adi.git`
-2. Bir web sunucusu ile (örn: VS Code Live Server) `index.html` dosyasını açın.
+### Geliştirme ortamı
 
----
-*Bu proje modern web standartları (ES6+, Tailwind CSS) kullanılarak build işlemine gerek kalmadan çalışacak şekilde tasarlanmıştır.*
+```bash
+npm install
+npm run dev
+```
+
+Vite sunucusu varsayılan olarak `http://localhost:5173` adresinde çalışır.
+
+### Üretim derlemesi
+
+```bash
+npm run build
+npm run preview
+```
+
+## 🔑 AI Asistanı (Google Gemini)
+
+AI sekmesi aktif olduğunda uygulama sizden bir **Gemini API anahtarı** seçmenizi ister. Anahtar seçimi, `window.aistudio` üzerinden yapılır ve güvenli şekilde aktarılır. Yerel geliştirmede gerekiyorsa `.env` içine `API_KEY` tanımlayabilirsiniz.
+
+> Not: Güvenlik ve içerik denetimleri uygulama içinde hem yerel filtrelerle hem de Gemini güvenlik ayarlarıyla desteklenir.
+
+## 💾 Veri Saklama ve Yedekleme
+
+- Tüm veriler **localStorage** üzerinde tutulur.
+- Ayarlar ekranından yerel kayıt açılıp kapatılabilir.
+- Üst menüden **Yedekle / Yükle** ile JSON export/import yapılabilir.
+
+## 📦 Proje Yapısı (Özet)
+
+```
+.
+├── App.tsx
+├── components/
+├── constants.ts
+├── types.ts
+├── sw.js
+├── manifest.json
+└── ...
+```
+
+## 📄 Lisans
+
+Bu proje dahili kullanım için hazırlanmıştır. Lisans bilgisi eklemek isterseniz bu bölümü güncelleyebilirsiniz.
