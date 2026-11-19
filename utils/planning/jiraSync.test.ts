import { describe, expect, it } from 'vitest';
import { JiraSyncSettings, Task, TaskStatus } from '../../types';
import { JiraIssueRecord, JiraSyncPage } from '../integrations';
import { applyJiraSync, collectJiraSync, diffToChanges, hasSyncWork, jiraDiff, linkedOpenKeys, parseLabels, pullIssueIntoTasks, runProjectSync, sourceLabel, sourceOf, syncDue, syncSummary } from './jiraSync';

const task = (id: string, jiraId: string, status = TaskStatus.InProgress, extra: Partial<Task> = {}): Task => ({
    id, name: `Görev ${id}`, jiraId, status, availability: true, priority: 'Medium', version: 2, predecessor: null, unit: 'Yazılım', resourceName: 'Ayşe', time: { best: 1, avg: 2, worst: 3 }, notes: '', ...extra,
});
const issue = (key: string, category: JiraIssueRecord['statusCategory'] = 'indeterminate', extra: Partial<JiraIssueRecord> = {}): JiraIssueRecord => ({
    key, summary: `Jira ${key}`, description: '', issueType: 'Görev', status: category === 'done' ? 'Kapandı' : 'Devam Ediyor', statusCategory: category, priority: 'Medium', created: '2026-10-01T08:00:00.000Z',
    resolved: category === 'done' ? '2026-11-12T10:00:00.000Z' : null, components: [], labels: [], fixVersions: [], originalEstimateSeconds: null, timeSpentSeconds: null, storyPoints: null, assignee: 'Ayşe', blockedBy: [], transitions: [], due: null, ...extra,
});
const OPTS = { importedAt: '2026-11-13T08:00:00.000Z', defaultUnit: 'Genel' };
const page = (issues: JiraIssueRecord[], next: string | null = null, missing: string[] = []): JiraSyncPage => ({ issues, total: issues.length, next, missing });

