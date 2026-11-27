import { Leave, Person, PlanRules, Project, ProjectSettings, Task, TaskStatus } from '../../types';
import { buildSprintWindows } from '../taskToAllocation';
import { isUnassigned } from './jiraPeople';
import { remainingEffort } from './capacity';
import { isWorkday } from './workdays';

/**
 * Darboğaz planı: haftalık sürüm ritminde kişi ve ekip kapasitesine göre plan.
 *
 *  - Her hafta geliştirme, cuma sürüm. Sürüme giren görev sonraki hafta test
 *    ekibince (varsayılan "Destek" birimi) test edilir.
 *  - Test eforu = geliştirme eforu × test oranı (varsayılan %20), saat
 *    kademelerine (2 / 4 / 6) yuvarlanır. Test haftası o hafta en boş test
 *    ekibi üyesine yazılır.
 *  - Bulgu düzeltme: test haftasında aynı saat kadar ekibin bulgu sorumlusuna
 *    yazılır (geliştirme ekiplerinden birer kişi; seçilmezse açık yükü en az olan).
 *  - Kapasite = haftanın iş günü (TR tatilleri düşülür) × katılım × (1 − o ayın
 *    izin AA'sı) × odak katsayısı. Kişi en yüksek yük oranına (varsayılan %100)
 *    kadar yüklenebilir; %100'ü aşan kısım fazla mesaidir.
 *  - Hedef tarih: hedefin düştüğü hafta yalnız son sürümün testi ve düzeltmesi
 *    içindir; son sürüm bir önceki haftanın cumasıdır.
 *
 * Senaryolar:
 *  - current: görev atandığı kişide kalır (atanmamış iş ekipte en uygun kişiye).
 *  - balanced: başlamamış işler ekip içinde en erken bitirebilecek kişiye
 *    kaydırılır; tek kişiye sığmayan büyük iş en çok 3 kişiye bölünür.
 *  - capacity: dengeli plana, hedefe yetişene dek ek kişi eklenir; ekiplerin
 *    ne kadar ek kapasiteye ihtiyacı olduğu (geliştirme / test / bulgu) çıkar.
 */

export type BottleneckScenario = 'current' | 'balanced' | 'capacity';
export type LoadKind = 'dev' | 'test' | 'fix';
export type PersonRole = 'dev' | 'test' | 'fixer';

export interface BottleneckSettings {
    /** Planın başladığı gün (ISO). Haftalar bu günün pazartesisinden başlar; önceki günler sayılmaz. */
    startDate: string;
    /** Hedef bitiş (ISO), ör. 2026-12-31 */
    targetDate: string;
    /** Odak katsayısı (0,5–1) */
    focus: number;
    /** Test eforu oranı (geliştirme eforuna göre) */
    testRatio: number;
    /** Test / bulgu saat kademeleri */
    testHourSteps: number[];
    /** Test ekibinin birimi; boşsa test adımı yok */
    testUnit: string;
    /** Birim → bulgu sorumlusu; boş değer otomatik seçim */
    fixers: Record<string, string>;
    /** Bulgu sorumlusu atanacak birimler; boşsa test ekibi ve "Genel" dışındaki çok kişili birimler */
    fixerUnits?: string[];
    /** Jira kalan süresini kullan */
    useRemaining?: boolean;
    /** Taşmayı göstermek için hesaplanan hafta sayısı */
    horizonWeeks?: number;
    /** Kapasite senaryosunda hedefe yetişmesi gereken en geç milestone (ör. 1 → Gib-0 ve Gib-1); yoksa tümü */
    scopeMilestone?: number;
    /** Kişi başı en yüksek yük (%, 50–200); 100 üstü fazla mesai. Varsayılan 100. */
    maxLoad?: number;
    /** Kişiye özel en yüksek yük (%) */
    personMaxLoad?: Record<string, number>;
}

export interface PlanWeek {
    index: number;
    start: Date;
    end: Date;
    /** Sayılan iş günü (tatil ve plan başlangıcından önceki günler hariç) */
    workdays: number;
    afterTarget: boolean;
}

export interface PersonRow {
    name: string;
    unit: string;
    role: PersonRole;
    /** Hedefe yetişmek için eklenen sanal kişi */
    virtual: boolean;
    participation: number;
    /** Normal kapasite (gün, mesai hariç) */
    capacity: number[];
    /** Bu kişinin en yüksek yük oranı (1 = %100) */
    maxLoad: number;
    /** Hedef haftası dahil fazla mesai (gün) */
    overtime: number;
    load: Record<LoadKind, number[]>;
    /** Tüm ufuktaki iş (gün) */
    demand: number;
    /** Hedef haftası dahil kapasite (gün) */
    targetCapacity: number;
    /** Hedef sonrasına kalan iş (gün) */
    spill: number;
    /** İşinin bittiği hafta (yoksa -1) */
    lastWeek: number;
}

