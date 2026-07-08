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
}

type PoolTab = 'people' | 'departments' | 'roles' | 'titles';

const inputCls = 'w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none focus:border-primary disabled:opacity-50 disabled:bg-gray-50 dark:disabled:bg-gray-800';
const thCls = 'px-3 py-2 text-left text-[8px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap';
const tdCls = 'px-3 py-1.5 align-middle';

const TabButton: React.FC<{ active: boolean; icon: string; label: string; count: number; onClick: () => void }> = ({ active, icon, label, count, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${active ? 'text-white shadow-md' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800'}`}
    style={active ? { backgroundColor: 'var(--app-primary)' } : {}}
  >
    <i className={`fa-solid ${icon}`}></i>
    <span>{label}</span>
    <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${active ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>{count}</span>
  </button>
);

const DataPoolView: React.FC<DataPoolViewProps> = ({ people, departments, roleCatalog, titles, currentRole, onUpdatePeople, onUpdateDepartments, onUpdateRoleCatalog, onUpdateTitles, onApplyImport }) => {
  const [tab, setTab] = useState<PoolTab>('people');
  const [isImporting, setIsImporting] = useState(false);
  const [deptFilter, setDeptFilter] = useState('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = canEditPool(currentRole);

  const [newPerson, setNewPerson] = useState({ firstName: '', lastName: '', sicil: '', departmentCode: '', titleCode: '', availableAA: 1, roles: '' });
  const [newDept, setNewDept] = useState({ code: '', name: '', leadName: '' });
  const [newRole, setNewRole] = useState({ departmentCode: '', name: '' });
  const [newTitle, setNewTitle] = useState({ code: '', name: '' });

  const deptCodes = useMemo(() => departments.map(d => d.code), [departments]);
  const filteredPeople = useMemo(
    () => (deptFilter === 'all' ? people : people.filter(p => p.departmentCode === deptFilter)),
    [people, deptFilter]
  );

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

  const addPerson = () => {
    if (!newPerson.firstName.trim() || !newPerson.lastName.trim()) return;
    onUpdatePeople([...people, {
      id: `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      firstName: newPerson.firstName.trim(),
      lastName: newPerson.lastName.trim(),
      sicil: newPerson.sicil.trim() || undefined,
      departmentCode: newPerson.departmentCode || departments[0]?.code || 'Tanımsız',
      titleCode: newPerson.titleCode || undefined,
      availableAA: newPerson.availableAA || 1,
      roles: newPerson.roles.split(',').map(s => s.trim()).filter(Boolean),
    }]);
    setNewPerson({ firstName: '', lastName: '', sicil: '', departmentCode: '', titleCode: '', availableAA: 1, roles: '' });
  };

  const renderPeople = () => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0">
          <tr>
            <th className={thCls}>Ad</th><th className={thCls}>Soyad</th><th className={thCls}>Sicil</th>
            <th className={thCls}>Bölüm</th><th className={thCls}>Ünvan</th>
            <th className={thCls}>Kullanılabilir AA</th><th className={thCls}>Roller (virgülle)</th>
            {editable && <th className={thCls}></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {editable && (
            <tr className="bg-accent/20" style={{ backgroundColor: 'var(--app-accent-light)' }}>
              <td className={tdCls}><input className={inputCls} placeholder="Ad" value={newPerson.firstName} onChange={e => setNewPerson({ ...newPerson, firstName: e.target.value })} /></td>
              <td className={tdCls}><input className={inputCls} placeholder="Soyad" value={newPerson.lastName} onChange={e => setNewPerson({ ...newPerson, lastName: e.target.value })} /></td>
              <td className={tdCls}><input className={inputCls} placeholder="Sicil" value={newPerson.sicil} onChange={e => setNewPerson({ ...newPerson, sicil: e.target.value })} /></td>
              <td className={tdCls}>
                <select className={inputCls} value={newPerson.departmentCode} onChange={e => setNewPerson({ ...newPerson, departmentCode: e.target.value })}>
                  <option value="">Bölüm…</option>
                  {deptCodes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td className={tdCls}>
                <select className={inputCls} value={newPerson.titleCode} onChange={e => setNewPerson({ ...newPerson, titleCode: e.target.value })}>
                  <option value="">Ünvan…</option>
                  {titles.map(t => <option key={t.code} value={t.code}>{t.code}</option>)}
                </select>
              </td>
              <td className={tdCls}><input type="number" min={0} max={1} step={0.1} className={inputCls} value={newPerson.availableAA} onChange={e => setNewPerson({ ...newPerson, availableAA: parseFloat(e.target.value) || 1 })} /></td>
              <td className={tdCls}><input className={inputCls} placeholder="Rol1, Rol2…" value={newPerson.roles} onChange={e => setNewPerson({ ...newPerson, roles: e.target.value })} /></td>
              <td className={tdCls}>
                <button onClick={addPerson} className="text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--app-primary)' }}>Ekle</button>
              </td>
            </tr>
          )}
          {filteredPeople.map(p => (
            <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
              <td className={tdCls}><input disabled={!editable} className={inputCls} value={p.firstName} onChange={e => updatePerson(p.id, { firstName: e.target.value })} /></td>
              <td className={tdCls}><input disabled={!editable} className={inputCls} value={p.lastName} onChange={e => updatePerson(p.id, { lastName: e.target.value })} /></td>
              <td className={tdCls}><input disabled={!editable} className={inputCls} value={p.sicil || ''} onChange={e => updatePerson(p.id, { sicil: e.target.value || undefined })} /></td>
              <td className={tdCls}>
                <select disabled={!editable} className={inputCls} value={p.departmentCode} onChange={e => updatePerson(p.id, { departmentCode: e.target.value })}>
                  {!deptCodes.includes(p.departmentCode) && <option value={p.departmentCode}>{p.departmentCode}</option>}
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
              {editable && (
                <td className={tdCls}>
                  <button onClick={() => { if (window.confirm(`${p.firstName} ${p.lastName} havuzdan silinsin mi? (Tahsis kayıtları etkilenebilir)`)) onUpdatePeople(people.filter(x => x.id !== p.id)); }} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <i className="fa-solid fa-trash text-[10px]"></i>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {filteredPeople.length === 0 && <p className="text-center text-gray-400 text-xs py-8">Henüz personel yok. Excel'den içe aktarın veya elle ekleyin.</p>}
    </div>
  );

  const renderDepartments = () => (
    <div className="max-w-3xl">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr><th className={thCls}>Kod</th><th className={thCls}>Ad</th><th className={thCls}>Bölüm Sorumlusu</th><th className={thCls}>Personel</th>{editable && <th className={thCls}></th>}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {editable && (
            <tr style={{ backgroundColor: 'var(--app-accent-light)' }}>
              <td className={tdCls}><input className={inputCls} placeholder="U310" value={newDept.code} onChange={e => setNewDept({ ...newDept, code: e.target.value })} /></td>
              <td className={tdCls}><input className={inputCls} placeholder="Bölüm adı" value={newDept.name} onChange={e => setNewDept({ ...newDept, name: e.target.value })} /></td>
              <td className={tdCls}><input className={inputCls} placeholder="Sorumlu" value={newDept.leadName} onChange={e => setNewDept({ ...newDept, leadName: e.target.value })} /></td>
              <td className={tdCls}></td>
              <td className={tdCls}>
                <button onClick={() => {
                  const code = newDept.code.trim();
                  if (!code || departments.some(d => d.code === code)) return;
                  onUpdateDepartments([...departments, { code, name: newDept.name.trim() || code, leadName: newDept.leadName.trim() || undefined }]);
                  setNewDept({ code: '', name: '', leadName: '' });
                }} className="text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--app-primary)' }}>Ekle</button>
              </td>
            </tr>
          )}
          {departments.map(d => (
            <tr key={d.code} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
              <td className={`${tdCls} text-[11px] font-black text-gray-700 dark:text-gray-200`}>{d.code}</td>
              <td className={tdCls}><input disabled={!editable} className={inputCls} value={d.name} onChange={e => onUpdateDepartments(departments.map(x => x.code === d.code ? { ...x, name: e.target.value } : x))} /></td>
              <td className={tdCls}><input disabled={!editable} className={inputCls} value={d.leadName || ''} onChange={e => onUpdateDepartments(departments.map(x => x.code === d.code ? { ...x, leadName: e.target.value || undefined } : x))} /></td>
              <td className={`${tdCls} text-[11px] text-gray-400`}>{people.filter(p => p.departmentCode === d.code).length} kişi</td>
              {editable && (
                <td className={tdCls}>
                  <button onClick={() => { if (window.confirm(`${d.code} bölümü silinsin mi?`)) onUpdateDepartments(departments.filter(x => x.code !== d.code)); }} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash text-[10px]"></i></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderRoles = () => (
    <div className="max-w-3xl">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr><th className={thCls}>Bölüm</th><th className={thCls}>Rol</th><th className={thCls}>Bu Roldeki Personel</th>{editable && <th className={thCls}></th>}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {editable && (
            <tr style={{ backgroundColor: 'var(--app-accent-light)' }}>
              <td className={tdCls}>
                <select className={inputCls} value={newRole.departmentCode} onChange={e => setNewRole({ ...newRole, departmentCode: e.target.value })}>
                  <option value="">Bölüm…</option>
                  {deptCodes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td className={tdCls}><input className={inputCls} placeholder="Rol adı" value={newRole.name} onChange={e => setNewRole({ ...newRole, name: e.target.value })} /></td>
              <td className={tdCls}></td>
              <td className={tdCls}>
                <button onClick={() => {
                  if (!newRole.departmentCode || !newRole.name.trim()) return;
                  onUpdateRoleCatalog([...roleCatalog, { id: `rolecat-${Date.now().toString(36)}`, departmentCode: newRole.departmentCode, name: newRole.name.trim() }]);
                  setNewRole({ departmentCode: '', name: '' });
                }} className="text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--app-primary)' }}>Ekle</button>
              </td>
            </tr>
          )}
          {roleCatalog.map(r => (
            <tr key={r.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
              <td className={`${tdCls} text-[11px] font-black text-gray-500`}>{r.departmentCode}</td>
              <td className={`${tdCls} text-[11px] text-gray-700 dark:text-gray-200`}>{r.name}</td>
              <td className={`${tdCls} text-[11px] text-gray-400`}>{people.filter(p => p.roles.includes(r.name)).length}</td>
              {editable && (
                <td className={tdCls}>
                  <button onClick={() => onUpdateRoleCatalog(roleCatalog.filter(x => x.id !== r.id))} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash text-[10px]"></i></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderTitles = () => (
    <div className="max-w-2xl">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr><th className={thCls}>Kısaltma</th><th className={thCls}>Ünvan</th><th className={thCls}>Personel</th>{editable && <th className={thCls}></th>}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {editable && (
            <tr style={{ backgroundColor: 'var(--app-accent-light)' }}>
              <td className={tdCls}><input className={inputCls} placeholder="ARŞ" value={newTitle.code} onChange={e => setNewTitle({ ...newTitle, code: e.target.value })} /></td>
              <td className={tdCls}><input className={inputCls} placeholder="Araştırmacı" value={newTitle.name} onChange={e => setNewTitle({ ...newTitle, name: e.target.value })} /></td>
              <td className={tdCls}></td>
              <td className={tdCls}>
                <button onClick={() => {
                  const code = newTitle.code.trim();
                  if (!code || titles.some(t => t.code === code)) return;
                  onUpdateTitles([...titles, { code, name: newTitle.name.trim() || code }]);
                  setNewTitle({ code: '', name: '' });
                }} className="text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--app-primary)' }}>Ekle</button>
              </td>
            </tr>
          )}
          {titles.map(t => (
            <tr key={t.code} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40">
              <td className={`${tdCls} text-[11px] font-black text-gray-700 dark:text-gray-200`}>{t.code}</td>
              <td className={`${tdCls} text-[11px] text-gray-600 dark:text-gray-300`}>{t.name}</td>
              <td className={`${tdCls} text-[11px] text-gray-400`}>{people.filter(p => p.titleCode === t.code).length}</td>
              {editable && (
                <td className={tdCls}>
                  <button onClick={() => onUpdateTitles(titles.filter(x => x.code !== t.code))} className="w-7 h-7 rounded-lg text-gray-300 hover:text-red-500 transition-colors"><i className="fa-solid fa-trash text-[10px]"></i></button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight">Veri Havuzu</h2>
          <p className="text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">Personel · Bölüm · Rol · Ünvan Master Verisi</p>
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
            className="text-white text-[9px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-md hover:opacity-90 transition-all disabled:opacity-40 flex items-center"
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
        <TabButton active={tab === 'people'} icon="fa-users" label="Personel" count={people.length} onClick={() => setTab('people')} />
        <TabButton active={tab === 'departments'} icon="fa-building" label="Bölümler" count={departments.length} onClick={() => setTab('departments')} />
        <TabButton active={tab === 'roles'} icon="fa-id-badge" label="Rol Kataloğu" count={roleCatalog.length} onClick={() => setTab('roles')} />
        <TabButton active={tab === 'titles'} icon="fa-graduation-cap" label="Ünvanlar" count={titles.length} onClick={() => setTab('titles')} />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 overflow-hidden">
        {tab === 'people' && renderPeople()}
        {tab === 'departments' && renderDepartments()}
        {tab === 'roles' && renderRoles()}
        {tab === 'titles' && renderTitles()}
      </div>
    </div>
  );
};

export default DataPoolView;
