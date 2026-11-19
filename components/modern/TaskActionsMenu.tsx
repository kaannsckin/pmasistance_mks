import React, { useRef, useState } from 'react';
import { Task, TaskStatus, WorkflowConfig } from '../../types';
import { Icon } from './icons';
import { COLUMN_META, columnOf } from './taskMeta';
import { taskWorkflow, workflowOptions } from '../../utils/workflow';

/** Görev satırı/kartı için "…" menüsü: durum değiştir, düzenle, bildir, sil */
const TaskActionsMenu: React.FC<{
    task: Task;
    onStatusChange: (id: string, status: TaskStatus) => void;
    onEdit: (task: Task) => void;
    onDelete: (id: string) => void;
    onNotify?: (task: Task) => void;
    /** Verilirse ayrıntılı iş akışı durumları (Analizde, Testte, Çözüldü …) listelenir */
    onWorkflowChange?: (id: string, key: string) => void;
    /** Projede görülen Jira'ya özgü durumlar da listelensin */
    workflowTasks?: Pick<Task, 'status' | 'jiraStatus'>[];
    /** Projenin iş akışı: yalnız izin verilen geçişler listelenir */
    workflow?: WorkflowConfig;
    align?: 'left' | 'right';
}> = ({ task, onStatusChange, onEdit, onDelete, onNotify, onWorkflowChange, workflowTasks, workflow, align = 'right' }) => {
    const [open, setOpen] = useState(false);
    // Menü, kaydırılan tablo/sütun içinde kırpılmasın diye ekrana göre konumlanır
    const [pos, setPos] = useState<React.CSSProperties>({});
    const btnRef = useRef<HTMLButtonElement>(null);
    const toggle = () => {
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            const menuH = onWorkflowChange ? Math.min(520, window.innerHeight - 16) : onNotify ? 330 : 286;
            const up = r.bottom + menuH > window.innerHeight && r.top > menuH;
            const horiz = align === 'right' ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) };
            setPos({ position: 'fixed', ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }), ...horiz });
        }
        setOpen(o => !o);
    };
    const current = columnOf(task.status);
    const close = () => setOpen(false);
    return (
        <div className="relative flex-none">
            <button
                ref={btnRef}
                type="button"
                className="m-icon-btn"
                aria-label={`${task.name}: işlemler`}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); toggle(); }}
            >
                <Icon name="more" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); close(); }} aria-hidden="true"></div>
                    <div role="menu" className="w-60 m-surface m-pop rounded-2xl py-1.5 z-50 overflow-y-auto" style={{ ...pos, maxHeight: onWorkflowChange ? 'min(520px, calc(100vh - 16px))' : undefined }} onClick={e => e.stopPropagation()}>
                        <p className="px-3.5 pt-1 pb-1 text-[13px] font-semibold m-text-3">Durum</p>
                        {onWorkflowChange && (() => {
                            const cur = taskWorkflow(task, workflow).key;
                            const groups = workflowOptions(workflowTasks, workflow, task);
                            if (groups.flatMap(g => g.statuses).length <= 1) return <p className="px-3.5 py-1 m-0 text-[13px] m-text-3">Bu durumdan geçiş tanımlı değil.</p>;
                            return groups.map(g => (
                                <div key={g.category} role="group" aria-label={g.label}>
                                    <p className="px-3.5 pt-1.5 pb-0.5 text-[11.5px] font-semibold m-text-3 flex items-center gap-1.5">
                                        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full box-border" style={{ border: `2px solid ${COLUMN_META[columnOf(g.category)].ring}`, background: COLUMN_META[columnOf(g.category)].fill }}></span>{g.label}
                                    </p>
                                    {g.statuses.map(s => (
                                        <button key={s.key} type="button" role="menuitemradio" aria-checked={cur === s.key}
                                            onClick={() => { if (cur !== s.key) onWorkflowChange(task.id, s.key); close(); }}
                                            className="m-row-link w-full flex items-center gap-3 min-h-[36px] pl-8 pr-3.5 text-[14.5px]">
                                            <span className="flex-1 text-left">{s.label}</span>
                                            {cur === s.key && <span className="m-accent"><Icon name="check" size={16} strokeWidth={2.2} /></span>}
                                        </button>
                                    ))}
                                </div>
                            ));
                        })()}
                        {!onWorkflowChange && ([TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done] as const).map(s => (
                            <button
                                key={s}
                                type="button"
                                role="menuitemradio"
                                aria-checked={current === s}
                                onClick={() => { if (current !== s) onStatusChange(task.id, s); close(); }}
                                className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px]"
                            >
                                <span aria-hidden="true" className="w-4 h-4 rounded-full box-border" style={{ border: `2px solid ${COLUMN_META[s].ring}`, background: COLUMN_META[s].fill }}></span>
                                <span className="flex-1">{COLUMN_META[s].label}</span>
                                {current === s && <span className="m-accent"><Icon name="check" size={18} strokeWidth={2.2} /></span>}
                            </button>
                        ))}
                        <div className="border-t m-sep my-1"></div>
                        <button type="button" role="menuitem" onClick={() => { onEdit(task); close(); }} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px]">
                            <span className="m-text-3"><Icon name="pencil" size={18} /></span>Düzenle
                        </button>
                        {onNotify && (
                            <button type="button" role="menuitem" onClick={() => { onNotify(task); close(); }} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px]">
                                <span className="m-text-3"><Icon name="send" size={18} /></span>Teams'e bildir
                            </button>
                        )}
                        <button type="button" role="menuitem" onClick={() => { close(); onDelete(task.id); }} className="m-row-link w-full flex items-center gap-3 min-h-[44px] px-3.5 text-[15px] m-ink-bad">
                            <Icon name="trash" size={18} />Sil
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default TaskActionsMenu;
