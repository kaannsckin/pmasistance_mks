import React, { useMemo, useState } from 'react';
import { Person, WbAccess, WbAccessLevel, Whiteboard } from '../../../types';
import { cleanAccess, DEFAULT_ACCESS, LEVEL_LABEL } from '../../../utils/whiteboard/access';
import { initials, peerColor } from '../../../utils/whiteboard/collab';
import { Icon } from '../icons';
import { Sheet } from '../ui';

/**
 * Pano erişimi ve paylaşım (sahip ve projenin PY'si): projeyi gören herkes için
 * varsayılan düzey ve kişi bazında görüntüleme / düzenleme yetkisi.
 */

const fullName = (p: Person) => `${p.firstName} ${p.lastName}`.trim();
const fold = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/[̀-ͯ]/g, '');

const LevelSelect: React.FC<{ value: WbAccessLevel; onChange: (v: WbAccessLevel) => void; label: string; options?: WbAccessLevel[] }> = ({ value, onChange, label, options = ['none', 'view', 'edit'] }) => (
    <select aria-label={label} className="m-input !h-9 !py-0 text-[14px] !w-36 flex-none" value={value} onChange={e => onChange(e.target.value as WbAccessLevel)}>
        {options.map(o => <option key={o} value={o}>{LEVEL_LABEL[o]}</option>)}
    </select>
);

const Avatar: React.FC<{ name: string; seed: string }> = ({ name, seed }) => (
    <span className="w-8 h-8 rounded-full grid place-items-center text-white text-[12px] font-bold flex-none" style={{ background: peerColor(seed) }}>{initials(name)}</span>
);

