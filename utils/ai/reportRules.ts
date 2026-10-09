import { LearnedRule, ReportItem, ReportSettings, WeeklyReport, WorkspaceData } from '../../types';
import { PermissionHolder } from '../permissions';
import { isReportSteward, itemDisplay, LintIssue, lintReport } from '../weeklyReport';
import { extractJson } from './json';
import { tokenF1 } from './reportAiStats';

/**
 * Geri bildirimden öğrenilen kurallar. Adaylar üç kaynaktan gelir:
 *  - lint: gönderimdeki format sorunlarının (öneri günlüğü) bölüm ya da proje
 *    bazında sıklığı eşiği aşınca o soruna karşılık gelen hazır kural,
 *  - edit: AI taslağının onaylı hâlinde tekrarlanan düzeltmeler (belirsiz
 *    ifadenin kaldırılması, rutin maddenin silinmesi, maddeye tarih eklenmesi),
 *  - return: iade notları ve düzeltme örneklerinden AI'nın önerdiği kurallar.
 * Aday kural hiçbir zaman kendiliğinden etkinleşmez; PYB destek etkinleştirir,
 * düzenler ya da emekliye ayırır. Etkin kurallar sistem istemine "ÖĞRENİLMİŞ
 * KURUM KURALLARI" başlığıyla girer (kapsam başına en çok 10; reportGuide.ts).
 */

export const RULE_MIN_EVIDENCE = 3;
export const RULE_TEXT_LIMIT = 300;
const EXAMPLE_CLIP = 160;
const AI_RULE_LIMIT = 5;

type LintCode = LintIssue['code'];

/** Format sorunu → hazır kural metni */
export const LINT_RULE_TEXT: Partial<Record<LintCode, string>> = {
    abbr: 'Kısaltmanın açılımını ilk geçtiği yerde parantez içinde yaz ve kısaltmalar listesine ekle.',
    vague: '“Bazı”, “birkaç”, “yakında”, “ilgili birim” gibi belirsiz ifadeler yerine tarih, rakam ve kurum ya da kişi adı yaz.',
    generic: '“Çalışmalara devam edildi” yazma; hangi ürün ya da özellik üzerinde çalışıldığını adıyla yaz.',
    long: 'Cümleler 25 sözcüğü geçmesin; uzun cümleyi böl.',
    paragraph: 'Her gelişmeyi ayrı maddeye yaz; bir maddede en çok üç kısa cümle olsun.',
    routine: 'Müşteriyi doğrudan etkilemeyen rutin iç çalışmaları (hata düzeltme, test, sprint planlama) rapora yazma.',
    meeting: 'Toplantı maddesinde zaman, yer, katılımcılar, gündem ve alınan kararları açıkça yaz.',
    figure: 'Fatura, satış, teslimat ve kabul maddelerinde tarih ve tutar ya da adet ver.',
    'next-empty': 'Gelecek hafta planını tarihli ve somut maddelerle yaz.',
};

type EditPattern = 'vague_removed' | 'routine_deleted' | 'date_added';

export const EDIT_RULE_TEXT: Record<EditPattern, string> = {
    vague_removed: LINT_RULE_TEXT.vague!,
    routine_deleted: LINT_RULE_TEXT.routine!,
    date_added: 'Her gelişmede tarihi (gün, ay, yıl) yaz; girdide tarih yoksa "eksikBilgi"ye soru olarak ekle.',
};

const clip = (s: string, n = EXAMPLE_CLIP) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const DATE_RE = /\b\d{1,2}[./]\d{1,2}\b|\b\d{1,2}\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\b|\b\d{4}-\d{2}-\d{2}\b/iu;
const codesOf = (text: string): Set<LintCode> => new Set(lintReport({ thisWeek: [{ id: 'x', category: 'ongoing', text }], nextWeek: [{ id: 'y', category: 'plan', text: 'x' }], abbreviations: [] }).map(i => i.code));

export interface RuleCandidate {
    id: string; // belirlenimci: aynı kanıt yeniden önerilince güncellenir
    text: string;
    scope: LearnedRule['scope'];
    scopeId?: string;
    source: LearnedRule['source'];
    evidenceCount: number;
    examples?: string[];
}

