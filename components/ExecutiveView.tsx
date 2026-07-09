import React, { useMemo, useState } from 'react';
import { PlanLockStatus, ProjectStatus, RagStatus, UserRole, WorkspaceData } from '../types';
import { MONTHS_TR, ROLE_LABELS } from '../utils/allocations';
import { buildExecReport, exportExecReportToExcel } from '../utils/execReport';
import { baselinePlanFor, snapshotsForYear } from '../utils/snapshots';

interface ExecutiveViewProps {
  workspace: WorkspaceData;
  currentRole: UserRole;
  onOpenProject: (projectId: string) => void;
  onTakeSnapshot: (year: number) => void;
}

const STATUS_TR: Record<ProjectStatus, string> = {
  devam: 'Devam Eden', teklif: 'Teklif', beklemede: 'Beklemede', tamamlandi: 'Tamamlandı',
};
const RAG_COLORS: Record<RagStatus, string> = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' };
const RAG_TR: Record<RagStatus, string> = { green: 'Yolunda', amber: 'Riskli', red: 'Kritik' };
const LOCK_TR: Record<PlanLockStatus, { label: string; cls: string }> = {
  draft: { label: 'Taslak', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  submitted: { label: 'Onayda', cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300' },
  locked: { label: 'Kilitli', cls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

const fmt = (v: number): string => (Math.round(v * 100) / 100).toString().replace('.', ',');

const YEAR_RANGE = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2];
})();

const KpiCard: React.FC<{ icon: string; label: string; value: string; sub?: string; tone?: 'default' | 'red' | 'green' }> = ({ icon, label, value, sub, tone = 'default' }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3.5 flex items-center space-x-3 min-w-[150px]">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white flex-none ${tone === 'red' ? 'bg-red-500' : tone === 'green' ? 'bg-emerald-500' : ''}`}
         style={tone === 'default' ? { backgroundColor: 'var(--app-primary)' } : {}}>
      <i className={`fa-solid ${icon} text-sm`}></i>
    </div>
    <div className="leading-none min-w-0">
      <p className="text-[11px] font-semibold text-gray-400 mb-1.5">{label}</p>
      <p className="text-lg font-semibold text-gray-800 dark:text-white leading-none truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400 font-bold mt-1 truncate">{sub}</p>}
    </div>
  </div>
);

