import React from 'react';
import { Sprint } from '../types';

interface DeleteSprintModalProps {
  sprint: Sprint;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteSprintModal: React.FC<DeleteSprintModalProps> = ({ sprint, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md">
        <div className="p-6 text-center">
          <i className="fa-solid fa-triangle-exclamation text-4xl text-red-500 mx-auto mb-4"></i>
          <h3 className="mb-5 text-lg font-normal text-gray-600 dark:text-gray-300">
            "{sprint.title}" silinecektir. İçindeki tüm görevler Backlog'a taşınacaktır. Onaylıyor musunuz?
          </h3>
          <button 
            onClick={onConfirm} 
            className="text-white bg-red-600 hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300 dark:focus:ring-red-800 font-medium rounded-lg text-sm inline-flex items-center px-5 py-2.5 text-center mr-2"
          >
            Evet, Sil
          </button>
          <button 
            onClick={onCancel} 
            className="text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-gray-200 rounded-lg border border-gray-200 text-sm font-medium px-5 py-2.5 hover:text-gray-900 focus:z-10 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-500 dark:hover:text-white dark:hover:bg-gray-600 dark:focus:ring-gray-600"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteSprintModal;
