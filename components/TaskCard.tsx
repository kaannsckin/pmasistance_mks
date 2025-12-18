
import React from 'react';
import { Task, TaskStatus, WorkPackage } from '../types';
import { STATUS_STYLES, STATUS_LABELS } from '../constants';

interface TaskCardProps {
  task: Task;
  workPackages: WorkPackage[];
  onView: (task: Task) => void;
  onEdit: (task: Task) => void;
  onNotify: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

const PRIORITY_STYLES = {
  Blocker: 'bg-red-50 text-red-700 border-red-200',
  High: 'bg-orange-50 text-orange-700 border-orange-200',
  Medium: 'bg-blue-50 text-blue-700 border-blue-200',
  Low: 'bg-gray-50 text-gray-700 border-gray-200',
};

const TaskCard: React.FC<TaskCardProps> = ({ task, workPackages, onView, onEdit, onNotify, onDelete, onStatusChange }) => {
    const isDataMissing = task.time.avg === 0;
    const jiraUrl = task.jiraId ? `https://jira.bilgem.tubitak.gov.tr/browse/${task.jiraId}` : '#';
    const workPackage = workPackages.find(wp => wp.id === task.workPackageId);

    return (
        <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md border border-gray-200 dark:border-gray-700 flex flex-col h-full transition-all duration-300 group`}>
            {/* Header Status Bar */}
            <div className={`h-1.5 w-full rounded-t-xl ${task.status === TaskStatus.Done ? 'bg-green-500' : task.status === TaskStatus.InProgress ? 'bg-blue-500' : task.status === TaskStatus.Backlog ? 'bg-red-500' : 'bg-gray-400'}`}></div>
            
            <div className="p-4 flex flex-col flex-grow">
                <div className="flex justify-between items-start mb-3">
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border ${PRIORITY_STYLES[task.priority]}`}>
                        {task.priority}
                    </span>
                    {task.jiraId && (
                         <a 
                            href={jiraUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-xs text-gray-500 hover:text-blue-600 dark:text-gray-400 transition-colors"
                        >
                            {task.jiraId}
                            <i className="fa-solid fa-external-link-alt text-[9px] ml-1 opacity-50"></i>
                        </a>
                    )}
                </div>

                <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-base leading-tight mb-2 line-clamp-2" title={task.name}>
                    {task.name}
                </h3>
                
                <div className="mt-auto space-y-2 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                        {workPackage && (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium truncate max-w-full">
                                <i className="fa-solid fa-briefcase mr-1.5 opacity-70"></i>
                                {workPackage.name}
                            </span>
                        )}
                         <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs">
                            <i className="fa-solid fa-cube mr-1.5 opacity-70"></i>
                            {task.unit}
                        </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700">
                         <div className="flex items-center space-x-2">
                            <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-[9px] font-bold text-gray-600 dark:text-gray-300">
                                {task.resourceName.charAt(0)}
                            </div>
                            <span className="truncate max-w-[100px]">{task.resourceName}</span>
                         </div>
                         <span className="font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                            v{task.version}
                         </span>
                    </div>
                </div>

                 {isDataMissing && (
                    <div className="mt-2 text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded border border-yellow-100 dark:border-yellow-800 flex items-center">
                        <i className="fa-solid fa-triangle-exclamation mr-1.5"></i>
                        Eksik Süre Verisi
                    </div>
                )}
            </div>

            {/* Action Footer */}
            <div className="bg-gray-50 dark:bg-gray-800/80 px-4 py-2 border-t border-gray-100 dark:border-gray-700 rounded-b-xl flex justify-between items-center opacity-80 group-hover:opacity-100 transition-opacity">
                 <select
                    value={task.status}
                    onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
                    className="text-xs bg-transparent border-none p-0 pr-6 text-gray-600 dark:text-gray-300 font-medium focus:ring-0 cursor-pointer"
                >
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                    ))}
                </select>
                
                <div className="flex items-center space-x-1">
                    {isDataMissing && (
                         <button onClick={() => onNotify(task)} title="Bildir" className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-yellow-100 text-yellow-600 transition-colors">
                            <i className="fa-solid fa-paper-plane text-xs"></i>
                        </button>
                    )}
                    <button onClick={() => onView(task)} title="Detay" className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-blue-100 text-gray-500 hover:text-blue-600 transition-colors">
                        <i className="fa-solid fa-eye text-xs"></i>
                    </button>
                    <button onClick={() => onEdit(task)} title="Düzenle" className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-green-100 text-gray-500 hover:text-green-600 transition-colors">
                        <i className="fa-solid fa-pencil text-xs"></i>
                    </button>
                    <button onClick={() => onDelete(task.id)} title="Sil" className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors">
                        <i className="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TaskCard;
