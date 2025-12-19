
import React, { useState, useMemo } from 'react';
import { Resource } from '../types';
import PieChart from './PieChart';
import BarChart from './BarChart';

interface CostManagerProps {
  resources: Resource[];
  setResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  titleCosts: Record<string, number>;
  setTitleCosts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  costTableColor: string;
}

const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const RESOURCE_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

// Para birimi formatlama: 500.260,43
const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(val);
};

// İsimleri "Ad S." formatına getirir
const formatName = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length < 2) return name;
  const last = parts.pop();
  return `${parts.join(' ')} ${last?.charAt(0).toLocaleUpperCase('tr-TR')}.`;
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

const CostManager: React.FC<CostManagerProps> = ({ resources, setResources, titleCosts, setTitleCosts, costTableColor }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const uniqueTitles = useMemo(() => Array.from(new Set(resources.map(r => r.title))), [resources]);

  const handleUpdateCost = (title: string, value: string) => {
    const num = parseFloat(value) || 0;
    setTitleCosts(prev => ({ ...prev, [title]: num }));
  };

  const handleUpdateResourceColor = (id: string, color: string) => {
      setResources(prev => prev.map(r => r.id === id ? { ...r, color } : r));
  };

  // Matrisi ve Analitikleri hesapla
  const costMatrix = useMemo(() => {
    const monthsTotals = Array(12).fill(0);
    const unitTotals: Record<string, number> = {};
    const titleTotals: Record<string, number> = {};
    let totalProjectCost = 0;

    const data = resources.map(r => {
      const costs = Array(12).fill(0).map((_, mIdx) => {
        const perc = r.monthlyPlan?.[mIdx] || 0;
        const baseCost = titleCosts[r.title] || 0;
        const val = (perc / 100) * baseCost;
        
        monthsTotals[mIdx] += val;
        unitTotals[r.unit] = (unitTotals[r.unit] || 0) + val;
        titleTotals[r.title] = (titleTotals[r.title] || 0) + val;
        totalProjectCost += val;
        
        return val;
      });
      return { ...r, costs };
    });

    const cumulativeMonthsTotals = monthsTotals.reduce((acc: number[], curr, idx) => {
        const prev = idx > 0 ? acc[idx - 1] : 0;
        acc.push(prev + curr);
        return acc;
    }, []);

    const peakMonthIdx = monthsTotals.indexOf(Math.max(...monthsTotals));

    return { 
        data, 
        monthsTotals, 
        unitTotals, 
        titleTotals, 
        totalProjectCost, 
        cumulativeMonthsTotals,
        peakMonthIdx
    };
  }, [resources, titleCosts]);

  const barChartData = costMatrix.monthsTotals.map((total, i) => ({
    label: MONTHS_SHORT[i],
    value: Math.round(total),
    color: '#3b82f6'
  }));

  const cumulativeChartData = costMatrix.cumulativeMonthsTotals.map((total, i) => ({
    label: MONTHS_SHORT[i],
    value: Math.round(total),
    color: '#8b5cf6'
  }));

  const unitPieData = Object.entries(costMatrix.unitTotals).map(([unit, total]) => ({
    label: unit,
    value: Math.round(total as number),
    color: '#' + Math.floor(Math.random()*16777215).toString(16)
  }));

  const titlePieData = Object.entries(costMatrix.titleTotals).map(([title, total]) => ({
    label: title,
    value: Math.round(total as number),
    color: '#' + Math.floor(Math.random()*16777215).toString(16)
  }));

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in pb-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                 <h2 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight">Maliyet Yönetimi</h2>
                 <p className="text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">Bütçe Planlama & Harcama Analizi</p>
            </div>
            <div className="flex items-center space-x-2">
                <button 
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
                    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all ${isSettingsOpen ? 'text-white' : 'bg-white dark:bg-gray-800 border border-amber-100 dark:border-gray-700'}`}
                    style={isSettingsOpen ? { backgroundColor: costTableColor } : { color: costTableColor }}
                >
                    <i className="fa-solid fa-coins"></i>
                    <span>ÜNVAN MALİYETLERİ</span>
                </button>
            </div>
        </div>

        {isSettingsOpen && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-6 rounded-3xl animate-fade-in-up">
                <h3 className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: costTableColor }}>Ünvan Bazlı Birim Maliyet Tanımları (Aylık)</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {uniqueTitles.length > 0 ? uniqueTitles.map(title => (
                        <div key={title} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-amber-100 dark:border-gray-700 shadow-sm">
                            <label className="text-[9px] font-black text-gray-400 uppercase mb-1 block">{title}</label>
                            <div className="flex items-center">
                                <span className="text-xs text-gray-400 mr-2">₺</span>
                                <input 
                                    type="number" 
                                    value={titleCosts[title] || ''} 
                                    onChange={(e) => handleUpdateCost(title, e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-800 dark:text-white"
                                />
                            </div>
                        </div>
                    )) : (
                        <p className="col-span-full text-xs text-amber-600 font-bold italic">Önce Ekip sayfasından ünvanlı kaynak eklemelisiniz.</p>
                    )}
                </div>
            </div>
        )}

        {/* Dashboard KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Toplam Proje Bütçesi</p>
                <h3 className="text-xl font-black" style={{ color: costTableColor }}>₺{formatCurrency(costMatrix.totalProjectCost)}</h3>
                <p className="text-[8px] text-gray-400 mt-2 italic font-bold">12 Aylık Tahmini Toplam</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Aylık Ortalama Gider</p>
                <h3 className="text-xl font-black text-blue-600 dark:text-blue-400">₺{formatCurrency(costMatrix.totalProjectCost / 12)}</h3>
                <p className="text-[8px] text-gray-400 mt-2 italic font-bold">Aylık Beklenen Nakit Akışı</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">En Yoğun Harcama Ayı</p>
                <h3 className="text-xl font-black text-amber-600 dark:text-amber-400 uppercase">{MONTHS_SHORT[costMatrix.peakMonthIdx]}</h3>
                <p className="text-[8px] text-gray-400 mt-2 italic font-bold">Zirve Noktası: ₺{formatCurrency(costMatrix.monthsTotals[costMatrix.peakMonthIdx])}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Kaynak Başına Maliyet</p>
                <h3 className="text-xl font-black text-purple-600 dark:text-purple-400">₺{formatCurrency(resources.length > 0 ? costMatrix.totalProjectCost / resources.length : 0)}</h3>
                <p className="text-[8px] text-gray-400 mt-2 italic font-bold">Kişi Başı Yıllık Ortalama</p>
            </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse table-fixed min-w-[1200px]">
                <thead>
                    <tr className="text-white text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: costTableColor }}>
                        <th className="p-3 text-left border w-40 filter brightness-90" style={{ borderColor: costTableColor, backgroundColor: costTableColor }}>EKİP ÜYESİ</th>
                        {MONTHS_SHORT.map(m => (
                            <th key={m} className="p-2 text-center border w-28" style={{ borderColor: costTableColor }}>{m}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="text-[10px]">
                    {costMatrix.data.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/10 border-b border-gray-50 dark:border-gray-800">
                            <td className="p-2 pl-4 border-r border-gray-50 dark:border-gray-800">
                                <div className="flex items-center">
                                    <ResourceColorPicker currentColor={r.color} onSelect={(c) => {}} />
                                    <div className="min-w-0">
                                        <p className="font-bold text-gray-800 dark:text-white leading-tight truncate">{formatName(r.name)}</p>
                                        <p className="text-[7px] text-gray-400 dark:text-gray-500 uppercase font-black opacity-60 leading-none mt-0.5 tracking-tighter">{r.title}</p>
                                    </div>
                                </div>
                            </td>
                            {r.costs.map((val, i) => (
                                <td key={i} className="p-2 text-right border-r border-gray-50 dark:border-gray-800 font-mono font-bold" style={{ color: val > 0 ? costTableColor : undefined }}>
                                    {val > 0 ? `₺${formatCurrency(val)}` : '-'}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="font-black" style={{ backgroundColor: `${costTableColor}20`, color: costTableColor }}>
                        <td className="p-3 pl-4 uppercase tracking-widest text-[9px]">AYLIK TOPLAM</td>
                        {costMatrix.monthsTotals.map((total, i) => (
                            <td key={i} className="p-3 text-right font-mono text-[10px]">
                                ₺{formatCurrency(total)}
                            </td>
                        ))}
                    </tr>
                </tfoot>
            </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-lg h-full">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Maliyet Trendleri</h3>
                    <div className="flex space-x-2">
                        <div className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span><span className="text-[8px] font-black text-gray-400 uppercase">Aylık</span></div>
                        <div className="flex items-center space-x-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span><span className="text-[8px] font-black text-gray-400 uppercase">Kümülatif</span></div>
                    </div>
                </div>
                <div className="space-y-8">
                    <div>
                        <p className="text-[10px] font-black text-blue-500 mb-2 uppercase tracking-tighter">Aylık Dağılım</p>
                        <BarChart data={barChartData} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-purple-500 mb-2 uppercase tracking-tighter">Bütçe Harcanma Eğrisi (Kümülatif)</p>
                        <BarChart data={cumulativeChartData} />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-lg">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Birim Bazlı Maliyet Dağılımı</h3>
                    <PieChart data={unitPieData} />
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-lg">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Ünvan Bazlı Maliyet Dağılımı</h3>
                    <PieChart data={titlePieData} />
                </div>
            </div>
        </div>
    </div>
  );
};

export default CostManager;
