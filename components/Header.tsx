
import React, { useRef, useState } from 'react';
import { View, RagStatus, UserRole } from '../types';
import { ROLE_LABELS } from '../utils/allocations';
import { TodoItem, todoBadgeCount } from '../utils/todoItems';

export interface HeaderProjectSummary {
  id: string;
  name: string;
  rag?: RagStatus;
}

export interface HeaderPersonSummary {
  id: string;
  name: string;
  initials: string;
  departmentCode: string;
}

interface HeaderProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  onOpenGuide: () => void;
  onOpenSettings: () => void;
  /** Yedek al / yükle (yalnız app.backup yetkisiyle verilir) */
  onSaveProject?: () => void;
  onLoadProject?: (file: File) => void;
  isLocalPersistenceEnabled?: boolean;
  isAIEnabled?: boolean;
  onOpenAbout?: () => void;
  projects: HeaderProjectSummary[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  currentRole: UserRole;
  currentPersonId?: string;
  people: HeaderPersonSummary[];
  identityNeedsPerson: boolean;
  /** Profil değiştirme penceresi */
  onOpenProfile: () => void;
  /** Yönetim ekranı yetkisi / PY'ye özel sekmeleri (Günlük, İstekler) gizle */
  canExecutive: boolean;
  hidePrivate: boolean;
  cloudLinked: boolean;
  onOpenCloudSync: () => void;
  todoItems: TodoItem[];
  onTodoNavigate: (item: TodoItem) => void;
  onOpenStatusReport: () => void;
  dataHealthAlerts: number;
  /** Veri sağlığı ve denetim günlüğü (yalnız ilgili app.* yetkisiyle verilir) */
  onOpenDataHealth?: () => void;
  onOpenAuditLog?: () => void;
  onOpenCommandPalette: () => void;
  onOpenWorkPackages: () => void;
}

const TODO_SEVERITY: Record<TodoItem['severity'], { dot: string; text: string }> = {
  danger: { dot: '#ef4444', text: 'text-red-600 dark:text-red-300' },
  warn: { dot: '#f59e0b', text: 'text-amber-600 dark:text-amber-300' },
  info: { dot: '#9ca3af', text: 'text-gray-500 dark:text-gray-400' },
};

