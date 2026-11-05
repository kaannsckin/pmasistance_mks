# Cem · İşler ve sesli düşünme günlüğü · 2026-11-04

Her adım üç satır: **Arıyorum** → **Buldum** → **Beklentimle aynı mı**. Ölçümler: tıklama (yazma hariç), yanlış tıklama, geri dönüş, süre. Süreler insan hızıyla **tahmindir** (okuma + tıklama); betiklerin makine süresi parantez içinde. Ekran görüntüleri `ekran/` altında.

## 0. İlk açılış ve 5 saniye testleri

| Ekran | 5 sn tahminim (ekrana bakarak) | Doğru mu? |
|---|---|---|
| Modern Portföy (Burak) | "Projelerimin özeti; birincil eylem Yeni proje." | Kısmen. Özet kartları benim 2 projem, ama "Dikkat gerektirenler" başkalarının projeleri (UI-AKS-03). PY için birincil eylem "Yeni proje" değil, projeme girmek. |
| Modern Proje Genel bakış | "Projenin sağlık özeti; birincil eylem Yeni görev." | Evet. "SPI 0,79" açıklamasız; "Yaklaşan terminler" aslında gecikenler. |
| Modern Haftalık rapor listesi (PY) | "Projelerimin bu haftaki raporları; satıra tıklayıp yazacağım." | Evet (önce 7 adımlı rehber araya giriyor). |
| Modern Haftalık rapor yazma | "Raporu yaz; birincil eylem Bölüm sorumlusuna gönder." | Evet; düğme pasifken altında nedeni yazıyor ("1 format hatası…, puan verilmedi"). İyi. |
| Modern Haftalık rapor (Selin) | "Onay bekleyen raporlar; satırı açıp onayla/iade et." | Evet. |
| Modern Ekip ve tahsis (Selin) | "Herkesin aylık doluluğu; kırmızılar aşım." | Evet, ama "benim bölümüm" yok (UI-AKS-09). |
| Modern Portföy (Ahmet) | "Tüm projelerin sağlığı; dikkat gerektirenler." | Evet; tek eylem gerektiren madde (plan onayı) gizli. |
| Modern Haftalık rapor (Ahmet) | "Bu haftanın enstitü raporu." | **Hayır**: 41. hafta (22 gün önce) açık (UI-AKS-07). |
| Klasik Portföy (Burak) | "Proje kartları; her kartta 'Aç'." | Evet. Kartta "Projeyi sil" ve "Proje Yön." değiştirme aynı yerde, ürkütücü. |
| Klasik Görevler | "Görev kartları; birincil eylem Yeni Görev." | Evet; beş renkli düğme (CSV/Jira/Excel/Dışa Aktar/Yeni Görev) yan yana, hangisi birincil diye bir an duraksadım. |
| Klasik Tahsis (Selin) | "Proje proje tahsis tablosu." | Evet; doluluk için ayrı sekmeye geçmek gerekiyor. |

---

## İş 1 · PY (burak): projeyi aç, görev ekle

### Modern
1. **Arıyorum:** projemi. → **Buldum:** kenar çubuğunda "PUSULA Saha Mobil… 28". → **Aynı mı:** evet.
2. **Arıyorum:** görev ekleme. → **Buldum:** sağ üstte mavi "Yeni görev". → **Aynı mı:** evet, ilk bakışta.
3. **Arıyorum:** zorunlu alanlar. → **Buldum:** uzun form; "Sürüm: Sürüm 1", "Birim: U310", "Termin: mm/dd/yyyy". → **Aynı mı:** hayır; şu anki sürüm 13 iken neden 1? "Birim U310" ne?
4. **Arıyorum:** kaydet. → **Buldum:** "Görevi ekle". → **Aynı mı:** evet.
5. **Arıyorum:** "eklendi" işareti. → **Buldum:** hiçbir şey; pencere kapandı. "Şu anki sürüm" kartı "Sürüm 1 · 287 gün geride" oldu. → **Aynı mı:** **hayır** (UI-AKS-01, UI-AKS-05).
6. **Arıyorum:** görevimi. → **Buldum:** "Liste" sekmesi → "Yapılacak" grubunun en altı; numarasız. → **Aynı mı:** hayır, aramak zorunda kaldım.

