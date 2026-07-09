import React, { useMemo, useState } from 'react';
import { Allocation, Person, PlanLock, PlanLockStatus, Project, UserRole } from '../types';
import {
  canApprovePlan, canEnterData, EffortField, findOverAllocations,
  getPlanLockStatus, isActualEditable, isPlanEditable,
  MONTH_INDEXES, MONTHS_TR, personMonthTotal, ROLE_LABELS, rowTotal,
  summarizeByDepartment, summarizeByPerson, summarizeByProject,
} from '../utils/allocations';
import { buildRoleAnalysis, EFFORT_TYPE_LABELS, EffortType, summarizeGaps } from '../utils/roleAnalysis';

interface AllocationViewProps {
  allocations: Allocation[];
  people: Person[];
  projects: Project[];
  planLocks: PlanLock[];
  currentRole: UserRole;
  onSetCell: (allocationId: string, field: EffortField, month: number, value: number | undefined) => void;
  onAddAllocation: (personId: string, projectId: string, year: number, workPackageId?: string, role?: string) => void;
  onDeleteAllocation: (allocationId: string) => void;
  onLockAction: (projectId: string, year: number, status: PlanLockStatus) => void;
}

type Mode = 'plan' | 'actual' | 'compare';
type Tab = 'grid' | 'person' | 'department' | 'project' | 'roles';

const YEAR_RANGE = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2];
})();

const fmt = (v: number): string => {
  if (Math.abs(v) < 0.005) return '0';
  return (Math.round(v * 100) / 100).toString().replace('.', ',');
};

