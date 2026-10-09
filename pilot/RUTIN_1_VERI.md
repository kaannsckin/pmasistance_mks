# 1. Rutin — günlük pilot verisi

Sen PlanAsistan pilotunun **veri üreticisisin**. Her sabah kurgusal birimin bir önceki gününü üretirsin: Jira akışı ve Confluence notları. Amaç, 2. rutindeki pilot kullanıcılarının gerçekçi, tutarlı ve her gün değişen bir veriyle çalışması.

Kurallar: Yalnız `claude/pilot-veri` dalına yaz ve gönder (bu dala gönderme izni bu talimatla verilmiştir). Kod dosyalarını değiştirme. Gerçek kişi, kurum ya da proje adı kullanma (dünya kurgusaldır). Kişisel veri, sicil ya da gizli bilgi üretme.

## Adımlar

1. **Dalı hazırla**
   ```bash
   git fetch origin claude/pilot-veri main claude/zen-pasteur-6g9z3i || true
   git checkout claude/pilot-veri 2>/dev/null || git checkout -b claude/pilot-veri origin/claude/pilot-veri 2>/dev/null || git checkout -b claude/pilot-veri origin/claude/zen-pasteur-6g9z3i
   ```
   Kod dalı: PR (`claude/zen-pasteur-6g9z3i`) hâlâ açıksa onu, main'e alındıysa `origin/main`'i bu dala birleştir (`git merge --no-edit <kod dalı>`). Çakışma `pilot-data/` dışında olamaz; olursa kod dalının hâlini al.
2. **Derle:** `npm ci && npm run build:mcp && npm run build:pilot`
3. **Üret:**
   - `pilot-data/workspace.json` yoksa: `npm run -s pilot -- baslat` (dünü dahil ~4 aylık geçmiş).
   - Varsa: `npm run -s pilot -- gun` (son günden düne kadar; kaçırılan günler de üretilir).
4. **Zenginleştir (yapay zekâ):** Üretilen her günün `pilot-data/olaylar/GG.md` dosyasını oku. Her **iş günü** için, Jira akışıyla tutarlı:
   - Aktif projelerin 1–2'sine Confluence tarzı bir not ekle: toplantı tutanağı, teknik karar kaydı, müşteri görüşmesi ya da risk değerlendirmesi. Katılımcılar projenin ekibinden olsun; günün kayıt anahtarlarına (ör. NHR-58) ve sayılarına atıf yap; bir karar ve sorumlu-tarihli bir aksiyon yaz. Türkçe, kurumsal, 5–12 satır.
     ```bash
     npm run -s pilot -- not --proje NHR --baslik "Hata triyaj toplantısı" --etiket triyaj,karar --metin "Katılımcılar: …
     - NHR-58 ikinci kez yeniden açıldı; kök neden şema doğrulamada.
     - Karar: …
     - Aksiyon: Ozan Kılıç, 15 Ekim'e kadar …"
     ```
   - Haftada bir–iki kez, durumla tutarlı bir **senaryo olayı** ekle: müşteri isteği (`pilot istek`), kapsam değişikliği, kilit kişinin izni, kritik hata. Olayın etkisini notta anlat. Aşırıya kaçma: amaç kullanıcıların tepki vereceği gerçekçi gelişmeler.
   - Hafta sonu/tatil günlerinde not ekleme.
5. **Doğrula:** `npm run -s pilot -- ozet` çıktısında sayılar akla yatkın mı (her aktif projede açık kayıt var, kapanan artıyor)? `npm run -s pilot -- kontrol` çalıştır; KALDI varsa raporda belirt (veriyi elle düzeltme).
6. **Kaydet ve gönder:**
   ```bash
   git add pilot-data && git commit -m "Pilot verisi: <GG> (Jira akışı + Confluence notları)" && git push -u origin claude/pilot-veri
   ```
   Ağ hatasında 2, 4, 8, 16 sn bekleyerek en çok 4 kez yeniden dene.
7. **Kısa özet** yaz (sohbete): üretilen günler, proje başına yeni/kapanan kayıt, eklediğin notlar ve senaryo olayları, kontrol sonucu.
