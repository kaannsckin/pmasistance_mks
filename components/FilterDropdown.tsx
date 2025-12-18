
import React from 'react';

interface FilterDropdownProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ label, value, onChange, options }) => {
  const id = `filter-${label.toLowerCase().replace(' ', '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
      >
        {options.map(option => (
          <option key={option} value={option}>{option === 'all' ? `Tüm ${label}ler` : option}</option>
        ))}
      </select>
    </div>
  );
};

export default FilterDropdown;
