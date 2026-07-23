import React, { useMemo, useState } from 'react';
import { PlanLockStatus, ProjectStatus, RagStatus, UserRole, WorkspaceData } from '../types';
import { MONTHS_TR, ROLE_LABELS } from '../utils/allocations';
import { buildExecReport, exportExecReportToExcel } from '../utils/execReport';
import { exportExecReportToPpt } from '../utils/pptExport';
import { baselinePlanFor, snapshotsForYear } from '../utils/snapshots';
import { fmtTL } from '../utils/costing';
import { RISK_BAND_HEX, RISK_BAND_LABELS, summarizeRisks, topPortfolioRisks } from '../utils/risks';
import { AttentionCategory, attentionItems, executiveSummary, HealthBand, portfolioHealth } from '../utils/executive';
import { orgCapacity } from '../utils/deptScorecard';
import EvmPanel from './EvmPanel';

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

const HEALTH_HEX: Record<HealthBand, string> = { good: '#10b981', warn: '#f59e0b', bad: '#ef4444' };
const HEALTH_LABEL: Record<HealthBand, string> = { good: 'Sağlıklı', warn: 'İzlemede', bad: 'Kritik' };
const ATTN_ICON: Record<AttentionCategory, string> = {
  rag: 'fa-heart-pulse', approval: 'fa-hourglass-half', budget: 'fa-coins', schedule: 'fa-calendar-xmark',
  risk: 'fa-shield-halved', overdue: 'fa-clock', overalloc: 'fa-users-slash', data: 'fa-triangle-exclamation',
};

/** Sağlık halkası (conic-gradient) */
const HealthRing: React.FC<{ score: number; band: HealthBand; size?: number }> = ({ score, band, size = 68 }) => (
  <div className="rounded-full flex items-center justify-center flex-none" style={{ width: size, height: size, background: `conic-gradient(${HEALTH_HEX[band]} ${score * 3.6}deg, var(--tw-ring-color, #e5e7eb) 0deg)` }}>
    <div className="rounded-full bg-white dark:bg-gray-800 flex flex-col items-center justify-center" style={{ width: size - 14, height: size - 14 }}>
      <span className="text-sm font-bold" style={{ color: HEALTH_HEX[band] }}>%{score}</span>
    </div>
  </div>
);

