import React, { useEffect, useId, useRef, useState } from 'react';
import { normQ } from '../../utils/taskQuery';
import { Icon } from './icons';

interface SavedQuery {
    name: string;
    query: string;
    pinned: boolean;
}

interface Props {
    projectId: string;
    query: string;
    canSave: boolean;
    disabled: boolean;
    onUse: (query: string) => void;
}

const isSavedQuery = (value: unknown): value is SavedQuery => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<SavedQuery>;
    return typeof item.name === 'string' && !!item.name.trim()
        && typeof item.query === 'string' && !!item.query.trim() && typeof item.pinned === 'boolean';
};

const read = (key: string): SavedQuery[] => {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter(isSavedQuery) : [];
};

const SavedTaskQueries: React.FC<Props> = ({ projectId, query, canSave, disabled, onUse }) => {
    const key = `pa-task-query-saved:${projectId}`;
    const [saved, setSaved] = useState<SavedQuery[]>(() => {
        try { return read(key); } catch { return []; }
    });
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const toggleRef = useRef<HTMLButtonElement>(null);
    const panelId = useId();
    const nameId = useId();
    const sorted = [...saved].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name, 'tr'));
    const pinned = sorted.filter(item => item.pinned);

    useEffect(() => {
        const sync = (event: StorageEvent) => {
            if (event.storageArea !== localStorage || (event.key !== key && event.key !== null)) return;
            try { setSaved(read(key)); } catch { setSaved([]); }
        };
        window.addEventListener('storage', sync);
        return () => window.removeEventListener('storage', sync);
    }, [key]);

    const update = (edit: (items: SavedQuery[]) => SavedQuery[] | null) => {
        try {
            const current = read(key);
            const next = edit(current);
            if (!next) return false;
            localStorage.setItem(key, JSON.stringify(next));
            setSaved(next);
            setError('');
            return true;
        } catch {
            setError('Kayıtlı sorgular tarayıcıya yazılamadı.');
            return false;
        }
    };

    const save = (event: React.FormEvent) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (disabled || !canSave || !trimmedName) return;
        const added = update(items => {
            if (items.some(item => normQ(item.name) === normQ(trimmedName))) {
                setError('Bu adla bir sorgu zaten kayıtlı.');
                return null;
            }
            return [...items, { name: trimmedName, query: query.trim(), pinned: false }];
        });
        if (added) setName('');
    };

    const useSaved = (item: SavedQuery) => {
        setOpen(false);
        setError('');
        onUse(item.query);
    };

    return (
        <div onKeyDown={event => {
            if (event.key !== 'Escape' || !open) return;
            event.preventDefault();
            setOpen(false);
            toggleRef.current?.focus();
        }}>
            <div className="flex flex-wrap items-center gap-1.5">
                <button ref={toggleRef} type="button" className="m-btn m-btn-plain !min-h-[36px]" aria-expanded={open} aria-controls={panelId} onClick={() => { setOpen(value => !value); setError(''); }}>
                    <Icon name="bookmark" size={16} />Kayıtlı sorgular
                </button>
                {pinned.map(item => (
                    <button key={item.name} type="button" disabled={disabled} className="m-btn m-btn-gray !min-h-[32px] max-w-full" title={item.query} onClick={() => useSaved(item)}>
                        <Icon name="star" size={14} /><span className="truncate max-w-[180px]">{item.name}</span>
                    </button>
                ))}
            </div>
            <section id={panelId} aria-label="Kayıtlı sorguları yönet" hidden={!open} className="mt-1.5 rounded-xl border m-sep p-3.5 m-surface">
                <form className="flex flex-wrap items-end gap-2" onSubmit={save}>
                    <div className="flex-1 min-w-[160px]">
                        <label htmlFor={nameId} className="block mb-1 text-[13px] font-semibold m-text">Sorgu adı</label>
                        <input id={nameId} className="m-input w-full" value={name} maxLength={60} disabled={disabled || !canSave} placeholder="Ör. Haftalık takip" onChange={event => { setName(event.target.value); setError(''); }} />
                    </div>
                    <button type="submit" className="m-btn m-btn-primary" disabled={disabled || !canSave || !name.trim()}>Sorguyu kaydet</button>
                </form>
                {!disabled && !canSave && <p className="mt-2 mb-0 text-[13px] m-text-3">Kaydetmek için geçerli bir sorgu yazın.</p>}
                {error && <p role="alert" className="mt-2 mb-0 text-[13px] m-ink-bad">{error}</p>}
                {sorted.length > 0 && (
                    <ul className="mt-2.5 mb-0 p-0 list-none divide-y m-sep">
                        {sorted.map(item => (
                            <li key={item.name} className="flex flex-wrap items-center gap-1.5 py-1.5">
                                <button type="button" className="m-row-link !w-auto flex-1 min-w-[140px] rounded-lg px-2 py-1.5" disabled={disabled} onClick={() => useSaved(item)}>
                                    <span className="block font-semibold break-words text-[14px]">{item.name}</span>
                                    <code className="block m-text-3 break-all text-[12px]">{item.query}</code>
                                </button>
                                <button type="button" className="m-btn m-btn-plain !min-h-[36px]" disabled={disabled} aria-label={`${item.name} sorgusu için ${item.pinned ? 'sabitlemeyi kaldır' : 'sabitle'}`} onClick={() => update(items => items.map(entry => entry.name === item.name ? { ...entry, pinned: !item.pinned } : entry))}>
                                    <Icon name="star" size={16} />{item.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
                                </button>
                                <button type="button" className="m-icon-btn !w-9 !h-9" disabled={disabled} aria-label={`${item.name} sorgusunu sil`} title="Kayıtlı sorguyu sil" onClick={() => update(items => items.filter(entry => entry.name !== item.name))}>
                                    <Icon name="trash" size={16} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
};

export default SavedTaskQueries;
