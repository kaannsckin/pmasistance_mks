# Pilot belgeleri

PlanAsistan pilotunun (22 Ekim–3 Aralık 2026; 13 Ekim'de bir hafta kaydırıldı) belgelerinin **ana kopyası bu klasördür**. claude.ai'deki belge kopyaları artık güncellenmez; bir değişiklik buraya commit olarak girer, eski hâl git geçmişinde kalır.

| Belge | Ne anlatır | Kim günceller |
| --- | --- | --- |
| [PILOT_NOTU.md](./PILOT_NOTU.md) | Rutinlerden beklentiler, iş döngüleri, takvim ve kapılar, senaryolar, puanlama, demo kapısı | Talimat ya da takvim değişince |
| [DANISMAN_RAPORU.md](./DANISMAN_RAPORU.md) | 10 Ekim danışman değerlendirmesi ve 12 Ekim güncellemesi | Yeni değerlendirmede (eski bölümler olduğu gibi kalır) |
| [SISTEM_TASARIMI.md](./SISTEM_TASARIMI.md) | Mimari, veri ve yetki, rapor akışı, demo güvencesi, tasarım kararları | Kod ya da altyapı değişince |
| [BACKLOG.md](./BACKLOG.md) | Açık ve yapılmış geliştirmeler (BL-xx), öncelik, durum, kanıt | Her iş başladığında ve bittiğinde |

Rutinlerin okuduğu talimatlar `pilot/` klasöründedir (`RUTIN_1_VERI.md`, `RUTIN_2_KULLANICILAR.md`, `SENARYOLAR.md`); bu klasördeki belgeler onların özeti ve gerekçesidir. İkisi çelişirse rutin talimatı geçerlidir ve buradaki belge düzeltilir.

**Güncelleme kuralları**

- Backlog'da bir iş yapıldığında durum `Yapıldı` olur ve kanıt sütununa commit ya da test sonucu yazılır; satır silinmez.
- BL numaraları değişmez; yeni iş bir sonraki boş numarayı alır (şu an BL-26).
- Tarihli rakamlar (doluluk, CPI, test sayısı) hangi güne ait olduğu yazılarak verilir.