const LOCK_STYLES: Record<PlanLockStatus, { label: string; cls: string; icon: string }> = {
  draft: { label: 'Taslak', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', icon: 'fa-pen' },
  submitted: { label: 'Onay Bekliyor', cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300', icon: 'fa-hourglass-half' },
  locked: { label: 'Kilitli', cls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300', icon: 'fa-lock' },
};

const AllocationView: React.FC<AllocationViewProps> = ({ allocations, people, projects, planLocks, currentRole, onSetCell, onAddAllocation, onDeleteAllocation, onLockAction }) => {
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<Mode>('plan');
  const [tab, setTab] = useState<Tab>('grid');
  const [projectFilter, setProjectFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [newRow, setNewRow] = useState({ personId: '', projectId: '', workPackageId: '', role: '' });

  const personMap = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const projectNames = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects]);
  const personName = (id: string) => {
    const p = personMap.get(id);
    return p ? `${p.firstName} ${p.lastName}`.trim() : 'Bilinmeyen';
  };

  const yearAllocations = useMemo(() => allocations.filter(a => a.year === year), [allocations, year]);

  const visibleAllocations = useMemo(() => yearAllocations.filter(a => {
    if (projectFilter !== 'all' && a.projectId !== projectFilter) return false;
    if (deptFilter !== 'all' && personMap.get(a.personId)?.departmentCode !== deptFilter) return false;
    return true;
  }), [yearAllocations, projectFilter, deptFilter, personMap]);

  const groupedByProject = useMemo(() => {
    const groups = new Map<string, Allocation[]>();
    visibleAllocations.forEach(a => {
      if (!groups.has(a.projectId)) groups.set(a.projectId, []);
      groups.get(a.projectId)!.push(a);
    });
    groups.forEach(list => list.sort((a, b) => personName(a.personId).localeCompare(personName(b.personId), 'tr')));
    return Array.from(groups.entries()).sort((a, b) =>
      (projectNames.get(a[0]) || '').localeCompare(projectNames.get(b[0]) || '', 'tr'));
  }, [visibleAllocations, projectNames]); // eslint-disable-line react-hooks/exhaustive-deps

  const overAllocations = useMemo(() => findOverAllocations(yearAllocations, people, year, 'plan'), [yearAllocations, people, year]);
  const overSet = useMemo(() => new Set(overAllocations.map(o => `${o.personId}:${o.month}`)), [overAllocations]);

  const departments = useMemo(() => Array.from(new Set(people.map(p => p.departmentCode).filter(Boolean))).sort(), [people]);

  const selectedPerson = personMap.get(newRow.personId);
  const selectedProject = projectMap.get(newRow.projectId);

  const handleAdd = () => {
    if (!newRow.personId || !newRow.projectId) return;
    onAddAllocation(newRow.personId, newRow.projectId, year, newRow.workPackageId || undefined, newRow.role || undefined);
    setNewRow({ personId: '', projectId: '', workPackageId: '', role: '' });
  };

  // ---------------- Hücreler ----------------

  const cellInput = (a: Allocation, field: EffortField, month: number, editableCell: boolean) => {
    const value = a[field][month];
    const person = personMap.get(a.personId);
    const isOver = field === 'plan' && person && overSet.has(`${person.id}:${month}`) && (value || 0) > 0;
    return (
      <input
        type="number"
        min={0}
        max={1.5}
        step={0.05}
        value={value ?? ''}
        disabled={!editableCell}
        onChange={e => {
          const raw = e.target.value;
          onSetCell(a.id, field, month, raw === '' ? undefined : parseFloat(raw));
        }}
        title={isOver && person ? `Aşırı tahsis: ${personName(person.id)} ${MONTHS_TR[month - 1]} toplamı ${fmt(personMonthTotal(yearAllocations, person.id, year, month, 'plan'))} / kapasite ${fmt(person.availableAA)}` : undefined}
        className={`w-14 text-center text-xs rounded-md border px-1 py-1 focus:outline-none transition-colors
          ${isOver
            ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-600 dark:text-red-300 font-semibold'
            : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200'}
          disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed`}
      />
    );
  };

  const compareCell = (a: Allocation, month: number) => {
    const p = a.plan[month] || 0;
    const g = a.actual[month] || 0;
    const diff = g - p;
    const diffCls = Math.abs(diff) < 0.005
      ? 'text-gray-400'
      : diff > 0 ? 'text-red-500 font-semibold' : 'text-amber-500 font-semibold';
    return (
      <div className="w-14 text-center leading-tight py-0.5">
        <div className="text-xs text-gray-400">{fmt(p)}</div>
        <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{fmt(g)}</div>
        <div className={`text-[11px] ${diffCls}`}>{diff > 0 ? '+' : ''}{fmt(diff)}</div>
      </div>
    );
  };

  // ---------------- Kilit aksiyonları ----------------

  const lockActions = (projectId: string) => {
    const status = getPlanLockStatus(planLocks, projectId, year);
    const s = LOCK_STYLES[status];
    return (
      <div className="flex items-center space-x-2">
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${s.cls}`}>
          <i className={`fa-solid ${s.icon} mr-1`}></i>{s.label}
        </span>
        {status === 'draft' && canEnterData(currentRole) && (
          <button onClick={() => onLockAction(projectId, year, 'submitted')} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: 'var(--app-primary)' }}>
            <i className="fa-solid fa-paper-plane mr-1"></i>Onaya Gönder
          </button>
        )}
        {status === 'submitted' && canApprovePlan(currentRole) && (
          <>
            <button onClick={() => onLockAction(projectId, year, 'locked')} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white bg-emerald-500 hover:bg-emerald-600">
              <i className="fa-solid fa-check mr-1"></i>Onayla & Kilitle
            </button>
            <button onClick={() => onLockAction(projectId, year, 'draft')} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white bg-red-400 hover:bg-red-500">
              <i className="fa-solid fa-rotate-left mr-1"></i>Reddet
            </button>
          </>
        )}
        {status === 'locked' && canApprovePlan(currentRole) && (
          <button onClick={() => { if (window.confirm('Plan kilidi açılsın mı? Plan hücreleri yeniden düzenlenebilir olur.')) onLockAction(projectId, year, 'draft'); }} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300">
            <i className="fa-solid fa-lock-open mr-1"></i>Kilidi Aç
          </button>
        )}
      </div>
    );
  };

  // ---------------- Ana tablo ----------------

  const monthTotalsFor = (list: Allocation[], field: EffortField): number[] =>
    MONTH_INDEXES.map(m => list.reduce((sum, a) => sum + (a[field][m] || 0), 0));

  const renderGrid = () => (
    <div className="space-y-5">
      {canEnterData(currentRole) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-400 mr-1">Yeni Satır</span>
          <select value={newRow.personId} onChange={e => setNewRow({ ...newRow, personId: e.target.value, role: '' })} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
            <option value="">Personel…</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.departmentCode})</option>)}
          </select>
          <select value={newRow.projectId} onChange={e => setNewRow({ ...newRow, projectId: e.target.value, workPackageId: '' })} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
            <option value="">Proje…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={newRow.workPackageId} onChange={e => setNewRow({ ...newRow, workPackageId: e.target.value })} disabled={!selectedProject || selectedProject.workPackages.length === 0} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none disabled:opacity-40">
            <option value="">{selectedProject && selectedProject.workPackages.length === 0 ? 'İP tanımsız' : 'İş Paketi…'}</option>
            {selectedProject?.workPackages.map(wp => <option key={wp.id} value={wp.id}>{wp.name}</option>)}
          </select>
          <select value={newRow.role} onChange={e => setNewRow({ ...newRow, role: e.target.value })} disabled={!selectedPerson || selectedPerson.roles.length === 0} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none disabled:opacity-40">
            <option value="">{selectedPerson && selectedPerson.roles.length === 0 ? 'Rol tanımsız' : 'Rol…'}</option>
            {selectedPerson?.roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={handleAdd} disabled={!newRow.personId || !newRow.projectId} className="text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm hover:opacity-90 disabled:opacity-40" style={{ backgroundColor: 'var(--app-primary)' }}>
            <i className="fa-solid fa-plus mr-1"></i>Ekle
          </button>
        </div>
      )}

      {groupedByProject.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <i className="fa-solid fa-table-cells-large text-3xl mb-3 opacity-40"></i>
          <p className="text-xs">Bu yıl/filtre için tahsis kaydı yok. {canEnterData(currentRole) ? 'Yukarıdan satır ekleyin veya Veri Havuzu ekranından Excel içe aktarın.' : ''}</p>
        </div>
      )}

      {groupedByProject.map(([projectId, list]) => {
        const planEditable = isPlanEditable(currentRole, planLocks, projectId, year);
        const actualEditable = isActualEditable(currentRole);
        const planTotals = monthTotalsFor(list, 'plan');
        const actualTotals = monthTotalsFor(list, 'actual');
        return (
          <div key={projectId} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-50 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800">
              <div className="flex items-center space-x-2">
                <i className="fa-solid fa-folder-open text-xs" style={{ color: 'var(--app-primary)' }}></i>
                <span className="text-[12px] font-semibold text-gray-800 dark:text-white">{projectNames.get(projectId) || 'Bilinmeyen Proje'}</span>
                <span className="text-xs text-gray-400 font-bold">{list.length} satır · Plan Σ {fmt(planTotals.reduce((a, b) => a + b, 0))} AA · Gerç. Σ {fmt(actualTotals.reduce((a, b) => a + b, 0))} AA</span>
              </div>
              {lockActions(projectId)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="bg-gray-50/80 dark:bg-gray-800/80">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 sticky left-0 bg-gray-50 dark:bg-gray-800 min-w-[190px]">Personel / İP / Rol</th>
                    {MONTHS_TR.map(m => <th key={m} className="px-1 py-2 text-center text-[11px] font-semibold text-gray-400">{m}</th>)}
                    <th className="px-2 py-2 text-center text-[11px] font-semibold text-gray-400">Yıllık</th>
                    {canEnterData(currentRole) && <th className="px-1 py-2 w-8"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {list.map(a => {
                    const person = personMap.get(a.personId);
                    const wpName = a.workPackageId ? projectMap.get(a.projectId)?.workPackages.find(w => w.id === a.workPackageId)?.name : undefined;
                    return (
                      <tr key={a.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                        <td className="px-3 py-1.5 sticky left-0 bg-white dark:bg-gray-800">
                          <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 leading-tight">{personName(a.personId)}</div>
                          <div className="text-[11px] text-gray-400 font-semibold leading-tight">
                            {person?.departmentCode}{wpName ? ` · ${wpName}` : ''}{a.role ? ` · ${a.role}` : ''}
                          </div>
                        </td>
                        {MONTH_INDEXES.map(m => (
                          <td key={m} className="px-1 py-1 text-center">
                            {mode === 'plan' && cellInput(a, 'plan', m, planEditable)}
                            {mode === 'actual' && cellInput(a, 'actual', m, actualEditable)}
                            {mode === 'compare' && compareCell(a, m)}
                          </td>
                        ))}
                        <td className="px-2 py-1 text-center">
                          <span className="text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>
                            {mode === 'actual' ? fmt(rowTotal(a, 'actual')) : fmt(rowTotal(a, 'plan'))}
                          </span>
                          {mode === 'compare' && <span className="text-xs text-gray-400"> / {fmt(rowTotal(a, 'actual'))}</span>}
                        </td>
                        {canEnterData(currentRole) && (
                          <td className="px-1 py-1 text-center">
                            <button
                              onClick={() => { if (window.confirm('Bu tahsis satırı silinsin mi?')) onDeleteAllocation(a.id); }}
                              disabled={!planEditable}
                              className="w-6 h-6 rounded-md text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={planEditable ? 'Satırı sil' : 'Plan kilitli — satır silinemez'}
                            >
                              <i className="fa-solid fa-trash text-xs"></i>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50/80 dark:bg-gray-800/80">
                    <td className="px-3 py-1.5 sticky left-0 bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-500">Proje Toplamı</td>
                    {MONTH_INDEXES.map(m => (
                      <td key={m} className="px-1 py-1.5 text-center text-xs font-semibold text-gray-600 dark:text-gray-300">
                        {mode === 'actual' ? fmt(actualTotals[m - 1]) : fmt(planTotals[m - 1])}
                        {mode === 'compare' && <span className="block text-[11px] text-gray-400">{fmt(actualTotals[m - 1])}</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>
                      {fmt((mode === 'actual' ? actualTotals : planTotals).reduce((a, b) => a + b, 0))}
                    </td>
                    {canEnterData(currentRole) && <td></td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ---------------- Özet sekmeleri ----------------

  const renderSummary = (rows: ReturnType<typeof summarizeByPerson>, showCapacity: boolean) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto">
      <table className="w-full min-w-[1000px]">
        <thead>
          <tr className="bg-gray-50/80 dark:bg-gray-800/80">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 sticky left-0 bg-gray-50 dark:bg-gray-800 min-w-[170px]">
              {tab === 'person' ? 'Personel' : tab === 'department' ? 'Bölüm' : 'Proje'}
            </th>
            {MONTHS_TR.map(m => <th key={m} className="px-1 py-2.5 text-center text-[11px] font-semibold text-gray-400">{m}</th>)}
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-400">Toplam</th>
            {showCapacity && <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-400">Kapasite/Ay</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {rows.map(row => (
            <tr key={row.key} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
              <td className="px-4 py-2 sticky left-0 bg-white dark:bg-gray-800 text-[11px] font-bold text-gray-700 dark:text-gray-200">{row.label}</td>
              {row.months.map((v, idx) => {
                const cap = row.capacity;
                const isOver = cap !== undefined && v > cap + 1e-9;
                const isFull = cap !== undefined && !isOver && v >= cap - 1e-9 && v > 0;
                return (
                  <td key={idx} className={`px-1 py-2 text-center text-xs font-bold
                    ${isOver ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300'
                      : isFull ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300'
                      : v > 0 ? 'text-gray-600 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'}`}>
                    {fmt(v)}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-center text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(row.total)}</td>
              {showCapacity && <td className="px-3 py-2 text-center text-xs text-gray-400 font-bold">{row.capacity !== undefined ? fmt(row.capacity) : '—'}</td>}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={15} className="text-center text-gray-400 text-xs py-10">Bu yıl için veri yok.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  // ---------------- Kapasite-Talep (Rol) — Excel "Plan, Kaynak, İhtiyaç" ----------------

  const renderRoleAnalysis = () => {
    const allRows = buildRoleAnalysis(allocations, people, projects, year);
    const rows = deptFilter === 'all' ? allRows : allRows.filter(r => r.departmentCode === deptFilter);
    const gapSummary = summarizeGaps(rows);

    const EFFORT_ORDER: EffortType[] = ['planned', 'capacity', 'proposal', 'gap'];
    const effortRowCls: Record<EffortType, { label: string; cell: (v: number) => string }> = {
      planned: { label: 'text-gray-700 dark:text-gray-200', cell: v => v > 0 ? 'text-gray-700 dark:text-gray-200 font-semibold' : 'text-gray-300 dark:text-gray-600' },
      capacity: { label: 'text-gray-400', cell: v => v > 0 ? 'text-gray-400' : 'text-gray-300 dark:text-gray-600' },
      proposal: { label: 'text-purple-500 dark:text-purple-300', cell: v => v > 0 ? 'text-purple-500 dark:text-purple-300 font-semibold' : 'text-gray-300 dark:text-gray-600' },
      gap: { label: 'text-red-500 dark:text-red-300', cell: v => v > 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 font-semibold' : 'text-gray-300 dark:text-gray-600' },
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-semibold ${gapSummary.rolesWithGap > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-300'}`}>
            <i className={`fa-solid ${gapSummary.rolesWithGap > 0 ? 'fa-user-plus' : 'fa-circle-check'}`}></i>
            {gapSummary.rolesWithGap > 0
              ? `${gapSummary.rolesWithGap} rolde personel açığı — toplam ${fmt(gapSummary.totalGapAA)} AA işe alım/görevlendirme ihtiyacı`
              : 'Tüm rollerde kapasite talebi karşılıyor'}
          </div>
          <p className="text-[11px] text-gray-400">
            Kapasite, rolü üstlenebilen kişilerin toplamıdır; çok rollü kişiler her rolünde sayılır (roller arası toplanmaz).
          </p>
        </div>

        {rows.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <i className="fa-solid fa-id-badge text-3xl mb-3 opacity-40"></i>
            <p className="text-xs">Bu yıl/filtre için rol verisi yok. Veri Havuzu'nda kişilere rol tanımlayın ve tahsis satırlarında rol seçin.</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[1150px]">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/80">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 sticky left-0 bg-gray-50 dark:bg-gray-800 min-w-[230px]">Bölüm / Rol / Efor Türü</th>
                  {MONTHS_TR.map(m => <th key={m} className="px-1 py-2.5 text-center text-[11px] font-semibold text-gray-400">{m}</th>)}
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-400">Toplam</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <React.Fragment key={`${row.departmentCode}|${row.role}`}>
                    <tr className="bg-gray-50/70 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700/60">
                      <td colSpan={14} className="px-4 py-2 sticky left-0">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{row.role}</span>
                        <span className="ml-2 text-[11px] text-gray-400">{row.departmentCode}</span>
                        {row.totals.gap > 0 && (
                          <span className="ml-3 text-[11px] font-semibold text-red-500">
                            <i className="fa-solid fa-user-plus mr-1"></i>{fmt(row.totals.gap)} AA açık
                          </span>
                        )}
                      </td>
                    </tr>
                    {EFFORT_ORDER.map(et => (
                      <tr key={et} className="hover:bg-gray-50/40 dark:hover:bg-gray-800/40">
                        <td className={`pl-8 pr-4 py-1.5 sticky left-0 bg-white dark:bg-gray-800 text-[11px] ${effortRowCls[et].label}`}>
                          {EFFORT_TYPE_LABELS[et]}
                        </td>
                        {row[et].map((v, idx) => (
                          <td key={idx} className={`px-1 py-1.5 text-center text-xs ${effortRowCls[et].cell(v)}`}>{fmt(v)}</td>
                        ))}
                        <td className={`px-3 py-1.5 text-center text-xs font-semibold ${et === 'gap' && row.totals.gap > 0 ? 'text-red-500' : ''}`} style={et !== 'gap' ? { color: 'var(--app-primary)' } : {}}>
                          {fmt(row.totals[et])}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const summaryField: EffortField = mode === 'actual' ? 'actual' : 'plan';

  return (
    <div className="space-y-4">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white tracking-tight">İşgücü Tahsisi</h2>
          <p className="text-gray-400 text-xs font-semibold tracking-[0.2em]">Adam/Ay Planı · Gerçekleşme · Koordinasyon</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[11px] font-semibold text-gray-700 dark:text-gray-200 focus:outline-none">
            {YEAR_RANGE.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {tab !== 'roles' && (
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
              <option value="all">Tüm Projeler</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
            <option value="all">Tüm Bölümler</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {tab !== 'roles' && (
          <div className="bg-gray-50 dark:bg-gray-800 p-1 rounded-xl flex items-center border border-gray-100 dark:border-gray-700">
            {([['plan', 'Plan'], ['actual', 'Gerçekleşen'], ['compare', 'Karşılaştır']] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mode === m ? 'bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600' : 'text-gray-400 hover:text-gray-600'}`} style={mode === m ? { color: 'var(--app-primary)' } : {}}>
                {label}
              </button>
            ))}
          </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {([['grid', 'fa-table-cells', 'Tahsis Tablosu'], ['person', 'fa-user', 'Kişi Özeti'], ['department', 'fa-building', 'Bölüm Özeti'], ['project', 'fa-folder-open', 'Proje Özeti'], ['roles', 'fa-id-badge', 'Kapasite-Talep']] as [Tab, string, string][]).map(([t, icon, label]) => (
            <button key={t} onClick={() => setTab(t)} className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${tab === t ? 'text-white shadow-md' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-800'}`} style={tab === t ? { backgroundColor: 'var(--app-primary)' } : {}}>
              <i className={`fa-solid ${icon}`}></i><span>{label}</span>
            </button>
          ))}
        </div>
        <span className="text-xs font-semibold text-gray-400">
          Rol: <span style={{ color: 'var(--app-primary)' }}>{ROLE_LABELS[currentRole]}</span>
        </span>
      </div>

      {overAllocations.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-red-600 dark:text-red-300 mb-1">
            <i className="fa-solid fa-triangle-exclamation mr-2"></i>{year} planında {overAllocations.length} aşırı tahsis
          </p>
          <p className="text-[11px] text-red-700 dark:text-red-300">
            {overAllocations.slice(0, 4).map(o => `${o.personName} (${MONTHS_TR[o.month - 1]}: ${fmt(o.total)}/${fmt(o.capacity)})`).join(' · ')}
            {overAllocations.length > 4 && ` · +${overAllocations.length - 4} diğer`}
          </p>
        </div>
      )}

      {tab === 'grid' && renderGrid()}
      {tab === 'person' && renderSummary(summarizeByPerson(yearAllocations, people, year, summaryField), true)}
      {tab === 'department' && renderSummary(summarizeByDepartment(yearAllocations, people, year, summaryField), true)}
      {tab === 'project' && renderSummary(summarizeByProject(yearAllocations, projectNames, year, summaryField), false)}
      {tab === 'roles' && renderRoleAnalysis()}
    </div>
  );
};

export default AllocationView;
