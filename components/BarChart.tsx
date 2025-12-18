import React, { useState } from 'react';

interface BarChartData {
  label: string;
  value: number;
  color: string;
}

interface BarChartProps {
  data: BarChartData[];
  onClick?: (label: string) => void;
}

interface TooltipState {
  visible: boolean;
  content: string;
  x: number;
  y: number;
}

const BarChart: React.FC<BarChartProps> = ({ data, onClick }) => {
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, content: '', x: 0, y: 0 });

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-500">Veri yok</div>;
  }
  const maxValue = Math.max(...data.map(d => d.value), 0);
  const chartHeight = 150;
  const barWidth = 30;
  const barMargin = 15;

  const handleMouseEnter = (e: React.MouseEvent, item: BarChartData) => {
    setTooltip({
      visible: true,
      content: `${item.label}: ${item.value}`,
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
    <div className="relative w-full overflow-x-auto">
      {tooltip.visible && (
        <div
          style={{
            position: 'fixed',
            top: tooltip.y,
            left: tooltip.x,
            transform: 'translate(10px, -25px)', // Position tooltip above and to the right of the cursor
            pointerEvents: 'none',
          }}
          className="bg-gray-900 text-white text-xs rounded-md px-2 py-1 shadow-lg z-50 transition-opacity"
        >
          {tooltip.content}
        </div>
      )}
      <svg width={(barWidth + barMargin) * data.length} height={chartHeight + 20}>
        <g className="bars">
          {data.map((item, index) => {
            const barHeight = maxValue > 0 ? (item.value / maxValue) * chartHeight : 0;
            const x = index * (barWidth + barMargin);
            const y = chartHeight - barHeight;
            return (
              <g key={item.label} onClick={() => onClick && onClick(item.label)}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={item.color}
                  rx="3"
                  ry="3"
                  className={`opacity-80 hover:opacity-100 transition-opacity ${onClick ? 'cursor-pointer hover:stroke-2 hover:stroke-gray-400' : ''}`}
                  onMouseEnter={(e) => handleMouseEnter(e, item)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                />
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 15}
                  textAnchor="middle"
                  className="text-xs fill-current text-gray-600 dark:text-gray-300 pointer-events-none"
                >
                  <title>{item.label}</title>
                  {item.label.length > 5 ? `${item.label.substring(0, 5)}...` : item.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default BarChart;