Ölçüm: 3 tıklama + doğrulama için 1 tıklama ve kaydırma · yanlış tıklama 0 · geri dönüş 1 (Genel bakış → Liste) · ~1 dk 30 sn (betik 6,0 sn). **Sonuç: zorlandı.**

### Klasik
1. **Arıyorum:** projemi. → **Buldum:** Portföy kartında "Aç". → **Aynı mı:** evet. Açılan ekran "Yol Haritası"; görev eklemeyi orada da görüyorum ama "Görevler" sekmesine geçtim.
2. **Arıyorum:** görev ekleme. → **Buldum:** "Görev Listesi (104)" yanında mavi "Yeni Görev" (yanında CSV/Jira/Excel/Dışa Aktar). → **Aynı mı:** evet.
3. **Arıyorum:** form. → **Buldum:** pencerenin üstü başlık çubuğunun altında kalmış, başlık ve kapat düğmesi görünmüyor; Öncelik "Medium", Durum "ToDo", Sürüm "1"; **termin alanı yok**. → **Aynı mı:** hayır (UI-AKS-06, UI-AKS-10; görünüm → Deniz).
4. **Arıyorum:** kaydet. → **Buldum:** "Kaydet". → **Aynı mı:** evet.
5. **Arıyorum:** "eklendi" işareti. → **Buldum:** başlık "Görev Listesi (105)"; görev 105 kartın sonuncusu. Pano'da tek başına "SÜRÜM 1 (01.01.2026–21.01.2026)" sütununda. → **Aynı mı:** hayır.

Ölçüm: 4 tıklama + doğrulama için 1 tıklama ve uzun kaydırma · yanlış tıklama 0 · geri dönüş 1 · ~2 dk. **Sonuç: zorlandı.**

### Karşılaştırma
| | Modern | Klasik |
|---|---|---|
| Tıklama (ekleme) | 3 | 4 |
| Termin girilebiliyor | evet | **hayır** |
| Varsayılan sürüm | Sürüm 1 (geçmiş) | 1 (geçmiş) |
| Kayıt geri bildirimi | yok (sayaç) | yok (sayaç) |
| Dil | Türkçe | İngilizce enum değerleri |

---

## İş 2 · PY (burak): haftalık raporu yaz ve gönder

### Modern
1. **Arıyorum:** haftalık rapor. → **Buldum:** kenar çubuğunda "Haftalık rapor 2" (rozetli). → **Aynı mı:** evet. (Proje sayfasındaki "Durum raporu" da aday görünüyordu; UI-AKS-08.)
2. **Arıyorum:** listem. → **Buldum:** önce 7 adımlı "Haftalık rapor rehberi" açıldı; "Rehberi kapat". → **Aynı mı:** sabırsız biri için bir engel; ama kapatması kolay.
3. **Arıyorum:** PUSULA raporu. → **Buldum:** "PUSULA … Yazılmadı" satırı; sarı şerit "Son gün: 5 Kasım Perşembe — 2 proje raporu henüz gönderilmedi". → **Aynı mı:** evet, çok net.
4. **Arıyorum:** gelişme yazma. → **Buldum:** "Madde ekle" → 10 tür (İG açıklamasız) → "Tamamlanan aşamalar / kabuller"; metin kutusunda örnek ipucu. → **Aynı mı:** evet.
5. **Arıyorum:** plan. → **Buldum:** "Plan ekle". → **Aynı mı:** evet.
6. **Arıyorum:** puan. → **Buldum:** 1–10 düğmeleri; "7". → **Aynı mı:** evet. Format denetimi "Uygun" oldu, alt şerit "Sonraki aşama: Bölüm sorumlusunda".
7. **Arıyorum:** kaydet. → **Buldum:** "Kaydet" → başlıkta "Kaydedildi." → **Aynı mı:** evet.
8. **Arıyorum:** gönder. → **Buldum:** "Bölüm sorumlusuna gönder" → listeye döndü, yeşil "Bölüm sorumlusuna gönderildi.", satır rozeti "Bölüm sorumlusunda", şerit "1 proje raporu…". → **Aynı mı:** evet, tam istediğim gibi.

Ölçüm: 9 tıklama (rehber kapatma dahil) · yanlış tıklama 0 · geri dönüş 0 · ~3 dk (betik 11,2 sn). **Sonuç: tamamlandı.**

