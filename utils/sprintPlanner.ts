import { Task, Resource } from '../types';
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
        // Başlangıç skoru: Kendi önceliği + (işlem süresi ters orantısı - kısa işler avantajlı) / 1000
        // İşlem süresi faktörü, aynı öncelikteki işlerde kısa olanı (Shortest Processing Time) öne alarak akışı hızlandırır.
        const baseScore = BASE_PRIORITY_SCORES[t.priority];
        scores.set(t.id, baseScore);
    });

    // Memoization ile recursive skor hesaplama
    // Skor(Task) = Max(KendiSkoru, Max(ArdılSkorları))
    const getInheritedScore = (taskId: string): number => {
        const currentTask = taskMap.get(taskId);
        if (!currentTask) return 0;

        const successors = adj[taskId] || [];
        const successorMaxScore = successors.reduce((max, succId) => {
            return Math.max(max, getInheritedScore(succId));
        }, 0);

        const myBaseScore = BASE_PRIORITY_SCORES[currentTask.priority];
        // Inherited skor, ardılın skorundan çok az düşük olsun ki (epsilon farkı),
        // bağımlılık zincirinde önce ardıl değil öncül gelsin (zaten dependency check bunu zorlar ama skor mantığı doğru olsun).
        // Ancak burada mantık: Eğer ardılım Blocker (10000) ise, ben de en az 10000 değerindeyim.
        const finalScore = Math.max(myBaseScore, successorMaxScore);
        
        scores.set(taskId, finalScore);
        return finalScore;
    };

    tasks.forEach(t => getInheritedScore(t.id));
    return scores;
};

