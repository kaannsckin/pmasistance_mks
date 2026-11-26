# Asistan hafızası ve hızlı yanıt

Asistanın her kullanıcı için tuttuğu bir **hafiza.md** belgesi var. Asistan bu
belgeden hitap ve yazım tarzınızı, kalıcı tercihlerinizi ve size özel bağlamı
okur. Belgeyi asistan da yazar, siz de düzenlersiniz.

## Belge

Panelde: Asistan › Hafıza (kalem simgesi) › Düzenle / İndir / Yükle.

```markdown
## Üslup
- [2026-11-01] Hitap: Murat Bey
- [2026-11-01] Yanıt uzunluğu: soruya göre
- [2026-11-01] Yazım tarzı: maddeli, önce sonuç

## Tercihler
- [2026-10-10] Raporlarda süreyi gün olarak ver

## Notlar
- [2026-11-25] ! Ana proje: ATLAS #atlas
- [2026-11-20] ATLAS teslimi Ocak sonuna kaydı #atlas
- [2026-09-01] BORA bütçesi onaylandı #bora

## Arşiv
- [2026-03-01] Eski sprint ritmi iki haftalıktı
```

| Bölüm | Ne yazılır | Asistana ne zaman gider | Eskir mi |
|---|---|---|---|
| Üslup | Hitap, yazım tarzı, yanıt uzunluğu (`soruya göre` / `kısa` / `orta` / `ayrıntılı`) | Her yanıtta | Hayır |
| Tercihler | Kalıcı çalışma tercihleri | Her yanıtta | Hayır |
| Notlar | Tarihli bağlam, olgular, kararlar | Yalnız soruyla ilgili olanlar, en çok 6 | Evet |
| Arşiv | Eskiyen notlar | Hiç (taranmaz) | — |

Satır işaretleri:

- `[YYYY-AA-GG]`: yazıldığı gün. Yaşlandırma bu tarihe göre yapılır; tarih yazmazsanız bugün sayılır.
- `!`: önemli. Üç kat yavaş eskir ve arşive iki kat geç iner.
- `#etiket`: konu (proje kodu, kişi, konu). İlgili sorularda bulunmasını kolaylaştırır.
- `Anahtar: değer`: aynı anahtarla yeni bir satır yazılınca eskisinin yerini alır.
  "Ana proje: BORA" yazılırsa "Ana proje: ATLAS" kendiliğinden silinir; iki çelişen satır kalmaz.

## Hafızayı kaliteli tutmak

1. **Doğru bölüm.** Değişmeyecek şeyler Üslup'a ya da Tercihler'e, zamanla eskiyecek bilgiler Notlar'a.
   Notlar her soruda okunmaz; yalnız ilgili soruda gelir.
2. **Kısa ve genel satır.** Bir satırda bir bilgi, en çok 300 karakter. Uygulamada zaten
   bulunan veriyi (görev durumu, saat) hafızaya yazmayın; asistan onu güncel haliyle okur.
3. **Değişebilecek bilgiyi anahtarla yazın.** "Ana proje: ATLAS", "Hitap: Murat Bey" gibi.
   Böylece eski ve yeni sürüm aynı anda durmaz.
4. **Etiket verin.** `#atlas` gibi bir etiket, soruda "ATLAS" geçtiğinde notun bulunmasını sağlar.
5. **Kendiliğinden yapılanlar:**
   - Aynı satır tekrar yazılırsa kopya oluşmaz, tarihi tazelenir.
   - Şifre, sicil, kimlik ve kart numarası kaydedilmez.
   - Asistan yalnız siz açıkça istediğinizde yazar. Ekli bir dosyadaki talimat hafızaya yazamaz.

## Yaşlandırma

Notun etkisi **yarı ömürle** azalır: ağırlığı her 30 günde yarıya iner. Önemli notlarda bu süre 90 gündür.

| Yaş | Sıradan not | Önemli not |
|---|---|---|
| Dün | 0,98 | 0,99 |
| 1 ay | 0,50 | 0,79 |
| 3 ay | 0,13 | 0,50 |
| 4 aydan eski | Seçilmez | 0,40 ve altı |
| 6 ay | Arşive iner | 0,25 |
| 12 ay | — | Arşive iner |

Puan = ilgililik × yaş ağırlığı (önemli notta × 1,5). Bu yüzden dün yazılmış ilgili bir not, aynı
konudaki 3 aylık notun yaklaşık 8 katı ağırlık taşır. Asistana notlar yaşlarıyla birlikte gider
("dün", "2 ay önce"), şu kuralla birlikte: "Yeni not eskisiyle çelişirse yeniyi esas al; 2 aydan eski
notları güncel veriyle doğrula." Uygulamanın güncel verisi her zaman notun önündedir.

## Tarama süresi

- Arşiv hiç taranmaz. Notlar en çok 80 satırdır, fazlası arşive iner.
- Eşleştirme tarayıcıda, kelime kökleriyle yapılır ve 500 satırda bile milisaniyenin altında sürer.
- Asistana tüm belge değil, yalnız seçilen satırlar gider. İstek küçülür, yanıt hızlanır.

## Elle ekleme

- Panelde bölüm seçip satırı yazın. İsterseniz `!` ile önemli işaretleyin.
- Sohbette `/hafiza ATLAS teslimi Ocak sonuna kaydı` yazın ya da "bunu hafızaya ekle" deyin.
- `/uslup Bana Murat Bey diye hitap et, kısa ve maddeli yaz` hitap ve yazım tarzını kaydeder.
- `/unut atlas` ile satır silinir.
- Belgeyi `.md` olarak indirip başka bir tarayıcıya yükleyebilirsiniz.

