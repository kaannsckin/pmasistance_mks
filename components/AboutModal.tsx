
import React from 'react';
import { APP_VERSION } from '../utils/workspace';

interface AboutModalProps {
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b dark:border-gray-700 bg-primary text-white">
          <div className="flex items-center space-x-3">
             <div className="bg-white/20 p-2 rounded-xl">
                <i aria-hidden="true" className="fa-solid fa-rocket text-xl"></i>
             </div>
             <div>
                <h2 className="text-xl font-black">PlanAsistan Hakkında</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Proje ve kaynak planlama asistanı</p>
             </div>
          </div>
          <button aria-label="Kapat" onClick={onClose} className="bg-black/10 hover:bg-black/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center">
            <i aria-hidden="true" className="fa-solid fa-times"></i>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-grow overflow-y-auto p-8 space-y-6 custom-scrollbar">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            PlanAsistan; portföy ve işgücü tahsisi, haftalık rapor, risk yönetimi, Jira eşitlemesi, Whiteboard ve yapay zekâ asistanıyla proje ve kaynak planlamasını tek yerde toplar.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-accent/50 dark:bg-primary/10 rounded-2xl border border-primary/10">
              <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-2">Veri</h4>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">Bulut veritabanı bağlıysa veriler Supabase'de, rol ve proje yetkileriyle korunur; bağlı değilse yalnız bu tarayıcıda tutulur.</p>
            </div>
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800">
              <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-2">Sürüm</h4>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">v{APP_VERSION}. Yeniliklerin tamamı modern arayüzde; Ayarlar'dan geçebilirsiniz.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-center">
             <button onClick={onClose} className="bg-gray-800 dark:bg-gray-700 text-white px-8 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-900 dark:hover:bg-gray-600 transition-all shadow-lg">
                 Kapat
             </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
