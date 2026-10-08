import {
    EffortRange, EstimateLogEntry, IssueType, Leave, Objective, Person, Project, ReleaseBaseline, ReleaseItemChoice, ReleaseMilestone, ReleasePlan,
    ReleasePlanItem, Task, TaskStatus,
} from '../../types';
import { quarterLabel } from '../goals';
import { foldTr } from '../rag/text';
import { buildSprintWindows } from '../taskToAllocation';
import { PlanningHistory } from './history';
import { mapJiraIssueType, mapJiraPriority } from './jiraFields';
import { pertDays } from './lifecycle';
import { GroupStat, SimGroup, SimResult } from './monteCarlo';
import { estimateFromHistory, RecordDraft } from './referenceClass';
import { BuiltSimulation, buildSimulation, dateAtOffset, offsetOf } from './simulationInput';
import { formatDay, toIsoDay } from '../calendarRange';

/**
 * Sürüm planlama sihirbazının saf hesapları:
 *  1. Tanım (ad, hedef tarih, özet, iş paketleri, test süresi)
 *  2. Kayıtlar (elle, yapıştırarak — Excel/Jira sütunları — ya da havuzdan)
 *  3. Öneriler (geçmiş kayıtlar + AI; satır satır kabul / düzelt / çıkar)
 *  4. Simülasyon (sürüm, projedeki diğer açık işlerle birlikte; kapsam önerisi)
 *  5. Kilometre taşları (iş paketine / önceliğe göre ya da AI; olasılıklı tarih)
 *  6. Aktarım (görevler, hedef + anahtar sonuçlar, termin, sürüm takvimi,
 *     taban çizgisi, öneri günlüğü)
 */

export const RELEASE_STEPS = ['Tanım', 'Kayıtlar', 'Öneriler', 'Simülasyon', 'Kilometre taşları', 'Aktarım'] as const;
export const RELEASE_GROUP = 'release';
export const DESCOPE_TARGET = 0.8;
/** Taban çizgisi ve "güncel tahmin" aynı tekrar sayısıyla (aynı tohum, aynı sonuç) */
export const BASELINE_ITERATIONS = 3000;
const PRIORITY_RANK: Record<Task['priority'], number> = { Blocker: 0, High: 1, Medium: 2, Low: 3 };

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const createReleasePlan = (project: Pick<Project, 'settings'>, now: Date = new Date()): ReleasePlan => ({
    id: newId('rel'),
    name: '',
    summary: '',
    testDays: project.settings.globalTestDays ?? 4,
    workPackageIds: [],
    items: [],
    milestones: [],
    step: 1,
    status: 'draft',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
});

export const newItem = (partial: Partial<ReleasePlanItem> = {}): ReleasePlanItem => ({ id: newId('ri'), name: '', ...partial });

/** Havuzdaki (sürümü atanmamış) açık görevden satır */
export const itemFromTask = (t: Task): ReleasePlanItem => newItem({
    name: t.name, notes: t.notes || undefined, issueType: t.issueType, unit: t.unit || undefined, priority: t.priority, resourceName: t.resourceName || undefined,
    workPackageId: t.workPackageId, sourceTaskId: t.id, ownEstimateDays: pertDays(t) ?? undefined,
});

// ---------------------------------------------------------------- yapıştırma

const HEADER_KEYS: [RegExp, keyof ParsedRow][] = [
    [/^(baslik|ozet|summary|title|ad|kayit)/, 'name'],
    [/^(aciklama|description|detay)/, 'notes'],
    [/^(tur|issue ?type|type|tip)/, 'type'],
    [/^(onem|oncelik|priority)/, 'priority'],
    [/^(birim|unit|component|bilesen)/, 'unit'],
    [/^(tahmin|estimate|efor|gun|sure)/, 'estimate'],
];
interface ParsedRow { name?: string; notes?: string; type?: string; priority?: string; unit?: string; estimate?: string }
const DEFAULT_COLUMNS: (keyof ParsedRow)[] = ['name', 'notes', 'type', 'priority', 'unit', 'estimate'];

/**
 * Yapıştırılan metinden satırlar: Excel'den (sekme ayraçlı), "başlık | açıklama"
 * ya da ";" ayraçlı; ilk satır başlıksa sütunlar başlık adlarıyla eşlenir
 * (Başlık/Summary, Açıklama, Tür/Issue Type, Önem/Priority, Birim, Tahmin).
 * Ayraç yoksa her satır bir kaydın başlığıdır.
 */
