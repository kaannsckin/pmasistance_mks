import React, { useMemo, useState } from 'react';
import { WorkspaceData } from '../types';
import { MONTHS_TR } from '../utils/allocations';
import { STATUS_LABELS, STATUS_COLORS } from '../constants';
import { buildPersonProfile } from '../utils/personProfile';

interface PersonDetailModalProps {
  workspace: WorkspaceData;
  personId: string;
  onClose: () => void;
}

const fmt = (v: number): string => {
  if (Math.abs(v) < 0.005) return '0';
  return (Math.round(v * 100) / 100).toString().replace('.', ',');
};

const YEAR_RANGE = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2];
})();

const PersonDetailModal: React.FC<PersonDetailModalProps> = ({ workspace, personId, onClose }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const profile = useMemo(() => buildPersonProfile(workspace, personId, year), [workspace, personId, year]);
  const titleName = useMemo(() => {
    const t = workspace.titles.find(x => x.code === profile?.person.titleCode);
    return t ? `${t.code} — ${t.name}` : profile?.person.titleCode;
  }, [workspace.titles, profile]);

  if (!profile) return null;
  const { person, capacity, monthlyPlan, monthlyActual, overMonths, byProject, tasks } = profile;
  const overSet = new Set(overMonths);
  const maxMonth = Math.max(...monthlyPlan, ...monthlyActual, capacity, 0.1);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: 'var(--app-primary)' }}>
              {person.firstName.charAt(0)}{person.lastName.charAt(0)}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{person.firstName} {person.lastName}</h3>
              <p className="text-xs text-gray-400">
                {person.departmentCode}{titleName ? ` · ${titleName}` : ''}{person.sicil ? ` · Sicil ${person.sicil}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 focus:outline-none">
              {YEAR_RANGE.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Özet kutuları */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Aylık Kapasite', value: `${fmt(capacity)} AA` },
              { label: `${year} Plan`, value: `${fmt(profile.totalPlanAA)} AA` },
              { label: 'Gerçekleşen', value: `${fmt(profile.totalActualAA)} AA` },
              { label: 'Proje / Aşırı Ay', value: `${profile.projectCount} / ${overMonths.length}`, tone: overMonths.length > 0 ? 'red' : undefined },
            ].map(box => (
              <div key={box.label} className="bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
                <p className="text-[11px] font-semibold text-gray-400 mb-1">{box.label}</p>
                <p className={`text-lg font-semibold ${box.tone === 'red' ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>{box.value}</p>
              </div>
            ))}
          </div>

          {/* Aylık doluluk (kapasite çizgili) */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-3">
              <i className="fa-solid fa-gauge-high mr-2" style={{ color: 'var(--app-primary)' }}></i>
              Aylık Doluluk (tüm projeler, {year})
            </h4>
            <div className="flex items-end gap-1.5 h-32 px-1">
              {MONTHS_TR.map((m, i) => {
                const planH = (monthlyPlan[i] / maxMonth) * 100;
                const actualH = (monthlyActual[i] / maxMonth) * 100;
                const over = overSet.has(i + 1);
                return (
                  <div key={m} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div className="w-full flex items-end justify-center gap-0.5 h-full">
                      <div className="w-2.5 rounded-t transition-all" style={{ height: `${planH}%`, backgroundColor: over ? '#ef4444' : 'var(--app-primary)' }} title={`Plan ${fmt(monthlyPlan[i])} AA`}></div>
                      <div className="w-2.5 rounded-t bg-emerald-500 transition-all" style={{ height: `${actualH}%` }} title={`Gerçekleşen ${fmt(monthlyActual[i])} AA`}></div>
                    </div>
                    <span className="text-[9px] text-gray-400 mt-1">{m}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--app-primary)' }}></span>Plan</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500"></span>Gerçekleşen</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-500"></span>Kapasite aşımı</span>
            </div>
          </div>

          {/* Proje kırılımı */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-3">
              <i className="fa-solid fa-folder-open mr-2" style={{ color: 'var(--app-primary)' }}></i>
              Proje Dağılımı ({year} Plan AA)
            </h4>
            {byProject.length === 0 ? (
              <p className="text-xs text-gray-400">Bu yıl için tahsis yok.</p>
            ) : (
              <div className="space-y-2">
                {byProject.map(row => (
                  <div key={row.projectId} className="flex items-center gap-3">
                    <span className="w-40 flex-none text-xs font-semibold text-gray-600 dark:text-gray-300 truncate" title={row.projectName}>
                      {row.projectName}{row.role ? <span className="text-gray-400 font-normal"> · {row.role}</span> : ''}
                    </span>
                    <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(row.total / (byProject[0].total || 1)) * 100}%`, backgroundColor: 'var(--app-primary)' }}></div>
                    </div>
                    <span className="w-16 flex-none text-right text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(row.total)} AA</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Roller */}
          {person.roles.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-2">
                <i className="fa-solid fa-id-badge mr-2" style={{ color: 'var(--app-primary)' }}></i>Roller
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {person.roles.map(r => (
                  <span key={r} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">{r}</span>
                ))}
              </div>
            </div>
          )}

          {/* Görevler */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-3">
              <i className="fa-solid fa-list-check mr-2" style={{ color: 'var(--app-primary)' }}></i>
              Üzerindeki Görevler ({tasks.length})
            </h4>
            {tasks.length === 0 ? (
              <p className="text-xs text-gray-400">Bu kişiye atanmış görev bulunamadı (görev "Kaynak Adı" ile eşleşir).</p>
            ) : (
              <div className="space-y-1.5">
                {tasks.map(t => (
                  <div key={`${t.projectId}-${t.taskId}`} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
                    <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: STATUS_COLORS[t.status] }}></span>
                    <span className="flex-1 text-xs text-gray-700 dark:text-gray-200 truncate" title={t.taskName}>{t.taskName}</span>
                    <span className="text-[11px] text-gray-400 flex-none">{t.projectName}</span>
                    <span className="text-[11px] font-semibold flex-none" style={{ color: STATUS_COLORS[t.status] }}>{STATUS_LABELS[t.status]}</span>
                    {t.overdue && <span className="text-[10px] font-semibold text-red-500 flex-none"><i className="fa-solid fa-calendar-xmark mr-1"></i>gecikmiş</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonDetailModal;
