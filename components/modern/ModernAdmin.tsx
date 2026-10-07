import React, { useMemo, useState } from 'react';
import { PermissionKey, UserRole, WorkspaceData } from '../../types';
import { ROLE_LABELS } from '../../utils/allocations';
import {
    customizedRoles, isEditable, PERMISSION_GROUP_LABELS, PermissionGroup, PERMISSIONS, permissionsFor, ROLE_DESCRIPTIONS, ROLE_ORDER,
} from '../../utils/permissions';
import { profileOptions, ProfileOption, roleNeedsPerson } from '../../utils/profiles';
import { Icon } from './icons';
import { Field, rowSep } from './ui';

/**
 * Yönetici (admin) ekranı:
 *  - Yetkiler: rol × özellik matrisi. Varsayılandan farklı hücreler işaretli;
 *    kilitli kurallar (not gizliliği, admin'in kendi ekranı) değiştirilemez.
 *  - Profiller: profil değiştirme penceresinde listelenen kişi ↔ rol
 *    eşleşmeleri. Proje yöneticileri ve bölüm sorumluları kendiliğinden gelir.
 * Her değişiklik hemen uygulanır ve denetim günlüğüne yazılır.
 */

export interface ModernAdminProps {
    workspace: WorkspaceData;
    onSetPermission: (role: UserRole, key: PermissionKey, on: boolean) => void;
    onResetRole: (role: UserRole) => void;
    onAddProfile: (role: UserRole, personId?: string) => boolean;
    onRemoveProfile: (id: string) => void;
}

type Tab = 'permissions' | 'profiles';

const SHORT_ROLE: Record<UserRole, string> = {
    py: 'PY', bolum_sorumlu: 'Bölüm S.', pyb_destek: 'PYB Destek', pyb_sorumlu: 'PYB Sorumlusu', mudur: 'Müdür', admin: 'Admin',
};
const GROUP_ORDER: PermissionGroup[] = ['screens', 'portfolio', 'decisions', 'report', 'privacy'];