describe('Jira canlı eşitleme', () => {
    const tasks = [task('a', 'MKS-1'), task('b', 'mks-2', TaskStatus.ToDo), task('c', 'MKS-3', TaskStatus.Done), task('d', ''), task('e', 'serbest metin')];

    it('yalnız Jira anahtarlı açık kayıtlar yenilenir; kaynak ancak keşif açıkken sorgulanır', async () => {
        expect(linkedOpenKeys(tasks)).toEqual(['MKS-1', 'MKS-2']);
        expect(parseLabels(' mks-takip, acil  acil;x ')).toEqual(['mks-takip', 'acil', 'x']);
        expect(sourceOf({ discover: false, autoMinutes: 0 })).toBeNull();
        expect(sourceLabel({ projectKey: 'mks', labels: ['a'], filterId: '7', filterName: 'Açıklar', discover: true, autoMinutes: 5 })).toBe('proje MKS · etiket a · filtre Açıklar');

        const calls: unknown[] = [];
        const r = await collectJiraSync(tasks, { labels: ['mks-takip'], discover: false, autoMinutes: 0 }, async o => { calls.push(o); return page([issue('MKS-1'), issue('MKS-2', 'done')], null, []); });
        expect(calls).toEqual([{ keys: ['MKS-1', 'MKS-2'] }]); // kaynak sorgulanmadı, kapanmış MKS-3 istenmedi
        expect(r).toMatchObject({ fromSource: 0, truncated: false, missing: [] });
    });

    it('keşif: kaynak sayfa sayfa, kaynakta dönmeyen bağlı kayıtlar anahtarla tamamlanır', async () => {
        const settings: JiraSyncSettings = { projectKey: 'mks', labels: ['mks-takip'], discover: true, autoMinutes: 15 };
        const calls: unknown[] = [];
        const r = await collectJiraSync(tasks, settings, async o => {
            calls.push(o);
            if ('keys' in o) return page([issue('MKS-2', 'done')], null, []);
            return o.cursor ? page([issue('MKS-9')]) : page([issue('MKS-1')], '100');
        });
        expect(calls).toEqual([
            { source: { projectKey: 'MKS', labels: ['mks-takip'] }, cursor: null },
            { source: { projectKey: 'MKS', labels: ['mks-takip'] }, cursor: '100' },
            { keys: ['MKS-2'] }, // MKS-1 kaynaktan geldi; MKS-2 açık listede yok → kapanmış olabilir
        ]);
        expect(r.issues.map(i => i.key)).toEqual(['MKS-1', 'MKS-9', 'MKS-2']);
        expect(r.fromSource).toBe(2);
    });

    it('uygulama: Jira\'da kapanan kayıt kapanır, planlama alanları korunur; keşif kapalıyken yeni kayıt eklenmez', () => {
        const issues = [issue('MKS-1', 'indeterminate', { summary: 'Yeni başlık' }), issue('MKS-2', 'done'), issue('MKS-9')];
        const off = applyJiraSync(tasks, issues, OPTS, false);
        expect(off).toMatchObject({ added: 0, updated: 2, closed: 1 });
        expect(off.tasks.find(t => t.id === 'a')).toMatchObject({ name: 'Yeni başlık', version: 2, time: { best: 1, avg: 2, worst: 3 } });
        expect(off.tasks.find(t => t.id === 'b')).toMatchObject({ status: TaskStatus.Done, resolvedAt: '2026-11-12T10:00:00.000Z' });
        const on = applyJiraSync(tasks, issues, OPTS, true);
        expect(on.added).toBe(1);
        expect(on.tasks.at(-1)).toMatchObject({ jiraId: 'MKS-9', id: 'jira-mks-9' });
        // İkinci tur: değişiklik yok
        expect(applyJiraSync(off.tasks, issues, OPTS, false)).toMatchObject({ added: 0, updated: 0, closed: 0 });
        expect(syncSummary(off, { missing: ['MKS-4'], truncated: false })).toBe("2 kayıt güncellendi · 1 kayıt Jira'da kapanmış · Jira'da bulunamayan: MKS-4");
        expect(syncSummary({ added: 0, updated: 0, unchanged: 3, closed: 0 }, { missing: [], truncated: false })).toBe('değişiklik yok (3 kayıt güncel)');
    });

    it('çalıştırma önizler; otomatik eşitleme zamanı', async () => {
        const project = { tasks, resources: [{ unit: 'Yazılım' }, { unit: 'Yazılım' }, { unit: 'Test' }], jiraSync: { discover: false, autoMinutes: 15 } };
        const r = await runProjectSync(project, async () => page([issue('MKS-2', 'done')], null, ['MKS-1']), undefined, new Date('2026-11-13T08:00:00Z'));
        expect(r).toMatchObject({ addNew: false, opts: { defaultUnit: 'Yazılım', importedAt: '2026-11-13T08:00:00.000Z' }, preview: { updated: 1, closed: 1 }, fetched: { missing: ['MKS-1'] } });
        expect(hasSyncWork(project)).toBe(true);
        expect(hasSyncWork({ tasks: [task('x', '')], jiraSync: { discover: true, autoMinutes: 5 } })).toBe(false); // kaynak yok
        expect(hasSyncWork({ tasks: [], jiraSync: { labels: ['a'], discover: true, autoMinutes: 5 } })).toBe(true);

        const now = Date.parse('2026-11-13T08:00:00Z');
        expect(syncDue({ discover: false, autoMinutes: 0 }, null, now)).toBe(false);
        expect(syncDue(project.jiraSync, null, now)).toBe(true);
        expect(syncDue(project.jiraSync, '2026-11-13T07:50:00Z', now)).toBe(false);
        expect(syncDue(project.jiraSync, '2026-11-13T07:45:00Z', now)).toBe(true);
    });

    it('fark ve Jira\'ya yazılacak değişiklikler; Jira\'daki hâli almak termini de getirir', () => {
        const t = task('a', 'MKS-1', TaskStatus.Done, { name: 'Uygulamadaki ad', priority: 'High', dueDate: '2026-12-01' });
        const i = issue('MKS-1', 'indeterminate', { summary: 'Jira adı', priority: 'Low', due: '2026-11-20' });
        const diff = jiraDiff(t, i);
        expect(diff.map(d => d.field)).toEqual(['summary', 'priority', 'status', 'dueDate']);
        expect(diff[2]).toMatchObject({ local: 'Kapandı', remote: 'Devam Ediyor' });
        expect(diffToChanges(t, ['summary', 'status', 'dueDate'])).toEqual({ summary: 'Uygulamadaki ad', status: 'done', dueDate: '2026-12-01' });
        expect(diffToChanges({ ...t, dueDate: undefined }, ['dueDate'])).toEqual({ dueDate: null });
        expect(jiraDiff(task('a', 'MKS-1', TaskStatus.InProgress, { name: 'Jira MKS-1' }), issue('MKS-1'))).toEqual([]);

        const pulled = pullIssueIntoTasks([t, task('z', 'MKS-5')], i, OPTS);
        expect(pulled[0]).toMatchObject({ name: 'Jira adı', priority: 'Low', status: TaskStatus.InProgress, dueDate: '2026-11-20' });
        expect(pulled[1]).toEqual(task('z', 'MKS-5'));
        expect('dueDate' in pullIssueIntoTasks([t], { ...i, due: null }, OPTS)[0]).toBe(false);
    });
});
