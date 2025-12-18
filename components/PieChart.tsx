import React, { useState } from 'react';

interface PieChartData {
  label: string;
  value: number;
  color: string;
}

interface PieChartProps {
  data: PieChartData[];
  onClick?: (label: string) => void;
}

interface TooltipState {
    visible: boolean;
    content: string;
    x: number;
    y: number;
}

const PieChart: React.FC<PieChartProps> = ({ data, onClick }) => {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, content: '', x: 0, y: 0 });

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-500">Veri yok</div>;
  }
  let cumulative = 0;

  const slices = data.map(item => {
    const percentage = item.value / total;
    const startAngle = (cumulative / total) * 360;
    const endAngle = startAngle + percentage * 360;
    cumulative += item.value;

    const x1 = 50 + 40 * Math.cos(Math.PI * startAngle / 180);
    const y1 = 50 + 40 * Math.sin(Math.PI * startAngle / 180);
    const x2 = 50 + 40 * Math.cos(Math.PI * endAngle / 180);
    const y2 = 50 + 40 * Math.sin(Math.PI * endAngle / 180);
    const largeArcFlag = percentage > 0.5 ? 1 : 0;

    return {
      path: `M 50,50 L ${x1},${y1} A 40,40 0 ${largeArcFlag},1 ${x2},${y2} Z`,
      color: item.color,
      label: `${item.label}: ${item.value} (${(percentage * 100).toFixed(1)}%)`,
      originalLabel: item.label
    };
  });
  
  const handleMouseEnter = (e: React.MouseEvent, slice: { label: string }) => {
    setTooltip({
      visible: true,
      content: slice.label,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  return (
    <div className="relative flex flex-col md:flex-row items-center space-x-4">
      {tooltip.visible && (
        <div
          style={{
            position: 'fixed',
            top: tooltip.y,
            left: tooltip.x,
            transform: 'translate(10px, -25px)',
            pointerEvents: 'none',
          }}
          className="bg-gray-900 text-white text-xs rounded-md px-2 py-1 shadow-lg z-50 transition-opacity"
        >
          {tooltip.content}
        </div>
      )}
      <svg viewBox="0 0 100 100" className="w-32 h-32 md:w-40 md:h-40">
        {slices.map((slice, index) => (
          <path 
            key={index} 
            d={slice.path} 
            fill={slice.color}
            className={`cursor-pointer transition-opacity duration-200 hover:opacity-80 stroke-white dark:stroke-gray-800 stroke-[0.5] ${onClick ? 'hover:stroke-2' : ''}`}
            onMouseEnter={(e) => handleMouseEnter(e, slice)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick(slice.originalLabel);
            }}
          />
        ))}
      </svg>
      <div className="text-xs space-y-1 mt-4 md:mt-0 flex-grow">
        {data.map(item => (
          <div 
            key={item.label} 
            className={`flex items-center ${onClick ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded' : ''}`}
            onClick={() => onClick && onClick(item.label)}
          >
            <span className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: item.color }}></span>
            <span className="text-gray-700 dark:text-gray-300 truncate">{item.label}: {item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PieChart;