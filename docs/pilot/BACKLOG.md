# Backlog

Son güncelleme: 12 Ekim 2026 (BL-21, BL-11, BL-09, BL-07, BL-08, BL-23 yapıldı; BL-10 pilot sonrasına alındı; BL-24 eklendi) · 13 Ekim (BL-14, BL-25, BL-17, BL-19, BL-20, BL-22, BL-24 yapıldı; takvim bir hafta kaydırıldı, uygulama haftası planlandı)

25 işin 19'u yapıldı (danışman raporundaki dört P0'ın tamamı dahil), 6'sı açık. K0'dan (22 Ekim) önce zorunlu olan tek iş BL-18; demo yolunu doğrudan etkileyen açık iş kalmadı. Altı açık iş uygulama haftasına alındı (aşağıda). Numaralar [`pilot/SENARYOLAR.md`](../../pilot/SENARYOLAR.md)'nin andığı BL-07, BL-08 ve BL-14 ile aynıdır.

**Durum değerleri:** Açık · Sürüyor · Karar bekliyor · Yapıldı. Bir iş yapıldığında satır silinmez: durum `Yapıldı` olur, kanıt sütununa commit ya da test sonucu yazılır ve satır "Yapılanlar" tablosuna taşınır. Yeni iş bir sonraki boş numarayı alır (BL-26).

## Uygulama haftası (13–21 Ekim)

Ajan sisteminin çalışmasında bir haftalık engel var (13 Ekim); pilot takvimi yedi gün kaydırıldı ([PILOT_NOTU.md](./PILOT_NOTU.md)). Bu hafta rutinler koşmaz; uygulamanın eksikleri kapatılır. Sıra, demoya ve pilota katkıya göre:

| Sıra | İş | Büyüklük | Neden bu hafta |
| --- | --- | --- | --- |
| 1 | ~~BL-17 JSON yedek yükleme yetkisi~~ (yapıldı) | Küçük | İzleme ve geri yükleme talimatı bu düğmeye dayanıyor |
| 2 | ~~BL-19 RAG Türkçe değer~~ (yapıldı) | Küçük | Ajanın Türkçe RAG'ı sessizce reddedilmesin (B-009) |
| 3 | ~~BL-20 Plan kilidi önceden görünür~~ (yapıldı) | Küçük | Ajan ve kullanıcı kilitli plana boşuna öneri yazmasın (B-014) |
| 4 | ~~BL-22 Ay içi tahmini gerçekleşen~~ (yapıldı) | Orta | Ay ortasında EVM ve maliyet "son kapanan ay"da kalıyor; S6'nın erken uyarısı ekranda görünür |
| 5 | ~~BL-24 Geçmiş raporlarda kalite dağılımı~~ (yapıldı) | Orta | K0'da zaten `baslat --zorla` ile yeniden kurulum var; geçmişi değiştirmenin bedeli bu hafta sıfır |
| 6 | BL-13 Diğer bölümlerin boş kapasitesi (rol bazında, adsız) — karar bekliyor | Orta | S8 ve S10'daki kaynak çatışmasını Selin rakamla çözebilsin |

Kurallar:
- Her iş ayrı PR ile main'e girer; rutinler her koşuda main'i birleştirir. **Simülasyonu değiştiren iş (BL-24) 21 Ekim akşamına kadar main'de olmalı**, yoksa K0 kurulumuna giremez ve pilot sonrasına kalır.
- MCP araç sözleşmesini değiştiren iş (BL-19, BL-20, BL-13) K0'dan önce girer; ajan talimatı gerekiyorsa aynı PR'da `pilot/RUTIN_2_KULLANICILAR.md` güncellenir. K0'dan sonra araç sözleşmesi değişmez, yalnız hata düzeltmesi girer.
- BL-12 (yapılandırılmış talep) büyük iş: uygulama haftasında başlamaz; pilot sonrası. BL-10 12 Ekim kararıyla pilot sonrası. BL-15, BL-16 altyapı, pilot sonrası.

## Açık işler

