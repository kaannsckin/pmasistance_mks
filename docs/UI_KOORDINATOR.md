# UI/UX çarpışma testi: koordinatör talimatı

Bu talimatı dört ajanı yöneten oturum (koordinatör) izler. Ajanların karakteri, ortak kuralları ve bulgu biçimi: [`UI_AJANLARI.md`](./UI_AJANLARI.md). Koordinatör test etmez; ortamı kurar, ajanları başlatır, bulguları uzlaştırır ve raporu yazar.

> Ajanlar (`.claude/agents/ui-*.md`) alt ajan olarak çalışır ve başka ajan başlatamaz; bu yüzden koordinatör bir alt ajan değil, ana oturumdur.

## Tur 0 · Hazırlık

```bash
node scripts/ui-test/hazirla.mjs
```

Bağımlılıkları kurar, uygulamayı ve pilot komut satırını derler, `pilot` ve `bos` veri setlerini `ui-testi/<gün>/veri/` altına kurar, ajan dizinlerini açar, `kosu.json` yazar ve iki arayüz × sistem açık/koyu duman testi yapar. Duman testi KALDI ise (çıkış kodu 2) ajanları başlatma; `ui-testi/<gün>/duman/` altındaki görüntüye bak ve sorunu kullanıcıya bildir. Kod değiştiyse `--derle` ile yeniden derle. Koşunun günü `hazirla.mjs`'nin açtığı gündür; koşu gece yarısını aşarsa ajan betikleri ve `birlestir.mjs` en son hazırlanan koşuyu kullanmaya devam eder (`UI_TEST_GUN` ile başka bir gün seçilebilir).

## Tur 1 · Bağımsız keşif (paralel)

Dört ajanı **aynı anda**, arka planda başlat (`ui-gorsel`, `ui-akis`, `ui-kirici`, `ui-erisim`). Her birine aşağıdaki istemi, `<…>` alanlarını doldurarak ver. Ajanların okuduğu belgelere bilinen hata ya da beklenen bulgu yazma: ajanın kendiliğinden bulması, testin değerini ölçer.

```text
UI/UX çarpışma testi, Tur 1 (bağımsız keşif). Koşu günü: <gün>. Kod: <dal>@<commit>.

1. docs/UI_AJANLARI.md'yi ve kendi tanımını oku.
2. Ortak betik: scripts/ui-test/ortak.mjs (başındaki yorum kullanım örneğidir; işlevler: baslat/oturum,
   tikla, foto, suzgec, kontrastTara, yuzeyAyrimi, kokDurum, tasmaTara, dokunmaHedefleri, adsizOgeler,
   ariaOzet, odakTuru, cokmeVarMi, depoOku, seed). Betiklerini <kök>/<ajan>/betik/ altına yaz ve
   `node <betik>` ile çalıştır; ortak.mjs'yi mutlak yolla içe aktar. Portun: <port>.
   Uygulama derlendi ve veri setleri hazır (<kök>/kosu.json). Derleme yapma.
3. Bütçe: en çok ~40 betik çalıştırması. Her betik 4 dakikanın altında kalsın (tek tarayıcı, az koşul).
   Nicelik değil nitelik: en değerli 8–15 bulguyu tam biçimde yaz; geri kalanı bulgular.md'nin sonunda
   "Kısa notlar" listesine tek satırla.
4. Odak (bu koşu): <ajana özel odak>
5. Çıktı: <kök>/<ajan>/ altında kendi tanımındaki dosyalar; bulgu kimliği UI-<KOD>-NN.
   Kaynak kodu değiştirme; git işlemi yapma.
6. Bitince yanıt olarak yalnız şunu döndür: bulgu sayısı (önem derecesine göre), en önemli 3 bulgunun
   tek satırlık özeti, devir notlarının sayısı ve kime gittiği, çalışmayan bir şey olduysa ne olduğu.
```

**Ajana özel odak (ilk koşu için öneri):**

