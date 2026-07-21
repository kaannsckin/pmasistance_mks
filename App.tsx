
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Task, Resource, TaskStatus, Note, CustomerRequest, Objective, Project, WorkspaceData, RagStatus, ProjectStatus, UserRole, PlanLockStatus } from './types';
import { INITIAL_TASKS, INITIAL_RESOURCES, INITIAL_OBJECTIVES } from './constants';
import {
  WORKSPACE_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  createEmptyWorkspace,
  createProject,
  parseImportedJson,
  resolveWorkspaceFromStorage,
  serializeWorkspace,
} from './utils/workspace';
import { createAllocation, EffortField, getPlanLockStatus, ROLE_LABELS, setAllocationCell, upsertPlanLock } from './utils/allocations';
import { applyPoolImport, PoolImportResult } from './utils/poolImporter';
import { isExecRole } from './utils/execReport';
import { canEditProjectContent, identityOf, identityNeedsPerson as computeNeedsPerson, visibleProjectIds } from './utils/rbac';
import { addSnapshot, buildSnapshot, ensureMonthlySnapshot } from './utils/snapshots';
import { AllocationSuggestion, ApplyMode, applyAllocationSuggestions } from './utils/taskToAllocation';
import { buildTodoItems, TodoItem } from './utils/todoItems';
import { loadCloudConfig, scheduleAutoPush } from './utils/cloudSync';
import CloudSyncModal from './components/CloudSyncModal';
import Header from './components/Header';
import TaskGallery from './components/TaskGallery';
import ResourceManager from './components/ResourceManager';
import TaskFormModal from './components/TaskFormModal';
import TaskDetailModal from './components/TaskDetailModal';
import TeamsMessageModal from './components/TeamsMessageModal';
import KanbanView from './components/KanbanView';
import RoadmapView from './components/RoadmapView';
import SettingsModal from './components/SettingsModal';
import NotesView from './components/NotesView';
import AboutModal from './components/AboutModal';
import CustomerRequestsView from './components/CustomerRequestsView';
import AIAssistant from './components/AIAssistant';
import GoalsView from './components/GoalsView';
import PortfolioView from './components/PortfolioView';
import DataPoolView from './components/DataPoolView';
import AllocationView from './components/AllocationView';
import ExecutiveView from './components/ExecutiveView';
import PersonDetailModal from './components/PersonDetailModal';
import RiskView from './components/RiskView';
import StatusReportModal from './components/StatusReportModal';
import DataHealthModal from './components/DataHealthModal';
import AuditLogModal from './components/AuditLogModal';
import { analyzeDataHealth, applyHealthFix, HealthFix } from './utils/dataHealth';
import { appendAudit, AUDIT_ACTION_LABELS } from './utils/audit';
import { Risk } from './types';

const THEME_COLORS: Record<string, string> = {
  classic: '#2563eb',
  emerald: '#059669',
  purple: '#7c3aed',
  orange: '#ea580c',
};