### Klasik
Üst menüde "Haftalık Rapor" → aynı rehber → aynı bileşen. Adımlar ve geri bildirim modernle bire bir aynı; tek fark: sağ alttaki mor AI düğmesi "Bölüm sorumlusuna gönder" düğmesinin sağ ucunu örtüyor (→ Deniz). Ölçüm: 9 tıklama · 0 · 0 · ~3 dk. **Sonuç: tamamlandı.**

---

## İş 3 · Bölüm sorumlusu (selin): raporu iade et / onayla

### Modern (iade)
1. **Arıyorum:** onay bekleyenler. → **Buldum:** "Haftalık rapor 1" → rehber → "Onay bekleyen 1" sekmesi seçili, PUSULA satırı. → **Aynı mı:** evet.
2. **Arıyorum:** raporu okumak. → **Buldum:** aynı editör, durum "Bölüm sorumlusunda"; alt şeritte "İade et · Kaydet · Onayla, PYB desteğe gönder". → **Aynı mı:** evet. (PYB açılmıyor.)
3. **Arıyorum:** iade. → **Buldum:** "İade et" → "Raporu iade et" penceresi; gerekçe yazılmadan düğme pasif. → **Aynı mı:** evet, iyi.
4. **Arıyorum:** sonuç. → **Buldum:** "Rapor iade edildi.", "Onay bekleyen 0". Burak'ta satır "İade edildi · Taslak", raporun başında "İade edildi — Selin Kaya" ve gerekçe. → **Aynı mı:** evet.

Ölçüm: 5 tıklama · 0 · 0 · ~1 dk 30 sn. **Sonuç: tamamlandı.** (Burak'ın bunu Portföy'de fark etmesi zor: UI-AKS-03.)

### Klasik (onay)
Üst menü "Haftalık Rapor" → rehber → satır → "Onayla, PYB desteğe gönder" → "Onaylandı, PYB desteğe gönderildi." Onay penceresi/geri al yok; onaylanan rapor "Onay bekleyen"den kayboluyor (Bölüm durumu sekmesinde izlenebilir). Ölçüm: 4 tıklama · 0 · 0 · ~1 dk. **Sonuç: tamamlandı.**

---

## İş 4 · Bölüm sorumlusu (selin): bölümün doluluğunu oku, aşırı tahsisi bul

### Modern
1. **Arıyorum:** doluluk. → **Buldum:** "Ekip ve tahsis" → "Doluluk" (varsayılan), 24 kişi, ısı haritası. → **Aynı mı:** kısmen; bölümüm değil herkes.
2. **Arıyorum:** aşırı tahsisliler. → **Buldum:** "Kapasite aşımı 9 · kişi en az bir ayda aşımda" kartı; tıkladım, bir şey olmadı. → **Aynı mı:** hayır (1 yanlış tıklama).
3. **Arıyorum:** bölümüm. → **Buldum:** "Birim" süzgeci: U300…U340. Hangisi benim? → Veri havuzu'na gidip "U310 — Yazılım Geliştirme"yi öğrendim. → **Aynı mı:** hayır (1 geri dönüş).
4. **Arıyorum:** bölüm toplamı. → **Buldum:** Görünüm → "Bölüm özeti": "2026 planında 37 aşırı tahsis", satırlar yine kod. → **Aynı mı:** kısmen; 9 kişi ile 37 aynı şey mi? (UI-AKS-04)

Ölçüm: 5 tıklama · yanlış tıklama 1 · geri dönüş 1 · ~3 dk. **Sonuç: zorlandı.**

### Klasik
"Tahsis" → başlık "İşgücü Tahsisi", varsayılan "Tahsis Tablosu" (proje proje); "Doluluk" ayrı sekme; süzgeç bu kez "Tüm Bölümler" ama yine kod. Banner "37 aşırı tahsis". Hücrelerde "0.8", başlıkta "0,7/0,5". Ölçüm: 3 tıklama · 0 · 1 (Veri havuzu) · ~2 dk 30 sn. **Sonuç: zorlandı.**

---

## İş 5 · Müdür (ahmet): portföy sağlığı, kapasite–talep

