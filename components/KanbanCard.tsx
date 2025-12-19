
import React from 'react';
import { Task, TaskStatus, WorkPackage } from '../types';

interface KanbanCardProps {
  task: Task;
  workPackages: WorkPackage[];
  isCompact?: boolean;
  onViewTaskDetails: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

const STATUS_INDICATORS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: 'bg-red-500',
    [TaskStatus.ToDo]: 'bg-slate-400',
    [TaskStatus.InProgress]: 'bg-blue-500',
    [TaskStatus.Done]: 'bg-emerald-500',
};

const PRIORITY_THEMES: Record<string, string> = {
    Blocker: 'text-red-700 bg-red-50 border-red-100',
    High: 'text-orange-700 bg-orange-50 border-orange-100',
    Medium: 'text-blue-700 bg-blue-50 border-blue-100',
    Low: 'text-gray-600 bg-gray-50 border-gray-200',
};

const KanbanCard: React.FC<KanbanCardProps> = ({ task, workPackages, isCompact, onViewTaskDetails, onStatusChange }) => {
  const isDone = task.status === TaskStatus.Done;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('taskId', task.id);
    e.currentTarget.style.opacity = '0.5';
    e.stopPropagation();
  };
  
  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
      e.currentTarget.style.opacity = '1';
  }
  
  const wp = workPackages.find(w => w.id === task.workPackageId);

  if (isCompact) {
    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => onViewTaskDetails(task.id)}
            className={`p-2.5 rounded-xl border cursor-grab hover:border-blue-400 hover:shadow-md transition-all flex items-center space-x-2.5 relative group ${isDone ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-100' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}
        >
            <div className={`w-0.5 h-6 rounded-full flex-shrink-0 ${STATUS_INDICATORS[task.status]}`}></div>
            <div className="flex flex-col flex-grow min-w-0">
                <span className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest truncate">{task.jiraId || 'TASK'}</span>
                <h4 className={`text-[10px] font-bold truncate leading-tight tracking-tight mt-0.5 ${isDone ? 'text-emerald-800 dark:text-emerald-200' : 'text-gray-700 dark:text-gray-300'}`}>
                    {task.name}
                </h4>
            </div>
            {isDone && <i className="fa-solid fa-check-circle text-emerald-500 text-[10px]"></i>}
        </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`p-4 rounded-2xl border cursor-grab hover:shadow-lg hover:border-blue-300 transition-all group relative overflow-hidden ${isDone ? 'bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-100' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${STATUS_INDICATORS[task.status]}`}></div>

      <div className="flex justify-between items-center mb-3">
        <div className="flex gap-1.5 overflow-hidden">
           <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider ${PRIORITY_THEMES[task.priority]}`}>
              {task.priority}
           </span>
           {wp && (
            <span className="text-[8px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-black border border-purple-100 truncate max-w-[80px] uppercase tracking-wider">
              {wp.name}
            </span>
          )}
        </div>
        {isDone && <i className="fa-solid fa-circle-check text-emerald-500 text-xs"></i>}
      </div>

      <h4 className={`font-bold text-[11.5px] leading-[1.3] mb-4 line-clamp-2 ${isDone ? 'text-emerald-900 dark:text-emerald-100 opacity-80' : 'text-gray-800 dark:text-gray-100'}`}>
        {task.name}
      </h4>

      <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-gray-800">
        <div className="flex items-center space-x-3">
            <span className="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase font-mono tracking-tighter">
                <i className="fa-brands fa-jira mr-1 text-blue-500/60"></i>
                {task.jiraId || 'N/A'}
            </span>
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
                <i className="fa-solid fa-cube mr-1 text-blue-400/50"></i>
                {task.unit}
            </span>
        </div>
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-black border ${isDone ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
            {task.resourceName.split(' ').map(n => n[0]).join('')}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
         <select
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
            className="text-[8px] bg-gray-50 dark:bg-gray-800 border-none rounded-lg px-2 py-1 font-black uppercase tracking-widest focus:ring-0 cursor-pointer"
        >
           <option value={TaskStatus.ToDo}>Yapılacak</option>
           <option value={TaskStatus.InProgress}>Süreçte</option>
           <option value={TaskStatus.Done}>Tamamlandı</option>
        </select>
        <button onClick={() => onViewTaskDetails(task.id)} className="text-gray-300 hover:text-blue-500 p-1 transition-colors">
            <i className="fa-solid fa-expand text-[10px]"></i>
        </button>
      </div>
    </div>
  );
};

export default KanbanCard;
