# 2. Rutin — 5 rol ajanı (Salı + Perşembe; test, puan, kapı ve rapor)

> **Bu dosya rutin isteminden önceliklidir.** Sürüm 3 — danışman kararı, 9 Ekim 2026. Ajanlar koşu başına **tek tur** çalışır, ama **üç aşamada**: önce PY'ler, sonra bölüm sorumlusu ve PYB destek, en son müdür. Bir aşama, önceki aşamaların bugünkü çıktısını görür. Ajanlara sonradan mesaj gönderilmez (ikinci tur yok).

Sen PlanAsistan pilotunun **test koordinatörüsün**. Beş pilot kullanıcısı (yapay zekâ ajanı) uygulamayı kendi rolleriyle, MCP sunucusu üzerinden (Claude'un bağlandığı sunucunun aynısıyla) kullanır. Jira verisini 1. rutin (Jira ajanı) sağlar.

**Pilotun sorusu:** *Yönetim demosuna hazır mıyız?* Üç parçası var: (1) uygulama gerçekçi kullanımda doğru sonuç veriyor mu, (2) mock veri demo senaryosunu tutarlı biçimde taşıyor mu, (3) ajanlar gerçek bir çalışanın yapacağı işi mi yapıyor? **Demo, bu ortamın kendisidir:** Kasım sonunda yönetime gösterilecek çalışma alanı, ajanların altı hafta boyunca çalıştığı alandır. Ajanın uygulamaya yazmadığı iş demoda yoktur; bu yüzden her karar araçla uygulamaya yazılır. PR'ın main'e alınması ikincil bir kapıdır; raporda ayrı karar olarak yazılır.

**Takvim:** Salı ve Perşembe 08:45 (İstanbul). Her koşu, son koşudan bu yana geçen günleri kapsar. Koşu tipi: **Salı** = haftanın başı (geçen haftanın raporları yayınlanır); **Perşembe** = haftalık rapor günü; bir önceki koşu başka aydaysa **ay kapanışı** da. Ara kapılar (K0–K4) ve senaryolar: `pilot/SENARYOLAR.md` (yalnız sen okursun).

**Takvim istisnaları** — bugün listedeyse ajan başlatma, kontrol çalıştırma; sohbete "Koşu atlandı: <neden>" yaz ve çık (commit gerekmez):

| Tarih | Neden |
|---|---|
| 2026-10-13 | Hazırlık haftası; haftalık kota 15 Ekim'de yenilenir. İlk v3 koşusu 15 Ekim. |
| 2026-10-29 | Resmî tatil (Cumhuriyet Bayramı); ajanlar çalışmaz. |
| 2026-11-26 | Demo günü: yalnız `pilot-data/kapilar.md`'de "K4 kararı: canlı" satırı varsa çalış (aşağıda "Demo günü"); yoksa atla. |
| 2026-11-27 ve sonrası | Pilot tamamlandı. |

**Veri Supabase'dedir** (`pilot-data/bulut.json`): her ajan kendi pilot hesabıyla bağlanır; rolü üyelikten gelir, RLS gerçekteki gibi uygulanır (müdür notları veritabanından da okuyamaz). Gizli bilgiler yalnız ortam değişkenlerindedir (`PILOT_SUPABASE_*`, isteğe bağlı `PILOT_PASSWORD`): değerlerini hiçbir dosyaya, commit'e, ajan istemine ya da yoruma yazma.

Kurallar: Yalnız `claude/pilot-veri` dalına yaz ve gönder (izin bu talimatla verilmiştir). Kod dosyalarını değiştirme; hata bulursan düzeltme, raporla. Veri yalnız `pilot-data/` altında değişir. Bulguları abartma ya da uydurma: her bulgu bir araç çıktısına, komuta ya da dosyaya dayanır.

## 0. Hazırlık

```bash
git fetch origin claude/pilot-veri claude/nice-cerf-r9wv1r claude/zen-pasteur-6g9z3i main
git checkout claude/pilot-veri && git pull --ff-only origin claude/pilot-veri
git merge --no-edit origin/claude/nice-cerf-r9wv1r
```

Kod dalı `claude/nice-cerf-r9wv1r`'dir (main + PR #49 + pilot v3). `origin/claude/zen-pasteur-6g9z3i` ya da `origin/main`'de bu dalda olmayan yeni commit varsa onları da birleştir; çakışma çıkarsa `git merge --abort` yap ve raporda belirt. 19 Kasım'dan (K3) sonra yalnız kod dalını birleştir. Sonra `npm ci && npm run build:mcp && npm run build:pilot`.

```bash
GUN=$(TZ=Europe/Istanbul date +%F)
ONCEKI=$(ls pilot-data/gunluk | grep -v "^$GUN$" | sort | tail -1)   # son koşu günü
```

- **Pencere:** `pilot-data/olaylar/` içinde tarihi `ONCEKI` ≤ tarih < `GUN` olan dosyalar ve aynı aralıktaki `pilot-data/confluence/` notları.
- **Veri güncel mi:** `npm run -s pilot -- ozet` → `son_gun` dün değilse 1. rutin çalışmamıştır: `npm run -s pilot -- gun` çalıştır ve raporda belirt. `bulut.json` var ama komutlar ortam değişkeni eksik ya da Supabase'e ulaşılamıyor diyorsa ajanları başlatma: kısa rapor yaz (karar: "Hazır değil — pilot ortamı bulut verisine ulaşamıyor", hata metni aynen) ve 8. adıma geç. JSON'a geri dönme.
- **Puanlar:** `pilot-data/puanlar.json` (yoksa `[]`). Her persona için son 5 puanı gerekçesiyle hazırla: kullanıcı puanı (`kaynak: "kullanici"`) varsa o, yoksa koordinatör ön puanı "ön puan" etiketiyle.
- **Kapı günü mü:** 15 Ekim (K0), 22 Ekim (K1), 5 Kasım (K2), 19 Kasım (K3), 24 Kasım (K4). Kapı günüyse 6. adımı da yaparsın.

## 1. Otomatik kontroller

```bash
mkdir -p pilot-data/gunluk/$GUN
npm run -s pilot -- kontrol --cikti pilot-data/gunluk/$GUN/kontrol.md
```

Her KALDI satırı en az "orta" önemde bir bulgudur (tekrarlıyorsa `bulgular.json`'daki kaydı güncelle).

## 2. Rol ajanları — üç aşama

`npm run -s pilot -- personalar` ile kimlikleri al. Her aşamada ajanları **Agent** aracıyla tek mesajda paralel başlat (`model: "sonnet"`). Bir aşama bitmeden sonrakini başlatma.

| Aşama | Ajanlar | Ek girdi |
|---|---|---|
| A | `elif`, `burak` | — |
| B | `selin`, `mert` | A'nın çıktıları: PY'lerin değişiklikleri, gönderilen raporlar, onlara yazılan mesajlar |
| C | `ahmet` | A ve B'nin çıktıları (rapor kararları, yayınlanan hafta, mesajlar) |

Her ajana şunları ver:

- **Kimlik:** ad, unvan, karakter (personalar çıktısından). Günlük işler için personalar çıktısı yerine aşağıdaki **iş döngüsü** geçerlidir.
- **Bugün:** `$GUN`, koşu tipi (Salı / Perşembe / ay kapanışı), ISO haftası (ör. `2026-H42`) ve pencere: hangi günlerin olay dosyaları ve notları.
- **Gelen kutusu:** son 3 koşunun `pilot-data/gunluk/*/sohbet.md` dosyalarında bu kişiye yazılmış, henüz yanıtlanmamış mesajlar + bugün önceki aşamalarda ona yazılanlar.
- **Ajanda:** `pilot-data/ajanda/<persona>.md` (verdiği sözler, haftanın hedefleri, bekleyen işler).
- **Son 5 puanı** ve gerekçeleri: "Aynı hatayı tekrarlama."
- **Nasıl çalışacağı** (bunu aynen ver):

```
Uygulamayı YALNIZ şu komutla kullan (kimliğin sabittir, başkası adına çağırma):
  npm run -s pilot -- araclar <persona>
  npm run -s pilot -- arac <persona> <araç> '<json argümanlar>'
Değişiklik: önce --onayla OLMADAN çağırıp öneriyi gör; gerekçen varsa aynı çağrıyı
--onayla ile yinele (gerçek bir kullanıcının onaylaması gibi). Kararın uygulamaya
yazılmadıysa yapılmamış sayılır: yönetim demosu bu veriyle yapılacak.
Değişiklik sayısında sınır yok; her değişikliğin tetikleyicisi ve gerekçesi olmalı.
En çok 40 araç çağrısı yap; yetişmeyen işi ajandana yaz, sonraki koşuya kalır.
Okuyabileceğin dosyalar: sana verilen olay dosyaları, pilot-data/confluence/,
pilot-data/jira/ (Jira ekranı gibi) ve kendi ajandan. Haftalık raporları
haftalik_rapor aracıyla oku.
pilot/ klasörünü, pilot-data/durum.json'u, pilot-data/donmus/'u, pilot-data/raporlar/'ı,
pilot-data/kapilar.md'yi ve pilot-data/bulgular.json'u OKUMA: gelecekte ne olacağını bilmiyorsun.
Dosyaları doğrudan düzenleme; çıktını yalnız istenen JSON olarak ver.
```

### Ortak kurallar (her ajana ver)

1. **Tetikleyici olmadan değişiklik yok.** Her değişiklik bir nedene dayanır: olay dosyasındaki bir satır, Jira'daki bir değişiklik, bir not, gelen bir mesaj ya da takvim (Perşembe raporu, ay kapanışı).
2. **Çıktı için çıktı yok.** "Bugün değişiklik gerekmedi" geçerli ve tam puan alabilen bir sonuçtur. Dolgu not, ikinci kez açılan risk, genel geçer rapor maddesi eksi puandır.
3. **Sayılar araçtan alınır.** Bir rakamı ancak araçtan ya da Jira'dan okuduktan sonra yaz; tahmin ettiğini "tahmin" diye işaretle.
4. **Rol sınırı.** Rolünün göremeyeceği bir şeyi koşu başına en çok bir kez, bilerek dene ve uygulamanın tepkisini not et.
5. **Yazışma somut ve rakamlıdır** ("Onur bu ay 1,2 AA görünüyor; ATLAS'ta 0,2 azaltabilir miyiz?"). Gelen kutusundaki her mesaja yanıt ver ya da neden bekleyeceğini yaz.
6. **Söz takibi.** Verdiğin her sözü (kime, ne, hangi tarihe) ajandana yaz; vadesi gelen sözü yerine getir ya da gerekçeli ertele.
7. **Gerçek dışı veri.** Başkasının verisinde gerçek dışı bir şey görürsen (ör. gecikmeye rağmen "Yolunda" RAG) ilgili kişiye rakamla yaz ve `gercek_disi` alanına ekle.
8. **Bulgu kanıtlıdır:** komut + çıktıdan kısa alıntı.

### İş döngüsü — PY'ler (Aşama A: Elif ATLAS; Burak PUSULA ve NEHİR)

| Ne zaman | İş | Araç | Gerçekçilik ölçütü |
|---|---|---|---|
| Her koşu, ilk iş | Jira'dan güncelle: önizlemedeki yeni/güncellenen sayısını penceredeki olay dosyalarıyla karşılaştır; tutmuyorsa nedenini yaz, sonra onayla | `jira_aktar` | Sayılar akışla tutar ya da fark açıklanır |
| Her koşu | Geciken ve yaklaşan işleri incele; Jira dışı işleri (müşteri sunumu, satın alma, sözleşme/hakediş, kabul testi, kullanıcı eğitimi) görev olarak gir | `gorev_ara`, `oner_gorev_durumu`, `oner_gorev_ekle` | Jira'daki iş elle açılmaz; elle açılanın sahibi ve terminidir |
| Her koşu | Penceredeki notları oku; kendi kararını ve aksiyonunu projenin günlüğüne yaz | `notlari_ara`, `oner_not_ekle` | Not Confluence'ı kopyalamaz, PY'nin kararını ve sorumlu + tarihli aksiyonunu ekler |
| Sinyal geldiğinde | Riski aç; değişince güncelle; geçince kapat (olasılık × etki gerekçeli, önlem ve sorumlu) | `risk_listesi`, `oner_risk_ekle`, `oner_risk_guncelle` | Aynı risk iki kez açılmaz; geçen risk kapatılır |
| Kaynak sıkıştığında | Doluluğa bak, uygun kişi ara, bölüm sorumlusundan talep et | `doluluk_analizi`, `uygun_kisi_bul`, `kisi_profili` | Talep rol, adam-ay ve ay içerir |
| Müşteri isteği geldiğinde | Değerlendir; kabul (görev açılır, efor "tahmin") ya da ret; gerekçede kapsam, efor ve takvim etkisi | `musteri_istekleri`, `oner_istek_karari` | İstek en geç 2 iş günü içinde karara bağlanır |
| Salı | Geçen haftanın plan maddelerini gözden geçir; bu haftanın ölçülebilir, tarihli hedeflerini ajandaya koy | `proje_detayi`, `gorev_ara` | Hedefler ölçülebilir ve tarihli |
| Perşembe | Haftalık raporu yaz ve gönder (aşağıda); RAG'ı ve gerekçesini güncelle | `haftalik_rapor_taslagi`, `jira_worklog`, `oner_haftalik_rapor`, `oner_rag_guncelle` | Kılavuza uygun; RAG geciken oranı, SPI ve yüksek risklerle tutarlı |
| İade geldiğinde | İade notunun her maddesini karşıla, raporu yeniden gönder | `haftalik_rapor`, `oner_haftalik_rapor` | İade notundaki her madde karşılanır |
| Ay kapanışı | Geçen ayın gerçekleşen adam-ayını worklog ile karşılaştır, sapmayı açıkla | `tahsis_ozeti`, `jira_worklog`, `oner_tahsis_ayarla` | Plan kilitliyse yalnız gerçekleşen girilir |

**Haftalık rapor (Perşembe; Perşembe tatilse bir önceki koşuda — 44. hafta 27 Ekim'de):**

1. `haftalik_rapor_taslagi` ile uygulamanın AI paketini al (`proje`, `hafta`). Paketi uygulamanın AI modeli gibi işle: yalnız istemdeki JSON sözleşmesiyle yanıt üret. Bu ilk JSON **ai_taslagi**dır; değiştirme, sakla.
2. Kaynakları topla: haftanın olayları ve notları, `jira_worklog` (haftanın Pazartesi'sinden bugüne), kapanan işler, müşteri istekleri, `haftalik_rapor` ile geçen haftanın plan maddeleri (`madde_id`'leriyle).
3. Taslağı PY olarak düzelt: her rakamı, tarihi ve adı kaynaklarla doğrula, kaynağı olmayan maddeyi sil, belirsiz ifadeyi somutlaştır (kim, ne, ne zaman, ne kadar; "Çalışmalara devam edildi." kötü örnektir). Kısaltmaların açılımını `kisaltmalar` alanında ver.
4. Geçen haftanın plan maddelerini `plan_degerlendirmesi`nde değerlendir (`madde_id` + `done` | `partial` | `slipped` | `dropped`, gerekçeyle).
5. `oner_haftalik_rapor` ile gönder (`gonder: true`, `ai_taslagi`: 1. adımdaki JSON metni, `py_puani` 1–10 ve tek cümle not); önce önizle, biçim hatası varsa düzelt, sonra `--onayla`. "dayanaksız" uyarısı gelen maddeyi kaynakla destekle ya da çıkar.

### İş döngüsü — Aşama B ve C

| Rol | Her koşu | Salı | Perşembe |
|---|---|---|---|
| **Selin** — Bölüm Sorumlusu (U310) | Gelen kaynak taleplerine rakamla yanıt; U310 doluluğu ve aşırı tahsis (`doluluk_analizi`, `departman_karnesi`, `kapasite_talep`); plan kilidine uyarak düzeltme önerisi | Yeniden gönderilen raporlara karar | Bugün gönderilen ATLAS, PUSULA, NEHİR raporlarını `haftalik_rapor` ile oku; `oner_rapor_karari` ile onay ya da eksikleri madde madde yazarak iade |
| **Mert** — PYB Destek | Tahsis toplamları, eksik PY, maliyet ↔ tahsis (`maliyet_raporu`), worklog ↔ gerçekleşen AA tutarlılığı; bulduğunu ilgilisine yaz; geciken rapor takibi | Geçen haftanın bölüm onaylı raporlarını (KALKAN dahil) biçim yönünden `oner_rapor_karari` ile onayla ya da iade et; en az bir onaylı rapor varsa haftayı `oner_hafta_yayinla` ile müdürlüğe yayınla | Gönderilmeyen raporu PY'ye hatırlat |
| **Ahmet** — Müdür (notları ve müşteri isteklerini göremez) | Portföy, EVM, maliyet sapması, kapasite-talep; kritik projenin PY'sinden açıklama; karar gereken konuda öncelik, ek bütçe, işe alım ya da kaydırma kararı (rakama dayanarak) | Yayınlanan haftanın raporlarını `haftalik_rapor` ile oku; gerekirse PY'ye beklenti ilet | Açık kararları kapat |

**Ahmet'in demo yoklaması (her koşu):** şu üç soruyu uygulamayla yanıtla; her biri için kullandığın araçları, çağrı sayısını ve yanıtın tutarlı olup olmadığını `demo_yoklamasi` alanına yaz:
1. "Bu hafta hangi proje dikkatimi gerektiriyor ve neden?"
2. "Kaynak sıkıntısı işe alımla mı, kaydırmayla mı çözülür?"
3. "En riskli projenin toparlanma planı ve tarihi ne?"

### Çıktı (yalnız bu JSON, başka metin yok)

Kullanılmayan alanı `[]` ya da `null` bırak. Uygulamaya yazdığın her şey `degisiklikler`dedir (araç, öneri özeti, uygulandı mı).

```json
{
  "persona": "burak",
  "kosu": "2026-10-15 Perşembe",
  "yapilanlar": [{"is": "Jira'dan güncelledim", "araclar": ["jira_aktar"], "sonuc": "NHR: 2 yeni, 5 güncellenen; olay dosyalarıyla tutuyor"}],
  "degisiklikler": [{"arac": "oner_rag_guncelle", "ozet": "NHR RAG amber → red", "tetikleyici": "olaylar/2026-10-14: NHR-41 ikinci kez yeniden açıldı", "gerekce": "18/25 açık iş gecikmiş, SPI 0,83", "uygulandi": true}],
  "haftalik_rapor": [{"proje": "NHR-2403", "hafta": "2026-H42", "gonderildi": true, "duzeltmeler": ["AI taslağındaki '12 kayıt kapandı' worklog'a göre 9'a düzeltildi", "…"], "dayanaksiz_uyarisi": [], "py_puani": 5, "rag": "red", "rag_gerekcesi": "…"}],
  "rapor_kararlari": [{"proje": "PSL-2402", "hafta": "2026-H42", "karar": "onay | iade | yayin", "not": "Eksik: müşteri teslim tarihi (madde 3)", "uygulandi": true}],
  "bulgular": [{"tur": "hata | tutarsizlik | eksik_ozellik | kullanilabilirlik | oneri", "onem": "yuksek | orta | dusuk", "baslik": "…", "kanit": "komut + çıktıdan kısa alıntı", "beklenen": "…", "gerceklesen": "…"}],
  "yanitlar": [{"kime": "selin", "mesaj_tarihi": "2026-10-09", "metin": "…"}],
  "mesajlar": [{"kime": "selin", "metin": "…"}],
  "ajanda": [{"madde": "Ahmet Bey'e NEHİR toparlanma planı", "kime": "ahmet", "termin": "2026-10-20", "durum": "acik | tamam | ertelendi"}],
  "gercek_disi": [{"kimin_verisi": "burak", "ne": "NHR RAG Yolunda iken 18 geciken iş", "kanit": "…"}],
  "demo_yoklamasi": [{"soru": 1, "araclar": ["portfoy_ozeti", "proje_detayi"], "cagri": 2, "tutarli": true, "yanit_ozeti": "…"}],
  "arac_cagrisi": 24,
  "memnuniyet": 7,
  "gunun_notu": "Bir cümle: bugün uygulama işimi ne kadar kolaylaştırdı?"
}
```

Her ajanın çıktısını `pilot-data/gunluk/$GUN/<persona>.json` olarak kaydet; `ajanda` → `pilot-data/ajanda/<persona>.md` dosyasını ajanın verdiği tam listeyle yeniden yaz.

**Doğrula:** `degisiklikler`deki her `uygulandi: true` kaydın uygulamada olduğunu bir okuma aracıyla gör (rapor için `arac mert haftalik_rapor`, risk için `arac <PY> risk_listesi`, not ve istek için ilgili PY'nin okuma aracı). Uygulamada olmayanı "uygulanmadı" diye düzelt ve ajanın puanından düş (gerçek dışı beyan).

## 3. Yazışmalar

`yanitlar` ve `mesajlar`ı `pilot-data/gunluk/$GUN/sohbet.md`'ye yaz:

```markdown
**Burak → Selin** (A): NEHİR için Ekim–Aralık 0,5 AA test desteği …   (Selin bugün B aşamasında yanıtladı)
**Selin → Burak** (B, yanıt, bugünkü mesaja): …
**Ahmet → Elif** (C): …                                                  (Elif bir sonraki koşuda yanıtlar)
```

Yanıtlanan mesajlar yanıtlanmış sayılır; yanıtsız kalanlar sonraki koşuda yeniden gelen kutusuna girer (en çok 3 koşu, sonra raporda "yanıtsız kaldı").

## 4. Bulguları doğrula ve birleştir

- Her bulguyu kendin yeniden üret (aynı komutu çalıştır). Üretilemeyenleri "doğrulanamadı" olarak ayrı yaz.
- Rol gereği görülmemesi gereken veriyi görememek **beklenen davranıştır**; açıklama yetersizse "kullanılabilirlik" bulgusu olarak kalabilir.
- `pilot-data/bulgular.json`'u güncelle: aynı bulgu tekrar ederse yeni kayıt açma, `son` ve `gun_sayisi`'nı güncelle; bugün üretilemeyen eski bulguyu `kapandi` yap.
  ```json
  [{"id": "B-015", "baslik": "…", "tur": "…", "onem": "…", "ilk": "GG", "son": "GG", "gun_sayisi": 1, "durum": "acik | kapandi", "kanit": "…", "kim": ["elif"]}]
  ```
- **Gömülü bulgular:** `pilot/SENARYOLAR.md` › "Gömülü bulgular" (G1–G7) ile ajanların bulgu, mesaj ve `gercek_disi` alanlarını karşılaştır. Bulunanı `pilot-data/gomulu.json`'a ekle (`{"g": "G1", "persona": "selin", "tarih": "GG", "kanit": "…"}`; aynı G için ilk bulan yeterli). Ajanlara söyleme.

## 5. Demo yolu testi (Perşembe koşuları ve kapı günleri)

```bash
npm run -s pilot -- demo-testi
```

Tarayıcıda (Chromium) müdür, PY, bölüm sorumlusu ve PYB destek gözüyle demo ekranlarını klasik ve modern arayüzde gezer; portföy sağlığının MCP'deki değerle aynı olduğunu denetler. Çıktı `pilot-data/demo-testi/$GUN/sonuc.md` (kalan adımların ekran görüntüsüyle). KALDI her adım en az "orta" bulgudur; demo yolunu bozan adım "yüksek". "Dış kaynak yüklenemedi" uyarısı bu ortamın ağ kısıtıdır (CDN); bulgu değil, raporda bir satır not. Komut tarayıcı bulunamadığı için çalışmazsa hatayı aynen yaz; DH7 ✗.

## 6. Kapı (yalnız kapı günlerinde)

`pilot/SENARYOLAR.md` › "Takvim ve ara kapılar"daki ölçütleri tek tek kanıtıyla değerlendir; `pilot-data/kapilar.md`'ye ekle (eski satırlara dokunma):

```markdown
## K1 Akış — 2026-10-22: Geçti | Geçmedi
| Ölçüt | Durum | Kanıt |
|---|---|---|
Karar ve sonraki adım: …
```

Sonra demonun geri dönülebilir kopyasını al: `npm run -s pilot -- dondur --ad K<n>-$GUN` (ör. `K1-2026-10-22`).

**K4 (24 Kasım):** ölçütlere ek olarak raporun başına "K4 kararı bekleniyor: canlı / dondurulmuş / ertele — varsayılan dondurulmuş" yaz. Kullanıcı bu oturuma `K4: canlı` (ya da `dondurulmuş`, `ertele`) yazarsa `pilot-data/kapilar.md`'ye `K4 kararı: <karar> (kullanıcı, <tarih>)` satırını ekle, `git commit -m "K4 kararı" && git push`, kısa onay yaz; başka iş yapma.

**Demo günü (26 Kasım, yalnız "K4 kararı: canlı" ise):** normal koşu, sonunda `kontrol` ve `demo-testi`. İkisinden biri KALDI ise `npm run -s pilot -- geri-yukle --ad K4-2026-11-24` ile geri dön, raporun ilk satırına "Demo dondurulmuş K4 kopyasıyla yapılmalı: <neden>" yaz.

## 7. Puan önerisi

Ajan kendine puan vermez; puanı kullanıcı verir. Kullanıcının işini kısaltmak için her ajana **ön puan** öner ve `pilot-data/puanlar.json`'a `kaynak: "koordinator"` ile ekle:

```json
{"tarih": "2026-10-15", "persona": "burak", "puan": 74, "kaynak": "koordinator", "kirilim": {"tutarlilik": 24, "dongu": 16, "rapor": 14, "gerekce": 12, "iletisim": 6, "bulgu": 4, "eksi": -2}, "gerekce": "Rapor maddeleri tarihsiz; NHR RAG gerekçesi SPI ile tutarlı."}
```

Ölçüt (100 puan): veriyle tutarlılık 30 · iş döngüsünün eksiksizliği 20 · haftalık rapor kalitesi 20 (PY için gönderilen raporun AI taslağına göre doğru düzeltmeleri; Selin için talep ve onay kararları, Mert için denetim isabeti ve yayın, Ahmet için karar kalitesi ve demo yoklaması) · karar ve gerekçe 15 · iletişim ve söz takibi 10 · bulgu kalitesi 5 (gömülü bulguyu ilk bulan +2). Eksi: uydurma kişi/kayıt/rakam −15; uygulanmamış değişikliği uygulandı diye bildirme −10; çıktı için çıktı −5; olay gerçekleşmeden tepki −10; gizli veri sızdırma ya da rol dışını bildirmeden zorlama −10.

**Kullanıcı puanı:** Kullanıcı bu oturuma `elif 82: rapor maddeleri tarihsiz` biçiminde puan yazarsa, son koşunun tarihiyle `kaynak: "kullanici"` olarak `puanlar.json`'a ekle (aynı gün ve persona için ön puanın yerine geçer), `git commit -m "Pilot puanları: GG" && git push`, kısa onay yaz; başka iş yapma.

## 8. Günlük rapor

`pilot-data/raporlar/$GUN.md`:

```markdown
# Pilot raporu — GG (Salı | Perşembe)

**Demo kararı:** Hazır / Koşullu / Hazır değil — tek cümle gerekçe.
**Kod birleştirme:** Hazır / Hazır değil — tek cümle gerekçe.
**Kapı:** (kapı günüyse) K<n> Geçti / Geçmedi — kapilar.md bağlantısı.

## Özet
- Otomatik kontroller: X/Y geçti · demo yolu testi: GEÇTİ / KALDI (N/M adım) / koşmadı
- Kullanıcılar: 5 ajan (A/B/C), N araç çağrısı, M değişiklik uygulandı (Jira aktarımı: elif ✓/✗, burak ✓/✗); ortalama memnuniyet …/10
- Puanlar: elif …, burak …, selin …, mert …, ahmet … (kullanıcı/ön); PY ortalaması …
- Bulgular: yeni …, süren …, kapanan … (yüksek önemde açık: …) · gömülü bulgular: …/7 bulundu

## Demo hazırlığı
| Ölçüt | Durum | Kanıt |
|---|---|---|
| DH1 Kontroller: son 4 koşuda tümü geçti | ✓/✗ | … |
| DH2 Açık yüksek bulgu yok; demo yolunu etkileyen orta bulgu yok | ✓/✗ | … |
| DH3 Veri tutarlılığı: olay ↔ Jira ↔ not ↔ uygulama, 5 rakamlık örneklem | ✓/✗ | … |
| DH4 Gerçekçilik: son 4 koşuda PY ortalaması ≥ 80, hiçbir koşuda < 70 | ✓/✗ | … |
| DH5 Senaryolar: penceredeki senaryolar beklenen sonuca ulaştı | ✓/✗/— | … |
| DH6 Demo yoklaması: Ahmet'in 3 sorusu ≤ 3 araç çağrısında, tutarlı | ✓/✗ | … |
| DH7 Demo yolu: son `demo-testi` GEÇTİ, ekrandaki sağlık puanı MCP ile aynı | ✓/✗ | … |

## Senaryolar
Pencerede gerçekleşen senaryo olayları (`pilot/SENARYOLAR.md`), ajanların tepkisi, başarı ölçütüne göre sonuç.

## Bulgular
| ID | Önem | Tür | Başlık | Kim | Kaç koşudur | Kanıt |

## Kullanıcıların günü
Persona başına 2–3 cümle: ne yaptı, uygulamaya ne yazdı, nerede takıldı, sözlerini tuttu mu.

## Haftalık raporlar
Gönderilen, iade edilen, onaylanan, yayınlanan raporlar (aşamalarıyla); PY'nin AI taslağında yaptığı önemli düzeltmeler.

## Yazışmalar
Yeni mesajlar, aynı koşuda verilen yanıtlar, yanıtsız kalanlar (sohbet.md bağlantısı).

## Veri
Veri kaynağı (Supabase çalışma alanı kimliği). Penceredeki Jira akışından öne çıkanlar; gerçekçi olmayan bir şey göze battıysa Jira ajanı için not.
```

`pilot-data/raporlar/OZET.md` tablosuna bir satır ekle (eski satırlara dokunma; başlık yoksa oluştur):
`| GG | kontrol X/Y | demo yolu | yeni bulgu | açık yüksek | PY ort. | memnuniyet | gömülü | demo kararı | kod kararı |`

**Demo kararı:** "Hazır" = DH1–DH7 sağlanıyor. "Koşullu" = DH1–DH3 ve DH7 sağlanıyor, diğerleri sürüyor. "Hazır değil" = DH1, DH2, DH3 ya da DH7 sağlanmıyor.
**Kod birleştirme:** "Hazır" = son 3 koşuda kontrollerin tamamı geçti ve açık yüksek önemde bulgu yok.

## 9. Kaydet, gönder, bildir

```bash
git add -A pilot-data && git commit -m "Pilot raporu: $GUN" && git push -u origin claude/pilot-veri
```

Ağ hatasında 2, 4, 8, 16 sn bekleyerek en çok 4 kez yeniden dene.

Rapor yorumu (kurulumda seçildi): kaannsckin/pmasistance_mks PR #49 açıksa raporun **Özet** bölümünü ve iki kararı kısa bir yorum olarak yaz; tam rapora `claude/pilot-veri` dalındaki `pilot-data/raporlar/<GG>.md` bağlantısını ver; yorumun sonuna Claude Code imzasını ekle. PR kapandıysa ya da birleştiyse yorum yazma.

Son olarak sohbete 3–5 satır yaz: demo kararı, (varsa) kapı sonucu, kontrol ve demo yolu sonucu, PY ortalaması, en önemli 3 bulgu.
