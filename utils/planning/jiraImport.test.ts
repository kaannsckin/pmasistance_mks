import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../../types';
import { JiraIssueRecord } from '../integrations';
import { createProject } from '../workspace';
import { buildHistory } from './history';
import { issueToTask, jiraStatusLog, mergeJiraIssues, previewJiraImport, sinceMonths } from './jiraImport';

const OPTS = { importedAt: '2026-10-08T10:00:00.000Z', defaultUnit: 'Yazılım' };

const issue = (key: string, extra: Partial<JiraIssueRecord> = {}): JiraIssueRecord => ({
    key, summary: `Oturum hatası ${key}`, description: 'Giriş ekranında oturum düşüyor', issueType: 'Hata', status: 'Kapandı', statusCategory: 'done', priority: 'Yüksek',
    created: '2026-09-01T06:00:00.000Z', resolved: '2026-09-04T14:00:00.000Z', components: [], labels: [], fixVersions: ['2.1'],
    originalEstimateSeconds: 57600, timeSpentSeconds: 72000, storyPoints: 3, assignee: 'Ayşe Yılmaz', blockedBy: [],
    transitions: [
        { at: '2026-09-02T06:30:00.000Z', from: 'Yapılacak', to: 'Devam Ediyor', fromCategory: 'new', toCategory: 'indeterminate' },
        { at: '2026-09-02T09:00:00.000Z', from: 'Devam Ediyor', to: 'İncelemede', fromCategory: 'indeterminate', toCategory: 'indeterminate' },
        { at: '2026-09-04T14:00:00.000Z', from: 'İncelemede', to: 'Kapandı', fromCategory: 'indeterminate', toCategory: 'done' },
    ],
    ...extra,
});

const local = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: 'Yerel ad', availability: true, priority: 'Low', version: 3, predecessor: 'x', unit: 'Test', resourceName: 'Ali', time: { best: 1, avg: 2, worst: 4 },
    jiraId: '', notes: 'Yerel not', status: TaskStatus.ToDo, includeInSprints: true, workPackageId: 'wp1', keyResultId: 'kr1', ...extra,
});

describe('Jira kaydı → görev', () => {
    it('yaşam döngüsü durum geçmişinden: işe başlama, kapanış, kategori geçişleri', () => {
        const t = issueToTask(issue('MKS-12'), OPTS);
        expect(t).toMatchObject({
            id: 'jira-mks-12', jiraId: 'MKS-12', name: 'Oturum hatası MKS-12', status: TaskStatus.Done, issueType: 'bug', priority: 'High', unit: 'Yazılım',
            createdAt: '2026-09-01T06:00:00.000Z', startedAt: '2026-09-02T06:30:00.000Z', resolvedAt: '2026-09-04T14:00:00.000Z',
            originalEstimateHours: 16, actualHours: 20, storyPoints: 3, fixVersion: '2.1', time: { best: 2, avg: 2, worst: 2 }, estimateSource: 'jira',
            includeInSprints: false, version: 0, importedAt: OPTS.importedAt, resourceName: 'Ayşe Yılmaz',
        });
        // Aynı kategoride kalan adım (Devam → İnceleme) geçiş sayılmaz
        expect(t.statusLog).toEqual([
            { at: '2026-09-02T06:30:00.000Z', from: TaskStatus.ToDo, to: TaskStatus.InProgress },
            { at: '2026-09-04T14:00:00.000Z', from: TaskStatus.InProgress, to: TaskStatus.Done },
        ]);
        // Kategori bilinmiyorsa durum adından; "Backlog" ayrı tutulur
        expect(jiraStatusLog(issue('A', { transitions: [{ at: '2026-01-01T00:00:00Z', from: 'Backlog', to: 'In Progress', fromCategory: null, toCategory: null }] }))).toEqual([{ at: '2026-01-01T00:00:00Z', from: TaskStatus.Backlog, to: TaskStatus.InProgress }]);
        // Açık kayıt: kapanış yok, planlamaya girer
        const open = issueToTask(issue('MKS-20', { statusCategory: 'indeterminate', status: 'Devam Ediyor', resolved: null, transitions: [] }), OPTS);
        expect(open).toMatchObject({ status: TaskStatus.InProgress, includeInSprints: true });
        expect(open.resolvedAt).toBeUndefined();
    });

    it('aktarılan kapanmış kayıtlar planlama geçmişine girer (Jira harcanan süresi efor olur)', () => {
        const tasks = Array.from({ length: 3 }, (_, i) => issueToTask(issue(`MKS-${i + 1}`), OPTS));
        const h = buildHistory([createProject('P', { tasks })]);
        expect(h.records).toHaveLength(3);
        expect(h.records[0]).toMatchObject({ effortBasis: 'logged', effortDays: 2.5, cycleDays: 3, estimateDays: 2 });
    });
});

