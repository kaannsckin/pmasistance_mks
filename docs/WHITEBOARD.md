# Whiteboard (FigJam tarzı proje panosu)

Her projenin **Whiteboard** sekmesinde (modern arayüz) istediğiniz kadar pano açılır. Pano FigJam'i örnek alır: sonsuz tuval, yapışkan not, şekil, bağlantı, bölüm, kalem, damga ve görsel. Farkı, projenin kayıtlarına bağlı olmasıdır: `/` ile görev, sprint, iş paketi, risk ve sürüm kart olarak eklenir. Kartlar içeriği her çizimde projeden okur; Jira eşitlemesiyle durum, atanan ve termin güncel kalır.

Panolar **eş zamanlı düzenlenir**: aynı panodaki herkes birbirinin imlecini, seçimini ve değişikliklerini anında görür (aşağıda). Düzenleme proje içeriğini düzenleyebilenlere açıktır; diğerleri panoyu canlı izler, kaydırır ve yakınlaştırır.

## Pano açma ve erişim

- **Pano açmak:** Projeyi gören ve profilinde kişi seçili olan herkes pano açabilir. Açan kişi panonun **sahibi** olur.
- **Yönetmek:** Erişimi panonun sahibi ve projenin PY'si yönetir; ikisi de üst çubuktaki **Erişim** düğmesini (ya da Pano › Erişim ve paylaşım) kullanır.

| Ayar | Anlamı |
|---|---|
| Projeyi gören herkes | Aşağıda ayrıca eklenmeyen herkes için: **Göremez** (özel pano), **Görüntüler** (varsayılan) ya da **Düzenler** |
| Kişiler | Kişi bazında istisna (ör. herkes görüntüler, Can düzenler; ya da pano özel, yalnız Ayşe görür) |
| Sahibi | Erişimi yönetir; sahip değiştirilebilir |

**Kim ne yapar:**

| Yetki | Kim | Ne yapabilir |
|---|---|---|
| Yönetir | Sahip, projenin PY'si | İçeriği düzenler, adlandırır, erişimi ve sahibi değiştirir, panoyu siler |
| Düzenler | Düzenleme yetkisi verilen | İçeriği düzenler, adlandırır, oylamaya katılır |
| Görüntüler | Görüntüleme yetkisi verilen | Panoyu canlı izler; değişiklik yapamaz |
| Göremez | Yetkisi olmayan | Pano listede görünmez |

**Görünür işaretler:**
- Özel panonun sekmesinde kilit, yalnız görüntülenen panoda göz simgesi var.
- Üst çubuktaki "i" düğmesi o panodaki yetkinizi ve erişim özetini gösterir.
- Erişimi tanımlanmamış eski panolar: projeyi gören herkes görüntüler, PY yönetir.

**Notları göreve dönüştürmek** proje görevlerini değiştirdiği için yalnız projenin PY'sine açıktır.

**Bulutta erişim sunucuda zorlanır** (RLS):
- Görme yetkisi olmayan kişi panonun satırlarını okuyamaz ve panonun canlı kanalına katılamaz. Özel panonun içeriği projenin diğer üyelerine yayınlanmaz.
- Erişimi, sahibi değiştirmek ve panoyu silmek yalnız yöneticiye açıktır.
- Bulut yokken (aynı tarayıcı) kurallar arayüzde uygulanır.

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

## Eş zamanlı düzenleme

| Ne | Nasıl görünür |
|---|---|
| Katılımcılar | Tuvalin sol üstünde avatarlar; pano sekmesinde renkli noktalar; üst çubukta "Canlı" durumu ve kimlerin açık olduğu |
| İmleçler | Her katılımcının imleci adı ve rengiyle |
| Seçim | Başkasının seçtiği nesne onun renginde kesik çerçeveyle |
| Yazma | Başkasının düzenlediği nesnede "<ad> yazıyor…" etiketi; o nesne bu sırada sizde düzenlemeye açılmaz |
| Sürükleme | Başkasının sürüklediği nesne bırakılmadan canlı hareket eder |
| Takip | Avatara tıklayınca o kişinin imleci ekranın ortasında tutulur (FigJam'deki gibi). Tuvali kaydırınca, tıklayınca ya da Esc ile bırakılır. |

**Birleştirme.** Pano bağımsız öğelerden oluşur: pano bilgisi (ad, oylama, zamanlayıcı), her nesne, her bağlantı ve her kişinin oyu. Her öğe "son yazan kazanır" kuralıyla ayrı birleşir. Farklı nesnelerde aynı anda çalışan kişiler birbirini ezmez, oylar kişi bazında toplanır. Aynı nota aynı anda yazmak, yazıyor kilidiyle önlenir.

**Geri alma.** Ctrl+Z yalnız sizin değişikliklerinizi geri alır. Başkasının arada yaptığı değişiklik korunur. Yeni not ekleyip hemen yazdığınızda ekleme ve yazı tek adımda geri alınır.

**Bağlantı.**
- **Bulut bağlıysa:** Değişiklikler Supabase Realtime'ın özel kanallarından anında iletilir ve `workspace_whiteboard_items` tablosunda öğe bazında saklanır. Proje kanalı yalnız kimin hangi panoda olduğunu ve pano listesindeki değişikliği taşır; içerik, imleç ve seçim panonun kendi kanalından gider.
  - Kanala yalnız projeye erişen üyeler katılır; panoya yalnız projeyi düzenleyebilenler yazar.
  - Panolar proje satırına yazılmaz, bu yüzden aynı panoda çalışmak proje sürüm çakışması doğurmaz.
  - Panoyu sonradan açan kişi tablodan güncel hâli yükler.
  - Bunun için [supabase/schema.sql](../supabase/schema.sql) yeniden çalıştırılmalıdır (bkz. [KURULUM](../supabase/KURULUM.md)).
- **Bulut yoksa ya da tablo kurulmamışsa:** Aynı tarayıcıdaki sekmeler arasında canlıdır; pano projeyle birlikte cihazda saklanır. Üst çubuktaki durum etiketi hangi kipte olunduğunu söyler.

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

- Aynı notun metninde karakter düzeyinde birleştirme yok (aynı nota aynı anda yazma kilitle önlenir).
- Çevrimdışı yapılan ve bulutta da değişmiş bir nesnenin değişikliği, yeniden bağlanınca buluttaki hâline bırakılır. Yalnız bulutta olmayan yeni nesneler ve panolar yüklenir.
- Yorum dizileri, sesli görüşme, spotlight, AI ile pano üretme ve PNG / PDF dışa aktarma.

Kod: [`utils/whiteboard/model.ts`](../utils/whiteboard/model.ts) (saf işlemler), [`utils/whiteboard/collab.ts`](../utils/whiteboard/collab.ts) (op'lar ve birleştirme), [`utils/whiteboard/access.ts`](../utils/whiteboard/access.ts) (pano erişimi), [`utils/whiteboard/transport.ts`](../utils/whiteboard/transport.ts) (Realtime / sekmeler arası iletim), [`utils/whiteboard/cloudStore.ts`](../utils/whiteboard/cloudStore.ts), [`utils/whiteboard/templates.ts`](../utils/whiteboard/templates.ts), [`components/modern/whiteboard/`](../components/modern/whiteboard/). Testler: [`utils/whiteboard/model.test.ts`](../utils/whiteboard/model.test.ts), [`utils/whiteboard/collab.test.ts`](../utils/whiteboard/collab.test.ts).
