
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Task, Resource, Sprint, UnitLoad, TaskStatus, WorkPackage } from '../types';
import { planTaskVersions } from '../utils/sprintPlanner';
import KanbanColumn from './KanbanColumn';
import { calculatePertFuzzyPert } from '../utils/timeline';
import TestPeriodColumn from './TestPeriodColumn';
import AddSprintColumn from './AddSprintColumn';
import { TEST_DAYS } from '../constants';
import DeleteSprintModal from './DeleteSprintModal';
import FilterDropdown from './FilterDropdown';
import { exportSprintPlanToExcel } from '../utils/exporter';

interface KanbanViewProps {
  tasks: Task[];
  resources: Resource[];
  workPackages: WorkPackage[];
  sprintDuration: number;
  projectStartDate: string;
  onPlanGenerated: (newTasks: Task[]) => void;
  onTaskSprintChange: (taskId: string, newVersion: number) => void;
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onInsertSprint: (sprintNumber: number) => void;
  onDeleteSprint: (sprintNumber: number) => void;
  onOpenSettings: () => void;
  onViewTaskDetails: (taskId: string) => void;
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
    let workdaysToAdd = days - 1; 
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

const KanbanView: React.FC<KanbanViewProps> = ({ tasks, resources, workPackages, sprintDuration, projectStartDate, onPlanGenerated, onTaskSprintChange, onTaskStatusChange, onInsertSprint, onDeleteSprint, onOpenSettings, onViewTaskDetails }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [isCompact, setIsCompact] = useState(true); 
  const [testPeriodDetails, setTestPeriodDetails] = useState<Record<number, { responsible?: string; assignedTaskIds?: string[]; foundDefects?: string }>>({});
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
      console.error(e);
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
        sprintMap.set(i, { id: i, title: i === 0 ? 'Backlog' : `Sürüm ${i}`, tasks: [], unitLoads: {} });
    }

