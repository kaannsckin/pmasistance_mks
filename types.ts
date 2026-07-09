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

// Fix: Add WorkPackage interface to resolve import errors in components/TimelineView.tsx and components/WorkPackageManager.tsx.
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
  labels?: string[];
  includeInSprints?: boolean;
  dueDate?: string; // ISO string date
  subtasks?: { text: string; completed: boolean }[];
  comments?: { author: string; text: string; date: string }[];
  keyResultId?: string;
  // Fix: Add workPackageId property to Task interface to resolve error in utils/exporter.ts.
  workPackageId?: string;
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
  Portfolio,
  DataPool,
  Allocations,
  Executive,
}

export interface UnitLoad {
  currentLoad: number;
  completedLoad: number;
  capacity: number;
}

/**
 * Tek proje yedek dosyalarının (v1.x) formatı. Yalnızca eski yedeklerin içe
 * aktarılması ve localStorage migration'ı için korunuyor — yeni kod
 * WorkspaceData kullanmalı.
 */
export interface ProjectData {
  tasks: Task[];
  resources: Resource[];
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

// ---------------------------------------------------------------------------
// Çoklu proje / portföy modeli (v2)
// ---------------------------------------------------------------------------

/**
 * Kurumsal rol hiyerarşisi (RBAC temeli):
 *  - mudur: her şeyi görür, girdi yapmaz
 *  - pyb_sorumlu: program/portföy yöneticisi; projeleri izler, girdi yapmaz
 *  - pyb_destek: veri havuzu sorumlusu; master veri (personel, bölüm, İP,
 *    eşleştirmeler) girer ve hiyerarşiyi korur
 *  - py: proje yöneticisi; kendi projelerinin planını girer
 *  - bolum_sorumlu: bölüm personelinin tahsisini girer/izler
 */
export type UserRole = 'mudur' | 'pyb_sorumlu' | 'pyb_destek' | 'py' | 'bolum_sorumlu';

/** Excel'deki "Proje Durumu" karşılığı + yaşam döngüsü ekleri */
export type ProjectStatus = 'devam' | 'teklif' | 'beklemede' | 'tamamlandi';

/** Haftalık yönetici durumu (kırmızı/sarı/yeşil) */
export type RagStatus = 'green' | 'amber' | 'red';

/** Projeye özgü ayarlar (tema/kalıcılık gibi uygulama geneli ayarlar WorkspaceSettings'te) */
export interface ProjectSettings {
  sprintDuration: number;
  projectStartDate: string;
  tagColors?: Record<string, string>;
  titleCosts?: Record<string, number>;
  sprintNames?: Record<number, string>;
  globalTestDays?: number;
  manMonthTableColor?: string;
  costTableColor?: string;
}

export interface Project {
  id: string;
  name: string;
  code?: string; // SAP / faaliyet kodu
  status: ProjectStatus;
  rag?: RagStatus;
  ragNote?: string; // Haftalık durum açıklaması (PM girer)
  tasks: Task[];
  resources: Resource[];
  notes: Note[];
  customerRequests: CustomerRequest[];
  objectives: Objective[];
  workPackages: WorkPackage[]; // Proje bazlı iş paketleri (İP)
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  isLocalPersistenceEnabled?: boolean;
  isAIEnabled?: boolean;
  theme?: string;
  isDarkMode?: boolean;
}

// ---------------------------------------------------------------------------
// Veri Havuzu (workspace seviyesi master data) — Excel'deki karşılıkları:
// Personel Listesi / Bölümler / Roller / Diğer Tablolar (Ünvanlar)
// ---------------------------------------------------------------------------

export interface Person {
  id: string;
  sicil?: string;
  firstName: string;
  lastName: string;
  emy?: string; // Üst birim (örn. U300)
  departmentCode: string; // BÖLÜM (örn. U310)
  titleCode?: string; // UNVAN kısaltması (ARŞ, UAR, BUA...)
  availableAA: number; // Kullanılabilir AA / ay (tam zamanlı = 1)
  roles: string[]; // Kişinin üstlenebileceği roller
}

export interface Department {
  code: string; // U310
  name: string;
  leadName?: string; // Bölüm Sorumlusu
}

export interface RoleCatalogEntry {
  id: string;
  departmentCode: string;
  name: string; // "Yazılım Geliştirme Mühendisi" vb.
}

export interface TitleDef {
  code: string; // ARŞ
  name: string; // Araştırmacı
}

// ---------------------------------------------------------------------------
// Tahsis (kişi × proje × iş paketi × yıl) — Excel'deki "Veri Girişi" satırı.
// Aylar 1-12 indeksli; değerler AA cinsinden (0.35 = ayın %35'i).
// ---------------------------------------------------------------------------

export interface Allocation {
  id: string;
  personId: string;
  projectId: string;
  workPackageId?: string; // Proje bazlı İP
  role?: string;
  year: number;
  plan: Record<number, number>; // ay (1-12) -> planlanan AA
  actual: Record<number, number>; // ay (1-12) -> gerçekleşen AA
}

/**
 * Plan kilidi (proje × yıl): plan yılbaşında girilir, onaya gönderilir,
 * yönetici onayıyla kilitlenir. Kilitliyken plan hücreleri salt-okunur;
 * gerçekleşen hücreleri her zaman girilebilir.
 */
export type PlanLockStatus = 'draft' | 'submitted' | 'locked';

export interface PlanLock {
  projectId: string;
  year: number;
  status: PlanLockStatus;
  submittedAt?: string;
  submittedByRole?: UserRole;
  decidedAt?: string;
  decidedByRole?: UserRole;
}

/**
 * Baseline / anlık görüntü: bir anın portföy plan-gerçekleşen fotoğrafı.
 * Plan onaylandığında otomatik alınır ("onaylanan plan = baseline") veya
 * elle alınabilir; yönetim ekranında plan kayması trendi için kullanılır.
 * Ham veri değil, kompakt toplamlar saklanır (localStorage boyutu için).
 */
export interface SnapshotProjectEntry {
  projectId: string;
  name: string;
  planAA: number;
  actualAA: number;
}

export interface Snapshot {
  id: string;
  takenAt: string; // ISO
  year: number;
  label: string;
  trigger: 'manual' | 'lock' | 'monthly';
  totalPlanAA: number;
  totalActualAA: number;
  monthlyPlan: number[]; // 12 eleman (Ocak..Aralık)
  monthlyActual: number[];
  byProject: SnapshotProjectEntry[];
}

export interface WorkspaceData {
  schemaVersion: number;
  projects: Project[];
  activeProjectId: string | null;
  /** Şimdilik istemci tarafı görünüm anahtarı; SaaS fazında gerçek auth'a bağlanacak */
  currentRole?: UserRole;
  // Veri havuzu
  people: Person[];
  departments: Department[];
  roleCatalog: RoleCatalogEntry[];
  titles: TitleDef[];
  // Tahsis
  allocations: Allocation[];
  planLocks: PlanLock[];
  snapshots: Snapshot[];
  settings: WorkspaceSettings;
  appVersion: string;
  exportDate?: string;
}
