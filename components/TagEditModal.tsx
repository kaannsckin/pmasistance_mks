
import React, { useState } from 'react';

interface TagEditModalProps {
  tag: string;
  onSave: (oldTag: string, newTag: string) => void;
  onClose: () => void;
}

const TagEditModal: React.FC<TagEditModalProps> = ({ tag, onSave, onClose }) => {
  const [newTagName, setNewTagName] = useState(tag);

  const handleSave = () => {
      const sanitized = newTagName.replace(/[^\w-ğüşöçİĞÜŞÖÇı]/g, '').trim();
      if (sanitized && sanitized !== tag) {
          onSave(tag, sanitized);
      } else {
          onClose();
      }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
        <div className="p-6 border-b dark:border-gray-700">
            <h2 className="text-lg font-black text-gray-800 dark:text-white flex items-center">
                <i className="fa-solid fa-pencil mr-3 text-purple-600"></i>
                Etiketi Düzenle
            </h2>
            <p className="text-xs text-gray-400 mt-1">Bu etiketi değiştirdiğinizde tüm notlarınızda güncellenecektir.</p>
        </div>
        
        <div className="p-6 space-y-4">
            <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Yeni Etiket Adı</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-600 font-black">#</span>
                    <input 
                        type="text" 
                        value={newTagName} 
                        onChange={(e) => setNewTagName(e.target.value)}
                        autoFocus
                        className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-gray-800 dark:text-white font-bold"
                    />
                </div>
            </div>
        </div>

        <div className="flex justify-end items-center p-6 space-x-4 bg-gray-50 dark:bg-gray-900/50">
            <button onClick={onClose} className="text-gray-500 font-black text-xs uppercase tracking-widest hover:text-gray-800 dark:hover:text-white transition-colors">
                İptal
            </button>
            <button 
                onClick={handleSave}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-xl text-xs font-black shadow-lg shadow-purple-200 dark:shadow-none transition-all"
            >
                GÜNCELLE
            </button>
        </div>
      </div>
    </div>
  );
};

export default TagEditModal;
