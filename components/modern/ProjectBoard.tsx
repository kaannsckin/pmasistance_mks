import React, { useEffect, useMemo, useState } from 'react';
import { BoardColumnConfig, BoardConfig, BoardSwimlane, Task, TaskSortKey, TaskStatus, WorkflowConfig } from '../../types';
import { boardConfigOf, buildLanes, distribute, filterBoardTasks, moveTaskPatch, wipState } from '../../utils/board';
import { IssueKind, issueKind, issueKindLabel, ISSUE_KIND_ORDER } from '../../utils/issueTypeMeta';
import { canTransition, taskStatusLabel, taskWorkflow, workflowKey } from '../../utils/workflow';
import { MIN_PRIORITY_OPTIONS, taskComparator, TaskPriority, taskPassesView } from '../../utils/viewConfig';
import BoardSettings from './BoardSettings';
import IssueTypeChip from './IssueTypeChip';
import { Icon } from './icons';
import TaskActionsMenu from './TaskActionsMenu';
import TaskKeyButton from './TaskKeyButton';
import { celebrationFor, daysLate, initialsOf, PRIORITY_META, shortDate, sprintLabel, uniq } from './taskMeta';
import { ViewFilterNote } from './ui';

/**
 * Jira tarzı proje panosu: yapılandırılabilir kolonlar (durum + etiket
 * kuralı, WIP sınırı), hızlı filtreler, kişi süzgeci, arama ve kulvarlar
 * (Expedite, kişi, öncelik, iş paketi). Mantık utils/board.ts'te.
 */

interface ProjectBoardProps {
    tasks: Task[];
    config?: BoardConfig;
    /** Proje içeriğini düzenleyebilen kullanıcı panoyu yapılandırabilir */
    canConfigure: boolean;
    onSaveConfig: (cfg: BoardConfig | undefined) => void;
    /** Kart taşıma: durum (+ Jira durumu / etiket) değişikliği */
    onMoveTask: (id: string, patch: Partial<Task>) => void;
    onStatusChange: (id: string, status: TaskStatus) => void;
    /** Ayrıntılı iş akışı durumu (Testte, Çözüldü …) */
    onWorkflowChange?: (id: string, key: string) => void;
    /** Projenin iş akışı (admin şeması): durum adları ve izin verilen geçişler */
    workflow?: WorkflowConfig;
    /** Pano nereden geliyor: projeye özel / şema / iş akışından otomatik */
    boardSource?: 'project' | 'scheme' | 'auto';
    schemeName?: string;
    /** Verilirse "İş akışı" düğmesi (projeye özel akış; yapılandırma izin veriyorsa) */
    onOpenWorkflow?: () => void;
    /** Verilirse "Bileşen ve sürümler" düğmesi */
    onOpenLists?: () => void;
    /** Kural setleri (otomasyon) */
    onOpenAutomation?: () => void;
    onViewTask: (task: Task) => void;
    onEditTask: (task: Task) => void;
    onDeleteTask: (id: string) => void;
    onNotifyTask?: (task: Task) => void;
    onNewTask: () => void;
    /** Projeyi düzenleme yetkisi yok: sürükleme, yeni görev ve görev işlemleri kapalı */
    readOnly?: boolean;
    onCelebrate?: (message: string) => void;
    sprintNames?: Record<number, string>;
    /** Oturumdaki kişinin adı ("Sadece benim işlerim") */
    me?: string;
    wpNames?: Map<string, string>;
    minPriority?: TaskPriority;
    sortKey?: TaskSortKey;
}

const SWIMLANES: { value: BoardSwimlane; label: string }[] = [
    { value: 'none', label: 'Kulvar yok' },
    { value: 'expedite', label: 'Expedite' },
    { value: 'assignee', label: 'Kişiye göre' },
    { value: 'priority', label: 'Önceliğe göre' },
    { value: 'workPackage', label: 'İş paketine göre' },
    { value: 'component', label: 'Bileşene göre' },
    { value: 'fixVersion', label: 'Hedef sürüme göre' },
];

