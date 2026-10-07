import { AiReportAssessment, Project, WeeklyReport } from '../../types';
import { foldTr, hashText } from '../rag/text';
import { CATEGORY_META, itemDisplay, weekLabel } from '../weeklyReport';
import { extractJson } from './json';

/**
 * Haftalık rapor metninin AI değerlendirmesi — sağlık modelinin "AI metin
 * puanı" girdisi. Model yalnız rapor metnini görür: PY puanı, plan
 * değerlendirmesi ve sayısal göstergeler (SPI, görev sayıları) ayrı girdiler
 * olduğu için verilmez; aynı bilgi iki kez sayılmasın. Kanıt olarak verilen
 * alıntılar rapor metninde birebir geçmiyorsa atılır.
 */

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

Yanıtı YALNIZCA şu JSON biçiminde ver (açıklama, markdown ya da kod bloğu ekleme):
{"puan":7,"gerekce":"Bir-iki cümle.","kanitlar":["rapordan birebir alıntı"],"sinyaller":["engel"]}
"kanitlar": rapordan BİREBİR alıntılar, en fazla 3. "sinyaller" yalnızca şunlardan seçilir: ${ASSESSMENT_SIGNALS.join(', ')}.`;

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
