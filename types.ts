import type { JiraHistorySummary } from './utils/jiraHistory';
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
  /** Görevin sürdüğü ardışık sprint sayısı; `version` sprintinde başlar (yoksa 1) */
  sprintSpan?: number;
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
  jiraIssueType?: string; // Jira'daki tür adı (Bug, Sub-task, Change Request …); panoda türü ayırt etmek için
  createdAt?: string; // ISO; uygulamada açılışta ya da içe aktarılan kaynaktan (Jira "Created")
  importedAt?: string; // içe aktarıldıysa zamanı (açılış tarihi bilinmiyorsa lead time hesaplanmaz)
  startedAt?: string; // ilk kez "Süreçte"ye geçtiği an
  resolvedAt?: string; // son kapanış (yeniden açılınca silinir)
  statusLog?: TaskStatusChange[]; // durum geçişleri (en yeni sonda, en çok 50)
  jiraBase?: Partial<Record<JiraSyncFieldId, string>>; // çift yönlü eşitlemede son eşitlenen Jira değerleri (hangi tarafın değiştiğini bulmak için)
  estimateSource?: 'user' | 'ai' | 'jira' | 'import' | 'reference' | 'model'; // reference: benzer kapanmış kayıtların gerçek sürelerinden; model: klasik ML modeli
  forecast?: TaskForecast; // açılışta yapılan süre tahmini (kayıt kapanınca isabeti ölçülür)
  originalEstimateHours?: number; // kaynak sistemdeki ilk tahmin (Jira "Original Estimate")
  actualHours?: number; // harcanan efor (Jira "Time Spent" / worklog)
  remainingEstimateHours?: number;
  aggregateOriginalEstimateHours?: number;
  aggregateRemainingHours?: number;
  aggregateSpentHours?: number;
  timeTrackingAt?: string;
  historySummary?: JiraHistorySummary;
  jiraParentKey?: string;
  jiraSubtaskKeys?: string[];
  /**
   * Jira worklog'ları (billing hours): kim, hangi gün, kaç saat. Eşitlemede
   * actualHours değişince yenilenir; forHours o anki actualHours'tur.
   */
  jiraWorklog?: TaskJiraWorklog;
  storyPoints?: number;
  fixVersion?: string; // kaynak sistemdeki hedef sürüm
  jiraStatus?: string; // Jira'daki durum adı (ör. "ANALYSIS"); pano kolon eşlemesinde kullanılır
  /** Elle girilen ilerleme yüzdesi (0–100; ör. EMS panosundan). Yoksa durumdan otomatik: geliştirmede %50, testte %75. */
  progressPct?: number;
  /** Ekibin serbest tahmini (ör. "2-3 gün", "1 hafta"); EMS panosundan gelir */
  estimateText?: string;
  components?: string[]; // Projenin bileşen listesinden (Jira "Component/s")
  resolution?: string; // Çözüm (Jira "Resolution"): Düzeltildi, Yapılmayacak, Tekrar …
  updatedAt?: string; // son değişiklik (Jira "Updated" ya da panoda taşıma) — "Son güncellenenler" filtresi
}

// ---------------------------------------------------------------- Proje panosu (Jira tarzı yapılandırma)

/** Pano kolonuna eşlenen durum: uygulama durumu (`app:ToDo`) ya da Jira durum adı (`jira:ANALYSIS`) */
export type BoardStatusKey = `app:${TaskStatus}` | `jira:${string}`;

export interface BoardColumnConfig {
  id: string;
  name: string;
  statuses: BoardStatusKey[];
  /** Etiket kuralı: görevde bu etiketlerden biri varsa bu kolon (kural önceliğine göre) */
  labels?: string[];
  /** WIP sınırları (Jira "Min/Max") */
  min?: number;
  max?: number;
  /** Kart bu kolona taşınınca uygulamadaki durum */
  targetStatus: TaskStatus;
}

export interface BoardQuickFilter {
  id: string;
  name: string;
  /** me: atanan oturumdaki kişi; diğer koşullar VE ile birleşir */
  assignee?: 'me' | string;
  labels?: string[];
  priorities?: Task['priority'][];
  issueTypes?: IssueType[];
  overdue?: boolean;
  /** Son N günde güncellenen */
  recentDays?: number;
  /** Bu bileşenlerden biri */
  components?: string[];
  /** Bu hedef sürümlerden biri */
  fixVersions?: string[];
}

// ---------------------------------------------------------------- Proje yapılandırma şeması (Jira "scheme" modeli)

/** İş akışı durumu: Jira anahtarı (eşleme), Türkçe adı ve ana kategorisi */
export interface WorkflowStatusDef {
  key: string;
  label: string;
  category: TaskStatus;
}

export interface WorkflowConfig {
  statuses: WorkflowStatusDef[];
  /** İzin verilen geçişler (anahtar → gidilebilecek anahtarlar). Yoksa serbest: her durumdan her duruma */
  transitions?: Record<string, string[]>;
  /** Yeni kaydın başlangıç durumu */
  initial: string;
  /** Diyagramdaki durum kutularının konumları (tasarımcı; yoksa otomatik yerleşim) */
  layout?: Record<string, { x: number; y: number }>;
  /**
   * Geçiş kuralları (Jira koşul / doğrulayıcı / sonrası işlem). Anahtar
   * "KAYNAK>HEDEF" (tek geçiş) ya da "*>HEDEF" (o duruma giren tüm geçişler);
   * ikisi birlikte uygulanır.
   */
  rules?: Record<string, TransitionRule>;
}

