import React, { useMemo, useState } from 'react';
import { Task, WorkPackage } from '../../../types';
import { summarizeWorkPackages } from '../../../utils/workPackages';
import { Icon } from '../icons';
import { Field, rowSep, Sheet } from '../ui';

/** İş paketleri: görev sayısı, tamamlanma ve atananlarla; ekle / düzenle / sil */
const WorkPackagesSheet: React.FC<{
    workPackages: WorkPackage[];
    tasks: Task[];
    canEdit: boolean;
    onChange: (next: WorkPackage[]) => void;
    onClose: () => void;
}> = ({ workPackages, tasks, canEdit, onChange, onClose }) => {
    const rows = useMemo(() => summarizeWorkPackages(workPackages, tasks), [workPackages, tasks]);
    const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
    const unassigned = byId.get('');
    const [editing, setEditing] = useState<string | 'new' | null>(workPackages.length === 0 && canEdit ? 'new' : null);
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');

    const start = (wp?: WorkPackage) => {
        setEditing(wp ? wp.id : 'new');
        setName(wp?.name || '');
        setDesc(wp?.description || '');
    };
    const dup = workPackages.some(w => w.id !== editing && w.name.trim().toLocaleLowerCase('tr-TR') === name.trim().toLocaleLowerCase('tr-TR'));
    const save = () => {
        if (!name.trim() || dup) return;
        if (editing === 'new') onChange([...workPackages, { id: `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), description: desc.trim() }]);
        else onChange(workPackages.map(w => (w.id === editing ? { ...w, name: name.trim(), description: desc.trim() } : w)));
        setEditing(null);
    };
    const remove = (wp: WorkPackage) => {
        const n = byId.get(wp.id)?.taskCount || 0;
        if (!window.confirm(`"${wp.name}" iş paketi silinsin mi?${n ? ` ${n} görev iş paketi atanmamış olarak kalır.` : ''}`)) return;
        onChange(workPackages.filter(w => w.id !== wp.id));
        if (editing === wp.id) setEditing(null);
    };

    const form = (
        <form className="rounded-2xl m-surface p-4 flex flex-col gap-3" onSubmit={e => { e.preventDefault(); save(); }}>
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <Field label="Paket adı" htmlFor="wp-name"><input id="wp-name" className="m-input" autoFocus value={name} placeholder="Ör. Raporlama modülü" onChange={e => setName(e.target.value)} /></Field>
                <Field label="Açıklama" htmlFor="wp-desc"><input id="wp-desc" className="m-input" value={desc} placeholder="Paketin amacı ve kapsamı" onChange={e => setDesc(e.target.value)} /></Field>
            </div>
            {dup && <p className="m-0 text-[14px] m-ink-bad">Bu adla bir iş paketi zaten var.</p>}
            <div className="flex justify-end gap-2">
                <button type="button" className="m-btn m-btn-plain" onClick={() => setEditing(null)}>Vazgeç</button>
                <button type="submit" className="m-btn m-btn-primary" disabled={!name.trim() || dup}>{editing === 'new' ? 'Ekle' : 'Kaydet'}</button>
            </div>
        </form>
    );

    const Row: React.FC<{ title: string; sub?: string; id: string; muted?: boolean; actions?: React.ReactNode }> = ({ title, sub, id, muted, actions }) => {
        const s = byId.get(id);
        return (
            <div className="flex items-center gap-3 px-3 py-3 min-h-[64px]">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className={`text-[16px] font-semibold truncate ${muted ? 'm-text-2' : 'm-text'}`}>{title}</span>
                    {sub && <span className="text-[13px] m-text-3 line-clamp-2">{sub}</span>}
                    {s && s.assignees.length > 0 && <span className="text-[13px] m-text-3 truncate">{s.assignees.join(', ')}</span>}
                </div>
                <div className="w-40 flex-none flex flex-col gap-1">
                    {s && s.taskCount > 0 ? (
                        <>
                            <span className="text-[13px] m-text-2 m-tabular">{s.taskCount} görev · %{s.donePct}</span>
                            <span className="h-1.5 rounded-full m-fill overflow-hidden" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${s.donePct}%`, background: 'var(--m-ok)' }}></span></span>
                        </>
                    ) : <span className="text-[13px] m-text-3">Görev yok</span>}
                </div>
                {actions}
            </div>
        );
    };

    return (
        <Sheet
            xl
            title="İş paketleri"
            subtitle={`${workPackages.length} paket · ${tasks.length} görev`}
            onClose={onClose}
            headerAction={canEdit && editing === null ? <button type="button" className="m-btn m-btn-primary !min-h-[40px]" onClick={() => start()}><Icon name="plus" size={17} strokeWidth={2.2} />Yeni paket</button> : undefined}
        >
            {editing === 'new' && form}
            {workPackages.length === 0 && editing !== 'new' ? (
                <p className="m-0 py-8 text-center text-[15px] m-text-3">Henüz iş paketi yok.</p>
            ) : (
                <div className="m-surface rounded-2xl p-1.5">
                    {workPackages.map((wp, i) => {
                        const sep = rowSep(i);
                        return (
                            <div key={wp.id} className={sep.className} style={sep.style}>
                                {editing === wp.id ? <div className="p-1.5">{form}</div> : (
                                    <Row id={wp.id} title={wp.name} sub={wp.description} actions={canEdit ? (
                                        <div className="flex flex-none">
                                            <button type="button" className="m-icon-btn" aria-label={`${wp.name} düzenle`} onClick={() => start(wp)}><Icon name="pencil" size={17} /></button>
                                            <button type="button" className="m-icon-btn" aria-label={`${wp.name} sil`} onClick={() => remove(wp)}><Icon name="trash" size={17} /></button>
                                        </div>
                                    ) : undefined} />
                                )}
                            </div>
                        );
                    })}
                    {unassigned && (
                        <div {...(workPackages.length ? rowSep(1) : { className: '' })}>
                            <Row id="" title="İş paketi atanmamış" sub="Bir iş paketine bağlanmamış görevler" muted />
                        </div>
                    )}
                </div>
            )}
        </Sheet>
    );
};

export default WorkPackagesSheet;
