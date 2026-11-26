import type { PocScoreSettings, PocTestItem, Project, ProjectPoc, Task, TaskStatus } from '../types';

/**
 * Müşteri PoC skoru (GİB PoC Bulgu Takip): test listesinden ve görevlerin son
 * Jira eşitlemesindeki durumundan dört skor ve kategori katkıları.
 *
 *   pᵢ = bᵢ + (1 − bᵢ) · k(sᵢ)
 *   Skor = 100 · Σ wᵢ pᵢ / Σ wᵢ        (P: paydaya giren testler)
 *
 *  - wᵢ: ağırlık (Zorunlu 3, Olması beklenen 2, İsteğe bağlı 1)
 *  - bᵢ: başlangıç puanı: Güncel Sonuç varsa o, yoksa PoC sonucu
 *        (karşılandı 1, kısmen 0,5, karşılanmadı 0)
 *  - k(s): PY'nin Jira durumu için girdiği süreç katsayısı (0–1);
 *          görevi olmayan testte 0
 *
 * Değerlendirilmemiş testler (test edilemedi, üreticiye sorulacak,
 * değerlendirme dışı) paydada yoktur; varsayılan kurala göre k = 1 olunca
 * pᵢ = 1 ile paydaya girer.
 *
 * Planlama kategorileri yalnız etikettir ("Planlama: Aralık 2026" …); katkı
 * hesabı kategorilerin sırasına bağlı değildir.
 *
 * Saf ve yaprak modül: tarayıcı, zamanlanmış rapor (sunucu) ve sunum çıktısı
 * aynı hesabı kullanır. Çalışma zamanında başka modüle bağlı değildir.
 */

const DONE = 'Done' as TaskStatus;

export type PocResultClass = 'met' | 'partial' | 'unmet' | 'untestable' | 'askVendor' | 'excluded';

const fold = (s: string): string =>
    s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const RESULT_BY_FOLD: Record<string, PocResultClass> = {
    'karsilandi': 'met',
    'kismen karsilandi': 'partial',
    'kismen': 'partial',
    'karsilanmadi': 'unmet',
    'test edilemedi': 'untestable',
    'ureticiye sorulacak': 'askVendor',
    'degerlendirme disi': 'excluded',
};

export const RESULT_LABELS: Record<PocResultClass, string> = {
    met: 'Karşılandı',
    partial: 'Kısmen karşılandı',
    unmet: 'Karşılanmadı',
    untestable: 'Test edilemedi',
    askVendor: 'Üreticiye sorulacak',
    excluded: 'Değerlendirme dışı',
};

const RESULT_SCORE: Partial<Record<PocResultClass, number>> = { met: 1, partial: 0.5, unmet: 0 };

/** "Kısmen karşılandı" → partial; tanınmayan metin → undefined */
export const resultClass = (v: string | undefined | null): PocResultClass | undefined => (v ? RESULT_BY_FOLD[fold(v)] : undefined);

export const IMPORTANCE_ORDER = ['Zorunlu', 'Olması beklenen', 'İsteğe bağlı'] as const;
export const IMPORTANCE_WEIGHT: Record<string, number> = { 'zorunlu': 3, 'olmasi beklenen': 2, 'istege bagli': 1 };
export const importanceKey = (v: string | undefined): (typeof IMPORTANCE_ORDER)[number] | undefined => {
    const f = fold(v || '');
    return IMPORTANCE_ORDER.find(x => fold(x) === f);
};

export const DEFAULT_CATEGORY_PREFIX = 'Planlama:';
/** Aktarımın ürettiği planlama kategorileri (gösterim sırası; hesap sıradan bağımsız) */
export const POC_CATEGORIES = ['Aralık 2026', 'GİB netleştirme', 'Müşteri sonrası', 'Proje ekibi'] as const;
export const CANCELLED_LABEL = 'İptal / Kapsam dışı';

export const testTaskId = (t: Pick<PocTestItem, 'testNo' | 'taskId'>): string => t.taskId || `gib-${t.testNo}`;

const isPercent = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
const workflowKey = (name: string): string => name.trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Süreç katsayısı k (0–1). Ayrıntılı Jira durumu için girilen değer kategori
 * değerinden önce gelir (ilerleme modeliyle aynı kural). Ayar yoksa yalnız
 * Tamamlandı = 1. İptal edilen madde 0.
 */