const createSampleProject = (): Project =>
  createProject('Örnek Proje', {
    tasks: INITIAL_TASKS,
    resources: INITIAL_RESOURCES.map(r => ({ ...r, title: r.title || 'Uzman' })),
    objectives: INITIAL_OBJECTIVES,
  });

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.Portfolio);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);
  const [teamsTask, setTeamsTask] = useState<Task | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [viewingPersonId, setViewingPersonId] = useState<string | null>(null);
  const [isStatusReportOpen, setIsStatusReportOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const [isInitialized, setIsInitialized] = useState(false);

  // ---- Açılış: v2 workspace → v1 migration → örnek proje sırasıyla çözülür ----
  useEffect(() => {
    const { workspace: resolved } = resolveWorkspaceFromStorage(
      localStorage.getItem(WORKSPACE_STORAGE_KEY),
      localStorage.getItem(LEGACY_STORAGE_KEY)
    );
    if (resolved) {
      // Ayın ilk açılışında otomatik baseline (plan kayması trendi için)
      setWorkspace(ensureMonthlySnapshot(resolved) || resolved);
    } else {
      const sample = createSampleProject();
      setWorkspace({ ...createEmptyWorkspace(), projects: [sample], activeProjectId: sample.id });
    }
    setIsInitialized(true);
  }, []);

  const settings = workspace?.settings;
  const activeProject = useMemo(
    () => workspace?.projects.find(p => p.id === workspace.activeProjectId) ?? null,
    [workspace]
  );

  // ---- Kimlik + kapsam ----
  const identity = useMemo(() => (workspace ? identityOf(workspace) : { role: 'py' as UserRole }), [workspace]);
  const visibleProjects = useMemo(() => {
    if (!workspace) return [];
    const ids = visibleProjectIds(workspace, identity);
    return workspace.projects.filter(p => ids.has(p.id));
  }, [workspace, identity]);
  const needsPerson = useMemo(() => computeNeedsPerson(identity), [identity]);

  // ---- Veri sağlığı (hata + uyarı sayısı rozet için) ----
  const healthAlerts = useMemo(() => {
    if (!workspace) return 0;
    const { counts } = analyzeDataHealth(workspace);
    return counts.error + counts.warn;
  }, [workspace]);

  // ---- Yapılacaklar (mevcut veriden türetilir, role göre filtreli) ----
  const todoItems = useMemo(() => (workspace ? buildTodoItems(workspace) : []), [workspace]);

  const handleTodoNavigate = useCallback((item: TodoItem) => {
    // Proje bağlamı gerekiyorsa önce o projeyi aç, sonra ekrana geç
    if (item.projectId) {
      setWorkspace(prev => (prev ? { ...prev, activeProjectId: item.projectId! } : prev));
    }
    setCurrentView(item.view);
  }, []);

  // ---- Tema / gece modu ----
  useEffect(() => {
    if (settings?.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--app-primary').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }, [settings?.isDarkMode, settings?.theme]);

  // ---- Kalıcılık ----
  useEffect(() => {
    if (!isInitialized || !workspace) return;
    const toPersist = workspace.settings.isLocalPersistenceEnabled !== false
      ? workspace
      : { ...workspace, projects: [], activeProjectId: null };
    localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspace(toPersist));
    // Bulut bağlıysa değişiklikleri gecikmeli gönder (yerel-öncelikli senkron)
    scheduleAutoPush(workspace);
  }, [workspace, isInitialized]);

  // ---- Merkezi güncelleme yardımcıları ----
  const updateWorkspace = useCallback((updater: (ws: WorkspaceData) => WorkspaceData) => {
    setWorkspace(prev => (prev ? updater(prev) : prev));
  }, []);

  const handleApplyHealthFix = useCallback((fix: HealthFix) => {
    updateWorkspace(ws => {
      const next = applyHealthFix(ws, fix);
      const summary = fix.kind === 'deleteAllocation' ? 'Yetim tahsis silindi'
        : fix.kind === 'addPersonFromName' ? `Havuza kişi eklendi: ${fix.name}`
        : 'Risk sahibi havuza bağlandı';
      return appendAudit(next, 'health.fix', summary);
    });
  }, [updateWorkspace]);

  const updateActiveProject = useCallback((updater: (p: Project) => Project) => {
    updateWorkspace(ws => ({
      ...ws,
      projects: ws.projects.map(p =>
        p.id === ws.activeProjectId ? { ...updater(p), updatedAt: new Date().toISOString() } : p
      ),
    }));
  }, [updateWorkspace]);

  type ListField = 'tasks' | 'resources' | 'notes' | 'customerRequests' | 'objectives';
  const makeListSetter = <T,>(field: ListField): React.Dispatch<React.SetStateAction<T[]>> =>
    ((action: React.SetStateAction<T[]>) => {
      updateActiveProject(p => ({
        ...p,
        [field]: typeof action === 'function'
          ? (action as (prev: T[]) => T[])((p[field] as unknown) as T[])
          : action,
      }));
    }) as React.Dispatch<React.SetStateAction<T[]>>;

  const setTasks = makeListSetter<Task>('tasks');
  const setResources = makeListSetter<Resource>('resources');
  const setNotes = makeListSetter<Note>('notes');
  const setCustomerRequests = makeListSetter<CustomerRequest>('customerRequests');
  const setObjectives = makeListSetter<Objective>('objectives');

  const makeProjectSettingSetter = <K extends keyof Project['settings']>(key: K): React.Dispatch<React.SetStateAction<Project['settings'][K]>> =>
    ((action: React.SetStateAction<Project['settings'][K]>) => {
      updateActiveProject(p => ({
        ...p,
        settings: {
          ...p.settings,
          [key]: typeof action === 'function'
            ? (action as (prev: Project['settings'][K]) => Project['settings'][K])(p.settings[key])
            : action,
        },
      }));
    }) as React.Dispatch<React.SetStateAction<Project['settings'][K]>>;

  const setTagColors = makeProjectSettingSetter('tagColors') as React.Dispatch<React.SetStateAction<Record<string, string>>>;
  const setTitleCosts = makeProjectSettingSetter('titleCosts') as React.Dispatch<React.SetStateAction<Record<string, number>>>;
  const setSprintNames = makeProjectSettingSetter('sprintNames') as React.Dispatch<React.SetStateAction<Record<number, string>>>;
  const setGlobalTestDays = makeProjectSettingSetter('globalTestDays') as React.Dispatch<React.SetStateAction<number | undefined>>;
  const setManMonthTableColor = makeProjectSettingSetter('manMonthTableColor');
  const setCostTableColor = makeProjectSettingSetter('costTableColor');

  // ---- Proje yaşam döngüsü ----
  const handleCreateProject = useCallback((name: string) => {
    updateWorkspace(ws => {
      const project = createProject(name);
      project.settings.manMonthTableColor = THEME_COLORS[ws.settings.theme || 'classic'];
      // Oluşturan PM ise projeyi ona sahiplendir (RBAC kapsamı)
      if (ws.currentRole === 'py' && ws.currentPersonId) project.pmPersonId = ws.currentPersonId;
      const next = { ...ws, projects: [...ws.projects, project], activeProjectId: project.id };
      return appendAudit(next, 'project.create', `"${name}" projesi oluşturuldu`, project.id);
    });
    setCurrentView(View.Roadmap);
  }, [updateWorkspace]);

  const handleSetProjectOwner = useCallback((projectId: string, personId: string | undefined) => {
    updateWorkspace(ws => {
      const project = ws.projects.find(p => p.id === projectId);
      const ownerName = personId ? (() => { const o = ws.people.find(p => p.id === personId); return o ? `${o.firstName} ${o.lastName}`.trim() : personId; })() : 'boş';
      const next = {
        ...ws,
        projects: ws.projects.map(p => p.id === projectId ? { ...p, pmPersonId: personId, updatedAt: new Date().toISOString() } : p),
      };
      return appendAudit(next, 'project.owner', `"${project?.name || projectId}" sahibi: ${ownerName}`, projectId);
    });
  }, [updateWorkspace]);

  const handleOpenProject = useCallback((projectId: string) => {
    updateWorkspace(ws => ({ ...ws, activeProjectId: projectId }));
    setCurrentView(View.Roadmap);
  }, [updateWorkspace]);

  const handleDeleteProject = useCallback((projectId: string) => {
    updateWorkspace(ws => {
      const removed = ws.projects.find(p => p.id === projectId);
      const projects = ws.projects.filter(p => p.id !== projectId);
      const next = {
        ...ws,
        projects,
        activeProjectId: ws.activeProjectId === projectId ? (projects[0]?.id ?? null) : ws.activeProjectId,
      };
      return appendAudit(next, 'project.delete', `"${removed?.name || projectId}" projesi silindi`);
    });
  }, [updateWorkspace]);

  const handleRenameProject = useCallback((projectId: string, name: string) => {
    updateWorkspace(ws => ({
      ...ws,
      projects: ws.projects.map(p => p.id === projectId ? { ...p, name, updatedAt: new Date().toISOString() } : p),
    }));
  }, [updateWorkspace]);

  const handleSetProjectRag = useCallback((projectId: string, rag: RagStatus | undefined, ragNote?: string) => {
    updateWorkspace(ws => ({
      ...ws,
      projects: ws.projects.map(p => p.id === projectId ? { ...p, rag, ragNote: ragNote ?? p.ragNote, updatedAt: new Date().toISOString() } : p),
    }));
  }, [updateWorkspace]);

  const handleSetProjectStatus = useCallback((projectId: string, status: ProjectStatus) => {
    updateWorkspace(ws => ({
      ...ws,
      projects: ws.projects.map(p => p.id === projectId ? { ...p, status, updatedAt: new Date().toISOString() } : p),
    }));
  }, [updateWorkspace]);

  // ---- Kimlik / RBAC ----
  const handleChangeIdentity = useCallback((role: UserRole, personId?: string) => {
    updateWorkspace(ws => {
      const next = { ...ws, currentRole: role, currentPersonId: personId };
      // Kapsam değişince görünmeyen bir proje aktifse ilk görünür projeye/portföye geç
      const visible = visibleProjectIds(next, { role, personId });
      if (next.activeProjectId && !visible.has(next.activeProjectId)) {
        next.activeProjectId = null;
      }
      const who = personId ? (() => { const p = next.people.find(x => x.id === personId); return p ? ` (${p.firstName} ${p.lastName})`.trimEnd() : ''; })() : '';
      return appendAudit(next, 'identity.change', `Kimlik: ${ROLE_LABELS[role]}${who}`);
    });
    // Yönetici rolüne geçişte PM'e özel ekranlardan çık
    if (isExecRole(role)) {
      setCurrentView(prev => (prev === View.Notes || prev === View.Requests || prev === View.AI ? View.Executive : prev));
    }
  }, [updateWorkspace]);

  const handleSetAllocationCell = useCallback((allocationId: string, field: EffortField, month: number, value: number | undefined) => {
    updateWorkspace(ws => setAllocationCell(ws, allocationId, field, month, value));
  }, [updateWorkspace]);

  const handleAddAllocation = useCallback((personId: string, projectId: string, year: number, workPackageId?: string, role?: string) => {
    updateWorkspace(ws => {
      const created = createAllocation(ws.allocations, personId, projectId, year, workPackageId, role);
      if (!created) {
        alert('Bu kişi + proje + iş paketi + rol kombinasyonu için bu yılda zaten bir satır var.');
        return ws;
      }
      return { ...ws, allocations: [...ws.allocations, created] };
    });
  }, [updateWorkspace]);

  const handleDeleteAllocation = useCallback((allocationId: string) => {
    updateWorkspace(ws => ({ ...ws, allocations: ws.allocations.filter(a => a.id !== allocationId) }));
  }, [updateWorkspace]);

  const handleLockAction = useCallback((projectId: string, year: number, status: PlanLockStatus) => {
    updateWorkspace(ws => {
      const projectName = ws.projects.find(p => p.id === projectId)?.name || 'Proje';
      const prev = getPlanLockStatus(ws.planLocks, projectId, year);
      let next = { ...ws, planLocks: upsertPlanLock(ws.planLocks, projectId, year, status, ws.currentRole) };
      if (status === 'locked') {
        // Onaylanan plan = baseline: kilit anında otomatik anlık görüntü al
        next = addSnapshot(next, buildSnapshot(next, year, `Onaylı plan — ${projectName}`, 'lock'));
      }
      // Denetim: geçişe göre aksiyon
      const action = status === 'submitted' ? 'plan.submit'
        : status === 'locked' ? 'plan.approve'
        : prev === 'submitted' ? 'plan.reject' // submitted → draft = ret
        : 'plan.unlock'; // locked → draft = kilit açma
      return appendAudit(next, action, `${projectName} · ${year} planı — ${AUDIT_ACTION_LABELS[action]}`, projectId);
    });
  }, [updateWorkspace]);

  const handleApplySuggestions = useCallback((projectId: string, year: number, suggestions: AllocationSuggestion[], mode: ApplyMode) => {
    updateWorkspace(ws => {
      const { workspace: next, applied, skippedCells } = applyAllocationSuggestions(ws, projectId, year, suggestions, mode);
      alert(`Görev planından tahsis uygulandı: ${applied} kişi güncellendi${skippedCells > 0 ? `, ${skippedCells} dolu ay korundu` : ''}.`);
      return next;
    });
  }, [updateWorkspace]);

  const handleTakeSnapshot = useCallback((year: number) => {
    updateWorkspace(ws => {
      const label = `Manuel — ${new Date().toLocaleDateString('tr-TR')}`;
      return addSnapshot(ws, buildSnapshot(ws, year, label, 'manual'));
    });
  }, [updateWorkspace]);

  const handleApplyPoolImport = useCallback((imported: PoolImportResult) => {
    updateWorkspace(ws => {
      const { workspace: next, summary } = applyPoolImport(ws, imported);
      const lines = [
        `Personel: ${summary.peopleAdded} yeni, ${summary.peopleUpdated} güncellendi`,
        `Bölüm: ${summary.departmentsAdded} yeni · Rol: ${summary.rolesAdded} yeni · Ünvan: ${summary.titlesAdded} yeni`,
        `Proje: ${summary.projectsCreated} oluşturuldu, ${summary.projectsMatched} eşleşti · İP: ${summary.workPackagesAdded} yeni`,
        `Tahsis: ${summary.allocationsAdded} yeni, ${summary.allocationsUpdated} güncellendi`,
      ];
      if (summary.warnings.length) {
        lines.push('', `Uyarılar (${summary.warnings.length}):`, ...summary.warnings.slice(0, 6));
        if (summary.warnings.length > 6) lines.push(`… ve ${summary.warnings.length - 6} uyarı daha`);
      }
      alert(`Excel içe aktarma tamamlandı.\n\n${lines.join('\n')}`);
      return appendAudit(next, 'data.import', `Excel havuz içe aktarımı: ${summary.peopleAdded}+${summary.peopleUpdated} personel, ${summary.allocationsAdded}+${summary.allocationsUpdated} tahsis`);
    });
  }, [updateWorkspace]);

  // ---- Yedekleme / içe aktarma ----
  const handleSaveProject = useCallback(() => {
    if (!workspace) return;
    const jsonString = serializeWorkspace(workspace);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-asistan-calisma-alani-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [workspace]);

  const handleLoadProject = useCallback((file: File) => {
    if (!file || file.type !== 'application/json') {
      alert('Lütfen geçerli bir JSON yedek dosyası seçin.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        alert('Dosya içeriği okunamadı.');
        return;
      }
      const result = parseImportedJson(text, file.name.replace(/\.json$/i, ''));
      if (result.kind === 'invalid') {
        alert(`Yedek yüklenemedi: ${result.error}`);
        return;
      }
      if (result.kind === 'workspace') {
        const incoming = result.workspace;
        const ok = window.confirm(
          `Bu dosya ${incoming.projects.length} proje içeren bir çalışma alanı yedeği. Mevcut çalışma alanının TAMAMI bu yedekle değiştirilecek. Devam edilsin mi?`
        );
        if (!ok) return;
        setWorkspace(incoming);
        setCurrentView(View.Portfolio);
        return;
      }
      // Eski tek proje yedeği: mevcut çalışma alanına yeni proje olarak eklenir
      updateWorkspace(ws => appendAudit({
        ...ws,
        projects: [...ws.projects, result.project],
        activeProjectId: result.project.id,
      }, 'data.import', `JSON yedeğinden proje eklendi: "${result.project.name}"`, result.project.id));
      setCurrentView(View.Roadmap);
      alert(`"${result.project.name}" çalışma alanına yeni proje olarak eklendi.`);
    };
    reader.readAsText(file);
  }, [updateWorkspace]);

  const handleResetData = useCallback(() => {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.location.reload();
  }, []);

  const handleSaveSettings = (newDuration: number, newDate: string, enabled: boolean, aiEnabled: boolean, newTheme: string, dark: boolean) => {
    updateWorkspace(ws => ({
      ...ws,
      settings: {
        ...ws.settings,
        isLocalPersistenceEnabled: enabled,
        isAIEnabled: aiEnabled,
        theme: newTheme,
        isDarkMode: dark,
      },
    }));
    if (activeProject) {
      updateActiveProject(p => ({
        ...p,
        settings: {
          ...p.settings,
          sprintDuration: newDuration,
          projectStartDate: newDate,
          manMonthTableColor: THEME_COLORS[newTheme] || THEME_COLORS.classic,
        },
      }));
    }
    setIsSettingsModalOpen(false);
  };

  const handleUpdateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

  const renderView = () => {
    if (!isInitialized || !workspace) {
      return <div className="h-[60vh] flex items-center justify-center"><i className="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i></div>;
    }

    const execRole = isExecRole(workspace.currentRole);

    // Rol bazlı yetkilendirme: yönetici rolleri PM'e özel ekranları (Günlük,
    // İstekler, Zekâ) göremez — doğrudan yönetim ekranına yönlendirilir.
    if (currentView === View.Executive ||
        (execRole && (currentView === View.Notes || currentView === View.Requests || currentView === View.AI))) {
      return (
        <ExecutiveView
          workspace={workspace}
          currentRole={workspace.currentRole || 'py'}
          onOpenProject={handleOpenProject}
          onTakeSnapshot={handleTakeSnapshot}
        />
      );
    }

    // Çalışma alanı seviyesi ekranlar (aktif proje gerektirmez)
    if (currentView === View.DataPool) {
      return (
        <DataPoolView
          people={workspace.people}
          departments={workspace.departments}
          roleCatalog={workspace.roleCatalog}
          titles={workspace.titles}
          currentRole={workspace.currentRole || 'py'}
          onUpdatePeople={(people) => updateWorkspace(ws => ({ ...ws, people }))}
          onUpdateDepartments={(departments) => updateWorkspace(ws => ({ ...ws, departments }))}
          onUpdateRoleCatalog={(roleCatalog) => updateWorkspace(ws => ({ ...ws, roleCatalog }))}
          onUpdateTitles={(titles) => updateWorkspace(ws => ({ ...ws, titles }))}
          onApplyImport={handleApplyPoolImport}
          onViewPerson={setViewingPersonId}
        />
      );
    }
    if (currentView === View.Allocations) {
      return (
        <AllocationView
          allocations={workspace.allocations}
          people={workspace.people}
          projects={workspace.projects}
          planLocks={workspace.planLocks}
          currentRole={workspace.currentRole || 'py'}
          identity={identity}
          onSetCell={handleSetAllocationCell}
          onAddAllocation={handleAddAllocation}
          onDeleteAllocation={handleDeleteAllocation}
          onLockAction={handleLockAction}
          onApplySuggestions={handleApplySuggestions}
        />
      );
    }

    // Aktif proje yoksa tek anlamlı ekran portföydür
    if (!activeProject || currentView === View.Portfolio) {
      return (
        <PortfolioView
          projects={visibleProjects}
          activeProjectId={workspace.activeProjectId}
          identity={identity}
          people={workspace.people}
          needsPerson={needsPerson}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onSetRag={handleSetProjectRag}
          onSetStatus={handleSetProjectStatus}
          onSetOwner={handleSetProjectOwner}
        />
      );
    }

    const { tasks, resources, notes, customerRequests, objectives } = activeProject;
    const ps = activeProject.settings;

    switch (currentView) {
      case View.AI: return <AIAssistant tasks={tasks} resources={resources} notes={notes} />;
      case View.Tasks:
        return (
          <TaskGallery
            tasks={tasks} resources={resources}
            onEditTask={(t) => { setEditingTask(t); setIsFormModalOpen(true); }} onViewTask={(t) => { setViewingTask(t); setIsDetailModalOpen(true); }}
            onNotifyTask={(t) => { setTeamsTask(t); setIsTeamsModalOpen(true); }} onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
            onDeleteTask={(taskId) => { if(window.confirm('Emin misiniz?')) setTasks(prev => prev.filter(t => t.id !== taskId)); }}
            onDataImport={(nt, nr) => { setTasks(prev => [...prev, ...nt]); setResources(prev => [...prev, ...nr]); }}
            onTaskStatusChange={(id, s) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: s } : t))}
          />
        );
      case View.Resources:
        return (
          <ResourceManager
            resources={resources} setResources={setResources} tasks={tasks} setTasks={setTasks}
            titleCosts={ps.titleCosts || {}} setTitleCosts={setTitleCosts}
            manMonthTableColor={ps.manMonthTableColor || THEME_COLORS[settings?.theme || 'classic']}
            setManMonthTableColor={(color) => setManMonthTableColor(color)}
            costTableColor={ps.costTableColor || '#10b981'}
            setCostTableColor={(color) => setCostTableColor(color)}
          />
        );
      case View.Kanban:
        return (
          <KanbanView
            tasks={tasks} resources={resources}
            sprintDuration={ps.sprintDuration} projectStartDate={ps.projectStartDate}
            sprintNames={ps.sprintNames || {}} setSprintNames={setSprintNames}
            globalTestDays={ps.globalTestDays || 4} setGlobalTestDays={setGlobalTestDays as React.Dispatch<React.SetStateAction<number>>}
            onPlanGenerated={setTasks} onTaskSprintChange={(id, v) => setTasks(prev => prev.map(t => t.id === id ? { ...t, version: v } : t))}
            onTaskStatusChange={(id, s) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: s } : t))}
            onInsertSprint={(n) => setTasks(prev => prev.map(t => t.version >= n ? { ...t, version: t.version + 1 } : t))}
            onDeleteSprint={(n) => setTasks(prev => prev.map(t => t.version === n ? { ...t, version: 0, status: TaskStatus.Backlog } : t.version > n ? { ...t, version: t.version - 1 } : t))}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
            onViewTaskDetails={(taskId) => { const t = tasks.find(x => x.id === taskId); if(t) { setViewingTask(t); setIsDetailModalOpen(true); } }}
          />
        );
      case View.Roadmap:
        return (
          <RoadmapView
            tasks={tasks}
            resources={resources}
            onTaskStatusChange={(id, s) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: s } : t))}
            onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
            onViewTask={(t) => { setViewingTask(t); setIsDetailModalOpen(true); }}
            onEditTask={(t) => { setEditingTask(t); setIsFormModalOpen(true); }}
            onDeleteTask={(taskId) => { if(window.confirm('Emin misiniz?')) setTasks(prev => prev.filter(t => t.id !== taskId)); }}
          />
        );
      case View.Goals:
        return <GoalsView
                 objectives={objectives}
                 tasks={tasks}
                 onUpdateObjectives={setObjectives}
               />;
      case View.Risks:
        return (
          <RiskView
            projectName={activeProject.name}
            risks={activeProject.risks || []}
            people={workspace.people}
            canEdit={canEditProjectContent(workspace, identity, activeProject.id)}
            onUpdateRisks={(risks: Risk[]) => updateActiveProject(p => ({ ...p, risks }))}
          />
        );
      case View.Notes:
        return (
          <NotesView
            notes={notes} resources={resources} tagColors={ps.tagColors || {}} setTagColors={setTagColors}
            onAddNote={(n) => setNotes(prev => [n, ...prev])} onEditNote={(n) => setNotes(prev => prev.map(x => x.id === n.id ? n : x))} onDeleteNote={(id) => setNotes(prev => prev.filter(x => x.id !== id))}
          />
        );
      case View.Requests:
        return (
          <CustomerRequestsView
            requests={customerRequests} setRequests={setCustomerRequests}
            onConvertToTask={(r) => { setEditingTask({ id: `req-${r.id}`, name: r.title, status: TaskStatus.Backlog, version: 0, priority: 'Medium', unit: 'Müşteri', resourceName: resources[0]?.name || '', time: { best: 0, avg: 0, worst: 0 }, notes: r.description, jiraId: '', availability: false, predecessor: null, includeInSprints: true }); setIsFormModalOpen(true); }}
          />
        );
      default:
        return null;
    }
  };

  const isFullWidthView = currentView === View.Roadmap && !!activeProject;
  // Header tek satır 4rem; proje seçiliyken bağlam çubuğuyla 6.75rem
  const showProjectBar = !!activeProject;
  const mainHeightClass = showProjectBar ? 'h-[calc(100vh-6.75rem)]' : 'h-[calc(100vh-4rem)]';

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans theme-${settings?.theme || 'classic'}`}>
      <Header
        currentView={currentView} setCurrentView={setCurrentView}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        isLocalPersistenceEnabled={settings?.isLocalPersistenceEnabled !== false}
        isAIEnabled={settings?.isAIEnabled !== false}
        onOpenAbout={() => setIsAboutModalOpen(true)}
        projects={visibleProjects.map(p => ({ id: p.id, name: p.name, rag: p.rag }))}
        activeProjectId={activeProject?.id ?? null}
        onSelectProject={handleOpenProject}
        currentRole={workspace?.currentRole || 'py'}
        currentPersonId={workspace?.currentPersonId}
        people={(workspace?.people || []).map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), initials: `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`, departmentCode: p.departmentCode }))}
        identityNeedsPerson={needsPerson}
        onChangeIdentity={handleChangeIdentity}
        cloudLinked={!!loadCloudConfig()?.workspaceId}
        onOpenCloudSync={() => setIsCloudModalOpen(true)}
        todoItems={todoItems}
        onTodoNavigate={handleTodoNavigate}
        onOpenStatusReport={() => setIsStatusReportOpen(true)}
        dataHealthAlerts={healthAlerts}
        onOpenDataHealth={() => setIsHealthModalOpen(true)}
        onOpenAuditLog={() => setIsAuditModalOpen(true)}
      />
      <main className={`w-full max-w-[1920px] mx-auto ${isFullWidthView ? mainHeightClass : `px-4 sm:px-6 lg:px-8 py-6 ${mainHeightClass} overflow-auto`}`}>
        {renderView()}
      </main>

      {isFormModalOpen && activeProject && workspace && <TaskFormModal task={editingTask} resources={activeProject.resources} people={workspace.people} tasks={activeProject.tasks} objectives={activeProject.objectives} onClose={() => setIsFormModalOpen(false)} onSave={(t) => {
          updateActiveProject(p => {
            const tasks = p.tasks.some(x => x.id === t.id) ? p.tasks.map(x => x.id === t.id ? t : x) : [...p.tasks, t];
            // Havuzdan atanan kişi proje kaynağı değilse otomatik ekle (isim eşleşmesi korunur)
            let resources = p.resources;
            const assignee = t.resourceName?.trim();
            if (assignee && !resources.some(r => r.name.trim().toLocaleLowerCase('tr-TR') === assignee.toLocaleLowerCase('tr-TR'))) {
              const person = workspace.people.find(pp => `${pp.firstName} ${pp.lastName}`.trim().toLocaleLowerCase('tr-TR') === assignee.toLocaleLowerCase('tr-TR'));
              if (person) {
                resources = [...resources, {
                  id: `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                  name: assignee,
                  participation: 100,
                  unit: person.departmentCode || t.unit || '',
                  title: person.titleCode || 'Uzman',
                }];
              }
            }
            return { ...p, tasks, resources };
          });
          setIsFormModalOpen(false);
      }} />}
      {isDetailModalOpen && viewingTask && <TaskDetailModal task={viewingTask} onClose={() => setIsDetailModalOpen(false)} onEdit={(t) => { setIsDetailModalOpen(false); setEditingTask(t); setIsFormModalOpen(true); }} onSave={handleUpdateTask} />}
      {isTeamsModalOpen && teamsTask && <TeamsMessageModal task={teamsTask} onClose={() => setIsTeamsModalOpen(false)} />}
      {isSettingsModalOpen && (
        <SettingsModal
          sprintDuration={activeProject?.settings.sprintDuration ?? 3}
          projectStartDate={activeProject?.settings.projectStartDate ?? new Date().toISOString().split('T')[0]}
          isLocalPersistenceEnabled={settings?.isLocalPersistenceEnabled !== false}
          isAIEnabled={settings?.isAIEnabled !== false}
          currentTheme={settings?.theme || 'classic'}
          isDarkMode={settings?.isDarkMode || false}
          onSave={handleSaveSettings} onClose={() => setIsSettingsModalOpen(false)} onResetData={handleResetData}
        />
      )}
      {isAboutModalOpen && <AboutModal onClose={() => setIsAboutModalOpen(false)} />}
      {isCloudModalOpen && workspace && (
        <CloudSyncModal
          workspace={workspace}
          onReplaceWorkspace={(updater) => setWorkspace(prev => (prev ? updater(prev) : prev))}
          onClose={() => setIsCloudModalOpen(false)}
        />
      )}
      {viewingPersonId && workspace && (
        <PersonDetailModal
          workspace={workspace}
          personId={viewingPersonId}
          onClose={() => setViewingPersonId(null)}
        />
      )}
      {isHealthModalOpen && workspace && (
        <DataHealthModal
          workspace={workspace}
          onApplyFix={handleApplyHealthFix}
          onClose={() => setIsHealthModalOpen(false)}
        />
      )}
      {isAuditModalOpen && workspace && (
        <AuditLogModal
          workspace={workspace}
          onClose={() => setIsAuditModalOpen(false)}
        />
      )}
      {isStatusReportOpen && workspace && activeProject && (
        <StatusReportModal
          workspace={workspace}
          projectId={activeProject.id}
          onClose={() => setIsStatusReportOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
