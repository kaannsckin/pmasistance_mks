import React, { useState, useMemo } from 'react';
import { Task, Resource, WorkPackage, TaskStatus } from '../types';
import { calculateSchedule, ScheduledTask } from '../utils/timeline';
import FilterDropdown from './FilterDropdown';
import GanttChart from './GanttChart';
import DashboardMetrics from './DashboardMetrics';

interface TimelineViewProps {
  tasks: Task[];
  resources: Resource[];
  workPackages: WorkPackage[];
  projectStartDate: string;
  onViewTask: (task: Task) => void;
  onEditTask: (task: Task) => void;
}

const TimelineView: React.FC<TimelineViewProps> = ({ tasks, resources, workPackages, projectStartDate, onViewTask, onEditTask }) => {
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterResource, setFilterResource] = useState('all');
  const [filterVersion, setFilterVersion] = useState('all');
  const [filterWorkPackage, setFilterWorkPackage] = useState('all');

  const uniqueUnits = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.unit)))], [tasks]);
  const uniqueResources = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.resourceName)))], [tasks]);
  const uniqueVersions = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.version.toString())))].sort(), [tasks]);
  const uniqueWorkPackages = useMemo(() => ['all', ...workPackages.map(wp => wp.name)], [workPackages]);
  const workPackageNameToIdMap = useMemo(() => 
    new Map(workPackages.map(wp => [wp.name, wp.id])), 
    [workPackages]
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesUnit = filterUnit === 'all' || task.unit === filterUnit;
      const matchesResource = filterResource === 'all' || task.resourceName === filterResource;
      const matchesVersion = filterVersion === 'all' || task.version.toString() === filterVersion;
      const matchesWorkPackage = filterWorkPackage === 'all' || task.workPackageId === workPackageNameToIdMap.get(filterWorkPackage);
      return matchesUnit && matchesResource && matchesVersion && matchesWorkPackage;
    });
  }, [tasks, filterUnit, filterResource, filterVersion, filterWorkPackage, workPackageNameToIdMap]);

  const scheduledTasks: ScheduledTask[] = useMemo(() => {
    return calculateSchedule(filteredTasks, resources);
  }, [filteredTasks, resources]);

  // Identify Critical Tasks for the "Needs Attention" section
  const criticalTasks = useMemo(() => {
      return tasks.filter(t => 
          (t.priority === 'Blocker' && t.status !== TaskStatus.Done) ||
          (t.time.avg === 0 && t.status !== TaskStatus.Done)
      );
  }, [tasks]);

  return (
    <div className="space-y-8 pb-10">
      
      {/* 1. Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center">
                <i className="fa-solid fa-chart-line text-blue-600 mr-3"></i>
                Proje Genel Bakış
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Projenin anlık durumu, metrikler ve zaman çizelgesi.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full md:w-auto">
          <FilterDropdown label="Birim" value={filterUnit} onChange={setFilterUnit} options={uniqueUnits} />
          <FilterDropdown label="Kaynak" value={filterResource} onChange={setFilterResource} options={uniqueResources} />
          <FilterDropdown label="Sürüm" value={filterVersion} onChange={setFilterVersion} options={uniqueVersions} />
          <FilterDropdown label="İş Paketi" value={filterWorkPackage} onChange={setFilterWorkPackage} options={uniqueWorkPackages} />
        </div>
      </div>

      {/* 2. Metrics & KPI Section */}
      <DashboardMetrics tasks={scheduledTasks} resources={resources} onViewTask={onViewTask} />

      {/* 3. Needs Attention Section (Middle Layer) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           {/* Critical / Blockers List */}
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-red-50 dark:bg-red-900/10 flex justify-between items-center">
                    <h3 className="font-bold text-red-700 dark:text-red-400 flex items-center">
                        <i className="fa-solid fa-fire mr-2"></i>
                        Dikkat Gerektirenler
                    </h3>
                    <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">{criticalTasks.length}</span>
                </div>
                <div className="overflow-y-auto max-h-[300px] p-2 custom-scrollbar">
                    {criticalTasks.length > 0 ? (
                        <div className="space-y-2">
                            {criticalTasks.map(task => (
                                <div key={task.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewTask(task)}>
                                    <div className="flex items-center space-x-3 overflow-hidden">
                                        <div className={`flex-shrink-0 w-1.5 h-10 rounded-full ${task.priority === 'Blocker' ? 'bg-red-500' : 'bg-orange-400'}`}></div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.name}</p>
                                            <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                                                <span className="font-mono bg-gray-100 dark:bg-gray-600 px-1 rounded">{task.jiraId}</span>
                                                <span>{task.resourceName}</span>
                                                {task.time.avg === 0 && <span className="text-orange-500 font-bold"><i className="fa-solid fa-clock-rotate-left mr-1"></i>Süre Girilmemiş</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); onEditTask(task); }} className="text-gray-400 hover:text-blue-500 p-2">
                                        <i className="fa-solid fa-pencil"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 text-green-600">
                            <i className="fa-solid fa-check-circle text-4xl mb-2"></i>
                            <p>Harika! Kritik sorun yok.</p>
                        </div>
                    )}
                </div>
           </div>

           {/* Upcoming Milestones / Simple Summary */}
           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/10">
                    <h3 className="font-bold text-blue-700 dark:text-blue-400 flex items-center">
                        <i className="fa-solid fa-flag-checkered mr-2"></i>
                        Proje Özeti
                    </h3>
                </div>
                <div className="p-6 grid grid-cols-2 gap-4">
                     <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                        <p className="text-gray-500 text-xs uppercase font-bold">Toplam Sürüm</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">
                            {new Set(tasks.map(t => t.version)).size - (tasks.some(t => t.version === 0) ? 1 : 0)}
                        </p>
                     </div>
                     <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                        <p className="text-gray-500 text-xs uppercase font-bold">Ortalama Efor</p>
                        <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">
                             {scheduledTasks.length > 0 ? (scheduledTasks.reduce((acc, t) => acc + t.duration, 0) / scheduledTasks.length).toFixed(1) : 0} Gün
                        </p>
                     </div>
                     <div className="col-span-2 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-between border border-green-100 dark:border-green-800">
                        <div>
                            <p className="text-green-800 dark:text-green-300 font-bold text-sm">Sıradaki Önemli İş</p>
                            <p className="text-green-600 dark:text-green-400 text-xs mt-0.5">Yüksek öncelikli ve henüz başlamamış</p>
                        </div>
                        {(() => {
                            const nextBigThing = tasks.find(t => t.priority === 'High' && t.status === TaskStatus.ToDo);
                            return nextBigThing ? (
                                <div className="text-right max-w-[50%]">
                                    <p className="text-sm font-semibold truncate text-green-900 dark:text-green-100" title={nextBigThing.name}>{nextBigThing.name}</p>
                                    <p className="text-xs text-green-700 dark:text-green-300">{nextBigThing.resourceName}</p>
                                </div>
                            ) : <span className="text-sm text-green-600 italic">Bulunamadı</span>
                        })()}
                     </div>
                </div>
           </div>
      </div>
      
      {/* 4. Gantt Chart Section (Bottom) */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
         <div className="flex justify-between items-center mb-4">
             <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center">
                <i className="fa-solid fa-calendar-days text-gray-500 mr-2"></i>
                Detaylı Zaman Çizelgesi
             </h2>
         </div>
         {scheduledTasks.length > 0 ? (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
                <GanttChart
                  tasks={scheduledTasks}
                  projectStartDate={projectStartDate}
                  onViewTask={onViewTask}
                  onEditTask={onEditTask}
                />
            </div>
         ) : (
            <div className="text-center py-16">
                <i className="fa-solid fa-chart-gantt text-5xl text-gray-400"></i>
                <h3 className="mt-4 text-xl font-medium text-gray-700 dark:text-gray-300">Görüntülenecek Görev Yok</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Filtre kriterlerini değiştirin veya yeni görevler ekleyin.</p>
            </div>
         )}
      </div>
    </div>
  );
};

export default TimelineView;