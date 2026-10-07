import React, { useMemo, useRef, useState } from 'react';
import { Department, Person, RoleCatalogEntry, TitleDef, UserRole } from '../../types';
import { canEditPool, ROLE_LABELS } from '../../utils/allocations';
import {
    draftToPerson, emptyPersonDraft, filterPeople, fullName, issueCounts, PERSON_ISSUE_LABELS, PersonDraft, PersonIssue, personIssues, personToDraft,
    rolesByDepartment, trUpper, validateDepartmentCode, validatePerson, validateRole, validateTitleCode,
} from '../../utils/dataPool';
import { parsePoolWorkbook, PoolImportResult } from '../../utils/poolImporter';
import { Icon } from './icons';
import { initialsOf } from './taskMeta';
import { Field, rowSep, Sheet } from './ui';

/**
 * Modern Veri havuzu: personel, bölümler, rol kataloğu ve ünvanlar.
 * Yalnız PYB destek düzenler; diğer roller salt okur. Eksik bilgiler
 * (bölüm, ünvan, maliyet, e-posta) süzülebilir; kişi profili açılabilir.
 */

type Tab = 'people' | 'departments' | 'roles' | 'titles';
type Notice = { kind: 'ok' | 'error'; text: string } | null;

const fmtMoney = (v?: number) => (v ? `${v.toLocaleString('tr-TR')} ₺` : '—');
const fmtAA = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