/** Aylık Plan vs Gerçekleşen gruplu bar + kapasite çizgisi (SVG) */
const PlanActualChart: React.FC<{ plan: number[]; actual: number[]; capacity: number }> = ({ plan, actual, capacity }) => {
  const H = 170;
  const groupW = 52;
  const barW = 16;
  const max = Math.max(...plan, ...actual, capacity, 0.1) * 1.15;
  const y = (v: number) => H - (v / max) * H;
  return (
    <div className="overflow-x-auto">
      <svg width={groupW * 12 + 20} height={H + 28} className="select-none">
        {/* Kapasite çizgisi */}
        {capacity > 0 && (
          <>
            <line x1={0} y1={y(capacity)} x2={groupW * 12} y2={y(capacity)} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.7} />
            <text x={groupW * 12 - 2} y={y(capacity) - 4} textAnchor="end" className="fill-red-400 text-xs font-bold">Kapasite {fmt(capacity)}</text>
          </>
        )}
        {MONTHS_TR.map((m, i) => {
          const gx = i * groupW + 8;
          return (
            <g key={m}>
              <rect x={gx} y={y(plan[i])} width={barW} height={H - y(plan[i])} rx={3} fill="var(--app-primary)" opacity={0.85}>
                <title>{m} Plan: {fmt(plan[i])} AA</title>
              </rect>
              <rect x={gx + barW + 3} y={y(actual[i])} width={barW} height={H - y(actual[i])} rx={3} fill="#10b981" opacity={0.85}>
                <title>{m} Gerçekleşen: {fmt(actual[i])} AA</title>
              </rect>
              <text x={gx + barW + 1.5} y={H + 14} textAnchor="middle" className="fill-gray-400 text-xs font-bold">{m}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center space-x-4 mt-1">
        <span className="flex items-center text-xs font-semibold text-gray-400">
          <span className="w-3 h-3 rounded-sm mr-1.5 inline-block" style={{ backgroundColor: 'var(--app-primary)' }}></span>Plan
        </span>
        <span className="flex items-center text-xs font-semibold text-gray-400">
          <span className="w-3 h-3 rounded-sm mr-1.5 inline-block bg-emerald-500"></span>Gerçekleşen
        </span>
      </div>
    </div>
  );
};

const ExecutiveView: React.FC<ExecutiveViewProps> = ({ workspace, currentRole, onOpenProject, onTakeSnapshot }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const report = useMemo(() => buildExecReport(workspace, year), [workspace, year]);
  const k = report.kpi;

  const maxDeptTotal = Math.max(...report.departmentPlanRows.map(d => d.total), 0.1);
  const snapshots = useMemo(() => snapshotsForYear(workspace, year), [workspace, year]);
  const baselines = useMemo(() => {
    const map = new Map<string, number>();
    workspace.projects.forEach(p => {
      const b = baselinePlanFor(workspace, p.id, year);
      if (b !== undefined) map.set(p.id, b);
    });
    return map;
  }, [workspace, year]);
  const maxSnapTotal = Math.max(...snapshots.map(s => s.totalPlanAA), k.totalPlanAA, 0.1);

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white tracking-tight">Yönetim Ekranı</h2>
          <p className="text-gray-400 text-xs font-semibold tracking-[0.2em]">
            Portföy Durumu · Plan-Gerçekleşme · Kaynak Sağlığı — {ROLE_LABELS[currentRole]}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200 focus:outline-none">
            {YEAR_RANGE.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => onTakeSnapshot(year)}
            className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:text-primary transition-all flex items-center"
            title="Şu anki plan-gerçekleşen durumunun anlık görüntüsünü (baseline) kaydeder"
          >
            <i className="fa-solid fa-camera mr-2"></i>Anlık Görüntü Al
          </button>
          <button
            onClick={() => exportExecReportToExcel(report)}
            className="text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md hover:opacity-90 transition-all flex items-center"
            style={{ backgroundColor: 'var(--app-primary)' }}
            title="Özet, projeler, aylık plan-gerçekleşen, bölüm/kişi AA ve aşırı tahsis sayfalarını içeren Excel indirir"
          >
            <i className="fa-solid fa-file-excel mr-2"></i>Yönetici Paketi (Excel)
          </button>
        </div>
      </div>

      {/* KPI şeridi */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon="fa-folder-open" label="Proje" value={String(k.projectTotal)} sub={`${k.projectCounts.devam} devam · ${k.projectCounts.teklif} teklif`} />
        <KpiCard icon="fa-heart-pulse" label="RAG Durumu" value={`${k.ragCounts.green}·${k.ragCounts.amber}·${k.ragCounts.red}`} sub="yolunda · riskli · kritik" tone={k.ragCounts.red > 0 ? 'red' : 'green'} />
        <KpiCard icon="fa-calendar-check" label={`${year} Plan`} value={`${fmt(k.totalPlanAA)} AA`} sub={`kapasite ${fmt(k.monthlyCapacityAA)} AA/ay`} />
        <KpiCard icon="fa-chart-line" label="Gerçekleşen" value={`${fmt(k.totalActualAA)} AA`} sub={`sapma ${k.totalVarianceAA >= 0 ? '+' : ''}${fmt(k.totalVarianceAA)} AA`} tone={k.totalVarianceAA > 0 ? 'red' : 'default'} />
        <KpiCard icon="fa-triangle-exclamation" label="Aşırı Tahsis" value={String(k.overAllocationCount)} sub="kişi-ay" tone={k.overAllocationCount > 0 ? 'red' : 'green'} />
        <KpiCard icon="fa-list-check" label="Görev İlerleme" value={`%${k.taskProgressPct}`} sub={`${k.taskDone}/${k.taskTotal} tamamlandı`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Aylık plan vs gerçekleşen */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-400 mb-4">
            <i className="fa-solid fa-chart-column mr-2" style={{ color: 'var(--app-primary)' }}></i>
            Aylık Plan vs Gerçekleşen ({year}, toplam AA)
          </h3>
          <PlanActualChart plan={report.monthlyPlan} actual={report.monthlyActual} capacity={k.monthlyCapacityAA} />
        </div>

        {/* Bölüm dağılımı */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-400 mb-4">
            <i className="fa-solid fa-building mr-2" style={{ color: 'var(--app-primary)' }}></i>
            Bölüm Bazlı Yıllık Plan (AA)
          </h3>
          <div className="space-y-3">
            {report.departmentPlanRows.map(d => (
              <div key={d.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{d.label}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(d.total)} AA</span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(d.total / maxDeptTotal) * 100}%`, backgroundColor: 'var(--app-primary)' }}></div>
                </div>
              </div>
            ))}
            {report.departmentPlanRows.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Bu yıl için tahsis verisi yok.</p>}
          </div>

          {report.overAllocations.length > 0 && (
            <div className="mt-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-3 py-2.5">
              <p className="text-xs font-semibold text-red-600 dark:text-red-300 mb-1">Aşırı Tahsisler</p>
              <ul className="space-y-0.5">
                {report.overAllocations.slice(0, 5).map((o, i) => (
                  <li key={i} className="text-xs text-red-700 dark:text-red-300">
                    {o.personName} — {MONTHS_TR[o.month - 1]}: {fmt(o.total)} / {fmt(o.capacity)} AA
                  </li>
                ))}
                {report.overAllocations.length > 5 && <li className="text-xs font-bold text-red-500">+{report.overAllocations.length - 5} diğer</li>}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Baseline & plan kayması trendi */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-gray-400">
            <i className="fa-solid fa-camera mr-2" style={{ color: 'var(--app-primary)' }}></i>
            Baseline & Plan Kayması ({year}) — plan onaylandığında otomatik fotoğraflanır
          </h3>
          <span className="text-xs font-semibold text-gray-400">{snapshots.length} anlık görüntü</span>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Henüz anlık görüntü yok. Bir plan onaylandığında ("Onayla & Kilitle") otomatik alınır veya "Anlık Görüntü Al" ile elle kaydedebilirsiniz.
          </p>
        ) : (
          <div className="space-y-2">
            {snapshots.map(s => (
              <div key={s.id} className="flex items-center space-x-3">
                <div className="w-44 flex-none leading-tight">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate" title={s.label}>{s.label}</p>
                  <p className="text-[11px] font-bold text-gray-400">{new Date(s.takenAt).toLocaleDateString('tr-TR')} · {s.trigger === 'lock' ? 'Onay' : 'Manuel'}</p>
                </div>
                <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full opacity-70" style={{ width: `${(s.totalPlanAA / maxSnapTotal) * 100}%`, backgroundColor: 'var(--app-primary)' }} title={`Plan: ${fmt(s.totalPlanAA)} AA`}></div>
                </div>
                <span className="w-24 flex-none text-right text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(s.totalPlanAA)} AA</span>
                <span className={`w-24 flex-none text-right text-xs font-semibold ${s.totalPlanAA !== k.totalPlanAA ? (k.totalPlanAA > s.totalPlanAA ? 'text-red-500' : 'text-amber-500') : 'text-gray-300'}`}>
                  {k.totalPlanAA - s.totalPlanAA > 0 ? '+' : ''}{fmt(k.totalPlanAA - s.totalPlanAA)} Δ
                </span>
              </div>
            ))}
            <div className="flex items-center space-x-3 pt-1 border-t border-gray-50 dark:border-gray-700/60">
              <div className="w-44 flex-none">
                <p className="text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>ŞU ANKİ PLAN</p>
              </div>
              <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(k.totalPlanAA / maxSnapTotal) * 100}%`, backgroundColor: 'var(--app-primary)' }}></div>
              </div>
              <span className="w-24 flex-none text-right text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(k.totalPlanAA)} AA</span>
              <span className="w-24 flex-none"></span>
            </div>
          </div>
        )}
      </div>

      {/* Proje durum tablosu */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 dark:border-gray-700/60">
          <h3 className="text-xs font-semibold text-gray-400">
            <i className="fa-solid fa-table-list mr-2" style={{ color: 'var(--app-primary)' }}></i>
            Proje Portföy Durumu
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/80">
                {['Proje', 'Durum', 'RAG', 'Haftalık Not', 'İlerleme', `Plan AA`, 'Gerç. AA', 'Sapma', 'Baseline Δ', 'Plan Kilidi'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {report.projects.map(p => (
                <tr key={p.projectId} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 cursor-pointer" onClick={() => onOpenProject(p.projectId)} title="Projeyi aç">
                  <td className="px-4 py-2.5">
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{p.name}</span>
                    {p.code && <span className="ml-2 text-[11px] font-semibold text-gray-400">{p.code}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-bold text-gray-500">{STATUS_TR[p.status]}</td>
                  <td className="px-4 py-2.5">
                    {p.rag ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg text-white" style={{ backgroundColor: RAG_COLORS[p.rag] }}>{RAG_TR[p.rag]}</span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 max-w-[220px] truncate" title={p.ragNote}>{p.ragNote || '—'}</td>
                  <td className="px-4 py-2.5 min-w-[110px]">
                    <div className="flex items-center space-x-2">
                      <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${p.progressPct}%`, backgroundColor: 'var(--app-primary)' }}></div>
                      </div>
                      <span className="text-xs font-semibold text-gray-500">%{p.progressPct}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(p.planAA)}</td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{fmt(p.actualAA)}</td>
                  <td className={`px-4 py-2.5 text-xs font-semibold ${p.varianceAA > 0 ? 'text-red-500' : p.varianceAA < 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                    {p.varianceAA > 0 ? '+' : ''}{fmt(p.varianceAA)}
                  </td>
                  <td className="px-4 py-2.5">
                    {(() => {
                      const base = baselines.get(p.projectId);
                      if (base === undefined) return <span className="text-xs text-gray-300">—</span>;
                      const delta = Math.round((p.planAA - base) * 100) / 100;
                      return (
                        <span
                          className={`text-xs font-semibold ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-amber-500' : 'text-gray-400'}`}
                          title={`Onaylanan plan (baseline): ${fmt(base)} AA — şu anki plan: ${fmt(p.planAA)} AA`}
                        >
                          {delta > 0 ? '+' : ''}{fmt(delta)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg ${LOCK_TR[p.lockStatus].cls}`}>{LOCK_TR[p.lockStatus].label}</span>
                  </td>
                </tr>
              ))}
              {report.projects.length === 0 && (
                <tr><td colSpan={10} className="text-center text-gray-400 text-xs py-10">Portföyde proje yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveView;
