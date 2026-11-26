import { View } from '../../types';

/**
 * Asistan ölçüm seti: gerçek kullanımdan derlenmiş sorular ve her biri için
 * yanıtlamaya GEREKEN araçlar ile beklenen yetenek (oyun kitabı).
 *
 * Bugün deterministik olarak ölçülenler (toolRouting.test.ts):
 *  - yönlendirme kapsaması: gereken araç bu tura sunulan gruplarda mı (kaçırma = yanlış ya da "erişimim yok" yanıtı)
 *  - yönlendirme sadeliği: bir isteğe ortalama kaç araç gidiyor (fazlası = alakasız tarama, şişen bağlam)
 *  - yetenek eşleşmesi: ağır analiz yönergesi yalnız gerektiğinde açılıyor mu (fazlası = gereksiz uzun yanıt)
 *
 * Yeni bir şikâyet ("şunu sordum, alakasız yere baktı") geldiğinde soruyu buraya ekleyin.
 */

export interface EvalCase {
    id: string;
    soru: string;
    /** Yanıt için gereken araçlardan en az biri (sırayla alternatifler değil, hepsi gerekli) */
    gerekli: string[];
    /** Beklenen yetenek kimliği; null = ağır yönerge açılmamalı; undefined = ölçülmez */
    yetenek?: string | null;
    view?: View;
    ek?: boolean;
}

