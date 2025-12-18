
import React, { useRef, useState, useEffect } from 'react';
import { View } from '../types';

interface HeaderProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  onOpenSettings: () => void;
  onSaveProject: () => void;
  onLoadProject: (file: File) => void;
  isLocalPersistenceEnabled?: boolean;
}

const NavItem: React.FC<{
  view: View;
  currentView: View;
  setCurrentView: (view: View) => void;
  icon: string;
  label: string;
}> = ({ view, currentView, setCurrentView, icon, label }) => (
  <button
    onClick={() => setCurrentView(view)}
    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
      currentView === view
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
    }`}
  >
    <i className={`fa-solid ${icon} ${currentView === view ? 'text-white' : 'text-blue-500'}`}></i>
    <span className="hidden lg:inline">{label}</span>
  </button>
);

const Header: React.FC<HeaderProps> = ({ currentView, setCurrentView, onOpenSettings, onSaveProject, onLoadProject, isLocalPersistenceEnabled = true }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadProject(file);
    }
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-40 border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Sol Kısım: Logo ve Durum */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center group cursor-pointer" onClick={() => setCurrentView(View.Kanban)}>
              <div className="bg-blue-600 p-2 rounded-xl mr-3 shadow-md group-hover:rotate-12 transition-transform">
                <i className="fa-solid fa-rocket text-white"></i>
              </div>
              <h1 className="text-lg font-black text-gray-800 dark:text-white tracking-tight hidden sm:block">PlanAsistan</h1>
            </div>
            
            {/* Status Badge */}
            <div className={`hidden md:flex items-center px-3 py-1 border rounded-full transition-colors duration-500 ${isLocalPersistenceEnabled ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700'}`}>
              <span className={`w-2 h-2 rounded-full mr-2 ${isLocalPersistenceEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`}></span>
              <span className={`text-[10px] font-black uppercase tracking-widest ${isLocalPersistenceEnabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500'}`}>
                {isLocalPersistenceEnabled ? 'Yerel Kayıt Aktif' : 'Yerel Kayıt Pasif'}
              </span>
            </div>
          </div>

          {/* Orta Kısım: Navigasyon */}
          <nav className="flex items-center space-x-1">
            <NavItem view={View.Tasks} currentView={currentView} setCurrentView={setCurrentView} icon="fa-list-check" label="Görevler" />
            <NavItem view={View.Kanban} currentView={currentView} setCurrentView={setCurrentView} icon="fa-columns" label="Pano" />
            <NavItem view={View.Timeline} currentView={currentView} setCurrentView={setCurrentView} icon="fa-chart-pie" label="Analiz" />
            <NavItem view={View.Resources} currentView={currentView} setCurrentView={setCurrentView} icon="fa-users-gear" label="Ekip" />
            <NavItem view={View.WorkPackages} currentView={currentView} setCurrentView={setCurrentView} icon="fa-briefcase" label="Paketler" />
            <NavItem view={View.Notes} currentView={currentView} setCurrentView={setCurrentView} icon="fa-pen-nib" label="Günlük" />
          </nav>

          {/* Sağ Kısım: Aksiyonlar */}
          <div className="flex items-center space-x-2">
            <div className="hidden sm:flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
                <button onClick={onSaveProject} className="p-2 text-gray-500 hover:text-blue-600 transition-colors" title="Yedek Al (İndir)">
                    <i className="fa-solid fa-download"></i>
                </button>
                <button onClick={handleLoadClick} className="p-2 text-gray-500 hover:text-blue-600 transition-colors" title="Yedek Yükle">
                    <i className="fa-solid fa-upload"></i>
                </button>
            </div>

            <button onClick={onOpenSettings} className="p-2.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all">
              <i className="fa-solid fa-sliders"></i>
            </button>

            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all animate-pulse"
              >
                YÜKLE
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
