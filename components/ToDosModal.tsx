
import React from 'react';

interface ToDo {
  noteId: string;
  content: string;
  date: string;
  completed: boolean;
  lineIndex: number;
}

interface ToDosModalProps {
  todos: ToDo[];
  onClose: () => void;
  onToggle: (noteId: string, lineIndex: number) => void;
}

const ToDosModal: React.FC<ToDosModalProps> = ({ todos, onClose, onToggle }) => {
  const pendingTodos = todos.filter(t => !t.completed);
  const completedTodos = todos.filter(t => t.completed);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-6 border-b dark:border-gray-700 bg-emerald-600 text-white">
          <div className="flex items-center space-x-3">
             <div className="bg-white/20 p-2 rounded-lg">
                <i className="fa-solid fa-check-double text-xl"></i>
             </div>
             <div>
                <h2 className="text-xl font-black">ToDo Listesi</h2>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">{pendingTodos.length} Bekleyen, {completedTodos.length} Tamamlanan</p>
             </div>
          </div>
          <button onClick={onClose} className="bg-black/10 hover:bg-black/20 w-8 h-8 rounded-full transition-colors flex items-center justify-center">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>
        
        <div className="flex-grow overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {/* Pending Section */}
          <section>
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>
                  Bekleyen Görevler
              </h3>
              <div className="space-y-3">
                  {pendingTodos.length > 0 ? pendingTodos.map((todo, idx) => (
                    <div key={idx} onClick={() => onToggle(todo.noteId, todo.lineIndex)} className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 group hover:border-emerald-400 transition-all flex items-center space-x-4 cursor-pointer">
                       <i className="fa-regular fa-square text-emerald-500 text-lg flex-shrink-0"></i>
                       <div className="flex-grow min-w-0">
                           <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-bold">
                             {todo.content}
                           </p>
                           <span className="text-[9px] text-gray-400 font-bold uppercase">{new Date(todo.date).toLocaleDateString('tr-TR')}</span>
                       </div>
                    </div>
                  )) : (
                    <p className="text-xs text-gray-400 italic text-center py-4">Bekleyen görev bulunmuyor.</p>
                  )}
              </div>
          </section>

          {/* Completed Section */}
          {completedTodos.length > 0 && (
            <section className="opacity-60">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2"></span>
                    Tamamlananlar
                </h3>
                <div className="space-y-3">
                    {completedTodos.map((todo, idx) => (
                      <div key={idx} onClick={() => onToggle(todo.noteId, todo.lineIndex)} className="bg-gray-100 dark:bg-gray-800/40 p-4 rounded-2xl border border-transparent dark:border-gray-700 flex items-center space-x-4 cursor-pointer grayscale line-through decoration-gray-400">
                         <i className="fa-solid fa-square-check text-emerald-500 text-lg flex-shrink-0"></i>
                         <div className="flex-grow min-w-0">
                             <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                               {todo.content}
                             </p>
                         </div>
                      </div>
                    ))}
                </div>
            </section>
          )}
        </div>

        <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 text-center">
             <button onClick={onClose} className="text-gray-500 font-black text-xs uppercase tracking-widest hover:text-gray-800 dark:hover:white transition-colors">
                 Kapat
             </button>
        </div>
      </div>
    </div>
  );
};

export default ToDosModal;