/** Kapsama göre gruplu sayaç: eşiği geçen bölümler aday; en az iki bölümde geçerse kurum geneli de aday */
const scoped = (key: string, text: string, source: LearnedRule['source'], byDept: Map<string, { n: number; examples: string[] }>, minEvidence: number): RuleCandidate[] => {
    const out: RuleCandidate[] = [];
    let total = 0, depts = 0;
    const all: string[] = [];
    byDept.forEach((v, dept) => {
        total += v.n;
        all.push(...v.examples);
        if (v.n >= minEvidence) {
            depts++;
            out.push({ id: `${source}:${key}:department:${dept}`, text, scope: 'department', scopeId: dept, source, evidenceCount: v.n, ...(v.examples.length ? { examples: v.examples.slice(0, 2) } : {}) });
        }
    });
    if (depts >= 2) return [{ id: `${source}:${key}:institution:`, text, scope: 'institution', source, evidenceCount: total, ...(all.length ? { examples: all.slice(0, 2) } : {}) }];
    return out;
};

/**
 * Lint adayları: gönderim günlüğündeki format sorunu kodlarının sıklığı
 * (rapor başına bir kez sayılır; iade sonrası yeniden gönderimde son kayıt).
 */
export const lintRuleCandidates = (ws: Partial<Pick<WorkspaceData, 'reportAiLog'>>, o: { minEvidence?: number; from?: string } = {}): RuleCandidate[] => {
    const min = o.minEvidence ?? RULE_MIN_EVIDENCE;
    const last = new Map<string, NonNullable<WorkspaceData['reportAiLog']>[number]>();
    (ws.reportAiLog || []).filter(e => e.outcome === 'submitted' && (!o.from || e.at.slice(0, 10) >= o.from)).forEach(e => last.set(e.reportId, e));
    const counts = new Map<LintCode, Map<string, { n: number; examples: string[] }>>();
    last.forEach(e => Object.keys(e.lintCodes || {}).forEach(code => {
        const c = code as LintCode;
        if (!LINT_RULE_TEXT[c]) return;
        const m = counts.get(c) || new Map();
        const d = m.get(e.departmentCode) || { n: 0, examples: [] };
        d.n++;
        m.set(e.departmentCode, d);
        counts.set(c, m);
    }));
    return [...counts.entries()].flatMap(([code, byDept]) => scoped(code, LINT_RULE_TEXT[code]!, 'lint', byDept, min));
};

/** AI taslağından silinen madde metinleri (aiDraft.output içindeki öneri − raporda kalan AI maddeleri) */
const deletedAiTexts = (r: WeeklyReport): string[] => {
    const out = extractJson(r.aiDraft?.output || '') as { buHafta?: unknown[] } | null;
    const proposed = (Array.isArray(out?.buHafta) ? out!.buHafta : []).map(x => (x && typeof x === 'object' ? String((x as { metin?: unknown }).metin || '') : String(x || ''))).filter(Boolean);
    const kept = [...r.thisWeek, ...r.nextWeek].filter(i => i.aiOriginal).map(i => i.aiOriginal!.text.trim());
    return proposed.filter(t => !kept.some(k => tokenF1(k, t) >= 0.9));
};

/**
 * Düzenleme adayları: gönderilmiş AI taslaklı raporlarda tekrarlanan
 * düzeltmeler. Belirsiz ifadesi kaldırılan, tarihi eklenen maddeler ve
 * rutin iş olduğu için silinen AI maddeleri sayılır.
 */
export const editRuleCandidates = (ws: Partial<Pick<WorkspaceData, 'weeklyReports'>>, o: { minEvidence?: number } = {}): RuleCandidate[] => {
    const min = o.minEvidence ?? RULE_MIN_EVIDENCE;
    const counts = new Map<EditPattern, Map<string, { n: number; examples: string[] }>>();
    const add = (p: EditPattern, dept: string, example: string) => {
        const m = counts.get(p) || new Map();
        const d = m.get(dept) || { n: 0, examples: [] };
        d.n++;
        if (d.examples.length < 2) d.examples.push(clip(example));
        m.set(dept, d);
        counts.set(p, m);
    };
    (ws.weeklyReports || []).filter(r => r.kind === 'project' && r.stage !== 'draft' && r.aiDraft?.itemIds?.length).forEach(r => {
        [...r.thisWeek, ...r.nextWeek].forEach((i: ReportItem) => {
            if (!i.aiOriginal) return;
            const before = i.aiOriginal.text, after = itemDisplay(i);
            if (before.trim() === after.trim()) return;
            if (codesOf(before).has('vague') && !codesOf(after).has('vague')) add('vague_removed', r.departmentCode, `${before} → ${after}`);
            if (!DATE_RE.test(before) && DATE_RE.test(after)) add('date_added', r.departmentCode, `${before} → ${after}`);
        });
        deletedAiTexts(r).forEach(t => { if (codesOf(t).has('routine')) add('routine_deleted', r.departmentCode, `Silindi: ${t}`); });
    });
    return [...counts.entries()].flatMap(([p, byDept]) => scoped(p, EDIT_RULE_TEXT[p], 'edit', byDept, min));
};

