import { Task, Resource, TimeEstimate } from '../types';

export interface ScheduledTask extends Task {
  start: number;
  end: number;
  duration: number;
  color: string;
  initials: string;
}

/**
 * Calculates PERT, Fuzzy PERT (Triangular Distribution), and standard deviation for a task.
 * @param time - An object with best, average, and worst time estimates.
 * @returns An object with calculated pert, fuzzyPert, and standardDeviation.
 */
export const calculatePertFuzzyPert = (time: TimeEstimate): { pert: number, fuzzyPert: number, standardDeviation: number } => {
  const { best, avg, worst } = time;
  if (worst < best || best < 0 || avg < 0 || worst < 0) { // Basic validation
     return { pert: 0, fuzzyPert: 0, standardDeviation: 0 };
  }
  const pert = (best + 4 * avg + worst) / 6;
  const fuzzyPert = (best + avg + worst) / 3; // Triangular distribution mean
  const standardDeviation = (worst - best) / 6;
  return { pert, fuzzyPert, standardDeviation };
};


// Simple hash function to generate a color from a string
const generateColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  const color = "00000".substring(0, 6 - c.length) + c;
  return `#${color}`;
};

const getInitials = (name: string): string => {
    return name.split(' ').map(n => n[0]).join('').toLocaleUpperCase('tr-TR');
}


export const calculateSchedule = (tasks: Task[], resources: Resource[]): ScheduledTask[] => {
    if (tasks.length === 0) return [];
    
    const taskMap = new Map<string, Task>(tasks.map(t => [t.id, t]));
    const resourceMap = new Map<string, Resource>(resources.map(r => [r.name, r]));

    // Build dependency graph
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    tasks.forEach(task => {
        adj[task.id] = [];
        inDegree[task.id] = 0;
    });

    tasks.forEach(task => {
        if (task.predecessor && taskMap.has(task.predecessor)) {
            adj[task.predecessor].push(task.id);
            inDegree[task.id]++;
        }
    });

    // Topological sort
    const queue = tasks.filter(task => inDegree[task.id] === 0);
    const sortedTasks: Task[] = [];
    while (queue.length > 0) {
        const current = queue.shift()!;
        sortedTasks.push(current);
        adj[current.id].forEach(neighborId => {
            inDegree[neighborId]--;
            if (inDegree[neighborId] === 0) {
                queue.push(taskMap.get(neighborId)!);
            }
        });
    }

    if (sortedTasks.length !== tasks.length) {
        console.error("Cycle detected in tasks or invalid predecessor. Cannot create schedule.");
        // Return unscheduled but processed tasks to avoid crash
        return tasks.map(t => {
            const resource = resourceMap.get(t.resourceName);
            return {
                ...t,
                start: 0,
                end: 0,
                duration: 0,
                color: resource ? generateColor(resource.name) : '#808080',
                initials: resource ? getInitials(resource.name) : '??'
            }
        });
    }

    // Calculate start/end times
    const scheduledTaskMap = new Map<string, ScheduledTask>();

    sortedTasks.forEach(task => {
        const { pert: pertTime } = calculatePertFuzzyPert(task.time);
        const resource = resourceMap.get(task.resourceName);
        const participation = resource ? resource.participation / 100 : 1;
        const duration = pertTime > 0 && participation > 0 ? pertTime / participation : 0;
        
        let startTime = 0;
        if (task.predecessor && scheduledTaskMap.has(task.predecessor)) {
            startTime = scheduledTaskMap.get(task.predecessor)!.end;
        }

        const scheduledTask: ScheduledTask = {
            ...task,
            duration,
            start: startTime,
            end: startTime + duration,
            color: resource ? generateColor(resource.name) : '#808080',
            initials: resource ? getInitials(resource.name) : '??'
        };
        scheduledTaskMap.set(task.id, scheduledTask);
    });

    return Array.from(scheduledTaskMap.values()).sort((a,b) => a.start - b.start);
};