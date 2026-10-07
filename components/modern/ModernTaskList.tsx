import React, { useMemo, useRef, useState } from 'react';
import { Resource, Task, TaskSortKey, TaskStatus } from '../../types';
import { exportToExcel, exportToJiraCsv, exportToMsProjectCsv } from '../../utils/exporter';
import { parseCustomCsv, parseImportedFile, parseJiraCsv } from '../../utils/importer';
import { Icon } from './icons';
import { ViewFilterNote } from './ui';
import TaskActionsMenu from './TaskActionsMenu';
import { MIN_PRIORITY_OPTIONS, taskComparator, TaskPriority, taskPassesView } from '../../utils/viewConfig';
import { BoardColumn, celebrationFor, COLUMN_META, columnOf, daysLate, initialsOf, missingEstimate, PRIORITY_META, shortDate, sprintLabel, uniq } from './taskMeta';

interface ModernTaskListProps {
    tasks: Task[];
    resources: Resource[];
    sprintNames?: Record<number, string>;
    onStatusChange: (id: string, status: TaskStatus) => void;
    onViewTask: (task: Task) => void;
    onEditTask: (task: Task) => void;
    onDeleteTask: (id: string) => void;
    onNotifyTask?: (task: Task) => void;
    onDataImport: (tasks: Task[], resources: Resource[]) => void;
    onCelebrate?: (message: string) => void;
    /** Admin görünüm ayarı: en düşük öncelik ve sıralama */
    minPriority?: TaskPriority;
    sortKey?: TaskSortKey;
}

const GROUPS: BoardColumn[] = [TaskStatus.InProgress, TaskStatus.ToDo, TaskStatus.Done];
const GRID = '44px minmax(240px, 3fr) minmax(150px, 1.4fr) minmax(96px, 0.8fr) minmax(112px, 0.9fr) minmax(112px, 0.9fr) 44px';
const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

type ImportKind = 'excel' | 'jira' | 'csv';

