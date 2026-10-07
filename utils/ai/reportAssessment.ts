import { AiAssessmentFlag, AiReportAssessment, AiScoringPolicy, Project, ReportItem, WeeklyReport } from '../../types';
import { foldTr, hashText } from '../rag/text';
import { CATEGORY_META, itemDisplay, weekLabel } from '../weeklyReport';
import { extractJson } from './json';

/**
 * Haftalık rapor metninin AI değerlendirmesi — sağlık modelinin "AI metin
 * puanı" girdisi. Model yalnız rapor metnini görür: PY puanı, plan
 * değerlendirmesi ve sayısal göstergeler (SPI, görev sayıları) ayrı girdiler
 * olduğu için verilmez; aynı bilgi iki kez sayılmasın.
 *
 * Halüsinasyon güvenceleri:
 *  1. Dayanak: model yalnız rapor metnini görür; önce rapordan birebir alıntı
 *     çıkarır, sonra puanlar. Metinde birebir geçmeyen alıntı atılır.
 *  2. Kapalı çıktı: JSON şeması, 1–10 sıkıştırma, kapalı sinyal listesi.
 *  3. Tutarlılık: aynı rapor N kez bağımsız puanlanır; skor medyandır,
 *     tekrarlar arası fark (dağılım) güveni belirler.
 *  4. Çapraz kontrol: kural tabanlı metin göstergesi (tarih, tutar, teslimat,
 *     genel ifade, olumsuz sinyal) ve sinyal–puan çelişkisi.
 *  5. Güven: kanıt yetersiz, tutarsız ya da çelişkili puan "düşük güven"
 *     olur; admin ayarına göre sağlık skoruna girmez ya da işaretlenir.
 */

export const ASSESSMENT_PROMPT_VERSION = 'rapor-puan-2';

export const ASSESSMENT_SIGNALS = ['engel', 'belirsizlik', 'takvim_kaymasi', 'butce_etkisi', 'musteri_sorunu', 'kaynak_sorunu', 'somut_teslimat', 'musteri_kabulu'] as const;

export const SIGNAL_LABELS: Record<string, string> = {
    engel: 'engel',
    belirsizlik: 'belirsizlik',
    takvim_kaymasi: 'takvim kayması',
    butce_etkisi: 'bütçe etkisi',
    musteri_sorunu: 'müşteri sorunu',
    kaynak_sorunu: 'kaynak sorunu',
    somut_teslimat: 'somut teslimat',
    musteri_kabulu: 'müşteri kabulü',
};

export const ASSESSMENT_SYSTEM = `Sen TÜBİTAK BİLGEM PMO'sunda haftalık proje raporlarını okuyan bir analistsin. Görevin, raporun METNİNE bakarak projenin bu haftaki durumunu 1–10 arası puanlamak.

Kurallar:
- Yalnızca rapor metnine dayan; bilgi uydurma, tahmin yürütme.
- Takvim/bütçe endeksleri ve görev sayıları ayrıca ölçülüyor. Sen metnin nitel yanını değerlendir: somut ilerleme ve teslimatlar, engeller, belirsizlikler, takvim ya da bütçe etkisi, müşteriyle ilgili sorunlar, kaynak sıkıntısı.
- Olumlu ya da iddialı dil puanı ARTIRMAZ; somut kanıt (tarih, teslimat, kabul, karar) ara.
- Genel ifadeler ("çalışmalara devam edildi") ve somut olmayan gelecek hafta planı puanı düşürür.

Puan ölçeği:
9–10: somut teslimat, kabul ya da karar var; engel ve belirsizlik yok; gelecek hafta planı somut ve tarihli.
7–8: belirgin ilerleme; küçük belirsizlikler; ciddi engel yok.
5–6: ilerleme genel ifadelerle anlatılmış ya da küçük engeller var; plan belirsiz.
3–4: belirgin engel, takvim ya da bütçe etkisi, müşteri sorunu ya da kaynak sıkıntısı.
1–2: ciddi kriz: kritik gecikme, iş durması, müşteri kaybı riski.

Yöntem: ÖNCE puanı destekleyen ya da düşüren cümleleri rapordan BİREBİR kopyala (en fazla 3), sonra yalnız bu kanıtlara dayanarak puan ver. Rapordaki bir cümleyi değiştirme, özetleme ya da yeni cümle kurma.
Metin değerlendirmeye yetmiyorsa (çok kısa ya da tamamen genel ifadeler) uydurma: "kanitlar" boş kalsın, puan 5 olsun ve gerekçede bunu söyle.

Yanıtı YALNIZCA şu JSON biçiminde ver (açıklama, markdown ya da kod bloğu ekleme):
{"kanitlar":["rapordan birebir alıntı"],"sinyaller":["engel"],"gerekce":"Bir-iki cümle.","puan":7}
"sinyaller" yalnızca şunlardan seçilir: ${ASSESSMENT_SIGNALS.join(', ')}.`;

