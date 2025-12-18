
import React from 'react';

interface Reminder {
  noteId: string;
  content: string;
  date: string;
}

interface RemindersModalProps {
  reminders: Reminder[];
  onClose: () => void;
}

const RemindersModal: React.FC<RemindersModalProps> = ({ reminders, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-6 border-b dark:border-gray-700 bg-amber-500 text-white">
          <div className="flex items-center space-x-3">
             <div className="bg-white/20 p-2 rounded-lg">
                <i className="fa-solid fa-bell text-xl"></i>
             </div>
             <div>
                <h2 className="text-xl font-black">Anımsatıcılar</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Hatırlamanız Gereken {reminders.length} Madde</p>
             </div>
          </div>
          <button onClick={onClose} className="bg-black/10 hover:bg-black/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        
        <div className="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {reminders.length > 0 ? reminders.map((rem, idx) => (
            <div key={idx} className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 group hover:border-amber-400 transition-all border-l-4 border-l-amber-500">
               <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-black text-amber-600 uppercase">Hatırlatma</span>
                  <span className="text-[10px] text-gray-400 font-bold">{new Date(rem.date).toLocaleDateString('tr-TR')}</span>
               </div>
               <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed italic">
                 "{rem.content}"
               </p>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
               <i className="fa-solid fa-clipboard-check text-5xl mb-4 opacity-20"></i>
               <p className="font-bold text-center">Henüz bekleyen bir anımsatıcı yok.</p>
               <p className="text-xs text-center mt-1">Notlarınıza #anımsatıcı yazarak burayı doldurabilirsiniz.</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 text-center">
             <button onClick={onClose} className="text-gray-500 font-black text-xs uppercase tracking-widest hover:text-gray-800 dark:hover:text-white transition-colors">
                 Kapat
             </button>
        </div>
      </div>
    </div>
  );
};

export default RemindersModal;
