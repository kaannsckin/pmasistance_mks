import React from 'react';
import { Person, ProjectRoleDef, SchemeRequiredField, TransitionRule, UserRole } from '../../../types';
import { ROLE_LABELS } from '../../../utils/allocations';
import { REQUIRED_FIELD_LABELS } from '../../../utils/projectScheme';
import { describeRule } from '../../../utils/transitions';

/**
 * Geçiş kuralı düzenleyici — Jira'daki geçiş ayarlarının üç sekmesi tek yerde:
 * Koşullar (kim yapabilir), Doğrulayıcılar (ne istenir), Sonrası işlemler (ne olur).
 */

const ROLES: UserRole[] = ['py', 'bolum_sorumlu', 'pyb_destek', 'pyb_sorumlu', 'mudur'];
const FIELDS = Object.keys(REQUIRED_FIELD_LABELS) as SchemeRequiredField[];
const list = (s: string) => [...new Set(s.split(',').map(x => x.trim()).filter(Boolean))];
const fullName = (p: Person) => `${p.firstName} ${p.lastName}`.trim();

const Box: React.FC<{ title: string; hint: string; children: React.ReactNode }> = ({ title, hint, children }) => (
    <fieldset className="m-0 border-0 m-surface rounded-xl p-3 flex flex-col gap-2 min-w-0" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }}>
        <legend className="sr-only">{title}</legend>
        <span className="text-[14px] font-semibold m-text">{title}</span>
        <span className="text-[12px] m-text-3 -mt-1.5">{hint}</span>
        {children}
    </fieldset>
);

const Check: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ label, checked, onChange, disabled }) => (
    <label className="flex items-center gap-1.5 text-[13.5px] cursor-pointer"><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />{label}</label>
);

