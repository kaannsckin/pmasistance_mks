# Tolga · denenen saldırılar · 2026-11-04 (Tur 1)

Sonuç: **dayandı** / **bozuldu** (→ bulgu) / **not** (Kısa notlar). Betik numarası `betik/NN-*.mjs`, ölçüm `konsol/NN-*.json`.

## Veri

| # | Saldırı | Betik | Sonuç |
|---|---|---|---|
| V1 | `aşırı` veri üretimi ve açılış (67 proje, 1490 görev, NEHİR 620, 200 kişi, 7 bölüm, 387 tahsis, 56 rapor, 22 görevsiz proje) | `veri/uret.mjs`, 01 | dayandı |
| V2 | Proje/kişi adında 200 karakter, 80 karakter boşluksuz kelime, `İıĞğŞş…`, `istanbul/İSTANBUL`, emoji, RTL, sıfır genişlikli boşluk | 01, 12, 18 | dayandı (taşmalar: UI-KRC-10, -12) |
| V3 | `<b>`, `<img onerror>`, `<script>`, `**md**`, `[x](javascript:alert(1))`: Portföy, Liste, Pano, Hedefler, Risk raporu, Beklentiler, Haftalık rapor, klasik Görevler/Pano/Tahsis | 01, 12, 18, 19 | dayandı (diyalog 0, `javascript:` bağlantısı 0, `[onerror]` 0) |
| V4 | Sayılar: süre 0/negatif/99999/ondalık, en iyi > en kötü, AA 0/0,0001/1,5/99, katılım %250/−10, maliyet 0/999999999999 | 01, 12 | dayandı (görüntüde çökme yok) |
| V5 | Tarihler: 1900-01-01, 1970, 2028-02-29, 2199-12-31, başlangıcından önce biten görev, proje başlangıcı 1999 | 01, 12 | dayandı ("46327 gün gecikti" doğru hesap) |
| V6 | `bos` (0 proje) · müdür + PY · modern + klasik · 9–11 ekran | 20 | dayandı |
| V7 | `bos-tahsis` (projeler var; tahsis/izin/rapor/yayın yok) · 10 ekran | 20 | dayandı |

## Hoyrat etkileşim

| # | Saldırı | Betik | Sonuç |
|---|---|---|---|
| H1 | Modern "Görevi ekle"ye çift tık / üçlü tık / Enter×2 / 80 ms arayla iki tık → depo + yenileme | 03 | dayandı (her biri 1 kayıt) |
| H2 | Klasik "Kaydet"e çift tık / üçlü tık | 14 | dayandı |
| H3 | Görev formu boş adla ekle | 03 | dayandı (mesaj var) |
| H4 | Görev formu: doldur → Esc → yeniden aç | 03 | **bozuldu** UI-KRC-09 |
| H5 | Görev formu: doldur → arka plana tık | 03 | **bozuldu** UI-KRC-09 |
| H6 | Görev formu + Ctrl+K paleti + tek Esc | 15, 16 | **bozuldu** UI-KRC-09 |
| H7 | Görev formu: ondalık süre klavyeyle (`1,5`, `2.5`, `0.5`), `-5`, `1e12` | 03, 04, 14 | **bozuldu** UI-KRC-05 |
| H8 | Görev formu açıkken pencere 1440 → 375 → 1440 | 15 | dayandı (yazılan korunuyor) |
| H9 | Klasik görev kartı çöp kutusuna çift tık (onaylar kabul) | 16, 19 | **bozuldu** UI-KRC-03 |
| H10 | Modern görev işlemler › Sil (onay kabul) | 16 | dayandı (1 görev; onay metni genel) |
| H11 | Haftalık rapor: madde yaz → kaydetmeden yenile | 06 (×3) | **bozuldu** UI-KRC-04 |
| H12 | Haftalık rapor: madde yaz → "Haftalık raporlar" bağlantısı | 06 | dayandı (onay soruyor, iptalde yazı korunuyor) |
| H13 | Haftalık rapor: madde yaz → kenar çubuğu "Portföy" | 07 (×2) | **bozuldu** UI-KRC-04 |
| H14 | Haftalık rapor: madde yaz → tarayıcı geri | 06 (×2) | **bozuldu** UI-KRC-04 (about:blank) |
| H15 | Haftalık rapor: "Kaydet"e çift tık | 06 | dayandı (1 rapor, tarihçe `create`) |
| H16 | Haftalık rapor: "Bölüm sorumlusuna gönder"e çift tık | 07 | dayandı (tek `submit`, aşama `bs_review`) |
| H17 | Haftalık rapor: kısaltma içeren madde ile gönder | 06 | dayandı (format denetimi engelliyor) |
| H18 | Aşırı 44. hafta taslağı (46 madde, uzun kelime, HTML) | 18 | dayandı (taşma yok) |
| H19 | Hızlı gezinme: 20 geçiş × 100 ms, modern + klasik, aşırı veri | 15 | dayandı (ilk denemede Haftalık rapor rehberi tıkları kesti: beklenen kalıcı pencere) |
| H20 | Aynı çalışma alanı iki sekmede: görev + rapor | 11 (×2) | **bozuldu** UI-KRC-02 |
| H21 | "Taslak öner"e çift tık (AI 3 sn gecikip 500 döner), yüklenirken başka ekrana geçiş | 23 | dayandı (düğme kilitli, hata mesajı var) |
| H22 | Yedekten yükle: bozuk JSON metni | 21 | dayandı (mesaj) |
| H23 | Yedekten yükle: `people:null`, `allocations:"x"` | 21 | **bozuldu** (sessiz başarısızlık, UI-KRC-08 içinde) |
| H24 | Yedekten yükle: görev öğeleri bozuk çalışma alanı (`[{}, {name:null}, "x"]`) | 21 | dayandı (onaylı yükleme, çökme yok) |
| H25 | Yedekten yükle: `{"name","tasks":[{}]}` (küçültme: `{"name"}`, `{"tasks":[]}`, `{"name","tasks":[]}`) | 21, 22 | **bozuldu** UI-KRC-06 (yalnız `tasks:[{}]`) |

