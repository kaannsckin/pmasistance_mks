
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

/**
 * Endüstri Mühendisliği Yaklaşımı: Kritik Zincir Önceliklendirmesi
 * Bir görevin önceliği sadece kendi önceliği değildir; onu bekleyen ardıl görevlerin
 * önceliklerinden de etkilenir. Eğer 'Low' öncelikli bir iş, 'Blocker' bir işi tutuyorsa,
 * o 'Low' iş aslında 'Blocker' kadar kritiktir.
 */
const calculateStrategicScores = (tasks: Task[]): Map<string, number> => {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const scores = new Map<string, number>();
    const adj: Record<string, string[]> = {}; // Predecessor -> Successors

    // Grafiği oluştur
    tasks.forEach(t => {
        if (t.predecessor) {
            if (!adj[t.predecessor]) adj[t.predecessor] = [];
            adj[t.predecessor].push(t.id);
        }
        // Başlangıç skoru: Kendi önceliği + (işlem süresi faktörü)
        const baseScore = BASE_PRIORITY_SCORES[t.priority];
        scores.set(t.id, baseScore);
    });

    // Memoization ile recursive skor hesaplama
    const getInheritedScore = (taskId: string): number => {
        const currentTask = taskMap.get(taskId);
        if (!currentTask) return 0;

        const successors = adj[taskId] || [];
        const successorMaxScore = successors.reduce((max, succId) => {
            return Math.max(max, getInheritedScore(succId));
        }, 0);

        const myBaseScore = BASE_PRIORITY_SCORES[currentTask.priority];
        const finalScore = Math.max(myBaseScore, successorMaxScore);
        
        scores.set(taskId, finalScore);
        return finalScore;
    };

    tasks.forEach(t => getInheritedScore(t.id));
    return scores;
};

export const planTaskVersions = (tasks: Task[], resources: Resource[], sprintDurationWeeks: number): Task[] => {
    // Kural: Zaten "Tamamlandı" olan görevler ve planlama dışı bırakılanlar otomatik planlamaya girmez, yerlerini korur.
    const alreadyDoneTasks = tasks.filter(t => t.status === TaskStatus.Done);
    const plannableTasks = tasks.filter(t => t.includeInSprints !== false && t.status !== TaskStatus.Done);
    const excludedTasks = tasks.filter(t => t.includeInSprints === false && t.status !== TaskStatus.Done);

    if (!plannableTasks.length || sprintDurationWeeks <= 0) return tasks;

    const sprintCapacityDays = (sprintDurationWeeks * WORK_DAYS_PER_WEEK) - TEST_DAYS;
    if (sprintCapacityDays <= 0) {
        throw new Error(`Sprint süresi (${sprintDurationWeeks * 5} gün), test süresinden (${TEST_DAYS} gün) uzun olmalıdır.`);
    }

    const resourceMap = new Map<string, Resource>(resources.map(r => [r.name, r]));
    const strategicScores = calculateStrategicScores(plannableTasks);
    
    const taskDurations = new Map<string, number>();
    plannableTasks.forEach(task => {
        const { pert } = calculatePertFuzzyPert(task.time);
        const resource = resourceMap.get(task.resourceName);
        const participation = resource ? resource.participation / 100 : 1;
        const duration = (pert > 0 && participation > 0) ? pert / participation : 0;
        taskDurations.set(task.id, duration);
    });

    const sortedTasks = [...plannableTasks].sort((a, b) => {
        const scoreA = strategicScores.get(a.id) || 0;
        const scoreB = strategicScores.get(b.id) || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const durA = taskDurations.get(a.id) || 0;
        const durB = taskDurations.get(b.id) || 0;
        return durA - durB; 
    });

    const finalTasks = new Map<string, Task>();
    const sprintResourceUsage: Array<Record<string, number>> = []; 
    const taskSprintAssignment = new Map<string, number>();

    const checkResourceAvailability = (sprintIndex: number, resourceName: string, duration: number): boolean => {
        if (!sprintResourceUsage[sprintIndex]) sprintResourceUsage[sprintIndex] = {};
        const currentUsage = sprintResourceUsage[sprintIndex][resourceName] || 0;
        return (currentUsage + duration) <= sprintCapacityDays;
    };

    const allocateResource = (sprintIndex: number, resourceName: string, duration: number) => {
        if (!sprintResourceUsage[sprintIndex]) sprintResourceUsage[sprintIndex] = {};
        const currentUsage = sprintResourceUsage[sprintIndex][resourceName] || 0;
        sprintResourceUsage[sprintIndex][resourceName] = currentUsage + duration;
    };

    const MAX_SPRINTS = 100;

    for (const task of sortedTasks) {
        const duration = taskDurations.get(task.id) || 0;
        const resourceName = task.resourceName || 'Atanmamış';
        
        let minSprint = 1;
        if (task.predecessor) {
            const predSprint = taskSprintAssignment.get(task.predecessor);
            if (predSprint !== undefined) minSprint = predSprint; 
        }

        let assignedSprint = -1;
        for (let s = minSprint; s <= MAX_SPRINTS; s++) {
            if (task.predecessor && taskSprintAssignment.get(task.predecessor) === s) {
                continue; 
            } else if (checkResourceAvailability(s, resourceName, duration)) {
                assignedSprint = s;
                allocateResource(s, resourceName, duration);
                taskSprintAssignment.set(task.id, s);
                break;
            }
        }
        const finalVersion = assignedSprint !== -1 ? assignedSprint : 0;
        finalTasks.set(task.id, { ...task, version: finalVersion });
    }

    return [...Array.from(finalTasks.values()), ...excludedTasks, ...alreadyDoneTasks];
};
