
import React, { useState, useEffect, useMemo } from 'react';
import { Task, Resource, TaskStatus, WorkPackage, Objective } from '../types';

interface TaskFormModalProps {
  task: Task | null;
  resources: Resource[];
  tasks: Task[];
  workPackages: WorkPackage[];
  objectives: Objective[];
  onClose: () => void;
  onSave: (task: Task) => void;
}

const TaskFormModal: React.FC<TaskFormModalProps> = ({ task, resources, tasks, workPackages, objectives, onClose, onSave }) => {
  const [formData, setFormData] = useState<Omit<Task, 'id' | 'availability'>>({
    name: '',
    priority: 'Medium',
    version: 1,
    predecessor: null,
    unit: '',
    resourceName: '',
    time: { best: 0, avg: 0, worst: 0 },
    jiraId: '',
    notes: '',
    status: TaskStatus.ToDo,
    workPackageId: undefined,
    labels: [],
    includeInSprints: true,
    keyResultId: undefined,
  });

  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string>('');

  const inputStyle = "bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-50 sm:text-sm rounded-md focus:ring-primary focus:border-primary focus:outline-none py-2 px-3";


  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name,
        priority: task.priority,
        version: task.version,
        predecessor: task.predecessor,
        unit: task.unit,
        resourceName: task.resourceName,
        time: { ...task.time },
        jiraId: task.jiraId,
        notes: task.notes,
        status: task.status,
        workPackageId: task.workPackageId,
        labels: task.labels || [],
        includeInSprints: task.includeInSprints ?? true,
        keyResultId: task.keyResultId,
      });

      if (task.keyResultId) {
        const parentObjective = objectives.find(obj => obj.keyResults.some(kr => kr.id === task.keyResultId));
        setSelectedObjectiveId(parentObjective?.id || '');
      } else {
        setSelectedObjectiveId('');
      }

    } else {
        setFormData({
            name: '', priority: 'Medium', version: 1, predecessor: null,
            unit: '', resourceName: resources.length > 0 ? resources[0].name : '', 
            time: { best: 0, avg: 0, worst: 0 }, jiraId: '', notes: '', status: TaskStatus.ToDo,
            workPackageId: undefined,
            labels: [],
            includeInSprints: true,
            keyResultId: undefined,
        });
        setSelectedObjectiveId('');
    }
  }, [task, resources, objectives]);

  useEffect(() => {
    if (formData.resourceName) {
        const selectedResource = resources.find(r => r.name === formData.resourceName);
        if (selectedResource && formData.unit !== selectedResource.unit) {
            setFormData(prev => ({ ...prev, unit: selectedResource.unit }));
        }
    }
  }, [formData.resourceName, resources]);

  const availableKeyResults = useMemo(() => {
    if (!selectedObjectiveId) return [];
    const selectedObjective = objectives.find(obj => obj.id === selectedObjectiveId);
    return selectedObjective ? selectedObjective.keyResults : [];
  }, [selectedObjectiveId, objectives]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'workPackageId' && value === '') {
        setFormData(prev => ({ ...prev, workPackageId: undefined }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
        ...prev,
        time: {
            ...prev.time,
            [name]: parseInt(value, 10) || 0
        }
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const taskToSave: Task = {
      ...formData,
      id: task ? task.id : new Date().toISOString(),
      availability: formData.time.avg > 0,
    };
    onSave(taskToSave);
  };

  const predecessorOptions = tasks.filter(t => t.id !== (task?.id || ''));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold text-black dark:text-white">{task ? 'Görevi Düzenle' : 'Yeni Görev Ekle'}</h2>
          <button onClick={onClose} className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-gray-600 dark:hover:text-white rounded-lg text-sm p-1.5 ml-auto inline-flex items-center">
             <i className="fa-solid fa-times w-5 h-5"></i>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-black dark:text-white">Görev Adı</label>
            <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} required className={`mt-1 block w-full ${inputStyle}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="workPackageId" className="block text-sm font-medium text-black dark:text-white">İş Paketi</label>
              <select name="workPackageId" id="workPackageId" value={formData.workPackageId || ''} onChange={handleChange} className={`mt-1 block w-full ${inputStyle}`}>
                <option value="">Yok</option>
                {workPackages.map(wp => <option key={wp.id} value={wp.id}>{wp.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="jiraId" className="block text-sm font-medium text-black dark:text-white">Jira Kayıt No</label>
              <input type="text" name="jiraId" id="jiraId" value={formData.jiraId} onChange={handleChange} className={`mt-1 block w-full ${inputStyle}`} />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
              <label htmlFor="resourceName" className="block text-sm font-medium text-black dark:text-white">Kaynak Adı</label>
              <select name="resourceName" id="resourceName" value={formData.resourceName} onChange={handleChange} required className={`mt-1 block w-full ${inputStyle}`}>
                <option value="" disabled>Kaynak Seçin</option>
                {resources.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="unit" className="block text-sm font-medium text-black dark:text-white">Birim</label>
              <input type="text" name="unit" id="unit" value={formData.unit} onChange={handleChange} className={`mt-1 block w-full ${inputStyle}`} />
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-4">
            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-300">Stratejik Hedef (OKR)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                  <label htmlFor="objective" className="block text-sm font-medium text-black dark:text-white mb-1">Hedef</label>
                  <select 
                    id="objective"
                    value={selectedObjectiveId}
                    onChange={(e) => {
                      setSelectedObjectiveId(e.target.value);
                      setFormData(prev => ({ ...prev, keyResultId: undefined }));
                    }}
                    className={`block w-full ${inputStyle}`}
                  >
                      <option value="">Hedefe Bağlı Değil</option>
                      {objectives.map(obj => <option key={obj.id} value={obj.id}>{obj.name}</option>)}
                  </select>
              </div>
              <div>
                  <label htmlFor="keyResultId" className="block text-sm font-medium text-black dark:text-white mb-1">Anahtar Sonuç</label>
                  <select 
                    name="keyResultId" 
                    id="keyResultId"
                    value={formData.keyResultId || ''} 
                    onChange={handleChange}
                    disabled={!selectedObjectiveId}
                    className={`block w-full disabled:bg-gray-100 disabled:cursor-not-allowed ${inputStyle}`}
                  >
                      <option value="">Sonuç Seçin</option>
                      {availableKeyResults.map(kr => <option key={kr.id} value={kr.id}>{kr.name}</option>)}
                  </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
              <label htmlFor="priority" className="block text-sm font-medium text-black dark:text-white">Öncelik</label>
              <select name="priority" id="priority" value={formData.priority} onChange={handleChange} className={`mt-1 block w-full ${inputStyle}`}>
                <option>Blocker</option><option>High</option><option>Medium</option><option>Low</option>
              </select>
            </div>
             <div>
              <label htmlFor="status" className="block text-sm font-medium text-black dark:text-white">Durum</label>
              <select name="status" id="status" value={formData.status} onChange={handleChange} className={`mt-1 block w-full ${inputStyle}`}>
                {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
              <label htmlFor="version" className="block text-sm font-medium text-black dark:text-white">Sürüm</label>
              <input type="number" name="version" id="version" value={formData.version} onChange={handleChange} min="0" className={`mt-1 block w-full ${inputStyle}`} />
            </div>
             <div>
              <label htmlFor="predecessor" className="block text-sm font-medium text-black dark:text-white">Öncül Görev</label>
              <select name="predecessor" id="predecessor" value={formData.predecessor || ''} onChange={handleChange} className={`mt-1 block w-full ${inputStyle}`}>
                <option value="">Yok</option>
                {predecessorOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-black dark:text-white">Zaman Tahmini (Gün)</label>
            <div className="grid grid-cols-3 gap-4 mt-1">
                <input type="number" name="best" value={formData.time.best} onChange={handleTimeChange} placeholder="En İyi" className={`w-full ${inputStyle}`} />
                <input type="number" name="avg" value={formData.time.avg} onChange={handleTimeChange} placeholder="Ortalama" className={`w-full ${inputStyle}`} />
                <input type="number" name="worst" value={formData.time.worst} onChange={handleTimeChange} placeholder="En Kötü" className={`w-full ${inputStyle}`} />
            </div>
          </div>

          <div>
            <label htmlFor="labels" className="block text-sm font-medium text-black dark:text-white">Etiketler (virgülle ayırın)</label>
            <input 
                type="text" 
                name="labels" 
                id="labels" 
                value={formData.labels?.join(', ') || ''} 
                onChange={e => setFormData(prev => ({ ...prev, labels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} 
                className={`mt-1 block w-full ${inputStyle}`} 
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-black dark:text-white">Açıklama / Notlar</label>
            <textarea name="notes" id="notes" value={formData.notes} onChange={handleChange} rows={3} className={`mt-1 block w-full ${inputStyle}`}></textarea>
          </div>
          
          <div>
            <div className="flex items-center">
              <input
                id="includeInSprints"
                name="includeInSprints"
                type="checkbox"
                checked={formData.includeInSprints}
                onChange={e => setFormData(prev => ({ ...prev, includeInSprints: e.target.checked }))}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="includeInSprints" className="ml-2 block text-sm text-gray-900 dark:text-gray-100">
                Sürüm planlamasına dahil et
              </label>
            </div>
          </div>

        </form>
        <div className="flex justify-end items-center p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border dark:border-gray-600 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700">İptal</button>
          <button type="submit" onClick={handleSubmit} className="px-4 py-2 rounded-md bg-primary text-white hover:opacity-90">Kaydet</button>
        </div>
      </div>
    </div>
  );
};

export default TaskFormModal;
