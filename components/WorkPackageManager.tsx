import React, { useState, useEffect } from 'react';
import { WorkPackage } from '../types';

interface WorkPackageManagerProps {
  workPackages: WorkPackage[];
  setWorkPackages: React.Dispatch<React.SetStateAction<WorkPackage[]>>;
  onDeleteWorkPackage: (workPackageId: string) => void;
}

const WorkPackageManager: React.FC<WorkPackageManagerProps> = ({ workPackages, setWorkPackages, onDeleteWorkPackage }) => {
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
  }

  const title = editingPackageId ? 'İş Paketini Düzenle' : 'Yeni İş Paketi Ekle';
  const buttonLabel = editingPackageId ? 'Güncelle' : 'Ekle';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-3xl font-bold text-gray-800 dark:text-white">İş Paketi Yönetimi</h2>
      
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label htmlFor="wpName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Paket Adı</label>
            <input
              id="wpName"
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Örn: Raporlama Modülü"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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
            className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <i className={`fa-solid ${editingPackageId ? 'fa-save' : 'fa-plus'} mr-2`}></i>{buttonLabel}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
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
                    <button onClick={() => setEditingPackageId(wp.id)} className="text-blue-600 hover:text-blue-900 dark:hover:text-blue-400">
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
  );
};

export default WorkPackageManager;