const Pill: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => (
    <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${tone}`}>{children}</span>
);

const Empty: React.FC<{ text: string }> = ({ text }) => <p className="m-0 py-10 text-center text-[15px] m-text-3">{text}</p>;

// ---------------------------------------------------------------- kişi formu

const PersonSheet: React.FC<{
    person?: Person;
    people: Person[];
    departments: Department[];
    titles: TitleDef[];
    roleCatalog: RoleCatalogEntry[];
    editable: boolean;
    onClose: () => void;
    onSave: (p: Person) => void;
    onDelete?: () => void;
    onViewProfile?: () => void;
}> = ({ person, people, departments, titles, roleCatalog, editable, onClose, onSave, onDelete, onViewProfile }) => {
    const [d, setD] = useState<PersonDraft>(() => (person ? personToDraft(person) : emptyPersonDraft(departments.length === 1 ? departments[0].code : '')));
    const [roleInput, setRoleInput] = useState('');
    const set = (p: Partial<PersonDraft>) => setD(x => ({ ...x, ...p }));
    const v = validatePerson(d, people, person?.id);
    const catalog = [...new Set<string>(roleCatalog.filter(r => !d.departmentCode || r.departmentCode === d.departmentCode).map(r => r.name))].filter(r => !d.roles.includes(r)).sort((a, b) => a.localeCompare(b, 'tr'));
    const addRole = (r: string) => { const t = r.trim(); if (t && !d.roles.includes(t)) set({ roles: [...d.roles, t] }); setRoleInput(''); };
    const ro = !editable;

    return (
        <Sheet
            wide
            title={person ? fullName(person) : 'Yeni personel'}
            onClose={onClose}
            footer={<>
                {person && editable && onDelete && <button type="button" className="m-btn m-btn-danger" onClick={onDelete}>Sil</button>}
                {person && onViewProfile && <button type="button" className="m-btn m-btn-gray" onClick={onViewProfile}><Icon name="activity" size={16} />Profil</button>}
                <span className="flex-1"></span>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}>{editable ? 'Vazgeç' : 'Kapat'}</button>
                {editable && <button type="button" className="m-btn m-btn-primary" disabled={v.errors.length > 0} onClick={() => onSave(draftToPerson(d, person))}>{person ? 'Kaydet' : 'Ekle'}</button>}
            </>}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ad" htmlFor="dp-first"><input id="dp-first" className="m-input" disabled={ro} autoFocus={!person} value={d.firstName} onChange={e => set({ firstName: e.target.value })} /></Field>
                <Field label="Soyad" htmlFor="dp-last"><input id="dp-last" className="m-input" disabled={ro} value={d.lastName} onChange={e => set({ lastName: e.target.value })} /></Field>
                <Field label="Sicil" htmlFor="dp-sicil"><input id="dp-sicil" className="m-input" disabled={ro} value={d.sicil} placeholder="İsteğe bağlı" onChange={e => set({ sicil: e.target.value })} /></Field>
                <Field label="Kurumsal e-posta" htmlFor="dp-email" hint="Haftalık rapor hatırlatması ve bildirimler için">
                    <input id="dp-email" type="email" className="m-input" disabled={ro} value={d.email} placeholder="ad.soyad@tubitak.gov.tr" onChange={e => set({ email: e.target.value })} />
                </Field>
                <Field label="Bölüm" htmlFor="dp-dept">
                    <select id="dp-dept" className="m-input" disabled={ro} value={d.departmentCode} onChange={e => set({ departmentCode: e.target.value })}>
                        <option value="">Bölüm seçin…</option>
                        {d.departmentCode && !departments.some(x => x.code === d.departmentCode) && <option value={d.departmentCode}>{d.departmentCode}</option>}
                        {departments.map(x => <option key={x.code} value={x.code}>{x.code}{x.name && x.name !== x.code ? ` — ${x.name}` : ''}</option>)}
                    </select>
                </Field>
                <Field label="Ünvan" htmlFor="dp-title" hint={titles.length ? 'Maliyet hesabı için gerekli' : 'Önce Ünvanlar sekmesinden ekleyin'}>
                    <select id="dp-title" className="m-input" disabled={ro} value={d.titleCode} onChange={e => set({ titleCode: e.target.value })}>
                        <option value="">—</option>
                        {d.titleCode && !titles.some(t => t.code === d.titleCode) && <option value={d.titleCode}>{d.titleCode}</option>}
                        {titles.map(t => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
                    </select>
                </Field>
                <Field label="Kullanılabilir AA / ay" htmlFor="dp-aa" hint="1 = tam zamanlı, 0,5 = yarı zamanlı">
                    <input id="dp-aa" type="number" min={0} max={1.5} step={0.05} className="m-input" disabled={ro} value={d.availableAA} onChange={e => set({ availableAA: parseFloat(e.target.value) || 0 })} />
                </Field>
            </div>
            <Field label="Roller" hint="Kapasite–talep analizinde kullanılır">
                <div className="flex flex-col gap-2">
                    {d.roles.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {d.roles.map(r => (
                                <span key={r} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full m-tone-accent text-[14px]">
                                    {r}
                                    {editable && <button type="button" className="m-icon-btn !w-7 !h-7" aria-label={`${r} rolünü kaldır`} onClick={() => set({ roles: d.roles.filter(x => x !== r) })}><Icon name="x" size={14} /></button>}
                                </span>
                            ))}
                        </div>
                    )}
                    {editable && catalog.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {catalog.map(r => <button key={r} type="button" className="inline-flex items-center gap-1 h-8 px-3 rounded-full m-fill-2 border-0 text-[14px] m-text-2 cursor-pointer" onClick={() => addRole(r)}><Icon name="plus" size={14} />{r}</button>)}
                        </div>
                    )}
                    {editable && (
                        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addRole(roleInput); }}>
                            <input aria-label="Özel rol" className="m-input" value={roleInput} placeholder="Özel rol ekle" onChange={e => setRoleInput(e.target.value)} />
                            <button type="submit" className="m-btn m-btn-gray flex-none" disabled={!roleInput.trim()}>Ekle</button>
                        </form>
                    )}
                    {!editable && d.roles.length === 0 && <span className="text-[15px] m-text-3">Rol tanımlanmamış.</span>}
                </div>
            </Field>
            {v.errors.map(e => <p key={e} className="m-0 text-[14px] m-ink-bad">{e}</p>)}
            {v.warnings.map(w => <p key={w} className="m-0 text-[14px] m-ink-warn">{w}</p>)}
        </Sheet>
    );
};

// ---------------------------------------------------------------- bölüm / ünvan / rol formları

const DeptSheet: React.FC<{ dept?: Department; departments: Department[]; people: Person[]; onClose: () => void; onSave: (d: Department) => void; onDelete?: () => void }> = ({ dept, departments, people, onClose, onSave, onDelete }) => {
    const [code, setCode] = useState(dept?.code || '');
    const [name, setName] = useState(dept?.name || '');
    const [lead, setLead] = useState(dept?.leadPersonId || '');
    const err = dept ? null : validateDepartmentCode(code, departments);
    const sorted = [...people].sort((a, b) => fullName(a).localeCompare(fullName(b), 'tr'));
    const save = () => {
        const p = lead ? people.find(x => x.id === lead) : undefined;
        const c = dept?.code || trUpper(code);
        onSave({ code: c, name: name.trim() || c, leadPersonId: p?.id, leadName: p ? fullName(p) : (lead ? dept?.leadName : (dept?.leadPersonId ? undefined : dept?.leadName)) });
    };
    return (
        <Sheet title={dept ? `Bölüm ${dept.code}` : 'Yeni bölüm'} onClose={onClose} footer={<>
            {dept && onDelete && <button type="button" className="m-btn m-btn-danger" onClick={onDelete}>Sil</button>}
            <span className="flex-1"></span>
            <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
            <button type="button" className="m-btn m-btn-primary" disabled={!!err} onClick={save}>{dept ? 'Kaydet' : 'Ekle'}</button>
        </>}>
            {!dept && <Field label="Kod" htmlFor="dd-code" hint="Büyük harfe çevrilir"><input id="dd-code" className="m-input" autoFocus value={code} placeholder="U310" onChange={e => setCode(e.target.value)} /></Field>}
            <Field label="Bölüm adı" htmlFor="dd-name"><input id="dd-name" className="m-input" autoFocus={!!dept} value={name} placeholder="Ör. Yazılım Geliştirme" onChange={e => setName(e.target.value)} /></Field>
            <Field label="Bölüm sorumlusu" htmlFor="dd-lead" hint="Bölüm sorumlusu rolü bu kişinin bölümünü yönetir">
                <select id="dd-lead" className="m-input" value={lead} onChange={e => setLead(e.target.value)}>
                    <option value="">{dept?.leadName && !dept.leadPersonId ? `${dept.leadName} (havuz dışı)` : '—'}</option>
                    {sorted.map(p => <option key={p.id} value={p.id}>{fullName(p)}{p.departmentCode ? ` (${p.departmentCode})` : ''}</option>)}
                </select>
            </Field>
            {err && code && <p className="m-0 text-[14px] m-ink-bad">{err}</p>}
        </Sheet>
    );
};

const TitleSheet: React.FC<{ title?: TitleDef; titles: TitleDef[]; onClose: () => void; onSave: (t: TitleDef) => void; onDelete?: () => void }> = ({ title, titles, onClose, onSave, onDelete }) => {
    const [code, setCode] = useState(title?.code || '');
    const [name, setName] = useState(title?.name || '');
    const [cost, setCost] = useState(title?.monthlyCost ? String(title.monthlyCost) : '');
    const err = title ? null : validateTitleCode(code, titles);
    const save = () => {
        const c = title?.code || trUpper(code);
        const v = parseFloat(cost.replace(/\./g, '').replace(',', '.'));
        onSave({ code: c, name: name.trim() || c, monthlyCost: isNaN(v) || v <= 0 ? undefined : v });
    };
    return (
        <Sheet title={title ? `Ünvan ${title.code}` : 'Yeni ünvan'} onClose={onClose} footer={<>
            {title && onDelete && <button type="button" className="m-btn m-btn-danger" onClick={onDelete}>Sil</button>}
            <span className="flex-1"></span>
            <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
            <button type="button" className="m-btn m-btn-primary" disabled={!!err} onClick={save}>{title ? 'Kaydet' : 'Ekle'}</button>
        </>}>
            {!title && <Field label="Kısaltma" htmlFor="dt-code" hint="Büyük harfe çevrilir"><input id="dt-code" className="m-input" autoFocus value={code} placeholder="ARŞ" onChange={e => setCode(e.target.value)} /></Field>}
            <Field label="Ünvan" htmlFor="dt-name"><input id="dt-name" className="m-input" autoFocus={!!title} value={name} placeholder="Araştırmacı" onChange={e => setName(e.target.value)} /></Field>
            <Field label="Aylık maliyet (₺, 1 AA)" htmlFor="dt-cost" hint="Maliyet ve EVM hesaplarında kullanılır">
                <input id="dt-cost" inputMode="numeric" className="m-input" value={cost} placeholder="Ör. 120000" onChange={e => setCost(e.target.value)} />
            </Field>
            {err && code && <p className="m-0 text-[14px] m-ink-bad">{err}</p>}
        </Sheet>
    );
};

const RoleSheet: React.FC<{ departments: Department[]; roles: RoleCatalogEntry[]; initialDept?: string; onClose: () => void; onSave: (r: RoleCatalogEntry) => void }> = ({ departments, roles, initialDept, onClose, onSave }) => {
    const [dept, setDept] = useState(initialDept || (departments.length === 1 ? departments[0].code : ''));
    const [name, setName] = useState('');
    const err = validateRole(dept, name, roles);
    return (
        <Sheet title="Yeni rol" onClose={onClose} footer={<>
            <span className="flex-1"></span>
            <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
            <button type="button" className="m-btn m-btn-primary" disabled={!!err} onClick={() => onSave({ id: `rolecat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, departmentCode: dept, name: name.trim() })}>Ekle</button>
        </>}>
            <Field label="Bölüm" htmlFor="dr-dept" hint={departments.length ? undefined : 'Önce Bölümler sekmesinden bölüm ekleyin'}>
                <select id="dr-dept" className="m-input" value={dept} onChange={e => setDept(e.target.value)}>
                    <option value="">Bölüm seçin…</option>
                    {departments.map(d => <option key={d.code} value={d.code}>{d.code}{d.name && d.name !== d.code ? ` — ${d.name}` : ''}</option>)}
                </select>
            </Field>
            <Field label="Rol adı" htmlFor="dr-name"><input id="dr-name" className="m-input" autoFocus value={name} placeholder="Ör. Yazılım Geliştirme Mühendisi" onChange={e => setName(e.target.value)} /></Field>
            {err && name && dept && <p className="m-0 text-[14px] m-ink-bad">{err}</p>}
        </Sheet>
    );
};

