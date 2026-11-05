# Cem · Terim sözlüğü ve tutarsızlıklar · 2026-11-04

Kaynak: koşu sırasında `getByRole('heading' | 'tab' | 'button' | 'link' | 'combobox')` adları ve ekran görüntüleri (pilot verisi, 1440×900). ⚠ = tutarsızlık, ✎ = dil/yazım, ? = açıklanmamış kısaltma.

## 1. Gezinme (genel ekranlar)

| Kavram | Modern (kenar çubuğu → sayfa başlığı) | Klasik (üst menü → sayfa başlığı) | Not |
|---|---|---|---|
| Portföy | Portföy → "Portföy" | Portföy → "Proje Portföyü" | |
| Tahsis | Ekip ve tahsis → "Ekip ve tahsis" | Tahsis → "İşgücü Tahsisi" | ⚠ üç ad |
| Takvim | Takvim | Takvim | |
| Risk (portföy geneli) | Risk raporu → "Risk raporu" | **Riskler** → "Risk raporu" | ⚠ düğme ≠ başlık; klasikte proje çubuğunda ikinci bir "Riskler" var |
| Haftalık rapor | Haftalık rapor → "Haftalık rapor" | Haftalık **R**apor → "Haftalık rapor" | büyük/küçük harf |
| Görüşmeler | Görüşmeler → "Müşteri görüşmeleri" | Görüşmeler | ad başlığı tam anlatmıyor |
| Beklentiler | Beklentiler → "Yönetimden beklentiler" | Beklentiler | "müşteri beklentisi" ile karışabilir |
| Veri havuzu | Veri havuzu | Veri **H**avuzu | |
| Yönetim (müdür) | Yönetim | Yönetim | |
| Asistan | Asistan / "Asistan (tam ekran)" | Zekâ / "AI Asistanı aç" | ⚠ |
| Arama | "Ara ⌘K" (Ctrl+K) | "⌘K" | Windows'ta ⌘ simgesi |

## 2. Proje sekmeleri

