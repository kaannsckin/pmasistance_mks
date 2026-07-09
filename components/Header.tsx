
import React, { useRef, useState, useEffect } from 'react';
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

const ROLE_ICONS: Record<UserRole, string> = {
  mudur: 'fa-user-tie',
  pyb_sorumlu: 'fa-diagram-project',
  pyb_destek: 'fa-database',
  py: 'fa-user-gear',
  bolum_sorumlu: 'fa-people-group',
};

const RoleSwitcher: React.FC<{ currentRole: UserRole; onChangeRole: (r: UserRole) => void }> = ({ currentRole, onChangeRole }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-11 flex items-center space-x-2 px-3 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 hover:text-primary transition-all"
        title="Rol değiştir (RBAC önizleme)"
      >
        <i className={`fa-solid ${ROLE_ICONS[currentRole]}`} style={{ color: 'var(--app-primary)' }}></i>
        <span className="hidden xl:inline text-[9px] font-black uppercase tracking-widest">{ROLE_LABELS[currentRole]}</span>
        <i className={`fa-solid fa-chevron-down text-[8px] transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-2xl z-50 py-2">
            <p className="px-4 py-1 text-[8px] font-black text-gray-400 uppercase tracking-widest">Rol Seç (Görünüm)</p>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
              <button
                key={r}
                onClick={() => { onChangeRole(r); setIsOpen(false); }}
                className={`w-full flex items-center space-x-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors`}
                style={r === currentRole ? { backgroundColor: 'var(--app-accent-light)' } : {}}
              >
                <i className={`fa-solid ${ROLE_ICONS[r]} text-[10px] w-4`} style={{ color: 'var(--app-primary)' }}></i>
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">{ROLE_LABELS[r]}</span>
                {r === currentRole && <i className="fa-solid fa-check text-[9px] ml-auto" style={{ color: 'var(--app-primary)' }}></i>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const RAG_DOT: Record<RagStatus, string> = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' };

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
        className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 hover:border-primary/40 transition-all max-w-[200px]"
        title="Proje değiştir"
      >
        {active?.rag && <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: RAG_DOT[active.rag] }}></span>}
        <i className="fa-solid fa-folder-open text-[10px] flex-none" style={{ color: 'var(--app-primary)' }}></i>
        <span className="text-[10px] font-black uppercase tracking-tight text-gray-700 dark:text-gray-200 truncate">
          {active ? active.name : 'Proje Seç'}
        </span>
        <i className={`fa-solid fa-chevron-down text-[8px] text-gray-400 flex-none transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-2xl z-50 py-2 max-h-[60vh] overflow-y-auto">
            <p className="px-4 py-1 text-[8px] font-black text-gray-400 uppercase tracking-widest">Projeler</p>
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelectProject(p.id); setIsOpen(false); }}
                className={`w-full flex items-center space-x-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${p.id === activeProjectId ? 'bg-accent/40' : ''}`}
                style={p.id === activeProjectId ? { backgroundColor: 'var(--app-accent-light)' } : {}}
              >
                <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: p.rag ? RAG_DOT[p.rag] : '#cbd5e1' }}></span>
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 truncate">{p.name}</span>
                {p.id === activeProjectId && <i className="fa-solid fa-check text-[9px] ml-auto flex-none" style={{ color: 'var(--app-primary)' }}></i>}
              </button>
            ))}
            <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
              <button
                onClick={() => { onGoPortfolio(); setIsOpen(false); }}
                className="w-full flex items-center space-x-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <i className="fa-solid fa-table-cells-large text-[10px]" style={{ color: 'var(--app-primary)' }}></i>
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--app-primary)' }}>Portföy & Yeni Proje</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const NavItem: React.FC<{
  view: View;
  currentView: View;
  setCurrentView: (view: View) => void;
  icon: string;
  label: string;
  isSpecial?: boolean;
}> = ({ view, currentView, setCurrentView, icon, label, isSpecial }) => (
  <button
    onClick={() => setCurrentView(view)}
    className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all duration-300 ${
      currentView === view
        ? 'bg-primary text-white shadow-lg shadow-blue-200/50 dark:shadow-none translate-y-[-1px]'
        : isSpecial
          ? 'text-primary dark:text-primary hover:bg-accent/40'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
    }`}
    style={currentView === view ? { backgroundColor: 'var(--app-primary)' } : {}}
  >
    <i className={`fa-solid ${icon} ${currentView === view ? 'text-white' : 'text-primary opacity-80'}`} style={currentView !== view ? { color: 'var(--app-primary)' } : {}}></i>
    <span className="inline-block">{label}</span>
  </button>
);

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onOpenSettings, onSaveProject, onLoadProject, isLocalPersistenceEnabled = true, isAIEnabled = true, onOpenAbout, projects, activeProjectId, onSelectProject, currentRole, onChangeRole, cloudLinked, onOpenCloudSync }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Animation States
  const [status, setStatus] = useState<'idle' | 'igniting' | 'launching'>('idle');
  const [showVFX, setShowVFX] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const handleLaunch = () => {
    if (status !== 'idle') return;
    
    // Stage 1: Countdown (Rumble & Ignite)
    setStatus('igniting');
    
    // Stage 2: Blast Off
    setTimeout(() => {
        setStatus('launching');
        setShowVFX(true);
        setIsShaking(true);
        
        // Final Stage: Reset
        setTimeout(() => {
            setCurrentView(View.Kanban);
            setStatus('idle');
            setShowVFX(false);
            setIsShaking(false);
        }, 1400);
    }, 1000);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (status !== 'idle') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / 10;
    const y = (e.clientY - rect.top - rect.height / 2) / 10;
    setMousePos({ x, y });
  };

  return (
    <header className={`bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-300 overflow-visible ${isShaking ? '[animation:hyper-screen-shake_0.4s_ease-in-out]' : ''}`}>
      
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
                        animationDelay: `${Math.random() * 0.4}s`
                    } as any}
                ></div>
            ))}
        </div>
      )}

      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-20">
          
          <div 
            className="flex items-center group cursor-pointer select-none relative" 
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMousePos({ x: 0, y: 0 })}
            onClick={handleLaunch}
          >
            <div 
                className="relative"
                style={{ transform: status === 'idle' ? `translate(${mousePos.x}px, ${mousePos.y}px)` : undefined, transition: 'transform 0.1s ease-out' }}
            >
                <div className={`absolute -inset-8 bg-primary rounded-full blur-[40px] transition-all duration-700 ${status === 'igniting' ? 'opacity-100 scale-150 animate-pulse' : 'opacity-10 group-hover:opacity-40'}`} style={{ backgroundColor: 'var(--app-primary)' }}></div>
                
                <div
                    className={`relative w-16 h-16 bg-primary rounded-[1.4rem] shadow-2xl z-10 flex items-center justify-center overflow-visible transition-all duration-300
                        ${status === 'igniting' ? '[animation:hyper-rumble_0.2s_infinite]' : 'group-hover:scale-105 group-hover:shadow-primary/40'}
                    `}
                    style={{
                        backgroundColor: 'var(--app-primary)',
                        boxShadow: `0 20px 40px -10px var(--app-ring), inset 0 2px 4px rgba(255,255,255,0.4)`
                    }}
                >
                    <div className={`relative flex items-center justify-center transition-all duration-200 ${status === 'launching' ? '[animation:hyper-launch_0.8s_cubic-bezier(0.6,0,1,1)_forwards]' : ''}`}>
                         <i className={`fa-solid fa-rocket text-white text-3xl drop-shadow-lg transition-transform duration-700 ${status === 'idle' ? 'rotate-0' : 'rotate-[-45deg]'}`}></i>
                         
                         {status !== 'idle' && (
                             <div className="absolute top-[80%] left-1/2 -translate-x-1/2 flex flex-col items-center">
                                 <div className="absolute top-0 w-8 h-8 bg-white blur-md rounded-full animate-pulse"></div>
                                 <div 
                                    className={`absolute top-0 w-20 bg-gradient-to-b from-white via-primary to-transparent rounded-b-full ${status === 'launching' ? '[animation:hyper-exhaust_0.8s_ease-out_forwards]' : 'h-32 opacity-100'}`}
                                    style={{ '--tw-gradient-via': 'var(--app-accent)' } as any}>
                                 </div>
                                  <div className="w-1.5 h-64 bg-gradient-to-b from-white to-transparent opacity-60 rounded-full"></div>
                             </div>
                         )}
                    </div>
                </div>
            </div>

            <div className="ml-6 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center space-x-2">
                  <h1 className="text-2xl font-black tracking-tighter leading-none text-gray-800 dark:text-white uppercase transition-all group-hover:translate-x-1">
                    Plan<span className="text-primary font-medium lowercase" style={{ color: 'var(--app-primary)' }}>Asistan</span>
                  </h1>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-[0.5em] leading-none mt-2 transition-all duration-700
                ${status !== 'idle' ? 'text-primary translate-x-2 opacity-100' : 'text-gray-400 opacity-60'}`}
                style={status !== 'idle' ? { color: 'var(--app-primary)' } : {}}
              >
                {status === 'igniting' ? 'ATEŞLENİYOR...' : status === 'launching' ? 'MAKS HIZ' : 'MKS'}
              </span>
            </div>
          </div>

          <div className="hidden lg:block mx-3">
            <ProjectSwitcher
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={onSelectProject}
              onGoPortfolio={() => setCurrentView(View.Portfolio)}
            />
          </div>

          <nav className="hidden md:flex items-center bg-gray-100/50 dark:bg-gray-900/30 p-1.5 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 space-x-1 mx-4">
            {isExecRole(currentRole) && <NavItem view={View.Executive} currentView={currentView} setCurrentView={setCurrentView} icon="fa-gauge-high" label="Yönetim" isSpecial />}
            <NavItem view={View.Portfolio} currentView={currentView} setCurrentView={setCurrentView} icon="fa-table-cells-large" label="Portföy" />
            <NavItem view={View.Allocations} currentView={currentView} setCurrentView={setCurrentView} icon="fa-people-arrows" label="Tahsis" />
            <NavItem view={View.DataPool} currentView={currentView} setCurrentView={setCurrentView} icon="fa-database" label="Havuz" />
            {activeProjectId && (
              <>
                {/* PM'e özel ekranlar (Zekâ, İstekler, Günlük) yönetici rollerinde görünmez */}
                {isAIEnabled && !isExecRole(currentRole) && <NavItem view={View.AI} currentView={currentView} setCurrentView={setCurrentView} icon="fa-wand-magic-sparkles" label="Zekâ" isSpecial />}
                <NavItem view={View.Kanban} currentView={currentView} setCurrentView={setCurrentView} icon="fa-columns" label="Pano" />
                <NavItem view={View.Roadmap} currentView={currentView} setCurrentView={setCurrentView} icon="fa-map" label="Yol Haritası" />
                <NavItem view={View.Goals} currentView={currentView} setCurrentView={setCurrentView} icon="fa-bullseye" label="Hedefler" />
                <NavItem view={View.Tasks} currentView={currentView} setCurrentView={setCurrentView} icon="fa-list-check" label="Görevler" />
                {!isExecRole(currentRole) && <NavItem view={View.Requests} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-viewfinder" label="İstekler" />}
                <NavItem view={View.Resources} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-gear" label="Ekip" />
                {!isExecRole(currentRole) && <NavItem view={View.Notes} currentView={currentView} setCurrentView={setCurrentView} icon="fa-pen-nib" label="Günlük" />}
              </>
            )}
          </nav>

          <div className="flex items-center space-x-2">
            <div className="hidden sm:flex items-center bg-white dark:bg-gray-700 p-1 rounded-xl border border-gray-200 dark:border-gray-600 shadow-inner">
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onLoadProject(file);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }} />
                <button onClick={onSaveProject} className="p-2.5 text-gray-400 hover:text-primary transition-colors">
                    <i className="fa-solid fa-download text-xs"></i>
                </button>
                <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1"></div>
                <button onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-400 hover:text-primary transition-colors">
                    <i className="fa-solid fa-upload text-xs"></i>
                </button>
            </div>
            
            <button
              onClick={onOpenCloudSync}
              className="w-11 h-11 flex items-center justify-center bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 hover:text-primary transition-all relative"
              title={cloudLinked ? 'Bulut senkronizasyonu bağlı' : 'Bulut senkronizasyonu (Supabase) — kurulum için tıklayın'}
            >
              <i className="fa-solid fa-cloud" style={cloudLinked ? { color: 'var(--app-primary)' } : { color: '#9ca3af' }}></i>
              {cloudLinked && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 border border-white dark:border-gray-700"></span>}
            </button>
            <RoleSwitcher currentRole={currentRole} onChangeRole={onChangeRole} />
            <button onClick={onOpenSettings} className="w-11 h-11 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 hover:text-primary transition-all">
                <i className="fa-solid fa-sliders"></i>
            </button>
            <button onClick={onOpenAbout} className="w-11 h-11 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 hover:text-primary transition-all">
                <i className="fa-solid fa-circle-info"></i>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
