
import React, { useState } from 'react';
import { Sprint, UnitLoad, TaskStatus, WorkPackage } from '../types';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  sprint: Sprint;
  workPackages: WorkPackage[];
  onDropTask: (taskId: string, newVersion: number) => void;
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onDelete: (sprint: Sprint) => void;
  onCollapse?: () => void;
  isDragged: boolean;
  isCompact: boolean;
  onSprintDragStart: (sprintId: number) => void;
  onSprintDragEnd: () => void;
  onSprintDrop: (targetSprintId: number) => void;
  onViewTaskDetails: (taskId: string) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ sprint, workPackages, onDropTask, onTaskStatusChange, onDelete, onCollapse, isDragged, isCompact, onSprintDragStart, onSprintDragEnd, onSprintDrop, onViewTaskDetails }) => {
  const [isOver, setIsOver] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsOver(true); };
  const handleDragLeave = () => setIsOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) onDropTask(taskId, sprint.id);
  };

  return (
    <div 
      className={`w-80 min-w-[20rem] bg-gray-50 dark:bg-gray-900/40 rounded-2xl flex flex-col h-full border-2 transition-all duration-300 ${isDragged ? 'opacity-40 scale-95 border-blue-500' : isOver ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'border-transparent'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header (Fixed within Column) */}
      <div className={`flex-none bg-white dark:bg-gray-800 rounded-t-2xl shadow-sm z-10 border-b border-gray-100 dark:border-gray-700 transition-all duration-300 ${isHeaderExpanded ? 'p-4' : 'p-3'}`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2 cursor-pointer group/title" onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}>
             <div className={`w-1.5 h-4 rounded-full transition-all ${sprint.id === 0 ? 'bg-amber-400' : 'bg-blue-500'} ${isHeaderExpanded ? 'scale-100' : 'scale-75'}`}></div>
             <h3 className={`font-bold text-gray-800 dark:text-white truncate transition-all ${isHeaderExpanded ? 'text-base' : 'text-sm'}`}>
                {sprint.title}
             </h3>
             <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[9px] px-1.5 py-0.5 rounded-md font-black">
                {sprint.tasks.length}
             </span>
             <i className={`fa-solid fa-chevron-down text-[10px] text-gray-300 group-hover/title:text-blue-500 transition-transform duration-300 ${isHeaderExpanded ? 'rotate-180' : ''}`}></i>
          </div>
          
          <div className="flex items-center space-x-1">
            {sprint.id === 0 && onCollapse && (
              <button onClick={onCollapse} className="text-gray-300 hover:text-amber-500 p-1.5 transition-colors" title="Backlog'u Daralt">
                <i className="fa-solid fa-chevron-left text-[10px]"></i>
              </button>
            )}
            {sprint.id !== 0 && (
              <button onClick={() => onDelete(sprint)} className="text-gray-300 hover:text-red-500 p-1.5 transition-colors" title="Sürümü Sil">
                <i className="fa-solid fa-trash-can text-[10px]"></i>
              </button>
            )}
            <div className="drag-handle cursor-move text-gray-300 hover:text-blue-500 p-1.5" onMouseDown={() => onSprintDragStart(sprint.id)}>
              <i className="fa-solid fa-grip-lines text-xs"></i>
            </div>
          </div>
        </div>
        
        {/* Collapsible Metadata Area */}
        <div className={`transition-all duration-300 overflow-hidden ${isHeaderExpanded ? 'max-h-64 opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
             {sprint.startDate && (
                 <div className="flex items-center text-[10px] text-gray-400 dark:text-gray-500 font-bold mb-3 bg-gray-50 dark:bg-gray-900/50 p-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                    <i className="fa-regular fa-calendar-alt mr-2 text-blue-500"></i>
                    {sprint.startDate} — {sprint.endDate}
                 </div>
            )}
            
            {/* Load Indicators - Compact Grid */}
            {sprint.id !== 0 && Object.keys(sprint.unitLoads).length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-50 dark:border-gray-700">
                  {Object.entries(sprint.unitLoads).map(([unit, loadData]: [string, UnitLoad]) => {
                      const perc = loadData.capacity > 0 ? (loadData.currentLoad / loadData.capacity) * 100 : 0;
                      const isOverload = perc > 100;
                      return (
                        <div key={unit} className="flex flex-col space-y-1 bg-gray-50 dark:bg-gray-700/50 p-1.5 rounded-md border border-gray-100 dark:border-gray-600">
                            <div className="flex justify-between items-center">
                                <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter truncate w-16">{unit}</span>
                                <span className={`text-[8px] font-black ${isOverload ? 'text-red-500' : 'text-gray-400'}`}>{Math.round(perc)}%</span>
                            </div>
                            <div className="w-full h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${isOverload ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(perc, 100)}%` }}></div>
                            </div>
                        </div>
                      );
                    })}
                </div>
            )}
        </div>
      </div>

      {/* Task Container (Scrollable) */}
      <div className={`flex-grow p-4 overflow-y-auto custom-scrollbar bg-white/50 dark:bg-transparent transition-all ${isCompact ? 'space-y-1.5' : 'space-y-3'}`}>
        {sprint.tasks.map(task => (
          <KanbanCard key={task.id} task={task} workPackages={workPackages} isCompact={isCompact} onViewTaskDetails={onViewTaskDetails} onStatusChange={onTaskStatusChange} />
        ))}
        {sprint.tasks.length === 0 && (
            <div className="h-full min-h-[10rem] flex flex-col items-center justify-center text-gray-300 dark:text-gray-700 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
                <i className="fa-solid fa-inbox text-2xl mb-2 opacity-20"></i>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30">Boş Sürüm</span>
            </div>
        )}
      </div>
    </div>
  );
};

export default KanbanColumn;