    const sprintNetWorkdays = Math.max(0, (sprintDuration * 5) - TEST_DAYS);
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
        const testEnd = addWorkdays(testStart, TEST_DAYS);
        const details = testPeriodDetails[sprint.id] || {};
        sprint.testPeriod = { startDate: testStart.toLocaleDateString('tr-TR', fmt), endDate: testEnd.toLocaleDateString('tr-TR', fmt), ...details };
        currentProcessingDate = getNextWorkday(testEnd);
      }
    });
    return sorted;
  }, [tasks, filteredTasks, resources, sprintDuration, projectStartDate, testPeriodDetails, extraSprints]);

  useEffect(() => {
    setOrderedSprints(calculatedSprints);
  }, [calculatedSprints]);

  const boardStats = useMemo(() => {
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === TaskStatus.Done).length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      const activeSprints = orderedSprints.filter(s => s.id > 0).length;
      
      let totalLoad = 0;
      let totalCap = 0;
      orderedSprints.forEach(s => {
          if (s.id > 0) {
              Object.values(s.unitLoads).forEach(u => {
                  const unitLoad = u as UnitLoad;
                  totalLoad += unitLoad.currentLoad;
                  totalCap += unitLoad.capacity;
              });
          }
      });
      
      return { totalTasks, completedTasks, progress, activeSprints, totalLoad, totalCap };
  }, [tasks, orderedSprints]);

  const handleDrop = (taskId: string, newVersion: number) => {
    onTaskSprintChange(taskId, newVersion);
  };

  const resetFilters = () => {
    setSearchTerm(''); setFilterUnit('all'); setFilterResource('all'); setFilterPriority('all'); setFilterWorkPackage('all');
  };

  const hasActiveFilters = searchTerm || filterUnit !== 'all' || filterResource !== 'all' || filterPriority !== 'all' || filterWorkPackage !== 'all';

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] bg-gray-50/50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header Area */}
      <div className="flex-none bg-white dark:bg-gray-800 p-4 border-b border-gray-200 dark:border-gray-700 z-20 shadow-sm relative">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
             <div className="p-2 bg-blue-600 rounded-lg text-white shadow-md">
                <i className="fa-solid fa-layer-group text-sm"></i>
             </div>
             <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white leading-none">Sürüm Panosu</h2>
                <div className="flex items-center space-x-3 text-[9px] text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wider font-black">
                  <span className="flex items-center"><i className="fa-solid fa-calendar mr-1 text-blue-500"></i> {new Date(projectStartDate).toLocaleDateString('tr-TR')}</span>
                  <span className="flex items-center"><i className="fa-solid fa-clock mr-1 text-blue-500"></i> {sprintDuration} HAFTA</span>
                </div>
             </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
                onClick={() => setIsCompact(!isCompact)} 
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isCompact ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                title={isCompact ? 'Detaylı Görünüme Geç' : 'Kompakt Planlama Moduna Geç'}
            >
                <i className={`fa-solid ${isCompact ? 'fa-eye' : 'fa-eye-slash'} text-[10px]`}></i>
                <span>{isCompact ? 'Detaylı' : 'Kompakt'}</span>
            </button>

            <button 
                onClick={() => setIsFilterExpanded(!isFilterExpanded)} 
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isFilterExpanded ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
            >
                <i className={`fa-solid ${isFilterExpanded ? 'fa-chevron-up' : 'fa-filter'} text-[10px]`}></i>
                <span>{isFilterExpanded ? 'Filtreleri Kapat' : 'Filtreler'}</span>
                {!isFilterExpanded && hasActiveFilters && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
            </button>

            <button onClick={handleExportPlan} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition-all text-xs font-bold" title="Sürüm Planını Görsel Excel Olarak İndir">
                <i className="fa-solid fa-file-excel mr-1.5"></i>
                Excel Planı İndir
            </button>

            <button onClick={handleGeneratePlan} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg shadow-sm transition-all text-xs font-bold disabled:opacity-50">
              {isLoading ? <i className="fa-solid fa-spinner fa-spin mr-1"></i> : <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>}
              Otomatik Planla
            </button>
            <button onClick={onOpenSettings} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
              <i className="fa-solid fa-sliders text-sm"></i>
            </button>
          </div>
        </div>

        {/* Collapsible Filters */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isFilterExpanded ? 'max-h-64 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2 border-t border-gray-50 dark:border-gray-700">
                <div className="col-span-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Arama</label>
                    <div className="relative">
                        <i className="fa-solid fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]"></i>
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Görev adı/ID..." className="w-full pl-8 pr-2 py-1.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-xs"/>
                    </div>
                </div>
                <FilterDropdown label="Birim" value={filterUnit} onChange={setFilterUnit} options={uniqueUnits} />
                <FilterDropdown label="Kaynak" value={filterResource} onChange={setFilterResource} options={uniqueResources} />
                <FilterDropdown label="Öncelik" value={filterPriority} onChange={setFilterPriority} options={uniquePriorities} />
                <FilterDropdown label="İş Paketi" value={filterWorkPackage} onChange={setFilterWorkPackage} options={uniqueWorkPackages} />
            </div>
            {hasActiveFilters && (
                <div className="flex justify-end mt-2">
                    <button onClick={resetFilters} className="text-[10px] font-bold text-red-500 hover:underline">Filtreleri Temizle</button>
                </div>
            )}
        </div>
      </div>

      {/* Board Content */}
      <div className="flex-grow overflow-x-auto overflow-y-hidden custom-scrollbar bg-gray-50 dark:bg-gray-900/40">
        <div className="inline-flex h-full items-start px-5 py-6">
          {orderedSprints.map((sprint, idx) => (
            <React.Fragment key={sprint.id}>
              {/* Sütunlar arası ekleme alanı */}
              <AddSprintColumn onClick={() => handleAddSprint(sprint.id)} />
              
              <div className="h-full flex flex-col group/col">
                  <div className="flex items-start h-full">
                    <KanbanColumn 
                        sprint={sprint}
                        workPackages={workPackages}
                        onDropTask={handleDrop}
                        onTaskStatusChange={onTaskStatusChange}
                        onDelete={setSprintToDelete}
                        isDragged={draggedSprintId === sprint.id}
                        isCompact={isCompact}
                        onSprintDragStart={setDraggedSprintId}
                        onSprintDragEnd={() => setDraggedSprintId(null)}
                        onSprintDrop={(target) => {
                        setOrderedSprints(current => {
                            const idxA = current.findIndex(s => s.id === draggedSprintId);
                            const idxB = current.findIndex(s => s.id === target);
                            if (idxA === -1 || idxB === -1) return current;
                            const result = [...current];
                            const [removed] = result.splice(idxA, 1);
                            result.splice(idxB, 0, removed);
                            return result;
                        });
                        }}
                        onViewTaskDetails={onViewTaskDetails}
                    />
                    
                    {/* Test Fazı ve Bağımlılık Alanı */}
                    {sprint.id > 0 && (
                        <div className="h-full flex items-start mx-2">
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

              {/* Son ekleme alanı */}
              {idx === orderedSprints.length - 1 && (
                  <AddSprintColumn onClick={() => handleAddSprint(sprint.id + 1)} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Footer Area */}
      <div className="flex-none bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 shadow-lg z-20">
         <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-6">
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tamamlanma Oranı</span>
                    <div className="flex items-center space-x-3 mt-0.5">
                        <div className="w-24 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${boardStats.progress}%` }}></div>
                        </div>
                        <span className="text-xs font-black text-emerald-600">%{boardStats.progress}</span>
                    </div>
                </div>
                
                <div className="h-6 w-px bg-gray-100 dark:bg-gray-700 hidden sm:block"></div>
                
                <div className="flex space-x-5">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sürümler</span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 mt-0.5">{boardStats.activeSprints} Aktif</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Efor / Kapasite</span>
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 mt-0.5">{Math.round(boardStats.totalLoad)} / {Math.round(boardStats.totalCap)} Gün</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center space-x-3">
                 <div className="flex -space-x-1.5">
                    {resources.slice(0, 4).map(r => (
                        <div key={r.id} className="w-7 h-7 rounded-lg border-2 border-white dark:border-gray-800 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[9px] font-black" title={r.name}>
                            {r.name.charAt(0)}
                        </div>
                    ))}
                    {resources.length > 4 && (
                        <div className="w-7 h-7 rounded-lg border-2 border-white dark:border-gray-800 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center text-[9px] font-bold">
                            +{resources.length - 4}
                        </div>
                    )}
                 </div>
                 <span className="text-[10px] text-gray-400 font-bold uppercase ml-2">{resources.length} Ekip Üyesi Aktif</span>
            </div>
         </div>
      </div>

      {sprintToDelete && <DeleteSprintModal sprint={sprintToDelete} onConfirm={() => { onDeleteSprint(sprintToDelete.id); setSprintToDelete(null); }} onCancel={() => setSprintToDelete(null)} />}
    </div>
  );
};

export default KanbanView;
