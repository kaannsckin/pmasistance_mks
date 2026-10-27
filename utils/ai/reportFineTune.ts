import { Abbreviation, WeeklyReport, WorkspaceData } from '../../types';
import { hashText } from '../rag/text';
import { lintCounts, lintReport, reportSettingsOf } from '../weeklyReport';
import { CheckStatus, FineTuneVerdict, personNames, ReadinessCheck, redactNames } from './fineTune';
import { buildMasker, collectMaskEntries } from './masking';
import { reportConfigVersion, REPORT_PROMPT_VERSION } from './reportGuide';
import { reportGateStatus } from './reportEval';
import { buildVariantRequest, PRODUCTION_VARIANT } from './reportVariants';
import { reportAnswer } from './weeklyReportPrompt';

/**
 * Haftalık rapor taslağı için ince ayar (fine-tuning) veri kümesi ve karar
 * kartı. Karar ölçüye dayanır: üretim istemi (kılavuz + kart + örnekler +
 * kurallar) altın sette kalite kapısından geçiyorsa ince ayar gerekmez;
 * geride kalıyor ve veri yeterliyse önerilir.
 *
 * Veri kümesi (sohbet biçimi JSONL):
 *  - örnek: onaylı, AI girdisi kayıtlı, son hâlinde format hatası olmayan
 *    proje raporları; altın setteki raporlar dışarıda (ince ayarlı model
 *    onlarla değerlendirilir); aynı girdi bir kez,
 *  - istem eşitliği: system = raporun bölümü/projesi için bugünkü kılavuz ve
 *    kurallar; user = "ft" varyantının (örneksiz) kullanımdaki istemi. İnce
 *    ayarlı model aynı varyantla çağrılmalıdır,
 *  - hedef yanıt: onaylı son hâl, JSON sözleşmesiyle,
 *  - gizlilik: kişi adları [kişi]; isteğe bağlı (varsayılan açık) proje ve
 *    kurum adları tutarlı takma adla,
 *  - zaman ayrımı: en son haftaların %15'i doğrulama kümesidir.
 */

export const REPORT_FT_MIN = 300;
export const REPORT_FT_GOOD = 1000;
export const REPORT_FT_MIN_GOLDEN = 20;
export const REPORT_FT_GOOD_GOLDEN = 50;
const VALIDATION_SHARE = 0.15;

type FtWs = Pick<WorkspaceData, 'projects' | 'people'> & Partial<Pick<WorkspaceData, 'weeklyReports' | 'reportGoldenSet' | 'reportSettings' | 'reportEvalRuns' | 'customerMeetings' | 'departments'>>;

export interface ReportFtSelection {
    examples: WeeklyReport[];
    excludedGolden: number;
    lintFailed: number;
    noInput: number;
    duplicates: number;
}

/** Eğitime uygun raporlar (zamana göre sıralı, eskiden yeniye) */
export const reportFineTuneSelection = (ws: FtWs, dictionary: Abbreviation[] = []): ReportFtSelection => {
    const golden = new Set((ws.reportGoldenSet || []).map(g => g.reportId));
    let excludedGolden = 0, lintFailed = 0, noInput = 0, duplicates = 0;
    const approved = (ws.weeklyReports || []).filter(r => r.kind === 'project' && r.stage === 'approved')
        .sort((a, b) => a.year - b.year || a.week - b.week || a.updatedAt.localeCompare(b.updatedAt));
    const byInput = new Map<string, WeeklyReport>();
    approved.forEach(r => {
        if (golden.has(r.id)) { excludedGolden++; return; }
        if (!r.aiDraft?.input) { noInput++; return; }
        if (lintCounts(lintReport(r, dictionary)).errors > 0) { lintFailed++; return; }
        const k = hashText(r.aiDraft.input);
        if (byInput.has(k)) duplicates++;
        byInput.set(k, r); // aynı girdi: en son onaylanan kalır
    });
    const examples = [...byInput.values()].sort((a, b) => a.year - b.year || a.week - b.week);
    return { examples, excludedGolden, lintFailed, noInput, duplicates };
};

export interface ReportFineTuneDataset {
    train: string;
    validation: string;
    card: Record<string, unknown>;
    stats: { train: number; validation: number; excludedGolden: number; lintFailed: number; noInput: number; duplicates: number; personRedactions: number; entityMasks: number };
}

const ENTITY_RE = /(?:Proje|Kurum)-\d{4}/g;
const countEntities = (s: string) => (s.match(ENTITY_RE) || []).length;

