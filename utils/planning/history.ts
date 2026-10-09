import { IssueType, Project, Task } from '../../types';
import { terms } from '../rag/text';
import { analyzeRecords, RecordQualityReport } from './recordQuality';
import { quantileSorted } from './random';

/**
 * Planlama geçmişi: eğitime uygun (kayıt kalitesi testlerinden geçen)
 * kapanmış kayıtlar, tahmin ve simülasyonun öğrendiği biçimde.
 *
 * İki süre ayrı tutulur:
 *  - kapanma süresi (days): işe başlamadan (yoksa açılıştan) kapanışa geçen
 *    iş günü — "bu kayıt kaç günde kapanır" sorusunun yanıtı.
 *  - efor eşdeğeri (effortDays): kaydın kişiden yediği gün. Jira'dan harcanan
 *    süre geldiyse o (saat ÷ 8); yoksa Little yasasıyla türetilir:
 *    kapanma süresi × katılım oranı ÷ aynı kişinin o sırada açık işi sayısı.
 *    Böylece aynı anda üç iş yürüten kişinin her işi üç kat uzun görünse de
 *    kapasite simülasyonu eforu üç kez saymaz.
 *
 * Kalibrasyon oranı = efor eşdeğeri ÷ tahmin; ekiplerin sistematik
 * iyimserliğini (ör. ×1,4) ölçer ve yeni tahminleri düzeltir.
 */

export const HOURS_PER_DAY = 8;
/** Geçmiş gerçekleşenlerden üretilmiş tahmin kaynakları: simülasyonda ikinci kez kalibre edilmez, kalibrasyon oranına girmez */
export const GROUNDED: ReadonlySet<string> = new Set(['reference', 'ai', 'model']);
/** Kalibrasyon grubu için en az örnek */
export const MIN_CALIBRATION = 8;
const RATIO_MIN = 0.25;
const RATIO_MAX = 4;
const MIN_EFFORT = 0.25;
const MAX_CONCURRENCY = 10;
const DAY_MS = 86_400_000;

export interface HistoryRecord {
    id: string;
    projectId: string;
    projectName: string;
    name: string;
    notes: string;
    jiraId?: string;
    issueType?: IssueType;
    unit: string;
    priority: Task['priority'];
    labels: string[];
    workPackageId?: string;
    /** Kapanma süresi (iş günü; başlamadan kapanışa, yoksa açılıştan) */
    days: number;
    leadDays: number | null;
    cycleDays: number | null;
    /** Efor eşdeğeri (gün) */
    effortDays: number;
    effortBasis: 'logged' | 'derived';
    /** Kişinin bu kayıt açıkken ortalama eşzamanlı iş sayısı (≥ 1) */
    concurrency: number;
    estimateDays: number | null;
    /** Kalibrasyon oranı (efor ÷ tahmin, kırpılmış); tahmin geçmişten üretildiyse yok */
    ratio: number | null;
    terms: string[];
    /** Ölçülen sürenin başladığı an (işe başlama, yoksa açılış) */
    openedAt: string;
    /** Kaydın açıldığı (oluşturulduğu) an; tahmin bu anda yapılır */
    createdAt?: string;
    resolvedAt: string;
}

/** Kaydın tahmin edildiği an: açılış (yoksa ölçümün başladığı an). Zaman ayrımlı testlerde bağlam bundan önce kapananlardır. */
export const estimatedAt = (r: Pick<HistoryRecord, 'openedAt' | 'createdAt'>): string => (r.createdAt && r.createdAt < r.openedAt ? r.createdAt : r.openedAt);

export interface PlanningHistory {
    report: RecordQualityReport;
    records: HistoryRecord[];
}

const fold = (s: string) => s.trim().toLocaleLowerCase('tr-TR');
const dayStartMs = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const clip = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const buildHistory = (projects: Pick<Project, 'id' | 'name' | 'tasks' | 'resources'>[]): PlanningHistory => {
    const report = analyzeRecords(projects);
    const usable = report.rows.filter(r => r.usable && r.days !== null && r.task.resolvedAt);
    const participation = new Map<string, number>(); // projectId|kişi → 0–1
    projects.forEach(p => p.resources.forEach(r => participation.set(`${p.id}|${fold(r.name)}`, clip((r.participation || 100) / 100, 0.05, 1))));

    // Eşzamanlılık: aynı kişinin kayıtlarının zaman aralıkları (projeler arası; çoklu proje de iş yüküdür)
    const spans = usable.map(r => {
        const startIso = r.cycleDays !== null ? r.task.startedAt! : r.task.createdAt || r.task.startedAt!;
        return { person: fold(r.task.resourceName || ''), from: dayStartMs(startIso), to: dayStartMs(r.task.resolvedAt!) + DAY_MS };
    });
    const byPerson = new Map<string, number[]>();
    spans.forEach((s, i) => {
        if (!s.person) return;
        const xs = byPerson.get(s.person);
        if (xs) xs.push(i); else byPerson.set(s.person, [i]);
    });
    const concurrency = spans.map((s, i) => {
        if (!s.person) return 1;
        const len = Math.max(DAY_MS, s.to - s.from);
        let overlap = 0;
        byPerson.get(s.person)!.forEach(j => {
            if (j === i) return;
            const o = Math.min(s.to, spans[j].to) - Math.max(s.from, spans[j].from);
            if (o > 0) overlap += o;
        });
        return clip(1 + overlap / len, 1, MAX_CONCURRENCY);
    });

    const records: HistoryRecord[] = usable.map((r, i) => {
        const t = r.task;
        const conc = concurrency[i];
        const p = participation.get(`${r.projectId}|${fold(t.resourceName || '')}`) ?? 1;
        const logged = (t.actualHours || 0) > 0;
        const effortDays = Math.max(MIN_EFFORT, logged ? t.actualHours! / HOURS_PER_DAY : (r.days! * p) / conc);
        const ratio = r.estimateDays && r.estimateDays > 0 && !GROUNDED.has(t.estimateSource || '') ? clip(effortDays / r.estimateDays, RATIO_MIN, RATIO_MAX) : null;
        return {
            id: t.id,
            projectId: r.projectId,
            projectName: r.projectName,
            name: t.name,
            notes: t.notes || '',
            jiraId: t.jiraId || undefined,
            issueType: t.issueType,
            unit: t.unit || '',
            priority: t.priority,
            labels: t.labels || [],
            workPackageId: t.workPackageId,
            days: r.days!,
            leadDays: r.leadDays,
            cycleDays: r.cycleDays,
            effortDays: Math.round(effortDays * 100) / 100,
            effortBasis: logged ? 'logged' : 'derived',
            concurrency: Math.round(conc * 100) / 100,
            estimateDays: r.estimateDays,
            ratio,
            terms: terms(`${t.name} ${t.notes || ''}`),
            openedAt: r.cycleDays !== null ? t.startedAt! : t.createdAt || t.startedAt!,
            createdAt: t.createdAt || undefined,
            resolvedAt: t.resolvedAt!,
        };
    });
    return { report, records };
};

