
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
    className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${
      currentView === view
        ? isSpecial 
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none translate-y-[-1px]'
          : 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none translate-y-[-1px]'
        : isSpecial
          ? 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
    }`}
  >
    <i className={`fa-solid ${icon} ${currentView === view ? 'text-white' : isSpecial ? 'text-indigo-500' : 'text-blue-500/80'}`}></i>
    <span className="hidden xl:inline">{label}</span>
  </button>
);

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onOpenSettings, onSaveProject, onLoadProject, isLocalPersistenceEnabled = true, isAIEnabled = true, onOpenAbout }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isTilting, setIsTilting] = useState(false);
  const [isIgniting, setIsIgniting] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [showBurst, setShowBurst] = useState(false);

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadProject(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLaunching || isIgniting || isTilting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / 10;
    const y = (e.clientY - rect.top - rect.height / 2) / 10;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    if (isLaunching || isIgniting || isTilting) return;
    setMousePos({ x: 0, y: 0 });
  };

  const handleLaunch = () => {
    if (isLaunching || isIgniting || isTilting) return;
    
    // 1. Aşama: Tıklama -> 45 Derece Dönüş
    setIsTilting(true);
    
    // 2. Aşama: Ateşlenme (Dikey Yoğun Plazma Efekti)
    setTimeout(() => {
        setIsIgniting(true);
    }, 700);

    // 3. Aşama: Fırlatma
    setTimeout(() => {
        setIsIgniting(false);
        setIsLaunching(true);
    }, 1900);

    // 4. Aşama: Patlama Efekti
    setTimeout(() => setShowBurst(true), 2200);

    // 5. Aşama: Reset
    setTimeout(() => {
        setCurrentView(View.Kanban);
        setShowBurst(false);
        setIsLaunching(false);
        setIsTilting(false);
        setMousePos({ x: 0, y: 0 });
    }, 3600);
  };

  return (
    <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700 shadow-sm overflow-visible">
      
      {showBurst && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-white animate-flash-overlay z-[101]"></div>
            <div className="absolute w-20 h-20 bg-blue-500 rounded-full animate-shockwave-1 opacity-0"></div>
            <div className="absolute w-20 h-20 border-4 border-indigo-400 rounded-full animate-shockwave-2 opacity-0"></div>
            {[...Array(30)].map((_, i) => (
                <div 
                    key={i} 
                    className="absolute w-1 h-1 bg-blue-400 rounded-full animate-particle"
                    style={{ 
                        '--rx': `${Math.random() * 2400 - 1200}px`, 
                        '--ry': `${Math.random() * 2400 - 1200}px`,
                        animationDelay: `${Math.random() * 0.3}s`
                    } as any}
                ></div>
            ))}
        </div>
      )}

      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-20">
          
          <div 
            className="flex items-center group cursor-pointer select-none" 
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleLaunch}
          >
            <div className="relative">
              <div className={`absolute -inset-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur-lg transition-all duration-1000 ${isTilting || isLaunching ? 'opacity-100 scale-[2.5]' : 'opacity-10 scale-100'}`}></div>
              
              <div 
                className="relative bg-gradient-to-br from-blue-600 to-indigo-700 p-3.5 rounded-2xl shadow-xl z-10 transition-all duration-300"
                style={{ 
                    transform: isLaunching || isIgniting || isTilting ? 'none' : `translate(${mousePos.x}px, ${mousePos.y}px)` 
                }}
              >
                {/* ROKET KATMANI */}
                <div className={`relative flex items-center justify-center transition-all duration-700 ease-in-out
                    ${isTilting && !isIgniting && !isLaunching ? 'rotate-[-45deg]' : ''}
                    ${isIgniting ? 'animate-rumble-tilted' : ''}
                    ${isLaunching ? 'animate-rocket-blast' : ''}
                `}>
                    <i className="fa-solid fa-rocket text-white text-xl"></i>
                    
                    {/* Yoğun Dikey Ateşleme Efekti (Plasma Huzmesi) */}
                    {isIgniting && (
                        <div className="absolute top-[85%] left-1/2 -translate-x-1/2 flex flex-col items-center">
                            {/* Ana Beyaz Çekirdek */}
                            <div className="w-2 bg-white rounded-full blur-[1px] animate-plasma-core origin-top shadow-[0_0_15px_rgba(255,255,255,0.8)]"></div>
                            {/* Dış Mavi/Turuncu Harez */}
                            <div className="absolute top-0 w-5 bg-gradient-to-b from-blue-400 via-indigo-600 to-transparent rounded-full blur-[4px] animate-plasma-glow origin-top"></div>
                        </div>
                    )}

                    {/* Fırlatma İzi */}
                    {isLaunching && (
                         <div className="absolute top-[85%] left-1/2 -translate-x-1/2 w-10 h-80 bg-gradient-to-b from-white via-blue-400 to-transparent blur-[10px] animate-launch-trail rounded-full origin-top"></div>
                    )}
                </div>
              </div>
            </div>

            <div className="ml-5 flex flex-col justify-center overflow-hidden">
              <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-black tracking-tighter leading-none text-gray-800 dark:text-white uppercase transition-transform group-hover:translate-x-1 duration-300">
                    Plan<span className="text-blue-600 dark:text-blue-400 font-medium lowercase">Asistan</span>
                  </h1>
                  {isLocalPersistenceEnabled && (
                      <div className="flex items-center space-x-1 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-800">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                          <span className="text-[7px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">YEREL KAYIT AKTİF</span>
                      </div>
                  )}
              </div>
              <span className="text-[9px] font-black text-blue-500/60 dark:text-blue-400/50 uppercase tracking-[0.5em] leading-none mt-2 transition-all group-hover:tracking-[0.6em] duration-500">
                MKS
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center bg-gray-100/50 dark:bg-gray-900/30 p-1.5 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 space-x-1">
            {isAIEnabled && <NavItem view={View.AI} currentView={currentView} setCurrentView={setCurrentView} icon="fa-wand-magic-sparkles" label="Zekâ" isSpecial />}
            <NavItem view={View.Kanban} currentView={currentView} setCurrentView={setCurrentView} icon="fa-columns" label="Pano" />
            <NavItem view={View.Tasks} currentView={currentView} setCurrentView={setCurrentView} icon="fa-list-check" label="Görevler" />
            <NavItem view={View.Requests} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-viewfinder" label="İstekler" />
            <NavItem view={View.Resources} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-gear" label="Ekip" />
            <NavItem view={View.WorkPackages} currentView={currentView} setCurrentView={setCurrentView} icon="fa-briefcase" label="Paketler" />
            <NavItem view={View.Notes} currentView={currentView} setCurrentView={setCurrentView} icon="fa-pen-nib" label="Günlük" />
          </nav>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center bg-white dark:bg-gray-700 p-1 rounded-xl shadow-inner border border-gray-100 dark:border-gray-600">
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
                <button onClick={onSaveProject} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Yedekle">
                    <i className="fa-solid fa-download text-sm"></i>
                </button>
                <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1"></div>
                <button onClick={handleLoadClick} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Yükle">
                    <i className="fa-solid fa-upload text-sm"></i>
                </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <button onClick={onOpenSettings} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm">
                <i className="fa-solid fa-sliders"></i>
              </button>
              <button onClick={onOpenAbout} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-blue-300 hover:text-blue-600 transition-all shadow-sm">
                <i className="fa-solid fa-circle-info"></i>
              </button>
            </div>
          </div>

        </div>
      </div>

<style dangerouslySetInnerHTML={{ __html: `
        /* Sarsıntı - Roketin -45 derecelik açısını koruyarak titreme yapar */
        @keyframes rumble-tilted {
          0%, 100% { transform: rotate(-45deg) translate(0,0); }
          25% { transform: rotate(-45deg) translate(0.8px, 0.8px); }
          50% { transform: rotate(-45deg) translate(-0.8px, -0.8px); }
          75% { transform: rotate(-45deg) translate(0.8px, -0.8px); }
        }
        .animate-rumble-tilted { animation: rumble-tilted 0.07s linear infinite; }

        /* Ateşleme Plazma Çekirdeği - Roket doğrultusunda uzama */
        @keyframes plasma-core {
          0% { height: 10px; transform: translateX(-50%) scaleX(0.8); opacity: 0.8; }
          100% { height: 50px; transform: translateX(-50%) scaleX(1.3); opacity: 1; }
        }
        /* Ateş elementlerinin roketin altında doğru açıda durması için kapsayıcı */
        .exhaust-container {
          position: absolute;
          bottom: -5px;
          left: 50%;
          transform: translateX(-50%);
          transform-origin: top center;
        }

        .animate-plasma-core { animation: plasma-core 0.05s ease-in-out infinite alternate; }

        /* Ateşleme Plazma Halesi */
        @keyframes plasma-glow {
          0% { height: 15px; opacity: 0.5; filter: blur(4px); }
          100% { height: 70px; opacity: 0.9; filter: blur(8px); }
        }
        .animate-plasma-glow { animation: plasma-glow 0.05s ease-in-out infinite alternate-reverse; }

        /* Fırlatma İzi - Kuyruk efekti */
        @keyframes launch-trail {
          0% { transform: translateX(-50%) scaleY(0.5); opacity: 1; }
          100% { transform: translateX(-50%) scaleY(4); opacity: 0; }
        }
        .animate-launch-trail { animation: launch-trail 0.15s linear infinite; }

        /* Fırlatma Hareketi - Tam çapraz (45 derece) rotada çıkış */
        @keyframes rocket-blast-off {
          0% { 
            transform: translate(0, 0) rotate(-45deg) scale(1); 
            filter: blur(0); 
          }
          100% { 
            /* X ve Y ekseninde eşit hareket tam 45 derece doğrusal gidiş sağlar */
            transform: translate(150vw, -150vw) rotate(-45deg) scale(4); 
            filter: blur(10px) brightness(3); 
          }
        }
        .animate-rocket-blast { 
            animation: rocket-blast-off 1.1s cubic-bezier(0.85, 0, 0.15, 1) forwards; 
        }

        /* Ekran Parlaması */
        @keyframes flash-overlay {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-flash-overlay { animation: flash-overlay 1.2s ease-out forwards; }

        /* Şok Dalgaları */
        @keyframes shockwave-massive {
          0% { transform: scale(0.1); opacity: 1; border-width: 40px; }
          100% { transform: scale(100); opacity: 0; border-width: 1px; }
        }
        .animate-shockwave-1 { animation: shockwave-massive 1s ease-out forwards; }
        .animate-shockwave-2 { animation: shockwave-massive 1.4s ease-out 0.1s forwards; }

        /* Partiküller */
        @keyframes particle-fast {
          0% { transform: translate(0,0) scale(3); opacity: 1; }
          100% { transform: translate(var(--rx), var(--ry)) scale(0); opacity: 0; }
        }
        .animate-particle { animation: particle-fast 1.8s cubic-bezier(0, 1, 0.3, 1) forwards; }
      `}} />
    </header>
  );
};

export default Header;
