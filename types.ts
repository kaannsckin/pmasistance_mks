
export enum TaskStatus {
  Backlog = 'Backlog',
  ToDo = 'ToDo',
  InProgress = 'InProgress',
  Done = 'Done',
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
  id: string;
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
}

export interface Resource {
  id: string;
  name: string;
  participation: number; // Percentage
  unit: string;
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

// Added missing Sprint interface to resolve import errors in Kanban and Exporter modules
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
  };
}

export enum View {
  Tasks,
  Resources,
  WorkPackages,
  Timeline,
  Kanban,
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
  settings: {
    sprintDuration: number;
    projectStartDate: string;
    isLocalPersistenceEnabled?: boolean;
    isAIEnabled?: boolean;
    tagColors?: Record<string, string>; // Etiket bazlı renk tanımları
  };
  appVersion: string;
  exportDate: string;
}
