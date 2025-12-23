
import React, { useState, useCallback, useEffect } from 'react';
import { View, Task, Resource, TaskStatus, WorkPackage, Note, ProjectData, CustomerRequest, Objective } from './types';
import { INITIAL_TASKS, INITIAL_RESOURCES, INITIAL_WORK_PACKAGES, INITIAL_OBJECTIVES } from './constants';
import Header from './components/Header';
import TaskGallery from './components/TaskGallery';
import ResourceManager from './components/ResourceManager';
import WorkPackageManager from './components/WorkPackageManager';
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

const STORAGE_KEY = 'PROJE_PLANLAMA_DATA';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.Roadmap);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [workPackages, setWorkPackages] = useState<WorkPackage[]>([]);
  const [notes, setNotes] = useState<Note[]>([]); 
  const [customerRequests, setCustomerRequests] = useState<CustomerRequest[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);
  const [teamsTask, setTeamsTask] = useState<Task | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isWpModalOpen, setIsWpModalOpen] = useState(false);
  
  const [sprintDuration, setSprintDuration] = useState(3);
  const [projectStartDate, setProjectStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLocalPersistenceEnabled, setIsLocalPersistenceEnabled] = useState(true);
  const [isAIEnabled, setIsAIEnabled] = useState(true);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [titleCosts, setTitleCosts] = useState<Record<string, number>>({});
  const [sprintNames, setSprintNames] = useState<Record<number, string>>({});
  const [globalTestDays, setGlobalTestDays] = useState(4);
  const [appTheme, setAppTheme] = useState('classic');
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [manMonthTableColor, setManMonthTableColor] = useState('#2563eb');
  const [costTableColor, setCostTableColor] = useState('#10b981');
  
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData) as ProjectData;
        setTasks(parsed.tasks || []);
        setResources(parsed.resources || []);
        setWorkPackages(parsed.workPackages || []);
        setNotes(parsed.notes || []);
        setCustomerRequests(parsed.customerRequests || []);
        setObjectives(parsed.objectives || []);
        if (parsed.settings) {
          setSprintDuration(parsed.settings.sprintDuration);
          setProjectStartDate(parsed.settings.projectStartDate);
          setIsLocalPersistenceEnabled(parsed.settings.isLocalPersistenceEnabled !== false);
          setIsAIEnabled(parsed.settings.isAIEnabled !== false);
          setTagColors(parsed.settings.tagColors || {});
          setTitleCosts(parsed.settings.titleCosts || {});
          setSprintNames(parsed.settings.sprintNames || {});
          setGlobalTestDays(parsed.settings.globalTestDays || 4);
          setAppTheme(parsed.settings.theme || 'classic');
          setIsDarkMode(parsed.settings.isDarkMode || false);
        }
      } catch (e) {
        console.error("Yükleme hatası:", e);
      }
    } else {
      setTasks(INITIAL_TASKS);
      setResources(INITIAL_RESOURCES.map(r => ({ ...r, title: 'Uzman' })));
      setWorkPackages(INITIAL_WORK_PACKAGES);
      setObjectives(INITIAL_OBJECTIVES);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (isInitialized) {
      const dataToSave: ProjectData = {
        tasks: isLocalPersistenceEnabled ? tasks : [],
        resources: isLocalPersistenceEnabled ? resources : [],
        workPackages: isLocalPersistenceEnabled ? workPackages : [],
        notes: isLocalPersistenceEnabled ? notes : [],
        customerRequests: isLocalPersistenceEnabled ? customerRequests : [],
        objectives: isLocalPersistenceEnabled ? objectives : [],
        settings: { 
          sprintDuration, 
          projectStartDate, 
          isLocalPersistenceEnabled,
          isAIEnabled,
          tagColors,
          titleCosts,
          sprintNames,
          globalTestDays,
          manMonthTableColor,
          costTableColor,
          theme: appTheme,
          isDarkMode
        },
        appVersion: '1.9.0',
        exportDate: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [tasks, resources, workPackages, notes, customerRequests, objectives, sprintDuration, projectStartDate, isLocalPersistenceEnabled, isAIEnabled, tagColors, titleCosts, sprintNames, globalTestDays, manMonthTableColor, costTableColor, appTheme, isDarkMode, isInitialized]);

  const handleResetData = useCallback(() => {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload(); 
  }, []);

  const handleSaveSettings = (newDuration: number, newDate: string, enabled: boolean, aiEnabled: boolean, newTheme: string, dark: boolean) => {
    setSprintDuration(newDuration);
    setProjectStartDate(newDate);
    setIsLocalPersistenceEnabled(enabled);
    setIsAIEnabled(aiEnabled);
    setAppTheme(newTheme);
    setIsDarkMode(dark);
    setIsSettingsModalOpen(false);
  };

  const renderView = () => {
    if (!isInitialized) return <div className="h-[60vh] flex items-center justify-center"><i className="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i></div>;
    
    const mainContentClass = `px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-5rem)] overflow-auto`;
    const fullWidthContentClass = 'h-[calc(100vh-5rem)]';

    switch (currentView) {
      case View.AI: return <AIAssistant tasks={tasks} resources={resources} notes={notes} />;
      case View.Tasks:
        return (
          <TaskGallery
            tasks={tasks} resources={resources} workPackages={workPackages}
            onEditTask={(t) => { setEditingTask(t); setIsFormModalOpen(true); }} onViewTask={(t) => { setViewingTask(t); setIsDetailModalOpen(true); }}
            onNotifyTask={(t) => { setTeamsTask(t); setIsTeamsModalOpen(true); }} onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
            onDeleteTask={(taskId) => { if(window.confirm('Emin misiniz?')) setTasks(prev => prev.filter(t => t.id !== taskId)); }}
            onDataImport={(nt, nr) => { setTasks(prev => [...prev, ...nt]); setResources(prev => [...prev, ...nr]); }}
            onTaskStatusChange={(id, s) => setTasks(tasks.map(t => t.id === id ? { ...t, status: s } : t))}
          />
        );
      case View.Resources:
        return (
          <ResourceManager 
            resources={resources} setResources={setResources} tasks={tasks} setTasks={setTasks}
            titleCosts={titleCosts} setTitleCosts={setTitleCosts}
            manMonthTableColor={manMonthTableColor} setManMonthTableColor={setManMonthTableColor}
            costTableColor={costTableColor} setCostTableColor={setCostTableColor}
          />
        );
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
            workPackages={workPackages}
            onTaskStatusChange={(id, s) => setTasks(tasks.map(t => t.id === id ? { ...t, status: s } : t))}
            onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
            onEditTask={(t) => { setEditingTask(t); setIsFormModalOpen(true); }}
          />
        );
      case View.Goals:
        return <GoalsView 
                 objectives={objectives} 
                 tasks={tasks} 
                 workPackages={workPackages}
                 onUpdateObjectives={setObjectives}
                 onOpenWorkPackageEditor={() => setIsWpModalOpen(true)}
               />;
      case View.Notes:
        return (
          <NotesView 
            notes={notes} resources={resources} tagColors={tagColors} setTagColors={setTagColors}
            onAddNote={(n) => setNotes([n, ...notes])} onEditNote={(n) => setNotes(notes.map(x => x.id === n.id ? n : x))} onDeleteNote={(id) => setNotes(notes.filter(x => x.id !== id))}
          />
        );
      case View.Requests:
        return (
          <CustomerRequestsView 
            requests={customerRequests} setRequests={setCustomerRequests} 
            onConvertToTask={(r) => { setEditingTask({ id: `req-${r.id}`, name: r.title, status: TaskStatus.Backlog, version: 0, priority: 'Medium', unit: 'Müşteri', resourceName: resources[0]?.name || '', time: { best: 0, avg: 0, worst: 0 }, notes: r.description, jiraId: '', availability: false, predecessor: null, includeInSprints: true }); setIsFormModalOpen(true); }}
          />
        );
      default: return <KanbanView {...{tasks, resources, workPackages, sprintDuration, projectStartDate, sprintNames, setSprintNames, globalTestDays, setGlobalTestDays, onPlanGenerated: setTasks, onTaskSprintChange: (id, v) => {}, onTaskStatusChange: (id, s) => {}, onInsertSprint: (n) => {}, onDeleteSprint: (n) => {}, onOpenSettings: () => setIsSettingsModalOpen(true), onNewTask: () => {}, onViewTaskDetails: (id) => {} }} />;
    }
  };

  const isFullWidthView = currentView === View.Roadmap;

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans theme-${appTheme}`}>
      <Header 
        currentView={currentView} setCurrentView={setCurrentView} 
        onOpenSettings={() => setIsSettingsModalOpen(true)} onSaveProject={() => {}} onLoadProject={() => {}}
        isLocalPersistenceEnabled={isLocalPersistenceEnabled} isAIEnabled={isAIEnabled}
        onOpenAbout={() => setIsAboutModalOpen(true)}
      />
      <main className={`w-full max-w-[1920px] mx-auto ${isFullWidthView ? 'h-[calc(100vh-5rem)]' : 'px-4 sm:px-6 lg:px-8 py-6 h-[calc(100vh-5rem)] overflow-auto'}`}>
        {renderView()}
      </main>
      
      {isWpModalOpen && (
        <WorkPackageManager 
          isOpen={isWpModalOpen}
          onClose={() => setIsWpModalOpen(false)}
          workPackages={workPackages} 
          setWorkPackages={setWorkPackages}
        />
      )}

      {isFormModalOpen && <TaskFormModal task={editingTask} resources={resources} tasks={tasks} workPackages={workPackages} objectives={objectives} onClose={() => setIsFormModalOpen(false)} onSave={(t) => {
          const isEx = tasks.some(x => x.id === t.id);
          setTasks(isEx ? tasks.map(x => x.id === t.id ? t : x) : [...tasks, t]);
          setIsFormModalOpen(false);
      }} />}
      {isDetailModalOpen && viewingTask && <TaskDetailModal task={viewingTask} workPackages={workPackages} onClose={() => setIsDetailModalOpen(false)} onEdit={(t) => { setIsDetailModalOpen(false); setEditingTask(t); setIsFormModalOpen(true); }} />}
      {isTeamsModalOpen && teamsTask && <TeamsMessageModal task={teamsTask} onClose={() => setIsTeamsModalOpen(false)} />}
      {isSettingsModalOpen && (
        <SettingsModal 
          sprintDuration={sprintDuration} projectStartDate={projectStartDate} isLocalPersistenceEnabled={isLocalPersistenceEnabled} isAIEnabled={isAIEnabled} currentTheme={appTheme} isDarkMode={isDarkMode}
          onSave={handleSaveSettings} onClose={() => setIsSettingsModalOpen(false)} onResetData={handleResetData} 
        />
      )}
      {isAboutModalOpen && <AboutModal onClose={() => setIsAboutModalOpen(false)} />}
    </div>
  );
};

export default App;