export const buildReportFineTuneDataset = (ws: FtWs, opts: { now?: Date; maskEntities?: boolean; dictionary?: Abbreviation[] } = {}): ReportFineTuneDataset => {
    const sel = reportFineTuneSelection(ws, opts.dictionary);
    const names = personNames(ws);
    const masker = opts.maskEntities === false ? null : buildMasker(collectMaskEntries(ws));
    let personRedactions = 0, entityMasks = 0;
    const clean = (text: string) => {
        const red = redactNames(text, names);
        personRedactions += red.hits;
        if (!masker) return red.text;
        const before = countEntities(red.text);
        const masked = masker.mask(red.text);
        entityMasks += Math.max(0, countEntities(masked) - before);
        return masked;
    };
    const lines = sel.examples.map(r => {
        const req = buildVariantRequest({ variant: 'ft', ws, report: r, input: r.aiDraft!.input });
        return JSON.stringify({
            messages: [
                { role: 'system', content: clean(req.system) },
                { role: 'user', content: clean(req.prompt) },
                { role: 'assistant', content: clean(JSON.stringify({ ...reportAnswer(r), eksikBilgi: [] })) },
            ],
        });
    });
    const nVal = lines.length >= 10 ? Math.max(1, Math.round(lines.length * VALIDATION_SHARE)) : 0;
    const trainR = sel.examples.slice(0, lines.length - nVal), valR = sel.examples.slice(lines.length - nVal);
    const period = (xs: WeeklyReport[]) => (xs.length ? [`${xs[0].year}-H${xs[0].week}`, `${xs[xs.length - 1].year}-H${xs[xs.length - 1].week}`] : null);
    const count = (key: (r: WeeklyReport) => string[]) => sel.examples.reduce<Record<string, number>>((m, r) => { key(r).forEach(k => { m[k] = (m[k] || 0) + 1; }); return m; }, {});
    const deptName = new Map((ws.departments || []).map(d => [d.code, d.name]));
    const card = {
        olusturuldu: (opts.now || new Date()).toISOString(),
        amac: 'Haftalık proje raporu taslağı (kurum rapor kılavuzuna uygun JSON) için ince ayar',
        istem_surumu: REPORT_PROMPT_VERSION,
        yapilandirma_surumu: reportConfigVersion(reportSettingsOf(ws)),
        kayitlarin_istem_surumleri: count(r => [r.aiDraft?.promptVersion || 'bilinmiyor']),
        bicim: 'sohbet (system · user · assistant), JSONL',
        kullanim: 'İnce ayarlı model "ft" varyantıyla çağrılmalıdır: sistem isteminde bugünkü kılavuz ve kurallar, kullanıcı isteminde örnek yok (bu kümedeki istemle aynı).',
        kayit: { egitim: trainR.length, dogrulama: valR.length, altin_set_haric: sel.excludedGolden, format_hatali_atlanan: sel.lintFailed, girdisiz_atlanan: sel.noInput, tekrar_girdi: sel.duplicates },
        donem: { egitim: period(trainR), dogrulama: period(valR) },
        dagilim: { kategori: count(r => r.thisWeek.map(i => i.category)), bolum: count(r => [deptName.get(r.departmentCode) || r.departmentCode || 'belirtilmemiş']) },
        hedef: 'PYB destekçe onaylanmış son hâl (bu hafta, gelecek hafta, kısaltmalar)',
        zaman_ayrimi: 'Doğrulama kümesi en son haftalardır (%15); sistem istemi kılavuzun bugünkü sürümüdür',
        gizlilik: {
            maskelenen_kisi_adi: personRedactions,
            maskelenen_proje_kurum: entityMasks,
            proje_kurum_maskesi: masker ? 'açık (tutarlı takma ad: Proje-0000, Kurum-0000)' : 'kapalı',
            not: 'Kişi adları [kişi] ile maskelendi. Girdiler proje notlarını içerir; kurum dışına çıkarılacaksa KVKK değerlendirmesi gerekir.',
        },
        degerlendirme: 'İnce ayarlı model, altın sette (bu kümeye girmeyen raporlar) "ft" varyantıyla ve aynı kalite kapısıyla değerlendirilmelidir',
    };
    return {
        train: lines.slice(0, lines.length - nVal).join('\n'),
        validation: lines.slice(lines.length - nVal).join('\n'),
        card,
        stats: { train: trainR.length, validation: valR.length, excludedGolden: sel.excludedGolden, lintFailed: sel.lintFailed, noInput: sel.noInput, duplicates: sel.duplicates, personRedactions, entityMasks },
    };
};

// ---------------------------------------------------------------- karar kartı

export interface ReportFineTuneReadiness {
    verdict: FineTuneVerdict;
    headline: string;
    checks: ReadinessCheck[];
    next: string[];
}

const num = (v: number) => v.toLocaleString('tr-TR');

