import React, { useMemo, useState } from 'react';
import { Allocation, Leave, Person } from '../types';
import { EffortField, MONTHS_TR } from '../utils/allocations';
import { buildUtilization, HeatLevel } from '../utils/utilization';

interface UtilizationHeatmapProps {
  allocations: Allocation[];
  people: Person[];
  year: number;
  deptFilter: string; // 'all' | departmentCode
  leaves: Leave[];
}

const fmt = (v: number): string => {
  if (Math.abs(v) < 0.005) return '0';
  return (Math.round(v * 100) / 100).toString().replace('.', ',');
};

const pct = (r: number | null): string => (r === null ? '—' : `%${Math.round(r * 100)}`);

// Isı seviyeleri → renk (açık/koyu tema uyumlu, tek sistem)
const LEVEL_STYLE: Record<HeatLevel, { cls: string; label: string }> = {
  empty: { cls: 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600', label: 'Yük yok' },
  leave: { cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-400 dark:text-amber-500', label: 'İzin' },
  low: { cls: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300', label: 'Düşük (<%40)' },
  healthy: { cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', label: 'Sağlıklı (%40–85)' },
  full: { cls: 'bg-amber-200 dark:bg-amber-800/60 text-amber-800 dark:text-amber-200', label: 'Dolu (%85–100)' },
  over: { cls: 'bg-red-500 text-white dark:bg-red-600', label: 'Aşırı (>%100)' },
};

const LEGEND_ORDER: HeatLevel[] = ['low', 'healthy', 'full', 'over', 'leave', 'empty'];

const UtilizationHeatmap: React.FC<UtilizationHeatmapProps> = ({ allocations, people, year, deptFilter, leaves }) => {
  const [field, setField] = useState<EffortField>('plan');

  const filteredPeople = useMemo(
    () => (deptFilter === 'all' ? people : people.filter(p => p.departmentCode === deptFilter)),
    [people, deptFilter]
  );

  const { rows, peopleOver, peopleIdle, avgUtilization } = useMemo(
    () => buildUtilization(allocations, filteredPeople, year, field, leaves),
    [allocations, filteredPeople, year, field, leaves]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300">
            <i className="fa-solid fa-gauge-high" style={{ color: 'var(--app-primary)' }}></i>
            Ortalama doluluk: <b style={{ color: 'var(--app-primary)' }}>{avgUtilization === null ? '—' : pct(avgUtilization)}</b>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold ${peopleOver > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-300'}`}>
            <i className={`fa-solid ${peopleOver > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
            {peopleOver > 0 ? `${peopleOver} kişi aşırı yüklü` : 'Aşırı yük yok'}
          </div>
          {peopleIdle > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-300">
              <i className="fa-solid fa-user-clock"></i>{peopleIdle} kişi atıl (yüksüz)
            </div>
          )}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 p-1 rounded-xl flex items-center border border-gray-100 dark:border-gray-700">
          {([['plan', 'Plan'], ['actual', 'Gerçekleşen']] as [EffortField, string][]).map(([f, label]) => (
            <button key={f} onClick={() => setField(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${field === f ? 'bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600' : 'text-gray-400 hover:text-gray-600'}`} style={field === f ? { color: 'var(--app-primary)' } : {}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate" style={{ borderSpacing: '2px' }}>
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 sticky left-0 bg-white dark:bg-gray-800 min-w-[170px]">Personel</th>
              {MONTHS_TR.map(m => <th key={m} className="px-1 py-2 text-center text-[11px] font-semibold text-gray-400 w-12">{m}</th>)}
              <th className="px-2 py-2 text-center text-[11px] font-semibold text-gray-400">Yıllık</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.personId}>
                <td className="px-3 py-1 sticky left-0 bg-white dark:bg-gray-800">
                  <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 leading-tight truncate max-w-[160px]" title={row.name}>{row.name}</div>
                  <div className="text-[10px] text-gray-400 font-semibold">{row.departmentCode}{row.overCount > 0 ? ` · ${row.overCount} aşırı ay` : ''}</div>
                </td>
                {row.cells.map(cell => {
                  const s = LEVEL_STYLE[cell.level];
                  return (
                    <td key={cell.month} className="p-0">
                      <div
                        className={`h-9 rounded-md flex items-center justify-center text-[10px] font-bold ${s.cls}`}
                        title={`${row.name} · ${MONTHS_TR[cell.month - 1]} · ${field === 'plan' ? 'plan' : 'gerç.'} ${fmt(cell.load)} / kapasite ${fmt(cell.capacity)}${cell.leave > 0 ? ` (izin −${fmt(cell.leave)})` : ''}${cell.ratio !== null ? ` → ${pct(cell.ratio)}` : ''}`}
                      >
                        {cell.level === 'empty' ? '' : cell.level === 'leave' ? 'izin' : pct(cell.ratio)}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 text-center">
                  <div className={`text-xs font-semibold ${row.overCount > 0 ? 'text-red-500' : ''}`} style={row.overCount > 0 ? {} : { color: 'var(--app-primary)' }}>
                    {row.avgRatio === null ? '—' : pct(row.avgRatio)}
                  </div>
                  <div className="text-[10px] text-gray-400">{fmt(row.totalLoad)}/{fmt(row.totalCapacity)}</div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={14} className="text-center text-gray-400 text-xs py-10">Bu bölüm/yıl için personel yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {LEGEND_ORDER.map(lv => (
          <span key={lv} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <span className={`w-4 h-4 rounded-sm inline-block ${LEVEL_STYLE[lv].cls}`}></span>{LEVEL_STYLE[lv].label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default UtilizationHeatmap;
