import { describe, expect, it } from 'vitest';
import { TaskStatus } from '../../types';
import type { JiraIssueRecord } from '../integrations';
import { buildLanes, shiftSprintSettings } from '../timelinePlan';
import { createProject } from '../workspace';
import { applyJiraSprintTransfer, JiraSprintTransfer, previewJiraSprintTransfer } from './jiraSprintImport';
import { issueToTask } from './jiraImport';

const today = new Date('2026-11-24T08:00:00Z');
const issue = (key: string, extras: Partial<JiraIssueRecord> = {}): JiraIssueRecord => ({
    key, summary: key, description: '', issueType: 'Task', status: 'Açık', statusCategory: 'new', priority: 'Medium',
    assignee: 'Ece', created: null, resolved: null, components: [], labels: [], fixVersions: ['2026.2'],
    storyPoints: null, originalEstimateSeconds: null, timeSpentSeconds: null, blockedBy: [], transitions: [], ...extras,
});
const request = (issues: JiraIssueRecord[]): JiraSprintTransfer => ({
    projectKey: 'MKS', sprint: { id: 7, name: 'Jira Kasım', state: 'active', startDate: '2026-11-24T08:00:00Z' },
    issues, target: 'new', moveExisting: false, emptySource: issues.length === 0,
});

describe('Jira sprintini yerel plana aktar', () => {
    it('kopya sprinti bir kez oluşturur ve mevcut görevleri açık onayla taşır', () => {
        const p = createProject('Portal');
        const existing = issueToTask(issue('MKS-1'), { importedAt: today.toISOString(), defaultUnit: 'Genel' });
        p.tasks = [{ ...existing, name: 'Yerel başlık', version: 1, dueDate: '2026-11-30', fixVersion: 'Sürüm A' }];
        const done = issue('MKS-2', { status: 'Bitti', statusCategory: 'done' });
        const transfer = request([issue('MKS-1'), done, issue('MKS-2', { statusCategory: 'done' }), issue('ABC-5')]);
        expect(previewJiraSprintTransfer(p, transfer)).toMatchObject({ target: 2, added: 1, skipped: 1 });
        const copy = applyJiraSprintTransfer(p, transfer, ['jira-mks-2'], today).project;
        expect(copy.settings.sprintNames?.[2]).toBe('Jira Kasım');
        expect(copy.tasks[0]).toBe(p.tasks[0]);
        expect(copy.tasks[1]).toMatchObject({ id: 'jira-mks-2-2', jiraId: 'MKS-2', version: 2, includeInSprints: true, status: TaskStatus.Done });
        expect(buildLanes(copy)[2].tasks).toHaveLength(1);
        expect(applyJiraSprintTransfer(copy, transfer, [], today).project).toBe(copy);
        const moved = applyJiraSprintTransfer(copy, { ...transfer, moveExisting: true }, [], today);
        expect(moved).toMatchObject({ target: 2, added: 0, moved: 1, unchanged: 1 });
        expect(moved.project.tasks[0]).toMatchObject({ id: existing.id, name: 'Yerel başlık', dueDate: '2026-11-30', fixVersion: 'Sürüm A', version: 2 });
        expect(moved.project.settings.jiraSprintImports?.['MKS:7']).toMatchObject({ localSprint: 2, startDate: '2026-11-24T08:00:00Z' });
    });

    it('boş sprinti saklar, sprint numaraları değişince Jira bağlantısını taşır', () => {
        const p = createProject('Portal');
        p.settings.sprintNames = { 1: 'Yerel plan' };
        const copy = applyJiraSprintTransfer(p, request([]), [], today).project;
        expect(buildLanes(copy).at(-1)).toMatchObject({ version: 2, tasks: [] });
        const shifted = shiftSprintSettings(copy.settings, 1, 1);
        expect(shifted.sprintNames).toEqual({ 2: 'Yerel plan', 3: 'Jira Kasım' });
        expect(shifted.jiraSprintImports?.['MKS:7'].localSprint).toBe(3);
        expect(shiftSprintSettings(shifted, 3, -1).jiraSprintImports).toEqual({});
    });
});
