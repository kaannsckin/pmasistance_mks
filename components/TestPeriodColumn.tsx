
import React, { useState, useMemo, useEffect } from 'react';
import { Sprint, Task, Resource } from '../types';
import { TEST_DAYS } from '../constants';

interface TestPeriodColumnProps {
  sprint: Sprint;
  allTasks: Task[];
  resources: Resource[];
  onUpdateTestPeriod: (sprintId: number, data: any) => void;
}

const TestPeriodColumn: React.FC<TestPeriodColumnProps> = ({ sprint, allTasks, resources, onUpdateTestPeriod }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [responsible, setResponsible] = useState(sprint.testPeriod?.responsible || '');
  const [taskIds, setTaskIds] = useState(sprint.testPeriod?.assignedTaskIds || []);
  const [defects, setDefects] = useState(sprint.testPeriod?.foundDefects || '');

  const assignable = useMemo(() => allTasks.filter(t => t.version === sprint.id), [allTasks, sprint.id]);
  const assigned = useMemo(() => allTasks.filter(t => sprint.testPeriod?.assignedTaskIds?.includes(t.id)), [allTasks, sprint.testPeriod]);

  useEffect(() => {
    setResponsible(sprint.testPeriod?.responsible || '');
    setTaskIds(sprint.testPeriod?.assignedTaskIds || []);
    setDefects(sprint.testPeriod?.foundDefects || '');
  }, [sprint.testPeriod]);

  const handleSave = () => {
    onUpdateTestPeriod(sprint.id, { responsible, assignedTaskIds: taskIds, foundDefects: defects });
    setIsEditing(false);
  };

  if (!isExpanded) {
    return (
      <div 
        className="bg-emerald-50 dark:bg-emerald-900/20 w-12 rounded-2xl border-2 border-emerald-100 dark:border-emerald-800/30 flex flex-col items-center py-6 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all group shrink-0"
        onClick={() => setIsExpanded(true)}
      >
        <div className="rotate-90 origin-center whitespace-nowrap font-black text-xs tracking-[0.3em] text-emerald-600 dark:text-emerald-400 flex items-center">
           <i className="fa-solid fa-vial mr-3 -rotate-90 text-sm"></i>
           TEST FAZI
        </div>
        <div className="mt-auto p-2 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
           <i className="fa-solid fa-chevron-right"></i>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border-2 border-emerald-100 dark:border-emerald-800/40 flex flex-col h-full overflow-hidden shrink-0">
      <div className="p-4 bg-white dark:bg-emerald-900/30 border-b border-emerald-100 dark:border-emerald-800 flex justify-between items-center">
        <div>
            <h3 className="font-bold text-emerald-800 dark:text-emerald-300">Sürüm {sprint.id} Test</h3>
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-100 dark:bg-emerald-800 px-2 py-0.5 rounded-full uppercase">{TEST_DAYS} Gün</span>
        </div>
        <div className="flex space-x-1">
            {isEditing ? (
              <button onClick={handleSave} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg"><i className="fa-solid fa-check"></i></button>
            ) : (
              <button onClick={() => setIsEditing(true)} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg"><i className="fa-solid fa-pencil"></i></button>
            )}
            <button onClick={() => setIsExpanded(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><i className="fa-solid fa-chevron-left"></i></button>
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto">
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Sorumlu</label>
              <select value={responsible} onChange={e => setResponsible(e.target.value)} className="w-full text-xs p-2 bg-white dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <option value="">Seçiniz...</option>
                {resources.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Görevler</label>
              {/* Fix: Explicitly type selected options to avoid 'unknown' type error in Array.from */}
              <select 
                multiple 
                value={taskIds} 
                onChange={e => setTaskIds(Array.from(e.target.selectedOptions).map(o => (o as HTMLOptionElement).value))} 
                className="w-full text-xs p-2 bg-white dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 rounded-lg h-32"
              >
                {assignable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-emerald-600 uppercase mb-1 block">Bulgular</label>
              <textarea value={defects} onChange={e => setDefects(e.target.value)} rows={4} className="w-full text-xs p-2 bg-white dark:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 rounded-lg" />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <span className="text-[10px] font-bold text-emerald-600/60 uppercase block mb-1">Test Sorumlusu</span>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{responsible || 'Atanmamış'}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-600/60 uppercase block mb-2">Test Edilecekler</span>
              <div className="space-y-2">
                {assigned.map(t => (
                  <div key={t.id} className="text-[11px] p-2 bg-white/40 dark:bg-emerald-900/40 rounded-lg border border-emerald-100 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-200 flex items-center">
                    <i className="fa-solid fa-circle-check mr-2 opacity-50"></i>
                    <span className="truncate">{t.name}</span>
                  </div>
                ))}
                {assigned.length === 0 && <p className="text-xs text-emerald-600/50 italic">Görev atanmadı</p>}
              </div>
            </div>
            {defects && (
              <div>
                <span className="text-[10px] font-bold text-emerald-600/60 uppercase block mb-1">Bulgular & Hatalar</span>
                <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-white/40 dark:bg-emerald-900/40 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800/50 whitespace-pre-wrap">{defects}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TestPeriodColumn;