// ---------------------------------------------------------------- kalibrasyon

export type CalibrationScope = 'unit_type' | 'unit' | 'type' | 'all';

export interface Calibration {
    scope: CalibrationScope;
    label: string;
    ratios: number[];
    n: number;
    median: number;
    p20: number;
    p80: number;
}

const SCOPE_LABEL: Record<CalibrationScope, string> = { unit_type: 'birim ve tür', unit: 'birim', type: 'tür', all: 'tüm geçmiş' };

const summarize = (scope: CalibrationScope, ratios: number[]): Calibration => {
    const s = [...ratios].sort((a, b) => a - b);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { scope, label: SCOPE_LABEL[scope], ratios: s, n: s.length, median: r2(quantileSorted(s, 0.5)), p20: r2(quantileSorted(s, 0.2)), p80: r2(quantileSorted(s, 0.8)) };
};

/**
 * Kalibrasyon seçici: en özel yeterli gruptan (birim × tür → birim → tür →
 * tümü) oran dağılımını verir; hiçbiri yeterli değilse null.
 */
type Calibrator = (sel: { unit?: string; issueType?: IssueType }) => Calibration | null;
const calibratorCache = new WeakMap<PlanningHistory, Calibrator>();

export const calibrator = (history: PlanningHistory, min = MIN_CALIBRATION): Calibrator => {
    const hit = min === MIN_CALIBRATION ? calibratorCache.get(history) : undefined;
    if (hit) return hit;
    const groups = new Map<string, number[]>();
    const add = (k: string, v: number) => {
        const xs = groups.get(k);
        if (xs) xs.push(v); else groups.set(k, [v]);
    };
    history.records.forEach(r => {
        if (r.ratio === null) return;
        const u = fold(r.unit);
        add(`ut|${u}|${r.issueType || ''}`, r.ratio);
        add(`u|${u}`, r.ratio);
        if (r.issueType) add(`t|${r.issueType}`, r.ratio);
        add('all', r.ratio);
    });
    const cache = new Map<string, Calibration | null>();
    const fn: Calibrator = sel => {
        const u = fold(sel.unit || '');
        const key = `${u}|${sel.issueType || ''}`;
        if (cache.has(key)) return cache.get(key)!;
        const tries: [CalibrationScope, string | null][] = [
            ['unit_type', u && sel.issueType ? `ut|${u}|${sel.issueType}` : null],
            ['unit', u ? `u|${u}` : null],
            ['type', sel.issueType ? `t|${sel.issueType}` : null],
            ['all', 'all'],
        ];
        let out: Calibration | null = null;
        for (const [scope, k] of tries) {
            const xs = k ? groups.get(k) : undefined;
            if (xs && xs.length >= min) { out = summarize(scope, xs); break; }
        }
        cache.set(key, out);
        return out;
    };
    if (min === MIN_CALIBRATION) calibratorCache.set(history, fn);
    return fn;
};

// ---------------------------------------------------------------- geçmiş hız

/**
 * Haftalık kapanan kayıt sayıları (son `windowWeeks` tam hafta, en yeni önce).
 * Toplu kapatma günleri sayılmaz; ilk kapanıştan önceki boş haftalar atılır.
 * Yeterli geçmiş yoksa (4 haftadan az ya da 5 kapanıştan az) null.
 */
export const weeklyThroughput = (report: RecordQualityReport, projectId: string | null, now: Date = new Date(), windowWeeks = 26): number[] | null => {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const end = monday.getTime();
    const counts = new Array(windowWeeks).fill(0);
    report.rows.forEach(r => {
        if ((projectId && r.projectId !== projectId) || !r.task.resolvedAt || r.issues.includes('bulk_closed')) return;
        const at = new Date(r.task.resolvedAt).getTime();
        if (at >= end) return; // içinde bulunulan yarım hafta sayılmaz
        const w = Math.floor((end - at) / (7 * DAY_MS));
        if (w < windowWeeks) counts[w]++;
    });
    let last = -1;
    counts.forEach((c, i) => { if (c > 0) last = i; });
    const weeks = counts.slice(0, last + 1);
    const total = weeks.reduce((a, b) => a + b, 0);
    return weeks.length >= 4 && total >= 5 ? weeks : null;
};
