import type { Guide } from './guides';

/**
 * Haftalık rapor rehberleri — rol başına ayrı ve çok sade anlatım: hangi
 * düğmeye basılır, ne olur, örnekle. Sayfa ilk açıldığında bir kez
 * kendiliğinden, sonra başlıktaki "i" düğmesiyle açılır. "i" bir sekmede ya
 * da rapor düzenleyicide basılırsa rehber o konunun adımından başlar (mode).
 */

export const WEEKLY_PY: Guide = {
    id: 'weeklyPy',
    version: 1,
    title: 'Haftalık rapor rehberi (proje yöneticisi)',
    steps: [
        {
            id: 'welcome', icon: 'report', title: 'Haftalık rapor nedir?',
            summary: 'Her hafta projenizde neler olduğunu müdürlere kısaca anlatan yazıdır. Siz yazarsınız, bölüm sorumlunuz okur ve onaylar, PYB destek biçimine bakar, sonra müdürlere gider.',
            how: [
                'Bu sayfada yöneticisi olduğunuz projeler alt alta listelenir.',
                'Bir projenin satırına dokunun: o haftanın raporu açılır. Rapor yoksa yenisi açılır.',
                'Başka bir haftaya bakmak için sağ üstteki hafta seçiciyi kullanın; "Bu hafta" sizi geri getirir.',
                'Üstteki sarı ya da kırmızı kutu, raporun son gününü ve kaç raporun gönderilmediğini söyler.',
            ],
            scenario: { title: 'Örnek', text: 'Perşembe sabahı sayfayı açtınız. "Son gün: Perşembe 8 Ekim — 2 proje raporu henüz gönderilmedi" yazıyor. Safir Posta satırına dokunup raporu yazmaya başlıyorsunuz.' },
            tip: 'Bu rehberi istediğiniz zaman sayfa başlığındaki "i" düğmesiyle yeniden açabilirsiniz.',
        },
        {
            id: 'write', icon: 'pencil', title: 'Raporu yazmak', mode: 'editor',
            summary: 'Rapor iki bölümdür: "Bu hafta gelişmeler" (ne oldu) ve "Gelecek hafta planlanan" (ne olacak). Her gelişme ayrı bir maddedir.',
            how: [
                '"Madde ekle"ye basın ve türünü seçin: fatura, teslimat, toplantı, sözleşme, devam eden iş gibi.',
                'Kutuya kısa ve net bir cümle yazın: kim, ne, ne zaman, ne kadar. Uzun paragraf yazmayın.',
                'Toplantı seçerseniz beş küçük kutu açılır: tarih, yer, katılımcılar, gündem, kararlar. Hepsini doldurun.',
                '"Plan ekle" ile gelecek haftanın planını yazın. Bitince "Kaydet"e basın; gönderene kadar istediğiniz kadar düzeltebilirsiniz.',
            ],
            scenario: { title: 'Örnek madde', text: 'Kötü: "Çalışmalara devam edildi." İyi: "Bu hafta Safir Posta\'da birden fazla alan adını tek kurulumda yönetme (multi-domain) özelliğinin geliştirilmesine devam edildi."' },
            tip: 'Maddeleri yukarı-aşağı oklarla sıralayabilir, çöp kutusuyla silebilirsiniz.',
        },
        {
            id: 'sources', icon: 'list', title: 'Hazır kaynaklardan madde eklemek', mode: 'editor',
            summary: 'Sağdaki "Kaynaklar" bölümü, bu hafta zaten yazdığınız ya da kayıtlı olan şeyleri gösterir. Tek dokunuşla maddeye çevirirsiniz.',
            how: [
                '"Bu haftanın notları": Günlük\'e yazdığınız notlar. "+ Madde" ile rapora eklenir.',
                '"Worklog": ekibin harcadığı saatler. Excel/CSV dosyasını yükleyin ya da Jira bağlıysa "Jira\'dan çek"e basın.',
                '"Bu hafta yapılan görüşmeler": kayıtlı müşteri görüşmeleri; tarih, yer, katılımcılar kendiliğinden dolar.',
                'Eklenen maddeyi mutlaka okuyup kendi cümlenizle düzeltin.',
            ],
            scenario: { title: 'Örnek', text: 'Salı günü "Gebze demo yapıldı, 50 kişilik pilot onaylandı" diye not almıştınız. Kaynaklarda bu not görünür; "+ Madde"ye basınca rapora gelir, siz de tarihi ekleyip cümleyi toparlarsınız.' },
        },
        {
            id: 'ai', icon: 'sparkles', title: 'AI ile taslak (Taslak öner)', mode: 'ai',
            summary: 'AI notlarınızdan, worklog\'dan, görüşmelerden ve proje kartından kurala uygun bir taslak çıkarır. AI hiçbir şeyi kendiliğinden rapora yazmaz; önce size gösterir.',
            how: [
                '"AI önerisi" kutusundaki "Taslak öner"e basın ve birkaç saniye bekleyin.',
                'Açılan pencerede öneriyi okuyun. Üstteki satır sorunları sayar: kırmızı = hata, sarı = uyarı.',
                'Sarı vurgulu sayı, tarih ya da ad notlarınızda geçmiyor demektir: doğruysa bırakın, değilse silin.',
                'Beğendiyseniz "Sonuna ekle" (ya da "Mevcutların yerine koy"), beğenmediyseniz "Vazgeç". Sonra maddeleri kendiniz düzeltin.',
            ],
            scenario: { title: 'Örnek', text: 'AI "120 kişilik pilot" yazmış ve 120 sarı vurgulu. Notunuzda 50 yazıyordu. Öneriyi uygulayıp 120\'yi 50 yapıyorsunuz. Düzelttiğiniz her şey AI\'nın kurumdan öğrenmesine yardım eder.' },
            tip: 'AI\'nın sorduğu "Netleştirilmesi gereken bilgiler"i (ör. "Pilot başlangıç tarihi nedir?") cevaplayıp maddeye eklemek raporu güçlendirir.',
        },
        {
            id: 'card', icon: 'book', title: 'Proje kartı (bir kez doldurun)', mode: 'ai',
            summary: 'Müdürler projenizi sizin kadar bilmez. Proje kartı, AI\'ya projenin ne olduğunu, müşterilerini ve özel terimleri anlatır; AI da raporu herkesin anlayacağı biçimde yazar.',
            how: [
                '"AI önerisi" kutusundaki "Proje kartı" düğmesine basın.',
                '"Proje ne yapıyor?" kutusuna iki üç cümle yazın; müşteri ve ürün adlarını ekleyin.',
                '"Terim ekle" ile kısaltma ve teknik terimleri kısa açıklamalarıyla girin.',
                '"Kaydet"e basın. Kart her hafta kullanılır; yalnız değişiklik olunca güncelleyin.',
            ],
            scenario: { title: 'Örnek', text: 'Terim: "Multi-domain" — Açıklama: "Birden fazla alan adını tek kurulumda yönetme". Artık AI bu terimi geçirince parantez içinde kısaca açıklar.' },
            tip: 'Kart proje kaydıyla birlikte paylaşılır; haftalık notlarınız gibi gizli değildir. Gizli bilgi yazmayın.',
        },
        {
            id: 'check', icon: 'check', title: 'Format denetimi: kırmızı ve sarı', mode: 'editor',
            summary: 'Sağdaki "Format denetimi" kutusu raporu kurum kurallarına göre siz yazarken kontrol eder.',
            how: [
                'Kırmızı (hata) varken rapor gönderilemez: ör. açılımı yazılmamış kısaltma, boş bölüm, eksik toplantı bilgisi.',
                'Sarı (uyarı) gönderimi engellemez ama düzeltmeniz istenir: "bazı", "yakında", "ilgili birim" gibi belirsiz ifadeler, uzun cümleler, rutin iç işler.',
                'Bir uyarıya dokunun: ekran o maddeye gider ve kutuya imleç konur.',
                'Kısaltmayı ya "KYS (Kurumsal Yazışma Sistemi)" diye maddenin içinde açın ya da "Kısaltmalar" bölümüne ekleyin.',
            ],
            scenario: { title: 'Örnek', text: '"Bazı modüllerde iyileştirme yapıldı" sarı uyarı verir. "Safir Posta arşiv ve arama modüllerinde 3 performans iyileştirmesi 7 Ekim 2026\'da müşteriye teslim edildi" yazınca uyarı kaybolur.' },
        },
        {
            id: 'send', icon: 'send', title: 'Plan değerlendirmesi, puan ve gönderme', mode: 'editor',
            summary: 'Göndermeden önce geçen haftanın planına ne olduğunu işaretler, projeye 1–10 puan verirsiniz; sonra raporu bölüm sorumlusuna gönderirsiniz.',
            how: [
                '"Geçen haftanın planı" kutusunda her madde için Yapıldı, Kısmen, Ertelendi ya da İptal\'e basın.',
                '"Proje sağlığı puanı"nda 1 (ciddi sorunlar) ile 10 (planlandığı gibi) arasında bir sayı seçin.',
                'En alttaki "Bölüm sorumlusuna gönder"e basın. Gönderdikten sonra rapor sizde salt okunur olur.',
                'Rapor geri gelirse üstte kırmızı "İade edildi" kutusunda nedeni yazar; düzeltip yeniden gönderin.',
            ],
            scenario: { title: 'Örnek', text: 'Geçen hafta "Pilot sunucuları kurulacak" demiştiniz ama donanım gecikti: "Ertelendi"ye basarsınız. Puanı 6 verip gönderirsiniz. Bölüm sorumlusu "Fatura tutarı eksik" diye iade ederse tutarı ekleyip tekrar gönderirsiniz.' },
        },
    ],
};

