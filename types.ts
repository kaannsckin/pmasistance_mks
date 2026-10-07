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
  Risks,
  Calendar,
  Overview, // Proje genel bakış (modern arayüz)
  RiskReport, // Portföy risk raporu (modern arayüz)
  Expectations, // Yönetimden beklentiler (modern arayüz)
  WeeklyReport, // Haftalık rapor (PY → BS → PYDS → müdür)
  Meetings, // Planlanan müşteri görüşmeleri
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
  /** AI'nın ilk önerisi — onaylı son hâliyle birlikte ince ayar veri setine girer */
  aiDraft?: { generatedAt: string; input: string; output: string };
  /** PY'nin bu hafta projenin genel sağlığına verdiği puan (1–10); sağlık modelinin girdisi */
  pmScore?: number;
  pmScoreNote?: string; // tek cümlelik gerekçe
  authorPersonId?: string;
  authorName?: string;
  createdAt: string;
  updatedAt: string;
  history: ReportEvent[];
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
  | 'data.import' | 'identity.change' | 'health.fix' | 'health.rate' | 'snapshot.create'
  | 'ai.apply'
  | 'expectation.create' | 'expectation.respond' | 'expectation.close'
  | 'report.submit' | 'report.approve' | 'report.return' | 'report.publish'
  | 'meeting.submit' | 'meeting.approve' | 'meeting.reject' | 'meeting.held';

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
export type HealthFactorKey = 'spi' | 'cpi' | 'overdue' | 'risk' | 'rag' | 'pm' | 'resource' | 'expectations';

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
