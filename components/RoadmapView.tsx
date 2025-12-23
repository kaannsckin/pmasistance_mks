
import React, { useMemo, useState } from 'react';
import { Task, TaskStatus, WorkPackage, Resource } from '../types';

interface RoadmapViewProps {
  tasks: Task[];
  resources: Resource[];
  workPackages: WorkPackage[];
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onNewTask: () => void;
  onEditTask: (task: Task) => void;
}

// NEW: Vibrant, solid color palette inspired by the image.
const VIBRANT_PRIORITY_COLORS: Record<Task['priority'], { bg: string, text: string, progressBg: string, progressFill: string }> = {
  Blocker: { bg: 'bg-red-400', text: 'text-red-950', progressBg: 'bg-black/20', progressFill: 'bg-red-900' },
  High:    { bg: 'bg-yellow-400', text: 'text-yellow-950', progressBg: 'bg-black/20', progressFill: 'bg-yellow-900' },
  Medium:  { bg: 'bg-blue-400', text: 'text-blue-950', progressBg: 'bg-black/20', progressFill: 'bg-blue-900' },
  Low:     { bg: 'bg-green-400', text: 'text-green-950', progressBg: 'bg-black/20', progressFill: 'bg-green-900' },
};

const COLUMN_INDICATORS: Record<TaskStatus, string> = {
    [TaskStatus.ToDo]: 'bg-gray-400',
    [TaskStatus.InProgress]: 'bg-blue-400',
    [TaskStatus.Done]: 'bg-green-400',
    [TaskStatus.Backlog]: 'bg-red-400',
};


const columnConfig: { id: TaskStatus, label: string }[] = [
    { id: TaskStatus.ToDo, label: 'Yapılacaklar' },
    { id: TaskStatus.InProgress, label: 'Süreçte' },
    { id: TaskStatus.Done, label: 'Tamamlandı' }
];

// --- Helper Functions ---
const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toLocaleUpperCase('tr-TR');
const isOverdue = (dueDate?: string) => dueDate && new Date(dueDate) < new Date();
const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

// --- RoadmapCard Component ---
const RoadmapCard: React.FC<{ task: Task, onEditTask: (task: Task) => void }> = React.memo(({ task, onEditTask }) => {
    const { bg, text, progressBg, progressFill } = VIBRANT_PRIORITY_COLORS[task.priority];
    
    const progress = useMemo(() => {
        if (!task.subtasks || task.subtasks.length === 0) return null;
        const completed = task.subtasks.filter(st => st.completed).length;
        const total = task.subtasks.length;
        return {
            percent: (completed / total) * 100,
            text: `${completed}/${total}`
        };
    }, [task.subtasks]);

    const overdue = isOverdue(task.dueDate);

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('taskId', task.id);
        e.currentTarget.classList.add('opacity-50', 'rotate-3');
    };
    
    const handleDragEnd = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('opacity-50', 'rotate-3');
    };

    return (
        <div 
            draggable 
            onClick={() => onEditTask(task)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={`rounded-lg shadow-md hover:shadow-lg hover:-translate-y-px cursor-grab active:cursor-grabbing transition-all p-3.5 space-y-3 ${bg} ${text}`}
        >
            <div className="flex justify-between items-start">
                <h3 className="font-bold text-sm leading-snug pr-2">{task.name}</h3>
                <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center text-xs font-bold ring-2 ring-black/10 flex-shrink-0" title={task.resourceName}>
                    {getInitials(task.resourceName)}
                </div>
            </div>
            
            {progress && (
                 <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold opacity-70">
                        <span>İlerleme</span>
                        <span>{progress.text}</span>
                    </div>
                    <div className={`w-full h-1.5 rounded-full ${progressBg}`}>
                        <div className={`h-full rounded-full ${progressFill}`} style={{ width: `${progress.percent}%` }}></div>
                    </div>
                </div>
            )}
            
            <div className="flex justify-between items-center pt-2 min-h-[26px]">
                <div className="flex items-center space-x-2">
                    {task.dueDate && (
                        <div className={`flex items-center space-x-1.5 text-xs font-semibold px-2 py-0.5 rounded-md ${overdue ? 'bg-red-900/80 text-white' : 'bg-black/10'}`}>
                            <i className="fa-solid fa-calendar-days text-xs opacity-70"></i>
                            <span>{formatDate(task.dueDate)}</span>
                        </div>
                    )}
                     <div className="flex items-center space-x-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-black/10">
                        <i className="fa-solid fa-comment-dots text-xs opacity-70"></i>
                        <span>{task.subtasks?.length || 0}</span>
                    </div>
                </div>
                <button className="text-black/30 hover:text-black/70 p-1 rounded-md">
                  <i className="fa-solid fa-ellipsis-h text-xs"></i>
                </button>
            </div>
        </div>
    );
});

