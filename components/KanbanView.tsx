
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Task, Resource, Sprint, UnitLoad, TaskStatus, WorkPackage } from '../types';
import { planTaskVersions } from '../utils/sprintPlanner';
import KanbanColumn from './KanbanColumn';
import { calculatePertFuzzyPert } from '../utils/timeline';
import TestPeriodColumn from './TestPeriodColumn';
import AddSprintColumn from './AddSprintColumn';
import DeleteSprintModal from './DeleteSprintModal';
import FilterDropdown from './FilterDropdown';
import { exportSprintPlanToExcel } from '../utils/exporter';

interface KanbanViewProps {
  tasks: Task[];
  resources: Resource[];
  workPackages: WorkPackage[];
  sprintDuration: number;
  projectStartDate: string;
  sprintNames: Record<number, string>;
  setSprintNames: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  globalTestDays: number;
  setGlobalTestDays: React.Dispatch<React.SetStateAction<number>>;
  onPlanGenerated: (newTasks: Task[]) => void;
  onTaskSprintChange: (taskId: string, newVersion: number) => void;
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onInsertSprint: (sprintNumber: number) => void;
  onDeleteSprint: (sprintNumber: number) => void;
  onOpenSettings: () => void;
  onViewTaskDetails: (taskId: string) => void;
  onNewTask: () => void;
}

const getFirstWorkday = (date: Date): Date => {
    const dateCopy = new Date(date);
     while (dateCopy.getDay() === 0 || dateCopy.getDay() === 6) {
        dateCopy.setDate(dateCopy.getDate() + 1);
    }
    return dateCopy;
};

const addWorkdays = (date: Date, days: number): Date => {
    const dateCopy = new Date(date);
    let workdaysToAdd = Math.round(days) - 1; 
    if (workdaysToAdd < 0) return dateCopy;
    let addedDays = 0;
    while (addedDays < workdaysToAdd) {
        dateCopy.setDate(dateCopy.getDate() + 1);
        const dayOfWeek = dateCopy.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            addedDays++;
        }
    }
    return dateCopy;
};

const getNextWorkday = (date: Date): Date => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
        nextDay.setDate(nextDay.getDate() + 1);
    }
    return nextDay;
};

const BacklogTab: React.FC<{ count: number, onClick: () => void, onDrop: (taskId: string, v: number) => void }> = ({ count, onClick, onDrop }) => {
    const [isOver, setIsOver] = useState(false);
    return (
        <div 
            className={`bg-white/60 dark:bg-gray-800/40 backdrop-blur-md w-12 rounded-2xl border flex flex-col items-center py-8 cursor-pointer hover:bg-white dark:hover:bg-gray-800 transition-all group shrink-0 h-full relative overflow-hidden ${isOver ? 'border-blue-400 ring-4 ring-blue-500/10' : 'border-gray-200 dark:border-gray-700 shadow-sm'}`}
            onClick={onClick}
            onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
            onDragLeave={() => setIsOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsOver(false);
                const taskId = e.dataTransfer.getData('taskId');
                if (taskId) onDrop(taskId, 0);
            }}
        >
            <div className="flex flex-col items-center justify-center h-full space-y-10">
                <div className="bg-amber-100 dark:bg-amber-900/30 w-8 h-8 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-sm group-hover:scale-110 transition-transform">
                    <i className="fa-solid fa-box-archive text-xs"></i>
                </div>
                <div className="flex items-center font-black text-[9px] tracking-[0.4em] text-gray-400 dark:text-gray-500 uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    HAVUZ • BACKLOG
                </div>
                <div className="bg-white dark:bg-gray-700 text-gray-800 dark:text-white w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shadow-md border border-gray-100 dark:border-gray-600">
                    {count}
                </div>
            </div>
        </div>
    );
};

