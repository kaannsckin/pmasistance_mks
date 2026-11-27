import { describe, expect, it } from 'vitest';
import { issueKind, issueKindMeta, kindOfJiraType } from './issueTypeMeta';
import { issueToTask } from './planning/jiraImport';
import { JiraIssueRecord } from './integrations';

describe('kayıt türü görünümü', () => {
    it('Jira tür adları ayrı türlere düşer', () => {
        expect(['Bug', 'Change Request', 'Task', 'Sub-task', 'Story', 'Epic', 'Improvement', 'New Feature', 'Alt Görev', 'Değişiklik Talebi', 'Spike'].map(kindOfJiraType))
            .toEqual(['bug', 'change', 'task', 'subtask', 'story', 'epic', 'improvement', 'feature', 'subtask', 'change', 'other']);
        expect(kindOfJiraType('')).toBeUndefined();
    });

    it('uygulamadaki tür elle değiştirildiyse o geçerli; Jira adı yoksa uygulamadaki tür', () => {
        expect(issueKind({ issueType: 'task', jiraIssueType: 'Sub-task' })).toBe('subtask');
        expect(issueKind({ issueType: 'other', jiraIssueType: 'Change Request' })).toBe('change');
        expect(issueKind({ issueType: 'bug', jiraIssueType: 'Sub-task' })).toBe('bug');
        expect(issueKind({ issueType: 'improvement' })).toBe('improvement');
        expect(issueKind({})).toBeUndefined();
        expect(issueKindMeta({ issueType: 'other', jiraIssueType: 'Spike' })?.label).toBe('Spike');
        expect(issueKindMeta({ issueType: 'other', jiraIssueType: 'Change Request' })?.label).toBe('Değişiklik talebi');
    });

    it('Jira kaydından gelen görev tür adını taşır', () => {
        const t = issueToTask({ key: 'MKS-1', summary: 'x', issueType: 'Sub-task', labels: [], components: [], fixVersions: [], blockedBy: [], transitions: [] } as unknown as JiraIssueRecord, { importedAt: '2026-11-27T00:00:00Z', defaultUnit: 'Genel' });
        expect(t).toMatchObject({ issueType: 'task', jiraIssueType: 'Sub-task' });
    });
});
