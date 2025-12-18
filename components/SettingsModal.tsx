
import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  sprintDuration: number;
  projectStartDate: string;
  isLocalPersistenceEnabled: boolean;
  onSave: (duration: number, date: string, enabled: boolean) => void;
  onClose: () => void;
  onResetData?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  sprintDuration,
  projectStartDate,
  isLocalPersistenceEnabled,
  onSave,
  onClose,
  onResetData
}) => {
  const [duration, setDuration] = useState(sprintDuration);
  const [startDate, setStartDate] = useState(projectStartDate);
  const [persistenceEnabled, setPersistenceEnabled] = useState(isLocalPersistenceEnabled);

  useEffect(() => {
    setDuration(sprintDuration);
    setStartDate(projectStartDate);
    setPersistenceEnabled(isLocalPersistenceEnabled);
  }, [sprintDuration, projectStartDate, isLocalPersistenceEnabled]);

  const handleSave = () => {
    onSave(duration, startDate, persistenceEnabled);
  };

  const handleReset = () => {
      if (window.confirm("Tüm veriler (görevler, kaynaklar, notlar) silinecek. Bu işlem geri alınamaz. Emin misiniz?")) {
          onResetData?.();
          onClose();
      }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="flex justify-between items-center p-5 border-b dark:border-gray-700">
          <h2 className="text-lg font-bold flex items-center text-gray-800 dark:text-white">
            <i className="fa-solid fa-sliders mr-3 text-blue-600"></i>
            Uygulama Ayarları
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-4">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Planlama Parametreleri</h3>
              <div>
                <label htmlFor="sprintDuration" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Sprint Süresi (Hafta)
                </label>
                <input
                  type="number"
                  id="sprintDuration"
                  value={duration}
                  onChange={e => setDuration(Math.max(1, parseInt(e.target.value, 10)))}
                  min="1"
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 dark:text-white transition-all"
                />
              </div>
              <div>
                <label htmlFor="projectStartDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Proje Başlangıç Tarihi
                </label>
                <input
                  type="date"
                  id="projectStartDate"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 dark:text-white transition-all"
                />
              </div>
          </div>

          <div className="pt-6 border-t dark:border-gray-700">
              <h3 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-4">Veri & Depolama</h3>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-800 dark:text-white">Yerel Kayıt (Persistence)</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">Verileri tarayıcı hafızasına otomatik kaydet.</span>
                </div>
                <button 
                  onClick={() => setPersistenceEnabled(!persistenceEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${persistenceEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${persistenceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                  <p className="text-[10px] text-gray-500 italic">Verileriniz bu tarayıcıda yerel olarak saklanmaktadır. Cihaz değiştirirken yedek almayı unutmayın.</p>
                  <button 
                    onClick={handleReset}
                    className="w-full py-2.5 px-4 rounded-xl border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors flex items-center justify-center"
                  >
                      <i className="fa-solid fa-trash-can mr-2"></i>
                      Uygulamayı Sıfırla ve Verileri Sil
                  </button>
              </div>
          </div>
        </div>

        <div className="flex justify-end items-center p-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 transition-colors">
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-none transition-all"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