const KanbanView: React.FC<KanbanViewProps> = ({ tasks, resources, workPackages, sprintDuration, projectStartDate, sprintNames, setSprintNames, globalTestDays, setGlobalTestDays, onPlanGenerated, onTaskSprintChange, onTaskStatusChange, onInsertSprint, onDeleteSprint, onOpenSettings, onViewTaskDetails, onNewTask }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [isCompact, setIsCompact] = useState(true); 
  const [isBacklogExpanded, setIsBacklogExpanded] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [testPeriodDetails, setTestPeriodDetails] = useState<Record<number, { responsible?: string; assignedTaskIds?: string[]; foundDefects?: string; duration?: number }>>({});
  const [sprintToDelete, setSprintToDelete] = useState<Sprint | null>(null);
  const [orderedSprints, setOrderedSprints] = useState<Sprint[]>([]);
  const [draggedSprintId, setDraggedSprintId] = useState<number | null>(null);
  const [extraSprints, setExtraSprints] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterResource, setFilterResource] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterWorkPackage, setFilterWorkPackage] = useState('all');

  useEffect(() => {
    setExtraSprints(0);
  }, [tasks]);

  const handleGeneratePlan = () => {
    setIsLoading(true);
    try {
      setTimeout(() => {
        const newTasks = planTaskVersions(tasks, resources, sprintDuration);
        onPlanGenerated(newTasks);
        setIsLoading(false);
      }, 50);
    } catch (e) {
      setIsLoading(false);
    }
  };

  const handleExportPlan = () => {
      exportSprintPlanToExcel(orderedSprints);
  };

  const handleAddSprint = useCallback((atPosition: number) => {
    const tasksForKanban = tasks.filter(t => t.includeInSprints !== false);
    const maxVersionInTasks = Math.max(0, ...tasksForKanban.map(t => t.version || 0));
    if (atPosition > maxVersionInTasks) {
        setExtraSprints(prev => prev + 1);
    } else {
        onInsertSprint(atPosition);
    }
  }, [tasks, onInsertSprint]);

  const handleUpdateTestPeriod = useCallback((sprintId: number, updatedData: any) => {
    setTestPeriodDetails(prev => ({ ...prev, [sprintId]: { ...(prev[sprintId] || {}), ...updatedData } }));
  }, []);

  const uniqueUnits = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.unit)))], [tasks]);
  const uniqueResources = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.resourceName)))], [tasks]);
  const uniquePriorities = useMemo(() => ['all', 'Blocker', 'High', 'Medium', 'Low'], []);
  const uniqueWorkPackages = useMemo(() => ['all', ...workPackages.map(wp => wp.name)], [workPackages]);
  const workPackageNameToIdMap = useMemo(() => new Map(workPackages.map(wp => [wp.name, wp.id])), [workPackages]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const lowerSearch = searchTerm.toLocaleLowerCase('tr-TR');
      const matchesSearch = task.name.toLocaleLowerCase('tr-TR').includes(lowerSearch) || task.jiraId.toLocaleLowerCase('tr-TR').includes(lowerSearch);
      const matchesUnit = filterUnit === 'all' || task.unit === filterUnit;
      const matchesResource = filterResource === 'all' || task.resourceName === filterResource;
      const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;
      const matchesWorkPackage = filterWorkPackage === 'all' || task.workPackageId === workPackageNameToIdMap.get(filterWorkPackage);
      return matchesSearch && matchesUnit && matchesResource && matchesPriority && matchesWorkPackage;
    });
  }, [tasks, searchTerm, filterUnit, filterResource, filterPriority, filterWorkPackage, workPackageNameToIdMap]);

  const calculatedSprints = useMemo((): Sprint[] => {
    const tasksForKanban = tasks.filter(t => t.includeInSprints !== false);
    const maxVersionFromTasks = Math.max(0, ...tasksForKanban.map(t => t.version || 0));
    const maxVersion = maxVersionFromTasks + extraSprints;
    const sprintMap = new Map<number, Sprint>();
    
    for (let i = 0; i <= maxVersion; i++) {
        const title = i === 0 ? 'Backlog' : (sprintNames[i] || `Sürüm ${i}`);
        sprintMap.set(i, { id: i, title: title, tasks: [], unitLoads: {} });
    }

    const testDaysCount = globalTestDays || 4;
    const sprintNetWorkdays = Math.max(0, (sprintDuration * 5) - testDaysCount);
    const capacityPerUnit: Record<string, number> = {};
    resources.forEach(r => {
        const unit = r.unit || 'Atanmamış';
        capacityPerUnit[unit] = (capacityPerUnit[unit] || 0) + (sprintNetWorkdays * (r.participation / 100));
    });

    filteredTasks.filter(t => t.includeInSprints !== false).forEach(task => {
        const version = task.version || 0;
        if (sprintMap.has(version)) sprintMap.get(version)!.tasks.push(task);
    });

    sprintMap.forEach((sprint, version) => {
      const loadPerUnit: Record<string, number> = {};
      const completedLoadPerUnit: Record<string, number> = {};
      sprint.tasks.forEach(task => {
        const unit = task.unit || 'Atanmamış';
        const { pert } = calculatePertFuzzyPert(task.time);
        const res = resources.find(r => r.name === task.resourceName);
        const duration = pert / ((res?.participation || 100) / 100);
        loadPerUnit[unit] = (loadPerUnit[unit] || 0) + duration;
        if (task.status === TaskStatus.Done) completedLoadPerUnit[unit] = (completedLoadPerUnit[unit] || 0) + duration;
      });

      const combined: Record<string, UnitLoad> = {};
      new Set([...Object.keys(capacityPerUnit), ...Object.keys(loadPerUnit)]).forEach(unit => {
        const cap = version === 0 ? Infinity : (capacityPerUnit[unit] || 0);
        if (cap > 0 || (loadPerUnit[unit] || 0) > 0) combined[unit] = { currentLoad: loadPerUnit[unit] || 0, capacity: cap, completedLoad: completedLoadPerUnit[unit] || 0 };
      });
      sprint.unitLoads = combined;
    });

    const sorted = Array.from(sprintMap.values()).sort((a, b) => a.id - b.id);
    const dateParts = projectStartDate.split('-').map(Number);
    let currentProcessingDate = getFirstWorkday(new Date(dateParts[0], dateParts[1] - 1, dateParts[2]));
    
    sorted.forEach(sprint => {
      if (sprint.id > 0) {
        const fmt = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
        sprint.startDate = currentProcessingDate.toLocaleDateString('tr-TR', fmt);
        const workEnd = addWorkdays(currentProcessingDate, sprintDuration * 5);
        sprint.endDate = workEnd.toLocaleDateString('tr-TR', fmt);
        const testStart = getNextWorkday(workEnd);
        const currentSprintTestDays = testPeriodDetails[sprint.id]?.duration || testDaysCount;
        const testEnd = addWorkdays(testStart, currentSprintTestDays);
        const details = testPeriodDetails[sprint.id] || {};
        sprint.testPeriod = { startDate: testStart.toLocaleDateString('tr-TR', fmt), endDate: testEnd.toLocaleDateString('tr-TR', fmt), duration: currentSprintTestDays, ...details };
        currentProcessingDate = getNextWorkday(testEnd);
      }
    });
    return sorted;
  }, [tasks, filteredTasks, resources, sprintDuration, projectStartDate, testPeriodDetails, extraSprints, sprintNames, globalTestDays]);

  useEffect(() => {
    setOrderedSprints(calculatedSprints);
  }, [calculatedSprints]);

  const boardStats = useMemo(() => {
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === TaskStatus.Done).length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const activeSprints = orderedSprints.filter(s => s.id > 0).length;
      let totalLoad = 0, totalCap = 0;
      orderedSprints.forEach(s => {
          if (s.id > 0) {
              Object.values(s.unitLoads).forEach(u => {
                  const unitLoad = u as UnitLoad;
                  totalLoad += unitLoad.currentLoad; totalCap += unitLoad.capacity;
              });
          }
      });
      return { totalTasks, completedTasks, progress, activeSprints, totalLoad, totalCap };
  }, [tasks, orderedSprints]);

  const handleDropTask = (taskId: string, newVersion: number) => {
    onTaskSprintChange(taskId, newVersion);
  };

  const handleSprintReorder = useCallback((targetSprintId: number) => {
    if (draggedSprintId === null || draggedSprintId === targetSprintId) return;
    setOrderedSprints(current => {
        const result = [...current];
        const idxA = result.findIndex(s => s.id === draggedSprintId);
        const idxB = result.findIndex(s => s.id === targetSprintId);
        if (idxA === -1 || idxB === -1) return current;
        const [removed] = result.splice(idxA, 1);
        result.splice(idxB, 0, removed);
        return result;
    });
    setDraggedSprintId(null);
  }, [draggedSprintId]);

  const resetFilters = () => {
    setSearchTerm(''); setFilterUnit('all'); setFilterResource('all'); setFilterPriority('all'); setFilterWorkPackage('all');
  };

  const hasActiveFilters = searchTerm || filterUnit !== 'all' || filterResource !== 'all' || filterPriority !== 'all' || filterWorkPackage !== 'all';

  return (
    <div className={`flex flex-col transition-all duration-500 ease-in-out bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 overflow-hidden shadow-2xl ${isFullScreen ? 'fixed inset-0 z-[100] rounded-none' : 'h-[calc(100vh-6rem)] rounded-3xl'}`}>
      <div className="flex-none bg-white dark:bg-gray-900/80 backdrop-blur-md p-4 border-b border-gray-100 dark:border-gray-800 z-20 shadow-sm relative">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
             <div className="w-10 h-10 bg-blue-600 rounded-xl text-white shadow-lg flex items-center justify-center">
                <i className="fa-solid fa-layer-group text-sm"></i>
             </div>
             <div>
                <h2 className="text-base font-black text-gray-800 dark:text-white leading-none">Sürüm Planlama</h2>
                <div className="flex items-center space-x-3 mt-1.5">
                    <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center">
                        <i className="fa-solid fa-calendar-day mr-1.5 text-blue-500"></i>{new Date(projectStartDate).toLocaleDateString('tr-TR')}
                    </span>
                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        MKS
                    </span>
                    <div className="flex items-center space-x-1.5 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-lg border border-gray-100 dark:border-gray-700">
                        <i className="fa-solid fa-flask text-emerald-500 text-[8px]"></i>
                        <input 
                            type="number" 
                            value={globalTestDays} 
                            onChange={e => setGlobalTestDays(parseInt(e.target.value) || 0)}
                            className="w-8 bg-transparent text-[9px] font-black text-emerald-600 outline-none p-0"
                            title="Genel Test Günü Sayısı"
                        />
                        <span className="text-[7px] font-black text-gray-400 uppercase">GÜN TEST</span>
                    </div>
                </div>
             </div>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={onNewTask} className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-4 rounded-xl shadow-md transition-all font-black text-[10px] uppercase tracking-widest flex items-center">
                <i className="fa-solid fa-plus mr-2"></i> YENİ GÖREV
            </button>
            <div className="bg-gray-50 dark:bg-gray-800 p-1 rounded-xl flex items-center border border-gray-100 dark:border-gray-700">
                <button onClick={() => setIsCompact(true)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${isCompact ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm border border-gray-100 dark:border-gray-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>Kompakt</button>
                <button onClick={() => setIsCompact(false)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${!isCompact ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm border border-gray-100 dark:border-gray-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>Detaylı</button>
            </div>
            <button onClick={() => setIsFilterExpanded(!isFilterExpanded)} className={`w-9 h-9 rounded-xl transition-all border flex items-center justify-center ${isFilterExpanded ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-100 dark:border-gray-700 hover:bg-gray-50'}`} title="Filtreler">
                <i className={`fa-solid ${isFilterExpanded ? 'fa-chevron-up' : 'fa-filter'} text-xs`}></i>
                {hasActiveFilters && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
            </button>
            <button onClick={() => setIsFullScreen(!isFullScreen)} className={`w-9 h-9 rounded-xl transition-all border flex items-center justify-center ${isFullScreen ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`} title={isFullScreen ? "Tam Ekrandan Çık" : "Tam Ekran (Zen Modu)"}>
                <i className={`fa-solid ${isFullScreen ? 'fa-compress' : 'fa-expand'} text-xs`}></i>
            </button>
            <button onClick={handleExportPlan} className="w-9 h-9 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-md flex items-center justify-center transition-all" title="Excel Planı İndir">
                <i className="fa-solid fa-file-excel text-xs"></i>
            </button>
            <button onClick={handleGeneratePlan} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-5 rounded-xl shadow-md transition-all font-black text-[10px] uppercase tracking-widest flex items-center disabled:opacity-50">
              {isLoading ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-magic mr-2"></i>}
              {isLoading ? 'HESAPLANIYOR' : 'OTOMATİK PLANLA'}
            </button>
          </div>
        </div>
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isFilterExpanded ? 'max-h-64 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-4 border-t border-gray-50 dark:border-gray-800">
                <div className="col-span-1">
                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Akıllı Arama</label>
                    <div className="relative group">
                        <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-[10px]"></i>
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Ara..." className="w-full pl-9 pr-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg outline-none text-[11px] transition-all focus:border-blue-300"/>
                    </div>
                </div>
                <FilterDropdown label="Birim" value={filterUnit} onChange={setFilterUnit} options={uniqueUnits} />
                <FilterDropdown label="Kaynak" value={filterResource} onChange={setFilterResource} options={uniqueResources} />
                <FilterDropdown label="Öncelik" value={filterPriority} onChange={setFilterPriority} options={uniquePriorities} />
                <FilterDropdown label="İş Paketi" value={filterWorkPackage} onChange={setFilterWorkPackage} options={uniqueWorkPackages} />
            </div>
            {hasActiveFilters && (
                <div className="flex justify-end mt-2">
                    <button onClick={resetFilters} className="text-[9px] font-black text-red-500 hover:text-red-700 flex items-center">
                        <i className="fa-solid fa-trash-can mr-1.5"></i> TEMİZLE
                    </button>
                </div>
            )}
        </div>
      </div>
      <div className="flex-grow overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#F9FAFB] dark:bg-gray-950/40">
        <div className="inline-flex h-full items-start px-6 py-6 space-x-4">
          {orderedSprints.map((sprint, idx) => (
            <React.Fragment key={sprint.id}>
              {sprint.id !== 0 && <AddSprintColumn onClick={() => handleAddSprint(sprint.id)} />}
              <div className="h-full flex flex-col">
                  <div className="flex items-start h-full">
                    {sprint.id === 0 && !isBacklogExpanded ? (
                        <BacklogTab count={sprint.tasks.length} onClick={() => setIsBacklogExpanded(true)} onDrop={handleDropTask} />
                    ) : (
                        <KanbanColumn 
                            sprint={sprint}
                            workPackages={workPackages}
                            onDropTask={handleDropTask}
                            onTaskStatusChange={onTaskStatusChange}
                            onDelete={setSprintToDelete}
                            onCollapse={() => sprint.id === 0 && setIsBacklogExpanded(false)}
                            isDragged={draggedSprintId === sprint.id}
                            isCompact={isCompact}
                            onSprintDragStart={(id) => setDraggedSprintId(id)}
                            onSprintDragEnd={() => setDraggedSprintId(null)}
                            onSprintDrop={handleSprintReorder}
                            onViewTaskDetails={onViewTaskDetails}
                            onUpdateSprintName={(name) => setSprintNames(prev => ({...prev, [sprint.id]: name}))}
                        />
                    )}
                    {sprint.id > 0 && (
                        <div className="h-full flex items-start mx-1.5">
                            <TestPeriodColumn 
                                sprint={sprint} 
                                allTasks={tasks} 
                                resources={resources} 
                                onUpdateTestPeriod={handleUpdateTestPeriod} 
                            />
                        </div>
                    )}
                  </div>
              </div>
              {idx === orderedSprints.length - 1 && (
                  <AddSprintColumn onClick={() => handleAddSprint(sprint.id + 1)} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="flex-none bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-8 py-3.5 z-20 shadow-lg">
         <div className="flex items-center justify-between">
            <div className="flex items-center space-x-10">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">İLERLEME DURUMU</span>
                    <div className="flex items-center space-x-3">
                        <div className="w-40 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${boardStats.progress}%` }}></div>
                        </div>
                        <span className="text-[10px] font-black text-blue-600">%{boardStats.progress}</span>
                    </div>
                </div>
                <div className="h-8 w-px bg-gray-100 dark:bg-gray-800"></div>
                <div className="flex space-x-10">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">SÜRÜM</span>
                        <span className="text-xs font-black text-gray-700 dark:text-white">{boardStats.activeSprints} Aktif</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">EFOR/KAPASİTE</span>
                        <span className="text-xs font-black text-gray-700 dark:text-white">
                            {Math.round(boardStats.totalLoad)}/{Math.round(boardStats.totalCap)} <span className="text-[9px] opacity-40 uppercase tracking-tighter">GÜN</span>
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex items-center space-x-4 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
                 <div className="flex -space-x-2">
                    {resources.slice(0, 5).map(r => (
                        <div key={r.id} className="w-7 h-7 rounded-lg border-2 border-white dark:border-gray-900 bg-blue-100 text-blue-700 flex items-center justify-center text-[9px] font-black" title={r.name}>
                            {r.name.split(' ').map(n => n[0]).join('')}
                        </div>
                    ))}
                 </div>
                 <div className="flex flex-col leading-none">
                    <span className="text-[8px] font-black text-gray-400 uppercase">EKİP</span>
                    <span className="text-[10px] font-black text-blue-600">{resources.length} ÜYE</span>
                 </div>
            </div>
         </div>
      </div>
      {sprintToDelete && <DeleteSprintModal sprint={sprintToDelete} onConfirm={() => { onDeleteSprint(sprintToDelete.id); setSprintToDelete(null); }} onCancel={() => setSprintToDelete(null)} />}
    </div>
  );
};

export default KanbanView;