## Ortam bozma

| # | Saldırı | Betik | Sonuç |
|---|---|---|---|
| O1 | Servis çalışanı / önbellek denetimi, çevrimdışı yenileme | 08 | **bozuldu** UI-KRC-07 |
| O2 | Hiç ziyaret edilmemişken çevrimdışı açılış | 08 | beklenen (tarayıcı hata sayfası) |
| O3 | `meta` yok / metin / null | 09 | **bozuldu** UI-KRC-01 |
| O4 | `meta.format` = 99 / 2 | 09, 10 (×2), 20 | **bozuldu** UI-KRC-01 |
| O5 | `meta.workspace` yok | 09 | dayandı (projeler açılıyor, kişiler boş) |
| O6 | `meta.workspace.people=null`, `allocations="x"` | 09, 24 | **bozuldu** UI-KRC-08 |
| O7 | `projectIds` içinde kaydı olmayan proje | 09 | not (uyarısız düşüyor) |
| O8 | Proje kaydında `tasks` yok | 09 | not (uyarısız gizleniyor) |
| O9 | Görevlerin yarısında `time:null`, `status:"Yok"`, `name:null` | 09 | dayandı (açılış) |
| O10 | Veritabanı sürüm 7, `workspace` deposu yok | 09b | not (örnek çalışma alanı + localStorage) |
| O11 | Yalnız localStorage engelli | 09b | dayandı |
| O12 | `indexedDB` yok · `indexedDB.open` hata atıyor | 09b | dayandı (localStorage'a geçiyor) |
| O13 | localStorage + IndexedDB ikisi de `SecurityError` (çerez engeli) | 10 (×2) | **bozuldu** UI-KRC-08 |
| O14 | Saat: 2026-12-28, 2026-12-31 23:59:30, 2027-01-01, 2027-01-04; hafta seçici ileri/geri; 1 Ocak'ta rapor kaydı | 17 | dayandı (`2026-W53`) |
| O15 | Yavaş/bozuk ağ: `/api/**` 3 sn gecikme + 500 | 23 | dayandı |

## Taşma (aşırı veri)

| # | Ekran | Betik | Sonuç |
|---|---|---|---|
| T1 | Modern Portföy (müdür, 67 proje; PY, 10 proje) | 01, 12 | dayandı (üç noktayla kesiliyor) |
| T2 | Modern NEHİR Genel bakış, Riskler, Ekip | 12 | dayandı |
| T3 | Modern NEHİR Liste | 12, 18 | **bozuldu** UI-KRC-10 |
| T4 | Modern NEHİR Pano | 12, 24 | **bozuldu** UI-KRC-10, UI-KRC-12 |
| T5 | Modern NEHİR Zaman çizelgesi | 12 | dayandı (kaydırılabilir kap içinde) |
| T6 | Modern Ekip ve tahsis (200 kişi) | 12 | **bozuldu** UI-KRC-10 |
| T7 | Klasik üst çubuk (pilot ve aşırı) | 12, 13, 19 | **bozuldu** UI-KRC-11 |
| T8 | Klasik Görevler, Pano (20700 px iç pano, kaydırmalı), Tahsis | 19 | dayandı (üst çubuk dışında) |
| T9 | Haftalık rapor 44. hafta aşırı | 18 | dayandı |
