import { AiEstimateFlag, Confidence, EffortRange, IssueType, Task } from '../../types';
import { ISSUE_TYPE_LABELS } from '../planning/lifecycle';
import { RecordDraft, ReferenceEstimate } from '../planning/referenceClass';
import { foldTr } from '../rag/text';
import { extractJson } from './json';

/**
 * Yeni kayıt için AI önerisi: tür, önem, efor aralığı, gerekçe ve eksik bilgi
 * soruları. Halüsinasyona karşı:
 *  - Bağlam: en benzer kapanmış kayıtlar GERÇEK süre ve eforlarıyla (R1…Rn)
 *    ve bu kayıtların istatistiği; model yalnız bunlara dayanır.
 *  - Kanıt doğrulaması: dayanak gösterilen R numaraları bağlamda yoksa
 *    "bilinmeyen kanıt" sayılır.
 *  - Hibrit güven: model eforu geçmiş dağılımın çok dışındaysa ya da önem
 *    güçlü çoğunluktan ayrılıyorsa güven düşer; öneri tek sayı değil aralıktır.
 *  - Model çıktısı kayda doğrudan yazılmaz; kullanıcı seçer, karar günlüğe
 *    düşer.
 * Kişi adları bağlama girmez; başka projelerin kayıtları AI'ya gönderilmez.
 */

export const ESTIMATE_PROMPT_VERSION = 'kayit-tahmin-1';

export const AI_FLAG_LABELS: Record<AiEstimateFlag, string> = {
    no_history: 'Geçmiş kayıt yok; öneri genel bilgiye dayanıyor',
    no_evidence: 'Dayanak kayıt göstermedi',
    unknown_evidence: 'Bağlamda olmayan kayda dayandı',
    outside_history: 'Efor, benzer kayıtların gerçek aralığının çok dışında',
    priority_conflict: 'Önem, benzer kayıtların büyük çoğunluğundan farklı',
};

export interface AiEstimate {
    issueType?: IssueType;
    priority?: Task['priority'];
    effort: EffortRange;
    /** Dayanak gösterilen geçmiş kayıt kimlikleri (doğrulanmış) */
    evidence: string[];
    priorityRationale: string;
    effortRationale: string;
    questions: string[];
    confidence: Confidence;
    flags: AiEstimateFlag[];
}

export interface ParsedAiEstimate {
    issueType?: IssueType;
    priority?: Task['priority'];
    effort: EffortRange;
    evidenceIds: string[]; // R numaraları (doğrulanmamış)
    priorityRationale: string;
    effortRationale: string;
    questions: string[];
    selfConfidence: Confidence;
}

const PRIORITY_TR: Record<Task['priority'], string> = { Blocker: 'Engelleyici', High: 'Yüksek', Medium: 'Orta', Low: 'Düşük' };
const PRIORITY_ALIASES: [RegExp, Task['priority']][] = [[/^(blocker|engelleyici|kritik)/, 'Blocker'], [/^(high|yuksek)/, 'High'], [/^(medium|orta|normal)/, 'Medium'], [/^(low|dusuk)/, 'Low']];
const TYPE_ALIASES: [RegExp, IssueType][] = [[/^(bug|hata|defect)/, 'bug'], [/^(feature|yeni|ozellik)/, 'feature'], [/^(improvement|iyilestirme|gelistirme)/, 'improvement'], [/^(task|gorev)/, 'task'], [/^(other|diger)/, 'other']];
const CONF_ALIASES: [RegExp, Confidence][] = [[/^(yuksek|high)/, 'high'], [/^(orta|medium)/, 'medium'], [/^(dusuk|low)/, 'low']];

const clip = (s: unknown, n: number): string => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const num1 = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const half = (v: number) => Math.max(0.5, Math.round(v * 2) / 2);
const pct = (v: number) => `%${Math.round(v * 100)}`;
const pickAlias = <T,>(raw: unknown, table: [RegExp, T][]): T | undefined => {
    const f = foldTr(String(raw ?? '')).trim();
    return f ? table.find(([re]) => re.test(f))?.[1] : undefined;
};
/** Sayı; boş ya da eksik alan NaN (0 sayılıp aralığı kaydırmasın) */
const toNum = (v: unknown): number => (v === undefined || v === null || String(v).trim() === '' ? NaN : Number(String(v).replace(',', '.')));

