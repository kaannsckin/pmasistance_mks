import React, { useMemo, useState } from 'react';
import { AuditAction, WorkspaceData } from '../../../types';
import { actorLabel, AUDIT_ACTION_LABELS, AUDIT_GROUP_LABELS, auditToCsv, filterAudit } from '../../../utils/audit';
import { Icon } from '../icons';
import { rowSep, Sheet } from '../ui';
import { downloadFile } from '../weekly/shared';

const GROUP_ICON: Record<string, string> = {
    project: 'briefcase', risk: 'shield', plan: 'calendar', data: 'upload', identity: 'users', health: 'activity',
    snapshot: 'history', ai: 'sparkles', expectation: 'flag', report: 'report', meeting: 'calendarCheck', access: 'key', config: 'sliders',
};
const iconOf = (a: AuditAction) => GROUP_ICON[a.split('.')[0]] || 'history';

/** Denetim günlüğü içeriği: kim, ne zaman, ne yaptı — gruba / projeye göre süzme, arama, CSV (pencere ve admin konsolu) */
export const AuditLogPanel: React.FC<{ workspace: WorkspaceData; showExport?: boolean }> = ({ workspace, showExport = true }) => {
    const log = useMemo(() => workspace.auditLog || [], [workspace.auditLog]);
    const [group, setGroup] = useState('');
    const [projectId, setProjectId] = useState('');
    const [query, setQuery] = useState('');
    const [limit, setLimit] = useState(100);
    const projectName = useMemo(() => {
        const m = new Map(workspace.projects.map(p => [p.id, p.name]));
        return (id: string) => m.get(id);
    }, [workspace.projects]);
    const groups = useMemo(() => [...new Set<string>(log.map(e => e.action.split('.')[0]))].sort((a, b) => (AUDIT_GROUP_LABELS[a] || a).localeCompare(AUDIT_GROUP_LABELS[b] || b, 'tr')), [log]);
    const projects = useMemo(() => [...new Set(log.map(e => e.projectId).filter((x): x is string => !!x))].map(id => ({ id, name: projectName(id) || 'Silinmiş proje' })).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [log, projectName]);
    const rows = useMemo(() => filterAudit(log, { group: group || undefined, projectId: projectId || undefined, query }, projectName), [log, group, projectId, query, projectName]);
    const days = useMemo(() => {
        const out: { key: string; label: string; items: typeof rows }[] = [];
        rows.slice(0, limit).forEach(e => {
            const d = new Date(e.at);
            const key = d.toDateString();
            let day = out.find(x => x.key === key);
            if (!day) { day = { key, label: d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), items: [] }; out.push(day); }
            day.items.push(e);
        });
        return out;
    }, [rows, limit]);

    const exportCsv = () => downloadFile(`denetim-gunlugu-${new Date().toISOString().slice(0, 10)}.csv`, auditToCsv(rows, projectName), 'text/csv;charset=utf-8');

    return (
        <>
            {log.length === 0 ? (
                <p className="m-0 py-10 text-center text-[15px] m-text-3">Henüz kayıt yok. Proje oluşturma/silme, plan onayı, içe aktarma, rapor ve görüşme onayları burada listelenir.</p>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <select aria-label="Eylem türü" className={`m-pill ${group ? 'is-active' : ''}`} value={group} onChange={e => setGroup(e.target.value)}>
                            <option value="">Tüm eylemler</option>
                            {groups.map(g => <option key={g} value={g}>{AUDIT_GROUP_LABELS[g] || g}</option>)}
                        </select>
                        {projects.length > 0 && (
                            <select aria-label="Proje" className={`m-pill ${projectId ? 'is-active' : ''}`} value={projectId} onChange={e => setProjectId(e.target.value)}>
                                <option value="">Tüm projeler</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        )}
                        <label className="m-search flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] m-text-3 ml-auto">
                            <Icon name="search" size={16} />
                            <input aria-label="Günlükte ara" className="bg-transparent border-0 outline-none text-[15px] m-text w-44" placeholder="Özet, kişi, proje" value={query} onChange={e => setQuery(e.target.value)} />
                        </label>
                        {showExport && <button type="button" className="m-btn m-btn-gray !min-h-[40px]" onClick={exportCsv}><Icon name="download" size={17} />CSV</button>}
                    </div>
                    {rows.length === 0 ? <p className="m-0 py-6 text-center text-[15px] m-text-3">Bu süzgeçte kayıt yok.</p> : days.map(d => (
                        <section key={d.key} aria-label={d.label} className="flex flex-col gap-2">
                            <h3 className="m-0 text-[13px] font-semibold m-text-3">{d.label}</h3>
                            <div className="m-surface rounded-2xl p-1.5">
                                {d.items.map((e, i) => {
                                    const sep = rowSep(i);
                                    return (
                                        <div key={e.id} className={`flex items-start gap-3 px-3 py-2.5 ${sep.className}`} style={sep.style}>
                                            <span className="w-8 h-8 rounded-[9px] m-fill-2 flex items-center justify-center flex-none m-text-2" title={AUDIT_ACTION_LABELS[e.action]}><Icon name={iconOf(e.action)} size={16} /></span>
                                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                <span className="text-[15px] m-text">{e.summary}</span>
                                                <span className="text-[13px] m-text-3">{[AUDIT_ACTION_LABELS[e.action], actorLabel(e), e.projectId ? projectName(e.projectId) : ''].filter(Boolean).join(' · ')}</span>
                                            </div>
                                            <span className="text-[13px] m-text-3 m-tabular flex-none">{new Date(e.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                    {rows.length > limit && <button type="button" className="m-btn m-btn-gray self-start" onClick={() => setLimit(l => l + 200)}>Daha fazla göster ({rows.length - limit})</button>}
                </>
            )}
        </>
    );
};

const AuditLogSheet: React.FC<{ workspace: WorkspaceData; onClose: () => void }> = ({ workspace, onClose }) => (
    <Sheet xl title="Denetim günlüğü" subtitle={`Kritik işlemlerin kaydı — kim, ne zaman, ne yaptı (${(workspace.auditLog || []).length} kayıt)`} onClose={onClose}>
        <AuditLogPanel workspace={workspace} />
    </Sheet>
);

export default AuditLogSheet;
