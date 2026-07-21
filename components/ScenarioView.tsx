import React, { useMemo, useState } from 'react';
import { Allocation, Person, Project, WorkspaceData } from '../types';
import { MONTHS_TR } from '../utils/allocations';
import { buildScenario, departmentRolePairs, proposalProjects, ScenarioHire } from '../utils/scenario';

interface ScenarioViewProps {
  people: Person[];
  projects: Project[];
  allocations: Allocation[];
  year: number;
}

const fmt = (v: number): string => {
  if (Math.abs(v) < 0.005) return '0';
  return (Math.round(v * 100) / 100).toString().replace('.', ',');
};

const ScenarioView: React.FC<ScenarioViewProps> = ({ people, projects, allocations, year }) => {
  const [wonIds, setWonIds] = useState<string[]>([]);
  const [hires, setHires] = useState<ScenarioHire[]>([]);
  const [newHire, setNewHire] = useState({ pairIndex: '', aa: 1 });

  // buildScenario yalnızca bu üç alanı okur
  const ws = useMemo(() => ({ people, projects, allocations } as WorkspaceData), [people, projects, allocations]);
  const proposals = useMemo(() => proposalProjects(ws), [ws]);
  const pairs = useMemo(() => departmentRolePairs(people), [people]);
  const result = useMemo(() => buildScenario(ws, year, { wonProjectIds: wonIds, hires }), [ws, year, wonIds, hires]);

  const toggleWon = (id: string) =>
    setWonIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const addHire = () => {
    const idx = Number(newHire.pairIndex);
    if (isNaN(idx) || !pairs[idx] || newHire.aa <= 0) return;
    setHires(prev => [...prev, { departmentCode: pairs[idx].departmentCode, role: pairs[idx].role, aa: newHire.aa }]);
    setNewHire({ pairIndex: '', aa: 1 });
  };

  const strainedSet = new Set(result.newlyStrained.map(r => `${r.departmentCode}|${r.role}`));
  const visibleRows = result.rows.filter(r => r.totals.scenario > 0);

  return (
    <div className="space-y-4">
      <div className="bg-accent/20 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3" style={{ backgroundColor: 'var(--app-accent-light)' }}>
        <p className="text-[11px] text-gray-600 dark:text-gray-300">
          <i className="fa-solid fa-flask mr-2" style={{ color: 'var(--app-primary)' }}></i>
          <b>Simülasyon:</b> Teklifleri "kazanılmış" sayıp varsayımsal işe alımlar ekleyin; hangi rollerin açığa düştüğünü görün. Hiçbir değişiklik kaydedilmez.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Teklif projeleri */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-3">Teklifleri Kazanılmış Say</h4>
          {proposals.length === 0 ? (
            <p className="text-[11px] text-gray-400">Teklif aşamasında proje yok. Portföy'de bir projenin durumunu "Teklif Aşaması" yapın.</p>
          ) : (
            <div className="space-y-1.5">
              {proposals.map(p => (
                <label key={p.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer">
                  <input type="checkbox" checked={wonIds.includes(p.id)} onChange={() => toggleWon(p.id)} className="w-4 h-4 accent-blue-600" />
                  <span className="text-xs text-gray-700 dark:text-gray-200 truncate">{p.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Varsayımsal işe alım */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-3">Varsayımsal İşe Alım</h4>
          <div className="space-y-2">
            <select value={newHire.pairIndex} onChange={e => setNewHire({ ...newHire, pairIndex: e.target.value })} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
              <option value="">Bölüm / Rol seç…</option>
              {pairs.map((p, i) => <option key={i} value={i}>{p.departmentCode} · {p.role}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={5} step={0.25} value={newHire.aa} onChange={e => setNewHire({ ...newHire, aa: parseFloat(e.target.value) || 0 })} className="w-20 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none" title="Aylık AA (kişi eşdeğeri)" />
              <span className="text-[10px] text-gray-400">AA/ay</span>
              <button onClick={addHire} disabled={newHire.pairIndex === ''} className="ml-auto text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ backgroundColor: 'var(--app-primary)' }}>Ekle</button>
            </div>
          </div>
          {hires.length > 0 && (
            <div className="mt-3 space-y-1">
              {hires.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] bg-gray-50 dark:bg-gray-900/50 rounded-lg px-2 py-1.5">
                  <span className="flex-1 text-gray-600 dark:text-gray-300 truncate">{h.departmentCode} · {h.role}</span>
                  <span className="font-semibold" style={{ color: 'var(--app-primary)' }}>+{fmt(h.aa)} AA</span>
                  <button onClick={() => setHires(prev => prev.filter((_, x) => x !== i))} className="text-gray-300 hover:text-red-500"><i className="fa-solid fa-times text-[10px]"></i></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sonuç özeti */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex flex-col justify-center">
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-3">Senaryo Sonucu</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Kazanılan teklif</span>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{result.wonProposalCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Varsayımsal işe alım</span>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmt(result.hireAA)} AA/yıl</span>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-2">
              <span className="text-[11px] text-gray-400">Getirdiği ek açık</span>
              <span className={`text-lg font-semibold ${result.totalNewGapAA > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {result.totalNewGapAA > 0 ? `+${fmt(result.totalNewGapAA)} AA` : 'Yok'}
              </span>
            </div>
            {result.newlyStrained.length > 0 && (
              <p className="text-[11px] text-red-600 dark:text-red-300 pt-1">
                <i className="fa-solid fa-triangle-exclamation mr-1"></i>{result.newlyStrained.length} rol senaryoda açığa düşüyor
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Rol bazlı senaryo tablosu */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="bg-gray-50/80 dark:bg-gray-800/80">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 sticky left-0 bg-gray-50 dark:bg-gray-800 min-w-[200px]">Bölüm / Rol / Ölçüt</th>
              {MONTHS_TR.map(m => <th key={m} className="px-1 py-2.5 text-center text-[11px] font-semibold text-gray-400">{m}</th>)}
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-400">Yıllık</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const strained = strainedSet.has(`${row.departmentCode}|${row.role}`);
              return (
                <React.Fragment key={`${row.departmentCode}|${row.role}`}>
                  <tr className="bg-gray-50/70 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700/60">
                    <td colSpan={14} className="px-4 py-2 sticky left-0">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{row.role}</span>
                      <span className="ml-2 text-[11px] text-gray-400">{row.departmentCode}</span>
                      {strained && <span className="ml-3 text-[11px] font-semibold text-red-500"><i className="fa-solid fa-triangle-exclamation mr-1"></i>senaryoda açığa düşüyor ({fmt(row.totals.gap)} AA)</span>}
                    </td>
                  </tr>
                  {([
                    ['Senaryo Talebi', row.scenario, 'text-gray-700 dark:text-gray-200 font-semibold'],
                    ['Kapasite (+alım)', row.capacity, 'text-gray-400'],
                    ['Açık', row.gap, 'gap'],
                  ] as [string, number[], string][]).map(([label, arr, cls]) => (
                    <tr key={label} className="hover:bg-gray-50/40 dark:hover:bg-gray-800/40">
                      <td className={`pl-8 pr-4 py-1.5 sticky left-0 bg-white dark:bg-gray-800 text-[11px] ${cls === 'gap' ? 'text-red-500 dark:text-red-300' : cls}`}>{label}</td>
                      {arr.map((v, idx) => (
                        <td key={idx} className={`px-1 py-1.5 text-center text-xs ${cls === 'gap' ? (v > 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 font-semibold' : 'text-gray-300 dark:text-gray-600') : (v > 0 ? '' : 'text-gray-300 dark:text-gray-600')}`}>{fmt(v)}</td>
                      ))}
                      <td className={`px-3 py-1.5 text-center text-xs font-semibold ${cls === 'gap' && row.totals.gap > 0 ? 'text-red-500' : ''}`} style={cls !== 'gap' ? { color: 'var(--app-primary)' } : {}}>
                        {fmt(label === 'Senaryo Talebi' ? row.totals.scenario : label === 'Kapasite (+alım)' ? row.totals.capacity : row.totals.gap)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={14} className="text-center text-gray-400 text-xs py-10">Senaryo talebi yok. Teklif seçin veya tahsis girin.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScenarioView;