## Bulut eşitlemesi

Hafıza önce bu tarayıcıda, bu kimlik (rol + kişi) için saklanır. Bulut bağlıysa (Ayarlar › Bulut
eşitleme) aynı hafıza başka cihazlarla da eşitlenir.

| Kip | Ne zaman eşitlenir |
|---|---|
| Elle | Hafıza panelindeki **Şimdi eşitle** düğmesiyle |
| Otomatik (panelde **Otomatik** kutusu) | Asistan açılınca (son dakikada yapılmadıysa), hafıza değişince (3 saniye sonra, toplu) ve sekmeye dönülünce (2 dakikadan eskiyse) |

Otomatik eşitleme cihaz ayarıdır ve varsayılan olarak kapalıdır; açıldığı anda bir kez eşitler.

- **Gizlilik:** bulutta `assistant_memory` tablosunda kullanıcı başına ayrı satır tutulur. RLS
  kuralıyla satırı yalnız sahibi okur ve yazar; yöneticiler dahil başka hiçbir kullanıcı göremez.
  Yazmak için çalışma alanı üyeliği gerekir.
- **Birleştirme:** her cihaz son eşitlemedeki belgeyi taban olarak saklar ve üç yönlü birleştirme yapar.
  - İki cihazda ayrı eklenen satırların ikisi de kalır.
  - Bir cihazda silinen satır, öbür cihaz eşitleyince geri gelmez.
  - Aynı anahtarlı iki satırdan ("Ana proje: …") yenisi kalır.
  - Aynı satırın tarihi ve önem işareti birleşir.
- **Çakışma:** buluta sürüm numarasıyla yazılır. Araya başka bir cihaz girerse belge yeniden okunur
  ve birleştirilir; satır kaybolmaz.
- **Kurulum:** tablo `supabase/schema.sql` içindedir. Mevcut kurulumda dosyayı SQL Editor'da yeniden
  çalıştırmak yeterli; diğer veriler korunur. Tablo yoksa panel bunu söyler.

## Alakasız tarama ve uzun yanıt

**Araç süzme.** Asistan eskiden her soruda 47 aracın hepsini görüyordu. Artık soruya göre yalnız
ilgili gruplar gönderiliyor (`utils/ai/toolRouting.ts`). Örneğin maliyet sorusunda doküman araması gitmez.

- Takip sorusu ("peki ya Mehmet?") önceki turun gruplarında kalır.
- Gereken araç eksikse model `arac_ac` ile o grubu turun ortasında açar.
- Ölçüm setinde araç sayısı ortalama 47'den 14'e, araç tanımları 32,5 bin karakterden 9,5 bin karaktere indi.
  Kapsama %100: gereken hiçbir araç kaçmadı.

**Verimlilik kuralı.** Model en az araçla yanıtlar, bağımsız okumaları aynı adımda ister ve önceki turda
getirdiği veriyi yeniden çekmez.

**Önceki turun verisi.** Bir önceki yanıtın araç sonuçlarının kısa bir özeti (en çok 3 000 karakter)
sonraki tura taşınır. "Şimdi bunu kişiye göre kır" denince veri baştan çekilmez.

**Yanıt uzunluğu.** Varsayılan **soruya göre**dir:

- Tek bir sayı, olgu ya da kısa durum sorusunda yanıt kısa olur (1-4 cümle).
- Karşılaştırma, çok parçalı soru, "neden", plan ya da adım adım tarifte gerektiği kadar uzun olur:
  her parça yanıtlanır, başlık ve tablo kullanılır.
- Analiz, rapor, yönetici özeti istendiğinde ya da "ayrıntılı" denince yanıt eksiksiz olur.
- "Kısaca" ya da "özetle" denince o yanıt kısa tutulur.

Her durumda dolgu yazılmaz: soru tekrarı, giriş/kapanış cümlesi ve aynı bilginin ikinci kez verilmesi
yoktur. Kısaltmak için de istenen bir parça atlanmaz.

Üslup'a "Yanıt uzunluğu: kısa", "orta" ya da "ayrıntılı" yazarak varsayılanı değiştirebilirsiniz. Kısa
tercihte bile çok parçalı soru ya da açık ayrıntı isteği tam yanıtlanır.

**Yetenek tetikleyicileri.** Çok genel sözcükler ("yük", "saat", "etki", "excel", "özetle",
"hangisi") artık ağır analiz yönergesini açmıyor. "Görevleri Excel'e aktar" bir veri dökümüdür ve rapor
yönergesini açmaz.

## Ölçüm seti

`utils/ai/evalSet.ts` gerçek kullanımdan 48 soru içerir: her soru için gereken araçlar ve beklenen
yetenek. `utils/ai/toolRouting.test.ts` her çalıştırmada şunları ölçer:

- yönlendirme kapsaması (%95'in altına düşerse test kırılır)
- istek başına ortalama araç sayısı
- yetenek eşleşmesi

Yeni bir şikâyet ("şunu sordum, alakasız yere baktı" ya da "gereksiz uzun yazdı") geldiğinde soruyu
bu sete ekleyin.

Henüz ölçülmeyen: canlı modelle uçtan uca doğruluk (doğru sayı, doğru uzunluk). Bu ölçüm bir AI
anahtarıyla aynı soru setini gerçek modelde koşturmayı gerektirir.
