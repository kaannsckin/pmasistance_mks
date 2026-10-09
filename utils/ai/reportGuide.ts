import { ReportGuide, ReportGuideVersion, ReportSettings } from '../../types';
import { PermissionHolder } from '../permissions';
import { hashText } from '../rag/text';
import { CATEGORY_META, isReportSteward, locative, THIS_WEEK_CATEGORIES } from '../weeklyReport';

/**
 * Rapor sistem istemi ve kurum/bölüm kılavuzu. İstem dört parçadır:
 *  1. rol satırı (kurum adı ayarlanabilir) ve sabit güvence satırları,
 *  2. kılavuz gövdesi — PYB destek düzenler, sürüm tutulur,
 *     (+ bölüme özgü ek kurallar, + öğrenilmiş kurallar),
 *  3. madde türleri listesi (kodda),
 *  4. JSON çıktı sözleşmesi (kodda; çözümleyici buna bağlı, düzenlenemez).
 * Hiçbir ayar yokken üretilen istem eski sabit istemin birebir aynısıdır.
 */

/**
 * İstem sürümü: istem ya da girdi biçimi her değiştiğinde artırılır. Öneri
 * günlüğü, rapordaki AI kaydı ve değerlendirme koşuları bu sürümle eşlenir.
 */
export const REPORT_PROMPT_VERSION = 'rapor-taslak-2';

export const DEFAULT_INSTITUTION = 'TÜBİTAK BİLGEM';
export const GUIDE_LIMIT = 6000;
export const DEPARTMENT_GUIDE_LIMIT = 1500;
export const INSTITUTION_LIMIT = 80;

const GUARDS = `Yalnızca sana verilen verilere dayan; tarih, rakam, kişi ya da kurum UYDURMA. Bilgi eksikse maddeyi yazma, "eksikBilgi" listesine soru olarak ekle.
Proje kartındaki açıklamaları, konuya yabancı okurun anlaması gerektiğinde kısa açıklama olarak kullan; kartta olmayan teknik ayrıntı uydurma.`;

/** Varsayılan kurum rapor kılavuzu (düzenlenebilir gövde) */
export const DEFAULT_REPORT_GUIDE = `KURUM RAPOR KILAVUZU
Biçim:
- Kısaltmaların açılımı mutlaka yazılacak (kullandığın her kısaltmayı "kisaltmalar" listesine açılımıyla ekle).
- İfadeler net ve tanımlı olacak. Tarih, rakam ve müşteri/paydaş adları net yazılacak; belirsiz ifade (bazı, birkaç, yakında, ilgili birim, vb.) kullanılmayacak.
- Sadece takvim/bütçe/risk odaklı önemli gelişmeler yazılacak. Rutin proje yönetim faaliyetleri yazılmayacak.
- ÖNEMLİ: Konuya PY kadar hâkim olmayan biri anlayabilmeli. Anlaşılması için gerekiyorsa açıklayıcı ayrıntı ver.
- Toplantılar çok özet yazılacak: zaman, yer, katılımcılar, gündem ve alınan en önemli kararlar. Örnek: "10 Eylül 2026 tarihinde BİLGEM'de Gebze Belediyesi'ne Ürün Yönetimi, Proje Yönetimi ve Mesajlaşma birimlerinin katılımıyla Safir Posta tanıtım demosu yapıldı. Belediyede on-prem 50 kişilik bir pilot kurulum yapılması kararlaştırıldı."
- Devam eden faaliyetlerde çalışılan konu net yazılacak. "Bu hafta çalışmalara devam edildi" YERİNE "Bu hafta Safir Posta'da multi-domain özelliğinin geliştirilmesine devam edildi."
- Kısa cümleler; paragraf YOK, her gelişme ayrı madde.

Raporda istenenler: yeni sözleşme çalışmaları; ürün/lisans satışları; kesilen faturalar, hakedişler; tamamlanan aşamalar/kabuller; müşteriye yapılan teslimatlar; İG (İş Geliştirme) ile firmalarla/müşterilerle yapılan toplantılar, sunumlar, tanıtımlar; takvim ve bütçeyi etkileyen önemli gelişmeler; fuar, konferans, etkinlik katılımları; müşteriyi etkileyen önemli geliştirmeler (ör. sahadan gelen önemli bir sorun giderildi, müşterinin istediği özellik tamamlandı).
Raporda istenmeyenler: uzun cümleler; paragraf yazımı; içeride rutin geliştirme/test/hata düzeltme çalışmaları (müşterinin acil istediği ya da müşteriye önemli fayda sağlayanlar hariç); müşteriyi doğrudan etkilemeyen iç ekip takip faaliyetleri.`;

