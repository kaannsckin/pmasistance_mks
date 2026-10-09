## Otomatik kontroller — 2026-10-09

**28/28 geçti**

| # | Kontrol | Sonuç | Ayrıntı |
|---|---|---|---|
| 1 | stdio bağlantısı (dist-mcp) | ✅ GEÇTİ | 17 araç listelendi |
| 2 | elif: bağlantı ve kimlik | ✅ GEÇTİ | Proje Yöneticisi · Elif Yılmaz · 1 proje · değişiklik açık |
| 3 | elif: 19 okuma aracı | ✅ GEÇTİ | hepsi çalıştı |
| 4 | burak: bağlantı ve kimlik | ✅ GEÇTİ | Proje Yöneticisi · Burak Demir · 2 proje · değişiklik açık |
| 5 | burak: 19 okuma aracı | ✅ GEÇTİ | hepsi çalıştı; parametre/kapsam nedeniyle yanıt vermeyen: proje_detayi, durum_raporu_taslagi, jira_worklog |
| 6 | selin: bağlantı ve kimlik | ✅ GEÇTİ | Bölüm Sorumlusu · Selin Kaya · 4 proje · değişiklik açık |
| 7 | selin: 19 okuma aracı | ✅ GEÇTİ | hepsi çalıştı; parametre/kapsam nedeniyle yanıt vermeyen: proje_detayi, durum_raporu_taslagi, jira_worklog |
| 8 | mert: bağlantı ve kimlik | ✅ GEÇTİ | PYB Destek · Mert Aydın · 5 proje · değişiklik kapalı |
| 9 | mert: 19 okuma aracı | ✅ GEÇTİ | hepsi çalıştı; parametre/kapsam nedeniyle yanıt vermeyen: proje_detayi, durum_raporu_taslagi, jira_worklog |
| 10 | ahmet: bağlantı ve kimlik | ✅ GEÇTİ | Müdür · Ahmet Şahin · 5 proje · değişiklik kapalı |
| 11 | ahmet: 17 okuma aracı | ✅ GEÇTİ | hepsi çalıştı; parametre/kapsam nedeniyle yanıt vermeyen: proje_detayi, durum_raporu_taslagi, jira_worklog |
| 12 | elif: yalnız kendi projeleri | ✅ GEÇTİ | görülen: ATLAS Karar Destek Sistemi |
| 13 | elif: başkasının projesi engellenir | ✅ GEÇTİ | "PSL-2402" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez. |
| 14 | burak: yalnız kendi projeleri | ✅ GEÇTİ | görülen: NEHİR Veri Platformu, PUSULA Saha Mobil Uygulaması |
| 15 | burak: başkasının projesi engellenir | ✅ GEÇTİ | "ATL-2401" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez. |
| 16 | ahmet: not ve istek araçları yok | ✅ GEÇTİ | sunulmadı |
| 17 | ahmet: notlarda arama engellenir | ✅ GEÇTİ | Bu rol proje notlarına ve müşteri isteklerine erişemez. |
| 18 | ahmet: değişiklik araçları yok | ✅ GEÇTİ | müdür veri girmez |
| 19 | görev sayıları (toplam/tamamlanan/geciken) | ✅ GEÇTİ | 5 proje tutarlı |
| 20 | tahsis plan toplamları (2026) | ✅ GEÇTİ | tüm projelerde tutarlı |
| 21 | Jira: uygulamanın istemcisi sahte Jira'yı sayfa sayfa eksiksiz okur | ✅ GEÇTİ | ATL 111, PSL 93, NHR 92, KLK 44 |
| 22 | Jira: ATL worklog toplamı (2026-09-26 – 2026-10-09) | ✅ GEÇTİ | istemci 212.5 sa, dışa aktarım 212.5 sa, 72 kayıt |
| 23 | elif: jira_aktar → onay → görevler Jira ile aynı | ✅ GEÇTİ | zaten güncel (111 görev) |
| 24 | burak: başkasının projesine Jira aktarımı reddedilir | ✅ GEÇTİ | "ATL-2401" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez. |
| 25 | elif: öneri → onay → dosyaya yazıldı | ✅ GEÇTİ | risk eklendi ve yeniden okununca görüldü |
| 26 | burak: başkasının projesine öneri reddedilir | ✅ GEÇTİ | "ATL-2401" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez. |
| 27 | elif: kilitli plana plan girilemez | ✅ GEÇTİ | ATLAS Karar Destek Sistemi · 2026 planı onayda/kilitli; plan değiştirilemez (gerçekleşen girilebilir). |
| 28 | sicil sızıntısı | ✅ GEÇTİ | hiçbir araç çıktısında sicil yok |
