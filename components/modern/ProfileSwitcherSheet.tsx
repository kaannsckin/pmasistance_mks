import React, { useMemo, useState } from 'react';
import { UserRole, WorkspaceData } from '../../types';
import { ROLE_LABELS } from '../../utils/allocations';
import { ROLE_DESCRIPTIONS, ROLE_ORDER } from '../../utils/permissions';
import { filterProfiles, initialsOf, profileKey, profileOptions, roleNeedsPerson } from '../../utils/profiles';
import { Icon } from './icons';
import { Field, rowSep, Sheet } from './ui';

/**
 * Profil değiştir: tanımlı ve kendiliğinden oluşan profiller (kişi ↔ rol)
 * role göre gruplu, aranabilir liste. Listede olmayan kişi/rol "Başka bir
 * kişi olarak" bölümünden seçilir.
 */

interface ProfileSwitcherSheetProps {
    workspace: WorkspaceData;
    onSelect: (role: UserRole, personId?: string) => void;
    onClose: () => void;
}

const Avatar: React.FC<{ text: string; active?: boolean }> = ({ text, active }) => (
    <span aria-hidden="true" className={`w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-semibold flex-none ${active ? 'm-accent-bg' : 'm-fill m-text-2'}`}>{text}</span>
);

const ProfileSwitcherSheet: React.FC<ProfileSwitcherSheetProps> = ({ workspace, onSelect, onClose }) => {
    const [query, setQuery] = useState('');
    const [otherOpen, setOtherOpen] = useState(false);
    const [otherRole, setOtherRole] = useState<UserRole>('py');
    const [otherPerson, setOtherPerson] = useState('');

    const currentRole = workspace.currentRole || 'py';
    const currentKey = profileKey(currentRole, workspace.currentPersonId);
    const options = useMemo(() => profileOptions(workspace), [workspace]);
    const shown = useMemo(() => filterProfiles(options, query), [options, query]);
    const groups = useMemo(() => ROLE_ORDER.map(role => ({ role, items: shown.filter(o => o.role === role) })).filter(g => g.items.length), [shown]);
    const people = useMemo(() => [...workspace.people].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')), [workspace.people]);
    const currentPerson = workspace.people.find(p => p.id === workspace.currentPersonId);
    const currentName = currentPerson ? `${currentPerson.firstName} ${currentPerson.lastName}`.trim() : ROLE_LABELS[currentRole];

    const choose = (role: UserRole, personId?: string) => { onSelect(role, personId); onClose(); };
    const otherValid = !roleNeedsPerson(otherRole) || !!otherPerson;

    return (
        <Sheet wide title="Profil değiştir" subtitle="Hangi profille çalışmak istiyorsunuz?" onClose={onClose}>
            <div className="m-surface rounded-2xl p-4 flex items-center gap-3">
                <Avatar text={initialsOf(currentName)} active />
                <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[13px] m-text-3">Şu anki profil</span>
                    <span className="text-[17px] font-semibold m-text truncate">{currentName}</span>
                    <span className="text-[14px] m-text-2 truncate">{currentPerson ? ROLE_LABELS[currentRole] : ROLE_DESCRIPTIONS[currentRole]}</span>
                </div>
            </div>

            <label className="flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl m-surface m-text-3">
                <Icon name="search" size={18} strokeWidth={2} />
                <input type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Kişi, rol ya da bölüm ara" aria-label="Profillerde ara" className="flex-1 min-w-0 border-0 bg-transparent outline-none text-[15px] m-text" />
            </label>

            {groups.length === 0 && <p className="m-0 px-1 text-[15px] m-text-3">Aramaya uyan profil yok. Aşağıdan başka bir kişi olarak çalışabilirsiniz.</p>}
            {groups.map(g => (
                <section key={g.role} aria-label={ROLE_LABELS[g.role]} className="flex flex-col gap-1.5">
                    <div className="px-1 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2">
                        <h3 className="m-0 text-[15px] font-semibold m-text">{ROLE_LABELS[g.role]}</h3>
                        <span className="text-[13px] m-text-3 truncate">{ROLE_DESCRIPTIONS[g.role]}</span>
                    </div>
                    <div className="m-surface rounded-2xl p-1.5">
                        {g.items.map((o, i) => {
                            const sep = rowSep(i);
                            const active = o.key === currentKey;
                            return (
                                <button key={o.key} type="button" aria-current={active ? 'true' : undefined} onClick={() => choose(o.role, o.personId)} className={`m-row-link flex items-center gap-3 px-2.5 py-2 min-h-[60px] rounded-xl ${sep.className}`} style={sep.style}>
                                    <Avatar text={o.initials} active={active} />
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[15px] font-semibold m-text truncate">{o.name}</span>
                                        <span className="text-[13px] m-text-3 truncate">{o.personId ? o.detail : 'Kişi seçmeden'}</span>
                                    </span>
                                    {o.source === 'defined' && <span className="hidden sm:inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold m-tone-accent">Tanımlı</span>}
                                    {active ? <span className="m-accent"><Icon name="check" size={20} strokeWidth={2.4} /></span> : <span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>}
                                </button>
                            );
                        })}
                    </div>
                </section>
            ))}

            <section className="flex flex-col gap-2">
                <button type="button" className="self-start inline-flex items-center gap-1 bg-transparent border-0 p-0 text-[15px] font-semibold m-accent cursor-pointer" aria-expanded={otherOpen} onClick={() => setOtherOpen(o => !o)}>
                    <Icon name={otherOpen ? 'chevronDown' : 'chevronRight'} size={16} />Listede yok mu? Başka bir kişi olarak çalışın
                </button>
                {otherOpen && (
                    <form className="m-surface rounded-2xl p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end" onSubmit={e => { e.preventDefault(); if (otherValid) choose(otherRole, otherPerson || undefined); }}>
                        <Field label="Rol" htmlFor="pf-role">
                            <select id="pf-role" className="m-input" value={otherRole} onChange={e => setOtherRole(e.target.value as UserRole)}>
                                {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                        </Field>
                        <Field label={roleNeedsPerson(otherRole) ? 'Kişi' : 'Kişi (isteğe bağlı)'} htmlFor="pf-person">
                            <select id="pf-person" className="m-input" value={otherPerson} onChange={e => setOtherPerson(e.target.value)}>
                                <option value="">{roleNeedsPerson(otherRole) ? 'Kişi seçin' : 'Kişi seçmeden'}</option>
                                {people.map(p => <option key={p.id} value={p.id}>{`${p.firstName} ${p.lastName}`.trim()}{p.departmentCode ? ` · ${p.departmentCode}` : ''}</option>)}
                            </select>
                        </Field>
                        <button type="submit" className="m-btn m-btn-primary" disabled={!otherValid}>Geç</button>
                        {people.length === 0 && roleNeedsPerson(otherRole) && <p className="m-0 sm:col-span-3 text-[13px] m-ink-warn">Havuzda kişi yok; önce Veri havuzuna personel ekleyin.</p>}
                    </form>
                )}
            </section>
        </Sheet>
    );
};

export default ProfileSwitcherSheet;
