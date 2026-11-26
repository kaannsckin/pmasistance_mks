import { Leave, Person, Project, ReleaseMilestone, ReleasePlan, Task, TaskStatus } from '../../types';
import { capacityModel } from './capacity';
import type { PlanChange } from './planOptimizer';
import { calculatePertFuzzyPert } from '../timeline';
import { buildSprintWindows, SprintWindow } from '../taskToAllocation';
import { sprintCalendar } from '../sprintCalendar';
import { isInSprint, lastSprintOf, sprintSpanOf } from '../sprintSpan';

/**
 * Plan panosu motoru: sürüm (manuel sürüm planı) × kilometre taşı × sprint.
 *
 * Görevin sprinti doğrudan görevde (`version`) durur: pano, yol haritası,
 * otomatik plan ve Jira eşitlemesi aynı alanı okur ve yazar. Sürüm planı
 * yalnız kapsamı (hangi görevler) ve kilometre taşlarını (ad, hedef tarih,
 * görevler) tutar. Sprint pencereleri projenin sprint takviminden gelir.
 *
 * Saf fonksiyonlar; arayüz ve testler aynı hesabı kullanır.
 */

export const UNASSIGNED = 'Atanmamış';
/** Hız için bakılan biten sprint sayısı */
export const VELOCITY_WINDOW = 6;

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const round1 = (n: number) => Math.round(n * 10) / 10;
const tr = (n: number) => round1(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export const effortOf = (t: Pick<Task, 'time'>): number => calculatePertFuzzyPert(t.time).pert;
const isOpen = (t: Task) => t.status !== TaskStatus.Done;
const PRIORITY_RANK: Record<Task['priority'], number> = { Blocker: 0, High: 1, Medium: 2, Low: 3 };

/** Planın kapsamındaki görevler (proje görevleriyle eşleşen satırlar, plan sırasıyla) */
export const planTasks = (project: Pick<Project, 'tasks'>, plan: Pick<ReleasePlan, 'items'>): Task[] => {
    const byId = new Map(project.tasks.map(t => [t.id, t]));
    const seen = new Set<string>();
    return plan.items.flatMap(i => {
        const t = i.sourceTaskId && !i.excluded ? byId.get(i.sourceTaskId) : undefined;
        if (!t || seen.has(t.id)) return [];
        seen.add(t.id);
        return [t];
    });
};

/** Görevin kilometre taşı (plan satırı üzerinden) */
export const milestoneOfTask = (plan: Pick<ReleasePlan, 'items' | 'milestones'>, taskId: string): ReleaseMilestone | undefined => {
    const item = plan.items.find(i => i.sourceTaskId === taskId);
    return item ? plan.milestones.find(m => m.itemIds.includes(item.id)) : undefined;
};

/** Kilometre taşları hedef tarih sırasıyla (tarihsizler sonda, girildiği sırayla) */
export const orderedMilestones = (plan: Pick<ReleasePlan, 'milestones'>): ReleaseMilestone[] =>
    plan.milestones.map((m, i) => ({ m, i }))
        .sort((a, b) => (a.m.targetDate || '9999').localeCompare(b.m.targetDate || '9999') || a.i - b.i)
        .map(x => x.m);

/** Bugünün sprinti: geliştirme penceresi bugünü içeren; aradaysa sonraki; proje başlamadıysa 1 */
export const sprintWindowsUntil = (project: Project, now: Date, minCount: number): { windows: SprintWindow[]; current: number } => {
    let count = Math.max(minCount, 8);
    for (let guard = 0; guard < 8; guard++) {
        const windows = buildSprintWindows(project, count);
        const t = dayStart(now);
        const hit = windows.find(w => t <= dayStart(w.end));
        if (hit) return { windows, current: hit.sprint };
        count *= 2;
    }
    const windows = buildSprintWindows(project, count);
    return { windows, current: count };
};

// ------------------------------------------------------------------ pano

export interface BoardSprint {
    version: number;
    start: Date;
    end: Date;
    testEnd: Date;
    past: boolean;
    current: boolean;
    /** Ekip geliştirme kapasitesi (gün) */
    capacity: number;
    /** Projedeki tüm açık görevlerin yükü (gün) */
    load: number;
    /** Bu sürümün görevlerinin yükü (gün) */
    planLoad: number;
    /** Kişi bazında kapasite aşımı */
    overloaded: { resource: string; load: number; capacity: number }[];
}

export type MilestoneStatus = 'ok' | 'risk' | 'late' | 'unplanned' | 'empty';

export interface BoardRow {
    /** Taşsız satırda undefined */
    milestone?: ReleaseMilestone;
    tasks: Task[];
    effort: number;
    done: number;
    /** Tahmini bitiş: görevlerin son sprintinin sonu (planlanmamış iş varsa yok) */
    forecastEnd?: string;
    forecastSprint?: number;
    status: MilestoneStatus;
    /** Kısa gerekçe (ör. "hedeften 6 gün geç", "2 görev planlanmamış") */
    note: string;
}

export interface Velocity {
    /** Son biten sprintlerde ortalama tamamlanan efor (gün/sprint) */
    perSprint: number;
    sprints: number;
    /** Bu sürümün kalan eforu (gün) */
    remaining: number;
    /** Hızla kalan sprint sayısı ve tahmini bitiş */
    sprintsLeft?: number;
    forecastEnd?: string;
}

export interface PlanBoard {
    sprints: BoardSprint[];
    current: number;
    rows: BoardRow[];
    /** Kapsamda olup sprinti olmayan açık görevler */
    pool: Task[];
    /** Biten sprintlerde kalmış, bitmemiş görevler (devir adayı) */
    carryover: Task[];
    velocity: Velocity;
    total: { tasks: number; open: number; effort: number; remaining: number };
}

/** Sprintteki kişi yükleri (açık görevler; sprinte yayılan görev eşit bölünür) */
const sprintLoads = (tasks: Task[], version: number): Map<string, number> => {
    const m = new Map<string, number>();
    tasks.filter(t => isOpen(t) && t.includeInSprints !== false && isInSprint(t, version)).forEach(t => {
        const who = t.resourceName || UNASSIGNED;
        m.set(who, (m.get(who) || 0) + effortOf(t) / sprintSpanOf(t));
    });
    return m;
};

export interface BoardOptions {
    extraSprints?: number;
    /** İzinler ve kişi eşleşmesi için veri havuzu (verilmezse izin düşülmez) */
    people?: Person[];
    leaves?: Leave[];
}

export const buildPlanBoard = (project: Project, plan: ReleasePlan, now: Date = new Date(), opts: BoardOptions = {}): PlanBoard => {
    const scope = planTasks(project, plan);
    const lastUsed = Math.max(0, ...scope.map(lastSprintOf));
    const { windows, current } = sprintWindowsUntil(project, now, 1);
    // Gösterilen sprintler: kapsamın ilk sprintinden (ya da bugünden) son sprintine + boş sprintler
    const first = Math.max(1, Math.min(current, ...scope.filter(t => (t.version || 0) > 0).map(t => t.version)));
    const lastShown = Math.max(current + 3, lastUsed) + (opts.extraSprints || 0);
    const all = buildSprintWindows(project, Math.max(lastShown, windows.length));
    // Kapasite: tatil ve izinler düşülmüş tam sprint (tampon yok); optimizasyon aynı modeli kullanır
    const cap = capacityModel({ project, people: opts.people, leaves: opts.leaves });
    const names = [...new Set(project.resources.map(r => r.name))];
    const today = dayStart(now);

    const sprints: BoardSprint[] = all.filter(w => w.sprint >= first && w.sprint <= lastShown).map(w => {
        const loads = sprintLoads(project.tasks, w.sprint);
        const planLoads = sprintLoads(scope, w.sprint);
        const capOf = (who: string) => cap(w, who).full;
        return {
            version: w.sprint, start: w.start, end: w.end, testEnd: w.testEnd,
            past: dayStart(w.end) < today, current: w.sprint === current,
            capacity: round1(names.reduce((sum, n) => sum + capOf(n), 0)),
            load: round1([...loads.values()].reduce((s, x) => s + x, 0)),
            planLoad: round1([...planLoads.values()].reduce((s, x) => s + x, 0)),
            // Atanmamış işler kişi kapasitesine yazılmaz; ayrıca uyarı olarak gösterilir
            overloaded: [...loads.entries()]
                .filter(([resource]) => resource !== UNASSIGNED)
                .map(([resource, load]) => ({ resource, load: round1(load), capacity: round1(capOf(resource)) }))
                .filter(x => x.load > x.capacity + 1e-9),
        };
    });
    const sprintEnd = (v: number) => all.find(w => w.sprint === v)?.end;
    const overloadedSprints = new Set(sprints.filter(s => s.overloaded.length).map(s => s.version));

    const carryover = scope.filter(t => isOpen(t) && (t.version || 0) > 0 && lastSprintOf(t) < current);
    const rowOf = (milestone: ReleaseMilestone | undefined, tasks: Task[]): BoardRow => {
        const open = tasks.filter(isOpen);
        const effort = round1(tasks.reduce((s, t) => s + effortOf(t), 0));
        const done = tasks.length - open.length;
        if (!tasks.length) return { milestone, tasks, effort, done, status: 'empty', note: 'Görev yok' };
        const unplanned = open.filter(t => !(t.version > 0));
        const lastSprint = Math.max(0, ...tasks.map(lastSprintOf));
        const end = lastSprint > 0 ? sprintEnd(lastSprint) : undefined;
        const forecastEnd = !unplanned.length && end ? iso(end) : undefined;
        const base = { milestone, tasks, effort, done, ...(forecastEnd ? { forecastEnd, forecastSprint: lastSprint } : {}) };
        if (!open.length) return { ...base, status: 'ok', note: 'Tamamlandı' };
        if (unplanned.length) return { ...base, status: 'unplanned', note: `${unplanned.length} görev sprinte yerleşmemiş` };
        const target = milestone?.targetDate;
        if (target && forecastEnd && forecastEnd > target) {
            const late = Math.round((new Date(`${forecastEnd}T00:00:00`).getTime() - new Date(`${target}T00:00:00`).getTime()) / DAY);
            return { ...base, status: 'late', note: `Hedeften ${late} gün geç` };
        }
        const stale = open.filter(t => lastSprintOf(t) < current).length;
        const crowded = open.some(t => Array.from({ length: sprintSpanOf(t) }, (_, k) => t.version + k).some(v => overloadedSprints.has(v)));
        if (stale || crowded) return { ...base, status: 'risk', note: stale ? `${stale} görev biten sprintte kalmış` : 'Sprintlerinden birinde kapasite aşımı var' };
        return { ...base, status: 'ok', note: target ? 'Hedefe yetişiyor' : 'Hedef tarih yok' };
    };

    const ms = orderedMilestones(plan);
    const inMilestone = new Set<string>();
    const rows: BoardRow[] = ms.map(m => {
        const tasks = scope.filter(t => {
            const own = milestoneOfTask(plan, t.id);
            return own?.id === m.id;
        });
        tasks.forEach(t => inMilestone.add(t.id));
        return rowOf(m, tasks);
    });
    const loose = scope.filter(t => !inMilestone.has(t.id));
    if (loose.length || !rows.length) rows.push(rowOf(undefined, loose));

    // Hız: son biten sprintlerde tamamlanan efor (tüm proje: ekibin gerçek ritmi)
    const ended = all.filter(w => w.sprint < current).slice(-VELOCITY_WINDOW);
    const doneBySprint = ended.map(w => project.tasks.filter(t => t.status === TaskStatus.Done && lastSprintOf(t) === w.sprint).reduce((s, t) => s + effortOf(t), 0));
    const perSprint = ended.length ? round1(doneBySprint.reduce((a, b) => a + b, 0) / ended.length) : 0;
    const remaining = round1(scope.filter(isOpen).reduce((s, t) => s + effortOf(t), 0));
    let velocity: Velocity = { perSprint, sprints: ended.length, remaining };
    if (perSprint > 0 && remaining > 0) {
        const sprintsLeft = Math.ceil(remaining / perSprint);
        const target = buildSprintWindows(project, current + sprintsLeft - 1).at(-1);
        velocity = { ...velocity, sprintsLeft, ...(target ? { forecastEnd: iso(target.end) } : {}) };
    }

    return {
        sprints, current, rows,
        pool: scope.filter(t => isOpen(t) && !(t.version > 0)),
        carryover,
        velocity,
        total: { tasks: scope.length, open: scope.filter(isOpen).length, effort: round1(scope.reduce((s, t) => s + effortOf(t), 0)), remaining },
    };
};

// ------------------------------------------------------------------ devir

/** Sprint değişikliği (optimizasyonun PlanChange'i; devirde yalnız sprint değişir) */
export type SprintChange = PlanChange;

/** Devir: biten sprintte kalmış açık görevleri bugünkü sprinte taşır */
export const carryoverChanges = (board: PlanBoard): SprintChange[] =>
    board.carryover.map(t => ({ taskId: t.id, from: t.version || 0, to: board.current }));
