import { describe, expect, it } from 'vitest';
import { Task, TaskStatus } from '../../types';
import { chunk, jiraExportCandidates, jiraInputOf, linkJiraKeys, summarizeJiraResults } from './jiraExport';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: `${id} kaydı`, availability: true, priority: 'High', version: 1, predecessor: null, unit: 'Yazılım', resourceName: 'Ayşe Yılmaz',
    time: { best: 1, avg: 2, worst: 3 }, jiraId: '', notes: '', status: TaskStatus.ToDo, issueType: 'bug', ...extra,
});

describe("Jira'ya gönderme", () => {
    it('adaylar: anahtarı olmayan, kapanmamış kayıtlar', () => {
        const ids = jiraExportCandidates({ tasks: [task('a'), task('b', { jiraId: 'MKS-1' }), task('c', { status: TaskStatus.Done }), task('d', { name: '  ' }), task('e', { status: TaskStatus.InProgress })] }).map(t => t.id);
        expect(ids).toEqual(['a', 'e']);
    });

    it('alan eşleme: kişi adı gitmez, tahmin saate çevrilir', () => {
        const input = jiraInputOf(task('a', { name: 'Giriş\n  hatası', notes: ' Oturum düşüyor ', time: { best: 1, avg: 2, worst: 3 } }));
        expect(input).toEqual({ ref: 'a', summary: 'Giriş hatası', description: 'Oturum düşüyor', issueType: 'bug', priority: 'High', component: 'Yazılım', estimateHours: 16 });
        expect(JSON.stringify(input)).not.toContain('Ayşe');
        expect(jiraInputOf(task('b', { time: { best: 0, avg: 0, worst: 0 }, unit: '', notes: '' }))).toMatchObject({ estimateHours: undefined, component: undefined, description: undefined });
    });

    it('anahtarlar görevlere yazılır; anahtarı olan görev ezilmez; sonuç özeti', () => {
        const tasks = [task('a'), task('b', { jiraId: 'ESKI-1' }), task('c')];
        const r = linkJiraKeys(tasks, { a: 'MKS-10', b: 'MKS-11' });
        expect(r.linked).toBe(1);
        expect(r.tasks.map(t => t.jiraId)).toEqual(['MKS-10', 'ESKI-1', '']);
        expect(r.tasks[2]).toBe(tasks[2]);
        expect(linkJiraKeys(tasks, {}).tasks).toBe(tasks);
        const s = summarizeJiraResults([{ ref: 'a', key: 'MKS-10', dropped: ['timetracking'] }, { ref: 'b', key: 'MKS-11', dropped: ['timetracking', 'priority'] }, { ref: 'c', error: 'Sprint zorunlu' }]);
        expect(s).toEqual({ links: { a: 'MKS-10', b: 'MKS-11' }, created: 2, failed: [{ ref: 'c', error: 'Sprint zorunlu' }], dropped: ['timetracking', 'priority'] });
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
});