const WbAccessSheet: React.FC<{
    board: Whiteboard;
    people: Person[];
    /** Projenin PY'si (her zaman yönetir) */
    pmPersonId?: string;
    onSave: (access: WbAccess, ownerId?: string) => void;
    onClose: () => void;
}> = ({ board, people, pmPersonId, onSave, onClose }) => {
    const [access, setAccess] = useState<WbAccess>(() => JSON.parse(JSON.stringify(board.access || DEFAULT_ACCESS)));
    const [ownerId, setOwnerId] = useState<string | undefined>(board.ownerId);
    const [q, setQ] = useState('');
    const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
    const owner = ownerId ? byId.get(ownerId) : undefined;
    const pm = pmPersonId ? byId.get(pmPersonId) : undefined;
    const listed = Object.entries(access.people || {}).filter(([id]) => byId.has(id) && id !== ownerId);
    const candidates = useMemo(() => {
        const f = fold(q.trim());
        if (!f) return [];
        const taken = new Set([...Object.keys(access.people || {}), ownerId || '']);
        return people.filter(p => !taken.has(p.id) && fold(`${fullName(p)} ${p.departmentCode || ''}`).includes(f)).slice(0, 8);
    }, [q, people, access.people, ownerId]);
    const setPerson = (id: string, lvl: WbAccessLevel | null) => setAccess(a => {
        const peopleMap = { ...(a.people || {}) };
        if (lvl === null) delete peopleMap[id]; else peopleMap[id] = lvl;
        return { ...a, people: peopleMap };
    });
    const clean = cleanAccess(access, ownerId);
    const changed = JSON.stringify(clean) !== JSON.stringify(cleanAccess(board.access || DEFAULT_ACCESS, board.ownerId)) || ownerId !== board.ownerId;

    return (
        <Sheet title={`Erişim: ${board.name}`} subtitle="Panoyu kimlerin görebileceğini ve düzenleyebileceğini belirleyin." onClose={onClose}
            footer={<>
                <span className="flex-1 text-[12.5px] m-text-3">Bulutta aynı kural sunucuda da uygulanır: görme yetkisi olmayan panoyu ve içeriğini alamaz.</span>
                <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
                <button type="button" className="m-btn m-btn-primary" disabled={!changed} onClick={() => onSave(clean, ownerId)}><Icon name="check" size={16} />Kaydet</button>
            </>}>
            <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold m-text-2">Yönetenler</span>
                <div className="flex items-center gap-3 py-1.5">
                    {owner ? <Avatar name={fullName(owner)} seed={owner.id} /> : <span className="w-8 h-8 rounded-full grid place-items-center m-fill-2 m-text-3"><Icon name="users" size={15} /></span>}
                    <span className="flex-1 min-w-0 text-[14px] m-text truncate">{owner ? fullName(owner) : 'Sahip atanmamış'}<span className="m-text-3"> · sahibi</span></span>
                    <select aria-label="Panonun sahibi" className="m-input !h-9 !py-0 text-[14px] !w-44 flex-none" value={ownerId || ''} onChange={e => setOwnerId(e.target.value || undefined)}>
                        <option value="">Sahip yok</option>
                        {[...people].sort((a, b) => fullName(a).localeCompare(fullName(b), 'tr')).map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
                    </select>
                </div>
                {pm && pm.id !== ownerId && (
                    <div className="flex items-center gap-3 py-1.5">
                        <Avatar name={fullName(pm)} seed={pm.id} />
                        <span className="flex-1 min-w-0 text-[14px] m-text truncate">{fullName(pm)}<span className="m-text-3"> · projenin PY'si (her zaman yönetir)</span></span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl m-fill-2">
                <span className="w-8 h-8 rounded-full grid place-items-center m-surface m-text-2 flex-none"><Icon name="users" size={15} /></span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold m-text">Projeyi gören herkes</span>
                    <span className="block text-[12.5px] m-text-3">Aşağıda ayrıca eklenmeyen herkes için</span>
                </span>
                <LevelSelect label="Herkes için erişim" value={access.everyone} onChange={v => setAccess(a => ({ ...a, everyone: v }))} />
            </div>

            <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold m-text-2">Kişiler</span>
                <div className="relative">
                    <input className="m-input" placeholder="Kişi ekle: ad ya da birim ara" value={q} onChange={e => setQ(e.target.value)} aria-label="Kişi ara" />
                    {candidates.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 p-1 rounded-xl m-surface m-pop shadow-xl" style={{ border: '1px solid var(--m-sep, #e5e7eb)' }} role="listbox">
                            {candidates.map(p => (
                                <button key={p.id} type="button" role="option" aria-selected="false" className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg border-0 bg-transparent cursor-pointer text-left hover:m-fill-2"
                                    onClick={() => { setPerson(p.id, access.everyone === 'edit' ? 'view' : 'edit'); setQ(''); }}>
                                    <Avatar name={fullName(p)} seed={p.id} />
                                    <span className="flex-1 min-w-0 text-[14px] m-text truncate">{fullName(p)}</span>
                                    <span className="text-[12px] m-text-3">{p.departmentCode}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {listed.length === 0 && <p className="m-0 text-[13px] m-text-3">Kişi bazında istisna yok: herkes "{LEVEL_LABEL[access.everyone]}".</p>}
                {listed.map(([id, lvl]) => {
                    const p = byId.get(id)!;
                    return (
                        <div key={id} className="flex items-center gap-3 py-1">
                            <Avatar name={fullName(p)} seed={p.id} />
                            <span className="flex-1 min-w-0 text-[14px] m-text truncate">{fullName(p)}<span className="m-text-3"> · {p.departmentCode}</span></span>
                            <LevelSelect label={`${fullName(p)} için erişim`} value={lvl} onChange={v => setPerson(id, v)} />
                            <button type="button" className="m-icon-btn !w-8 !h-8" aria-label={`${fullName(p)} kişisini kaldır`} onClick={() => setPerson(id, null)}><Icon name="x" size={14} /></button>
                        </div>
                    );
                })}
            </div>
        </Sheet>
    );
};

export default WbAccessSheet;
