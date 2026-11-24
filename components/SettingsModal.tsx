import React, { useState, useEffect } from 'react';
import { ColorMode, ModernTheme, UiStyle } from '../types';
import { COLOR_MODES, MODERN_THEMES } from '../utils/theme';
import { SelectionStrip, ToggleSwitch } from './modern/ui';

interface SettingsModalProps {
  sprintDuration: number;
  projectStartDate: string;
  isLocalPersistenceEnabled: boolean;
  isAIEnabled: boolean;
  /** Klasik arayüzün vurgu rengi (Kaydet ile uygulanır) */
  currentTheme: string;
  /** Gündüz / Gece / Sistem ve modern tema — seçildiği an uygulanır */
  colorMode: ColorMode;
  modernTheme: ModernTheme;
  onChangeAppearance: (patch: { modernTheme?: ModernTheme; colorMode?: ColorMode }) => void;
  /** Ekranda modern arayüz mü görünüyor (konsol modu dahil) */
  isModernActive: boolean;
  /** Arayüz tercihi — kartlara tıklanınca hemen uygulanır (kaydet beklenmez) */
  currentUiStyle: UiStyle;
  onChangeUiStyle: (style: UiStyle) => void;
  onSave: (duration: number, date: string, enabled: boolean, aiEnabled: boolean, theme: string) => void;
  onClose: () => void;
  onResetData?: () => void;
}

const THEMES = [
  { id: 'classic', name: 'Gök Mavisi', color: '#2563eb' },
  { id: 'emerald', name: 'Zümrüt Ormanı', color: '#059669' },
  { id: 'purple', name: 'Gece Moru', color: '#7c3aed' },
  { id: 'orange', name: 'Gün Batımı', color: '#ea580c' },
];

/** Seçim kartlarındaki küçük önizleme — iki arayüzün iskeleti */
const UiPreview: React.FC<{ kind: UiStyle }> = ({ kind }) => kind === 'modern' ? (
  <div aria-hidden="true" className="h-20 w-full rounded-lg overflow-hidden flex" style={{ background: '#F2F2F7' }}>
    <div className="w-1/3 h-full bg-white flex flex-col gap-1 p-1.5">
      <div className="h-2 w-6 rounded-sm" style={{ background: '#1C1C1E' }}></div>
      <div className="h-2 rounded-sm" style={{ background: '#0066D6' }}></div>
      <div className="h-2 rounded-sm bg-gray-200"></div>
      <div className="h-2 rounded-sm bg-gray-200"></div>
    </div>
    <div className="flex-1 p-1.5 flex flex-col gap-1">
      <div className="h-2.5 w-10 rounded-sm" style={{ background: '#1C1C1E' }}></div>
      <div className="flex-1 rounded-md bg-white"></div>
      <div className="flex-1 rounded-md bg-white"></div>
    </div>
  </div>
) : (
  <div aria-hidden="true" className="h-20 w-full rounded-lg overflow-hidden flex flex-col bg-gray-50">
    <div className="h-4 bg-white border-b border-gray-200 flex items-center gap-1 px-1.5">
      <div className="h-2.5 w-2.5 rounded" style={{ background: 'var(--app-primary)' }}></div>
      <div className="h-1.5 w-5 rounded-sm bg-gray-300"></div>
      <div className="h-1.5 w-5 rounded-sm bg-gray-300"></div>
      <div className="h-1.5 w-5 rounded-sm bg-gray-300"></div>
    </div>
    <div className="h-3 bg-white border-b border-gray-200 flex items-center gap-1 px-1.5">
      <div className="h-1 w-4 rounded-sm bg-gray-300"></div>
      <div className="h-1 w-4 rounded-sm bg-gray-300"></div>
      <div className="h-1 w-4 rounded-sm bg-gray-300"></div>
    </div>
    <div className="flex-1 grid grid-cols-3 gap-1 p-1.5">
      <div className="rounded bg-white border border-gray-200"></div>
      <div className="rounded bg-white border border-gray-200"></div>
      <div className="rounded bg-white border border-gray-200"></div>
    </div>
  </div>
);