export const EVAL_SET: EvalCase[] = [
    // Basit okuma: kısa yanıt, ağır yönerge yok
    { id: 'durum-1', soru: 'ATLAS projesinin durumu nasıl?', gerekli: ['proje_detayi'], yetenek: null },
    { id: 'durum-2', soru: 'Portföyde kaç proje var, kaçı kritik?', gerekli: ['portfoy_ozeti'], yetenek: null },
    { id: 'gorev-1', soru: 'Geciken görevler hangileri?', gerekli: ['gorev_ara'], yetenek: null },
    { id: 'gorev-2', soru: 'Ayşe\'nin üzerindeki açık işler neler?', gerekli: ['gorev_ara'], yetenek: null },
    { id: 'gorev-3', soru: 'Bu sprintte kaç iş tamamlandı?', gerekli: ['gorev_ara'], yetenek: null },
    { id: 'liste-1', soru: 'Görevleri Excel\'e aktar', gerekli: ['gorev_ara', 'dosya_olustur'], yetenek: null },
    { id: 'liste-2', soru: 'Açık riskleri PDF olarak ver', gerekli: ['risk_listesi', 'dosya_olustur'], yetenek: 'risk-degerlendirme' },

    // Risk
    { id: 'risk-1', soru: 'En yüksek 5 risk hangisi?', gerekli: ['risk_listesi'], yetenek: 'risk-degerlendirme' },
    { id: 'risk-2', soru: 'Tedarikçi gecikmesi için yeni risk ekle', gerekli: ['oner_risk_ekle'], yetenek: 'risk-degerlendirme' },
    { id: 'risk-3', soru: 'Bu ekranda en kritik olan hangisi?', gerekli: ['risk_listesi'], view: View.Risks },
    { id: 'rag-1', soru: 'ATLAS\'ın durum rengini kırmızı yap', gerekli: ['oner_rag_guncelle'] },

    // Ekip ve kapasite
    { id: 'kap-1', soru: 'Bu yıl kapasitesini aşan kişiler kim?', gerekli: ['doluluk_analizi'], yetenek: 'kapasite-kaynak' },
    { id: 'kap-2', soru: 'Mart ayında React bilen müsait biri var mı?', gerekli: ['uygun_kisi_bul'], yetenek: 'kapasite-kaynak' },
    { id: 'kap-3', soru: 'Mehmet\'in iş yükü nasıl?', gerekli: ['kisi_profili'], yetenek: 'kapasite-kaynak' },
    { id: 'kap-4', soru: 'Ayşe\'yi Aralık–Mart BORA\'ya %50 tahsis et', gerekli: ['oner_tahsis_ayarla'], yetenek: 'kapasite-kaynak' },
    { id: 'kap-5', soru: 'Takımlar arasında iş dağılımı dengeli mi?', gerekli: ['ekip_analizi'] },
    { id: 'kap-6', soru: 'Gelecek çeyrekte kaç adam-ay açığımız var?', gerekli: ['kapasite_talep'], yetenek: 'kapasite-kaynak' },

    // Maliyet ve efor
    { id: 'mal-1', soru: 'ATLAS bütçesinin ne kadarı harcandı?', gerekli: ['maliyet_raporu'], yetenek: null },
    { id: 'mal-2', soru: 'CPI ve SPI değerleri nedir?', gerekli: ['evm_analizi'], yetenek: null },
    { id: 'mal-3', soru: 'Bu ay kim hangi kayıtta kaç saat çalıştı?', gerekli: ['is_gucu_raporu'], yetenek: null },
    { id: 'mal-4', soru: 'Maliyet neden plandan sapıyor?', gerekli: ['evm_analizi', 'maliyet_raporu'], yetenek: 'kok-neden' },

    // Plan ve tahmin
    { id: 'plan-1', soru: 'ATLAS bu hızla ne zaman biter?', gerekli: ['plan_optimizasyonu'], yetenek: 'tahmin' },
    { id: 'plan-2', soru: 'Mart teslimine yetişir miyiz?', gerekli: ['plan_optimizasyonu'], yetenek: 'tahmin' },
    { id: 'plan-3', soru: 'Bu haftanın durum raporu taslağını hazırla', gerekli: ['durum_raporu_taslagi'] },
    { id: 'plan-4', soru: 'Teslim tarihi neden 3 hafta kaydı?', gerekli: ['gorev_ara'], yetenek: 'kok-neden' },

    // Görev değişikliği
    { id: 'deg-1', soru: 'Geciken görevleri iki hafta kaydır', gerekli: ['gorev_ara', 'oner_gorev_guncelle'] },
    { id: 'deg-2', soru: 'Login hatası için yeni görev ekle', gerekli: ['oner_gorev_ekle'] },
    { id: 'deg-3', soru: 'Ayşe\'nin işlerini Mehmet\'e ata', gerekli: ['gorev_ara', 'oner_gorev_guncelle'] },
    { id: 'deg-4', soru: 'Tamamlanan test görevlerini sil', gerekli: ['gorev_ara', 'oner_gorev_sil'] },

    // Bilgi ve notlar
    { id: 'bilgi-1', soru: 'Tahsis planını onaya nasıl gönderirim?', gerekli: ['bilgi_ara'], yetenek: null },
    { id: 'bilgi-2', soru: 'Geçen haftaki toplantıda ATLAS için hangi karar alındı?', gerekli: ['notlari_ara'] },
    { id: 'bilgi-3', soru: 'Müşteri isteklerinden bekleyen var mı?', gerekli: ['musteri_istekleri'] },
    { id: 'bilgi-4', soru: 'Dünden beri ne değişti?', gerekli: ['son_degisiklikler'], yetenek: 'kok-neden' },

    // Jira
    { id: 'jira-1', soru: 'ATL-123 kaydının güncel durumu ne?', gerekli: ['jira_kayit_getir'] },
    { id: 'jira-2', soru: 'Jira ile görevleri eşitle', gerekli: ['oner_jira_esitle'] },
    { id: 'jira-3', soru: 'ATLAS ve BORA projelerinin kasım worklog raporu', gerekli: ['jira_worklog_raporu'] },

    // Veri havuzu
    { id: 'havuz-1', soru: 'Kıdemli Uzman ünvanının aylık maliyeti nedir?', gerekli: ['veri_havuzu'] },

    // Yönetim
    { id: 'yon-1', soru: 'Bölümlerin karnesini göster', gerekli: ['departman_karnesi'] },
    { id: 'yon-2', soru: 'Verilerde eksik ya da tutarsız kayıt var mı?', gerekli: ['veri_sagligi'] },

    // Analiz ve rapor
    { id: 'ana-1', soru: 'Bu dosyayı analiz et, nerede aşım var?', gerekli: ['veri_analiz'], yetenek: 'veri-analizi', ek: true },
    { id: 'ana-2', soru: 'ATLAS Kasım maliyet durumunu yönetime sunum olarak hazırla', gerekli: ['maliyet_raporu', 'dosya_olustur'], yetenek: 'analitik-rapor' },
    { id: 'ana-3', soru: 'Üst yönetime ATLAS yönetici özeti yaz', gerekli: ['proje_detayi'], yetenek: 'yonetici-ozeti' },
    { id: 'ana-4', soru: 'Yarınki yönlendirme kurulu için gündem çıkar', gerekli: ['proje_detayi'], yetenek: 'toplanti-hazirlik' },
    { id: 'ana-5', soru: 'Kapsamı mı daraltalım yoksa kişi mi ekleyelim?', gerekli: ['plan_optimizasyonu'], yetenek: 'karar-destek' },

    // Ekran
    { id: 'ekran-1', soru: 'ATLAS\'ın risk ekranını aç', gerekli: ['ekrana_git'] },
    { id: 'ekran-2', soru: 'ATL-59 görevini göster', gerekli: ['gorev_ac'] },

    // Hafıza
    { id: 'haf-1', soru: 'Bana Murat Bey diye hitap et, hatırla', gerekli: ['hafiza_kaydet'], yetenek: null },
    { id: 'haf-2', soru: 'Bunu hafızaya ekle: ATLAS teslimi Ocak sonuna kaydı', gerekli: ['hafiza_kaydet'] },
];
