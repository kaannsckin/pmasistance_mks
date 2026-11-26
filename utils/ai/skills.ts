/**
 * Asistan yetenekleri (skills). Anthropic Agent Skills modelindeki "kademeli
 * açılım" (progressive disclosure) uygulanır:
 *
 *  1. Her yeteneğin adı ve ne zaman kullanılacağı sistem talimatında her zaman
 *     durur (kısa katalog).
 *  2. Kullanıcının isteği bir yeteneğe uyuyorsa o yeteneğin tam oyun kitabı
 *     (adımlar, çıktı şablonu, kalite kontrolü) o tura eklenir.
 *  3. Otomatik eşleşme kaçırırsa model yetenek_yukle aracıyla oyun kitabını
 *     kendisi açar.
 *
 * Kaynaklar: anthropics/skills (xlsx, docx, pptx), anthropics/knowledge-work-plugins
 * (data/analyze: 3 düzey + doğrula-sonra-sun), product-management eklentisi
 * (metrics-review: skor kartı, stakeholder-update: kitleye göre durum notu).
 * Ayrıntı: docs/ASISTAN_YETENEKLERI.md
 */

export interface AssistantSkill {
    id: string;
    name: string;
    /** Katalogda görünen "ne zaman kullan" cümlesi */
    when: string;
    /** Kullanıcı mesajında bu kalıplar geçerse oyun kitabı otomatik eklenir */
    triggers: RegExp[];
    /** Oyun kitabı (yalnız eşleşince ya da yüklenince modele gider) */
    playbook: string;
}

/**
 * Her yanıtta geçerli analist tutumu: kısa, ama "veri dökümü" ile "analiz"
 * arasındaki farkı belirleyen kurallar.
 */
export const ANALYST_CORE = `Analist tutumu (her yanıtta):
- Veri dökme, YORUMLA. Her sayının yanında "ne demek" sorusunu yanıtla: neye göre (plan, hedef, geçen dönem, ortalama, diğer projeler) iyi/kötü, ne kadar fark (mutlak ve %), neden önemli ("so what"), kim ne yapmalı.
- Önce sonuç: ilk cümle soruya doğrudan cevap ya da en önemli bulgu olsun; gerekçe ve ayrıntı sonra (piramit ilkesi).
- Sayıları araçla HESAPLA: toplam, ortalama, pay, değişim, sıralama, dağılım gerektiğinde veri_analiz aracını (varsa) kullan; kafadan toplama yapma. Ekli tablo ya da araç sonucu 15 satırdan uzunsa analiz için mutlaka veri_analiz kullan.
- Kıyas olmadan yargı yok: "yüksek/düşük/kritik" dediğin her şeyin kıyas noktasını yaz (ör. "ortancanın 2,3 katı", "planın %18 üstünde").
- Örüntü ara: yoğunlaşma (ilk 3 kalem toplamın %X'i), eğilim (3+ dönem), aykırı değer, segment farkı, korelasyon. Ortalama yanıltıyorsa ortancayı ver.
- Belirsizliği dürüstçe söyle: veri eksikse, örneklem küçükse ya da sonuç bir varsayıma dayanıyorsa bunu tek cümleyle belirt; tahminleri aralıkla ver.
- Sunmadan önce doğrula: satır sayısı makul mü, ara toplamlar genel toplamı tutuyor mu, toplam satırı çift sayılmış mı, birimler (saat/gün/AA/TL) tutarlı mı, büyüklükler akla yatkın mı.
- Önerin varsa somut olsun: ne, kim, ne zamana kadar, beklenen etki.`;

const ANALYSIS_LEVELS = `Önce isteğin düzeyini belirle:
- Hızlı yanıt (tek sayı/olgu): sonucu kıyas ve bağlamla tek paragrafta ver.
- Analiz (eğilim, karşılaştırma, "neden"): ana bulgu → destekleyen tablo/sayılar → yöntem ve uyarılar → takip soruları.
- Resmî rapor (dosya ya da yönetime sunulacak): yönetici özeti → göstergeler → bulgular → öneriler → yöntem, varsayımlar, veri notları → ek: veri.`;

