
import React, { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  LayoutDashboard, 
  FolderKanban, 
  CheckSquare, 
  Settings, 
  Menu, 
  Plus, 
  MoreHorizontal,
  Search,
  Bell,
  GripVertical
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Task = {
  id: string;
  title: string;
  tag: 'Design' | 'Dev' | 'Marketing';
};

type ColumnType = {
  id: string;
  title: string;
  tasks: Task[];
};

// --- Mock Data ---
const INITIAL_DATA: ColumnType[] = [
  {
    id: 'todo',
    title: 'To Do',
    tasks: [
      { id: 't1', title: 'Research competitors', tag: 'Marketing' },
      { id: 't2', title: 'Draft product roadmap', tag: 'Design' },
    ],
  },
  {
    id: 'inprogress',
    title: 'In Progress',
    tasks: [
      { id: 't3', title: 'Implement Auth Flow', tag: 'Dev' },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    tasks: [
      { id: 't4', title: 'Design System V1', tag: 'Design' },
    ],
  },
];

const TAG_STYLES = {
  Design: 'bg-purple-100 text-purple-700',
  Dev: 'bg-blue-100 text-blue-700',
  Marketing: 'bg-orange-100 text-orange-700',
};

// --- Components ---

// 1. Task Card Component
const TaskCard = ({ task, isOverlay }: { task: Task; isOverlay?: boolean }) => {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="opacity-30 bg-gray-50 border border-gray-200 rounded-md p-3 h-[80px]"
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative bg-white hover:bg-[#F7F7F5] border border-gray-200 rounded-md p-3 shadow-sm hover:shadow transition-all cursor-grab active:cursor-grabbing",
        isOverlay && "rotate-2 scale-105 shadow-xl cursor-grabbing border-blue-200"
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="text-sm font-medium text-[#37352F] leading-snug">{task.title}</h4>
        <button className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity">
          <MoreHorizontal size={14} />
        </button>
      </div>
      <span
        className={cn(
          "inline-block text-[10px] px-1.5 py-0.5 rounded-sm font-medium",
          TAG_STYLES[task.tag]
        )}
      >
        {task.tag}
      </span>
    </div>
  );
};

// 2. Column Component
const Column = ({ 
  column, 
  tasks, 
  addTask 
}: { 
  column: ColumnType; 
  tasks: Task[]; 
  addTask: (colId: string, title: string) => void 
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const { setNodeRef } = useSortable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    },
  });

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) {
      setIsAdding(false);
      return;
    }
    addTask(column.id, newTaskTitle);
    setNewTaskTitle('');
    setIsAdding(false);
  };

  return (
    <div className="flex flex-col w-full min-w-[280px] max-w-[320px]">
      {/* Column Header */}
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{column.title}</span>
          <span className="text-xs text-gray-400 font-normal">{tasks.length}</span>
        </div>
        <div className="flex gap-1">
          <button className="text-gray-400 hover:bg-gray-100 p-1 rounded-sm transition-colors">
            <Plus size={14} onClick={() => setIsAdding(true)} />
          </button>
          <button className="text-gray-400 hover:bg-gray-100 p-1 rounded-sm transition-colors">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Droppable Area */}
      <div ref={setNodeRef} className="flex-1 flex flex-col gap-2 min-h-[150px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>

        {/* Add Task Input */}
        {isAdding ? (
          <div className="bg-white border border-blue-400 rounded-md p-2 shadow-sm">
            <input
              autoFocus
              className="w-full text-sm outline-none placeholder:text-gray-300"
              placeholder="Type a name..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTask();
                if (e.key === 'Escape') setIsAdding(false);
              }}
              onBlur={handleAddTask}
            />
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 text-gray-400 hover:bg-gray-100 p-2 rounded-md text-sm transition-colors group mt-1"
          >
            <Plus size={14} />
            <span className="group-hover:text-gray-600">New</span>
          </button>
        )}
      </div>
    </div>
  );
};

// 3. Sidebar Component
const Sidebar = ({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) => {
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', active: false },
    { icon: FolderKanban, label: 'Projects', active: false },
    { icon: CheckSquare, label: 'Görevler', active: true },
    { icon: Settings, label: 'Settings', active: false },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/20 z-20 md:hidden transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={toggle}
      />
      
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed md:sticky top-0 left-0 h-screen w-64 bg-[#F7F7F5] border-r border-[#E9E9E7] z-30 transform transition-transform duration-200 ease-in-out md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 h-full flex flex-col">
          {/* User Profile / Switcher */}
          <div className="flex items-center gap-2 mb-6 px-2 py-1 hover:bg-[#EFEFED] rounded cursor-pointer transition-colors">
            <div className="w-5 h-5 bg-orange-400 rounded text-[10px] flex items-center justify-center text-white font-bold">
              K
            </div>
            <span className="text-sm font-medium text-[#37352F] truncate">Kullanıcı's Notion</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-0.5">
            {menuItems.map((item) => (
              <button
                key={item.label}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-1.5 text-sm rounded-md transition-colors",
                  item.active 
                    ? "bg-[#EFEFED] text-[#37352F] font-medium" 
                    : "text-[#5F5E5B] hover:bg-[#EFEFED]"
                )}
              >
                <item.icon size={16} className={item.active ? "text-[#37352F]" : "text-[#9B9A97]"} />
                {item.label}
              </button>
            ))}
          </nav>

          {/* Favorites / Bottom */}
          <div className="mt-auto pt-4 border-t border-[#E9E9E7]">
             <div className="text-xs font-medium text-[#9B9A97] px-3 mb-2">Favorites</div>
             <div className="px-3 py-1 text-sm text-[#5F5E5B] hover:bg-[#EFEFED] rounded-md cursor-pointer flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Roadmap 2024
             </div>
          </div>
        </div>
      </aside>
    </>
  );
};