export const parsePastedItems = (text: string, defaults: { unit?: string } = {}): ReleasePlanItem[] => {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.trimEnd()).filter(l => l.trim());
    if (!lines.length) return [];
    const sep = lines.some(l => l.includes('\t')) ? '\t' : lines.some(l => l.includes(' | ')) ? ' | ' : lines.some(l => l.includes(';')) ? ';' : null;
    const split = (l: string) => (sep ? l.split(sep).map(c => c.trim()) : [l.trim()]);
    let columns = DEFAULT_COLUMNS;
    let rows = lines;
    const head = split(lines[0]).map(c => foldTr(c));
    const mapped = head.map(h => HEADER_KEYS.find(([re]) => re.test(h))?.[1]);
    if (sep && mapped.includes('name')) {
        columns = mapped.map(m => m as keyof ParsedRow);
        rows = lines.slice(1);
    }
    return rows.map(l => {
        const cells = split(l);
        const r: ParsedRow = {};
        cells.forEach((c, i) => { const k = columns[i]; if (k && c) r[k] = c; });
        if (!r.name) return null;
        const est = Number(String(r.estimate || '').replace(',', '.').replace(/[^\d.]/g, ''));
        return newItem({
            name: r.name.slice(0, 200),
            notes: r.notes,
            issueType: r.type ? mapJiraIssueType(r.type) : undefined,
            priority: r.priority ? mapJiraPriority(r.priority) : undefined,
            unit: r.unit || defaults.unit,
            ownEstimateDays: est > 0 ? est : undefined,
        });
    }).filter((x): x is ReleasePlanItem => !!x);
};

// ---------------------------------------------------------------- öneri ve karar

export const itemDraft = (item: ReleasePlanItem, projectId: string): RecordDraft => ({
    name: item.name, notes: item.notes, issueType: item.issueType, unit: item.unit, priority: item.priority, workPackageId: item.workPackageId, projectId,
    ownEstimateDays: item.ownEstimateDays,
});

/** Satırın geçmiş kayıtlardan önerisi (anlık görüntü; günlüğe ve aktarıma bu girer) */
export const withReference = (item: ReleasePlanItem, history: PlanningHistory, projectId: string, visibleProjectIds?: ReadonlySet<string>): ReleasePlanItem => {
    const est = estimateFromHistory(itemDraft(item, projectId), history, { visibleProjectIds });
    return {
        ...item,
        reference: est.method !== 'none' && est.effort && est.duration ? {
            method: est.method, n: est.n, confidence: est.confidence, p50Days: est.duration.p50, p80Days: est.duration.p80,
            effort: est.effort, priority: est.priority?.value, issueType: est.issueType?.value,
        } : undefined,
    };
};

/** Seçilen kaynak; seçilmediyse: güveni düşük olmayan AI → geçmiş kayıtlar → kendi tahmin */
export const choiceOf = (item: ReleasePlanItem): ReleaseItemChoice | null => {
    const ok = (c?: ReleaseItemChoice) => !!c && (c === 'reference' ? !!item.reference : c === 'ai' ? !!item.ai : c === 'model' ? !!item.model : c === 'own' ? !!item.ownEstimateDays : !!item.manual);
    if (ok(item.choice)) return item.choice!;
    if (item.ai && item.ai.confidence !== 'low') return 'ai';
    if (item.reference) return 'reference';
    if (item.ownEstimateDays) return 'own';
    if (item.ai) return 'ai';
    return null;
};

export const effortOf = (item: ReleasePlanItem): EffortRange | null => {
    const c = choiceOf(item);
    if (c === 'reference') return item.reference!.effort;
    if (c === 'ai') return item.ai!.effort;
    if (c === 'model') return item.model!.effort;
    if (c === 'manual') { const [best, likely, worst] = [item.manual!.best, item.manual!.likely, item.manual!.worst].sort((a, b) => a - b); return { best, likely, worst }; }
    if (c === 'own') return { best: item.ownEstimateDays!, likely: item.ownEstimateDays!, worst: item.ownEstimateDays! };
    return null;
};

export const priorityOf = (item: ReleasePlanItem): Task['priority'] =>
    item.priority || (choiceOf(item) === 'ai' && item.ai?.priority) || (choiceOf(item) === 'model' && item.model?.priority) || item.reference?.priority || item.ai?.priority || 'Medium';