// --- RoadmapView Main Component ---
const RoadmapView: React.FC<RoadmapViewProps> = ({ tasks, onTaskStatusChange, onNewTask, onEditTask }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
    const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

    const CURRENT_USER = 'Kaan'; // Mock current user for "My Tasks"

    const toggleFilter = (filter: string) => {
        setActiveFilters(prev => {
            const newSet = new Set(prev);
            if (newSet.has(filter)) newSet.delete(filter);
            else newSet.add(filter);
            return newSet;
        });
    };

    const filteredTasks = useMemo(() => {
        const lowerSearch = searchTerm.toLocaleLowerCase();
        const now = new Date();
        const threeDaysFromNow = new Date(now.setDate(now.getDate() + 3));

        return tasks.filter(task => {
            if (searchTerm && !task.name.toLocaleLowerCase().includes(lowerSearch)) return false;
            if (activeFilters.has('my-tasks') && task.resourceName !== CURRENT_USER) return false;
            if (activeFilters.has('due-soon') && (!task.dueDate || new Date(task.dueDate) > threeDaysFromNow)) return false;
            return true;
        });
    }, [tasks, searchTerm, activeFilters]);

    const columns = useMemo(() => {
        const columnMap: Record<TaskStatus, Task[]> = {
            [TaskStatus.ToDo]: [],
            [TaskStatus.InProgress]: [],
            [TaskStatus.Done]: [],
            [TaskStatus.Backlog]: [],
        };
        
        filteredTasks.forEach(task => {
            const statusKey = (task.status === TaskStatus.Backlog) ? TaskStatus.ToDo : task.status;
            if (columnMap[statusKey]) {
                columnMap[statusKey].push(task);
            }
        });

        return columnConfig.map(col => ({ ...col, tasks: columnMap[col.id] || [] }));
    }, [filteredTasks]);
    
    const stats = useMemo(() => ({
        done: tasks.filter(t => t.status === TaskStatus.Done).length,
        inProgress: tasks.filter(t => t.status === TaskStatus.InProgress).length
    }), [tasks]);

    const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
        e.preventDefault();
        setDragOverColumn(null);
        const taskId = e.dataTransfer.getData('taskId');
        if (taskId) {
            onTaskStatusChange(taskId, status);
        }
    };
    
    return (
        <div className="h-full bg-[#18181B] text-gray-200 flex flex-col font-sans overflow-hidden">
            {/* Control Bar */}
            <header className="flex-none p-4 px-6 border-b border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 bg-[#18181B]/80 backdrop-blur-sm sticky top-0 z-20">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-bold">Yol Haritası</h1>
                    <div className="relative">
                        <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs"></i>
                        <input 
                            type="text"
                            placeholder="Akıllı arama..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-[#27272A] border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none w-48 transition-all"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        {['my-tasks', 'due-soon'].map(filter => (
                            <button key={filter} onClick={() => toggleFilter(filter)} className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors ${activeFilters.has(filter) ? 'bg-blue-500 border-blue-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}>
                                {filter === 'my-tasks' ? 'Görevlerim' : 'Yaklaşanlar'}
                            </button>
                        ))}
                    </div>
                    <div className="w-px h-5 bg-gray-700"></div>
                    <div className="flex items-center gap-4 text-xs font-semibold text-gray-400">
                        <span><i className="fa-solid fa-check-circle text-green-500 mr-1.5"></i>{stats.done} Tamamlandı</span>
                        <span><i className="fa-solid fa-circle-notch text-blue-500 mr-1.5 animate-spin [animation-duration:3s]"></i>{stats.inProgress} Süreçte</span>
                    </div>
                </div>
            </header>

            {/* Kanban Board */}
            <main className="flex-grow p-4 md:p-6 overflow-x-auto overflow-y-hidden">
                <div className="flex h-full gap-6">
                    {columns.map((col) => (
                        <div 
                            key={col.id} 
                            onDragOver={(e) => { e.preventDefault(); setDragOverColumn(col.id); }}
                            onDragLeave={() => setDragOverColumn(null)}
                            onDrop={(e) => handleDrop(e, col.id)}
                            className={`w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col rounded-xl transition-colors ${dragOverColumn === col.id ? 'bg-white/5' : ''}`}
                        >
                            <div className="flex-none flex items-center justify-between p-2 mb-2">
                                <div className="flex items-center gap-2.5">
                                    <div className={`w-2 h-2 rounded-full ${COLUMN_INDICATORS[col.id]}`}></div>
                                    <span className="font-bold text-gray-300">{col.label}</span>
                                    <span className="text-xs font-semibold bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">{col.tasks.length}</span>
                                </div>
                            </div>
                            <div className="flex-grow space-y-4 overflow-y-auto pr-2 pb-4">
                                {col.tasks.map((task) => <RoadmapCard key={task.id} task={task} onEditTask={onEditTask} />)}
                            </div>
                             <button onClick={onNewTask} className="flex-none mt-auto w-full text-center p-3 rounded-lg text-sm font-semibold text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors">
                                <i className="fa-solid fa-plus mr-2"></i>
                                Görev Ekle
                            </button>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
};

export default RoadmapView;