/** Modelin göreceği metin: yalnız rapor maddeleri */
export const assessmentInput = (project: Pick<Project, 'name' | 'code'>, r: WeeklyReport): string => {
    const L: string[] = [`Proje: ${project.name}${project.code ? ` (${project.code})` : ''}`, `Hafta: ${weekLabel(r.year, r.week, true)}`, 'Bu hafta gelişmeler:'];
    if (r.thisWeek.length) r.thisWeek.forEach(i => L.push(`- [${CATEGORY_META[i.category].label}] ${itemDisplay(i)}`));
    else L.push('- (madde yok)');
    L.push('Gelecek hafta planlanan:');
    if (r.nextWeek.length) r.nextWeek.forEach(i => L.push(`- ${itemDisplay(i)}`));
    else L.push('- (plan yok)');
    return L.join('\n');
};

export const buildAssessmentPrompt = (input: string): string =>
    `${input}\n\nBu raporu yukarıdaki ölçeğe göre değerlendir ve yalnızca JSON döndür.`;

/** Değerlendirilen içeriğin özeti: rapor değişirse değerlendirme bayatlar */
export const reportContentHash = (r: Pick<WeeklyReport, 'thisWeek' | 'nextWeek'>): string =>
    hashText(JSON.stringify([r.thisWeek.map(itemDisplay), r.nextWeek.map(itemDisplay)]));

/** Proje raporu, içeriği var ve değerlendirmesi yok ya da bayat */
export const needsAssessment = (r: WeeklyReport): boolean =>
    r.kind === 'project' && r.thisWeek.length + r.nextWeek.length > 0 && (!r.aiAssessment || r.aiAssessment.inputHash !== reportContentHash(r));

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Model yanıtını doğrular: puan 1–10'a yuvarlanıp sıkıştırılır, rapor
 * metninde birebir geçmeyen alıntılar ve bilinmeyen sinyaller atılır.
 * Puan yoksa hata fırlatır.
 */
