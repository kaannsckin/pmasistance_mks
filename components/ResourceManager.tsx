
import React, { useState, useMemo, useRef } from 'react';
import { Resource, Task } from '../types';
import FilterDropdown from './FilterDropdown';
import CostManager from './CostManager';

declare const XLSX: any;

interface ResourceManagerProps {
  resources: Resource[];
  setResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  titleCosts: Record<string, number>;
  setTitleCosts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const formatName = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length < 2) return name;
  const last = parts.pop();
  return `${parts.join(' ')} ${last?.charAt(0).toLocaleUpperCase('tr-TR')}.`;
};

const ResourceManager: React.FC<ResourceManagerProps> = ({ resources, setResources, tasks, setTasks, titleCosts, setTitleCosts }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'manmonth' | 'costs'>('list');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [editingResId, setEditingResId] = useState<string | null>(null);
  const [tempResName, setTempResName] = useState('');
  
  const [newResourceName, setNewResourceName] = useState('');
  const [newResourceParticipation, setNewResourceParticipation] = useState(100);
  const [newResourceUnit, setNewResourceUnit] = useState('');
  const [newResourceTitle, setNewResourceTitle] = useState('');
  const [filterUnit, setFilterUnit] = useState('all');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uniqueUnits = useMemo(() => ['all', ...Array.from(new Set(resources.map(r => r.unit)))], [resources]);

  const filteredResources = useMemo(() => {
    if (filterUnit === 'all') return resources;
    return resources.filter(resource => resource.unit === filterUnit);
  }, [resources, filterUnit]);

  const groupedResources = useMemo(() => {
      const groups: Record<string, Resource[]> = {};
      resources.forEach(r => {
          const unit = r.unit || 'Diğer';
          if (!groups[unit]) groups[unit] = [];
          groups[unit].push(r);
      });
      return Object.entries(groups).sort();
  }, [resources]);

  const handleUpdateMonthlyValue = (resourceId: string, monthIdx: number, value: string) => {
      const numValue = parseInt(value, 10) || 0;
      setResources(prev => prev.map(r => {
          if (r.id === resourceId) {
              const newPlan = { ...(r.monthlyPlan || {}) };
              newPlan[monthIdx] = numValue;
              const currentMonth = new Date().getMonth();
              const newParticipation = monthIdx === currentMonth ? numValue : r.participation;
              return { ...r, monthlyPlan: newPlan, participation: newParticipation };
          }
          return r;
      }));
  };

  const handleSaveName = (id: string, oldName: string) => {
      if (!tempResName.trim() || tempResName === oldName) {
          setEditingResId(null);
          return;
      }
      setResources(prev => prev.map(r => r.id === id ? { ...r, name: tempResName.trim() } : r));
      setTasks(prev => prev.map(t => t.resourceName === oldName ? { ...t, resourceName: tempResName.trim() } : t));
      setEditingResId(null);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const workbook = XLSX.read(event.target?.result, { type: 'binary' });
              const sheet = workbook.Sheets[workbook.SheetNames[0]];
              const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

              if (data.length < 1) throw new Error('Veri bulunamadı.');

              // Mapping: İsim -> [12 ay verisi]
              const newResources = [...resources];
              data.slice(1).forEach(row => {
                  const name = String(row[0] || '').trim();
                  const targetRes = newResources.find(r => r.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'));
                  if (targetRes) {
                      const newPlan: Record<number, number> = {};
                      for (let i = 0; i < 12; i++) {
                          newPlan[i] = parseInt(row[i + 1], 10) || 0;
                      }
                      targetRes.monthlyPlan = newPlan;
                      // Eğer 14. sütunda maliyet varsa ünvan maliyetini de güncelle (Opsiyonel format)
                      if (row[13]) {
                          setTitleCosts(prev => ({ ...prev, [targetRes.title]: parseFloat(row[13]) || 0 }));
                      }
                  }
              });
              setResources(newResources);
              alert('Plan verileri başarıyla güncellendi.');
          } catch (err) {
              alert('Excel okuma hatası. Lütfen sütunları kontrol edin.');
          } finally {
              setIsImporting(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsBinaryString(file);
  };

  const handleAddResource = () => {
    const trimmedName = newResourceName.trim();
    const trimmedUnit = newResourceUnit.trim();
    const trimmedTitle = newResourceTitle.trim() || 'Ünvan Belirtilmemiş';

    if (trimmedName && trimmedUnit) {
      if (resources.some(r => r.name.toLocaleLowerCase('tr-TR') === trimmedName.toLocaleLowerCase('tr-TR'))) {
        alert('Bu isimde bir kaynak zaten mevcut.');
        return;
      }
      const newResource: Resource = {
        id: Date.now().toString(),
        name: trimmedName,
        participation: newResourceParticipation,
        unit: trimmedUnit,
        title: trimmedTitle,
        monthlyPlan: Object.fromEntries(Array.from({length: 12}, (_, i) => [i, i === new Date().getMonth() ? newResourceParticipation : 0]))
      };
      setResources([...resources, newResource]);
      setNewResourceName('');
      setNewResourceParticipation(100);
      setNewResourceUnit('');
      setNewResourceTitle('');
    }
  };

  const handleRemoveResource = (id: string) => {
    if(window.confirm('Bu kaynağı silmek istediğinize emin misiniz?')) {
        setResources(resources.filter(r => r.id !== id));
    }
  };

  return (
    <div className={`transition-all duration-500 ease-in-out flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] bg-white dark:bg-gray-950 p-4 overflow-hidden' : 'max-w-full mx-auto space-y-4'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
            <div>
                 <h2 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight flex items-center">
                    Ekip Yönetimi
                    {isFullScreen && <span className="ml-3 text-[9px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full uppercase tracking-widest font-black">Zen Modu</span>}
                 </h2>
                 <p className="text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">Kapasite Planlama & Ünvan Tanımları</p>
            </div>
            
            <div className="flex items-center space-x-2">
                <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx, .xls, .csv" />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100 h-8 px-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                    title="Excel'den plan verilerini (12 Ay) topluca içe aktar"
                >
                    <i className="fa-solid fa-file-import mr-2"></i> {isImporting ? 'YÜKLENİYOR...' : 'EXCEL AKTAR'}
                </button>

                <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setActiveTab('list')}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'list' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm border border-gray-100 dark:border-gray-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Liste
                    </button>
                    <button
                        onClick={() => setActiveTab('manmonth')}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'manmonth' ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm border border-gray-100 dark:border-gray-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Adam/Ay
                    </button>
                    <button
                        onClick={() => setActiveTab('costs')}
                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'costs' ? 'bg-white dark:bg-gray-700 text-amber-600 shadow-sm border border-gray-100 dark:border-gray-700' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Maliyet
                    </button>
                </div>

                <button 
                    onClick={() => setIsFullScreen(!isFullScreen)} 
                    className={`w-8 h-8 rounded-lg transition-all border flex items-center justify-center ${isFullScreen ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50'}`}
                >
                    <i className={`fa-solid ${isFullScreen ? 'fa-compress' : 'fa-expand'} text-xs`}></i>
                </button>
            </div>
        </div>
        
        <div className={`flex-grow overflow-auto custom-scrollbar ${isFullScreen ? 'h-full' : ''}`}>
            {activeTab === 'list' && (
                <div className="space-y-4 animate-fade-in-up">
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                            <div className="md:col-span-2">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Kişi Adı Soyadı</label>
                                <input type="text" value={newResourceName} onChange={e => setNewResourceName(e.target.value)} placeholder="Örn: Kaan" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs text-gray-800 dark:text-white transition-all focus:border-blue-300"/>
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Birim</label>
                                <input type="text" value={newResourceUnit} onChange={e => setNewResourceUnit(e.target.value)} placeholder="Örn: Geliştirme" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs text-gray-800 dark:text-white transition-all focus:border-blue-300"/>
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Ünvan</label>
                                <input type="text" value={newResourceTitle} onChange={e => setNewResourceTitle(e.target.value)} placeholder="Örn: Senior Geliştirici" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs text-gray-800 dark:text-white transition-all focus:border-blue-300"/>
                            </div>
                            <button onClick={handleAddResource} className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md transition-all">EKLE</button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <table className="min-w-full">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-900/40 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-700">
                                    <th className="px-6 py-3 text-left">İSİM</th>
                                    <th className="px-6 py-3 text-left">BİRİM</th>
                                    <th className="px-6 py-3 text-left">ÜNVAN</th>
                                    <th className="px-6 py-3 text-left">KATILIM</th>
                                    <th className="px-6 py-3 text-right">İŞLEM</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {filteredResources.map(resource => (
                                    <tr key={resource.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/10 group">
                                        <td className="px-6 py-3">
                                            {editingResId === resource.id ? (
                                                <input 
                                                    autoFocus 
                                                    value={tempResName} 
                                                    onChange={e => setTempResName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleSaveName(resource.id, resource.name)}
                                                    onBlur={() => handleSaveName(resource.id, resource.name)}
                                                    className="bg-white border border-blue-400 rounded px-2 py-0.5 text-xs font-bold outline-none"
                                                />
                                            ) : (
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase">{resource.name}</span>
                                                    <button onClick={() => { setEditingResId(resource.id); setTempResName(resource.name); }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-all">
                                                        <i className="fa-solid fa-pencil text-[9px]"></i>
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-[9px] font-black text-gray-500 uppercase">{resource.unit}</span></td>
                                        <td className="px-6 py-3"><span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">{resource.title}</span></td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center space-x-2">
                                                <div className="w-16 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${resource.participation}%` }}></div>
                                                </div>
                                                <span className="text-[10px] font-black text-blue-600">%{resource.participation}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <button onClick={() => handleRemoveResource(resource.id)} className="text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                                                <i className="fa-solid fa-trash-can text-xs"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'manmonth' && (
                <div className={`animate-fade-in-right ${isFullScreen ? 'h-full flex flex-col' : ''}`}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden overflow-x-auto custom-scrollbar">
                        <table className="w-full border-collapse table-fixed min-w-[900px]">
                            <thead className="sticky top-0 z-30">
                                <tr className="bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest">
                                    <th className="p-3 text-left border border-blue-500 w-32 bg-blue-700">EKİP ÜYESİ</th>
                                    {MONTHS_SHORT.map(m => (
                                        <th key={m} className="p-2 text-center border border-blue-500 w-14">{m}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="text-[11px]">
                                {groupedResources.map(([unit, unitResources]) => {
                                    const unitTotals = Array.from({length: 12}).map((_, mIdx) => 
                                        unitResources.reduce((sum, r) => sum + (r.monthlyPlan?.[mIdx] || 0), 0)
                                    );
                                    return (
                                        <React.Fragment key={unit}>
                                            <tr className="bg-blue-50/80 dark:bg-blue-900/30 sticky top-[37px] z-20 shadow-sm">
                                                <td className="p-1.5 pl-3 font-black text-blue-800 dark:text-blue-300 border border-gray-100 dark:border-gray-700 uppercase truncate">
                                                    <i className="fa-solid fa-layer-group mr-2 opacity-50 text-[8px]"></i>{unit}
                                                </td>
                                                {unitTotals.map((total, i) => (
                                                    <td key={i} className={`p-1.5 text-center font-black border border-gray-100 dark:border-gray-700 ${total > 100 ? 'text-red-500' : 'text-blue-700 dark:text-blue-400'}`}>
                                                        %{total}
                                                    </td>
                                                ))}
                                            </tr>
                                            {unitResources.map(r => (
                                                <tr key={r.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors group">
                                                    <td className="p-1.5 pl-4 border border-gray-50 dark:border-gray-800 group-hover:bg-white dark:group-hover:bg-gray-700">
                                                        <p className="font-bold text-gray-700 dark:text-gray-200 leading-tight truncate">{formatName(r.name)}</p>
                                                        <p className="text-[7px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-tighter opacity-70 leading-none mt-0.5">{r.title}</p>
                                                    </td>
                                                    {MONTHS_SHORT.map((_, mIdx) => (
                                                        <td key={mIdx} className="p-0 border border-gray-50 dark:border-gray-800">
                                                            <input 
                                                                type="text" 
                                                                value={(r.monthlyPlan?.[mIdx] || 0)}
                                                                onChange={(e) => handleUpdateMonthlyValue(r.id, mIdx, e.target.value)}
                                                                className="w-full h-8 text-center bg-transparent border-none outline-none font-bold text-gray-800 dark:text-white p-0 hover:bg-white dark:hover:bg-gray-700 transition-colors focus:bg-white dark:focus:bg-gray-700"
                                                            />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'costs' && (
              <div className="animate-fade-in-right">
                <CostManager 
                  resources={resources} 
                  titleCosts={titleCosts} 
                  setTitleCosts={setTitleCosts} 
                />
              </div>
            )}
        </div>
    </div>
  );
};

export default ResourceManager;
