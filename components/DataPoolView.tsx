import React, { useMemo, useRef, useState } from 'react';
import { Department, Person, RoleCatalogEntry, TitleDef, UserRole } from '../types';
import { canEditPool, ROLE_LABELS } from '../utils/allocations';
import { parsePoolWorkbook, PoolImportResult } from '../utils/poolImporter';

interface DataPoolViewProps {
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

type PoolTab = 'people' | 'departments' | 'roles' | 'titles';
type Feedback = { kind: 'error' | 'success'; text: string } | null;

const inputCls = 'w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-gray-800';
const cardInputCls = 'w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary';
const thCls = 'px-3 py-2 text-left text-[11px] font-semibold text-gray-400 whitespace-nowrap';
const tdCls = 'px-3 py-1.5 align-middle';

const trNorm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
const trUpper = (s: string): string => s.trim().toLocaleUpperCase('tr-TR');
const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const TabButton: React.FC<{ active: boolean; icon: string; label: string; count: number; onClick: () => void }> = ({ active, icon, label, count, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${active ? 'text-white shadow-md' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800'}`}
    style={active ? { backgroundColor: 'var(--app-primary)' } : {}}
  >
    <i className={`fa-solid ${icon}`}></i>
    <span>{label}</span>
    <span className={`px-1.5 py-0.5 rounded-md text-xs ${active ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>{count}</span>
  </button>
);

const AddCard: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-gray-50/70 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-5">
    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-200 mb-3 flex items-center gap-2">
      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-white flex-none" style={{ backgroundColor: 'var(--app-primary)' }}>
        <i className={`fa-solid ${icon} text-[10px]`}></i>
      </span>
      {title}
    </h4>
    {children}
  </div>
);

const Field: React.FC<{ label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }> = ({ label, required, hint, className, children }) => (
  <div className={className}>
    <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-300 mb-1">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-[10px] text-gray-400 mt-1 leading-snug">{hint}</p>}
  </div>
);

const AddButton: React.FC<{ onClick: () => void; label: string; icon?: string }> = ({ onClick, label, icon = 'fa-plus' }) => (
  <button onClick={onClick} className="text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center" style={{ backgroundColor: 'var(--app-primary)' }}>
    <i className={`fa-solid ${icon} mr-2`}></i>{label}
  </button>
);

const DataPoolView: React.FC<DataPoolViewProps> = ({ people, departments, roleCatalog, titles, currentRole, onUpdatePeople, onUpdateDepartments, onUpdateRoleCatalog, onUpdateTitles, onApplyImport, onViewPerson }) => {
  const [tab, setTab] = useState<PoolTab>('people');
  const [isImporting, setIsImporting] = useState(false);
  const [deptFilter, setDeptFilter] = useState('all');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const editable = canEditPool(currentRole);

  const [newPerson, setNewPerson] = useState<{ firstName: string; lastName: string; sicil: string; departmentCode: string; titleCode: string; availableAA: number; roles: string[] }>(
    { firstName: '', lastName: '', sicil: '', departmentCode: '', titleCode: '', availableAA: 1, roles: [] }
  );
  const [customRole, setCustomRole] = useState('');
  const [newDept, setNewDept] = useState({ code: '', name: '', leadPersonId: '' });
  const [newRole, setNewRole] = useState({ departmentCode: '', name: '' });
  const [newTitle, setNewTitle] = useState({ code: '', name: '', monthlyCost: '' });

  const deptCodes = useMemo(() => departments.map(d => d.code), [departments]);
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')),
    [people]
  );
  const filteredPeople = useMemo(
    () => (deptFilter === 'all' ? people : people.filter(p => p.departmentCode === deptFilter)),
    [people, deptFilter]
  );

  const flash = (kind: 'error' | 'success', text: string) => {
    window.clearTimeout(flashTimer.current);
    setFeedback({ kind, text });
    if (kind === 'success') flashTimer.current = window.setTimeout(() => setFeedback(null), 2600);
  };
  const switchTab = (t: PoolTab) => { setFeedback(null); setTab(t); };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const imported = await parsePoolWorkbook(file);
      onApplyImport(imported);
    } catch (err) {
      alert(`Excel okunamadı: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updatePerson = (id: string, patch: Partial<Person>) =>
    onUpdatePeople(people.map(p => (p.id === id ? { ...p, ...patch } : p)));

  // ---- Personel ekle ----
  const dupPerson = useMemo(() => {
    const first = newPerson.firstName.trim(), last = newPerson.lastName.trim();
    if (!first || !last) return false;
    const key = trNorm(`${first} ${last}`);
    return people.some(p => trNorm(`${p.firstName} ${p.lastName}`) === key);
  }, [newPerson.firstName, newPerson.lastName, people]);

  const availableCatalogRoles = useMemo(() => {
    const names = roleCatalog
      .filter(r => !newPerson.departmentCode || r.departmentCode === newPerson.departmentCode)
      .map(r => r.name);
    return Array.from(new Set<string>(names)).filter(n => !newPerson.roles.includes(n)).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [roleCatalog, newPerson.departmentCode, newPerson.roles]);

  const addCustomRole = () => {
    const r = customRole.trim();
    if (!r) return;
    if (!newPerson.roles.includes(r)) setNewPerson({ ...newPerson, roles: [...newPerson.roles, r] });
    setCustomRole('');
  };

  const addPerson = () => {
    const first = newPerson.firstName.trim();
    const last = newPerson.lastName.trim();
    if (!first || !last) { flash('error', 'Ad ve soyad zorunludur.'); return; }
    onUpdatePeople([...people, {
      id: newId('person'),
      firstName: first,
      lastName: last,
      sicil: newPerson.sicil.trim() || undefined,
      departmentCode: newPerson.departmentCode || '',
      titleCode: newPerson.titleCode || undefined,
      availableAA: newPerson.availableAA || 1,
      roles: newPerson.roles,
    }]);
    flash('success', `${first} ${last} havuza eklendi.`);
    // Bölümü koru → aynı bölüme peş peşe ekleme hızlansın
    setNewPerson({ firstName: '', lastName: '', sicil: '', departmentCode: newPerson.departmentCode, titleCode: '', availableAA: 1, roles: [] });
    setCustomRole('');
  };

  // ---- Bölüm ekle / düzenle ----
  const addDept = () => {
    const code = trUpper(newDept.code);
    if (!code) { flash('error', 'Bölüm kodu zorunludur (örn. U310).'); return; }
    if (departments.some(d => trUpper(d.code) === code)) { flash('error', `"${code}" bölüm kodu zaten var.`); return; }
    const lead = newDept.leadPersonId ? people.find(p => p.id === newDept.leadPersonId) : undefined;
    onUpdateDepartments([...departments, {
      code,
      name: newDept.name.trim() || code,
      leadPersonId: lead?.id,
      leadName: lead ? `${lead.firstName} ${lead.lastName}`.trim() : undefined,
    }]);
    flash('success', `"${code}" bölümü eklendi.`);
    setNewDept({ code: '', name: '', leadPersonId: '' });
  };

  const setDeptLead = (code: string, personId: string) => {
    const p = personId ? people.find(x => x.id === personId) : undefined;
    onUpdateDepartments(departments.map(d => d.code === code ? {
      ...d,
      leadPersonId: personId || undefined,
      leadName: p ? `${p.firstName} ${p.lastName}`.trim() : (personId ? d.leadName : undefined),
    } : d));
  };

  // ---- Rol ekle ----
  const addRole = () => {
    if (!newRole.departmentCode) { flash('error', departments.length ? 'Bir bölüm seçin.' : 'Önce Bölümler sekmesinden bölüm ekleyin.'); return; }
    const name = newRole.name.trim();
    if (!name) { flash('error', 'Rol adı zorunludur.'); return; }
    if (roleCatalog.some(r => r.departmentCode === newRole.departmentCode && trNorm(r.name) === trNorm(name))) {
      flash('error', 'Bu bölümde aynı rol zaten tanımlı.'); return;
    }
    onUpdateRoleCatalog([...roleCatalog, { id: newId('rolecat'), departmentCode: newRole.departmentCode, name }]);
    flash('success', `"${name}" rolü eklendi.`);
    setNewRole({ departmentCode: newRole.departmentCode, name: '' });
  };

  // ---- Ünvan ekle ----
  const addTitle = () => {
    const code = trUpper(newTitle.code);
    if (!code) { flash('error', 'Ünvan kısaltması zorunludur (örn. ARŞ).'); return; }
    if (titles.some(t => trUpper(t.code) === code)) { flash('error', `"${code}" ünvanı zaten var.`); return; }
    const cost = parseFloat(newTitle.monthlyCost);
    onUpdateTitles([...titles, { code, name: newTitle.name.trim() || code, monthlyCost: isNaN(cost) || cost <= 0 ? undefined : cost }]);
    flash('success', `"${code}" ünvanı eklendi.`);
    setNewTitle({ code: '', name: '', monthlyCost: '' });
  };

  const onEnter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

  // ------------------------------------------------------------------ Personel
  const renderPeople = () => (
    <div>
      {editable && (
        <AddCard icon="fa-user-plus" title="Yeni Personel Ekle">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Ad" required>
              <input className={cardInputCls} placeholder="örn. Ali" value={newPerson.firstName} onChange={e => setNewPerson({ ...newPerson, firstName: e.target.value })} onKeyDown={onEnter(addPerson)} />
            </Field>
            <Field label="Soyad" required>
              <input className={cardInputCls} placeholder="örn. Veli" value={newPerson.lastName} onChange={e => setNewPerson({ ...newPerson, lastName: e.target.value })} onKeyDown={onEnter(addPerson)} />
            </Field>
            <Field label="Sicil">
              <input className={cardInputCls} placeholder="opsiyonel" value={newPerson.sicil} onChange={e => setNewPerson({ ...newPerson, sicil: e.target.value })} onKeyDown={onEnter(addPerson)} />
            </Field>
            <Field label="Bölüm" hint={deptCodes.length === 0 ? 'Bölüm yok — Bölümler sekmesinden ekleyin (şimdilik boş bırakabilirsiniz)' : undefined}>
              <select className={cardInputCls} value={newPerson.departmentCode} onChange={e => setNewPerson({ ...newPerson, departmentCode: e.target.value, roles: [] })}>
                <option value="">Bölüm seçin…</option>
                {departments.map(d => <option key={d.code} value={d.code}>{d.code}{d.name && d.name !== d.code ? ` — ${d.name}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Ünvan" hint={titles.length === 0 ? 'Ünvan yok — Ünvanlar sekmesinden ekleyin (maliyet için gerekli)' : undefined}>
              <select className={cardInputCls} value={newPerson.titleCode} onChange={e => setNewPerson({ ...newPerson, titleCode: e.target.value })}>
                <option value="">Ünvan seçin…</option>
                {titles.map(t => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
              </select>
            </Field>
            <Field label="Kullanılabilir AA / ay" hint="1 = tam zamanlı, 0,5 = yarı zamanlı">
              <input type="number" min={0} max={1.5} step={0.05} className={cardInputCls} value={newPerson.availableAA} onChange={e => setNewPerson({ ...newPerson, availableAA: parseFloat(e.target.value) || 0 })} />
            </Field>
            <Field label="Roller" className="sm:col-span-2 md:col-span-3" hint="Kişinin üstlenebileceği roller — kapasite-talep analizinde kullanılır">
              <div className="space-y-2">
                {newPerson.roles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {newPerson.roles.map(r => (
                      <span key={r} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg text-white" style={{ backgroundColor: 'var(--app-primary)' }}>
                        {r}
                        <button onClick={() => setNewPerson({ ...newPerson, roles: newPerson.roles.filter(x => x !== r) })} className="hover:opacity-70" title="Kaldır"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                      </span>
                    ))}
                  </div>
                )}
                {availableCatalogRoles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {availableCatalogRoles.map(r => (
                      <button key={r} onClick={() => setNewPerson({ ...newPerson, roles: [...newPerson.roles, r] })} className="text-[11px] font-medium px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:border-primary hover:text-primary transition-colors">
                        <i className="fa-solid fa-plus text-[9px] mr-1"></i>{r}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 max-w-md">
                  <input value={customRole} onChange={e => setCustomRole(e.target.value)} onKeyDown={onEnter(addCustomRole)} placeholder="Özel rol ekle ve Enter…" className={cardInputCls} />
                  <button onClick={addCustomRole} className="text-[11px] font-semibold px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-primary flex-none">Ekle</button>
                </div>
              </div>
            </Field>
          </div>
          {dupPerson && (
            <p className="text-[11px] text-amber-600 dark:text-amber-300 mt-3"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Aynı adlı bir kişi zaten havuzda var — yine de ekleyebilirsiniz (sicil ile ayırt edin).</p>
          )}
          <div className="flex justify-end mt-3">
            <AddButton onClick={addPerson} label="Personel Ekle" icon="fa-user-plus" />
          </div>
        </AddCard>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0">
            <tr>
              <th className={thCls}>Ad</th><th className={thCls}>Soyad</th><th className={thCls}>Sicil</th>
              <th className={thCls}>Bölüm</th><th className={thCls}>Ünvan</th>
              <th className={thCls}>Kullanılabilir AA</th><th className={thCls}>Roller (virgülle)</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {filteredPeople.map(p => (
              <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
                <td className={tdCls}><input disabled={!editable} className={inputCls} value={p.firstName} onChange={e => updatePerson(p.id, { firstName: e.target.value })} /></td>
                <td className={tdCls}><input disabled={!editable} className={inputCls} value={p.lastName} onChange={e => updatePerson(p.id, { lastName: e.target.value })} /></td>
                <td className={tdCls}><input disabled={!editable} className={inputCls} value={p.sicil || ''} onChange={e => updatePerson(p.id, { sicil: e.target.value || undefined })} /></td>
                <td className={tdCls}>
                  <select disabled={!editable} className={inputCls} value={p.departmentCode} onChange={e => updatePerson(p.id, { departmentCode: e.target.value })}>
                    {!deptCodes.includes(p.departmentCode) && <option value={p.departmentCode}>{p.departmentCode || '—'}</option>}
                    {deptCodes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className={tdCls}>
                  <select disabled={!editable} className={inputCls} value={p.titleCode || ''} onChange={e => updatePerson(p.id, { titleCode: e.target.value || undefined })}>
                    <option value="">—</option>
                    {p.titleCode && !titles.some(t => t.code === p.titleCode) && <option value={p.titleCode}>{p.titleCode}</option>}
                    {titles.map(t => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
                  </select>
                </td>
                <td className={tdCls}><input disabled={!editable} type="number" min={0} max={1.5} step={0.05} className={`${inputCls} w-20`} value={p.availableAA} onChange={e => updatePerson(p.id, { availableAA: parseFloat(e.target.value) || 0 })} /></td>
                <td className={tdCls}><input disabled={!editable} className={inputCls} value={p.roles.join(', ')} onChange={e => updatePerson(p.id, { roles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></td>
                <td className={tdCls}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onViewPerson(p.id)} className="w-7 h-7 rounded-lg text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" title="Kişi profili (tüm projelerdeki durumu)">
                      <i className="fa-solid fa-chart-line text-xs"></i>
                    </button>
                    {editable && (
                      <button onClick={() => { if (window.confirm(`${p.firstName} ${p.lastName} havuzdan silinsin mi? (Tahsis kayıtları etkilenebilir)`)) { onUpdatePeople(people.filter(x => x.id !== p.id)); flash('success', `${p.firstName} ${p.lastName} silindi.`); } }} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Havuzdan sil">
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPeople.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-8">
            {deptFilter === 'all' ? 'Henüz personel yok. Yukarıdan ekleyin veya Excel içe aktarın.' : 'Bu bölümde personel yok.'}
          </p>
        )}
      </div>
    </div>
  );

  // ------------------------------------------------------------------ Bölümler
  const renderDepartments = () => (
    <div className="max-w-3xl">
      {editable && (
        <AddCard icon="fa-building" title="Yeni Bölüm Ekle">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Kod" required hint="Otomatik büyük harfe çevrilir">
              <input className={cardInputCls} placeholder="U310" value={newDept.code} onChange={e => setNewDept({ ...newDept, code: e.target.value })} onKeyDown={onEnter(addDept)} />
            </Field>
            <Field label="Bölüm Adı">
              <input className={cardInputCls} placeholder="örn. Yazılım" value={newDept.name} onChange={e => setNewDept({ ...newDept, name: e.target.value })} onKeyDown={onEnter(addDept)} />
            </Field>
            <Field label="Bölüm Sorumlusu" hint={people.length === 0 ? 'Önce personel ekleyin (sonra da atanabilir)' : 'Havuzdan seçin'}>
              <select className={cardInputCls} value={newDept.leadPersonId} onChange={e => setNewDept({ ...newDept, leadPersonId: e.target.value })}>
                <option value="">— (sonra atanabilir)</option>
                {sortedPeople.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end mt-3">
            <AddButton onClick={addDept} label="Bölüm Ekle" icon="fa-building" />
          </div>
        </AddCard>
      )}

      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr><th className={thCls}>Kod</th><th className={thCls}>Ad</th><th className={thCls}>Bölüm Sorumlusu</th><th className={thCls}>Personel</th>{editable && <th className={thCls}></th>}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {departments.map(d => (
            <tr key={d.code} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
              <td className={`${tdCls} text-[11px] font-semibold text-gray-700 dark:text-gray-200`}>{d.code}</td>
              <td className={tdCls}><input disabled={!editable} className={inputCls} value={d.name} onChange={e => onUpdateDepartments(departments.map(x => x.code === d.code ? { ...x, name: e.target.value } : x))} /></td>
              <td className={tdCls}>
                <select disabled={!editable} className={inputCls} value={d.leadPersonId || ''} onChange={e => setDeptLead(d.code, e.target.value)}>
                  <option value="">{d.leadName && !d.leadPersonId ? `${d.leadName} (havuz dışı)` : '—'}</option>
                  {sortedPeople.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                </select>
              </td>
              <td className={`${tdCls} text-[11px] text-gray-400`}>{people.filter(p => p.departmentCode === d.code).length} kişi</td>
              {editable && (
                <td className={tdCls}>
                  <button onClick={() => { if (window.confirm(`${d.code} bölümü silinsin mi?`)) { onUpdateDepartments(departments.filter(x => x.code !== d.code)); flash('success', `${d.code} bölümü silindi.`); } }} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash text-xs"></i></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {departments.length === 0 && <p className="text-center text-gray-400 text-xs py-8">Henüz bölüm yok. Yukarıdan ekleyin.</p>}
    </div>
  );

  // ------------------------------------------------------------------ Rol Kataloğu
  const renderRoles = () => (
    <div className="max-w-3xl">
      {editable && (
        <AddCard icon="fa-id-badge" title="Yeni Rol Ekle">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Bölüm" required hint={departments.length === 0 ? 'Önce Bölümler sekmesinden bölüm ekleyin' : undefined}>
              <select className={cardInputCls} value={newRole.departmentCode} onChange={e => setNewRole({ ...newRole, departmentCode: e.target.value })}>
                <option value="">Bölüm seçin…</option>
                {departments.map(d => <option key={d.code} value={d.code}>{d.code}{d.name && d.name !== d.code ? ` — ${d.name}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Rol Adı" required>
              <input className={cardInputCls} placeholder="örn. Yazılım Geliştirme Mühendisi" value={newRole.name} onChange={e => setNewRole({ ...newRole, name: e.target.value })} onKeyDown={onEnter(addRole)} />
            </Field>
          </div>
          <div className="flex justify-end mt-3">
            <AddButton onClick={addRole} label="Rol Ekle" icon="fa-id-badge" />
          </div>
        </AddCard>
      )}

      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr><th className={thCls}>Bölüm</th><th className={thCls}>Rol</th><th className={thCls}>Bu Roldeki Personel</th>{editable && <th className={thCls}></th>}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {roleCatalog.map(r => (
            <tr key={r.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
              <td className={`${tdCls} text-[11px] font-semibold text-gray-500`}>{r.departmentCode}</td>
              <td className={`${tdCls} text-[11px] text-gray-700 dark:text-gray-200`}>{r.name}</td>
              <td className={`${tdCls} text-[11px] text-gray-400`}>{people.filter(p => p.roles.includes(r.name)).length}</td>
              {editable && (
                <td className={tdCls}>
                  <button onClick={() => onUpdateRoleCatalog(roleCatalog.filter(x => x.id !== r.id))} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash text-xs"></i></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {roleCatalog.length === 0 && <p className="text-center text-gray-400 text-xs py-8">Henüz rol yok. Yukarıdan ekleyin.</p>}
    </div>
  );

  // ------------------------------------------------------------------ Ünvanlar
  const renderTitles = () => (
    <div className="max-w-2xl">
      {editable && (
        <AddCard icon="fa-graduation-cap" title="Yeni Ünvan Ekle">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Kısaltma" required hint="Otomatik büyük harfe çevrilir">
              <input className={cardInputCls} placeholder="ARŞ" value={newTitle.code} onChange={e => setNewTitle({ ...newTitle, code: e.target.value })} onKeyDown={onEnter(addTitle)} />
            </Field>
            <Field label="Ünvan">
              <input className={cardInputCls} placeholder="Araştırmacı" value={newTitle.name} onChange={e => setNewTitle({ ...newTitle, name: e.target.value })} onKeyDown={onEnter(addTitle)} />
            </Field>
            <Field label="Aylık Maliyet (₺, 1 AA)" hint="Maliyet katmanı için — opsiyonel">
              <input type="number" min={0} step={1000} className={cardInputCls} placeholder="örn. 120000" value={newTitle.monthlyCost} onChange={e => setNewTitle({ ...newTitle, monthlyCost: e.target.value })} onKeyDown={onEnter(addTitle)} />
            </Field>
          </div>
          <div className="flex justify-end mt-3">
            <AddButton onClick={addTitle} label="Ünvan Ekle" icon="fa-graduation-cap" />
          </div>
        </AddCard>
      )}

      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr><th className={thCls}>Kısaltma</th><th className={thCls}>Ünvan</th><th className={thCls}>Aylık Maliyet (₺, 1 AA)</th><th className={thCls}>Personel</th>{editable && <th className={thCls}></th>}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {titles.map(t => (
            <tr key={t.code} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
              <td className={`${tdCls} text-[11px] font-semibold text-gray-700 dark:text-gray-200`}>{t.code}</td>
              <td className={tdCls}><input disabled={!editable} className={inputCls} value={t.name} onChange={e => onUpdateTitles(titles.map(x => x.code === t.code ? { ...x, name: e.target.value } : x))} /></td>
              <td className={tdCls}>
                <input
                  disabled={!editable}
                  type="number" min={0} step={1000}
                  className={`${inputCls} w-32`}
                  placeholder="—"
                  value={t.monthlyCost ?? ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    onUpdateTitles(titles.map(x => x.code === t.code ? { ...x, monthlyCost: isNaN(v) || v <= 0 ? undefined : v } : x));
                  }}
                />
              </td>
              <td className={`${tdCls} text-[11px] text-gray-400`}>{people.filter(p => p.titleCode === t.code).length}</td>
              {editable && (
                <td className={tdCls}>
                  <button onClick={() => onUpdateTitles(titles.filter(x => x.code !== t.code))} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash text-xs"></i></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {titles.length === 0 && <p className="text-center text-gray-400 text-xs py-8">Henüz ünvan yok. Yukarıdan ekleyin.</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white tracking-tight">Veri Havuzu</h2>
          <p className="text-gray-400 text-xs font-semibold tracking-[0.2em]">Personel · Bölüm · Rol · Ünvan Master Verisi</p>
        </div>
        <div className="flex items-center space-x-2">
          {tab === 'people' && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className={`${inputCls} w-auto`}>
              <option value="all">Tüm Bölümler</option>
              {deptCodes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={handleImport} />
          <button
            onClick={() => editable && fileRef.current?.click()}
            disabled={!editable || isImporting}
            className="text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-40 flex items-center"
            style={{ backgroundColor: 'var(--app-primary)' }}
            title="U310 İşgücü Tahsisi formatındaki Excel'i içe aktar"
          >
            {isImporting ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : <i className="fa-solid fa-file-excel mr-2"></i>}
            Excel İçe Aktar
          </button>
        </div>
      </div>

      {!editable && (
        <div className="flex items-center space-x-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3">
          <i className="fa-solid fa-lock text-amber-500"></i>
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Veri havuzunu yalnızca <b>PYB Destek</b> rolü düzenleyebilir. Şu anki rolünüz: <b>{ROLE_LABELS[currentRole]}</b> (salt-okunur görünüm).
          </p>
        </div>
      )}

      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        <TabButton active={tab === 'people'} icon="fa-users" label="Personel" count={people.length} onClick={() => switchTab('people')} />
        <TabButton active={tab === 'departments'} icon="fa-building" label="Bölümler" count={departments.length} onClick={() => switchTab('departments')} />
        <TabButton active={tab === 'roles'} icon="fa-id-badge" label="Rol Kataloğu" count={roleCatalog.length} onClick={() => switchTab('roles')} />
        <TabButton active={tab === 'titles'} icon="fa-graduation-cap" label="Ünvanlar" count={titles.length} onClick={() => switchTab('titles')} />
      </div>

      {feedback && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[11px] font-semibold ${feedback.kind === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
          <i className={`fa-solid ${feedback.kind === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`}></i>
          {feedback.text}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 overflow-hidden">
        {tab === 'people' && renderPeople()}
        {tab === 'departments' && renderDepartments()}
        {tab === 'roles' && renderRoles()}
        {tab === 'titles' && renderTitles()}
      </div>
    </div>
  );
};

export default DataPoolView;
