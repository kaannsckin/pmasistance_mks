# PlanAsistan Kullanım Kılavuzu

## Uygulamanın genel yapısı
PlanAsistan; projeleri, işgücü (adam-ay, AA) tahsisini ve portföyü tek çalışma alanında yönetir. Üst menüde çalışma alanı ekranları bulunur: Yönetim (yalnızca Müdür ve PYB Sorumlusu), Portföy, Tahsis, Takvim ve Veri Havuzu. Bir proje açıldığında ikinci satırda proje bağlam çubuğu görünür: Pano, Yol Haritası, Hedefler, Görevler, Riskler, Ekip, İstekler, Günlük ve Zekâ sekmeleri ile İş Paketleri ve Durum Raporu düğmeleri. Sağ üstte Yapılacaklar zili, bulut senkronizasyonu, kimlik (rol + kişi) seçici, JSON yedek indir/yükle, ⌘K / Ctrl+K hızlı git, veri sağlığı, denetim günlüğü, ayarlar ve hakkında düğmeleri yer alır.

## Roller ve yetkiler
Kimlik (profil), rol ve (Proje Yöneticisi ile Bölüm Sorumlusu için) havuzdaki bir kişiden oluşur. Kenar çubuğunun altındaki profil satırına (telefonda üst çubuktaki baş harflere) dokununca "Profil değiştir" penceresi açılır: proje yöneticileri, bölüm sorumluları ve admin'in tanımladığı profiller role göre gruplu ve aranabilir listelenir; listede olmayan kişi "Başka bir kişi olarak çalışın" ile seçilir. Bulut eşitleme "⋯" menüsündedir; yedek, veri sağlığı ve denetim günlüğü varsayılanda yalnız admin'dedir (yönetici konsolu → Uygulama / Denetim günlüğü).
- Müdür: her şeyi görür, girdi yapmaz; planları onaylar/kilitler.
- PYB Sorumlusu: program/portföy yöneticisi; projeleri izler, planları onaylar/kilitler, girdi yapmaz.
- PYB Destek: veri havuzu sorumlusu; personel, bölüm, rol, ünvan ve maliyetleri yönetir.
- Proje Yöneticisi: yalnızca sahibi olduğu projeleri görür ve onların görev, plan ve risklerini girer.
- Bölüm Sorumlusu: bölümündeki personelin tüm projelerdeki tahsisini girer ve izler.
- Admin: yalnız yönetici konsolunu kullanır (proje yönetimi ekranları açılmaz); yetkileri, görünümleri, haftalık rapor akışını, sağlık puanı yöntemini, profilleri, denetim günlüğünü ve uygulama araçlarını (yedek, veri sağlığı, bulut) yönetir.
Yukarıdakiler varsayılan yetkilerdir. Admin, konsolun "Yetkiler" bölümündeki rol × özellik matrisinden bir rolün yetkilerini değiştirebilir: yönetim ekranı, tüm projeleri görme, proje oluşturma, proje sahibi atama, veri havuzunu düzenleme, plan onayı, beklentileri yanıtlama, görüşme onayı, haftalık rapor denetimi/yayını, PMO puanı ve uygulama araçları (denetim günlüğü, yedek, veri sağlığı — bunlar varsayılanda yalnız admin'dedir, istenirse başka role verilir). Değişiklikler hemen uygulanır, denetim günlüğüne yazılır ve bulut eşitlemesiyle tüm kullanıcılara geçer; "Varsayılana dön" rolü sıfırlar. Not gizliliği kilitlidir: Yönetici rolleri (Müdür, PYB Sorumlusu, Admin) Günlük (notlar) ve İstekler ekranlarını göremez. Sahiplik kuralları (PY yalnız kendi projesini, bölüm sorumlusu yalnız kendi bölümünü düzenler) yetkiyle değişmez. Proje Yöneticisi veya Bölüm Sorumlusu rolünde kişi seçilmezse kapsamda proje görünmez.

## Yönetici konsolu: görünüm, filtre ve sıralama
Admin, konsolun "Görünüm ve filtreler" bölümünde her rol için şunları ayarlar: projede hangi sekmelerin görüneceği (Pano, Liste, Zaman çizelgesi, Riskler, Ekip, Hedefler, İş paketleri, Asistan; Genel bakış her zaman açık), yönetim ekranında hangi kartların görüneceği (özet, göstergeler, beklentiler, görüşmeler, sağlık dağılımı, dikkat isteyenler, plan onayları, riskler, bölüm doluluğu, son 7 gün), kayıt süzgeçleri (görünen proje durumları; en düşük görev önceliği: tümü / orta ve üstü / yüksek ve engelleyici / yalnız engelleyici; en düşük risk skoru: tümü / 8+ / 15+; kapanan risklerin görünüp görünmeyeceği) ve varsayılan sıralamalar (görevler: gecikene, önceliğe, bitiş tarihine ya da ada göre; riskler: skora göre ya da en yeni önce; projeler: sağlık, ad, ilerleme ya da geciken göreve göre). "Tam görünüm", "Yönetici özeti" ve "Yalnız kritikler" hazır ayarları tek tıkla uygulanır; "Varsayılana dön" rolü sıfırlar. Süzgeçler yalnız gösterimi daraltır: sağlık skoru, EVM ve sayaçlar tüm veriden hesaplanır; süzgeç etkinse liste üstünde "Yönetici ayarı: … gizli" notu görünür. Düzenlenebilir zaman çizelgesi süzülmez (otomatik planlama gizli görevleri kaybetmesin). Ayarlar denetim günlüğüne yazılır ve bulutla tüm kullanıcılara geçer.

## Yeni proje oluşturma ve proje sahibi atama
Portföy ekranında "Yeni Proje Ekle" ile proje oluşturulur. Proje kartından durum (Devam Eden, Teklif Aşaması, Beklemede, Tamamlandı), haftalık RAG durumu (Yolunda / Riskli / Kritik) ve durum notu girilir. Proje sahibi (Proje Yöneticisi) karttaki sahip alanından veri havuzundaki bir kişi seçilerek atanır; RBAC sahipliği bu atamaya göre çalışır. Proje silme ve yeniden adlandırma da karttaki düğmelerle yapılır; silme geri alınabilir.

## Görev ekleme ve sprint planlama
Proje açıkken Görevler veya Pano sekmesinde "Yeni Görev" ile görev eklenir. Görevde öncelik, atanan kişi, öncül görev, iyimser/ortalama/kötümser süre tahmini (PERT), bitiş tarihi, iş paketi, alt görevler ve notlar girilebilir. Uygulama görevleri topolojik çizelgeleme ve kritik zincir önceliğiyle sürümlere (sprint) otomatik yerleştirir; termin ve kapasiteyi dikkate alır. Aşırı büyük görev veya öncül döngüsü gibi plan uyarıları Pano'da üst bantta gösterilir. Yol Haritası sekmesi bitiş tarihini ve kritik yolu Gantt şemasında gösterir.

## Kayıt yaşam döngüsü ve planlama verisi
Her görev kaydının açılış, ilk başlama ("Süreçte"ye geçiş) ve kapanış anı ile durum geçişleri otomatik kaydedilir (pano, liste, görev formu ve asistan önerileri). Görev ayrıntısında "Yaşam döngüsü" satırı kaydın kaç iş gününde tamamlandığını gösterir; hafta sonları ve resmi tatiller (ulusal bayramlar ile Ramazan ve Kurban Bayramı) düşülür. Görev formundaki "Kayıt türü" (hata, yeni özellik, iyileştirme, görev) benzer kayıtların karşılaştırılmasında kullanılır. Jira CSV içe aktarması artık Issue Type, Status, Priority, Created, Resolved, Original Estimate, Time Spent, Story Points ve Fix Version sütunlarını da alır; kapanmış kayıtlar geçmiş veri olarak kalır ve sürüm planına girmez. Yönetici konsolunun Uygulama bölümündeki "Kayıt verisi" paneli kapanmış kayıtları tutarlılık testlerinden geçirir: tarihi eksik ya da kapanışı açılışından önce olanlar, toplu kapatma günleri ve aykırı uzun süreler elenir; yeniden açılan, aynı gün kapanan, türü ya da tahmini olmayan kayıtlar bilgi olarak işaretlenir. Testten geçen kayıtlar planlama simülasyonunun ve AI tahmininin öğrenme verisidir ve kişi adları olmadan CSV olarak indirilebilir.

## İş paketleri
Proje çubuğundaki "İş Paketleri" düğmesi iş paketlerini yönetir. Görevler bir iş paketine bağlanabilir; özet her iş paketinin görev sayısını, tamamlanma yüzdesini ve atanan kişileri gösterir. Tahsis satırlarında da iş paketi seçilebilir.

## Hedefler (OKR)
Hedefler sekmesinde çeyrek bazlı hedefler ve anahtar sonuçlar tanımlanır; görevler bir anahtar sonuca bağlanabilir.

## İşgücü tahsisi girişi (plan ve gerçekleşen)
Tahsis ekranındaki "Tahsis Tablosu" sekmesinde kişi × proje × iş paketi × rol satırları için yıl bazında aylık Plan ve Gerçekleşen adam-ay değerleri girilir (0,5 = ayın yarısı). Plan / Gerçekleşen / Karşılaştırma modları arasında geçilebilir. Bir kişinin bir aydaki toplam tahsisi efektif kapasitesini aşarsa aşırı tahsis uyarısı çıkar. Proje Yöneticisi kendi projelerinin, Bölüm Sorumlusu bölümünün satırlarını düzenler. Kişi Özeti, Bölüm Özeti ve Proje Özeti sekmeleri aylık toplamları gösterir.

## Plan onayı ve kilitleme
Plan yılbaşında girilir ve Tahsis Tablosu'ndaki "Onaya Gönder" ile onaya gönderilir. PYB Sorumlusu veya Müdür "Onayla & Kilitle" ya da "Reddet" der. Kilitli planda plan hücreleri salt-okunurdur; gerçekleşen her zaman girilebilir. Plan onaylandığında portföyün anlık görüntüsü (baseline) otomatik alınır ve Yönetim ekranında plan kayması bu baseline'a göre gösterilir.

## Görev planından tahsis önerisi
Tahsis ekranındaki "Görev Planından Tahsis Önerisi", projenin sprint planındaki görev eforlarını kişi bazında aylık AA önerisine çevirir. Öneri yalnızca boş ayları doldurabilir veya mevcut değerlerin üzerine yazabilir.

## Jira Billed Hours ile gerçekleşen girişi
Tahsis ekranındaki "Jira Billed Hours" düğmesi, Jira'nın "Toplam Billed Hours" pivotunu (Proje → Kişi × Ay saat) içe aktarır. Saatler Türkiye resmi çalışma günü takvimiyle güne ve adam-aya çevrilir, havuzdaki kişi ve projelerle eşleştirilip önizlenir; doldur veya üzerine yaz moduyla gerçekleşen tahsise yazılır. Eşleşmeyen proje ve kişiler tek tıkla Veri Havuzu'na otomatik eklenebilir. İçe aktarma sonrası tablo Gerçekleşen moduna geçer.

## Doluluk ısı haritası ve uygun kişi bulma
Tahsis → "Doluluk" sekmesi kişi × ay doluluk oranını (yük / efektif kapasite) ısı haritası olarak gösterir. "Uygun Kişi" sekmesinde rol, ay aralığı (alana basınca açılan ay takviminde önce başlangıç, sonra bitiş ayına basılır) ve gereken AA seçilerek o aylarda boş kapasitesi olan kişiler bulunur; uygun olanlar önce, en dar aydaki boşluğa göre sıralanır.

## Kapasite-talep analizi ve personel açığı
Tahsis → "Kapasite-Talep" sekmesi bölüm × rol bazında Planlı-Proje talebini, Kaynak-İşgücü kapasitesini, teklif aşamasındaki projelerden gelen İhtiyaç-Teklif değerini ve Personel Açığını gösterir. Açık olan roller işe alım ihtiyacını işaret eder.

## Senaryo (what-if) planlama
Tahsis → "Senaryo" sekmesinde teklif aşamasındaki projeler "Teklifleri Kazanılmış Say" ile kazanılmış varsayılır ve varsayımsal işe alımlar eklenir; hangi rollerin açığa düştüğü canlı görülür. Senaryoda hiçbir şey kaydedilmez.

## İş yükü öngörüsü
Tahsis → "Öngörü" sekmesi gerçekleşen AA verisinden yılın kalan aylarını tahmin eder: Hareketli Ortalama (pencere ayarlanabilir), Doğrusal Trend, Son Ay veya Plana Göre. Yıl sonu tahmini (EAC = gerçekleşen + öngörü), plana göre sapma ve ünvan oranlarıyla tahmini maliyet proje, kişi veya bölüm kırılımında gösterilir. Yarım kalan son ay otomatik olarak dışarıda bırakılır; "Son gerçekleşen ay" seçiciyle değiştirilebilir.

## Veri Havuzu ve Excel içe aktarma
Veri Havuzu ekranında personel (sicil, bölüm, ünvan, kullanılabilir AA / ay, roller), bölümler, rol kataloğu ve ünvanlar (aylık maliyet dahil) yönetilir; yalnızca PYB Destek düzenleyebilir. "İşgücü Tahsisi" formatındaki Excel dosyaları (Personel Listesi, Bölümler, Roller, Ünvanlar, Projeler, İş Paketleri, Veri Girişi) tek tıkla içe aktarılır; mükerrer kayıt oluşturmaz, günceller. Kişi satırındaki profil düğmesi kişi sayfasını açar.

## Kişi sayfası, izin ve uygunluk
Kişi sayfası bir kişinin tüm projelerdeki aylık doluluğunu, kapasite aşımını, proje dağılımını, görev ve risklerini tek ekranda gösterir. İzin/tatil/yarı-zaman burada aya özel AA olarak girilir (1 = tam ay yok, 0,5 = yarım ay) ya da "Takvimden izin ekle" alanına basıp açılan takvimden başlangıç ve bitiş günü seçilir: aralıktaki hafta içi günler her ay için o ayın hafta içi gün sayısına bölünerek AA'ya çevrilir ve mevcut izne eklenir (ay başına en fazla 1 AA; resmi tatiller ayrıca düşülmez); efektif kapasite ve aşırı tahsis uyarıları anında güncellenir. İzin girişini PYB Destek yapar.

## Maliyet ve EVM
Ünvanların aylık maliyeti (1 AA) Veri Havuzu'nda tanımlanır. Tahsis × ünvan maliyeti proje ve bölüm bazında plan/gerçekleşen TL olarak hesaplanır. Yönetim ekranındaki EVM paneli PV, EV, AC, SPI (1'in altı takvim gerisi), CPI (1'in altı bütçe aşımı), EAC ve VAC değerlerini gösterir. Maliyet hesaplanabilmesi için kişilerin ünvanı ve ünvanın aylık maliyeti tanımlı olmalıdır.

## Risk kaydı, PESTEL ve SWOT
Proje çubuğundaki Riskler sekmesinde "Yeni Risk" ile risk eklenir: olasılık ve etki (1-5) ile 5×5 matriste skor (1-25), sahip (havuzdan kişi), azaltıcı aksiyon ve durum (Açık, İzleniyor, Kapandı). "PESTEL Analizi" altı dış çevre faktörünü fırsat/tehdit ve etki derecesiyle kaydeder; bir PESTEL maddesinden tek tıkla risk kaydı oluşturulabilir. "SWOT Analizi" güçlü/zayıf yönler, fırsatlar ve tehditleri 2×2 panoda toplar; PESTEL maddeleri ve yüksek riskler SWOT'a beslenebilir. Her ikisi PNG/SVG olarak dışa aktarılabilir. Bunları yalnızca proje sahibi düzenler.

## Haftalık durum raporu
Proje çubuğundaki "Durum Raporu" düğmesi; görev ilerlemesi, geciken ve yaklaşan işler, RAG, bu ayın tahsisi, riskler ve haftanın notlarından bir rapor taslağı üretir. Taslak düzenlenip kopyalanabilir veya indirilebilir; Teams veya e-postaya yapıştırılabilir. AI asistanından da "durum raporu taslağı yaz" diye istenebilir.

## Haftalık rapor ve onay akışı
Kenar çubuğundaki "Haftalık rapor" ekranında hafta, oklarla ya da hafta etiketine basınca açılan takvimden (bir güne basmak o haftayı seçer; solda hafta numaraları) seçilir. Proje yöneticisi projesinin haftalık raporunu yazar (bu hafta yapılanlar, gelecek hafta planı, geçen haftanın planının değerlendirmesi ve 1–10 proje sağlığı puanı). Varsayılan akış: Proje yöneticisi → bölüm sorumlusu onayı → PYB destek format denetimi → onaylı → PYB destek haftayı yayınlar; müdür ve PYB sorumlusu yayınlanan birleşik raporu bölüm bazında görür. Admin, yönetici konsolunun "Haftalık rapor akışı" bölümünde bölüm sorumlusu onayını ya da PYB destek format denetimini kapatabilir (kapalı adım atlanır; iade bir önceki açık adıma döner), gönderim kuralları ekleyebilir (PY sağlık puanı zorunlu, geçen haftanın planı değerlendirilmeli), yayında AI metin puanını açıp kapatabilir ve raporun son gününü seçebilir. Kural karşılanmazsa "Gönder" düğmesi pasif kalır ve eksik olan alt çubukta yazar.

## Günlük (haftalık notlar) ve müşteri istekleri
Günlük sekmesinde haftalık notlar, etiketler ve bahsetmelerle tutulur. İstekler sekmesinde müşteri istekleri kaydedilir; bir istek tek tıkla göreve dönüştürülebilir. Bu iki ekran yönetici rollerine kapalıdır ve bulut senkronizasyonunda ayrı, korumalı tabloda tutulur.

## Yönetim ekranı
Yalnızca Müdür ve PYB Sorumlusu görür: portföy KPI'ları (tıklanınca detay açılır), proje sağlık panosu ve "Dikkat Gerektirenler", aylık plan-gerçekleşen grafiği, bölüm dağılımı, departman karnesi, EVM, kritik riskler, "Ne Değişti?" akışı ve baseline geçmişi. "Brifing" tek sayfalık yönetici özetini açar (kopyala / indir); "Yönetici Paketi (Excel)" çok sayfalı Excel raporu, PowerPoint düğmesi yönetici sunumu indirir; "Anlık Görüntü Al" elle baseline kaydeder.

## Proje sağlık skoru
Sağlık skoru (0–100) on girdinin ağırlıklı ortalamasıdır: takvim (SPI, %18), bütçe (CPI, %13), geciken görevler (%13), riskler (%13), söz tutma (%8), haftalık durum (RAG, %8), PY puanı (%8), AI metin puanı (%8), kaynak (kapasite üstü ekip, %6) ve kritik yönetim beklentileri (%5). Söz tutma oranı, PY'nin haftalık raporda geçen haftanın planını "Yapıldı / Kısmen / Ertelendi / İptal" diye değerlendirmesinden gelir (son 4 hafta; iptaller sayılmaz). AI metin puanı, PYB destek haftayı yayınlarken onaylı rapor metinlerinin AI ile 1–10 değerlendirilmesidir; sayıları değil metnin nitel yanını (somut teslimat, engel, belirsizlik) ölçer ve rapordan birebir alıntıyla gerekçelendirir. Her girdi 0–1'e normalize edilir (1 = sağlıklı); verisi olmayan girdi skora girmez ve ağırlığı diğerlerine dağılır. Verisi olan girdilerin ağırlık toplamı "güven"i verir. 75 ve üstü Sağlıklı, 50–74 İzlemede, altı Sorunlu. Bunlar uzman varsayılanlarıdır: admin, yönetici konsolunun "Sağlık puanı" bölümünde girdi ağırlıklarını (0 = girdi kapalı) ve bant eşiklerini değiştirebilir; kaydetmeden önce portföy skoruna etkisi önizlenir, "Uzman yöntemine dön" varsayılanı geri getirir ve özel ağırlıkla alınan haftalık fotoğraflar "uzman-2/özel" olarak işaretlenir. PY'nin öznel değerlendirmesi (RAG + puan) verilerden 0,3 ve daha fazla iyimserse "algı farkı" uyarısı çıkar (AI metin puanı bu karşılaştırmaya girmez). PY puanını haftalık raporda verir (1–10); PMO (PYB sorumlusu / PYB destek) birleşik raporda her projeye kendi 1–10 puanını verir; bu puan modelin hedef değişkenidir ve PY'lere gösterilmez. Her hafta girdiler ve skor kaydedilir; yeterli puan biriktiğinde ağırlıklar regresyonla kalibre edilecek. Yönetim ve proje genel bakış ekranlarındaki (i) düğmesi hesaplamayı ve projenin girdi dökümünü gösterir.

## Yapay zekâ yönetimi ve puanlama güvenceleri
Admin, yönetici konsolunun "Yapay zekâ" bölümünde AI'yı kurum genelinde açıp kapatır; asistan sohbeti, ekran içi AI (rapor taslağı, risk önerisi, PERT, brifing) ve asistanın değişiklik önerileri ayrı ayrı kapatılabilir. Hangi rolün AI kullanacağı Yetkiler bölümündeki "Yapay zekâ özelliklerini kullanır" satırındadır. Sağlayıcı, model ve API anahtarı güvenlik gereği yalnız sunucu ortam değişkenlerindedir; konsol bunları salt okunur gösterir. Rapor metni puanlamasında halüsinasyona karşı: model yalnız onaylı rapor metnini görür, önce rapordan birebir alıntı çıkarır sonra puanlar, metinde geçmeyen alıntı atılır; aynı rapor 1, 3 ya da 5 kez bağımsız puanlanır ve skor medyandır; tekrarlar arası fark, doğrulanmış kanıt sayısı, kural tabanlı metin göstergesiyle (tarih, tutar, teslimat, genel ifade, olumsuzluk) fark ve sinyal–puan çelişkisi denetlenir. Kurallardan biri karşılanmazsa değerlendirme "düşük güven" olur ve varsayılanda sağlık skoruna girmez (bir önceki güvenilir değerlendirme kullanılır). İzleme kartı, AI puanını PMO'nun 1–10 puanıyla karşılaştırır (ortalama fark, korelasyon) ve uyum düşükse ağırlığı azaltmayı önerir.

## Takvim
Takvim ekranı Takvimim, Ekip, Proje ve İş Paketi kapsamlarında aylık zaman çizelgesi gösterir; kişi adına tıklanınca kişi sayfası açılır.

## Yapılacaklar, veri sağlığı ve denetim günlüğü
Sağ üstteki zil role göre yapılacakları listeler: onay bekleyen plan, girilmemiş gerçekleşen, geciken görev, kritik RAG, aşırı tahsis ve havuz eksikleri. Veri sağlığı düğmesi yetim tahsis, eşleşmeyen görev ataması, mükerrer personel, eksik bölüm veya ünvan maliyeti ve sahipsiz proje gibi sorunları bulur ve tek tıkla düzeltme önerir. Denetim günlüğü eylem türü, proje, metin ve tarih aralığıyla (alana basınca açılan takvimden iki tıkla ya da "Bu hafta", "Geçen hafta", "Bu ay", "Son 30 gün" hazır aralıklarıyla) süzülür. Denetim günlüğü proje oluşturma/silme, RAG değişimi, plan onay/red/kilit, risk ekleme/kapatma ve veri içe aktarma gibi kritik aksiyonları kim-ne zaman bilgisiyle kaydeder.

## Yedekleme ve bulut senkronizasyonu
Veriler varsayılan olarak tarayıcıda saklanır. Sağ üstteki indirme düğmesi JSON yedek alır, yükleme düğmesi yedeği geri yükler (eski tek proje yedekleri de içe aktarılabilir). Bulut düğmesi Supabase ile e-posta girişli çok kullanıcılı senkronizasyonu kurar: Project URL ve anon anahtarı girilir, kayıt olunur/giriş yapılır, "Bu çalışma alanını buluta taşı" ile veri yüklenir; diğer üyeler Çalışma Alanı ID'si ile bağlanır. Çalışma yerel-önceliklidir, çevrimdışı devam eder ve sürüm kontrolü sayesinde kimsenin verisi sessizce ezilmez.

## Ayarlar
Ayarlar penceresinde sürüm (sprint) süresi, proje başlangıç tarihi, yerel kalıcılık, yapay zekâ asistanını açma/kapama, tema rengi ve gece modu ayarlanır; tüm veriler buradan sıfırlanabilir.

## AI asistanı nasıl kullanılır
Sağ alttaki asistan düğmesi her ekrandan sohbet panelini açar; ⌘K / Ctrl+K paletine yazılan soru "AI Asistanı'na sor" ile doğrudan gönderilebilir; proje çubuğundaki Zekâ sekmesi aynı sohbeti tam ekranda gösterir. Asistan uygulama verisini yalnızca kullanıcının yetki kapsamında okur; sayıları uygulamanın hesap motorları üretir. Veri değiştirmez, yalnızca önerir: Proje Yöneticisi ve Bölüm Sorumlusu rollerinde "şu riski ekle", "görevi tamamlandı yap", "RAG'i riskli yap", "Mart planını 0,5 yap" gibi isteklerde sohbette bir öneri kartı çıkar; "Uygula" denince yetki ve plan kilidi yeniden kontrol edilip uygulanır, denetim günlüğüne yazılır ve alttaki "Geri Al" ile geri alınabilir. Notlar, görev açıklamaları, riskler, istekler, bu kılavuz ve Bilgi Bankası'na yüklenen kurumsal dokümanlarda anlam araması yapar ve yanıtlarında kaynak gösterir. Bilgi Bankası asistan panelindeki kitap simgesinden açılır; PDF, Word (.docx), Markdown ve metin dosyaları yüklenebilir.

## AI ile çalışan ekran özellikleri
Bazı ekranlarda yapay zekâ düğmeleri bulunur (AI ayarlardan açıksa): Durum Raporu penceresinde "AI ile e-postaya dönüştür" taslağı verileri değiştirmeden akıcı bir yönetici e-postasına çevirir, "Taslağa dön" ile geri alınır. Yönetim ekranındaki Brifing penceresinde "AI ile yönetici özeti yaz" üst yönetim için özet paragraf üretir. Riskler sekmesinde "AI Risk Önerisi" gecikmeler, notlar, PESTEL ve hedeflerden risk kaydında olmayan riskleri önerir; seçilenler eklenir. PESTEL ve SWOT pencerelerinde "AI ile taslak öner" madde önerir. Görev formunda "AI ile tahmin et" benzer görevlerden iyimser/ortalama/kötümser süre önerir. AI önerileri hiçbir zaman kendiliğinden kaydedilmez; kullanıcı seçer ya da düzenler. Risk, PESTEL ve SWOT önerileri yalnızca proje sahibine görünür.
