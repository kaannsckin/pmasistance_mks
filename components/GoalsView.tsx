
import React, { useState, useMemo } from 'react';
import { Objective, KeyResult, Task, TaskStatus, WorkPackage } from '../types';

interface GoalsViewProps {
  objectives: Objective[];
  tasks: Task[];
  workPackages: WorkPackage[];
  onUpdateObjectives: (objectives: Objective[]) => void;
  onOpenWorkPackageEditor: () => void;
}

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progress}%` }}
        ></div>
    </div>
);

const KeyResultItem: React.FC<{ kr: KeyResult; tasks: Task[]; workPackages: WorkPackage[] }> = ({ kr, tasks, workPackages }) => {
    const linkedTasks = useMemo(() => tasks.filter(t => t.keyResultId === kr.id), [tasks, kr.id]);
    const completedTasks = useMemo(() => linkedTasks.filter(t => t.status === TaskStatus.Done), [linkedTasks]);

    const progress = linkedTasks.length > 0 ? (completedTasks.length / linkedTasks.length) * 100 : 0;
    
    const linkedWorkPackages = useMemo(() => {
        const wpIds = new Set(linkedTasks.map(t => t.workPackageId).filter(Boolean));
        return workPackages.filter(wp => wpIds.has(wp.id));
    }, [linkedTasks, workPackages]);

    return (
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{kr.name}</span>
                <span className="text-xs font-mono text-gray-400">{completedTasks.length}/{linkedTasks.length}</span>
            </div>
            <ProgressBar progress={progress} />
            {linkedWorkPackages.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50">
                    <h5 className="text-[9px] font-bold text-gray-400 uppercase mb-2">İlgili İş Paketleri</h5>
                    <div className="flex flex-wrap gap-2">
                        {linkedWorkPackages.map(wp => (
                            <span key={wp.id} className="px-2 py-1 text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded-md">
                                {wp.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const ObjectiveCard: React.FC<{ objective: Objective; tasks: Task[]; workPackages: WorkPackage[] }> = ({ objective, tasks, workPackages }) => {
    const totalKRs = objective.keyResults.length;
    
    const overallProgress = useMemo(() => {
        if (totalKRs === 0) return 0;
        
        const totalProgress = objective.keyResults.reduce((sum, kr) => {
            const linkedTasks = tasks.filter(t => t.keyResultId === kr.id);
            const completedTasks = linkedTasks.filter(t => t.status === TaskStatus.Done);
            const krProgress = linkedTasks.length > 0 ? (completedTasks.length / linkedTasks.length) * 100 : 0;
            return sum + krProgress;
        }, 0);

        return totalProgress / totalKRs;
    }, [objective, tasks, totalKRs]);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-md border border-gray-100 dark:border-gray-700 p-6 space-y-4 transition-all hover:shadow-lg hover:-translate-y-1">
            <div className="flex justify-between items-start">
                <div>
                    <span className="text-xs font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1 rounded-full">{objective.quarter}</span>
                    <h3 className="text-lg font-extrabold text-gray-800 dark:text-white mt-3">{objective.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{objective.description}</p>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{overallProgress.toFixed(0)}%</span>
                    <span className="text-xs text-gray-400">Genel İlerleme</span>
                </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Anahtar Sonuçlar</h4>
                {objective.keyResults.map(kr => (
                    <KeyResultItem key={kr.id} kr={kr} tasks={tasks} workPackages={workPackages} />
                ))}
            </div>
        </div>
    );
};


const GoalsView: React.FC<GoalsViewProps> = ({ objectives, tasks, workPackages, onUpdateObjectives, onOpenWorkPackageEditor }) => {

  const handleAddObjective = () => {
      // In a real app, this would open a modal form.
      // For this demo, we'll add a placeholder.
      const newKR: KeyResult = { id: `kr-new-${Date.now()}`, name: "Yeni Anahtar Sonuç"};
      const newObjective: Objective = {
          id: `obj-new-${Date.now()}`,
          name: "Yeni Stratejik Hedef",
          description: "Bu hedefin amacını açıklayın.",
          quarter: "Q1 2025",
          keyResults: [newKR]
      };
      onUpdateObjectives([...objectives, newObjective]);
  };
    
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
            <h2 className="text-3xl font-extrabold text-gray-800 dark:text-white">Hedefler & Kapsam</h2>
            <p className="text-gray-500 dark:text-gray-400">Stratejik hedeflerin iş paketleri ile ilerlemesini takip edin.</p>
        </div>
        <div className="flex items-center space-x-2">
            <button 
                onClick={onOpenWorkPackageEditor}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold py-2 px-4 rounded-lg flex items-center space-x-2"
            >
                <i className="fa-solid fa-briefcase"></i>
                <span>İş Paketlerini Yönet</span>
            </button>
            <button 
                onClick={handleAddObjective}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2"
            >
                <i className="fa-solid fa-plus"></i>
                <span>Yeni Hedef Ekle</span>
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {objectives.map(obj => (
            <ObjectiveCard key={obj.id} objective={obj} tasks={tasks} workPackages={workPackages} />
        ))}
      </div>
    </div>
  );
};

export default GoalsView;