const ModernTaskList: React.FC<ModernTaskListProps> = ({ tasks, resources, sprintNames, onStatusChange, onViewTask, onEditTask, onDeleteTask, onNotifyTask, onDataImport, onCelebrate, minPriority = 'Low' as TaskPriority, sortKey = 'smart' as TaskSortKey }) => {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<string>('all');
    const [person, setPerson] = useState<string>('all');
    const [sprint, setSprint] = useState<string>('all');
    const [unit, setUnit] = useState<string>('all');
    const [ioOpen, setIoOpen] = useState(false);
    const [showDone, setShowDone] = useState(false);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const importKind = useRef<ImportKind>('excel');

    const people = useMemo(() => uniq<string>(tasks.map(t => t.resourceName).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'tr')), [tasks]);
    const units = useMemo(() => uniq<string>(tasks.map(t => t.unit).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'tr')), [tasks]);
    const versions = useMemo(() => uniq<number>(tasks.map(t => t.version)).sort((a, b) => a - b), [tasks]);

    const filtered = useMemo(() => {
        const q = lower(query.trim());
        return tasks.filter(t =>
            taskPassesView({ minTaskPriority: minPriority }, t) &&
            (!q || lower(t.name).includes(q) || lower(t.jiraId || '').includes(q)) &&
            (status === 'all' || columnOf(t.status) === status) &&
            (person === 'all' || t.resourceName === person) &&
            (sprint === 'all' || String(t.version) === sprint) &&
            (unit === 'all' || t.unit === unit)
        );
    }, [tasks, query, status, person, sprint, unit, minPriority]);
    const hiddenByView = minPriority === 'Low' ? 0 : tasks.filter(t => !taskPassesView({ minTaskPriority: minPriority }, t)).length;

    const groups = useMemo(() => GROUPS.map(g => ({
        id: g,
        rows: filtered.filter(t => columnOf(t.status) === g).sort(taskComparator(sortKey)),
    })).filter(g => g.rows.length > 0), [filtered, sortKey]);

    const changeStatus = (id: string, next: TaskStatus) => {
        const message = onCelebrate ? celebrationFor(tasks, id, next, sprintNames) : null;
        if (message) onCelebrate!(message);
        onStatusChange(id, next);
    };

    const startImport = (kind: ImportKind) => {
        importKind.current = kind;
        setIoOpen(false);
        if (fileRef.current) {
            fileRef.current.accept = kind === 'excel' ? '.xlsx,.xls' : '.csv';
            fileRef.current.click();
        }
    };

    const handleFile = async (file: File) => {
        setBusy(true);
        setNotice(null);
        try {
            const result = importKind.current === 'excel'
                ? await parseImportedFile(file)
                : importKind.current === 'jira'
                    ? parseJiraCsv(await file.text())
                    : parseCustomCsv(await file.text());
            onDataImport(result.tasks, result.resources);
            setNotice({ kind: 'ok', text: `${result.tasks.length} görev içe aktarıldı.` });
        } catch (e) {
            setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Dosya okunamadı.' });
        } finally {
            setBusy(false);
        }
    };

    const filtersActive = status !== 'all' || person !== 'all' || sprint !== 'all' || unit !== 'all' || !!query;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2.5">
                <label className="flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl m-surface m-text-3" style={{ flex: '1 1 260px', maxWidth: 420 }}>
                    <Icon name="search" size={18} strokeWidth={2} />
                    <input
                        type="search"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Görev adı ya da numarası"
                        aria-label="Bu projedeki görevlerde ara"
                        className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[15px] m-text"
                    />
                </label>
                <select aria-label="Durum" className={`m-pill ${status !== 'all' ? 'is-active' : ''}`} value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="all">Tüm durumlar</option>
                    {GROUPS.map(g => <option key={g} value={g}>{COLUMN_META[g].label}</option>)}
                </select>
                <select aria-label="Atanan kişi" className={`m-pill ${person !== 'all' ? 'is-active' : ''}`} value={person} onChange={e => setPerson(e.target.value)}>
                    <option value="all">Herkes</option>
                    {people.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select aria-label="Sürüm" className={`m-pill ${sprint !== 'all' ? 'is-active' : ''}`} value={sprint} onChange={e => setSprint(e.target.value)}>
                    <option value="all">Tüm sürümler</option>
                    {versions.map(v => <option key={v} value={String(v)}>{sprintLabel(v, sprintNames)}</option>)}
                </select>
                {units.length > 1 && (
                    <select aria-label="Birim" className={`m-pill ${unit !== 'all' ? 'is-active' : ''}`} value={unit} onChange={e => setUnit(e.target.value)}>
                        <option value="all">Tüm birimler</option>
                        {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                )}
                {filtersActive && (
                    <button type="button" className="m-btn m-btn-plain" onClick={() => { setQuery(''); setStatus('all'); setPerson('all'); setSprint('all'); setUnit('all'); }}>Temizle</button>
                )}
                <div className="relative ml-auto">
                    <button type="button" className="m-btn m-btn-gray" aria-haspopup="menu" aria-expanded={ioOpen} disabled={busy} onClick={() => setIoOpen(o => !o)}>
                        <Icon name="download" size={18} />
                        {busy ? 'Yükleniyor…' : 'İçe / dışa aktar'}
                    </button>
                    {ioOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIoOpen(false)} aria-hidden="true"></div>
                            <div role="menu" className="absolute right-0 top-full mt-2 w-64 m-surface m-pop rounded-2xl py-1.5 z-50">
                                <p className="px-3.5 pt-1 pb-1 text-[13px] font-semibold m-text-3">İçe aktar</p>
                                {([['excel', 'Excel dosyasından'], ['jira', 'Jira CSV dosyasından'], ['csv', 'CSV şablonundan']] as [ImportKind, string][]).map(([k, label]) => (
                                    <button key={k} type="button" role="menuitem" onClick={() => startImport(k)} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px]">
                                        <span className="m-text-3"><Icon name="upload" size={18} /></span>{label}
                                    </button>
                                ))}
                                <div className="border-t m-sep my-1"></div>
                                <p className="px-3.5 pt-1 pb-1 text-[13px] font-semibold m-text-3">Dışa aktar</p>
                                {([['Excel', () => exportToExcel(tasks, resources)], ['Jira CSV', () => exportToJiraCsv(tasks)], ['MS Project CSV', () => exportToMsProjectCsv(tasks)]] as [string, () => void][]).map(([label, run]) => (
                                    <button key={label} type="button" role="menuitem" onClick={() => { run(); setIoOpen(false); }} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px]">
                                        <span className="m-text-3"><Icon name="download" size={18} /></span>{label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    <input ref={fileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                </div>
            </div>

            {notice && (
                <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 flex items-center gap-3 text-[15px] ${notice.kind === 'error' ? 'm-tone-bad' : 'm-tone-ok'}`}>
                    <Icon name={notice.kind === 'error' ? 'alert' : 'check'} size={18} strokeWidth={2} />
                    <span className="flex-1">{notice.kind === 'error' ? `İçe aktarılamadı: ${notice.text}` : notice.text}</span>
                    <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => setNotice(null)}><Icon name="x" size={18} /></button>
                </div>
            )}

            {hiddenByView > 0 && <ViewFilterNote text={`Yönetici ayarı: ${MIN_PRIORITY_OPTIONS.find(o => o.value === minPriority)!.label.toLocaleLowerCase('tr-TR')} görevler gösteriliyor · ${hiddenByView} görev gizli`} />}

            {groups.length === 0 && (
                <div className="m-surface rounded-2xl px-5 py-10 text-center">
                    <p className="m-0 text-[17px] font-semibold m-text">{tasks.length === 0 ? 'Bu projede henüz görev yok' : 'Filtreye uyan görev yok'}</p>
                    <p className="m-0 mt-1 text-[15px] m-text-3">{tasks.length === 0 ? '"Yeni görev" ile ekleyin ya da bir dosyadan içe aktarın.' : 'Filtreleri değiştirin ya da temizleyin.'}</p>
                </div>
            )}

            {groups.map(g => {
                const meta = COLUMN_META[g.id];
                const collapsed = g.id === TaskStatus.Done && !showDone && g.rows.length > 5;
                const rows = collapsed ? g.rows.slice(0, 5) : g.rows;
                return (
                    <section key={g.id} aria-label={`${meta.label}, ${g.rows.length} görev`} className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2.5 pl-1">
                            <span aria-hidden="true" className="w-3 h-3 rounded-full box-border" style={{ border: `2px solid ${meta.ring}`, background: meta.fill }}></span>
                            <h2 className="m-0 text-[17px] font-semibold m-text">{meta.label}</h2>
                            <span className="text-[15px] m-text-3 m-tabular">{g.rows.length}</span>
                        </div>
                        <div className="m-surface rounded-2xl overflow-x-auto">
                            <div style={{ minWidth: 820 }}>
                                <div aria-hidden="true" className="grid items-center gap-3 pl-2 pr-4 pt-2.5 pb-2 text-[13px] m-text-3" style={{ gridTemplateColumns: GRID }}>
                                    <span></span><span>Görev</span><span>Atanan</span><span>Sürüm</span><span>Öncelik</span><span>Bitiş</span><span></span>
                                </div>
                                {rows.map(t => {
                                    const late = daysLate(t);
                                    const isDone = g.id === TaskStatus.Done;
                                    const prio = PRIORITY_META[t.priority];
                                    return (
                                        <div key={t.id} className="grid items-center gap-3 pl-2 pr-2 py-1.5 min-h-[60px] border-t m-sep" style={{ gridTemplateColumns: GRID }}>
                                            <button
                                                type="button"
                                                className="m-icon-btn"
                                                aria-label={isDone ? `Yeniden aç: ${t.name}` : `Tamamlandı olarak işaretle: ${t.name}`}
                                                onClick={() => changeStatus(t.id, isDone ? TaskStatus.ToDo : TaskStatus.Done)}
                                            >
                                                <span aria-hidden="true" className="w-5 h-5 rounded-full box-border flex items-center justify-center" style={{ border: `2px solid ${meta.ring}`, background: meta.fill, color: 'var(--m-on-accent)' }}>
                                                    {isDone && <Icon name="check" size={12} strokeWidth={3} />}
                                                </span>
                                            </button>
                                            <button type="button" onClick={() => onViewTask(t)} className="min-w-0 flex flex-col gap-0.5 text-left bg-transparent border-0 p-0 cursor-pointer" style={{ font: 'inherit' }}>
                                                <span className={`text-[15px] font-semibold truncate ${isDone ? 'm-text-2' : 'm-text'}`}>{t.name}</span>
                                                <span className="text-[13px] m-text-3 truncate">{[t.jiraId, t.unit].filter(Boolean).join(' · ') || 'Numara yok'}</span>
                                            </button>
                                            <span className="flex items-center gap-2 text-[15px] min-w-0">
                                                {t.resourceName ? (
                                                    <>
                                                        <span aria-hidden="true" className="w-7 h-7 rounded-full m-fill flex items-center justify-center text-[11px] font-bold flex-none">{initialsOf(t.resourceName)}</span>
                                                        <span className="truncate m-text">{t.resourceName}</span>
                                                    </>
                                                ) : <span className="m-text-3">Atanmadı</span>}
                                            </span>
                                            <span className="text-[15px] m-text">{sprintLabel(t.version, sprintNames)}</span>
                                            <span className={`inline-flex items-center gap-1.5 text-[14px] font-semibold ${prio.ink}`}><Icon name="flag" size={14} strokeWidth={2.2} />{prio.label}</span>
                                            <span className="flex flex-col">
                                                <span className={`text-[15px] m-tabular ${late ? 'm-ink-bad font-semibold' : 'm-text'}`}>{shortDate(t.dueDate) || '—'}</span>
                                                {late > 0 && <span className="text-[13px] m-ink-bad">{late} gün gecikti</span>}
                                                {late === 0 && missingEstimate(t) && <span className="text-[13px] m-ink-warn">Süre tahmini yok</span>}
                                            </span>
                                            <TaskActionsMenu task={t} onStatusChange={changeStatus} onEdit={onEditTask} onDelete={onDeleteTask} onNotify={onNotifyTask} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {collapsed && (
                            <button type="button" className="m-btn m-btn-plain self-start" onClick={() => setShowDone(true)}>Tümünü göster ({g.rows.length})</button>
                        )}
                    </section>
                );
            })}
        </div>
    );
};

export default ModernTaskList;
