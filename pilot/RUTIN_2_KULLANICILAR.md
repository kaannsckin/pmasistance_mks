# 2. Rutin — pilot kullanıcıları (günlük test ve rapor)

Sen PlanAsistan pilotunun **test koordinatörüsün**. Beş pilot kullanıcısı (yapay zekâ ajanı) uygulamayı kendi rolleriyle, MCP sunucusu üzerinden — Claude'un bağlandığı sunucunun aynısıyla — bir gün boyunca kullanır, birbirine yazar ve yanıtlar. Sen kontrolleri çalıştırır, ajanları yönetir, bulguları doğrular ve günün raporunu yazarsın. Amaç: **PR main'e alınmaya hazır mı?** sorusuna her gün kanıtla yanıt vermek.

Kurallar: Yalnız `claude/pilot-veri` dalına yaz ve gönder (bu dala gönderme izni bu talimatla verilmiştir). Kod dosyalarını değiştirme; hata bulursan düzeltme, raporla. Veri yalnız `pilot-data/` altında değişir. Bulguları abartma ya da uydurma: her bulgu bir araç çıktısına, komuta ya da dosyaya dayanmalı.

## 0. Hazırlık

```bash
git fetch origin claude/pilot-veri main claude/zen-pasteur-6g9z3i
git checkout claude/pilot-veri && git pull --ff-only origin claude/pilot-veri
```
Kod dalını (PR açıksa `origin/claude/zen-pasteur-6g9z3i`, main'e alındıysa `origin/main`) birleştir, sonra `npm ci && npm run build:mcp && npm run build:pilot`. `GUN=$(TZ=Europe/Istanbul date +%F)`. Bugünün verisi yoksa (1. rutin çalışmamış) önce `npm run -s pilot -- gun` çalıştır ve bunu raporda belirt.

## 1. Otomatik kontroller

```bash
mkdir -p pilot-data/gunluk/$GUN
npm run -s pilot -- kontrol --cikti pilot-data/gunluk/$GUN/kontrol.md
```
Her KALDI satırı en az "orta" önemde bir bulgudur (tekrarlıyorsa `bulgular.json`'daki kaydı güncelle).

## 2. Birinci tur — sabah işleri (5 ajan, paralel)

`npm run -s pilot -- personalar` ile kimlikleri al. Her persona için **Agent** aracıyla bir alt ajan başlat (beşini tek mesajda, paralel; `model: "sonnet"`). Her ajana şu bilgileri ver:

- Kimliği: ad, unvan, karakter, günlük işler (personalar çıktısından).
- Bugün: `$GUN`; günün akışı `pilot-data/olaylar/<dün ve önceki iş günü>.md`, yeni Confluence notları `pilot-data/confluence/`.
- Gelen kutusu: dünkü `pilot-data/gunluk/<önceki gün>/sohbet.md` içinde bu kişiye yazılmış ve yanıtlanmamış mesajlar.
- Nasıl çalışacağı:
  ```
  Uygulamayı YALNIZ şu komutla kullan (kimliğin sabittir, başkası adına çağırma):
    npm run -s pilot -- araclar <persona>
    npm run -s pilot -- arac <persona> <araç> '<json argümanlar>'
  Değişiklik: önce --onayla OLMADAN çağırıp öneriyi gör; kendi rolün ve günün durumu
  gerektiriyorsa aynı çağrıyı --onayla ile yinele (gerçek bir kullanıcının onaylaması gibi).
  Günde en çok 2 değişiklik yap. Dosyaları doğrudan düzenleme.
  ```
- Görev: günlük işlerinden 3–5'ini gerçekten yap (en az 6, en çok 15 araç çağrısı). Gerçek bir kullanıcı gibi davran: önce genel tabloya bak, sonra ayrıntıya in. Sayıları birbiriyle ve günün akışıyla karşılaştır (ör. olaylar dosyasında kapanan kayıt, görev listesinde kapanmış görünüyor mu?). Rolünün göremeyeceği bir şeyi istemeyi de bir kez dene ve uygulamanın tepkisini not et.
- İstenen çıktı (yalnız bu JSON, başka metin yok):
  ```json
  {
    "persona": "elif",
    "yapilanlar": [{"is": "ATLAS geciken görevleri inceledim", "araclar": ["gorev_ara"], "sonuc": "3 geciken; en eskisi ATL-55"}],
    "degisiklikler": [{"arac": "oner_risk_ekle", "ozet": "…", "uygulandi": true}],
    "bulgular": [{
      "tur": "hata | tutarsizlik | eksik_ozellik | kullanilabilirlik | oneri",
      "onem": "yuksek | orta | dusuk",
      "baslik": "…",
      "kanit": "komut + çıktıdan kısa alıntı",
      "beklenen": "…", "gerceklesen": "…"
    }],
    "mesajlar": [{"kime": "selin", "metin": "Onur bu ay ATLAS + KALKAN'da 1,2 AA görünüyor; ATLAS'ta 0,2 azaltabilir miyiz?"}],
    "memnuniyet": 7,
    "gunun_notu": "Bir cümle: bugün uygulama işimi ne kadar kolaylaştırdı?"
  }
  ```
Her ajanın çıktısını `pilot-data/gunluk/$GUN/<persona>.json` olarak kaydet. Ajan kimliklerini sakla (ikinci tur için).

## 3. İkinci tur — yazışma

Birinci turdaki `mesajlar`ı alıcılara göre topla ve `pilot-data/gunluk/$GUN/sohbet.md` dosyasına yaz (`**Elif → Selin** (09:40): …`). Mesajı olan her ajana **SendMessage** ile (aynı ajan, bağlamı korunur) kendisine gelen mesajları ilet:

```
Sana gelen mesajlar: … Rolünün gerektirdiği gibi yanıtla. Yanıtlamadan önce gerekiyorsa araçlarla
kontrol et; rakam veriyorsan araçtan al. Gerekirse bir değişiklik yap (aynı kurallar).
Çıktı: {"yanitlar": [{"kime": "...", "metin": "..."}], "degisiklikler": [...], "bulgular": [...]}
```
Yanıtları `sohbet.md`'ye ekle; yeni bulguları ilgili persona dosyasına ekle. Yanıtlarda yeni soru varsa en çok bir tur daha yap. Yanıtsız kalan mesajlar ertesi günün gelen kutusudur.

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
- Kullanıcılar: 5 ajan, N araç çağrısı, M değişiklik; ortalama memnuniyet …/10
- Bulgular: yeni …, süren …, kapanan … (yüksek önemde açık: …)

## Bulgular
| ID | Önem | Tür | Başlık | Kim | Kaç gündür | Kanıt |

## Kullanıcıların günü
Persona başına 2–3 cümle: ne yaptı, neyi kolay buldu, nerede takıldı.

## Yazışmalar
Kısa özet + sohbet.md bağlantısı.

## Veri
Günün akışından öne çıkanlar (olaylar dosyası); veride gerçekçi olmayan bir şey göze battıysa üreteç için not.
```

`pilot-data/raporlar/OZET.md` tablosuna bir satır ekle (yoksa başlığıyla oluştur):
`| GG | kontrol X/Y | yeni bulgu | açık yüksek | memnuniyet | karar |`

**Karar ölçütü:** "Hazır" = son 3 iş günü kontrollerin tamamı geçti ve açık yüksek önemde bulgu yok. "Koşullu" = kontroller geçiyor ama açık orta/yüksek bulgu var. "Hazır değil" = kontrol kalıyor ya da doğrulanmış yüksek önemde hata var.

## 6. Kaydet, gönder, bildir

```bash
git add pilot-data && git commit -m "Pilot raporu: $GUN" && git push -u origin claude/pilot-veri
```
Ağ hatasında 2, 4, 8, 16 sn bekleyerek en çok 4 kez yeniden dene.

Rapor yorumu (kurulumda seçildiyse): PR'a (kaannsckin/pmasistance_mks, `claude/zen-pasteur-6g9z3i` dalının açık PR'ı) raporun **Özet** bölümünü ve karar önerisini kısa bir yorum olarak yaz; tam rapora `claude/pilot-veri` dalındaki dosya bağlantısını ver. Yorumun sonuna Claude Code imzasını ekle. PR kapandıysa yorum yazma.

Son olarak sohbete 3–5 satırlık özet yaz: karar önerisi, kontrol sonucu, en önemli 3 bulgu.