/** Jira tarzı büyük harfli başlık/etiket (modern tema genelde büyük harfi kapatır) */
const UPPER: React.CSSProperties = { textTransform: 'uppercase', letterSpacing: '.03em' };

const PRIORITY_BAR: Record<Task['priority'], string | undefined> = { Blocker: 'var(--m-bad)', High: 'var(--m-warn)', Medium: undefined, Low: undefined };
const Card: React.FC<{
    t: Task; done: boolean; columnName: string; workflow?: WorkflowConfig;
    /** Üst görev (Jira "parent"): projede varsa görevin kendisi */
    parent?: Task;
    onView: () => void; onViewParent?: (p: Task) => void; onDragStart?: (e: React.DragEvent) => void; menu: React.ReactNode;
}> = ({ t, done, columnName, workflow, parent, onView, onViewParent, onDragStart, menu }) => {
    const late = daysLate(t);
    const prio = PRIORITY_META[t.priority];
    const bar = PRIORITY_BAR[t.priority];
    const kind = issueKind(t);
    const parentKey = t.jiraParentKey?.trim();
    const statusLabel = taskStatusLabel(t, workflow);
    // Ayrıntılı durum kolon adından farklıysa kartta gösterilir (ör. Devam Ediyor kolonunda "Analizde")
    const showJira = !!t.jiraStatus && statusLabel.toLocaleLowerCase('tr-TR') !== columnName.toLocaleLowerCase('tr-TR');
    return (
        <article draggable={!!onDragStart} onDragStart={onDragStart}
            className={`m-surface ${kind && kind !== 'other' ? `m-issue-card m-issue-${kind}` : ''} rounded-[10px] flex flex-col pl-3 pr-1 py-1 ${onDragStart ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{ boxShadow: `inset 3px 0 0 ${bar || 'transparent'}, var(--m-shadow-sm, 0 1px 2px rgba(0,0,0,.06))` }}>
            <div className="flex items-start gap-1">
                <button type="button" onClick={onView} className="flex-1 min-w-0 flex flex-col gap-1.5 py-2 text-left bg-transparent border-0 p-0 cursor-pointer" style={{ font: 'inherit' }}>
                    <span className="flex items-center gap-2 flex-wrap text-[12.5px]">
                        <IssueTypeChip t={t} />
                        {t.jiraId && <span className={`m-text-3 m-tabular font-semibold ${done ? 'line-through' : ''}`}>{t.jiraId}</span>}
                        {showJira && <span title={t.jiraStatus} className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-bold m-fill-2 m-text-2" style={UPPER}>{statusLabel}</span>}
                        {late > 0 && <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold m-tone-bad">{late} gün gecikti</span>}
                    </span>
                    <span className={`text-[14.5px] leading-snug ${done ? 'm-text-2' : 'm-text font-medium'}`}>{t.name}</span>
                    {done && t.resolution && <span className="self-start inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold m-tone-ok" title="Çözüm">{t.resolution}</span>}
                    {(t.components?.length || t.fixVersion) ? (
                        <span className="flex flex-wrap gap-1">
                            {(t.components || []).slice(0, 2).map(c => <span key={c} title="Bileşen" className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[11px] font-semibold m-accent-tint"><Icon name="grid" size={10} />{c}</span>)}
                            {t.fixVersion && <span title="Hedef sürüm" className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[11px] font-semibold m-tone-ok"><Icon name="flag" size={10} />{t.fixVersion}</span>}
                        </span>
                    ) : null}
                    {t.labels && t.labels.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                            {t.labels.slice(0, 3).map(l => <span key={l} className="inline-flex items-center h-5 px-1.5 rounded text-[11px] m-fill-2 m-text-2">{l}</span>)}
                            {t.labels.length > 3 && <span className="text-[11px] m-text-3">+{t.labels.length - 3}</span>}
                        </span>
                    )}
                    <span className="flex items-center gap-2 text-[12.5px] w-full">
                        <span title={`Öncelik: ${prio.label}`} className={`inline-flex items-center gap-0.5 font-semibold ${prio.ink}`}><Icon name="flag" size={13} strokeWidth={2.2} />{t.priority === 'Blocker' || t.priority === 'High' ? prio.label : ''}</span>
                        {t.storyPoints ? <span title="Story point" className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full m-fill-2 m-text-2 text-[11px] font-bold m-tabular">{t.storyPoints}</span> : null}
                        {t.dueDate && <span className={`ml-auto m-tabular ${late ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{shortDate(t.dueDate)}</span>}
                        {t.resourceName ? (
                            <span title={t.resourceName} aria-label={`Atanan: ${t.resourceName}`} className={`${t.dueDate ? '' : 'ml-auto'} w-7 h-7 rounded-full m-accent-bg flex items-center justify-center text-[11px] font-bold flex-none`}>
                                {initialsOf(t.resourceName)}
                            </span>
                        ) : <span className={`${t.dueDate ? '' : 'ml-auto'} w-7 h-7 rounded-full m-fill-2 m-text-3 flex items-center justify-center flex-none`} title="Atanmamış"><Icon name="users" size={13} /></span>}
                    </span>
                </button>
                {menu}
            </div>
            {parentKey && (
                <div className="flex items-center gap-1.5 min-w-0 mr-2 mb-1 pt-1.5 border-t m-sep text-[12px] m-text-3" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                    <span aria-hidden="true" className="inline-flex flex-none" style={{ color: 'var(--m-issue, currentColor)' }}><Icon name="subtask" size={13} strokeWidth={2.2} /></span>
                    <span className="flex-none">Üst görev</span>
                    {parent && onViewParent
                        ? <TaskKeyButton task={parent} onOpen={() => onViewParent(parent)} className="!min-h-[22px] !px-1.5 !text-[12px] !rounded-md" />
                        : <span className="flex-none font-semibold m-tabular m-text-2">{parentKey}</span>}
                    {parent && <span className="truncate m-text-2" title={parent.name}>{parent.name}</span>}
                </div>
            )}
        </article>
    );
};

const ProjectBoard: React.FC<ProjectBoardProps> = ({
    tasks, config, canConfigure, onSaveConfig, onMoveTask, onStatusChange, onWorkflowChange, workflow, boardSource, schemeName, onOpenWorkflow, onOpenLists, onOpenAutomation, onViewTask, onEditTask, onDeleteTask, onNotifyTask, onNewTask, onCelebrate, readOnly = false,
    sprintNames, me, wpNames, minPriority = 'Low' as TaskPriority, sortKey = 'smart' as TaskSortKey,
}) => {
    const cfg = useMemo(() => boardConfigOf(config, workflow), [config, workflow]);
    const [notice, setNotice] = useState<string | null>(null);
    useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(id); }, [notice]);
    const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
    const [people, setPeople] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [sprint, setSprint] = useState('all');
    const [kind, setKind] = useState<IssueKind | 'all'>('all');
    const [swimlane, setSwimlane] = useState<BoardSwimlane | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [dragOver, setDragOver] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    // Telefonda kolonlar yatay kaydırma yerine sekmeyle seçilir; tek kolon tam genişlikte
    const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 639px)').matches);
    useEffect(() => {
        const mq = window.matchMedia?.('(max-width: 639px)');
        if (!mq) return;
        const on = (e: MediaQueryListEvent) => setNarrow(e.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    const [phoneColumnId, setPhoneColumnId] = useState<string | null>(null);
    const now = useMemo(() => new Date(), [tasks]);
    const lanesMode = swimlane ?? cfg.swimlane;

    const versions = useMemo(() => uniq<number>(tasks.map(t => t.version)).sort((a, b) => a - b), [tasks]);
    const assignees = useMemo(() => uniq<string>(tasks.map(t => t.resourceName).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'tr')), [tasks]);

    // Panodaki türler (süzgeç yalnız birden çok tür varsa gösterilir)
    const kinds = useMemo(() => {
        const n = new Map<IssueKind, number>();
        tasks.forEach(t => { const k = issueKind(t); if (k) n.set(k, (n.get(k) || 0) + 1); });
        return ISSUE_KIND_ORDER.filter(k => n.has(k)).map(k => ({ kind: k, n: n.get(k)! }));
    }, [tasks]);
    // Üst görevler (alt görev kartının altında gösterilir): Jira anahtarıyla
    const byJiraKey = useMemo(() => new Map(tasks.filter(t => t.jiraId?.trim()).map(t => [t.jiraId!.trim().toUpperCase(), t])), [tasks]);
    const viewTasks = useMemo(() => tasks.filter(t => taskPassesView({ minTaskPriority: minPriority }, t)), [tasks, minPriority]);
    const hiddenByView = tasks.length - viewTasks.length;
    const filtered = useMemo(() => {
        const qf = cfg.quickFilters.filter(f => activeFilters.has(f.id));
        return filterBoardTasks(viewTasks, qf, { me, now, query })
            .filter(t => (sprint === 'all' || String(t.version) === sprint) && (!people.size || people.has(t.resourceName)) && (kind === 'all' || issueKind(t) === kind));
    }, [viewTasks, cfg.quickFilters, activeFilters, me, now, query, sprint, people, kind]);

    const { columns, unmapped } = useMemo(() => distribute(filtered, cfg, now), [filtered, cfg, now]);
    const cmp = useMemo(() => taskComparator(sortKey), [sortKey]);
    const lanes = useMemo(() => {
        const shown = new Set(columns.flatMap(c => c.tasks.map(t => t.id)));
        return buildLanes(filtered.filter(t => shown.has(t.id)), { ...cfg, swimlane: lanesMode }, wpNames);
    }, [filtered, columns, cfg, lanesMode, wpNames]);
    const colIndex = useMemo(() => {
        const m = new Map<string, string>();
        columns.forEach(c => c.tasks.forEach(t => m.set(t.id, c.column.id)));
        return m;
    }, [columns]);

    const doneCount = columns.filter(c => c.column.targetStatus === TaskStatus.Done).reduce((s, c) => s + c.total, 0);
    const mappedTotal = columns.reduce((s, c) => s + c.total, 0);
    const pct = mappedTotal ? Math.round((doneCount / mappedTotal) * 100) : 0;

    const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); apply(n); };
    const anyFilter = activeFilters.size > 0 || people.size > 0 || !!query || sprint !== 'all' || kind !== 'all';

    const drop = (col: BoardColumnConfig, id: string) => {
        const task = tasks.find(t => t.id === id);
        if (!task || colIndex.get(id) === col.id) return;
        // İş akışı geçiş kuralı (Jira'daki gibi): kolondaki, mevcut durumdan gidilebilen ilk durum
        let target = col;
        if (workflow?.transitions) {
            const cur = taskWorkflow(task, workflow).key;
            const keys = col.statuses.filter(k => k.startsWith('jira:')).map(k => workflowKey(k.slice(5)));
            const pool = keys.length ? keys : workflow.statuses.filter(x => x.category === col.targetStatus).map(x => x.key);
            const ok = pool.find(k => canTransition(workflow, cur, k));
            if (!ok) {
                setNotice(`"${taskStatusLabel(task, workflow)}" durumundan "${col.name}" kolonuna geçiş bu projenin iş akışında tanımlı değil.`);
                return;
            }
            target = { ...col, statuses: [`jira:${ok}` as const, ...col.statuses.filter(k => k !== `jira:${ok}`)] };
        }
        const patch = moveTaskPatch(task, target, cfg, new Date());
        if (patch.status !== task.status && onCelebrate) {
            const message = celebrationFor(tasks, id, patch.status!);
            if (message) onCelebrate(message);
        }
        onMoveTask(id, patch);
    };

    // Telefonda gösterilen kolon: seçilen, yoksa ilk "süreçte" kolonu, o da yoksa ilki
    const phoneColumn = cfg.columns.find(c => c.id === phoneColumnId)
        ?? cfg.columns.find(c => c.targetStatus === TaskStatus.InProgress) ?? cfg.columns[0];
    const shownColumns = narrow && phoneColumn ? [phoneColumn] : cfg.columns;
    const shownIds = new Set(shownColumns.map(c => c.id));
    const gridCols = narrow ? 'minmax(0, 1fr)' : `repeat(${cfg.columns.length}, minmax(260px, 1fr))`;
    const minWidth = narrow ? 0 : cfg.columns.length * 272;

    return (
        <div className="flex flex-col gap-4">
            {settingsOpen && (
                <BoardSettings tasks={tasks} config={cfg} isCustom={boardSource === 'project'} people={assignees} workflow={workflow}
                    resetLabel={schemeName ? `Şemanın panosuna dön (${schemeName})` : undefined}
                    onClose={() => setSettingsOpen(false)}
                    onSave={c => { onSaveConfig(c); setSettingsOpen(false); }} />
            )}

            {/* Üst çubuk: arama, sprint, kulvar, yapılandırma */}
            <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex-none">
                    <span className="sr-only">Panoda ara</span>
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 m-text-3 pointer-events-none"><Icon name="search" size={15} /></span>
                    <input type="search" className="m-input !h-9 !py-0 w-[200px] text-[14px]" style={{ paddingLeft: 32 }} placeholder="Panoda ara…" value={query} onChange={e => setQuery(e.target.value)} />
                </label>
                {assignees.length > 0 && (
                    <div className="flex items-center -space-x-1.5" role="group" aria-label="Kişiye göre süz">
                        {assignees.slice(0, 8).map(p => (
                            <button key={p} type="button" title={p} aria-pressed={people.has(p)} onClick={() => toggle(people, p, setPeople)}
                                className={`w-8 h-8 rounded-full border-2 text-[11px] font-bold flex items-center justify-center cursor-pointer transition-transform hover:-translate-y-0.5 ${people.has(p) ? 'm-accent-bg' : 'm-fill m-text'}`}
                                style={{ borderColor: people.has(p) ? 'var(--m-accent)' : 'var(--m-bg)' }}>
                                {initialsOf(p)}
                            </button>
                        ))}
                        {assignees.length > 8 && <span className="w-8 h-8 rounded-full m-fill-2 m-text-3 text-[11px] font-bold flex items-center justify-center border-2" style={{ borderColor: 'var(--m-bg)' }}>+{assignees.length - 8}</span>}
                    </div>
                )}
                <select aria-label="Sprint" className={`m-pill ${sprint !== 'all' ? 'is-active' : ''}`} value={sprint} onChange={e => setSprint(e.target.value)}>
                    <option value="all">Tüm sprintler</option>
                    {versions.map(v => <option key={v} value={String(v)}>{sprintLabel(v, sprintNames)}</option>)}
                </select>
                {kinds.length > 1 && (
                    <select aria-label="Kayıt türü" className={`m-pill ${kind !== 'all' ? 'is-active' : ''}`} value={kind} onChange={e => setKind(e.target.value as IssueKind | 'all')}>
                        <option value="all">Tüm türler</option>
                        {kinds.map(k => <option key={k.kind} value={k.kind}>{issueKindLabel(k.kind)} ({k.n})</option>)}
                    </select>
                )}
                <select aria-label="Kulvar" className={`m-pill ${lanesMode !== 'none' ? 'is-active' : ''}`} value={lanesMode} onChange={e => setSwimlane(e.target.value as BoardSwimlane)}>
                    {SWIMLANES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <div className="flex items-center gap-3 ml-auto">
                    <span className="hidden md:flex items-center gap-2 min-w-[180px]">
                        <span aria-hidden="true" className="flex-1 h-1.5 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--m-ok)' }}></span></span>
                        <span className="text-[13px] m-text-2 whitespace-nowrap"><b className="m-tabular">{doneCount}/{mappedTotal}</b> tamam</span>
                    </span>
                    {!readOnly && <button type="button" className="m-btn m-btn-primary !min-h-[36px] !px-3 text-[14px]" onClick={onNewTask}><Icon name="plus" size={15} />Görev</button>}
                    {schemeName && <span className="hidden lg:inline-flex items-center gap-1 h-7 px-2.5 rounded-full m-fill-2 text-[12.5px] m-text-2" title={`Yönetici tarafından atanan proje yapılandırması${boardSource === 'project' ? ' · bu projeye özel pano' : ''}`}><Icon name="sliders" size={12} />{schemeName}{boardSource === 'project' ? ' · özel pano' : ''}</span>}
                    {onOpenLists && <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={onOpenLists} title="Projenin sürümleri, bileşenleri ve rol üyeleri"><Icon name="grid" size={15} />Proje ayarları</button>}
                    {onOpenAutomation && <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={onOpenAutomation} title="Kural setleri: durum değişince ya da her gün otomatik işlem"><Icon name="refresh" size={15} />Kurallar</button>}
                    {onOpenWorkflow && <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={onOpenWorkflow} title="Bu projenin iş akışı: durumlar arası okları çizin"><Icon name="activity" size={15} />İş akışı</button>}
                    {canConfigure && <button type="button" className="m-btn m-btn-gray !min-h-[36px] !px-3 text-[14px]" onClick={() => setSettingsOpen(true)} title="Kolonlar, durum/etiket kuralları, WIP, hızlı filtreler, kulvarlar"><Icon name="sliders" size={15} />Panoyu yapılandır</button>}
                </div>
            </div>

            {/* Hızlı filtreler (Jira "Quick filters") */}
            {cfg.quickFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-b m-sep pb-3" style={{ borderBottomStyle: 'solid', borderBottomWidth: 1 }}>
                    <span className="text-[12px] font-bold m-text-3 tracking-wide mr-2" style={UPPER}>Hızlı filtreler:</span>
                    {cfg.quickFilters.map(f => {
                        const on = activeFilters.has(f.id);
                        return (
                            <button key={f.id} type="button" aria-pressed={on} onClick={() => toggle(activeFilters, f.id, setActiveFilters)}
                                className={`h-7 px-2.5 rounded-md text-[14px] border-0 cursor-pointer ${on ? 'm-accent-bg font-semibold' : 'bg-transparent m-accent hover:underline'}`}>
                                {f.name}
                            </button>
                        );
                    })}
                    {anyFilter && <button type="button" className="h-7 px-2 ml-1 rounded-md text-[13px] border-0 bg-transparent m-text-3 cursor-pointer hover:underline" onClick={() => { setActiveFilters(new Set()); setPeople(new Set()); setQuery(''); setSprint('all'); setKind('all'); }}>Süzgeçleri temizle</button>}
                </div>
            )}

            {notice && <p role="alert" className="m-0 m-tone-bad rounded-xl px-3 py-2 text-[14px] flex items-center gap-2"><Icon name="alert" size={15} />{notice}</p>}
            {hiddenByView > 0 && <ViewFilterNote text={`Yönetici ayarı: ${MIN_PRIORITY_OPTIONS.find(o => o.value === minPriority)!.label.toLocaleLowerCase('tr-TR')} görevler gösteriliyor · ${hiddenByView} görev gizli`} />}
            {unmapped.length > 0 && (
                <p role="status" className="m-0 flex items-center gap-2 text-[13.5px] m-ink-warn">
                    <Icon name="alert" size={15} />{unmapped.length} görev hiçbir kolona eşlenmemiş durumda ({uniq(unmapped.map(t => taskStatusLabel(t, workflow))).slice(0, 5).join(', ')}).
                    {canConfigure && <button type="button" className="underline bg-transparent border-0 p-0 m-accent cursor-pointer" onClick={() => setSettingsOpen(true)}>Kolonlara eşle</button>}
                </p>
            )}

            {narrow && cfg.columns.length > 1 && (
                <div className="overflow-x-auto -mx-1 px-1">
                    <div className="m-segmented" role="group" aria-label="Gösterilecek kolon" style={{ flexWrap: 'nowrap', minWidth: '100%' }}>
                        {columns.map(({ column: c, total }) => (
                            <button key={c.id} type="button" className="m-segment flex-1 justify-center" style={{ padding: '0 10px' }}
                                aria-pressed={phoneColumn?.id === c.id} onClick={() => setPhoneColumnId(c.id)}>
                                {c.name}<span className="m-text-3 m-tabular">{total}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="overflow-x-auto pb-2 -mx-1 px-1">
                <div style={{ minWidth }}>
                    {/* Kolon başlıkları */}
                    <div className="grid gap-3 sticky top-0 z-[1] m-bg pb-2" style={{ gridTemplateColumns: gridCols }}>
                        {columns.filter(({ column: c }) => shownIds.has(c.id)).map(({ column: c, tasks: list, total }) => {
                            const wip = wipState(total, c);
                            const tone = wip === 'over' ? 'm-tone-bad' : wip === 'under' ? 'm-tone-warn' : 'm-fill-2';
                            return (
                                <div key={c.id} className={`rounded-xl px-3 py-2 flex items-center gap-2 ${tone}`} title={c.labels?.length ? `Etiket kuralı: ${c.labels.join(', ')}` : undefined}>
                                    <h2 className="m-0 text-[13px] font-bold tracking-wide truncate" style={UPPER}>{c.name}</h2>
                                    <span className="text-[13px] font-semibold m-tabular opacity-80">{list.length < total ? `${list.length} / ${total}` : total}</span>
                                    {c.labels?.length ? <Icon name="flag" size={12} className="opacity-60" /> : null}
                                    {(c.min || c.max) ? (
                                        <span className="ml-auto text-[11.5px] font-semibold whitespace-nowrap opacity-90">
                                            {wip === 'over' ? 'Sınır aşıldı · ' : wip === 'under' ? 'Altında · ' : ''}{c.min ? `en az ${c.min}` : ''}{c.min && c.max ? ' · ' : ''}{c.max ? `en çok ${c.max}` : ''}
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>

                    {lanes.length === 0 && <p className="m-0 py-10 text-center text-[15px] m-text-3">{anyFilter ? 'Süzgeçlere uyan görev yok.' : 'Henüz görev yok.'}</p>}

                    {lanes.map(lane => {
                        const isCollapsed = collapsed.has(lane.id);
                        return (
                            <section key={lane.id} aria-label={lane.title || 'Görevler'} className="mb-3">
                                {lane.title && (
                                    <button type="button" aria-expanded={!isCollapsed} onClick={() => toggle(collapsed, lane.id, setCollapsed)}
                                        className="flex items-center gap-2 h-9 px-1 mb-1 bg-transparent border-0 cursor-pointer m-text text-[15px] font-semibold">
                                        <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={16} />
                                        {lane.id === 'lane-expedite' && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--m-bad)' }}></span>}
                                        {lane.title}
                                        <span className="font-normal m-text-3 text-[14px]">{lane.tasks.length} iş</span>
                                    </button>
                                )}
                                {!isCollapsed && (
                                    <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: gridCols }}>
                                        {shownColumns.map(c => {
                                            const list = lane.tasks.filter(t => colIndex.get(t.id) === c.id).sort(cmp);
                                            const zone = `${lane.id}:${c.id}`;
                                            const done = c.targetStatus === TaskStatus.Done;
                                            return (
                                                <div key={c.id}
                                                    className={`flex flex-col gap-2 rounded-xl p-1.5 min-h-[72px] transition-colors ${dragOver === zone ? 'm-accent-tint' : 'm-fill-2'}`}
                                                    style={{ background: dragOver === zone ? undefined : 'color-mix(in srgb, var(--m-fill-2, #f2f2f7) 55%, transparent)' }}
                                                    onDragOver={e => { if (readOnly) return; e.preventDefault(); if (dragOver !== zone) setDragOver(zone); }}
                                                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
                                                    onDrop={e => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); if (id && !readOnly) drop(c, id); }}>
                                                    {list.map(t => (
                                                        <Card key={t.id} t={t} done={done} columnName={c.name}
                                                            parent={t.jiraParentKey ? byJiraKey.get(t.jiraParentKey.trim().toUpperCase()) : undefined}
                                                            onView={() => onViewTask(t)} onViewParent={onViewTask}
                                                            onDragStart={readOnly ? undefined : e => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                                                            workflow={workflow}
                                                            menu={readOnly ? null : <TaskActionsMenu task={t} onStatusChange={onStatusChange} onWorkflowChange={onWorkflowChange} workflowTasks={tasks} workflow={workflow} onEdit={onEditTask} onDelete={onDeleteTask} onNotify={onNotifyTask} />} />
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ProjectBoard;
