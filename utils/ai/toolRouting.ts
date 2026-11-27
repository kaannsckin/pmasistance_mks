import { View } from '../../types';
import { foldTr } from '../rag/text';

/**
 * Araç yönlendirme: her turda modele yalnız soruyla ilgili araç grupları
 * gönderilir. Böylece
 *  - model alakasız araçları (ör. maliyet sorusunda doküman araması) çağırıp
 *    vakit kaybetmez,
 *  - araç tanımları bağlamın yarısını yemez,
 *  - sunucunun araç sınırı (AI_LIMITS.maxTools) rollere göre aşılmaz.
 * Eşleşme kaçarsa model arac_ac ile eksik grubu turun ortasında açar.
 */

export type ToolGroup =
    | 'temel' | 'bilgi' | 'risk' | 'ekip' | 'maliyet' | 'plan' | 'gorev_degisiklik'
    | 'jira' | 'veri_havuzu' | 'dosya' | 'ekran' | 'yonetim' | 'whiteboard';

export const TOOL_GROUPS: Record<ToolGroup, { label: string; when: string; tools: string[] }> = {
    temel: {
        label: 'Temel',
        when: 'proje, görev, portföy okuma; hafıza',
        tools: ['proje_listesi', 'portfoy_ozeti', 'proje_detayi', 'gorev_ara', 'hafiza_kaydet', 'hafiza_sil', 'yetenek_yukle', 'arac_ac'],
    },
    bilgi: {
        label: 'Bilgi ve notlar',
        when: 'doküman, kılavuz, "nasıl yapılır", toplantı notları, kararlar, müşteri istekleri, son değişiklikler',
        tools: ['bilgi_ara', 'notlari_ara', 'musteri_istekleri', 'son_degisiklikler', 'oner_not_ekle', 'oner_istek_karari'],
    },
    risk: {
        label: 'Risk',
        when: 'risk listesi, risk ekleme/güncelleme, RAG (durum rengi)',
        tools: ['risk_listesi', 'oner_risk_ekle', 'oner_risk_guncelle', 'oner_rag_guncelle'],
    },
    ekip: {
        label: 'Ekip ve kapasite',
        when: 'kişi, doluluk, kapasite, tahsis, adam-ay, uygun kişi, iş yükü, takım',
        tools: ['kisi_profili', 'uygun_kisi_bul', 'doluluk_analizi', 'kapasite_talep', 'tahsis_ozeti', 'is_yuku_ongorusu', 'ekip_analizi', 'oner_tahsis_ayarla'],
    },
    maliyet: {
        label: 'Maliyet ve efor',
        when: 'maliyet, bütçe, EVM (SPI/CPI), harcanan saat, worklog, efor',
        tools: ['evm_analizi', 'maliyet_raporu', 'is_gucu_raporu'],
    },
    plan: {
        label: 'Plan ve tahmin',
        when: 'ne zaman biter, teslim tarihi, plan optimizasyonu, kilometre taşı, durum raporu',
        tools: ['plan_optimizasyonu', 'durum_raporu_taslagi'],
    },
    gorev_degisiklik: {
        label: 'Görev değişikliği',
        when: 'görev ekle, güncelle, durum değiştir, kaydır, ata, sil',
        tools: ['oner_gorev_ekle', 'oner_gorev_durumu', 'oner_gorev_guncelle', 'oner_gorev_sil', 'oner_gorev_plani', 'oner_plan_kurallari'],
    },
    jira: {
        label: 'Jira',
        when: 'Jira kaydı (ABC-123), Jira araması, Jira worklog\'u, Jira ile eşitleme',
        tools: ['jira_kayit_getir', 'jira_kayit_ara', 'jira_baglanti', 'jira_worklog_raporu', 'jira_kayit_worklog', 'is_gucu_raporu', 'oner_jira_esitle'],
    },
    veri_havuzu: {
        label: 'Veri havuzu',
        when: 'personel, ünvan, ünvan maliyeti, bölüm kayıtları',
        tools: ['veri_havuzu', 'oner_unvan_kaydet', 'oner_kisi_guncelle', 'oner_kisi_ekle', 'oner_bolum_kaydet'],
    },
    dosya: {
        label: 'Dosya ve analiz',
        when: 'Excel/Word/PDF/sunum dosyası, ekli tabloyu hesaplama, analiz',
        tools: ['dosya_olustur', 'veri_analiz'],
    },
    ekran: {
        label: 'Ekran',
        when: 'ekran aç, git, göster, görevi/kişiyi aç',
        tools: ['ekrana_git', 'gorev_ac', 'kisi_profili_ac', 'pencere_ac'],
    },
    yonetim: {
        label: 'Yönetim',
        when: 'departman karnesi, veri sağlığı, portföy sağlığı',
        tools: ['departman_karnesi', 'veri_sagligi'],
    },
    whiteboard: {
        label: 'Whiteboard',
        when: 'panoya çiz, ekran görüntüsünde işaretle, ekran taslağı, akış şeması, notları grupla, panodaki notlardan kayıt aç',
        tools: ['panoya_ciz', 'panodan_gorev_ac'],
    },
};