| Ajan | Odak |
|---|---|
| Deniz | Modern arayüz önce: Portföy, Yönetim, Ekip ve tahsis, Haftalık rapor, Risk raporu, proje Genel bakış, Ayarlar penceresi. Sistem açık/koyu × uygulama Gece/Gündüz × iki arayüz; sorunlu koşulda renk temaları. |
| Cem | Burak (PY) ile görev ekleme ve haftalık rapor; Selin ile doluluk ve rapor onayı; Ahmet ile portföy sağlığı ve notların görünmemesi. Önce modern, sonra aynı işler klasik arayüzde. |
| Tolga | `asiri` veri setini üret (yolunu devir.md'ye yaz); görev formu ve haftalık raporda çift tık, yarıda bırakma, yenileme; çevrimdışı açılış; bozuk IndexedDB; uç veride Portföy ve proje ekranlarında taşma. |
| Ece | Modern arayüzde yalnız klavye turu (Portföy, görev formu, Ayarlar); 375 px ve 1023/1024 px kırılımı; %200 yakınlaştırma; risk ve doluluk ekranlarında renk körlüğü; hareketi azalt. |

## Tur 2 · Çapraz saldırı (halka)

Tur 1'in dört ajanı da bitince başlat. Halka: **Tolga → Deniz → Ece → Cem → Tolga** (ok, bulguların kime gittiğini gösterir). Her ajana halkadaki öncekinin `bulgular.md` dosyasını ve kendisine yazılmış devir notlarını ver:

| Ajan | Doğrulayacağı bulgular | Ayrıca |
|---|---|---|
| Deniz | Tolga'nın | Tolga'nın bozduğu, boş ve hata durumundaki ekranları her temada görüntüle |
| Ece | Deniz'in | Tema bulgularını yakınlaştırma, renk körlüğü ve yalnız klavyeyle tekrarla; odak halkası her temada |
| Cem | Ece'nin | Mobil ve klavye bulgularını gerçek bir işle dene: işi gerçekten engelliyor mu? |
| Tolga | Cem'in | Cem'in tamamladığı akışları kötü yoldan tekrar et |

```text
UI/UX çarpışma testi, Tur 2 (çapraz saldırı). Koşu günü: <gün>. Tur 1'deki ortam ve kurallar geçerli.

1. <kök>/<önceki ajan>/bulgular.md dosyasındaki her bulguyu (K1–K3; K4'leri atla) kendi yönteminle
   yeniden üretmeyi dene. Karar: doğrulandı | reddedildi | üretilemedi | önem değişmeli (K? → K?).
2. Sana yazılmış devir notlarına bak: <kök>/*/devir.md içinde adının geçtiği maddeler.
3. Aynı ekranlarda kendi şeridinden yeni bulgu ara: <ajana özel "Ayrıca" maddesi>.
4. Bütçe: en çok ~25 betik çalıştırması.
5. Çıktı: <kök>/<ajan>/tur2.md, şu biçimde:
     ## Doğrulama
     | Bulgu | Karar | Gerekçe / kanıt |
     |---|---|---|
     | UI-XXX-NN | doğrulandı | … (ekran görüntüsü yolu) |
     ## Yeni bulgular
     (ortak bulgu biçimi; kimlikler Tur 1'deki son numaradan devam eder)
6. Bitince yalnız şunu döndür: doğrulanan / reddedilen / üretilemeyen sayısı, yeni bulgu sayısı (önem
   derecesine göre), en önemli yeni bulgunun tek satırlık özeti.
```

## Tur 3 · Uzlaşma ve rapor

```bash
node scripts/ui-test/birlestir.mjs
```

`ui-testi/<gün>/tablo.md` dört ajanın bulgularını ve çapraz kararları tek tabloda toplar. Koordinatör sonra:

1. **Birleştirir.** Aynı sorunu anlatan bulguları tek bulguda toplar (ör. Deniz'in "koyu modda kart ayrılmıyor" ile Ece'nin "koyu modda bölge sınırı kayboluyor" bulgusu). Birleşik bulgu, kaynak bulgu kimliklerini taşır.
2. **Durum verir.** İki ajanın ürettiği bulgu **doğrulandı**; tek ajanınki **aday**; çapraz denetçinin üretemediği **reddedildi** ya da **üretilemedi** (gerekçesiyle).
3. **Önemi uzlaştırır.** Ajanlar önemde ayrışırsa iş etkisine bakar (Cem'in görüşü ağır basar); uzlaşılamayanları kullanıcıya sorar.
4. **Kök nedene göre gruplar.** Aynı kök nedenden (ör. tek bir CSS kuralı) çıkan bulgular tek düzeltmeye bağlanır.
5. **Raporu yazar:** `ui-testi/<gün>/RAPOR.md`:
   - İlk satır: koşunun tek cümlelik sonucu (ör. "Modern arayüzün koyu modu demoya hazır değil: 3 doğrulanmış K2").
   - Özet tablo: önem × durum; ajan başına bulgu ve çapraz doğrulama oranı.
   - Doğrulanmış bulgular, önem sırasıyla; her birinde kanıt görüntüsü ve olası kök neden.
   - Adaylar ve reddedilenler (kısa).
   - Ajanların kendi değerlendirmesi: hangi ajan neyi kaçırdı, hangi kör nokta işe yaradı; bir sonraki koşu için odak önerisi.
6. **Kalıcı kopya.** `ui-testi/` git dışında ve bulut kapsayıcısı geçicidir. Raporu ve kanıt görüntülerinin seçilmiş bir alt kümesini `docs/ui-testi/<gün>/` altına kopyalayıp işle (görüntüler küçük tutulur; tam set kapsayıcıda kalır).