export const typeOf = (item: ReleasePlanItem): IssueType | undefined =>
    item.issueType || (choiceOf(item) === 'ai' ? item.ai?.issueType : choiceOf(item) === 'model' ? item.model?.issueType : undefined) || item.reference?.issueType || item.ai?.issueType;

export type ItemDecision = 'accepted' | 'edited' | 'rejected' | 'pending';
export const decisionOf = (item: ReleasePlanItem): ItemDecision => {
    if (item.excluded) return 'rejected';
    const c = choiceOf(item);
    if (!c) return 'pending';
    return c === 'manual' || c === 'own' ? 'edited' : 'accepted';
};

const SOURCE: Record<ReleaseItemChoice, EstimateLogEntry['final']['source']> = { reference: 'reference', ai: 'ai', model: 'model', own: 'user', manual: 'user' };
const TASK_SOURCE: Record<ReleaseItemChoice, Task['estimateSource']> = { reference: 'reference', ai: 'ai', model: 'model', own: 'user', manual: 'user' };

export const includedItems = (plan: ReleasePlan) => plan.items.filter(i => !i.excluded && i.name.trim());

// ---------------------------------------------------------------- simülasyon

export const releaseTaskId = (item: ReleasePlanItem) => `rp:${item.id}`;

/** Sürüm kayıtlarının simülasyon için geçici görevleri (havuzdan alınanların asılları çıkarılır) */
export const virtualProject = (project: Project, plan: ReleasePlan, extraExcluded: string[] = []): { project: Project; version: number } => {
    const sources = new Set(plan.items.map(i => i.sourceTaskId).filter(Boolean) as string[]);
    const base = project.tasks.filter(t => !sources.has(t.id));
    const version = Math.max(0, ...base.filter(t => t.includeInSprints !== false).map(t => t.version || 0)) + 1;
    const skip = new Set(extraExcluded);
    const tasks: Task[] = includedItems(plan).filter(i => !skip.has(i.id)).map(i => {
        const e = effortOf(i);
        const c = choiceOf(i);
        return {
            id: releaseTaskId(i), name: i.name, notes: i.notes || '', availability: true, priority: priorityOf(i), version, unit: i.unit || '', resourceName: i.resourceName || '',
            predecessor: i.predecessorId ? `rp:${i.predecessorId}` : null, time: e ? { best: e.best, avg: e.likely, worst: e.worst } : { best: 0, avg: 0, worst: 0 },
            jiraId: '', status: TaskStatus.ToDo, includeInSprints: true, issueType: typeOf(i), workPackageId: i.workPackageId, estimateSource: c ? TASK_SOURCE[c] : undefined,
        };
    });
    return { project: { ...project, tasks: [...base, ...tasks] }, version };
};

export interface ReleaseSimulation {
    built: BuiltSimulation;
    version: number;
    /** Simülasyona giremeyen satırlar (tahmin yok) */
    missing: string[];
}

export const buildReleaseSimulation = (
    project: Project,
    plan: ReleasePlan,
    history: PlanningHistory,
    ctx: { people?: Person[]; leaves?: Leave[] },
    opts: { now?: Date; iterations?: number; seed?: number; extraExcluded?: string[]; visibleProjectIds?: ReadonlySet<string> } = {},
): ReleaseSimulation => {
    const { project: vp, version } = virtualProject(project, plan, opts.extraExcluded);
    const built = buildSimulation(vp, history, ctx, { now: opts.now, scope: 'open', testDays: plan.testDays, iterations: opts.iterations, seed: opts.seed, visibleProjectIds: opts.visibleProjectIds });
    const index = new Map(built.tasks.map((t, i) => [t.id, i]));
    const skip = new Set(opts.extraExcluded || []);
    const items = includedItems(plan).filter(i => !skip.has(i.id));
    const idx = (ids: string[]) => ids.map(id => index.get(`rp:${id}`)).filter((x): x is number => x !== undefined);
    built.input.groups = [
        { id: RELEASE_GROUP, tasks: idx(items.map(i => i.id)), target: plan.targetDate ? offsetOf(built.start, plan.targetDate) - plan.testDays : undefined },
        ...plan.milestones.map(m => ({ id: m.id, tasks: idx(m.itemIds.filter(id => !skip.has(id))), target: m.targetDate ? offsetOf(built.start, m.targetDate) : undefined })),
    ];
    return { built, version, missing: items.filter(i => !index.has(`rp:${i.id}`)).map(i => i.id) };
};

