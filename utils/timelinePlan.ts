import { Project, Task, TaskStatus } from '../types';
import { calculatePertFuzzyPert } from './timeline';
import { buildSprintWindows } from './taskToAllocation';

/**
 * Zaman çizelgesi (sürüm planı) hesapları. Klasik sürüm panosuyla aynı
 * kurallar: sürüm = hafta × 5 iş günü, ardından test dönemi; kapasite birim
 * bazında efor günü (net iş günü × katılım), yük = PERT eforu. Katılım oranı
 * yalnız kapasitede bir kez sayılır: %50 katılımlı kişinin 6 günlük işi 6 gün
 * yüktür, kişinin 11 günlük sürümdeki kapasitesi 5,5 gündür.
 */

export interface LaneUnitLoad {
    unit: string;
    load: number; // gün
    capacity: number; // gün
}

export interface SprintLane {
    version: number; // 0 = Havuz
    tasks: Task[];
    done: number;
    start?: Date;
    end?: Date;
    testStart?: Date;
    testEnd?: Date;
    load: number;
    capacity: number;
    units: LaneUnitLoad[];
    /** Kapasitesi aşılan birimler */
    overloaded: string[];
}

const UNASSIGNED = 'Atanmamış';

/** Görevin sürüme yüklediği efor (gün): PERT. Katılım kapasite tarafında sayılır. */
export const taskLoadDays = (task: Task): number => calculatePertFuzzyPert(task.time).pert;

/** Bir sürümde birim başına kapasite (gün): (hafta×5 − test günü) × katılım */
export const unitCapacities = (project: Project): Map<string, number> => {
    const weeks = project.settings.sprintDuration || 3;
    const testDays = project.settings.globalTestDays || 4;
    const net = Math.max(0, weeks * 5 - testDays);
    const caps = new Map<string, number>();
    project.resources.forEach(r => {
        const unit = r.unit || UNASSIGNED;
        caps.set(unit, (caps.get(unit) || 0) + net * ((r.participation || 0) / 100));
    });
    return caps;
};

/**
 * Havuz + sürüm şeritleri. Sürüm planına dahil olmayan görevler gösterilmez.
 * `extraLanes`: henüz görevi olmayan, kullanıcının eklediği boş sürümler.
 */
export const buildLanes = (project: Project, extraLanes = 0): SprintLane[] => {
    const planned = project.tasks.filter(t => t.includeInSprints !== false);
    const maxVersion = Math.max(0, ...planned.map(t => t.version || 0)) + extraLanes;
    const windows = buildSprintWindows(project, maxVersion);
    const caps = unitCapacities(project);

    return Array.from({ length: maxVersion + 1 }, (_, v) => {
        const tasks = planned.filter(t => (t.version || 0) === v);
        const loads = new Map<string, number>();
        tasks.forEach(t => {
            const unit = t.unit || UNASSIGNED;
            loads.set(unit, (loads.get(unit) || 0) + taskLoadDays(t));
        });
        const unitNames = v === 0 ? [...loads.keys()] : [...new Set([...caps.keys(), ...loads.keys()])];
        const units = unitNames
            .map(unit => ({ unit, load: round1(loads.get(unit) || 0), capacity: v === 0 ? 0 : round1(caps.get(unit) || 0) }))
            .filter(u => u.load > 0 || u.capacity > 0)
            .sort((a, b) => b.load - a.load || a.unit.localeCompare(b.unit, 'tr'));
        const w = v > 0 ? windows[v - 1] : undefined;
        return {
            version: v,
            tasks,
            done: tasks.filter(t => t.status === TaskStatus.Done).length,
            start: w?.start,
            end: w?.end,
            testStart: w?.testStart,
            testEnd: w?.testEnd,
            load: round1(units.reduce((s, u) => s + u.load, 0)),
            capacity: round1(units.reduce((s, u) => s + u.capacity, 0)),
            units,
            overloaded: v === 0 ? [] : units.filter(u => u.load > u.capacity + 1e-9).map(u => u.unit),
        };
    });
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Plan aralığı: ilk sürüm başı → son test bitişi */
export const laneRange = (lanes: SprintLane[]): { start: Date; end: Date } | null => {
    const dated = lanes.filter(l => l.start && l.testEnd);
    if (!dated.length) return null;
    return { start: dated[0].start!, end: dated[dated.length - 1].testEnd! };
};

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Tarihin aralıktaki konumu (0-100); aralık dışındaysa null */
export const positionPct = (date: Date, range: { start: Date; end: Date }): number | null => {
    const total = dayStart(range.end) - dayStart(range.start) + DAY;
    const at = dayStart(date) - dayStart(range.start);
    if (at < 0 || at >= total) return null;
    return (at / total) * 100;
};

/** Aralık içindeki parçanın sol kenarı ve genişliği (yüzde) */
export const segmentPct = (from: Date, to: Date, range: { start: Date; end: Date }): { left: number; width: number } => {
    const total = dayStart(range.end) - dayStart(range.start) + DAY;
    const left = ((dayStart(from) - dayStart(range.start)) / total) * 100;
    const width = ((dayStart(to) - dayStart(from) + DAY) / total) * 100;
    return { left, width };
};

/** Bugünün düştüğü sürüm (test dönemi dahil); yoksa null */
export const currentLaneVersion = (lanes: SprintLane[], now: Date = new Date()): number | null => {
    const t = dayStart(now);
    const hit = lanes.find(l => l.start && l.testEnd && dayStart(l.start) <= t && t <= dayStart(l.testEnd));
    return hit ? hit.version : null;
};
