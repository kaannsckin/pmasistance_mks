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
  // Kayıt yaşam döngüsü (planlama simülasyonu ve AI tahmini için; bkz. utils/planning)
  issueType?: IssueType;
  createdAt?: string; // ISO; uygulamada açılışta ya da içe aktarılan kaynaktan (Jira "Created")
  importedAt?: string; // içe aktarıldıysa zamanı (açılış tarihi bilinmiyorsa lead time hesaplanmaz)
  startedAt?: string; // ilk kez "Süreçte"ye geçtiği an
  resolvedAt?: string; // son kapanış (yeniden açılınca silinir)
  statusLog?: TaskStatusChange[]; // durum geçişleri (en yeni sonda, en çok 50)
  estimateSource?: 'user' | 'ai' | 'jira' | 'import' | 'reference' | 'model'; // reference: benzer kapanmış kayıtların gerçek sürelerinden; model: klasik ML modeli
  forecast?: TaskForecast; // açılışta yapılan süre tahmini (kayıt kapanınca isabeti ölçülür)
  originalEstimateHours?: number; // kaynak sistemdeki ilk tahmin (Jira "Original Estimate")
  actualHours?: number; // harcanan efor (Jira "Time Spent" / worklog)
  storyPoints?: number;
  fixVersion?: string; // kaynak sistemdeki hedef sürüm
}

export type IssueType = 'bug' | 'feature' | 'improvement' | 'task' | 'other';

/** Efor aralığı (kişi-gün): iyimser · olası · kötümser */
export interface EffortRange {
  best: number;
  likely: number;
  worst: number;
}

export type Confidence = 'high' | 'medium' | 'low';

/** AI kayıt tahmini güvenceleri: biri tetiklenirse güven düşer */
export type AiEstimateFlag = 'no_history' | 'no_evidence' | 'unknown_evidence' | 'outside_history' | 'priority_conflict';

/**
 * Öneri günlüğü kaydı: yeni kayıt açılırken gösterilen öneriler (geçmiş
 * kayıtlardan ve AI'dan), kör tahmin ve kullanıcının nihai kararı. Kayıt
 * kapanınca gerçekleşen süre `taskId` ile eşlenir; böylece hangi kaynağın
 * ne kadar isabetli olduğu ve önerilerin kabul oranı ölçülür.
 */
export interface EstimateLogEntry {
  id: string;
  at: string; // ISO
  projectId: string;
  taskId?: string;
  draft: { name: string; issueType?: IssueType; unit?: string; hasNotes: boolean };
  /** Kör tahmin: kullanıcının öneriyi görmeden girdiği */
  blind?: { effortDays?: number; priority?: Task['priority'] };
  reference?: {
    method: 'similar' | 'group' | 'all';
    n: number;
    confidence: Confidence;
    p50Days: number;
    p80Days: number;
    effort: EffortRange;
    priority?: Task['priority'];
    issueType?: IssueType;
  };
  ai?: {
    promptVersion: string;
    model?: string;
    issueType?: IssueType;
    priority?: Task['priority'];
    effort: EffortRange;
    confidence: Confidence;
    flags: AiEstimateFlag[];
    evidence: string[]; // dayanak gösterilen geçmiş kayıt kimlikleri
    questions: number; // sorduğu eksik bilgi sayısı
  };
  /** Klasik ML modeli (geçmiş kayıtlardan eğitilen) */
  model?: {
    version: string;
    effort: EffortRange;
    p50Days: number;
    p80Days: number;
    priority?: Task['priority'];
    issueType?: IssueType;
  };
  final: {
    source: 'reference' | 'ai' | 'user' | 'calibrated' | 'model' | 'none';
    priority: Task['priority'];
    issueType?: IssueType;
    effort?: EffortRange;
    version: number;
  };
}

/**
 * Sürüm planı (planlama asistanı › sürüm sihirbazı). Taslak olarak saklanır,
 * kalınan adımdan devam edilir; aktarılınca kayıtlar göreve, kilometre taşları
 * hedefin anahtar sonuçlarına dönüşür ve plan taban çizgisi olarak donar.
 */
export type ReleaseItemChoice = 'reference' | 'ai' | 'model' | 'own' | 'manual';