// ---------------------------------------------------------------- AI destekli adaylar

export const RULES_SYSTEM = `Sen bir kurumun haftalık proje raporu kılavuzunu geliştiren editörsün. Sana rapor iade notları ve AI taslağına yapılan düzeltme örnekleri verilecek.
Bunlardan, AI rapor yazım asistanının gelecekte uyması gereken en çok ${AI_RULE_LIMIT} kısa, genel ve uygulanabilir kural çıkar.
- Her kural tek cümle, emir kipinde ve en çok 200 karakter olsun.
- Kişi, proje ya da müşteri adı yazma; kural genel olsun.
- Zaten bilinen genel kılavuz maddelerini (kısaltma açılımı, belirsiz ifade, kısa cümle) yalnız notlarda açıkça tekrarlanıyorsa yaz.
- Kanıtı zayıf olanı yazma.
Yanıtı YALNIZCA şu JSON biçiminde ver: {"kurallar":[{"metin":"...","kanit":2}]}`;

/** İade notları ve düzeltme çiftleri (son N) */
export const ruleEvidence = (ws: Partial<Pick<WorkspaceData, 'weeklyReports'>>, o: { limit?: number } = {}): { returnNotes: string[]; edits: { ai: string; approved: string }[] } => {
    const limit = o.limit ?? 30;
    const reports = [...(ws.weeklyReports || [])].sort((a, b) => b.year - a.year || b.week - a.week);
    const returnNotes = reports.flatMap(r => r.history.filter(h => h.action === 'return' && h.note?.trim()).map(h => clip(h.note!, 240))).slice(0, limit);
    const edits = reports.filter(r => r.stage !== 'draft').flatMap(r => [...r.thisWeek, ...r.nextWeek]
        .filter(i => i.aiOriginal && tokenF1(i.aiOriginal.text, itemDisplay(i)) < 0.8)
        .map(i => ({ ai: clip(i.aiOriginal!.text), approved: clip(itemDisplay(i)) }))).slice(0, limit);
    return { returnNotes, edits };
};

export const buildRulePrompt = (e: { returnNotes: string[]; edits: { ai: string; approved: string }[] }): string => [
    e.returnNotes.length ? `İADE NOTLARI:\n${e.returnNotes.map(n => `- ${n}`).join('\n')}` : 'İADE NOTLARI: (yok)',
    e.edits.length ? `AI TASLAĞI → ONAYLANAN HÂL:\n${e.edits.map(x => `- AI: ${x.ai}\n  Onaylanan: ${x.approved}`).join('\n')}` : 'DÜZELTME ÖRNEKLERİ: (yok)',
    'Bu kanıtlardan kural önerilerini JSON olarak yaz.',
].join('\n\n');