export interface TransitionRule {
  // --- Koşullar: geçişi kim yapabilir (boşsa herkes)
  /** Bu rollerden biri ya da `people` listesindeki biri */
  roles?: UserRole[];
  /** Havuz kişi kimlikleri */
  people?: string[];
  /** Yalnız görevin atananı */
  assigneeOnly?: boolean;
  /** Projede bu proje rollerinden birinin üyesi (ör. Test ekibi) */
  projectRoles?: string[];
  // --- Doğrulayıcılar: geçişte istenen bilgi
  /** Geçiş notu (göreve yorum olarak eklenir) */
  requireComment?: boolean;
  /** Harcanan süre (saat; görevin harcanan süresine eklenir) */
  requireHours?: boolean;
  /** Dolu olması gereken alanlar (boşsa geçiş penceresinde istenir) */
  requireFields?: SchemeRequiredField[];
  /** Tüm alt görevler tamamlanmış olmalı */
  requireSubtasksDone?: boolean;
  // --- Sonrası işlemler: geçiş sonrası otomatik
  addLabels?: string[];
  removeLabels?: string[];
  /** Atananı değiştir: geçişi yapan kişi, atamayı kaldır ya da belirli kişi (ad soyad) */
  assign?: 'actor' | 'none' | string;
  /** Atanan kişiye bildirim (e-posta; yoksa Teams kanalı) */
  notifyAssignee?: boolean;
  /** Alan güncelle (Jira "update issue field") */
  setFields?: {
    priority?: Task['priority'];
    /** 'clear' temizle, sayı: bugünden N gün sonra */
    dueDate?: 'clear' | number;
    /** 'clear' temizle, 'next' yayın tarihi en yakın yayınlanmamış sürüm, ya da sürüm adı */
    fixVersion?: 'clear' | 'next' | string;
    /** 'clear' temizle ya da çözüm değeri */
    resolution?: 'clear' | string;
  };
}

export type SchemeRequiredField = 'resourceName' | 'dueDate' | 'estimate' | 'issueType' | 'labels' | 'workPackage' | 'component' | 'fixVersion' | 'resolution';

export type NotificationEvent = 'created' | 'transitioned' | 'done' | 'reopened' | 'assigned' | 'commented';

/** Bildirim kuralı (Jira "notification scheme" satırı) */
export interface NotificationRule {
  id: string;
  event: NotificationEvent;
  /** 'transitioned' için: yalnız bu durumlara girişte (boş: her geçişte) */
  statuses?: string[];
  to: {
    assignee?: boolean;
    /** Projenin proje yöneticisi */
    pm?: boolean;
    /** Proje rolü üyeleri */
    roles?: string[];
    /** Havuz kişi kimlikleri */
    people?: string[];
    /** Teams kanalına da gönder */
    teams?: boolean;
  };
}

/** Proje rolü (Jira "project role"): tanımı kurum geneli, üyeleri proje bazında */
export interface ProjectRoleDef {
  id: string;
  name: string;
  description?: string;
}

// ---------------------------------------------------------------- Rapor otomasyonu

/** Zamanlanmış rapordaki bölümler (sırasıyla) */
export type ReportBlockKey = 'progress' | 'poc' | 'activity' | 'bugs' | 'overdue' | 'sprint' | 'milestones' | 'teams' | 'blockers' | 'risks';

/**
 * Zamanlanmış proje raporu: seçilen periyotta (TR saati) Teams, Slack, Notion
 * ve/veya e-postaya ilerleme özeti gönderir. Kanal adresleri ve jetonlar
 * sunucuda (yönetici › entegrasyonlar) tutulur; burada yalnız seçim vardır.
 */
export interface ReportSchedule {
  id: string;
  name: string;
  enabled: boolean;
  cadence: 'daily' | 'weekdays' | 'weekly';
  /** Haftalıkta gün: 1 Pazartesi … 7 Pazar */
  weekday?: number;
  /** Gönderim saati (0–23, Türkiye saati) */
  hour: number;
  channels: { teams?: boolean; slack?: boolean; notion?: boolean; email?: string[] };
  blocks: ReportBlockKey[];
  /** Kapsam: yalnız bu hedef sürümdeki görevler */
  fixVersion?: string;
  /** Rapora eklenen sabit not */
  note?: string;
  lastSentDay?: string;
  lastSentAt?: string;
  lastResult?: string;
  createdAt: string;
  updatedAt: string;
}

/** Günlük ilerleme ölçümü (rapordaki "önceki rapora göre" farkı için) */
export interface ProgressSnapshot {
  day: string;
  pct: number;
  done: number;
  total: number;
  open: number;
  bugsOpen: number;
  /** PoC "Bugün" skoru (0–100); proje PoC test listesi taşıyorsa */
  poc?: number;
  /** PoC skorunun dayandığı son Jira eşitlemesi (ISO) */
  pocSyncAt?: string;
}

// ---------------------------------------------------------------- Kural setleri (otomasyon)

/**
 * Otomasyon kuralı: tetikleyici → koşullar → eylemler. Görev değişince
 * (elle, toplu, Jira eşitlemesi, asistan) ya da günlük zamanlamada çalışır.
 * Örn. "Durum Çözüldü olduğunda ve atanan X ise → durumu Testte yap".
 */
export type AutomationTrigger =
  /** Durum değişti; to/from boşsa her geçiş (iş akışı anahtarları) */
  | { kind: 'status'; to?: string[]; from?: string[] }
  | { kind: 'created' }
  /** Bu alanlardan biri değişti */
  | { kind: 'field'; fields: AutomationField[] }
  /** Günde bir kez: koşula uyan açık görevler */
  | { kind: 'schedule' }
  /** Yalnız elle ("Çalıştır"): koşula uyan açık görevler */
  | { kind: 'manual' };

export type AutomationField =
  | 'status' | 'fromStatus' | 'category' | 'assignee' | 'role' | 'unit' | 'component' | 'issueType' | 'priority'
  | 'label' | 'fixVersion' | 'sprint' | 'effort' | 'dueInDays' | 'overdue' | 'resolution' | 'name';

export type AutomationOp = 'eq' | 'neq' | 'in' | 'notIn' | 'contains' | 'notContains' | 'empty' | 'notEmpty' | 'gt' | 'lt';

export interface AutomationCondition {
  field: AutomationField;
  op: AutomationOp;
  value?: string | number | string[];
}

export interface AutomationGroup {
  join: 'and' | 'or';
  items: (AutomationCondition | AutomationGroup)[];
}