export const groupOf = (result: SimResult, id: string): GroupStat | undefined => result.groups.find(g => g.id === id);

/** Sürüm teslimi (test dahil) */
export const releaseDates = (result: SimResult, start: string, testDays: number) => {
    const g = groupOf(result, RELEASE_GROUP);
    if (!g || !g.sorted.length || g.finish.max === 0) return null;
    const at = (v: number) => toIsoDay(dateAtOffset(start, Math.ceil(v) + testDays));
    return { p50: at(g.finish.p50), p80: at(g.finish.p80), p95: at(g.finish.p95), targetProbability: g.targetProbability };
};

/**
 * Kapsam önerisi: hedef tarih %80 olasılıkla tutmuyorsa, önce düşük öncelikli,
 * aynı öncelikte sürümün kritik yolunda olan ve büyük eforlu kayıtlar teker
 * teker çıkarılır; her adımda yeniden simüle edilir. Engelleyiciler çıkarılmaz.
 */
export const suggestDescope = async (
    plan: ReleasePlan,
    base: { result: SimResult; built: BuiltSimulation },
    evaluate: (excluded: string[]) => Promise<number | null>,
    opts: { target?: number; maxSteps?: number } = {},
): Promise<{ removed: string[]; probability: number } | null> => {
    const target = opts.target ?? DESCOPE_TARGET;
    const g = groupOf(base.result, RELEASE_GROUP);
    if (!g || g.targetProbability === null || g.targetProbability >= target) return null;
    const crit = new Map<string, number>();
    const group = base.built.input.groups?.find(x => x.id === RELEASE_GROUP);
    group?.tasks.forEach((ti, k) => crit.set(base.built.tasks[ti].id.slice(3), g.criticality[k] || 0));
    const candidates = includedItems(plan)
        .filter(i => priorityOf(i) !== 'Blocker' && effortOf(i))
        .sort((a, b) => PRIORITY_RANK[priorityOf(b)] - PRIORITY_RANK[priorityOf(a)]
            || (crit.get(b.id) || 0) * effortOf(b)!.likely - (crit.get(a.id) || 0) * effortOf(a)!.likely);
    const removed: string[] = [];
    const max = Math.min(opts.maxSteps ?? 10, Math.floor(includedItems(plan).length / 2));
    for (const c of candidates.slice(0, max)) {
        removed.push(c.id);
        const p = await evaluate(removed);
        if (p === null) return null;
        if (p >= target) return { removed, probability: p };
    }
    return null;
};

// ---------------------------------------------------------------- kilometre taşları

/** Varsayılan kilometre taşları: iş paketine göre; tek iş paketiyse önceliğe göre */
export const autoMilestones = (plan: ReleasePlan, project: Pick<Project, 'workPackages'>): ReleaseMilestone[] => {
    const items = includedItems(plan);
    if (!items.length) return [];
    const wps = [...new Set(items.map(i => i.workPackageId).filter(Boolean) as string[])];
    if (wps.length >= 2) {
        const out = wps.map(w => ({ id: newId('ms'), name: project.workPackages.find(x => x.id === w)?.name || 'İş paketi', itemIds: items.filter(i => i.workPackageId === w).map(i => i.id) }));
        const rest = items.filter(i => !i.workPackageId).map(i => i.id);
        if (rest.length) out.push({ id: newId('ms'), name: 'Diğer kayıtlar', itemIds: rest });
        return out;
    }
    const critical = items.filter(i => PRIORITY_RANK[priorityOf(i)] <= 1).map(i => i.id);
    const rest = items.filter(i => PRIORITY_RANK[priorityOf(i)] > 1).map(i => i.id);
    if (!critical.length || !rest.length) return [{ id: newId('ms'), name: 'Sürüm kapsamı', itemIds: items.map(i => i.id) }];
    return [
        { id: newId('ms'), name: 'Kritik kapsam', itemIds: critical },
        { id: newId('ms'), name: 'Tamamlayıcı kapsam', itemIds: rest },
    ];
};

