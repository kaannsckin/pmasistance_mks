
import React, { useState, useCallback, useEffect } from 'react';
import { View, Task, Resource, TaskStatus, WorkPackage, Note, ProjectData, CustomerRequest } from './types';
import { INITIAL_TASKS, INITIAL_RESOURCES, INITIAL_WORK_PACKAGES } from './constants';
import Header from './components/Header';
import TaskGallery from './components/TaskGallery';
import ResourceManager from './components/ResourceManager';
import WorkPackageManager from './components/WorkPackageManager';
import TaskFormModal from './components/TaskFormModal';
import TaskDetailModal from './components/TaskDetailModal';
import TeamsMessageModal from './components/TeamsMessageModal';
import KanbanView from './components/KanbanView';
import SettingsModal from './components/SettingsModal';
import NotesView from './components/NotesView';
import AboutModal from './components/AboutModal';
import CustomerRequestsView from './components/CustomerRequestsView';
import AIAssistant from './components/AIAssistant';

const STORAGE_KEY = 'PROJE_PLANLAMA_DATA';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.Kanban);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [workPackages, setWorkPackages] = useState<WorkPackage[]>([]);
  const [notes, setNotes] = useState<Note[]>([]); 
  const [customerRequests, setCustomerRequests] = useState<CustomerRequest[]>([]);
  
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [pendingRequest, setPendingRequest] = useState<CustomerRequest | null>(null);
  
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);
  const [teamsTask, setTeamsTask] = useState<Task | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [sprintDuration, setSprintDuration] = useState(3);
  const [projectStartDate, setProjectStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLocalPersistenceEnabled, setIsLocalPersistenceEnabled] = useState(true);
  const [isAIEnabled, setIsAIEnabled] = useState(true);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [titleCosts, setTitleCosts] = useState<Record<string, number>>({});
  const [sprintNames, setSprintNames] = useState<Record<number, string>>({});
  const [globalTestDays, setGlobalTestDays] = useState(4);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData) as ProjectData;
        setTasks(parsed.tasks || []);
        const resourcesWithTitle = (parsed.resources || []).map(r => ({ ...r, title: r.title || 'Ünvan Belirtilmemiş' }));
        setResources(resourcesWithTitle);
        setWorkPackages(parsed.workPackages || []);
        setNotes(parsed.notes || []);
        setCustomerRequests(parsed.customerRequests || []);
        if (parsed.settings) {
          setSprintDuration(parsed.settings.sprintDuration);
          setProjectStartDate(parsed.settings.projectStartDate);
          setIsLocalPersistenceEnabled(parsed.settings.isLocalPersistenceEnabled !== false);
          setIsAIEnabled(parsed.settings.isAIEnabled !== false);
          setTagColors(parsed.settings.tagColors || {});
          setTitleCosts(parsed.settings.titleCosts || {});
          setSprintNames(parsed.settings.sprintNames || {});
          setGlobalTestDays(parsed.settings.globalTestDays || 4);
        }
      } catch (e) {
        console.error("Yükleme hatası:", e);
      }
    } else {
      setTasks(INITIAL_TASKS);
      setResources(INITIAL_RESOURCES.map(r => ({ ...r, title: 'Uzman' })));
      setWorkPackages(INITIAL_WORK_PACKAGES);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      const dataToSave: ProjectData = {
        tasks: isLocalPersistenceEnabled ? tasks : [],
        resources: isLocalPersistenceEnabled ? resources : [],
        workPackages: isLocalPersistenceEnabled ? workPackages : [],
        notes: isLocalPersistenceEnabled ? notes : [],
        customerRequests: isLocalPersistenceEnabled ? customerRequests : [],
        settings: { 
          sprintDuration, 
          projectStartDate, 
          isLocalPersistenceEnabled,
          isAIEnabled,
          tagColors,
          titleCosts,
          sprintNames,
          globalTestDays
        },
        appVersion: '1.6.0',
        exportDate: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [tasks, resources, workPackages, notes, customerRequests, sprintDuration, projectStartDate, isLocalPersistenceEnabled, isAIEnabled, tagColors, titleCosts, sprintNames, globalTestDays, isInitialized]);

  const handleResetData = useCallback(() => {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload(); 
  }, []);

  const handleOpenForm = useCallback((task: Task | null) => {
    setEditingTask(task);
    setIsFormModalOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setEditingTask(null);
    setPendingRequest(null);
    setIsFormModalOpen(false);
  }, []);

  const handleSaveTask = useCallback((taskToSave: Task) => {
    const isExisting = tasks.some(t => t.id === taskToSave.id);
    if (isExisting) {
      setTasks(tasks.map(t => t.id === taskToSave.id ? taskToSave : t));
    } else {
      setTasks([...tasks, { ...taskToSave, id: taskToSave.id || Date.now().toString() }]);
    }
    handleCloseForm();
  }, [tasks, handleCloseForm]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (window.confirm('Bu görevi silmek istediğinize emin misiniz?')) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  }, []);

  const handleOpenDetails = useCallback((task: Task) => {
    setViewingTask(task);
    setIsDetailModalOpen(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setViewingTask(null);
    setIsDetailModalOpen(false);
  }, []);

  const handleEditFromDetails = useCallback((task: Task) => {
    handleCloseDetails();
    handleOpenForm(task);
  }, [handleCloseDetails, handleOpenForm]);

  const handleOpenTeamsModal = useCallback((task: Task) => {
    setTeamsTask(task);
    setIsTeamsModalOpen(true);
  }, []);

  const handleCloseTeamsModal = useCallback(() => {
    setTeamsTask(null);
    setIsTeamsModalOpen(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);

  const handleSaveSettings = (newDuration: number, newDate: string, enabled: boolean, aiEnabled: boolean) => {
    setSprintDuration(newDuration);
    setProjectStartDate(newDate);
    setIsLocalPersistenceEnabled(enabled);
    setIsAIEnabled(aiEnabled);
    setIsSettingsModalOpen(false);
  };

  // Add the missing onDataImport handler
  const handleDataImport = useCallback((newTasks: Task[], newResources: Resource[]) => {
    setTasks(prev => [...prev, ...newTasks]);
    setResources(prev => {
      const existingNames = new Set(prev.map(r => r.name.toLowerCase()));
      const uniqueNew = newResources.filter(r => !existingNames.has(r.name.toLowerCase()));
      return [...prev, ...uniqueNew];
    });
  }, []);

  const renderView = () => {
    if (!isInitialized) return <div className="h-[60vh] flex items-center justify-center"><i className="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i></div>;
    
    switch (currentView) {
      case View.AI: return <AIAssistant tasks={tasks} resources={resources} notes={notes} />;
      case View.Tasks:
        return (
          <TaskGallery
            tasks={tasks} resources={resources} workPackages={workPackages}
            onEditTask={handleOpenForm} onViewTask={handleOpenDetails}
            onNotifyTask={handleOpenTeamsModal} onNewTask={() => handleOpenForm(null)}
            onDeleteTask={handleDeleteTask}
            onDataImport={handleDataImport}
            onTaskStatusChange={(id, s) => setTasks(tasks.map(t => t.id === id ? { ...t, status: s } : t))}
          />
        );
      case View.Resources:
        return (
          <ResourceManager 
            resources={resources} 
            setResources={setResources} 
            tasks={tasks}
            setTasks={setTasks}
            titleCosts={titleCosts}
            setTitleCosts={setTitleCosts}
          />
        );
      case View.WorkPackages:
        return <WorkPackageManager workPackages={workPackages} setWorkPackages={setWorkPackages} onDeleteWorkPackage={(id) => setWorkPackages(workPackages.filter(wp => wp.id !== id))}/>;
      case View.Kanban:
        return (
          <KanbanView
            tasks={tasks} resources={resources} workPackages={workPackages}
            sprintDuration={sprintDuration} projectStartDate={projectStartDate}
            sprintNames={sprintNames} setSprintNames={setSprintNames}
            globalTestDays={globalTestDays} setGlobalTestDays={setGlobalTestDays}
            onPlanGenerated={setTasks} onTaskSprintChange={(id, v) => setTasks(tasks.map(t => t.id === id ? { ...t, version: v } : t))}
            onTaskStatusChange={(id, s) => setTasks(tasks.map(t => t.id === id ? { ...t, status: s } : t))} 
            onInsertSprint={(n) => setTasks(tasks.map(t => t.version >= n ? { ...t, version: t.version + 1 } : t))}
            onDeleteSprint={(n) => setTasks(tasks.map(t => t.version === n ? { ...t, version: 0, status: TaskStatus.Backlog } : t.version > n ? { ...t, version: t.version - 1 } : t))} 
            onOpenSettings={handleOpenSettings}
            onNewTask={() => handleOpenForm(null)}
            onViewTaskDetails={(taskId) => { const t = tasks.find(x => x.id === taskId); if(t) handleOpenDetails(t); }}
          />
        );
      case View.Notes:
        return (
          <NotesView 
            notes={notes} resources={resources} 
            tagColors={tagColors} setTagColors={setTagColors}
            onAddNote={(n) => setNotes([n, ...notes])}
            onEditNote={(n) => setNotes(notes.map(x => x.id === n.id ? n : x))} 
            onDeleteNote={(id) => setNotes(notes.filter(x => x.id !== id))}
          />
        );
      case View.Requests:
        return (
          <CustomerRequestsView 
            requests={customerRequests} 
            setRequests={setCustomerRequests} 
            onConvertToTask={(r) => handleOpenForm({ id: `req-${r.id}`, name: r.title, status: TaskStatus.Backlog, version: 0, priority: 'Medium', unit: 'Müşteri', resourceName: resources[0]?.name || '', time: { best: 0, avg: 0, worst: 0 }, notes: r.description, jiraId: '', availability: false, predecessor: null, includeInSprints: true })}
          />
        );
      default: return <KanbanView {...{tasks, resources, workPackages, sprintDuration, projectStartDate, sprintNames, setSprintNames, globalTestDays, setGlobalTestDays, onPlanGenerated: setTasks, onTaskSprintChange: (id, v) => {}, onTaskStatusChange: (id, s) => {}, onInsertSprint: (n) => {}, onDeleteSprint: (n) => {}, onOpenSettings: handleOpenSettings, onNewTask: () => {}, onViewTaskDetails: (id) => {} }} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      <Header 
        currentView={currentView} setCurrentView={setCurrentView} 
        onOpenSettings={handleOpenSettings} onSaveProject={() => {}} onLoadProject={() => {}}
        isLocalPersistenceEnabled={isLocalPersistenceEnabled}
        isAIEnabled={isAIEnabled}
        onOpenAbout={() => setIsAboutModalOpen(true)}
      />
      <main className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {renderView()}
      </main>
      
      {isFormModalOpen && <TaskFormModal task={editingTask} resources={resources} tasks={tasks} workPackages={workPackages} onClose={handleCloseForm} onSave={handleSaveTask} />}
      {isDetailModalOpen && viewingTask && <TaskDetailModal task={viewingTask} workPackages={workPackages} onClose={handleCloseDetails} onEdit={handleEditFromDetails} />}
      {isTeamsModalOpen && teamsTask && <TeamsMessageModal task={teamsTask} onClose={handleCloseTeamsModal} />}
      {isSettingsModalOpen && (
        <SettingsModal 
          sprintDuration={sprintDuration} projectStartDate={projectStartDate} isLocalPersistenceEnabled={isLocalPersistenceEnabled} isAIEnabled={isAIEnabled}
          onSave={handleSaveSettings} onClose={() => setIsSettingsModalOpen(false)} onResetData={handleResetData} 
        />
      )}
      {isAboutModalOpen && <AboutModal onClose={() => setIsAboutModalOpen(false)} />}
    </div>
  );
};

export default App;