// --- Main App Component ---
function App() {
  const [columns, setColumns] = useState<ColumnType[]>(INITIAL_DATA);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- DND Sensors ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Prevents accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- Logic ---
  const findColumn = (id: string | undefined) => {
    if (!id) return null;
    if (columns.find((c) => c.id === id)) return columns.find((c) => c.id === id);
    return columns.find((c) => c.tasks.find((t) => t.id === id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Find the containers
    const activeColumn = findColumn(activeId as string);
    const overColumn = findColumn(overId as string);

    if (!activeColumn || !overColumn || activeColumn === overColumn) {
      return;
    }

    setColumns((prev) => {
      const activeItems = activeColumn.tasks;
      const overItems = overColumn.tasks;
      const activeIndex = activeItems.findIndex((t) => t.id === activeId);
      const overIndex = overItems.findIndex((t) => t.id === overId);

      let newIndex;
      if (overItems.find((t) => t.id === overId)) {
        newIndex = overItems.length + 1;
      } else {
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;

        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      return prev.map((c) => {
        if (c.id === activeColumn.id) {
          return {
            ...c,
            tasks: activeItems.filter((t) => t.id !== activeId),
          };
        } else if (c.id === overColumn.id) {
          return {
            ...c,
            tasks: [
              ...overItems.slice(0, newIndex),
              activeItems[activeIndex],
              ...overItems.slice(newIndex, overItems.length),
            ],
          };
        }
        return c;
      });
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id;
    const overId = over?.id;

    if (!overId) {
      setActiveId(null);
      return;
    }

    const activeColumn = findColumn(activeId as string);
    const overColumn = findColumn(overId as string);

    if (activeColumn && overColumn && activeColumn.id === overColumn.id) {
      const activeIndex = activeColumn.tasks.findIndex((t) => t.id === activeId);
      const overIndex = overColumn.tasks.findIndex((t) => t.id === overId);

      if (activeIndex !== overIndex) {
        setColumns((prev) => {
          return prev.map((col) => {
            if (col.id === activeColumn.id) {
              return {
                ...col,
                tasks: arrayMove(col.tasks, activeIndex, overIndex),
              };
            }
            return col;
          });
        });
      }
    }

    setActiveId(null);
  };

  const addTask = (colId: string, title: string) => {
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      tag: 'Dev', // Default for now
    };

    setColumns((prev) =>
      prev.map((col) => {
        if (col.id === colId) {
          return { ...col, tasks: [...col.tasks, newTask] };
        }
        return col;
      })
    );
  };

  // Find active task for overlay
  const activeTask = useMemo(() => {
    if (!activeId) return null;
    const column = findColumn(activeId);
    return column?.tasks.find((t) => t.id === activeId);
  }, [activeId, columns]);

  return (
    <div className="flex h-screen w-full bg-white text-[#37352F] overflow-hidden selection:bg-[#cce9ff]">
      
      <Sidebar isOpen={sidebarOpen} toggle={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        
        {/* Header */}
        <header className="h-12 flex items-center justify-between px-4 md:px-8 border-b border-[#E9E9E7] bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              className="md:hidden p-1 text-gray-500 hover:bg-gray-100 rounded"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xl">🏔️</span>
              <span className="font-semibold truncate">Roadmap</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 text-[#9B9A97]">
            <span className="text-xs hidden sm:inline">Edited 10m ago</span>
            <Search size={18} className="cursor-pointer hover:text-[#37352F] transition-colors" />
            <Bell size={18} className="cursor-pointer hover:text-[#37352F] transition-colors" />
          </div>
        </header>

        {/* Board Area */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="h-full min-w-fit px-4 md:px-8 py-8">
            {/* Board Title Area */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Görevler</h1>
              <div className="flex items-center gap-4 text-sm text-gray-500 border-b border-[#E9E9E7] pb-2">
                <span className="text-black font-medium border-b-2 border-black pb-2 -mb-2.5">Board View</span>
                <span className="hover:text-black cursor-pointer transition-colors">List View</span>
                <span className="hover:text-black cursor-pointer transition-colors">Timeline</span>
              </div>
            </div>

            {/* The Kanban Board */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <div className="flex items-start gap-6 h-[calc(100%-120px)]">
                {columns.map((col) => (
                  <Column key={col.id} column={col} tasks={col.tasks} addTask={addTask} />
                ))}
              </div>

              <DragOverlay>
                {activeTask ? <TaskCard task={activeTask} isOverlay /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
