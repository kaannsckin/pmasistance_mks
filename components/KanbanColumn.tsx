
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
  onUpdateSprintName?: (name: string) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ sprint, workPackages, onDropTask, onTaskStatusChange, onDelete, onCollapse, isDragged, isCompact, onSprintDragStart, onSprintDragEnd, onSprintDrop, onViewTaskDetails, onUpdateSprintName }) => {
  const [isOver, setIsOver] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [isSprintDraggable, setIsSprintDraggable] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(sprint.title);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = () => setIsOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const taskId = e.dataTransfer.getData('taskId');
    const sprintId = e.dataTransfer.getData('sprintId');
    if (taskId) {
        onDropTask(taskId, sprint.id);
    } else if (sprintId) {
        onSprintDrop(sprint.id);
    }
  };

  const handleColumnDragStart = (e: React.DragEvent) => {
      e.dataTransfer.setData('sprintId', sprint.id.toString());
      onSprintDragStart(sprint.id);
  };

  const handleSaveTitle = () => {
    if (tempTitle.trim() && onUpdateSprintName) {
        onUpdateSprintName(tempTitle.trim());
    }
    setIsEditingTitle(false);
  };

  return (
    <div 
      draggable={isSprintDraggable}
      onDragStart={handleColumnDragStart}
      onDragEnd={() => { setIsSprintDraggable(false); onSprintDragEnd(); }}
      className={`w-[20rem] min-w-[20rem] bg-white/60 dark:bg-gray-900/60 backdrop-blur-md rounded-2xl flex flex-col h-full border transition-all duration-300 ${isDragged ? 'opacity-40 scale-95 border-blue-500' : isOver ? 'bg-blue-50/40 dark:bg-blue-900/10 border-blue-400 shadow-lg' : 'border-gray-100 dark:border-gray-800 shadow-sm'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`flex-none bg-white dark:bg-gray-800 rounded-t-2xl p-4 z-10 border-b border-gray-50 dark:border-gray-800`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2.5 cursor-pointer group/title min-w-0 flex-grow" onClick={() => !isEditingTitle && setIsHeaderExpanded(!isHeaderExpanded)}>
             <div className={`w-1.5 h-5 rounded-full shadow-sm flex-shrink-0 ${sprint.id === 0 ? 'bg-amber-400' : 'bg-blue-500'}`}></div>
             <div className="flex flex-col min-w-0 flex-grow">
                {isEditingTitle ? (
                    <input 
                        autoFocus 
                        value={tempTitle} 
                        onChange={e => setTempTitle(e.target.value)}
                        onBlur={handleSaveTitle}
                        onKeyDown={e => e.key === 'Enter' && handleSaveTitle()}
                        className="bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded px-1.5 py-0.5 text-xs font-black uppercase text-blue-700 dark:text-blue-300 w-full outline-none"
                    />
                ) : (
                    <div className="flex items-center space-x-1.5 group">
                        <h3 className="font-black text-gray-800 dark:text-white truncate text-xs tracking-tight leading-none uppercase">
                            {sprint.title}
                        </h3>
                        {sprint.id !== 0 && (
                            <button onClick={(e) => { e.stopPropagation(); setIsEditingTitle(true); }} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-500">
                                <i className="fa-solid fa-pencil text-[9px]"></i>
                            </button>
                        )}
                    </div>
                )}
                {sprint.startDate && !isHeaderExpanded && (
                    <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-tighter">
                        {sprint.startDate} - {sprint.endDate}
                    </span>
                )}
             </div>
             <span className="bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-[9px] w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-lg font-black border border-gray-100 dark:border-gray-600">
                {sprint.tasks.length}
             </span>
          </div>
          
          <div className="flex items-center space-x-1 flex-shrink-0">
            {sprint.id === 0 && onCollapse && (
              <button onClick={onCollapse} className="text-gray-300 hover:text-amber-500 p-1.5 rounded-lg hover:bg-amber-50 transition-all">
                <i className="fa-solid fa-chevron-left text-[10px]"></i>
              </button>
            )}
            {sprint.id !== 0 && (
              <button onClick={() => onDelete(sprint)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all">
                <i className="fa-solid fa-trash text-[10px]"></i>
              </button>
            )}
            <div className="drag-handle cursor-grab active:cursor-grabbing text-gray-300 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50 transition-all" onMouseDown={() => setIsSprintDraggable(true)} onMouseUp={() => setIsSprintDraggable(false)}>
              <i className="fa-solid fa-grip-vertical text-[10px]"></i>
            </div>
          </div>
        </div>
        <div className={`transition-all duration-300 overflow-hidden ${isHeaderExpanded ? 'max-h-64 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
            {sprint.id !== 0 && Object.keys(sprint.unitLoads).length > 0 && (
                <div className="space-y-2 pt-3 border-t border-gray-50 dark:border-gray-800">
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(sprint.unitLoads).map(([unit, loadData]: [string, UnitLoad]) => {
                        const perc = loadData.capacity > 0 ? (loadData.currentLoad / loadData.capacity) * 100 : 0;
                        const isOverload = perc > 100;
                        return (
                          <div key={unit} className="flex flex-col space-y-1 bg-gray-50 dark:bg-gray-900/50 p-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                              <div className="flex justify-between items-center px-0.5">
                                  <span className="text-[7px] font-black text-gray-500 uppercase truncate w-16">{unit}</span>
                                  <span className={`text-[8px] font-black ${isOverload ? 'text-red-500' : 'text-gray-400'}`}>{Math.round(perc)}%</span>
                              </div>
                              <div className="w-full h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-500 ${isOverload ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(perc, 100)}%` }}></div>
                              </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
            )}
        </div>
      </div>
      <div className={`flex-grow p-3 overflow-y-auto custom-scrollbar transition-all ${isCompact ? 'space-y-1.5' : 'space-y-3'}`}>
        {sprint.tasks.map(task => (
          <KanbanCard key={task.id} task={task} workPackages={workPackages} isCompact={isCompact} onViewTaskDetails={onViewTaskDetails} onStatusChange={onTaskStatusChange} />
        ))}
        {sprint.tasks.length === 0 && (
            <div className="h-40 flex flex-col items-center justify-center opacity-20">
                <i className="fa-solid fa-inbox text-2xl mb-2"></i>
                <span className="text-[8px] font-black uppercase tracking-widest">BOŞ</span>
            </div>
        )}
      </div>
    </div>
  );
};

export default KanbanColumn;
