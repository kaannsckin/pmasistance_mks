import { describe, expect, it } from 'vitest';
import { importSummary, mergeImport } from './importMerge';
import { Resource, Task, TaskStatus } from '../types';

const task = (id: string, name: string, jiraId = ''): Task => ({
    id, name, jiraId, availability: true, priority: 'Medium', version: 1, predecessor: null,
    unit: 'U310', resourceName: 'Ayşe', time: { best: 1, avg: 2, worst: 3 }, status: TaskStatus.ToDo, includeInSprints: true,
} as Task);
const res = (name: string): Resource => ({ id: name, name, unit: 'U310', participation: 100, title: 'Uzman' } as Resource);

describe('mergeImport (UI-KRC-18)', () => {
    it('kendi dışa aktarımı geri yüklenince hiçbir görev yeniden eklenmez', () => {
        const existing = [task('a', 'API geçidi', 'NHR-46'), task('b', 'Şema doğrulama', 'NHR-56'), task('c', 'Numarasız iş')];
        const again = existing.map(t => ({ ...t, id: `imp-${t.id}`, status: TaskStatus.Backlog }));
        const m = mergeImport(existing, [res('Ayşe')], again, [res('Ayşe')]);
        expect(m.tasks).toEqual([]);
        expect(m.resources).toEqual([]);
        expect(m.skipped).toBe(3);
    });

    it('yeni görevler eklenir; Jira numarası büyük/küçük harf ve boşluktan bağımsız eşlenir', () => {
        const existing = [task('a', 'API geçidi', 'NHR-46')];
        const m = mergeImport(existing, [], [task('x', 'Başka ad', ' nhr-46 '), task('y', 'Yeni iş', 'NHR-99'), task('z', 'Numarasız yeni')], [res('Can')]);
        expect(m.tasks.map(t => t.id)).toEqual(['y', 'z']);
        expect(m.skipped).toBe(1);
        expect(m.resources.map(r => r.name)).toEqual(['Can']);
    });

    it('numarasız görev Türkçe büyük/küçük harften bağımsız adla eşlenir; dosyadaki tekrar bir kez eklenir', () => {
        const m = mergeImport([task('a', 'İzleme panosu')], [], [task('x', 'izleme panosu'), task('y', 'Yeni'), task('z', 'yeni')], []);
        expect(m.tasks.map(t => t.id)).toEqual(['y']);
        expect(m.skipped).toBe(2);
    });

    it('özet metni ne olduğunu söyler', () => {
        expect(importSummary(0, 0)).toMatch(/bulunamadı/);
        expect(importSummary(0, 100)).toMatch(/100 görev bu projede zaten var/);
        expect(importSummary(3, 2)).toBe('3 yeni görev eklendi. 2 görev projede zaten vardı; eklenmedi, değiştirilmedi.');
    });
});
