
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
    <header className={`bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-300 overflow-visible ${isShaking ? '[animation:premium-main-shake_0.4s_ease-in-out]' : ''}`}>
      
      {/* FULL SCREEN VFX LAYER */}
      {showVFX && (
        <div className="fixed inset-0 z-[1000] pointer-events-none overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 bg-white [animation:premium-blast-flash_0.7s_ease-out_forwards] z-10"></div>
            <div className="absolute w-20 h-20 border-primary rounded-full [animation:premium-shockwave_1.2s_cubic-bezier(0.22,1,0.36,1)_forwards]" style={{ borderColor: 'var(--app-primary)' }}></div>
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
                className={`relative w-16 h-16 flex items-center justify-center transition-all duration-300`}
                style={{ transform: status === 'idle' ? `translate(${mousePos.x}px, ${mousePos.y}px)` : undefined }}
            >
                <div className={`absolute -inset-4 bg-primary rounded-full blur-3xl transition-all duration-500 ${status === 'igniting' ? 'opacity-80 scale-125 animate-pulse' : 'opacity-10 group-hover:opacity-40'}`} style={{ backgroundColor: 'var(--app-primary)' }}></div>
                
                {/* PREMIUM ROCKET SVG V2 */}
                <div className={`relative z-10 transition-all duration-300 ${status === 'launching' ? '[animation:premium-liftoff_1.2s_cubic-bezier(0.8,0,1,1)_forwards]' : status === 'igniting' ? '[animation:premium-rocket-rumble_0.05s_infinite]' : 'group-hover:[animation:premium-idle-float_3s_ease-in-out_infinite]'}`}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
                        <defs>
                            <linearGradient id="rocketBodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#E0E7FF"/>
                                <stop offset="100%" stopColor="#C7D2FE"/>
                            </linearGradient>
                            <linearGradient id="engineFlameGradient" x1="0.5" y1="0" x2="0.5" y2="1">
                                <stop stopColor="white"/>
                                <stop offset="0.7" stopColor="#FDE047"/>
                                <stop offset="1" stopColor="#F97316" stopOpacity="0.8"/>
                            </linearGradient>
                        </defs>
                         {/* Exhaust Plume (Launch) */}
                        {status === 'launching' && (
                            <path d="M12 22 L10 28 L14 28 Z" fill="url(#engineFlameGradient)" className="[animation:premium-exhaust-plume_0.8s_ease-out_forwards]" style={{transformOrigin: 'top center'}}/>
                        )}
                        <g>
                            <path d="M12 2C12 2 13 4 13 6C13 8 12 10 12 10C12 10 11 8 11 6C11 4 12 2 12 2Z" fill="var(--app-primary)"/>
                            <path d="M15 20C15 21.1046 13.6569 22 12 22C10.3431 22 9 21.1046 9 20V12H15V20Z" fill="url(#rocketBodyGradient)"/>
                            <path d="M15 12H9L7 8L12 3L17 8L15 12Z" fill="white"/>
                            <rect x="9" y="5" width="6" height="7" fill="#C7D2FE"/>
                            <path d="M12 3L11.5 6H12.5L12 3Z" fill="var(--app-primary)"/>
                            <path d="M7 8L9 12H7V8Z" fill="#E0E7FF"/>
                            <path d="M17 8L15 12H17V8Z" fill="#E0E7FF"/>
                            <path d="M7 20L9 20V17L7 20Z" fill="var(--app-primary)"/>
                            <path d="M17 20L15 20V17L17 20Z" fill="var(--app-primary)"/>
                        </g>
                         {/* Engine Flame (Ignition) */}
                         <g className={`transition-opacity duration-200 ${status === 'igniting' ? 'opacity-100' : 'opacity-0'}`} style={{transformOrigin: 'top center'}}>
                            <path d="M12 22 C10 25, 14 25, 12 28 C10 25, 14 25, 12 22" fill="url(#engineFlameGradient)" className="[animation:premium-engine-glow_0.2s_infinite]"/>
                        </g>
                    </svg>
                </div>
                {/* Ignition Sparks */}
                {status === 'igniting' && (
                    <div className="absolute inset-0 z-0">
                        {[...Array(20)].map((_, i) => (
                             <div 
                                key={i}
                                className="absolute bottom-[-10px] left-1/2 w-1 h-1 bg-amber-400 rounded-full [animation:premium-spark-burst_0.6s_infinite]" 
                                style={{
                                    '--x-end': `${Math.random() * 80 - 40}px`,
                                    '--y-end': `${Math.random() * 40 + 20}px`,
                                    animationDelay: `${Math.random() * 0.6}s`,
                                } as any}
                             ></div>
                        ))}
                    </div>
                )}
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
                {status === 'igniting' ? 'ATEŞLENİYOR...' : status === 'launching' ? 'MAX-SPEED' : 'MKS SİSTEMİ'}
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