/** Dayanak kimlikleri: "R1", "R1, R3", "R1 ve R2", 3 → R3 */
const evidenceIdsOf = (raw: unknown): string[] => {
    const items = Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw];
    const out: string[] = [];
    items.forEach(x => {
        const t = String(x ?? '');
        const tagged = [...t.matchAll(/R\s*(\d{1,3})/gi)].map(m => `R${Number(m[1])}`);
        const ids = tagged.length ? tagged : /^\s*\d{1,3}\s*$/.test(t) ? [`R${Number(t)}`] : [];
        ids.forEach(id => { if (!out.includes(id)) out.push(id); });
    });
    return out;
};

/** Bağlamdaki kayıt etiketi → geçmiş kayıt kimliği */
export const contextIds = (ref: ReferenceEstimate): Map<string, string> => new Map(ref.context.map((m, i) => [`R${i + 1}`, m.record.id]));

export const estimateSuggestionPrompt = (draft: RecordDraft, ref: ReferenceEstimate, release?: { name: string; summary?: string }): string => {
    const L: string[] = [];
    if (release?.name.trim()) L.push(`Bu kayıt "${clip(release.name, 80)}" sürümünün parçasıdır.${release.summary?.trim() ? ` Sürüm özeti: ${clip(release.summary, 500)}` : ''}`, '');
    L.push('Yeni kayıt:');
    L.push(`- Başlık: ${clip(draft.name, 200)}`);
    if (draft.notes?.trim()) L.push(`- Açıklama: ${clip(draft.notes, 800)}`);
    if (draft.issueType) L.push(`- Kullanıcının seçtiği tür: ${ISSUE_TYPE_LABELS[draft.issueType]}`);
    if (draft.unit?.trim()) L.push(`- Birim: ${clip(draft.unit, 60)}`);
    L.push('');
    if (ref.method === 'none' || !ref.context.length) {
        L.push('Geçmiş kapanmış kayıt yok. Genel deneyime göre öner; dayanak alanını boş bırak ve güveni "düşük" ver.');
    } else {
        L.push(`Benzer kapanmış kayıtlar (gerçekleşen değerler; efor kişi-gün, kapanma iş günü):`);
        ref.context.forEach((m, i) => {
            const r = m.record;
            L.push(`[R${i + 1}] ${clip(r.name, 120)} | tür ${r.issueType ? ISSUE_TYPE_LABELS[r.issueType] : 'belirtilmemiş'} | birim ${r.unit || '—'} | önem ${PRIORITY_TR[r.priority]} | gerçek efor ${num1(r.effortDays)} gün | kapanma ${num1(r.days)} iş günü${r.estimateDays ? ` | ilk tahmin ${num1(r.estimateDays)} gün` : ''}`);
        });
        L.push('');
        L.push(`İstatistik (${ref.methodLabel.toLocaleLowerCase('tr-TR')}, ${ref.n} kayıt): gerçek efor P10 ${num1(ref.effort!.best)}, P50 ${num1(ref.effort!.likely)}, P90 ${num1(ref.effort!.worst)} gün; kapanma P50 ${num1(ref.duration!.p50)}, P80 ${num1(ref.duration!.p80)} iş günü.`);
        if (ref.priorityMix.length) L.push(`Önem dağılımı: ${ref.priorityMix.map(p => `${PRIORITY_TR[p.value]} ${pct(p.share)}`).join(', ')}.`);
        if (ref.typeMix.length) L.push(`Tür dağılımı: ${ref.typeMix.map(t => `${ISSUE_TYPE_LABELS[t.value]} ${pct(t.share)}`).join(', ')}.`);
    }
    L.push('');
    L.push('Görev: Bu yeni kayıt için tür, önem ve efor öner.');
    L.push('Kurallar:');
    L.push('1. Yalnız yukarıdaki kayıtlara ve yeni kaydın metnine dayan. "dayanak" alanına yalnız gerçekten benzeyen kayıtların R numaralarını yaz; listede olmayan numara yazma.');
    L.push('2. Efor kişi-gün cinsinden bir aralıktır: iyimser ≤ olası ≤ kötümser. Benzer kayıtların GERÇEK eforlarını esas al; istatistikten belirgin ayrılıyorsan nedenini efor_gerekce alanında yaz.');
    L.push('3. Önem ölçeği: Blocker = başka işleri ya da kullanımı durduruyor; High = önemli işlev bozuk ya da yakın teslim tehlikede; Medium = olağan iş; Low = ertelenebilir.');
    L.push('4. Tür: bug (hata), feature (yeni özellik), improvement (iyileştirme), task (görev), other (diğer).');
    L.push('5. Açıklama tahmin için yetersizse eksik_bilgi alanına en çok 3 kısa soru yaz; yeterliyse boş liste ver.');
    L.push('6. guven: yuksek, orta ya da dusuk.');
    L.push('Yanıtı YALNIZCA geçerli JSON olarak ver; açıklama, markdown ya da kod bloğu ekleme. Biçim:');
    L.push('{"tur": "bug", "onem": "High", "efor": {"iyimser": 1, "olasi": 2, "kotumser": 4}, "dayanak": ["R1"], "onem_gerekce": "...", "efor_gerekce": "...", "eksik_bilgi": [], "guven": "orta"}');
    return L.join('\n');
};

