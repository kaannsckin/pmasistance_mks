
import React from 'react';

interface PlaceholderViewProps {
  title: string;
  message: string;
  icon: string;
}

const PlaceholderView: React.FC<PlaceholderViewProps> = ({ title, message, icon }) => {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
      <div className="text-6xl text-blue-300 dark:text-blue-600 mb-4">
        <i className={`fa-solid ${icon}`}></i>
      </div>
      <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">{title}</h2>
      <p className="max-w-md text-gray-600 dark:text-gray-300">{message}</p>
      <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
        <p className="text-sm text-gray-500 dark:text-gray-400">
            <i className="fa-solid fa-wrench mr-2"></i>
            Bu özellik geliştirme aşamasındadır.
        </p>
      </div>
    </div>
  );
};

export default PlaceholderView;
