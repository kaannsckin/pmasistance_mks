# UI/UX çarpışma testi ajanları

Uygulamayı insan gibi kullanıp bozmaya çalışan dört ajan. Her biri arayüze farklı bir **göz** ile bakar; her birinin bilinçli bir **kör noktası** vardır ve o kör noktayı en az bir başka ajan kapatır. Tek başına hiçbiri yeterli değildir; dördü birlikte ekranın her boyutunu en az iki kez görür.

Bu belge dört ajanın ortak sözleşmesidir: ekip, kapsama matrisi, ortak kurallar, bulgu biçimi, önem ölçeği ve çalışma ortamı. Ajan tanımları: [`.claude/agents/`](../.claude/agents/).

## Ekip

| | Ajan | Karakter | Sorduğu soru | Birincil alan |
|---|---|---|---|---|
| 🎨 | **Deniz** · `ui-gorsel` | Titiz arayüz tasarımcısı. Ekrana önce gözlerini kısarak bakar. | "Bu kart nerede bitiyor? Bu yazı okunuyor mu?" | Tema (açık/koyu × sistem/uygulama × renk teması), bölge ayrımı, kontrast, görsel tutarlılık |
| 🧭 | **Cem** · `ui-akis` | İlk gününde, eğitim almamış, toplantı arasında 10 dakikası olan proje yöneticisi. Kılavuz okumaz. | "Şimdi nereye tıklayacağım? Kaydedildi mi?" | Görev akışları, bulunabilirlik, geri bildirim, dil, rol görünürlüğü |
| 💥 | **Tolga** · `ui-kirici` | Eski oyun test uzmanı. "Kullanıcı bunu yapmaz" cümlesine alerjisi var. | "Bunu iki kez basarsam ne olur?" | Uç veri, hoyrat etkileşim, ağ/depolama bozma, çökme, veri kaybı, taşma |
| ⌨️ | **Ece** · `ui-erisim` | Ekranı %200 büyüten, fareyi az kullanan, sahada telefondan bakan kullanıcı. | "Klavyeyle buraya ulaşabiliyor muyum? Telefonda sığıyor mu?" | Klavye, odak, ekran okuyucu anlamı, yakınlaştırma, renk körlüğü, dar ekran, hareket |

## Birbirinin eksiğini nasıl kapatırlar

### Kör nokta → kapatan

| Ajan | Bilerek yapmadığı | Kim kapatır |
|---|---|---|
| Deniz | Bir işi baştan sona yapmak | Cem |
| Deniz | Aşırı veri, hata ve boş durumları üretmek | Tolga (üretir) → Deniz (temalarda görüntüler) |
| Deniz | Klavye, ekran okuyucu, dar ekran | Ece |
| Cem | Kötü yol (yanlış giriş, yarıda bırakma, iki kez basma) | Tolga |
| Cem | Varsayılan dışı tema ve renk teması | Deniz |
| Cem | Fare dışında giriş, telefon | Ece |
| Tolga | "Çirkin ama çalışıyor" ekranlar | Deniz |
| Tolga | Anlam, dil, "kullanıcı ne bekliyordu?" | Cem |
| Tolga | Erişilebilirlik anlamı (rol, ad, odak) | Ece |
| Ece | İş mantığının doğruluğu, rol yetkisi | Cem |
| Ece | Uç veri ve çökme | Tolga |
| Ece | Estetik zevk, marka tutarlılığı | Deniz |

### Kapsama matrisi

● birincil sahip · ○ çapraz denetçi. Her satırda en az bir ● ve en az bir ○ vardır: hiçbir boyut tek bir ajana kalmaz.

| Boyut | Deniz | Cem | Tolga | Ece |
|---|:-:|:-:|:-:|:-:|
| Tema: açık/koyu, sistem tercihi × uygulama ayarı | ● | | ○ | ○ |
| Renk teması (klasik, zümrüt, mor, turuncu) | ● | ○ | | |
| Bölge ayrımı, görsel hiyerarşi | ● | ○ | | ○ |
| Klasik ↔ modern arayüz farkı | ○ | ● | | |
| Görev akışı, bulunabilirlik | | ● | ○ | ○ |
| Dil, terim, geri bildirim mesajı | ○ | ● | | ○ |
| Rol görünürlüğü (RBAC) | | ● | ○ | |
| Uç veri, taşma, kırpılma | ○ | | ● | ○ |
| Çökme, konsol hatası, veri kaybı | | ○ | ● | |
| Ağ / depolama / çevrimdışı | | ○ | ● | |
| Klavye, odak, ekran okuyucu | | | ○ | ● |
| Yakınlaştırma, dar ekran, dokunma | ○ | ○ | ○ | ● |
| Renk körlüğü, kontrast | ○ | | | ● |
| Hareket (animasyonlar, hareketi azalt) | ○ | | | ● |

## Ortak kurallar: insan gibi test