export interface ReleasePlanItem {
  id: string;
  name: string;
  notes?: string;
  issueType?: IssueType;
  unit?: string;
  priority?: Task['priority']; // kullanıcının seçtiği (boşsa öneri)
  resourceName?: string;
  workPackageId?: string;
  predecessorId?: string; // aynı plandaki başka satır
  sourceTaskId?: string; // havuzdan alınan mevcut görev
  ownEstimateDays?: number;
  /** Havuzdan alınan görevin kendi aralığı (kendi tahmin değişmedikçe korunur) */
  ownRange?: EffortRange;
  /** Kör tahmin: öneriler açılmadan önce girilen değerler (bir kez donar) */
  blind?: { effortDays?: number; priority?: Task['priority'] };
  reference?: EstimateLogEntry['reference'];
  ai?: NonNullable<EstimateLogEntry['ai']> & { rationale?: string; questionList?: string[] };
  model?: NonNullable<EstimateLogEntry['model']>;
  choice?: ReleaseItemChoice;
  manual?: EffortRange;
  excluded?: boolean;
}

export interface ReleaseMilestone {
  id: string;
  name: string;
  itemIds: string[];
  targetDate?: string; // YYYY-AA-GG
  rationale?: string;
}

export interface ReleaseBaseline {
  at: string;
  start: string; // simülasyon başlangıcı (YYYY-AA-GG)
  p50: string; // teslim tarihleri (test dahil)
  p80: string;
  p95: string;
  targetProbability: number | null;
  itemCount: number;
  effortDays: number;
  milestones: { id: string; name: string; p50: string; p80: string }[];
  taskIds: string[];
  objectiveId?: string;
}

export interface ReleasePlan {
  id: string;
  name: string;
  summary: string;
  targetDate?: string;
  testDays: number;
  workPackageIds: string[];
  items: ReleasePlanItem[];
  milestones: ReleaseMilestone[];
  step: number; // 1–6
  status: 'draft' | 'committed';
  revealed?: boolean; // kör tahmin sonrası öneriler açıldı
  createdAt: string;
  updatedAt: string;
  baseline?: ReleaseBaseline;
}

/**
 * Altın set: PY/PMO'nun doğruladığı kapanmış kayıtlar. AI tahmin önerisinin
 * kalite kapısı bu kayıtlarda ölçülür (her kayıt kendisi geçmişten çıkarılarak).
 */
export interface GoldenItem {
  taskId: string;
  projectId: string;
  priority: Task['priority']; // doğru kabul edilen önem
  issueType?: IssueType; // doğru kabul edilen tür
  addedAt: string;
}

/** Altın set değerlendirmesi (bir istem sürümü + model için) */
export interface EvalRun {
  id: string;
  at: string;
  promptVersion: string;
  model?: string;
  n: number;
  reference: { mae: number | null; coverage: number | null; priorityAccuracy: number | null };
  ai: { n: number; mae: number | null; coverage: number | null; priorityAccuracy: number | null; typeAccuracy: number | null; lowConfidence: number | null; unknownEvidence: number | null } | null;
  passed: boolean | null; // null: yetersiz örnek ya da AI çalışmadı
  reasons: string[];
}

/** Planlama asistanının kayıt açılırken verdiği tahmin (öğrenme döngüsü için saklanır) */
export interface TaskForecast {
  at: string; // ISO
  method: 'similar' | 'group' | 'all';
  n: number; // dayanılan kapanmış kayıt sayısı
  confidence: Confidence;
  p50Days: number; // kapanma süresi (iş günü)
  p80Days: number;
  effortDays?: number; // önerilen olası efor (gün)
  accepted: boolean; // öneri tahmine uygulandı mı
}

