
import React, { useMemo } from 'react';
import { Task, Objective, TaskStatus } from '../types';

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div 
            className="bg-primary h-2 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progress}%` }}
        ></div>
    </div>
);

interface UnitSummaryCardProps {
    unit: string;
    tasks: Task[];
    objectives: Objective[];
}

const UnitSummaryCard: React.FC<UnitSummaryCardProps> = ({ unit, tasks, objectives }) => {
    const unitTasks = useMemo(() => tasks.filter(t => t.unit === unit), [tasks, unit]);
    const completedTasks = useMemo(() => unitTasks.filter(t => t.status === TaskStatus.Done), [unitTasks]);
    const progress = unitTasks.length > 0 ? (completedTasks.length / unitTasks.length) * 100 : 0;

    const contributingObjectives = useMemo(() => {
        const krIds = new Set(unitTasks.map(t => t.keyResultId).filter(Boolean));
        if (krIds.size === 0) return [];
        return objectives.filter(obj => obj.keyResults.some(kr => krIds.has(kr.id)));
    }, [unitTasks, objectives]);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-md border border-gray-100 dark:border-gray-700 p-6 space-y-4 hover:shadow-lg hover:-translate-y-1 transition-all">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-extrabold text-gray-800 dark:text-white">{unit}</h3>
                    <p className="text-xs text-gray-400">{completedTasks.length} / {unitTasks.length} görev tamamlandı.</p>
                </div>
                <span className="text-2xl font-bold text-primary">{progress.toFixed(0)}%</span>
            </div>
            <ProgressBar progress={progress} />
            {contributingObjectives.length > 0 && (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Katkı Sağlanan Hedefler</h4>
                    <div className="space-y-2">
                        {contributingObjectives.map(obj => (
                            <div key={obj.id} className="text-xs bg-gray-50 dark:bg-gray-900/50 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-300 font-medium">
                                {obj.name}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnitSummaryCard;
