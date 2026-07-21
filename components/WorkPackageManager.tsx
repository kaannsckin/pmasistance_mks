
import React, { useState, useEffect, useMemo } from 'react';
import { Task, WorkPackage } from '../types';
import { summarizeWorkPackages } from '../utils/workPackages';

interface WorkPackageManagerProps {
  isOpen: boolean;
  onClose: () => void;
  workPackages: WorkPackage[];
  tasks: Task[];
  setWorkPackages: React.Dispatch<React.SetStateAction<WorkPackage[]>>;
}

const WorkPackageManager: React.FC<WorkPackageManagerProps> = ({ isOpen, onClose, workPackages, tasks, setWorkPackages }) => {
  const summaryById = useMemo(() => {
    const rows = summarizeWorkPackages(workPackages, tasks);
    return { map: new Map(rows.map(r => [r.id, r])), unassigned: rows.find(r => r.id === '') };
  }, [workPackages, tasks]);
  const [formData, setFormData] = useState<Omit<WorkPackage, 'id'>>({ name: '', description: '' });
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);

  useEffect(() => {
    if (editingPackageId) {
      const pkg = workPackages.find(wp => wp.id === editingPackageId);
      if (pkg) {
        setFormData({ name: pkg.name, description: pkg.description });
      }
    } else {
      setFormData({ name: '', description: '' });
    }
  }, [editingPackageId, workPackages]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!formData.name.trim()) return;

    if (editingPackageId) {
      // Update
      setWorkPackages(prev => 
        prev.map(wp => (wp.id === editingPackageId ? { ...wp, ...formData } : wp))
      );
      setEditingPackageId(null);
    } else {
      // Add new
      const newPackage: WorkPackage = {
        id: new Date().toISOString(),
        name: formData.name.trim(),
        description: formData.description.trim(),
      };
      setWorkPackages(prev => [...prev, newPackage]);
    }
    setFormData({ name: '', description: '' }); // Reset form
  };
  
  const handleCancelEdit = () => {
      setEditingPackageId(null);
      setFormData({ name: '', description: '' });
  };
  
  const onDeleteWorkPackage = (id: string) => {
      if (window.confirm('Bu iş paketini silmek istediğinizden emin misiniz?')) {
        setWorkPackages(workPackages.filter(wp => wp.id !== id));
      }
  };

  const title = editingPackageId ? 'İş Paketini Düzenle' : 'Yeni İş Paketi Ekle';
  const buttonLabel = editingPackageId ? 'Güncelle' : 'Ekle';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-fade-in-up">
        <div className="flex justify-between items-center p-5 border-b dark:border-gray-700">
            <h2 className="text-lg font-bold flex items-center text-gray-800 dark:text-white">
                <i className="fa-solid fa-briefcase mr-3 text-primary"></i>
                İş Paketi Yönetimi
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
                <i className="fa-solid fa-times"></i>
            </button>
        </div>
        <div className="flex-grow p-6 space-y-6 overflow-y-auto custom-scrollbar">
            <div className="bg-gray-50 dark:bg-gray-900/40 p-5 rounded-lg border dark:border-gray-700">
                <h3 className="text-md font-semibold mb-4">{title}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1">
                    <label htmlFor="wpName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Paket Adı</label>
                    <input
                    id="wpName"
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: Raporlama Modülü"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                    />
                </div>
                <div className="md:col-span-2">
                    <label htmlFor="wpDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Açıklama</label>
                    <input
                    id="wpDescription"
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Paketin amacını açıklayın"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
                    />
                </div>
                </div>
                <div className="mt-4 text-right space-x-2">
                {editingPackageId && (
                    <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 rounded-lg border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                    İptal
                    </button>
                )}
                <button
                    onClick={handleSave}
                    className="bg-primary text-white px-4 py-2 rounded-lg shadow-md hover:opacity-90 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                    <i className={`fa-solid ${editingPackageId ? 'fa-save' : 'fa-plus'} mr-2`}></i>{buttonLabel}
                </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Paket Adı</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Açıklama</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Görevler</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Atananlar</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">İşlemler</span></th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {workPackages.map(wp => {
                        const s = summaryById.map.get(wp.id);
                        return (
                        <tr key={wp.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{wp.name}</td>
                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300">{wp.description}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                            {s && s.taskCount > 0
                              ? <span><b>{s.taskCount}</b> görev · %{s.donePct} tamam</span>
                              : <span className="text-gray-400">görev yok</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300">
                            {s && s.assignees.length > 0
                              ? <div className="flex flex-wrap gap-1">{s.assignees.map(a => <span key={a} className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700">{a}</span>)}</div>
                              : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                            <button onClick={() => setEditingPackageId(wp.id)} className="text-primary hover:opacity-80 transition-opacity">
                            <i className="fa-solid fa-pencil mr-1"></i> Düzenle
                            </button>
                            <button onClick={() => onDeleteWorkPackage(wp.id)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400">
                            <i className="fa-solid fa-trash mr-1"></i> Sil
                            </button>
                        </td>
                        </tr>
                        );
                    })}
                    {summaryById.unassigned && (
                        <tr className="bg-amber-50/60 dark:bg-amber-900/10">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-amber-700 dark:text-amber-300"><i className="fa-solid fa-inbox mr-2"></i>İş paketi atanmamış</td>
                        <td className="px-6 py-4 text-sm text-gray-400">Bir iş paketine bağlanmamış görevler</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300"><b>{summaryById.unassigned.taskCount}</b> görev · %{summaryById.unassigned.donePct} tamam</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                            <div className="flex flex-wrap gap-1">{summaryById.unassigned.assignees.map(a => <span key={a} className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700">{a}</span>)}</div>
                        </td>
                        <td></td>
                        </tr>
                    )}
                    {workPackages.length === 0 && !summaryById.unassigned && (
                        <tr>
                            <td colSpan={5} className="text-center py-8 text-gray-500">Henüz iş paketi eklenmemiş.</td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default WorkPackageManager;