export const WEEKLY_BS: Guide = {
    id: 'weeklyBs',
    version: 1,
    title: 'Haftalık rapor rehberi (bölüm sorumlusu)',
    steps: [
        {
            id: 'welcome', icon: 'report', title: 'Sizin göreviniz',
            summary: 'Bölümünüzdeki proje yöneticilerinin raporlarını okur, gerekirse düzeltir ve onaylarsınız. Ayrıca projelere bağlı olmayan bölüm gelişmelerini siz yazarsınız.',
            how: [
                '"Onay bekleyen" sekmesi: PY\'lerin size gönderdiği raporlar.',
                '"Bölüm durumu" sekmesi: hangi projenin raporu yazıldı, hangisi eksik; bölüm eklemeleri.',
                '"Bölüm raporu" sekmesi: bölümünüzün birleşik raporu.',
                'Sağ üstteki hafta seçiciyle geçmiş haftalara bakabilirsiniz.',
            ],
            scenario: { title: 'Örnek', text: 'Perşembe öğleden sonra "Onay bekleyen 3" yazıyor. Üç raporu sırayla açıp okuyacak, ikisini onaylayıp birini düzeltme için iade edeceksiniz.' },
            tip: 'Bu rehberi istediğiniz zaman sayfa başlığındaki "i" düğmesiyle yeniden açabilirsiniz.',
        },
        {
            id: 'review', icon: 'check', title: 'Raporu onaylamak ya da iade etmek', mode: 'editor',
            summary: 'Açtığınız raporu doğrudan düzeltebilirsiniz. Küçük düzeltmeleri kendiniz yapın; içerik eksikse PY\'ye iade edin.',
            how: [
                '"Onay bekleyen"de bir rapora dokunun; maddeler düzenlenebilir hâlde açılır.',
                'Sağdaki "Format denetimi"nde kırmızı hata kalmadığından emin olun.',
                'Uygunsa en alttaki "Onayla, PYB desteğe gönder"e basın.',
                'Eksik varsa "İade et"e basın ve nedenini açıkça yazın: neyin eksik olduğunu ve nasıl düzeltileceğini.',
            ],
            scenario: { title: 'Örnek', text: 'Raporda "2. hakediş faturası kesildi" yazıyor ama tutar ve tarih yok. "İade et"e basıp "Fatura tutarı ve tarihi eksik; KYS kısaltmasını açın." yazıyorsunuz. PY düzeltip yeniden gönderiyor.' },
            tip: 'İade gerekçeleriniz boşa gitmez: PYB destek bunlardan AI için kurallar çıkarır, AI aynı hatayı daha az yapar.',
        },
        {
            id: 'status', icon: 'users', title: 'Eksik raporları takip etmek', mode: 'status',
            summary: '"Bölüm durumu" sekmesi bölümünüzdeki her projenin raporunun nerede olduğunu gösterir ve hatırlatma göndermenizi sağlar.',
            how: [
                'Projeler listesinde her satırın sağında aşaması yazar: Taslak, Bölüm sorumlusunda, PYB destekte, Onaylandı.',
                'Raporu hiç yazılmamış projeler de listededir.',
                'Sağdaki "Hatırlatma" kartından PY\'lere tek tek ya da topluca Teams mesajı veya e-posta açabilirsiniz.',
            ],
            scenario: { title: 'Örnek', text: 'Kurumsal Portal projesinin raporu hâlâ yok. Hatırlatma kartında Ali Veli\'nin yanındaki mesaj simgesine basıyorsunuz; Teams hazır mesajla açılıyor, siz de gönderiyorsunuz.' },
        },
        {
            id: 'additions', icon: 'pencil', title: 'Bölüm genel gelişmeleri', mode: 'status',
            summary: 'Hiçbir projeye ait olmayan gelişmeler (yeni sözleşme görüşmesi, fuar, iş geliştirme toplantısı) "Bölüm eklemeleri" raporuna yazılır.',
            how: [
                '"Bölüm durumu" sekmesinde en üstteki "Bölüm eklemeleri" satırına dokunun.',
                'Maddeleri proje raporundaki gibi yazın ya da "Taslak öner"e basın.',
                'AI, bölüm projelerinin gönderilmiş raporlarına ve bölüm görüşmelerine bakarak öneri yapar; proje maddelerini tekrar etmez.',
                'Bitince "PYB desteğe gönder"e basın.',
            ],
            scenario: { title: 'Örnek', text: '"7 Ekim 2026 tarihinde Ankara\'da Savunma Fuarı\'na Yazılım bölümü üç ürünle katıldı; iki kurumla demo planlandı." gibi bir maddeyi buraya yazarsınız.' },
        },
        {
            id: 'report', icon: 'eye', title: 'Bölüm raporunu görmek', mode: 'report',
            summary: '"Bölüm raporu" sekmesi bölümünüzün bu haftaki bütün raporlarını tek sayfada, müdürlerin göreceğine yakın biçimde gösterir.',
            how: [
                'İnceleme aşamasındaki raporlar da burada görünür; neyin eksik kaldığını tek bakışta görürsünüz.',
                'Bir projenin başlığına dokunarak raporunu açıp düzeltebilirsiniz.',
                'Raporun sonunda kullanılan kısaltmaların açılımları listelenir.',
            ],
            scenario: { title: 'Örnek', text: 'Göndermeden önce bölüm raporuna bakıyorsunuz: iki projede aynı müşteri toplantısı iki kez yazılmış. Birinden çıkarıyorsunuz.' },
        },
    ],
};

