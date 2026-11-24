import { JiraSprint, Project } from '../../types';
import type { JiraIssueRecord } from '../integrations';
import { lastPlannedSprint } from '../timelinePlan';
import { mergeJiraIssues } from './jiraImport';

export interface JiraSprintTransfer {
    projectKey: string;
    sprint: JiraSprint;
    issues: JiraIssueRecord[];
    target: number | 'new';
    moveExisting: boolean;
    emptySource: boolean;
}

const issueKey = (key: string | undefined) => (key || '').trim().toUpperCase();

export const jiraSprintSourceKey = (projectKey: string, sprintId: number) => `${issueKey(projectKey)}:${sprintId}`;

export const previewJiraSprintTransfer = (project: Project, transfer: JiraSprintTransfer) => {
    const sourceKey = jiraSprintSourceKey(transfer.projectKey, transfer.sprint.id);
    const linked = project.settings.jiraSprintImports?.[sourceKey];
    const target = transfer.target === 'new' ? linked?.localSprint || lastPlannedSprint(project) + 1 : transfer.target;
    const projectPrefix = `${issueKey(transfer.projectKey)}-`;
    const tasksByKey = new Map(project.tasks.filter(task => task.jiraId).map(task => [issueKey(task.jiraId), task]));
    const issues = new Map(transfer.issues.filter(issue => issueKey(issue.key).startsWith(projectPrefix)).map(issue => [issueKey(issue.key), issue]));
    const rows = [...issues.values()].map(issue => {
        const existing = tasksByKey.get(issueKey(issue.key));
        const previousSprint = existing?.version || 0;
        const action = !existing ? 'create' : previousSprint === target && existing.includeInSprints !== false ? 'same'
            : previousSprint > 0 && previousSprint !== target && !transfer.moveExisting ? 'skip' : 'move';
        return { issue, existing, previousSprint, action };
    });
    const added = rows.filter(row => row.action === 'create').length;
    const moved = rows.filter(row => row.action === 'move').length;
    const skipped = rows.filter(row => row.action === 'skip').length;
    const unchanged = rows.filter(row => row.action === 'same').length;
    const valid = Number.isSafeInteger(target) && target > 0 && target <= lastPlannedSprint(project) + 1;
    const canApply = valid && (added + moved > 0 || (unchanged > 0 && linked?.localSprint !== target) || (transfer.emptySource && !linked));
    return { sourceKey, target, rows, added, moved, skipped, unchanged, canApply };
};

export const applyJiraSprintTransfer = (project: Project, transfer: JiraSprintTransfer, takenIds: Iterable<string>, now: Date) => {
    const preview = previewJiraSprintTransfer(project, transfer);
    if (!preview.canApply) return { project, ...preview };
    const fresh = preview.rows.filter(row => row.action === 'create').map(row => row.issue);
    const idsToMove = new Set(preview.rows.flatMap(row => row.action === 'move' && row.existing ? [row.existing.id] : []));
    const merged = mergeJiraIssues(project.tasks, fresh, { importedAt: now.toISOString(), defaultUnit: project.resources[0]?.unit || 'Genel' }, takenIds);
    const sprintNames = { ...project.settings.sprintNames };
    if (preview.target > lastPlannedSprint(project)) sprintNames[preview.target] = transfer.sprint.name;
    const { name, startDate, endDate } = transfer.sprint;
    const jiraSprintImports = { ...project.settings.jiraSprintImports, [preview.sourceKey]: { localSprint: preview.target, name, startDate, endDate } };
    const next = {
        ...project,
        tasks: merged.tasks.map((task, i) => (i >= project.tasks.length || idsToMove.has(task.id)
            ? { ...task, version: preview.target, includeInSprints: true } : task)),
        settings: { ...project.settings, sprintNames, jiraSprintImports },
        updatedAt: now.toISOString(),
    };
    return { project: next, ...preview };
};
