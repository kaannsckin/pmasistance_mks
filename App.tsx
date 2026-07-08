
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Task, Resource, TaskStatus, Note, CustomerRequest, Objective, Project, WorkspaceData, RagStatus, ProjectStatus } from './types';
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

  const [isInitialized, setIsInitialized] = useState(false);

  // ---- Açılış: v2 workspace → v1 migration → örnek proje sırasıyla çözülür ----
  useEffect(() => {
    const { workspace: resolved } = resolveWorkspaceFromStorage(
      localStorage.getItem(WORKSPACE_STORAGE_KEY),
      localStorage.getItem(LEGACY_STORAGE_KEY)
    );
    if (resolved) {
      setWorkspace(resolved);
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
  }, [workspace, isInitialized]);

  // ---- Merkezi güncelleme yardımcıları ----
  const updateWorkspace = useCallback((updater: (ws: WorkspaceData) => WorkspaceData) => {
    setWorkspace(prev => (prev ? updater(prev) : prev));
  }, []);

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
    const project = createProject(name);
    project.settings.manMonthTableColor = THEME_COLORS[settings?.theme || 'classic'];
    updateWorkspace(ws => ({ ...ws, projects: [...ws.projects, project], activeProjectId: project.id }));
    setCurrentView(View.Roadmap);
  }, [updateWorkspace, settings?.theme]);

  const handleOpenProject = useCallback((projectId: string) => {
    updateWorkspace(ws => ({ ...ws, activeProjectId: projectId }));
    setCurrentView(View.Roadmap);
  }, [updateWorkspace]);

  const handleDeleteProject = useCallback((projectId: string) => {
    updateWorkspace(ws => {
      const projects = ws.projects.filter(p => p.id !== projectId);
      return {
        ...ws,
        projects,
        activeProjectId: ws.activeProjectId === projectId ? (projects[0]?.id ?? null) : ws.activeProjectId,
      };
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
      updateWorkspace(ws => ({
        ...ws,
        projects: [...ws.projects, result.project],
        activeProjectId: result.project.id,
      }));
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

    // Aktif proje yoksa tek anlamlı ekran portföydür
    if (!activeProject || currentView === View.Portfolio) {
      return (
        <PortfolioView
          projects={workspace.projects}
          activeProjectId={workspace.activeProjectId}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onSetRag={handleSetProjectRag}
          onSetStatus={handleSetProjectStatus}
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
        projects={workspace?.projects.map(p => ({ id: p.id, name: p.name, rag: p.rag })) || []}
        activeProjectId={activeProject?.id ?? null}
        onSelectProject={handleOpenProject}
      />
      <main className={`w-full max-w-[1920px] mx-auto ${isFullWidthView ? 'h-[calc(100vh-5rem)]' : 'px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-5rem)] overflow-auto'}`}>
        {renderView()}
      </main>

      {isFormModalOpen && activeProject && <TaskFormModal task={editingTask} resources={activeProject.resources} tasks={activeProject.tasks} objectives={activeProject.objectives} onClose={() => setIsFormModalOpen(false)} onSave={(t) => {
          setTasks(prev => prev.some(x => x.id === t.id) ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]);
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
    </div>
  );
};

export default App;