export const ALL_GROUPS = Object.keys(TOOL_GROUPS) as ToolGroup[];

const GROUP_OF = new Map<string, ToolGroup[]>();
for (const g of ALL_GROUPS) for (const t of TOOL_GROUPS[g].tools) GROUP_OF.set(t, [...(GROUP_OF.get(t) || []), g]);

/** Aracın ait olduğu gruplar (gruba konmamış araç her zaman sunulur) */
export const groupsOfTool = (name: string): ToolGroup[] => GROUP_OF.get(name) || [];

/** Katlanmış (küçük harf, aksansız) metin üzerinde çalışan kalıplar */
const RULES: { group: ToolGroup; re: RegExp }[] = [
    { group: 'bilgi', re: /nasil (yap|ekle|gir|kur|acil|degis|kullan)|nasil \w*(rim|riz|ilir)\b|hangi ekran|nereden|kilavuz|dokuman|belge|prosedur|surec|not(lar|u|ta|lari)?\b|toplanti|karar(lar|i)?\b|musteri|istek|talep(ler)?\b|gunluk|son degisiklik|ne degisti|yazmis|konusul|bahsed|kim demis|confluence/ },
    { group: 'risk', re: /risk|tehdit|rag\b|durum rengi|kirmizi|sari|yesil|pestel|swot|erken uyari/ },
    { group: 'ekip', re: /kapasite|doluluk|dolu |musait|uygun kisi|kim (bos|uygun|yapabilir|calisiyor)|tahsis|adam[- ]?ay|\baa\b|is ?yuku|yuku|fazla mesai|kisi(nin|ler|yi)?\b|ekip|takim|personel(in)? (yuk|is)|calisan|kaynak (plan|ihtiyac|atama)/ },
    { group: 'maliyet', re: /maliyet|butce|harca|evm|\bspi\b|\bcpi\b|kazanilan deger|worklog|efor|kac saat|saat(ler)? (yaz|gir|calis)|billed|fatura|para|tl\b|ucret/ },
    { group: 'plan', re: /ne zaman biter|kapsam\w* (daralt|azalt|kes|kis)|bitis tarih|teslim|yetisir|yetis|gecikme riski|plan(i|in|lama)? (optim|duzelt|kurtar)|optimiz|kilometre|milestone|kritik zincir|senaryo|monte carlo|p50|p80|durum raporu|haftalik rapor|sprint/ },
    { group: 'gorev_degisiklik', re: /(gorev|is|kayit|task)\w* (ekle|olustur|ac|sil|kaldir|guncelle|degistir|ata|kaydir|tasi|kapat|tamamla)|(ekle|sil|guncelle|kaydir|ertele|ata|kapat)(yin|in|r misin|ir misin|\b)|termin(ini|leri)? (degis|kaydir|ertele|guncelle)|durumunu (degis|guncelle|yap)/ },
    { group: 'jira', re: /jira|\b[a-z][a-z0-9]{1,9}-\d+\b|worklog|esitle|senkron/ },
    { group: 'veri_havuzu', re: /veri havuzu|unvan|personel (ekle|kayd|listesi)|bolum (ekle|kayd|kodu)|aylik maliyet|sicil/ },
    { group: 'dosya', re: /excel|xlsx|csv|word|docx|pdf|powerpoint|pptx|sunum|slayt|dosya|indir|rapor (hazirla|olustur|ver|yap)|analiz|incele|pivot|kirilim|dagilim|grafik|tablo(ya|lastir)/ },
    { group: 'ekran', re: /\b(ac|acar misin|goster|git|gotur|getir)\b|ekran(a|i)|sayfa(ya|yi)|pencere/ },
    { group: 'whiteboard', re: /whiteboard|panoya|panodaki|\bciz|isaretle|taslag|taslak|wireframe|akis (sema|diyagram)|ekran goruntusu|notlari grupla|(not|post.?it|yapiskan)\w*.{0,40}(gorev|kayit|task)/ },
    { group: 'yonetim', re: /departman|bolum karne|karne|veri sagli|eksik veri|tutarsiz|portfoy sagli|saglik puan/ },
];

