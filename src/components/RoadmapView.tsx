
import React, { useMemo } from 'react';
import { Task, TaskStatus, WorkPackage, Resource } from '../types';

interface RoadmapViewProps {
  tasks: Task[];
  resources: Resource[];
  workPackages: WorkPackage[];
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onNewTask: () => void;
  onEditTask: (task: Task) => void;
}

const RoadmapView: React.FC<RoadmapViewProps> = ({ tasks, resources, workPackages, onTaskStatusChange, onNewTask, onEditTask }) => {
  
  // Sütunları basitleştirilmiş durumlara göre grupla
  const columns = useMemo(() => {
    return {
      [TaskStatus.ToDo]: tasks.filter(t => t.status === TaskStatus.ToDo || t.status === TaskStatus.Backlog),
      [TaskStatus.InProgress]: tasks.filter(t => t.status === TaskStatus.InProgress),
      [TaskStatus.Done]: tasks.filter(t => t.status === TaskStatus.Done)
    };
  }, [tasks]);

  const columnConfig = [
    { id: TaskStatus.ToDo, label: 'Yapılacaklar', count: columns[TaskStatus.ToDo].length },
    { id: TaskStatus.InProgress, label: 'Süreçte', count: columns[TaskStatus.InProgress].length },
    { id: TaskStatus.Done, label: 'Tamamlandı', count: columns[TaskStatus.Done].length }
  ];

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      // Backlog'dan gelenleri ToDo yap, diğerlerini olduğu gibi aktar
      const finalStatus = status === TaskStatus.Backlog ? TaskStatus.ToDo : status;
      onTaskStatusChange(taskId, finalStatus);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Pastel renkler (Notion stili etiketler)
  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Blocker': return 'bg-[#FFD5CC] text-[#6E3630]'; // Red-ish
      case 'High': return 'bg-[#FFE2DD] text-[#5D1715]'; // Orange-ish
      case 'Medium': return 'bg-[#D3E5EF] text-[#183347]'; // Blue-ish
      default: return 'bg-[#E3E2E0] text-[#32302C]'; // Gray
    }
  };

  return (
    <div className="h-full bg-white dark:bg-[#191919] p-8 overflow-x-auto min-h-[calc(100vh-5rem)]">
      <div className="flex space-x-3 mb-8 items-center border-b border-[#E9E9E7] dark:border-[#2F2F2F] pb-4">
        <div className="p-2 bg-gray-100 dark:bg-[#2C2C2C] rounded-md shadow-sm">
            <i className="fa-solid fa-map text-[#37352F] dark:text-[#D4D4D4]"></i>
        </div>
        <h1 className="text-3xl font-bold text-[#37352F] dark:text-[#D4D4D4] tracking-tight">Yol Haritası</h1>
      </div>

      <div className="flex h-full space-x-8 min-w-[800px]">
        {columnConfig.map((col) => (
          <div 
            key={col.id} 
            className="flex-1 min-w-[300px] flex flex-col"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col.id as TaskStatus)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between mb-4 px-1 group">
              <div className="flex items-center space-x-2">
                <span className={`text-sm font-semibold text-[#787774] dark:text-[#9B9A97] px-2 py-1 rounded hover:bg-[#E3E2E0] dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer select-none`}>
                  {col.label}
                </span>
                <span className="text-xs text-[#9B9A97] dark:text-[#5A5A5A] font-mono">{col.count}</span>
              </div>
              <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={onNewTask} className="text-[#9B9A97] hover:text-[#37352F] dark:hover:text-[#D4D4D4] p-1.5 rounded hover:bg-[#E3E2E0] dark:hover:bg-[#2F2F2F] transition-colors">
                    <i className="fa-solid fa-plus text-xs"></i>
                 </button>
              </div>
            </div>

            {/* Cards Container */}
            <div className="space-y-3 pb-20">
              {columns[col.id as keyof typeof columns].map((task) => {
                 const wp = workPackages.find(w => w.id === task.workPackageId);
                 
                 return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onClick={() => onEditTask(task)}
                    className="group bg-white dark:bg-[#202020] border border-[#E9E9E7] dark:border-[#2F2F2F] rounded-lg p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-[#F7F7F5] dark:hover:bg-[#2C2C2C] cursor-pointer transition-all relative hover:shadow-md"
                  >
                    <h3 className="text-[14px] text-[#37352F] dark:text-[#D4D4D4] font-medium leading-snug mb-2.5">
                      {task.name}
                    </h3>
                    
                    <div className="flex flex-wrap gap-2 items-center">
                        {/* Priority Tag */}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${getPriorityStyle(task.priority)}`}>
                            {task.priority}
                        </span>

                        {/* Work Package Tag (if exists) */}
                        {wp && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-normal bg-[#F1F0EF] text-[#787774] dark:bg-[#373737] dark:text-[#9B9A97] border border-[#E9E9E7] dark:border-[#2F2F2F] truncate max-w-[100px]">
                                {wp.name}
                            </span>
                        )}

                        {/* Resource Avatar */}
                        {task.resourceName && task.resourceName !== 'Atanmamış' && (
                            <div className="ml-auto flex items-center justify-center w-5 h-5 rounded bg-[#F7F7F5] text-[#9B9A97] text-[9px] border border-[#E9E9E7] dark:bg-[#373737] dark:border-[#2F2F2F]" title={task.resourceName}>
                                {task.resourceName.charAt(0)}
                            </div>
                        )}
                    </div>
                  </div>
                );
              })}

              {/* Quick Add Button at bottom of column */}
              <button 
                onClick={onNewTask}
                className="flex items-center text-[#9B9A97] hover:text-[#37352F] dark:text-[#5A5A5A] dark:hover:text-[#D4D4D4] text-sm py-2 px-2 rounded hover:bg-[#E3E2E0] dark:hover:bg-[#2F2F2F] w-full text-left transition-colors group"
              >
                <i className="fa-solid fa-plus mr-3 text-xs opacity-50 group-hover:opacity-100"></i>
                Yeni
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RoadmapView;