export interface TaskStatusChange {
  at: string; // ISO
  from: TaskStatus;
  to: TaskStatus;
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
  Risks,
  Calendar,
  Overview, // Proje genel bakış (modern arayüz)
  RiskReport, // Portföy risk raporu (modern arayüz)
  Expectations, // Yönetimden beklentiler (modern arayüz)
  WeeklyReport, // Haftalık rapor (PY → BS → PYDS → müdür)
  Meetings, // Planlanan müşteri görüşmeleri
  Admin, // Yönetici (admin): rol yetkileri ve profiller
  Planning, // Planlama asistanı: yeni kayıt tahmini ve plan simülasyonu (modern arayüz)
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
 *  - admin: rollerin yetkilerini ve kişi profillerini yönetir
 * Rollerin özellik yetkileri varsayılanları utils/permissions.ts'tedir; admin
 * bunları WorkspaceData.rolePermissions ile değiştirebilir.
 */
export type UserRole = 'mudur' | 'pyb_sorumlu' | 'pyb_destek' | 'py' | 'bolum_sorumlu' | 'admin';

/** Rol bazlı özellik yetkileri (katalog ve varsayılanlar: utils/permissions.ts) */
export type PermissionKey =
  | 'screen.executive' | 'screen.admin' | 'portfolio.viewAll'
  | 'project.create' | 'project.assignOwner' | 'datapool.edit' | 'plan.approve'
  | 'report.review' | 'health.rate' | 'expectation.respond' | 'meeting.review'
  | 'notes.private' | 'app.audit' | 'app.backup' | 'app.dataHealth' | 'ai.use';

/** Admin'in değiştirdiği roller: rol → verilen yetkilerin tam listesi (olmayan rol varsayılanı kullanır) */
export type RolePermissions = Partial<Record<UserRole, PermissionKey[]>>;

/** Proje içi sekmeler (admin rol bazında gizleyebilir; genel bakış her zaman açık) */
export type ProjectSectionKey = 'overview' | 'board' | 'list' | 'timeline' | 'planning' | 'risks' | 'team' | 'goals' | 'workPackages' | 'assistant';
/** Yönetim ekranı kartları (admin rol bazında gizleyebilir) */
export type ExecSectionKey = 'summary' | 'kpis' | 'expectations' | 'meetings' | 'health' | 'attention' | 'approvals' | 'risks' | 'departments' | 'changes';
export type TaskSortKey = 'smart' | 'priority' | 'due' | 'name';
export type RiskSortKey = 'score' | 'recent';
export type ProjectSortKey = 'health' | 'name' | 'progress' | 'overdue';

/**
 * Rolün göreceği kayıtlar ve varsayılan sıralamalar (admin ayarlar). Filtreler
 * listeleri daraltır; sağlık skoru, EVM ve sayaçlar tam veriden hesaplanır.
 * Olmayan alan varsayılanı kullanır (her şey görünür).
 */
export interface RoleViewConfig {
  projectSections?: ProjectSectionKey[];
  execSections?: ExecSectionKey[];
  projectStatuses?: ProjectStatus[];
  minTaskPriority?: 'Blocker' | 'High' | 'Medium' | 'Low';
  minRiskScore?: number; // 0 · 8 (orta ve üstü) · 15 (yüksek)
  showClosedRisks?: boolean;
  taskSort?: TaskSortKey;
  riskSort?: RiskSortKey;
  projectSort?: ProjectSortKey;
}
export type ViewConfig = Partial<Record<UserRole, RoleViewConfig>>;

/** Sağlık puanı yöntemi (admin ayarlar): girdi ağırlıkları (0 = kapalı) ve bant eşikleri */
export interface HealthConfig {
  weights?: Partial<Record<HealthFactorKey, number>>;
  bandGood?: number;
  bandWarn?: number;
}

/** Profil: bir kişinin hangi rolle çalıştığı (admin tanımlar; profil değiştirme penceresinde listelenir) */
export interface UserProfile {
  id: string;
  role: UserRole;
  personId?: string; // kişi bazlı roller (PY, bölüm sorumlusu) için zorunlu
}

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

/** Proje risk kaydı — olasılık × etki (1-5), skor 1-25 */
export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export type RiskStatus = 'open' | 'monitoring' | 'closed';

export interface Risk {
  id: string;
  title: string;
  description?: string;
  probability: RiskLevel;
  impact: RiskLevel;
  ownerPersonId?: string; // Sahibi (havuzdaki kişi) — Jira benzeri atama
  owner?: string; // Sahibin adı (görüntü/dışa aktarım için; havuz atamasında otomatik doldurulur)
  mitigation?: string; // Azaltıcı aksiyon
  status: RiskStatus;
  createdAt: string;
}

/**
 * PESTEL analizi — projenin dış çevre faktörleri (Politik, Ekonomik, Sosyal,
 * Teknolojik, Çevresel, Yasal). Risk kaydını tamamlar: her faktör bir fırsat
 * ya da tehdit olarak, etki derecesiyle (1-5) kaydedilir.
 */
export type PestelCategory = 'political' | 'economic' | 'social' | 'technological' | 'environmental' | 'legal';

export interface PestelItem {
  id: string;
  category: PestelCategory;
  text: string;
  kind: 'opportunity' | 'threat'; // fırsat / tehdit
  impact: RiskLevel; // 1-5 etki derecesi
  note?: string; // aksiyon / açıklama
}

/**
 * SWOT analizi — Güçlü Yönler (Strengths) ve Zayıf Yönler (Weaknesses) içsel;
 * Fırsatlar (Opportunities) ve Tehditler (Threats) dışsaldır. PESTEL ve risk
 * kaydını 2×2 stratejik pano olarak özetler; PESTEL fırsat/tehditleri ve
 * yüksek riskler tek tıkla SWOT'a beslenebilir.
 */
export type SwotQuadrant = 'strength' | 'weakness' | 'opportunity' | 'threat';

export interface SwotItem {
  id: string;
  quadrant: SwotQuadrant;
  text: string;
  note?: string; // aksiyon / açıklama (opsiyonel)
}

export interface Project {
  id: string;
  name: string;
  code?: string; // SAP / faaliyet kodu
  status: ProjectStatus;
  rag?: RagStatus;
  ragNote?: string; // Haftalık durum açıklaması (PM girer)
  pmPersonId?: string; // Proje Yöneticisi (havuzdaki kişi) — RBAC sahipliği
  jiraProjectKey?: string; // Jira proje anahtarı (worklog çekmek için, ör. MKS)
  risks?: Risk[];
  pestelItems?: PestelItem[]; // PESTEL dış çevre analizi
  swotItems?: SwotItem[]; // SWOT stratejik analizi
  tasks: Task[];
  resources: Resource[];
  notes: Note[];
  customerRequests: CustomerRequest[];
  objectives: Objective[];
  workPackages: WorkPackage[]; // Proje bazlı iş paketleri (İP)
  releasePlans?: ReleasePlan[]; // Sürüm planlama sihirbazı taslakları ve aktarılan planlar
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

/** Arayüz tercihi: klasik (mevcut) ya da modern (sade, iOS tarzı) */
export type UiStyle = 'classic' | 'modern';

export interface WorkspaceSettings {
  isLocalPersistenceEnabled?: boolean;
  isAIEnabled?: boolean;
  theme?: string;
  isDarkMode?: boolean;
  uiStyle?: UiStyle;
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
  email?: string; // Kurumsal e-posta — rapor hatırlatması ve bildirimler (Teams/e-posta)
}

export interface Department {
  code: string; // U310
  name: string;
  leadName?: string; // Bölüm Sorumlusu (metin, Excel'den)
  leadPersonId?: string; // Bölüm Sorumlusu (havuzdaki kişi) — RBAC sahipliği
}

export interface RoleCatalogEntry {
  id: string;
  departmentCode: string;
  name: string; // "Yazılım Geliştirme Mühendisi" vb.
}

export interface TitleDef {
  code: string; // ARŞ
  name: string; // Araştırmacı
  /** Tam zamanlı (1 AA) bir ayın maliyeti (₺) — maliyet katmanı için */
  monthlyCost?: number;
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
  /** Aktif kimlik: py/bölüm sorumlusu rollerinde kapsamı belirleyen havuz kişisi */
  currentPersonId?: string;
  // Veri havuzu
  people: Person[];
  departments: Department[];
  roleCatalog: RoleCatalogEntry[];
  titles: TitleDef[];
  // Tahsis
  allocations: Allocation[];
  planLocks: PlanLock[];
  snapshots: Snapshot[];
  leaves?: Leave[]; // Kişi uygunluğu — izin/tatil/yarı-zaman (kapasiteyi aya özel düşürür)
  expectations?: ManagementExpectation[]; // Yönetimden beklentiler (PM / bölüm sorumlusu → yönetim)
  weeklyReports?: WeeklyReport[]; // Haftalık raporlar (PY → BS → PYDS → müdür bilgisine)
  weeklyPublications?: WeeklyPublication[]; // Yayınlanan haftalar (müdürlere sunulan birleşik rapor)
  customerMeetings?: CustomerMeeting[]; // Planlanan müşteri görüşmeleri (yönetici onayına)
  reportSettings?: ReportSettings; // Rapor ayarları (alıcılar, kurum kısaltma sözlüğü)
  pmoRatings?: PmoRating[]; // PMO'nun haftalık proje sağlığı puanları (sağlık modelinin hedef değişkeni)
  healthHistory?: HealthWeekSnapshot[]; // Haftalık sağlık fotoğrafları (özellik vektörü + skor)
  rolePermissions?: RolePermissions; // Admin'in rol yetkisi değişiklikleri
  rolePermissionsRev?: number; // yetki kataloğu sürümü (yeni yetkilerin geçişi için)
  viewConfig?: ViewConfig; // Admin'in rol bazlı görünüm, filtre ve sıralama ayarları
  aiPolicy?: AiPolicy; // Admin'in yapay zekâ politikası
  estimateLog?: EstimateLogEntry[]; // Kayıt tahmini öneri günlüğü (en yeni sonda)
  reportAiLog?: ReportAiLogEntry[]; // Haftalık rapor AI öneri günlüğü (en yeni sonda; metin yok)
  goldenSet?: GoldenItem[]; // Tahmin değerlendirmesi için doğrulanmış kapanmış kayıtlar
  evalRuns?: EvalRun[]; // Altın set değerlendirmeleri (en yeni sonda)
  modelEvals?: ModelEvalRun[]; // Klasik ML modelinin zaman ayrımlı sınamaları (en yeni sonda)
  healthConfig?: HealthConfig; // Admin'in sağlık puanı yöntemi ayarları
  profiles?: UserProfile[]; // Admin'in tanımladığı profiller (kişi ↔ rol)
  auditLog?: AuditEntry[]; // Kritik aksiyonların günlüğü (en yeni başta)
  settings: WorkspaceSettings;
  appVersion: string;
  exportDate?: string;
}

/**
 * Kişi uygunluğu (izin/tatil/yarı-zaman): bir kişinin belirli ay için
 * kullanılamayan AA'sı. Efektif kapasite = availableAA − aynı ay izin AA'ları.
 */
export interface Leave {
  id: string;
  personId: string;
  year: number;
  month: number; // 1-12
  aa: number; // O ay düşen kapasite (AA); 1 = tam ay, 0.5 = yarım ay
  reason?: string; // İzin / Tatil / Eğitim / Yarı-zaman …
}

/**
 * Yönetimden beklenti: PM ya da bölüm sorumlusunun yönetimden karar, onay ya
 * da destek beklediği konu. Aciliyet ve kategoriyle kaydedilir; yönetim
 * panelinde hatırlatma olarak görünür, yönetim yanıtlar.
 */
export type ExpectationUrgency = 'critical' | 'important' | 'normal';
export type ExpectationCategory = 'budget' | 'schedule' | 'approval' | 'customer' | 'resource' | 'procurement' | 'technical' | 'other';
/** open: yanıt bekliyor · acknowledged: yönetim inceliyor · resolved: karşılandı · withdrawn: geri çekildi */
export type ExpectationStatus = 'open' | 'acknowledged' | 'resolved' | 'withdrawn';

/** Beklentiye eklenen ayrıntı: projedeki görev/risk kaydı ya da bir bağlantı */
export interface ExpectationLink {
  kind: 'task' | 'risk' | 'url';
  projectId?: string; // task/risk için
  refId?: string; // görev/risk id
  url?: string; // kind = url
  label: string; // eklendiği andaki başlık (kayıt silinse de okunur)
}

export interface ManagementExpectation {
  id: string;
  title: string;
  description?: string;
  category: ExpectationCategory;
  urgency: ExpectationUrgency;
  status: ExpectationStatus;
  projectId?: string;
  departmentCode?: string; // bölüm sorumlusunun bölümü
  needBy?: string; // ISO tarih — en geç ne zamana kadar
  links?: ExpectationLink[];
  createdAt: string;
  updatedAt: string;
  createdByRole: UserRole;
  createdByPersonId?: string;
  createdByName?: string;
  response?: string; // yönetimin yanıtı
  respondedAt?: string;
  respondedByName?: string;
  respondedByRole?: UserRole;
}

// ---------------------------------------------------------------------------
// Haftalık rapor: PY yazar → bölüm sorumlusu düzenler/onaylar (+ bölüm
// eklemeleri) → PYB destek format kontrolü → müdürlere birleşik rapor
// ---------------------------------------------------------------------------

/** Raporda istenen gelişme türleri (kurum rapor kılavuzu) */
export type ReportCategory =
  | 'contract' | 'sales' | 'invoice' | 'milestone' | 'delivery' | 'meeting'
  | 'schedule_budget' | 'event' | 'customer_feature' | 'ongoing' | 'plan';

/** Toplantı/sunum maddesi: zaman, yer, katılımcılar, gündem, kararlar */
export interface MeetingDetails {
  date: string; // ISO tarih
  place: string;
  participants: string;
  agenda: string;
  decisions: string;
}

export interface ReportItem {
  id: string;
  category: ReportCategory;
  text: string;
  meeting?: MeetingDetails;
  source?: 'ai' | 'note' | 'worklog' | 'meeting' | 'task' | 'manual';
  /** AI'dan geldiyse uygulandığı andaki özgün hâli (kabul/düzenleme ölçüsü ve düzeltme örnekleri için) */
  aiOriginal?: { text: string; category: ReportCategory };
}

export interface Abbreviation {
  abbr: string;
  expansion: string;
}

/** draft: PY yazıyor · bs_review: bölüm sorumlusunda · pyds_review: PYB destekte · approved: yayına hazır */
export type ReportStage = 'draft' | 'bs_review' | 'pyds_review' | 'approved';

export interface ReportEvent {
  at: string;
  action: 'create' | 'submit' | 'bs_approve' | 'pyds_approve' | 'return' | 'edit' | 'reopen';
  byRole: UserRole;
  byName?: string;
  note?: string;
}

/** Jira worklog kaydı (dosyadan ya da Jira API'den) */
export interface WorklogEntry {
  date: string; // ISO tarih
  author: string;
  issueKey?: string;
  summary: string;
  hours: number;
  comment?: string;
  source: 'file' | 'jira';
}

export interface WeeklyReport {
  id: string;
  year: number; // ISO hafta yılı
  week: number; // ISO hafta
  kind: 'project' | 'department'; // proje raporu ya da bölüm sorumlusunun eklemeleri
  projectId?: string;
  departmentCode: string;
  thisWeek: ReportItem[]; // Bu hafta gelişmeler
  nextWeek: ReportItem[]; // Gelecek hafta planlanan
  abbreviations: Abbreviation[];
  stage: ReportStage;
  returnNote?: string; // iade gerekçesi (bir önceki aşamaya)
  worklog?: WorklogEntry[];
  /** AI'nın son önerisi — onaylı son hâliyle birlikte ince ayar veri setine girer */
  aiDraft?: ReportAiDraft;
  /** PY'nin bu hafta projenin genel sağlığına verdiği puan (1–10); sağlık modelinin girdisi */
  pmScore?: number;
  pmScoreNote?: string; // tek cümlelik gerekçe
  /** Geçen haftanın "gelecek hafta planı" maddeleri ne oldu? (söz tutma oranı) */
  planReview?: PlanReviewItem[];
  /** AI'nın rapor metnine verdiği puan (PYB destek haftayı yayınlarken hesaplanır) */
  aiAssessment?: AiReportAssessment;
  authorPersonId?: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
  history: ReportEvent[];
}

/**
 * Rapora uygulanan AI önerisinin kaydı. Son girdi ve çıktı saklanır;
 * itemIds birden fazla uygulamada birikir (kabul oranı ölçümü için).
 */
export interface ReportAiDraft {
  generatedAt: string;
  input: string;
  output: string;
  promptVersion?: string;
  variant?: ReportPromptVariant;
  model?: string;
  mode?: 'append' | 'replace';
  proposed?: { thisWeek: number; nextWeek: number };
  itemIds?: string[];
}

/**
 * İstem katmanları (değerlendirmede karşılaştırılır). base: varsayılan kılavuz
 * ve sabit örnek · card: + proje kartı · examples: + dinamik örnekler ·
 * rules: + kurum/bölüm kılavuzu ve öğrenilmiş kurallar · full: hepsi (üretim) ·
 * ft: örneksiz (ince ayarlı model için)
 */
export type ReportPromptVariant = 'base' | 'card' | 'examples' | 'rules' | 'full' | 'ft';

/**
 * Rapor AI öneri günlüğü kaydı (metin yok, yalnız sayılar). Öneri
 * uygulandığında, vazgeçildiğinde ya da hata verdiğinde; rapor taslaktan
 * gönderildiğinde de AI maddelerinin ne kadarının aynen kaldığı yazılır.
 */
export interface ReportAiLogEntry {
  at: string;
  reportId: string;
  projectId?: string;
  departmentCode: string;
  promptVersion: string;
  variant?: ReportPromptVariant;
  model?: string;
  outcome: 'applied_append' | 'applied_replace' | 'discarded' | 'error' | 'submitted';
  nThis: number;
  nNext: number;
  lintErrors: number;
  lintWarnings: number;
  /** Girdide dayanağı bulunmayan rakam/tarih/ad sayısı (önizlemede) */
  ungrounded?: number;
  /** Otomatik düzeltme turu yapıldı */
  repaired?: boolean;
  // Gönderimde: AI maddelerinin akıbeti
  aiItems?: number;
  kept?: number;
  edited?: number;
  deleted?: number;
  humanAdded?: number;
  /** Gönderimdeki format sorunları (kod → sayı) */
  lintCodes?: Record<string, number>;
}

/** done: yapıldı · partial: kısmen · slipped: ertelendi · dropped: iptal / kapsam dışı (orana girmez) */
export type PlanReviewStatus = 'done' | 'partial' | 'slipped' | 'dropped';

export interface PlanReviewItem {
  itemId: string; // geçen haftanın plan maddesi
  text: string; // değerlendirildiği andaki metin (madde sonradan değişse de okunur)
  status: PlanReviewStatus;
}

/** Rapor metninin AI değerlendirmesi: nitel puan, gerekçe ve rapordan birebir alıntılar */
export interface AiReportAssessment {
  score: number; // 1–10
  rationale: string;
  evidence: string[]; // rapordan birebir alıntılar (doğrulanmış)
  signals: string[]; // engel, belirsizlik, müşteri sorunu…
  at: string; // ISO
  inputHash: string; // değerlendirilen metnin özeti — rapor değişirse yeniden hesaplanır
  // Halüsinasyon güvenceleri (yoksa eski tek değerlendirme)
  runs?: number[]; // bağımsız değerlendirmelerin puanları (skor = medyan)
  spread?: number; // en yüksek − en düşük
  ruleScore?: number; // kural tabanlı metin göstergesi (1–10), çapraz kontrol
  flags?: AiAssessmentFlag[];
  confidence?: 'high' | 'low';
  promptVersion?: string;
}

export type AiAssessmentFlag = 'no_evidence' | 'inconsistent' | 'rule_gap' | 'signal_conflict';

/** Admin'in AI politikası: kurum geneli açık/kapalı, özellikler ve puanlama güvenceleri */
export interface AiPolicy {
  enabled?: boolean; // kurum geneli (varsayılan açık)
  chat?: boolean; // asistan sohbeti
  embedded?: boolean; // ekran içi AI (taslak, öneri, özet)
  proposals?: boolean; // asistanın değişiklik önerileri
  blindEstimate?: boolean; // kör tahmin: öneriler, kullanıcı kendi tahminini girdikten sonra görünür (varsayılan açık)
  estimateGate?: EstimateGatePolicy; // AI tahmin önerisinin kalite kapısı
  modelEstimate?: ModelEstimatePolicy; // planlamada klasik ML modeli önerisi (varsayılan: otomatik)
  scoring?: AiScoringPolicy;
  maskNames?: boolean; // AI'ya giden metinlerde kişi/proje/kurum adları takma adla (varsayılan açık)
}

/** Kalite kapısı: altın sette AI önerisi bu eşikleri geçmezse (zorunluysa) öneri gösterilmez */
/** Klasik ML modelinin ölçüleri (zaman ayrımlı sınama kümesinde) */
export interface ModelMetrics {
  mae: number | null; // efor ortalama mutlak hata (gün)
  coverage: number | null; // gerçek efor [iyimser, kötümser] içinde
  daysMae: number | null; // kapanma süresi P50 hatası (iş günü)
  p80Coverage: number | null; // kapanma ≤ P80 oranı
  priorityAccuracy: number | null;
  typeAccuracy: number | null;
}

/** Klasik ML modelinin geçmiş kayıt tahminiyle karşılaştırması */
export interface ModelEvalRun {
  id: string;
  at: string;
  version: string;
  nTrain: number;
  nTest: number;
  cutoff: string; // sınama kümesinin ilk kapanışı (ISO)
  model: ModelMetrics;
  reference: ModelMetrics;
  better: boolean | null; // ekip tahmini olmadan; null: yetersiz veri
  /** Ekibin ilk tahmini de verildiğinde (yalnız kendi tahmini olan kayıtlar) */
  withEstimate: { n: number; mae: number | null; referenceMae: number | null; coverage: number | null; better: boolean | null };
  reasons: string[];
  importance: { label: string; share: number }[];
}

/** auto: son sınamada geçmiş kayıt tahmininden isabetliyse gösterilir */
export type ModelEstimatePolicy = 'auto' | 'on' | 'off';

export interface EstimateGatePolicy {
  enforce: boolean;
  maxMaeRatio: number; // AI ortalama hatası ≤ geçmiş kayıt tahmininin hatası × oran
  minPriorityAccuracy: number; // önem doğruluğu alt sınırı (0–1)
  minCoverage: number; // gerçek eforun AI aralığında kalma oranı alt sınırı (0–1)
}

export interface AiScoringPolicy {
  runs: number; // 1 · 3 · 5 bağımsız değerlendirme
  minEvidence: number; // doğrulanmış alıntı alt sınırı (0–3)
  maxSpread: number; // tekrarlar arası kabul edilen en büyük fark
  maxRuleGap: number; // kural tabanlı göstergeyle kabul edilen en büyük fark
  lowConfidence: 'exclude' | 'flag'; // güveni düşük puan sağlık skoruna girmesin / işaretlenip girsin
}

export interface WeeklyPublication {
  year: number;
  week: number;
  publishedAt: string;
  publishedByName?: string;
  emailedAt?: string;
}

export interface ReportSettings {
  /** Birleşik raporun gönderileceği müdür/yönetim e-postaları */
  directorEmails: string[];
  /** Kurum kısaltma sözlüğü (raporda kullanılan kısaltmalar otomatik açılır) */
  abbreviations: Abbreviation[];
  /** Raporun son günü (1 = Pazartesi … 5 = Cuma) */
  dueWeekday: number;
  /** Onay akışı ve kurallar (admin ayarlar); yoksa varsayılan akış */
  flow?: ReportFlow;
}

/** Haftalık rapor akışı: hangi onay adımları var, gönderimde neler zorunlu */
export interface ReportFlow {
  bsReview: boolean; // bölüm sorumlusu onayı
  pydsReview: boolean; // PYB destek format denetimi
  requirePmScore: boolean; // PY sağlık puanı olmadan gönderilemez
  requirePlanReview: boolean; // geçen haftanın planı değerlendirilmeden gönderilemez
  aiOnPublish: boolean; // hafta yayınlanırken AI metin puanı
}

// ---------------------------------------------------------------------------
// Planlanan müşteri görüşmeleri (PY / bölüm sorumlusu → yönetici onayı)
// ---------------------------------------------------------------------------

export type MeetingStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'held' | 'cancelled';
export type MeetingLocation = 'bilgem' | 'customer' | 'online' | 'other';

export interface CustomerMeeting {
  id: string;
  title: string; // konu / amaç
  customer: string; // müşteri / paydaş kurum
  projectId?: string;
  departmentCode?: string;
  date: string; // ISO tarih-saat
  locationType: MeetingLocation;
  location: string; // adres / salon / bağlantı
  ourParticipants: string;
  customerParticipants: string;
  agenda: string;
  expectedOutcome: string; // beklenen karar / çıktı
  needs?: string; // demo ortamı, araç, sunum vb.
  managementAttendance: boolean; // yönetimin katılımı isteniyor mu
  status: MeetingStatus;
  decisions?: string; // gerçekleştikten sonra alınan kararlar
  reviewNote?: string; // onay/ret notu
  reviewedByName?: string;
  reviewedAt?: string;
  createdByRole: UserRole;
  createdByPersonId?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

/** Denetim günlüğü — kim, ne zaman, hangi kritik aksiyonu yaptı */
export type AuditAction =
  | 'project.create' | 'project.delete' | 'project.owner' | 'project.rag'
  | 'risk.add' | 'risk.close'
  | 'plan.submit' | 'plan.approve' | 'plan.reject' | 'plan.unlock'
  | 'data.import' | 'identity.change' | 'health.fix' | 'health.rate' | 'snapshot.create' | 'access.update' | 'config.update'
  | 'ai.apply'
  | 'expectation.create' | 'expectation.respond' | 'expectation.close'
  | 'report.submit' | 'report.approve' | 'report.return' | 'report.publish'
  | 'meeting.submit' | 'meeting.approve' | 'meeting.reject' | 'meeting.held'
  | 'release.commit' | 'data.export';

export interface AuditEntry {
  id: string;
  at: string; // ISO
  actorRole: UserRole;
  actorPersonId?: string;
  actorName?: string; // aksiyon anındaki kişi adı (sonradan silinse de kalır)
  action: AuditAction;
  summary: string; // insan-okur Türkçe özet
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Proje sağlık modeli: PMO puanı (hedef değişken) ve haftalık sağlık fotoğrafı
// ---------------------------------------------------------------------------

/** Sağlık skorunun girdileri (her biri 0–1'e normalize edilir, 1 = sağlıklı) */
export type HealthFactorKey = 'spi' | 'cpi' | 'overdue' | 'risk' | 'rag' | 'pm' | 'ai' | 'commitment' | 'resource' | 'expectations';

/**
 * PMO'nun (PYB sorumlusu / PYB destek) bir projeye o ISO haftası için verdiği
 * 1–10 puan. Regresyonun hedef değişkenidir (Y); proje × hafta başına tek kayıt.
 */
export interface PmoRating {
  id: string;
  projectId: string;
  year: number; // ISO hafta yılı
  week: number; // ISO hafta
  score: number; // 1–10
  note?: string;
  byRole: UserRole;
  byPersonId?: string;
  byName?: string;
  at: string; // ISO
}

/** Bir projenin o haftaki sağlık fotoğrafı: skor, kapsam ve normalize girdiler */
export interface HealthSnapshotEntry {
  projectId: string;
  score: number; // 0–100
  coverage: number; // 0–1 (verisi olan girdilerin ağırlık toplamı)
  x: Partial<Record<HealthFactorKey, number>>; // verisi olmayan girdi yazılmaz
}

/** ISO haftası başına tek fotoğraf; hafta içinde günde en çok bir kez tazelenir */
export interface HealthWeekSnapshot {
  year: number; // ISO hafta yılı
  week: number;
  takenAt: string; // ISO
  model: string; // skoru üreten model sürümü (ör. "uzman-1")
  projects: HealthSnapshotEntry[];
}