/** Görünüm → doğal grup (ekrandaki soru çoğu zaman o ekranla ilgilidir) */
const VIEW_GROUPS: Partial<Record<View, ToolGroup[]>> = {
    [View.Risks]: ['risk'],
    [View.RiskReport]: ['risk'],
    [View.Resources]: ['ekip'],
    [View.Allocations]: ['ekip'],
    [View.Calendar]: ['ekip'],
    [View.DataPool]: ['veri_havuzu'],
    [View.Notes]: ['bilgi'],
    [View.Requests]: ['bilgi'],
    [View.Meetings]: ['bilgi'],
    [View.Planning]: ['plan'],
    [View.Roadmap]: ['plan'],
    [View.WeeklyReport]: ['plan'],
    [View.Executive]: ['yonetim', 'maliyet'],
    [View.Whiteboard]: ['whiteboard'],
};

/** Yetenek (oyun kitabı) → ihtiyaç duyduğu gruplar */
const SKILL_GROUPS: Record<string, ToolGroup[]> = {
    'veri-analizi': ['dosya'],
    'analitik-rapor': ['dosya'],
    'yonetici-ozeti': ['risk', 'plan'],
    'kok-neden': ['plan', 'maliyet'],
    'risk-degerlendirme': ['risk'],
    'kapasite-kaynak': ['ekip', 'maliyet'],
    tahmin: ['plan'],
    'karar-destek': ['plan', 'ekip'],
    'toplanti-hazirlik': ['bilgi', 'risk'],
};

export interface RouteInput {
    /** Kullanıcının bu turda kendi yazdığı metin (ek içeriği hariç) */
    text: string;
    view?: View;
    /** Mesaja Excel/CSV/PDF eklendi mi */
    hasAttachments?: boolean;
    /** Bu tur için seçilen yetenek kimlikleri */
    skills?: string[];
    /** Bu sohbetin önceki turunda kullanılan araçlar (takip soruları aynı alanda kalır) */
    previousTools?: string[];
}

/**
 * Bu tur için araç grupları. Hiçbir kalıp tutmazsa genel soru sayılır: temel
 * okuma + bilgi araması. Önceki turun grupları korunur ("peki ya Mehmet?").
 */
export const routeToolGroups = (input: RouteInput): Set<ToolGroup> => {
    const t = foldTr(input.text);
    const out = new Set<ToolGroup>(['temel']);
    for (const r of RULES) if (r.re.test(t)) out.add(r.group);
    const matched = out.size > 1;
    for (const g of (input.view !== undefined && VIEW_GROUPS[input.view]) || []) out.add(g);
    for (const s of input.skills || []) for (const g of SKILL_GROUPS[s] || []) out.add(g);
    if (input.hasAttachments) out.add('dosya');
    for (const name of input.previousTools || []) for (const g of groupsOfTool(name)) out.add(g);
    if (!matched && out.size === 1) out.add('bilgi');
    return out;
};

/** arac_ac aracının modele gösterilen grup kataloğu */
export const groupCatalog = (): string => ALL_GROUPS.filter(g => g !== 'temel').map(g => `${g}: ${TOOL_GROUPS[g].when}`).join('; ');