export const WEEKLY_STEWARD: Guide = {
    id: 'weeklySteward',
    version: 1,
    title: 'Haftalık rapor rehberi (PYB destek)',
    steps: [
        {
            id: 'welcome', icon: 'report', title: 'Sizin göreviniz',
            summary: 'Bölüm sorumlularının onayladığı raporların biçimini son kez denetler, haftayı yayınlar ve müdürlere gönderirsiniz. Rapor AI asistanını da siz yönetirsiniz.',
            how: [
                '"Onay bekleyen": format denetimi bekleyen raporlar.',
                '"Hafta durumu": bölüm bölüm kaç raporun hangi aşamada olduğu.',
                '"Enstitü raporu": birleşik rapor; yayınlama ve gönderme buradan.',
                '"Ayarlar": dağıtım listesi, kısaltma sözlüğü ve AI ayarları.',
            ],
            scenario: { title: 'Örnek', text: 'Cuma sabahı önce "Onay bekleyen"deki 12 raporu denetliyor, sonra "Enstitü raporu"ndan haftayı yayınlıyorsunuz.' },
            tip: 'Bu rehberi istediğiniz zaman sayfa başlığındaki "i" düğmesiyle yeniden açabilirsiniz. Ayarlar sekmesinde basarsanız AI ayarlarının adımlarından başlar.',
        },
        {
            id: 'format', icon: 'check', title: 'Format denetimi', mode: 'editor',
            summary: 'Raporu açın, kurum kurallarına uymayan yerleri düzeltin ya da iade edin. Onaylanan rapor yayına hazır olur.',
            how: [
                '"Onay bekleyen"de bir rapora dokunun.',
                'Sağdaki "Format denetimi"nde kırmızı hata ve sarı uyarıları tek tek düzeltin.',
                'Uygunsa "Formatı onayla"ya basın; değilse "İade et" ve nedenini yazın.',
                'İyi yazılmış bir raporu üstteki "Örnek olarak işaretle" ile işaretleyin: AI üslup örneği seçerken önce bunlara bakar.',
            ],
            scenario: { title: 'Örnek', text: 'Raporda "Çeşitli düzeltmeler yapıldı" sarı uyarı veriyor. Cümleyi "Müşterinin bildirdiği 3 arşiv hatası 6 Ekim 2026\'da giderildi" yapıp onaylıyorsunuz.' },
        },
        {
            id: 'publish', icon: 'send', title: 'Haftayı yayınlamak ve göndermek', mode: 'report',
            summary: 'Yayınlanan hafta kilitlenir ve müdürler ile PYB sorumlusu raporu bölüm bazında okur.',
            how: [
                '"Enstitü raporu" sekmesine geçin; "Onaylananlar" yalnız onaylı raporları gösterir.',
                '"Haftayı yayınla"ya basın. Onaylanmamış proje varsa uyarı çıkar; isterseniz onaylananlarla yayınlarsınız.',
                '"Metni kopyala", "Yazdır / PDF", "E-posta taslağı" ya da sunucuda açıksa "Müdürlere otomatik e-posta" ile iletin.',
                'Yayında AI metin puanı açıksa onaylı raporlar kendiliğinden puanlanır.',
            ],
            scenario: { title: 'Örnek', text: '45 projeden 43\'ü onaylı. "Haftayı yayınla" "2 aktif projenin raporu henüz onaylanmadı" diye sorar; "Tamam" deyip yayınlıyor, sonra e-posta taslağını indirip Outlook\'tan gönderiyorsunuz.' },
        },
        {
            id: 'general', icon: 'list', title: 'Genel ayarlar', mode: 'settings_general',
            summary: '"Ayarlar › Genel" raporun kime gideceğini, son günü ve kurum kısaltma sözlüğünü tutar.',
            how: [
                '"Dağıtım": müdür e-postalarını virgülle yazıp "Kaydet"e basın.',
                '"Rapor son günü": haftanın hangi günü son gün sayılacağı.',
                '"Kısaltma sözlüğü": sık kullanılan kısaltmaları açılımıyla ekleyin; raporlarda bunlar hata vermez.',
            ],
            scenario: { title: 'Örnek', text: 'Raporlarda "KYS" sık geçiyor. Sözlüğe "KYS = Kurumsal Yazışma Sistemi" ekliyorsunuz; artık PY\'ler her seferinde açmak zorunda kalmıyor ve sondaki kısaltmalar listesine kendiliğinden giriyor.' },
        },
        {
            id: 'guide', icon: 'book', title: 'AI kılavuzu ve bölüm ekleri', mode: 'settings_ai_guide',
            summary: 'AI taslağı, kurum rapor kılavuzuna göre yazar. Kılavuzu buradan düzenlersiniz; her kayıt yeni bir sürümdür.',
            how: [
                '"Ayarlar › AI kılavuzu ve kurallar" sekmesine geçin.',
                '"Kılavuz metni"ni düzenleyip "Kaydet"e basın. Beğenmezseniz "Varsayılana dön".',
                'Bir bölüme özel kural için bölümü seçin, "ek kurallar" kutusuna yazın ve kaydedin. Bu kurallar yalnız o bölümün raporlarında kullanılır.',
                '"Tam istemi önizle" ile AI\'ya giden metnin tamamını görebilirsiniz.',
            ],
            scenario: { title: 'Örnek', text: 'Altyapı bölümünde hakediş tutarları hep KDV dahil yazılıyor, müdürler KDV hariç istiyor. Altyapı bölümüne "Hakediş tutarlarını KDV hariç yaz." ekini kaydediyorsunuz.' },
            tip: 'Kılavuzu değiştirdikten sonra "AI kalitesi" sekmesinden yeniden değerlendirme yapın; kalite kapısı eski sonucu "bayat" sayar.',
        },
        {
            id: 'rules', icon: 'shield', title: 'Öğrenilmiş kurallar', mode: 'settings_ai_guide',
            summary: 'AI, tekrar eden hatalardan ve düzeltmelerden kural önerir. Siz onaylamadan hiçbir kural kullanılmaz.',
            how: [
                '"Adayları güncelle"ye basın: sık görülen format hataları ve AI taslağına yapılan düzeltmelerden öneriler gelir.',
                '"AI ile aday öner": iade notlarını okuyup en çok 5 kural önerir.',
                'Her öneride kanıt sayısı ve örnekler yazar. Uygunsa "Etkinleştir", değilse "Reddet". "Düzenle" ile metni değiştirebilirsiniz.',
                '"Elle kural ekle" ile kendi kuralınızı kurum, bölüm ya da proje için yazabilirsiniz.',
            ],
            scenario: { title: 'Örnek', text: '"Kısaltmanın açılımını ilk geçtiği yerde parantez içinde yaz" önerisi "Bölüm: Yazılım · 7 kanıt" ile geliyor. "Etkinleştir"e basıyorsunuz; AI artık Yazılım raporlarında kısaltmaları açarak yazıyor.' },
        },
        {
            id: 'quality', icon: 'gauge', title: 'AI kalitesi: tablo nasıl okunur?', mode: 'settings_ai_quality',
            summary: '"Ayarlar › AI kalitesi" sekmesindeki ilk kart, PY\'lerin AI önerisini gerçekte nasıl kullandığını gösterir.',
            how: [
                '"Uygulandı" yüksekse PY\'ler öneriyi işe yarar buluyor; "Vazgeçildi" yüksekse bulmuyor.',
                '"Aynen kaldı" yüksekse AI\'nın yazdığı gönderime kadar değişmeden kalıyor: iyi.',
                '"Silindi" ve "İade" yüksekse AI gereksiz ya da eksik yazıyor: kılavuz, proje kartı ve kurallara bakın.',
                'Gruplamayı "İstem sürümü" yapınca bir değişikliğin öncesi ve sonrası karşılaştırılır.',
            ],
            scenario: { title: 'Örnek', text: 'Kurallar etkinleşmeden önce "Aynen kaldı" %20, iade %15. İki hafta sonra yeni istem sürümünde "Aynen kaldı" %45, iade %6. Değişiklik işe yaramış.' },
        },
        {
            id: 'golden', icon: 'target', title: 'Altın set ve kalite kapısı', mode: 'settings_ai_quality',
            summary: 'Altın set, "iyi yazılmış" diye seçtiğiniz onaylı raporlardır. AI bu raporların haftasını yeniden yazar ve onaylı hâlle karşılaştırılır.',
            how: [
                '"Rapor ekle"ye basın; sistem uygun adayları önerir. Farklı bölümlerden en az 10 rapor ekleyin.',
                'Varyant olarak "Tam (üretim)"i seçip "AI ile değerlendir"e basın. İsterseniz "Temel" ile de koşup karşılaştırın.',
                'Tabloda en iyi değerler yeşil görünür: "Hata" ve "Dayanaksız" düşük, "Kapsama" ve "İsabet" yüksek olmalı.',
                '"Kalite kapısı zorunlu" açılırsa ve son değerlendirme geçmezse PY\'ler taslakta uyarı görür (öneri engellenmez).',
            ],
            scenario: { title: 'Örnek', text: '"Temel" kapsama %38, "Tam" kapsama %57 çıkıyor: proje kartı, örnekler ve kurallar işe yarıyor. Kapı eşiği %50 olduğu için "Tam" kapıdan geçiyor.' },
            tip: 'Kılavuz, kural ya da AI modeli değişince değerlendirmeyi yeniden çalıştırın.',
        },
        {
            id: 'finetune', icon: 'activity', title: 'İnce ayar gerekir mi?', mode: 'settings_ai_quality',
            summary: '"AI ince ayarı" kartı, modeli kurum diline özel eğitmenin gerekip gerekmediğini ölçüye göre söyler. Çoğu zaman gerekmez.',
            how: [
                'Kartın üstündeki karar satırını okuyun: "İnce ayar gerekmiyor", "Karar için veri yetersiz", "Düşünülebilir" ya da "Önerilir".',
                'Altındaki maddeler neyin eksik olduğunu söyler (ör. altın set küçük).',
                'Yalnız "Önerilir" ise "Veri kümesini hazırla" ile dosyaları indirip BT ile paylaşın; dosyada kişi adları maskelidir.',
            ],
            scenario: { title: 'Örnek', text: 'Kart "İnce ayar gerekmiyor — üretim istemi kalite kapısından geçiyor" diyor. Hiçbir şey yapmanıza gerek yok; üç ayda bir yeniden bakarsınız.' },
        },
    ],
};

