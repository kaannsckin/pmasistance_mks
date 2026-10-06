import React, { useMemo, useState } from 'react';
import { Task, TaskStatus } from '../../types';
import { Icon } from './icons';
import TaskActionsMenu from './TaskActionsMenu';
import { BoardColumn, celebrationFor, COLUMN_META, columnOf, daysLate, initialsOf, missingEstimate, PRIORITY_META, shortDate, sprintLabel, uniq } from './taskMeta';

interface ModernBoardProps {
    tasks: Task[];
    sprintNames?: Record<number, string>;
    onStatusChange: (id: string, status: TaskStatus) => void;
    onViewTask: (task: Task) => void;
    onEditTask: (task: Task) => void;
    onDeleteTask: (id: string) => void;
    onNotifyTask?: (task: Task) => void;
    onNewTask: () => void;
    /** Sürüm ya da proje tamamen bitince (sürpriz kutlama) */
    onCelebrate?: (message: string) => void;
}

const COLUMNS: BoardColumn[] = [TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done];

const ModernBoard: React.FC<ModernBoardProps> = ({ tasks, sprintNames, onStatusChange, onViewTask, onEditTask, onDeleteTask, onNotifyTask, onNewTask, onCelebrate }) => {
    const [sprint, setSprint] = useState<string>('all');
    const [person, setPerson] = useState<string>('all');
    const [dragOver, setDragOver] = useState<BoardColumn | null>(null);

    const versions = useMemo(() => uniq<number>(tasks.map(t => t.version)).sort((a, b) => a - b), [tasks]);
    const people = useMemo(() => uniq<string>(tasks.map(t => t.resourceName).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'tr')), [tasks]);

    const visible = useMemo(() => tasks.filter(t =>
        (sprint === 'all' || String(t.version) === sprint) && (person === 'all' || t.resourceName === person)
    ), [tasks, sprint, person]);

    const byColumn = useMemo(() => {
        const map: Record<BoardColumn, Task[]> = { [TaskStatus.ToDo]: [], [TaskStatus.InProgress]: [], [TaskStatus.Done]: [] };
        visible.forEach(t => map[columnOf(t.status)].push(t));
        (Object.keys(map) as BoardColumn[]).forEach(k => map[k].sort((a, b) =>
            daysLate(b) - daysLate(a) || PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank || a.name.localeCompare(b.name, 'tr')
        ));
        return map;
    }, [visible]);

    const done = byColumn[TaskStatus.Done].length;
    const pct = visible.length ? Math.round((done / visible.length) * 100) : 0;

    const changeStatus = (id: string, status: TaskStatus) => {
        const task = tasks.find(t => t.id === id);
        if (!task || columnOf(task.status) === status) return;
        const message = onCelebrate ? celebrationFor(tasks, id, status, sprintNames) : null;
        if (message) onCelebrate!(message);
        onStatusChange(id, status);
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
                <div className="flex flex-wrap gap-2">
                    <select aria-label="Sürüm" className={`m-pill ${sprint !== 'all' ? 'is-active' : ''}`} value={sprint} onChange={e => setSprint(e.target.value)}>
                        <option value="all">Tüm sürümler</option>
                        {versions.map(v => <option key={v} value={String(v)}>{sprintLabel(v, sprintNames)}</option>)}
                    </select>
                    <select aria-label="Atanan kişi" className={`m-pill ${person !== 'all' ? 'is-active' : ''}`} value={person} onChange={e => setPerson(e.target.value)}>
                        <option value="all">Herkes</option>
                        {people.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-3 min-w-[240px]">
                    <span aria-hidden="true" className="flex-1 h-1.5 rounded-full m-fill overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--m-accent)' }}></span></span>
                    <span className="text-[15px] m-text whitespace-nowrap"><b className="font-semibold m-tabular">{done}/{visible.length}</b> tamamlandı</span>
                </div>
            </div>

            <div className="grid gap-5 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {COLUMNS.map(col => {
                    const meta = COLUMN_META[col];
                    const list = byColumn[col];
                    return (
                        <section
                            key={col}
                            aria-label={`${meta.label}, ${list.length} görev`}
                            className={`flex flex-col gap-2.5 rounded-2xl p-1 -m-1 transition-colors ${dragOver === col ? 'm-accent-tint' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); if (dragOver !== col) setDragOver(col); }}
                            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
                            onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) changeStatus(id, col); }}
                        >
                            <div className="flex items-center gap-2.5 pl-1">
                                <span aria-hidden="true" className="w-3 h-3 rounded-full box-border" style={{ border: `2px solid ${meta.ring}`, background: meta.fill }}></span>
                                <h2 className="m-0 text-[17px] font-semibold m-text">{meta.label}</h2>
                                <span className="text-[15px] m-text-3 m-tabular">{list.length}</span>
                                <button type="button" className="m-icon-btn ml-auto" style={{ color: 'var(--m-accent)' }} aria-label={`${meta.label}: yeni görev`} onClick={onNewTask}>
                                    <Icon name="plus" strokeWidth={2} />
                                </button>
                            </div>
                            {list.length === 0 && <p className="m-0 px-3 py-4 text-[14px] m-text-3 rounded-2xl border-2 border-dashed m-sep text-center">Görev yok</p>}
                            {list.map(t => {
                                const late = daysLate(t);
                                const noEstimate = missingEstimate(t);
                                const prio = PRIORITY_META[t.priority];
                                const isDone = col === TaskStatus.Done;
                                return (
                                    <article
                                        key={t.id}
                                        draggable
                                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                                        className="m-surface rounded-[14px] flex items-start gap-1 pl-4 pr-1 py-1 cursor-grab active:cursor-grabbing"
                                    >
                                        <button type="button" onClick={() => onViewTask(t)} className="flex-1 min-w-0 flex flex-col gap-2 py-2.5 text-left bg-transparent border-0 p-0 cursor-pointer" style={{ font: 'inherit' }}>
                                            <span className="flex items-center gap-2 flex-wrap">
                                                {t.jiraId && <span className="text-[13px] m-text-3 m-tabular">{t.jiraId}</span>}
                                                {late > 0 && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tone-bad">{late} gün gecikti</span>}
                                                {late === 0 && noEstimate && <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tone-warn">Süre tahmini yok</span>}
                                            </span>
                                            <span className={`text-[15px] leading-snug font-semibold ${isDone ? 'm-text-2' : 'm-text'}`}>{t.name}</span>
                                            <span className="flex items-center gap-2.5 text-[13px] w-full">
                                                <span className={`inline-flex items-center gap-1 font-semibold ${prio.ink}`}><Icon name="flag" size={14} strokeWidth={2.2} />{prio.label}</span>
                                                {t.unit && <span className="m-text-3 truncate">{t.unit}</span>}
                                                {t.dueDate && <span className={`ml-auto m-tabular ${late ? 'm-ink-bad font-semibold' : 'm-text-3'}`}>{shortDate(t.dueDate)}</span>}
                                                {t.resourceName && (
                                                    <span title={t.resourceName} aria-label={`Atanan: ${t.resourceName}`} className={`${t.dueDate ? '' : 'ml-auto'} w-7 h-7 rounded-full m-fill m-text flex items-center justify-center text-[11px] font-bold flex-none`}>
                                                        {initialsOf(t.resourceName)}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                        <TaskActionsMenu task={t} onStatusChange={changeStatus} onEdit={onEditTask} onDelete={onDeleteTask} onNotify={onNotifyTask} />
                                    </article>
                                );
                            })}
                        </section>
                    );
                })}
            </div>
        </div>
    );
};

export default ModernBoard;
