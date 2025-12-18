
import React from 'react';

interface AboutModalProps {
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in-up flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b dark:border-gray-700 bg-blue-600 text-white">
          <div className="flex items-center space-x-3">
             <div className="bg-white/20 p-2 rounded-xl">
                <i className="fa-solid fa-rocket text-xl"></i>
             </div>
             <div>
                <h2 className="text-xl font-black">PlanAsistan Hakkında</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Akıllı Proje Planlama & GitHub Pages Rehberi</p>
             </div>
          </div>
          <button onClick={onClose} className="bg-black/10 hover:bg-black/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar">
          <section className="space-y-4">
              <h3 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                  <i className="fa-brands fa-github mr-3 text-2xl text-blue-600"></i>
                  GitHub'da Nasıl Yayınlanır?
              </h3>
              <div className="space-y-3">
                  <div className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">1</div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                          GitHub deponuzun <strong>Settings</strong> (Ayarlar) sekmesine gidin.
                      </p>
                  </div>
                  <div className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">2</div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                          Sol menüden <strong>Pages</strong> seçeneğine tıklayın.
                      </p>
                  </div>
                  <div className="flex items-start space-x-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">3</div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                          <strong>Branch</strong> kısmından <code>main</code> ve <code>/(root)</code> seçerek <strong>Save</strong> butonuna basın.
                      </p>
                  </div>
              </div>
          </section>

          <section className="space-y-4 pt-4 border-t dark:border-gray-700">
              <h3 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                  <i className="fa-solid fa-star mr-3 text-2xl text-amber-500"></i>
                  Neden PlanAsistan?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  Bu uygulama, karmaşık proje süreçlerini basitleştirmek için tasarlanmıştır. 
                  <strong> PERT Analizi</strong> ile görev sürelerini istatistiksel olarak tahmin ederken, 
                  <strong> Akıllı Atama</strong> algoritması ile ekip üyelerinizin kapasitesini en verimli şekilde kullanır.
              </p>
              <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
                      <h4 className="text-xs font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest mb-2">Veri Güvenliği</h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">Verileriniz sadece sizin tarayıcınızda (Local Storage) saklanır, hiçbir sunucuya gönderilmez.</p>
                  </div>
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800">
                      <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-2">Cihazlar Arası</h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">JSON export/import özelliği ile verilerinizi farklı bilgisayarlar arasında kolayca taşıyın.</p>
                  </div>
              </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-center">
             <button onClick={onClose} className="bg-gray-800 dark:bg-gray-700 text-white px-8 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-900 dark:hover:bg-gray-600 transition-all shadow-lg">
                 Anladım, Kapat
             </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