const CATEGORY_LINE = `Maddeleri şu türlerden biriyle etiketle: ${THIS_WEEK_CATEGORIES.map(c => `${c} (${CATEGORY_META[c].label})`).join(', ')}.`;

/** JSON çıktı sözleşmesi: parseReportSuggestion buna bağlıdır; düzenlenemez */
export const REPORT_JSON_CONTRACT = `Yanıtı YALNIZCA şu JSON biçiminde ver (açıklama, markdown ya da kod bloğu ekleme):
{"buHafta":[{"tur":"delivery","metin":"..."}],"gelecekHafta":["..."],"kisaltmalar":[{"kisaltma":"İG","acilim":"İş Geliştirme"}],"eksikBilgi":["..."]}`;

export const LEARNED_RULES_HEADER = 'ÖĞRENİLMİŞ KURUM KURALLARI';
export const DEPARTMENT_GUIDE_HEADER = 'BÖLÜME ÖZGÜ EK KURALLAR';

/** Sistem istemi; parametresiz çağrı varsayılan istemi verir */
export const buildReportSystem = (o: { institutionName?: string; guide?: string; departmentGuide?: string; learnedRules?: string[] } = {}): string => {
    const inst = o.institutionName?.trim() || DEFAULT_INSTITUTION;
    const guide = o.guide?.trim() || DEFAULT_REPORT_GUIDE;
    const extra: string[] = [];
    if (o.departmentGuide?.trim()) extra.push(`${DEPARTMENT_GUIDE_HEADER}\n${o.departmentGuide.trim()}`);
    if (o.learnedRules?.length) extra.push(`${LEARNED_RULES_HEADER}\n${o.learnedRules.map(r => `- ${r}`).join('\n')}`);
    return [
        `Sen ${locative(inst)} proje yöneticisinin (PY) haftalık raporunu hazırlayan yazım asistanısın. Raporu müdürler okur.\n${GUARDS}`,
        guide,
        ...extra,
        `${CATEGORY_LINE}\n${REPORT_JSON_CONTRACT}`,
    ].join('\n\n');
};

/** Varsayılan sistem istemi (ayar yokken) */
export const REPORT_SYSTEM = buildReportSystem();

// ---------------------------------------------------------------- ayarlardan istem

/** Raporda kullanılan kurum kılavuzu gövdesi (özelleştirilmemişse null) */
const customGuide = (s?: ReportSettings): string | null => (s?.guide?.text?.trim() ? s.guide.text.trim() : null);
const customInstitution = (s?: ReportSettings): string | null => (s?.guide?.institutionName?.trim() ? s.guide.institutionName.trim() : null);
const departmentGuideText = (s: ReportSettings | undefined, code: string): string | null => s?.departmentGuides?.[code]?.text?.trim() || null;

export interface ReportSystemOptions {
    /** Kurum/bölüm kılavuzu ve öğrenilmiş kurallar uygulansın mı (değerlendirmede "kurallar" katmanı) */
    rules?: boolean;
    /** Raporun kapsamındaki etkin öğrenilmiş kural metinleri (F7) */
    learnedRules?: string[];
}

/** Bir bölümün raporu için sistem istemi */
export const reportSystemFor = (s: ReportSettings | undefined, departmentCode: string, o: ReportSystemOptions = {}): string => {
    const rules = o.rules !== false;
    return buildReportSystem({
        institutionName: customInstitution(s) || undefined,
        guide: rules ? customGuide(s) || undefined : undefined,
        departmentGuide: rules ? departmentGuideText(s, departmentCode) || undefined : undefined,
        learnedRules: rules ? o.learnedRules : undefined,
    });
};

