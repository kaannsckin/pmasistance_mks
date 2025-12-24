
import React, { useState, useMemo, useRef } from 'react';
import { Resource, Task } from '../types';
import FilterDropdown from './FilterDropdown';
import CostManager from './CostManager';
import { exportResourcePlanToExcel } from '../utils/exporter';

declare const XLSX: any;

interface ResourceManagerProps {
  resources: Resource[];
  setResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  titleCosts: Record<string, number>;
  setTitleCosts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  manMonthTableColor: string;
  setManMonthTableColor: (color: string) => void;
  costTableColor: string;
  setCostTableColor: (color: string) => void;
}

const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const RESOURCE_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];
const TABLE_THEME_PALETTE = ['#2563eb', '#10b981', '#7c3aed', '#db2777', '#ea580c', '#475569'];

const formatName = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length < 2) return name;
  const last = parts.pop();
  return `${parts.join(' ')} ${last?.charAt(0).toLocaleUpperCase('tr-TR')}.`;
};

const parseExcelValue = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') {
        return val <= 1.0 && val > 0 ? Math.round(val * 100) : Math.round(val);
    }
    const clean = String(val).replace('%', '').trim();
    if (clean === '') return 0;
    const num = parseFloat(clean);
    if (isNaN(num)) return 0;
    if (clean.includes('.') && num <= 1.0 && !String(val).includes('%')) {
        return Math.round(num * 100);
    }
    return Math.round(num);
};

const ResourceColorPicker: React.FC<{ currentColor?: string, onSelect: (color: string) => void }> = ({ currentColor, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="relative inline-block mr-2">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-3 h-3 rounded-full border border-gray-200 dark:border-gray-600 shadow-sm transition-transform hover:scale-125"
                style={{ backgroundColor: currentColor || '#cbd5e1' }}
            />
            {isOpen && (
                <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-xl rounded-xl z-50 flex gap-1 animate-fade-in">
                    {RESOURCE_PALETTE.map(c => (
                        <button 
                            key={c} 
                            onClick={() => { onSelect(c); setIsOpen(false); }}
                            className="w-4 h-4 rounded-full border border-gray-100 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                        />
                    ))}
                    <button onClick={() => { onSelect(''); setIsOpen(false); }} className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px]"><i className="fa-solid fa-times"></i></button>
                </div>
            )}
        </div>
    );
};