export const WEEKLY_EXEC: Guide = {
    id: 'weeklyExec',
    version: 1,
    title: 'Haftalık rapor rehberi (yönetim)',
    steps: [
        {
            id: 'welcome', icon: 'report', title: 'Enstitü haftalık raporu',
            summary: 'Bu sayfada PYB desteğin yayınladığı haftalık rapor bölüm bölüm görünür: her projede bu hafta ne oldu, gelecek hafta ne yapılacak.',
            how: [
                'Sayfa açılınca son yayınlanan hafta gelir.',
                'Her bölümün altında projeler, her projenin altında "Bu hafta" ve "Gelecek hafta" maddeleri vardır.',
                'Projelere bağlı olmayan bölüm gelişmeleri "Bölüm genel" başlığındadır.',
            ],
            scenario: { title: 'Örnek', text: 'Cuma öğleden sonra sayfayı açıyorsunuz: "41. hafta" yayınlanmış. Yazılım bölümünde Safir Posta\'nın Gebze Belediyesi pilotunun onaylandığını okuyorsunuz.' },
            tip: 'Bu rehberi istediğiniz zaman sayfa başlığındaki "i" düğmesiyle yeniden açabilirsiniz.',
        },
        {
            id: 'week', icon: 'calendar', title: 'Başka bir haftaya bakmak',
            summary: 'Sağ üstteki hafta seçiciyle önceki haftaların raporlarını açabilirsiniz.',
            how: [
                'Sol ve sağ oklarla bir hafta geri ya da ileri gidin.',
                'Haftanın adına dokunup takvimden seçebilirsiniz.',
                'Henüz yayınlanmamış bir haftada "Bu haftanın raporu henüz yayınlanmadı" yazar.',
            ],
            scenario: { title: 'Örnek', text: 'Geçen ayki bir teslimatın ne zaman yapıldığını hatırlamak için üç hafta geri gidiyorsunuz.' },
        },
        {
            id: 'read', icon: 'eye', title: 'Raporu okumak',
            summary: 'Maddeler kurum kılavuzuna göre kısa yazılır: tarih, rakam ve müşteri adı net verilir. Kısaltmaların açılımı raporun sonundadır.',
            how: [
                'Önce bölüm başlıklarına göz atın, ilginizi çeken projeye inin.',
                'Bir kısaltmayı bilmiyorsanız raporun en altındaki "Kısaltmalar" listesine bakın.',
                'Proje adının yanında projenin yöneticisi (PY) yazar; sorunuz olursa ona ulaşabilirsiniz.',
            ],
            scenario: { title: 'Örnek', text: '"KYS entegrasyonu tamamlandı" maddesinde KYS\'yi bilmiyorsunuz; en altta "KYS: Kurumsal Yazışma Sistemi" yazıyor.' },
        },
        {
            id: 'rate', icon: 'gauge', title: 'Projeye sağlık puanı vermek (PMO)',
            summary: 'Yetkiniz varsa her projenin yanında 1–10 puan verebileceğiniz bir alan görünür. Bu puan proje sağlık modelinin öğrenmesinde kullanılır.',
            how: [
                'Projenin altındaki "PMO puanı" ölçeğinden bir sayı seçin: 1 ciddi sorunlar, 10 planlandığı gibi.',
                'İsterseniz kısa bir not yazın.',
                'Puanınız PY\'lere gösterilmez; yalnız modelin hedef değeri olarak kullanılır.',
            ],
            scenario: { title: 'Örnek', text: 'Bir projede iki haftadır teslimat erteleniyor. Raporu okuyup 5 puan veriyorsunuz ve "Teslimat iki kez ertelendi" notunu düşüyorsunuz.' },
        },
        {
            id: 'share', icon: 'mail', title: 'Paylaşmak ve yazdırmak',
            summary: 'Raporu kopyalayıp Teams\'e yapıştırabilir, yazdırabilir ya da e-posta taslağı olarak indirebilirsiniz.',
            how: [
                '"Metni kopyala": düz metni panoya alır; Teams ya da e-postaya yapıştırın.',
                '"Yazdır / PDF": düzenli bir sayfa açar; PDF olarak da kaydedebilirsiniz.',
                '"E-posta taslağı": Outlook\'ta açılan hazır bir taslak indirir.',
            ],
            scenario: { title: 'Örnek', text: 'Yönetim kurulu toplantısından önce raporu "Yazdır / PDF" ile PDF olarak kaydedip sunuma ekliyorsunuz.' },
        },
    ],
};
