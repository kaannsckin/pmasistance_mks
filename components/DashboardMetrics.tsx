import React, { useMemo, useState } from 'react';
import { Resource, Task, TaskStatus } from '../types';
import { calculatePertFuzzyPert, ScheduledTask } from '../utils/timeline';
import PieChart from './PieChart';
import BarChart from './BarChart';

interface DashboardMetricsProps {
    tasks: ScheduledTask[];
    resources: Resource[];
    onViewTask: (task: Task) => void;
}

const generateColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  const color = "00000".substring(0, 6 - c.length) + c;
  return `#${color}`;
};

const STATUS_COLORS: Record<TaskStatus, string> = {
    [TaskStatus.Backlog]: '#EF4444', // red-500
    [TaskStatus.ToDo]: '#6B7280',     // gray-500
    [TaskStatus.InProgress]: '#3B82F6', // blue-500
    [TaskStatus.Done]: '#22C55E',       // green-500
};

const StatCard: React.FC<{ title: string; value: string; subText?: string; icon: string; colorClass?: string }> = ({ title, value, subText, icon, colorClass = "bg-blue-500" }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between transition-transform hover:scale-[1.02]">
        <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-white">{value}</h3>
            {subText && <p className="text-xs text-gray-400 mt-1">{subText}</p>}
        </div>
        <div className={`p-4 rounded-full text-white ${colorClass} bg-opacity-90 shadow-md`}>
            <i className={`fa-solid ${icon} text-xl`}></i>
        </div>
    </div>
);

const ChartContainer: React.FC<{ title: string, children: React.ReactNode, active?: boolean }> = ({ title, children, active }) => (
    <div className={`bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border transition-colors h-full ${active ? 'border-blue-400 ring-2 ring-blue-100 dark:ring-blue-900' : 'border-gray-100 dark:border-gray-700'}`}>
        <h3 className="text-md font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
            <i className="fa-solid fa-chart-pie mr-2 text-blue-500"></i>
            {title}
        </h3>
        {children}
    </div>
);

