import React, { useMemo, useState } from 'react';
import { WorkspaceData } from '../types';
import { MONTHS_TR } from '../utils/allocations';
import { Identity, visiblePersonIds, visibleProjectIds } from '../utils/rbac';
import { buildMySchedule, buildProjectSchedule, buildTeamSchedule, buildWorkPackageSchedule, ScheduleScope, SchedRow } from '../utils/schedule';

interface CalendarViewProps {
  workspace: WorkspaceData;
  identity: Identity;
  onViewPerson: (personId: string) => void;
}

const fmt = (v: number): string => {
  if (Math.abs(v) < 0.005) return '0';
  return (Math.round(v * 100) / 100).toString().replace('.', ',');
};

const YEAR_RANGE = (() => { const y = new Date().getFullYear(); return [y - 1, y, y + 1, y + 2]; })();

const SCOPES: { id: ScheduleScope; label: string; icon: string }[] = [
  { id: 'me', label: 'Takvimim', icon: 'fa-user-clock' },
  { id: 'team', label: 'Ekip', icon: 'fa-users' },
  { id: 'project', label: 'Proje', icon: 'fa-folder-open' },
  { id: 'workpackage', label: 'İş Paketi', icon: 'fa-briefcase' },
];

const CalendarView: React.FC<CalendarViewProps> = ({ workspace, identity, onViewPerson }) => {
  const [scope, setScope] = useState<ScheduleScope>(identity.personId ? 'me' : 'team');
  const [year, setYear] = useState(new Date().getFullYear());
  const [projectId, setProjectId] = useState<string>('');

  const visibleProjects = useMemo(() => {
    const ids = visibleProjectIds(workspace, identity);
    return workspace.projects.filter(p => ids.has(p.id));
  }, [workspace, identity]);

  const activeProjectId = projectId && visibleProjects.some(p => p.id === projectId) ? projectId : (visibleProjects[0]?.id || '');

  const schedule = useMemo(() => {
    if (scope === 'me') {
      return identity.personId ? buildMySchedule(workspace, identity.personId, year) : { metric: 'aa' as const, rows: [] };
    }
    if (scope === 'team') {
      const ids = Array.from(visiblePersonIds(workspace, identity));
      return buildTeamSchedule(workspace, ids, year);
    }
    if (scope === 'project') return buildProjectSchedule(workspace, activeProjectId, year);
    return buildWorkPackageSchedule(workspace, activeProjectId, year);
  }, [scope, workspace, identity, year, activeProjectId]);

  const isTasks = schedule.metric === 'tasks';
  const clickablePeople = scope === 'team' || scope === 'project';

  const cellTone = (aa: number, tasks: number, leave: number, over: boolean, cap?: number): string => {
    if (over) return 'bg-red-500 text-white';
    if (isTasks) return tasks > 0 ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-gray-50 dark:bg-gray-800/40 text-gray-300 dark:text-gray-600';
    if (aa <= 0.049 && leave > 0.049) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    if (aa <= 0.049) return 'bg-gray-50 dark:bg-gray-800/40 text-gray-300 dark:text-gray-600';
    const ratio = cap && cap > 0 ? aa / cap : aa;
    if (ratio >= 0.85) return 'bg-amber-200 text-amber-800 dark:bg-amber-800/60 dark:text-amber-200';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  };

  const renderRow = (row: SchedRow) => (
    <tr key={row.id} className="hover:bg-gray-50/40 dark:hover:bg-gray-800/40">
      <td className="px-3 py-1 sticky left-0 bg-white dark:bg-gray-800 min-w-[170px]">
        {clickablePeople ? (
          <button onClick={() => onViewPerson(row.id)} className="text-left group">
            <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 leading-tight group-hover:text-primary transition-colors">{row.label}</div>
            {row.sublabel && <div className="text-[10px] text-gray-400 font-semibold">{row.sublabel}</div>}
          </button>
        ) : (
          <>
            <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 leading-tight">{row.label}</div>
            {row.sublabel && <div className="text-[10px] text-gray-400 font-semibold">{row.sublabel}</div>}
          </>
        )}
      </td>
      {row.cells.map((c, i) => {
        const cap = schedule.monthlyCapacity?.[i];
        return (
          <td key={i} className="p-0.5">
            <div
              className={`h-9 rounded-md flex flex-col items-center justify-center text-[10px] font-bold leading-none relative ${cellTone(c.aa, c.tasks, c.leave, c.over, cap)}`}
              title={`${MONTHS_TR[i]} · ${isTasks ? `${c.tasks} görev` : `${fmt(c.aa)} AA${c.leave > 0 ? ` · izin ${fmt(c.leave)}` : ''}${c.tasks > 0 ? ` · ${c.tasks} görev (termin)` : ''}`}`}
            >
              {isTasks ? (c.tasks > 0 ? c.tasks : '') : (c.aa > 0.049 ? fmt(c.aa) : (c.leave > 0.049 ? 'izin' : ''))}
              {!isTasks && c.tasks > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[13px] h-[13px] px-0.5 rounded-full bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 text-[8px] font-bold flex items-center justify-center" title={`${c.tasks} görev termini`}>{c.tasks}</span>
              )}
            </div>
          </td>
        );
      })}
      <td className="px-2 text-center text-[11px] font-semibold" style={{ color: 'var(--app-primary)' }}>{isTasks ? row.total : fmt(row.total)}</td>
    </tr>
  );

  const needsProject = scope === 'project' || scope === 'workpackage';
  const noPersonForMe = scope === 'me' && !identity.personId;

  return (
    <div className="space-y-4">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white tracking-tight">Takvim</h2>
          <p className="text-gray-400 text-xs font-semibold tracking-[0.2em]">Aylık Zaman Çizelgesi · Tahsis · Görev · İzin</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200 focus:outline-none">
            {YEAR_RANGE.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {needsProject && (
            <select value={activeProjectId} onChange={e => setProjectId(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
              {visibleProjects.length === 0 && <option value="">Proje yok</option>}
              {visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {SCOPES.map(s => (
          <button key={s.id} onClick={() => setScope(s.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${scope === s.id ? 'text-white shadow-md' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800'}`} style={scope === s.id ? { backgroundColor: 'var(--app-primary)' } : {}}>
            <i className={`fa-solid ${s.icon}`}></i><span>{s.label}</span>
          </button>
        ))}
      </div>

      {noPersonForMe ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-5 py-4 text-[11px] text-amber-700 dark:text-amber-300">
          <i className="fa-solid fa-user-lock mr-2"></i>"Takvimim" için üst menüden kimliğinizi (kişinizi) seçin. Yönetici olarak "Ekip" takvimini kullanabilirsiniz.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate" style={{ borderSpacing: '2px' }}>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 sticky left-0 bg-white dark:bg-gray-800 min-w-[170px]">
                  {scope === 'me' ? 'Proje' : scope === 'workpackage' ? 'İş Paketi' : 'Kişi'}
                </th>
                {MONTHS_TR.map(m => <th key={m} className="px-1 py-2 text-center text-[11px] font-semibold text-gray-400 w-12">{m}</th>)}
                <th className="px-2 py-2 text-center text-[11px] font-semibold text-gray-400">{isTasks ? 'Görev' : 'Yıllık'}</th>
              </tr>
            </thead>
            <tbody>
              {schedule.rows.map(renderRow)}
              {/* Takvimim: kapasite/izin alt satırı */}
              {scope === 'me' && schedule.monthlyCapacity && (
                <tr>
                  <td className="px-3 py-1 sticky left-0 bg-gray-50 dark:bg-gray-800 text-[10px] font-semibold text-gray-400">Efektif Kapasite</td>
                  {schedule.monthlyCapacity.map((c, i) => (
                    <td key={i} className="p-0.5">
                      <div className={`h-6 rounded-md flex items-center justify-center text-[9px] font-bold ${schedule.monthlyLeave![i] > 0.049 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300' : 'bg-gray-50 text-gray-400 dark:bg-gray-800/60'}`} title={schedule.monthlyLeave![i] > 0 ? `izin ${fmt(schedule.monthlyLeave![i])}` : ''}>
                        {fmt(c)}
                      </div>
                    </td>
                  ))}
                  <td></td>
                </tr>
              )}
              {schedule.rows.length === 0 && (
                <tr><td colSpan={14} className="text-center text-gray-400 text-xs py-10">Bu kapsam/yıl için kayıt yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        {isTasks ? (
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm inline-block bg-sky-100 dark:bg-sky-900/40"></span>Görev termini (o ay)</span>
        ) : (
          <>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm inline-block bg-emerald-100 dark:bg-emerald-900/40"></span>Uygun yük</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm inline-block bg-amber-200 dark:bg-amber-800/60"></span>Dolu</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm inline-block bg-red-500"></span>Aşırı</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-sm inline-block bg-amber-100 dark:bg-amber-900/30"></span>İzin</span>
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full inline-block bg-gray-800 dark:bg-gray-200"></span>Görev termini (rozet)</span>
          </>
        )}
      </div>
    </div>
  );
};

export default CalendarView;