export const planTaskVersions = (tasks: Task[], resources: Resource[], sprintDurationWeeks: number): Task[] => {
    const plannableTasks = tasks.filter(t => t.includeInSprints !== false);
    const excludedTasks = tasks.filter(t => t.includeInSprints === false);

    if (!plannableTasks.length || sprintDurationWeeks <= 0) return tasks;

    const sprintCapacityDays = (sprintDurationWeeks * WORK_DAYS_PER_WEEK) - TEST_DAYS;
    if (sprintCapacityDays <= 0) {
        throw new Error(`Sprint süresi (${sprintDurationWeeks * 5} gün), test süresinden (${TEST_DAYS} gün) uzun olmalıdır.`);
    }

    // 1. Kaynak Verilerini Hazırla
    const resourceMap = new Map<string, Resource>(resources.map(r => [r.name, r]));
    
    // 2. Görev Sürelerini ve Stratejik Skorları Hesapla
    const strategicScores = calculateStrategicScores(plannableTasks);
    
    const taskDurations = new Map<string, number>();
    plannableTasks.forEach(task => {
        const { pert } = calculatePertFuzzyPert(task.time);
        const resource = resourceMap.get(task.resourceName);
        const participation = resource ? resource.participation / 100 : 1;
        // Süre = İş Yükü / (Katılım * Verimlilik)
        const duration = (pert > 0 && participation > 0) ? pert / participation : 0;
        taskDurations.set(task.id, duration);
    });

    // 3. Görevleri Stratejik Önceliğe Göre Sırala (Global Sorting)
    // Bu, "En önemli işi al ve yerleştirebileceğin en erken yere koy" mantığıdır.
    const sortedTasks = [...plannableTasks].sort((a, b) => {
        const scoreA = strategicScores.get(a.id) || 0;
        const scoreB = strategicScores.get(b.id) || 0;
        
        if (scoreB !== scoreA) return scoreB - scoreA; // Yüksek skor önce
        
        // Eşitlik durumunda: Shortest Processing Time (SPT) kuralı
        const durA = taskDurations.get(a.id) || 0;
        const durB = taskDurations.get(b.id) || 0;
        return durA - durB; 
    });

    // 4. Atama Simülasyonu
    const finalTasks = new Map<string, Task>();
    const sprintResourceUsage: Array<Record<string, number>> = []; // Sprint Index -> ResourceName -> UsedDays
    const taskSprintAssignment = new Map<string, number>(); // TaskId -> SprintIndex

    // Yardımcı: Belirli bir sprintte kaynağın yer durumu var mı?
    const checkResourceAvailability = (sprintIndex: number, resourceName: string, duration: number): boolean => {
        if (!sprintResourceUsage[sprintIndex]) sprintResourceUsage[sprintIndex] = {};
        const currentUsage = sprintResourceUsage[sprintIndex][resourceName] || 0;
        return (currentUsage + duration) <= sprintCapacityDays;
    };

    // Yardımcı: Kaynağa yükle
    const allocateResource = (sprintIndex: number, resourceName: string, duration: number) => {
        if (!sprintResourceUsage[sprintIndex]) sprintResourceUsage[sprintIndex] = {};
        const currentUsage = sprintResourceUsage[sprintIndex][resourceName] || 0;
        sprintResourceUsage[sprintIndex][resourceName] = currentUsage + duration;
    };

    const MAX_SPRINTS = 50; // Güvenlik sınırı

    for (const task of sortedTasks) {
        const duration = taskDurations.get(task.id) || 0;
        const resourceName = task.resourceName || 'Atanmamış';

        // En erken hangi sprintte başlayabilir?
        // Kural 1: Öncül görevlerin bittiği sprintten SONRA veya AYNI sprintte (eğer kapasite ve mantık elverirse).
        // Basitleştirilmiş Güvenli Kural: Öncül Sprint + 1. (Veya Öncül Sürüm >= Şu anki sürüm)
        // Burada daha sıkı bir optimizasyon için: Eğer öncül Sürüm 1'de ise, ben de Sürüm 1'e sığabilirim (sıralıysa).
        // Ancak sprint planlamasında genellikle "Dependency Completed in Sprint X -> Ready for Sprint X+1" mantığı daha güvenlidir.
        // Fakat, iş süreleri kısaysa aynı sprinte sığabilirler.
        // Şimdilik "Öncül Sürümü"nü minimum başlangıç noktası alacağız.
        
        let minSprint = 1;
        if (task.predecessor) {
            const predSprint = taskSprintAssignment.get(task.predecessor);
            // Eğer öncül planlanmadıysa (örn: excluded), 1'den başla.
            // Eğer planlandıysa, aynı sprintte yapmaya çalış (sıralı sığıyorsa), sığmazsa bir sonrakine kayar.
            if (predSprint !== undefined) {
                minSprint = predSprint; 
            }
        }

        let assignedSprint = -1;

        // En erken uygun sprinti ara
        for (let s = minSprint; s <= MAX_SPRINTS; s++) {
            // Eğer bu sprint, öncülün olduğu sprint ise;
            // Burada "Intra-sprint dependency" kontrolü karmaşıktır. 
            // Basitlik ve sağlamlık için: Eğer öncülün süresi + benim sürem > sprint kapasitesi ise, kesinlikle sonraki sprint.
            // Endüstri mühendisliği notu: Bu "Bin Packing with Precedence" problemidir.
            
            let fits = false;

            if (task.predecessor && taskSprintAssignment.get(task.predecessor) === s) {
                // Öncülle aynı sprintteyiz. Kaynağın o sprintteki toplam yüküne bakıyoruz.
                // Eğer resource aynıysa, sequential (sıralı) olmak zorundalar.
                // Eğer resource farklıysa, parallel olabilirler ama dependency var, yani start-to-finish.
                // Güvenli Mod: Dependency varsa bir sonraki sprinte at. (Risk minimizasyonu)
                // İsteğe bağlı: fits = checkResourceAvailability(...) ama riskli.
                // KARAR: Bağımlılık varsa ve öncül bu sprintteyse, bu görev bir sonraki sprinte geçer.
                continue; 
            } else {
                // Öncül yok veya öncül daha önceki sprintlerde bitmiş.
                fits = checkResourceAvailability(s, resourceName, duration);
            }

            if (fits) {
                assignedSprint = s;
                allocateResource(s, resourceName, duration);
                taskSprintAssignment.set(task.id, s);
                break;
            }
        }

        // Eğer MAX_SPRINTS içinde yer bulunamadıysa Backlog (0)
        const finalVersion = assignedSprint !== -1 ? assignedSprint : 0;
        
        finalTasks.set(task.id, { ...task, version: finalVersion });
    }

    // Sıralamayı koruyarak listeyi döndür
    return [...Array.from(finalTasks.values()), ...excludedTasks];
};