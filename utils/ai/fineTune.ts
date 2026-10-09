import { WorkspaceData } from '../../types';
import { estimateStats } from '../planning/estimateLog';
import { gateStatus, goldDraft } from '../planning/evaluation';
import { HistoryRecord, PlanningHistory } from '../planning/history';
import { MODEL_VERSION } from '../planning/ml/estimateModel';
import { estimateFromHistory } from '../planning/referenceClass';
import { chatExample, estimateTarget } from './estimateEval';
import { ESTIMATE_PROMPT_VERSION, estimateSuggestionPrompt } from './estimateSuggestion';

/**
 * İnce ayar (fine-tuning) kararı: AI tahmin önerisini kurumun kayıt
 * geçmişiyle ince ayarlamak gerekli mi? Karar ölçüye dayanır:
 *  - altın sette AI ile geçmiş kayıt tahmininin karşılaştırması,
 *  - makine öğrenmesi modelinin zaman ayrımlı sınaması,
 *  - eğitime uygun kayıt ve altın set büyüklüğü.
 * İstem + bağlam (RAG) ya da klasik model yetiyorsa ince ayarın maliyeti,
 * bakım yükü ve veri riski gereksizdir. Gerekirse veri kümesi buradan
 * (zaman ayrımlı, kişi adları maskelenmiş) dışa aktarılır.
 */

export const FT_MIN_RECORDS = 300;
export const FT_GOOD_RECORDS = 1000;
export const FT_MIN_GOLDEN = 20;
export const FT_GOOD_GOLDEN = 50;
const VALIDATION_SHARE = 0.15;

export type FineTuneVerdict = 'not_ready' | 'not_needed' | 'consider' | 'recommended';

export const VERDICT_LABELS: Record<FineTuneVerdict, string> = {
    not_ready: 'Karar için veri yetersiz',
    not_needed: 'İnce ayar gerekmiyor',
    consider: 'İnce ayar düşünülebilir',
    recommended: 'İnce ayar önerilir',
};

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';

export interface ReadinessCheck {
    label: string;
    status: CheckStatus;
    detail: string;
}

export interface FineTuneReadiness {
    verdict: FineTuneVerdict;
    headline: string;
    checks: ReadinessCheck[];
    next: string[];
    /** AI ve model hatasının geçmiş kayıt tahminine oranı (1 = aynı) */
    aiRatio: number | null;
    mlRatio: number | null;
}

const dec = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const pct = (v: number) => `%${Math.round(v * 100)}`;
const num = (v: number) => v.toLocaleString('tr-TR');
const ratio = (a: number | null | undefined, b: number | null | undefined) => (a !== null && a !== undefined && b ? a / b : null);