const TransitionRuleEditor: React.FC<{
    title: string;
    rule: TransitionRule;
    onChange: (r: TransitionRule) => void;
    people: Person[];
    /** Proje rolü tanımları (koşulda kişi yerine rol) */
    roleDefs?: ProjectRoleDef[];
    readOnly?: boolean;
}> = ({ title, rule: r, onChange, people, roleDefs = [], readOnly }) => {
    const set = (patch: Partial<TransitionRule>) => onChange({ ...r, ...patch });
    const toggle = <T,>(arr: T[] | undefined, v: T, on: boolean): T[] | undefined => {
        const next = on ? [...new Set([...(arr || []), v])] : (arr || []).filter(x => x !== v);
        return next.length ? next : undefined;
    };
    if (readOnly) {
        const d = describeRule(r, people, roleDefs);
        const row = (label: string, items: string[]) => <p className="m-0 text-[13px]"><b className="m-text-2">{label}:</b> <span className="m-text-3">{items.join(' · ') || 'yok'}</span></p>;
        return (
            <section className="m-surface rounded-xl p-3 flex flex-col gap-1" style={{ boxShadow: 'inset 0 0 0 1px var(--m-sep)' }} aria-label={title}>
                <span className="text-[13px] font-semibold m-text">{title} <span className="font-normal m-text-3">(yönetici tanımlar)</span></span>
                {row('Koşullar', d.conditions)}{row('Doğrulayıcılar', d.validators)}{row('Sonrası işlemler', d.post)}
            </section>
        );
    }
    const others = people.filter(p => !(r.people || []).includes(p.id)).sort((a, b) => fullName(a).localeCompare(fullName(b), 'tr'));
    return (
        <section className="flex flex-col gap-2" aria-label={title}>
            <span className="text-[13px] font-semibold m-text">{title}</span>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <Box title="Koşullar" hint="Geçişi kim yapabilir? Boşsa herkes (seçilen proje rollerinden, uygulama rollerinden ya da kişilerden biri).">
                    {roleDefs.length > 0 && <>
                        <span className="text-[12px] m-text-3">Proje rolü (üyeleri her projede atanır)</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {roleDefs.map(x => <Check key={x.id} label={x.name} checked={!!r.projectRoles?.includes(x.id)} onChange={on => set({ projectRoles: toggle(r.projectRoles, x.id, on) })} />)}
                        </div>
                    </>}
                    <span className="text-[12px] m-text-3">Uygulama rolü</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {ROLES.map(x => <Check key={x} label={ROLE_LABELS[x]} checked={!!r.roles?.includes(x)} onChange={on => set({ roles: toggle(r.roles, x, on) })} />)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {(r.people || []).map(id => {
                            const p = people.find(x => x.id === id);
                            return <button key={id} type="button" className="m-pill is-active" title="Kaldır" onClick={() => set({ people: toggle(r.people, id, false) })}>{p ? fullName(p) : id} ×</button>;
                        })}
                    </div>
                    <select aria-label="Kişi ekle" className="m-input !h-8 !py-0 text-[13px]" value="" onChange={e => e.target.value && set({ people: toggle(r.people, e.target.value, true) })}>
                        <option value="">+ Kişi ekle…</option>
                        {others.map(p => <option key={p.id} value={p.id}>{fullName(p)}{p.departmentCode ? ` · ${p.departmentCode}` : ''}</option>)}
                    </select>
                    <Check label="Yalnız görevin atananı" checked={!!r.assigneeOnly} onChange={v => set({ assigneeOnly: v || undefined })} />
                </Box>
                <Box title="Doğrulayıcılar" hint="Geçişte ne istenir? Eksikse geçiş penceresi açılır.">
                    <Check label="Geçiş notu (yorum olarak eklenir)" checked={!!r.requireComment} onChange={v => set({ requireComment: v || undefined })} />
                    <Check label="Harcanan süre (saat)" checked={!!r.requireHours} onChange={v => set({ requireHours: v || undefined })} />
                    <Check label="Tüm alt görevler tamamlanmış" checked={!!r.requireSubtasksDone} onChange={v => set({ requireSubtasksDone: v || undefined })} />
                    <span className="text-[12px] m-text-3 mt-1">Dolu olması gereken alanlar</span>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {FIELDS.map(f => <Check key={f} label={REQUIRED_FIELD_LABELS[f]} checked={!!r.requireFields?.includes(f)} onChange={on => set({ requireFields: toggle(r.requireFields, f, on) })} />)}
                    </div>
                </Box>
                <Box title="Sonrası işlemler" hint="Geçişten sonra otomatik yapılır.">
                    <label className="flex flex-col gap-0.5 text-[12px] m-text-3">Etiket ekle (virgülle)
                        <input className="m-input !h-8 !py-0 text-[13px]" defaultValue={(r.addLabels || []).join(', ')} placeholder="ör. test-bekliyor" onBlur={e => set({ addLabels: list(e.target.value).length ? list(e.target.value) : undefined })} />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[12px] m-text-3">Etiket çıkar (virgülle)
                        <input className="m-input !h-8 !py-0 text-[13px]" defaultValue={(r.removeLabels || []).join(', ')} onBlur={e => set({ removeLabels: list(e.target.value).length ? list(e.target.value) : undefined })} />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[12px] m-text-3">Atananı değiştir
                        <select className="m-input !h-8 !py-0 text-[13px]" value={r.assign || ''} onChange={e => set({ assign: e.target.value || undefined })}>
                            <option value="">Değiştirme</option>
                            <option value="actor">Geçişi yapan kişiye ata</option>
                            <option value="none">Atamayı kaldır</option>
                            {people.map(p => <option key={p.id} value={fullName(p)}>{fullName(p)}</option>)}
                        </select>
                    </label>
                    <Check label="Atanana bildir (e-posta; yoksa Teams kanalı)" checked={!!r.notifyAssignee} onChange={v => set({ notifyAssignee: v || undefined })} />
                </Box>
            </div>
        </section>
    );
};

export default TransitionRuleEditor;
