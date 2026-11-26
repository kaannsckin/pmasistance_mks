# Whiteboard (FigJam tarzı proje panosu)

Her projenin **Whiteboard** sekmesinde (modern arayüz) istediğiniz kadar pano açılır. Pano FigJam'i örnek alır: sonsuz tuval, yapışkan not, şekil, bağlantı, bölüm, kalem, damga ve görsel. Farkı, projenin kayıtlarına bağlı olmasıdır: `/` ile görev, sprint, iş paketi, risk ve sürüm kart olarak eklenir. Kartlar içeriği her çizimde projeden okur; Jira eşitlemesiyle durum, atanan ve termin güncel kalır.

Panolar projeyle birlikte saklanır ve bulutla eşitlenir. Düzenleme proje içeriğini düzenleyebilenlere açıktır; diğerleri panoyu görür, kaydırır ve yakınlaştırır.

## Proje kayıtlarını bağlamak

| Nasıl | Ne olur |
|---|---|
| Tuvalde `/` (ya da alttaki **Ekle**) | Komut paleti açılır. Görev anahtarı (`MPS-123`), görev adı, sprint adı, iş paketi, risk ya da sürüm yazın. Seçilen kayıt imlecin olduğu yere kart olarak eklenir. |
| Palette `görev …`, `sprint …`, `risk …`, `epic …`, `sürüm …` | Arama o türle sınırlanır. |
| **Shift+Enter** | Ekler ve palet açık kalır (birden çok kartı arka arkaya ekleyin). |
| **Alt+Enter** ya da **+ görevleri** | Sprint, iş paketi ya da sürüm, görevleriyle birlikte bir bölüm içinde eklenir. |
| Notta `//` | Referans paleti açılır. Seçilen görevin anahtarı metne yazılır ve notta **görev kodu düğmesi** olarak görünür; tıklayınca görev ayrıntısı açılır. Anahtarı olmayan görev `#kimlik` ile yazılır. `//` yalnız satır başında ya da boşluktan sonra paleti açar (`http://` açmaz). |
| Sprint / iş paketi / sürüm kartı › **Görevlerini ekle** | Panoda olmayan görevleri kartın yanına dizer. |
| Not seçiliyken **Göreve dönüştür** | Not metninden görev açılır: ilk satır ad, kalanı not. Görev Yapılacak durumunda, havuzda ve "Whiteboard" etiketiyle gelir. Not aynı yerde görev kartına dönüşür, bağlantıları korunur. |

## Araçlar ve kısayollar

| Araç | Kısayol | Not |
|---|---|---|
| Seç | V | Tıkla, Shift ile ekle, boş alanda sürükleyerek çerçeveyle seç |
| El | H, Boşluk + sürükle, orta tuş | Tuvali kaydırır |
| Yapışkan not | S, boş alanda çift tık | 10 renk. Düzenlerken Ctrl/⌘+Enter yanına yeni not açar. |
| Metin | T | Yazı boyutu S / M / L / XL |
| Şekil | R (dikdörtgen), O (elips) | Dikdörtgen, elips, karar (eşkenar dörtgen), üçgen. Sürükleyerek boyutlu çizilir. |
| Bölüm | Shift+S | Bölüm taşınınca içindekiler de taşınır |
| Bağlantı | L | Nesneden nesneye sürükleyin. Seçili nesnenin mavi noktalarından da sürüklenir; boşa bırakılırsa yeni not açılır ve bağlanır. Çift tıkla etiket. |
| Kalem | P | 9 renk |
| Damga | E | 👍 ❤️ ✅ ❓ ⭐ 🔥 🎉 👀 ⚠️ 💡 |
| Görsel | Yapıştır (Ctrl+V), sürükle-bırak, alttaki görsel düğmesi | En çok 1200 px'e küçültülür |

Genel: Ctrl+Z / Ctrl+Shift+Z geri al / yinele, Ctrl+D çoğalt, Ctrl+C / Ctrl+V kopyala / yapıştır, Ctrl+A tümünü seç, Delete sil, ok tuşları kaydır (Shift ile 10 px), Enter seçili nesneyi düzenle, Esc seçimi bırak. Ctrl/⌘ + tekerlek ya da iki parmak sıkıştırma yakınlaştırır; tekerlek kaydırır. Shift+1 içeriğe sığdırır. Çok satırlı metin yapıştırılırsa her satır bir not olur.

Seçim araç çubuğu: renk, şekil, yazı boyutu, göreve dönüştür, görevlerini ekle, öne getir, arkaya gönder, kilitle, çoğalt, sil. Kilitli nesne taşınmaz ve silinmez.

## Toplantı araçları

- **Oylama**: kişi başına oy hakkı (1, 3, 5, 10) seçilerek başlatılır. Nota tıklayan oy verir, Alt + tık geri alır. Oylama sürerken herkes yalnız kendi oyunu görür; **Bitir** deyince toplamlar ve sıralı sonuç listesi görünür.
- **Zamanlayıcı**: 1–15 dakikalık ortak geri sayım. Pano bulutla eşitlendiğinde aynı panoyu açan herkes aynı süreyi görür.

## Şablonlar

Yeni pano boş ya da şablondan açılır. Şablonlar mevcut panoya `/` › "Şablon" ile de eklenir.

| Şablon | İçerik |
|---|---|
| Sprint retrospektifi | İyi gidenler, Geliştirilecekler, Aksiyonlar |
| Sprint planlama | Şu anki ve sonraki sprintin görevleri + öncelikli havuz (bağlı kartlar) |
| Önceliklendirme matrisi | Etki × efor dört bölge |
| UI/UX inceleme panosu | 01 Gereksinim · 02 Mevcut arayüz · 03 Alternatif tasarımlar · 04 Ekip değerlendirmesi (UI/UX, geliştirici, test, PM) · 05 Oylama · 06 Karar ve aksiyon |
| Kanban | Görevler durum kategorisine göre (sütun başına en çok 12) |
| Risk değerlendirme | Açık riskler skor bandına göre (bağlı kartlar) |
| Akış şeması | Başla → adım → karar → sonuç, bağlantılarla |

## Pano menüsü

Yeniden adlandır (sekmeye çift tık da olur), çoğalt, özeti Markdown olarak kopyala ya da indir (bölüm bölüm notlar, kartlar ve oylar), panoyu JSON olarak indir, sil. **Tam ekran** düğmesi tuvali ekranı kaplayacak şekilde açar. Son açılan pano ve her panonun görünümü (kaydırma, yakınlaştırma) bu cihazda hatırlanır.

## Bu sürümde olmayanlar

- Eş zamanlı düzenleme ve canlı imleçler: pano bulut eşitlemesiyle paylaşılır, aynı anda iki kişinin değişikliği birleştirilmez (son kaydeden kazanır).
- Yorum dizileri, sesli görüşme, spotlight, AI ile pano üretme ve PNG / PDF dışa aktarma.

Kod: [`utils/whiteboard/model.ts`](../utils/whiteboard/model.ts) (saf işlemler), [`utils/whiteboard/templates.ts`](../utils/whiteboard/templates.ts), [`components/modern/whiteboard/`](../components/modern/whiteboard/). Testler: [`utils/whiteboard/model.test.ts`](../utils/whiteboard/model.test.ts).
