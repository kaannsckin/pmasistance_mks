
import React from 'react';
import { Task, TaskStatus, WorkPackage } from '../types';

interface KanbanCardProps {
  task: Task;
  workPackages: WorkPackage[];
  isCompact?: boolean;
  onViewTaskDetails: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'bg-red-500',
    [TaskStatus.ToDo]: 'bg-slate-400',
    [TaskStatus.InProgress]: 'bg-blue-500',
    [TaskStatus.Done]: 'bg-emerald-500',
};

const PRIORITY_THEMES: Record<string, string> = {
    Blocker: 'text-red-700 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800',
    High: 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800',
    Medium: 'text-blue-700 bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
    Low: 'text-slate-600 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
};

const KanbanCard: React.FC<KanbanCardProps> = ({ task, workPackages, isCompact, onViewTaskDetails, onStatusChange }) => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('taskId', task.id);
    e.currentTarget.style.opacity = '0.5';
    e.stopPropagation();
  };
  
  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.style.opacity = '1';
  }
  
  const wp = workPackages.find(w => w.id === task.workPackageId);

  // Compact View Render
  if (isCompact) {
    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => onViewTaskDetails(task.id)}
            className="bg-white dark:bg-gray-800 py-2.5 px-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing hover:border-blue-400 hover:shadow-md transition-all flex items-center space-x-3 relative group"
        >
            <div className={`w-1.5 h-6 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status]}`}></div>
            <div className="flex flex-col flex-grow min-w-0">
                <div className="flex items-center space-x-1.5 mb-0.5">
                    <span className={`w-2 h-1 rounded-full flex-shrink-0 ${task.priority === 'Blocker' ? 'bg-red-500' : task.priority === 'High' ? 'bg-orange-500' : 'bg-blue-400'}`}></span>
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter truncate">{task.jiraId}</span>
                </div>
                <h4 className="text-[11px] font-bold text-gray-700 dark:text-gray-200 truncate leading-tight">
                    {task.name}
                </h4>
            </div>
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <i className="fa-solid fa-magnifying-glass-plus text-[10px] text-gray-300"></i>
            </div>
        </div>
    );
  }

  // Detailed View Render
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 cursor-grab active:cursor-grabbing mb-3 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all group overflow-hidden relative"
    >
      {/* Left status bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${STATUS_COLORS[task.status]}`}></div>

      <div className="flex justify-between items-start mb-3">
        <div className="flex flex-wrap gap-1.5">
           <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_THEMES[task.priority]}`}>
              {task.priority}
           </span>
           {wp && (
            <span className="text-[10px] bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium border border-purple-100 dark:border-purple-800 truncate max-w-[100px]">
              {wp.name}
            </span>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onViewTaskDetails(task.id); }} className="text-gray-400 hover:text-blue-600 transition-colors p-1">
          <i className="fa-solid fa-expand text-xs"></i>
        </button>
      </div>

      <h4 className="font-bold text-sm text-gray-800 dark:text-gray-100 leading-snug mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
        {task.name}
      </h4>

      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50 dark:border-gray-700">
        <div className="flex items-center space-x-3">
            <div className="flex items-center text-[10px] text-gray-500 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-600">
                <i className="fa-brands fa-jira mr-1.5 opacity-60"></i>
                {task.jiraId || 'No ID'}
            </div>
            <div className="flex items-center text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                <i className="fa-solid fa-cube mr-1 opacity-60"></i>
                {task.unit}
            </div>
        </div>
        
        <div className="flex items-center" title={task.resourceName}>
             <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                {task.resourceName.split(' ').map(n => n[0]).slice(0,2).join('')}
             </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
         <select
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
            className="text-[10px] bg-gray-50 dark:bg-gray-700 border-none rounded-lg px-2 py-1 text-gray-600 dark:text-gray-300 font-bold focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
        >
           <option value={TaskStatus.ToDo}>Yapılacak</option>
           <option value={TaskStatus.InProgress}>Süreçte</option>
           <option value={TaskStatus.Done}>Tamamlandı</option>
           <option value={TaskStatus.Backlog}>Gecikmiş</option>
        </select>
        <span className="text-[10px] font-mono text-gray-400 font-bold">v{task.version}</span>
      </div>
    </div>
  );
};

export default KanbanCard;