export interface TeamRow {
    unit: string;
    members: string[];
    capacity: number[];
    load: number[];
    demand: number;
    targetCapacity: number;
    spill: number;
}

export interface TaskPlan {
    taskId: string;
    unit: string;
    /** Planlanan kişi(ler); bölünmüş işte birden fazla */
    people: string[];
    /** Görevin kayıttaki sorumlusu */
    owner: string;
    days: number;
    testHours: number;
    devStart: number;
    /** Sürüm haftası (cuma); planlanamadıysa -1 */
    release: number;
    testWeek: number;
    fixer: string;
    /** Test ve bulgu dahil bittiği hafta */
    doneWeek: number;
    fits: boolean;
    reason: string;
}

export interface Reassignment {
    taskId: string;
    from: string;
    to: string[];
    days: number;
    /** Kaç hafta erken biter (yaklaşık) */
    gainWeeks: number;
}

export interface ExtraCapacity {
    unit: string;
    role: PersonRole;
    count: number;
}

export interface BottleneckResult {
    scenario: BottleneckScenario;
    weeks: PlanWeek[];
    /** Hedefin düştüğü hafta (son sürümün testi) */
    targetWeek: number;
    /** Son sürüm haftası */
    lastReleaseWeek: number;
    people: PersonRow[];
    teams: TeamRow[];
    tasks: TaskPlan[];
    /** Efor girilmemiş açık görevler (yük olarak sayılmaz) */
    unestimated: string[];
    reassignments: Reassignment[];
    extra: ExtraCapacity[];
    fixers: Record<string, string>;
    /** Hafta → kişi → görev payları (ısı haritası hücre ayrıntısı) */
    cells: Map<string, { taskId: string; days: number; kind: LoadKind }[]>;
    warnings: string[];
}

export const DEFAULT_TEST_UNIT = 'Destek';
export const DEFAULT_BOTTLENECK: Omit<BottleneckSettings, 'startDate' | 'targetDate'> = {
    focus: 0.85,
    testRatio: 0.2,
    testHourSteps: [2, 4, 6],
    testUnit: DEFAULT_TEST_UNIT,
    fixers: {},
    horizonWeeks: 26,
};

const HOURS = 8;
const EPS = 1e-6;
const DAY = 86_400_000;
const PRIO: Record<string, number> = { Blocker: 0, High: 1, Medium: 2, Low: 3 };
const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const round2 = (n: number) => Math.round(n * 100) / 100;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const mondayOf = (d: Date) => { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const cellKey = (week: number, person: string) => `${week}|${person}`;

/** Varsayılan plan başlangıcı: hafta içiyse bugün, cuma ve hafta sonuysa sonraki pazartesi */
export const defaultStartDate = (today = new Date()): string => {
    const d = dayStart(today);
    const dow = d.getDay();
    if (dow === 5 || dow === 6 || dow === 0) d.setDate(d.getDate() + ((8 - dow) % 7 || 7));
    return isoOf(d);
};
/** Varsayılan hedef: sonraki ayın son günü */
export const defaultTargetDate = (today = new Date()): string => isoOf(new Date(today.getFullYear(), today.getMonth() + 2, 0));
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Test / bulgu saati: oran × efor, en yakın kademeye */
export const testHoursFor = (devDays: number, ratio: number, steps: number[]): number => {
    const s = [...steps].filter(x => x > 0).sort((a, b) => a - b);
    if (!s.length || devDays <= 0 || ratio <= 0) return 0;
    const h = devDays * HOURS * ratio;
    return s.reduce((best, x) => (Math.abs(x - h) < Math.abs(best - h) ? x : best), s[0]);
};

/** Milestone sırası: etiketteki ilk sayı (Milestone-Gib-0 → 0); yoksa en sona */
export const milestoneRank = (labels: string[] | undefined): number => {
    let best = 99;
    (labels || []).forEach(l => {
        const m = /milestone\D*(\d+)/i.exec(l);
        if (m) best = Math.min(best, Number(m[1]));
    });
    return best;
};

const speedRank = (labels: string[] | undefined): number => {
    const f = (labels || []).map(fold);
    return f.some(l => l.includes('hizli_aksiyon') || l.includes('hizli aksiyon')) ? 0 : f.some(l => l.includes('yavas_aksiyon') || l.includes('yavas aksiyon')) ? 2 : 1;
};

export const taskOrder = (a: Task, b: Task): number =>
    milestoneRank(a.labels) - milestoneRank(b.labels)
    || (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2)
    || (a.status === TaskStatus.InProgress ? 0 : 1) - (b.status === TaskStatus.InProgress ? 0 : 1)
    || speedRank(a.labels) - speedRank(b.labels)
    || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
    || ((a.version || 0) || 9999) - ((b.version || 0) || 9999)
    || (a.jiraId || a.name).localeCompare(b.jiraId || b.name, 'tr');

interface Member { name: string; unit: string; participation: number; virtual: boolean; personId?: string }

interface Ctx {
    weeks: PlanWeek[];
    members: Member[];
    byUnit: Map<string, string[]>;
    /** Normal kapasite */
    cap: Map<string, number[]>;
    /** Planlamada kullanılabilir üst sınır (fazla mesai dahil) */
    limit: Map<string, number[]>;
    settings: BottleneckSettings;
    targetWeek: number;
    lastRelease: number;
}

const buildWeeks = (s: BottleneckSettings): { weeks: PlanWeek[]; targetWeek: number } => {
    const from = parseDay(s.startDate);
    const target = parseDay(s.targetDate);
    const first = mondayOf(from);
    const horizon = Math.max(4, Math.min(80, s.horizonWeeks ?? 26));
    const minWeeks = Math.ceil((target.getTime() - first.getTime()) / (7 * DAY)) + 1;
    const n = Math.max(horizon, minWeeks + 4);
    const weeks: PlanWeek[] = [];
    for (let i = 0; i < n; i++) {
        const start = new Date(first); start.setDate(first.getDate() + i * 7);
        const end = new Date(start); end.setDate(start.getDate() + 4);
        let workdays = 0;
        for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) if (d >= from && isWorkday(d)) workdays++;
        weeks.push({ index: i, start, end, workdays, afterTarget: start > target });
    }
    const targetWeek = Math.max(0, weeks.filter(w => w.start <= target).length - 1);
    return { weeks, targetWeek };
};