const TodoBell: React.FC<{ items: TodoItem[]; onNavigate: (item: TodoItem) => void }> = ({ items, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const badge = todoBadgeCount(items);
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors relative"
        title="Yapılacaklar ve hatırlatıcılar"
      >
        <i aria-hidden="true" className="fa-solid fa-bell text-[13px] text-gray-400"></i>
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-white dark:border-gray-700">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-full right-0 mt-1.5 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 py-1.5 max-h-[70vh] overflow-y-auto">
            <div className="px-3.5 pt-1.5 pb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-300">Yapılacaklar</p>
              <span className="text-[11px] text-gray-400">{items.length} kalem</span>
            </div>
            {items.length === 0 ? (
              <div className="px-3.5 py-6 text-center">
                <i aria-hidden="true" className="fa-solid fa-circle-check text-emerald-400 text-2xl mb-2"></i>
                <p className="text-xs text-gray-400">Bekleyen bir iş yok. Temiz!</p>
              </div>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item); setIsOpen(false); }}
                  className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-t border-gray-50 dark:border-gray-700/60 first:border-t-0"
                >
                  <span className="mt-1 w-2 h-2 rounded-full flex-none" style={{ backgroundColor: TODO_SEVERITY[item.severity].dot }}></span>
                  <i aria-hidden="true" className={`fa-solid ${item.icon} text-[11px] mt-0.5 flex-none ${TODO_SEVERITY[item.severity].text}`}></i>
                  <span className="text-xs text-gray-700 dark:text-gray-200 leading-snug">{item.text}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

/** Proje bağlamında çalışan görünümler — ikinci navigasyon katmanı bunları taşır */
export const PROJECT_VIEWS: View[] = [View.Kanban, View.Roadmap, View.Goals, View.Tasks, View.Requests, View.Resources, View.Notes, View.AI];

const RAG_DOT: Record<RagStatus, string> = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' };

const ROLE_ICONS: Record<UserRole, string> = {
  mudur: 'fa-user-tie',
  pyb_sorumlu: 'fa-diagram-project',
  pyb_destek: 'fa-database',
  py: 'fa-user-gear',
  bolum_sorumlu: 'fa-people-group',
  admin: 'fa-user-lock',
};

// ---------------------------------------------------------------------------
// Üst katman: çalışma alanı sekmeleri
// ---------------------------------------------------------------------------

const WorkspaceNavItem: React.FC<{
  view: View;
  currentView: View;
  setCurrentView: (view: View) => void;
  icon: string;
  label: string;
}> = ({ view, currentView, setCurrentView, icon, label }) => {
  const active = currentView === view;
  return (
    <button
      onClick={() => setCurrentView(view)}
      title={label}
      aria-label={label}
      className={`flex items-center gap-2 px-3 xl:px-3.5 h-9 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
        active
          ? 'text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60'
      }`}
      style={active ? { backgroundColor: 'var(--app-primary)' } : {}}
    >
      <i aria-hidden="true" className={`fa-solid ${icon} text-[11px] ${active ? 'text-white' : ''}`} style={!active ? { color: 'var(--app-primary)', opacity: 0.75 } : {}}></i>
      {/* Dar masaüstünde yalnız ikon (menü taşmasın) */}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
};

// ---------------------------------------------------------------------------
// İkinci katman: proje bağlam çubuğu (eski uygulama ekranları burada yaşar)
// ---------------------------------------------------------------------------

const ProjectTab: React.FC<{
  view: View;
  currentView: View;
  setCurrentView: (view: View) => void;
  icon: string;
  label: string;
}> = ({ view, currentView, setCurrentView, icon, label }) => {
  const active = currentView === view;
  return (
    <button
      onClick={() => setCurrentView(view)}
      className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
        active
          ? 'border-current bg-white dark:bg-gray-800 shadow-sm'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-800/60'
      }`}
      style={active ? { color: 'var(--app-primary)' } : {}}
    >
      <i aria-hidden="true" className={`fa-solid ${icon} text-[10px]`}></i>
      <span>{label}</span>
    </button>
  );
};

const ProjectSwitcher: React.FC<{
  projects: HeaderProjectSummary[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onGoPortfolio: () => void;
}> = ({ projects, activeProjectId, onSelectProject, onGoPortfolio }) => {
  const [isOpen, setIsOpen] = useState(false);
  const active = projects.find(p => p.id === activeProjectId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-md hover:bg-white dark:hover:bg-gray-800 transition-colors max-w-[260px] group"
        title="Proje değiştir"
      >
        <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: active?.rag ? RAG_DOT[active.rag] : '#cbd5e1' }}></span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
          {active ? active.name : 'Proje seç'}
        </span>
        <i aria-hidden="true" className={`fa-solid fa-chevron-down text-[9px] text-gray-400 flex-none transition-transform group-hover:text-gray-600 ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-full left-0 mt-1.5 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 py-1.5 max-h-[60vh] overflow-y-auto">
            <p className="px-3.5 pt-1.5 pb-1 text-[11px] font-medium text-gray-400">Projeler</p>
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelectProject(p.id); setIsOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                style={p.id === activeProjectId ? { backgroundColor: 'var(--app-accent-light)' } : {}}
              >
                <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: p.rag ? RAG_DOT[p.rag] : '#cbd5e1' }}></span>
                <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{p.name}</span>
                {p.id === activeProjectId && <i aria-hidden="true" className="fa-solid fa-check text-[10px] ml-auto flex-none" style={{ color: 'var(--app-primary)' }}></i>}
              </button>
            ))}
            <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
              <button
                onClick={() => { onGoPortfolio(); setIsOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium"
                style={{ color: 'var(--app-primary)' }}
              >
                <i aria-hidden="true" className="fa-solid fa-table-cells-large text-[11px]"></i>
                <span>Tüm projeler & yeni proje</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const SCOPED_ROLES: UserRole[] = ['py', 'bolum_sorumlu'];

/** Profil düğmesi: seçim "Profil değiştir" penceresinde yapılır */
const IdentitySwitcher: React.FC<{
  currentRole: UserRole;
  currentPersonId?: string;
  people: HeaderPersonSummary[];
  needsPerson: boolean;
  cloudLinked?: boolean;
  onOpenProfile: () => void;
}> = ({ currentRole, currentPersonId, people, needsPerson, cloudLinked, onOpenProfile }) => {
  const activePerson = people.find(p => p.id === currentPersonId);
  const scoped = SCOPED_ROLES.includes(currentRole);
  return (
    <button
      onClick={onOpenProfile}
      className={`h-10 flex items-center gap-2 px-3 bg-white dark:bg-gray-700 rounded-lg border transition-colors ${needsPerson ? 'border-amber-400 text-amber-600' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'}`}
      title={cloudLinked ? 'Bulut hesabı' : 'Profil değiştir'}
      aria-haspopup="dialog"
    >
      <i aria-hidden="true" className={`fa-solid ${ROLE_ICONS[currentRole]} text-[11px]`} style={{ color: 'var(--app-primary)' }}></i>
      <span className="hidden xl:flex flex-col items-start leading-none">
        <span className="text-xs font-medium">{ROLE_LABELS[currentRole]}</span>
        {(scoped || activePerson) && <span className="text-[9px] text-gray-400 mt-0.5">{activePerson ? `${activePerson.name}` : 'kişi seçilmedi'}</span>}
      </span>
      {needsPerson && <i aria-hidden="true" className="fa-solid fa-triangle-exclamation text-[10px] text-amber-500"></i>}
      <i aria-hidden="true" className="fa-solid fa-arrow-right-arrow-left text-[9px] text-gray-400"></i>
    </button>
  );
};

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onOpenGuide, onOpenSettings, onSaveProject, onLoadProject, isAIEnabled = true, onOpenAbout, projects, activeProjectId, onSelectProject, currentRole, currentPersonId, people, identityNeedsPerson, onOpenProfile, canExecutive, hidePrivate, cloudLinked, onOpenCloudSync, todoItems, onTodoNavigate, onOpenStatusReport, dataHealthAlerts, onOpenDataHealth, onOpenAuditLog, onOpenCommandPalette, onOpenWorkPackages }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showProjectBar = !!activeProjectId;

  return (
    <header className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      {/* ---- Üst satır: logo · çalışma alanı sekmeleri · genel eylemler ---- */}
      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-3">

          <button
            type="button"
            className="flex items-center group flex-none text-left rounded-xl"
            onClick={onOpenGuide}
            aria-label="Kullanım kılavuzu için tıklayın"
            aria-haspopup="dialog"
            title="Kullanım kılavuzu için tıklayın"
          >
            <span className="w-11 h-11 rounded-xl shadow-lg flex items-center justify-center" style={{ backgroundColor: 'var(--app-primary)' }}>
              <i aria-hidden="true" className="fa-solid fa-rocket text-white text-xl motion-safe:transition-transform motion-safe:group-hover:-rotate-12"></i>
            </span>
            <span className="ml-3.5 hidden sm:flex flex-col justify-center">
              <span className="text-lg font-bold tracking-tight leading-none text-gray-800 dark:text-white">
                Plan<span style={{ color: 'var(--app-primary)' }}>Asistan</span>
              </span>
              <span className="text-[10px] font-medium tracking-[0.3em] leading-none mt-1 text-gray-400">MKS</span>
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1 bg-gray-100/60 dark:bg-gray-900/40 p-1 rounded-xl border border-gray-200/60 dark:border-gray-700/60">
            {canExecutive && <WorkspaceNavItem view={View.Executive} currentView={currentView} setCurrentView={setCurrentView} icon="fa-gauge-high" label="Yönetim" />}
            <WorkspaceNavItem view={View.Portfolio} currentView={currentView} setCurrentView={setCurrentView} icon="fa-table-cells-large" label="Portföy" />
            <WorkspaceNavItem view={View.Allocations} currentView={currentView} setCurrentView={setCurrentView} icon="fa-people-arrows" label="Tahsis" />
            <WorkspaceNavItem view={View.Calendar} currentView={currentView} setCurrentView={setCurrentView} icon="fa-calendar-days" label="Takvim" />
            <WorkspaceNavItem view={View.RiskReport} currentView={currentView} setCurrentView={setCurrentView} icon="fa-shield-halved" label="Riskler" />
            <WorkspaceNavItem view={View.WeeklyReport} currentView={currentView} setCurrentView={setCurrentView} icon="fa-file-lines" label="Haftalık Rapor" />
            <WorkspaceNavItem view={View.Meetings} currentView={currentView} setCurrentView={setCurrentView} icon="fa-handshake" label="Görüşmeler" />
            <WorkspaceNavItem view={View.Expectations} currentView={currentView} setCurrentView={setCurrentView} icon="fa-flag" label="Beklentiler" />
            <WorkspaceNavItem view={View.DataPool} currentView={currentView} setCurrentView={setCurrentView} icon="fa-database" label="Veri Havuzu" />
          </nav>

          <div className="flex items-center gap-1.5 flex-none">
            <TodoBell items={todoItems} onNavigate={onTodoNavigate} />
            <button
              onClick={onOpenCloudSync}
              className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors relative"
              title={cloudLinked ? 'Bulut veritabanı bağlı' : 'Bulut veritabanı (Supabase)'}
            >
              <i aria-hidden="true" className="fa-solid fa-cloud text-[13px]" style={cloudLinked ? { color: 'var(--app-primary)' } : { color: '#9ca3af' }}></i>
              {cloudLinked && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 border border-white dark:border-gray-700"></span>}
            </button>
            <IdentitySwitcher currentRole={currentRole} currentPersonId={currentPersonId} people={people} needsPerson={identityNeedsPerson} cloudLinked={cloudLinked} onOpenProfile={onOpenProfile} />
            {onSaveProject && onLoadProject && <div className="hidden sm:flex items-center bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLoadProject(file);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }} />
              <button aria-label="Yedek indir (JSON)" onClick={onSaveProject} className="w-10 h-10 text-gray-400 hover:text-primary transition-colors" title="Yedek indir (JSON)">
                <i aria-hidden="true" className="fa-solid fa-download text-xs"></i>
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-600"></div>
              <button aria-label="Yedek yükle" onClick={() => fileInputRef.current?.click()} className="w-10 h-10 text-gray-400 hover:text-primary transition-colors" title="Yedek yükle">
                <i aria-hidden="true" className="fa-solid fa-upload text-xs"></i>
              </button>
            </div>}
            {/* Yerel modda yedek yalnız Yönetici yetkisiyle: düğme gizlenmesin, yolu göstersin */}
            {!onSaveProject && !onLoadProject && !cloudLinked && (
              <button aria-label="Yedek al / yükle: Admin kimliğiyle" onClick={onOpenProfile} className="hidden sm:flex w-10 h-10 items-center justify-center bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-300 hover:text-primary transition-colors" title="Yedek al / yükle Admin yetkisi ister — kimlik değiştirmek için tıklayın">
                <i aria-hidden="true" className="fa-solid fa-upload text-xs"></i>
              </button>
            )}
            <button onClick={onOpenCommandPalette} className="hidden md:flex items-center gap-2 h-10 px-3 bg-white dark:bg-gray-700 text-gray-400 rounded-lg border border-gray-200 dark:border-gray-600 hover:text-primary transition-colors" title="Hızlı git — projeye, kişiye ya da ekrana (⌘K / Ctrl+K)">
              <i aria-hidden="true" className="fa-solid fa-magnifying-glass text-[13px]"></i>
              <kbd className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400">⌘K</kbd>
            </button>
            {onOpenDataHealth && <button onClick={onOpenDataHealth} className="relative w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-400 rounded-lg border border-gray-200 dark:border-gray-600 hover:text-primary transition-colors" title="Veri sağlığı denetimi (yetim tahsis, eşleşmeyen atama, mükerrer, eksik alan)">
              <i aria-hidden="true" className="fa-solid fa-stethoscope text-[13px]"></i>
              {dataHealthAlerts > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {dataHealthAlerts > 99 ? '99+' : dataHealthAlerts}
                </span>
              )}
            </button>}
            {onOpenAuditLog && <button aria-label="Denetim günlüğü (kritik aksiyonların kaydı)" onClick={onOpenAuditLog} className="w-10 h-10 hidden md:flex items-center justify-center bg-white dark:bg-gray-700 text-gray-400 rounded-lg border border-gray-200 dark:border-gray-600 hover:text-primary transition-colors" title="Denetim günlüğü (kritik aksiyonların kaydı)">
              <i aria-hidden="true" className="fa-solid fa-clock-rotate-left text-[13px]"></i>
            </button>}
            <button aria-label="Ayarlar" onClick={onOpenSettings} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-400 rounded-lg border border-gray-200 dark:border-gray-600 hover:text-primary transition-colors" title="Ayarlar">
              <i aria-hidden="true" className="fa-solid fa-sliders text-[13px]"></i>
            </button>
            <button aria-label="Hakkında" onClick={onOpenAbout} className="w-10 h-10 hidden lg:flex items-center justify-center bg-white dark:bg-gray-700 text-gray-400 rounded-lg border border-gray-200 dark:border-gray-600 hover:text-primary transition-colors" title="Hakkında">
              <i aria-hidden="true" className="fa-solid fa-circle-info text-[13px]"></i>
            </button>
          </div>
        </div>
      </div>

      {/* ---- İkinci satır: proje bağlam çubuğu (proje seçiliyken) ---- */}
      {showProjectBar && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-900/40">
          <div className="container mx-auto px-4 lg:px-6 h-11 flex items-center gap-2">
            <ProjectSwitcher
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={onSelectProject}
              onGoPortfolio={() => setCurrentView(View.Portfolio)}
            />
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-none"></div>
            <nav className="flex items-center gap-0.5 overflow-x-auto">
              <ProjectTab view={View.Kanban} currentView={currentView} setCurrentView={setCurrentView} icon="fa-columns" label="Pano" />
              <ProjectTab view={View.Roadmap} currentView={currentView} setCurrentView={setCurrentView} icon="fa-map" label="Yol Haritası" />
              <ProjectTab view={View.Goals} currentView={currentView} setCurrentView={setCurrentView} icon="fa-bullseye" label="Hedefler" />
              <ProjectTab view={View.Tasks} currentView={currentView} setCurrentView={setCurrentView} icon="fa-list-check" label="Görevler" />
              <ProjectTab view={View.Risks} currentView={currentView} setCurrentView={setCurrentView} icon="fa-shield-halved" label="Riskler" />
              <ProjectTab view={View.Resources} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-gear" label="Ekip" />
              {!hidePrivate && (
                <>
                  <ProjectTab view={View.Requests} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-viewfinder" label="İstekler" />
                  <ProjectTab view={View.Notes} currentView={currentView} setCurrentView={setCurrentView} icon="fa-pen-nib" label="Günlük" />
                </>
              )}
              {isAIEnabled && <ProjectTab view={View.AI} currentView={currentView} setCurrentView={setCurrentView} icon="fa-wand-magic-sparkles" label="Zekâ" />}
            </nav>
            <button
              onClick={onOpenWorkPackages}
              className="ml-auto flex-none flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-white dark:hover:bg-gray-800 transition-colors"
              title="İş paketleri — görev/kişi bağı"
            >
              <i aria-hidden="true" className="fa-solid fa-briefcase text-[11px]"></i>
              <span className="hidden lg:inline">İş Paketleri</span>
            </button>
            <button
              onClick={onOpenStatusReport}
              className="flex-none flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-primary hover:bg-white dark:hover:bg-gray-800 transition-colors"
              title="Bu projenin haftalık durum raporu taslağını üret"
            >
              <i aria-hidden="true" className="fa-solid fa-file-lines text-[11px]"></i>
              <span className="hidden lg:inline">Durum Raporu</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
