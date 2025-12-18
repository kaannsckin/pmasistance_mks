import React, { useState } from 'react';
import { Task } from '../types';

interface TeamsMessageModalProps {
  task: Task;
  onClose: () => void;
}

const TeamsMessageModal: React.FC<TeamsMessageModalProps> = ({ task, onClose }) => {
  const initialMessage = `Selamlar ${task.resourceName.split(' ')[0]},

Aşağıdaki görev için sizden iyi, ortalama ve en kötü gün sayısı tahminlerini alabilir miyim?

Görev: "${task.name}" (${task.jiraId})

Teşekkürler.`;

  const [message, setMessage] = useState(initialMessage);

  const handleSend = () => {
    const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=&message=${encodeURIComponent(message)}`;
    window.open(teamsUrl, '_blank');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-bold flex items-center">
            <i className="fa-brands fa-microsoft-teams text-blue-500 mr-2"></i>
            Teams Mesaj Taslağı
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white">&times;</button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            <strong>Kime:</strong> {task.resourceName}
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="w-full p-2 border rounded-md bg-black text-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-end items-center p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border dark:border-gray-600 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700">
            İptal
          </button>
          <button
            type="button"
            onClick={handleSend}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 flex items-center space-x-2"
          >
            <i className="fa-solid fa-paper-plane"></i>
            <span>Teams'de Aç ve Gönder</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamsMessageModal;