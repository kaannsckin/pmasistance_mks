import { Leave, Person, Project, Task, TaskStatus } from '../../types';
import { effectiveCapacity } from '../availability';
import { plannedShare } from '../resourcePlan';
import { buildSprintWindows } from '../taskToAllocation';
import { calibrator, GROUNDED, PlanningHistory } from './history';
import { estimateRange } from './lifecycle';
import { distMean, EffortDist } from './monteCarlo';
import { betaPert, mulberry32, pick, Rng, seedFrom } from './random';
import { estimateFromHistory, MIN_REFS } from './referenceClass';
import { DEFAULT_SPREAD } from './simulationInput';
import { isWorkday } from './workdays';

/**
 * "Bu yeni kayıt hangi sürüme sığar?" — sürüm bazında olasılık. Her sürüm
 * için kaydın birimindeki kalan kapasite (sürümün kalan iş günleri × kişi
 * katılımı × izin payı) ile o birimdeki açık işlerin eforu ve yeni kaydın
 * eforu rastgele çekilerek karşılaştırılır; P(toplam ≤ kapasite).
 * Eforlar kişiden yenen gün cinsindendir (katılım kapasiteye bir kez girer).
 */

export interface SprintFitRow {
    version: number;
    label: string;
    start: Date;
    end: Date;
    capacity: number; // birimin kalan efor kapasitesi (gün)
    committed: number; // birimdeki açık işlerin beklenen eforu (gün)
    probability: number | null; // birimde kapasite yoksa null
    isNew: boolean; // planın sonuna eklenecek yeni sürüm
}

export interface SprintFit {
    unit: string;
    rows: SprintFitRow[];
    /** P ≥ 0,8 olan ilk sürüm; yoksa P ≥ 0,5 olan ilk sürüm */
    recommended: number | null;
    recommendedRisky: boolean;
    unitHasTeam: boolean;
}

export const FIT_TARGET = 0.8;
const MAX_ROWS = 6;
const MAX_EXTRA_SPRINTS = 400;
const fold = (s?: string) => (s || '').trim().toLocaleLowerCase('tr-TR');

const sample = (d: EffortDist, rng: Rng) => (d.kind === 'fixed' ? d.value : d.kind === 'pert' ? betaPert(d.min, d.mode, d.max, rng) : d.values.length ? pick(d.values, rng) : 0);

export const sprintFit = (
    project: Project,
    history: PlanningHistory,
    record: { unit: string; effort: EffortDist; calibration?: number[] },
    ctx: { people?: Person[]; leaves?: Leave[]; now?: Date; iterations?: number; sprintName?: (v: number) => string; visibleProjectIds?: ReadonlySet<string> } = {},
): SprintFit => {
    const now = ctx.now || new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const unit = fold(record.unit);
    const team = project.resources.filter(r => fold(r.unit) === unit);
    const planned = project.tasks.filter(t => t.includeInSprints !== false);
    const maxVersion = Math.max(0, ...planned.map(t => t.version || 0));
    // Plan geçmişte kaldıysa bugünden sonraki ilk boş sürüme kadar uzat
    const windows = buildSprintWindows(project, maxVersion + MAX_EXTRA_SPRINTS);
    const people = new Map((ctx.people || []).map(p => [fold(`${p.firstName} ${p.lastName}`), p]));
    const cal = calibrator(history);

    // Birim kapasitesi: kalan iş günleri × Σ (katılım × izin payı)
    const capacityOf = (start: Date, end: Date): number => {
        let cap = 0;
        const d = new Date(Math.max(start.getTime(), today.getTime()));
        for (; d <= end; d.setDate(d.getDate() + 1)) {
            if (!isWorkday(d)) continue;
            team.forEach(r => {
                const planned = plannedShare(r, d.getMonth(), (r.participation || 100) / 100);
                const p = people.get(fold(r.name));
                const avail = p ? effectiveCapacity(p, ctx.leaves || [], d.getFullYear(), d.getMonth() + 1) / (p.availableAA || 1) : 1;
                cap += planned * Math.min(1, avail);
            });
        }
        return cap;
    };

    // Açık işin efor dağılımı; simülasyondaki kurallar (tek değer → kalibrasyon ya da
    // varsayılan belirsizlik, tahmin yoksa benzer kapanmış kayıtların gerçek eforları)
    const distOf = (t: Task): { dist: EffortDist; ratios?: number[]; share: number } | null => {
        // Süreçteki iş: kabaca yarısı kalmış sayılır
        const share = t.status === TaskStatus.InProgress ? 0.5 : 1;
        const range = estimateRange(t);
        if (!range) {
            const ref = estimateFromHistory(
                { name: t.name, notes: t.notes, issueType: t.issueType, unit: t.unit, priority: t.priority, labels: t.labels, workPackageId: t.workPackageId, projectId: project.id },
                history,
                { visibleProjectIds: ctx.visibleProjectIds },
            );
            return ref.effortSamples.length >= MIN_REFS ? { dist: { kind: 'samples', values: ref.effortSamples }, share } : null;
        }
        const { best, likely: mode, worst } = range;
        const c = GROUNDED.has(t.estimateSource || '') ? null : cal({ unit: t.unit, issueType: t.issueType });
        const dist: EffortDist = worst > best ? { kind: 'pert', min: best, mode, max: worst } : c ? { kind: 'fixed', value: mode } : { kind: 'pert', min: mode * DEFAULT_SPREAD.low, mode, max: mode * DEFAULT_SPREAD.high };
        return { dist, ratios: c?.ratios, share };
    };
    const openInUnit = planned.filter(t => (t.version || 0) > 0 && t.status !== TaskStatus.Done && fold(t.unit) === unit);

    const iterations = ctx.iterations ?? 2000;
    const rows: SprintFitRow[] = [];
    // Bitmiş sürümlerde kalan açık işler ilk açık sürüme devreder
    let carried: Task[] = [];
    for (let i = 0; i < windows.length && rows.length < MAX_ROWS; i++) {
        const w = windows[i];
        const v = i + 1;
        const own = openInUnit.filter(t => t.version === v);
        if (w.end < today) { carried = carried.concat(own); continue; }
        const open = carried.concat(own);
        carried = [];
        const dists = open.map(distOf).filter((x): x is NonNullable<typeof x> => !!x);
        const capacity = capacityOf(w.start, w.end);
        const committed = dists.reduce((s, d) => s + distMean(d.dist) * d.share * (d.ratios ? d.ratios.reduce((a, b) => a + b, 0) / d.ratios.length : 1), 0);
        let probability: number | null = null;
        if (capacity > 0) {
            const rng = mulberry32(seedFrom(`${project.id}|${v}|${record.unit}`));
            let hits = 0;
            for (let it = 0; it < iterations; it++) {
                let load = sample(record.effort, rng) * (record.calibration?.length ? pick(record.calibration, rng) : 1);
                dists.forEach(d => { load += sample(d.dist, rng) * d.share * (d.ratios ? pick(d.ratios, rng) : 1); });
                if (load <= capacity) hits++;
            }
            probability = hits / iterations;
        }
        rows.push({
            version: v,
            label: ctx.sprintName?.(v) || `Sürüm ${v}`,
            start: w.start,
            end: w.end,
            capacity: Math.round(capacity * 10) / 10,
            committed: Math.round(committed * 10) / 10,
            probability,
            isNew: v > maxVersion,
        });
        if (v > maxVersion) break; // planın sonuna yalnız bir yeni sürüm önerilir
    }

    const firstAt = (p: number) => rows.find(r => r.probability !== null && r.probability >= p);
    const strong = firstAt(FIT_TARGET);
    const risky = strong ? undefined : firstAt(0.5);
    return {
        unit: record.unit,
        rows,
        recommended: (strong || risky)?.version ?? null,
        recommendedRisky: !strong && !!risky,
        unitHasTeam: team.length > 0,
    };
};
