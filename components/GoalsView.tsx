
import React, { useState, useMemo, useEffect } from 'react';
import { Objective, KeyResult, Task, TaskStatus, WorkPackage } from '../types';

interface GoalsViewProps {
  objectives: Objective[];
  tasks: Task[];
  workPackages: WorkPackage[];
  onUpdateObjectives: (objectives: Objective[]) => void;
  onOpenWorkPackageEditor: () => void;
}

// ... existing components ...
const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div 
            className="bg-primary h-2 rounded-full transition-all duration-500 ease-out" 
            style={{ width: `${progress}%` }}
        ></div>
    </div>
);

const KeyResultItem: React.FC<{ 
    kr: KeyResult; 
    tasks: Task[]; 
    workPackages: WorkPackage[];
    isEditing: boolean;
    onUpdate: (name: string) => void;
    onDelete: () => void;
}> = ({ kr, tasks, workPackages, isEditing, onUpdate, onDelete }) => {
    const linkedTasks = useMemo(() => tasks.filter(t => t.keyResultId === kr.id), [tasks, kr.id]);
    const completedTasks = useMemo(() => linkedTasks.filter(t => t.status === TaskStatus.Done), [linkedTasks]);

    const progress = linkedTasks.length > 0 ? (completedTasks.length / linkedTasks.length) * 100 : 0;

    if (isEditing) {
        return (
            <div className="flex items-center gap-2">
                <input 
                    type="text"
                    value={kr.name}
                    onChange={(e) => onUpdate(e.target.value)}
                    className="flex-grow bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm"
                />
                <button onClick={onDelete} className="p-2 text-red-500 hover:bg-red-100 rounded-md"><i className="fa-solid fa-trash-can text-xs"></i></button>
            </div>
        )
    }

    return (
        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
            <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{kr.name}</span>
                <span className="text-xs font-mono text-gray-400">{completedTasks.length}/{linkedTasks.length}</span>
            </div>
            <ProgressBar progress={progress} />
        </div>
    );
};

const ObjectiveCard: React.FC<{ 
    objective: Objective; 
    tasks: Task[]; 
    workPackages: WorkPackage[];
    isEditing: boolean;
    onUpdate: (field: 'name' | 'description' | 'quarter', value: string) => void;
    onUpdateKeyResult: (krId: string, name: string) => void;
    onAddKeyResult: () => void;
    onDeleteKeyResult: (krId: string) => void;
    onDeleteObjective: () => void;
}> = ({ objective, tasks, workPackages, isEditing, onUpdate, onUpdateKeyResult, onAddKeyResult, onDeleteKeyResult, onDeleteObjective }) => {
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
        <div className={`bg-white dark:bg-gray-800 rounded-3xl shadow-md border p-6 space-y-4 transition-all ${isEditing ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-1'}`}>
            <div className="flex justify-between items-start">
                <div className="flex-grow">
                    {isEditing ? (
                        <>
                            <input type="text" value={objective.quarter} onChange={e => onUpdate('quarter', e.target.value)} className="text-xs font-bold bg-accent text-primary dark:bg-primary/20 dark:text-primary px-3 py-1 rounded-full border border-primary/20" />
                            <input type="text" value={objective.name} onChange={e => onUpdate('name', e.target.value)} className="text-lg font-extrabold text-gray-800 dark:text-white mt-3 w-full bg-gray-100 dark:bg-gray-700 p-1 rounded" />
                            <textarea value={objective.description} onChange={e => onUpdate('description', e.target.value)} className="text-sm text-gray-500 dark:text-gray-400 mt-1 w-full bg-gray-100 dark:bg-gray-700 p-1 rounded" rows={2} />
                        </>
                    ) : (
                        <>
                            <span className="text-xs font-bold bg-accent text-primary dark:bg-primary/20 dark:text-primary px-3 py-1 rounded-full">{objective.quarter}</span>
                            <h3 className="text-lg font-extrabold text-gray-800 dark:text-white mt-3">{objective.name}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{objective.description}</p>
                        </>
                    )}
                </div>
                {!isEditing ? (
                    <div className="flex flex-col items-end">
                        <span className="text-2xl font-bold text-primary">{overallProgress.toFixed(0)}%</span>
                        <span className="text-xs text-gray-400">Genel İlerleme</span>
                    </div>
                ) : (
                    <button onClick={onDeleteObjective} className="p-2 text-red-500 hover:bg-red-100 rounded-full h-8 w-8"><i className="fa-solid fa-trash-can"></i></button>
                )}
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-700/50">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Anahtar Sonuçlar</h4>
                {objective.keyResults.map(kr => (
                    <KeyResultItem key={kr.id} kr={kr} tasks={tasks} workPackages={workPackages} isEditing={isEditing} 
                        onUpdate={(name) => onUpdateKeyResult(kr.id, name)}
                        onDelete={() => onDeleteKeyResult(kr.id)}
                    />
                ))}
                {isEditing && (
                    <button onClick={onAddKeyResult} className="w-full text-center text-xs p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md">
                        + Anahtar Sonuç Ekle
                    </button>
                )}
            </div>
        </div>
    );
};


