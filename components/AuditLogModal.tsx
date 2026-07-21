import React, { useMemo, useState } from 'react';
import { AuditAction, WorkspaceData } from '../types';
import { actorLabel, AUDIT_ACTION_ICONS, AUDIT_ACTION_LABELS } from '../utils/audit';

interface AuditLogModalProps {
  workspace: WorkspaceData;
  onClose: () => void;
}

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const AuditLogModal: React.FC<AuditLogModalProps> = ({ workspace, onClose }) => {
  const log = useMemo(() => workspace.auditLog || [], [workspace.auditLog]);
  const [filter, setFilter] = useState<AuditAction | 'all'>('all');

  const presentActions = useMemo(() => {
    const set = new Set(log.map(e => e.action));
    return (Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).filter(a => set.has(a));
  }, [log]);

  const rows = useMemo(() => (filter === 'all' ? log : log.filter(e => e.action === filter)), [log, filter]);
  const projectName = useMemo(() => new Map(workspace.projects.map(p => [p.id, p.name])), [workspace.projects]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: 'var(--app-primary)' }}>
              <i className="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Denetim Günlüğü</h3>
              <p className="text-xs text-gray-400">Kritik aksiyonların kaydı — kim, ne zaman, ne yaptı ({log.length})</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
        </div>

        <div className="p-6 space-y-4">
          {presentActions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilter('all')}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${filter === 'all' ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300'}`}
                style={filter === 'all' ? { backgroundColor: 'var(--app-primary)' } : {}}
              >
                Tümü ({log.length})
              </button>
              {presentActions.map(a => (
                <button
                  key={a}
                  onClick={() => setFilter(a)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${filter === a ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300'}`}
                  style={filter === a ? { backgroundColor: 'var(--app-primary)' } : {}}
                >
                  <i className={`fa-solid ${AUDIT_ACTION_ICONS[a]} mr-1`}></i>{AUDIT_ACTION_LABELS[a]}
                </button>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                <i className="fa-solid fa-clock-rotate-left text-2xl text-gray-300"></i>
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Henüz kayıt yok</p>
              <p className="text-xs text-gray-400 mt-1">Proje oluşturma/silme, plan onayı, içe aktarma ve veri düzeltmeleri burada listelenir.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {rows.map(e => (
                <div key={e.id} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-none text-gray-400 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <i className={`fa-solid ${AUDIT_ACTION_ICONS[e.action]} text-xs`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{e.summary}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {actorLabel(e)}
                      {e.projectId && projectName.get(e.projectId) ? ` · ${projectName.get(e.projectId)}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-none whitespace-nowrap mt-0.5">{fmtDate(e.at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogModal;
