
import React, { useRef, useState, useEffect } from 'react';
import { View } from '../types';

interface HeaderProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  onOpenSettings: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  isLocalPersistenceEnabled?: boolean;
  isAIEnabled?: boolean;
  onOpenAbout?: () => void;
}

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

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onOpenSettings, onSaveProject, onLoadProject, isLocalPersistenceEnabled = true, isAIEnabled = true, onOpenAbout }) => {
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

          <nav className="hidden md:flex items-center bg-gray-100/50 dark:bg-gray-900/30 p-1.5 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 space-x-1 mx-4">
            {isAIEnabled && <NavItem view={View.AI} currentView={currentView} setCurrentView={setCurrentView} icon="fa-wand-magic-sparkles" label="Zekâ" isSpecial />}
            <NavItem view={View.Kanban} currentView={currentView} setCurrentView={setCurrentView} icon="fa-columns" label="Pano" />
            <NavItem view={View.Roadmap} currentView={currentView} setCurrentView={setCurrentView} icon="fa-map" label="Yol Haritası" />
            <NavItem view={View.Goals} currentView={currentView} setCurrentView={setCurrentView} icon="fa-bullseye" label="Hedefler" />
            <NavItem view={View.Tasks} currentView={currentView} setCurrentView={setCurrentView} icon="fa-list-check" label="Görevler" />
            <NavItem view={View.Requests} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-viewfinder" label="İstekler" />
            <NavItem view={View.Resources} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-gear" label="Ekip" />
            <NavItem view={View.Notes} currentView={currentView} setCurrentView={setCurrentView} icon="fa-pen-nib" label="Günlük" />
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
