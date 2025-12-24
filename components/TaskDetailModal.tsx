
import React, { useState } from 'react';
import { Task, WorkPackage } from '../types';

interface TaskDetailModalProps {
  task: Task;
  workPackages: WorkPackage[];
  onClose: () => void;
  onEdit: (task: Task) => void;
  onSave: (task: Task) => void;
}

const DetailItem: React.FC<{ label: string; value: React.ReactNode; icon: string }> = ({ label, value, icon }) => (
    <div className="flex flex-col">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center"><i className={`fa-solid ${icon} mr-2 w-4 text-center`}></i>{label}</span>
        <span className="text-md text-gray-900 dark:text-white mt-1">{value || '-'}</span>
    </div>
);

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, workPackages, onClose, onEdit, onSave }) => {
  const pertTime = task.time.avg > 0 ? ((task.time.best + 4 * task.time.avg + task.time.worst) / 6).toFixed(1) : 'N/A';
  const workPackage = workPackages.find(wp => wp.id === task.workPackageId);
  const [newComment, setNewComment] = useState('');

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const updatedTask: Task = {
        ...task,
        comments: [
            ...(task.comments || []),
            {
                author: 'Siz',
                text: newComment.trim(),
                date: new Date().toISOString()
            }
        ]
    };
    onSave(updatedTask);
    setNewComment('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-5 border-b dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{task.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{task.jiraId}</p>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => onEdit(task)} 
              title="Görevi Düzenle" 
              className="text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <i className="fa-solid fa-pencil"></i>
            </button>
            <button 
              onClick={onClose} 
              title="Kapat" 
              className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <i className="fa-solid fa-times"></i>
            </button>
          </div>
        </div>
        
        <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <DetailItem label="İş Paketi" value={workPackage?.name} icon="fa-briefcase" />
            <DetailItem label="Öncelik" value={task.priority} icon="fa-triangle-exclamation" />
            <DetailItem label="Kaynak Adı" value={task.resourceName} icon="fa-user" />
            <DetailItem label="Birim" value={task.unit} icon="fa-cube" />
            <DetailItem label="Sürüm" value={task.version} icon="fa-layer-group" />
            <DetailItem label="Durum" value={task.status} icon="fa-tasks-alt" />
            <DetailItem label="Öncül" value={task.predecessor ? `Task ${task.predecessor}` : 'Yok'} icon="fa-link" />
            <DetailItem label="PERT Süresi (gün)" value={pertTime} icon="fa-calculator" />
            <DetailItem label="Sürüm Planlaması" value={task.includeInSprints !== false ? 'Dahil' : 'Hariç'} icon="fa-calendar-check" />
          </div>

          <div>
             <span className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center mb-2"><i className="fa-solid fa-clock mr-2 w-4 text-center"></i>Zaman Tahminleri (İyi/Ort/Kötü)</span>
             <div className="flex space-x-2">
                <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full dark:bg-green-900 dark:text-green-300">{task.time.best} gün</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full dark:bg-blue-900 dark:text-blue-300">{task.time.avg} gün</span>
                <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full dark:bg-red-900 dark:text-red-300">{task.time.worst} gün</span>
             </div>
          </div>
          
          {task.labels && task.labels.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center mb-2"><i className="fa-solid fa-tags mr-2 w-4 text-center"></i>Etiketler</h4>
              <div className="flex flex-wrap gap-2">
                {task.labels.map((label, index) => (
                  <span key={index} className="px-2 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded-full dark:bg-gray-600 dark:text-gray-200">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center"><i className="fa-solid fa-file-alt mr-2 w-4 text-center"></i>Açıklama</h4>
            <p className="mt-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{task.notes || 'Açıklama eklenmemiş.'}</p>
          </div>

          <div className="space-y-4 pt-4 border-t dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center"><i className="fa-solid fa-comments mr-2 w-4 text-center"></i>Yorumlar ({task.comments?.length || 0})</h4>
            <div className="space-y-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
              {task.comments?.map((comment, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {comment.author.charAt(0)}
                  </div>
                  <div className="flex-grow bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs">{comment.author}</span>
                      <span className="text-xs text-gray-400">{new Date(comment.date).toLocaleDateString('tr-TR')}</span>
                    </div>
                    <p className="text-sm mt-1">{comment.text}</p>
                  </div>
                </div>
              ))}
              {!task.comments?.length && <p className="text-sm text-gray-400 italic text-center py-4">Henüz yorum yapılmamış.</p>}
            </div>
            <div className="flex space-x-2">
              <input 
                type="text"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                placeholder="Yorumunuzu yazın..."
                className="flex-grow bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
              <button onClick={handleAddComment} className="bg-primary text-white px-4 rounded-lg font-bold text-sm hover:opacity-90">Gönder</button>
            </div>
          </div>

        </div>
        <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-right">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Kapat</button>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;