const personCapacity = (m: Member, weeks: PlanWeek[], s: BottleneckSettings, from: Date, leaves: Leave[]): number[] => {
    const focus = Math.max(0.3, Math.min(1, s.focus));
    const leaveRatio = (y: number, mo: number) => m.personId
        ? Math.max(0, Math.min(1, leaves.filter(l => l.personId === m.personId && l.year === y && l.month === mo).reduce((a, l) => a + (l.aa || 0), 0)))
        : 0;
    return weeks.map(w => {
        let days = 0;
        for (const d = new Date(w.start); d <= w.end; d.setDate(d.getDate() + 1)) {
            if (d < from || !isWorkday(d)) continue;
            days += 1 - leaveRatio(d.getFullYear(), d.getMonth() + 1);
        }
        return days * (m.participation / 100) * focus;
    });
};

interface TaskInfo { task: Task; unit: string; owner: string; days: number; testHours: number; fixable: boolean; movable: boolean }

const run = (ctx: Ctx, infos: TaskInfo[], fixers: Record<string, string[]>, balance: boolean, maxSplit: number) => {
    const { weeks, byUnit, settings, lastRelease } = ctx;
    const W = weeks.length;
    const left = new Map([...ctx.limit].map(([k, v]) => [k, [...v]]));
    const cells = new Map<string, { taskId: string; days: number; kind: LoadKind }[]>();
    const load = new Map<string, Record<LoadKind, number[]>>();
    const loadOf = (n: string) => {
        let l = load.get(n);
        if (!l) { l = { dev: Array(W).fill(0), test: Array(W).fill(0), fix: Array(W).fill(0) }; load.set(n, l); }
        return l;
    };
    const book = (n: string, w: number, x: number, kind: LoadKind, taskId: string) => {
        left.get(n)![w] -= x;
        loadOf(n)[kind][w] += x;
        const k = cellKey(w, n);
        const list = cells.get(k) || [];
        const same = list.find(c => c.taskId === taskId && c.kind === kind);
        if (same) same.days += x; else list.push({ taskId, days: x, kind });
        cells.set(k, list);
    };
    /** Kişinin `need` günü `start` haftasından itibaren bitireceği hafta (yazmadan) */
    const finishOf = (n: string, need: number, start: number): number => {
        const l = left.get(n)!;
        for (let w = start; w < W; w++) { need -= Math.min(need, Math.max(0, l[w])); if (need <= EPS) return w; }
        return W + 1;
    };
    /** Kişinin kapasitesinden sırayla düşer; [ilk hafta, son hafta] ya da sığmazsa son = -1 */
    const consumeSpan = (n: string, need: number, start: number, kind: LoadKind, taskId: string): [number, number] => {
        const l = left.get(n)!;
        let first = -1, last = -1;
        for (let w = start; w < W && need > EPS; w++) {
            const take = Math.min(need, Math.max(0, l[w]));
            if (take > EPS) { book(n, w, take, kind, taskId); need -= take; last = w; if (first < 0) first = w; }
        }
        return [first, need > EPS ? -1 : last];
    };
    const consume = (n: string, need: number, start: number, kind: LoadKind, taskId: string): number => consumeSpan(n, need, start, kind, taskId)[1];
    /** Havuz: her hafta en boş kişiden; sığmazsa sonraki hafta */
    const consumePool = (pool: string[], need: number, start: number, kind: LoadKind, taskId: string): number => {
        let last = -1;
        for (let w = start; w < W && need > EPS; w++) {
            for (const n of [...pool].sort((a, b) => left.get(b)![w] - left.get(a)![w])) {
                const take = Math.min(need, Math.max(0, left.get(n)![w]));
                if (take > EPS) { book(n, w, take, kind, taskId); need -= take; last = w; }
                if (need <= EPS) break;
            }
        }
        return need > EPS ? -1 : last;
    };

    const fixerSet = new Set(Object.values(fixers).flat());
    const testers = new Set(byUnit.get(settings.testUnit) || []);
    const plans: TaskPlan[] = [];
    const reassignments: Reassignment[] = [];
    const releaseOf = new Map<string, number>();
    // Öncül sırası korunarak öncelik sırası
    const ids = new Set(infos.map(i => i.task.id));
    const pending = [...infos];
    const done = new Set<string>();
    while (pending.length) {
        let idx = pending.findIndex(i => !i.task.predecessor || !ids.has(i.task.predecessor) || done.has(i.task.predecessor));
        if (idx < 0) idx = 0; // döngü: sırayla devam
        const info = pending.splice(idx, 1)[0];
        done.add(info.task.id);
        const { task, unit, owner, days } = info;
        const plan: TaskPlan = { taskId: task.id, unit, people: [owner], owner, days: round2(days), testHours: 0, devStart: -1, release: -1, testWeek: -1, fixer: '', doneWeek: -1, fits: false, reason: '' };
        plans.push(plan);
        const pred = task.predecessor ? releaseOf.get(task.predecessor) : undefined;
        if (task.predecessor && ids.has(task.predecessor) && pred === -1) { plan.reason = 'Öncülü planlanamadı'; releaseOf.set(task.id, -1); continue; }
        const start = pred !== undefined && pred >= 0 ? pred + 1 : 0;

        // Kim yapacak?
        let assignees: { name: string; part: number }[] = [{ name: owner, part: days }];
        const teamPool = (byUnit.get(unit) || []).filter(n => !fixerSet.has(n) || n === owner);
        if (info.movable && teamPool.length && (balance || !ctx.cap.has(owner))) {
            const pick = (need: number, exclude: Set<string>) => teamPool.filter(n => !exclude.has(n))
                .map(n => ({ n, w: finishOf(n, need, start) }))
                .sort((a, b) => a.w - b.w || (a.n === owner ? -1 : b.n === owner ? 1 : 0))[0];
            const single = pick(days, new Set());
            if (single) assignees = [{ name: single.n, part: days }];
            // Tek kişiye sığmıyorsa böl (dengeli senaryolarda)
            if (balance && single && single.w > lastRelease && maxSplit > 1) {
                for (let k = 2; k <= Math.min(maxSplit, teamPool.length); k++) {
                    const chosen: string[] = [];
                    let worst = -1;
                    for (let j = 0; j < k; j++) {
                        const p = pick(days / k, new Set(chosen));
                        if (!p) break;
                        chosen.push(p.n); worst = Math.max(worst, p.w);
                    }
                    if (chosen.length === k && worst < single.w) {
                        assignees = chosen.map(name => ({ name, part: days / k }));
                        if (worst <= lastRelease) break;
                    }
                }
            }
        }
        if (!ctx.cap.has(assignees[0].name)) { plan.reason = 'Sorumlunun kapasitesi yok'; releaseOf.set(task.id, -1); continue; }

        let release = -1, first = W;
        for (const a of assignees) {
            const [f, end] = consumeSpan(a.name, a.part, start, 'dev', task.id);
            if (f >= 0) first = Math.min(first, f);
            if (end < 0) { release = -1; break; }
            release = Math.max(release, end);
        }
        plan.people = assignees.map(a => a.name);
        if (plan.people.length !== 1 || plan.people[0] !== owner) reassignments.push({ taskId: task.id, from: owner, to: plan.people, days: round2(days), gainWeeks: 0 });
        plan.devStart = first === W ? start : first;
        plan.release = release;
        releaseOf.set(task.id, release);
        if (release < 0) { plan.reason = 'Plan ufkunda bitmiyor'; continue; }

        // Test ve bulgu
        if (info.fixable && testers.size && info.testHours > 0) {
            plan.testHours = info.testHours;
            const need = info.testHours / HOURS;
            const testEnd = consumePool([...testers], need, release + 1, 'test', task.id);
            plan.testWeek = testEnd;
            const pool = fixers[unit]?.length ? fixers[unit] : [plan.people[0]];
            plan.fixer = pool[0];
            const fixEnd = pool.length > 1
                ? consumePool(pool, need, Math.max(release + 1, testEnd), 'fix', task.id)
                : consume(pool[0], need, Math.max(release + 1, testEnd), 'fix', task.id);
            plan.doneWeek = testEnd < 0 || fixEnd < 0 ? -1 : Math.max(testEnd, fixEnd);
            if (plan.doneWeek < 0) plan.reason = 'Test ya da bulgu düzeltme ufukta bitmiyor';
        } else {
            plan.doneWeek = release;
        }
        const devOk = info.fixable && testers.size ? release <= lastRelease : release <= ctx.targetWeek;
        plan.fits = plan.doneWeek >= 0 && devOk && plan.doneWeek <= ctx.targetWeek;
        if (!plan.fits && !plan.reason) plan.reason = !devOk ? 'Geliştirme son sürüme yetişmiyor' : 'Test ya da bulgu düzeltme hedefe yetişmiyor';
    }
    return { plans, load, cells, reassignments };
};