export const parseEstimateSuggestion = (text: string): ParsedAiEstimate => {
    const v = (extractJson(text) || {}) as Record<string, unknown>;
    const e = (v.efor || v.effort || {}) as Record<string, unknown>;
    const likelyRaw = toNum(e.olasi ?? e.olası ?? e.likely ?? e.ortalama);
    if (!Number.isFinite(likelyRaw) || !(likelyRaw > 0)) throw new Error('Model geçerli bir efor aralığı vermedi; tekrar deneyin.');
    // Eksik uç olası değere eşit sayılır; negatif ya da sayı olmayan uç geçersizdir
    const edge = (x: unknown) => { const n = toNum(x); return Number.isFinite(n) ? n : x === undefined || x === null || String(x).trim() === '' ? likelyRaw : NaN; };
    const nums = [edge(e.iyimser ?? e.best ?? e.min), likelyRaw, edge(e.kotumser ?? e.kötümser ?? e.worst ?? e.max)];
    if (nums.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Model geçerli bir efor aralığı vermedi; tekrar deneyin.');
    const [best, likely, worst] = [...nums].sort((a, b) => a - b).map(half);
    const list = (x: unknown): string[] => (Array.isArray(x) ? x : x ? [x] : []).map(i => clip(i, 160)).filter(Boolean);
    return {
        issueType: pickAlias(v.tur ?? v.tür ?? v.type, TYPE_ALIASES),
        priority: pickAlias(v.onem ?? v.önem ?? v.priority, PRIORITY_ALIASES),
        effort: { best, likely, worst },
        evidenceIds: evidenceIdsOf(v.dayanak ?? v.evidence),
        priorityRationale: clip(v.onem_gerekce ?? v.önem_gerekçe ?? '', 300),
        effortRationale: clip(v.efor_gerekce ?? v.efor_gerekçe ?? '', 300),
        questions: list(v.eksik_bilgi ?? v.questions).slice(0, 3),
        selfConfidence: pickAlias(v.guven ?? v.güven ?? v.confidence, CONF_ALIASES) || 'medium',
    };
};

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const minConf = (...cs: Confidence[]): Confidence => cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));

/** Efor geçmiş aralığın bu kadar dışındaysa "geçmişin dışında" sayılır */
const OUTSIDE_LOW = 0.67;
const OUTSIDE_HIGH = 1.5;
/** Önem bu payın üstündeki çoğunluktan ayrılırsa çelişki */
const STRONG_MAJORITY = 0.7;

/**
 * Hibrit güven: modelin kendi beyanı, istatistiğin güveni ve güvence
 * işaretlerinin en kötüsü. Bilinmeyen kanıt ya da geçmişin çok dışındaki efor
 * güveni "düşük"e indirir.
 */
export const finalizeEstimateSuggestion = (p: ParsedAiEstimate, ref: ReferenceEstimate): AiEstimate => {
    const ids = contextIds(ref);
    const evidence = [...new Set(p.evidenceIds.filter(x => ids.has(x)).map(x => ids.get(x)!))];
    const unknown = p.evidenceIds.filter(x => !ids.has(x)).length;
    const flags: AiEstimateFlag[] = [];
    if (ref.method === 'none' || !ref.effort) flags.push('no_history');
    else {
        if (!evidence.length && ref.context.length) flags.push('no_evidence');
        if (unknown > 0) flags.push('unknown_evidence');
        if (p.effort.likely < ref.effort.best * OUTSIDE_LOW || p.effort.likely > ref.effort.worst * OUTSIDE_HIGH) flags.push('outside_history');
        const major = ref.priorityMix[0];
        if (p.priority && major && major.share >= STRONG_MAJORITY && p.priority !== major.value) flags.push('priority_conflict');
    }
    let confidence = minConf(p.selfConfidence, ref.method === 'none' ? 'low' : ref.confidence);
    if (flags.some(f => f === 'no_history' || f === 'unknown_evidence' || f === 'outside_history')) confidence = 'low';
    else if (flags.length) confidence = minConf(confidence, 'medium');
    return {
        issueType: p.issueType,
        priority: p.priority,
        effort: p.effort,
        evidence,
        priorityRationale: p.priorityRationale,
        effortRationale: p.effortRationale,
        questions: p.questions,
        confidence,
        flags,
    };
};
