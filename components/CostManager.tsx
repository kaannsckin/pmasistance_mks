
import React, { useState, useMemo } from 'react';
import { Resource } from '../types';
import PieChart from './PieChart';
import BarChart from './BarChart';

interface CostManagerProps {
  resources: Resource[];
  titleCosts: Record<string, number>;
  setTitleCosts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// İsimleri "Ad S." formatına getirir
const formatName = (name: string) => {
  const parts = name.trim().split(' ');
  if (parts.length < 2) return name;
  const last = parts.pop();
  return `${parts.join(' ')} ${last?.charAt(0).toLocaleUpperCase('tr-TR')}.`;
};

const CostManager: React.FC<CostManagerProps> = ({ resources, titleCosts, setTitleCosts }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const uniqueTitles = useMemo(() => Array.from(new Set(resources.map(r => r.title))), [resources]);

  const handleUpdateCost = (title: string, value: string) => {
    const num = parseFloat(value) || 0;
    setTitleCosts(prev => ({ ...prev, [title]: num }));
  };

  // Matrisi hesapla: (Adam/Ay % / 100) * Ünvan Maliyeti
  const costMatrix = useMemo(() => {
    const monthsTotals = Array(12).fill(0);
    const unitTotals: Record<string, number> = {};
    const data = resources.map(r => {
      const costs = Array(12).fill(0).map((_, mIdx) => {
        const perc = r.monthlyPlan?.[mIdx] || 0;
        const baseCost = titleCosts[r.title] || 0;
        const val = (perc / 100) * baseCost;
        monthsTotals[mIdx] += val;
        unitTotals[r.unit] = (unitTotals[r.unit] || 0) + val;
        return val;
      });
      return { ...r, costs };
    });
    return { data, monthsTotals, unitTotals };
  }, [resources, titleCosts]);

  const barChartData = costMatrix.monthsTotals.map((total, i) => ({
    label: MONTHS_SHORT[i],
    value: Math.round(total),
    color: '#3b82f6'
  }));

  const pieChartData = Object.entries(costMatrix.unitTotals).map(([unit, total]) => ({
    label: unit,
    value: Math.round(total as number),
    color: '#' + Math.floor(Math.random()*16777215).toString(16) // Rastgele renk
  }));

  return (
    <div className="max-w-full mx-auto space-y-6 animate-fade-in">
        <div className="flex justify-between items-center">
            <div>
                 <h2 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight">Maliyet Hesaplama</h2>
                 <p className="text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">Bütçe Planlama & Ünvan Bazlı Harcama Matrisi</p>
            </div>
            <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all ${isSettingsOpen ? 'bg-amber-600 text-white' : 'bg-white dark:bg-gray-800 text-amber-600 border border-amber-100 dark:border-gray-700'}`}
            >
                <i className="fa-solid fa-coins"></i>
                <span>PARA DÜZENLEME</span>
            </button>
        </div>

        {isSettingsOpen && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-6 rounded-3xl animate-fade-in-up">
                <h3 className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-4">Ünvan Bazlı Birim Maliyet Tanımları (Aylık)</h3>
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

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse table-fixed min-w-[1000px]">
                <thead>
                    <tr className="bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest">
                        <th className="p-3 text-left border border-emerald-500 w-32 bg-emerald-700">EKİP ÜYESİ</th>
                        {MONTHS_SHORT.map(m => (
                            <th key={m} className="p-2 text-center border border-emerald-500 w-20">{m}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="text-[11px]">
                    {costMatrix.data.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/10 border-b border-gray-50 dark:border-gray-800">
                            <td className="p-2 pl-4 border-r border-gray-50 dark:border-gray-800">
                                <p className="font-bold text-gray-800 dark:text-white leading-tight truncate">{formatName(r.name)}</p>
                                <p className="text-[7px] text-gray-400 dark:text-gray-500 uppercase font-black opacity-60 leading-none mt-0.5 tracking-tighter">{r.title}</p>
                            </td>
                            {r.costs.map((val, i) => (
                                <td key={i} className="p-2 text-center border-r border-gray-50 dark:border-gray-800 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    {val > 0 ? `₺${val.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}` : '-'}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="bg-emerald-100 dark:bg-emerald-800 font-black text-emerald-900 dark:text-emerald-100">
                        <td className="p-3 pl-4 uppercase tracking-widest text-[9px]">AYLIK TOPLAM</td>
                        {costMatrix.monthsTotals.map((total, i) => (
                            <td key={i} className="p-3 text-center font-mono text-[10px]">
                                ₺{total.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                            </td>
                        ))}
                    </tr>
                </tfoot>
            </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-lg">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Aylık Maliyet Trendi</h3>
                <BarChart data={barChartData} />
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-lg">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Birim Bazlı Maliyet Dağılımı</h3>
                <PieChart data={pieChartData} />
            </div>
        </div>
    </div>
  );
};

export default CostManager;