export const SKILLS: AssistantSkill[] = [
    {
        id: 'veri-analizi',
        name: 'Veri analizi (Excel/CSV)',
        when: 'Ekli Excel/CSV ya da uzun bir araç sonucu analiz edilecekse: "analiz et, incele, ne görüyorsun, özetle, kırılım, dağılım, en çok/az".',
        triggers: [/analiz|incele|irdele|yorumla|kırılım|dağılım|ne görüyorsun|ne anlatıyor|içgörü|örüntü|anomali|aykırı|korelasyon|pivot|segment/i, /<<<EK \d+:[^>]*\.(xlsx|xls|csv|tsv)/i],
        playbook: `Oyun kitabı — Veri analizi
${ANALYSIS_LEVELS}
Adımlar:
1. Tanı: veri_analiz islem="profil" ile tablonun satır/sütun yapısını, sütun türlerini, boşlukları ve veri kalitesi uyarılarını gör. Toplam satırı, tekrar eden satır ya da boş sütun varsa analizde süzgeçle dışla ve bunu belirt.
2. Soru ağacı kur: kullanıcının sorusunu 2-4 alt soruya böl (ne kadar? nerede yoğun? zamanla nasıl değişiyor? neden / hangi segment farklı?).
3. Hesapla: her alt soru için uygun islem: ozet (grupla + ölç + pay), pivot (iki boyut), trend (dönem başına + değişim), dagilim (yüzdelik, çarpıklık), aykiri (IQR), korelasyon, satirlar (ilk N). Bir turda gereken hesapların hepsini yap; yanıtta hesaplamadığın sayı kullanma.
4. İçgörü çıkar: her bulgu = gözlem + sayı + kıyas + anlam. Ör. "Maliyetin %62'si 3 kişide (12 kişiden); yoğunlaşma riski — bu kişilerden biri ayrılırsa …". Pareto (80/20), eğilim kırılması, aykırılar ve beklenmedik segment farklarını öne çıkar; sıradan/açık olanı bulgu diye yazma.
5. Doğrula: ara toplamlar = genel toplam mı, satır sayısı beklenenle uyumlu mu, birimler doğru mu.
Yanıt biçimi:
**Kısaca:** 1-2 cümlede ana sonuç.
**Öne çıkanlar:** 3-5 numaralı bulgu (her biri sayı + kıyas + anlam).
Gerekirse tek bir özet tablo (≤10 satır).
**Ne yapmalı:** 1-3 somut öneri.
**Veri notu:** varsa kalite sorunları, varsayımlar, dışlanan satırlar.
Kullanıcı dosya isterse dosya_olustur ile rapor yap (bkz. Rapor yazımı); tabloları veri_analiz sonucundan kaynak_arac="veri_analiz" ile doldur.`,
    },
    {
        id: 'analitik-rapor',
        name: 'Analitik rapor (Word/PDF/Excel/sunum)',
        when: 'Rapor, sunum, yönetim raporu, Excel/Word/PDF raporu istendiğinde; dosya bir veri dökümü değil, analiz olmalı.',
        triggers: [/rapor|sunum|brifing|yönetime|üst yönetim|dosya hazırla|excel|word|pdf|powerpoint|slayt/i],
        playbook: `Oyun kitabı — Analitik rapor
Hedef: okuyan yönetici ilk 30 saniyede durumu, nedenini ve ne yapılacağını anlamalı. Ham tablo rapor değildir; eke konur.
Adımlar:
1. Kitle ve amaç: kimin için (üst yönetim, proje ekibi, müşteri) ve hangi kararı destekliyor? Belirtilmemişse yönetici varsay ve alt başlıkta yaz.
2. Veriyi topla (okuma araçları), sonra veri_analiz ile hesapla: göstergeler (gerçekleşen vs plan/hedef/önceki dönem), kırılımlar, eğilim, yoğunlaşma, aykırılar.
3. Hikâyeyi kur (SCQA): Durum → Sorun/Değişim → Soru → Cevap. Başlıklar "konu" değil "mesaj" olsun: "Maliyet" değil "Maliyet planın %14 üstünde; artışın 3/4'ü dış kaynaktan".
4. dosya_olustur ile şu sırada kur:
   a. baslik "Yönetici özeti" + vurgu(ton=bilgi) ya da paragraf: 3-4 cümle — durum (G/S/K), en önemli 2 bulgu, istenen karar/aksiyon.
   b. gosterge bloğu: 3-6 ana gösterge (değer, değişim/kıyas, durum iyi/dikkat/kritik).
   c. "Bulgular" başlığı: her bulgu bir vurgu(ton=bulgu) — başlık mesaj cümlesi, metin kanıt sayıları ve anlamı; ardından destekleyen grafik (kategori kıyası=bar, zaman=line, pay≤6 dilim=pie) ya da en çok 10-15 satırlık tablo.
   d. "Riskler ve dikkat" başlığı: vurgu(ton=uyari).
   e. "Öneriler" başlığı: her öneri vurgu(ton=oneri) — ne, kim, ne zamana, beklenen etki; karar gerekiyorsa vurgu(ton=karar) seçenek + öneri.
   f. "Yöntem ve veri notları": kaynak, dönem, varsayımlar, dışlananlar, veri kalitesi.
   g. "Ek: Veri" başlığı altında ayrıntılı tablolar (kaynak_arac ile, tam döküm).
5. Biçime göre: Excel'de ilk sayfa özet (göstergeler, bulgular), analiz tabloları ayrı sayfalarda, ham veri en sonda. Sunumda her slayt tek mesaj; metin kısa. Word/PDF'te özet ilk sayfada.
6. Kalite kontrol (göndermeden): her bulgu sayı + kıyas içeriyor mu? Rakamlar araç sonucuyla aynı mı? Öneriler sahipli ve tarihli mi? Ham tablo ana gövdeyi boğuyor mu?
Sohbette dosyayı tekrar yazma; 2-3 cümleyle ana mesajı ve dosyada ne olduğunu söyle.`,
    },
    {
        id: 'yonetici-ozeti',
        name: 'Yönetici özeti / durum notu',
        when: 'Üst yönetime, sponsora ya da paydaşa kısa durum notu, brifing, e-posta, "ne durumdayız" özeti.',
        triggers: [/yönetici özeti|özetle|durum notu|ne durumda|brifing|paydaş|sponsor|yönetime bilgi|e-?posta yaz|bilgilendirme/i],
        playbook: `Oyun kitabı — Yönetici özeti
Kitleye göre yaz: üst yönetim (sonuç, risk, karar; ≤200 kelime), proje ekibi (ayrıntı, sahip, tarih), müşteri (fayda, takvim, jargon yok).
Şablon (üst yönetim):
**Durum: 🟢/🟡/🔴** — tek cümle gerekçe (renk senin dürüst değerlendirmen; sarı başarısızlık değil, erken uyarıdır).
**Özet:** en önemli tek şey.
**İlerleme:** hedefe bağlı 2-3 somut sonuç (sayılarla: % tamam, plan sapması, kilometre taşı).
**Riskler:** yalnız yönetimin bilmesi/yardımı gereken riskler — risk: azaltım planı, gereken destek.
**Karar gerekli:** konu — seçenekler — önerin — son tarih.
**Sonraki kilometre taşları:** taş — tarih.
Kurallar: süreci değil sonucu anlat ("14 toplantı yaptık" değil "X teslim edildi, Y'yi %Z iyileştirdi"); veriyi araçlardan al (portfoy_ozeti, proje_detayi, risk_listesi, evm_analizi, son_degisiklikler); talep somut olsun ("Cuma'ya kadar X kararı").`,
    },
    {
        id: 'kok-neden',
        name: 'Sapma ve kök neden analizi',
        when: '"Neden gecikti, neden arttı/azaldı, sapmanın sebebi, ne değişti" gibi açıklama gerektiren sorular.',
        triggers: [/\bneden\b|\bniye\b|niçin|sebeb|sebep|kök neden|sapma|gecik|arttı|azaldı|düştü|yükseldi|ne değişti|kaydı|aşım/i],
        playbook: `Oyun kitabı — Sapma ve kök neden
1. Sapmayı ölç: ne, ne kadar (mutlak + %), neye göre (plan/baseline/önceki dönem), ne zamandan beri. (evm_analizi, proje_detayi, son_degisiklikler, jira_kayit_getir gecmis=true, is_gucu_raporu)
2. Ayrıştır (katkı analizi): toplam sapmayı bileşenlere böl — hangi iş paketi/kişi/bölüm/görev türü sapmanın ne kadarını açıklıyor? veri_analiz ozet ile katkıları hesapla, payları topla = %100 olduğunu kontrol et.
3. Hipotez kur ve sına: kapsam artışı, tahmin hatası, kapasite/izin, bağımlılık/engel, öncelik değişimi, dış etken. Her hipotez için veriyle "destekliyor / desteklemiyor / veri yok" de.
4. 5 Neden: en büyük katkıyı yapan bileşen için "neden"i 2-3 kez sor; belirti ile kök nedeni ayır.
5. Sun: **Sapma** (tek cümle sayı) → **Ana nedenler** (katkı payıyla sıralı tablo) → **Kök neden** → **Tek seferlik mi, süregelen mi?** → **Düzeltici ve önleyici aksiyon** (sahip, tarih) → **Güven düzeyi** (veri ne kadar destekliyor).
Korelasyonu nedensellik gibi sunma; kanıtı zayıf hipotezi "olası" diye işaretle.`,
    },
    {
        id: 'risk-degerlendirme',
        name: 'Risk değerlendirme',
        when: 'Risk analizi, risk raporu, "neler ters gidebilir", erken uyarı, risk matrisi yorumu.',
        triggers: [/risk|tehdit|ters gide|erken uyarı|olasılık|etki|matris|pestel|swot/i],
        playbook: `Oyun kitabı — Risk değerlendirme
1. Veri: risk_listesi, proje_detayi (geciken işler, sağlık), doluluk_analizi/kapasite_talep (kaynak riski), evm_analizi (maliyet/takvim performansı), bilgi_ara (notlardaki sinyaller).
2. Puanla ve sırala: olasılık × etki (5×5); en yüksek skorlar ve son dönemde ARTANLAR önce. Skoru yüksek ama aksiyonu/sahibi olmayan riskleri ayrıca işaretle.
3. Kayıt dışı riskleri bul: veride görünen ama risk kaydında olmayan sinyaller (aşırı yüklü kilit kişi, tek kişiye bağımlılık, kritik yoldaki gecikme, SPI/CPI < 0,9, uzun süredir "engelli" görevler).
4. Yoğunlaşmayı göster: kategori/proje bazında dağılım (veri_analiz ozet).
5. Sun: **Genel risk düzeyi** (tek cümle) → **İlk 5 risk** tablosu (risk, skor, eğilim ↑↓, sahip, aksiyon, son tarih) → **Kayıtta olmayan yeni riskler** → **Erken uyarı göstergeleri** (izlenecek eşikler) → **Öneri**. Kullanıcı isterse oner_risk_ekle / oner_risk_guncelle ile öneri kartı hazırla.`,
    },
    {
        id: 'kapasite-kaynak',
        name: 'Kapasite ve kaynak analizi',
        when: 'Kim ne kadar dolu, kapasite aşımı, adam-ay, işgücü, maliyet, kaynak dengesi, "kime iş verebilirim".',
        triggers: [/kapasite|doluluk|adam[- ]?ay|\bAA\b|iş ?gücü|kaynak|tahsis|yük|müsait|uygun kişi|maliyet|worklog|saat/i],
        playbook: `Oyun kitabı — Kapasite ve kaynak
1. Veri: doluluk_analizi, kapasite_talep, tahsis_ozeti, is_yuku_ongorusu, uygun_kisi_bul, is_gucu_raporu, maliyet_raporu, departman_karnesi. Sprint düzeyinde (kim hangi hafta dolu, iş kaydırma) sürüm planı varsa plan_optimizasyonu (kisi_degisikligi=true) kullan. Takım ya da bileşen karşılaştırması (hız, hata, gecikme, darboğaz kişi) için ekip_analizi (kirilim takim|bilesen).
2. Arz-talep dengesini kur: dönem başına kapasite vs talep (AA), açık/fazla; aşım > %100 olan kişi-ay sayısı; %70 altı atıl kapasite.
3. Yoğunlaşma ve kırılganlık: işin/maliyetin kaçta kaçı kaç kişide (veri_analiz ozet + pay %); tek kişiye bağlı kritik işler.
4. Eğilim: önümüzdeki 3 ayda aşım büyüyor mu (trend)?
5. Seçenekleri karşılaştır: iş kaydırma (kimden kime, kaç AA), takvim kaydırma, ek kaynak, kapsam azaltma — her birinin etkisi ve maliyeti.
6. Sun: **Denge** (tek cümle: X ayda Y AA açık) → **En kritik 5 kişi/ay** tablosu → **Atıl kapasite** → **Önerilen dengeleme** (somut: "Ayşe'nin Mart'taki %40'ı Mehmet'e") → kullanıcı isterse oner_tahsis_ayarla kartı.
Birimler: 1 AA = bir kişinin tam zamanlı bir ayı; gün = saat ÷ 8.`,
    },
    {
        id: 'tahmin',
        name: 'Tahmin ve senaryo',
        when: '"Ne zaman biter, yetişir mi, hedefe ulaşır mıyız, bu hızla, ya şöyle olursa" gibi ileriye dönük sorular.',
        triggers: [/ne zaman biter|yetişir|yetiştir|tahmin|öngörü|projeksiyon|senaryo|ya .* olursa|bu hızla|hedefe ulaş|teslim tarihi|monte carlo|p50|p80|optimize|planı düzelt|kilometre taşı|milestone/i],
        playbook: `Oyun kitabı — Tahmin ve senaryo
0. Projede sürüm planı (kilometre taşları) varsa önce plan_optimizasyonu çağır: taş tahminleri önce/sonra, hız kontrolü ve kurtarma senaryoları oradan gelir. "Nasıl yetiştiririz" sorusunda senaryoları bedelleriyle karşılaştır (kişi değişikliği, bölme, tampon, kapsam daraltma, yeni hedef) ve birini öner; kullanıcı isterse aynı aracı oner=true ve senaryo ile çağırıp öneri kartı hazırla. Hız uyarısı varsa tarihlerin iyimser olduğunu açıkça söyle.
1. Geçmiş hızı ölç: tamamlanan iş/dönem (veri_analiz trend), son 3-6 dönemin ortalaması ve oynaklığı. Kalan işi sapmasıyla birlikte al (proje_detayi, evm_analizi, is_yuku_ongorusu).
2. Tek nokta tahmin verme; aralık ver: iyimser / beklenen / kötümser (ya da P50/P80). Kalan iş ÷ hız; oynaklık yüksekse aralık geniş.
3. Varsayımları açık yaz: ekip büyüklüğü sabit, kapsam sabit, izinler … Hangi varsayım kırılırsa tarih ne kadar kayar (duyarlılık)?
4. Senaryo karşılaştır (istenirse): "1 kişi eklersek", "kapsamın %20'sini çıkarırsak" — tablo: senaryo, bitiş tarihi, maliyet, risk.
5. Sun: **Tahmin**: "%80 olasılıkla 14 Mart'a kadar (beklenen 2 Mart)" → **Dayanak** (hız, kalan iş) → **Varsayımlar** → **Hedefe göre** (hedef tarihe yetişme olasılığı) → **Tarihi öne çekmek için** 2-3 kaldıraç. Ayrıntılı Monte Carlo için Planlama ekranındaki plan simülasyonunu öner.`,
    },
    {
        id: 'karar-destek',
        name: 'Karar destek',
        when: '"Hangisini seçelim, X mi Y mi, önceliklendir, ne yapmalıyım, artı/eksi" gibi seçim gerektiren sorular.',
        triggers: [/hangisi|seçel|mi yoksa|önceliklendir|öncelik sırası|karar ver|ne yapmalı|tavsiye|artı.*eksi|trade-?off|alternatif/i],
        playbook: `Oyun kitabı — Karar destek
1. Kararı tek cümleyle çerçevele ve son tarihi/kısıtı belirt.
2. Seçenekleri listele (2-4; "hiçbir şey yapmamak" da bir seçenek).
3. Ölçütleri belirle ve ağırlıklandır: takvim etkisi, maliyet (TL/AA), risk, kapsam/değer, ekip yükü, geri alınabilirlik. Mümkünse her ölçütü araç verisiyle doldur.
4. Karşılaştırma tablosu: seçenek × ölçüt (sayılarla), ağırlıklı puan.
5. Önerini net ver: "Önerim B, çünkü …"; neyi feda ettiğini (trade-off) ve hangi koşulda kararın değişeceğini yaz.
6. Uygulama adımları: ilk 3 adım, sahip, tarih. Kullanıcı isterse ilgili oner_* kartını hazırla.`,
    },
    {
        id: 'toplanti-hazirlik',
        name: 'Toplantı hazırlığı',
        when: 'Toplantı, sprint gözden geçirme, retro, müşteri görüşmesi, yönlendirme kurulu hazırlığı; gündem ve konuşma notları.',
        triggers: [/toplantı|gündem|retro|sprint (review|gözden)|yönlendirme kurulu|steering|görüşmeye hazırla|konuşma notu/i],
        playbook: `Oyun kitabı — Toplantı hazırlığı
1. Toplantının amacı ve katılımcılar: bilgi mi, karar mı, sorun çözme mi?
2. Veri: son_degisiklikler (son toplantıdan beri ne değişti), proje_detayi, risk_listesi, musteri_istekleri, notlari_ara (önceki kararlar ve açık aksiyonlar).
3. Çıktı:
**Amaç** (tek cümle) · **Süre önerisi**
**Gündem** (zaman kutulu maddeler; karar gereken maddeler başta)
**Her madde için konuşma notu**: 1 cümle durum + 1-2 sayı + istenen karar
**Açık aksiyonlar** (önceki toplantılardan: sahip, tarih, durum)
**Olası sorular ve yanıtları** (2-3)
**Toplantı sonrası** takip edilecekler. İstenirse dosya_olustur ile pptx/docx hazırla.`,
    },
];

