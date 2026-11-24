import React from 'react';
import { Task } from '../../types';
import { taskTimeTracking } from '../../utils/timeTracking';

export const formatHours = (v?: number): string => v === undefined ? '—' : `${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} sa`;

const TaskTimeTracking: React.FC<{ task: Task }> = ({ task }) => {
    const { original, spent, remaining, eac, progress, variance, overrun } = taskTimeTracking(task);
    if ([original, spent, remaining, task.aggregateOriginalEstimateHours, task.aggregateSpentHours, task.aggregateRemainingHours].every(v => v === undefined)) return null;
    const max = Math.max(original ?? 0, spent ?? 0, remaining ?? 0, 1);
    const bars = [
        { label: 'Tahmin', value: original, color: 'var(--m-accent)' },
        { label: 'Harcanan', value: spent, color: overrun ? 'var(--m-bad)' : 'var(--m-ok)' },
        { label: 'Kalan', value: remaining, color: 'var(--m-warn)' },
    ];
    return (
        <section aria-label="Zaman takibi" className="rounded-xl m-fill-2 p-3.5 flex flex-col gap-2">
            <h3 className="m-0 text-[15px] font-semibold m-text">Zaman takibi</h3>
            {bars.map(b => (
                <div key={b.label} className="grid grid-cols-[80px_minmax(0,1fr)_auto] gap-2 items-center text-[13px]">
                    <span className="m-text-2">{b.label}</span>
                    <span className="block h-2 rounded-full m-fill overflow-hidden" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${(b.value ?? 0) / max * 100}%`, background: b.color }} /></span>
                    <span className="m-text m-tabular">{formatHours(b.value)}</span>
                </div>
            ))}
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] m-text-2">
                {eac !== undefined && <span>Tamamlanma tahmini {formatHours(eac)}</span>}
                {progress !== undefined && <span>İlerleme {progress.toLocaleString('tr-TR', { style: 'percent', maximumFractionDigits: 1 })}</span>}
                {variance !== undefined && <span className={variance > 0 ? 'm-ink-bad' : ''}>Sapma {variance > 0 ? '+' : ''}{formatHours(variance)}</span>}
                {overrun && <span className="font-semibold m-ink-bad">Efor aşımı</span>}
            </div>
            {[task.aggregateOriginalEstimateHours, task.aggregateSpentHours, task.aggregateRemainingHours].some(v => v !== undefined) && (
                <p className="m-0 text-[13px] m-text-2">Alt görevler dahil · Tahmin {formatHours(task.aggregateOriginalEstimateHours)} · Harcanan {formatHours(task.aggregateSpentHours)} · Kalan {formatHours(task.aggregateRemainingHours)}</p>
            )}
        </section>
    );
};

export default TaskTimeTracking;