export interface BottleneckInput {
    project: Pick<Project, 'tasks' | 'resources'>;
    people?: Person[];
    leaves?: Leave[];
    settings: BottleneckSettings;
    scenario: BottleneckScenario;
}

export const planBottleneck = ({ project, people = [], leaves = [], settings, scenario }: BottleneckInput): BottleneckResult => {
    const warnings: string[] = [];
    const { weeks, targetWeek } = buildWeeks(settings);
    const lastRelease = Math.max(0, targetWeek - 1);
    const from = parseDay(settings.startDate);
    const personOf = new Map(people.map(p => [fold(`${p.firstName} ${p.lastName}`), p]));

    // Ekip üyeleri
    const members: Member[] = [];
    const seen = new Map<string, Member>();
    project.resources.forEach(r => {
        if (isUnassigned(r.name)) return;
        const hit = seen.get(r.name);
        if (hit) { hit.participation += r.participation || 0; return; }
        const m: Member = { name: r.name, unit: r.unit || 'Genel', participation: r.participation || 0, virtual: false, personId: personOf.get(fold(r.name))?.id };
        seen.set(r.name, m); members.push(m);
    });

    const open = project.tasks.filter(t => t.status !== TaskStatus.Done && t.includeInSprints !== false);
    const unitOfName = new Map(members.map(m => [m.name, m.unit]));
    open.forEach(t => {
        if (!isUnassigned(t.resourceName) && !seen.has(t.resourceName)) {
            const m: Member = { name: t.resourceName, unit: t.unit || 'Genel', participation: 100, virtual: false, personId: personOf.get(fold(t.resourceName))?.id };
            seen.set(m.name, m); members.push(m); unitOfName.set(m.name, m.unit);
            warnings.push(`${t.resourceName} proje ekibinde yok; %100 katılımla ${m.unit} birimine eklendi.`);
        }
    });

    const unestimated: string[] = [];
    const infosBase: Omit<TaskInfo, 'movable'>[] = [];
    [...open].sort(taskOrder).forEach(t => {
        const days = remainingEffort(t, { useRemaining: settings.useRemaining });
        if (!(days > 0)) { unestimated.push(t.id); return; }
        const owner = isUnassigned(t.resourceName) ? '' : t.resourceName;
        const unit = (t.unit && members.some(m => m.unit === t.unit) ? t.unit : unitOfName.get(owner)) || t.unit || 'Genel';
        const isTest = unit === settings.testUnit;
        infosBase.push({ task: t, unit, owner, days, testHours: isTest ? 0 : testHoursFor(days, settings.testRatio, settings.testHourSteps), fixable: !isTest });
    });

    const byUnitOf = (ms: Member[]) => {
        const map = new Map<string, string[]>();
        ms.forEach(m => map.set(m.unit, [...(map.get(m.unit) || []), m.name]));
        return map;
    };

    // Bulgu sorumluları
    const baseByUnit = byUnitOf(members);
    const ownLoad = new Map<string, number>();
    infosBase.forEach(i => ownLoad.set(i.owner, (ownLoad.get(i.owner) || 0) + i.days));
    const fixerUnits = settings.fixerUnits?.length ? settings.fixerUnits
        : [...baseByUnit.keys()].filter(u => u !== settings.testUnit && fold(u) !== 'genel' && (baseByUnit.get(u) || []).length > 1);
    const fixers: Record<string, string> = {};
    fixerUnits.forEach(u => {
        const pool = baseByUnit.get(u) || [];
        const chosen = settings.fixers[u];
        if (chosen && pool.includes(chosen)) { fixers[u] = chosen; return; }
        const part = (n: string) => members.find(m => m.name === n)?.participation || 1;
        const best = [...pool].sort((a, b) => (ownLoad.get(a) || 0) / part(a) - (ownLoad.get(b) || 0) / part(b) || a.localeCompare(b, 'tr'))[0];
        if (best) fixers[u] = best;
    });

    const balance = scenario !== 'current';
    // Dengeli planda devam eden iş sahibinde kalır; kapasite senaryosunda ona da yardımcı eklenebilir (sahip önceliklidir).
    const infos: TaskInfo[] = infosBase.map(i => ({ ...i, movable: !i.owner || scenario === 'capacity' || (balance && i.task.status !== TaskStatus.InProgress) }));

    const loadLimit = (m: Member) => clampLoad(m.virtual ? 100 : settings.personMaxLoad?.[m.name] ?? settings.maxLoad ?? 100);
    const makeCtx = (ms: Member[]): Ctx => {
        const cap = new Map(ms.map(m => [m.name, personCapacity(m, weeks, settings, from, leaves)]));
        return {
            weeks, members: ms, byUnit: byUnitOf(ms), settings, targetWeek, lastRelease, cap,
            limit: new Map(ms.map(m => [m.name, cap.get(m.name)!.map(x => x * loadLimit(m))])),
        };
    };

    let ms = members;
    let fixerPools: Record<string, string[]> = Object.fromEntries(Object.entries(fixers).map(([u, n]) => [u, [n]]));
    let ctx = makeCtx(ms);
    let out = run(ctx, infos, fixerPools, balance, scenario === 'capacity' ? 4 : 3);
    const extra = new Map<string, ExtraCapacity>();

    if (scenario === 'capacity') {
        // Hedefe yetişmeyen işlerin darboğazına göre sanal kişi ekle. Bir kategoriye
        // eklemek art arda 3 kez yetişen işi artırmazsa o kategori doymuş sayılır.
        // Ölçüt: toplam gecikme (efor × gecikilen hafta); bir işi son sürüme çeken geliştirici,
        // iş test haftasında takılsa da gecikmeyi azaltır.
        const W0 = weeks.length;
        const inScope = new Set(infos.filter(i => settings.scopeMilestone === undefined || milestoneRank(i.task.labels) <= settings.scopeMilestone).map(i => i.task.id));
        const fitsOf = (o: typeof out) => -o.plans.reduce((a, p) => a + (p.fits || !inScope.has(p.taskId) ? 0 : p.days * (
            p.release < 0 || p.doneWeek < 0 ? W0 : Math.max(0, p.release - lastRelease) + Math.max(0, p.doneWeek - targetWeek) + 0.5)), 0);
        const saturated = new Set<string>();
        let best = { out, ctx, ms, fixerPools, extra: new Map<string, ExtraCapacity>(), fits: fitsOf(out) };
        let stale = 0;
        for (let iter = 0; iter < 60; iter++) {
            const late = out.plans.filter(p => !p.fits && inScope.has(p.taskId) && p.reason !== 'Öncülü planlanamadı');
            if (!late.length) break;
            const need = new Map<string, number>();
            late.forEach(p => {
                const k = p.release < 0 || p.release > lastRelease ? `${p.unit}|dev`
                    : p.testWeek < 0 || p.testWeek > targetWeek ? `${settings.testUnit}|test`
                    : `${p.unit}|${fixerPools[p.unit] ? 'fixer' : 'dev'}`;
                need.set(k, (need.get(k) || 0) + p.days);
            });
            const open = [...need.entries()].filter(([k]) => !saturated.has(k)).sort((a, b) => b[1] - a[1]);
            if (!open.length) break;
            const [key] = open[0];
            const [unit, role] = key.split('|') as [string, PersonRole];
            const e = extra.get(key) || { unit, role, count: 0 };
            e.count++; extra.set(key, e);
            const label = role === 'fixer' ? 'Ek bulgu' : role === 'test' ? 'Ek test' : 'Ek kaynak';
            const v: Member = { name: `${label} · ${unit} ${e.count}`, unit, participation: 100, virtual: true };
            ms = [...ms, v];
            if (role === 'fixer') fixerPools = { ...fixerPools, [unit]: [...(fixerPools[unit] || []), v.name] };
            ctx = makeCtx(ms);
            out = run(ctx, infos, fixerPools, true, 4);
            const fits = fitsOf(out);
            if (fits > best.fits) {
                best = { out, ctx, ms, fixerPools, extra: new Map([...extra].map(([k, v]) => [k, { ...v }])), fits };
                stale = 0;
            } else if (++stale >= 4) {
                saturated.add(key);
                ({ out, ctx, ms, fixerPools } = best);
                extra.clear(); best.extra.forEach((v, k) => extra.set(k, { ...v }));
                stale = 0;
            }
        }
        ({ out, ctx, ms, fixerPools } = best);
        extra.clear(); best.extra.forEach((v, k) => extra.set(k, { ...v }));
        // Fazla eklenenleri ayıkla: son eklenenden başlayarak çıkarılınca gecikme artmıyorsa çıkar
        for (const v of ms.filter(m => m.virtual).reverse()) {
            const nextMs = ms.filter(m => m !== v);
            const nextPools = Object.fromEntries(Object.entries(fixerPools).map(([u, l]) => [u, l.filter(n => n !== v.name)]));
            const nextCtx = makeCtx(nextMs);
            const nextOut = run(nextCtx, infos, nextPools, true, 4);
            if (fitsOf(nextOut) >= fitsOf(out) - EPS) {
                ms = nextMs; fixerPools = nextPools; ctx = nextCtx; out = nextOut;
                const k = `${v.unit}|${v.name.startsWith('Ek bulgu') ? 'fixer' : v.unit === settings.testUnit ? 'test' : 'dev'}`;
                const e = extra.get(k);
                if (e) { e.count--; if (!e.count) extra.delete(k); }
            }
        }
        const still = out.plans.filter(p => !p.fits && inScope.has(p.taskId)).length;
        if (still) warnings.push(`${still} görev ek kapasiteyle de hedefe yetişmiyor (öncül zinciri ya da bölünemeyecek büyüklük).`);
    }

    // Satırlar
    const fixerNames = new Set(Object.values(fixerPools).flat());
    const W = weeks.length;
    const rows: PersonRow[] = ms.map(m => {
        const cap = ctx.cap.get(m.name)!;
        const l = out.load.get(m.name) || { dev: Array(W).fill(0), test: Array(W).fill(0), fix: Array(W).fill(0) };
        const total = (w: number) => l.dev[w] + l.test[w] + l.fix[w];
        let demand = 0, spill = 0, lastWeek = -1, overtime = 0;
        for (let w = 0; w < W; w++) {
            const t = total(w); demand += t;
            if (w > targetWeek) spill += t; else overtime += Math.max(0, t - cap[w]);
            if (t > EPS) lastWeek = w;
        }
        return {
            name: m.name, unit: m.unit, virtual: m.virtual, participation: m.participation, maxLoad: loadLimit(m), overtime: round2(overtime),
            role: m.unit === settings.testUnit ? 'test' : fixerNames.has(m.name) ? 'fixer' : 'dev',
            capacity: cap.map(round2), load: { dev: l.dev.map(round2), test: l.test.map(round2), fix: l.fix.map(round2) },
            demand: round2(demand), targetCapacity: round2(cap.slice(0, targetWeek + 1).reduce((a, b) => a + b, 0)), spill: round2(spill), lastWeek,
        };
    });
    const teams: TeamRow[] = [...byUnitOf(ms).entries()].map(([unit, names]) => {
        const rs = rows.filter(r => names.includes(r.name));
        const capacity = weeks.map((_, w) => round2(rs.reduce((a, r) => a + r.capacity[w], 0)));
        const load = weeks.map((_, w) => round2(rs.reduce((a, r) => a + r.load.dev[w] + r.load.test[w] + r.load.fix[w], 0)));
        return {
            unit, members: names, capacity, load,
            demand: round2(rs.reduce((a, r) => a + r.demand, 0)),
            targetCapacity: round2(rs.reduce((a, r) => a + r.targetCapacity, 0)),
            spill: round2(rs.reduce((a, r) => a + r.spill, 0)),
        };
    }).sort((a, b) => (a.unit === settings.testUnit ? 1 : 0) - (b.unit === settings.testUnit ? 1 : 0) || b.demand - a.demand);

    // Kaydırma önerileri: yalnız gerçek kişiler arasında ve mevcut plana göre kazanç
    let reassignments: Reassignment[] = [];
    if (balance) {
        const baseCtx = makeCtx(members);
        const base = run(baseCtx, infos.map(i => ({ ...i, movable: !i.owner })), Object.fromEntries(Object.entries(fixers).map(([u, n]) => [u, [n]])), false, 1);
        const baseDone = new Map(base.plans.map(p => [p.taskId, p.doneWeek < 0 ? W : p.doneWeek]));
        const virtual = new Set(ms.filter(m => m.virtual).map(m => m.name));
        reassignments = out.reassignments
            .filter(r => r.to.every(n => !virtual.has(n)))
            .map(r => {
                const p = out.plans.find(x => x.taskId === r.taskId)!;
                return { ...r, gainWeeks: Math.max(0, (baseDone.get(r.taskId) ?? W) - (p.doneWeek < 0 ? W : p.doneWeek)) };
            });
    }

    return {
        scenario, weeks, targetWeek, lastReleaseWeek: lastRelease, people: rows, teams, tasks: out.plans,
        unestimated, reassignments, extra: [...extra.values()], fixers, cells: out.cells, warnings,
    };
};

