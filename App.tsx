
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Task, Resource, TaskStatus, Note, CustomerRequest, Objective, Project, Person, WorkspaceData, RagStatus, ProjectStatus, UserRole, PlanLockStatus, WorkPackage, UiStyle, PermissionKey, EstimateLogEntry } from './types';
import { INITIAL_TASKS, INITIAL_RESOURCES, INITIAL_OBJECTIVES } from './constants';
import {
  WORKSPACE_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  createEmptyWorkspace,
  createProject,
  parseImportedJson,
  resolveWorkspaceFromStorage,
  serializeWorkspace,
} from './utils/workspace';
import { canEditPool, createAllocation, EffortField, getPlanLockStatus, ROLE_LABELS, setAllocationCell, upsertPlanLock } from './utils/allocations';
import { applyPoolImport, PoolImportResult } from './utils/poolImporter';
import { canCreateProject, canEditProjectContent, identityFor, identityOf, identityNeedsPerson as computeNeedsPerson, ownsProject, visibleProjectIds } from './utils/rbac';
import { can, isConsoleRole, isManagementRole, PERMISSION_BY_KEY, resetRolePermissions, setRolePermission } from './utils/permissions';
import { applyPreset, projectPassesView, resetRoleView, roleViewOf, sectionOfView, taskPassesView, updateRoleView, VIEW_PRESETS, ViewPresetKey } from './utils/viewConfig';
import { AdminSection, ADMIN_SECTIONS } from './components/modern/adminSections';
import { portfolioHealth } from './utils/executive';
import { addSnapshot, buildSnapshot, ensureMonthlySnapshot } from './utils/snapshots';
import { cleanHealthConfig, ensureWeeklyHealthSnapshot, pmoRatingFor, setPmoRating } from './utils/healthModel';
import { aiPolicyOf, updateAiPolicy } from './utils/ai/policy';
import { stampLifecycle } from './utils/planning/lifecycle';
import { AllocationSuggestion, ApplyMode, applyAllocationSuggestions } from './utils/taskToAllocation';
import { applyBilledHoursActuals, planBilledHoursPoolAdditions, suggestBilledHoursActuals, BilledApplyMode, BilledHoursOptions, BilledHoursRecord } from './utils/billedHours';
import { buildTodoItems, TodoItem } from './utils/todoItems';
import { loadCloudConfig, scheduleAutoPush } from './utils/cloudSync';
import CloudSyncModal from './components/CloudSyncModal';
import Header from './components/Header';
import TaskGallery from './components/TaskGallery';
import ResourceManager from './components/ResourceManager';
import TaskFormModal from './components/TaskFormModal';
import TaskDetailModal from './components/TaskDetailModal';
import TeamsMessageModal from './components/TeamsMessageModal';
import KanbanView from './components/KanbanView';
import RoadmapView from './components/RoadmapView';
import SettingsModal from './components/SettingsModal';
import NotesView from './components/NotesView';
import AboutModal from './components/AboutModal';
import CustomerRequestsView from './components/CustomerRequestsView';
import AIAssistant from './components/AIAssistant';
import GoalsView from './components/GoalsView';
import PortfolioView from './components/PortfolioView';
import DataPoolView from './components/DataPoolView';
import AllocationView from './components/AllocationView';
import ExecutiveView from './components/ExecutiveView';
import PersonDetailModal from './components/PersonDetailModal';
import RiskView from './components/RiskView';
import StatusReportModal from './components/StatusReportModal';
import DataHealthModal from './components/DataHealthModal';
import AuditLogModal from './components/AuditLogModal';
import { CommandItem } from './components/CommandPalette';
import { AssistantProvider } from './components/assistant/AssistantContext';
import AssistantPanel, { AssistantCommandPalette } from './components/assistant/AssistantPanel';
import { buildSuggestions } from './utils/ai/suggestions';
import { RagRef } from './utils/rag/sources';
import { AiAction, applyAction, validateAction } from './utils/ai/actions';
import WorkPackageManager from './components/WorkPackageManager';
import CalendarView from './components/CalendarView';
import { analyzeDataHealth, applyHealthFix, HealthFix } from './utils/dataHealth';
import { appendAudit, AUDIT_ACTION_LABELS } from './utils/audit';
import { riskScore } from './utils/risks';
import { upsertLeave } from './utils/availability';
import { AiReportAssessment, ExpectationStatus, ExpectationUrgency, HealthConfig, MeetingStatus, PestelItem, ReportFlow, ReportSettings, Risk, RoleViewConfig, SwotItem, WeeklyReport } from './types';
import ModernSidebar from './components/modern/ModernSidebar';
import ModernProjectHeader from './components/modern/ModernProjectHeader';
import ModernPlanning from './components/modern/ModernPlanning';
import { appendEstimateLog } from './utils/planning/estimateLog';
import ModernPortfolio from './components/modern/ModernPortfolio';
import ModernBoard from './components/modern/ModernBoard';
import ModernProjectOverview from './components/modern/ModernProjectOverview';
import ModernTaskList from './components/modern/ModernTaskList';
import ModernAllocation from './components/modern/ModernAllocation';
import ModernExecutive from './components/modern/ModernExecutive';
import ModernRisks from './components/modern/ModernRisks';
import ModernRiskReport from './components/modern/ModernRiskReport';
import ModernExpectations from './components/modern/ModernExpectations';
import ModernGoals from './components/modern/ModernGoals';
import ModernRequests from './components/modern/ModernRequests';
import TaskFormSheet from './components/modern/TaskFormSheet';
import ModernTimeline, { CalendarSettings } from './components/modern/ModernTimeline';
import ModernTeam from './components/modern/ModernTeam';
import TaskDetailSheet from './components/modern/TaskDetailSheet';
import { markConverted, taskDraftFromRequest } from './utils/customerRequests';
import {
  canEditExpectation, canRespondExpectation, CATEGORY_LABELS, createExpectation, ExpectationDraft, isOwnExpectation,
  respondExpectation, setExpectationStatus, updateExpectationDraft, URGENCY_LABELS, urgencyCounts, visibleExpectations,
} from './utils/expectations';
import { Celebration, EggEvent, HyperdriveOverlay, SpaceMode } from './components/modern/Eggs';
import ModernWeeklyReport from './components/modern/ModernWeeklyReport';
import ModernAdmin from './components/modern/ModernAdmin';
import ProfileSwitcherSheet from './components/modern/ProfileSwitcherSheet';
import { addProfile, initialsOf, removeProfile } from './utils/profiles';
import ModernMeetings from './components/modern/ModernMeetings';
import ModernNotes from './components/modern/ModernNotes';
import ModernCalendar from './components/modern/ModernCalendar';
import ModernDataPool from './components/modern/ModernDataPool';
import { ModernAssistantPanel, ModernChat } from './components/modern/ModernAssistant';
import WorkPackagesSheet from './components/modern/sheets/WorkPackagesSheet';
import PersonProfileSheet from './components/modern/sheets/PersonProfileSheet';
import DataHealthSheet from './components/modern/sheets/DataHealthSheet';
import AuditLogSheet from './components/modern/sheets/AuditLogSheet';
import StatusReportSheet from './components/modern/sheets/StatusReportSheet';
import {
  actorOf, isReportSteward, markWeekEmailed, publishWeek, reportDictionary, reportFlowOf, reportSettingsOf, returnReportIn, saveReport, setReportAiAssessment, STAGE_LABELS, unpublishWeek, weekLabel,
} from './utils/weeklyReport';
import {
  canEditMeeting, canPlanMeeting, canReviewMeeting, createMeeting, isOwnMeeting, markHeld, MeetingDraft, reviewMeeting, setMeetingStatus, updateMeeting,
} from './utils/customerMeetings';
import { reportAttention } from './utils/reportAttention';
import { Icon } from './components/modern/icons';
import { createSequenceDetector } from './utils/easterEggs';

const THEME_COLORS: Record<string, string> = {
  classic: '#2563eb',
  emerald: '#059669',
  purple: '#7c3aed',
  orange: '#ea580c',
};

// Denetim günlüğü RAG etiketleri ("Ne değişti?" akışı için)
const RAG_AUDIT_TR: Record<RagStatus, string> = { green: 'Yolunda', amber: 'Riskli', red: 'Kritik' };

const createSampleProject = (): Project =>
  createProject('Örnek Proje', {
    tasks: INITIAL_TASKS,
    resources: INITIAL_RESOURCES.map(r => ({ ...r, title: r.title || 'Uzman' })),
    objectives: INITIAL_OBJECTIVES,
  });

