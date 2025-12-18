
import React from 'react';

interface NotesHelpModalProps {
  onClose: () => void;
}

const NotesHelpModal: React.FC<NotesHelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b dark:border-gray-700 bg-blue-600 text-white">
          <div className="flex items-center space-x-3">
             <div className="bg-white/20 p-2 rounded-lg">
                <i className="fa-solid fa-circle-info text-xl"></i>
             </div>
             <div>
                <h2 className="text-xl font-black">Günlük Rehberi</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Özellikler ve Kısayollar</p>
             </div>
          </div>
          <button onClick={onClose} className="bg-black/10 hover:bg-black/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        
        <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800 hover:border-emerald-400 transition-all group">
                    <div className="flex items-center space-x-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600">
                            <i className="fa-solid fa-check-double"></i>
                        </div>
                        <span className="text-emerald-500 font-black text-xs uppercase tracking-widest">ToDo Listesi</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        Notlarınıza interaktif ToDo listeleri ekleyin. <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-700 text-emerald-600">[ ] Görev</code> yazarak başlayın. 
                    </p>
                    <div className="mt-3 flex items-center text-[10px] font-bold text-emerald-600/60 uppercase">
                        <i className="fa-solid fa-lightbulb mr-1.5"></i>
                        Pano üzerinden topluca takip edilebilir.
                    </div>
                </div>

                <div className="p-5 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800 hover:border-amber-400 transition-all">
                    <div className="flex items-center space-x-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600">
                            <i className="fa-solid fa-bell"></i>
                        </div>
                        <span className="text-amber-500 font-black text-xs uppercase tracking-widest">Anımsatıcılar</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        Kritik satırları <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-700 text-amber-600">#anımsatıcı</code> etiketiyle işaretleyerek özel panoda görünmesini sağlayın.
                    </p>
                    <div className="mt-3 flex items-center text-[10px] font-bold text-amber-600/60 uppercase">
                        <i className="fa-solid fa-clock mr-1.5"></i>
                        Tarih bazlı sıralama yapılır.
                    </div>
                </div>

                <div className="p-5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800 hover:border-blue-400 transition-all">
                    <div className="flex items-center space-x-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600">
                            <i className="fa-solid fa-palette"></i>
                        </div>
                        <span className="text-blue-500 font-black text-xs uppercase tracking-widest">Görsel Düzen</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        Zengin metin araçlarıyla notları biçimlendirin. 
                        <span className="block mt-2 font-mono text-[10px]">
                            **Kalın**, *İtalik*, ==Vurgu==, ^Büyük^
                        </span>
                    </p>
                    <div className="mt-3 flex items-center text-[10px] font-bold text-blue-600/60 uppercase">
                        <i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i>
                        Özel yazı renklerini kullanın.
                    </div>
                </div>

                <div className="p-5 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-800 hover:border-blue-400 transition-all">
                    <div className="flex items-center space-x-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600">
                            <i className="fa-solid fa-tags"></i>
                        </div>
                        <span className="text-purple-500 font-black text-xs uppercase tracking-widest">Etiket & Kişi</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-700 text-purple-600">#etiket</code> ve <code className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-700 text-purple-600">@kişi</code> mentionları ile otomatik gruplama yapın.
                    </p>
                    <div className="mt-3 flex items-center text-[10px] font-bold text-purple-600/60 uppercase">
                        <i className="fa-solid fa-bolt mr-1.5"></i>
                        Yazarken otomatik tamamlama açılır.
                    </div>
                </div>
            </div>

            <section className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-700">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Klavyeden Hızlı Kaydetme</h3>
                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                        <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold shadow-sm">Ctrl</kbd>
                        <span className="text-gray-400">+</span>
                        <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold shadow-sm">Enter</kbd>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Yazdığınız notu anında sisteme kaydetmek için bu kombinasyonu kullanabilirsiniz.</p>
                </div>
            </section>
        </div>

        <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 text-center">
             <button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-200 dark:shadow-none">
                 ANLADIM, TEŞEKKÜRLER
             </button>
        </div>
      </div>
    </div>
  );
};

export default NotesHelpModal;