/** Önerilen tek kişilik kaydırmaları görevlere uygular (bölünecek işler hariç) */
export const applyReassignments = (tasks: Task[], picks: Reassignment[], members: { name: string; unit: string }[]): Task[] => {
    const byId = new Map(picks.filter(p => p.to.length === 1).map(p => [p.taskId, p.to[0]]));
    const unitOf = new Map(members.map(m => [m.name, m.unit]));
    const now = new Date().toISOString();
    return tasks.map(t => {
        const to = byId.get(t.id);
        if (!to || to === t.resourceName) return t;
        return { ...t, resourceName: to, unit: t.unit || unitOf.get(to) || t.unit, updatedAt: now };
    });
};

/**
 * Planı sprintlere yazar: görevin geliştirme başladığı haftayı içeren sprint
 * `version`, sürdüğü sprint sayısı `sprintSpan` (1–4) olur. Ufukta bitmeyen
 * ya da eforu olmayan görev Havuz'da (0) kalır.
 */
export const applyPlanToSprints = (
    tasks: Task[],
    result: Pick<BottleneckResult, 'tasks' | 'weeks'>,
    sprintOf: (d: Date) => number,
): { tasks: Task[]; changed: number } => {
    const plan = new Map(result.tasks.map(p => [p.taskId, p]));
    const now = new Date().toISOString();
    let changed = 0;
    const next = tasks.map(t => {
        const p = plan.get(t.id);
        if (!p || t.status === TaskStatus.Done) return t;
        const version = p.release >= 0 && p.devStart >= 0 ? sprintOf(result.weeks[p.devStart].start) : 0;
        const endVersion = p.release >= 0 ? sprintOf(result.weeks[p.release].start) : version;
        const span = Math.max(1, Math.min(4, endVersion - version + 1));
        const sprintSpan = version > 0 && span > 1 ? span : undefined;
        if ((t.version || 0) === version && (t.sprintSpan || undefined) === sprintSpan) return t;
        changed++;
        return { ...t, version, sprintSpan, updatedAt: now };
    });
    return { tasks: next, changed };
};

const clampLoad = (pct: number) => Math.max(0.5, Math.min(2, (Number.isFinite(pct) ? pct : 100) / 100));

/** Proje kurallarından hesap ayarı (eksikler varsayılanla) */
export const settingsFromRules = (
    rules: PlanRules | undefined,
    project: Pick<ProjectSettings, 'useJiraRemainingEstimate'>,
    over: Partial<BottleneckSettings> = {},
    today = new Date(),
): BottleneckSettings => ({
    ...DEFAULT_BOTTLENECK,
    startDate: defaultStartDate(today),
    targetDate: rules?.targetDate || defaultTargetDate(today),
    testUnit: rules?.testUnit ?? DEFAULT_TEST_UNIT,
    testRatio: rules?.testRatio ?? DEFAULT_BOTTLENECK.testRatio,
    focus: rules?.focus ?? DEFAULT_BOTTLENECK.focus,
    fixers: rules?.fixers || {},
    scopeMilestone: rules?.scopeMilestone,
    maxLoad: rules?.maxLoad ?? 100,
    personMaxLoad: rules?.personMaxLoad || {},
    useRemaining: !!project.useJiraRemainingEstimate,
    ...over,
});

/** Tarihi içeren (ya da tarihten sonraki ilk) sprintin numarası; proje takviminden */
export const sprintOfDate = (project: Project): ((d: Date) => number) => {
    let windows: ReturnType<typeof buildSprintWindows> | null = null;
    return d => {
        windows ??= buildSprintWindows(project, 400);
        return (windows.find(w => d <= w.end) || windows[windows.length - 1]).sprint;
    };
};
