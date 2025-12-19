
import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  sprintDuration: number;
  projectStartDate: string;
  isLocalPersistenceEnabled: boolean;
  isAIEnabled: boolean;
  currentTheme: string;
  isDarkMode: boolean;
  onSave: (duration: number, date: string, enabled: boolean, aiEnabled: boolean, theme: string, isDarkMode: boolean) => void;
  onClose: () => void;
  onResetData?: () => void;
}

const THEMES = [
  { id: 'classic', name: 'Gök Mavisi', color: '#2563eb' },
  { id: 'emerald', name: 'Zümrüt Ormanı', color: '#059669' },
  { id: 'purple', name: 'Gece Moru', color: '#7c3aed' },
  { id: 'orange', name: 'Gün Batımı', color: '#ea580c' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({
  sprintDuration,
  projectStartDate,
  isLocalPersistenceEnabled,
  isAIEnabled,
  currentTheme,
  isDarkMode,
  onSave,
  onClose,
  onResetData
}) => {
  const [duration, setDuration] = useState(sprintDuration);
  const [startDate, setStartDate] = useState(projectStartDate);
  const [persistenceEnabled, setPersistenceEnabled] = useState(isLocalPersistenceEnabled);
  const [aiEnabled, setAiEnabled] = useState(isAIEnabled);
  const [theme, setTheme] = useState(currentTheme || 'classic');
  const [dark, setDark] = useState(isDarkMode);

  useEffect(() => {
    setDuration(sprintDuration);
    setStartDate(projectStartDate);
    setPersistenceEnabled(isLocalPersistenceEnabled);
    setAiEnabled(isAIEnabled);
    setTheme(currentTheme || 'classic');
    setDark(isDarkMode);
  }, [sprintDuration, projectStartDate, isLocalPersistenceEnabled, isAIEnabled, currentTheme, isDarkMode]);

  const handleSave = () => {
    onSave(duration, startDate, persistenceEnabled, aiEnabled, theme, dark);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="flex justify-between items-center p-5 border-b dark:border-gray-700">
          <h2 className="text-lg font-bold flex items-center text-gray-800 dark:text-white">
            <i className="fa-solid fa-sliders mr-3 text-primary"></i>
            Uygulama Ayarları
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <section className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Görünüm & Temalar</h3>
                  <button 
                    onClick={() => setDark(!dark)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border transition-all ${dark ? 'bg-gray-700 border-gray-600 text-amber-400' : 'bg-amber-50 border-amber-100 text-amber-600'}`}
                  >
                      <i className={`fa-solid ${dark ? 'fa-moon' : 'fa-sun'} text-xs`}></i>
                      <span className="text-[10px] font-black uppercase tracking-tighter">{dark ? 'GECE MODU' : 'GÜNDÜZ MODU'}</span>
                  </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                  {THEMES.map(t => (
                      <button 
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={`flex items-center space-x-3 p-3 rounded-xl border transition-all ${theme === t.id ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        style={theme === t.id ? { borderColor: 'var(--app-primary)', backgroundColor: 'var(--app-accent-light)' } : {}}
                      >
                          <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: t.color }}></div>
                          <span className={`text-xs font-bold ${theme === t.id ? 'text-primary' : 'text-gray-600 dark:text-gray-400'}`} style={theme === t.id ? { color: 'var(--app-primary)' } : {}}>{t.name}</span>
                      </button>
                  ))}
              </div>
          </section>

          <section className="space-y-4 pt-6 border-t dark:border-gray-700">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Planlama Parametreleri</h3>
              <div>
                <label htmlFor="sprintDuration" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Sprint Süresi (Hafta)
                </label>
                <input
                  type="number" id="sprintDuration" value={duration}
                  onChange={e => setDuration(Math.max(1, parseInt(e.target.value, 10)))}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary/50 outline-none text-gray-800 dark:text-white transition-all"
                />
              </div>
              <div>
                <label htmlFor="projectStartDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Proje Başlangıç Tarihi
                </label>
                <input
                  type="date" id="projectStartDate" value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary/50 outline-none text-gray-800 dark:text-white transition-all"
                />
              </div>
          </section>

          <section className="pt-6 border-t dark:border-gray-700 space-y-3">
              <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-4" style={{ color: 'var(--app-primary)' }}>Özellikler & Veri</h3>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Yapay Zeka (Gemini)</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Akıllı analiz asistanı.</span>
                </div>
                <button 
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${aiEnabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                  style={aiEnabled ? { backgroundColor: 'var(--app-primary)' } : {}}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${aiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Yerel Kayıt</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Verileri tarayıcıda sakla.</span>
                </div>
                <button 
                  onClick={() => setPersistenceEnabled(!persistenceEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${persistenceEnabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                  style={persistenceEnabled ? { backgroundColor: 'var(--app-primary)' } : {}}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${persistenceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <button 
                onClick={() => { if(window.confirm('Tüm veriler silinecek! Onaylıyor musunuz?')) onResetData?.(); }}
                className="w-full mt-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors"
              >
                  VERİLERİ SIFIRLA
              </button>
          </section>
        </div>

        <div className="flex justify-end items-center p-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors">Vazgeç</button>
          <button
            type="button" onClick={handleSave}
            className="px-8 py-2.5 rounded-xl bg-primary text-white font-bold hover:opacity-90 shadow-lg shadow-primary/20 transition-all"
            style={{ backgroundColor: 'var(--app-primary)' }}
          >
            Değişiklikleri Uygula
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
