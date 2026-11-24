import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../types';
import type { JiraIssueRecord } from './integrations';
import { jiraTimeFields, secondsToHours, taskTimeTracking, totalTimeTracking } from './timeTracking';

describe('Jira zaman takibi', () => {
    it('boş Jira alanını ve sıfır saati ayırır, saniyeleri yuvarlamaz', () => {
        expect(secondsToHours(null)).toBeUndefined();
        expect(secondsToHours(undefined)).toBeUndefined();
        expect(secondsToHours(0)).toBe(0);
        expect(secondsToHours(1)).toBe(1 / 3600);
        const issue = { originalEstimateSeconds: null, timeSpentSeconds: 0, remainingEstimateSeconds: 900,
            aggregateOriginalEstimateSeconds: 7200, aggregateRemainingEstimateSeconds: null, aggregateTimeSpentSeconds: 0,
            parentKey: 'MKS-1', subtaskKeys: ['MKS-3'] } as JiraIssueRecord;
        expect(jiraTimeFields(issue, '2026-11-24')).toEqual({
            originalEstimateHours: undefined, actualHours: 0, remainingEstimateHours: 0.25,
            aggregateOriginalEstimateHours: 2, aggregateRemainingHours: undefined, aggregateSpentHours: 0,
            jiraParentKey: 'MKS-1', jiraSubtaskKeys: ['MKS-3'], timeTrackingAt: '2026-11-24',
        });
        expect(jiraTimeFields({ originalEstimateSeconds: 0, timeSpentSeconds: null } as JiraIssueRecord)).not.toHaveProperty('remainingEstimateHours');
    });

    it('EAC, ilerleme, sapma ve tahmini türetir', () => {
        const task = { status: TaskStatus.InProgress, originalEstimateHours: 4, actualHours: 3, remainingEstimateHours: 2 } as Task;
        expect(taskTimeTracking(task)).toMatchObject({ eac: 5, progress: 0.6, variance: 1, variancePct: 25, overrun: false });
        expect(taskTimeTracking({ ...task, remainingEstimateHours: 0 }).overrun).toBe(true);
        expect(taskTimeTracking({ ...task, status: TaskStatus.Done, remainingEstimateHours: 0 }).overrun).toBe(false);
        expect(taskTimeTracking({ ...task, actualHours: 6, remainingEstimateHours: undefined })).toMatchObject({ eac: undefined, overrun: true });
        expect(taskTimeTracking({ ...task, originalEstimateHours: 0 }).variancePct).toBeUndefined();
    });

    it('alt görevli toplamlarla alt görevlerin saatini çift saymaz', () => {
        const parent = { status: TaskStatus.InProgress, originalEstimateHours: 4, actualHours: 2, remainingEstimateHours: 2, aggregateSpentHours: 3 } as Task;
        const child = { status: TaskStatus.Done, originalEstimateHours: 1, actualHours: 1, remainingEstimateHours: 0 } as Task;
        expect(totalTimeTracking([parent, child])).toMatchObject({ original: 5, spent: 3, remaining: 2, eac: 5, comparable: 2 });
    });
});