export const parseAssessment = (text: string, r: WeeklyReport, now: Date = new Date()): AiReportAssessment => {
    const j = extractJson(text) as Record<string, unknown> | null;
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('Model yanıtı beklenen biçimde değil.');
    const raw = Number(j.puan);
    if (!Number.isFinite(raw)) throw new Error('Model puan vermedi.');
    const corpus = squash(foldTr([...r.thisWeek, ...r.nextWeek].map(itemDisplay).join('\n')));
    const evidence = (Array.isArray(j.kanitlar) ? j.kanitlar : [])
        .map(q => squash(String(q ?? '')).replace(/^["“”'‘’]+|["“”'‘’]+$/g, ''))
        .filter(q => q.length >= 8 && corpus.includes(squash(foldTr(q))))
        .slice(0, 3);
    const signals = [...new Set((Array.isArray(j.sinyaller) ? j.sinyaller : []).map(x => String(x)))]
        .filter(x => (ASSESSMENT_SIGNALS as readonly string[]).includes(x));
    return {
        score: Math.max(1, Math.min(10, Math.round(raw))),
        rationale: squash(String(j.gerekce ?? '')).slice(0, 400),
        evidence,
        signals,
        at: now.toISOString(),
        inputHash: reportContentHash(r),
    };
};

// ---------------------------------------------------------------- güvenceler

const NEGATIVE_SIGNALS = ['engel', 'takvim_kaymasi', 'butce_etkisi', 'musteri_sorunu', 'kaynak_sorunu'];
const POSITIVE_SIGNALS = ['somut_teslimat', 'musteri_kabulu'];
const CONCRETE_CATEGORIES = new Set(['contract', 'sales', 'invoice', 'milestone', 'delivery', 'customer_feature', 'event', 'meeting']);
const MONTHS = 'ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik';
const DATE_RE = new RegExp(`\\b\\d{1,2}\\s+(${MONTHS})\\b|\\b\\d{1,2}[./]\\d{1,2}([./]\\d{2,4})?\\b`);
const FIGURE_RE = /\d[\d.,]*\s*(tl|₺|adet|lisans|gun|kisi|bin|milyon|%)|%\s*\d/;
const GENERIC_RE = /(devam edil|surduruldu|surdurulmekte|calismalara devam|calisilmaya devam|devam ediyor|devam etmektedir)/;
const NEGATIVE_RE = /(gecik|ertelen|sorun|engel|iptal|askiya|sikayet|yetismedi|kayma|asim|bekleniyor|beklemede)/;

/**
 * Kural tabanlı metin göstergesi (1–10): AI puanının çapraz kontrolü. Somut
 * madde payı (teslimat/kabul/sözleşme türü ya da tarih/tutar içeren), genel
 * ifade payı, olumsuz ifadeler ve gelecek hafta planının tarihli olması.
 * Model değildir; yalnız bariz uyumsuzlukları yakalamak içindir.
 */
export const ruleTextScore = (r: Pick<WeeklyReport, 'thisWeek' | 'nextWeek'>): number => {
    const text = (i: ReportItem) => foldTr(itemDisplay(i));
    const items = r.thisWeek;
    if (!items.length) return 3;
    const generic = items.filter(i => GENERIC_RE.test(text(i))).length;
    const concrete = items.filter(i => !GENERIC_RE.test(text(i)) && (CONCRETE_CATEGORIES.has(i.category) || DATE_RE.test(text(i)) || FIGURE_RE.test(text(i)))).length;
    const negative = items.filter(i => i.category === 'schedule_budget' || NEGATIVE_RE.test(text(i))).length;
    const plans = r.nextWeek;
    const planDated = plans.length ? plans.filter(i => DATE_RE.test(text(i))).length / plans.length : -0.5;
    const raw = 4 + 4 * (concrete / items.length) - 2 * (generic / items.length) + planDated - Math.min(3, 1.5 * negative);
    return Math.max(1, Math.min(10, Math.round(raw)));
};

const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Bağımsız değerlendirmeleri birleştirir ve güveni belirler: skor medyan,
 * dağılım = en yüksek − en düşük; kanıtlar birleşimi; sinyaller çoğunluğun
 * gördükleri; gerekçe medyana en yakın değerlendirmeden.
 */
export const finalizeAssessment = (runs: AiReportAssessment[], r: WeeklyReport, policy: AiScoringPolicy, now: Date = new Date()): AiReportAssessment => {
    if (!runs.length) throw new Error('Değerlendirme yok.');
    const scores = runs.map(x => x.score);
    const score = median(scores);
    const spread = Math.max(...scores) - Math.min(...scores);
    const evidence = [...new Set(runs.flatMap(x => x.evidence))].slice(0, 3);
    const count = new Map<string, number>();
    runs.forEach(x => x.signals.forEach(sg => count.set(sg, (count.get(sg) || 0) + 1)));
    const signals = [...count.entries()].filter(([, n]) => n * 2 >= runs.length).map(([sg]) => sg);
    const closest = [...runs].sort((a, b) => Math.abs(a.score - score) - Math.abs(b.score - score))[0];
    const ruleScore = ruleTextScore(r);

    const flags: AiAssessmentFlag[] = [];
    if (evidence.length < policy.minEvidence) flags.push('no_evidence');
    if (runs.length > 1 && spread > policy.maxSpread) flags.push('inconsistent');
    if (Math.abs(score - ruleScore) > policy.maxRuleGap) flags.push('rule_gap');
    const neg = signals.some(sg => NEGATIVE_SIGNALS.includes(sg));
    const pos = signals.some(sg => POSITIVE_SIGNALS.includes(sg));
    if ((neg && score >= 9) || (pos && !neg && score <= 2)) flags.push('signal_conflict');

    return {
        score,
        rationale: closest.rationale,
        evidence,
        signals,
        at: now.toISOString(),
        inputHash: reportContentHash(r),
        runs: scores,
        spread,
        ruleScore,
        flags,
        confidence: flags.length ? 'low' : 'high',
        promptVersion: ASSESSMENT_PROMPT_VERSION,
    };
};

export const FLAG_LABELS: Record<AiAssessmentFlag, string> = {
    no_evidence: 'Yeterli kanıt yok',
    inconsistent: 'Tekrarlar tutarsız',
    rule_gap: 'Kural göstergesiyle uyumsuz',
    signal_conflict: 'Sinyal–puan çelişkisi',
};

/** Değerlendirme sağlık skoruna girebilir mi (eski kayıtlarda güven alanı yoksa girer) */
export const assessmentUsable = (a: AiReportAssessment | undefined, policy: Pick<AiScoringPolicy, 'lowConfidence'>): boolean =>
    !!a && (a.confidence !== 'low' || policy.lowConfidence === 'flag');
