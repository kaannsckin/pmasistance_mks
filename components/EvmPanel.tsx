import React, { useMemo, useState } from 'react';
import { WorkspaceData } from '../types';
import { MONTHS_TR } from '../utils/allocations';
import { fmtTL } from '../utils/costing';
import { buildPortfolioEVM, defaultStatusMonth, ProjectEVM } from '../utils/evm';

interface EvmPanelProps {
  workspace: WorkspaceData;
  year: number;
  projectIds?: string[]; // kapsam (RBAC); verilmezse tüm projeler
}

const idxColor = (v: number | null): string => {
  if (v === null) return 'text-gray-400';
  if (v >= 1 - 1e-9) return 'text-emerald-600 dark:text-emerald-300';
  if (v >= 0.95) return 'text-amber-600 dark:text-amber-300';
  return 'text-red-500 dark:text-red-300';
};
const idxLabel = (v: number | null): string => (v === null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const Kpi: React.FC<{ label: string; value: string; tone?: string; sub?: string; hint?: string }> = ({ label, value, tone, sub, hint }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3" title={hint}>
    <p className="text-[11px] font-semibold text-gray-400 mb-1">{label}</p>
    <p className={`text-lg font-semibold ${tone || 'text-gray-800 dark:text-white'}`}>{value}</p>
    {sub && <p className="text-[11px] text-gray-400 font-semibold mt-0.5">{sub}</p>}
  </div>
);

const EvmPanel: React.FC<EvmPanelProps> = ({ workspace, year, projectIds }) => {
  const [statusMonth, setStatusMonth] = useState<number>(() => defaultStatusMonth(year));
  const evm = useMemo(() => buildPortfolioEVM(workspace, year, projectIds, statusMonth), [workspace, year, projectIds, statusMonth]);

  const budgetPct = evm.bac > 0 ? Math.min(100, (evm.ac / evm.bac) * 100) : 0;
  const evPct = evm.bac > 0 ? Math.min(100, (evm.ev / evm.bac) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <i className="fa-solid fa-chart-pie" style={{ color: 'var(--app-primary)' }}></i>
            Kazanılmış Değer (EVM) &amp; Bütçe — {year}
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">İlerleme görev tamamlanmasından (efor-ağırlıklı) türetilir. Maliyet = AA × ünvan aylık maliyeti.</p>
        </div>
        <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-500 dark:text-gray-300">
          Durum ayı
          <select value={statusMonth} onChange={e => setStatusMonth(parseInt(e.target.value, 10))} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none">
            {MONTHS_TR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </label>
      </div>

      {evm.costedTitleCount === 0 ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-[11px] text-amber-700 dark:text-amber-300">
          <i className="fa-solid fa-circle-info mr-1"></i>EVM için ünvan maliyeti gerekir. Veri Havuzu → Ünvanlar'da aylık maliyet girin.
        </div>
      ) : evm.projects.length === 0 ? (
        <p className="text-center text-gray-400 text-xs py-8">Bu yıl/kapsam için maliyetlenebilir proje yok.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi label="SPI (Takvim)" value={idxLabel(evm.spi)} tone={idxColor(evm.spi)} sub={evm.spi === null ? '' : evm.spi >= 1 ? 'önde/zamanında' : 'geride'} hint="EV / PV — 1 ve üzeri iyi" />
            <Kpi label="CPI (Maliyet)" value={idxLabel(evm.cpi)} tone={idxColor(evm.cpi)} sub={evm.cpi === null ? '' : evm.cpi >= 1 ? 'bütçe altında' : 'bütçe aşımı'} hint="EV / AC — 1 ve üzeri iyi" />
            <Kpi label="Bütçe (BAC)" value={fmtTL(evm.bac)} hint="Yılın toplam planlı maliyeti" />
            <Kpi label="Kazanılmış (EV)" value={fmtTL(evm.ev)} sub={`plan ${fmtTL(evm.pv)}`} hint="BAC × ilerleme%" />
            <Kpi label="Gerçek (AC)" value={fmtTL(evm.ac)} hint="Durum ayına kadar gerçekleşen maliyet" />
            <Kpi label="Tahmini Toplam (EAC)" value={fmtTL(evm.eac)} tone={evm.vac < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-300'} sub={`VAC ${evm.vac >= 0 ? '+' : ''}${fmtTL(evm.vac)}`} hint="BAC/CPI — tahmini bitiş maliyeti" />
          </div>

          {/* Bütçe tüketimi çubuğu (AC) + kazanılmış işaret (EV) */}
          <div>
            <div className="flex items-center justify-between mb-1.5 text-[11px] font-semibold text-gray-400">
              <span>Bütçe tüketimi (gerçek {fmtTL(evm.ac)} / {fmtTL(evm.bac)})</span>
              <span>%{Math.round(budgetPct)}</span>
            </div>
            <div className="relative w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${budgetPct}%`, backgroundColor: evm.cpi !== null && evm.cpi < 1 ? '#ef4444' : 'var(--app-primary)' }}></div>
              {/* Kazanılmış değer işareti */}
              <div className="absolute inset-y-0 w-0.5 bg-emerald-600 dark:bg-emerald-300" style={{ left: `${evPct}%` }} title={`Kazanılmış değer ${fmtTL(evm.ev)}`}></div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1"><span className="inline-block w-2 border-t-2 border-emerald-500 align-middle mr-1"></span>Yeşil çizgi = kazanılmış değer (EV). Çubuk EV'nin sağındaysa maliyet aşımı.</p>
          </div>

          {/* Proje kırılımı */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/80">
                  {['Proje', 'İlerleme', 'BAC', 'PV', 'EV', 'AC', 'SPI', 'CPI', 'EAC', 'VAC'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {evm.projects.map((p: ProjectEVM) => (
                  <tr key={p.projectId} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200 max-w-[180px] truncate" title={p.projectName}>{p.projectName}</td>
                    <td className="px-3 py-2 text-[11px] text-gray-500">%{Math.round(p.percentComplete * 100)}</td>
                    <td className="px-3 py-2 text-[11px] text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtTL(p.bac)}</td>
                    <td className="px-3 py-2 text-[11px] text-gray-500 whitespace-nowrap">{fmtTL(p.pv)}</td>
                    <td className="px-3 py-2 text-[11px] text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtTL(p.ev)}</td>
                    <td className="px-3 py-2 text-[11px] text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtTL(p.ac)}</td>
                    <td className={`px-3 py-2 text-[11px] font-semibold ${idxColor(p.spi)}`}>{idxLabel(p.spi)}</td>
                    <td className={`px-3 py-2 text-[11px] font-semibold ${idxColor(p.cpi)}`}>{idxLabel(p.cpi)}</td>
                    <td className="px-3 py-2 text-[11px] text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtTL(p.eac)}</td>
                    <td className={`px-3 py-2 text-[11px] font-semibold whitespace-nowrap ${p.vac < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-300'}`}>{p.vac >= 0 ? '+' : ''}{fmtTL(p.vac)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default EvmPanel;
