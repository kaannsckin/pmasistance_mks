# Backlog

Son güncelleme: 12 Ekim 2026 (BL-21, BL-11, BL-09, BL-07, BL-08, BL-23 yapıldı; BL-10 pilot sonrasına alındı; BL-24 eklendi)

24 işin 12'si yapıldı (danışman raporundaki dört P0'ın tamamı dahil), 12'si açık. K0'dan önce zorunlu olan tek iş BL-18; demo yolunu doğrudan etkileyen açık iş kalmadı. BL-14 dışındaki açık işler pilot sonrasına planlı. Numaralar [`pilot/SENARYOLAR.md`](../../pilot/SENARYOLAR.md)'nin andığı BL-07, BL-08 ve BL-14 ile aynıdır.

**Durum değerleri:** Açık · Sürüyor · Karar bekliyor · Yapıldı. Bir iş yapıldığında satır silinmez: durum `Yapıldı` olur, kanıt sütununa commit ya da test sonucu yazılır ve satır "Yapılanlar" tablosuna taşınır. Yeni iş bir sonraki boş numarayı alır (BL-25).

## Açık işler

| ID | İş | Neden / kaynak | Öncelik | Durum | Hedef | Kanıt |
| --- | --- | --- | --- | --- | --- | --- |
| BL-18 | 9 Ekim bulgularının kapanış doğrulaması (B-001, B-003–B-006, B-008, B-011–B-013) | Dokuz düzeltme kodda; hiçbiri canlı koşuda yeniden üretilmedi, `bulgular.json`'da hepsi açık | P0 | Açık | K0 (15 Ekim) | Rutin 2: `bulgular.json` güncellemesi |
| BL-10 | Önerilen RAG kuralı (geciken oran, SPI/CPI eşikleri, yüksek risk, engelleyici hata); PY farklı seçerse gerekçe zorunlu | B-002, danışman Soru 7; NEHİR algı farkı (G4). Karar (12 Ekim): pilot sonrasına; pilotta RAG'ı PY girer, verinin RAG'la çelişkisi demoda sağlık skoruyla gösterilir | P1 | Açık | Pilot sonrası | — |
| BL-12 | Yapılandırılmış talep: kaynak talebi ve açıklama talebi, "Yönetimden beklentiler"e bağlı | B-007, danışman Soru 10; yazışma bugün pilot dosyasında | P2 | Açık | Pilot sonrası | — |
| BL-13 | Bölüm sorumlusu diğer bölümlerin boş kapasitesini rol bazında, adsız görür | Danışman Soru 8; S10'daki U340 çatışması | P2 | Açık | Pilot sonrası | — |
| BL-14 | Simülasyonda arife yarım gün (28 Ekim) | S5; takvim tutarlılığı | P2 | Açık | 27 Ekim'den önce ya da hiç | — |
| BL-15 | Araç kataloğu boyutu: sınır 16 000'den 18 000 karaktere çıkarıldı | Yeni PY yazma araçları; müdür rolünün kataloğu etkilenmedi | P2 | Açık | Pilot sonrası | `utils/ai/tools.test.ts` |
| BL-16 | Uzak MCP (HTTP + OAuth): claude.ai web ve mobilden bağlantı | Bugün yalnız yerel stdio (Claude Desktop, Claude Code); demodaki canlı soru masaüstünden sorulur | P2 | Açık | Pilot sonrası | [`docs/MCP_KURULUM.md`](../MCP_KURULUM.md) |
| BL-17 | JSON yedek yükleme yalnız "yedek" yetkili kimlikte görünüyor | Dosya modunda izleme talimatı bu düğmeye dayanıyor; `demo-testi` veriyi IndexedDB'ye doğrudan yazarak aşıyor | P2 | Açık | Pilot sonrası | — |
| BL-19 | RAG Türkçe değer de kabul eder | B-009 | P2 | Açık | Pilot sonrası | — |
| BL-20 | Plan kilidi önceden görünür (öneri denenmeden) | B-014 | P2 | Açık | Pilot sonrası | — |
| BL-22 | Ay içi tahmini gerçekleşen adam-ay: haftalık rapor worklog'undan, ayrı görünümle; ay kapanışında PYB onayıyla kesin | Danışman Soru 9; BL-07 son kapanan ay kuralıyla kapandı, ay içi görünürlük hâlâ yok | P2 | Açık | Pilot sonrası | — |
| BL-24 | Geçmiş haftalık raporlarda kalite dağılımı (iyi, orta, zayıf) | Danışman raporu, mock veri tablosu: simülasyon geçmiş raporları kalıp maddelerle yazıyor ("… tamamlandı"), rapor AI'ının farkı görünmüyor. Ajanlı dönemde persona raporlarını ajanlar yazdığı için demo etkilenmez; geçmişi değiştirmek `baslat --zorla` ister | P2 | Açık | Pilot sonrası | — |

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
