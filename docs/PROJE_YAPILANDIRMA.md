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

## İş akışı tasarımcısı (diyagram)

Düzenleyicinin **İş akışı** sekmesi varsayılan olarak diyagram açılır (Tablo görünümü de durur):

- Durumlar tuvalde kutudur; renk kategoriyi gösterir (gri Yapılacak/Bekleyen, mavi Süreçte, yeşil Tamamlandı). Soldaki ● ok başlangıç durumudur.
- **Durum ekle:** hazır durumlar (Açık, Analizde, Testte, Çözüldü, Kapandı …) tek tıkla; "Özel durum" ile yenisi.
- **Ok çizmek:** "Oklarla çiz" modunda kutunun sağındaki ● tutamaçtan başka kutuya sürükleyin. Oka tıklayıp **Delete** ya da "Oku sil"; "Ters yönü de ekle".
- **Kutu seçince:** ad, Jira adı, kategori, "Başlangıç yap", "Her durumdan gelinebilir" (Jira global geçişi), gelen/giden oklar, akıştan çıkar.
- **Kısayollar:** Doğrusal akış, Okları temizle, Otomatik yerleştir. "Serbest geçiş" ile kurallar kaldırılır.
- Kutu konumları yapılandırmayla kaydedilir; çizilen akış "Kopyala" ya da "Yeni yapılandırma › kayıtlı bir yapılandırmadan başla" ile yeniden kullanılır.
- Kaydetmeden önce doğrulanır: başlangıçtan ulaşılamayan durum, tamamlanmaya ulaşılamaması, tekrar eden ad.

## Proje özelinde özelleştirme (Jira'daki karşılıkları)

Jira'da iki yol vardır: **şirket yönetimli** projeler (ayarlar paylaşılan şemalardan, değişikliği Jira yöneticisi yapar) ve **ekip yönetimli** projeler (her proje kendi ayarına sahip). Arada **genişletilmiş proje yönetimi** vardır: proje yöneticisi, şemanın sınırları içinde kendi projesinin iş akışını değiştirebilir — yalnız mevcut durumlarla, yeni durum ekleyemez. PlanAsistan aynı dengeyi yapılandırmadaki iki izinle kurar:

| İzin (yapılandırmada) | Proje yöneticisi ne yapabilir | Jira karşılığı |
|---|---|---|
| Panoyu özelleştirebilir | Kendi projesinde kolonlar, kurallar, WIP, hızlı filtreler, kulvarlar | Board admin |
| İş akışını özelleştirebilir | Panodaki **İş akışı** düğmesiyle kendi projesinin oklarını/başlangıcını çizer, durum çıkarır — yalnız yapılandırmadaki durumlarla | Extended project administration |
| (kapalı) | Yapılandırma neyse onu kullanır | Company-managed |
| Projeye özel yapılandırma | Admin "Kopyala" ile yalnız o projeye ait yapılandırma oluşturup atar | Team-managed'a en yakın |

- Admin bir yapılandırmadan durum çıkarırsa projeye özel akışlardan da düşer; izin kapatılırsa projeye özel akış yok sayılır (silinmez, izin açılınca döner).
- Projeler tablosunda "Özel akış" / "Özel pano" rozetleri ve **Akış** / **Pano** düğmeleriyle admin her projeyi görüp düzenleyebilir ya da sıfırlayabilir.
- Projeye özel akış kaydedilince akışta olmayan durumdaki yerel görevler taşınır; denetim günlüğüne yazılır.

**Sonraki adım önerileri** (Jira'da olup henüz olmayanlar): proje bazlı roller ve izin şeması (ör. "geçişi yalnız test ekibi yapabilir" — Jira koşulları), geçiş ekranları ve doğrulayıcılar (ör. Çözüldü'ye geçerken çözüm notu / harcanan süre zorunlu — Jira validator), geçiş sonrası otomatik işlemler (atanana bildirim, etiket ekleme — Jira post function / otomasyon), bileşen ve sürüm listelerinin projeye özel yönetimi, bildirim şeması.

## AI asistanı

AI'nın durum ve görev önerileri de aynı kurallara bağlıdır (`utils/ai/actions.ts`): izinsiz geçiş önerisi kart hazırlanmadan reddedilir ve model izinli geçişleri görür; belirli durum (Testte, Çözüldü …) Türkçe ya da Jira adıyla istenebilir; yeni görev önerisi başlangıç durumuyla açılır, kayıt türü ve zorunlu alan kurallarına uyar. Kart onaylanırken kurallar güncel veriyle yeniden denetlenir.

Kod: `utils/projectScheme.ts` (şablonlar, çözümleme, doğrulama, taşıma), `utils/workflow.ts` (durumlar, geçişler), `utils/board.ts` (pano), `components/modern/admin/ProjectSchemes.tsx` (konsol), `components/modern/admin/WorkflowDesigner.tsx` (diyagram), `components/modern/ProjectWorkflowSheet.tsx` (projeye özel akış).
