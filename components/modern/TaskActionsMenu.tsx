import React, { useRef, useState } from 'react';
import { Task, TaskStatus } from '../../types';
import { Icon } from './icons';
import { COLUMN_META, columnOf } from './taskMeta';

/** Görev satırı/kartı için "…" menüsü: durum değiştir, düzenle, bildir, sil */
const TaskActionsMenu: React.FC<{
    task: Task;
    onStatusChange: (id: string, status: TaskStatus) => void;
    onEdit: (task: Task) => void;
    onDelete: (id: string) => void;
    onNotify?: (task: Task) => void;
    align?: 'left' | 'right';
}> = ({ task, onStatusChange, onEdit, onDelete, onNotify, align = 'right' }) => {
    const [open, setOpen] = useState(false);
    // Menü, kaydırılan tablo/sütun içinde kırpılmasın diye ekrana göre konumlanır
    const [pos, setPos] = useState<React.CSSProperties>({});
    const btnRef = useRef<HTMLButtonElement>(null);
    const toggle = () => {
        if (!open && btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            const menuH = onNotify ? 330 : 286;
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
                    <div role="menu" className="w-60 m-surface m-pop rounded-2xl py-1.5 z-50" style={pos} onClick={e => e.stopPropagation()}>
                        <p className="px-3.5 pt-1 pb-1 text-[13px] font-semibold m-text-3">Durum</p>
                        {([TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.Done] as const).map(s => (
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