/** Modern arayüzde proje başlığının gösterildiği ekranlar */
const MODERN_PROJECT_VIEWS: View[] = [View.Overview, View.Roadmap, View.Tasks, View.Kanban, View.Planning, View.Risks, View.Resources, View.Goals, View.Requests, View.Notes, View.AI];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.Portfolio);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // Müşteri isteğinden açılan görev formu: kaydedilince istek "dönüştü" işaretlenir
  const [convertingRequestId, setConvertingRequestId] = useState<string | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);
  const [teamsTask, setTeamsTask] = useState<Task | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [viewingPersonId, setViewingPersonId] = useState<string | null>(null);
  const [isStatusReportOpen, setIsStatusReportOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isWpManagerOpen, setIsWpManagerOpen] = useState(false);
  // Modern arayüz: dar ekranda kenar çubuğu çekmecesi, "yeni proje" isteği, sürprizler
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [newProjectRequest, setNewProjectRequest] = useState(0);
  const [egg, setEgg] = useState<EggEvent | null>(null);
  const [undo, setUndo] = useState<{ message: string; snapshot: WorkspaceData } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const workspaceRef = useRef<WorkspaceData | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);

  // ---- Açılış: v2 workspace → v1 migration → örnek proje sırasıyla çözülür ----
  useEffect(() => {
    const { workspace: resolved } = resolveWorkspaceFromStorage(
      localStorage.getItem(WORKSPACE_STORAGE_KEY),
      localStorage.getItem(LEGACY_STORAGE_KEY)
    );
    if (resolved) {
      // Ayın ilk açılışında otomatik baseline (plan kayması trendi için) ve
      // haftalık sağlık fotoğrafı (sağlık modelinin eğitim verisi)
      const withBaseline = ensureMonthlySnapshot(resolved) || resolved;
      setWorkspace(ensureWeeklyHealthSnapshot(withBaseline) || withBaseline);
    } else {
      const sample = createSampleProject();
      setWorkspace({ ...createEmptyWorkspace(), projects: [sample], activeProjectId: sample.id });
    }
    setIsInitialized(true);
  }, []);

  const settings = workspace?.settings;
  const activeProject = useMemo(
    () => workspace?.projects.find(p => p.id === workspace.activeProjectId) ?? null,
    [workspace]
  );

  // ---- Kimlik + kapsam ----
  const identity = useMemo(() => (workspace ? identityOf(workspace) : { role: 'py' as UserRole }), [workspace]);
  // Ekran yetkileri (admin değiştirebilir; not gizliliği kilitli)
  const canExecutive = can(identity, 'screen.executive');
  const canAdmin = can(identity, 'screen.admin');
  const canNotes = can(identity, 'notes.private');
  // Uygulama araçları (admin yetkileri): denetim günlüğü, yedek, veri sağlığı
  const canAudit = can(identity, 'app.audit');
  const canBackup = can(identity, 'app.backup');
  const canDataHealth = can(identity, 'app.dataHealth');
  // Admin rolü yalnız yönetici konsolunu kullanır (proje yönetimi ekranları yok)
  const consoleMode = !!workspace && isConsoleRole(identity.role);
  const [adminSection, setAdminSection] = useState<AdminSection>('permissions');
  // Rolün görünüm ayarı (admin): sekmeler, kartlar, kayıt süzgeçleri, sıralamalar
  const roleView = useMemo(() => roleViewOf({ viewConfig: workspace?.viewConfig, currentRole: identity.role }), [workspace?.viewConfig, identity.role]);
  const notesBlocked = !canNotes && (currentView === View.Notes || currentView === View.Requests);
  // Yetkisi olmayan ekrandan çık: notlar → yönetim (görebiliyorsa) ya da portföy; admin → konsol
  useEffect(() => {
    if (!workspace) return;
    if (consoleMode) { if (currentView !== View.Admin) setCurrentView(View.Admin); }
    else if (notesBlocked) setCurrentView(canExecutive ? View.Executive : View.Portfolio);
    else if ((currentView === View.Executive && !canExecutive) || (currentView === View.Admin && !canAdmin)) setCurrentView(View.Portfolio);
  }, [workspace, currentView, notesBlocked, canExecutive, canAdmin, consoleMode]);
  // Admin'in gizlediği proje sekmesinden genel bakışa dön (modern arayüz)
  useEffect(() => {
    const key = settings?.uiStyle === 'modern' ? sectionOfView(currentView) : undefined;
    if (key && !roleView.projectSections.has(key)) setCurrentView(View.Overview);
    // Planlama asistanı yalnız modern arayüzde var
    else if (settings && settings.uiStyle !== 'modern' && currentView === View.Planning) setCurrentView(View.Tasks);
  }, [currentView, roleView, settings?.uiStyle]);
  const visibleProjects = useMemo(() => {
    if (!workspace || consoleMode) return [];
    const ids = visibleProjectIds(workspace, identity);
    return workspace.projects.filter(p => ids.has(p.id) && projectPassesView(roleView, p));
  }, [workspace, identity, roleView, consoleMode]);
  // Portföy sağlık sırası için skorlar (yalnız admin bu sırayı seçtiyse hesaplanır)
  const portfolioScores = useMemo(() => {
    if (!workspace || roleView.projectSort !== 'health') return undefined;
    return new Map(portfolioHealth(workspace, new Date().getFullYear()).projects.map(h => [h.projectId, h.score]));
  }, [workspace, roleView.projectSort]);
  const needsPerson = useMemo(() => computeNeedsPerson(identity), [identity]);
  const visibleProjectIdSet = useMemo(() => new Set(visibleProjects.map(p => p.id)), [visibleProjects]);

  // ---- Yönetimden beklentiler (kapsam + rozet) ----
  const visibleExps = useMemo(() => (workspace ? visibleExpectations(workspace, identity) : []), [workspace, identity]);
  // Yönetim: yanıtlanmamışlar; açanlar: aktif beklentileri
  const expectationBadge = useMemo(() => {
    const c = urgencyCounts(visibleExps);
    return canRespondExpectation(identity) ? c.unanswered : c.total;
  }, [visibleExps, identity]);
  // Yönetim panelinden aciliyete göre açılınca sayfanın ilk süzgeci
  const [expectationUrgency, setExpectationUrgency] = useState<ExpectationUrgency | undefined>(undefined);
  useEffect(() => {
    if (currentView !== View.Expectations) setExpectationUrgency(undefined);
  }, [currentView]);

  // ---- Veri sağlığı (hata + uyarı sayısı rozet için) ----
  const healthAlerts = useMemo(() => {
    if (!workspace) return 0;
    const { counts } = analyzeDataHealth(workspace);
    return counts.error + counts.warn;
  }, [workspace]);

  // ---- Yapılacaklar (mevcut veriden türetilir, role göre filtreli) ----
  const todoItems = useMemo(() => (workspace ? buildTodoItems(workspace) : []), [workspace]);
  // Haftalık rapor / müşteri görüşmeleri rozetleri (kenar çubuğu)
  const attention = useMemo(() => (workspace ? reportAttention(workspace) : { reportBadge: 0, meetingBadge: 0, items: [] }), [workspace]);

  const handleTodoNavigate = useCallback((item: TodoItem) => {
    // Proje bağlamı gerekiyorsa önce o projeyi aç, sonra ekrana geç
    if (item.projectId) {
      setWorkspace(prev => (prev ? { ...prev, activeProjectId: item.projectId! } : prev));
    }
    setCurrentView(item.view);
  }, []);

  // ---- Tema / gece modu ----
  useEffect(() => {
    if (settings?.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--app-primary').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }, [settings?.isDarkMode, settings?.theme]);

  // ---- Kalıcılık ----
  useEffect(() => {
    if (!isInitialized || !workspace) return;
    const toPersist = workspace.settings.isLocalPersistenceEnabled !== false
      ? workspace
      : { ...workspace, projects: [], activeProjectId: null };
    localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspace(toPersist));
    // Bulut bağlıysa değişiklikleri gecikmeli gönder (yerel-öncelikli senkron)
    scheduleAutoPush(workspace);
  }, [workspace, isInitialized]);

  // ---- Merkezi güncelleme yardımcıları ----
  const updateWorkspace = useCallback((updater: (ws: WorkspaceData) => WorkspaceData) => {
    setWorkspace(prev => (prev ? updater(prev) : prev));
  }, []);

  const handleApplyHealthFix = useCallback((fix: HealthFix) => {
    updateWorkspace(ws => {
      if (!can(identityOf(ws), 'app.dataHealth')) return ws;
      const next = applyHealthFix(ws, fix);
      const summary = fix.kind === 'deleteAllocation' ? 'Yetim tahsis silindi'
        : fix.kind === 'addPersonFromName' ? `Havuza kişi eklendi: ${fix.name}`
        : 'Risk sahibi havuza bağlandı';
      return appendAudit(next, 'health.fix', summary);
    });
  }, [updateWorkspace]);

  // En güncel workspace'i ref'te tut (geri-al anlık görüntüsü için)
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);

  // Komut paleti kısayolu (Cmd/Ctrl+K)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Sürpriz: Konami kodu (↑↑↓↓←→←→BA) → uzay modu (yazı alanlarında dinlenmez)
  useEffect(() => {
    const feed = createSequenceDetector();
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (feed(e.key)) setEgg({ kind: 'space' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Geri-al bildirimi (silme gibi yıkıcı aksiyonlar için)
  const showUndo = useCallback((message: string, snapshot: WorkspaceData) => {
    window.clearTimeout(undoTimer.current);
    setUndo({ message, snapshot });
    undoTimer.current = window.setTimeout(() => setUndo(null), 7000);
  }, []);
  const handleUndo = useCallback(() => {
    if (undo) setWorkspace(undo.snapshot);
    setUndo(null);
  }, [undo]);

  const updateActiveProject = useCallback((updater: (p: Project) => Project) => {
    updateWorkspace(ws => ({
      ...ws,
      projects: ws.projects.map(p => {
        if (p.id !== ws.activeProjectId) return p;
        const next = updater(p);
        const now = new Date();
        // Yerel değişikliklerde kayıt yaşam döngüsü damgalanır (açılış, başlama, kapanış, durum günlüğü)
        const tasks = next.tasks !== p.tasks ? stampLifecycle(p.tasks, next.tasks, now) : next.tasks;
        return { ...next, tasks, updatedAt: now.toISOString() };
      }),
    }));
  }, [updateWorkspace]);

  // Risk güncellemesi + "Ne değişti?" günlüğü: eklenen/kapatılan riskleri yakalar
  const handleUpdateActiveRisks = useCallback((risks: Risk[]) => {
    updateWorkspace(ws => {
      const proj = ws.projects.find(p => p.id === ws.activeProjectId);
      let next: WorkspaceData = {
        ...ws,
        projects: ws.projects.map(p => p.id === ws.activeProjectId ? { ...p, risks, updatedAt: new Date().toISOString() } : p),
      };
      if (proj) {
        const oldById = new Map<string, Risk>();
        (proj.risks || []).forEach(r => oldById.set(r.id, r));
        risks.filter(r => !oldById.has(r.id)).forEach(r => {
          next = appendAudit(next, 'risk.add', `"${proj.name}" · risk eklendi: ${r.title} (skor ${riskScore(r)})`, proj.id);
        });
        risks.forEach(r => {
          const old = oldById.get(r.id);
          if (old && old.status !== 'closed' && r.status === 'closed') {
            next = appendAudit(next, 'risk.close', `"${proj.name}" · risk kapatıldı: ${r.title}`, proj.id);
          }
        });
      }
      return next;
    });
  }, [updateWorkspace]);

  type ListField = 'tasks' | 'resources' | 'notes' | 'customerRequests' | 'objectives' | 'workPackages';
  const makeListSetter = <T,>(field: ListField): React.Dispatch<React.SetStateAction<T[]>> =>
    ((action: React.SetStateAction<T[]>) => {
      updateActiveProject(p => ({
        ...p,
        [field]: typeof action === 'function'
          ? (action as (prev: T[]) => T[])((p[field] as unknown) as T[])
          : action,
      }));
    }) as React.Dispatch<React.SetStateAction<T[]>>;

  const setTasks = makeListSetter<Task>('tasks');
  const setResources = makeListSetter<Resource>('resources');
  const setNotes = makeListSetter<Note>('notes');
  const setCustomerRequests = makeListSetter<CustomerRequest>('customerRequests');
  const setObjectives = makeListSetter<Objective>('objectives');
  const setWorkPackages = makeListSetter<WorkPackage>('workPackages');

  const makeProjectSettingSetter = <K extends keyof Project['settings']>(key: K): React.Dispatch<React.SetStateAction<Project['settings'][K]>> =>
    ((action: React.SetStateAction<Project['settings'][K]>) => {
      updateActiveProject(p => ({
        ...p,
        settings: {
          ...p.settings,
          [key]: typeof action === 'function'
            ? (action as (prev: Project['settings'][K]) => Project['settings'][K])(p.settings[key])
            : action,
        },
      }));
    }) as React.Dispatch<React.SetStateAction<Project['settings'][K]>>;

  const setTagColors = makeProjectSettingSetter('tagColors') as React.Dispatch<React.SetStateAction<Record<string, string>>>;
  const setTitleCosts = makeProjectSettingSetter('titleCosts') as React.Dispatch<React.SetStateAction<Record<string, number>>>;
  const setSprintNames = makeProjectSettingSetter('sprintNames') as React.Dispatch<React.SetStateAction<Record<number, string>>>;
  const setGlobalTestDays = makeProjectSettingSetter('globalTestDays') as React.Dispatch<React.SetStateAction<number | undefined>>;
  const setManMonthTableColor = makeProjectSettingSetter('manMonthTableColor');
  const setCostTableColor = makeProjectSettingSetter('costTableColor');

  // ---- Proje yaşam döngüsü ----
  // Modern arayüzde proje "Genel bakış" ile açılır; klasikte pano ile
  const projectHomeView = settings?.uiStyle === 'modern' ? View.Overview : View.Roadmap;
  const handleCreateProject = useCallback((name: string) => {
    updateWorkspace(ws => {
      const project = createProject(name);
      project.settings.manMonthTableColor = THEME_COLORS[ws.settings.theme || 'classic'];
      // Oluşturan PM ise projeyi ona sahiplendir (RBAC kapsamı)
      if (ws.currentRole === 'py' && ws.currentPersonId) project.pmPersonId = ws.currentPersonId;
      const next = { ...ws, projects: [...ws.projects, project], activeProjectId: project.id };
      return appendAudit(next, 'project.create', `"${name}" projesi oluşturuldu`, project.id);
    });
    setCurrentView(projectHomeView);
  }, [updateWorkspace, projectHomeView]);

  const handleSetProjectOwner = useCallback((projectId: string, personId: string | undefined) => {
    updateWorkspace(ws => {
      const project = ws.projects.find(p => p.id === projectId);
      const ownerName = personId ? (() => { const o = ws.people.find(p => p.id === personId); return o ? `${o.firstName} ${o.lastName}`.trim() : personId; })() : 'boş';
      const next = {
        ...ws,
        projects: ws.projects.map(p => p.id === projectId ? { ...p, pmPersonId: personId, updatedAt: new Date().toISOString() } : p),
      };
      return appendAudit(next, 'project.owner', `"${project?.name || projectId}" sahibi: ${ownerName}`, projectId);
    });
  }, [updateWorkspace]);

  const handleOpenProject = useCallback((projectId: string) => {
    updateWorkspace(ws => ({ ...ws, activeProjectId: projectId }));
    setCurrentView(projectHomeView);
  }, [updateWorkspace, projectHomeView]);

  const handleSetLeave = useCallback((personId: string, year: number, month: number, aa: number, reason?: string) => {
    updateWorkspace(ws => ({ ...ws, leaves: upsertLeave(ws.leaves || [], personId, year, month, aa, reason) }));
  }, [updateWorkspace]);

  const handleDeleteProject = useCallback((projectId: string) => {
    const snapshot = workspaceRef.current;
    const removed = snapshot?.projects.find(p => p.id === projectId);
    updateWorkspace(ws => {
      const projects = ws.projects.filter(p => p.id !== projectId);
      const next = {
        ...ws,
        projects,
        activeProjectId: ws.activeProjectId === projectId ? (projects[0]?.id ?? null) : ws.activeProjectId,
      };
      return appendAudit(next, 'project.delete', `"${removed?.name || projectId}" projesi silindi`);
    });
    if (snapshot) showUndo(`"${removed?.name || 'Proje'}" silindi`, snapshot);
  }, [updateWorkspace, showUndo]);

  const handleRenameProject = useCallback((projectId: string, name: string) => {
    updateWorkspace(ws => ({
      ...ws,
      projects: ws.projects.map(p => p.id === projectId ? { ...p, name, updatedAt: new Date().toISOString() } : p),
    }));
  }, [updateWorkspace]);

  const handleSetProjectRag = useCallback((projectId: string, rag: RagStatus | undefined, ragNote?: string) => {
    updateWorkspace(ws => {
      const prev = ws.projects.find(p => p.id === projectId);
      const next = {
        ...ws,
        projects: ws.projects.map(p => p.id === projectId ? { ...p, rag, ragNote: ragNote ?? p.ragNote, updatedAt: new Date().toISOString() } : p),
      };
      // RAG değişimini "Ne değişti?" akışı için günlüğe yaz
      if (prev && prev.rag !== rag) {
        const label = (r?: RagStatus) => (r ? RAG_AUDIT_TR[r] : 'Belirsiz');
        return appendAudit(next, 'project.rag', `"${prev.name}" RAG: ${label(prev.rag)} → ${label(rag)}`, projectId);
      }
      return next;
    });
  }, [updateWorkspace]);

  const handleSetProjectStatus = useCallback((projectId: string, status: ProjectStatus) => {
    updateWorkspace(ws => ({
      ...ws,
      projects: ws.projects.map(p => p.id === projectId ? { ...p, status, updatedAt: new Date().toISOString() } : p),
    }));
  }, [updateWorkspace]);

  // ---- Kimlik / RBAC ----
  const handleChangeIdentity = useCallback((role: UserRole, personId?: string) => {
    updateWorkspace(ws => {
      const next = { ...ws, currentRole: role, currentPersonId: personId };
      // Kapsam değişince görünmeyen bir proje aktifse ilk görünür projeye/portföye geç
      const visible = visibleProjectIds(next, identityFor(next, role, personId));
      if (next.activeProjectId && !visible.has(next.activeProjectId)) {
        next.activeProjectId = null;
      }
      const who = personId ? (() => { const p = next.people.find(x => x.id === personId); return p ? ` (${p.firstName} ${p.lastName})`.trimEnd() : ''; })() : '';
      return appendAudit(next, 'identity.change', `Kimlik: ${ROLE_LABELS[role]}${who}`);
    });
    // Yetkisi olmayan ekrandan çıkışı yukarıdaki etki yapar
  }, [updateWorkspace]);

  const handleSetAllocationCell = useCallback((allocationId: string, field: EffortField, month: number, value: number | undefined) => {
    updateWorkspace(ws => setAllocationCell(ws, allocationId, field, month, value));
  }, [updateWorkspace]);

  const handleAddAllocation = useCallback((personId: string, projectId: string, year: number, workPackageId?: string, role?: string) => {
    updateWorkspace(ws => {
      const created = createAllocation(ws.allocations, personId, projectId, year, workPackageId, role);
      if (!created) {
        alert('Bu kişi + proje + iş paketi + rol kombinasyonu için bu yılda zaten bir satır var.');
        return ws;
      }
      return { ...ws, allocations: [...ws.allocations, created] };
    });
  }, [updateWorkspace]);

  const handleDeleteAllocation = useCallback((allocationId: string) => {
    updateWorkspace(ws => ({ ...ws, allocations: ws.allocations.filter(a => a.id !== allocationId) }));
  }, [updateWorkspace]);

  const handleLockAction = useCallback((projectId: string, year: number, status: PlanLockStatus) => {
    updateWorkspace(ws => {
      const projectName = ws.projects.find(p => p.id === projectId)?.name || 'Proje';
      const prev = getPlanLockStatus(ws.planLocks, projectId, year);
      let next = { ...ws, planLocks: upsertPlanLock(ws.planLocks, projectId, year, status, ws.currentRole) };
      if (status === 'locked') {
        // Onaylanan plan = baseline: kilit anında otomatik anlık görüntü al
        next = addSnapshot(next, buildSnapshot(next, year, `Onaylı plan — ${projectName}`, 'lock'));
      }
      // Denetim: geçişe göre aksiyon
      const action = status === 'submitted' ? 'plan.submit'
        : status === 'locked' ? 'plan.approve'
        : prev === 'submitted' ? 'plan.reject' // submitted → draft = ret
        : 'plan.unlock'; // locked → draft = kilit açma
      return appendAudit(next, action, `${projectName} · ${year} planı — ${AUDIT_ACTION_LABELS[action]}`, projectId);
    });
  }, [updateWorkspace]);

  const handleApplySuggestions = useCallback((projectId: string, year: number, suggestions: AllocationSuggestion[], mode: ApplyMode) => {
    updateWorkspace(ws => {
      const { workspace: next, applied, skippedCells } = applyAllocationSuggestions(ws, projectId, year, suggestions, mode);
      alert(`Görev planından tahsis uygulandı: ${applied} kişi güncellendi${skippedCells > 0 ? `, ${skippedCells} dolu ay korundu` : ''}.`);
      return next;
    });
  }, [updateWorkspace]);

  const handleApplyBilledHours = useCallback((records: BilledHoursRecord[], options: BilledHoursOptions, mode: BilledApplyMode, autoCreate: boolean) => {
    updateWorkspace(ws => {
      let base = ws;
      let createdProjects = 0;
      let createdPeople = 0;
      // Eşleşmeyen proje/kişileri istenirse önce Veri Havuzu'na aç.
      if (autoCreate) {
        const plan = planBilledHoursPoolAdditions(suggestBilledHoursActuals(base, records, options));
        if (plan.projects.length || plan.people.length) {
          const newProjects: Project[] = plan.projects.map(p => createProject(p.name, { code: p.code }));
          const newPeople: Person[] = plan.people.map((p, i) => ({
            id: `person-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            firstName: p.firstName,
            lastName: p.lastName,
            departmentCode: 'Tanımsız',
            availableAA: 1,
            roles: [],
          }));
          base = { ...base, projects: [...base.projects, ...newProjects], people: [...base.people, ...newPeople] };
          createdProjects = newProjects.length;
          createdPeople = newPeople.length;
        }
      }
      const result = suggestBilledHoursActuals(base, records, options);
      const { workspace: next, summary } = applyBilledHoursActuals(base, result, mode);
      const lines: string[] = [];
      if (createdProjects || createdPeople) lines.push(`Havuza eklendi: ${createdProjects} proje, ${createdPeople} kişi`);
      lines.push(`${options.year} gerçekleşen: ${summary.rowsApplied} kişi×proje güncellendi (${summary.cellsWritten} ay)`);
      if (summary.cellsSkipped > 0) lines.push(`${summary.cellsSkipped} dolu ay korundu (doldur modu)`);
      if (result.unmatchedPeople.length) lines.push(`Hâlâ eşleşmeyen kişi: ${result.unmatchedPeople.length}`);
      if (result.unmatchedProjects.length) lines.push(`Hâlâ eşleşmeyen proje: ${result.unmatchedProjects.length}`);
      alert(`Jira Billed Hours içe aktarıldı.\n\n${lines.join('\n')}`);
      const auditExtra = createdProjects || createdPeople ? ` · +${createdProjects} proje, +${createdPeople} kişi (havuz)` : '';
      return appendAudit(next, 'data.import', `Jira Billed Hours → gerçekleşen: ${summary.rowsApplied} kişi×proje, ${summary.cellsWritten} ay (${options.year})${auditExtra}`);
    });
  }, [updateWorkspace]);

  const handleTakeSnapshot = useCallback((year: number) => {
    updateWorkspace(ws => {
      const label = `Manuel — ${new Date().toLocaleDateString('tr-TR')}`;
      return addSnapshot(ws, buildSnapshot(ws, year, label, 'manual'));
    });
  }, [updateWorkspace]);

  const handleApplyPoolImport = useCallback((imported: PoolImportResult) => {
    updateWorkspace(ws => {
      const { workspace: next, summary } = applyPoolImport(ws, imported);
      const lines = [
        `Personel: ${summary.peopleAdded} yeni, ${summary.peopleUpdated} güncellendi`,
        `Bölüm: ${summary.departmentsAdded} yeni · Rol: ${summary.rolesAdded} yeni · Ünvan: ${summary.titlesAdded} yeni`,
        `Proje: ${summary.projectsCreated} oluşturuldu, ${summary.projectsMatched} eşleşti · İP: ${summary.workPackagesAdded} yeni`,
        `Tahsis: ${summary.allocationsAdded} yeni, ${summary.allocationsUpdated} güncellendi`,
      ];
      if (summary.warnings.length) {
        lines.push('', `Uyarılar (${summary.warnings.length}):`, ...summary.warnings.slice(0, 6));
        if (summary.warnings.length > 6) lines.push(`… ve ${summary.warnings.length - 6} uyarı daha`);
      }
      alert(`Excel içe aktarma tamamlandı.\n\n${lines.join('\n')}`);
      return appendAudit(next, 'data.import', `Excel havuz içe aktarımı: ${summary.peopleAdded}+${summary.peopleUpdated} personel, ${summary.allocationsAdded}+${summary.allocationsUpdated} tahsis`);
    });
  }, [updateWorkspace]);

  // ---- Yedekleme / içe aktarma ----
  const handleSaveProject = useCallback(() => {
    if (!workspace || !can(identityOf(workspace), 'app.backup')) return;
    const jsonString = serializeWorkspace(workspace);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-asistan-calisma-alani-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [workspace]);

  const handleLoadProject = useCallback((file: File) => {
    const current = workspaceRef.current;
    if (!current || !can(identityOf(current), 'app.backup')) return;
    if (!file || file.type !== 'application/json') {
      alert('Lütfen geçerli bir JSON yedek dosyası seçin.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        alert('Dosya içeriği okunamadı.');
        return;
      }
      const result = parseImportedJson(text, file.name.replace(/\.json$/i, ''));
      if (result.kind === 'invalid') {
        alert(`Yedek yüklenemedi: ${result.error}`);
        return;
      }
      if (result.kind === 'workspace') {
        const incoming = result.workspace;
        const ok = window.confirm(
          `Bu dosya ${incoming.projects.length} proje içeren bir çalışma alanı yedeği. Mevcut çalışma alanının TAMAMI bu yedekle değiştirilecek. Devam edilsin mi?`
        );
        if (!ok) return;
        setWorkspace(incoming);
        setCurrentView(View.Portfolio);
        return;
      }
      // Eski tek proje yedeği: mevcut çalışma alanına yeni proje olarak eklenir
      updateWorkspace(ws => appendAudit({
        ...ws,
        projects: [...ws.projects, result.project],
        activeProjectId: result.project.id,
      }, 'data.import', `JSON yedeğinden proje eklendi: "${result.project.name}"`, result.project.id));
      setCurrentView(View.Roadmap);
      alert(`"${result.project.name}" çalışma alanına yeni proje olarak eklendi.`);
    };
    reader.readAsText(file);
  }, [updateWorkspace]);

  const handleResetData = useCallback(() => {
    localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.location.reload();
  }, []);

  // ---- Yönetimden beklentiler: oluştur / düzenle / yanıtla (yetki işlem anında yeniden doğrulanır) ----
  const handleCreateExpectation = useCallback((draft: ExpectationDraft) => {
    updateWorkspace(ws => {
      const e = createExpectation(ws, draft);
      return appendAudit({ ...ws, expectations: [e, ...(ws.expectations || [])] }, 'expectation.create',
        `Yönetimden beklenti (${URGENCY_LABELS[e.urgency]} · ${CATEGORY_LABELS[e.category]}): ${e.title}`, e.projectId);
    });
  }, [updateWorkspace]);

  const handleUpdateExpectation = useCallback((id: string, draft: ExpectationDraft) => {
    updateWorkspace(ws => {
      const e = (ws.expectations || []).find(x => x.id === id);
      if (!e || !canEditExpectation(e, identityOf(ws))) return ws;
      return { ...ws, expectations: (ws.expectations || []).map(x => (x.id === id ? updateExpectationDraft(x, draft) : x)) };
    });
  }, [updateWorkspace]);

  const handleRespondExpectation = useCallback((id: string, status: 'acknowledged' | 'resolved', response: string) => {
    updateWorkspace(ws => {
      const e = (ws.expectations || []).find(x => x.id === id);
      if (!e || !canRespondExpectation(identityOf(ws))) return ws;
      const next = { ...ws, expectations: (ws.expectations || []).map(x => (x.id === id ? respondExpectation(ws, x, status, response) : x)) };
      return appendAudit(next, status === 'resolved' ? 'expectation.close' : 'expectation.respond',
        `Beklenti ${status === 'resolved' ? 'karşılandı' : 'inceleniyor'}: ${e.title}`, e.projectId);
    });
  }, [updateWorkspace]);

  const handleSetExpectationStatus = useCallback((id: string, status: ExpectationStatus) => {
    updateWorkspace(ws => {
      const e = (ws.expectations || []).find(x => x.id === id);
      if (!e || !isOwnExpectation(e, identityOf(ws))) return ws;
      const next = { ...ws, expectations: (ws.expectations || []).map(x => (x.id === id ? setExpectationStatus(x, status) : x)) };
      if (status === 'withdrawn') return appendAudit(next, 'expectation.close', `Beklenti geri çekildi: ${e.title}`, e.projectId);
      if (status === 'open') return appendAudit(next, 'expectation.create', `Beklenti yeniden açıldı: ${e.title}`, e.projectId);
      return next;
    });
  }, [updateWorkspace]);

  // ---- Haftalık rapor: yetki ve akış işlem anında güncel veriyle doğrulanır ----
  const commitWorkspace = useCallback((next: WorkspaceData) => {
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);
  const reportLabel = (ws: WorkspaceData, r: WeeklyReport) => {
    const name = r.kind === 'department'
      ? `Bölüm eklemeleri (${ws.departments.find(d => d.code === r.departmentCode)?.name || r.departmentCode})`
      : `"${ws.projects.find(p => p.id === r.projectId)?.name || 'Proje'}"`;
    return `${name} · ${weekLabel(r.year, r.week)}`;
  };
  const handleSaveReport = useCallback((draft: WeeklyReport, advance = false): boolean => {
    const ws = workspaceRef.current;
    if (!ws) return false;
    const res = saveReport(ws, identityOf(ws), draft, actorOf(ws), { advance, dictionary: reportDictionary(reportSettingsOf(ws)) });
    if (!res) return false;
    let next: WorkspaceData = { ...ws, weeklyReports: res.reports };
    if (advance) {
      next = res.from === 'draft'
        ? appendAudit(next, 'report.submit', `${reportLabel(ws, res.report)} raporu gönderildi → ${STAGE_LABELS[res.report.stage]}`, res.report.projectId)
        : appendAudit(next, 'report.approve', `${reportLabel(ws, res.report)} raporu onaylandı → ${STAGE_LABELS[res.report.stage]}`, res.report.projectId);
    }
    commitWorkspace(next);
    return true;
  }, [commitWorkspace]);

  const handleReturnReport = useCallback((reportId: string, note: string): boolean => {
    const ws = workspaceRef.current;
    if (!ws) return false;
    const res = returnReportIn(ws, identityOf(ws), reportId, actorOf(ws), note);
    if (!res) return false;
    commitWorkspace(appendAudit({ ...ws, weeklyReports: res.reports }, 'report.return',
      `${reportLabel(ws, res.report)} raporu iade edildi → ${STAGE_LABELS[res.report.stage]}${note.trim() ? `: ${note.trim()}` : ''}`, res.report.projectId));
    return true;
  }, [commitWorkspace]);

  const handlePublishWeek = useCallback((year: number, week: number): boolean => {
    const ws = workspaceRef.current;
    if (!ws) return false;
    const pubs = publishWeek(ws, identityOf(ws), year, week, actorOf(ws).name);
    if (!pubs) return false;
    commitWorkspace(appendAudit({ ...ws, weeklyPublications: pubs }, 'report.publish', `${weekLabel(year, week)} enstitü haftalık raporu yayınlandı`));
    return true;
  }, [commitWorkspace]);

  const handleUnpublishWeek = useCallback((year: number, week: number): boolean => {
    const ws = workspaceRef.current;
    if (!ws) return false;
    const pubs = unpublishWeek(ws, identityOf(ws), year, week);
    if (!pubs) return false;
    commitWorkspace(appendAudit({ ...ws, weeklyPublications: pubs }, 'report.publish', `${weekLabel(year, week)} haftalık raporu yayından kaldırıldı`));
    return true;
  }, [commitWorkspace]);

  // PMO puanı: yalnız PYB rolleri; puan değişince denetim günlüğüne (değer yazılmadan) düşer
  // ---- Yönetici (admin): rol yetkileri ve profiller — işlem anında yetki yeniden doğrulanır ----
  const handleSetRolePermission = useCallback((role: UserRole, key: PermissionKey, on: boolean) => {
    updateWorkspace(ws => {
      if (!can(identityOf(ws), 'screen.admin')) return ws;
      const rolePermissions = setRolePermission(ws.rolePermissions, role, key, on);
      if (!rolePermissions) return ws;
      return appendAudit({ ...ws, rolePermissions }, 'access.update', `${ROLE_LABELS[role]}: "${PERMISSION_BY_KEY.get(key)?.label || key}" yetkisi ${on ? 'verildi' : 'kaldırıldı'}`);
    });
  }, [updateWorkspace]);
  const handleResetRolePermissions = useCallback((role: UserRole) => {
    updateWorkspace(ws => (can(identityOf(ws), 'screen.admin')
      ? appendAudit({ ...ws, rolePermissions: resetRolePermissions(ws.rolePermissions, role) }, 'access.update', `${ROLE_LABELS[role]} yetkileri varsayılana döndü`)
      : ws));
  }, [updateWorkspace]);
  const handleAddProfile = useCallback((role: UserRole, personId?: string): boolean => {
    const ws = workspaceRef.current;
    if (!ws || !can(identityOf(ws), 'screen.admin')) return false;
    const profiles = addProfile(ws.profiles, role, personId);
    if (!profiles) return false;
    const p = personId ? ws.people.find(x => x.id === personId) : undefined;
    commitWorkspace(appendAudit({ ...ws, profiles }, 'access.update', `Profil eklendi: ${p ? `${p.firstName} ${p.lastName}`.trim() : 'kişisiz'} · ${ROLE_LABELS[role]}`));
    return true;
  }, [commitWorkspace]);
  const handleRemoveProfile = useCallback((id: string) => {
    updateWorkspace(ws => {
      const prof = (ws.profiles || []).find(x => x.id === id);
      if (!prof || !can(identityOf(ws), 'screen.admin')) return ws;
      const p = prof.personId ? ws.people.find(x => x.id === prof.personId) : undefined;
      return appendAudit({ ...ws, profiles: removeProfile(ws.profiles, id) }, 'access.update', `Profil kaldırıldı: ${p ? `${p.firstName} ${p.lastName}`.trim() : 'kişisiz'} · ${ROLE_LABELS[prof.role]}`);
    });
  }, [updateWorkspace]);

  // ---- Yönetici: görünüm, sağlık puanı ve rapor akışı ayarları (config.update) ----
  const handleUpdateRoleView = useCallback((role: UserRole, patch: Partial<RoleViewConfig>, label: string) => {
    updateWorkspace(ws => (can(identityOf(ws), 'screen.admin')
      ? appendAudit({ ...ws, viewConfig: updateRoleView(ws.viewConfig, role, patch) }, 'config.update', `${ROLE_LABELS[role]} görünümü: ${label}`)
      : ws));
  }, [updateWorkspace]);
  const handleApplyViewPreset = useCallback((role: UserRole, key: ViewPresetKey) => {
    updateWorkspace(ws => (can(identityOf(ws), 'screen.admin')
      ? appendAudit({ ...ws, viewConfig: applyPreset(ws.viewConfig, role, key) }, 'config.update', `${ROLE_LABELS[role]} görünümü: "${VIEW_PRESETS.find(p => p.key === key)?.label}" uygulandı`)
      : ws));
  }, [updateWorkspace]);
  const handleResetRoleView = useCallback((role: UserRole) => {
    updateWorkspace(ws => (can(identityOf(ws), 'screen.admin')
      ? appendAudit({ ...ws, viewConfig: resetRoleView(ws.viewConfig, role) }, 'config.update', `${ROLE_LABELS[role]} görünümü varsayılana döndü`)
      : ws));
  }, [updateWorkspace]);
  const handleSaveHealthConfig = useCallback((draft: HealthConfig | undefined, label: string): boolean => {
    const ws = workspaceRef.current;
    if (!ws || !can(identityOf(ws), 'screen.admin')) return false;
    const next = cleanHealthConfig(draft);
    if (next === null) return false;
    commitWorkspace(appendAudit({ ...ws, healthConfig: next }, 'config.update', `Sağlık puanı yöntemi: ${label}`));
    return true;
  }, [commitWorkspace]);
  const handleUpdateAiPolicy = useCallback((patch: Parameters<typeof updateAiPolicy>[1], label: string) => {
    updateWorkspace(ws => (can(identityOf(ws), 'screen.admin')
      ? appendAudit({ ...ws, aiPolicy: updateAiPolicy(ws.aiPolicy, patch) }, 'config.update', `Yapay zekâ: ${label}`)
      : ws));
  }, [updateWorkspace]);
  const handleUpdateReportFlow = useCallback((patch: Partial<ReportFlow> & { dueWeekday?: number }, label: string) => {
    updateWorkspace(ws => {
      if (!can(identityOf(ws), 'screen.admin')) return ws;
      const { dueWeekday, ...flowPatch } = patch;
      const current = reportSettingsOf(ws);
      const reportSettings: ReportSettings = { ...current, ...(dueWeekday !== undefined ? { dueWeekday } : {}), flow: { ...reportFlowOf(ws), ...flowPatch } };
      return appendAudit({ ...ws, reportSettings }, 'config.update', `Haftalık rapor akışı: ${label}`);
    });
  }, [updateWorkspace]);

  const handleRatePmo = useCallback((projectId: string, year: number, week: number, score: number | null, note?: string): boolean => {
    const ws = workspaceRef.current;
    if (!ws) return false;
    const prev = pmoRatingFor(ws.pmoRatings, projectId, year, week);
    const ratings = setPmoRating(ws.pmoRatings, { ...actorOf(ws), perms: identityOf(ws).perms }, { projectId, year, week, score, note });
    if (!ratings) return false;
    let next: WorkspaceData = { ...ws, pmoRatings: ratings };
    if ((prev?.score ?? null) !== score) {
      const name = ws.projects.find(p => p.id === projectId)?.name || 'Proje';
      next = appendAudit(next, 'health.rate', `"${name}" · ${weekLabel(year, week)} PMO değerlendirmesi ${score === null ? 'kaldırıldı' : 'kaydedildi'}`, projectId);
    }
    commitWorkspace(next);
    return true;
  }, [commitWorkspace]);

  // AI metin puanı: sistem alanı, yalnız PYB destek yazar (sıralı yazımlar birbirini ezmesin diye güncel durumdan)
  const handleSetAiAssessment = useCallback((reportId: string, assessment: AiReportAssessment) => {
    updateWorkspace(ws => {
      const reports = setReportAiAssessment(ws, identityOf(ws), reportId, assessment);
      return reports ? { ...ws, weeklyReports: reports } : ws;
    });
  }, [updateWorkspace]);

  const handleMarkReportEmailed = useCallback((year: number, week: number) => {
    updateWorkspace(ws => ({ ...ws, weeklyPublications: markWeekEmailed(ws.weeklyPublications || [], year, week) }));
  }, [updateWorkspace]);

  const handleUpdateReportSettings = useCallback((reportSettings: ReportSettings) => {
    // Onay akışı admin ayarıdır; rapor denetçisinin ayar paneli onu değiştiremez
    updateWorkspace(ws => (isReportSteward(identityOf(ws)) ? { ...ws, reportSettings: { ...reportSettings, flow: ws.reportSettings?.flow } } : ws));
  }, [updateWorkspace]);

  const handleSetJiraKey = useCallback((projectId: string, key: string) => {
    updateWorkspace(ws => (canEditProjectContent(ws, identityOf(ws), projectId)
      ? { ...ws, projects: ws.projects.map(p => (p.id === projectId ? { ...p, jiraProjectKey: key } : p)) }
      : ws));
  }, [updateWorkspace]);

  // ---- Müşteri görüşmeleri: planla / onayla / sonuç ----
  const meetingLabel = (m: { title: string; customer: string; date: string }) =>
    `${m.title} (${m.customer}, ${new Date(m.date).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })})`;
  const handleCreateMeeting = useCallback((draft: MeetingDraft, submit: boolean) => {
    updateWorkspace(ws => {
      if (!canPlanMeeting(identityOf(ws))) return ws;
      const m = createMeeting(ws, draft, submit);
      const next = { ...ws, customerMeetings: [m, ...(ws.customerMeetings || [])] };
      return submit ? appendAudit(next, 'meeting.submit', `Müşteri görüşmesi onaya sunuldu: ${meetingLabel(m)}`, m.projectId) : next;
    });
  }, [updateWorkspace]);

  const handleUpdateMeeting = useCallback((id: string, draft: MeetingDraft, submit: boolean) => {
    updateWorkspace(ws => {
      const m = (ws.customerMeetings || []).find(x => x.id === id);
      if (!m || !canEditMeeting(m, identityOf(ws))) return ws;
      const u = updateMeeting(m, draft, submit);
      const next = { ...ws, customerMeetings: (ws.customerMeetings || []).map(x => (x.id === id ? u : x)) };
      return u.status === 'pending' ? appendAudit(next, 'meeting.submit', `Müşteri görüşmesi onaya sunuldu: ${meetingLabel(u)}`, u.projectId) : next;
    });
  }, [updateWorkspace]);

  const handleReviewMeeting = useCallback((id: string, approve: boolean, note: string) => {
    updateWorkspace(ws => {
      const m = (ws.customerMeetings || []).find(x => x.id === id);
      if (!m || m.status !== 'pending' || !canReviewMeeting(identityOf(ws))) return ws;
      const u = reviewMeeting(ws, m, approve, note);
      const next = { ...ws, customerMeetings: (ws.customerMeetings || []).map(x => (x.id === id ? u : x)) };
      return appendAudit(next, approve ? 'meeting.approve' : 'meeting.reject',
        `Müşteri görüşmesi ${approve ? 'onaylandı' : 'reddedildi'}: ${meetingLabel(m)}${note.trim() ? ` — ${note.trim()}` : ''}`, m.projectId);
    });
  }, [updateWorkspace]);

  const handleMarkMeetingHeld = useCallback((id: string, decisions: string) => {
    updateWorkspace(ws => {
      const m = (ws.customerMeetings || []).find(x => x.id === id);
      const who = identityOf(ws);
      const allowed = !!m && (isOwnMeeting(m, who) || (!!m.projectId && ws.projects.some(p => p.id === m.projectId && ownsProject(p, who))));
      if (!m || !allowed || (m.status !== 'approved' && m.status !== 'held')) return ws;
      const next = { ...ws, customerMeetings: (ws.customerMeetings || []).map(x => (x.id === id ? markHeld(x, decisions) : x)) };
      return appendAudit(next, 'meeting.held', `Müşteri görüşmesi gerçekleşti: ${meetingLabel(m)}`, m.projectId);
    });
  }, [updateWorkspace]);

  const handleSetMeetingStatus = useCallback((id: string, status: MeetingStatus) => {
    updateWorkspace(ws => {
      const m = (ws.customerMeetings || []).find(x => x.id === id);
      if (!m || !isOwnMeeting(m, identityOf(ws)) || status !== 'cancelled' || (m.status !== 'pending' && m.status !== 'approved')) return ws;
      return { ...ws, customerMeetings: (ws.customerMeetings || []).map(x => (x.id === id ? setMeetingStatus(x, status) : x)) };
    });
  }, [updateWorkspace]);

  const handleDeleteMeeting = useCallback((id: string) => {
    updateWorkspace(ws => {
      const m = (ws.customerMeetings || []).find(x => x.id === id);
      if (!m || !isOwnMeeting(m, identityOf(ws)) || m.status !== 'draft') return ws;
      return { ...ws, customerMeetings: (ws.customerMeetings || []).filter(x => x.id !== id) };
    });
  }, [updateWorkspace]);

  const openExpectations = useCallback((urgency?: ExpectationUrgency) => {
    setCurrentView(View.Expectations);
    setExpectationUrgency(urgency);
  }, []);

  // Arayüz tercihi (Ayarlar → Arayüz ya da profil menüsündeki kısayol): anında geçiş
  const handleSetUiStyle = useCallback((uiStyle: UiStyle) => {
    updateWorkspace(ws => ({ ...ws, settings: { ...ws.settings, uiStyle } }));
    // Genel bakış yalnız modern arayüzde var
    if (uiStyle === 'classic') setCurrentView(v => (v === View.Overview ? View.Roadmap : v));
  }, [updateWorkspace]);

  const handleSaveSettings = (newDuration: number, newDate: string, enabled: boolean, aiEnabled: boolean, newTheme: string, dark: boolean) => {
    updateWorkspace(ws => ({
      ...ws,
      settings: {
        ...ws.settings,
        isLocalPersistenceEnabled: enabled,
        isAIEnabled: aiEnabled,
        theme: newTheme,
        isDarkMode: dark,
      },
    }));
    if (activeProject) {
      updateActiveProject(p => ({
        ...p,
        settings: {
          ...p.settings,
          sprintDuration: newDuration,
          projectStartDate: newDate,
          manMonthTableColor: THEME_COLORS[newTheme] || THEME_COLORS.classic,
        },
      }));
    }
    setIsSettingsModalOpen(false);
  };

  const handleUpdateTask = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

  // Görev formu (klasik + modern ortak): kaydet; havuzdan atanan kişi proje
  // kaynağı değilse otomatik eklenir; müşteri isteğinden açıldıysa istek
  // "göreve dönüştü" olarak işaretlenir
  const saveTaskFromForm = (t: Task) => {
    const requestId = convertingRequestId;
    updateActiveProject(p => {
      // Formda olmayan alanlar (yaşam döngüsü damgaları, Jira alanları) korunur
      const tasks = p.tasks.some(x => x.id === t.id) ? p.tasks.map(x => x.id === t.id ? { ...x, ...t } : x) : [...p.tasks, t];
      let resources = p.resources;
      const assignee = t.resourceName?.trim();
      if (assignee && workspace && !resources.some(r => r.name.trim().toLocaleLowerCase('tr-TR') === assignee.toLocaleLowerCase('tr-TR'))) {
        const person = workspace.people.find(pp => `${pp.firstName} ${pp.lastName}`.trim().toLocaleLowerCase('tr-TR') === assignee.toLocaleLowerCase('tr-TR'));
        if (person) {
          resources = [...resources, {
            id: `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            name: assignee,
            participation: 100,
            unit: person.departmentCode || t.unit || '',
            title: person.titleCode || 'Uzman',
          }];
        }
      }
      const customerRequests = requestId ? markConverted(p.customerRequests, requestId, t.id) : p.customerRequests;
      return { ...p, tasks, resources, customerRequests };
    });
    setConvertingRequestId(null);
    setIsFormModalOpen(false);
  };
  const closeTaskForm = () => { setConvertingRequestId(null); setIsFormModalOpen(false); };
  // Ayrıntı penceresi canlı görevi gösterir (yorum/durum değişikliği hemen görünür)
  const liveViewingTask = viewingTask ? (activeProject?.tasks.find(t => t.id === viewingTask.id) || viewingTask) : null;
  const currentActorName = useMemo(() => {
    const p = workspace?.people.find(x => x.id === workspace?.currentPersonId);
    return p ? `${p.firstName} ${p.lastName}`.trim() : ROLE_LABELS[identity.role] || 'Siz';
  }, [workspace?.people, workspace?.currentPersonId, identity.role]);

  // Admin konsolu her zaman modern arayüzle açılır
  const isModern = settings?.uiStyle === 'modern' || consoleMode;
  // Proje bağlamındaki ekranlar (modern arayüzde proje başlığı ve segment gezinme gösterilir)
  const inProjectView = !!activeProject && MODERN_PROJECT_VIEWS.includes(currentView) &&
    !notesBlocked;

  const renderView = () => {
    if (!isInitialized || !workspace) {
      return <div className="h-[60vh] flex items-center justify-center"><i className="fa-solid fa-spinner fa-spin text-4xl text-blue-500"></i></div>;
    }

    // Rol bazlı yetkilendirme: notları göremeyen roller (yönetim) PM'e özel
    // ekranlar (Günlük, İstekler) yerine yönetim ekranına yönlendirilir. Zekâ
    // (AI) açıktır; asistanın araçları bu rollerde not/isteklere erişmez.
    // Yetkisi olmayan ekran bir an bile çizilmez; yönlendirmeyi etki yapar.
    if ((currentView === View.Executive && !canExecutive) || (currentView === View.Admin && !canAdmin) || (notesBlocked && !canExecutive)) return null;

    if (currentView === View.Admin) {
      const page = (
        <ModernAdmin
          workspace={workspace}
          section={adminSection}
          onSection={setAdminSection}
          showSectionNav={!consoleMode}
          onSetPermission={handleSetRolePermission}
          onResetRole={handleResetRolePermissions}
          onAddProfile={handleAddProfile}
          onRemoveProfile={handleRemoveProfile}
          onUpdateRoleView={handleUpdateRoleView}
          onApplyViewPreset={handleApplyViewPreset}
          onResetRoleView={handleResetRoleView}
          onSaveHealthConfig={handleSaveHealthConfig}
          onUpdateReportFlow={handleUpdateReportFlow}
          onUpdateAiPolicy={handleUpdateAiPolicy}
          canAudit={canAudit}
          onSaveBackup={canBackup ? handleSaveProject : undefined}
          onLoadBackup={canBackup ? handleLoadProject : undefined}
          onApplyHealthFix={canDataHealth ? handleApplyHealthFix : undefined}
          cloudLinked={!!loadCloudConfig()?.workspaceId}
          onOpenCloud={() => setIsCloudModalOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
        />
      );
      return isModern ? page : <div className="ui-modern rounded-3xl p-4 sm:p-6">{page}</div>;
    }

    if (currentView === View.Executive || notesBlocked) {
      if (isModern) {
        return (
          <ModernExecutive
            workspace={workspace}
            currentRole={workspace.currentRole || 'py'}
            onOpenProject={handleOpenProject}
            onTakeSnapshot={handleTakeSnapshot}
            onNavigate={(v: View) => setCurrentView(v)}
            onOpenAudit={canAudit ? () => setIsAuditModalOpen(true) : undefined}
            onOpenExpectations={openExpectations}
            view={roleView}
          />
        );
      }
      return (
        <ExecutiveView
          workspace={workspace}
          currentRole={workspace.currentRole || 'py'}
          onOpenProject={handleOpenProject}
          onTakeSnapshot={handleTakeSnapshot}
          showChanges={canAudit}
        />
      );
    }

    // Risk raporu ve yönetimden beklentiler (aktif proje gerektirmez). Klasik
    // arayüzde de açılır: modern görünüm katmanı kendi kabının içinde uygulanır.
    if (currentView === View.RiskReport || currentView === View.Expectations) {
      const page = currentView === View.RiskReport ? (
        <ModernRiskReport
          workspace={workspace}
          projectIds={visibleProjectIdSet}
          onOpenProjectRisks={(projectId: string) => { handleOpenProject(projectId); setCurrentView(roleView.projectSections.has('risks') ? View.Risks : View.Overview); }}
          riskView={roleView}
        />
      ) : (
        <ModernExpectations
          key={`exp-${expectationUrgency || 'all'}`}
          workspace={workspace}
          identity={identity}
          initialUrgency={expectationUrgency}
          onCreate={handleCreateExpectation}
          onUpdate={handleUpdateExpectation}
          onRespond={handleRespondExpectation}
          onSetStatus={handleSetExpectationStatus}
        />
      );
      return isModern ? page : <div className="ui-modern rounded-3xl p-4 sm:p-6">{page}</div>;
    }

    // Haftalık rapor ve müşteri görüşmeleri (aktif proje gerektirmez)
    if (currentView === View.WeeklyReport || currentView === View.Meetings) {
      const page = currentView === View.WeeklyReport ? (
        <ModernWeeklyReport
          key={`wr-${identity.role}-${identity.personId || ''}`}
          workspace={workspace}
          identity={identity}
          onSaveReport={(r: WeeklyReport) => handleSaveReport(r)}
          onAdvanceReport={(r: WeeklyReport) => handleSaveReport(r, true)}
          onReturnReport={handleReturnReport}
          onPublishWeek={handlePublishWeek}
          onUnpublishWeek={handleUnpublishWeek}
          onMarkEmailed={handleMarkReportEmailed}
          onUpdateSettings={handleUpdateReportSettings}
          onSetJiraKey={handleSetJiraKey}
          onOpenMeetings={() => setCurrentView(View.Meetings)}
          onRatePmo={handleRatePmo}
          onSetAiAssessment={handleSetAiAssessment}
        />
      ) : (
        <ModernMeetings
          key={`mt-${identity.role}-${identity.personId || ''}`}
          workspace={workspace}
          identity={identity}
          onCreate={handleCreateMeeting}
          onUpdate={handleUpdateMeeting}
          onReview={handleReviewMeeting}
          onMarkHeld={handleMarkMeetingHeld}
          onSetStatus={handleSetMeetingStatus}
          onDelete={handleDeleteMeeting}
        />
      );
      return isModern ? page : <div className="ui-modern rounded-3xl p-4 sm:p-6">{page}</div>;
    }

    // Çalışma alanı seviyesi ekranlar (aktif proje gerektirmez)
    if (currentView === View.DataPool && isModern) {
      return (
        <ModernDataPool
          people={workspace.people}
          departments={workspace.departments}
          roleCatalog={workspace.roleCatalog}
          titles={workspace.titles}
          currentRole={workspace.currentRole || 'py'}
          canEdit={canEditPool(identity)}
          onUpdatePeople={(people: Person[]) => updateWorkspace(ws => ({ ...ws, people }))}
          onUpdateDepartments={(departments: WorkspaceData['departments']) => updateWorkspace(ws => ({ ...ws, departments }))}
          onUpdateRoleCatalog={(roleCatalog: WorkspaceData['roleCatalog']) => updateWorkspace(ws => ({ ...ws, roleCatalog }))}
          onUpdateTitles={(titles: WorkspaceData['titles']) => updateWorkspace(ws => ({ ...ws, titles }))}
          onApplyImport={handleApplyPoolImport}
          onViewPerson={setViewingPersonId}
        />
      );
    }
    if (currentView === View.DataPool) {
      return (
        <DataPoolView
          people={workspace.people}
          departments={workspace.departments}
          roleCatalog={workspace.roleCatalog}
          titles={workspace.titles}
          currentRole={workspace.currentRole || 'py'}
          canEdit={canEditPool(identity)}
          onUpdatePeople={(people) => updateWorkspace(ws => ({ ...ws, people }))}
          onUpdateDepartments={(departments) => updateWorkspace(ws => ({ ...ws, departments }))}
          onUpdateRoleCatalog={(roleCatalog) => updateWorkspace(ws => ({ ...ws, roleCatalog }))}
          onUpdateTitles={(titles) => updateWorkspace(ws => ({ ...ws, titles }))}
          onApplyImport={handleApplyPoolImport}
          onViewPerson={setViewingPersonId}
        />
      );
    }
    if (currentView === View.Allocations && isModern) {
      return (
        <ModernAllocation
          allocations={workspace.allocations}
          people={workspace.people}
          projects={workspace.projects}
          planLocks={workspace.planLocks}
          leaves={workspace.leaves || []}
          titles={workspace.titles}
          currentRole={workspace.currentRole || 'py'}
          identity={identity}
          onSetCell={handleSetAllocationCell}
          onAddAllocation={handleAddAllocation}
          onDeleteAllocation={handleDeleteAllocation}
          onLockAction={handleLockAction}
          onApplySuggestions={handleApplySuggestions}
          onApplyBilledHours={handleApplyBilledHours}
          onViewPerson={setViewingPersonId}
        />
      );
    }
    if (currentView === View.Allocations) {
      return (
        <AllocationView
          allocations={workspace.allocations}
          people={workspace.people}
          projects={workspace.projects}
          planLocks={workspace.planLocks}
          leaves={workspace.leaves || []}
          titles={workspace.titles}
          currentRole={workspace.currentRole || 'py'}
          identity={identity}
          onSetCell={handleSetAllocationCell}
          onAddAllocation={handleAddAllocation}
          onDeleteAllocation={handleDeleteAllocation}
          onLockAction={handleLockAction}
          onApplySuggestions={handleApplySuggestions}
          onApplyBilledHours={handleApplyBilledHours}
        />
      );
    }

    if (currentView === View.Calendar && isModern) {
      return (
        <ModernCalendar
          workspace={workspace}
          identity={identity}
          onViewPerson={setViewingPersonId}
          onOpenProject={(projectId: string) => { handleOpenProject(projectId); setCurrentView(View.Tasks); }}
        />
      );
    }
    if (currentView === View.Calendar) {
      return <CalendarView workspace={workspace} identity={identity} onViewPerson={setViewingPersonId} />;
    }

    // Aktif proje yoksa tek anlamlı ekran portföydür
    if ((!activeProject || currentView === View.Portfolio) && isModern) {
      return (
        <ModernPortfolio
          projects={visibleProjects}
          people={workspace.people}
          identity={identity}
          needsPerson={needsPerson}
          todoItems={todoItems}
          onTodoNavigate={handleTodoNavigate}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onSetRag={handleSetProjectRag}
          onSetStatus={handleSetProjectStatus}
          onSetOwner={handleSetProjectOwner}
          createRequest={newProjectRequest}
          sortKey={roleView.projectSort}
          healthScores={portfolioScores}
        />
      );
    }
    if (!activeProject || currentView === View.Portfolio) {
      return (
        <PortfolioView
          projects={visibleProjects}
          activeProjectId={workspace.activeProjectId}
          identity={identity}
          people={workspace.people}
          needsPerson={needsPerson}
          onOpenProject={handleOpenProject}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onSetRag={handleSetProjectRag}
          onSetStatus={handleSetProjectStatus}
          onSetOwner={handleSetProjectOwner}
        />
      );
    }

    const { tasks, resources, notes, customerRequests, objectives } = activeProject;
    const ps = activeProject.settings;
    const changeTaskStatus = (id: string, s: TaskStatus) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: s } : t));
    const viewTask = (t: Task) => { setViewingTask(t); setIsDetailModalOpen(true); };
    const editTask = (t: Task) => { setEditingTask(t); setIsFormModalOpen(true); };
    const deleteTask = (taskId: string) => { if (window.confirm('Emin misiniz?')) setTasks(prev => prev.filter(t => t.id !== taskId)); };
    const notifyTask = (t: Task) => { setTeamsTask(t); setIsTeamsModalOpen(true); };
    const newTask = () => { setEditingTask(null); setIsFormModalOpen(true); };
    const celebrate = (message: string) => setEgg({ kind: 'celebrate', message });
    const convertRequest = (r: CustomerRequest) => {
      setConvertingRequestId(r.id);
      setEditingTask(taskDraftFromRequest(r, resources[0]?.name || ''));
      setIsFormModalOpen(true);
    };

    // Sürüm ekleme/silme (klasik pano ve modern zaman çizelgesi ortak)
    const insertSprint = (n: number) => setTasks(prev => prev.map(t => t.version >= n ? { ...t, version: t.version + 1 } : t));
    const deleteSprint = (n: number) => setTasks(prev => prev.map(t => t.version === n ? { ...t, version: 0, status: TaskStatus.Backlog } : t.version > n ? { ...t, version: t.version - 1 } : t));
    if (isModern && currentView === View.Kanban) {
      return (
        <ModernTimeline
          // Salt okunur zaman çizelgesi admin'in öncelik süzgecini izler; düzenlenebilirde tüm görevler (otomatik plan gizlileri kaybetmesin)
          project={isManagementRole(identity.role) && roleView.minTaskPriority !== 'Low' ? { ...activeProject, tasks: activeProject.tasks.filter(t => taskPassesView(roleView, t)) } : activeProject}
          canEdit={!isManagementRole(identity.role)}
          onMoveTask={(id: string, v: number) => setTasks(prev => prev.map(t => t.id === id ? { ...t, version: v } : t))}
          onPlanGenerated={setTasks}
          onInsertSprint={insertSprint}
          onDeleteSprint={deleteSprint}
          onRenameSprint={(v: number, name: string) => setSprintNames(prev => {
            const next = { ...prev };
            if (name) next[v] = name; else delete next[v];
            return next;
          })}
          onUpdateCalendar={(c: CalendarSettings) => updateActiveProject(p => ({ ...p, settings: { ...p.settings, ...c } }))}
          onViewTask={viewTask}
          onNewTask={newTask}
        />
      );
    }
    if (isModern && currentView === View.Planning) {
      return (
        <ModernPlanning
          project={activeProject}
          workspace={workspace}
          visibleProjectIds={visibleProjectIdSet}
          canEdit={canEditProjectContent(workspace, identity, activeProject.id)}
          onAddTask={(t: Task, log: EstimateLogEntry) => {
            updateActiveProject(p => ({ ...p, tasks: [...p.tasks, t] }));
            // Öneri günlüğü: gösterilen öneriler, kör tahmin ve nihai karar (öğrenme döngüsü)
            updateWorkspace(ws => ({ ...ws, estimateLog: appendEstimateLog(ws.estimateLog, log) }));
          }}
          onViewTask={viewTask}
          onOpenList={() => setCurrentView(View.Tasks)}
        />
      );
    }
    if (isModern && currentView === View.Resources) {
      return (
        <ModernTeam
          resources={resources}
          tasks={tasks}
          people={workspace.people}
          canEdit={!isManagementRole(identity.role)}
          onUpdate={(rs: Resource[], ts?: Task[]) => updateActiveProject(p => ({ ...p, resources: rs, tasks: ts ?? p.tasks }))}
          setResources={setResources}
          titleCosts={ps.titleCosts || {}}
          setTitleCosts={setTitleCosts}
          costTableColor={ps.costTableColor || '#10b981'}
        />
      );
    }
    if (isModern && currentView === View.Goals) {
      return (
        <ModernGoals
          objectives={objectives}
          tasks={tasks}
          canEdit={!isManagementRole(identity.role)}
          onUpdateObjectives={setObjectives}
          onViewTask={viewTask}
          onNavigate={setCurrentView}
        />
      );
    }
    if (isModern && currentView === View.AI) {
      return (
        <div className="m-surface rounded-2xl overflow-hidden h-[calc(100vh-16rem)] min-h-[480px]">
          <ModernChat variant="page" suggestions={aiSuggestions} />
        </div>
      );
    }
    if (isModern && currentView === View.Notes) {
      return (
        <ModernNotes
          key={activeProject.id}
          notes={notes}
          mentionNames={resources.map(r => r.name)}
          tagColors={ps.tagColors || {}}
          canEdit={canEditProjectContent(workspace, identity, activeProject.id)}
          onAdd={(n: Note) => setNotes(prev => [n, ...prev])}
          onUpdate={(n: Note) => setNotes(prev => prev.map(x => (x.id === n.id ? n : x)))}
          onDelete={(id: string) => setNotes(prev => prev.filter(x => x.id !== id))}
          onSetTagColors={(c: Record<string, string>) => setTagColors(c)}
          onOpenWeeklyReport={() => setCurrentView(View.WeeklyReport)}
        />
      );
    }
    if (isModern && currentView === View.Requests) {
      return (
        <ModernRequests
          requests={customerRequests}
          tasks={tasks}
          onChange={(next: CustomerRequest[]) => setCustomerRequests(next)}
          onConvert={convertRequest}
          onViewTask={viewTask}
        />
      );
    }
    if (isModern && currentView === View.Risks) {
      return (
        <ModernRisks
          project={activeProject}
          people={workspace.people}
          canEdit={canEditProjectContent(workspace, identity, activeProject.id)}
          onUpdateRisks={handleUpdateActiveRisks}
          onUpdatePestel={(pestelItems: PestelItem[]) => updateActiveProject(p => ({ ...p, pestelItems }))}
          onUpdateSwot={(swotItems: SwotItem[]) => updateActiveProject(p => ({ ...p, swotItems }))}
          riskView={roleView}
        />
      );
    }
    if (isModern && currentView === View.Overview) {
      return (
        <ModernProjectOverview
          workspace={workspace}
          project={activeProject}
          canEdit={canEditProjectContent(workspace, identity, activeProject.id)}
          onNavigate={setCurrentView}
          onViewTask={viewTask}
          onNewTask={newTask}
          onSetRag={handleSetProjectRag}
          onCelebrate={celebrate}
          sections={roleView.projectSections}
          minRiskScore={roleView.minRiskScore}
          showChanges={canAudit}
        />
      );
    }
    if (isModern && currentView === View.Roadmap) {
      return (
        <ModernBoard
          tasks={tasks}
          sprintNames={ps.sprintNames || {}}
          onStatusChange={changeTaskStatus}
          onViewTask={viewTask}
          onEditTask={editTask}
          onDeleteTask={deleteTask}
          onNotifyTask={notifyTask}
          onNewTask={newTask}
          onCelebrate={celebrate}
          minPriority={roleView.minTaskPriority}
          sortKey={roleView.taskSort}
        />
      );
    }
    if (isModern && currentView === View.Tasks) {
      return (
        <ModernTaskList
          tasks={tasks}
          resources={resources}
          sprintNames={ps.sprintNames || {}}
          onStatusChange={changeTaskStatus}
          onViewTask={viewTask}
          onEditTask={editTask}
          onDeleteTask={deleteTask}
          onNotifyTask={notifyTask}
          onDataImport={(nt: Task[], nr: Resource[]) => { setTasks(prev => [...prev, ...nt]); setResources(prev => [...prev, ...nr]); }}
          onCelebrate={celebrate}
          minPriority={roleView.minTaskPriority}
          sortKey={roleView.taskSort}
        />
      );
    }

    switch (currentView) {
      case View.AI: return <AIAssistant suggestions={aiSuggestions} />;
      case View.Tasks:
        return (
          <TaskGallery
            tasks={tasks} resources={resources}
            onEditTask={(t) => { setEditingTask(t); setIsFormModalOpen(true); }} onViewTask={(t) => { setViewingTask(t); setIsDetailModalOpen(true); }}
            onNotifyTask={(t) => { setTeamsTask(t); setIsTeamsModalOpen(true); }} onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
            onDeleteTask={(taskId) => { if(window.confirm('Emin misiniz?')) setTasks(prev => prev.filter(t => t.id !== taskId)); }}
            onDataImport={(nt, nr) => { setTasks(prev => [...prev, ...nt]); setResources(prev => [...prev, ...nr]); }}
            onTaskStatusChange={(id, s) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: s } : t))}
          />
        );
      case View.Resources:
        return (
          <ResourceManager
            resources={resources} setResources={setResources} tasks={tasks} setTasks={setTasks}
            titleCosts={ps.titleCosts || {}} setTitleCosts={setTitleCosts}
            manMonthTableColor={ps.manMonthTableColor || THEME_COLORS[settings?.theme || 'classic']}
            setManMonthTableColor={(color) => setManMonthTableColor(color)}
            costTableColor={ps.costTableColor || '#10b981'}
            setCostTableColor={(color) => setCostTableColor(color)}
          />
        );
      case View.Kanban:
        return (
          <KanbanView
            tasks={tasks} resources={resources}
            sprintDuration={ps.sprintDuration} projectStartDate={ps.projectStartDate}
            sprintNames={ps.sprintNames || {}} setSprintNames={setSprintNames}
            globalTestDays={ps.globalTestDays || 4} setGlobalTestDays={setGlobalTestDays as React.Dispatch<React.SetStateAction<number>>}
            onPlanGenerated={setTasks} onTaskSprintChange={(id, v) => setTasks(prev => prev.map(t => t.id === id ? { ...t, version: v } : t))}
            onTaskStatusChange={(id, s) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: s } : t))}
            onInsertSprint={insertSprint}
            onDeleteSprint={deleteSprint}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
            onViewTaskDetails={(taskId) => { const t = tasks.find(x => x.id === taskId); if(t) { setViewingTask(t); setIsDetailModalOpen(true); } }}
          />
        );
      case View.Overview: // klasik arayüzde karşılığı pano
      case View.Roadmap:
        return (
          <RoadmapView
            tasks={tasks}
            resources={resources}
            onTaskStatusChange={(id, s) => setTasks(prev => prev.map(t => t.id === id ? { ...t, status: s } : t))}
            onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
            onViewTask={(t) => { setViewingTask(t); setIsDetailModalOpen(true); }}
            onEditTask={(t) => { setEditingTask(t); setIsFormModalOpen(true); }}
            onDeleteTask={(taskId) => { if(window.confirm('Emin misiniz?')) setTasks(prev => prev.filter(t => t.id !== taskId)); }}
          />
        );
      case View.Goals:
        return <GoalsView
                 objectives={objectives}
                 tasks={tasks}
                 onUpdateObjectives={setObjectives}
               />;
      case View.Risks:
        return (
          <RiskView
            projectName={activeProject.name}
            risks={activeProject.risks || []}
            people={workspace.people}
            canEdit={canEditProjectContent(workspace, identity, activeProject.id)}
            pestelItems={activeProject.pestelItems || []}
            swotItems={activeProject.swotItems || []}
            onUpdateRisks={handleUpdateActiveRisks}
            onUpdatePestel={(pestelItems) => updateActiveProject(p => ({ ...p, pestelItems }))}
            onUpdateSwot={(swotItems) => updateActiveProject(p => ({ ...p, swotItems }))}
            project={activeProject}
          />
        );
      case View.Notes:
        return (
          <NotesView
            notes={notes} resources={resources} tagColors={ps.tagColors || {}} setTagColors={setTagColors}
            onAddNote={(n) => setNotes(prev => [n, ...prev])} onEditNote={(n) => setNotes(prev => prev.map(x => x.id === n.id ? n : x))} onDeleteNote={(id) => setNotes(prev => prev.filter(x => x.id !== id))}
          />
        );
      case View.Requests:
        return (
          <CustomerRequestsView
            requests={customerRequests} setRequests={setCustomerRequests}
            onConvertToTask={convertRequest}
          />
        );
      default:
        return null;
    }
  };

  const isFullWidthView = currentView === View.Roadmap && !!activeProject;

  // ---- AI asistanı: ekran/proje bağlamı ve örnek sorular ----
  // AI: kullanıcı ayarı + admin politikası (kurum geneli) + rol yetkisi
  const aiPolicy = aiPolicyOf(workspace || undefined);
  const isAIEnabled = settings?.isAIEnabled !== false && aiPolicy.enabled && can(identity, 'ai.use');
  const isAIChatEnabled = isAIEnabled && aiPolicy.chat;
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;
  const getAssistantWorkspace = useCallback(() => workspaceRef.current, []);
  const getAssistantView = useCallback(() => currentViewRef.current, []);
  // Asistanın önerdiği değişiklik kullanıcı onaylayınca: güncel veriyle yeniden
  // doğrula (yetki, plan kilidi), uygula, denetim günlüğüne yaz, geri-al sun
  const handleApplyAiAction = useCallback((action: AiAction): { ok: boolean; message: string } => {
    const current = workspaceRef.current;
    if (!current) return { ok: false, message: 'Çalışma alanı hazır değil.' };
    const problem = validateAction(current, action);
    if (problem) return { ok: false, message: problem };
    let summary = '';
    try {
      const result = applyAction(current, action);
      summary = result.summary;
      setWorkspace(result.ws);
      workspaceRef.current = result.ws;
    } catch (e) {
      return { ok: false, message: (e as Error).message || 'Uygulanamadı.' };
    }
    showUndo(`AI önerisi uygulandı: ${summary}`, current);
    return { ok: true, message: `${summary} (Geri almak için alttaki "Geri Al").` };
  }, [showUndo]);

  // Asistan kaynağına tıklanınca: ilgili projeyi aç ve ekrana geç
  const handleAssistantNavigate = useCallback((ref: RagRef) => {
    if (ref.kind !== 'project-view') return;
    handleOpenProject(ref.projectId);
    setCurrentView(ref.view);
  }, [handleOpenProject]);
  const aiSuggestions = useMemo(
    () => buildSuggestions(identity, activeProject && visibleProjects.some(p => p.id === activeProject.id) ? activeProject.name : undefined),
    [identity, activeProject, visibleProjects]
  );
  // Header tek satır 4rem; proje seçiliyken bağlam çubuğuyla 6.75rem
  const showProjectBar = !!activeProject;
  const mainHeightClass = showProjectBar ? 'h-[calc(100vh-6.75rem)]' : 'h-[calc(100vh-4rem)]';

  // Modern arayüz yardımcıları
  const peopleSummaries = useMemo(
    () => (workspace?.people || []).map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), initials: `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`, departmentCode: p.departmentCode })),
    [workspace?.people],
  );
  const activeOwnerName = useMemo(() => {
    const owner = activeProject?.pmPersonId ? workspace?.people.find(p => p.id === activeProject.pmPersonId) : undefined;
    return owner ? `${owner.firstName} ${owner.lastName}`.trim() : undefined;
  }, [activeProject, workspace?.people]);
  // Yeniden yazılmış ekranlar m-legacy yumuşatma katmanının dışında kalır
  const showsExecutive = currentView === View.Executive || currentView === View.Admin || notesBlocked;
  const usesModernScreen = inProjectView
    ? MODERN_PROJECT_VIEWS.includes(currentView)
    : showsExecutive || currentView === View.Allocations || currentView === View.RiskReport || currentView === View.Expectations || currentView === View.WeeklyReport || currentView === View.Meetings || currentView === View.Calendar || currentView === View.DataPool || ((currentView === View.Portfolio || !activeProject) && ![View.DataPool, View.Calendar].includes(currentView));

  // Komut paleti öğeleri (ekranlar + aksiyonlar + kapsamdaki projeler + kişiler)
  const commandItems = useMemo<CommandItem[]>(() => {
    if (!workspace) return [];
    const items: CommandItem[] = [];
    const go = (view: View) => () => setCurrentView(view);
    // Admin konsolu: yalnız konsol bölümleri ve profil değiştirme
    if (consoleMode) {
      ADMIN_SECTIONS.forEach(sec => items.push({ id: `adm-${sec.key}`, group: 'Yönetici konsolu', label: sec.label, sublabel: sec.description, icon: 'fa-user-lock', keywords: sec.description, run: () => { setAdminSection(sec.key); setCurrentView(View.Admin); } }));
      items.push({ id: 'a-profile', group: 'Aksiyonlar', label: 'Profil değiştir', icon: 'fa-user-gear', keywords: 'profil rol kimlik kisi degistir', run: () => setIsProfileOpen(true) });
      return items;
    }
    items.push({ id: 'v-portfolio', group: 'Ekranlar', label: 'Portföy', icon: 'fa-table-cells-large', keywords: 'portfoy proje', run: go(View.Portfolio) });
    items.push({ id: 'v-alloc', group: 'Ekranlar', label: 'İşgücü Tahsisi', icon: 'fa-people-arrows', keywords: 'tahsis aa doluluk isi', run: go(View.Allocations) });
    items.push({ id: 'v-calendar', group: 'Ekranlar', label: 'Takvim', icon: 'fa-calendar-days', keywords: 'takvim zaman cizelge ekip is paketi', run: go(View.Calendar) });
    items.push({ id: 'v-risks', group: 'Ekranlar', label: 'Risk raporu', icon: 'fa-shield-halved', keywords: 'risk rapor matris yuksek', run: go(View.RiskReport) });
    items.push({ id: 'v-expect', group: 'Ekranlar', label: 'Yönetimden beklentiler', icon: 'fa-flag', keywords: 'beklenti yonetim karar onay talep eskalasyon', run: go(View.Expectations) });
    items.push({ id: 'v-weekly', group: 'Ekranlar', label: 'Haftalık rapor', icon: 'fa-file-lines', keywords: 'haftalik rapor gelisme plan mudur bolum onay yayin', run: go(View.WeeklyReport) });
    items.push({ id: 'v-meetings', group: 'Ekranlar', label: 'Müşteri görüşmeleri', icon: 'fa-handshake', keywords: 'musteri gorusme toplanti demo onay plan', run: go(View.Meetings) });
    items.push({ id: 'v-pool', group: 'Ekranlar', label: 'Veri Havuzu', icon: 'fa-database', keywords: 'personel bolum rol unvan havuz', run: go(View.DataPool) });
    if (canExecutive) items.push({ id: 'v-exec', group: 'Ekranlar', label: 'Yönetim (EVM · riskler · baseline)', icon: 'fa-gauge-high', keywords: 'yonetim evm butce risk', run: go(View.Executive) });
    if (canAdmin) items.push({ id: 'v-admin', group: 'Ekranlar', label: 'Yönetici konsolu: yetkiler, görünüm, rapor akışı, puanlama', icon: 'fa-user-lock', keywords: 'admin yetki rol izin profil kullanici gorunum filtre siralama akis puan', run: go(View.Admin) });
    items.push({ id: 'a-profile', group: 'Aksiyonlar', label: 'Profil değiştir', icon: 'fa-user-gear', keywords: 'profil rol kimlik kisi degistir', run: () => setIsProfileOpen(true) });
    if (canDataHealth) items.push({ id: 'a-health', group: 'Aksiyonlar', label: 'Veri Sağlığı Denetimi', icon: 'fa-stethoscope', keywords: 'saglik hata yetim', run: () => setIsHealthModalOpen(true) });
    if (canAudit) items.push({ id: 'a-audit', group: 'Aksiyonlar', label: 'Denetim Günlüğü', icon: 'fa-clock-rotate-left', keywords: 'audit log gunluk kayit', run: () => setIsAuditModalOpen(true) });
    if (activeProject && isModern && roleView.projectSections.has('planning')) items.push({ id: 'v-planning', group: 'Ekranlar', label: `Planlama asistanı — ${activeProject.name}`, icon: 'fa-chart-area', keywords: 'planlama simulasyon monte carlo tahmin olasilik surum yeni kayit benzer', run: go(View.Planning) });
    if (activeProject) items.push({ id: 'a-wp', group: 'Aksiyonlar', label: `İş Paketleri — ${activeProject.name}`, icon: 'fa-briefcase', keywords: 'is paketi work package gorev', run: () => setIsWpManagerOpen(true) });
    items.push({ id: 'egg-rocket', group: 'Sürpriz', label: 'Roketi fırlat', icon: 'fa-rocket', keywords: 'roket rocket uzay', hidden: true, run: () => setEgg({ kind: 'hyper' }) });
    visibleProjects.forEach(p => items.push({ id: `p-${p.id}`, group: 'Projeler', label: p.name, sublabel: 'Projeyi aç', icon: 'fa-folder-open', keywords: p.code || '', run: () => handleOpenProject(p.id) }));
    workspace.people.forEach(p => items.push({ id: `k-${p.id}`, group: 'Kişiler', label: `${p.firstName} ${p.lastName}`.trim(), sublabel: `${p.departmentCode || ''} · kişi profili`, icon: 'fa-user', keywords: p.sicil || '', run: () => setViewingPersonId(p.id) }));
    return items;
  }, [workspace, visibleProjects, identity, handleOpenProject, activeProject, consoleMode, canAudit, canDataHealth, isModern, roleView]);

  return (
    <AssistantProvider enabled={isAIEnabled && !consoleMode} chat={aiPolicy.chat} embedded={aiPolicy.embedded} getWorkspace={getAssistantWorkspace} getView={getAssistantView} onNavigate={handleAssistantNavigate} onApplyAction={handleApplyAiAction}>
    <div className={`min-h-screen font-sans theme-${settings?.theme || 'classic'} ${isModern ? 'ui-modern' : 'bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100'}`}>
      {isModern ? (
        <div className="flex min-h-screen">
          <ModernSidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            currentView={currentView}
            hasActiveProject={inProjectView}
            onNavigate={(v: View) => setCurrentView(v)}
            exec={canExecutive}
            canAdmin={canAdmin}
            consoleMode={consoleMode}
            adminSection={adminSection}
            onAdminSection={setAdminSection}
            onOpenProfile={() => setIsProfileOpen(true)}
            expectationBadge={expectationBadge}
            reportBadge={attention.reportBadge}
            meetingBadge={attention.meetingBadge}
            projects={visibleProjects.map(p => ({ id: p.id, name: p.name, rag: p.rag, openTasks: p.tasks.filter(t => t.status !== TaskStatus.Done).length }))}
            activeProjectId={activeProject?.id ?? null}
            onOpenProject={handleOpenProject}
            canCreateProject={canCreateProject(identity)}
            onNewProject={() => { setCurrentView(View.Portfolio); setNewProjectRequest(n => n + 1); }}
            onOpenSearch={() => setIsPaletteOpen(true)}
            currentRole={workspace?.currentRole || 'py'}
            currentPersonId={workspace?.currentPersonId}
            people={peopleSummaries}
            needsPerson={needsPerson}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            onSwitchToClassic={() => handleSetUiStyle('classic')}
            onSaveBackup={canBackup ? handleSaveProject : undefined}
            onLoadBackup={canBackup ? handleLoadProject : undefined}
            cloudLinked={!!loadCloudConfig()?.workspaceId}
            onOpenCloud={() => setIsCloudModalOpen(true)}
            healthAlerts={canDataHealth ? healthAlerts : 0}
            onOpenHealth={canDataHealth ? () => setIsHealthModalOpen(true) : undefined}
            onOpenAudit={canAudit ? () => setIsAuditModalOpen(true) : undefined}
            onOpenAbout={() => setIsAboutModalOpen(true)}
            onLogoLaunch={() => setCurrentView(inProjectView ? View.Overview : View.Portfolio)}
            onHyperdrive={() => setEgg({ kind: 'hyper' })}
          />
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="lg:hidden sticky top-0 z-30 m-surface border-b m-sep flex items-center gap-1 px-1.5 h-14">
              <button type="button" className="m-icon-btn" aria-label="Menüyü aç" onClick={() => setIsSidebarOpen(true)}><Icon name="menu" /></button>
              <span className="flex-1 min-w-0 truncate text-[17px] font-semibold m-text">{inProjectView && activeProject ? activeProject.name : consoleMode ? 'Yönetici konsolu' : 'PlanAsistan'}</span>
              {!consoleMode && <button type="button" className="m-icon-btn" aria-label="Ara" onClick={() => setIsPaletteOpen(true)}><Icon name="search" /></button>}
              <button type="button" className="m-icon-btn" aria-label={`Profil: ${currentActorName}. Profil değiştir`} title="Profil değiştir" onClick={() => setIsProfileOpen(true)}>
                <span aria-hidden="true" className="w-8 h-8 rounded-full m-fill flex items-center justify-center text-[12px] font-semibold m-text">{initialsOf(currentActorName)}</span>
              </button>
            </div>
            <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
              {inProjectView && activeProject && (
                <ModernProjectHeader
                  project={activeProject}
                  ownerName={activeOwnerName}
                  currentView={currentView}
                  onNavigate={(v: View) => setCurrentView(v)}
                  onBack={() => setCurrentView(View.Portfolio)}
                  exec={isManagementRole(identity.role)}
                  aiEnabled={isAIChatEnabled}
                  onStatusReport={() => setIsStatusReportOpen(true)}
                  onNewTask={() => { setEditingTask(null); setIsFormModalOpen(true); }}
                  onOpenWorkPackages={() => setIsWpManagerOpen(true)}
                  sections={roleView.projectSections}
                />
              )}
              <div className={usesModernScreen ? '' : 'm-legacy'}>{renderView()}</div>
            </main>
          </div>
        </div>
      ) : (
        <>
        <Header
          currentView={currentView} setCurrentView={setCurrentView}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onSaveProject={canBackup ? handleSaveProject : undefined}
          onLoadProject={canBackup ? handleLoadProject : undefined}
          isLocalPersistenceEnabled={settings?.isLocalPersistenceEnabled !== false}
          isAIEnabled={isAIChatEnabled}
          onOpenAbout={() => setIsAboutModalOpen(true)}
          projects={visibleProjects.map(p => ({ id: p.id, name: p.name, rag: p.rag }))}
          activeProjectId={activeProject?.id ?? null}
          onSelectProject={handleOpenProject}
          currentRole={workspace?.currentRole || 'py'}
          currentPersonId={workspace?.currentPersonId}
          people={(workspace?.people || []).map(p => ({ id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), initials: `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`, departmentCode: p.departmentCode }))}
          identityNeedsPerson={needsPerson}
          onOpenProfile={() => setIsProfileOpen(true)}
          canExecutive={canExecutive}
          hidePrivate={isManagementRole(identity.role)}
          cloudLinked={!!loadCloudConfig()?.workspaceId}
          onOpenCloudSync={() => setIsCloudModalOpen(true)}
          todoItems={todoItems}
          onTodoNavigate={handleTodoNavigate}
          onOpenStatusReport={() => setIsStatusReportOpen(true)}
          dataHealthAlerts={canDataHealth ? healthAlerts : 0}
          onOpenDataHealth={canDataHealth ? () => setIsHealthModalOpen(true) : undefined}
          onOpenAuditLog={canAudit ? () => setIsAuditModalOpen(true) : undefined}
          onOpenCommandPalette={() => setIsPaletteOpen(true)}
          onOpenWorkPackages={() => setIsWpManagerOpen(true)}
        />
        <main className={`w-full max-w-[1920px] mx-auto ${isFullWidthView ? mainHeightClass : `px-4 sm:px-6 lg:px-8 py-6 ${mainHeightClass} overflow-auto`}`}>
          {renderView()}
        </main>
        </>
      )}

      {isFormModalOpen && activeProject && workspace && (isModern ? (
        <TaskFormSheet
          task={editingTask}
          tasks={activeProject.tasks}
          resources={activeProject.resources}
          people={workspace.people}
          workPackages={activeProject.workPackages}
          objectives={activeProject.objectives}
          sprintNames={activeProject.settings.sprintNames || {}}
          history={{ projects: workspace.projects, projectId: activeProject.id, visibleProjectIds: visibleProjectIdSet }}
          onClose={closeTaskForm}
          onSave={saveTaskFromForm}
        />
      ) : (
        <TaskFormModal task={editingTask} resources={activeProject.resources} people={workspace.people} workPackages={activeProject.workPackages} tasks={activeProject.tasks} objectives={activeProject.objectives} onClose={closeTaskForm} onSave={saveTaskFromForm} />
      ))}
      {isWpManagerOpen && activeProject && workspace && isModern && (
        <WorkPackagesSheet
          workPackages={activeProject.workPackages}
          tasks={activeProject.tasks}
          canEdit={canEditProjectContent(workspace, identity, activeProject.id)}
          onChange={(next: WorkPackage[]) => setWorkPackages(next)}
          onClose={() => setIsWpManagerOpen(false)}
        />
      )}
      {isWpManagerOpen && activeProject && !isModern && (
        <WorkPackageManager
          isOpen={isWpManagerOpen}
          onClose={() => setIsWpManagerOpen(false)}
          workPackages={activeProject.workPackages}
          tasks={activeProject.tasks}
          setWorkPackages={setWorkPackages}
        />
      )}
      {isDetailModalOpen && liveViewingTask && (isModern && activeProject ? (
        <TaskDetailSheet
          task={liveViewingTask}
          project={activeProject}
          authorName={currentActorName}
          canEdit={!isManagementRole(identity.role)}
          onClose={() => setIsDetailModalOpen(false)}
          onEdit={(t: Task) => { setIsDetailModalOpen(false); setEditingTask(t); setIsFormModalOpen(true); }}
          onSave={handleUpdateTask}
        />
      ) : (
        <TaskDetailModal task={liveViewingTask} onClose={() => setIsDetailModalOpen(false)} onEdit={(t) => { setIsDetailModalOpen(false); setEditingTask(t); setIsFormModalOpen(true); }} onSave={handleUpdateTask} />
      ))}
      {isTeamsModalOpen && teamsTask && <TeamsMessageModal task={teamsTask} onClose={() => setIsTeamsModalOpen(false)} />}
      {isSettingsModalOpen && (
        <SettingsModal
          sprintDuration={activeProject?.settings.sprintDuration ?? 3}
          projectStartDate={activeProject?.settings.projectStartDate ?? new Date().toISOString().split('T')[0]}
          isLocalPersistenceEnabled={settings?.isLocalPersistenceEnabled !== false}
          isAIEnabled={settings?.isAIEnabled !== false}
          currentTheme={settings?.theme || 'classic'}
          isDarkMode={settings?.isDarkMode || false}
          currentUiStyle={settings?.uiStyle || 'classic'}
          onChangeUiStyle={handleSetUiStyle}
          onSave={handleSaveSettings} onClose={() => setIsSettingsModalOpen(false)} onResetData={handleResetData}
        />
      )}
      {isAboutModalOpen && <AboutModal onClose={() => setIsAboutModalOpen(false)} />}
      {isCloudModalOpen && workspace && (
        <CloudSyncModal
          workspace={workspace}
          onReplaceWorkspace={(updater) => setWorkspace(prev => (prev ? updater(prev) : prev))}
          onClose={() => setIsCloudModalOpen(false)}
        />
      )}
      {viewingPersonId && workspace && isModern && (
        <PersonProfileSheet
          key={viewingPersonId}
          workspace={workspace}
          personId={viewingPersonId}
          canEditLeave={canEditPool(identity)}
          onSetLeave={handleSetLeave}
          onOpenProject={(projectId: string) => handleOpenProject(projectId)}
          onClose={() => setViewingPersonId(null)}
        />
      )}
      {viewingPersonId && workspace && !isModern && (
        <PersonDetailModal
          workspace={workspace}
          personId={viewingPersonId}
          canEditLeave={canEditPool(identity)}
          onSetLeave={handleSetLeave}
          onClose={() => setViewingPersonId(null)}
        />
      )}
      {isHealthModalOpen && canDataHealth && workspace && isModern && (
        <DataHealthSheet workspace={workspace} onApplyFix={handleApplyHealthFix} onClose={() => setIsHealthModalOpen(false)} />
      )}
      {isHealthModalOpen && canDataHealth && workspace && !isModern && (
        <DataHealthModal
          workspace={workspace}
          onApplyFix={handleApplyHealthFix}
          onClose={() => setIsHealthModalOpen(false)}
        />
      )}
      {isAuditModalOpen && canAudit && workspace && isModern && (
        <AuditLogSheet workspace={workspace} onClose={() => setIsAuditModalOpen(false)} />
      )}
      {isAuditModalOpen && canAudit && workspace && !isModern && (
        <AuditLogModal
          workspace={workspace}
          onClose={() => setIsAuditModalOpen(false)}
        />
      )}
      {isProfileOpen && workspace && (() => {
        const sheet = <ProfileSwitcherSheet workspace={workspace} onSelect={handleChangeIdentity} onClose={() => setIsProfileOpen(false)} />;
        // Klasik arayüzde modern pencere kendi stil kabında açılır
        return isModern ? sheet : <div className="ui-modern">{sheet}</div>;
      })()}
      {isPaletteOpen && (
        <AssistantCommandPalette items={commandItems} onClose={() => setIsPaletteOpen(false)} modern={isModern} />
      )}
      {isModern ? (
        <ModernAssistantPanel
          suggestions={aiSuggestions}
          hidden={currentView === View.AI && !!activeProject}
          onExpand={activeProject ? () => setCurrentView(View.AI) : undefined}
        />
      ) : (
        <AssistantPanel
          suggestions={aiSuggestions}
          hidden={currentView === View.AI && !!activeProject}
          onExpand={activeProject ? () => setCurrentView(View.AI) : undefined}
        />
      )}
      {egg?.kind === 'hyper' && <HyperdriveOverlay onDone={() => setEgg(null)} />}
      {egg?.kind === 'space' && <SpaceMode onDone={() => setEgg(null)} />}
      {egg?.kind === 'celebrate' && <Celebration message={egg.message} onDone={() => setEgg(null)} />}
      {undo && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[250] flex items-center gap-3 bg-gray-900 dark:bg-gray-800 text-white rounded-xl shadow-2xl px-4 py-2.5 border border-gray-700">
          <i className="fa-solid fa-trash-can text-gray-400 text-xs"></i>
          <span className="text-xs font-semibold">{undo.message}</span>
          <button onClick={handleUndo} className="text-xs font-bold px-2.5 py-1 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: 'var(--app-primary)' }}>
            <i className="fa-solid fa-rotate-left mr-1"></i>Geri Al
          </button>
          <button onClick={() => setUndo(null)} className="text-gray-400 hover:text-white transition-colors" title="Kapat"><i className="fa-solid fa-xmark text-xs"></i></button>
        </div>
      )}
      {isStatusReportOpen && workspace && activeProject && isModern && (
        <StatusReportSheet workspace={workspace} projectId={activeProject.id} onClose={() => setIsStatusReportOpen(false)} />
      )}
      {isStatusReportOpen && workspace && activeProject && !isModern && (
        <StatusReportModal
          workspace={workspace}
          projectId={activeProject.id}
          onClose={() => setIsStatusReportOpen(false)}
        />
      )}
    </div>
    </AssistantProvider>
  );
};

export default App;
