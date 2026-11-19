import React from 'react';
import { Task, TaskStatus } from '../../types';
import { knownWorkflow, workflowOptions, workflowValue } from '../../utils/workflow';

/**
 * Ayrıntılı iş akışı durumu seçici (Jira'daki gibi: Açık, Analizde, Testte,
 * Çözüldü, Kapandı …), kategoriye göre gruplu. Seçim, kategoriyi
 * (task.status) ve ayrıntılı durumu (task.jiraStatus) birlikte değiştirir.
 */
const WorkflowSelect: React.FC<{
    value: Pick<Task, 'status' | 'jiraStatus'>;
    /** Projede görülen Jira'ya özgü durumlar da listelensin */
    tasks?: Pick<Task, 'status' | 'jiraStatus'>[];
    onChange: (patch: { status: TaskStatus; jiraStatus: string }) => void;
    id?: string;
    className?: string;
    disabled?: boolean;
    'aria-label'?: string;
}> = ({ value, tasks, onChange, id, className = 'm-input', disabled, ...rest }) => {
    const groups = workflowOptions([value, ...(tasks || [])]);
    return (
        <select id={id} className={className} disabled={disabled} aria-label={rest['aria-label'] || 'Durum'} value={workflowValue(value)}
            onChange={e => {
                const key = e.target.value;
                const s = knownWorkflow(key) || groups.flatMap(g => g.statuses).find(x => x.key === key);
                if (s) onChange({ status: s.category, jiraStatus: s.key });
            }}>
            {groups.map(g => (
                <optgroup key={g.category} label={g.label}>
                    {g.statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </optgroup>
            ))}
        </select>
    );
};

export default WorkflowSelect;
