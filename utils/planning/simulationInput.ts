import { Leave, Person, Project, Task, TaskStatus } from '../../types';
import { effectiveCapacity } from '../availability';
import { IsoDay, toIsoDay } from '../calendarRange';
import { calibrator, GROUNDED, PlanningHistory } from './history';
import { pertDays } from './lifecycle';
import { EffortDist, SimInput, SimLane, SimTask } from './monteCarlo';
import { seedFrom } from './random';
import { estimateFromHistory, MIN_REFS } from './referenceClass';
import { addWorkdays, isWorkday, workdaysBetween } from './workdays';

/**
 * Projenin açık kayıtlarından simülasyon girdisi kurar: kapsam, efor
 * dağılımları (tahmin aralığı → beta-PERT; tek değer → kalibrasyon ya da
 * varsayılan belirsizlik; tahmin yoksa benzer kayıtların gerçek eforları),
 * kalibrasyon çarpanları, kişi şeritleri (katılım, aylık plan, izin) ve
 * öncelik sırası. Saf; sonuç Web Worker'a gönderilebilir.
 */

export const DEFAULT_ITERATIONS = 5000;
/** Simülasyon ufku (iş günü, ~5 yıl); ötesinde temel kapasite sürer */
const HORIZON = 1300;
/** Tek değerli tahminde (Jira) kalibrasyon yoksa varsayılan belirsizlik: −%20 / +%60 */
export const DEFAULT_SPREAD = { low: 0.8, high: 1.6 };

const BASE_SCORE: Record<Task['priority'], number> = { Blocker: 4, High: 3, Medium: 2, Low: 1 };
const UNASSIGNED_UNIT = 'Atanmamış';

export type SimScope = 'open' | number; // sayı: "Sürüm N'e kadar (dahil)"

export interface SimOptions {
    now?: Date;
    scope?: SimScope;
    excluded?: string[];
    /** unassigned: yalnız atanmamış kayıtlar birim havuzundan; unit: birimdeki herkes her kaydı alabilir */
    pooling?: 'unassigned' | 'unit';
    extraPeople?: { unit: string; count: number }[];
    testDays?: number;
    iterations?: number;
    seed?: number;
    target?: IsoDay;
    /** Yalnız bu projelerin kayıtları kanıt olarak adıyla gösterilir */
    visibleProjectIds?: ReadonlySet<string>;
}

export type EstimateSourceKind = 'range' | 'point' | 'default' | 'reference';

export interface SimTaskInfo {
    id: string;
    name: string;
    unit: string;
    resource: string;
    priority: Task['priority'];
    version: number;
    status: TaskStatus;
    source: EstimateSourceKind;
    calibrated: boolean;
    meanEffort: number;
    dueDate?: string;
}

export type SimWarningKind = 'no_estimate' | 'no_team' | 'cycle' | 'default_spread' | 'reference_estimate' | 'zero_participation';

export interface SimWarning {
    kind: SimWarningKind;
    taskIds: string[];
    message: string;
}

export interface BuiltSimulation {
    input: SimInput;
    start: IsoDay;
    tasks: SimTaskInfo[];
    skipped: { id: string; name: string }[];
    warnings: SimWarning[];
    /** Kapsamdaki kayıt sayısı (tahmini olmayanlar dahil; geçmiş hız yöntemi bunu kullanır) */
    scopeCount: number;
    calibratedShare: number; // kalibrasyon uygulanan kayıt payı
    medianRatio: number | null; // uygulanan kalibrasyonların medyanı
    lanes: string[]; // şerit etiketleri
}

const fold = (s?: string) => (s || '').trim().toLocaleLowerCase('tr-TR');

/** Simülasyonun ilk iş günü: bugün iş günüyse bugün */
export const simulationStart = (now: Date = new Date()): Date => addWorkdays(now, 1);

/** k'inci iş günü (k ≥ 1; 0 → başlangıç) */
export const dateAtOffset = (start: IsoDay | Date, k: number): Date => {
    const s = typeof start === 'string' ? new Date(`${start}T00:00:00`) : start;
    return addWorkdays(s, Math.max(1, Math.ceil(k)));
};

