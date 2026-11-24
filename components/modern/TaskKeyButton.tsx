import React from 'react';
import { Task } from '../../types';

/**
 * Görev kodu düğmesi: görevin Jira anahtarını (yoksa "Görev") düğme olarak
 * gösterir, tıklanınca görev ayrıntısını açar. Görev listelenen her yeni
 * ekranda görev kodu bu bileşenle gösterilir (bkz. AGENTS.md).
 */
const TaskKeyButton: React.FC<{ task: Pick<Task, 'jiraId' | 'name'>; onOpen: () => void; className?: string }> = ({ task, onOpen, className = '' }) => {
    const key = task.jiraId?.trim();
    return (
        <button type="button" onClick={onOpen} title={`${task.name} ayrıntısını aç`} aria-label={`${key ? `${key} ` : ''}${task.name} ayrıntısını aç`}
            className={`inline-flex items-center justify-center min-h-[32px] px-2.5 rounded-lg border-0 cursor-pointer m-tone-accent text-[13px] font-semibold m-tabular whitespace-nowrap flex-none ${className}`}>
            {key || 'Görev'}
        </button>
    );
};

export default TaskKeyButton;
