
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
import TimelineView from './components/TimelineView';
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
        if (parsed.settings) {
          setSprintDuration(parsed.settings.sprintDuration);
          setProjectStartDate(parsed.settings.projectStartDate);
          setIsLocalPersistenceEnabled(parsed.settings.isLocalPersistenceEnabled !== false);
          setIsAIEnabled(parsed.settings.isAIEnabled !== false);
          setTagColors(parsed.settings.tagColors || {});
        }
      } catch (e) {
        console.error("Yükleme hatası:", e);
      }
    } else {
      setTasks(INITIAL_TASKS);
      setResources(INITIAL_RESOURCES);
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
          tagColors
        },
        appVersion: '1.4.1',
        exportDate: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [tasks, resources, workPackages, notes, customerRequests, sprintDuration, projectStartDate, isLocalPersistenceEnabled, isAIEnabled, tagColors, isInitialized]);

  useEffect(() => {
    if (!isAIEnabled && currentView === View.AI) {
      setCurrentView(View.Kanban);
    }
  }, [isAIEnabled, currentView]);

  const handleResetData = useCallback(() => {
      localStorage.removeItem(STORAGE_KEY);
      setTasks(INITIAL_TASKS);
      setResources(INITIAL_RESOURCES);
      setWorkPackages(INITIAL_WORK_PACKAGES);
      setNotes([]);
      setCustomerRequests([]);
      setSprintDuration(3);
      setProjectStartDate(new Date().toISOString().split('T')[0]);
      setIsLocalPersistenceEnabled(true);
      setIsAIEnabled(true);
      setTagColors({});
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
    if (pendingRequest) {
      setCustomerRequests(prev => prev.map(r => r.id === pendingRequest.id ? { ...r, status: 'Converted', convertedTaskId: taskToSave.id } : r));
    }
    handleCloseForm();
  }, [tasks, pendingRequest, handleCloseForm]);

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

  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  const handleSaveSettings = useCallback((newDuration: number, newDate: string, enabled: boolean, aiEnabled: boolean) => {
    setSprintDuration(newDuration);
    setProjectStartDate(newDate);
    setIsLocalPersistenceEnabled(enabled);
    setIsAIEnabled(aiEnabled);
    handleCloseSettings();
  }, [handleCloseSettings]);

  const handleDataImport = useCallback((importedTasks: Task[], importedResources: Resource[]) => {
    setTasks(prevTasks => [...prevTasks, ...importedTasks]);
    setResources(prevResources => {
        const existingResourceNames = new Set(prevResources.map(r => r.name));
        const newUniqueResources = importedResources.filter(r => !existingResourceNames.has(r.name));
        return [...prevResources, ...newUniqueResources];
    });
  }, []);

  const handlePlanGenerated = useCallback((newTasks: Task[]) => {
      setTasks(newTasks);
  }, []);

  const handleTaskSprintChange = useCallback((taskIdToUpdate: string, newSprintVersion: number) => {
      setTasks(currentTasks => currentTasks.map(task => {
          if (task.id === taskIdToUpdate) {
            const newStatus = newSprintVersion === 0 ? TaskStatus.Backlog : (task.status === TaskStatus.Backlog ? TaskStatus.ToDo : task.status);
            return { ...task, version: newSprintVersion, status: newStatus };
          }
          return task;
        })
      );
    }, []);
    
  const handleTaskStatusChange = useCallback((taskIdToUpdate: string, newStatus: TaskStatus) => {
    setTasks(currentTasks => currentTasks.map(task => task.id === taskIdToUpdate ? { ...task, status: newStatus } : task));
  }, []);

  const handleInsertSprint = useCallback((sprintNumber: number) => {
    setTasks(currentTasks => currentTasks.map(task => task.version >= sprintNumber ? { ...task, version: task.version + 1 } : task));
  }, []);

  const handleDeleteSprint = useCallback((sprintNumberToDelete: number) => {
    setTasks(currentTasks => {
      return currentTasks.map(task => {
        if (task.version === sprintNumberToDelete) {
          return { ...task, version: 0, status: TaskStatus.Backlog };
        } else if (task.version > sprintNumberToDelete) {
          return { ...task, version: task.version - 1 };
        }
        return task;
      });
    });
  }, []);
  
    const handleDeleteWorkPackage = useCallback((workPackageId: string) => {
        setTasks(prevTasks => prevTasks.map(task => {
            if (task.workPackageId === workPackageId) {
                const { workPackageId: _, ...rest } = task;
                return rest;
            }
            return task;
        }));
        setWorkPackages(prevWorkPackages => prevWorkPackages.filter(wp => wp.id !== workPackageId));
    }, []);

  const handleAddNote = useCallback((newNote: Note) => {
    setNotes(prev => [newNote, ...prev]);
  }, []);

  const handleEditNote = useCallback((updatedNote: Note) => {
    setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
  }, []);

  const handleDeleteNote = useCallback((noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId));
  }, []);

  const handleConvertToTask = useCallback((request: CustomerRequest) => {
    const taskId = `task-from-req-${request.id}`;
    const newTaskDraft: Task = {
      id: taskId,
      name: request.title,
      availability: false,
      priority: 'Medium',
      version: 0,
      predecessor: null,
      unit: 'Müşteri Talebi',
      resourceName: resources.length > 0 ? resources[0].name : 'Atanmamış',
      time: { best: 0, avg: 0, worst: 0 },
      jiraId: '',
      notes: `Müşteri: ${request.customerName}\n\nTalep Açıklaması:\n${request.description}`,
      status: TaskStatus.Backlog,
      labels: ['istek'],
      includeInSprints: false
    };
    setPendingRequest(request);
    setEditingTask(newTaskDraft);
    setIsFormModalOpen(true);
  }, [resources]);

  const handleSaveProject = useCallback(() => {
    const projectData: ProjectData = {
      tasks, resources, workPackages, notes, customerRequests,
      settings: { sprintDuration, projectStartDate, isLocalPersistenceEnabled, isAIEnabled, tagColors },
      appVersion: '1.4.1',
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `proje_plan_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [tasks, resources, workPackages, notes, customerRequests, sprintDuration, projectStartDate, isLocalPersistenceEnabled, isAIEnabled, tagColors]);

  const handleLoadProject = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as ProjectData;
        setTasks(data.tasks);
        setResources(data.resources);
        setWorkPackages(data.workPackages || []);
        setNotes(data.notes || []);
        setCustomerRequests(data.customerRequests || []);
        if (data.settings) {
          setSprintDuration(data.settings.sprintDuration || 3);
          setProjectStartDate(data.settings.projectStartDate || new Date().toISOString().split('T')[0]);
          setIsLocalPersistenceEnabled(data.settings.isLocalPersistenceEnabled !== false);
          setIsAIEnabled(data.settings.isAIEnabled !== false);
          setTagColors(data.settings.tagColors || {});
        }
        alert("Proje başarıyla yüklendi!");
      } catch (error) {
        alert("Geçersiz dosya formatı.");
      }
    };
    reader.readAsText(file);
  }, []);

  const renderView = () => {
    if (!isInitialized) return <div className="h-[60vh] flex items-center justify-center"><i className="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i></div>;
    
    switch (currentView) {
      case View.AI:
        return <AIAssistant tasks={tasks} resources={resources} notes={notes} />;
      case View.Tasks:
        return (
          <TaskGallery
            tasks={tasks} resources={resources} workPackages={workPackages}
            onEditTask={handleOpenForm} onViewTask={handleOpenDetails}
            onNotifyTask={handleOpenTeamsModal} onNewTask={() => handleOpenForm(null)}
            onDeleteTask={handleDeleteTask}
            onDataImport={handleDataImport} onTaskStatusChange={handleTaskStatusChange}
          />
        );
      case View.Resources:
        return <ResourceManager resources={resources} setResources={setResources} tasks={tasks} />;
      case View.WorkPackages:
        return <WorkPackageManager workPackages={workPackages} setWorkPackages={setWorkPackages} onDeleteWorkPackage={handleDeleteWorkPackage}/>;
      case View.Timeline:
        return (
          <TimelineView
            tasks={tasks} resources={resources} workPackages={workPackages}
            projectStartDate={projectStartDate} onViewTask={handleOpenDetails} onEditTask={handleOpenForm}
          />
        );
      case View.Kanban:
        return (
          <KanbanView
            tasks={tasks} resources={resources} workPackages={workPackages}
            sprintDuration={sprintDuration} projectStartDate={projectStartDate}
            onPlanGenerated={handlePlanGenerated} onTaskSprintChange={handleTaskSprintChange}
            onTaskStatusChange={handleTaskStatusChange} onInsertSprint={handleInsertSprint}
            onDeleteSprint={handleDeleteSprint} onOpenSettings={handleOpenSettings}
            onViewTaskDetails={(taskId) => {
              const task = tasks.find(t => t.id === taskId);
              if (task) handleOpenDetails(task);
            }}
          />
        );
      case View.Notes:
        return (
          <NotesView 
            notes={notes} resources={resources} 
            tagColors={tagColors}
            setTagColors={setTagColors}
            onAddNote={handleAddNote}
            onEditNote={handleEditNote} onDeleteNote={handleDeleteNote}
          />
        );
      case View.Requests:
        return (
          <CustomerRequestsView 
            requests={customerRequests} 
            setRequests={setCustomerRequests} 
            onConvertToTask={handleConvertToTask}
          />
        );
      default:
        return <KanbanView {...{tasks, resources, workPackages, sprintDuration, projectStartDate, onPlanGenerated: handlePlanGenerated, onTaskSprintChange: handleTaskSprintChange, onTaskStatusChange: handleTaskStatusChange, onInsertSprint: handleInsertSprint, onDeleteSprint: handleDeleteSprint, onOpenSettings: handleOpenSettings, onViewTaskDetails: (id) => { const t = tasks.find(x => x.id === id); if(t) handleOpenDetails(t); }}} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      <Header 
        currentView={currentView} setCurrentView={setCurrentView} 
        onOpenSettings={handleOpenSettings} onSaveProject={handleSaveProject} onLoadProject={handleLoadProject}
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
          sprintDuration={sprintDuration} 
          projectStartDate={projectStartDate} 
          isLocalPersistenceEnabled={isLocalPersistenceEnabled}
          isAIEnabled={isAIEnabled}
          onSave={handleSaveSettings} 
          onClose={handleCloseSettings} 
          onResetData={handleResetData} 
        />
      )}
      {isAboutModalOpen && <AboutModal onClose={() => setIsAboutModalOpen(false)} />}
    </div>
  );
};

export default App;
