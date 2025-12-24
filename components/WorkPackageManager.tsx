
import React, { useState, useEffect } from 'react';
import { WorkPackage } from '../types';

interface WorkPackageManagerProps {
  isOpen: boolean;
  onClose: () => void;
  workPackages: WorkPackage[];
  setWorkPackages: React.Dispatch<React.SetStateAction<WorkPackage[]>>;
}

const WorkPackageManager: React.FC<WorkPackageManagerProps> = ({ isOpen, onClose, workPackages, setWorkPackages }) => {
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
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">İşlemler</span></th>
                    </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {workPackages.map(wp => (
                        <tr key={wp.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{wp.name}</td>
                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300">{wp.description}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                            <button onClick={() => setEditingPackageId(wp.id)} className="text-primary hover:opacity-80 transition-opacity">
                            <i className="fa-solid fa-pencil mr-1"></i> Düzenle
                            </button>
                            <button onClick={() => onDeleteWorkPackage(wp.id)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400">
                            <i className="fa-solid fa-trash mr-1"></i> Sil
                            </button>
                        </td>
                        </tr>
                    ))}
                    {workPackages.length === 0 && (
                        <tr>
                            <td colSpan={3} className="text-center py-8 text-gray-500">Henüz iş paketi eklenmemiş.</td>
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