export const fineTuneReadiness = (
    ws: Pick<WorkspaceData, 'evalRuns' | 'modelEvals' | 'goldenSet' | 'estimateLog'>,
    history: PlanningHistory,
    ai?: { model?: string; provider?: string; configured?: boolean } | null,
): FineTuneReadiness => {
    const records = history.records.length;
    const golden = (ws.goldenSet || []).length;
    const gate = gateStatus(ws.evalRuns, ESTIMATE_PROMPT_VERSION, ai?.model);
    const run = gate.run?.ai ? gate.run : undefined;
    const aiRatio = run && gate.status !== 'stale' ? ratio(run.ai!.mae, run.reference.mae) : null;
    const ml = [...(ws.modelEvals || [])].reverse().find(r => r.version === MODEL_VERSION && r.better !== null);
    const mlRatio = ml ? ratio(ml.model.mae, ml.reference.mae) : null;
    const log = estimateStats(ws, history);

    const checks: ReadinessCheck[] = [
        {
            label: 'Eğitime uygun kapanmış kayıt',
            status: records >= FT_GOOD_RECORDS ? 'ok' : records >= FT_MIN_RECORDS ? 'warn' : 'fail',
            detail: `${num(records)} kayıt. İnce ayar için en az ${num(FT_MIN_RECORDS)}, iyi sonuç için ${num(FT_GOOD_RECORDS)} ve üzeri önerilir.`,
        },
        {
            label: 'Altın set',
            status: golden >= FT_GOOD_GOLDEN ? 'ok' : golden >= FT_MIN_GOLDEN ? 'warn' : 'fail',
            detail: `${num(golden)} kayıt. İnce ayarlı modelin kazancını ölçmek için en az ${FT_MIN_GOLDEN}, güvenilir karar için ${FT_GOOD_GOLDEN} ve üzeri.`,
        },
        {
            label: 'AI önerisi (altın sette)',
            status: !run ? 'fail' : gate.status === 'stale' ? 'warn' : run.passed ? 'ok' : 'warn',
            detail: !run ? 'Henüz değerlendirilmedi.'
                : gate.status === 'stale' ? 'Son değerlendirme farklı bir modelle yapıldı; yeniden değerlendirin.'
                : `AI efor hatası ${dec(run.ai!.mae!)} gün, geçmiş kayıt tahmini ${dec(run.reference.mae!)} gün (oran ×${dec(aiRatio ?? 0)}); önem doğruluğu ${pct(run.ai!.priorityAccuracy ?? 0)}; kapı ${run.passed ? 'geçildi' : run.passed === false ? 'geçilmedi' : 'karar yok'}.`,
        },
        {
            label: 'Makine öğrenmesi modeli',
            status: !ml ? 'info' : ml.better ? 'ok' : 'warn',
            detail: !ml ? 'Sınanmadı. Klasik model ince ayardan önce denenmesi gereken ucuz seçenektir.'
                : `Model hatası geçmiş kayıt tahmininin ×${dec(mlRatio ?? 0)} katı; ${ml.better ? 'daha isabetli' : 'daha isabetli değil'}.`,
        },
        {
            label: 'Gerçek kullanımda AI',
            status: log.ai.n >= 30 ? 'ok' : 'info',
            detail: log.ai.n ? `AI önerisi gösterilip kapanmış ${num(log.ai.n)} kayıt; ortalama hata ${dec(log.ai.mae ?? 0)} gün.` : 'Öneri günlüğünde henüz AI önerisi gösterilip kapanmış kayıt yok.',
        },
        {
            label: 'Kişisel veri',
            status: 'info',
            detail: 'Sorumlu alanı veri kümesine girmez; metinlerde geçen kişi adları dışa aktarımda maskelenir. Veri kurum dışına çıkacaksa KVKK değerlendirmesi gerekir.',
        },
        {
            label: 'Sağlayıcı',
            status: 'info',
            detail: ai?.configured ? `AI sunucusu yapılandırılmış${ai.provider ? ` (${ai.provider} uyumlu)` : ''}. İnce ayar desteği, maliyeti ve verinin nerede işlendiği sağlayıcıya bağlıdır; kurum içi açık ağırlıklı modelde LoRA ile yapılabilir.` : 'AI sunucusu yapılandırılmamış ya da ulaşılamıyor.',
        },
    ];

    let verdict: FineTuneVerdict;
    let headline: string;
    const next: string[] = [];
    if (!run || gate.status === 'stale' || gate.status === 'insufficient' || golden < FT_MIN_GOLDEN) {
        verdict = 'not_ready';
        headline = !run || gate.status === 'stale'
            ? 'AI önerisi geçerli modelle altın sette değerlendirilmedi; ince ayarın kazancı ölçülemez.'
            : gate.status === 'insufficient'
                ? 'Son AI değerlendirmesi karar verecek kadar yanıt toplamadı (AI çoğu kayıtta yanıt vermedi); ince ayarın kazancı ölçülemez.'
                : `Altın set küçük (${num(golden)} kayıt); karar güvenilir olmaz.`;
        if (golden < FT_MIN_GOLDEN) next.push(`Altın sete en az ${FT_MIN_GOLDEN} doğrulanmış kayıt ekleyin.`);
        next.push('"Altın set ve kalite kapısı" kartında "AI ile değerlendir"i çalıştırın.');
        if (!ml) next.push('"Makine öğrenmesi modeli" kartında "Eğit ve sına"yı çalıştırın.');
    } else if (run.passed && (aiRatio ?? 2) <= 1) {
        verdict = 'not_needed';
        headline = 'AI önerisi kalite kapısından geçiyor ve geçmiş kayıt tahmini kadar isabetli; istem ve bağlam (RAG) yeterli.';
        next.push('Üç ayda bir ya da model değişince altın sette yeniden değerlendirin.');
    } else if (ml?.better && mlRatio !== null && (aiRatio === null || mlRatio < aiRatio)) {
        verdict = 'not_needed';
        headline = `Efor ve süre için makine öğrenmesi modeli AI'dan isabetli (geçmişe göre model ×${dec(mlRatio)}, AI ×${dec(aiRatio ?? 0)}). Sayısal tahmini model yapsın; AI soru ve gerekçe için kalsın.`;
        next.push('"Planlamada model önerisi" ayarını otomatik ya da açık bırakın.');
        next.push('AI kalite kapısını zorunlu yapmayı düşünün; AI tahmin önerisi geçmeyince kapanır, model ve geçmiş kayıt önerisi çalışır.');
    } else if (aiRatio !== null && aiRatio <= 1) {
        // AI efor tahmininde geride değil; kapı başka bir ölçüt (önem, kapsama) yüzünden geçilemedi
        verdict = 'consider';
        headline = `AI efor tahmininde geçmiş kayıt tahmininden geride değil (×${dec(aiRatio)}); kapı başka bir ölçütte geçilemedi: ${run.reasons.filter(r => !/ortalama hatası/.test(r)).join(' ') || 'ayrıntı yok'} Önce istemi bu ölçüte göre iyileştirmek ince ayardan ucuzdur.`;
        next.push('İstemdeki önem ölçeği ve aralık kuralını (iyimser ≤ olası ≤ kötümser, geniş aralık) gözden geçirip yeni istem sürümüyle yeniden değerlendirin.');
        next.push('Sorun sürerse ince ayar veri kümesiyle deneme yapılabilir.');
    } else if (records < FT_MIN_RECORDS) {
        verdict = 'not_ready';
        headline = `AI geçmiş kayıt tahmininin gerisinde, ama ince ayar için veri az (${num(records)} kayıt).`;
        next.push("Jira'dan daha uzun bir dönemin kayıt geçmişini aktarın.");
        next.push('Bu arada makine öğrenmesi modelini ve geçmiş kayıt önerisini kullanın.');
    } else if (records >= FT_GOOD_RECORDS && golden >= FT_GOOD_GOLDEN) {
        verdict = 'recommended';
        headline = 'AI geçmiş kayıt tahmininin gerisinde kalıyor ve ince ayar için yeterli veri var.';
        next.push('Aşağıdan veri kümesini hazırlayıp indirin (eğitim, doğrulama, veri kartı).');
        next.push('Kurum sağlayıcısında ya da kurum içi sunucuda deneme ince ayarı yapın; veri kurum dışına çıkacaksa KVKK onayı alın.');
        next.push('İnce ayarlı modeli sunucuda ayrı model adıyla tanımlayın ve altın sette yeniden değerlendirin; kapıdan geçerse kullanıma alın.');
    } else {
        verdict = 'consider';
        headline = 'AI geçmiş kayıt tahmininin gerisinde; veri sınırda. Önce istem ve bağlamı iyileştirmek daha ucuz olabilir.';
        next.push('Kayıtlara açıklama, tür ve birim girilmesini yaygınlaştırın; bağlam kalitesi artar.');
        next.push(`Altın seti ${FT_GOOD_GOLDEN} kayda, geçmişi ${num(FT_GOOD_RECORDS)} kayda çıkarınca yeniden bakın.`);
        next.push('Denemek isterseniz veri kümesini aşağıdan hazırlayabilirsiniz.');
    }
    return { verdict, headline, checks, next, aiRatio, mlRatio };
};

