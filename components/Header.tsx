
import React, { useRef, useState } from 'react';
import { View, RagStatus, UserRole } from '../types';
import { ROLE_LABELS } from '../utils/allocations';
import { isExecRole } from '../utils/execReport';

export interface HeaderProjectSummary {
  id: string;
  name: string;
  rag?: RagStatus;
}

interface HeaderProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  onOpenSettings: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  isLocalPersistenceEnabled?: boolean;
  isAIEnabled?: boolean;
  onOpenAbout?: () => void;
  projects: HeaderProjectSummary[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  currentRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  cloudLinked: boolean;
  onOpenCloudSync: () => void;
}

/** Proje bağlamında çalışan görünümler — ikinci navigasyon katmanı bunları taşır */
export const PROJECT_VIEWS: View[] = [View.Kanban, View.Roadmap, View.Goals, View.Tasks, View.Requests, View.Resources, View.Notes, View.AI];

const RAG_DOT: Record<RagStatus, string> = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' };

const ROLE_ICONS: Record<UserRole, string> = {
  mudur: 'fa-user-tie',
  pyb_sorumlu: 'fa-diagram-project',
  pyb_destek: 'fa-database',
  py: 'fa-user-gear',
  bolum_sorumlu: 'fa-people-group',
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
      className={`flex items-center gap-2 px-3.5 h-9 rounded-lg text-xs font-semibold transition-colors ${
        active
          ? 'text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60'
      }`}
      style={active ? { backgroundColor: 'var(--app-primary)' } : {}}
    >
      <i className={`fa-solid ${icon} text-[11px] ${active ? 'text-white' : ''}`} style={!active ? { color: 'var(--app-primary)', opacity: 0.75 } : {}}></i>
      <span>{label}</span>
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
      <i className={`fa-solid ${icon} text-[10px]`}></i>
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
        <i className={`fa-solid fa-chevron-down text-[9px] text-gray-400 flex-none transition-transform group-hover:text-gray-600 ${isOpen ? 'rotate-180' : ''}`}></i>
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
                {p.id === activeProjectId && <i className="fa-solid fa-check text-[10px] ml-auto flex-none" style={{ color: 'var(--app-primary)' }}></i>}
              </button>
            ))}
            <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
              <button
                onClick={() => { onGoPortfolio(); setIsOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium"
                style={{ color: 'var(--app-primary)' }}
              >
                <i className="fa-solid fa-table-cells-large text-[11px]"></i>
                <span>Tüm projeler & yeni proje</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const RoleSwitcher: React.FC<{ currentRole: UserRole; onChangeRole: (r: UserRole) => void }> = ({ currentRole, onChangeRole }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-10 flex items-center gap-2 px-3 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
        title="Rol değiştir (RBAC önizleme)"
      >
        <i className={`fa-solid ${ROLE_ICONS[currentRole]} text-[11px]`} style={{ color: 'var(--app-primary)' }}></i>
        <span className="hidden xl:inline text-xs font-medium">{ROLE_LABELS[currentRole]}</span>
        <i className={`fa-solid fa-chevron-down text-[9px] text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-full right-0 mt-1.5 w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 py-1.5">
            <p className="px-3.5 pt-1.5 pb-1 text-[11px] font-medium text-gray-400">Rol (görünüm)</p>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
              <button
                key={r}
                onClick={() => { onChangeRole(r); setIsOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                style={r === currentRole ? { backgroundColor: 'var(--app-accent-light)' } : {}}
              >
                <i className={`fa-solid ${ROLE_ICONS[r]} text-[11px] w-4`} style={{ color: 'var(--app-primary)' }}></i>
                <span className="text-sm text-gray-700 dark:text-gray-200">{ROLE_LABELS[r]}</span>
                {r === currentRole && <i className="fa-solid fa-check text-[10px] ml-auto" style={{ color: 'var(--app-primary)' }}></i>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onOpenSettings, onSaveProject, onLoadProject, isAIEnabled = true, onOpenAbout, projects, activeProjectId, onSelectProject, currentRole, onChangeRole, cloudLinked, onOpenCloudSync }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Roket animasyonu (korunuyor — uygulamanın imzası)
  const [status, setStatus] = useState<'idle' | 'igniting' | 'launching'>('idle');
  const [showVFX, setShowVFX] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const exec = isExecRole(currentRole);
  const showProjectBar = !!activeProjectId;

  const handleLaunch = () => {
    if (status !== 'idle') return;
    setStatus('igniting');
    setTimeout(() => {
      setStatus('launching');
      setShowVFX(true);
      setIsShaking(true);
      setTimeout(() => {
        setCurrentView(activeProjectId ? View.Kanban : View.Portfolio);
        setStatus('idle');
        setShowVFX(false);
        setIsShaking(false);
      }, 1400);
    }, 1000);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (status !== 'idle') return;
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({ x: (e.clientX - rect.left - rect.width / 2) / 10, y: (e.clientY - rect.top - rect.height / 2) / 10 });
  };

  return (
    <header className={`bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-300 ${isShaking ? '[animation:hyper-screen-shake_0.4s_ease-in-out]' : ''}`}>

      {/* FULL SCREEN VFX LAYER */}
      {showVFX && (
        <div className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 bg-white [animation:hyper-flash_0.7s_ease-out_forwards] z-10"></div>
          <div className="absolute w-20 h-20 border-primary rounded-full [animation:hyper-shockwave_1.2s_cubic-bezier(0.22,1,0.36,1)_forwards]" style={{ borderColor: 'var(--app-primary)' }}></div>
          {[...Array(60)].map((_, i) => (
            <div
              key={i}
              className="absolute w-[2px] h-[120px] bg-white opacity-50 rounded-full"
              style={{
                animation: `star-fly 0.9s cubic-bezier(0.4, 0, 1, 1) forwards`,
                '--tx': `${Math.random() * 2500 - 1250}px`,
                '--ty': `${Math.random() * 2500 - 1250}px`,
                animationDelay: `${Math.random() * 0.4}s`,
              } as React.CSSProperties}
            ></div>
          ))}
        </div>
      )}

      {/* ---- Üst satır: logo · çalışma alanı sekmeleri · genel eylemler ---- */}
      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-16 gap-3">

          <div
            className="flex items-center group cursor-pointer select-none relative flex-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePos({ x: 0, y: 0 })}
            onClick={handleLaunch}
          >
            <div
              className="relative"
              style={{ transform: status === 'idle' ? `translate(${mousePos.x}px, ${mousePos.y}px)` : undefined, transition: 'transform 0.1s ease-out' }}
            >
              <div className={`absolute -inset-6 bg-primary rounded-full blur-[32px] transition-all duration-700 ${status === 'igniting' ? 'opacity-100 scale-150 animate-pulse' : 'opacity-10 group-hover:opacity-30'}`} style={{ backgroundColor: 'var(--app-primary)' }}></div>
              <div
                className={`relative w-11 h-11 bg-primary rounded-xl shadow-lg z-10 flex items-center justify-center overflow-visible transition-all duration-300
                  ${status === 'igniting' ? '[animation:hyper-rumble_0.2s_infinite]' : 'group-hover:scale-105'}`}
                style={{ backgroundColor: 'var(--app-primary)', boxShadow: `0 12px 24px -8px var(--app-ring), inset 0 2px 4px rgba(255,255,255,0.4)` }}
              >
                <div className={`relative flex items-center justify-center transition-all duration-200 ${status === 'launching' ? '[animation:hyper-launch_0.8s_cubic-bezier(0.6,0,1,1)_forwards]' : ''}`}>
                  <i className={`fa-solid fa-rocket text-white text-xl drop-shadow-lg transition-transform duration-700 ${status === 'idle' ? 'rotate-0' : 'rotate-[-45deg]'}`}></i>
                  {status !== 'idle' && (
                    <div className="absolute top-[80%] left-1/2 -translate-x-1/2 flex flex-col items-center">
                      <div className="absolute top-0 w-6 h-6 bg-white blur-md rounded-full animate-pulse"></div>
                      <div
                        className={`absolute top-0 w-14 bg-gradient-to-b from-white via-primary to-transparent rounded-b-full ${status === 'launching' ? '[animation:hyper-exhaust_0.8s_ease-out_forwards]' : 'h-24 opacity-100'}`}
                        style={{ '--tw-gradient-via': 'var(--app-accent)' } as React.CSSProperties}
                      ></div>
                      <div className="w-1 h-48 bg-gradient-to-b from-white to-transparent opacity-60 rounded-full"></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="ml-3.5 hidden sm:flex flex-col justify-center">
              <h1 className="text-lg font-bold tracking-tight leading-none text-gray-800 dark:text-white">
                Plan<span style={{ color: 'var(--app-primary)' }}>Asistan</span>
              </h1>
              <span className={`text-[10px] font-medium tracking-[0.3em] leading-none mt-1 transition-colors ${status !== 'idle' ? '' : 'text-gray-400'}`} style={status !== 'idle' ? { color: 'var(--app-primary)' } : {}}>
                {status === 'igniting' ? 'ATEŞLENİYOR…' : status === 'launching' ? 'MAKS HIZ' : 'MKS'}
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-gray-100/60 dark:bg-gray-900/40 p-1 rounded-xl border border-gray-200/60 dark:border-gray-700/60">
            {exec && <WorkspaceNavItem view={View.Executive} currentView={currentView} setCurrentView={setCurrentView} icon="fa-gauge-high" label="Yönetim" />}
            <WorkspaceNavItem view={View.Portfolio} currentView={currentView} setCurrentView={setCurrentView} icon="fa-table-cells-large" label="Portföy" />
            <WorkspaceNavItem view={View.Allocations} currentView={currentView} setCurrentView={setCurrentView} icon="fa-people-arrows" label="Tahsis" />
            <WorkspaceNavItem view={View.DataPool} currentView={currentView} setCurrentView={setCurrentView} icon="fa-database" label="Veri Havuzu" />
          </nav>

          <div className="flex items-center gap-1.5 flex-none">
            <button
              onClick={onOpenCloudSync}
              className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors relative"
              title={cloudLinked ? 'Bulut senkronizasyonu bağlı' : 'Bulut senkronizasyonu (Supabase)'}
            >
              <i className="fa-solid fa-cloud text-[13px]" style={cloudLinked ? { color: 'var(--app-primary)' } : { color: '#9ca3af' }}></i>
              {cloudLinked && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 border border-white dark:border-gray-700"></span>}
            </button>
            <RoleSwitcher currentRole={currentRole} onChangeRole={onChangeRole} />
            <div className="hidden sm:flex items-center bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
              <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLoadProject(file);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }} />
              <button onClick={onSaveProject} className="w-10 h-10 text-gray-400 hover:text-primary transition-colors" title="Yedek indir (JSON)">
                <i className="fa-solid fa-download text-xs"></i>
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-600"></div>
              <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 text-gray-400 hover:text-primary transition-colors" title="Yedek yükle">
                <i className="fa-solid fa-upload text-xs"></i>
              </button>
            </div>
            <button onClick={onOpenSettings} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-400 rounded-lg border border-gray-200 dark:border-gray-600 hover:text-primary transition-colors" title="Ayarlar">
              <i className="fa-solid fa-sliders text-[13px]"></i>
            </button>
            <button onClick={onOpenAbout} className="w-10 h-10 hidden lg:flex items-center justify-center bg-white dark:bg-gray-700 text-gray-400 rounded-lg border border-gray-200 dark:border-gray-600 hover:text-primary transition-colors" title="Hakkında">
              <i className="fa-solid fa-circle-info text-[13px]"></i>
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
              <ProjectTab view={View.Resources} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-gear" label="Ekip" />
              {!exec && (
                <>
                  <ProjectTab view={View.Requests} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-viewfinder" label="İstekler" />
                  <ProjectTab view={View.Notes} currentView={currentView} setCurrentView={setCurrentView} icon="fa-pen-nib" label="Günlük" />
                  {isAIEnabled && <ProjectTab view={View.AI} currentView={currentView} setCurrentView={setCurrentView} icon="fa-wand-magic-sparkles" label="Zekâ" />}
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