/** Bilinmeyen/çıkarılmış satırları atar, tekrarı önler, boş taşları siler, açıkta kalanları son taşa ekler */
export const sanitizeMilestones = (ms: ReleaseMilestone[], plan: ReleasePlan): ReleaseMilestone[] => {
    const valid = new Set(includedItems(plan).map(i => i.id));
    const seen = new Set<string>();
    const out = ms
        .map(m => ({ ...m, itemIds: m.itemIds.filter(id => valid.has(id) && !seen.has(id) && (seen.add(id), true)) }))
        .filter(m => m.itemIds.length);
    const rest = includedItems(plan).map(i => i.id).filter(id => !seen.has(id));
    if (rest.length) {
        if (out.length) out[out.length - 1] = { ...out[out.length - 1], itemIds: [...out[out.length - 1].itemIds, ...rest] };
        else out.push({ id: newId('ms'), name: 'Sürüm kapsamı', itemIds: rest });
    }
    return out;
};

// ---------------------------------------------------------------- aktarım

export interface CommitResult {
    project: Project;
    plan: ReleasePlan;
    log: EstimateLogEntry[];
    created: number;
    updated: number;
    /** satır → görev, kilometre taşı → anahtar sonuç */
    taskIdOf: Record<string, string>;
    krIdOf: Record<string, string>;
}

/**
 * Planı projeye aktarır: kabul edilen satırlar görev olur (havuzdan
 * alınanlar güncellenir), her kayıt simülasyondaki P50 bitişine göre sürüm
 * takvimine yerleşir, termini kilometre taşının hedefi (yoksa P80'i) olur;
 * sürüm bir hedef, kilometre taşları anahtar sonuç olarak açılır. Plan ve
 * tahminler taban çizgisi olarak donar; her satırın kararı günlüğe yazılır.
 */
