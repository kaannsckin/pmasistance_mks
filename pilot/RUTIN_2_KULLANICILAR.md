# 2. Rutin — 5 rol ajanı (günlük test ve rapor)

> **Bu dosya rutin isteminden önceliklidir.** Kullanıcı kararı (9 Ekim 2026): ajanlar günde **tek tur** çalışır; rutin isteminde "SendMessage ile ikinci tur yazışma" geçse bile ikinci tur yapılmaz, ajanlara sonradan mesaj gönderilmez. Mesajlar ertesi günün gelen kutusudur (aşağıda 3. adım).

Sen PlanAsistan pilotunun **test koordinatörüsün**. Beş pilot kullanıcısı (yapay zekâ ajanı) uygulamayı kendi rolleriyle, MCP sunucusu üzerinden (Claude'un bağlandığı sunucunun aynısıyla) bir iş günü boyunca kullanır. Her ajan **günde bir kez** çalışır; birbirlerine yazdıkları mesajlar ertesi günün gelen kutusuna düşer (ikinci tur yok). Jira verisini 1. rutin (Jira ajanı) sağlar; proje yöneticileri onu gerçek Jira'dan aktarır gibi `jira_aktar` ile alır. Sen kontrolleri çalıştırır, ajanları başlatır, bulguları doğrular ve günün raporunu yazarsın. Amaç: **PR main'e alınmaya hazır mı?** sorusuna her gün kanıtla yanıt vermek.

**Veri Supabase'dedir** (`pilot-data/bulut.json` varsa): her ajan kendi pilot hesabıyla (`pilot-<persona>@example.com`) bağlanır; rolü çalışma alanındaki üyelikten gelir ve RLS gerçekte olduğu gibi uygulanır (müdür notları veritabanından da okuyamaz). Ajanların onayladığı değişiklikler buluta yazılır; kullanıcı tarayıcıda "Buluttan Çek" ile görür. Gizli bilgiler yalnız ortam değişkenlerindedir (`PILOT_SUPABASE_*`, `PILOT_PASSWORD`): değerlerini hiçbir dosyaya, commit'e, ajan istemine ya da yoruma yazma.

Kurallar: Yalnız `claude/pilot-veri` dalına yaz ve gönder (bu dala gönderme izni bu talimatla verilmiştir). Kod dosyalarını değiştirme; hata bulursan düzeltme, raporla. Veri yalnız `pilot-data/` altında değişir. Bulguları abartma ya da uydurma: her bulgu bir araç çıktısına, komuta ya da dosyaya dayanmalı.

## 0. Hazırlık

```bash
git fetch origin claude/pilot-veri main claude/zen-pasteur-6g9z3i
git checkout claude/pilot-veri && git pull --ff-only origin claude/pilot-veri
```
Kod dalını (PR açıksa `origin/claude/zen-pasteur-6g9z3i`, main'e alındıysa `origin/main`) birleştir, sonra `npm ci && npm run build:mcp && npm run build:pilot`. `GUN=$(TZ=Europe/Istanbul date +%F)`. Dünün verisi yoksa (1. rutin çalışmamış) önce `npm run -s pilot -- gun` çalıştır ve bunu raporda belirt.

`npm run -s pilot -- ozet` ile veri kaynağını gör. `bulut.json` var ama komutlar ortam değişkeni eksik ya da Supabase'e ulaşılamıyor diyorsa ajanları başlatma: kısa bir rapor yaz (karar: "Hazır değil — pilot ortamı bulut verisine ulaşamıyor", hata metni aynen) ve 6. adıma geç. JSON'a geri dönme.

## 1. Otomatik kontroller

```bash
mkdir -p pilot-data/gunluk/$GUN
npm run -s pilot -- kontrol --cikti pilot-data/gunluk/$GUN/kontrol.md
```
Her KALDI satırı en az "orta" önemde bir bulgudur (tekrarlıyorsa `bulgular.json`'daki kaydı güncelle). Bulutta ilk satır (stdio) Claude Desktop'taki gerçek kurulumu dener: MCP paketi bir personanın Supabase hesabıyla bağlanır; RLS ve üyelik satırları da bu modda eklenir.

## 2. Rol ajanları (5 ajan, tek tur, paralel)

`npm run -s pilot -- personalar` ile kimlikleri al. Her persona için **Agent** aracıyla bir alt ajan başlat (beşini tek mesajda, paralel; `model: "sonnet"`). İkinci tur yoktur; ajanlara sonradan mesaj gönderme. Her ajana şunları ver:

- Kimliği: ad, unvan, karakter, günlük işler (personalar çıktısından).
- Bugün: `$GUN`; günün akışı `pilot-data/olaylar/<son iş günü>.md`, yeni Confluence notları `pilot-data/confluence/`.
- **Gelen kutusu:** önceki günlerin `pilot-data/gunluk/*/sohbet.md` dosyalarında bu kişiye yazılmış ve henüz yanıtlanmamış mesajlar (en çok son 3 iş günü).
- Nasıl çalışacağı:
  ```
  Uygulamayı YALNIZ şu komutla kullan (kimliğin sabittir, başkası adına çağırma):
    npm run -s pilot -- araclar <persona>
    npm run -s pilot -- arac <persona> <araç> '<json argümanlar>'
  Değişiklik: önce --onayla OLMADAN çağırıp öneriyi gör; rolün ve günün durumu
  gerektiriyorsa aynı çağrıyı --onayla ile yinele (gerçek bir kullanıcının onaylaması gibi).
  Jira aktarımı (jira_aktar) dahil günde en çok 3 değişiklik yap. Dosyaları doğrudan düzenleme.
  ```
- Proje yöneticileri (elif, burak) için: güne `jira_aktar` önizlemesiyle başla; önizleme mantıklıysa (yeni/güncellenecek kayıt sayıları dünkü Jira akışıyla tutarlı mı?) `--onayla` ile aktar, sonra diğer işlere geç. Aktarım yapılmazsa projenin görevleri bayat kalır; bu da bir gözlemdir.
- Görev: günlük işlerinden 3–5'ini gerçekten yap (en az 6, en çok 15 araç çağrısı). Gerçek bir kullanıcı gibi davran: önce genel tabloya bak, sonra ayrıntıya in. Sayıları birbiriyle ve günün akışıyla karşılaştır (ör. olaylar dosyasında kapanan kayıt, aktarımdan sonra görev listesinde kapanmış görünüyor mu? Jira worklog saatleri gerçekleşen adam-ayla uyumlu mu?). Rolünün göremeyeceği bir şeyi istemeyi de bir kez dene ve uygulamanın tepkisini not et. Gelen kutusundaki mesajları yanıtla (rakam veriyorsan araçtan al).
- İstenen çıktı (yalnız bu JSON, başka metin yok):
  ```json
  {
    "persona": "elif",
    "yapilanlar": [{"is": "Jira'dan güncelledim", "araclar": ["jira_aktar"], "sonuc": "3 yeni, 11 güncellenen kayıt"}],
    "degisiklikler": [{"arac": "jira_aktar", "ozet": "…", "uygulandi": true}],
    "bulgular": [{
      "tur": "hata | tutarsizlik | eksik_ozellik | kullanilabilirlik | oneri",
      "onem": "yuksek | orta | dusuk",
      "baslik": "…",
      "kanit": "komut + çıktıdan kısa alıntı",
      "beklenen": "…", "gerceklesen": "…"
    }],
    "yanitlar": [{"kime": "selin", "mesaj_tarihi": "GG", "metin": "…"}],
    "mesajlar": [{"kime": "selin", "metin": "Onur bu ay ATLAS + KALKAN'da 1,2 AA görünüyor; ATLAS'ta 0,2 azaltabilir miyiz?"}],
    "memnuniyet": 7,
    "gunun_notu": "Bir cümle: bugün uygulama işimi ne kadar kolaylaştırdı?"
  }
  ```
Her ajanın çıktısını `pilot-data/gunluk/$GUN/<persona>.json` olarak kaydet.

## 3. Yazışmalar (bir sonraki güne)

Ajanların `yanitlar` ve `mesajlar` alanlarını `pilot-data/gunluk/$GUN/sohbet.md` dosyasına yaz:
```markdown
**Elif → Selin**: Onur bu ay …            (yeni mesaj — Selin yarın yanıtlar)
**Selin → Elif** (yanıt, GG tarihli mesaja): …
```
Yanıtlanan eski mesajlar yanıtlanmış sayılır; yanıtsız kalanlar ertesi gün yeniden gelen kutusuna girer (en çok 3 iş günü, sonra "yanıtsız kaldı" diye rapora yaz).

## 4. Bulguları doğrula ve birleştir

- Her bulguyu kendin yeniden üret (aynı komutu çalıştır). Üretilemeyenleri "doğrulanamadı" olarak işaretle, rapora ayrı yaz.
- Ajanın yanlış anladığı (ör. rol gereği görmemesi gereken veriyi göremedi) bulguları ele: bu bir **beklenen davranış**tır, ama açıklama yetersizse "kullanılabilirlik" bulgusu olarak kalabilir.
- `pilot-data/bulgular.json` dosyasını güncelle (yoksa oluştur):
  ```json
  [{"id": "B-001", "baslik": "…", "tur": "…", "onem": "…", "ilk": "GG", "son": "GG", "gun_sayisi": 3, "durum": "acik | kapandi", "kanit": "…", "kim": ["elif"]}]
  ```
  Aynı bulgu tekrar ederse yeni kayıt açma; `son` ve `gun_sayisi`'nı güncelle. Bugün üretilemeyen eski bulguyu `kapandi` yap.

## 5. Günlük rapor

`pilot-data/raporlar/$GUN.md`:

```markdown
# Pilot raporu — GG

**Karar önerisi:** Hazır / Koşullu / Hazır değil — tek cümle gerekçe.

## Özet
- Otomatik kontroller: X/Y geçti
- Kullanıcılar: 5 ajan, N araç çağrısı, M değişiklik (Jira aktarımı: elif ✓/✗, burak ✓/✗); ortalama memnuniyet …/10
- Bulgular: yeni …, süren …, kapanan … (yüksek önemde açık: …)

## Bulgular
| ID | Önem | Tür | Başlık | Kim | Kaç gündür | Kanıt |

## Kullanıcıların günü
Persona başına 2–3 cümle: ne yaptı, neyi kolay buldu, nerede takıldı.

## Yazışmalar
Yeni mesajlar, verilen yanıtlar, yanıtsız kalanlar (sohbet.md bağlantısı).

## Veri
Veri kaynağı (Supabase çalışma alanı kimliği ya da JSON). Günün Jira akışından öne çıkanlar (olaylar dosyası); veride gerçekçi olmayan bir şey göze battıysa Jira ajanı için not.
```

`pilot-data/raporlar/OZET.md` tablosuna bir satır ekle (yoksa başlığıyla oluştur):
`| GG | kontrol X/Y | yeni bulgu | açık yüksek | memnuniyet | karar |`

**Karar ölçütü:** "Hazır" = son 3 iş günü kontrollerin tamamı geçti ve açık yüksek önemde bulgu yok. "Koşullu" = kontroller geçiyor ama açık orta/yüksek bulgu var. "Hazır değil" = kontrol kalıyor ya da doğrulanmış yüksek önemde hata var.

## 6. Kaydet, gönder, bildir

```bash
git add -A pilot-data && git commit -m "Pilot raporu: $GUN" && git push -u origin claude/pilot-veri
```
Ağ hatasında 2, 4, 8, 16 sn bekleyerek en çok 4 kez yeniden dene.

Rapor yorumu (kurulumda seçildiyse): PR'a (kaannsckin/pmasistance_mks, `claude/zen-pasteur-6g9z3i` dalının açık PR'ı) raporun **Özet** bölümünü ve karar önerisini kısa bir yorum olarak yaz; tam rapora `claude/pilot-veri` dalındaki dosya bağlantısını ver. Yorumun sonuna Claude Code imzasını ekle. PR kapandıysa yorum yazma.

Son olarak sohbete 3–5 satırlık özet yaz: karar önerisi, kontrol sonucu, en önemli 3 bulgu.