const GoalsView: React.FC<GoalsViewProps> = ({ objectives, tasks, workPackages, onUpdateObjectives, onOpenWorkPackageEditor }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempObjectives, setTempObjectives] = useState<Objective[]>([]);

    useEffect(() => {
        setTempObjectives(JSON.parse(JSON.stringify(objectives)));
    }, [objectives]);

    const handleSave = () => {
        onUpdateObjectives(tempObjectives);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setTempObjectives(JSON.parse(JSON.stringify(objectives)));
        setIsEditing(false);
    };
    
    const handleAddObjective = () => {
        const newKR: KeyResult = { id: `kr-new-${Date.now()}`, name: "Yeni Anahtar Sonuç"};
        const newObjective: Objective = {
            id: `obj-new-${Date.now()}`,
            name: "Yeni Stratejik Hedef",
            description: "Bu hedefin amacını açıklayın.",
            quarter: "Q1 2025",
            keyResults: [newKR]
        };
        setTempObjectives(prev => [...prev, newObjective]);
    };

    const handleUpdateObjective = (objId: string, field: 'name' | 'description' | 'quarter', value: string) => {
        setTempObjectives(prev => prev.map(obj => obj.id === objId ? { ...obj, [field]: value } : obj));
    };

    const handleUpdateKeyResult = (objId: string, krId: string, name: string) => {
        setTempObjectives(prev => prev.map(obj => obj.id === objId ? {
            ...obj,
            keyResults: obj.keyResults.map(kr => kr.id === krId ? { ...kr, name } : kr)
        } : obj));
    };

    const handleAddKeyResult = (objId: string) => {
        setTempObjectives(prev => prev.map(obj => obj.id === objId ? {
            ...obj,
            keyResults: [...obj.keyResults, { id: `kr-new-${Date.now()}`, name: 'Yeni anahtar sonuç' }]
        } : obj));
    };

    const handleDeleteKeyResult = (objId: string, krId: string) => {
        setTempObjectives(prev => prev.map(obj => obj.id === objId ? {
            ...obj,
            keyResults: obj.keyResults.filter(kr => kr.id !== krId)
        } : obj));
    };

    const handleDeleteObjective = (objId: string) => {
        setTempObjectives(prev => prev.filter(obj => obj.id !== objId));
    };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
            <h2 className="text-3xl font-extrabold text-gray-800 dark:text-white">Hedefler & Kapsam</h2>
            <p className="text-gray-500 dark:text-gray-400">Stratejik hedeflerin iş paketleri ile ilerlemesini takip edin.</p>
        </div>
        <div className="flex items-center space-x-2">
            {!isEditing ? (
                <>
                    <button 
                        onClick={onOpenWorkPackageEditor}
                        className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold py-2 px-4 rounded-lg flex items-center space-x-2"
                    >
                        <i className="fa-solid fa-briefcase"></i>
                        <span>İş Paketleri</span>
                    </button>
                    <button onClick={() => setIsEditing(true)} className="bg-primary hover:opacity-90 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2 shadow-lg">
                        <i className="fa-solid fa-pencil"></i>
                        <span>Hedefleri Düzenle</span>
                    </button>
                </>
            ) : (
                <>
                    <button onClick={handleCancel} className="bg-gray-100 hover:bg-gray-200 font-bold py-2 px-4 rounded-lg">İptal</button>
                    <button onClick={handleAddObjective} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">+ Yeni Hedef</button>
                    <button onClick={handleSave} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">
                        <i className="fa-solid fa-save mr-2"></i>Kaydet
                    </button>
                </>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {(isEditing ? tempObjectives : objectives).map(obj => (
            <ObjectiveCard 
                key={obj.id} 
                objective={obj} 
                tasks={tasks} 
                workPackages={workPackages}
                isEditing={isEditing}
                onUpdate={(field, value) => handleUpdateObjective(obj.id, field, value)}
                onUpdateKeyResult={(krId, name) => handleUpdateKeyResult(obj.id, krId, name)}
                onAddKeyResult={() => handleAddKeyResult(obj.id)}
                onDeleteKeyResult={(krId) => handleDeleteKeyResult(obj.id, krId)}
                onDeleteObjective={() => handleDeleteObjective(obj.id)}
            />
        ))}
      </div>
    </div>
  );
};

export default GoalsView;