import React, { useMemo, useState } from 'react';
import { Allocation, Leave, Person, PlanLock, PlanLockStatus, Project, UserRole } from '../types';
import {
  canApprovePlan, EffortField, findOverAllocations,
  getPlanLockStatus,
  MONTH_INDEXES, MONTHS_TR, personMonthTotal, ROLE_LABELS, rowTotal,
  summarizeByDepartment, summarizeByPerson, summarizeByProject,
} from '../utils/allocations';
import { buildRoleAnalysis, EFFORT_TYPE_LABELS, EffortType, summarizeGaps } from '../utils/roleAnalysis';
import { AllocationSuggestion, ApplyMode, suggestAllocationsFromTasks, SuggestionResult } from '../utils/taskToAllocation';
import { canAddAllocationToProject, canEditActualCell, canEditAllocationCell, canEditPlanCell, Identity, visiblePersonIds } from '../utils/rbac';
import { effectiveCapacity } from '../utils/availability';
import { allPersonRoles, findAvailablePeople } from '../utils/staffing';
import ScenarioView from './ScenarioView';
import UtilizationHeatmap from './UtilizationHeatmap';

interface AllocationViewProps {
  allocations: Allocation[];
  people: Person[];
  projects: Project[];
  planLocks: PlanLock[];
  leaves: Leave[];
  currentRole: UserRole;
  identity: Identity;
  onSetCell: (allocationId: string, field: EffortField, month: number, value: number | undefined) => void;
  onAddAllocation: (personId: string, projectId: string, year: number, workPackageId?: string, role?: string) => void;
  onDeleteAllocation: (allocationId: string) => void;
  onLockAction: (projectId: string, year: number, status: PlanLockStatus) => void;
  onApplySuggestions: (projectId: string, year: number, suggestions: AllocationSuggestion[], mode: ApplyMode) => void;
}

type Mode = 'plan' | 'actual' | 'compare';
type Tab = 'grid' | 'person' | 'department' | 'project' | 'heatmap' | 'staffing' | 'roles' | 'scenario';

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

