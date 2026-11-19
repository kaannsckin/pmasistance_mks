## K0 Kurulum — 2026-11-03: Geçmedi
| Ölçüt | Durum | Kanıt |
|---|---|---|
| v5 yeniden kurulum yapıldı (mod: bulut) | ✓ | `bulut.json` kuruldu 2026-11-02T07:11Z; `ozet` kaynak Supabase, son_gun 2026-11-02 |
| `senaryo liste` S1, S3, S6, S8, S9, S10'u gösteriyor | ✓ | `senaryo liste` → S1,S3,S6,S8,S9,S10 |
| `kontrol` tümü geçti | ✓ | 34/34 (iki kez: koşu başı ve sonu) |
| `demo-testi` GEÇTİ | ✓ | 28/28 adım, ajanlardan önce ve sonra (portföy 66→63, MCP ile aynı); "dış kaynak yüklenemedi" CDN uyarısı ağ kısıtı |
| Beş ajan çalıştı, her biri en az bir yazma aracını gerekçeli kullandı | ✗ | Elif 6, Burak 10, Mert 5 uygulanan yazma; Selin 0 (tek yazma denemesi rol sınırı reddi); Ahmet 0 (müdürün yazma aracı yok, B-015) |

Karar ve sonraki adım: K0 Geçmedi, tek ölçüt nedeniyle (Selin ve Ahmet yazma aracı kullanmadı). Selin'in bugün karar verilecek bir raporu/talebi yoktu; yazma gerektiren iş ancak Perşembe/Salı gelince doğabilir. Ahmet için kod/talimat kararı gerekir: müdüre karar kaydı aracı (B-015) ya da K0 ölçütünün müdür için "kararı mesajla ilet" biçiminde gevşetilmesi. Kod değiştirmedim; karar kullanıcıda. Kopya: `K0-2026-11-03`.

## K1 Akış — 2026-11-10: Geçti
| Ölçüt | Durum | Kanıt |
|---|---|---|
| 45. hafta raporları uçtan uca MCP araçlarıyla geçti (5 Kasım gönderim → bölüm sorumlusu → 10 Kasım PYB destek ve yayın → müdür okur) | ✓ (kısmen) | NHR: gönder → Selin iade (5 Kasım) → Burak yeniden gönder → Selin onay → Mert onay → yayın → Ahmet okudu. KLK: gönder → Mert onay → yayın → Ahmet okudu (bs_approve kaydı yok, B-016). ATL ve PSL: Selin onayı sonrası Mert iade etti (B-029), yayına girmedi |
| S2 kararı uygulamada | ✓ | `musteri_istekleri` → "Çevrimdışı mod…" Rejected, 4 Kasım istek, 5 Kasım karar |
| Ahmet en az bir kararını `oner_beklenti_yanitla` ile yazdı (BL-30) | ✓ | `beklentiler`: exp-mw34nz08 (5 Kasım), exp-mw34r2q4 ve exp-mwaa13ot (10 Kasım) yanıtlı |
| Açık yüksek bulgu yok ya da düzeltmesi planlandı | ✓ | `bulgular.json`: açık yüksek 0; B-028 (kilit açma aracı yok) ve B-029 orta, düzeltme planı yok (kullanıcı kararı) |

Karar ve sonraki adım: K1 Geçti, ama ATL/PSL raporları yayında değil (Mert'in EVM gerekçeli iadesi tartışmalı, B-029) ve plan kilidi kararı uygulanamıyor (B-028). 12 Kasım koşusunda Elif ve Burak raporlarını yeniden gönderecek; Selin ve Mert denetleyecek. Kopya: `K1-2026-11-10`.

## K2 Senaryo — 2026-11-19: Geçmedi
| Ölçüt | Durum | Kanıt |
|---|---|---|
| S1, S2, S4, S7 başarı ölçütleri; S3 ve S6 erken tepkisi — en az 4/6 ✓ | ✓ (5/6) | S1 ✓ (12 Kasım: NHR-118 aktarım, risk 16, RAG Kritik, rapor; Ahmet tavan 930.000 TL). S2 ✓ (5 Kasım ret). S4 ✓ (NHR H45 ve H46 iadelerinin tüm maddeleri karşılandı). S7 ✓ (3 Kasım, ±0,05 AA). S3 ✓ (Elif ATL-157 riski + devir talebi, Ahmet Emre'ye devri onayladı; izin duyurusu notta yok, izin olay satırı var). S6 ✗ (NHR fazla mesai/ay içi tahmin ile erken uyarı yok; Mert NHR worklog'unu kontrol etti, Burak yazmadı) |
| PY ortalaması ≥ 75 | ✓ | 12 Kasım 85,5; 19 Kasım 86,5 |
| DH1–DH3 ✓ | ✗ | DH1 ✗ (33/34 dört koşudur, #21); DH2 ✗ (açık orta: B-025, B-028, B-030, B-031, B-032); DH3 ✓ |
| Gömülü bulguların en az 3/6'sı bulundu | ✓ | G1 (Burak), G2 (Elif), G3 (Mert) = 3/6 |

Karar ve sonraki adım: K2 Geçmedi, tek ölçüt nedeniyle (DH1–DH3). Senaryo ölçütleri ve puan tamam. 17 Kasım koşusu yapılamadığı için S9 (PSL kritik hata, 18 Kasım) tepkisi bugün ilk kez alındı: Burak öncelik/risk/RAG yazdı, iki projenin krizini Ahmet'e birlikte anlatmadı, S2'yi yeniden değerlendirmedi. S6'nın telafisi (S12) 24 ve 26 Kasım koşularına bırakılabilir. Demo kapsamı için karar: kod düzeltmesi (kontrol #21 rolsüz tahsis satırı, kilit açma yolu B-028, yayınlanmış haftada takılan raporlar B-030) kullanıcıda. Kopya: `K2-2026-11-19`.