// ---------------------------------------------------------------- veri kümesi

// Türkçe harf ve ASCII karşılığı aynı sayılır ("Ayşe" = "Ayse" = "AYŞE", "Ali" = "ALI")
const FOLD_CLASSES = ['cçCÇ', 'gğGĞ', 'iıİI', 'oöOÖ', 'sşSŞ', 'uüUÜ'];
const escOutside = (x: string) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const escInside = (x: string) => x.replace(/[\]\\^-]/g, '\\$&');

/** Ad için düzenli ifade deseni: büyük-küçük harf ve Türkçe/ASCII yazım farkına duyarsız */
const trPattern = (name: string): string => [...name.trim()].map(c => {
    if (/\s/.test(c)) return '\\s+';
    const cls = FOLD_CLASSES.find(k => k.includes(c));
    if (cls) return `[${escInside(cls)}]`;
    const lo = c.toLocaleLowerCase('tr-TR'), up = c.toLocaleUpperCase('tr-TR');
    return lo === up ? escOutside(c) : `[${escInside(lo)}${escInside(up)}]`;
}).join('').replace(/(\\s\+)+/g, '\\s+');

/** Metindeki kişi adlarını maskeler (tam ad; büyük-küçük harf ve Türkçe/ASCII yazımdan bağımsız) */
export const redactNames = (text: string, names: string[]): { text: string; hits: number } => {
    let hits = 0;
    let out = text;
    names.forEach(n => {
        out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${trPattern(n)}(?![\\p{L}\\p{N}])`, 'gu'), () => { hits++; return '[kişi]'; });
    });
    return { text: out, hits };
};

/** Maskelenecek adlar: çalışma alanındaki kişiler ve proje kaynakları (ad + soyad) */
export const personNames = (ws: Pick<WorkspaceData, 'people' | 'projects'>): string[] => {
    const all = [
        ...(ws.people || []).map(p => `${p.firstName} ${p.lastName}`),
        ...(ws.projects || []).flatMap(p => p.resources.map(r => r.name)),
    ].map(s => s.trim().replace(/\s+/g, ' ')).filter(s => /\s/.test(s) && s.length >= 5);
    // Aynı ad bir kez; uzun adlar önce (iç içe adlar doğru maskelensin)
    const seen = new Map<string, string>();
    all.forEach(s => { const k = s.toLocaleLowerCase('tr-TR'); if (!seen.has(k)) seen.set(k, s); });
    return [...seen.values()].sort((a, b) => b.length - a.length);
};

export interface FineTuneDataset {
    train: string;
    validation: string;
    card: Record<string, unknown>;
    stats: { train: number; validation: number; excludedGolden: number; noContext: number; redactions: number };
}

const yieldNow = () => new Promise<void>(r => setTimeout(r, 0));

/**
 * İnce ayar veri kümesi (sohbet biçimi JSONL). Her kayıt, açıldığı anda
 * bilinen (o ana kadar kapanmış) benzer kayıtlarla, planlamadaki istemin
 * aynısıyla sorulur; önem ve tür taslağa girmez. Hedef yanıt gerçekleşen
 * değerlerdir; güven, bağlamın gücünden gelir. Altın setteki kayıtlar
 * dışarıda tutulur (ince ayarlı model onlarla değerlendirilir). Kapanışı
 * en yeni kayıtlar doğrulama kümesidir.
 */
export const buildFineTuneDataset = async (
    ws: Pick<WorkspaceData, 'goldenSet' | 'people' | 'projects'>,
    history: PlanningHistory,
    opts: { now?: Date; signal?: AbortSignal; onProgress?: (done: number, total: number) => void; chunk?: number } = {},
): Promise<FineTuneDataset> => {
    const golden = new Set((ws.goldenSet || []).map(g => g.taskId));
    const names = personNames(ws);
    const recs = [...history.records].sort((a, b) => (a.resolvedAt < b.resolvedAt ? -1 : 1));
    const pool = recs.filter(r => !golden.has(r.id));
    const examples: { r: HistoryRecord; line: string }[] = [];
    let noContext = 0, redactions = 0;
    const chunk = opts.chunk ?? 25;
    for (let i = 0; i < pool.length; i++) {
        if (opts.signal?.aborted) throw new DOMException('Durduruldu', 'AbortError');
        const r = pool[i];
        const draft = goldDraft(r);
        // Zaman ayrımı: yalnız bu kayıt açılmadan önce kapanmış kayıtlar bağlamdır
        const ref = estimateFromHistory(draft, history, { filter: x => x.id !== r.id && x.resolvedAt < r.openedAt });
        if (ref.method === 'none') { noContext++; continue; }
        const p = redactNames(estimateSuggestionPrompt(draft, ref), names);
        const t = redactNames(JSON.stringify(estimateTarget(r, ref, { priority: r.priority, issueType: r.issueType }, ref.confidence)), names);
        redactions += p.hits + t.hits;
        examples.push({ r, line: chatExample(p.text, JSON.parse(t.text)) });
        if (i % chunk === chunk - 1) { opts.onProgress?.(i + 1, pool.length); await yieldNow(); }
    }
    opts.onProgress?.(pool.length, pool.length);
    const nVal = examples.length >= 10 ? Math.max(1, Math.round(examples.length * VALIDATION_SHARE)) : 0;
    const train = examples.slice(0, examples.length - nVal);
    const val = examples.slice(examples.length - nVal);
    const count = (xs: typeof examples, key: (r: HistoryRecord) => string) => xs.reduce<Record<string, number>>((m, x) => { const k = key(x.r) || 'belirtilmemiş'; m[k] = (m[k] || 0) + 1; return m; }, {});
    const card = {
        olusturuldu: (opts.now || new Date()).toISOString(),
        amac: 'Planlama asistanı kayıt tahmini önerisi (tür, önem, efor aralığı) için ince ayar',
        istem_surumu: ESTIMATE_PROMPT_VERSION,
        bicim: 'sohbet (system · user · assistant), JSONL',
        kayit: { egitim: train.length, dogrulama: val.length, altin_set_haric: recs.length - pool.length, baglamsiz_atlanan: noContext },
        donem: {
            egitim: train.length ? [train[0].r.resolvedAt.slice(0, 10), train[train.length - 1].r.resolvedAt.slice(0, 10)] : null,
            dogrulama: val.length ? [val[0].r.resolvedAt.slice(0, 10), val[val.length - 1].r.resolvedAt.slice(0, 10)] : null,
        },
        dagilim: { tur: count(examples, r => r.issueType || ''), onem: count(examples, r => r.priority) },
        hedef: 'Gerçekleşen efor (olası), −%30 / +%60 aralık; gerçek önem ve tür; dayanak: en benzer üç bağlam kaydı; güven: bağlamın gücü',
        zaman_ayrimi: 'Her örneğin bağlamı yalnız o kayıt açılmadan önce kapanmış kayıtlardır; doğrulama kümesi en son kapananlardır',
        gizlilik: { sorumlu_alani: 'yok', maskelenen_kisi_adi: redactions, not: 'Metinlerde geçen kişi adları [kişi] ile maskelendi. Kayıt adları ve açıklamalar kurum içi bilgidir; kurum dışına çıkarılacaksa KVKK değerlendirmesi gerekir.' },
        degerlendirme: 'İnce ayarlı model, altın sette (bu kümeye girmeyen kayıtlar) aynı kalite kapısıyla değerlendirilmelidir',
    };
    return {
        train: train.map(x => x.line).join('\n'),
        validation: val.map(x => x.line).join('\n'),
        card,
        stats: { train: train.length, validation: val.length, excludedGolden: recs.length - pool.length, noContext, redactions },
    };
};