/** Model yanıtından aday kurallar (en çok 5; boş ve tekrar atılır) */
export const parseRuleSuggestions = (text: string, now: Date = new Date()): RuleCandidate[] => {
    const j = extractJson(text) as { kurallar?: unknown[] } | null;
    if (!j || !Array.isArray(j.kurallar)) throw new Error('Model yanıtı beklenen biçimde değil; tekrar deneyin.');
    const seen = new Set<string>();
    return j.kurallar.map(k => {
        const o = (k && typeof k === 'object' ? k : { metin: k }) as { metin?: unknown; kanit?: unknown };
        return { text: clip(String(o.metin || ''), RULE_TEXT_LIMIT), n: Math.max(0, Math.round(Number(o.kanit) || 0)) };
    }).filter(k => {
        const key = k.text.toLocaleLowerCase('tr-TR');
        if (!k.text || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, AI_RULE_LIMIT).map((k, i) => ({ id: `return:${now.getTime().toString(36)}:${i}`, text: k.text, scope: 'institution' as const, source: 'return' as const, evidenceCount: k.n }));
};

// ---------------------------------------------------------------- yönetim (yalnız PYB destek)

export type RuleAction =
    | { kind: 'refresh' } // kural tabanlı adayları üret / güncelle
    | { kind: 'candidates'; candidates: RuleCandidate[] } // AI adaylarını öneri olarak ekle
    | { kind: 'status'; id: string; status: LearnedRule['status'] }
    | { kind: 'edit'; id: string; text: string }
    | { kind: 'add'; text: string; scope: LearnedRule['scope']; scopeId?: string };

/** Adayları listeye işler: yeni aday "önerilen" olur; mevcut öneri güncellenir; etkin/emekli kurallara dokunulmaz */
export const mergeCandidates = (rules: LearnedRule[], candidates: RuleCandidate[], now: Date = new Date()): LearnedRule[] => {
    const out = [...rules];
    candidates.forEach(c => {
        const i = out.findIndex(r => r.id === c.id);
        if (i < 0) out.push({ ...c, status: 'proposed', createdAt: now.toISOString() });
        else if (out[i].status === 'proposed') out[i] = { ...out[i], evidenceCount: c.evidenceCount, ...(c.examples ? { examples: c.examples } : {}), updatedAt: now.toISOString() };
    });
    return out;
};

type RuleWs = Partial<Pick<WorkspaceData, 'reportAiLog' | 'weeklyReports'>>;

/** Kural işlemi; yetki yoksa ya da işlem geçersizse null */
export const applyRuleAction = (s: ReportSettings, ws: RuleWs, who: PermissionHolder, a: RuleAction, byName?: string, now: Date = new Date()): ReportSettings | null => {
    if (!isReportSteward(who)) return null;
    const rules = s.learnedRules || [];
    let next: LearnedRule[];
    switch (a.kind) {
        case 'refresh':
            next = mergeCandidates(rules, [...lintRuleCandidates(ws), ...editRuleCandidates(ws)], now);
            break;
        case 'candidates':
            next = mergeCandidates(rules, a.candidates.map(c => ({ ...c, text: clip(c.text, RULE_TEXT_LIMIT) })).filter(c => c.text), now);
            break;
        case 'status': {
            const r = rules.find(x => x.id === a.id);
            if (!r) return null;
            next = rules.map(x => (x.id === a.id ? { ...x, status: a.status, updatedAt: now.toISOString(), ...(a.status === 'active' && byName ? { approvedByName: byName } : {}) } : x));
            break;
        }
        case 'edit': {
            const text = clip(a.text, RULE_TEXT_LIMIT);
            if (!text || !rules.some(x => x.id === a.id)) return null;
            next = rules.map(x => (x.id === a.id ? { ...x, text, updatedAt: now.toISOString() } : x));
            break;
        }
        case 'add': {
            const text = clip(a.text, RULE_TEXT_LIMIT);
            if (!text || (a.scope !== 'institution' && !a.scopeId)) return null;
            // Elle eklenen kural PYB desteğin kendi kararıdır: doğrudan etkin
            next = [...rules, {
                id: `manual:${now.getTime().toString(36)}:${Math.random().toString(36).slice(2, 6)}`, text, scope: a.scope, ...(a.scope !== 'institution' ? { scopeId: a.scopeId } : {}),
                source: 'manual', status: 'active', evidenceCount: 0, createdAt: now.toISOString(), ...(byName ? { approvedByName: byName } : {}),
            }];
            break;
        }
    }
    return { ...s, learnedRules: next };
};

export const ruleActionLabel = (a: RuleAction, s?: ReportSettings): string => {
    const text = (id: string) => clip(s?.learnedRules?.find(r => r.id === id)?.text || id, 60);
    switch (a.kind) {
        case 'refresh': return 'Öğrenilmiş kural adayları güncellendi';
        case 'candidates': return `AI ${a.candidates.length} kural adayı önerdi`;
        case 'status': return `Kural ${a.status === 'active' ? 'etkinleştirildi' : a.status === 'retired' ? 'emekliye ayrıldı' : 'öneriye döndü'}: ${text(a.id)}`;
        case 'edit': return `Kural düzenlendi: ${text(a.id)}`;
        case 'add': return `Elle kural eklendi: ${clip(a.text, 60)}`;
    }
};