const KpiCard: React.FC<{ icon: string; label: string; value: string; sub?: string; tone?: 'default' | 'red' | 'green'; onClick?: () => void; active?: boolean }> = ({ icon, label, value, sub, tone = 'default', onClick, active }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-2xl border shadow-sm px-4 py-3.5 flex items-center space-x-3 min-w-[150px] text-left w-full transition-all ${onClick ? 'hover:shadow-md hover:border-primary/40 cursor-pointer' : ''} ${active ? 'border-primary ring-2' : 'border-gray-100 dark:border-gray-700'}`}
      style={active ? { borderColor: 'var(--app-primary)', ['--tw-ring-color' as string]: 'var(--app-ring)' } : {}}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white flex-none ${tone === 'red' ? 'bg-red-500' : tone === 'green' ? 'bg-emerald-500' : ''}`}
           style={tone === 'default' ? { backgroundColor: 'var(--app-primary)' } : {}}>
        <i className={`fa-solid ${icon} text-sm`}></i>
      </div>
      <div className="leading-none min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-gray-400 mb-1.5">{label}{onClick && <i className={`fa-solid fa-chevron-${active ? 'up' : 'down'} ml-1.5 text-[9px] opacity-60`}></i>}</p>
        <p className="text-lg font-semibold text-gray-800 dark:text-white leading-none truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 font-bold mt-1 truncate">{sub}</p>}
      </div>
    </Tag>
  );
};

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
  const [isPptBusy, setIsPptBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded(e => (e === key ? null : key));

  const handlePptExport = async () => {
    setIsPptBusy(true);
    try {
      await exportExecReportToPpt(report, workspace.settings.theme || 'classic');
    } catch (e) {
      alert(`Sunum oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsPptBusy(false);
    }
  };
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
  const riskSummary = useMemo(() => summarizeRisks(workspace), [workspace]);
  const topRisks = useMemo(() => topPortfolioRisks(workspace).slice(0, 6), [workspace]);

  // "Özet gör, istersen detaya in" — sağlık + dikkat + otomatik özet
  const health = useMemo(() => portfolioHealth(workspace, year), [workspace, year]);
  const attention = useMemo(() => attentionItems(workspace, year), [workspace, year]);
  const summaryText = useMemo(() => executiveSummary(workspace, year), [workspace, year]);
  const org = useMemo(() => orgCapacity(workspace, year), [workspace, year]);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

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
          <button
            onClick={handlePptExport}
            disabled={isPptBusy}
            className="text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md hover:opacity-90 transition-all flex items-center disabled:opacity-50 bg-orange-500"
            title="Kapak, KPI panosu, plan-gerçekleşen grafiği, portföy tablosu, bölüm dağılımı ve kaynak sağlığı slaytlarını içeren PowerPoint indirir"
          >
            {isPptBusy ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-file-powerpoint mr-2"></i>}
            Sunum (PPT)
          </button>
        </div>
      </div>

      {/* Portföy sağlığı + otomatik yönetici özeti */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-none">
          <HealthRing score={health.orgScore} band={health.orgBand} />
          <div>
            <p className="text-[11px] font-semibold text-gray-400">Portföy Sağlığı</p>
            <p className="text-sm font-semibold" style={{ color: HEALTH_HEX[health.orgBand] }}>{HEALTH_LABEL[health.orgBand]}</p>
          </div>
        </div>
        <div className="w-px h-12 bg-gray-100 dark:bg-gray-700 hidden sm:block"></div>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed flex-1">{summaryText}</p>
      </div>

      {/* Dikkat gerektirenler — detaya inmeden hepsi tek yerde */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fa-solid fa-bell" style={{ color: 'var(--app-primary)' }}></i>Dikkat Gerektirenler
            {attention.length > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">{attention.length}</span>}
          </h3>
        </div>
        {attention.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-300 py-2">
            <i className="fa-solid fa-circle-check"></i>Her şey yolunda — acil dikkat gerektiren bir durum yok.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {attention.map(item => (
              <div key={item.id} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 border ${item.severity === 'error' ? 'bg-red-50/60 dark:bg-red-900/15 border-red-200 dark:border-red-800' : 'bg-amber-50/60 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800'}`}>
                <i className={`fa-solid ${ATTN_ICON[item.category]} mt-0.5 flex-none ${item.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}></i>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{item.title}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{item.detail}</p>
                </div>
                {item.projectId && (
                  <button onClick={() => onOpenProject(item.projectId!)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg flex-none text-white hover:opacity-90" style={{ backgroundColor: 'var(--app-primary)' }} title="Projeyi aç">
                    Aç <i className="fa-solid fa-arrow-right ml-0.5"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KPI şeridi — tıklanabilir kartlar detay açar */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon="fa-folder-open" label="Proje" value={String(k.projectTotal)} sub={`${k.projectCounts.devam} devam · ${k.projectCounts.teklif} teklif`} onClick={() => toggle('projects')} active={expanded === 'projects'} />
        <KpiCard icon="fa-heart-pulse" label="RAG Durumu" value={`${k.ragCounts.green}·${k.ragCounts.amber}·${k.ragCounts.red}`} sub="yolunda · riskli · kritik" tone={k.ragCounts.red > 0 ? 'red' : 'green'} onClick={() => toggle('rag')} active={expanded === 'rag'} />
        <KpiCard icon="fa-calendar-check" label={`${year} Plan`} value={`${fmt(k.totalPlanAA)} AA`} sub={`kapasite ${fmt(k.monthlyCapacityAA)} AA/ay`} />
        <KpiCard icon="fa-chart-line" label="Gerçekleşen" value={`${fmt(k.totalActualAA)} AA`} sub={`sapma ${k.totalVarianceAA >= 0 ? '+' : ''}${fmt(k.totalVarianceAA)} AA`} tone={k.totalVarianceAA > 0 ? 'red' : 'default'} />
        <KpiCard icon="fa-triangle-exclamation" label="Aşırı Tahsis" value={String(k.overAllocationCount)} sub="kişi-ay" tone={k.overAllocationCount > 0 ? 'red' : 'green'} onClick={() => toggle('over')} active={expanded === 'over'} />
        <KpiCard icon="fa-list-check" label="Görev İlerleme" value={`%${k.taskProgressPct}`} sub={`${k.taskDone}/${k.taskTotal} tamamlandı`} onClick={() => toggle('progress')} active={expanded === 'progress'} />
      </div>

      {/* Drill-down detayı (tıklanan KPI'ya göre) */}
      {expanded && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          {expanded === 'rag' && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-2">Projeler — RAG durumuna göre</h4>
              {(['red', 'amber', 'green'] as RagStatus[]).map(rag => {
                const ps = workspace.projects.filter(p => p.rag === rag);
                if (ps.length === 0) return null;
                return (
                  <div key={rag} className="flex items-start gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-lg text-white flex-none" style={{ backgroundColor: RAG_COLORS[rag] }}>{RAG_TR[rag]} ({ps.length})</span>
                    {ps.map(p => <button key={p.id} onClick={() => onOpenProject(p.id)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-primary">{p.name}</button>)}
                  </div>
                );
              })}
              {workspace.projects.filter(p => !p.rag).length > 0 && (
                <p className="text-[11px] text-gray-400">{workspace.projects.filter(p => !p.rag).length} proje RAG girilmemiş.</p>
              )}
            </div>
          )}
          {expanded === 'projects' && (
            <div className="flex flex-wrap gap-2">
              {workspace.projects.map(p => (
                <button key={p.id} onClick={() => onOpenProject(p.id)} className="flex items-center gap-2 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-primary">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-gray-800 text-gray-400">{STATUS_TR[p.status]}</span>{p.name}
                </button>
              ))}
            </div>
          )}
          {expanded === 'over' && (
            report.overAllocations.length === 0
              ? <p className="text-xs text-emerald-600 dark:text-emerald-300"><i className="fa-solid fa-circle-check mr-1"></i>Aşırı tahsis yok.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {report.overAllocations.map((o, i) => (
                    <span key={i} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                      {o.personName} · {MONTHS_TR[o.month - 1]} {fmt(o.total)}/{fmt(o.capacity)}
                    </span>
                  ))}
                </div>
              )
          )}
          {expanded === 'progress' && (
            <div className="space-y-2">
              {workspace.projects.map(p => {
                const total = p.tasks.length;
                const done = p.tasks.filter(t => t.status === 'Done').length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="w-40 flex-none text-[11px] font-semibold text-gray-600 dark:text-gray-300 truncate">{p.name}</span>
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--app-primary)' }}></div></div>
                    <span className="w-24 flex-none text-right text-[11px] font-semibold text-gray-500">{done}/{total} · %{pct}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Proje Sağlık Panosu — proje bazında (kurum skoru üstte) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
          <i className="fa-solid fa-heart-circle-check" style={{ color: 'var(--app-primary)' }}></i>Proje Sağlık Panosu
        </h3>
        {health.projects.length === 0 ? (
          <p className="text-xs text-gray-400">Proje yok.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {health.projects.map(ph => (
              <div key={ph.projectId} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                <HealthRing score={ph.score} band={ph.band} size={52} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{ph.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {ph.rag ? `${RAG_TR[ph.rag]} · ` : ''}{ph.cpi !== null ? `CPI ${ph.cpi.toLocaleString('tr-TR')} · ` : ''}{ph.spi !== null ? `SPI ${ph.spi.toLocaleString('tr-TR')} · ` : ''}{ph.highRisks > 0 ? `${ph.highRisks} yüksek risk` : 'risk yok'}
                  </p>
                  {ph.reasons.length > 0 && <p className="text-[10px] text-amber-500 mt-0.5 truncate" title={ph.reasons.join(', ')}>{ph.reasons.join(', ')}</p>}
                </div>
                <button onClick={() => onOpenProject(ph.projectId)} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg flex-none text-white hover:opacity-90" style={{ backgroundColor: 'var(--app-primary)' }}>Aç</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Departman Karnesi — kurum (insan kaynağı) kapasite sağlığı: özet gör, istersen kişilere in */}
      {org.departments.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <i className="fa-solid fa-people-group" style={{ color: 'var(--app-primary)' }}></i>Departman Karnesi
            </h3>
            <p className="text-[11px] text-gray-400">
              {org.totalHeadcount} kişi · Kapasite {fmt(org.totalCapacityAA)} AA · Plan {fmt(org.totalPlannedAA)} AA · Doluluk {org.utilization === null ? '—' : `%${Math.round(org.utilization * 100)}`}
              {org.overAllocatedPeople > 0 && ` · ${org.overAllocatedPeople} aşırı tahsis`}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {org.departments.map(d => {
              const uPct = d.utilization === null ? null : Math.round(d.utilization * 100);
              const isOpen = expandedDept === d.code;
              return (
                <div key={d.code} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                  <button onClick={() => setExpandedDept(o => (o === d.code ? null : d.code))} className="w-full flex items-center gap-2 text-left" title="Bölümdeki kişileri göster/gizle">
                    <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: HEALTH_HEX[d.band] }} title={HEALTH_LABEL[d.band]}></span>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate flex-1">{d.name}</span>
                    <span className="text-[10px] text-gray-400 flex-none">{d.headcount} kişi</span>
                    <i className={`fa-solid fa-chevron-${isOpen ? 'up' : 'down'} text-[9px] text-gray-300 flex-none`}></i>
                  </button>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400">Doluluk</span>
                      <span className="text-[10px] font-bold" style={{ color: HEALTH_HEX[d.band] }}>{uPct === null ? '—' : `%${uPct}`}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, uPct ?? 0)}%`, backgroundColor: HEALTH_HEX[d.band] }}></div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-gray-400">
                    <span>Kapasite <b className="text-gray-600 dark:text-gray-300">{fmt(d.capacityAA)}</b> AA</span>
                    <span>Plan <b className="text-gray-600 dark:text-gray-300">{fmt(d.plannedAA)}</b> AA</span>
                    <span>{d.projectCount} proje</span>
                    {d.overAllocatedPeople > 0 && <span className="text-red-500 font-semibold"><i className="fa-solid fa-users-slash mr-1"></i>{d.overAllocatedPeople} aşırı</span>}
                  </div>
                  {d.reasons.length > 0 && <p className="text-[10px] text-amber-500 mt-1 truncate" title={d.reasons.join(', ')}>{d.reasons.join(' · ')}</p>}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                      {d.people.map(pp => {
                        const pu = pp.utilization === null ? null : Math.round(pp.utilization * 100);
                        return (
                          <div key={pp.personId} className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-600 dark:text-gray-300 truncate flex-1">{pp.name}</span>
                            {pp.over && <span className="text-[9px] font-bold text-red-500 flex-none" title="Bazı aylarda kapasite üstü"><i className="fa-solid fa-triangle-exclamation"></i></span>}
                            <span className="text-[10px] text-gray-400 flex-none">{fmt(pp.plannedAA)}/{fmt(pp.capacityAA)} AA</span>
                            <span className="text-[10px] font-bold flex-none w-9 text-right" style={{ color: pu !== null && pu > 105 ? '#ef4444' : 'var(--app-primary)' }}>{pu === null ? '—' : `%${pu}`}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Portföy riskleri */}
      {riskSummary.total > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-gray-400">
              <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--app-primary)' }}></i>
              Portföy Riskleri
            </h3>
            <div className="flex items-center gap-2">
              {(['high', 'medium', 'low'] as const).map(b => (
                <span key={b} className="text-[11px] font-semibold px-2 py-1 rounded-lg text-white" style={{ backgroundColor: RISK_BAND_HEX[b] }}>
                  {RISK_BAND_LABELS[b]}: {b === 'high' ? riskSummary.high : b === 'medium' ? riskSummary.medium : riskSummary.low}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {topRisks.map(r => (
              <button key={r.id} onClick={() => onOpenProject(r.projectId)} className="w-full flex items-center gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors text-left" title="Projeyi aç">
                <span className="text-xs font-bold px-2 py-1 rounded-lg text-white flex-none" style={{ backgroundColor: RISK_BAND_HEX[r.band] }}>{r.score}</span>
                <span className="flex-1 text-xs text-gray-700 dark:text-gray-200 truncate" title={r.title}>{r.title}</span>
                <span className="text-[11px] text-gray-400 flex-none">{r.projectName}</span>
                {r.owner && <span className="text-[11px] text-gray-400 flex-none hidden md:inline">· {r.owner}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Maliyet katmanı */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-gray-400">
            <i className="fa-solid fa-coins mr-2" style={{ color: 'var(--app-primary)' }}></i>
            Maliyet ({year}, ₺) — tahsis × ünvan aylık maliyeti
          </h3>
          {report.cost.uncostedPeople.length > 0 && (
            <span className="text-[11px] font-semibold text-amber-500" title={report.cost.uncostedPeople.join(', ')}>
              <i className="fa-solid fa-triangle-exclamation mr-1"></i>
              {report.cost.uncostedPeople.length} kişi maliyetlenemedi (ünvan/₺ eksik)
            </span>
          )}
        </div>
        {report.cost.costedTitleCount === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Ünvan maliyetleri girilmemiş. <b>Veri Havuzu → Ünvanlar</b> sekmesinde her ünvana aylık maliyet (₺) girin; bu kart, Excel ve sunum paketleri otomatik dolacak.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-1">Plan</p>
                <p className="text-xl font-semibold" style={{ color: 'var(--app-primary)' }}>{fmtTL(report.cost.totalPlanCost)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-1">Gerçekleşen</p>
                <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{fmtTL(report.cost.totalActualCost)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 mb-1">Sapma</p>
                <p className={`text-xl font-semibold ${report.cost.totalVarianceCost > 0 ? 'text-red-500' : report.cost.totalVarianceCost < 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                  {report.cost.totalVarianceCost > 0 ? '+' : ''}{fmtTL(report.cost.totalVarianceCost)}
                </p>
              </div>
            </div>
            <div className="lg:col-span-2 space-y-2">
              {report.cost.byProject.slice(0, 5).map(row => {
                const maxCost = Math.max(report.cost.byProject[0]?.planCost || 1, 1);
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <span className="w-44 flex-none text-[11px] font-semibold text-gray-600 dark:text-gray-300 truncate" title={row.label}>{row.label}</span>
                    <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(row.planCost / maxCost) * 100}%`, backgroundColor: 'var(--app-primary)' }} title={`Plan: ${fmtTL(row.planCost)}`}></div>
                    </div>
                    <span className="w-28 flex-none text-right text-[11px] font-semibold" style={{ color: 'var(--app-primary)' }}>{fmtTL(row.planCost)}</span>
                    <span className="w-28 flex-none text-right text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{fmtTL(row.actualCost)}</span>
                  </div>
                );
              })}
              {report.cost.byProject.length > 5 && (
                <p className="text-[11px] text-gray-400">… ve {report.cost.byProject.length - 5} proje daha (tam kırılım Excel paketinde)</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Kazanılmış Değer (EVM) & Bütçe */}
      <EvmPanel workspace={workspace} year={year} />

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
                  <p className="text-[11px] font-bold text-gray-400">{new Date(s.takenAt).toLocaleDateString('tr-TR')} · {s.trigger === 'lock' ? 'Onay' : s.trigger === 'monthly' ? 'Otomatik' : 'Manuel'}</p>
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
