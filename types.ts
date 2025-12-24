
export enum TaskStatus {
  Backlog = 'Backlog',
  ToDo = 'ToDo',
  InProgress = 'InProgress',
  Done = 'Done',
}

export interface KeyResult {
  id: string;
  name: string;
}

export interface Objective {
  id: string;
  name: string;
  description: string;
  quarter: string; // e.g., "Q3 2024"
  keyResults: KeyResult[];
}

export interface WorkPackage {
  id: string;
  name: string;
  description: string;
}

export interface TimeEstimate {
  best: number;
  avg: number;
  worst: number;
}

export interface Task {
  id:string;
  name: string;
  availability: boolean;
  priority: 'Blocker' | 'High' | 'Medium' | 'Low';
  version: number;
  predecessor: string | null;
  unit: string;
  resourceName: string;
  time: TimeEstimate;
  jiraId: string;
  notes: string;
  status: TaskStatus;
  workPackageId?: string;
  labels?: string[];
  includeInSprints?: boolean;
  dueDate?: string; // ISO string date
  subtasks?: { text: string; completed: boolean }[];
  comments?: { author: string; text: string; date: string }[];
  keyResultId?: string;
}

export interface Resource {
  id: string;
  name: string;
  participation: number; // Percentage
  unit: string;
  title: string; // Ünvan
  color?: string; // Kaynak rengi
  monthlyPlan?: Record<number, number>; // MonthIndex (0-11) -> Percentage
}

export interface Note {
  id: string;
  content: string;
  createdAt: string; // ISO String
  weekNumber: number;
  year: number;
  tags: string[];
  mentions: string[];
  lineUpdates?: Record<number, string>; // Satır indeksi -> Güncelleme metni
}

export interface CustomerRequest {
  id: string;
  title: string;
  description: string;
  customerName: string;
  createdAt: string;
  status: 'New' | 'Converted' | 'Rejected';
  convertedTaskId?: string;
}

export interface Sprint {
  id: number;
  title: string;
  tasks: Task[];
  unitLoads: Record<string, UnitLoad>;
  startDate?: string;
  endDate?: string;
  testPeriod?: {
    startDate: string;
    endDate: string;
    responsible?: string;
    assignedTaskIds?: string[];
    foundDefects?: string;
    duration?: number; // Sürüm bazlı test günü
  };
}

export enum View {
  Tasks,
  Resources,
  Kanban,
  Roadmap,
  Goals,
  Notes,
  Requests,
  AI,
}

export interface UnitLoad {
  currentLoad: number;
  completedLoad: number;
  capacity: number;
}

export interface ProjectData {
  tasks: Task[];
  resources: Resource[];
  workPackages: WorkPackage[];
  notes: Note[];
  customerRequests?: CustomerRequest[];
  objectives?: Objective[];
  settings: {
    sprintDuration: number;
    projectStartDate: string;
    isLocalPersistenceEnabled?: boolean;
    isAIEnabled?: boolean;
    tagColors?: Record<string, string>; 
    titleCosts?: Record<string, number>; 
    sprintNames?: Record<number, string>; // Özel sürüm isimleri
    globalTestDays?: number; // Genel test günü sayısı
    manMonthTableColor?: string; // Adam/Ay tablo ana rengi
    costTableColor?: string; // Maliyet tablo ana rengi
    theme?: string; // Uygulama teması
    isDarkMode?: boolean; // Gece modu
  };
  appVersion: string;
  exportDate: string;
}