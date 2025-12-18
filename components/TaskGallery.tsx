
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Task, Resource, TaskStatus, WorkPackage } from '../types';
import TaskCard from './TaskCard';
import FilterDropdown from './FilterDropdown';
import { parseImportedFile, parseJiraCsv } from '../utils/importer';
import { exportToExcel, exportToJiraCsv, exportToMsProjectCsv } from '../utils/exporter';
import { STATUS_LABELS } from '../constants';

interface TaskGalleryProps {
  tasks: Task[];
  resources: Resource[];
  workPackages: WorkPackage[];
  onEditTask: (task: Task) => void;
  onViewTask: (task: Task) => void;
  onNotifyTask: (task: Task) => void;
  onNewTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onDataImport: (tasks: Task[], resources: Resource[]) => void;
  onTaskStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

const TaskGallery: React.FC<TaskGalleryProps> = ({ tasks, resources, workPackages, onEditTask, onViewTask, onNotifyTask, onNewTask, onDeleteTask, onDataImport, onTaskStatusChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnit, setFilterUnit] = useState('all');
  const [filterResource, setFilterResource] = useState('all');
  const [filterVersion, setFilterVersion] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterWorkPackage, setFilterWorkPackage] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jiraFileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const uniqueUnits = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.unit)))], [tasks]);
  const uniqueResources = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.resourceName)))], [tasks]);
  const uniqueVersions = useMemo(() => ['all', ...Array.from(new Set(tasks.map(t => t.version.toString())))].sort(), [tasks]);
  const uniqueWorkPackages = useMemo(() => ['all', ...workPackages.map(wp => wp.name)], [workPackages]);
  const workPackageNameToIdMap = useMemo(() => 
    new Map(workPackages.map(wp => [wp.name, wp.id])), 
    [workPackages]
  );


  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const lowerSearchTerm = searchTerm.toLocaleLowerCase('tr-TR');
      const matchesSearch = task.name.toLocaleLowerCase('tr-TR').includes(lowerSearchTerm) || task.jiraId.toLocaleLowerCase('tr-TR').includes(lowerSearchTerm);
      const matchesUnit = filterUnit === 'all' || task.unit === filterUnit;
      const matchesResource = filterResource === 'all' || task.resourceName === filterResource;
      const matchesVersion = filterVersion === 'all' || task.version.toString() === filterVersion;
      const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
      const matchesWorkPackage = filterWorkPackage === 'all' || task.workPackageId === workPackageNameToIdMap.get(filterWorkPackage);
      return matchesSearch && matchesUnit && matchesResource && matchesVersion && matchesStatus && matchesWorkPackage;
    });
  }, [tasks, searchTerm, filterUnit, filterResource, filterVersion, filterStatus, filterWorkPackage, workPackageNameToIdMap]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleJiraImportClick = () => {
    jiraFileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setImportError(null);
    try {
      const { tasks: newTasks, resources: newResources } = await parseImportedFile(file);
      onDataImport(newTasks, newResources);
    } catch (error) {
        if (error instanceof Error) {
            setImportError(error.message);
        } else {
            setImportError('Bilinmeyen bir hata oluştu.');
        }
    } finally {
      setIsLoading(false);
      // Reset file input
      if(fileInputRef.current) {
          fileInputRef.current.value = '';
      }
    }
  };

  const handleJiraFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setImportError(null);
    try {
      const fileContent = await file.text();
      const { tasks: newTasks, resources: newResources } = parseJiraCsv(fileContent);
      onDataImport(newTasks, newResources);
    } catch (error) {
        if (error instanceof Error) {
            setImportError(error.message);
        } else {
            setImportError('Bilinmeyen bir hata oluştu.');
        }
    } finally {
      setIsLoading(false);
      if(jiraFileInputRef.current) {
          jiraFileInputRef.current.value = '';
      }
    }
  };


  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 items-end">
          <div className="lg:col-span-2">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Görev Ara</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-search text-gray-400"></i>
              </div>
              <input
                type="text"
                id="search"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Görev adı veya Jira ID ile ara..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>
          <FilterDropdown label="Birim" value={filterUnit} onChange={setFilterUnit} options={uniqueUnits} />
          <FilterDropdown label="Kaynak Adı" value={filterResource} onChange={setFilterResource} options={uniqueResources} />
          <FilterDropdown label="Sürüm" value={filterVersion} onChange={setFilterVersion} options={uniqueVersions} />
          <FilterDropdown label="İş Paketi" value={filterWorkPackage} onChange={setFilterWorkPackage} options={uniqueWorkPackages} />
           <div>
            <label htmlFor="filter-status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Durum</label>
            <select
                id="filter-status"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
                <option value="all">Tüm Durumlar</option>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                ))}
            </select>
          </div>
        </div>
      </div>
      
      {importError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">İçeri Aktarma Hatası: </strong>
            <span className="block sm:inline">{importError}</span>
            <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setImportError(null)}>
                <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Kapat</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
            </span>
        </div>
      )}

      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Görev Listesi ({filteredTasks.length})</h2>
        <div className="flex items-center space-x-2">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            />
            <input
                type="file"
                ref={jiraFileInputRef}
                className="hidden"
                onChange={handleJiraFileChange}
                accept=".csv"
            />
             <button
                onClick={handleJiraImportClick}
                disabled={isLoading}
                className="flex items-center space-x-2 bg-blue-800 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-900 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-700 disabled:bg-gray-400"
            >
                {isLoading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-brands fa-jira"></i>}
                <span>{isLoading ? 'Yükleniyor...' : "Jira'dan Aktar"}</span>
            </button>
            <button
                onClick={handleImportClick}
                disabled={isLoading}
                className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400"
            >
                {isLoading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-file-excel"></i>}
                <span>{isLoading ? 'Yükleniyor...' : "Excel'den Aktar"}</span>
            </button>
            <div className="relative" ref={exportMenuRef}>
                <button
                    onClick={() => setIsExportMenuOpen(prev => !prev)}
                    className="flex items-center space-x-2 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-yellow-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
                >
                    <i className="fa-solid fa-file-export"></i>
                    <span>Dışa Aktar</span>
                    <i className={`fa-solid fa-chevron-down transition-transform duration-200 ${isExportMenuOpen ? 'rotate-180' : ''}`}></i>
                </button>
                {isExportMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-gray-700 ring-1 ring-black ring-opacity-5 z-20">
                        <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                            <button
                                onClick={() => { exportToExcel(tasks, resources); setIsExportMenuOpen(false); }}
                                className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                role="menuitem"
                            >
                                <i className="fa-solid fa-file-excel text-green-500 w-5 mr-2"></i>
                                Excel'e Aktar
                            </button>
                            <button
                                onClick={() => { exportToJiraCsv(tasks); setIsExportMenuOpen(false); }}
                                className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                role="menuitem"
                            >
                                <i className="fa-brands fa-jira text-blue-500 w-5 mr-2"></i>
                                Jira CSV Olarak Aktar
                            </button>
                            <button
                                onClick={() => { exportToMsProjectCsv(tasks); setIsExportMenuOpen(false); }}
                                className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                role="menuitem"
                            >
                                <i className="fa-solid fa-diagram-project text-teal-500 w-5 mr-2"></i>
                                MS Project'e Aktar
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <button
                onClick={onNewTask}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                <i className="fa-solid fa-plus"></i>
                <span>Yeni Görev</span>
            </button>
        </div>
      </div>

      {filteredTasks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              workPackages={workPackages}
              onEdit={onEditTask}
              onView={onViewTask}
              onNotify={onNotifyTask}
              onDelete={onDeleteTask}
              onStatusChange={onTaskStatusChange}
            />
          ))}
        </div>
      ) : (
         <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <i className="fa-solid fa-folder-open text-5xl text-gray-400"></i>
            <h3 className="mt-4 text-xl font-medium text-gray-700 dark:text-gray-300">Görev Bulunamadı</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Filtre kriterlerini değiştirmeyi deneyin veya dosya yükleyin.</p>
        </div>
      )}
    </div>
  );
};

export default TaskGallery;
