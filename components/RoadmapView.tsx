
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Task, TaskStatus, WorkPackage, Resource } from '../types';

interface RoadmapViewProps {
  tasks: Task[];
  resources: Resource[];
  workPackages: WorkPackage[];
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onNewTask: () => void;
  onViewTask: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

const columnConfig: { id: TaskStatus, label: string, icon: string, iconColor: string }[] = [
    { id: TaskStatus.ToDo, label: 'Yapılacaklar', icon: 'fa-list-check', iconColor: 'text-gray-400' },
    { id: TaskStatus.InProgress, label: 'Süreçte', icon: 'fa-person-digging', iconColor: 'text-blue-400' },
    { id: TaskStatus.Done, label: 'Tamamlandı', icon: 'fa-circle-check', iconColor: 'text-emerald-400' }
];

const PRIORITY_CLASSES: Record<Task['priority'], { border: string, text: string, bg: string }> = {
  Blocker: { border: 'border-l-red-500', text: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/40' },
  High:    { border: 'border-l-orange-500', text: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  Medium:  { border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' },
  Low:     { border: 'border-l-gray-400', text: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-700/40' }
};

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toLocaleUpperCase('tr-TR');

const RoadmapCard: React.FC<{
    task: Task;
    workPackage?: WorkPackage;
    onViewTask: (task: Task) => void;
    onEditTask: (task: Task) => void;
    onDeleteTask: (taskId: string) => void;
}> = React.memo(({ task, workPackage, onViewTask, onEditTask, onDeleteTask }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const priorityStyle = PRIORITY_CLASSES[task.priority];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('taskId', task.id);
        e.currentTarget.classList.add('opacity-40');
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={(e) => e.currentTarget.classList.remove('opacity-40')}
            onClick={() => onViewTask(task)}
            className={`group bg-white dark:bg-[#202020] border border-gray-200 dark:border-gray-700/50 rounded-lg shadow-sm hover:shadow-lg hover:-translate-y-px cursor-pointer transition-all relative border-l-4 ${priorityStyle.border}`}
        >
            <div className="p-4 space-y-3">
                <h3 className="text-sm text-[#37352F] dark:text-gray-200 font-semibold leading-snug">{task.name}</h3>
                
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${priorityStyle.bg} ${priorityStyle.text}`}>
                        {task.priority}
                    </span>
                    {workPackage && (
                        <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                           <i className="fa-solid fa-briefcase mr-1.5 opacity-50"></i> {workPackage.name}
                        </span>
                    )}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-700/50">
                    <div className="text-xs text-gray-400 font-mono">{task.jiraId}</div>
                    {task.resourceName && (
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs font-bold border border-gray-200 dark:border-gray-600" title={task.resourceName}>
                            {getInitials(task.resourceName)}
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute top-2 right-2" ref={menuRef}>
                <button
                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(prev => !prev); }}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-opacity"
                >
                    <i className="fa-solid fa-ellipsis-h text-sm"></i>
                </button>
                {isMenuOpen && (
                    <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-2xl z-10 animate-fade-in-up">
                        <button onClick={(e) => { e.stopPropagation(); onEditTask(task); setIsMenuOpen(false); }} className="w-full text-left text-xs px-3 py-2 flex items-center space-x-2 hover:bg-gray-50 dark:hover:bg-gray-700"><i className="fa-solid fa-pencil text-gray-400"></i><span>Düzenle</span></button>
                        <button onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); setIsMenuOpen(false); }} className="w-full text-left text-xs px-3 py-2 flex items-center space-x-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"><i className="fa-solid fa-trash-can"></i><span>Sil</span></button>
                    </div>
                )}
            </div>
        </div>
    );
});

const RoadmapView: React.FC<RoadmapViewProps> = ({ tasks, resources, workPackages, onTaskStatusChange, onNewTask, onViewTask, onEditTask, onDeleteTask }) => {
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [filterResource, setFilterResource] = useState('all');
  const [filterWorkPackage, setFilterWorkPackage] = useState('all');

  const uniqueResources = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.resourceName).filter(Boolean)))], [tasks]);
  const uniqueWorkPackages = useMemo(() => ['all', ...workPackages.map(wp => wp.name)], [workPackages]);
  
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
        const matchesResource = filterResource === 'all' || task.resourceName === filterResource;
        const wpName = workPackages.find(wp => wp.id === task.workPackageId)?.name;
        const matchesWorkPackage = filterWorkPackage === 'all' || wpName === filterWorkPackage;
        return matchesResource && matchesWorkPackage;
    });
  }, [tasks, filterResource, filterWorkPackage, workPackages]);

  const columns = useMemo(() => ({
    [TaskStatus.ToDo]: filteredTasks.filter(t => t.status === TaskStatus.ToDo || t.status === TaskStatus.Backlog),
    [TaskStatus.InProgress]: filteredTasks.filter(t => t.status === TaskStatus.InProgress),
    [TaskStatus.Done]: filteredTasks.filter(t => t.status === TaskStatus.Done)
  }), [filteredTasks]);

  const stats = useMemo(() => {
      const total = filteredTasks.length;
      const done = columns[TaskStatus.Done].length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      return { total, done, progress };
  }, [filteredTasks, columns]);

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      onTaskStatusChange(taskId, status);
    }
  };

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900/50 p-6 flex flex-col">
      <header className="flex-none flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
            <h1 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight flex items-center">Yol Haritası</h1>
            <div className="flex items-center space-x-4 mt-2">
                <div className="w-48 h-1 bg-gray-200 dark:bg-gray-700 rounded-full"><div className="h-1 bg-primary rounded-full" style={{ width: `${stats.progress}%` }}></div></div>
                <span className="text-xs font-bold text-gray-400">{stats.done}/{stats.total} Tamamlandı (%{stats.progress})</span>
            </div>
        </div>
        <div className="flex items-center space-x-2">
            <FilterDropdown label="Kişi" value={filterResource} onChange={setFilterResource} options={uniqueResources} />
            <FilterDropdown label="Paket" value={filterWorkPackage} onChange={setFilterWorkPackage} options={uniqueWorkPackages} />
        </div>
      </header>

      <main className="flex-grow flex h-full space-x-6 overflow-x-auto pb-4">
        {columnConfig.map((col) => {
            const tasksInCol = columns[col.id as keyof typeof columns];
            return (
              <div 
                key={col.id} 
                className={`flex-1 min-w-[340px] flex flex-col rounded-xl transition-colors ${dragOverColumn === col.id ? 'bg-gray-100 dark:bg-gray-800/20' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverColumn(col.id); }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => handleDrop(e, col.id as TaskStatus)}
              >
                <div className="flex-none flex items-center justify-between mb-4 px-2 group">
                  <div className="flex items-center space-x-2.5">
                    <i className={`fa-solid ${col.icon} ${col.iconColor} text-sm`}></i>
                    <span className="font-bold text-gray-600 dark:text-gray-300">{col.label}</span>
                    <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 px-2 py-0.5 rounded-full">{tasksInCol.length}</span>
                  </div>
                  <button onClick={onNewTask} className="text-gray-400 hover:text-primary dark:hover:text-primary p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <i className="fa-solid fa-plus text-sm"></i>
                  </button>
                </div>

                <div className="flex-grow space-y-3 overflow-y-auto pr-2 pb-20">
                    {tasksInCol.map((task) => (
                        <RoadmapCard 
                            key={task.id} 
                            task={task} 
                            workPackage={workPackages.find(w => w.id === task.workPackageId)}
                            onViewTask={onViewTask}
                            onEditTask={onEditTask}
                            onDeleteTask={onDeleteTask}
                        />
                    ))}
                    <button onClick={onNewTask} className="w-full text-sm p-3 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <i className="fa-solid fa-plus mr-2"></i> Yeni Görev Ekle
                    </button>
                </div>
              </div>
            );
        })}
      </main>
    </div>
  );
};

const FilterDropdown: React.FC<{ label:string, value: string, onChange: (v: string) => void, options: string[] }> = ({ label, value, onChange, options }) => {
    return (
        <div className="flex items-center space-x-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg px-3 py-1.5 shadow-sm">
            <label className="text-xs font-bold text-gray-400">{label}:</label>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-xs font-semibold text-gray-700 dark:text-gray-200 p-0 pr-6"
            >
                {options.map(opt => <option key={opt} value={opt}>{opt === 'all' ? 'Tümü' : opt}</option>)}
            </select>
        </div>
    );
};

export default RoadmapView;
