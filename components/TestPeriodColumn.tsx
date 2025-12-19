
import React, { useState, useMemo, useEffect } from 'react';
import { Sprint, Task, Resource } from '../types';

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
  const [taskIds, setTaskIds] = useState<string[]>(sprint.testPeriod?.assignedTaskIds || []);
  const [defects, setDefects] = useState(sprint.testPeriod?.foundDefects || '');
  const [duration, setDuration] = useState(sprint.testPeriod?.duration || 4);

  const assignableTasks = useMemo(() => allTasks.filter(t => t.version === sprint.id), [allTasks, sprint.id]);
  const assignedTasks = useMemo(() => allTasks.filter(t => taskIds.includes(t.id)), [allTasks, taskIds]);

  useEffect(() => {
    setResponsible(sprint.testPeriod?.responsible || '');
    setTaskIds(sprint.testPeriod?.assignedTaskIds || []);
    setDefects(sprint.testPeriod?.foundDefects || '');
    setDuration(sprint.testPeriod?.duration || 4);
  }, [sprint.testPeriod]);

  const handleToggleTask = (task: Task) => {
    const isAlreadyAssigned = taskIds.includes(task.id);
    let newIds: string[];
    if (isAlreadyAssigned) {
      newIds = taskIds.filter(id => id !== task.id);
    } else {
      newIds = [...taskIds, task.id];
      const taskTag = `${task.name}: `;
      if (!defects.includes(taskTag)) {
        const separator = defects.length > 0 && !defects.endsWith('\n') ? '\n' : '';
        setDefects(prev => prev + separator + taskTag + '\n');
      }
    }
    setTaskIds(newIds);
  };

  const handleSave = () => {
    onUpdateTestPeriod(sprint.id, { responsible, assignedTaskIds: taskIds, foundDefects: defects, duration });
    setIsEditing(false);
  };

  if (!isExpanded) {
    return (
      <div 
        className="bg-emerald-50/40 dark:bg-emerald-950/20 w-12 rounded-2xl border flex flex-col items-center py-8 cursor-pointer hover:bg-emerald-100/40 transition-all group shrink-0 border-emerald-100 dark:border-emerald-900 shadow-sm"
        onClick={() => setIsExpanded(true)}
      >
        <div className="rotate-90 origin-center whitespace-nowrap font-black text-[9px] tracking-[0.4em] text-emerald-600 dark:text-emerald-400 flex items-center uppercase">
           <i className="fa-solid fa-flask mr-3 -rotate-90 text-[10px]"></i>
           TEST SÜRECİ
        </div>
        <div className="mt-auto p-2 text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity">
           <i className="fa-solid fa-chevron-right text-[10px]"></i>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[20rem] bg-emerald-50/40 dark:bg-emerald-950/30 backdrop-blur-md rounded-2xl border border-emerald-100 dark:border-emerald-900 flex flex-col h-full overflow-hidden shrink-0 shadow-lg animate-fade-in-right">
      <div className="p-4 bg-white/80 dark:bg-emerald-900/20 border-b border-emerald-100 dark:border-emerald-900 flex justify-between items-center">
        <div>
            <h3 className="font-black text-emerald-800 dark:text-emerald-300 text-[10px] tracking-widest uppercase">KALİTE KONTROL</h3>
            <div className="flex items-center mt-1 space-x-2 text-[8px] font-bold text-emerald-500 uppercase">
                <span>V{sprint.id} DENETİMİ</span>
                <span>•</span>
                <span>{sprint.testPeriod?.duration || 4} GÜN</span>
            </div>
        </div>
        <div className="flex space-x-1.5">
            <button onClick={() => setIsEditing(!isEditing)} className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${isEditing ? 'bg-emerald-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 text-emerald-600 border border-emerald-100 dark:border-emerald-900'}`}>
                <i className={`fa-solid ${isEditing ? 'fa-check' : 'fa-pencil'} text-[10px]`}></i>
            </button>
            <button onClick={() => setIsExpanded(false)} className="w-7 h-7 flex items-center justify-center bg-white dark:bg-gray-800 text-gray-400 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm">
                <i className="fa-solid fa-chevron-left text-[10px]"></i>
            </button>
        </div>
      </div>

      <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar flex-grow">
        {isEditing ? (
          <div className="space-y-5">
            <div>
              <label className="text-[8px] font-black text-emerald-600 uppercase mb-1.5 block tracking-widest">KONTROL SORUMLUSU</label>
              <select value={responsible} onChange={e => setResponsible(e.target.value)} className="w-full text-[10px] font-bold p-2 bg-white dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-800 rounded-lg outline-none">
                <option value="">Seçiniz...</option>
                {resources.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[8px] font-black text-emerald-600 uppercase mb-1.5 block tracking-widest">TEST SÜRESİ (GÜN)</label>
              <input type="number" value={duration} onChange={e => setDuration(parseInt(e.target.value) || 0)} className="w-full text-[10px] font-bold p-2 bg-white dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-800 rounded-lg outline-none" />
            </div>
            <div>
              <label className="text-[8px] font-black text-emerald-600 uppercase mb-1.5 block tracking-widest flex justify-between">
                <span>TEST KAPSAMI</span>
                <span className="text-gray-400">{taskIds.length} SEÇİLİ</span>
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {assignableTasks.map(t => (
                  <div key={t.id} onClick={() => handleToggleTask(t)} className={`flex items-start p-2 rounded-lg border cursor-pointer transition-all ${taskIds.includes(t.id) ? 'bg-emerald-100 border-emerald-200' : 'bg-white dark:bg-gray-800 border-gray-100'}`}>
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center mr-2 ${taskIds.includes(t.id) ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-200 bg-gray-50'}`}>
                       {taskIds.includes(t.id) && <i className="fa-solid fa-check text-[8px]"></i>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black text-emerald-900 dark:text-emerald-100 truncate">{t.name}</p>
                      <span className="text-[7px] text-emerald-600/60 font-black uppercase">{t.jiraId}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[8px] font-black text-emerald-600 uppercase mb-1.5 block tracking-widest">TEST BULGULARI</label>
              <textarea value={defects} onChange={e => setDefects(e.target.value)} rows={5} className="w-full text-[10px] p-3 bg-white dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-800 rounded-lg outline-none resize-none font-mono" placeholder="Notlarınızı buraya düşebilirsiniz..." />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center p-3 bg-white dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 text-[10px] font-black mr-3 shadow-inner">
                    {responsible ? responsible.charAt(0) : '?'}
                </div>
                <div className="flex flex-col">
                    <span className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">SORUMLU</span>
                    <p className="text-[10px] font-black text-emerald-900 dark:text-emerald-100">{responsible || 'ATANMAMIŞ'}</p>
                </div>
            </div>
            <div className="space-y-2">
              <span className="text-[8px] font-black text-emerald-600/40 uppercase tracking-widest block">KAPSAMDAKİ GÖREVLER</span>
              {assignedTasks.map(t => (
                <div key={t.id} className="text-[9px] p-2.5 bg-white/60 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/50 flex items-center">
                  <i className="fa-solid fa-check-circle mr-2.5 text-emerald-500"></i>
                  <div className="min-w-0">
                    <span className="font-black block truncate text-emerald-900 dark:text-emerald-100">{t.name}</span>
                    <span className="text-[7px] text-emerald-600/60 font-black tracking-widest uppercase">{t.jiraId}</span>
                  </div>
                </div>
              ))}
            </div>
            {defects && (
              <div className="bg-emerald-100/20 dark:bg-emerald-950/40 p-3 rounded-xl border-l-2 border-emerald-500 text-[9px] text-emerald-800 dark:text-emerald-200 font-mono whitespace-pre-wrap leading-relaxed">
                {defects}
              </div>
            )}
          </div>
        )}
      </div>
      {isEditing && (
        <div className="p-4 bg-white/80 dark:bg-emerald-950/40 border-t border-emerald-100">
           <button onClick={handleSave} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] py-2.5 rounded-lg shadow-md uppercase tracking-widest">
             DEĞİŞİKLİKLERİ KAYDET
           </button>
        </div>
      )}
    </div>
  );
};

export default TestPeriodColumn;