| ID | İş | Neden / kaynak | Öncelik | Durum | Hedef | Kanıt |
| --- | --- | --- | --- | --- | --- | --- |
| BL-18 | 9 Ekim bulgularının kapanış doğrulaması (B-001, B-003–B-006, B-008–B-014) | On iki düzeltme kodda; hiçbiri canlı koşuda yeniden üretilmedi, `bulgular.json`'da hepsi açık | P0 | Açık | K0 (22 Ekim) | Rutin 2: `bulgular.json` güncellemesi |
| BL-10 | Önerilen RAG kuralı (geciken oran, SPI/CPI eşikleri, yüksek risk, engelleyici hata); PY farklı seçerse gerekçe zorunlu | B-002, danışman Soru 7; NEHİR algı farkı (G4). Karar (12 Ekim): pilot sonrasına; pilotta RAG'ı PY girer, verinin RAG'la çelişkisi demoda sağlık skoruyla gösterilir | P1 | Açık | Pilot sonrası | — |
| BL-12 | Yapılandırılmış talep: kaynak talebi ve açıklama talebi, "Yönetimden beklentiler"e bağlı | B-007, danışman Soru 10; yazışma bugün pilot dosyasında | P2 | Açık | Pilot sonrası | — |
| BL-13 | Bölüm sorumlusu diğer bölümlerin boş kapasitesini rol bazında, adsız görür | Danışman Soru 8; S10'daki U340 çatışması. 13 Ekim incelemesi: bugün bölüm sorumlusu diğer bölümlerdeki kişileri adıyla görüyor (`uygun_kisi_bul`, `doluluk_analizi`, `kisi_profili`); iş, yeni görünümden çok bu adları gizlemek. Bu, gömülü bulgulardan G1, G2 ve G6'nın Selin tarafından adla bulunmasını engeller (Aslı Çakır, Deniz Yavuz U340; Hakan Öztürk, Barış Güneş, Merve Aslan U320). Araç kataloğu 17 673/18 000 karakter: yeni araç sığmaz, mevcut araçların çıktısı değişir | P2 | Karar bekliyor | Uygulama haftası ya da pilot sonrası | — |
| BL-15 | Araç kataloğu boyutu: sınır 16 000'den 18 000 karaktere çıkarıldı | Yeni PY yazma araçları; müdür rolünün kataloğu etkilenmedi | P2 | Açık | Pilot sonrası | `utils/ai/tools.test.ts` |
| BL-16 | Uzak MCP (HTTP + OAuth): claude.ai web ve mobilden bağlantı | Bugün yalnız yerel stdio (Claude Desktop, Claude Code); demodaki canlı soru masaüstünden sorulur | P2 | Açık | Pilot sonrası | [`docs/MCP_KURULUM.md`](../MCP_KURULUM.md) |

## Yapılanlar

