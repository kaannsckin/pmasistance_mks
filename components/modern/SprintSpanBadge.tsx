import React from 'react';
import { Task } from '../../types';
import { lastSprintOf, sprintSpanOf } from '../../utils/sprintSpan';
import { sprintLabel } from './taskMeta';

/**
 * Sprintler arası devam eden görevin etiketi: "Sprintler arası · 2 → 3".
 * `sprint` verilirse o sprintte görevin başladığı mı, devam ettiği mi yazılır.
 */
const SprintSpanBadge: React.FC<{ task: Pick<Task, 'version' | 'sprintSpan'>; sprint?: number; sprintNames?: Record<number, string> }> = ({ task, sprint, sprintNames }) => {
    const span = sprintSpanOf(task);
    if (span < 2) return null;
    const end = lastSprintOf(task);
    const phase = sprint === undefined ? '' : sprint === task.version ? 'Başlıyor · ' : sprint === end ? 'Son sprint · ' : 'Devam ediyor · ';
    return (
        <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-semibold m-tone-hold whitespace-nowrap self-start"
            title={`${sprintLabel(task.version, sprintNames)} ile ${sprintLabel(end, sprintNames)} arasında ${span} sprint sürer; efor sprintlere eşit bölünür.`}>
            {phase}Sprintler arası · {task.version} → {end}
        </span>
    );
};

export default SprintSpanBadge;