export const pocCoefficient = (task: Pick<Task, 'status' | 'jiraStatus' | 'labels'> | undefined, settings?: PocScoreSettings): number => {
    if (!task) return 0;
    if ((task.labels || []).includes(CANCELLED_LABEL)) return 0;
    const w = settings?.coefficients;
    const specific = task.jiraStatus?.trim() ? w?.statuses?.[workflowKey(task.jiraStatus)] : undefined;
    if (isPercent(specific)) return specific / 100;
    const category = w?.categories?.[task.status];
    if (isPercent(category)) return category / 100;
    return task.status === DONE ? 1 : 0;
};

/** Başlangıç puanı: ilk (yalnız PoC sonucu) ya da doğrulanmış (Güncel Sonuç varsa o) */
export const baseScore = (t: PocTestItem, basis: 'initial' | 'verified'): number | undefined => {
    const current = basis === 'verified' ? resultClass(t.currentResult) : undefined;
    return RESULT_SCORE[current || resultClass(t.pocResult) || 'excluded'];
};

export const weightOf = (t: PocTestItem): number =>
    t.weight > 0 ? t.weight : IMPORTANCE_WEIGHT[fold(t.importance || '')] || 0;

interface ScoreOpts {
    basis: 'initial' | 'verified';
    /** Görev durumu katsayısı uygulansın mı (Bugün / Olası) */
    useCoefficient: boolean;
    /** Kapsamdaki görevler tamamlanmış sayılır (Olası) */
    scope?: Set<string>;
}

interface Evaluated { test: PocTestItem; w: number; p: number | undefined; task?: Task }

const evaluate = (poc: ProjectPoc, tasks: Map<string, Task>, o: ScoreOpts): Evaluated[] => {
    const rule = poc.settings?.unevaluated || 'whenComplete';
    return poc.tests.map(test => {
        const w = weightOf(test);
        const task = tasks.get(testTaskId(test));
        const b = baseScore(test, o.basis);
        const k = !o.useCoefficient ? 0 : task && o.scope?.has(task.id) && !(task.labels || []).includes(CANCELLED_LABEL) ? 1 : pocCoefficient(task, poc.settings);
        let p: number | undefined;
        if (b !== undefined) p = b + (1 - b) * k;
        else if (rule === 'whenComplete' && k >= 1) p = 1;
        return { test, w, p, task };
    });
};

const scoreOf = (rows: Evaluated[]): number => {
    let num = 0, den = 0;
    for (const r of rows) if (r.p !== undefined && r.w > 0) { num += r.w * r.p; den += r.w; }
    return den > 0 ? (100 * num) / den : 0;
};

const taskMap = (project: Pick<Project, 'tasks'>) => new Map((project.tasks || []).map(t => [t.id, t]));

const hasAnyLabel = (t: Task, labels: string[]): boolean => {
    const set = new Set(labels.map(fold));
    return (t.labels || []).some(l => set.has(fold(l)));
};

/** Kapsam etiketlerinden birini taşıyan görevlerin kimlikleri */
export const scopeTaskIds = (tasks: Task[], labels: string[]): Set<string> =>
    new Set(labels.length ? tasks.filter(t => hasAnyLabel(t, labels)).map(t => t.id) : []);

/** Projedeki planlama kategorileri (etiket ailesi), bilinen sırayla */
export const pocCategories = (tasks: Task[], prefix = DEFAULT_CATEGORY_PREFIX): string[] => {
    const p = fold(prefix);
    const seen = new Set<string>();
    for (const t of tasks) for (const l of t.labels || []) if (fold(l).startsWith(p) && fold(l) !== p) seen.add(l);
    const order = (l: string) => {
        const i = POC_CATEGORIES.findIndex(c => fold(l).endsWith(fold(c)));
        return i < 0 ? 99 : i;
    };
    return [...seen].sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'tr'));
};

/** "Planlama: Aralık 2026" → "Aralık 2026" */
export const categoryName = (label: string): string => (label.includes(':') ? label.slice(label.indexOf(':') + 1).trim() : label);

export const categoryPrefixOf = (poc?: Pick<ProjectPoc, 'settings'>): string => poc?.settings?.categoryPrefix?.trim() || DEFAULT_CATEGORY_PREFIX;

/** Olası skorun kapsamı: verilen → proje ayarı → ilk kategori (ör. Aralık 2026) */
export const defaultPocScope = (project: Pick<Project, 'tasks' | 'poc'>): string[] => {
    const set = project.poc?.settings?.scopeLabels?.filter(Boolean);
    if (set?.length) return set;
    const first = pocCategories(project.tasks || [], categoryPrefixOf(project.poc))[0];
    return first ? [first] : [];
};