/** Modern tema kartlarındaki küçük önizleme — her temanın yüzey ve köşe dili */
const THEME_PREVIEW: Record<ModernTheme, { bg: string; side: React.CSSProperties; card: React.CSSProperties; btn: React.CSSProperties; line: string }> = {
  bubble: {
    bg: 'radial-gradient(90% 110% at 85% 0%, #B9DFFF, transparent 73%), radial-gradient(100% 85% at 10% 100%, #DAD1FF, transparent 74%), #EEF2FA',
    side: { background: 'rgba(255,255,255,.67)', borderRadius: 10, margin: 4, border: '1px solid #FFFFFF', boxShadow: '0 2px 8px #30499525' },
    card: { background: 'linear-gradient(125deg, #FFFFFF, #EFF4FF)', borderRadius: 8, border: '1px solid #FFFFFF', boxShadow: '0 2px 6px #30499522' },
    btn: { background: 'linear-gradient(145deg, #4068EA, #2750C6)', borderRadius: 999 },
    line: '#182441',
  },
  aurora: {
    bg: 'radial-gradient(70% 70% at 10% 10%, rgba(45,212,191,0.6), transparent 70%), radial-gradient(60% 60% at 95% 30%, rgba(56,189,248,0.5), transparent 70%), radial-gradient(70% 60% at 60% 110%, rgba(190,242,100,0.55), transparent 70%), #EAF4F6',
    side: { background: 'rgba(255,255,255,0.4)', borderRight: '1px solid rgba(255,255,255,0.8)' },
    card: { background: 'rgba(255,255,255,0.55)', borderRadius: 7, border: '1px solid rgba(255,255,255,0.85)' },
    btn: { background: 'linear-gradient(135deg, #0F766E, #0369A1)', borderRadius: 4 },
    line: '#0B2530',
  },
  pro: {
    bg: '#FBFBFC',
    side: { background: '#F3F3F5', borderRight: '1px solid #E6E6EA' },
    card: { background: '#FFFFFF', borderRadius: 3, border: '1px solid #E6E6EA' },
    btn: { background: '#4F5BD5', borderRadius: 3 },
    line: '#1A1A1E',
  },
  clay: {
    bg: '#E6EBF7',
    side: { background: '#EEF2FB', borderRadius: 10, margin: 4, boxShadow: '3px 3px 6px rgba(110,120,170,0.3), -2px -2px 5px #FFFFFF' },
    card: { background: '#F4F6FD', borderRadius: 10, boxShadow: '3px 3px 6px rgba(110,120,170,0.3), -2px -2px 5px #FFFFFF' },
    btn: { background: 'linear-gradient(145deg, #D9573F, #B83A27)', borderRadius: 6, boxShadow: '1px 1px 3px rgba(184,58,39,0.4)' },
    line: '#2A2F4A',
  },
};

const ThemePreview: React.FC<{ id: ModernTheme }> = ({ id }) => {
  const p = THEME_PREVIEW[id];
  return (
    <div aria-hidden="true" className="h-16 w-full rounded-lg overflow-hidden flex" style={{ background: p.bg }}>
      <div className="w-1/3 flex flex-col gap-1 p-1.5" style={p.side}>
        <div className="h-1.5 w-5 rounded-sm" style={{ background: p.line }}></div>
        <div className="h-1.5 rounded-sm" style={{ ...p.btn, opacity: 0.85 }}></div>
        <div className="h-1.5 rounded-sm" style={{ background: p.line, opacity: 0.15 }}></div>
      </div>
      <div className="flex-1 p-1.5 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="h-2 w-8 rounded-sm" style={{ background: p.line }}></div>
          <div className="h-2.5 w-7" style={p.btn}></div>
        </div>
        <div className="flex-1 flex gap-1">
          <div className="flex-1" style={p.card}></div>
          <div className="flex-1" style={p.card}></div>
        </div>
      </div>
    </div>
  );
};

