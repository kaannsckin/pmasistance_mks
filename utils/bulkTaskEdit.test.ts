import { describe, expect, it } from 'vitest';
import { Person, ProjectVersion, Task, TaskStatus } from '../types';
import { previewBulkTaskEdit } from './bulkTaskEdit';

const task: Task = {
    id: 'a', name: 'İlk görev', priority: 'Low', status: TaskStatus.ToDo, version: 3, fixVersion: 'Önceki sürüm',
    time: { best: 1, avg: 2, worst: 3 }, resourceName: 'Ali Deniz', unit: 'U10', availability: true, predecessor: null, jiraId: 'TEST-7', notes: 'Korunacak',
};
const person: Person = {
    id: 'p1', firstName: 'Ayşe', lastName: 'Yılmaz', departmentCode: 'U20', roles: [], availableAA: 1,
};
const version: ProjectVersion = { id: 'v1', name: 'Yeni sürüm', status: 'unreleased' };
const project = { resources: [], versions: [version] };

describe('toplu görev düzenleme', () => {
    it('değişen görevleri önizler ve havuzdan atanan kişi için bir kaynak önerir', () => {
        const alreadyEdited = { ...task, id: 'b', priority: 'High' as const, resourceName: 'Ayşe Yılmaz', unit: 'U20', fixVersion: 'Yeni sürüm' };
        expect(previewBulkTaskEdit(project, [task, alreadyEdited], [person], [], {
            priority: 'High', assignee: 'Ayşe Yılmaz', versionId: version.id,
        })).toEqual({
            changes: [{ before: task, after: { ...task, priority: 'High', resourceName: 'Ayşe Yılmaz', unit: 'U20', fixVersion: 'Yeni sürüm' } }],
            newResource: { name: 'Ayşe Yılmaz', unit: 'U20', participation: 100, title: 'Uzman' },
        });
    });

    it('atama ve hedef sürümü açıkça kaldırabilir, sprinti korur', () => {
        const result = previewBulkTaskEdit(project, [task], [], [], { assignee: '', versionId: null });
        expect(result).toMatchObject({ changes: [{ after: { version: 3, resourceName: '', unit: 'U10', fixVersion: undefined, priority: 'Low' } }] });
        expect(previewBulkTaskEdit(project, [task], [], ['resourceName'], { assignee: '' })).toHaveProperty('error');
        expect(previewBulkTaskEdit(project, [task], [], ['fixVersion'], { versionId: null })).toHaveProperty('error');
    });

    it('seçenekler değişirse artık kullanılamayan kişi veya sürümü reddeder', () => {
        expect(previewBulkTaskEdit(project, [task], [], [], { assignee: 'Ayrılan kişi' })).toHaveProperty('error');
        expect(previewBulkTaskEdit({ resources: [], versions: [{ ...version, status: 'archived' }] }, [task], [], [], { versionId: version.id })).toHaveProperty('error');
    });
});