export type AutomationAction =
  | { kind: 'setStatus'; status: string }
  /** Kişi adı, 'none' (atamayı kaldır) ya da 'componentLead' (bileşen sorumlusu) */
  | { kind: 'assign'; to: string }
  | { kind: 'setPriority'; priority: Task['priority'] }
  | { kind: 'setFixVersion'; version: string }
  /** Sprint numarası ya da 'next' (bir sonraki sprint) */
  | { kind: 'setSprint'; sprint: number | 'next' }
  /** Bugünden N gün sonra ya da 'clear' */
  | { kind: 'setDueDate'; days: number | 'clear' }
  | { kind: 'addLabels'; labels: string[] }
  | { kind: 'removeLabels'; labels: string[] }
  | { kind: 'setResolution'; resolution: string }
  | { kind: 'comment'; text: string }
  /** assignee: atanan; role: proje rolü üyeleri; teams: Teams kanalı */
  | { kind: 'notify'; to: 'assignee' | 'role' | 'teams'; roleId?: string; text?: string };

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Arayüz kipi: basit (tek cümle) ya da ileri (gruplar, çok eylem) */
  mode: 'simple' | 'advanced';
  trigger: AutomationTrigger;
  conditions?: AutomationGroup;
  actions: AutomationAction[];
  /** Durum, öncelik, termin, çözüm ve yorum Jira'daki kayda da yazılır */
  writeToJira?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Zamanlanmış kural en son hangi gün çalıştı (YYYY-AA-GG) */
  lastRunDay?: string;
  runs?: number;
  lastRunAt?: string;
}

export interface AutomationLogEntry {
  at: string;
  ruleId: string;
  ruleName: string;
  taskId: string;
  taskKey?: string;
  summary: string;
}

/** Projenin bileşeni (Jira "Component"): modül/alan; sorumlusu varsayılan atanan olabilir */
export interface ProjectComponent {
  id: string;
  name: string;
  description?: string;
  /** Bileşen sorumlusu (ad soyad) */
  lead?: string;
  /** Bu bileşenle açılan atanmamış göreve sorumlu atanır */
  assignLead?: boolean;
}

/** Projenin sürümü (Jira "Version/Release"): görevlerin hedef sürümü (fixVersion) */
export interface ProjectVersion {
  id: string;
  name: string;
  description?: string;
  startDate?: string;
  releaseDate?: string;
  status: 'unreleased' | 'released' | 'archived';
  releasedAt?: string;
}

/**
 * Proje yapılandırma şeması — admin tanımlar, projelere atar (birden çok
 * proje aynı şemayı paylaşabilir): iş akışı ve geçişler, kayıt türleri,
 * zorunlu alanlar, pano. Atanmamış proje yerleşik "Varsayılan" şemayı kullanır.
 */
export interface ProjectScheme {
  id: string;
  name: string;
  description?: string;
  workflow: WorkflowConfig;
  /** Kullanılabilen kayıt türleri (yok/boş: hepsi) */
  issueTypes?: IssueType[];
  /** Yeni kayıtta ve düzenlemede zorunlu alanlar */
  requiredFields?: SchemeRequiredField[];
  /** Şemanın panosu (yoksa iş akışından otomatik) */
  board?: BoardConfig;
  /** Proje sahibi panoyu kendi projesi için özelleştirebilir */
  allowProjectBoard: boolean;
  /** Bildirim şeması: olay → alıcılar */
  notifications?: NotificationRule[];
  /** Jira'ya bağlı görevlerde durum geçişini Jira'da da yap (not → yorum, süre → worklog, çözüm → resolution) */
  jiraWriteBack?: boolean;
  /**
   * Proje sahibi kendi projesinin iş akışını özelleştirebilir (Jira "genişletilmiş
   * proje yönetimi" gibi): yalnız bu yapılandırmanın durumlarını kullanır, yeni
   * durum ekleyemez; geçişleri ve başlangıcı değiştirebilir, durum çıkarabilir.
   */
  allowProjectWorkflow?: boolean;
  updatedAt?: string;
}

export type BoardSwimlane = 'none' | 'expedite' | 'assignee' | 'priority' | 'workPackage' | 'component' | 'fixVersion';