const TableThemePicker: React.FC<{ currentColor: string, onSelect: (color: string) => void, label: string }> = ({ currentColor, onSelect, label }) => {
    return (
        <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-800 p-1 px-2 rounded-xl border border-gray-100 dark:border-gray-700">
            <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">{label}</span>
            <div className="flex space-x-1">
                {TABLE_THEME_PALETTE.map(c => (
                    <button 
                        key={c} 
                        onClick={() => onSelect(c)}
                        className={`w-3.5 h-3.5 rounded-full border transition-all ${currentColor === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        style={{ backgroundColor: c }}
                    />
                ))}
            </div>
        </div>
    );
};

const ResourceManager: React.FC<ResourceManagerProps> = ({ resources, setResources, tasks, setTasks, titleCosts, setTitleCosts, manMonthTableColor, setManMonthTableColor, costTableColor, setCostTableColor }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'manmonth' | 'costs'>('list');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [editingState, setEditingState] = useState<{ id: string, field: 'name' | 'unit' | 'title' } | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  
  const [newResourceName, setNewResourceName] = useState('');
  const [newResourceParticipation, setNewResourceParticipation] = useState(100);
  const [newResourceUnit, setNewResourceUnit] = useState('');
  const [newResourceTitle, setNewResourceTitle] = useState('');
  const [filterUnit, setFilterUnit] = useState('all');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const globalMonthlyTotals = useMemo(() => {
      return Array.from({length: 12}).map((_, mIdx) => 
          resources.reduce((sum, r) => sum + (r.monthlyPlan?.[mIdx] || 0), 0)
      );
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

  const handleUpdateResourceColor = (id: string, color: string) => {
      setResources(prev => prev.map(r => r.id === id ? { ...r, color } : r));
  };

  const handleStartEdit = (resource: Resource, field: 'name' | 'unit' | 'title') => {
      setEditingState({ id: resource.id, field });
      setTempValue(resource[field] || '');
  };

  const handleSaveEdit = () => {
      if (!editingState) return;
      const { id, field } = editingState;
      const val = tempValue.trim();
      if (!val) {
          setEditingState(null);
          return;
      }
      setResources(prev => prev.map(r => {
          if (r.id === id) {
              if (field === 'name' && r.name !== val) {
                  setTasks(tPrev => tPrev.map(t => t.resourceName === r.name ? { ...t, resourceName: val } : t));
              }
              if (field === 'unit' && r.unit !== val) {
                  setTasks(tPrev => tPrev.map(t => t.resourceName === r.name ? { ...t, unit: val } : t));
              }
              return { ...r, [field]: val };
          }
          return r;
      }));
      setEditingState(null);
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

              const newResources = [...resources];
              let currentUnit = 'Genel';
              const unitKeywords = ['toplam', 'değişebilir', 'paket', 'birim', 'grup', 'idame', 'tutum', 'bileşen'];
              const currentMonth = new Date().getMonth();

              data.slice(1).forEach((row) => {
                  const rawName = String(row[0] || '').trim();
                  if (!rawName) return;

                  const lowerName = rawName.toLocaleLowerCase('tr-TR');
                  const isUnitHeader = unitKeywords.some(key => lowerName.includes(key));
                  
                  if (isUnitHeader) {
                      let cleanedUnit = rawName;
                      unitKeywords.forEach(key => {
                          const reg = new RegExp(key, 'gi');
                          cleanedUnit = cleanedUnit.replace(reg, '').trim();
                      });
                      currentUnit = cleanedUnit || rawName;
                      return; 
                  }

                  const newPlan: Record<number, number> = {};
                  for (let i = 0; i < 12; i++) {
                      newPlan[i] = parseExcelValue(row[i + 1]);
                  }

                  let targetResIdx = newResources.findIndex(r => r.name.toLocaleLowerCase('tr-TR') === lowerName);
                  
                  const updatedParticipation = (newPlan[currentMonth] !== undefined && newPlan[currentMonth] !== null) 
                                               ? newPlan[currentMonth] 
                                               : 100;

                  if (targetResIdx > -1) {
                      newResources[targetResIdx] = {
                          ...newResources[targetResIdx],
                          monthlyPlan: newPlan,
                          unit: currentUnit,
                          participation: updatedParticipation
                      };
                  } else {
                      newResources.push({
                          id: Date.now().toString() + Math.random(),
                          name: rawName,
                          unit: currentUnit,
                          title: 'Uzman',
                          participation: updatedParticipation,
                          monthlyPlan: newPlan
                      });
                  }
              });

              setResources(newResources);
              alert('Ekip verileri güncellendi. Boş hücreler 0 olarak kabul edildi.');
          } catch (err) {
              console.error(err);
              alert('Excel okuma hatası.');
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
    const trimmedTitle = newResourceTitle.trim() || 'Uzman';

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
                {activeTab === 'manmonth' && (
                    <TableThemePicker label="TABLO TEMASI" currentColor={manMonthTableColor} onSelect={setManMonthTableColor} />
                )}
                {activeTab === 'costs' && (
                    <TableThemePicker label="TABLO TEMASI" currentColor={costTableColor} onSelect={setCostTableColor} />
                )}

                <div className="relative">
                    <button onMouseEnter={() => setShowHelp(true)} onMouseLeave={() => setShowHelp(false)} className="w-8 h-8 flex items-center justify-center text-primary hover:opacity-80 transition-colors">
                        <i className="fa-solid fa-circle-question"></i>
                    </button>
                    {showHelp && (
                        <div className="absolute right-0 top-10 w-80 bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 z-[110] text-[11px] animate-fade-in-up">
                            <h4 className="font-black text-primary uppercase mb-3 flex items-center"><i className="fa-solid fa-lightbulb mr-2"></i> Akıllı İçe Aktarma</h4>
                            <ul className="space-y-2 text-gray-500 dark:text-gray-400 leading-relaxed">
                                <li>• <b>Kapasite Kontrolü:</b> Birim toplamları, o birimdeki kişi sayısına göre değerlendirilir. (3 kişi = %300 kapasite)</li>
                                <li>• <b>Görsel Uyarılar:</b> Kapasite aşımı olduğunda hücreler otomatik olarak <b>Rose</b> tonuna döner.</li>
                            </ul>
                        </div>
                    )}
                </div>

                <div className="flex bg-emerald-50 dark:bg-emerald-900/20 p-1 rounded-xl border border-emerald-100 dark:border-emerald-800">
                    <input type="file" ref={fileInputRef} onChange={handleImportExcel} className="hidden" accept=".xlsx, .xls, .csv" />
                    <button onClick={() => fileInputRef.current?.click()} className="bg-emerald-600 text-white h-8 px-4 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:bg-emerald-700 flex items-center">
                        <i className="fa-solid fa-file-import mr-2"></i> {isImporting ? 'İŞLENİYOR...' : 'İÇE AKTAR'}
                    </button>
                    <button onClick={() => exportResourcePlanToExcel(resources)} className="bg-white dark:bg-emerald-800 text-emerald-600 dark:text-emerald-100 h-8 px-4 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:bg-emerald-50 ml-1 flex items-center">
                        <i className="fa-solid fa-file-export mr-2"></i> DIŞA AKTAR
                    </button>
                </div>

                <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                    <button onClick={() => setActiveTab('list')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'list' ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-gray-500'}`}>Liste</button>
                    <button onClick={() => setActiveTab('manmonth')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'manmonth' ? 'bg-white dark:bg-gray-700 text-emerald-600 shadow-sm' : 'text-gray-500'}`}>Adam/Ay</button>
                    <button onClick={() => setActiveTab('costs')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'costs' ? 'bg-white dark:bg-gray-700 text-amber-600 shadow-sm' : 'text-gray-500'}`}>Maliyet</button>
                </div>

                <button onClick={() => setIsFullScreen(!isFullScreen)} className="w-8 h-8 rounded-lg transition-all border flex items-center justify-center bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50">
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
                                <input type="text" value={newResourceName} onChange={e => setNewResourceName(e.target.value)} placeholder="Örn: Kaan" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs text-gray-800 dark:text-white transition-all focus:border-primary"/>
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Birim</label>
                                <input type="text" value={newResourceUnit} onChange={e => setNewResourceUnit(e.target.value)} placeholder="Örn: Geliştirme" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs text-gray-800 dark:text-white transition-all focus:border-primary"/>
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Ünvan</label>
                                <input type="text" value={newResourceTitle} onChange={e => setNewResourceTitle(e.target.value)} placeholder="Örn: Senior Geliştirici" className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs text-gray-800 dark:text-white transition-all focus:border-primary"/>
                            </div>
                            <button onClick={handleAddResource} className="bg-primary hover:opacity-90 text-white h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md transition-all">EKLE</button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <table className="min-w-full">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-900/40 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-700">
                                    <th className="px-6 py-3 text-left">İSİM</th>
                                    <th className="px-6 py-3 text-left">BİRİM</th>
                                    <th className="px-6 py-3 text-left">ÜNVAN</th>
                                    <th className="px-6 py-3 text-left">KATILIM (GÜNCEL)</th>
                                    <th className="px-6 py-3 text-right">İŞLEM</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                {filteredResources.map(resource => (
                                    <tr key={resource.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/10 group">
                                        <td className="px-6 py-3">
                                            {editingState?.id === resource.id && editingState.field === 'name' ? (
                                                <input autoFocus value={tempValue} onChange={e => setTempValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} onBlur={handleSaveEdit} className="bg-white border border-primary rounded px-2 py-0.5 text-xs font-bold outline-none uppercase w-full max-w-[200px]"/>
                                            ) : (
                                                <div className="flex items-center space-x-2">
                                                    <ResourceColorPicker currentColor={resource.color} onSelect={(c) => handleUpdateResourceColor(resource.id, c)} />
                                                    <div className="flex items-center space-x-2 cursor-pointer" onClick={() => handleStartEdit(resource, 'name')}>
                                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase">{resource.name}</span>
                                                        <i className="fa-solid fa-pencil text-[8px] text-gray-300 opacity-0 group-hover:opacity-100"></i>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">
                                            {editingState?.id === resource.id && editingState.field === 'unit' ? (
                                                <input autoFocus value={tempValue} onChange={e => setTempValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} onBlur={handleSaveEdit} className="bg-white border border-primary rounded px-2 py-0.5 text-[9px] font-black outline-none uppercase w-full max-w-[120px]"/>
                                            ) : (
                                                <span onClick={() => handleStartEdit(resource, 'unit')} className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-[9px] font-black text-gray-500 uppercase cursor-pointer hover:bg-gray-200 transition-colors">
                                                    {resource.unit}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">
                                            {editingState?.id === resource.id && editingState.field === 'title' ? (
                                                <input autoFocus value={tempValue} onChange={e => setTempValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveEdit()} onBlur={handleSaveEdit} className="bg-white border border-primary rounded px-2 py-0.5 text-[10px] font-bold outline-none uppercase w-full max-w-[150px]"/>
                                            ) : (
                                                <span onClick={() => handleStartEdit(resource, 'title')} className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase cursor-pointer hover:text-primary transition-colors">
                                                    {resource.title}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">
                                            <div onClick={() => alert('Lütfen adam/ay planında mevcut ay için değişiklik yapın.')} className="flex items-center space-x-2 cursor-help group/cap">
                                                <div className="w-16 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${resource.participation}%` }}></div>
                                                </div>
                                                <span className="text-[10px] font-black text-primary group-hover/cap:scale-110 transition-transform">%{resource.participation}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <button onClick={() => { if(window.confirm('Bu kaynağı silmek istediğinize emin misiniz?')) setResources(resources.filter(r => r.id !== resource.id)); }} className="text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
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
                                <tr className="text-white text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: manMonthTableColor }}>
                                    <th className="p-3 text-left border w-32 filter brightness-90" style={{ borderColor: manMonthTableColor, backgroundColor: manMonthTableColor }}>EKİP ÜYESİ</th>
                                    {MONTHS_SHORT.map(m => (
                                        <th key={m} className="p-2 text-center border w-14" style={{ borderColor: manMonthTableColor }}>{m}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="text-[11px]">
                                {groupedResources.map(([unit, unitResources]) => {
                                    const unitCapacity = unitResources.length * 100;
                                    const unitTotals = Array.from({length: 12}).map((_, mIdx) => 
                                        unitResources.reduce((sum, r) => sum + (r.monthlyPlan?.[mIdx] || 0), 0)
                                    );
                                    return (
                                        <React.Fragment key={unit}>
                                            <tr className="bg-gray-50/80 dark:bg-gray-900/30 sticky top-[37px] z-20 shadow-sm border-b" style={{ borderColor: `${manMonthTableColor}20` }}>
                                                <td className="p-1.5 pl-3 font-black border-r uppercase truncate" style={{ color: manMonthTableColor, borderRightColor: `${manMonthTableColor}20` }}>
                                                    <i className="fa-solid fa-layer-group mr-2 opacity-50 text-[8px]"></i>{unit} TOPLAM
                                                </td>
                                                {unitTotals.map((total, i) => {
                                                    const isOverload = total > unitCapacity;
                                                    return (
                                                        <td key={i} className={`p-1.5 text-center font-black border-r transition-colors ${isOverload ? 'text-rose-600 bg-rose-50/50 dark:text-rose-400 dark:bg-rose-900/20' : ''}`} style={{ borderRightColor: `${manMonthTableColor}20`, color: !isOverload ? manMonthTableColor : undefined }}>
                                                            %{total}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                            {unitResources.map(r => (
                                                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/10 transition-colors group">
                                                    <td className="p-1.5 pl-4 border-r border-gray-50 dark:border-gray-800 group-hover:bg-white dark:group-hover:bg-gray-700">
                                                        <div className="flex items-center">
                                                            <ResourceColorPicker currentColor={r.color} onSelect={(c) => handleUpdateResourceColor(r.id, c)} />
                                                            <div>
                                                                <p className="font-bold text-gray-700 dark:text-gray-200 leading-tight truncate">{formatName(r.name)}</p>
                                                                <p className="text-[7px] text-gray-400 dark:text-gray-500 font-black uppercase tracking-tighter opacity-70 leading-none mt-0.5">{r.title}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    {MONTHS_SHORT.map((_, mIdx) => {
                                                        const val = r.monthlyPlan?.[mIdx] || 0;
                                                        const isIndividualOver = val > 100;
                                                        return (
                                                            <td key={mIdx} className={`p-0 border-r border-gray-50 dark:border-gray-800 transition-colors ${isIndividualOver ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}>
                                                                <input 
                                                                    type="text" 
                                                                    value={val}
                                                                    onChange={(e) => handleUpdateMonthlyValue(r.id, mIdx, e.target.value)}
                                                                    className={`w-full h-8 text-center bg-transparent border-none outline-none font-bold p-0 hover:bg-white dark:hover:bg-gray-700 transition-colors focus:bg-white dark:focus:bg-gray-700 ${isIndividualOver ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-white'}`}
                                                                />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            <tfoot className="sticky bottom-0 z-30">
                                <tr className="bg-slate-900 text-white font-black shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                                    <td className="p-3 pl-3 uppercase tracking-widest text-[9px] border-r border-slate-700">GENEL TOPLAM</td>
                                    {globalMonthlyTotals.map((total, i) => {
                                        const globalCapacity = resources.length * 100;
                                        const isCritical = total > globalCapacity;
                                        return (
                                            <td key={i} className={`p-3 text-center text-[10px] border-r border-slate-700 ${isCritical ? 'text-rose-400 bg-rose-950/40' : 'text-primary'}`}>
                                                %{total}
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'costs' && (
              <div className="animate-fade-in-right">
                <CostManager 
                  resources={resources} 
                  setResources={setResources} 
                  titleCosts={titleCosts} 
                  setTitleCosts={setTitleCosts} 
                  costTableColor={costTableColor} 
                />
              </div>
            )}
        </div>
    </div>
  );
};

export default ResourceManager;