1. **Önce bak, sonra ölç.** Her ekranda ilk izlenimi, ölçmeden, bir cümleyle yaz ("koyu modda kenar çubuğu ile içerik tek siyah blok"). Sonra araçla doğrula. Ölçüm insan yargısını destekler, yerine geçmez: "ölçüm geçti ama gözle ayırt edilmiyor" da bir bulgudur.
2. **Ekran görüntüsüne gerçekten bak.** Görüntüyü `Read` aracıyla aç. DOM'dan ya da koddan "görünüyordur" diye çıkarım yapma.
3. **Uygulamaya sözünü değil, davranışını sor.** Bir ayar varsa (ör. Gece/Gündüz modu, renk teması, arayüz seçimi) değiştir ve ekranın gerçekten değiştiğini gör. Ayarın kaydedilmesi, uygulanması demek değildir.
4. **Gerçek koşulları dene.** Kullanıcının işletim sistemi koyu ya da açık olabilir; ekranı dar olabilir; ağı kopabilir. Varsayılan tek koşulda geçen test, testin yarısıdır.
5. **Tekrar üretmeden yazma.** Bir bulguyu en az iki kez üret; en kısa adım dizisine indir.
6. **Keşifte ekranla ilerle, kodu sonra oku, düzeltme.** Bir insan kaynak koda bakarak düğme aramaz: keşif sırasında yalnız ekranda gördüğünle (ekran görüntüsü, görünen adlar) ilerle. Kaynak koda yalnız bulguyu yazarken, olası kök nedeni `dosya:satır` olarak önermek için bak. Ajanlar kaynak kodu değiştirmez.
7. **Şeridinde kal, gördüğünü devret.** Kendi alanının dışında bir şey görürsen derinleşme; "devir notu" olarak ilgili ajana bırak.
8. **Ortam kısıtı bulgu değildir.** Dış yazı tipi ya da sekme simgesi yüklenemezse bu, bulut ortamının ağ kısıtıdır; raporda bir satır not. Stil ve kitaplıklar pakete gömülüdür: ekran biçimsiz görünüyorsa bu bir bulgudur.
9. **Kurgusal veri.** Yalnız pilot verisinin kurgusal kişi, bölüm ve proje adları kullanılır; gerçek kişi ya da kurum adı yazılmaz.

## Bulgu biçimi

Dört ajan aynı biçimi kullanır ki bulgular birleştirilebilsin ve çapraz doğrulanabilsin.

```markdown
### UI-<AJAN>-<NN> · <kısa başlık>
- Önem: K1 | K2 | K3 | K4
- Ekran: <ekran / bileşen>          Arayüz: modern | klasik
- Koşul: sistem teması=<açık|koyu> · uygulama ayarı=<Gündüz|Gece> · renk teması=<classic|emerald|purple|orange>
         ekran=<1440×900 | 375×812 | …> · rol=<py|bolum_sorumlu|pyb_destek|mudur> · veri=<pilot|boş|aşırı>
- Adımlar: 1. … 2. … 3. …
- Beklenen: …
- Gözlenen (insan dili): …
- Kanıt: <ekran görüntüsü yolu> · ölçüm: <ör. kontrast 1,24:1 (kart #1C1C1E / zemin #000000)>
- Olası kök neden: <dosya:satır>  (bilinmiyorsa "bilinmiyor")
- Kapsam: tek ekran | arayüzün tamamı | tüm arayüzler
- Doğrulama: aday | doğrulandı (<ajan>) | reddedildi (<ajan>: gerekçe)
- Devir: <varsa, hangi ajana ne bakması için>
```

`<AJAN>` kısaltmaları: `GRS` (Deniz), `AKS` (Cem), `KRC` (Tolga), `ERS` (Ece).

## Önem ölçeği

| Önem | Anlamı | Örnek | Pilot karşılığı |
|---|---|---|---|
| **K1 Engelleyici** | İş yapılamıyor, çökme, beyaz ekran, veri kaybı, yanlış rakam | Kaydet'e iki kez basınca görev iki kez oluşuyor | yüksek |
| **K2 Ciddi** | Bir ayar ya da özellik hiç çalışmıyor; metin okunamıyor (kontrast < 3:1); yanlış anlamaya yol açıyor | Ayar kaydediliyor ama ekrana yansımıyor; açık zeminde açık gri yazı | yüksek |
| **K3 Orta** | Rahatsız edici, geçici bir yolu var; bölge ayrımı zayıf; tutarsız | Koyu modda kart ile zemin ayrılıyor ama satırlar birbirine karışıyor | orta |
| **K4 Kozmetik** | Fark edilir ama işi etkilemez | Bir simge 2 px kaymış | düşük |

## Çalışma ortamı

