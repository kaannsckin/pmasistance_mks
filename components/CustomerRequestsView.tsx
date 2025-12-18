
import React, { useState, useMemo, useRef } from 'react';
import { CustomerRequest } from '../types';

declare const XLSX: any;
declare const Papa: any;

interface CustomerRequestsViewProps {
  requests: CustomerRequest[];
  setRequests: React.Dispatch<React.SetStateAction<CustomerRequest[]>>;
  onConvertToTask: (request: CustomerRequest) => void;
}

const CustomerRequestsView: React.FC<CustomerRequestsViewProps> = ({ requests, setRequests, onConvertToTask }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Request Form States
  const [newTitle, setNewTitle] = useState('');
  const [newCustomer, setNewCustomer] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const filteredRequests = useMemo(() => {
    const lower = searchTerm.toLocaleLowerCase('tr-TR');
    return requests.filter(r => 
      r.title.toLocaleLowerCase('tr-TR').includes(lower) || 
      r.customerName.toLocaleLowerCase('tr-TR').includes(lower) ||
      r.description.toLocaleLowerCase('tr-TR').includes(lower)
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests, searchTerm]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
        try {
            const content = event.target?.result;
            let data: any[][] = [];

            if (file.name.endsWith('.csv')) {
                const result = Papa.parse(content as string, { skipEmptyLines: true });
                data = result.data;
            } else {
                const workbook = XLSX.read(content, { type: 'binary' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            }

            if (data.length < 2) throw new Error('Yetersiz veri.');

            const headers = data[0].map(h => String(h).toLocaleLowerCase('tr-TR'));
            const titleIdx = headers.findIndex(h => h.includes('başlık') || h.includes('title') || h.includes('talep'));
            const descIdx = headers.findIndex(h => h.includes('açıklama') || h.includes('description') || h.includes('not'));
            const customerIdx = headers.findIndex(h => h.includes('müşteri') || h.includes('customer') || h.includes('kaynak'));

            if (titleIdx === -1) throw new Error('"Başlık" sütunu bulunamadı.');

            const newRequests: CustomerRequest[] = data.slice(1)
                .filter(row => row[titleIdx])
                .map((row, i) => ({
                    id: `req-${Date.now()}-${i}`,
                    title: String(row[titleIdx] || ''),
                    description: String(descIdx !== -1 ? row[descIdx] || '' : ''),
                    customerName: String(customerIdx !== -1 ? row[customerIdx] || 'Bilinmiyor' : 'Bilinmiyor'),
                    createdAt: new Date().toISOString(),
                    status: 'New'
                }));

            setRequests(prev => [...prev, ...newRequests]);
            alert(`${newRequests.length} talep başarıyla aktarıldı.`);
        } catch (err) {
            alert('Hata: ' + (err instanceof Error ? err.message : 'Bilinmeyen hata'));
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (file.name.endsWith('.csv')) reader.readAsText(file);
    else reader.readAsBinaryString(file);
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newReq: CustomerRequest = {
        id: `req-manual-${Date.now()}`,
        title: newTitle.trim(),
        customerName: newCustomer.trim() || 'Bilinmiyor',
        description: newDescription.trim(),
        createdAt: new Date().toISOString(),
        status: 'New'
    };

    setRequests(prev => [newReq, ...prev]);
    setIsModalOpen(false);
    setNewTitle('');
    setNewCustomer('');
    setNewDescription('');
  };

  const handleDelete = (id: string) => {
      if (window.confirm('Bu talebi silmek istediğinize emin misiniz?')) {
          setRequests(prev => prev.filter(r => r.id !== id));
      }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center space-x-4">
            <div className="p-3 bg-purple-600 rounded-2xl text-white shadow-lg">
                <i className="fa-solid fa-users-viewfinder text-xl"></i>
            </div>
            <div>
                <h2 className="text-2xl font-black text-gray-800 dark:text-white">Müşteri İstekleri</h2>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Gelen Talepler ve Beklentiler</p>
            </div>
        </div>

        <div className="flex items-center space-x-3">
            <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-purple-200 dark:shadow-none transition-all font-black text-xs flex items-center space-x-2"
            >
                <i className="fa-solid fa-plus"></i>
                <span>YENİ İSTEK EKLE</span>
            </button>
            <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".csv, .xlsx, .xls" />
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-200 dark:shadow-none transition-all font-black text-xs flex items-center space-x-2"
            >
                {isImporting ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-file-import"></i>}
                <span>DIŞARDAN AKTAR (Excel/CSV)</span>
            </button>
        </div>
      </div>

      {/* Search and List */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
              <div className="relative max-w-md">
                  <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                  <input 
                    type="text" 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    placeholder="Taleplerde veya müşteri adında ara..."
                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none transition-all text-sm shadow-inner"
                  />
              </div>
          </div>

          <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {filteredRequests.length > 0 ? filteredRequests.map(request => (
                  <div key={request.id} className={`p-6 hover:bg-gray-50/50 dark:hover:bg-gray-700/10 transition-all flex flex-col md:flex-row md:items-start gap-6 ${request.status === 'Converted' ? 'opacity-60 bg-gray-50/30' : ''}`}>
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center text-xl font-black">
                          {request.customerName.charAt(0)}
                      </div>
                      
                      <div className="flex-grow space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                             <h4 className="text-base font-black text-gray-800 dark:text-white leading-tight">{request.title}</h4>
                             {request.status === 'Converted' ? (
                                 <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-200">GÖREVE DÖNÜŞTÜ</span>
                             ) : (
                                 <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-blue-200">YENİ TALEP</span>
                             )}
                          </div>
                          
                          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed italic">{request.description || 'Açıklama belirtilmemiş.'}</p>
                          
                          <div className="flex items-center space-x-4 text-[10px] font-black text-gray-400 uppercase tracking-widest pt-2">
                              <span><i className="fa-solid fa-user mr-1.5 text-purple-400"></i> {request.customerName}</span>
                              <span><i className="fa-solid fa-calendar mr-1.5 text-purple-400"></i> {new Date(request.createdAt).toLocaleDateString('tr-TR')}</span>
                          </div>
                      </div>

                      <div className="flex-shrink-0 flex items-center space-x-2">
                          {request.status !== 'Converted' && (
                              <button 
                                onClick={() => onConvertToTask(request)}
                                className="bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white px-4 py-2 rounded-xl text-xs font-black transition-all border border-blue-100 hover:border-blue-600 shadow-sm"
                                title="Bu talebi yeni bir görev olarak aç"
                              >
                                  GÖREVİ OLUŞTUR
                              </button>
                          )}
                          <button 
                            onClick={() => handleDelete(request.id)}
                            className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                            title="Talebi Sil"
                          >
                              <i className="fa-solid fa-trash-can text-sm"></i>
                          </button>
                      </div>
                  </div>
              )) : (
                  <div className="py-20 flex flex-col items-center justify-center text-center px-6">
                      <div className="w-24 h-24 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center text-4xl text-gray-200 mb-6">
                          <i className="fa-solid fa-inbox"></i>
                      </div>
                      <h3 className="text-xl font-black text-gray-800 dark:text-white">Henüz Müşteri Talebi Yok</h3>
                      <p className="text-sm text-gray-400 max-w-sm mt-2">Butonları kullanarak yeni istek ekleyebilir veya Excel/CSV dosyası yükleyebilirsiniz.</p>
                  </div>
              )}
          </div>
      </div>

      {/* Manual Add Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
                  <form onSubmit={handleManualAdd}>
                    <div className="p-6 border-b dark:border-gray-700 bg-purple-600 text-white flex justify-between items-center">
                        <h2 className="text-lg font-black flex items-center">
                            <i className="fa-solid fa-plus-circle mr-3"></i>
                            Yeni Müşteri Talebi
                        </h2>
                        <button type="button" onClick={() => setIsModalOpen(false)} className="hover:rotate-90 transition-transform"><i className="fa-solid fa-times"></i></button>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Talep Başlığı</label>
                            <input 
                                type="text" 
                                required
                                value={newTitle} 
                                onChange={e => setNewTitle(e.target.value)}
                                placeholder="Örn: Yeni Rapor Tasarımı"
                                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm text-gray-800 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Müşteri / Kaynak</label>
                            <input 
                                type="text" 
                                value={newCustomer} 
                                onChange={e => setNewCustomer(e.target.value)}
                                placeholder="Örn: Bilgi İşlem Md."
                                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm text-gray-800 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Açıklama</label>
                            <textarea 
                                rows={4}
                                value={newDescription} 
                                onChange={e => setNewDescription(e.target.value)}
                                placeholder="Talebin detaylarını buraya yazın..."
                                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-sm text-gray-800 dark:text-white resize-none"
                            />
                        </div>
                    </div>

                    <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-end space-x-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-700 dark:hover:text-white transition-colors">Vazgeç</button>
                        <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl text-xs font-black shadow-lg shadow-purple-200 dark:shadow-none transition-all">İSTEĞİ KAYDET</button>
                    </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default CustomerRequestsView;