| ID | İş | Neden / kaynak | Öncelik | Durum | Hedef | Kanıt |
| --- | --- | --- | --- | --- | --- | --- |
| BL-01 | Senaryo komutu: kritik hata, izin, fazla mesai, teklif kazanımı | S1, S3, S6, S8–S10 Jira'da iz bırakmalı | P0 | Yapıldı | K0 | 1c00b80; senaryo testleri 31/31 |
| BL-02 | Mock veri kalibrasyonu: 8 saatlik gün, kurum görevleri düşülmüş kapasite, istek ve risk geçmişi; rapor günü Perşembe | Doluluk %49 → %88, kapasite-talep 2 rolde açık, CPI 0,84–1,03 | P0 | Yapıldı | K0 | 1c00b80; `kontrol` 30/30 (dosya modu) |
| BL-03 | MCP haftalık rapor araçları: taslak, kaydet/gönder, onay/iade, yayın | PY'nin ana haftalık çıktısı; puanın 20'si | P0 | Yapıldı | K0 | ccf8216; uçtan uca rapor akışı testi |
| BL-04 | Demo yolu tarayıcı testi (`pilot demo-testi`) | Demo arayüzde; 4 persona, 2 arayüz, sağlık puanı MCP ile karşılaştırılır | P0 | Yapıldı | K0 | 43a2c3a; 28/28 adım |
| BL-05 | Risk güncelleme/kapatma, müşteri isteği kararı, proje notu araçları | Ajanın yazmadığı karar demoda görünmez | P0 | Yapıldı | K0 | 81e104c |
| BL-06 | Dondur / geri-yükle (`pilot dondur`, `pilot geri-yukle`) | Demo günü güvenliği | P1 | Yapıldı | K0 | bbe04f4 |
| BL-21 | Arayüzdeki rapor biçim denetimi proje adlarını (NEHİR) kısaltma saymaz | MCP'de düzeltilmişti (ccf8216); arayüz aynı denetimi proje adları olmadan çalıştırıyordu: rapor hata gösterip ilerletilemiyordu | P1 | Yapıldı | K1 (22 Ekim) | Ortak `lintDictionary` (editör, liste, gönderim kapısı, MCP); `weeklyReport.test.ts`; 96aec77 |
| BL-11 | Teklif aşamasındaki proje sağlık skoru almaz ("—") | YILDIZ skoru 100, güven düşük: "teklifteki proje en sağlıklısı mı?" | P1 | Yapıldı | K3 (19 Kasım) | Portföy ortalaması, dağılım, `portfoy_ozeti` ve proje kartı teklifi dışarıda bırakır; `executive.test.ts`, `execOverview.test.ts`; 6ec0362 |
| BL-09 | Maliyet sapması aynı dönemin planıyla hesaplanır | `maliyet_raporu` yıllık planı (17,81 M TL) Ocak–Eylül gerçekleşeniyle kıyaslıyordu: −6,01 M TL | P1 | Yapıldı | K3 (19 Kasım) | Sapma = gerçekleşen − gerçekleşeni girilmiş son aya kadarki plan; yönetim kartı, Excel, sunum ve `maliyet_raporu` dönemi gösterir; `costing.test.ts`; 180074e |
| BL-07 | EVM'nin durum ayı gerçekleşeni girilmiş son ay: açık ayın planı ve ilerlemesi sayılıp gerçekleşeni 0 kalmaz | B-010; Ekim CPI'si ay ortasında şişkin görünüyordu (G7). Karar (12 Ekim): son kapanan ay kuralı; ay içi tahmin BL-22'ye | P1 | Yapıldı | K3 (19 Kasım) | `closedStatusMonth` (EVM, sağlık, yönetim, `evm_analizi`, `proje_detayi`); `evm.test.ts`; G7 kaldırıldı, K2 ölçütü 3/6; 57ebb24 |
| BL-08 | Stil, ikon ve Excel/CSV kitaplıkları pakete gömülü: Tailwind derleme anında, Font Awesome, PapaParse, SheetJS npm'den | Kurum ağı CDN'i engellerse demo ekranı biçimsiz kalıyordu; pilot ortamında 403 alındı | P1 | Yapıldı | K3 (19 Kasım) | `demo-testi` 28/28, ekranlar biçimli (CDN'siz ortamda); dışarıda yalnız yazı tipi ve sekme simgesi kaldı; 6029303 |
| BL-23 | İkon glifleri ekran okuyucudan gizlendi; yalnız ikonlu düğmelere ad verildi | BL-08 sırasında bulundu: ekran okuyucu "[glif] Pano" okuyordu, ikonlu kapatma düğmelerinin adı yoktu | P2 | Yapıldı | Pilot sonrası (öne alındı) | Klasik arayüzde 391 Font Awesome ikonuna `aria-hidden`, 84 yalnız ikonlu düğmeye `aria-label` (varsa `title`'dan); Notlar'daki yapılacak kutuları klavyeyle işaretlenir (`role="checkbox"`). Modern arayüzün ikonları zaten gizliydi. `demo-yolu` glif ayıklaması kaldırıldı, 28/28; 42272f6 |
| BL-14 | Simülasyonda arife yarım gün (28 Ekim) | S5; takvim tutarlılığı. Karar (13 Ekim): 27 Ekim'den önce | P2 | Yapıldı | 27 Ekim'den önce | `isHalfDay`: worklog ve yeni kayıt yarıya iner, 13:00'ten sonra Jira, not ve rapor kaydı yok; 29 Ekim tatil olduğundan 44. haftanın raporu arifede öğleden önce. 27 Ekim'e kadarki olaylar eskisiyle birebir aynı (geçmiş değişmez); `kontrol` 30/30; `sim.test.ts`, `planningData.test.ts`. Uygulamanın Ekim iş günü (21) değişmedi: yüklenen 2026 takvimi 28 Ekim'i tam gün sayıyor, Ekim gerçekleşeni yarım gün kadar (≈%2) düşük çıkar; a1373f1 |
| BL-25 | Ekim 2026 çalışma günü 20,5: 28 Ekim arifesi yarım gün | Karar (13 Ekim). Uygulamanın 2026 takvimi Ekim'i 21 gün sayıyordu; Mart ve Mayıs arifeleri zaten yarımdı | P2 | Yapıldı | — | `TR_WORKDAYS_2026[10]` = 20,5; `effectiveWorkdays` (arife 0,5 gün) 12 ayda takvimle birebir; simülasyon ay kapanışı ve izin AA'sı bunu kullanır; `planningData.test.ts`, `billedHours.test.ts`; ac28e98 |
| BL-17 | Yerel modda yedek işlemlerine giden yol görünür | JSON yedek yükleme yalnız Admin yetkisiyle görünüyordu; dosya modunda izleme talimatı ve MCP kurulumu (JSON yedeği) bu düğmeye dayanıyor | P2 | Yapıldı | Uygulama haftası (21 Ekim) | Yetki modeli değişmedi: yetkisiz kimlikte, bulut bağlı değilken klasik üst çubukta ve modern ⋯ menüsünde "Yedek al / yükle — Admin kimliğiyle" profil değiştiriciyi açar; tarayıcıda PY → Admin → ⋯ › Yedekten yükle yolu denendi. `pilot/README.md`, `docs/MCP_KURULUM.md` talimatı; `demo-testi` 28/28; 2a13a98 |
| BL-19 | Seçenekli parametrelerde Türkçe değer kabul edilir (RAG dahil) | B-009: `oner_rag_guncelle` "Sarı" değerini reddediyordu | P2 | Yapıldı | Uygulama haftası (21 Ekim) | `enumAliases`: Türkçe karşılık ve büyük/küçük harf koda çevrilir (RAG, risk ve görev durumu, öncelik, istek durumu); eşanlam yalnız o parametrenin seçeneğindeyse; tanınmayan değer yine açık hata. MCP ve uygulama içi asistan aynı yol; `enumAliases.test.ts`, `args.test.ts`, `planasistan.test.ts`, `tools.test.ts`; 28e568a |
| BL-20 | Plan kilidi öneri denenmeden görünür | B-014: Selin kilidi ancak tahsis önerisi reddedilince öğrendi | P2 | Yapıldı | Uygulama haftası (21 Ekim) | `proje_listesi` ve `kisi_profili` (proje başına) `plan_kilidi` döner (`proje_detayi` ve `tahsis_ozeti` zaten dönüyordu); `tools.test.ts`; 28e568a |
| BL-22 | Ay içi tahmini gerçekleşen adam-ay, ayrı görünümle | Danışman Soru 9; BL-07 son kapanan ay kuralıyla kapandı, ay içi görünürlük yoktu | P2 | Yapıldı | Uygulama haftası (21 Ekim) | `utils/inMonthActual`: haftalık rapor worklog'undan saat / (8 × ayın iş günü); plan worklog'u olan iş günlerine oranlanır. EVM'e girmez. `evm_analizi` › `ay_ici_tahmin`; klasik EVM paneli tablosu; modern proje özetinde sapma %10'u aşarsa ipucu. MCP haftalık rapor önerisi haftanın Jira worklog'unu raporla saklar. `inMonthActual.test.ts`, `planasistan.test.ts`; c133376 |
| BL-24 | Geçmiş haftalık raporlarda kalite dağılımı (iyi, orta, zayıf) | Danışman raporu, mock veri tablosu: geçmiş raporlar tek kalıptı, rapor AI'ının farkı görünmüyordu | P2 | Yapıldı | Uygulama haftası (21 Ekim; K0 yeniden kurulumuyla girer) | İyi: saat ve tahminli kapanış, gecikme rakamı, yeniden açılan kayıt, tarihli plan; orta: eski kalıp; zayıf: kalıp cümle. 22 Ekim kurulumunda 42. haftaya kadar 76 rapor: 25 iyi, 28 orta, 23 zayıf (Burak çoğunlukla orta/zayıf). Ayrı rastgele akış: 30 Kasım doğrulaması değişmedi; hiçbir raporda biçim hatası yok (`sim.test.ts`); `kontrol` 30/30; 2b3f5b4 |
