
import { Task, Resource, TaskStatus } from '../types';
import { calculatePertFuzzyPert } from './timeline';
import { TEST_DAYS, WORK_DAYS_PER_WEEK } from '../constants';

// Temel öncelik puanları
const BASE_PRIORITY_SCORES: Record<Task['priority'], number> = {
    Blocker: 10000,
    High: 1000,
    Medium: 100,
    Low: 10,
};

const MAX_SPRINTS = 200;

export interface PlanWarning {
    taskId: string;
    taskName: string;
    type: 'cycle' | 'oversized' | 'unplaced' | 'blocked';
    message: string;
}

export interface PlanStats {
    sprintCount: number;
    plannedTaskCount: number;
    totalEffortDays: number;
}

export interface PlanResult {
    tasks: Task[];
    warnings: PlanWarning[];
    stats: PlanStats;
}

interface TaskMeta {
    duration: number;
    score: number;          // Miras alınan stratejik öncelik puanı
    downstreamWork: number; // Kritik zincir: bu görev + ardıl zincirin toplam iş günü
    order: number;          // Girdi sırası (kararlı sıralama için)
}

/**
 * Endüstri Mühendisliği Yaklaşımı: Kritik Zincir Önceliklendirmesi
 * Bir görevin önceliği sadece kendi önceliği değildir; onu bekleyen ardıl görevlerin
 * önceliklerinden de etkilenir. Eğer 'Low' öncelikli bir iş, 'Blocker' bir işi tutuyorsa,
 * o 'Low' iş aslında 'Blocker' kadar kritiktir.
 *
 * Tek bir yinelemeli DFS geçişinde üç şey hesaplanır:
 *  - score: max(kendi önceliği, ardılların puanı) — miras alınan öncelik
 *  - downstreamWork: görev süresi + en uzun ardıl zincirin süresi (kritik zincir rank'i)
 *  - cycleIds: öncül döngüsüne dahil görevler (döngü kenarları yok sayılır, sonsuz
 *    özyineleme engellenir)
 */
const computeTaskMeta = (
    tasks: Task[],
    durations: Map<string, number>
): { meta: Map<string, TaskMeta>; cycleIds: Set<string>; backEdges: Set<string> } => {
    const taskIds = new Set(tasks.map(t => t.id));
    const successors = new Map<string, string[]>();
    tasks.forEach(t => {
        if (t.predecessor && taskIds.has(t.predecessor) && t.predecessor !== t.id) {
            if (!successors.has(t.predecessor)) successors.set(t.predecessor, []);
            successors.get(t.predecessor)!.push(t.id);
        }
    });

    const meta = new Map<string, TaskMeta>();
    const cycleIds = new Set<string>();
    // Döngü oluşturan kenarlar "predId->succId" olarak saklanır; topolojik sıralamada atlanır.
    const backEdges = new Set<string>();
    const baseScore = new Map(tasks.map(t => [t.id, BASE_PRIORITY_SCORES[t.priority] ?? 100]));
    const orderIndex = new Map(tasks.map((t, i) => [t.id, i]));

    // Renkler: 0 = ziyaret edilmedi, 1 = yığında, 2 = tamamlandı
    const color = new Map<string, number>();

    const dfs = (rootId: string) => {
        const stack: Array<{ id: string; childIdx: number }> = [{ id: rootId, childIdx: 0 }];
        color.set(rootId, 1);

        while (stack.length > 0) {
            const frame = stack[stack.length - 1];
            const children = successors.get(frame.id) || [];

            if (frame.childIdx < children.length) {
                const childId = children[frame.childIdx];
                frame.childIdx++;
                const c = color.get(childId) || 0;
                if (c === 0) {
                    color.set(childId, 1);
                    stack.push({ id: childId, childIdx: 0 });
                } else if (c === 1) {
                    // Geri kenar → öncül döngüsü tespit edildi
                    backEdges.add(`${frame.id}->${childId}`);
                    cycleIds.add(frame.id);
                    cycleIds.add(childId);
                }
            } else {
                // Tüm çocuklar işlendi; puanları topla
                let score = baseScore.get(frame.id) || 0;
                let maxChildWork = 0;
                for (const childId of children) {
                    if (backEdges.has(`${frame.id}->${childId}`)) continue;
                    const childMeta = meta.get(childId);
                    if (childMeta) {
                        score = Math.max(score, childMeta.score);
                        maxChildWork = Math.max(maxChildWork, childMeta.downstreamWork);
                    }
                }
                meta.set(frame.id, {
                    duration: durations.get(frame.id) || 0,
                    score,
                    downstreamWork: (durations.get(frame.id) || 0) + maxChildWork,
                    order: orderIndex.get(frame.id) || 0,
                });
                color.set(frame.id, 2);
                stack.pop();
            }
        }
    };

    tasks.forEach(t => {
        if ((color.get(t.id) || 0) === 0) dfs(t.id);
    });

    return { meta, cycleIds, backEdges };
};

