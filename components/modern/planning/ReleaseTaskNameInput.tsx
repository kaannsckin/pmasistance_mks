import React, { useId, useMemo, useState } from 'react';
import { Task } from '../../../types';
import { matchReleaseTasks } from '../../../utils/planning/releasePlan';

interface Props {
    id?: string;
    label: string;
    value: string;
    tasks: Task[];
    onChange: (value: string) => void;
    onPick: (task: Task) => void;
}

const ReleaseTaskNameInput = ({ id, label, value, tasks, onChange, onPick }: Props) => {
    const listId = useId();
    const [searching, setSearching] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const rows = useMemo(() => searching ? matchReleaseTasks(tasks, value) : [], [searching, tasks, value]);
    const open = rows.length > 0;
    const active = Math.min(activeIndex, rows.length - 1);
    const pick = (task: Task) => { setSearching(false); onPick(task); };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open || event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            pick(rows[active]);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setSearching(false);
        }
    };

    return (
        <div className="relative min-w-0 flex-1">
            <input id={id} className="m-input" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open}
                aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${listId}-${active}` : undefined}
                placeholder="Görev adı veya Jira anahtarı" autoComplete="off" value={value} onKeyDown={handleKeyDown}
                onFocus={() => { setActiveIndex(0); setSearching(true); }} onBlur={() => setSearching(false)}
                onChange={e => { setActiveIndex(0); setSearching(true); onChange(e.target.value); }} />
            {open && (
                <ul id={listId} role="listbox" aria-label="Mevcut görevler" className="m-0 mt-1 p-1 list-none rounded-xl m-surface max-h-56 overflow-y-auto"
                    style={{ border: '1px solid var(--m-sep)' }}>
                    {rows.map((task, index) => (
                        <li id={`${listId}-${index}`} key={task.id} role="option" aria-selected={index === active}
                            className={`cursor-pointer rounded-lg p-2 text-[14px] min-h-10 break-words ${index === active ? 'm-fill-2' : ''}`}
                            onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => pick(task)}>
                            <span className="block font-semibold m-text">{task.name}</span>
                            {(task.jiraId || task.resourceName) && <span className="block text-[13px] m-text-3">{[task.jiraId, task.resourceName].filter(Boolean).join(' · ')}</span>}
                        </li>
                    ))}
                </ul>
            )}
            {searching && value.trim() && !open && <p role="status" className="m-0 mt-1 text-[13px] m-text-3">Eşleşen eklenebilir görev yok.</p>}
        </div>
    );
};

export default ReleaseTaskNameInput;