const UI_STYLES: { id: UiStyle; name: string; hint: string }[] = [
  { id: 'classic', name: 'Klasik', hint: 'Alışık olduğunuz görünüm' },
  { id: 'modern', name: 'Modern', hint: 'Sade, kenar menülü yeni görünüm' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({
  sprintDuration,
  projectStartDate,
  isLocalPersistenceEnabled,
  isAIEnabled,
  currentTheme,
  colorMode,
  modernTheme,
  onChangeAppearance,
  isModernActive,
  currentUiStyle,
  onChangeUiStyle,
  onSave,
  onClose,
  onResetData
}) => {
  const [duration, setDuration] = useState(sprintDuration);
  const [startDate, setStartDate] = useState(projectStartDate);
  const [persistenceEnabled, setPersistenceEnabled] = useState(isLocalPersistenceEnabled);
  const [aiEnabled, setAiEnabled] = useState(isAIEnabled);
  const [theme, setTheme] = useState(currentTheme || 'classic');

  useEffect(() => {
    setDuration(sprintDuration);
    setStartDate(projectStartDate);
    setPersistenceEnabled(isLocalPersistenceEnabled);
    setAiEnabled(isAIEnabled);
    setTheme(currentTheme || 'classic');
  }, [sprintDuration, projectStartDate, isLocalPersistenceEnabled, isAIEnabled, currentTheme]);

  const handleSave = () => {
    onSave(duration, startDate, persistenceEnabled, aiEnabled, theme);
  };

  return (
    <div className="m-sheet-backdrop fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="app-settings-title" className="m-app-dialog m-appearance-dialog bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="m-app-dialog-header flex justify-between items-center p-5 border-b dark:border-gray-700">
          <h2 id="app-settings-title" className="text-lg font-bold flex items-center text-gray-800 dark:text-white">
            <i aria-hidden="true" className="fa-solid fa-sliders mr-3 text-primary"></i>
            Uygulama Ayarları
          </h2>
          <button aria-label="Kapat" onClick={onClose} className="m-app-dialog-close text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <i aria-hidden="true" className="fa-solid fa-times"></i>
          </button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <section className="space-y-3" aria-labelledby="ui-style-title">
              <h3 id="ui-style-title" className="text-sm font-semibold text-gray-800 dark:text-white">Arayüz</h3>
              <div role="radiogroup" aria-labelledby="ui-style-title" className="grid grid-cols-2 gap-3">
                  {UI_STYLES.map(u => {
                      const selected = (currentUiStyle || 'classic') === u.id;
                      return (
                          <button
                            key={u.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => { if (!selected) onChangeUiStyle(u.id); }}
                            className={`text-left p-2 rounded-xl border-2 transition-colors ${selected ? '' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'}`}
                            style={selected ? { borderColor: 'var(--app-primary)' } : {}}
                          >
                              <UiPreview kind={u.id} />
                              <span className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-white">
                                  {u.name}
                                  {selected && <i className="fa-solid fa-circle-check text-xs" style={{ color: 'var(--app-primary)' }} aria-hidden="true"></i>}
                              </span>
                              <span className="block text-xs text-gray-600 dark:text-gray-400">{u.hint}</span>
                          </button>
                      );
                  })}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Seçim hemen uygulanır; istediğiniz zaman buradan geri dönebilirsiniz.</p>
          </section>

          <section className="space-y-4 pt-6 border-t dark:border-gray-700" aria-labelledby="appearance-title">
              <div className="flex flex-wrap justify-between items-center gap-3">
                  <h3 id="appearance-title" className="text-xs font-black text-gray-400 uppercase tracking-widest">{isModernActive ? 'Görünüm & Tema' : 'Görünüm & Renk'}</h3>
                  <SelectionStrip role="radiogroup" label="Gündüz / gece" selection={colorMode} className="m-color-mode inline-flex p-0.5 rounded-xl bg-gray-100 dark:bg-gray-700">
                      {COLOR_MODES.map(m => {
                          const on = colorMode === m.id;
                          return (
                              <button
                                key={m.id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                tabIndex={on ? 0 : -1}
                                onClick={() => { if (!on) onChangeAppearance({ colorMode: m.id }); }}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-xs font-semibold transition-colors ${on ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
                              >
                                  <i aria-hidden="true" className={`fa-solid ${m.id === 'system' ? 'fa-circle-half-stroke' : m.id === 'light' ? 'fa-sun' : 'fa-moon'} text-[11px]`}></i>
                                  {m.name}
                              </button>
                          );
                      })}
                  </SelectionStrip>
              </div>
              {isModernActive ? (
                  <>
                      <div role="radiogroup" aria-labelledby="appearance-title" className="grid grid-cols-2 gap-3">
                          {MODERN_THEMES.map(t => {
                              const selected = modernTheme === t.id;
                              return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => { if (!selected) onChangeAppearance({ modernTheme: t.id }); }}
                                    className={`m-theme-choice text-left p-2 rounded-xl border-2 transition-colors ${selected ? '' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'}`}
                                    style={selected ? { borderColor: 'var(--app-primary)' } : {}}
                                  >
                                      <ThemePreview id={t.id} />
                                      <span className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-white">
                                          {t.name}
                                          {selected && <i className="m-theme-choice-check fa-solid fa-circle-check text-xs" style={{ color: 'var(--app-primary)' }} aria-hidden="true"></i>}
                                      </span>
                                      <span className="block text-xs text-gray-600 dark:text-gray-400">{t.hint}</span>
                                  </button>
                              );
                          })}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Tema ve gündüz/gece seçimi hemen uygulanır. Her tema iki modda da çalışır.</p>
                  </>
              ) : (
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
              )}
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
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Yapay Zeka Asistanı</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Akıllı analiz asistanı.</span>
                </div>
                <ToggleSwitch label="Yapay Zeka Asistanı" checked={aiEnabled} onChange={setAiEnabled} />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Yerel Kayıt</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Projeleri çevrimdışı açmak için tarayıcıda sakla.</span>
                </div>
                <ToggleSwitch label="Yerel Kayıt" checked={persistenceEnabled} onChange={setPersistenceEnabled} />
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
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors">Vazgeç</button>
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