export interface BoardConfig {
  columns: BoardColumnConfig[];
  /** status: önce durum eşlemesi, aynı durumun kolonları arasında etiket seçer; label: etiket kuralı her zaman önce */
  rulePriority: 'status' | 'label';
  quickFilters: BoardQuickFilter[];
  swimlane: BoardSwimlane;
  /** Expedite kulvarı: bu önceliklerden ya da etiketlerden biri */
  expedite?: { priorities?: Task['priority'][]; labels?: string[] };
  /** Tamamlanma kolonlarında yalnız son N günde kapananlar (0/yok: hepsi) */
  doneDays?: number;
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
  manualSprint?: number; // manuel planda seçilen sprint, 0 = Havuz
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
  startDate?: string;
  mode?: 'manual';
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
  versionId?: string; // Aktarımda bağlanan proje sürümü
  manualCommit?: { at: string; taskIds: string[] };
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
    duration?: number; // Sprint bazlı test günü
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
  Dashboard, // Proje dashboard'u: kişiselleştirilebilir bileşenler (modern arayüzde projenin ilk ekranı)
  Whiteboard, // Proje whiteboard'u: FigJam tarzı serbest çalışma alanı (modern arayüz)
  Tests, // Testler: kayıtlı Jira filtresinden kural tabanlı test panosu, haftalık görüntü ve rapor (modern arayüz)
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
    sprintNames?: Record<number, string>; // Özel sprint isimleri
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

export interface CloudMembership {
  role: Exclude<UserRole, 'admin'>;
  personId: string | null;
  projectIds: string[] | null;
  accessAdmin: boolean;
  /** Demo / eğitim hesabı: bulutta da tüm rollere ve kişilere geçebilir (profil değiştir) */
  allRoles?: boolean;
}

/** Rol bazlı özellik yetkileri (katalog ve varsayılanlar: utils/permissions.ts) */
export type PermissionKey =
  | 'screen.executive' | 'screen.admin' | 'portfolio.viewAll'
  | 'project.create' | 'project.assignOwner' | 'datapool.edit' | 'plan.approve'
  | 'report.review' | 'health.rate' | 'expectation.respond' | 'meeting.review'
  | 'notes.private' | 'app.audit' | 'app.backup' | 'app.dataHealth' | 'ai.use';

/** Admin'in değiştirdiği roller: rol → verilen yetkilerin tam listesi (olmayan rol varsayılanı kullanır) */
export type RolePermissions = Partial<Record<UserRole, PermissionKey[]>>;

/** Proje içi sekmeler (admin rol bazında gizleyebilir; genel bakış her zaman açık) */
export type ProjectSectionKey = 'dashboard' | 'overview' | 'board' | 'list' | 'timeline' | 'planning' | 'risks' | 'team' | 'goals' | 'workPackages' | 'assistant' | 'whiteboard' | 'tests';
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

export interface JiraAgileBoard {
    id: number;
    name: string;
}

export interface JiraSprint {
    id: number;
    name: string;
    state: 'active' | 'future' | 'closed' | 'unknown';
    startDate?: string;
    endDate?: string;
    goal?: string;
}

export interface JiraAgileList<T> {
    values: T[];
    truncated: boolean;
}

/** Projeye özgü ayarlar (tema/kalıcılık gibi uygulama geneli ayarlar WorkspaceSettings'te) */
export interface ProjectSettings {
  sprintDuration: number;
  projectStartDate: string;
  tagColors?: Record<string, string>;
  titleCosts?: Record<string, number>;
  sprintNames?: Record<number, string>;
  jiraSprintImports?: Record<string, { localSprint: number; name: string; startDate?: string; endDate?: string }>;
  globalTestDays?: number;
  /** Test sonraki sprintle paralel yürür: sprint, öncekinin testini beklemeden geliştirme bitince başlar. */
  parallelTest?: boolean;
  useJiraRemainingEstimate?: boolean;
  manMonthTableColor?: string;
  costTableColor?: string;
  /** Darboğaz planı ve otomatik plan kuralları (utils/planning/bottleneck.ts) */
  planRules?: PlanRules;
}

/**
 * Haftalık sürüm planının proje kuralları: hedef tarih, test ekibi, test ve
 * bulgu oranı, odak, bulgu sorumluları ve fazla mesai sınırı. Proje ayarıyla
 * paylaşılır; otomatik plan ve Darboğaz penceresi aynı kuralları kullanır.
 */
export interface PlanRules {
  /** Hedef bitiş (ISO) */
  targetDate?: string;
  /** Test ekibinin birimi; boş metin: test adımı yok */
  testUnit?: string;
  /** Test ve bulgu eforu oranı (0–1) */
  testRatio?: number;
  /** Odak katsayısı (0,3–1) */
  focus?: number;
  /** Birim → bulgu sorumlusu (boş: otomatik) */
  fixers?: Record<string, string>;
  /** Kapasite senaryosunda hedeflenen en geç milestone */
  scopeMilestone?: number;
  /** Kişi başı en yüksek yük (%); 100 üstü fazla mesai demektir */
  maxLoad?: number;
  /** Kişiye özel en yüksek yük (%) */
  personMaxLoad?: Record<string, number>;
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

/**
 * Jira canlı eşitleme ayarı (proje bazında). Uygulamadaki Jira anahtarlı açık
 * kayıtlar her eşitlemede yenilenir; `discover` açıksa kaynaktaki (proje /
 * etiket / kayıtlı filtre) yeni açık kayıtlar da eklenir. Tüm Jira taranmaz.
 */
export interface JiraSyncSettings {
  projectKey?: string;
  labels?: string[];
  filterId?: string;
  filterName?: string;
  /** Kaynaktaki yeni açık kayıtlar görev olarak eklensin mi */
  discover: boolean;
  /** Otomatik eşitleme aralığı (dakika); 0 = kapalı */
  autoMinutes: number;
  /**
   * Alan bazında eşitleme yönü. Verilmezse eski davranış: Jira'dan gelen
   * tüm alanlar alınır, uygulamadan Jira'ya yalnız görev ayrıntısından elle yazılır.
   */
  fields?: Partial<Record<JiraSyncFieldId, JiraSyncDirection>>;
  /** Jira'daki atanan kişiler Veri Havuzu'na ve proje ekibine otomatik eklensin mi */
  autoPeople?: boolean;
  /** Son başarılı eşitlemenin zamanı (ISO); PoC "Bugün" skoru bu ana dayanır */
  lastSyncAt?: string;
}

/** Eşitlenebilen alanlar (uygulama ↔ Jira) */
export type JiraSyncFieldId = 'status' | 'assignee' | 'dueDate' | 'priority' | 'summary' | 'description' | 'labels' | 'estimate' | 'remaining' | 'components' | 'fixVersion' | 'issueType';
/** off: eşitlenmez · pull: Jira → uygulama · push: uygulama → Jira · both: çift yönlü (son eşitlemeden beri değişen taraf kazanır) */
export type JiraSyncDirection = 'off' | 'pull' | 'push' | 'both';

// ---------------------------------------------------------------------------
// Proje dashboard'u: kullanıcının seçip yerleştirdiği bileşenler
// ---------------------------------------------------------------------------

export type DashboardWidgetType =
  | 'metric'        // hesaplanan tek sayı (ilerleme, geciken, efor…)
  | 'kpi'           // projeye özel gösterge (elle / aktarım), hedef ve geçmişle
  | 'progress'      // genel ilerleme halkası (adet ya da efor)
  | 'statusMix'     // durum dağılımı
  | 'breakdown'     // seçilen boyuta göre kırılım (etiket ailesi, iş paketi, kişi…)
  | 'milestones'    // kilometre taşı (MS / sürüm / sprint) planı ve kümülatif tamamlanma
  | 'workPackages'  // iş paketi (epic) tablosu
  | 'pivot'         // iki boyutlu çapraz tablo (ısı haritası)
  | 'burnup'        // plan ve gerçekleşen kümülatif eğri
  | 'team'          // kişi / birim yükü
  | 'deadlines'     // geciken ve yaklaşan terminler
  | 'risks'         // risk özeti
  | 'sprint'        // şu anki sprint
  | 'worklog'       // Jira worklog: kim ne kadar çalıştı, maliyet
  | 'jiraBottlenecks' // Jira durum süreleri ve değişiklik sayıları
  | 'effortStatus'  // Jira tahmini, kalan süre ve gerçekleşen efor
  | 'activity'      // son değişiklikler
  | 'pocScore'      // PoC skoru: İlk · Doğrulanmış · Bugün · Olası ve kategori katkıları
  | 'note';         // serbest not

/** Gruplama boyutu; labels: bir etiket ailesi (önek, ör. "MS") ya da seçilen etiketler */
export type DashboardDim =
  | { kind: 'status' | 'category' | 'priority' | 'assignee' | 'unit' | 'workPackage' | 'issueType' | 'sprint' | 'fixVersion' | 'component' | 'dueMonth' }
  | { kind: 'labels'; prefix?: string; values?: string[] };

export interface DashboardFilter {
  /** Bu etiketlerden en az birini taşıyanlar */
  labels?: string[];
  /** Bu etiketleri taşımayanlar */
  excludeLabels?: string[];
  workPackageId?: string;
  assignee?: string;
  /** Yalnız açık (bitmemiş) kayıtlar */
  openOnly?: boolean;
}

export type DashboardMeasure = 'count' | 'effort' | 'hours';

export interface DashboardProgressWeights {
  categories?: Partial<Record<TaskStatus, number>>;
  statuses?: Record<string, number>;
}

/**
 * Projenin ilerleme modeli: durum başına tamamlanma yüzdesi (ör. Testte = %75)
 * ve ilerlemenin kayıt adedine mi efora mı göre ağırlıklandığı. Pano, genel
 * bakış, sprint ve sürüm ilerlemesi, raporlar ve asistan aynı modeli kullanır.
 */
export interface ProjectProgressModel {
  weights?: DashboardProgressWeights;
  /** count: her kayıt eşit (varsayılan); effort: olası süreyle ağırlıklı */
  basis?: 'count' | 'effort';
}

export interface DashboardWidgetConfig {
  filter?: DashboardFilter;
  dim?: DashboardDim;
  dim2?: DashboardDim;
  measure?: DashboardMeasure;
  /** metric: hesaplanan gösterge anahtarı */
  metric?: string;
  /** İlerleme (kayıt): kategori ve ayrıntılı durum başına 0–100 yüzde */
  progressWeights?: DashboardProgressWeights;
  /** kpi: projedeki gösterge */
  kpiId?: string;
  /** pocScore: Olası skorun kapsamı (etiketler); boşsa proje PoC ayarı */
  pocScope?: string[];
  /** note: metin */
  text?: string;
  limit?: number;
  chart?: 'bar' | 'donut' | 'table';
}

export interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title?: string;
  /** 4 sütunlu ızgarada genişlik */
  size: 1 | 2 | 3 | 4;
  config?: DashboardWidgetConfig;
}

export interface DashboardLayout {
  widgets: DashboardWidget[];
  updatedAt?: string;
}

export interface ProjectKpiPoint {
  date: string; // YYYY-AA-GG
  value: number;
  note?: string;
}

export interface ProjectKpi {
  id: string;
  name: string;
  /** percent: 0-100 */
  unit: 'percent' | 'number' | 'currency' | 'days';
  target?: number;
  baseline?: number;
  /** Yüksek değer iyi mi (varsayılan evet) */
  higherIsBetter?: boolean;
  /** Ölçüm geçmişi; en yeni sonda */
  points: ProjectKpiPoint[];
  /** Hedefe ulaşılması beklenen tarih ya da teslim (ör. "Aralık 2026 teslimatı") */
  targetLabel?: string;
  source?: 'manual' | 'import';
  note?: string;
}

/**
 * Müşteri PoC test kalemi (ör. GİB "Test Kalemleri" sayfası). Göreve
 * dönüşmeyen (karşılanmış, değerlendirme dışı) testler de saklanır; skorun
 * paydası ve sonuç dağılımları bunlardan yeniden hesaplanır. Test, görevine
 * `gib-<Test No>` kimliğiyle bağlanır.
 */
export interface PocTestItem {
  testNo: string;
  area?: string;
  /** Zorunlu · Olması beklenen · İsteğe bağlı */
  importance: string;
  /** Ağırlık (Zorunlu 3, Olması beklenen 2, İsteğe bağlı 1) */
  weight: number;
  /** Müşterinin ilk değerlendirmesi (ham metin: Karşılandı, Kısmen karşılandı …) */
  pocResult: string;
  /** Müşterinin yeniden test edip verdiği güncel sonuç (Genel Liste "Güncel Sonuç") */
  currentResult?: string;
  /** Bağlı görevin kimliği; verilmezse `gib-<Test No>` */
  taskId?: string;
}

/** PoC skor modeli ayarları (PY girer) */
export interface PocScoreSettings {
  /**
   * Süreç katsayısı k: Jira durum kategorisi ya da ayrıntılı Jira durumu
   * başına 0–100 (k × 100). Ayrıntılı durum kategoriden önce gelir. Boşsa
   * yalnız Tamamlandı = 100.
   */
  coefficients?: DashboardProgressWeights;
  /** Değerlendirilmemiş testler: k = 1 olunca paydaya 1 puanla girer (varsayılan) ya da hiç girmez */
  unevaluated?: 'whenComplete' | 'never';
  /** Olası skorun kapsamı: bu etiketlerden birini taşıyan maddeler tamamlanmış sayılır */
  scopeLabels?: string[];
  /** Planlama kategorisi etiket ailesi (varsayılan "Planlama:") */
  categoryPrefix?: string;
}

export interface ProjectPoc {
  tests: PocTestItem[];
  importedAt?: string;
  /** Aktarılan dosyanın adı */
  source?: string;
  settings?: PocScoreSettings;
}

// ---------------------------------------------------------------------------
// Whiteboard (FigJam tarzı): projeye özel panolar
// ---------------------------------------------------------------------------

/**
 * Pano nesnesi. Konum ve boyut pano koordinatında (piksel, yakınlaştırma 1).
 * Bağlı kartlar (görev, sprint, iş paketi, risk, sürüm) yalnız kimlik tutar;
 * içerik her çizimde projeden okunur, böylece kart Jira eşitlemesiyle güncel kalır.
 */
export type WbNodeType = 'sticky' | 'text' | 'shape' | 'section' | 'stamp' | 'pen' | 'image'
  | 'task' | 'sprint' | 'workPackage' | 'risk' | 'version';
export type WbShape = 'rect' | 'ellipse' | 'diamond' | 'triangle' | 'star' | 'hexagon' | 'heart' | 'cloud' | 'callout' | 'arrowRight' | 'cylinder' | 'parallelogram';

export interface WbNode {
  id: string;
  type: WbNodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  /** Renk anahtarı (yellow, green, blue …) ya da #rrggbb */
  color?: string;
  shape?: WbShape;
  /** Kalem çizgisi: kapalı ve bu renkle (anahtar ya da #rrggbb) dolu çizilir */
  fill?: string;
  /** Bağlı kayıt: görev kimliği, sprint numarası, iş paketi / risk / sürüm kimliği */
  ref?: string;
  /** Kalem çizgisi: nesneye göre [x0, y0, x1, y1, …] */
  points?: number[];
  /** Metin boyutu (px); yoksa türün varsayılanı */
  fontSize?: number;
  /** Katman sırası (büyük üstte; yoksa 0, eşitlikte eklenme sırası) */
  z?: number;
  /** Damga (emoji) */
  stamp?: string;
  /** Görsel (küçültülmüş data URL) */
  src?: string;
  locked?: boolean;
  /** Ekleyen kişi (görünen ad) */
  author?: string;
  /** Oylama: kişi anahtarı → oy sayısı */
  votes?: Record<string, number>;
  /** Şekil: içi boş, kalın kenarlı (işaretleme çerçevesi) */
  hollow?: boolean;
}

export interface WbEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** arrow: tek yönlü ok (varsayılan) · line: oksuz çizgi */
  style?: 'arrow' | 'line';
  /** Kıvrım: çizginin ortasının düz çizgiden sapması (px; işareti yönü belirler) */
  curve?: number;
}

