import { describe, expect, it } from 'vitest';
import { ProjectVersion, Task, TaskStatus } from '../types';
import { boardConfigOf, buildLanes, filterBoardTasks } from './board';
import { missingRequiredFields, createScheme } from './projectScheme';
import {
    componentUsage, defaultAssigneeFor, listProblems, listSuggestions, releaseVersion, renameComponentInTasks, renameVersionInTasks, versionProgress,
} from './projectLists';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
    id, name: id, availability: true, priority: 'Medium', version: 1, predecessor: null, unit: '', resourceName: '',
    time: { best: 1, avg: 1, worst: 1 }, jiraId: '', notes: '', status: TaskStatus.ToDo, ...extra,
});
const v = (id: string, name: string, extra: Partial<ProjectVersion> = {}): ProjectVersion => ({ id, name, status: 'unreleased', ...extra });

describe('bileşen ve sürüm listeleri', () => {
    const tasks = [
        task('a', { components: ['İstemci', 'Dizin'], fixVersion: '2.1', status: TaskStatus.Done }),
        task('b', { components: ['istemci'], fixVersion: '2.1' }),
        task('c', { components: ['EMS'], fixVersion: '2.2' }),
    ];

    it('görevlerde geçen ama listede olmayan adlar önerilir (büyük/küçük harf ve ı/i duyarsız)', () => {
        const s = listSuggestions({ tasks, components: [{ id: '1', name: 'EMS' }], versions: [v('1', '2.2')] });
        expect(s.components).toEqual([{ name: 'İstemci', count: 2 }, { name: 'Dizin', count: 1 }]);
        expect(s.versions).toEqual([{ name: '2.1', count: 2 }]);
        expect(componentUsage(tasks, 'ISTEMCI')).toBe(2);
    });

    it('sürüm ilerlemesi ve gecikme', () => {
        expect(versionProgress(tasks, v('1', '2.1', { releaseDate: '2026-11-01' }), new Date('2026-11-19'))).toEqual({ total: 2, done: 1, open: 1, late: true, pct: 50 });
        expect(versionProgress(tasks, v('1', '2.1', { status: 'released', releaseDate: '2026-11-01' }), new Date('2026-11-19')).late).toBe(false);
    });

    it('yayınlama: açık işler sonraki sürüme taşınır ya da çıkarılır', () => {
        const versions = [v('1', '2.1'), v('2', '2.2')];
        const r = releaseVersion({ tasks, versions }, '1', '2.2', new Date('2026-11-19T10:00:00Z'));
        expect(r.moved).toBe(1);
        expect(r.tasks.map(t => t.fixVersion)).toEqual(['2.1', '2.2', '2.2']);
        expect(r.versions[0]).toMatchObject({ status: 'released', releasedAt: '2026-11-19', releaseDate: '2026-11-19' });
        expect(releaseVersion({ tasks, versions }, '1', null).tasks[1].fixVersion).toBeUndefined();
    });

    it('yeniden adlandırma ve silme görev başvurularını günceller', () => {
        expect(renameComponentInTasks(tasks, 'istemci', 'Masaüstü').map(t => t.components)).toEqual([['Dizin', 'Masaüstü'], ['Masaüstü'], ['EMS']]);
        expect(renameComponentInTasks(tasks, 'EMS', null)[2].components).toBeUndefined();
        expect(renameVersionInTasks(tasks, '2.1', '2.1.0').map(t => t.fixVersion)).toEqual(['2.1.0', '2.1.0', '2.2']);
    });

    it('bileşen sorumlusu varsayılan atanan; doğrulama', () => {
        const comps = [{ id: '1', name: 'EMS', lead: 'Veli Yıldız', assignLead: true }, { id: '2', name: 'Dizin', lead: 'Ayşe Kaya' }];
        expect(defaultAssigneeFor(comps, ['Dizin', 'ems'])).toBe('Veli Yıldız');
        expect(defaultAssigneeFor(comps, ['Dizin'])).toBeUndefined();
        expect(listProblems([{ id: '1', name: 'A' }, { id: '2', name: 'a' }], [v('1', ' ')])).toEqual(['Ad boş olamaz.', 'Aynı adlı bileşen: a.']);
        expect(listProblems([], [v('1', 'x', { startDate: '2026-12-01', releaseDate: '2026-11-01' })])).toEqual(['Sürümün başlangıcı yayın tarihinden sonra olamaz.']);
    });

    it('zorunlu alan, hızlı filtre ve kulvar', () => {
        const s = { ...createScheme('basic', 'B'), requiredFields: ['component' as const, 'fixVersion' as const] };
        expect(missingRequiredFields(s, task('x'))).toEqual(['Bileşen', 'Hedef sürüm']);
        expect(missingRequiredFields(s, tasks[0])).toEqual([]);
        expect(filterBoardTasks(tasks, [{ id: 'q', name: 'İstemci', components: ['ISTEMCI'] }], { now: new Date() }).map(t => t.id)).toEqual(['a', 'b']);
        expect(filterBoardTasks(tasks, [{ id: 'q', name: '2.2', fixVersions: ['2.2'] }], { now: new Date() }).map(t => t.id)).toEqual(['c']);
        expect(buildLanes(tasks, { ...boardConfigOf(undefined), swimlane: 'fixVersion' }).map(l => [l.title, l.tasks.length])).toEqual([['2.1', 2], ['2.2', 1]]);
    });
});
