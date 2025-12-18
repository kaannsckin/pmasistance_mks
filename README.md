
# PlanAsistan - Akıllı Proje Planlama Aracı

PlanAsistan, PERT ve Bulanık Mantık (Fuzzy PERT) yöntemlerini kullanarak proje görevlerini otomatik olarak planlayan, kaynakları yöneten ve sürüm takvimi oluşturan gelişmiş bir web uygulamasıdır.

## 🚀 GitHub Üzerinden Canlı Kullanım (Deployment)

Bu uygulamayı GitHub üzerinden canlıya almak ve bir web sitesi gibi kullanmak için şu adımları izleyin:

1.  **GitHub Pages'i Etkinleştirin:**
    - GitHub deponuzun (repository) üst menüsünden **Settings** sekmesine gidin.
    - Sol sütundan **Pages** seçeneğine tıklayın.
    - **Branch** kısmından `main` (veya kodlarınızın olduğu ana dal) seçin ve yanındaki klasörü `/(root)` olarak bırakıp **Save** deyin.
    
2.  **Erişim:**
    - Birkaç dakika sonra sayfanın üstünde "Your site is live at..." şeklinde bir link belirecektir. Uygulamanıza bu link üzerinden her yerden erişebilirsiniz.

## ✨ Temel Özellikler

- **Otomatik Planlama:** PERT algoritması ile görevleri en verimli sürüm (sprint) takvimine yerleştirir.
- **Kanban Panosu:** Sürüm bazlı, sürükle-bırak destekli görsel görev yönetimi.
- **Analiz & Zaman Çizelgesi:** Proje bitiş tarihini ve kritik yolu hesaplayan Gantt şeması.
- **Akıllı Notlar:** `#anımsatıcı` etiketi ile notlarınızdan otomatik hatırlatıcılar oluşturun.
- **Excel & Jira Desteği:** Verilerinizi Excel veya Jira formatında içe/dışa aktarın.
- **PWA Desteği:** Bilgisayarınıza veya telefonunuza uygulama olarak yükleyip çevrimdışı kullanabilirsiniz.

## 🛠️ Yerel Geliştirme

Projeyi kendi bilgisayarınızda çalıştırmak isterseniz:
1. Depoyu indirin: `git clone https://github.com/kullaniciadi/depo-adi.git`
2. Bir web sunucusu ile (örn: VS Code Live Server) `index.html` dosyasını açın.

---
*Bu proje modern web standartları (ES6+, Tailwind CSS) kullanılarak build işlemine gerek kalmadan çalışacak şekilde tasarlanmıştır.*
