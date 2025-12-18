import React, { useState } from 'react';
import { ScheduledTask } from '../utils/timeline';

interface GanttChartProps {
    tasks: ScheduledTask[];
    projectStartDate: string;
    onViewTask: (task: ScheduledTask) => void;
    onEditTask: (task: ScheduledTask) => void;
}

const BAR_HEIGHT = 32;
const BAR_PADDING = 24;
const ROW_HEIGHT = BAR_HEIGHT + BAR_PADDING;
const TASK_LIST_WIDTH = 260;
const MIN_DAY_WIDTH = 15;
const MAX_DAY_WIDTH = 120;
const DEFAULT_DAY_WIDTH = 45;

const GanttChart: React.FC<GanttChartProps> = ({ tasks, projectStartDate, onViewTask, onEditTask }) => {
    const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);

    if (tasks.length === 0) return null;

    const totalDuration = Math.max(...tasks.map(t => t.end), 0);
    const chartHeight = tasks.length * ROW_HEIGHT;
    // Calculate width based on dynamic dayWidth
    const chartWidth = Math.max(totalDuration * dayWidth, 800); 

    const taskPositions = new Map(tasks.map((task, i) => [task.id, i]));
    
    // Add a cap for rendering the time axis to prevent RangeError and performance issues
    const RENDER_DAY_LIMIT = 2000;
    const displayDuration = Math.min(totalDuration, RENDER_DAY_LIMIT);

    const handleZoomIn = () => {
        setDayWidth(prev => Math.min(prev + 10, MAX_DAY_WIDTH));
    };

    const handleZoomOut = () => {
        setDayWidth(prev => Math.max(prev - 10, MIN_DAY_WIDTH));
    };

    const handleResetZoom = () => {
        setDayWidth(DEFAULT_DAY_WIDTH);
    };

    const getDateLabel = (dayOffset: number) => {
        const date = new Date(projectStartDate);
        date.setDate(date.getDate() + dayOffset);
        return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    };

    return (
        <div className="w-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm flex flex-col">
            {/* Toolbar */}
            <div className="flex justify-end items-center p-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 space-x-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium mr-2">Görünüm:</span>
                <button 
                    onClick={handleZoomOut} 
                    disabled={dayWidth <= MIN_DAY_WIDTH}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-30 transition-colors"
                    title="Uzaklaştır"
                >
                    <i className="fa-solid fa-minus"></i>
                </button>
                <button 
                    onClick={handleResetZoom}
                    className="px-2 py-1 text-xs font-mono bg-gray-200 dark:bg-gray-600 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                    title="Varsayılan"
                >
                    %{Math.round((dayWidth / DEFAULT_DAY_WIDTH) * 100)}
                </button>
                <button 
                    onClick={handleZoomIn}
                    disabled={dayWidth >= MAX_DAY_WIDTH}
                    className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-30 transition-colors"
                    title="Yakınlaştır"
                >
                    <i className="fa-solid fa-plus"></i>
                </button>
            </div>

            <div className="overflow-x-auto custom-scrollbar relative">
                <svg width={chartWidth + TASK_LIST_WIDTH} height={chartHeight + 60} className="block">
                    <defs>
                        <pattern id="grid" width={dayWidth} height={chartHeight + 60} patternUnits="userSpaceOnUse">
                             <line x1={dayWidth} y1="0" x2={dayWidth} y2={chartHeight + 60} stroke="#f1f5f9" strokeWidth="1" className="dark:stroke-gray-700" />
                        </pattern>
                         <marker
                            id="arrow"
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="5"
                            markerHeight="5"
                            orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                        </marker>
                    </defs>

                    {/* Background Grid */}
                    <rect x={TASK_LIST_WIDTH} y="0" width={chartWidth} height={chartHeight + 60} fill="url(#grid)" />

                    {/* Header Background */}
                    <rect x="0" y="0" width={chartWidth + TASK_LIST_WIDTH} height="40" fill="#f8fafc" className="dark:fill-gray-900" />
                    <line x1="0" y1="40" x2={chartWidth + TASK_LIST_WIDTH} y2="40" stroke="#e2e8f0" className="dark:stroke-gray-700" />

                    {/* Time Axis */}
                    <g className="time-axis" transform={`translate(${TASK_LIST_WIDTH}, 0)`}>
                        {Array.from({ length: displayDuration + 1 }).map((_, day) => (
                            <g key={day} transform={`translate(${day * dayWidth}, 0)`}>
                                {/* Show label every 5 days normally, or every day if zoomed in enough */}
                                {(day % 5 === 0 || dayWidth > 60) && (
                                    <>
                                        <text y="25" x="5" fill="#64748b" className="text-[10px] font-medium uppercase tracking-wider dark:fill-gray-400">
                                            {getDateLabel(day)}
                                        </text>
                                        <line x1="0" y1="30" x2="0" y2="40" stroke="#cbd5e1" strokeWidth="1" />
                                    </>
                                )}
                            </g>
                        ))}
                    </g>

                    {/* Task List (Left Panel) - Fixed Position visually via SVG order but acts as overlay */}
                    <g className="task-list">
                         <rect x="0" y="0" width={TASK_LIST_WIDTH} height={chartHeight + 60} fill="#fff" className="dark:fill-gray-800" opacity="0.95" />
                         <line x1={TASK_LIST_WIDTH} y1="0" x2={TASK_LIST_WIDTH} y2={chartHeight + 60} stroke="#e2e8f0" className="dark:stroke-gray-700" />
                         <text x="20" y="25" fill="#334155" className="text-xs font-bold uppercase dark:fill-gray-300">Görev Adı</text>
                        {tasks.map((task, i) => (
                            <g key={task.id} transform={`translate(0, ${i * ROW_HEIGHT + 40})`}>
                                <rect x="0" y="0" width={TASK_LIST_WIDTH - 2} height={ROW_HEIGHT} fill="transparent" className="hover:fill-blue-50 dark:hover:fill-blue-900/10 transition-colors" />
                                <text
                                    x="20"
                                    y={BAR_HEIGHT / 2 + 5}
                                    fill="#475569"
                                    className="text-xs font-medium dark:fill-gray-300"
                                    style={{ textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}
                                >
                                    {task.name.length > 32 ? `${task.name.substring(0, 32)}...` : task.name}
                                </text>
                                <text x={TASK_LIST_WIDTH - 15} y={BAR_HEIGHT / 2 + 5} textAnchor="end" fill="#94a3b8" className="text-[10px]">
                                    {task.resourceName.split(' ')[0]}
                                </text>
                            </g>
                        ))}
                    </g>

                    {/* Chart Bars */}
                    <g transform={`translate(${TASK_LIST_WIDTH}, 40)`}>
                         {/* Dependencies Lines (Draw first to be behind bars) */}
                         {tasks.map((task) => {
                             const taskIndex = taskPositions.get(task.id);
                             if (typeof taskIndex !== 'number') return null;
                             const y = taskIndex * ROW_HEIGHT;

                            return (
                                <g key={`dep-${task.id}`}>
                                    {task.predecessor && taskPositions.has(task.predecessor) && (() => {
                                        const predIndex = taskPositions.get(task.predecessor);
                                        if (typeof predIndex === 'number') {
                                            const predTask = tasks[predIndex];
                                            const startX = predTask.end * dayWidth;
                                            const startY = predIndex * ROW_HEIGHT + BAR_HEIGHT / 2;
                                            const endX = task.start * dayWidth;
                                            const endY = y + BAR_HEIGHT / 2;
                                            
                                            // Bezier curve for smoother connections
                                            const midX = (startX + endX) / 2;
                                            const pathD = `M ${startX} ${startY} C ${midX + 10} ${startY}, ${midX - 10} ${endY}, ${endX - 5} ${endY}`;
                                            
                                            return <path d={pathD} stroke="#cbd5e1" className="dark:stroke-gray-600" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />
                                        }
                                        return null;
                                    })()}
                                </g>
                            )
                        })}
                        
                        {tasks.map((task, i) => {
                            const y = i * ROW_HEIGHT;
                            const x = task.start * dayWidth;
                            const width = Math.max((task.end - task.start) * dayWidth, 4); 

                            return (
                                <g 
                                    key={task.id} 
                                    transform={`translate(${x}, ${y})`}
                                    onClick={() => onViewTask(task)}
                                    onDoubleClick={() => onEditTask(task)}
                                    className="cursor-pointer group"
                                >
                                     <title>{`${task.name}\nKaynak: ${task.resourceName}\nSüre: ${(task.end - task.start).toFixed(1)} gün`}</title>
                                    
                                    {/* Shadow for depth */}
                                    <rect
                                        y="2"
                                        height={BAR_HEIGHT}
                                        width={width}
                                        rx="6"
                                        ry="6"
                                        fill="black"
                                        opacity="0.05"
                                        className="translate-y-0.5 translate-x-0.5"
                                    />
                                    
                                    {/* Main Bar */}
                                    <rect
                                        height={BAR_HEIGHT}
                                        width={width}
                                        rx="4"
                                        ry="4"
                                        fill={task.color}
                                        className="opacity-90 group-hover:opacity-100 transition-opacity stroke-white dark:stroke-gray-800 stroke-2"
                                    />

                                    {/* Label inside bar if wide enough, else outside */}
                                    {width > 40 ? (
                                        <text
                                            x={width / 2}
                                            y={BAR_HEIGHT / 2 + 4}
                                            textAnchor="middle"
                                            fill="white"
                                            className="text-[10px] font-bold pointer-events-none drop-shadow-sm">
                                            {task.duration.toFixed(1)}g
                                        </text>
                                    ) : (
                                        <text
                                            x={width + 5}
                                            y={BAR_HEIGHT / 2 + 4}
                                            fill="#64748b"
                                            className="text-[10px] font-bold pointer-events-none">
                                            {task.duration.toFixed(1)}g
                                        </text>
                                    )}
                                </g>
                            )
                        })}
                    </g>
                </svg>
            </div>
        </div>
    );
}

export default GanttChart;