/** Hazır listesinden bir sonraki en kritik görevi seçmek için karşılaştırıcı. */
const compareByCriticality = (a: TaskMeta & { dueTime: number }, b: TaskMeta & { dueTime: number }): number => {
    if (b.score !== a.score) return b.score - a.score;               // 1) Öncelik (miras dahil)
    if (a.dueTime !== b.dueTime) return a.dueTime - b.dueTime;       // 2) En erken termin (EDD)
    if (b.downstreamWork !== a.downstreamWork) return b.downstreamWork - a.downstreamWork; // 3) Kritik zincir uzunluğu
    if (b.duration !== a.duration) return b.duration - a.duration;   // 4) Uzun iş önce (LPT — daha iyi paketleme)
    return a.order - b.order;                                        // 5) Kararlı sıra
};

/**
 * Görevleri sürümlere (sprintlere) yerleştirir.
 *
 * Algoritma: öncelik + termin + kritik zincir sıralı "liste çizelgeleme".
 * Görevler topolojik kısıt altında işlenir — bir görev, tüm planlanabilir
 * öncülleri yerleştirilmeden sıraya giremez. Böylece ardılın öncülünden önceki
 * bir sürüme atanması (eski algoritmadaki bağımlılık ihlali) imkânsız hale gelir.
 *
 * Kurallar:
 *  - Tamamlanmış görevler ve plan dışı bırakılanlar yerlerini korur.
 *  - Ardıl, öncülüyle aynı sürümde olamaz (test döngüsü nedeniyle bir sonrakine gider).
 *  - Plan dışı ama bitmemiş bir öncülün sürümü belliyse (version > 0) ardıl ondan sonraya atanır.
 *  - Sprint kapasitesine sığmayan dev görevler Backlog'a atılmaz; kaynağın boş olduğu
 *    ilk sürüme taşma uyarısıyla yerleştirilir.
 */