/** fineTuneReadiness'in rapora uyarlanması: üretim istemi kapıdan geçiyorsa gerek yok; geride ve veri yeterliyse önerilir */
export const reportFineTuneReadiness = (ws: FtWs, model?: string, dictionary: Abbreviation[] = []): ReportFineTuneReadiness => {
    const n = reportFineTuneSelection(ws, dictionary).examples.length;
    const golden = (ws.reportGoldenSet || []).length;
    const gate = reportGateStatus(ws.reportEvalRuns, reportConfigVersion(ws.reportSettings), model);
    const run = gate.run;
    const status = (ok: boolean, warn: boolean): CheckStatus => (ok ? 'ok' : warn ? 'warn' : 'fail');
    const checks: ReadinessCheck[] = [
        { label: 'Eğitime uygun rapor', status: status(n >= REPORT_FT_GOOD, n >= REPORT_FT_MIN), detail: `${num(n)} rapor (onaylı, AI girdisi kayıtlı, format hatasız, altın set dışı). İnce ayar için en az ${num(REPORT_FT_MIN)}, iyi sonuç için ${num(REPORT_FT_GOOD)} ve üzeri.` },
        { label: 'Altın set', status: status(golden >= REPORT_FT_GOOD_GOLDEN, golden >= REPORT_FT_MIN_GOLDEN), detail: `${num(golden)} rapor. Kazancı ölçmek için en az ${REPORT_FT_MIN_GOLDEN}, güvenilir karar için ${REPORT_FT_GOOD_GOLDEN} ve üzeri.` },
        {
            label: 'Üretim istemi (altın sette)',
            status: gate.status === 'passed' ? 'ok' : gate.status === 'failed' ? 'warn' : 'fail',
            detail: !run ? 'Henüz değerlendirilmedi.' : gate.status === 'stale' ? 'Son değerlendirme farklı bir kılavuz, kural, istem ya da modelle yapıldı; yeniden değerlendirin.' : run.reasons.join(' '),
        },
        { label: 'Kişisel veri', status: 'info', detail: 'Kişi adları dışa aktarımda maskelenir; proje ve kurum adları isteğe bağlı takma adla. Veri kurum dışına çıkacaksa KVKK değerlendirmesi gerekir.' },
        { label: 'Önce denenecekler', status: 'info', detail: 'Proje kartı, kılavuz, örnek seçimi ve öğrenilmiş kurallar ince ayardan ucuzdur; katmanların kazancını değerlendirme kartında varyantlarla karşılaştırın.' },
    ];
    const next: string[] = [];
    let verdict: FineTuneVerdict;
    let headline: string;
    if (!run || gate.status === 'stale' || gate.status === 'insufficient' || gate.status === 'none' || golden < REPORT_FT_MIN_GOLDEN) {
        verdict = 'not_ready';
        headline = !run || gate.status === 'none' || gate.status === 'stale'
            ? 'Üretim istemi geçerli yapılandırmayla altın sette değerlendirilmedi; ince ayarın kazancı ölçülemez.'
            : gate.status === 'insufficient' ? 'Son değerlendirme karar verecek kadar yanıt toplamadı.' : `Altın set küçük (${num(golden)} rapor); karar güvenilir olmaz.`;
        if (golden < REPORT_FT_MIN_GOLDEN) next.push(`Altın sete en az ${REPORT_FT_MIN_GOLDEN} onaylı rapor ekleyin (farklı bölümlerden).`);
        next.push('"Rapor AI değerlendirmesi" kartında "Tam (üretim)" varyantını koşun.');
    } else if (gate.status === 'passed') {
        verdict = 'not_needed';
        headline = 'Üretim istemi kalite kapısından geçiyor; kılavuz, kart, örnekler ve kurallar yeterli.';
        next.push('Kılavuz, kural ya da model değişince ve üç ayda bir altın sette yeniden değerlendirin.');
    } else if (n < REPORT_FT_MIN) {
        verdict = 'not_ready';
        headline = `Üretim istemi kapıdan geçmiyor, ama ince ayar için veri az (${num(n)} rapor).`;
        next.push('Önce kapının hangi ölçütte kaldığına bakın: format hatası için kılavuz ve kurallar, dayanaksız bilgi için girdi ve proje kartı, kapsama için örnekler.');
        next.push('AI taslağı kullanımı arttıkça veri birikir; yeniden bakın.');
    } else if (n >= REPORT_FT_GOOD && golden >= REPORT_FT_GOOD_GOLDEN) {
        verdict = 'recommended';
        headline = 'Üretim istemi kalite kapısından geçmiyor ve ince ayar için yeterli veri var.';
        next.push('Aşağıdan veri kümesini hazırlayıp indirin (eğitim, doğrulama, veri kartı).');
        next.push('Kurum içi açık ağırlıklı modelde LoRA ile deneme ince ayarı yapın; veri kurum dışına çıkacaksa KVKK onayı alın.');
        next.push('İnce ayarlı modeli sunucuda ayrı model adıyla tanımlayın, "İnce ayar" varyantıyla altın sette değerlendirin; kapıdan geçerse kullanıma alın.');
    } else {
        verdict = 'consider';
        headline = 'Üretim istemi kapıdan geçmiyor; veri sınırda. Önce istem katmanlarını iyileştirmek daha ucuz olabilir.';
        next.push('Katmanları (kart, örnekler, kurallar) varyant karşılaştırmasıyla iyileştirin.');
        next.push(`Altın seti ${REPORT_FT_GOOD_GOLDEN}, eğitim verisini ${num(REPORT_FT_GOOD)} rapora çıkarınca yeniden bakın.`);
    }
    if (verdict !== 'not_needed' && run && run.variant === PRODUCTION_VARIANT && gate.status === 'failed') next.push(`Kapı gerekçesi: ${run.reasons.join(' ')}`);
    return { verdict, headline, checks, next };
};
