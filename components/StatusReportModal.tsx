import React, { useState } from 'react';
import { WorkspaceData } from '../types';
import { buildStatusReport } from '../utils/statusReport';

interface StatusReportModalProps {
  workspace: WorkspaceData;
  projectId: string;
  onClose: () => void;
}

const StatusReportModal: React.FC<StatusReportModalProps> = ({ workspace, projectId, onClose }) => {
  const report = React.useMemo(() => buildStatusReport(workspace, projectId), [workspace, projectId]);
  const [text, setText] = useState(report?.text || '');
  const [copied, setCopied] = useState(false);

  if (!report) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Kopyalama engellenirse metni seçili bırak
      const ta = document.getElementById('status-report-text') as HTMLTextAreaElement | null;
      ta?.select();
    }
  };

  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `durum-raporu-${report.projectName}-H${report.week}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-none">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Haftalık Durum Raporu</h3>
            <p className="text-xs text-gray-400">{report.projectName} · Hafta {report.week}/{report.year} · düzenleyip kopyalayabilirsiniz</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
        </div>

        <div className="p-6 flex-1 overflow-hidden flex flex-col">
          {!report.hasContent && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5 text-[11px] text-amber-700 dark:text-amber-300 mb-3">
              Bu proje için henüz yeterli veri yok (görev, not, tahsis veya risk girin). Taslak yine de kopyalanabilir.
            </div>
          )}
          <textarea
            id="status-report-text"
            value={text}
            onChange={e => setText(e.target.value)}
            className="flex-1 min-h-[300px] w-full bg-gray-50 dark:bg-gray-950/40 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-[13px] leading-relaxed text-gray-700 dark:text-gray-200 font-mono focus:outline-none focus:border-primary resize-none"
            spellCheck={false}
          />
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between flex-none">
          <p className="text-[11px] text-gray-400">
            <i className="fa-solid fa-circle-info mr-1"></i>
            Teams/e-postaya yapıştırın; isterseniz Zekâ asistanına verip parlatabilirsiniz.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload} className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:text-primary transition-all">
              <i className="fa-solid fa-download mr-1.5"></i>.txt
            </button>
            <button onClick={handleCopy} className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-md hover:opacity-90 transition-all" style={{ backgroundColor: 'var(--app-primary)' }}>
              <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-1.5`}></i>{copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusReportModal;