const SKILL_MAP = new Map(SKILLS.map(s => [s.id, s]));

export const skillById = (id: string): AssistantSkill | undefined => {
    const k = id.trim().toLocaleLowerCase('tr-TR');
    return SKILL_MAP.get(k) || SKILLS.find(s => s.name.toLocaleLowerCase('tr-TR').startsWith(k));
};

/** Bir turda en çok bu kadar oyun kitabı otomatik eklenir (bağlam bütçesi) */
export const MAX_AUTO_SKILLS = 2;

/**
 * Kullanıcı mesajına (ekler dahil) uyan yetenekler, eşleşme sayısına göre.
 * Yalnız kullanıcının kendi metni ve EK başlıkları bakılır; ek içeriğindeki
 * sözcükler yetenek tetiklemez.
 */
export const matchSkills = (userText: string, max = MAX_AUTO_SKILLS): AssistantSkill[] => {
    const own = userText.split('[Kullanıcı ')[0];
    const heads = (userText.match(/<<<EK \d+:[^>]*>>>/g) || []).join('\n');
    const scored = SKILLS.map((s, order) => ({
        s, order,
        score: s.triggers.reduce((n, re) => n + (re.test(own) || re.test(heads) ? 1 : 0), 0),
    })).filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    return scored.slice(0, max).map(x => x.s);
};

export const skillCatalog = (): string =>
    `Yetenekler (oyun kitapları): isteğe uyan yeteneğin oyun kitabı aşağıda "Etkin yetenek" olarak verilmiş olabilir; verilmemişse ve istek bir yeteneğe uyuyorsa yanıtlamadan önce yetenek_yukle ile aç.\n${SKILLS.map(s => `- ${s.id}: ${s.when}`).join('\n')}`;

export const activeSkillsSection = (skills: AssistantSkill[]): string =>
    skills.length ? skills.map(s => `Etkin yetenek: ${s.name}\n${s.playbook}`).join('\n\n') : '';
