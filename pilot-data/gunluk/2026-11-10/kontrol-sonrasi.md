## Otomatik kontroller — 2026-11-10

**33/34 geçti** · 1 kaldı

| # | Kontrol | Sonuç | Ayrıntı |
|---|---|---|---|
| 1 | stdio bağlantısı (dist-mcp) | ✅ GEÇTİ | 19 araç · Müdür · Supabase (yzwmllzfynsrtlgxrpnw.supabase.co · PlanAsistan Pilot (kurgusal birim)) |
| 2 | elif: bağlantı ve kimlik | ✅ GEÇTİ | Proje Yöneticisi · Elif Yılmaz · 1 proje · değişiklik açık · Supabase (yzwmllzfynsrtlgxrpnw.supabase.co · PlanAsistan Pilot (kurgusal birim)) |
| 3 | elif: 22 okuma aracı | ✅ GEÇTİ | hepsi çalıştı |
| 4 | burak: bağlantı ve kimlik | ✅ GEÇTİ | Proje Yöneticisi · Burak Demir · 2 proje · değişiklik açık · Supabase (yzwmllzfynsrtlgxrpnw.supabase.co · PlanAsistan Pilot (kurgusal birim)) |
| 5 | burak: 22 okuma aracı | ✅ GEÇTİ | hepsi çalıştı; parametre/kapsam nedeniyle yanıt vermeyen: proje_detayi, durum_raporu_taslagi, haftalik_rapor_taslagi, jira_worklog |
| 6 | selin: bağlantı ve kimlik | ✅ GEÇTİ | Bölüm Sorumlusu · Selin Kaya · 4 proje · değişiklik açık · Supabase (yzwmllzfynsrtlgxrpnw.supabase.co · PlanAsistan Pilot (kurgusal birim)) |
| 7 | selin: 21 okuma aracı | ✅ GEÇTİ | hepsi çalıştı; parametre/kapsam nedeniyle yanıt vermeyen: proje_detayi, durum_raporu_taslagi, jira_worklog |
| 8 | mert: bağlantı ve kimlik | ✅ GEÇTİ | PYB Destek · Mert Aydın · 6 proje · değişiklik kapalı · Supabase (yzwmllzfynsrtlgxrpnw.supabase.co · PlanAsistan Pilot (kurgusal birim)) |
| 9 | mert: 21 okuma aracı | ✅ GEÇTİ | hepsi çalıştı; parametre/kapsam nedeniyle yanıt vermeyen: proje_detayi, durum_raporu_taslagi, jira_worklog |
| 10 | ahmet: bağlantı ve kimlik | ✅ GEÇTİ | Müdür · Ahmet Şahin · 6 proje · değişiklik kapalı · Supabase (yzwmllzfynsrtlgxrpnw.supabase.co · PlanAsistan Pilot (kurgusal birim)) |
| 11 | ahmet: 19 okuma aracı | ✅ GEÇTİ | hepsi çalıştı; parametre/kapsam nedeniyle yanıt vermeyen: proje_detayi, durum_raporu_taslagi, jira_worklog |
| 12 | elif: yalnız kendi projeleri | ✅ GEÇTİ | görülen: ATLAS Karar Destek Sistemi |
| 13 | elif: başkasının projesi engellenir | ✅ GEÇTİ | "PSL-2402" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez. |
| 14 | burak: yalnız kendi projeleri | ✅ GEÇTİ | görülen: NEHİR Veri Platformu, PUSULA Saha Mobil Uygulaması |
| 15 | burak: başkasının projesi engellenir | ✅ GEÇTİ | "ATL-2401" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez. |
| 16 | ahmet: not ve istek araçları yok | ✅ GEÇTİ | sunulmadı |
| 17 | ahmet: notlarda arama engellenir | ✅ GEÇTİ | Bu rol proje notlarına ve müşteri isteklerine erişemez. |
| 18 | ahmet: veri girmez, yalnız beklentiye kararını yazar | ✅ GEÇTİ | yalnız oner_beklenti_yanitla |
| 19 | görev sayıları (toplam/tamamlanan/geciken) | ✅ GEÇTİ | 6 proje tutarlı |
| 20 | tahsis plan toplamları (2026) | ✅ GEÇTİ | tüm projelerde tutarlı |
| 21 | kapasite_talep: talep rollerle eşleşiyor (rolsüz tahsis yok) | ❌ KALDI | Planlı talebin %0'i (0.4 AA) rolü girilmemiş tahsis satırlarında; bu talep hiçbir rolün kapasitesiyle eşleşmediği için "Rol atanmamış" satırında açık görünür. İşe alım kararından ö |
| 22 | bilinmeyen parametre sessizce yok sayılmaz | ✅ GEÇTİ | "gecikme" bu aracın parametresi değil. gorev_ara parametreleri: proje (metin), durum (Backlog\|ToDo\|InProgress\|Done), kisi (metin), geciken (true\|false), oncelik |
| 23 | Jira: uygulamanın istemcisi sahte Jira'yı sayfa sayfa eksiksiz okur | ✅ GEÇTİ | ATL 154, PSL 117, NHR 116, KLK 56 |
| 24 | Jira: ATL worklog toplamı (2026-10-28 – 2026-11-10) | ✅ GEÇTİ | istemci 233 sa, dışa aktarım 233 sa, 89 kayıt |
| 25 | elif: jira_aktar → onay → görevler Jira ile aynı | ✅ GEÇTİ | 0 yeni, 143 güncellenen; projede 154 Jira görevi / dışa aktarımda 154 |
| 26 | burak: başkasının projesine Jira aktarımı reddedilir | ✅ GEÇTİ | "ATL-2401" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez. |
| 27 | elif: öneri → onay → dosyaya yazıldı | ✅ GEÇTİ | risk eklendi ve yeniden okununca görüldü |
| 28 | burak: başkasının projesine öneri reddedilir | ✅ GEÇTİ | "ATL-2401" projesi kullanıcının yetki kapsamında değil; içeriği gösterilemez. |
| 29 | elif: kilitli plana plan girilemez | ✅ GEÇTİ | ATLAS Karar Destek Sistemi · 2026 planı onayda/kilitli; plan değiştirilemez (gerçekleşen girilebilir). |
| 30 | bulut: persona üyelikleri ve rolleri | ✅ GEÇTİ | 5 persona doğru rolde · çalışma alanında 8 üye |
| 31 | ahmet (müdür): notlar veritabanında okunamaz (RLS) | ✅ GEÇTİ | özel satır görünmüyor |
| 32 | ahmet (müdür): notlara yazamaz (RLS) | ✅ GEÇTİ | yazma reddedildi (0 satır) |
| 33 | elif (PY): notlar veritabanından okunur | ✅ GEÇTİ | özel belge sürüm 37 |
| 34 | sicil sızıntısı | ✅ GEÇTİ | hiçbir araç çıktısında sicil yok |