export interface PocCategoryContribution {
    /** Etiket (ör. "Planlama: GİB netleştirme") */
    label: string;
    name: string;
    /** Kategorideki görev sayısı */
    items: number;
    /** Kalan açıktaki payı (puan); katkıların toplamı 100 − Olası */
    value: number;
    /** Yalnız bu kategori kapsama eklenseydi Olası'daki artış (toplanmaz) */
    alone: number;
}

export interface PocScores {
    /** 0–100 */
    initial: number;
    verified: number;
    today: number;
    possible: number;
    scope: string[];
    /** Olası kapsamın dışındaki kategorilerin katkısı (sırasız) */
    contributions: PocCategoryContribution[];
    /** Kategorisi olmayan maddelerin kalan açıktaki payı (puan) */
    uncategorized: number;
    tests: number;
    /** Bugün paydasına giren test sayısı */
    evaluated: number;
    /** Zorunlu olup doğrulanmış sonucu karşılanmadı / kısmen ve görevi tamamlanmamış */
    mandatoryOpen: number;
    /** "Bugün"ün dayandığı son Jira eşitlemesi (ISO) */
    syncAt?: string;
}

export const hasPocData = (project: Pick<Project, 'poc'> | undefined): boolean => !!project?.poc?.tests?.length;

/** Dört skor ve kategori katkıları. `scope` verilmezse proje ayarı (ya da ilk kategori). */
export const computePocScores = (project: Pick<Project, 'tasks' | 'poc' | 'jiraSync'>, scopeLabels?: string[]): PocScores | undefined => {
    const poc = project.poc;
    if (!poc?.tests?.length) return undefined;
    const tasks = taskMap(project);
    const list = project.tasks || [];
    const scope = scopeLabels?.length ? scopeLabels : defaultPocScope(project);
    const scopeIds = scopeTaskIds(list, scope);

    const initial = scoreOf(evaluate(poc, tasks, { basis: 'initial', useCoefficient: false }));
    const verified = scoreOf(evaluate(poc, tasks, { basis: 'verified', useCoefficient: false }));
    const todayRows = evaluate(poc, tasks, { basis: 'verified', useCoefficient: true });
    const today = scoreOf(todayRows);
    const possible = scoreOf(evaluate(poc, tasks, { basis: 'verified', useCoefficient: true, scope: scopeIds }));

    // Katkı: kalan açığın (100 − Olası) kategorilerdeki eksik ağırlıklı puan payı
    const prefix = categoryPrefixOf(poc);
    const scopeSet = new Set(scope.map(fold));
    const categories = pocCategories(list, prefix).filter(c => !scopeSet.has(fold(c)));
    const rule = poc.settings?.unevaluated || 'whenComplete';
    // Değerlendirilmemiş test, görevi tamamlanınca paydaya gireceği için eksik sayılır (p = 0);
    // görevi yoksa ya da kural "hiç girmez" ise hiçbir zaman paydaya girmez → eksik değildir
    const missingOf = (r: Evaluated) => (r.p === undefined && (rule === 'never' || !r.task) ? 0 : r.w * (1 - (r.p ?? 0)));
    const outside = todayRows.filter(r => !(r.task && scopeIds.has(r.task.id)));
    const allCategories = pocCategories(list, prefix);
    const missing = categories.map(c => outside.filter(r => r.task && hasAnyLabel(r.task, [c])).reduce((s, r) => s + missingOf(r), 0));
    // Hiçbir kategoride olmayan eksik puan da paya katılır (gerçek veride 0: her madde bir kategoride)
    const missingOther = outside.filter(r => !(r.task && hasAnyLabel(r.task, allCategories))).reduce((s, r) => s + missingOf(r), 0);
    const gap = Math.max(0, 100 - possible);
    const total = missing.reduce((a, b) => a + b, 0) + missingOther;
    const contributions: PocCategoryContribution[] = categories.map((label, i) => {
        const alone = scoreOf(evaluate(poc, tasks, { basis: 'verified', useCoefficient: true, scope: scopeTaskIds(list, [...scope, label]) })) - possible;
        return {
            label,
            name: categoryName(label),
            items: list.filter(t => hasAnyLabel(t, [label])).length,
            value: total > 0 ? (gap * missing[i]) / total : 0,
            alone,
        };
    });

    const mandatoryOpen = todayRows.filter(r => importanceKey(r.test.importance) === 'Zorunlu').filter(r => {
        const b = baseScore(r.test, 'verified');
        return b !== undefined && b < 1 && (r.p ?? 0) < 1;
    }).length;

    return {
        initial, verified, today, possible, scope, contributions,
        uncategorized: total > 0 ? (gap * missingOther) / total : 0,
        tests: poc.tests.length,
        evaluated: todayRows.filter(r => r.p !== undefined && r.w > 0).length,
        mandatoryOpen,
        ...(project.jiraSync?.lastSyncAt ? { syncAt: project.jiraSync.lastSyncAt } : {}),
    };
};