const Switch: React.FC<{ on: boolean; label: string; disabled?: boolean; changed?: boolean; title?: string; onChange: (on: boolean) => void }> = ({ on, label, disabled, changed, title, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className="relative inline-flex flex-none w-[46px] h-7 rounded-full border-0 cursor-pointer disabled:cursor-not-allowed"
        style={{
            background: on ? 'var(--m-accent)' : 'var(--m-fill)',
            boxShadow: changed ? '0 0 0 2px var(--m-surface), 0 0 0 4px var(--m-warn)' : undefined,
            opacity: disabled ? 0.5 : 1,
            transition: 'background-color .15s ease',
        }}
    >
        <span aria-hidden="true" className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white" style={{ left: on ? 21 : 3, boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s ease' }}></span>
    </button>
);

// ------------------------------------------------------------------ yetkiler

const PermissionMatrix: React.FC<Pick<ModernAdminProps, 'workspace' | 'onSetPermission' | 'onResetRole'>> = ({ workspace, onSetPermission, onResetRole }) => {
    const overrides = workspace.rolePermissions;
    const effective = useMemo(() => new Map(ROLE_ORDER.map(r => [r, permissionsFor(r, overrides)])), [overrides]);
    const defaults = useMemo(() => new Map(ROLE_ORDER.map(r => [r, permissionsFor(r)])), []);
    const customized = useMemo(() => new Set(customizedRoles(overrides)), [overrides]);
    const grid = `minmax(260px, 2.2fr) repeat(${ROLE_ORDER.length}, minmax(92px, 1fr))`;
    const [mobileRole, setMobileRole] = useState<UserRole>('py');
    const cell = (r: UserRole, key: PermissionKey) => {
        const def = PERMISSIONS.find(p => p.key === key)!;
        const on = effective.get(r)!.has(key);
        const editable = isEditable(key, r);
        const changed = on !== defaults.get(r)!.has(key);
        return (
            <Switch
                on={on}
                disabled={!editable}
                changed={changed}
                label={`${ROLE_LABELS[r]}: ${def.label}`}
                title={!editable ? (def.locked || `${ROLE_LABELS[r]} bu yetkiyi her zaman taşır`) : changed ? `Varsayılan: ${defaults.get(r)!.has(key) ? 'verili' : 'verili değil'}` : undefined}
                onChange={v => onSetPermission(r, key, v)}
            />
        );
    };
    const labelOf = (p: typeof PERMISSIONS[number]) => (
        <span className="min-w-0 flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold m-text flex items-center gap-1.5">
                {p.label}
                {p.locked && <span className="m-text-3" title={p.locked}><Icon name="lock" size={14} /></span>}
            </span>
            <span className="text-[13px] m-text-3">{p.locked || p.description}</span>
        </span>
    );

    return (
        <div className="flex flex-col gap-4">
            <div className="m-surface rounded-2xl px-4 py-3 flex items-start gap-3">
                <span className="m-accent" style={{ marginTop: 2 }}><Icon name="info" size={18} /></span>
                <p className="m-0 flex-1 text-[14px] leading-relaxed m-text-2">
                    Bir rolün hangi özellikleri kullanacağını buradan belirleyin; değişiklik hemen uygulanır ve denetim günlüğüne yazılır. Sarı halkalı hücreler varsayılandan farklıdır.
                    Kilitli satırlar değiştirilemez. Sahiplik kuralları (PY yalnız kendi projesini, bölüm sorumlusu yalnız kendi bölümünü düzenler) yetki değil kimlik kuralıdır ve her rolde geçerlidir.
                </p>
            </div>

            {/* Dar ekran: rol seçilir, yetkileri tek sütunda */}
            <div className="md:hidden flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Rol" className="m-pill flex-1 min-w-0" value={mobileRole} onChange={e => setMobileRole(e.target.value as UserRole)}>
                        {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}{customized.has(r) ? ' · değişti' : ''}</option>)}
                    </select>
                    {customized.has(mobileRole) && <button type="button" className="m-btn m-btn-plain" onClick={() => onResetRole(mobileRole)}>Varsayılana dön</button>}
                </div>
                <p className="m-0 px-1 text-[13px] m-text-3">{ROLE_DESCRIPTIONS[mobileRole]}</p>
                {GROUP_ORDER.map(group => (
                    <section key={group} aria-label={PERMISSION_GROUP_LABELS[group]} className="m-surface rounded-2xl px-4 py-2">
                        <h3 className="m-0 pt-1.5 pb-1 text-[13px] font-semibold m-text-3">{PERMISSION_GROUP_LABELS[group]}</h3>
                        {PERMISSIONS.filter(p => p.group === group).map((p, i) => {
                            const sep = rowSep(i);
                            return (
                                <div key={p.key} className={`flex items-center gap-3 py-2.5 ${sep.className}`} style={sep.style}>
                                    <span className="flex-1 min-w-0">{labelOf(p)}</span>
                                    {cell(mobileRole, p.key)}
                                </div>
                            );
                        })}
                    </section>
                ))}
            </div>

            <div className="hidden md:block m-surface rounded-2xl overflow-x-auto">
                <div role="table" aria-label="Rol yetkileri" style={{ minWidth: 860 }}>
                    <div role="row" className="grid items-end gap-2 px-4 pt-4 pb-2.5" style={{ gridTemplateColumns: grid }}>
                        <span role="columnheader" className="text-[13px] m-text-3">Özellik</span>
                        {ROLE_ORDER.map(r => (
                            <span key={r} role="columnheader" className="flex flex-col items-center gap-1 text-center">
                                <span className="text-[14px] font-semibold m-text" title={ROLE_DESCRIPTIONS[r]}>{SHORT_ROLE[r]}</span>
                                {customized.has(r) ? (
                                    <button type="button" className="bg-transparent border-0 p-0 text-[12.5px] font-semibold m-accent cursor-pointer" onClick={() => onResetRole(r)} title={`${ROLE_LABELS[r]} yetkilerini varsayılana döndür`}>
                                        Varsayılana dön
                                    </button>
                                ) : <span className="text-[12.5px] m-text-3">Varsayılan</span>}
                            </span>
                        ))}
                    </div>
                    {GROUP_ORDER.map(group => (
                        <div key={group} role="rowgroup">
                            <div role="row" className="px-4 pt-3 pb-1.5 border-t m-sep" style={{ borderTopStyle: 'solid', borderTopWidth: 1 }}>
                                <span role="cell" className="text-[13px] font-semibold m-text-3">{PERMISSION_GROUP_LABELS[group]}</span>
                            </div>
                            {PERMISSIONS.filter(p => p.group === group).map(p => (
                                <div key={p.key} role="row" className="grid items-center gap-2 px-4 py-2.5" style={{ gridTemplateColumns: grid }}>
                                    <span role="rowheader">{labelOf(p)}</span>
                                    {ROLE_ORDER.map(r => <span key={r} role="cell" className="flex justify-center">{cell(r, p.key)}</span>)}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            <p className="m-0 text-[13px] m-text-3">
                Yetkiler bu çalışma alanının tüm kullanıcılarına uygulanır (bulut eşitlemesiyle paylaşılır). Kimlik bu sürümde istemcide seçildiğinden yetkiler kullanıcı deneyimini düzenler; sunucu tarafı zorlama ileride Supabase üyelik rolüyle yapılacak.
            </p>
        </div>
    );
};

// ------------------------------------------------------------------ profiller

const SOURCE_LABEL = (o: ProfileOption): { text: string; tone: string } =>
    o.source === 'defined' ? { text: 'Tanımlı', tone: 'm-tone-accent' }
        : o.source === 'auto' ? { text: o.role === 'py' ? 'Otomatik · proje sahibi' : 'Otomatik · bölüm sorumlusu', tone: 'm-tone-hold' }
            : { text: 'Kişisiz', tone: 'm-fill m-text-3' };

const ProfileManager: React.FC<Pick<ModernAdminProps, 'workspace' | 'onAddProfile' | 'onRemoveProfile'>> = ({ workspace, onAddProfile, onRemoveProfile }) => {
    const [role, setRole] = useState<UserRole>('py');
    const [personId, setPersonId] = useState('');
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const options = useMemo(() => profileOptions(workspace), [workspace]);
    const people = useMemo(() => [...workspace.people].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')), [workspace.people]);
    const needsPerson = roleNeedsPerson(role);

    const add = (e: React.FormEvent) => {
        e.preventDefault();
        if (needsPerson && !personId) return;
        const ok = onAddProfile(role, personId || undefined);
        setMessage(ok ? { ok: true, text: 'Profil eklendi; profil değiştirme penceresinde görünür.' } : { ok: false, text: 'Bu profil zaten tanımlı.' });
        if (ok) setPersonId('');
    };

    return (
        <div className="flex flex-col gap-5">
            <form onSubmit={add} className="m-surface rounded-2xl p-5 flex flex-col gap-3">
                <div>
                    <h2 className="m-0 text-[17px] font-semibold m-text">Profil ekle</h2>
                    <p className="m-0 mt-0.5 text-[14px] m-text-3">Bir kişiyi bir rolle eşleştirin. Proje yöneticileri ve bölüm sorumluları kendiliğinden listelenir; burada ek profiller (ör. Müdür, PYB destek) tanımlanır.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] items-end">
                    <Field label="Rol" htmlFor="ad-role">
                        <select id="ad-role" className="m-input" value={role} onChange={e => { setRole(e.target.value as UserRole); setMessage(null); }}>
                            {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                    </Field>
                    <Field label={needsPerson ? 'Kişi' : 'Kişi (isteğe bağlı)'} htmlFor="ad-person">
                        <select id="ad-person" className="m-input" value={personId} onChange={e => { setPersonId(e.target.value); setMessage(null); }}>
                            <option value="">{needsPerson ? 'Kişi seçin' : 'Kişi seçmeden'}</option>
                            {people.map(p => <option key={p.id} value={p.id}>{`${p.firstName} ${p.lastName}`.trim()}{p.departmentCode ? ` · ${p.departmentCode}` : ''}</option>)}
                        </select>
                    </Field>
                    <button type="submit" className="m-btn m-btn-primary" disabled={needsPerson && !personId}><Icon name="plus" size={18} strokeWidth={2.2} />Ekle</button>
                </div>
                {message && <p role="status" className={`m-0 text-[14px] ${message.ok ? 'm-ink-ok' : 'm-ink-warn'}`}>{message.text}</p>}
            </form>

            {ROLE_ORDER.map(r => {
                const items = options.filter(o => o.role === r);
                if (!items.length) return null;
                return (
                    <section key={r} aria-label={ROLE_LABELS[r]} className="flex flex-col gap-1.5">
                        <div className="px-1 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2">
                            <h3 className="m-0 text-[15px] font-semibold m-text">{ROLE_LABELS[r]} <span className="m-text-3 font-normal m-tabular">{items.length}</span></h3>
                            <span className="text-[13px] m-text-3 truncate">{ROLE_DESCRIPTIONS[r]}</span>
                        </div>
                        <div className="m-surface rounded-2xl p-1.5">
                            {items.map((o, i) => {
                                const sep = rowSep(i);
                                const src = SOURCE_LABEL(o);
                                return (
                                    <div key={o.key} className={`flex items-center gap-3 px-2.5 py-2 min-h-[56px] ${sep.className}`} style={sep.style}>
                                        <span aria-hidden="true" className="w-9 h-9 rounded-full m-fill flex items-center justify-center text-[13px] font-semibold m-text-2 flex-none">{o.initials}</span>
                                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[15px] font-semibold m-text truncate">{o.name}</span>
                                            <span className="text-[13px] m-text-3 truncate">{o.personId ? o.detail : 'Kişi seçmeden çalışılır'}</span>
                                        </span>
                                        <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${src.tone}`}>{src.text}</span>
                                        {o.profileId ? (
                                            <button type="button" className="m-icon-btn !w-9 !h-9" aria-label={`${o.name} (${ROLE_LABELS[o.role]}) profilini kaldır`} onClick={() => onRemoveProfile(o.profileId!)}><Icon name="trash" size={16} /></button>
                                        ) : <span className="w-9 flex-none"></span>}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

// ------------------------------------------------------------------ ekran

const ModernAdmin: React.FC<ModernAdminProps> = props => {
    const [tab, setTab] = useState<Tab>('permissions');
    const customized = customizedRoles(props.workspace.rolePermissions).length;
    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-[70ch]">
                    <h1 className="m-0 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Yönetici</h1>
                    <p className="m-0 mt-1 text-[15px] m-text-3">Rollerin hangi özellikleri kullanacağını ve profil değiştirme penceresindeki kişi ↔ rol eşleşmelerini yönetin.</p>
                </div>
                {customized > 0 && <span className="inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold m-tone-warn">{customized} rolde varsayılandan farklı yetki</span>}
            </header>
            <div className="m-segmented self-start" role="group" aria-label="Bölüm">
                <button type="button" className="m-segment" aria-pressed={tab === 'permissions'} onClick={() => setTab('permissions')}><Icon name="key" size={16} />Yetkiler</button>
                <button type="button" className="m-segment" aria-pressed={tab === 'profiles'} onClick={() => setTab('profiles')}><Icon name="users" size={16} />Profiller</button>
            </div>
            {tab === 'permissions' ? <PermissionMatrix {...props} /> : <ProfileManager {...props} />}
        </div>
    );
};

export default ModernAdmin;