const AllocationView: React.FC<AllocationViewProps> = ({ allocations, people, projects, planLocks, leaves, currentRole, identity, onSetCell, onAddAllocation, onDeleteAllocation, onLockAction, onApplySuggestions }) => {
  const wsLike = useMemo(() => ({ people, projects, allocations }), [people, projects, allocations]);
  // Kimlik kapsamına göre hücre/satır düzenlenebilirliği (RBAC)
  const canEnter = identity.role === 'py' || identity.role === 'bolum_sorumlu';
  const [year, setYear] = useState(new Date().getFullYear());
  const [mode, setMode] = useState<Mode>('plan');
  const [tab, setTab] = useState<Tab>('grid');
  const [projectFilter, setProjectFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [newRow, setNewRow] = useState({ personId: '', projectId: '', workPackageId: '', role: '' });
  const [suggestModal, setSuggestModal] = useState<{ projectId: string; projectName: string; result: SuggestionResult } | null>(null);
  const [applyMode, setApplyMode] = useState<ApplyMode>('fill');
  const [staff, setStaff] = useState({ role: '', from: 1, to: 12, aa: 0.5 });

  const openSuggestions = (projectId: string) => {
    const project = projectMap.get(projectId);
    if (!project) return;
    const result = suggestAllocationsFromTasks(project, people, year);
    if (result.taskCount === 0) {
      alert('Bu projede planlanmış görev yok (Backlog dışında sürüme atanmış görev gerekli).');
      return;
    }
    if (result.suggestions.length === 0) {
      alert('Görevlerden bu yıl için AA önerisi çıkmadı (süre tahmini girilmiş, sürüme atanmış görev gerekli).');
      return;
    }
    setSuggestModal({ projectId, projectName: project.name, result });
  };

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

  const overAllocations = useMemo(() => findOverAllocations(yearAllocations, people, year, 'plan', leaves), [yearAllocations, people, year, leaves]);
  const overSet = useMemo(() => new Set(overAllocations.map(o => `${o.personId}:${o.month}`)), [overAllocations]);

  const departments = useMemo(() => Array.from(new Set(people.map(p => p.departmentCode).filter(Boolean))).sort(), [people]);

  const selectedPerson = personMap.get(newRow.personId);
  const selectedProject = projectMap.get(newRow.projectId);

  // Çakışma önizlemesi: seçilen kişinin bu yıl aylık boş kapasitesi (izin farkında)
  const newPersonAvail = useMemo(() => {
    if (!selectedPerson) return null;
    return MONTH_INDEXES.map(m => {
      const load = personMonthTotal(yearAllocations, selectedPerson.id, year, m, 'plan');
      const cap = effectiveCapacity(selectedPerson, leaves, year, m);
      const free = Math.round((cap - load) * 100) / 100;
      return { m, load, cap, free, over: load > cap + 1e-9, full: cap > 0 && free <= 0.049 && !(load > cap + 1e-9) };
    });
  }, [selectedPerson, yearAllocations, year, leaves]);

  // Kapsam: PY yalnız sahip olduğu projeye; bölüm sorumlusu yalnız bölümü kişisine ekler
  const addableProjects = useMemo(
    () => projects.filter(p => canAddAllocationToProject(wsLike, identity, p.id)),
    [projects, wsLike, identity],
  );
  const addablePersonIds = useMemo(() => visiblePersonIds(wsLike, identity), [wsLike, identity]);
  const addablePeople = useMemo(
    () => people.filter(p => addablePersonIds.has(p.id)),
    [people, addablePersonIds],
  );

  const handleAdd = () => {
    if (!newRow.personId || !newRow.projectId) return;
    if (!canEditAllocationCell(wsLike, identity, newRow.projectId, newRow.personId)) {
      alert('Bu kişi × proje için tahsis ekleme yetkiniz yok. Yalnızca kendi projenizin ya da bölümünüz personelinin tahsisini ekleyebilirsiniz.');
      return;
    }
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

  const lockActions = (projectId: string, canManage: boolean) => {
    const status = getPlanLockStatus(planLocks, projectId, year);
    const s = LOCK_STYLES[status];
    return (
      <div className="flex items-center space-x-2">
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${s.cls}`}>
          <i className={`fa-solid ${s.icon} mr-1`}></i>{s.label}
        </span>
        {status === 'draft' && canManage && (
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
      {canEnter && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-400 mr-1">Yeni Satır</span>
          <select value={newRow.personId} onChange={e => setNewRow({ ...newRow, personId: e.target.value, role: '' })} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
            <option value="">Personel…</option>
            {addablePeople.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.departmentCode})</option>)}
          </select>
          <select value={newRow.projectId} onChange={e => setNewRow({ ...newRow, projectId: e.target.value, workPackageId: '' })} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
            <option value="">Proje…</option>
            {addableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

          {newPersonAvail && selectedPerson && (
            <div className="w-full flex items-center gap-2 flex-wrap pt-1 mt-1 border-t border-gray-50 dark:border-gray-700/60">
              <span className="text-[10px] font-semibold text-gray-400">{selectedPerson.firstName} · {year} boş kapasite:</span>
              <div className="flex gap-0.5">
                {newPersonAvail.map(a => (
                  <span key={a.m} title={`${MONTHS_TR[a.m - 1]}: yük ${fmt(a.load)} / kapasite ${fmt(a.cap)} → boş ${fmt(a.free)}`}
                    className={`w-7 h-5 rounded flex flex-col items-center justify-center text-[8px] font-bold leading-none ${a.over ? 'bg-red-500 text-white' : a.full ? 'bg-amber-200 text-amber-800 dark:bg-amber-800/60 dark:text-amber-200' : a.cap <= 0.049 ? 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                    <span className="text-[7px] opacity-70">{MONTHS_TR[a.m - 1][0]}</span>
                    {a.cap <= 0.049 ? 'iz' : fmt(a.free)}
                  </span>
                ))}
              </div>
              {(() => {
                const overM = newPersonAvail.filter(a => a.over).map(a => MONTHS_TR[a.m - 1]);
                const fullM = newPersonAvail.filter(a => a.full).map(a => MONTHS_TR[a.m - 1]);
                return (
                  <span className="text-[10px] font-semibold">
                    {overM.length > 0 && <span className="text-red-500"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Aşırı: {overM.join(', ')}</span>}
                    {overM.length > 0 && fullM.length > 0 && <span className="text-gray-300 mx-1">·</span>}
                    {fullM.length > 0 && <span className="text-amber-500">Dolu: {fullM.join(', ')}</span>}
                    {overM.length === 0 && fullM.length === 0 && <span className="text-emerald-500"><i className="fa-solid fa-circle-check mr-1"></i>Yıl boyu uygun</span>}
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {groupedByProject.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <i className="fa-solid fa-table-cells-large text-3xl mb-3 opacity-40"></i>
          <p className="text-xs">Bu yıl/filtre için tahsis kaydı yok. {canEnter ? 'Yukarıdan satır ekleyin veya Veri Havuzu ekranından Excel içe aktarın.' : ''}</p>
        </div>
      )}

      {groupedByProject.map(([projectId, list]) => {
        const draft = getPlanLockStatus(planLocks, projectId, year) === 'draft';
        const canManageProject = canAddAllocationToProject(wsLike, identity, projectId);
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
              <div className="flex items-center gap-2">
                {canManageProject && draft && (
                  <button
                    onClick={() => openSuggestions(projectId)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-primary hover:border-primary/40 transition-colors"
                    title="Projenin sprint planındaki görev eforlarını aylık AA önerisine çevirir"
                  >
                    <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>Görevlerden Öner
                  </button>
                )}
                {lockActions(projectId, canManageProject)}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="bg-gray-50/80 dark:bg-gray-800/80">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 sticky left-0 bg-gray-50 dark:bg-gray-800 min-w-[190px]">Personel / İP / Rol</th>
                    {MONTHS_TR.map(m => <th key={m} className="px-1 py-2 text-center text-[11px] font-semibold text-gray-400">{m}</th>)}
                    <th className="px-2 py-2 text-center text-[11px] font-semibold text-gray-400">Yıllık</th>
                    {canEnter && <th className="px-1 py-2 w-8"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {list.map(a => {
                    const person = personMap.get(a.personId);
                    const wpName = a.workPackageId ? projectMap.get(a.projectId)?.workPackages.find(w => w.id === a.workPackageId)?.name : undefined;
                    const planEditable = canEditPlanCell(wsLike, identity, planLocks, a.projectId, a.personId, year);
                    const actualEditable = canEditActualCell(wsLike, identity, a.projectId, a.personId);
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
                        {canEnter && (
                          <td className="px-1 py-1 text-center">
                            <button
                              onClick={() => { if (window.confirm('Bu tahsis satırı silinsin mi?')) onDeleteAllocation(a.id); }}
                              disabled={!planEditable}
                              className="w-6 h-6 rounded-md text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={planEditable ? 'Satırı sil' : 'Yetkiniz yok veya plan kilitli'}
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
                    {canEnter && <td></td>}
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

  // ---------------- Uygun Kişi (staffing) ----------------

  const renderStaffing = () => {
    const roles = allPersonRoles(people);
    const lo = Math.min(staff.from, staff.to), hi = Math.max(staff.from, staff.to);
    const months = MONTH_INDEXES.filter(m => m >= lo && m <= hi);
    const candidates = findAvailablePeople(people, allocations, leaves, { role: staff.role || undefined, year, months, requiredAA: staff.aa });
    const fitCount = candidates.filter(c => c.fits).length;
    const windowLabel = lo === hi ? MONTHS_TR[lo - 1] : `${MONTHS_TR[lo - 1]}–${MONTHS_TR[hi - 1]}`;

    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 flex flex-wrap items-end gap-3">
          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-300">Rol / Beceri
            <select value={staff.role} onChange={e => setStaff({ ...staff, role: e.target.value })} className="mt-1 block bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none min-w-[160px]">
              <option value="">Tüm roller</option>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-300">Başlangıç ay
            <select value={staff.from} onChange={e => setStaff({ ...staff, from: parseInt(e.target.value, 10) })} className="mt-1 block bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none">
              {MONTHS_TR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-300">Bitiş ay
            <select value={staff.to} onChange={e => setStaff({ ...staff, to: parseInt(e.target.value, 10) })} className="mt-1 block bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none">
              {MONTHS_TR.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-300">Gerekli AA/ay
            <input type="number" min={0.05} max={1} step={0.05} value={staff.aa} onChange={e => setStaff({ ...staff, aa: parseFloat(e.target.value) || 0 })} className="mt-1 block w-24 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none" />
          </label>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${fitCount > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300'}`}>
            <i className={`fa-solid ${fitCount > 0 ? 'fa-user-check' : 'fa-user-xmark'}`}></i>
            {windowLabel} · {staff.role || 'tüm roller'} · her ay ≥ {fmt(staff.aa)} AA: <b>{fitCount} uygun kişi</b>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/80">
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Kişi</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Bölüm</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Pencere ({windowLabel})</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold text-gray-400">En dar ay</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold text-gray-400">Toplam boş</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold text-gray-400">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {candidates.map(c => (
                <tr key={c.personId} className={`hover:bg-gray-50/50 dark:hover:bg-gray-800/40 ${c.fits ? '' : 'opacity-60'}`}>
                  <td className="px-3 py-2">
                    <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200">{c.name}</div>
                    <div className="text-[10px] text-gray-400">{c.roles.join(', ') || '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-gray-500">{c.departmentCode}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-0.5">
                      {months.map(m => {
                        const f = c.freeByMonth[m - 1];
                        return (
                          <span key={m} title={`${MONTHS_TR[m - 1]}: boş ${fmt(f)} AA`}
                            className={`w-7 h-5 rounded flex flex-col items-center justify-center text-[8px] font-bold leading-none ${f < -1e-9 ? 'bg-red-500 text-white' : f <= 0.049 ? 'bg-amber-200 text-amber-800 dark:bg-amber-800/60 dark:text-amber-200' : f + 1e-9 >= staff.aa ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
                            <span className="text-[7px] opacity-70">{MONTHS_TR[m - 1][0]}</span>{fmt(f)}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className={`px-3 py-2 text-center text-[11px] font-semibold ${c.windowMinFree < staff.aa ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-300'}`}>{fmt(c.windowMinFree)}</td>
                  <td className="px-3 py-2 text-center text-[11px] font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(c.windowFree)}</td>
                  <td className="px-3 py-2 text-center">
                    {c.fits
                      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Uygun</span>
                      : <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-400 dark:bg-gray-800">Dolu</span>}
                  </td>
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr><td colSpan={6} className="text-center text-gray-400 text-xs py-10">Bu rolde havuzda kişi yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400"><i className="fa-solid fa-circle-info mr-1"></i>Boş kapasite = efektif kapasite (izin düşülmüş) − mevcut plan yükü. "En dar ay" pencerede en az boşluğu olan aydır; gerekli AA'yı karşılaması gerekir.</p>
      </div>
    );
  };

  // ---------------- Kapasite-Talep (Rol) — Excel "Plan, Kaynak, İhtiyaç" ----------------

  const renderRoleAnalysis = () => {
    const allRows = buildRoleAnalysis(allocations, people, projects, year, leaves);
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
          {tab !== 'roles' && tab !== 'heatmap' && tab !== 'staffing' && (
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
              <option value="all">Tüm Projeler</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-[11px] text-gray-700 dark:text-gray-200 focus:outline-none">
            <option value="all">Tüm Bölümler</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {tab !== 'roles' && tab !== 'heatmap' && tab !== 'staffing' && (
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
          {([['grid', 'fa-table-cells', 'Tahsis Tablosu'], ['person', 'fa-user', 'Kişi Özeti'], ['department', 'fa-building', 'Bölüm Özeti'], ['project', 'fa-folder-open', 'Proje Özeti'], ['heatmap', 'fa-fire', 'Doluluk'], ['staffing', 'fa-user-check', 'Uygun Kişi'], ['roles', 'fa-id-badge', 'Kapasite-Talep'], ['scenario', 'fa-flask', 'Senaryo']] as [Tab, string, string][]).map(([t, icon, label]) => (
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

      {suggestModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSuggestModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-900 px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
              <div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-white">Görev Planından Tahsis Önerisi</h3>
                <p className="text-xs text-gray-400">{suggestModal.projectName} · {year} · {suggestModal.result.taskCount} görev, {suggestModal.result.sprintCount} sürüm</p>
              </div>
              <button onClick={() => setSuggestModal(null)} className="w-9 h-9 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><i className="fa-solid fa-times"></i></button>
            </div>
            <div className="p-5 space-y-4">
              {suggestModal.result.unmatched.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-[11px] text-amber-700 dark:text-amber-300">
                  <b>Havuzda eşleşmeyen kaynaklar (uygulanmayacak):</b> {suggestModal.result.unmatched.join(', ')} — bu kişileri Veri Havuzu'na ekleyin ve adların birebir aynı olduğundan emin olun.
                </div>
              )}
              {suggestModal.result.clippedOutsideYear && (
                <p className="text-[11px] text-gray-400"><i className="fa-solid fa-scissors mr-1"></i>Planın bir kısmı {year} dışına taştığı için kırpıldı (o aylar başka yılın tahsisine girilmeli).</p>
              )}
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Kişi</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400">Önerilen Aylar (AA)</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-400">Toplam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {suggestModal.result.suggestions.map(s => (
                    <tr key={s.resourceName} className={s.matched ? '' : 'opacity-50'}>
                      <td className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {s.personLabel}
                        {!s.matched && <span className="ml-2 text-[10px] font-semibold text-amber-500">havuzda yok</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(s.months).map(([m, aa]) => (
                            <span key={m} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                              {MONTHS_TR[Number(m) - 1]} {fmt(Number(aa))}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold" style={{ color: 'var(--app-primary)' }}>{fmt(s.totalAA)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                  <input type="radio" name="applyMode" checked={applyMode === 'fill'} onChange={() => setApplyMode('fill')} className="accent-blue-600" />
                  <span><b>Boş ayları doldur</b> — elle girilmiş değerlere dokunma</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                  <input type="radio" name="applyMode" checked={applyMode === 'overwrite'} onChange={() => setApplyMode('overwrite')} className="accent-blue-600" />
                  <span><b>Üzerine yaz</b> — öneri olan ayları değiştir</span>
                </label>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setSuggestModal(null)} className="text-xs font-semibold px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300">Vazgeç</button>
                <button
                  onClick={() => {
                    onApplySuggestions(suggestModal.projectId, year, suggestModal.result.suggestions, applyMode);
                    setSuggestModal(null);
                  }}
                  disabled={!suggestModal.result.suggestions.some(s => s.matched)}
                  className="text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-md hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--app-primary)' }}
                >
                  <i className="fa-solid fa-check mr-1"></i>Uygula
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'grid' && renderGrid()}
      {tab === 'heatmap' && <UtilizationHeatmap allocations={allocations} people={people} year={year} deptFilter={deptFilter} leaves={leaves} />}
      {tab === 'staffing' && renderStaffing()}
      {tab === 'person' && renderSummary(summarizeByPerson(yearAllocations, people, year, summaryField), true)}
      {tab === 'department' && renderSummary(summarizeByDepartment(yearAllocations, people, year, summaryField), true)}
      {tab === 'project' && renderSummary(summarizeByProject(yearAllocations, projectNames, year, summaryField), false)}
      {tab === 'roles' && renderRoleAnalysis()}
      {tab === 'scenario' && <ScenarioView people={people} projects={projects} allocations={allocations} year={year} />}
    </div>
  );
};

export default AllocationView;