export const commitReleasePlan = (
    project: Project,
    plan: ReleasePlan,
    sim: { built: BuiltSimulation; result: SimResult },
    opts: { now?: Date; model?: string } = {},
): CommitResult => {
    const now = opts.now || new Date();
    const at = now.toISOString();
    const start = sim.built.start;
    const day = (offset: number) => toIsoDay(dateAtOffset(start, Math.max(1, Math.ceil(offset))));
    const statById = new Map(sim.result.tasks.map(t => [t.id, t]));
    const items = includedItems(plan).filter(i => effortOf(i));
    const milestones = sanitizeMilestones(plan.milestones, plan);
    const msOf = new Map<string, ReleaseMilestone>();
    milestones.forEach(m => m.itemIds.forEach(id => msOf.set(id, m)));
    const msStat = (m: ReleaseMilestone) => groupOf(sim.result, m.id);
    const msP80 = (m: ReleaseMilestone) => { const g = msStat(m); return g && g.finish.max > 0 ? day(g.finish.p80) : undefined; };

    // Hedef ve anahtar sonuçlar
    const rel = releaseDates(sim.result, start, plan.testDays);
    const krIds = new Map(milestones.map(m => [m.id, newId('kr')]));
    const objective: Objective = {
        id: newId('obj'),
        name: `Sürüm: ${plan.name || 'Adsız sürüm'}`,
        description: plan.summary,
        quarter: quarterLabel(new Date(`${plan.targetDate || rel?.p80 || toIsoDay(now)}T00:00:00`)),
        keyResults: milestones.map(m => ({ id: krIds.get(m.id)!, name: `${m.name}${msP80(m) ? ` (P80 ${formatDay(msP80(m))})` : ''}` })),
    };

    // Sürüm takvimi: kaydın P50 bitişini içeren sürüm. Sihirbaz sürümü mevcut sürümlerden
    // sonra simüle ettiği için kayıtlar son mevcut sürümden önceye alınmaz (aynı varsayım).
    const sources = new Set(plan.items.map(i => i.sourceTaskId).filter(Boolean) as string[]);
    const maxVersion = Math.max(0, ...project.tasks.filter(t => !sources.has(t.id) && t.includeInSprints !== false).map(t => t.version || 0));
    const windows = buildSprintWindows(project, maxVersion + 400);
    const versionFor = (iso: string) => {
        const d = new Date(`${iso}T00:00:00`);
        return Math.max(maxVersion + 1, windows.find(w => w.end >= d)?.sprint ?? maxVersion + 1);
    };

    const taskFields = (i: ReleasePlanItem): Partial<Task> => {
        const e = effortOf(i)!;
        const c = choiceOf(i)!;
        const st = statById.get(releaseTaskId(i));
        const m = msOf.get(i.id);
        const p50 = st ? day(st.p50) : undefined;
        return {
            name: i.name.trim(), notes: (i.notes || '').trim(), priority: priorityOf(i), issueType: typeOf(i), unit: (i.unit || '').trim(), resourceName: i.resourceName || '',
            workPackageId: i.workPackageId, time: { best: e.best, avg: e.likely, worst: e.worst }, estimateSource: TASK_SOURCE[c], includeInSprints: true,
            version: p50 ? versionFor(p50) : maxVersion + 1,
            keyResultId: m ? krIds.get(m.id) : undefined,
            dueDate: m ? (m.targetDate || msP80(m)) : undefined,
            forecast: i.reference ? {
                at, method: i.reference.method, n: i.reference.n, confidence: i.reference.confidence, p50Days: i.reference.p50Days, p80Days: i.reference.p80Days,
                effortDays: i.reference.effort.likely, accepted: c === 'reference',
            } : undefined,
        };
    };

    const taskIdOf = new Map<string, string>();
    const krIdOf = krIds;
    let created = 0, updated = 0;
    const byId = new Map(project.tasks.map(t => [t.id, t]));
    const existing = project.tasks.map(t => {
        const i = items.find(x => x.sourceTaskId === t.id);
        if (!i) return t;
        updated++;
        taskIdOf.set(i.id, t.id);
        return { ...t, ...taskFields(i) };
    });
    const fresh: Task[] = items.filter(i => !i.sourceTaskId || !byId.has(i.sourceTaskId)).map(i => {
        created++;
        const id = newId('task');
        taskIdOf.set(i.id, id);
        return {
            id, availability: true, predecessor: null, jiraId: '', status: TaskStatus.ToDo, labels: [], name: '', notes: '', priority: 'Medium', version: 0, unit: '', resourceName: '',
            time: { best: 0, avg: 0, worst: 0 }, ...taskFields(i),
        } as Task;
    });
    // Plan içi öncüller görev kimliklerine çevrilir
    const tasks = [...existing, ...fresh].map(t => {
        const i = items.find(x => taskIdOf.get(x.id) === t.id);
        return i?.predecessorId && taskIdOf.has(i.predecessorId) ? { ...t, predecessor: taskIdOf.get(i.predecessorId)! } : t;
    });

    const log: EstimateLogEntry[] = plan.items.filter(i => i.name.trim()).map(i => {
        const e = effortOf(i);
        const c = choiceOf(i);
        const taken = !i.excluded && !!e && taskIdOf.has(i.id);
        return {
            id: newId('est'), at, projectId: project.id, taskId: taken ? taskIdOf.get(i.id) : undefined,
            draft: { name: i.name.trim(), issueType: i.issueType, unit: i.unit || undefined, hasNotes: !!i.notes?.trim() },
            blind: i.blind && (i.blind.effortDays || i.blind.priority) ? i.blind : undefined,
            reference: i.reference,
            model: i.model,
            ai: i.ai ? { promptVersion: i.ai.promptVersion, model: i.ai.model ?? opts.model, issueType: i.ai.issueType, priority: i.ai.priority, effort: i.ai.effort, confidence: i.ai.confidence, flags: i.ai.flags, evidence: i.ai.evidence, questions: i.ai.questions } : undefined,
            final: { source: taken && c ? SOURCE[c] : 'none', priority: priorityOf(i), issueType: typeOf(i), effort: taken ? e! : undefined, version: taken ? (tasks.find(t => t.id === taskIdOf.get(i.id))?.version ?? 0) : 0 },
        };
    });

    const baseline: ReleaseBaseline | undefined = rel ? {
        at, start, p50: rel.p50, p80: rel.p80, p95: rel.p95, targetProbability: rel.targetProbability, itemCount: items.length,
        effortDays: Math.round(items.reduce((s, i) => s + effortOf(i)!.likely, 0) * 10) / 10,
        milestones: milestones.map(m => { const g = msStat(m); return { id: m.id, name: m.name, p50: g ? day(g.finish.p50) : '', p80: g ? day(g.finish.p80) : '' }; }),
        taskIds: items.map(i => taskIdOf.get(i.id)!).filter(Boolean),
        objectiveId: milestones.length ? objective.id : undefined,
    } : undefined;

    const committed: ReleasePlan = { ...plan, milestones, status: 'committed', step: 6, updatedAt: at, baseline };
    return {
        project: {
            ...project,
            tasks,
            objectives: milestones.length ? [...project.objectives, objective] : project.objectives,
            releasePlans: (project.releasePlans || []).map(p => (p.id === plan.id ? committed : p)),
        },
        plan: committed,
        log,
        created,
        updated,
        taskIdOf: Object.fromEntries(taskIdOf),
        krIdOf: Object.fromEntries(krIdOf),
    };
};