### Modern
1. **Arıyorum:** genel durum. → **Buldum:** Portföy: "Aktif projeler 4 · 1 proje beklemede", "Geciken görevler 76", "Dikkat isteyen proje 4 · 1 proje kritik". → **Aynı mı:** evet.
2. **Arıyorum:** benden beklenen. → **Buldum:** ilk 5 maddede yok; "Tümünü göster (7)" → 7. sırada "PUSULA — 2026 planı onayınızı bekliyor". → **Aynı mı:** hayır.
3. **Arıyorum:** aşırı tahsis. → **Buldum:** "34 aşırı tahsis (kişi-ay)" → tıklayınca "Kapasite aşımı 9 kişi" → Bölüm özeti "37". → **Aynı mı:** **hayır** (UI-AKS-04).
4. **Arıyorum:** kapasite–talep. → **Buldum:** görünüm listesinde yok; "Araçlar" menüsünde "Kapasite–talep". "2 rolde personel açığı — toplam 0,9 AA"; "Toplam" sütunu ekranın sağında kesik. Karar düğmesi yok. → **Aynı mı:** kısmen.

Ölçüm: 6 tıklama · yanlış tıklama 1 (Görünüm listesinde Kapasite–talep aradım) · geri dönüş 1 · ~3 dk. **Sonuç: zorlandı.**

### Klasik
Portföy kartları 5 proje, "Riskli Proje 4". Kapasite–talep klasikte Tahsis altında üst düzey sekme ("Kapasite-Talep"); bu koşuda açılmadı. **Sonuç: denenmedi (yalnız portföy görüldü).**

---

## İş 6 · Müdür (ahmet): notları ve müşteri isteklerini **görmediğini** doğrula

| Denetim | Modern | Klasik |
|---|---|---|
| Proje sekmeleri | "Diğer": Hedefler, İş paketleri, Asistan (Müşteri istekleri / Günlük **yok**) ✓ | Pano, Yol Haritası, Hedefler, Görevler, Riskler, Ekip, Zekâ (İstekler / Günlük **yok**) ✓ |
| Burak'ta aynı yer | "Diğer": Hedefler, **Müşteri istekleri**, **Günlük**, İş paketleri, Asistan | … **İstekler**, **Günlük** … |
| Ctrl+K "karanl…" (istek başlığı) | sonuç yok ✓ | (Burak'ta denendi; proje sonucu yok) |
| Beklentiler | "Yönetimden beklentiler" (PY'lerin müdürden istekleri; müşteri isteği değil) | aynı |
| Görüşmeler | "Müşteri görüşmeleri; onaylayın ya da notla geri çevirin" (tasarım gereği müdüre açık) | aynı |
| Haftalık rapor | yalnız yayınlanmış rapor; "Bu haftanın notları" kaynakları görünmüyor ✓ | aynı ✓ |

Ölçüm: 7 tıklama · 0 · 0 · ~2 dk. **Sonuç: doğrulandı** (iki arayüzde de).

---

## İş 7 · Süreklilik ve arayüz geçişi

| Durum | Modern | Klasik |
|---|---|---|
| Yenile (F5) | Portföy'e döner (UI-AKS-13) | Proje başlıkta kalır, ekran Portföy |
| Arayüz değiştir (modern Riskler → klasik) | — | Aynı proje, "Risk Kaydı" açık ✓ |
| "Diğer" / "Diğer araçlar" menüsü açıkken kenar çubuğuna tıklama | Tıklama düğmeye ulaşmıyor (menünün örtüsü yakalıyor); Escape menüyü kapatmıyor (→ Ece) | — |

---

## İş 8 · PY (burak): başka PY'nin projesine dokunamama

1. **Arıyorum:** yalnız kendi projelerim. → **Buldum:** kenar çubuğunda yalnız PUSULA/NEHİR. → **Aynı mı:** evet.
2. **Arıyorum:** Portföy uyarısı. → **Buldum:** "ATLAS — 15 görev terminini aştı" → ATLAS açıldı (PY: Elif Yılmaz). → **Aynı mı:** hayır.
3. **Arıyorum:** salt okunur mu? → **Buldum:** "Haftalık durum" salt okunur, ama "Yeni görev" çalıştı; görev eklendi. KALKAN'da da. → **Aynı mı:** **hayır** (UI-AKS-02).

Ölçüm: 4 tıklama · ~1 dk.