| Kavram | Modern | Klasik | Not |
|---|---|---|---|
| Açılış ekranı | Genel bakış | Yol Haritası | ⚠ farklı açılış |
| Sürüm panosu | Pano | Pano → başlık "Sürüm Planlama" | ⚠ düğme ≠ başlık |
| Görev listesi | Liste | Görevler → "Görev Listesi (104)" | ⚠ |
| Zaman çizelgesi / yol haritası | Zaman çizelgesi | Yol Haritası | (eşleşme varsayım; modernde açılmadı) |
| Planlama | Planlama | — (Pano'da "Otomatik Planla") | |
| Proje riskleri | Riskler | Riskler → "Risk Kaydı" | ⚠ |
| Ekip | Ekip | Ekip | |
| Hedefler | Diğer › Hedefler | Hedefler | modernde gömülü |
| Müşteri istekleri | Diğer › Müşteri istekleri | İstekler → "Müşteri İstekleri" | ⚠ modernde gömülü (UI-AKS-11) |
| Günlük / notlar | Diğer › Günlük | Günlük → "GÜNLÜK akış" | ✎ karışık büyük harf |
| İş paketleri | Diğer › İş paketleri | İş Paketleri | ? "İP1" kısaltması |
| Durum raporu | Durum raporu → "Haftalık durum raporu" | Durum Raporu → "Haftalık Durum Raporu" | ⚠ "Haftalık rapor" ile karışır (UI-AKS-08) |
| Yönetime durum notu | Genel bakış › "Haftalık durum" | Portföy kartı › "Haftalık Durum" | ⚠ üçüncü "haftalık" |

## 3. Görev alanları ve değerleri

| Kavram | Modern | Klasik | Not |
|---|---|---|---|
| Durum değerleri | Bekleyen / Yapılacak / Süreçte / Tamamlandı | Formda **Backlog / ToDo / InProgress / Done**; süzgeçte Backlog / Yapılacak / Süreçte / Tamamlandı; Pano'da "HAVUZ • BACKLOG" | ⚠ ✎ İngilizce, "Backlog" = "Bekleyen" = "Havuz" |
| Öncelik | Engelleyici / Yüksek / Orta / Düşük | Formda Blocker / High / Medium / Low; kartta **MEDİUM / HİGH / LOW** | ⚠ ✎ İngilizce + Türkçe büyük harf (İ) |
| Kayıt türü | Kayıt türü (Hata, Yeni özellik, İyileştirme, Görev, Diğer) | yok; Pano'da "TASK" | ⚠ |
| Sorumlu kişi | Sorumlu (form) / Atanan (liste) / "Herkes" (süzgeç) | Atanan Kişi (havuzdan) / Kaynak Adı / "Tüm Kaynak **Adıler**" | ⚠ ✎ üç ad, hatalı çoğul |
| Sürüm | Sürüm 13; "Havuz" | v10 (kart), SÜRÜM 1 (Pano), "1" (form, sayı kutusu) | ⚠ |
| Termin | Termin (form) / Bitiş (liste sütunu) / "Yaklaşan terminler" (aslında gecikenler) | **yok** (UI-AKS-06) | ⚠ |
| Süre tahmini | En iyi / Olası / En kötü | En İyi / **Ortalama** / En Kötü | ⚠ "Olası" ≠ "Ortalama" |
| Birim | Birim: U310 | Birim: U310 | ? kod |
| Jira | "Jira kayıt no" | "Jira Kayıt No"; "Jira Billed Hours" (Tahsis) | ✎ İngilizce düğme |
| Görev numarası | PSL-75 · U330; yeni görevde numara yok | PSL-1 | |

## 4. Tahsis ve kapasite

| Kavram | Modern | Klasik | Not |
|---|---|---|---|
| Örgüt birimi süzgeci | "Tüm birimler" (U300…U340) | "Tüm Bölümler" (Tahsis), "Tüm Birimler" (Görevler) | ⚠ "bölüm" ↔ "birim"; rol adı "Bölüm sorumlusu" (UI-AKS-09) |
| Birim adları | yalnız Veri havuzunda: "U310 — Yazılım Geliştirme" | aynı | ⚠ |
| Bölüm özeti sütunu | "Bölüm" (satırlar kod) | "Bölüm Özeti" | |
| Aşırı tahsis | Portföy "34 aşırı tahsis (kişi-ay)"; Doluluk "Kapasite aşımı 9 kişi"; Bölüm özeti "37 aşırı tahsis" | "37 aşırı tahsis" | ⚠ sayılar (UI-AKS-04) |
| Görünümler | Görünüm: Doluluk, Tahsis tablosu, Kişi özeti, Bölüm özeti, Proje özeti; **Araçlar**: Uygun kişi bul, Kapasite–talep, Öngörü, Senaryo | Tahsis Tablosu, Kişi Özeti, Bölüm Özeti, Proje Özeti, Doluluk, Uygun Kişi, Kapasite-Talep, Öngörü, Senaryo (hepsi aynı sırada sekme) | ⚠ modernde ikiye bölünmüş |
| Veri türü | Plan / Gerçekleşen / Karşılaştır | Plan / Gerçekleşen / Karşılaştır | ✓ |
| Birim | %, "AA" | "AA", "Adam/Ay Planı" | ? AA |
| Ondalık | 0,7 / 0,5 | hücrede 0.8, toplamda 9,44 | ⚠ |
| Kişi ünvanı | "Ünvan" (Veri havuzu) | aynı | ✎ TDK: "unvan" |
| Müdürün adı | rol "Müdür"; ünvan "Birim Yöneticisi" | aynı | ⚠ |

## 5. Haftalık rapor akışı

| Kavram | Görünen ad | Not |
|---|---|---|
| Durumlar | Yazılmadı → Taslak → Bölüm sorumlusunda → PYB destekte → (Yayınlandı); İade edildi · Taslak | ? PYB |
| Eylemler | Madde ekle, Plan ekle, Kaydet, Bölüm sorumlusuna gönder, İade et, Onayla, PYB desteğe gönder | ✓ tutarlı |
| Bölümler | Bu hafta gelişmeler, Gelecek hafta planlanan, Proje sağlığı puanı, Kısaltmalar, Format denetimi, AI önerisi, Kaynaklar | ✎ "Bu hafta gelişmeler" (Bu haftaki gelişmeler) |
| Selin sekmeleri | Onay bekleyen / Bölüm durumu / Bölüm raporu | ✓ |
| Madde türleri | … "Toplantı, sunum, tanıtım (İG / müşteri)" … | ? İG |
| Hafta | "45. hafta · 2–6 Kas" (modern ve klasik bu ekranda aynı) / Durum raporunda "Hafta 45/2026" | |
| Müdür ekranı | "Enstitü genelinde bu haftanın…" + 41. hafta | ⚠ (UI-AKS-07) |

## 6. Proje durumu ve sağlık

| Kavram | Modern | Klasik | Not |
|---|---|---|---|
| RAG | Yolunda / Riskli / Kritik | Yolunda / Riskli / Kritik (renkli noktalar) | ✓ |
| Proje durumu | Devam eden / Beklemede / Tamamlanan (süzgeç); YILDIZ "beklemede" sayılıyor | Devam Eden / **Teklif Aşaması** / Beklemede / Tamamlandı | ⚠ "Teklif aşaması" modernde yok |
| Sağlık | "Proje sağlığı 35 · Sorunlu · Takvim gerisinde (SPI 0,79)" | — | ? SPI; "Sorunlu" ≠ "Riskli" rozeti |
| Özet kart | "Dikkat isteyen proje" | "Riskli Proje" | |
| Uyarı listesi | "Dikkat gerektirenler" | zil rozeti (7) | |

## 7. Açıklanmamış kısaltmalar ve kodlar

| Kısaltma | Nerede | Açılımı ekranda var mı |
|---|---|---|
| SPI | Proje sağlığı kartı | hayır |
| PYB | Haftalık rapor rehberi, "PYB desteğe gönder", "Sonraki aşama: PYB destekte" | hayır |
| İG | Madde türü "Toplantı, sunum, tanıtım (İG / müşteri)", "İG görüşmeleri" | hayır |
| İP / İP1 | Görev formu "İş paketi" açılır listesi, klasik "Personel / İP / Rol" | dolaylı ("İş paketi" etiketi) |
| AA | "0,9 AA", "Plan Σ 63,13 AA" | dolaylı ("Adam/ay planı" başlığı) |
| U300…U340 | Birim süzgeçleri, görev kartları | yalnız Veri havuzunda |
| OKR | Klasik "Stratejik Hedef (OKR)" | hayır |
| KYS | İade penceresi örnek metni | hayır (örnek kendisi "açın" diyor) |
| 0,7/0,5 | Aşırı tahsis şeridi | hayır (tahsis/kapasite) |
| MKS | "MKS çalışma alanı", "MKS SİSTEMİ" | hayır |

## 8. Dil karışımı (Türkçe/İngilizce) özet

Backlog, ToDo, InProgress, Done, Blocker, High, Medium, Low, TASK, Jira Billed Hours, Worklog, TODO (Günlük), "AI önerisi", "Excel/CSV". İlk dört grup (durum/öncelik) klasik arayüzün kendi değer adları; modern aynı değerleri Türkçe gösteriyor.