export interface WbVoting {
  active: boolean;
  /** Kişi başına oy hakkı */
  perPerson: number;
  startedAt: string;
  endedAt?: string;
  /** Oylanan soru (ör. "Önce hangisini çözelim?") */
  title?: string;
  /** Yalnız bu bölümün içindekiler oylanır (bölüm nesnesinin kimliği) */
  scope?: string;
  /** Bir nesneye kişi başına en fazla oy (yoksa sınır yok) */
  maxPerNode?: number;
  /** Süreli oylama: bu anda kendiliğinden biter */
  endsAt?: string;
}

/** Pano erişim düzeyi: görmez · görüntüler · düzenler */
export type WbAccessLevel = 'none' | 'view' | 'edit';

/**
 * Pano erişimi: projeyi gören herkes için varsayılan düzey ve kişi bazında
 * istisnalar (kişi kimliği → düzey). Sahip ve projenin PY'si her zaman yönetir.
 */
export interface WbAccess {
  everyone: WbAccessLevel;
  people?: Record<string, WbAccessLevel>;
}

// ---- Testler: kayıtlı Jira filtresinden kural tabanlı pano (bkz. utils/testBoard.ts)
/** Kolon kuralındaki alanlar */
export type TestRuleField = 'status' | 'category' | 'type' | 'priority' | 'assignee' | 'assigneeRole' | 'assigneeLead' | 'reporter' | 'reporterRole' | 'component' | 'label' | 'reopened';
/** Koşul: alan, değerlerden birine uyar (not: uymaz). Boş değer listesi koşulu yok sayar (bileşen lideri: herhangi bileşen). */
export interface TestRuleCondition { field: TestRuleField; not?: boolean; values: string[] }
/** Kolonun raporda ne sayıldığı */
export type TestColumnMeaning = 'bugs' | 'changes' | 'reopened' | 'waiting' | 'testing' | 'approved';
export interface TestBoardColumn {
  id: string;
  name: string;
  /** Koşulların hepsi (VE) sağlanmalı; kart sıradaki ilk uyan kolona düşer */
  when: TestRuleCondition[];
  meaning?: TestColumnMeaning;
}
export interface TestBoardSettings {
  /** Jira kayıtlı filtre kimliği (ör. gib_testset) */
  filterId: string;
  filterName?: string;
  columns: TestBoardColumn[];
  /** Pano kurulduğu an: bundan önceki hafta kapanışları için görüntü alınmaz */
  since?: string;
}
/** Filtreden çekilen kayıt (açık ve kapalı) */
export interface TestBoardItem {
  key: string;
  summary: string;
  type: string;
  status: string;
  category: 'new' | 'indeterminate' | 'done' | null;
  priority: string;
  assignee: string;
  reporter: string;
  components: string[];
  labels: string[];
  created?: string;
  resolved?: string;
  updated?: string;
  parentKey?: string;
  /** Durum geçişleri (en yeni sonda, en çok 30): an, yapan kişi, from, to, kategoriler */
  transitions: { at: string; by?: string; from: string; to: string; fc: TestBoardItem['category']; tc: TestBoardItem['category'] }[];
}
/** Anlık görüntüde bir kayıt: anahtar, kolon kimliği ('' eşleşmeyen), durum, öncelik, tür, atanan, başlık */
export interface TestSnapshotRow { k: string; c: string; s: string; p: string; t: string; a: string; n: string }
export interface TestSnapshot {
  id: string;
  at: string;
  /** ISO hafta (2026-W48); haftalık görüntü o haftanın Cuma 20:00 kapanışıdır */
  week: string;
  /** Elle alınan ara görüntü (haftalık sayılmaz) */
  manual?: boolean;
  /** Kapanıştan geç alındı (o saatte uygulama açık değildi) */
  late?: boolean;
  by?: string;
  columns: { id: string; name: string; meaning?: TestColumnMeaning }[];
  rows: TestSnapshotRow[];
}
export interface ProjectTestBoard {
  settings: TestBoardSettings;
  items?: TestBoardItem[];
  fetchedAt?: string;
  snapshots?: TestSnapshot[];
}

