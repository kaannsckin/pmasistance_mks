import React from 'react';
import { Task } from '../../types';
import { issueKindMeta } from '../../utils/issueTypeMeta';
import { Icon } from './icons';

/** Kayıt türü: renkli simge + kısa ad (Jira'daki gibi; hata, görev, alt görev, değişiklik talebi tek bakışta ayrılır) */
const IssueTypeChip: React.FC<{ t: Pick<Task, 'issueType' | 'jiraIssueType'> }> = ({ t }) => {
    const m = issueKindMeta(t);
    if (!m) return null;
    return (
        <span title={t.jiraIssueType ? `Jira türü: ${t.jiraIssueType}` : `Tür: ${m.label}`} className="inline-flex items-center gap-1 min-w-0 font-semibold" style={{ color: m.color }}>
            <span aria-hidden="true" className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] flex-none" style={{ background: m.color, color: '#fff' }}><Icon name={m.icon} size={11} strokeWidth={2.6} /></span>
            <span className="truncate max-w-[120px] text-[12px]">{m.label}</span>
        </span>
    );
};

export default IssueTypeChip;