/** Aktarılan projenin simülasyonu için gruplar: sürüm ve kilometre taşları, gerçek görev kimlikleriyle */
export const commitGroups = (built: BuiltSimulation, c: CommitResult): SimGroup[] => {
    const index = new Map(built.tasks.map((t, i) => [t.id, i]));
    const idx = (itemIds: string[]) => itemIds.map(id => index.get(c.taskIdOf[id])).filter((x): x is number => x !== undefined);
    const plan = c.plan;
    return [
        { id: RELEASE_GROUP, tasks: idx(Object.keys(c.taskIdOf)), target: plan.targetDate ? offsetOf(built.start, plan.targetDate) - plan.testDays : undefined },
        ...plan.milestones.map(m => ({ id: m.id, tasks: idx(m.itemIds), target: m.targetDate ? offsetOf(built.start, m.targetDate) : undefined })),
    ];
};

/**
 * Taban çizgisini aktarılan planın kendi simülasyonundan kesinleştirir:
 * aktarımda kayıtlar sürüm takvimine yerleştiği için çizelgeleme sırası
 * sihirbazdakinden farklıdır. Böylece aktarımdan hemen sonraki "güncel
 * tahmin" taban çizgisiyle aynı çıkar. Anahtar sonuç adlarındaki ve hedefi
 * olmayan kilometre taşı terminlerindeki P80 de buna göre güncellenir.
 */
export const finalizeCommit = (c: CommitResult, built: BuiltSimulation, result: SimResult): CommitResult => {
    const b = c.plan.baseline;
    const rel = releaseDates(result, built.start, c.plan.testDays);
    if (!b || !rel) return c;
    const day = (offset: number) => toIsoDay(dateAtOffset(built.start, Math.max(1, Math.ceil(offset))));
    const ms = c.plan.milestones.map(m => {
        const g = groupOf(result, m.id);
        return { m, p50: g && g.finish.max > 0 ? day(g.finish.p50) : '', p80: g && g.finish.max > 0 ? day(g.finish.p80) : '' };
    });
    const baseline: ReleaseBaseline = { ...b, start: built.start, p50: rel.p50, p80: rel.p80, p95: rel.p95, targetProbability: rel.targetProbability, milestones: ms.map(x => ({ id: x.m.id, name: x.m.name, p50: x.p50, p80: x.p80 })) };
    const krName = new Map(ms.map(x => [c.krIdOf[x.m.id], `${x.m.name}${x.p80 ? ` (P80 ${formatDay(x.p80)})` : ''}`]));
    const dueOf = new Map<string, string>();
    ms.forEach(x => { if (!x.m.targetDate && x.p80) x.m.itemIds.forEach(id => { if (c.taskIdOf[id]) dueOf.set(c.taskIdOf[id], x.p80); }); });
    const plan = { ...c.plan, baseline };
    return {
        ...c,
        plan,
        project: {
            ...c.project,
            tasks: c.project.tasks.map(t => (dueOf.has(t.id) ? { ...t, dueDate: dueOf.get(t.id) } : t)),
            objectives: c.project.objectives.map(o => (o.id === b.objectiveId ? { ...o, keyResults: o.keyResults.map(k => (krName.has(k.id) ? { ...k, name: krName.get(k.id)! } : k)) } : o)),
            releasePlans: (c.project.releasePlans || []).map(p => (p.id === plan.id ? plan : p)),
        },
    };
};

// ---------------------------------------------------------------- taban çizgisi

/** Aktarılmış planın görevleri için güncel simülasyon grubu (taban çizgisiyle karşılaştırma) */
export const baselineGroups = (built: BuiltSimulation, baseline: ReleaseBaseline) => {
    const index = new Map(built.tasks.map((t, i) => [t.id, i]));
    return [{ id: RELEASE_GROUP, tasks: baseline.taskIds.map(id => index.get(id)).filter((x): x is number => x !== undefined) }];
};