export interface Whiteboard {
  id: string;
  name: string;
  /** Panoyu açan kişi (Veri Havuzu kişi kimliği); erişimi o ve projenin PY'si yönetir */
  ownerId?: string;
  /** Yoksa: projeyi gören herkes görüntüler, PY düzenler (eski panolar) */
  access?: WbAccess;
  nodes: WbNode[];
  edges: WbEdge[];
  voting?: WbVoting;
  /** Ortak geri sayım */
  timer?: { endsAt: string; seconds: number };
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
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
  jiraSync?: JiraSyncSettings; // Jira canlı eşitleme kaynağı ve otomatik eşitleme aralığı
  boardConfig?: BoardConfig; // Projeye özel pano (şema izin veriyorsa; yoksa şemanın panosu)
  schemeId?: string; // Admin'in atadığı yapılandırma şeması (yoksa varsayılan)
  workflowOverride?: WorkflowConfig; // Projeye özel iş akışı (şema izin veriyorsa; yalnız şemanın durumlarıyla)
  components?: ProjectComponent[]; // Projenin bileşen listesi
  versions?: ProjectVersion[]; // Projenin sürüm listesi (görevlerin hedef sürümü)
  roleMembers?: Record<string, string[]>; // Proje rolü → havuz kişi kimlikleri
  /** Durum yüzdeleriyle ilerleme (yoksa yalnız Tamamlandı %100) */
  progressModel?: ProjectProgressModel;
  /** Kural setleri (otomasyon) ve son çalışmaları (en yeni sonda, en çok 200) */
  automationRules?: AutomationRule[];
  automationLog?: AutomationLogEntry[];
  /** Zamanlanmış raporlar ve günlük ilerleme ölçümleri (en çok 90 gün) */
  reportSchedules?: ReportSchedule[];
  progressSnapshots?: ProgressSnapshot[];
  /** Proje dashboard'unun varsayılan düzeni (PY kaydeder; kişisel düzeni olmayan herkes bunu görür) */
  dashboard?: DashboardLayout;
  /** Projeye özel göstergeler (ör. PoC skoru): elle girilir ya da aktarımla güncellenir, geçmişiyle */
  kpis?: ProjectKpi[];
  /** Müşteri PoC test listesi ve skor modeli (GİB PoC skoru) */
  poc?: ProjectPoc;
  /** FigJam tarzı panolar (fikir, planlama, retro, inceleme) */
  whiteboards?: Whiteboard[];
  /** Testler sekmesi: kayıtlı Jira filtresinden kural tabanlı test panosu ve haftalık anlık görüntüler */
  testBoard?: ProjectTestBoard;
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
  aiProfile?: ProjectAiProfile; // Proje kartı: haftalık rapor AI'sına bağlam (PY düzenler; proje satırıyla paylaşılır)
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

/**
 * Proje kartı: projeye hâkim olmayan okurun anlaması için AI'ya verilen kısa
 * tanım, müşteriler, ürün, terimler ve rapor ipuçları. Proje sahibi PY yazar.
 */
export interface ProjectAiProfile {
  summary?: string;
  customers?: string;
  product?: string;
  glossary?: { term: string; explanation: string }[];
  stakeholders?: string;
  reportHints?: string;
  updatedAt?: string;
}

/** Arayüz tercihi: klasik (mevcut) ya da modern (sade, iOS tarzı) */
export type UiStyle = 'classic' | 'modern';

/** Modern arayüz teması — yalnız renk değil; yazı, köşe, gölge ve yüzey dili */
export type ModernTheme = 'bubble' | 'aurora' | 'pro' | 'clay';

/** Gündüz / gece tercihi; 'system' işletim sistemini izler */
export type ColorMode = 'system' | 'light' | 'dark';

export interface WorkspaceSettings {
  isLocalPersistenceEnabled?: boolean;
  isAIEnabled?: boolean;
  /** Klasik arayüzün vurgu rengi (classic | emerald | purple | orange) */
  theme?: string;
  /** Eski sürümlerle uyum için tutulur; asıl kaynak colorMode */
  isDarkMode?: boolean;
  colorMode?: ColorMode;
  uiStyle?: UiStyle;
  modernTheme?: ModernTheme;
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
  /** Cihazda doğrulanan bulut kapsamı. Paylaşılan belgeye ve dışa aktarıma girmez. */
  cloudMembership?: CloudMembership;
  cloudWorkspaceId?: string;
  /** Admin'in proje yapılandırma şemaları (iş akışı, kayıt türleri, zorunlu alanlar, pano) */
  projectSchemes?: ProjectScheme[];
  /** Proje rolü tanımları (yoksa hazır roller); üyeler projede atanır */
  projectRoles?: ProjectRoleDef[];
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
  reportGoldenSet?: ReportGoldenItem[]; // Rapor taslağı değerlendirmesi için seçilmiş onaylı raporlar
  reportEvalRuns?: ReportEvalRun[]; // Rapor altın seti değerlendirmeleri (en yeni sonda, en çok 50)
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
/** Görevin Jira worklog özeti: satırlar Jira'daki kişi adı (ve varsa e-posta) ile */
export interface TaskJiraWorklog {
  at: string; // çekildiği an (ISO)
  forHours: number; // çekildiğindeki actualHours (değişince yeniden çekilir)
  entries: JiraWorklogDetail[];
}

export interface JiraWorklogDetail {
  id?: string;
  author: string;
  email?: string;
  accountId?: string;
  started?: string;
  date: string;
  hours: number;
  comment?: string;
  updated?: string;
}

export interface WorklogEntry {
  date: string; // ISO tarih
  author: string;
  issueKey?: string;
  summary: string;
  hours: number;
  comment?: string;
  authorEmail?: string;
  source: 'file' | 'jira';
}

/**
 * Rapor gönderildiği andaki proje EVM'si (B-029). Denetleyen rapordaki
 * rakamları bununla karşılaştırır; canlı EVM bugünü gösterir ve tamamlanan
 * işlerle günden güne değişir.
 */
export interface ReportEvmSnapshot {
  at: string; // ISO: gönderim anı
  year: number;
  statusMonth: number; // gerçekleşeni girilmiş son ay (0 = başlamadı)
  costed: boolean;
  percentComplete: number; // 0..1
  spi: number | null;
  cpi: number | null;
  eac: number;
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
  /** Gönderim anındaki EVM (taslaktan ilk gönderimde ve her yeniden gönderimde yazılır) */
  evmSnapshot?: ReportEvmSnapshot;
  /** AI'nın son önerisi — onaylı son hâliyle birlikte ince ayar veri setine girer */
  aiDraft?: ReportAiDraft;
  /** PY'nin bu hafta projenin genel sağlığına verdiği puan (1–10); sağlık modelinin girdisi */
  pmScore?: number;
  pmScoreNote?: string; // tek cümlelik gerekçe
  /** Geçen haftanın "gelecek hafta planı" maddeleri ne oldu? (söz tutma oranı) */
  planReview?: PlanReviewItem[];
  /** AI'nın rapor metnine verdiği puan (PYB destek haftayı yayınlarken hesaplanır) */
  aiAssessment?: AiReportAssessment;
  /** PYB desteğin "örnek rapor" işareti: AI üslup örneklerinde öncelik alır */
  exemplar?: boolean;
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
  reportGate?: ReportGatePolicy; // haftalık rapor taslağının kalite kapısı (PYB destek ayarlar)
  reportAutoRepair?: boolean; // rapor taslağında format/dayanak sorunu varsa tek turluk otomatik düzeltme (varsayılan kapalı)
}

/** Rapor taslağı kalite kapısı: altın sette üretim istemi (full) bu eşikleri geçmeli; zorunluysa düzenleyicide uyarı */
export interface ReportGatePolicy {
  enforce: boolean;
  maxLintErrorsPerReport: number; // rapor başına ortalama format hatası üst sınırı
  maxUngroundedRate: number; // girdide dayanağı olmayan rakam/tarih/ad oranı üst sınırı (0–1)
  minRecall: number; // onaylı son hâlin maddelerini kapsama alt sınırı (0–1)
}

/** Rapor altın seti: PYB desteğin seçtiği onaylı rapor (girdisi ve onaylı son hâliyle değerlendirilir) */
export interface ReportGoldenItem {
  reportId: string;
  addedAt: string;
  addedByName?: string;
  note?: string;
}

/** Rapor taslağı ölçüleri (altın sette, rapor başına ortalama ya da toplam oran) */
export interface ReportEvalMetrics {
  lintErrorsPerReport: number | null;
  lintWarningsPerReport: number | null;
  ungroundedRate: number | null; // dayanaksız / denetlenen rakam·tarih·ad
  recall: number | null; // eşleşen / onaylı madde
  precision: number | null; // eşleşen / AI maddesi
  categoryAccuracy: number | null; // eşleşen "bu hafta" maddelerinde tür aynı
  unknownAbbrPerReport: number | null;
  missingPerReport: number | null; // eksik bilgi sorusu (bilgi amaçlı)
}

/** Altın set değerlendirmesi (bir istem varyantı + yapılandırma sürümü + model için) */
export interface ReportEvalRun {
  id: string;
  at: string;
  promptVersion: string; // yapılandırma sürümü (istem + kılavuz + kurallar)
  variant: ReportPromptVariant;
  model?: string;
  n: number; // yanıt alınan rapor
  failed: number; // yanıtı alınamayan / çözümlenemeyen
  skipped?: number; // girdisi bulunamadığı için koşulmayan
  metrics: ReportEvalMetrics;
  passed: boolean | null; // null: yetersiz örnek
  reasons: string[];
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
  /** AI rapor kılavuzu (PYB destek düzenler); yoksa koddaki varsayılan */
  guide?: ReportGuide;
  /** Bölüme özgü EK kurallar (bölüm kodu → metin) */
  departmentGuides?: Record<string, ReportGuideVersion>;
  /** Geri bildirimden öğrenilen kurallar (PYB destek onaylamadan isteme girmez) */
  learnedRules?: LearnedRule[];
}

/**
 * Öğrenilmiş kural: tekrarlanan format hatalarından, AI taslağına yapılan
 * düzeltmelerden ya da iade notlarından çıkarılır; PYB destek etkinleştirir.
 */
export interface LearnedRule {
  id: string;
  text: string;
  scope: 'institution' | 'department' | 'project';
  scopeId?: string; // bölüm kodu ya da proje kimliği
  source: 'return' | 'lint' | 'edit' | 'manual';
  status: 'proposed' | 'active' | 'retired';
  evidenceCount: number;
  examples?: string[]; // en çok 2, kısa
  createdAt: string;
  updatedAt?: string;
  approvedByName?: string;
}

/** Sürümlü kılavuz metni (kaydedildikçe sürüm +1) */
export interface ReportGuideVersion {
  text: string;
  version: number;
  updatedAt: string;
  updatedByName?: string;
}

/** Kurum kılavuzu: kurum adı + kılavuz gövdesi (boş metin = varsayılan kılavuz) */
export interface ReportGuide extends ReportGuideVersion {
  institutionName?: string;
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
  | 'release.commit' | 'data.export'
  | 'task.bulkEdit' | 'task.delete'
  | 'report.ai';

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