export const planTaskVersionsDetailed = (
    tasks: Task[],
    resources: Resource[],
    sprintDurationWeeks: number,
    testDays: number = TEST_DAYS
): PlanResult => {
    const doneTasks = tasks.filter(t => t.status === TaskStatus.Done);
    const plannableTasks = tasks.filter(t => t.includeInSprints !== false && t.status !== TaskStatus.Done);
    const excludedTasks = tasks.filter(t => t.includeInSprints === false && t.status !== TaskStatus.Done);

    const emptyStats: PlanStats = { sprintCount: 0, plannedTaskCount: 0, totalEffortDays: 0 };
    if (!plannableTasks.length || sprintDurationWeeks <= 0) {
        return { tasks, warnings: [], stats: emptyStats };
    }

    const sprintCapacityDays = (sprintDurationWeeks * WORK_DAYS_PER_WEEK) - testDays;
    if (sprintCapacityDays <= 0) {
        throw new Error(`Sprint süresi (${sprintDurationWeeks * WORK_DAYS_PER_WEEK} gün), test süresinden (${testDays} gün) uzun olmalıdır.`);
    }

    const warnings: PlanWarning[] = [];
    const resourceMap = new Map<string, Resource>(resources.map(r => [r.name, r]));
    const taskById = new Map(tasks.map(t => [t.id, t]));
    const plannableIds = new Set(plannableTasks.map(t => t.id));

    // Efektif süre: PERT süresi / kaynağın katılım oranı
    const durations = new Map<string, number>();
    plannableTasks.forEach(task => {
        const { pert } = calculatePertFuzzyPert(task.time);
        const resource = resourceMap.get(task.resourceName);
        const participation = resource ? resource.participation / 100 : 1;
        durations.set(task.id, (pert > 0 && participation > 0) ? pert / participation : 0);
    });

    const { meta, cycleIds, backEdges } = computeTaskMeta(plannableTasks, durations);

    cycleIds.forEach(id => {
        const t = taskById.get(id);
        if (t) {
            warnings.push({
                taskId: id,
                taskName: t.name,
                type: 'cycle',
                message: `"${t.name}" görevi bir öncül döngüsünün parçası; döngü kırılarak planlandı. Öncül tanımlarını kontrol edin.`,
            });
        }
    });

    // Topolojik hazır listesi kurulumu (Kahn) — döngü kenarları sayılmaz
    const inDegree = new Map<string, number>();
    const successors = new Map<string, string[]>();
    plannableTasks.forEach(t => inDegree.set(t.id, 0));
    plannableTasks.forEach(t => {
        const pred = t.predecessor;
        if (pred && plannableIds.has(pred) && pred !== t.id && !backEdges.has(`${pred}->${t.id}`)) {
            inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
            if (!successors.has(pred)) successors.set(pred, []);
            successors.get(pred)!.push(t.id);
        }
    });

    const dueTime = (t: Task): number => {
        if (!t.dueDate) return Number.MAX_SAFE_INTEGER;
        const ts = new Date(t.dueDate).getTime();
        return isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
    };

    const ready: Task[] = plannableTasks.filter(t => (inDegree.get(t.id) || 0) === 0);

    // Kaynak bazlı sprint doluluk takibi
    const sprintResourceUsage: Array<Record<string, number>> = [];
    const usageOf = (sprint: number, resourceName: string): number => {
        if (!sprintResourceUsage[sprint]) sprintResourceUsage[sprint] = {};
        return sprintResourceUsage[sprint][resourceName] || 0;
    };
    const allocate = (sprint: number, resourceName: string, duration: number) => {
        if (!sprintResourceUsage[sprint]) sprintResourceUsage[sprint] = {};
        sprintResourceUsage[sprint][resourceName] = (sprintResourceUsage[sprint][resourceName] || 0) + duration;
    };

    const assignment = new Map<string, number>(); // taskId -> sprint (0 = planlanamadı)
    const finalTasks = new Map<string, Task>();
    let processedCount = 0;

    const placeTask = (task: Task) => {
        const m = meta.get(task.id)!;
        const duration = m.duration;
        const resourceName = task.resourceName || 'Atanmamış';

        // Öncül kısıtından minimum sürümü belirle
        let minSprint = 1;
        let blockedByPred = false;
        const pred = task.predecessor ? taskById.get(task.predecessor) : undefined;
        if (pred && pred.id !== task.id) {
            if (plannableIds.has(pred.id) && !backEdges.has(`${pred.id}->${task.id}`)) {
                const predSprint = assignment.get(pred.id);
                if (predSprint === undefined || predSprint === 0) {
                    blockedByPred = predSprint === 0; // Öncül planlanamadıysa ardıl da planlanamaz
                } else {
                    minSprint = predSprint + 1; // Aynı sürüm yasak: bir sonrakinden başla
                }
            } else if (pred.status !== TaskStatus.Done && pred.includeInSprints === false && pred.version > 0) {
                // Elle sabitlenmiş, bitmemiş öncül: onun sürümünden sonraya planla
                minSprint = pred.version + 1;
            }
            // Tamamlanmış öncül kısıt oluşturmaz.
        }

        if (blockedByPred) {
            assignment.set(task.id, 0);
            finalTasks.set(task.id, { ...task, version: 0 });
            warnings.push({
                taskId: task.id,
                taskName: task.name,
                type: 'blocked',
                message: `"${task.name}" planlanamadı çünkü öncülü ("${pred?.name}") plana yerleştirilemedi.`,
            });
            return;
        }

        let assignedSprint = -1;

        if (duration > sprintCapacityDays) {
            // Dev görev: kaynağın tamamen boş olduğu ilk sürüme taşarak yerleştir
            for (let s = minSprint; s <= MAX_SPRINTS; s++) {
                if (usageOf(s, resourceName) === 0) {
                    assignedSprint = s;
                    allocate(s, resourceName, duration);
                    break;
                }
            }
            if (assignedSprint !== -1) {
                warnings.push({
                    taskId: task.id,
                    taskName: task.name,
                    type: 'oversized',
                    message: `"${task.name}" (${Math.ceil(duration)} gün) tek sprint kapasitesinden (${sprintCapacityDays} gün) büyük; Sürüm ${assignedSprint}'e taşarak yerleştirildi. Görevi bölmeyi düşünün.`,
                });
            }
        } else {
            for (let s = minSprint; s <= MAX_SPRINTS; s++) {
                if (usageOf(s, resourceName) + duration <= sprintCapacityDays) {
                    assignedSprint = s;
                    allocate(s, resourceName, duration);
                    break;
                }
            }
        }

        if (assignedSprint === -1) {
            assignment.set(task.id, 0);
            finalTasks.set(task.id, { ...task, version: 0 });
            warnings.push({
                taskId: task.id,
                taskName: task.name,
                type: 'unplaced',
                message: `"${task.name}" ${MAX_SPRINTS} sürüm içinde uygun kapasite bulunamadığı için Backlog'a alındı.`,
            });
            return;
        }

        assignment.set(task.id, assignedSprint);
        finalTasks.set(task.id, { ...task, version: assignedSprint });
    };

    while (ready.length > 0) {
        // Hazır görevler arasından en kritik olanı seç
        ready.sort((a, b) => compareByCriticality(
            { ...meta.get(a.id)!, dueTime: dueTime(a) },
            { ...meta.get(b.id)!, dueTime: dueTime(b) }
        ));
        const task = ready.shift()!;
        placeTask(task);
        processedCount++;

        (successors.get(task.id) || []).forEach(succId => {
            const deg = (inDegree.get(succId) || 0) - 1;
            inDegree.set(succId, deg);
            if (deg === 0) ready.push(taskById.get(succId)!);
        });
    }

    // Güvenlik ağı: topolojik sıraya girememiş görev kalırsa (beklenmez, döngüler
    // kırılmış olmalı) kritiklik sırasına göre yine de yerleştir.
    if (processedCount < plannableTasks.length) {
        plannableTasks
            .filter(t => !finalTasks.has(t.id))
            .sort((a, b) => compareByCriticality(
                { ...meta.get(a.id)!, dueTime: dueTime(a) },
                { ...meta.get(b.id)!, dueTime: dueTime(b) }
            ))
            .forEach(placeTask);
    }

    // Sonuçları orijinal girdi sırasında birleştir
    const resultTasks = tasks.map(t => finalTasks.get(t.id) || t);

    let sprintCount = 0;
    let plannedTaskCount = 0;
    let totalEffortDays = 0;
    assignment.forEach((sprint, taskId) => {
        if (sprint > 0) {
            sprintCount = Math.max(sprintCount, sprint);
            plannedTaskCount++;
            totalEffortDays += durations.get(taskId) || 0;
        }
    });

    return {
        tasks: resultTasks,
        warnings,
        stats: { sprintCount, plannedTaskCount, totalEffortDays },
    };
};

/** Geriye dönük uyumlu sarmalayıcı: yalnızca görev listesini döndürür. */
export const planTaskVersions = (
    tasks: Task[],
    resources: Resource[],
    sprintDurationWeeks: number,
    testDays: number = TEST_DAYS
): Task[] => {
    return planTaskVersionsDetailed(tasks, resources, sprintDurationWeeks, testDays).tasks;
};