/** Tarihin başlangıca göre iş günü ofseti (tarih dahil); öncesiyse 0 */
export const offsetOf = (start: IsoDay | Date, day: IsoDay | string): number => {
    const s = typeof start === 'string' ? new Date(`${start}T00:00:00`) : start;
    return workdaysBetween(s, day.length <= 10 ? new Date(`${day}T00:00:00`) : day) ?? 0;
};

export const scopeTasks = (project: Pick<Project, 'tasks'>, scope: SimScope = 'open'): Task[] =>
    project.tasks.filter(t => t.status !== TaskStatus.Done && t.includeInSprints !== false && (scope === 'open' || ((t.version || 0) >= 1 && (t.version || 0) <= scope)));

/** Ufuk boyunca her iş gününün (yıl, ay) bilgisi */
const workdayMonths = (start: Date, n: number): { y: number; m: number }[] => {
    const out: { y: number; m: number }[] = [];
    const d = new Date(start);
    while (out.length < n) {
        if (isWorkday(d)) out.push({ y: d.getFullYear(), m: d.getMonth() });
        d.setDate(d.getDate() + 1);
    }
    return out;
};

export const buildSimulation = (
    project: Project,
    history: PlanningHistory,
    ctx: { people?: Person[]; leaves?: Leave[] } = {},
    opts: SimOptions = {},
): BuiltSimulation => {
    const now = opts.now || new Date();
    const startDate = simulationStart(now);
    const start = toIsoDay(startDate);
    const excluded = new Set(opts.excluded || []);
    const inScope = scopeTasks(project, opts.scope ?? 'open').filter(t => !excluded.has(t.id));
    const warnings: SimWarning[] = [];
    const warn = (kind: SimWarningKind, id: string, message: (n: number) => string) => {
        const w = warnings.find(x => x.kind === kind);
        if (w) { w.taskIds.push(id); w.message = message(w.taskIds.length); } else warnings.push({ kind, taskIds: [id], message: message(1) });
    };

    // ---- şeritler
    const months = workdayMonths(startDate, HORIZON);
    const people = new Map((ctx.people || []).map(p => [fold(`${p.firstName} ${p.lastName}`), p]));
    const lanes: SimLane[] = [];
    const laneLabels: string[] = [];
    const laneByName = new Map<string, number>();
    const pools = new Map<string, number[]>();
    const participationOf = new Map<string, number>();
    const addToPool = (unit: string, lane: number) => {
        const k = fold(unit) || fold(UNASSIGNED_UNIT);
        pools.set(k, [...(pools.get(k) || []), lane]);
    };
    const noParticipation: string[] = [];
    project.resources.forEach(r => {
        let base = (r.participation || 0) / 100;
        if (!(base > 0)) {
            base = 1;
            noParticipation.push(r.name);
        }
        const person = people.get(fold(r.name));
        const rate = months.map(({ y, m }) => {
            const planned = r.monthlyPlan && typeof r.monthlyPlan[m] === 'number' ? r.monthlyPlan[m] / 100 : base;
            const avail = person ? effectiveCapacity(person, ctx.leaves || [], y, m + 1) / (person.availableAA || 1) : 1;
            return Math.max(0, planned * Math.min(1, avail));
        });
        const idx = lanes.length;
        lanes.push({ rate, base });
        laneLabels.push(r.name);
        laneByName.set(fold(r.name), idx);
        participationOf.set(fold(r.name), base);
        addToPool(r.unit || UNASSIGNED_UNIT, idx);
    });
    if (noParticipation.length) warnings.push({ kind: 'zero_participation', taskIds: [], message: `${noParticipation.join(', ')} için katılım oranı girilmemiş; %100 varsayıldı` });
    (opts.extraPeople || []).forEach(x => {
        for (let i = 0; i < x.count; i++) {
            const idx = lanes.length;
            lanes.push({ rate: months.map(() => 1), base: 1 });
            laneLabels.push(`Ek kişi ${i + 1} (${x.unit || UNASSIGNED_UNIT})`);
            addToPool(x.unit || UNASSIGNED_UNIT, idx);
        }
    });
    const poolKeys = [...pools.keys()];
    const poolIndex = new Map(poolKeys.map((k, i) => [k, i]));

    // ---- efor dağılımları
    const cal = calibrator(history);
    const infos: SimTaskInfo[] = [];
    const simTasks: SimTask[] = [];
    const skipped: { id: string; name: string }[] = [];
    const appliedRatios: number[] = [];
    const kept: Task[] = [];
    inScope.forEach(t => {
        let dist: EffortDist | null = null;
        let source: EstimateSourceKind = 'range';
        let calibration: number[] | undefined;
        const c = GROUNDED.has(t.estimateSource || '') ? null : cal({ unit: t.unit, issueType: t.issueType });
        const pert = pertDays(t);
        if (pert !== null) {
            const { best, avg, worst } = t.time;
            const mode = avg > 0 ? avg : (best + worst) / 2;
            if (worst > best) {
                dist = { kind: 'pert', min: Math.max(0, best), mode, max: worst };
            } else if (c) {
                dist = { kind: 'fixed', value: mode };
                source = 'point';
            } else {
                dist = { kind: 'pert', min: mode * DEFAULT_SPREAD.low, mode, max: mode * DEFAULT_SPREAD.high };
                source = 'default';
                warn('default_spread', t.id, n => `${n} kayıtta tek değerli tahmin var ve kalibrasyon verisi yetersiz; −%20 / +%60 belirsizlik varsayıldı`);
            }
            if (c) { calibration = c.ratios; appliedRatios.push(c.median); }
        } else {
            const ref = estimateFromHistory(
                { name: t.name, notes: t.notes, issueType: t.issueType, unit: t.unit, priority: t.priority, labels: t.labels, workPackageId: t.workPackageId, projectId: project.id },
                history,
                { visibleProjectIds: opts.visibleProjectIds },
            );
            if (ref.effortSamples.length >= MIN_REFS) {
                dist = { kind: 'samples', values: ref.effortSamples };
                source = 'reference';
                warn('reference_estimate', t.id, n => `${n} kaydın tahmini yok; benzer kapanmış kayıtların gerçek eforları kullanıldı`);
            }
        }
        if (!dist) {
            skipped.push({ id: t.id, name: t.name });
            warn('no_estimate', t.id, n => `${n} kaydın tahmini yok ve benzer kayıt da bulunamadı; simülasyona katılmadı`);
            return;
        }
        const meanBase = dist.kind === 'fixed' ? dist.value : dist.kind === 'pert' ? (dist.min + 4 * dist.mode + dist.max) / 6 : dist.values.reduce((a, b) => a + b, 0) / dist.values.length;
        const mean = calibration ? meanBase * (calibration.reduce((a, b) => a + b, 0) / calibration.length) : meanBase;

        // şerit
        const own = laneByName.get(fold(t.resourceName));
        const pool = poolIndex.get(fold(t.unit) || fold(UNASSIGNED_UNIT));
        let lane = -2;
        let poolIdx: number | undefined;
        if (opts.pooling === 'unit' && pool !== undefined) { lane = -1; poolIdx = pool; }
        else if (own !== undefined) lane = own;
        else if (pool !== undefined) { lane = -1; poolIdx = pool; }
        else warn('no_team', t.id, n => `${n} kaydın biriminde projede kişi yok; kapasite sınırı olmadan hesaplandı`);

        let doneEffort: number | undefined;
        let halfDone: boolean | undefined;
        if (t.status === TaskStatus.InProgress) {
            if (t.startedAt) {
                const p = participationOf.get(fold(t.resourceName)) ?? 1;
                const elapsed = (workdaysBetween(t.startedAt, now) ?? 0) * p;
                doneEffort = Math.max(0, elapsed);
            } else halfDone = true;
        }

        simTasks.push({
            id: t.id, dist, calibration, lane, pool: poolIdx, pred: -1, doneEffort, halfDone,
            dueOffset: t.dueDate ? offsetOf(startDate, t.dueDate.slice(0, 10)) : undefined,
        });
        infos.push({
            id: t.id, name: t.name, unit: t.unit || '', resource: t.resourceName || '', priority: t.priority, version: t.version || 0, status: t.status,
            source, calibrated: !!calibration, meanEffort: Math.round(mean * 10) / 10, dueDate: t.dueDate,
        });
        kept.push(t);
    });

    // ---- öncüller ve öncelik sırası
    const index = new Map(kept.map((t, i) => [t.id, i]));
    kept.forEach((t, i) => {
        const p = t.predecessor ? index.get(t.predecessor) : undefined;
        if (p !== undefined && p !== i) simTasks[i].pred = p;
    });
    const succ: number[][] = kept.map(() => []);
    simTasks.forEach((s, i) => { if (s.pred >= 0) succ[s.pred].push(i); });
    // Miras alınan öncelik: ardılı engelleyici olan iş de engelleyicidir
    const inherited = new Array<number>(kept.length).fill(0);
    const state = new Array<number>(kept.length).fill(0);
    const score = (i: number): number => {
        if (state[i] === 2) return inherited[i];
        if (state[i] === 1) return BASE_SCORE[kept[i].priority] || 2; // döngü
        state[i] = 1;
        let s = BASE_SCORE[kept[i].priority] || 2;
        succ[i].forEach(j => { s = Math.max(s, score(j)); });
        state[i] = 2;
        inherited[i] = s;
        return s;
    };
    kept.forEach((_, i) => score(i));
    const due = (t: Task) => (t.dueDate ? new Date(t.dueDate).getTime() || Infinity : Infinity);
    const cmp = (a: number, b: number) => {
        const va = kept[a].version > 0 ? kept[a].version : Infinity, vb = kept[b].version > 0 ? kept[b].version : Infinity;
        if (va !== vb) return va - vb;
        if (inherited[a] !== inherited[b]) return inherited[b] - inherited[a];
        if (due(kept[a]) !== due(kept[b])) return due(kept[a]) - due(kept[b]);
        return a - b;
    };
    const indeg = simTasks.map(s => (s.pred >= 0 ? 1 : 0));
    const ready = simTasks.map((_, i) => i).filter(i => indeg[i] === 0);
    const order: number[] = [];
    while (ready.length) {
        ready.sort(cmp);
        const i = ready.shift()!;
        order.push(i);
        succ[i].forEach(j => { if (--indeg[j] === 0) ready.push(j); });
    }
    if (order.length < kept.length) {
        const placed = new Set(order);
        kept.map((_, i) => i).filter(i => !placed.has(i)).sort(cmp).forEach(i => {
            if (simTasks[i].pred >= 0 && !placed.has(simTasks[i].pred)) {
                simTasks[i].pred = -1;
                warn('cycle', kept[i].id, n => `${n} kayıt öncül döngüsünde; döngü kırılarak hesaplandı`);
            }
            order.push(i);
            placed.add(i);
        });
    }

    const testDays = Math.max(0, opts.testDays ?? project.settings.globalTestDays ?? 4);
    const targetOffset = opts.target ? offsetOf(startDate, opts.target) : undefined;
    const seed = opts.seed ?? seedFrom(`${project.id}|${kept.map(t => t.id).join(',')}`);

    return {
        input: {
            tasks: simTasks,
            lanes,
            pools: poolKeys.map(k => pools.get(k)!),
            order,
            testDays,
            iterations: Math.max(100, Math.min(20000, opts.iterations ?? DEFAULT_ITERATIONS)),
            seed,
            targetOffset,
        },
        start,
        tasks: infos,
        skipped,
        warnings,
        scopeCount: inScope.length,
        calibratedShare: infos.length ? infos.filter(i => i.calibrated).length / infos.length : 0,
        medianRatio: appliedRatios.length ? [...appliedRatios].sort((a, b) => a - b)[Math.floor(appliedRatios.length / 2)] : null,
        lanes: laneLabels,
    };
};