const DashboardMetrics: React.FC<DashboardMetricsProps> = ({ tasks, onViewTask }) => {
    const [activeFilter, setActiveFilter] = useState<{ type: 'status' | 'resource' | 'unit' | 'tag'; value: string } | null>(null);

    const { 
        totalDuration, 
        tasksPerResource, 
        workloadPerUnit, 
        wipData, 
        tagData, 
        completionRate, 
        blockerCount,
        totalTasks,
        completedTasks
    } = useMemo(() => {
        const totalDuration = Math.max(...tasks.map(t => t.end), 0);
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === TaskStatus.Done).length;
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
        const blockerCount = tasks.filter(t => t.priority === 'Blocker' && t.status !== TaskStatus.Done).length;

        const tasksPerResource = tasks.reduce((acc, task) => {
            acc[task.resourceName] = (acc[task.resourceName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const workloadPerUnit = tasks.reduce((acc, task) => {
            const { pert } = calculatePertFuzzyPert(task.time);
            acc[task.unit] = (acc[task.unit] || 0) + pert;
            return acc;
        }, {} as Record<string, number>);
        
        const wipCounts = tasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
        }, {} as Record<TaskStatus, number>);

        const wipData = Object.entries(wipCounts).map(([status, count]) => ({
            label: status,
            value: count,
            color: STATUS_COLORS[status as TaskStatus] || '#cccccc'
        }));

        const tagCounts: Record<string, number> = {};
        tasks.forEach(task => {
            if (task.labels && task.labels.length > 0) {
                task.labels.forEach(label => {
                    const normalizedLabel = label.trim();
                    tagCounts[normalizedLabel] = (tagCounts[normalizedLabel] || 0) + 1;
                });
            } else {
                tagCounts['Etiketsiz'] = (tagCounts['Etiketsiz'] || 0) + 1;
            }
        });

        const tagData = Object.entries(tagCounts)
            .sort((a, b) => (b[1] as number) - (a[1] as number))
            .slice(0, 5) // Top 5 tags
            .map(([tag, count]) => ({
                label: tag,
                value: count,
                color: generateColor(tag)
            }));

        return {
            totalDuration,
            tasksPerResource,
            workloadPerUnit,
            wipData,
            tagData,
            completionRate,
            blockerCount,
            totalTasks,
            completedTasks
        };
    }, [tasks]);

    const resourceTaskData = Object.entries(tasksPerResource)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 5)
        .map(([name, count]) => ({
            label: name,
            value: count,
            color: generateColor(name),
        }));

    const unitWorkloadData = Object.entries(workloadPerUnit).map(([name, load]) => ({
        label: name,
        value: parseFloat((load as number).toFixed(1)),
        color: generateColor(name),
    }));

    // Filtered tasks for the side panel
    const filteredTasks = useMemo(() => {
        if (!activeFilter) return [];
        return tasks.filter(t => {
            switch (activeFilter.type) {
                case 'status': return t.status === activeFilter.value;
                case 'resource': return t.resourceName === activeFilter.value;
                case 'unit': return t.unit === activeFilter.value;
                case 'tag': 
                    if (activeFilter.value === 'Etiketsiz') return (!t.labels || t.labels.length === 0);
                    return t.labels?.includes(activeFilter.value);
                default: return false;
            }
        });
    }, [tasks, activeFilter]);

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    title="Proje İlerlemesi" 
                    value={`%${completionRate.toFixed(1)}`} 
                    subText={`${completedTasks} / ${totalTasks} Görev Tamamlandı`}
                    icon="fa-bars-progress" 
                    colorClass={completionRate === 100 ? "bg-green-500" : "bg-blue-600"}
                />
                <StatCard 
                    title="Tahmini Süre" 
                    value={`${totalDuration.toFixed(0)} Gün`} 
                    subText="PERT Analizine Göre"
                    icon="fa-clock" 
                    colorClass="bg-purple-500"
                />
                <StatCard 
                    title="Kritik Sorunlar (Blocker)" 
                    value={blockerCount.toString()} 
                    subText={blockerCount > 0 ? "Acil Müdahale Gerekli" : "Her şey yolunda"}
                    icon="fa-triangle-exclamation" 
                    colorClass={blockerCount > 0 ? "bg-red-500" : "bg-green-500"}
                />
                <StatCard 
                    title="Aktif Kaynak" 
                    value={Object.keys(tasksPerResource).length.toString()} 
                    subText="Farklı kişi görev alıyor"
                    icon="fa-users" 
                    colorClass="bg-orange-500"
                />
            </div>

            {/* Main Content: Charts + Detailed List */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Left Side: Charts Grid */}
                <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ChartContainer title="Görev Durumları" active={activeFilter?.type === 'status'}>
                        <BarChart 
                            data={wipData} 
                            onClick={(label) => setActiveFilter({ type: 'status', value: label })} 
                        />
                    </ChartContainer>
                    <ChartContainer title="En Çok Görev Alanlar" active={activeFilter?.type === 'resource'}>
                        <PieChart 
                            data={resourceTaskData} 
                            onClick={(label) => setActiveFilter({ type: 'resource', value: label })} 
                        />
                    </ChartContainer>
                    <ChartContainer title="Birim İş Yükü (Gün)" active={activeFilter?.type === 'unit'}>
                         <PieChart 
                            data={unitWorkloadData} 
                            onClick={(label) => setActiveFilter({ type: 'unit', value: label })}
                         />
                    </ChartContainer>
                     <ChartContainer title="Popüler Etiketler" active={activeFilter?.type === 'tag'}>
                         <PieChart 
                            data={tagData} 
                            onClick={(label) => setActiveFilter({ type: 'tag', value: label })}
                         />
                    </ChartContainer>
                </div>

                {/* Right Side: Interactive List Panel */}
                <div className="xl:col-span-1">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col overflow-hidden max-h-[600px] xl:max-h-none">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 dark:text-white flex items-center">
                                <i className="fa-solid fa-list-check mr-2 text-blue-500"></i>
                                {activeFilter ? `${activeFilter.value} Görevleri` : 'Görev Detayı'}
                            </h3>
                            {activeFilter && (
                                <button 
                                    onClick={() => setActiveFilter(null)} 
                                    className="text-xs text-red-500 hover:text-red-700 flex items-center"
                                >
                                    <i className="fa-solid fa-times mr-1"></i>Temizle
                                </button>
                            )}
                        </div>
                        
                        <div className="flex-grow overflow-y-auto p-2 custom-scrollbar">
                            {activeFilter ? (
                                filteredTasks.length > 0 ? (
                                    <div className="space-y-2">
                                        {filteredTasks.map(task => (
                                            <div key={task.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow flex items-start space-x-3">
                                                 <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] || 'bg-gray-400'}`}></div>
                                                 <div className="flex-grow min-w-0">
                                                     <div className="flex justify-between items-start">
                                                         <button 
                                                            onClick={() => onViewTask(task)}
                                                            className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 hover:underline text-left"
                                                         >
                                                             {task.jiraId}
                                                         </button>
                                                         <span className="text-[10px] text-gray-400">{task.priority}</span>
                                                     </div>
                                                     <p className="text-sm text-gray-800 dark:text-gray-200 truncate" title={task.name}>{task.name}</p>
                                                     <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{task.resourceName}</p>
                                                 </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                        <p>Bu kategoride görev bulunamadı.</p>
                                    </div>
                                )
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center p-8 opacity-70">
                                    <i className="fa-solid fa-chart-simple text-5xl mb-4 text-gray-300 dark:text-gray-600"></i>
                                    <h4 className="text-lg font-medium text-gray-500 dark:text-gray-400">Detayları Görün</h4>
                                    <p className="text-sm mt-2">Sol taraftaki grafiklerden bir dilime veya çubuğa tıklayarak ilgili görevleri burada listeleyebilirsiniz.</p>
                                </div>
                            )}
                        </div>
                        {activeFilter && (
                             <div className="p-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-center text-xs text-gray-500">
                                Toplam {filteredTasks.length} görev listeleniyor
                             </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardMetrics;