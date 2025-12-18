
import React from 'react';

interface AddSprintColumnProps {
    onClick: () => void;
}

const AddSprintColumn: React.FC<AddSprintColumnProps> = ({ onClick }) => {
    return (
        <div className="w-2 hover:w-16 h-full transition-all duration-300 ease-in-out group/add-col flex items-center justify-center relative z-10">
            {/* Görünmez hover alanı */}
            <div className="absolute inset-0 cursor-pointer" onClick={onClick} />
            
            {/* Ortadaki çizgi (Rehber) */}
            <div className="w-px h-full bg-transparent group-hover/add-col:bg-blue-200 dark:group-hover/add-col:bg-blue-800 transition-colors pointer-events-none" />
            
            {/* Mavi Artı Butonu */}
            <button 
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className="w-10 h-10 rounded-full bg-blue-500 text-white shadow-lg flex items-center justify-center opacity-0 scale-50 group-hover/add-col:opacity-100 group-hover/add-col:scale-100 transition-all duration-300 hover:bg-blue-600 hover:rotate-90 z-20"
                title="Buraya Yeni Sürüm Ekle"
            >
                <i className="fa-solid fa-plus text-lg"></i>
            </button>
            
            {/* Tooltip Etiketi */}
            <div className="absolute top-8 pointer-events-none opacity-0 group-hover/add-col:opacity-100 transition-opacity whitespace-nowrap bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded shadow-md z-30">
                SÜRÜM EKLE
            </div>
        </div>
    );
};

export default AddSprintColumn;
