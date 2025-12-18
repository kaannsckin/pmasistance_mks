import React, { useState, useMemo } from 'react';
import { Resource, Task } from '../types';
import FilterDropdown from './FilterDropdown';
import { calculateSchedule } from '../utils/timeline';

interface ResourceManagerProps {
  resources: Resource[];
  setResources: React.Dispatch<React.SetStateAction<Resource[]>>;
  tasks: Task[];
}

interface LoadData {
  weeklyLoad: Record<number, number>; // WeekIndex -> Load (Factor)
  taskCount: Record<number, number>;
}

interface Suggestion {
  id: string;
  type: 'overload' | 'bottleneck';
  resourceName: string;
  week: number;
  message: string;
  action?: {
    taskId: string;
    targetResource: string;
  };
}

const ResourceManager: React.FC<ResourceManagerProps> = ({ resources, setResources, tasks }) => {
  const [activeTab, setActiveTab] = useState<'list' | 'analysis'>('list');
  
  // --- Existing State for List View ---
  const [newResourceName, setNewResourceName] = useState('');
  const [newResourceParticipation, setNewResourceParticipation] = useState(100);
  const [newResourceUnit, setNewResourceUnit] = useState('');
  const [filterUnit, setFilterUnit] = useState('all');

  const uniqueUnits = useMemo(() => ['all', ...Array.from(new Set(resources.map(r => r.unit)))], [resources]);

  const filteredResources = useMemo(() => {
    if (filterUnit === 'all') {
      return resources;
    }
    return resources.filter(resource => resource.unit === filterUnit);
  }, [resources, filterUnit]);

  // --- Analysis Logic ---
  
  const { weeklyData, suggestions, maxWeek } = useMemo(() => {
    const scheduledTasks = calculateSchedule(tasks, resources);
    if (scheduledTasks.length === 0) return { weeklyData: {}, suggestions: [], maxWeek: 0 };

    const maxDay = Math.max(...scheduledTasks.map(t => t.end));
    const maxWeekNum = Math.ceil(maxDay / 5) + 1; // Assuming 5 day weeks for simplicity in grid
    
    const data: Record<string, LoadData> = {}; // ResourceName -> Data
    resources.forEach(r => {
        data[r.name] = { weeklyLoad: {}, taskCount: {} };
        for(let i=0; i<=maxWeekNum; i++) {
            data[r.name].weeklyLoad[i] = 0;
            data[r.name].taskCount[i] = 0;
        }
    });

    // Calculate Load
    scheduledTasks.forEach(task => {
       const startWeek = Math.floor(task.start / 5);
       const endWeek = Math.floor(task.end / 5);
       const resourceName = task.resourceName;
       
       if (data[resourceName]) {
           for (let w = startWeek; w <= endWeek; w++) {
               // Load calculation: 1 task = 1 unit of load. 
               // If resource participation is 50%, and they have 1 task, they are at 100% of THEIR capacity?
               // Or should we calculate absolute load?
               // Approach: Absolute Load. 
               // If a task takes 5 days and participation is 100%, it consumes 1.0 FTE.
               // If 2 tasks overlap, it consumes 2.0 FTE.
               
               data[resourceName].weeklyLoad[w] += 1; 
               data[resourceName].taskCount[w] += 1;
           }
       }
    });

    // Generate Suggestions
    const generatedSuggestions: Suggestion[] = [];
    
    Object.entries(data).forEach(([rName, rData]) => {
        const resource = resources.find(r => r.name === rName);
        if (!resource) return;
        
        const capacity = resource.participation / 100; // e.g., 1.0 or 0.5
        
        Object.entries(rData.weeklyLoad).forEach(([weekStr, load]) => {
             const week = parseInt(weekStr);
             if (load > 1.1) { // Tolerance threshold. > 1.1 means overlapping tasks.
                 // Find tasks in this week for this resource
                 const tasksInWeek = scheduledTasks.filter(t => 
                     t.resourceName === rName && 
                     Math.floor(t.start / 5) <= week && 
                     Math.floor(t.end / 5) >= week
                 );
                 
                 // Find a substitute in the same unit
                 const substitutes = resources.filter(sub => 
                    sub.name !== rName && 
                    sub.unit === resource.unit &&
                    (data[sub.name]?.weeklyLoad[week] || 0) < 1
                 );

                 if (substitutes.length > 0 && tasksInWeek.length > 0) {
                     const taskToMove = tasksInWeek[0]; // Pick the first one
                     const target = substitutes[0];
                     
                     generatedSuggestions.push({
                         id: `sug-${rName}-${week}`,
                         type: 'overload',
                         resourceName: rName,
                         week: week + 1,
                         message: `${rName}, ${week + 1}. Haftada aşırı yüklü (${load.toFixed(1)} iş). '${taskToMove.name}' görevini ${target.name} kişisine atamayı düşünün.`,
                         action: { taskId: taskToMove.id, targetResource: target.name }
                     });
                 } else {
                      generatedSuggestions.push({
                         id: `bottleneck-${rName}-${week}`,
                         type: 'bottleneck',
                         resourceName: rName,
                         week: week + 1,
                         message: `${rName}, ${week + 1}. Haftada darboğaz oluşturuyor (${load.toFixed(1)} iş). Bu birimde başka uygun kaynak bulunamadı.`
                     });
                 }
             }
        });
    });

    return { weeklyData: data, suggestions: generatedSuggestions, maxWeek: maxWeekNum };
  }, [tasks, resources]);


  // --- Handlers ---
  const handleAddResource = () => {
    const trimmedName = newResourceName.trim();
    const trimmedUnit = newResourceUnit.trim();

    if (trimmedName && trimmedUnit) {
      if (resources.some(r => r.name.toLocaleLowerCase('tr-TR') === trimmedName.toLocaleLowerCase('tr-TR'))) {
        alert('Bu isimde bir kaynak zaten mevcut.');
        return;
      }
      const newResource: Resource = {
        id: new Date().toISOString(),
        name: trimmedName,
        participation: newResourceParticipation,
        unit: trimmedUnit,
      };
      setResources([...resources, newResource]);
      setNewResourceName('');
      setNewResourceParticipation(100);
      setNewResourceUnit('');
    }
  };

  const handleUpdateResource = (id: string, field: keyof Omit<Resource, 'id' | 'name'>, value: string | number) => {
    setResources(resources.map(r => 
        r.id === id 
        ? { ...r, [field]: value } 
        : r
    ));
  };

  const handleRemoveResource = (id: string) => {
    setResources(resources.filter(r => r.id !== id));
  };

  // --- Heatmap Helpers ---
  const getCellColor = (load: number) => {
      if (load === 0) return 'bg-gray-100 dark:bg-gray-800';
      if (load <= 0.8) return 'bg-green-200 dark:bg-green-900';
      if (load <= 1.0) return 'bg-blue-200 dark:bg-blue-900';
      return 'bg-red-300 dark:bg-red-900';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-end">
            <div>
                 <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Kaynak Yönetimi</h2>
                 <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Ekibinizin kapasitesini planlayın ve dengeleyin.</p>
            </div>
            <div className="flex space-x-2 bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
                <button
                    onClick={() => setActiveTab('list')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'list' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-white shadow' : 'text-gray-600 dark:text-gray-300'}`}
                >
                    <i className="fa-solid fa-list mr-2"></i>Listele
                </button>
                <button
                    onClick={() => setActiveTab('analysis')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'analysis' ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-white shadow' : 'text-gray-600 dark:text-gray-300'}`}
                >
                    <i className="fa-solid fa-chart-area mr-2"></i>Yük Analizi
                </button>
            </div>
        </div>
        
        {activeTab === 'list' && (
            <>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                    <h3 className="text-xl font-semibold mb-4">Yeni Kaynak Ekle</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                            <label htmlFor="resourceName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Kaynak Adı</label>
                            <input
                                id="resourceName"
                                type="text"
                                value={newResourceName}
                                onChange={e => setNewResourceName(e.target.value)}
                                placeholder="Örn: Mehmet Yılmaz"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                        </div>
                        <div>
                            <label htmlFor="resourceUnit" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Birim</label>
                            <input
                                id="resourceUnit"
                                type="text"
                                value={newResourceUnit}
                                onChange={e => setNewResourceUnit(e.target.value)}
                                placeholder="Örn: Backend"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                        </div>
                        <div>
                            <label htmlFor="participation" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Katılım Yüzdesi (%)</label>
                            <input
                                id="participation"
                                type="number"
                                value={newResourceParticipation}
                                onChange={e => setNewResourceParticipation(parseInt(e.target.value, 10))}
                                min="1"
                                max="100"
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            />
                        </div>
                    </div>
                    <div className="mt-4 text-right">
                        <button
                            onClick={handleAddResource}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            <i className="fa-solid fa-plus mr-2"></i>Ekle
                        </button>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                    <div className="p-4 border-b dark:border-gray-700">
                        <FilterDropdown label="Birim Filtrele" value={filterUnit} onChange={setFilterUnit} options={uniqueUnits} />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Kaynak Adı</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Birim</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Katılım Yüzdesi</th>
                                    <th scope="col" className="relative px-6 py-3"><span className="sr-only">İşlemler</span></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredResources.map(resource => (
                                    <tr key={resource.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{resource.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <input
                                                type="text"
                                                value={resource.unit}
                                                onChange={e => handleUpdateResource(resource.id, 'unit', e.target.value)}
                                                className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <input
                                                type="number"
                                                value={resource.participation}
                                                onChange={e => handleUpdateResource(resource.id, 'participation', parseInt(e.target.value, 10) || 0)}
                                                min="1"
                                                max="100"
                                                className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => handleRemoveResource(resource.id)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400">
                                                <i className="fa-solid fa-trash"></i> Sil
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        )}

        {activeTab === 'analysis' && (
             <div className="space-y-6">
                 {/* Suggestions Panel */}
                 {suggestions.length > 0 && (
                     <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                         <h3 className="text-lg font-bold text-yellow-800 dark:text-yellow-200 mb-3 flex items-center">
                             <i className="fa-solid fa-lightbulb mr-2"></i>
                             Optimizasyon Önerileri
                         </h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                             {suggestions.map(suggestion => (
                                 <div key={suggestion.id} className="bg-white dark:bg-gray-800 p-3 rounded shadow-sm border-l-4 border-yellow-400 flex items-start space-x-3">
                                     <div className="mt-1 text-yellow-600">
                                         {suggestion.type === 'overload' ? <i className="fa-solid fa-people-arrows"></i> : <i className="fa-solid fa-triangle-exclamation"></i>}
                                     </div>
                                     <div>
                                         <p className="text-sm text-gray-800 dark:text-gray-200">{suggestion.message}</p>
                                         {suggestion.action && (
                                             <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                 <i className="fa-solid fa-arrow-right mr-1"></i>
                                                 Önerilen Aksiyon: Görevi {suggestion.action.targetResource} kaynağına ata.
                                             </div>
                                         )}
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>
                 )}

                 {/* Heatmap Chart */}
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md overflow-x-auto">
                     <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Kaynak Yük Dağılımı (Haftalık)</h3>
                     <div className="min-w-max">
                         {/* Header Row */}
                         <div className="flex">
                             <div className="w-48 flex-shrink-0 p-2 font-bold text-gray-600 dark:text-gray-300 border-b dark:border-gray-600">Kaynak</div>
                             {Array.from({ length: maxWeek + 1 }).map((_, i) => (
                                 <div key={i} className="w-24 flex-shrink-0 p-2 text-center text-sm font-medium text-gray-500 dark:text-gray-400 border-b dark:border-gray-600">
                                     {i}. Hafta
                                 </div>
                             ))}
                         </div>
                         {/* Data Rows */}
                         {resources.map(resource => {
                             const data = weeklyData[resource.name];
                             if (!data) return null;
                             return (
                                 <div key={resource.id} className="flex items-center border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                     <div className="w-48 flex-shrink-0 p-3 text-sm font-medium text-gray-900 dark:text-white flex flex-col">
                                         <span>{resource.name}</span>
                                         <span className="text-xs text-gray-400">{resource.unit} (%{resource.participation})</span>
                                     </div>
                                     {Array.from({ length: maxWeek + 1 }).map((_, i) => {
                                         const load = data.weeklyLoad[i] || 0;
                                         return (
                                             <div key={i} className="w-24 flex-shrink-0 p-2 h-16 flex items-center justify-center relative group border-r border-dashed border-gray-100 dark:border-gray-700">
                                                  {load > 0 ? (
                                                      <div className={`w-full h-full mx-1 rounded-md flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-100 shadow-sm transition-all hover:scale-105 ${getCellColor(load)}`}
                                                        title={`Yük: ${load.toFixed(1)} Görev Eşdeğeri`}
                                                      >
                                                          {load.toFixed(1)}
                                                      </div>
                                                  ) : (
                                                      <span className="text-gray-200 dark:text-gray-700 text-xl">•</span>
                                                  )}
                                             </div>
                                         );
                                     })}
                                 </div>
                             );
                         })}
                     </div>
                     <div className="mt-4 flex items-center space-x-6 text-xs text-gray-500 dark:text-gray-400">
                         <div className="flex items-center"><span className="w-3 h-3 bg-gray-100 dark:bg-gray-800 border border-gray-300 mr-2 rounded"></span> Boş</div>
                         <div className="flex items-center"><span className="w-3 h-3 bg-green-200 dark:bg-green-900 mr-2 rounded"></span> Uygun (%0-80)</div>
                         <div className="flex items-center"><span className="w-3 h-3 bg-blue-200 dark:bg-blue-900 mr-2 rounded"></span> Tam Kapasite (%80-100)</div>
                         <div className="flex items-center"><span className="w-3 h-3 bg-red-300 dark:bg-red-900 mr-2 rounded"></span> Aşırı Yük ({'>'}%100)</div>
                     </div>
                 </div>
             </div>
        )}
    </div>
  );
};

export default ResourceManager;