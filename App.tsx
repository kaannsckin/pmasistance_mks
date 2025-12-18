
import React, { useState, useCallback, useEffect } from 'react';
import { View, Task, Resource, TaskStatus, WorkPackage, Note, ProjectData } from './types';
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

const STORAGE_KEY = 'PROJE_PLANLAMA_DATA';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.Kanban);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [workPackages, setWorkPackages] = useState<WorkPackage[]>([]);
  const [notes, setNotes] = useState<Note[]>([]); 
  
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);
  const [teamsTask, setTeamsTask] = useState<Task | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [sprintDuration, setSprintDuration] = useState(3);
  const [projectStartDate, setProjectStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLocalPersistenceEnabled, setIsLocalPersistenceEnabled] = useState(true);
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
        if (parsed.settings) {
          setSprintDuration(parsed.settings.sprintDuration);
          setProjectStartDate(parsed.settings.projectStartDate);
          setIsLocalPersistenceEnabled(parsed.settings.isLocalPersistenceEnabled !== false);
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
        tasks: isLocalPersistenceEnabled ? tasks : [], // If disabled, we might want to keep the setting but clear/not-update other data
        resources: isLocalPersistenceEnabled ? resources : [],
        workPackages: isLocalPersistenceEnabled ? workPackages : [],
        notes: isLocalPersistenceEnabled ? notes : [],
        settings: { 
          sprintDuration, 
          projectStartDate, 
          isLocalPersistenceEnabled 
        },
        appVersion: '1.2.0',
        exportDate: new Date().toISOString()
      };
      
      // We always save the settings so the "enabled" flag itself is remembered
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    }
  }, [tasks, resources, workPackages, notes, sprintDuration, projectStartDate, isLocalPersistenceEnabled, isInitialized]);

  const handleResetData = useCallback(() => {
      localStorage.removeItem(STORAGE_KEY);
      setTasks(INITIAL_TASKS);
      setResources(INITIAL_RESOURCES);
      setWorkPackages(INITIAL_WORK_PACKAGES);
      setNotes([]);
      setSprintDuration(3);
      setProjectStartDate(new Date().toISOString().split('T')[0]);
      setIsLocalPersistenceEnabled(true);
      window.location.reload(); 
  }, []);

  const handleOpenForm = useCallback((task: Task | null) => {
    setEditingTask(task);
    setIsFormModalOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setEditingTask(null);
    setIsFormModalOpen(false);
  }, []);

  const handleSaveTask = useCallback((taskToSave: Task) => {
    if (editingTask) {
      setTasks(tasks.map(t => t.id === taskToSave.id ? taskToSave : t));
    } else {
      setTasks([...tasks, { ...taskToSave, id: Date.now().toString() }]);
    }
    handleCloseForm();
  }, [tasks, editingTask, handleCloseForm]);

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

  const handleSaveSettings = useCallback((newDuration: number, newDate: string, enabled: boolean) => {
    setSprintDuration(newDuration);
    setProjectStartDate(newDate);
    setIsLocalPersistenceEnabled(enabled);
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
      setTasks(currentTasks => 
        currentTasks.map(task => {
          if (task.id === taskIdToUpdate) {
            const newStatus = newSprintVersion === 0 
              ? TaskStatus.Backlog 
              : (task.status === TaskStatus.Backlog ? TaskStatus.ToDo : task.status);
            return { ...task, version: newSprintVersion, status: newStatus };
          }
          return task;
        })
      );
    }, []);
    
  const handleTaskStatusChange = useCallback((taskIdToUpdate: string, newStatus: TaskStatus) => {
    setTasks(currentTasks => 
      currentTasks.map(task => 
        task.id === taskIdToUpdate ? { ...task, status: newStatus } : task
      )
    );
  }, []);

  const handleInsertSprint = useCallback((sprintNumber: number) => {
    setTasks(currentTasks => 
      currentTasks.map(task => 
        task.version >= sprintNumber 
          ? { ...task, version: task.version + 1 } 
          : task
      )
    );
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
        setTasks(prevTasks =>
            prevTasks.map(task => {
                if (task.workPackageId === workPackageId) {
                    const { workPackageId: _, ...rest } = task;
                    return rest;
                }
                return task;
            })
        );
        setWorkPackages(prevWorkPackages =>
            prevWorkPackages.filter(wp => wp.id !== workPackageId)
        );
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

  const handleSaveProject = useCallback(() => {
    const projectData: ProjectData = {
      tasks, resources, workPackages, notes,
      settings: { sprintDuration, projectStartDate, isLocalPersistenceEnabled },
      appVersion: '1.2.0',
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
  }, [tasks, resources, workPackages, notes, sprintDuration, projectStartDate, isLocalPersistenceEnabled]);

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
        if (data.settings) {
          setSprintDuration(data.settings.sprintDuration || 3);
          setProjectStartDate(data.settings.projectStartDate || new Date().toISOString().split('T')[0]);
          setIsLocalPersistenceEnabled(data.settings.isLocalPersistenceEnabled !== false);
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
      case View.Tasks:
        return (
          <TaskGallery
            tasks={tasks} resources={resources} workPackages={workPackages}
            onEditTask={handleOpenForm} onViewTask={handleOpenDetails}
            onNotifyTask={handleOpenTeamsModal} onNewTask={() => handleOpenForm(null)}
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
            notes={notes} resources={resources} onAddNote={handleAddNote}
            onEditNote={handleEditNote} onDeleteNote={handleDeleteNote}
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
          onSave={handleSaveSettings} 
          onClose={handleCloseSettings} 
          onResetData={handleResetData} 
        />
      )}
    </div>
  );
};

export default App;