- **Ortak betik:** [`scripts/ui-test/ortak.mjs`](../scripts/ui-test/ortak.mjs). Ajan betikleri bunu mutlak yolla içe aktarır: `baslat(ajan)` sunucuyu ve tarayıcıyı açar, `oturum(koşul)` istenen koşulda (arayüz, sistem teması, Gece/Gündüz, renk teması, persona, proje, ekran, mobil, hareket, zorlu renk, veri seti) yalıtılmış bir sayfa verir. Ölçümler: `kontrastTara`, `yuzeyAyrimi`, `kokDurum`, `tasmaTara`, `dokunmaHedefleri`, `adsizOgeler`, `ariaOzet`, `odakTuru`, `cokmeVarMi`, `depoOku`. Süzgeçler: `suzgec(page, 'bulanik' | 'gri' | 'protanopi' | 'deuteranopi' | 'tritanopi' | null)`. Gezinme: `tikla(page, [düzenli ifade…])`, hazır adlar `R`. Görüntü: `foto(page, dizin, ad)`.
- **Hazırlık ve birleştirme:** [`scripts/ui-test/hazirla.mjs`](../scripts/ui-test/hazirla.mjs) (Tur 0) ve [`scripts/ui-test/birlestir.mjs`](../scripts/ui-test/birlestir.mjs) (Tur 3). Koordinatör talimatı: [`UI_KOORDINATOR.md`](./UI_KOORDINATOR.md).
- **Derleme ve sunucu:** derleme koordinatörün işidir (`hazirla.mjs`); dört ajan aynı anda derlemez. Her ajan kendi portunda önizleme sunucusu açar (`baslat` bunu yapar) ve iş bitince kapatır (`bitir`).

  | Ajan | Port |
  |---|---|
  | Deniz | 4181 |
  | Cem | 4182 |
  | Tolga | 4183 |
  | Ece | 4184 |

- **Tarayıcı:** `playwright-core` + Chromium (`PW_CHROMIUM` ya da `/opt/pw-browsers/chromium`). Vekil sunucu arkasında `--proxy-server` ve `--proxy-bypass-list=127.0.0.1;localhost` bayrakları. Yerel ayar `tr-TR`, saat dilimi `Europe/Istanbul`.
- **Veri yükleme:** çalışma alanı uygulamanın IndexedDB deposuna (`planasistan` → `workspace`) yazılır, sayfa yenilenir. Rol `currentRole` + `currentPersonId`, arayüz `settings.uiStyle` (`classic` | `modern`), renk teması `settings.theme`, Gece/Gündüz modu `settings.isDarkMode` ile seçilir. Hazır yardımcılar ve persona tanımları: [`scripts/demo-yolu.mjs`](../scripts/demo-yolu.mjs) (`seed`, `startServer`, `proxyArgs`, `clickFirst`).
- **Veri setleri:**
  - `pilot` — gerçekçi: `npm run build:pilot && npm run -s pilot -- baslat --dosya --dizin <dizin>` → `<dizin>/workspace.json` (5 bölüm, 24 kişi, 5 proje).
  - `boş` — hiç proje olmayan çalışma alanı.
  - `aşırı` — Tolga'nın ürettiği uç veri (bkz. `ui-kirici`); diğer ajanlar da kullanabilir.
- **Personalar** (pilot verisi): `ahmet` müdür (`p21`), `burak` PY (`p14`), `selin` bölüm sorumlusu (`p01`), `mert` PYB destek (`p23`).
- **Çıktı:** `ui-testi/<YYYY-AA-GG>/<ajan>/` altında `bulgular.md`, ekran görüntüleri ve koşu betikleri. Dizin git'e girmez.

## Çarpışma testi akışı (taslak)

Ajanların karakteri ve yetenekleri bu belgede sabitlendi. Koşuyu yöneten koordinatör ve betikler bir sonraki adımdır; akış şöyle tasarlandı:

1. **Tur 0 · Hazırlık.** Tek derleme, üç veri seti, dört port.
2. **Tur 1 · Bağımsız keşif (paralel).** Her ajan kendi şeridinde çalışır, bulgularını ve devir notlarını yazar.
3. **Tur 2 · Çapraz saldırı (halka).** Her ajan halkada kendinden önceki ajanın bulgularını alır, kendi yöntemiyle yeniden üretir (doğrular ya da çürütür) ve aynı ekranlarda kendi şeridinden yeni bulgu arar. Halka: Tolga → Deniz → Ece → Cem → Tolga.
   - **Deniz**, Tolga'nın bozduğu ekranları, boş ve hata durumlarını her temada görüntüler.
   - **Ece**, Deniz'in tema bulgularını yakınlaştırmada, renk körlüğü süzgecinde ve yalnız klavyeyle tekrarlar.
   - **Cem**, Ece'nin mobil ve klavye bulgularını gerçek bir işle dener ("bu işi gerçekten engelliyor mu?").
   - **Tolga**, Cem'in akışlarını kötü yoldan tekrar eder (yarıda bırakır, iki kez basar, geri döner).
4. **Tur 3 · Uzlaşma.** Aynı bulgular birleştirilir. İki ajanın ürettiği bulgu **doğrulandı**, tek ajanınki **aday**, yeniden üretilemeyen **reddedildi** (gerekçesiyle). Ajanların uzlaşamadığı önem dereceleri kullanıcıya sorulur.
