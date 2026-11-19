# Proje yapılandırması (Jira şema modeli)

Yönetici konsolu › **Proje yapılandırması**. Jira'da iş akışı, kayıt türü ve alan
ayarları projeye tek tek değil **şemalar** üzerinden verilir; bir şema birçok projede
paylaşılır. PlanAsistan'da bunların karşılığı tek bir **yapılandırma**dır.

| Parça | Jira karşılığı | Ne belirler |
|---|---|---|
| İş akışı | Workflow + workflow scheme | Durumlar (Türkçe ad, Jira adı, kategori), başlangıç durumu, izin verilen geçişler (serbest ya da tanımlı matris) |
| Kayıt türleri | Issue type scheme | Görev formunda sunulan türler |
| Zorunlu alanlar | Field configuration | Atanan, bitiş tarihi, süre tahmini, kayıt türü, etiket, iş paketi |
| Pano | Board configuration | Kolonlar, durum/etiket kuralları, WIP, hızlı filtreler, kulvarlar; proje yöneticisinin özelleştirip özelleştiremeyeceği |

## Nasıl çalışır

- **Atama:** Projeler tablosundan her projeye bir yapılandırma seçilir. Atanmamış proje
  **Varsayılan**'ı kullanır (tüm hazır durumlar, serbest geçiş — önceki davranış). Varsayılan da düzenlenebilir.
- **Paylaşım:** Bir yapılandırmayı düzenlemek, onu kullanan tüm projelere uygulanır (düzenleyicide kaç projenin etkileneceği yazar). Ayrı davranış gerekiyorsa **Kopyala**.
- **Şablonlar:** Basit · Yazılım geliştirme · Destek / hata takibi (Açık → Analizde → Testte → Çözüldü → Kapandı, Yeniden Açıldı) · Tam liste.
- **Kategori:** Her durum Bekleyen / Yapılacak / Süreçte / Tamamlandı kategorilerinden birine bağlıdır. İlerleme, EVM, tahmin ve yaşam döngüsü kategoriyi kullanır; bu yüzden durum eklemek hesapları bozmaz.
- **Geçiş kuralları** görev "…" menüsünde, durum seçicilerde (form, detay) ve panoda sürükle-bırakta uygulanır; yalnız izinli geçişler listelenir, izinsiz sürükleme gerekçesiyle reddedilir. "Tamamlandı olarak işaretle" gibi yalnız kategori isteyen kontroller, o kategorideki izinli ilk duruma çevrilir.
- **Jira:** Durumlar Jira adlarıyla saklanır; Jira eşitlemesi Jira'daki durumu her zaman uygular (kaynak Jira'dır). Şemada olmayan Jira durumundan her yere geçilebilir.
- **İş akışı değişince** (düzenleme ya da başka yapılandırma atama) yeni akışta olmayan durumdaki **yerel** görevler aynı kategorinin ilk durumuna taşınır; Jira'ya bağlı görevler dokunulmaz. Değişiklik ve taşınan görev sayısı denetim günlüğüne yazılır.
- **Pano:** Yapılandırmanın panosu yoksa iş akışından otomatik oluşur (Yapılacak · süreçteki her durum ayrı kolon · Tamamlandı). "Proje yöneticisi panoyu özelleştirebilir" açıksa PY kendi projesinde "Panoyu yapılandır" ile özelleştirir; admin her projenin panosunu Projeler tablosundan düzenleyip sıfırlayabilir.

Kod: `utils/projectScheme.ts` (şablonlar, çözümleme, doğrulama, taşıma), `utils/workflow.ts` (durumlar, geçişler), `utils/board.ts` (pano), `components/modern/admin/ProjectSchemes.tsx` (konsol).