// ------------------------------------------------------------------ dağılımlar

export interface PocDistribution {
    total: number;
    met: number;
    partial: number;
    /** Karşılanmadı + değerlendirilmemiş */
    other: number;
    byClass: Record<PocResultClass | 'unknown', number>;
}

/** Sonuç dağılımı (müşterinin ilk değerlendirmesi ya da doğrulanmış sonuç) */
export const pocDistribution = (tests: PocTestItem[], basis: 'initial' | 'verified' = 'initial', importance?: string): PocDistribution => {
    const list = importance ? tests.filter(t => importanceKey(t.importance) === importanceKey(importance)) : tests;
    const byClass: PocDistribution['byClass'] = { met: 0, partial: 0, unmet: 0, untestable: 0, askVendor: 0, excluded: 0, unknown: 0 };
    for (const t of list) {
        const c = (basis === 'verified' ? resultClass(t.currentResult) : undefined) || resultClass(t.pocResult) || 'unknown';
        byClass[c]++;
    }
    return { total: list.length, met: byClass.met, partial: byClass.partial, other: list.length - byClass.met - byClass.partial, byClass };
};

export interface PocCategoryRow {
    label: string;
    name: string;
    items: number;
    /** Önem sınıfına göre madde sayısı */
    byImportance: Record<string, number>;
    open: number;
    done: number;
}

/** Planlama kategorileri: büyüklük ve önem dağılımı (görev etiketlerinden) */
export const pocCategoryRows = (project: Pick<Project, 'tasks' | 'poc'>): PocCategoryRow[] => {
    const list = project.tasks || [];
    return pocCategories(list, categoryPrefixOf(project.poc)).map(label => {
        const ts = list.filter(t => hasAnyLabel(t, [label]));
        const byImportance: Record<string, number> = {};
        for (const t of ts) {
            const imp = (t.labels || []).map(importanceKey).find(Boolean) || 'Diğer';
            byImportance[imp] = (byImportance[imp] || 0) + 1;
        }
        const done = ts.filter(t => t.status === DONE).length;
        return { label, name: categoryName(label), items: ts.length, byImportance, open: ts.length - done, done };
    });
};

/** Önem sınıflarını kısa biçimde: "Zorunlu 72 · Olması beklenen 53 · İsteğe bağlı 3" */
export const importanceLine = (by: Record<string, number>, short = false): string =>
    [...IMPORTANCE_ORDER, 'Diğer'].filter(k => by[k]).map(k => `${short ? SHORT[k] || k : k} ${by[k]}`).join(' · ');
const SHORT: Record<string, string> = { 'Zorunlu': 'Z', 'Olması beklenen': 'OB', 'İsteğe bağlı': 'İB' };

// ------------------------------------------------------------------ biçim

/** 87.06 → "%87,1"; `d` ondalık */
export const pct = (v: number, d = 1): string => `%${v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
/** Puan farkı: +46,6 / −3,2 / ±0 */
export const signedPoints = (v: number, d = 1): string => {
    const r = Math.round(v * 10 ** d) / 10 ** d;
    if (r === 0) return '±0';
    return `${r > 0 ? '+' : '−'}${Math.abs(r).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

/** "26 Kas 2026 14:05" (Türkiye saati) */
export const syncLabel = (iso?: string): string => {
    if (!iso) return 'Jira eşitlemesi yok';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Jira eşitlemesi yok';
    return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
};

/** Günlük ölçüm için Bugün skoru (2 ondalık); PoC verisi yoksa undefined */
export const pocSnapshotValue = (project: Pick<Project, 'tasks' | 'poc' | 'jiraSync'>): { poc: number; pocSyncAt?: string } | undefined => {
    const s = computePocScores(project);
    if (!s) return undefined;
    return { poc: Math.round(s.today * 100) / 100, ...(s.syncAt ? { pocSyncAt: s.syncAt } : {}) };
};