describe('birleştirme', () => {
    it('Jira anahtarıyla eşleşen görev güncellenir; planlama alanları korunur', () => {
        const existing = local('t1', { jiraId: 'mks-12' });
        const other = local('t2');
        const r = mergeJiraIssues([existing, other], [issue('MKS-12', { components: ['Yazılım'] }), issue('MKS-13', { blockedBy: ['MKS-12', 'MKS-99'] })], OPTS);
        expect(r).toMatchObject({ added: 1, updated: 1, unchanged: 0 });
        const u = r.tasks[0];
        expect(u).toMatchObject({
            id: 't1', name: 'Oturum hatası MKS-12', notes: 'Giriş ekranında oturum düşüyor', status: TaskStatus.Done, priority: 'High', unit: 'Yazılım', resourceName: 'Ayşe Yılmaz',
            version: 3, predecessor: 'x', workPackageId: 'wp1', keyResultId: 'kr1', includeInSprints: true, time: { best: 1, avg: 2, worst: 4 }, actualHours: 20,
        });
        expect(u.estimateSource).toBeUndefined(); // kendi tahmini korunur
        expect(r.tasks[1]).toBe(other); // eşleşmeyen yerel görev olduğu gibi
        const added = r.tasks[2];
        expect(added).toMatchObject({ id: 'jira-mks-13', predecessor: 't1' }); // engelleyen kayıt projedeyse öncül olur
    });

    it('tekrar aktarım değişiklik yapmaz; Jira boşsa yerel değer kalır; kimlik çakışmaz', () => {
        const first = mergeJiraIssues([], [issue('MKS-1'), issue('MKS-2')], OPTS);
        const again = mergeJiraIssues(first.tasks, [issue('MKS-1'), issue('MKS-2')], OPTS);
        expect(again).toMatchObject({ added: 0, updated: 0, unchanged: 2 });
        expect(again.tasks[0]).toBe(first.tasks[0]);
        const keep = mergeJiraIssues([local('t1', { jiraId: 'MKS-5', time: { best: 0, avg: 0, worst: 0 }, availability: false })], [issue('MKS-5', { assignee: '', description: '', priority: '' })], OPTS);
        expect(keep.tasks[0]).toMatchObject({ resourceName: 'Ali', notes: 'Yerel not', priority: 'Low', time: { best: 2, avg: 2, worst: 2 }, availability: true }); // tahmin yoksa Jira'nınki
        const clash = mergeJiraIssues([local('jira-mks-7')], [issue('MKS-7')], OPTS);
        expect(clash.tasks.map(t => t.id)).toEqual(['jira-mks-7', 'jira-mks-7-2']);
    });

    it('yeniden açılan kayıt: kapanış silinir, geçiş günlüğü Jira’dan', () => {
        const done = mergeJiraIssues([], [issue('MKS-1')], OPTS).tasks;
        const reopened = mergeJiraIssues(done, [issue('MKS-1', {
            statusCategory: 'indeterminate', status: 'Devam Ediyor', resolved: null,
            transitions: [...issue('MKS-1').transitions, { at: '2026-09-10T08:00:00.000Z', from: 'Kapandı', to: 'Devam Ediyor', fromCategory: 'done', toCategory: 'indeterminate' }],
        })], OPTS).tasks[0];
        expect(reopened.status).toBe(TaskStatus.InProgress);
        expect(reopened.resolvedAt).toBeUndefined();
        expect(reopened.statusLog!.at(-1)).toEqual({ at: '2026-09-10T08:00:00.000Z', from: TaskStatus.Done, to: TaskStatus.InProgress });
    });
});

describe('önizleme', () => {
    it('yeni / güncellenecek sayıları, veri kapsaması ve eğitime uygun kayıt artışı', () => {
        const p = createProject('P', { tasks: [local('t1', { jiraId: 'MKS-1' })] });
        const issues = [issue('MKS-1'), issue('MKS-2', { originalEstimateSeconds: null, transitions: [] }), issue('MKS-3', { statusCategory: 'new', status: 'Yapılacak', resolved: null, transitions: [] })];
        const v = previewJiraImport(p, issues, OPTS);
        expect(v).toMatchObject({ total: 3, closed: 2, open: 1, added: 2, updated: 1, unchanged: 0, withEstimate: 0.5, withSpent: 1, withStart: 0.5, usableBefore: 0, usableAfter: 2, excluded: 0 });
        expect(v.byType).toEqual([{ type: 'bug', n: 3 }]);
        expect(sinceMonths(12, new Date('2026-10-08T10:00:00'))).toBe('2025-10-08');
        expect(sinceMonths(0)).toBeUndefined();
    });
});