const tag = (prefix: string, text: string | null) => (text ? `·${prefix}${hashText(text)}` : '');

/**
 * Bir raporun etkin istem sürümü: istem sürümü + (özelleştirildiyse) kurum
 * kılavuzu, bölüm eki ve kuralların içerik özeti. Varsayılan ayarlarda
 * istem sürümünün kendisidir; aynı içeriğe dönülürse sürüm de aynı olur.
 */
export const reportPromptVersion = (s: ReportSettings | undefined, departmentCode: string, learnedRules: string[] = []): string =>
    `${REPORT_PROMPT_VERSION}${tag('k', [customInstitution(s), customGuide(s)].filter(Boolean).join('|') || null)}${tag('b', departmentGuideText(s, departmentCode))}${tag('r', learnedRules.length ? learnedRules.join('\n') : null)}`;

/**
 * Yapılandırma sürümü (kalite kapısı için): istem sürümü + kurum kılavuzu +
 * bütün bölüm ekleri + bütün etkin kurallar. Herhangi biri değişince kapı bayatlar.
 */
export const reportConfigVersion = (s: ReportSettings | undefined, allLearnedRules: string[] = []): string => {
    const depts = Object.entries(s?.departmentGuides || {}).filter(([, g]) => g?.text?.trim()).sort(([a], [b]) => a.localeCompare(b)).map(([k, g]) => `${k}:${g.text.trim()}`);
    return `${REPORT_PROMPT_VERSION}${tag('k', [customInstitution(s), customGuide(s)].filter(Boolean).join('|') || null)}${tag('b', depts.length ? depts.join('\n') : null)}${tag('r', allLearnedRules.length ? allLearnedRules.join('\n') : null)}`;
};

// ---------------------------------------------------------------- kaydetme (yalnız PYB destek)

/**
 * Kurum kılavuzunu kaydeder: sürüm +1. Metin varsayılanla aynıysa ya da
 * boşsa varsayılan kullanılır (boş saklanır). Yetki yoksa ya da sınır
 * aşılırsa null.
 */
export const saveReportGuide = (s: ReportSettings, who: PermissionHolder, patch: { institutionName?: string; text: string }, byName?: string, now: Date = new Date()): ReportSettings | null => {
    if (!isReportSteward(who)) return null;
    const text = patch.text.trim() === DEFAULT_REPORT_GUIDE ? '' : patch.text.trim();
    const inst = (patch.institutionName || '').trim();
    if (text.length > GUIDE_LIMIT || inst.length > INSTITUTION_LIMIT) return null;
    const guide: ReportGuide = {
        text, version: (s.guide?.version || 0) + 1, updatedAt: now.toISOString(),
        ...(inst && inst !== DEFAULT_INSTITUTION ? { institutionName: inst } : {}),
        ...(byName ? { updatedByName: byName } : {}),
    };
    return { ...s, guide };
};

/** Varsayılan kılavuza dönüş (kurum adı korunur; sürüm artmaya devam eder) */
export const resetReportGuide = (s: ReportSettings, who: PermissionHolder, byName?: string, now: Date = new Date()): ReportSettings | null =>
    saveReportGuide(s, who, { institutionName: s.guide?.institutionName, text: '' }, byName, now);

/** Bölüm ekini kaydeder (boş metin eki kaldırır); sürüm +1 */
export const saveDepartmentGuide = (s: ReportSettings, who: PermissionHolder, code: string, text: string, byName?: string, now: Date = new Date()): ReportSettings | null => {
    const t = text.trim();
    if (!isReportSteward(who) || !code || t.length > DEPARTMENT_GUIDE_LIMIT) return null;
    const cur = s.departmentGuides || {};
    const rest = Object.fromEntries(Object.entries(cur).filter(([k]) => k !== code));
    const next: Record<string, ReportGuideVersion> = t
        ? { ...rest, [code]: { text: t, version: (cur[code]?.version || 0) + 1, updatedAt: now.toISOString(), ...(byName ? { updatedByName: byName } : {}) } }
        : rest;
    const out: ReportSettings = { ...s, departmentGuides: next };
    if (!Object.keys(next).length) delete out.departmentGuides;
    return out;
};