// ---------------------------------------------------------------- sayfa

export interface ModernDataPoolProps {
    people: Person[];
    departments: Department[];
    roleCatalog: RoleCatalogEntry[];
    titles: TitleDef[];
    currentRole: UserRole;
    onUpdatePeople: (people: Person[]) => void;
    onUpdateDepartments: (departments: Department[]) => void;
    onUpdateRoleCatalog: (roles: RoleCatalogEntry[]) => void;
    onUpdateTitles: (titles: TitleDef[]) => void;
    onApplyImport: (imported: PoolImportResult) => void;
    onViewPerson: (personId: string) => void;
}

const ISSUE_FILTERS: (PersonIssue | 'any')[] = ['any', 'department', 'title', 'cost', 'email'];

const ModernDataPool: React.FC<ModernDataPoolProps> = ({
    people, departments, roleCatalog, titles, currentRole, onUpdatePeople, onUpdateDepartments, onUpdateRoleCatalog, onUpdateTitles, onApplyImport, onViewPerson,
}) => {
    const editable = canEditPool(currentRole);
    const [tab, setTab] = useState<Tab>('people');
    const [query, setQuery] = useState('');
    const [dept, setDept] = useState('all');
    const [issue, setIssue] = useState<PersonIssue | 'any' | null>(null);
    const [notice, setNotice] = useState<Notice>(null);
    const [importing, setImporting] = useState(false);
    const [sheet, setSheet] = useState<
        | { kind: 'person'; person?: Person }
        | { kind: 'dept'; dept?: Department }
        | { kind: 'title'; title?: TitleDef }
        | { kind: 'role'; dept?: string }
        | null
    >(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const counts = useMemo(() => issueCounts(people, departments, titles), [people, departments, titles]);
    const shown = useMemo(() => filterPeople(people, { query, department: dept, issue }, departments, titles), [people, query, dept, issue, departments, titles]);
    const titleName = useMemo(() => new Map(titles.map(t => [t.code, t.name])), [titles]);
    const roleGroups = useMemo(() => rolesByDepartment(roleCatalog, departments), [roleCatalog, departments]);
    const ok = (text: string) => setNotice({ kind: 'ok', text });

    const importFile = async (file: File) => {
        setImporting(true);
        setNotice(null);
        try {
            onApplyImport(await parsePoolWorkbook(file));
            ok('Excel içe aktarıldı.');
        } catch (e) {
            setNotice({ kind: 'error', text: `Excel okunamadı: ${e instanceof Error ? e.message : String(e)}` });
        } finally {
            setImporting(false);
        }
    };

    const savePerson = (p: Person) => {
        const exists = people.some(x => x.id === p.id);
        onUpdatePeople(exists ? people.map(x => (x.id === p.id ? p : x)) : [...people, p]);
        ok(exists ? `${fullName(p)} güncellendi.` : `${fullName(p)} havuza eklendi.`);
        setSheet(null);
    };
    const deletePerson = (p: Person) => {
        if (!window.confirm(`${fullName(p)} havuzdan silinsin mi? Tahsis kayıtları etkilenebilir.`)) return;
        onUpdatePeople(people.filter(x => x.id !== p.id));
        ok(`${fullName(p)} silindi.`);
        setSheet(null);
    };
    const saveDept = (d: Department) => {
        const exists = departments.some(x => x.code === d.code);
        onUpdateDepartments(exists ? departments.map(x => (x.code === d.code ? d : x)) : [...departments, d]);
        ok(exists ? `${d.code} güncellendi.` : `${d.code} bölümü eklendi.`);
        setSheet(null);
    };
    const deleteDept = (d: Department) => {
        const n = people.filter(p => p.departmentCode === d.code).length;
        if (!window.confirm(`${d.code} bölümü silinsin mi?${n ? ` ${n} kişi bu bölümde; bölümsüz kalırlar.` : ''}`)) return;
        onUpdateDepartments(departments.filter(x => x.code !== d.code));
        ok(`${d.code} bölümü silindi.`);
        setSheet(null);
    };
    const saveTitle = (t: TitleDef) => {
        const exists = titles.some(x => x.code === t.code);
        onUpdateTitles(exists ? titles.map(x => (x.code === t.code ? t : x)) : [...titles, t]);
        ok(exists ? `${t.code} güncellendi.` : `${t.code} ünvanı eklendi.`);
        setSheet(null);
    };
    const deleteTitle = (t: TitleDef) => {
        const n = people.filter(p => p.titleCode === t.code).length;
        if (!window.confirm(`${t.code} ünvanı silinsin mi?${n ? ` ${n} kişinin ünvanı boş kalır (maliyet hesabına girmez).` : ''}`)) return;
        onUpdateTitles(titles.filter(x => x.code !== t.code));
        ok(`${t.code} ünvanı silindi.`);
        setSheet(null);
    };

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: 'people', label: 'Personel', count: people.length },
        { key: 'departments', label: 'Bölümler', count: departments.length },
        { key: 'roles', label: 'Roller', count: roleCatalog.length },
        { key: 'titles', label: 'Ünvanlar', count: titles.length },
    ];
    const addLabel: Record<Tab, string> = { people: 'Yeni kişi', departments: 'Yeni bölüm', roles: 'Yeni rol', titles: 'Yeni ünvan' };
    const openAdd = () => setSheet(tab === 'people' ? { kind: 'person' } : tab === 'departments' ? { kind: 'dept' } : tab === 'titles' ? { kind: 'title' } : { kind: 'role' });

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-[70ch]">
                    <h1 className="m-0 text-[34px] leading-tight font-bold tracking-[-0.02em] m-text">Veri havuzu</h1>
                    <p className="m-0 mt-1 text-[15px] m-text-3">Personel, bölüm, rol ve ünvan ana verisi; tahsis, maliyet ve yetkilendirme bu veriye dayanır.</p>
                </div>
                {editable && (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="m-btn m-btn-gray" disabled={importing} onClick={() => fileRef.current?.click()} title="U310 İşgücü Tahsisi formatındaki Excel">
                            <Icon name="upload" size={18} />{importing ? 'Aktarılıyor…' : 'Excel içe aktar'}
                        </button>
                        <button type="button" className="m-btn m-btn-primary" onClick={openAdd}><Icon name="plus" size={18} strokeWidth={2.2} />{addLabel[tab]}</button>
                        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
                    </div>
                )}
            </header>

            {!editable && (
                <div role="status" className="rounded-2xl px-4 py-3 m-tone-accent flex items-center gap-3 text-[15px]">
                    <Icon name="eye" size={18} />
                    Veri havuzunu yalnız PYB Destek düzenler; {ROLE_LABELS[currentRole]} olarak salt okunur görüyorsunuz.
                </div>
            )}
            {notice && (
                <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${notice.kind === 'error' ? 'm-tone-bad' : 'm-tone-ok'}`}>
                    <span className="flex-1 text-[15px]">{notice.text}</span>
                    <button type="button" className="m-icon-btn" aria-label="Kapat" onClick={() => setNotice(null)}><Icon name="x" size={18} /></button>
                </div>
            )}

            <div className="m-segmented self-start" role="group" aria-label="Veri türü">
                {TABS.map(t => <button key={t.key} type="button" className="m-segment" aria-pressed={tab === t.key} onClick={() => { setTab(t.key); setNotice(null); }}>{t.label}<span className="m-text-3 m-tabular">{t.count}</span></button>)}
            </div>

            {tab === 'people' && (
                <>
                    {counts.any > 0 && (
                        <section aria-label="Eksik bilgiler" className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] m-text-2 mr-1">Eksik bilgi:</span>
                            {ISSUE_FILTERS.map(k => {
                                const n = counts[k];
                                if (!n) return null;
                                const active = issue === k;
                                return (
                                    <button key={k} type="button" aria-pressed={active} className={`m-pill !min-h-[36px] ${active ? 'is-active' : ''}`} onClick={() => setIssue(active ? null : k)}>
                                        {k === 'any' ? 'Tümü' : PERSON_ISSUE_LABELS[k]}<span className="m-tabular m-text-3">{n}</span>
                                    </button>
                                );
                            })}
                        </section>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <select aria-label="Bölüm" className={`m-pill ${dept !== 'all' ? 'is-active' : ''}`} value={dept} onChange={e => setDept(e.target.value)}>
                            <option value="all">Tüm bölümler</option>
                            {departments.map(d => <option key={d.code} value={d.code}>{d.code}{d.name && d.name !== d.code ? ` — ${d.name}` : ''}</option>)}
                        </select>
                        <label className="m-search flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] m-text-3 ml-auto">
                            <Icon name="search" size={16} />
                            <input aria-label="Personelde ara" className="bg-transparent border-0 outline-none text-[15px] m-text w-52" placeholder="Ad, sicil, e-posta, rol" value={query} onChange={e => setQuery(e.target.value)} />
                        </label>
                    </div>
                    {shown.length === 0 ? (
                        <div className="m-surface rounded-2xl"><Empty text={people.length ? 'Bu süzgeçte kişi yok.' : 'Henüz personel yok. Yeni kişi ekleyin ya da Excel içe aktarın.'} /></div>
                    ) : (
                        <div className="m-surface rounded-2xl p-1.5">
                            {shown.map((p, i) => {
                                const sep = rowSep(i);
                                const iss = personIssues(p, departments, titles);
                                return (
                                    <button key={p.id} type="button" onClick={() => setSheet({ kind: 'person', person: p })} className={`m-row-link flex items-center gap-3 px-3 py-2.5 min-h-[64px] ${sep.className}`} style={sep.style}>
                                        <span aria-hidden="true" className="w-10 h-10 rounded-full m-fill flex items-center justify-center text-[13px] font-semibold m-text-2 flex-none">{initialsOf(fullName(p))}</span>
                                        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                            <span className="text-[16px] font-semibold m-text truncate">{fullName(p)}</span>
                                            <span className="text-[13px] m-text-3 truncate">
                                                {[p.departmentCode || 'Bölüm yok', p.titleCode ? titleName.get(p.titleCode) || p.titleCode : '', p.sicil ? `Sicil ${p.sicil}` : '', p.email || ''].filter(Boolean).join(' · ')}
                                            </span>
                                        </span>
                                        <span className="hidden md:flex items-center gap-1.5 max-w-[40%] overflow-hidden">
                                            {p.roles.slice(0, 2).map(r => <Pill key={r} tone="m-fill-2 m-text-2">{r}</Pill>)}
                                            {p.roles.length > 2 && <span className="text-[13px] m-text-3">+{p.roles.length - 2}</span>}
                                        </span>
                                        {iss.length > 0 && <span className="hidden sm:inline-flex"><Pill tone={iss.includes('department') || iss.includes('title') ? 'm-tone-warn' : 'm-tone-hold'}>{PERSON_ISSUE_LABELS[iss[0]]}{iss.length > 1 ? ` +${iss.length - 1}` : ''}</Pill></span>}
                                        <span className="text-[14px] m-text-2 m-tabular w-14 text-right" title="Kullanılabilir AA / ay">{fmtAA(p.availableAA)} AA</span>
                                        <span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {tab === 'departments' && (
                departments.length === 0 ? <div className="m-surface rounded-2xl"><Empty text="Henüz bölüm yok." /></div> : (
                    <div className="m-surface rounded-2xl p-1.5">
                        {[...departments].sort((a, b) => a.code.localeCompare(b.code, 'tr')).map((d, i) => {
                            const sep = rowSep(i);
                            const n = people.filter(p => p.departmentCode === d.code).length;
                            const lead = d.leadPersonId ? people.find(p => p.id === d.leadPersonId) : undefined;
                            const body = (
                                <>
                                    <span className="w-14 flex-none text-[15px] font-bold m-text">{d.code}</span>
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[16px] m-text truncate">{d.name || d.code}</span>
                                        <span className="text-[13px] m-text-3 truncate">Bölüm sorumlusu: {lead ? fullName(lead) : d.leadName ? `${d.leadName} (havuz dışı)` : 'atanmadı'}</span>
                                    </span>
                                    <span className="text-[14px] m-text-2 m-tabular">{n} kişi</span>
                                </>
                            );
                            return editable ? (
                                <button key={d.code} type="button" onClick={() => setSheet({ kind: 'dept', dept: d })} className={`m-row-link flex items-center gap-3 px-3 py-2.5 min-h-[60px] ${sep.className}`} style={sep.style}>
                                    {body}<span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                                </button>
                            ) : <div key={d.code} className={`flex items-center gap-3 px-3 py-2.5 min-h-[60px] ${sep.className}`} style={sep.style}>{body}</div>;
                        })}
                    </div>
                )
            )}

            {tab === 'roles' && (
                roleGroups.length === 0 ? <div className="m-surface rounded-2xl"><Empty text="Henüz rol tanımlanmamış." /></div> : roleGroups.map(g => (
                    <section key={g.code} aria-label={g.name} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <h2 className="m-0 text-[15px] font-semibold m-text-2">{g.code}{g.name !== g.code ? ` — ${g.name}` : ''} <span className="m-text-3 font-normal m-tabular">{g.roles.length}</span></h2>
                            {editable && <button type="button" className="m-btn m-btn-plain !min-h-[34px] !px-2 text-[14px] ml-auto" onClick={() => setSheet({ kind: 'role', dept: g.code })}><Icon name="plus" size={15} />Rol ekle</button>}
                        </div>
                        <div className="m-surface rounded-2xl p-1.5">
                            {g.roles.map((r, i) => {
                                const sep = rowSep(i);
                                const n = people.filter(p => p.roles.includes(r.name)).length;
                                return (
                                    <div key={r.id} className={`flex items-center gap-3 px-3 py-2 min-h-[52px] ${sep.className}`} style={sep.style}>
                                        <span className="flex-1 min-w-0 text-[15px] m-text">{r.name}</span>
                                        <span className="text-[14px] m-text-3 m-tabular">{n} kişi</span>
                                        {editable && <button type="button" className="m-icon-btn" aria-label={`${r.name} rolünü sil`} onClick={() => { if (window.confirm(`"${r.name}" rolü katalogdan silinsin mi?`)) onUpdateRoleCatalog(roleCatalog.filter(x => x.id !== r.id)); }}><Icon name="trash" size={17} /></button>}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}

            {tab === 'titles' && (
                titles.length === 0 ? <div className="m-surface rounded-2xl"><Empty text="Henüz ünvan yok." /></div> : (
                    <div className="m-surface rounded-2xl p-1.5">
                        {[...titles].sort((a, b) => a.code.localeCompare(b.code, 'tr')).map((t, i) => {
                            const sep = rowSep(i);
                            const n = people.filter(p => p.titleCode === t.code).length;
                            const body = (
                                <>
                                    <span className="w-14 flex-none text-[15px] font-bold m-text">{t.code}</span>
                                    <span className="flex-1 min-w-0 text-[16px] m-text truncate">{t.name}</span>
                                    {!t.monthlyCost && <Pill tone="m-tone-warn">Maliyet yok</Pill>}
                                    <span className="text-[14px] m-text-2 m-tabular w-32 text-right">{fmtMoney(t.monthlyCost)}</span>
                                    <span className="text-[14px] m-text-3 m-tabular w-16 text-right">{n} kişi</span>
                                </>
                            );
                            return editable ? (
                                <button key={t.code} type="button" onClick={() => setSheet({ kind: 'title', title: t })} className={`m-row-link flex items-center gap-3 px-3 py-2.5 min-h-[56px] ${sep.className}`} style={sep.style}>
                                    {body}<span style={{ color: 'var(--m-chevron)' }}><Icon name="chevronRight" size={16} strokeWidth={2.2} /></span>
                                </button>
                            ) : <div key={t.code} className={`flex items-center gap-3 px-3 py-2.5 min-h-[56px] ${sep.className}`} style={sep.style}>{body}</div>;
                        })}
                    </div>
                )
            )}

            {sheet?.kind === 'person' && (
                <PersonSheet
                    person={sheet.person}
                    people={people}
                    departments={departments}
                    titles={titles}
                    roleCatalog={roleCatalog}
                    editable={editable}
                    onClose={() => setSheet(null)}
                    onSave={savePerson}
                    onDelete={sheet.person ? () => deletePerson(sheet.person!) : undefined}
                    onViewProfile={sheet.person ? () => { const id = sheet.person!.id; setSheet(null); onViewPerson(id); } : undefined}
                />
            )}
            {sheet?.kind === 'dept' && editable && <DeptSheet dept={sheet.dept} departments={departments} people={people} onClose={() => setSheet(null)} onSave={saveDept} onDelete={sheet.dept ? () => deleteDept(sheet.dept!) : undefined} />}
            {sheet?.kind === 'title' && editable && <TitleSheet title={sheet.title} titles={titles} onClose={() => setSheet(null)} onSave={saveTitle} onDelete={sheet.title ? () => deleteTitle(sheet.title!) : undefined} />}
            {sheet?.kind === 'role' && editable && (
                <RoleSheet departments={departments} roles={roleCatalog} initialDept={sheet.dept} onClose={() => setSheet(null)} onSave={(r: RoleCatalogEntry) => { onUpdateRoleCatalog([...roleCatalog, r]); ok(`"${r.name}" rolü eklendi.`); setSheet(null); }} />
            )}
        </div>
    );
};

export default ModernDataPool;
