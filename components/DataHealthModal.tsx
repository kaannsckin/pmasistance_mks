import React, { useMemo } from 'react';
import { WorkspaceData } from '../types';
import { analyzeDataHealth, CATEGORY_LABELS, HealthCategory, HealthFix, HealthSeverity } from '../utils/dataHealth';

interface DataHealthModalProps {
  workspace: WorkspaceData;
  onApplyFix: (fix: HealthFix) => void;
  onClose: () => void;
}

const SEV_STYLE: Record<HealthSeverity, { label: string; badge: string; dot: string }> = {
  error: { label: 'Hata', badge: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300', dot: '#ef4444' },
  warn: { label: 'Uyarı', badge: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300', dot: '#f59e0b' },
  info: { label: 'Bilgi', badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', dot: '#9ca3af' },
};

const SEV_ORDER: HealthSeverity[] = ['error', 'warn', 'info'];

const DataHealthModal: React.FC<DataHealthModalProps> = ({ workspace, onApplyFix, onClose }) => {
  const report = useMemo(() => analyzeDataHealth(workspace), [workspace]);

  const grouped = useMemo(() => {
    const g: Record<HealthSeverity, typeof report.issues> = { error: [], warn: [], info: [] };
    report.issues.forEach(i => g[i.severity].push(i));
    return g;
  }, [report]);

  const activeCategories = (Object.keys(CATEGORY_LABELS) as HealthCategory[]).filter(c => report.byCategory[c] > 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: 'var(--app-primary)' }}>
              <i className="fa-solid fa-stethoscope"></i>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Veri Sağlığı Denetimi</h3>
              <p className="text-xs text-gray-400">Gerçek veriyle çalışmadan önce tutarsızlıkları bul ve düzelt</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Özet */}
          <div className="grid grid-cols-3 gap-3">
            {SEV_ORDER.map(sev => (
              <div key={sev} className="bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: SEV_STYLE[sev].dot }}></span>
                  <span className="text-[11px] font-semibold text-gray-400">{SEV_STYLE[sev].label}</span>
                </div>
                <p className="text-2xl font-semibold text-gray-800 dark:text-white">{report.counts[sev]}</p>
              </div>
            ))}
          </div>

          {report.issues.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-3">
                <i className="fa-solid fa-circle-check text-2xl text-emerald-500"></i>
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Veri temiz görünüyor</p>
              <p className="text-xs text-gray-400 mt-1">Yetim tahsis, eşleşmeyen atama, mükerrer kayıt veya eksik alan bulunamadı.</p>
            </div>
          ) : (
            <>
              {/* Kategori rozetleri */}
              <div className="flex flex-wrap gap-2">
                {activeCategories.map(c => (
                  <span key={c} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300">
                    {CATEGORY_LABELS[c]} <b className="ml-0.5">{report.byCategory[c]}</b>
                  </span>
                ))}
              </div>

              {/* Sorunlar — önem sırasıyla */}
              {SEV_ORDER.map(sev => grouped[sev].length > 0 && (
                <div key={sev} className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: SEV_STYLE[sev].dot }}></span>
                    {SEV_STYLE[sev].label} ({grouped[sev].length})
                  </h4>
                  {grouped[sev].map(issue => (
                    <div key={issue.id} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex-none mt-0.5 ${SEV_STYLE[sev].badge}`}>{SEV_STYLE[sev].label}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{issue.title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{issue.detail}</p>
                      </div>
                      {issue.fix && (
                        <button
                          onClick={() => onApplyFix(issue.fix!)}
                          className="flex-none text-[11px] font-semibold px-3 py-1.5 rounded-lg text-white hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: 'var(--app-primary)' }}
                        >
                          <i className="fa-solid fa-wrench mr-1"></i>{issue.fixLabel}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataHealthModal;
