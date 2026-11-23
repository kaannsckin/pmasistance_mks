import { Person, Project, ProjectScheme, Resource, Task } from '../types';

export interface BulkTaskPatch {
    priority?: Task['priority'];
    assignee?: string; // boş metin atamayı kaldırır
    versionId?: string | null; // null hedef sürümü kaldırır
}

export const BULK_PRIORITIES: ReadonlyArray<Task['priority']> = ['Blocker', 'High', 'Medium', 'Low'];

const personName = (p: Person) => `${p.firstName} ${p.lastName}`.trim();
const assigneeKey = (name: string) => name.trim().toLocaleLowerCase('tr-TR');

export const bulkAssigneeOptions = (resources: Resource[], people: Person[]): string[] => {
    const names = new Map<string, string>();
    for (const name of [...resources.map(r => r.name.trim()), ...people.map(personName)]) {
        if (name && !names.has(assigneeKey(name))) names.set(assigneeKey(name), name);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'tr'));
};

interface Preview {
    changes: { before: Task; after: Task }[];
    newResource?: Omit<Resource, 'id'>;
}

/** Önizleme ve kayıt sırasında aynı alanları ve geçerli seçenekleri kullanır. */
export const previewBulkTaskEdit = (
    project: Pick<Project, 'resources' | 'versions'>,
    tasks: Task[],
    people: Person[],
    required: ProjectScheme['requiredFields'],
    patch: BulkTaskPatch,
): Preview | { error: string } => {
    const requestedAssignee = patch.assignee?.trim();
    if (patch.priority !== undefined && !BULK_PRIORITIES.includes(patch.priority)) return { error: 'Geçersiz öncelik.' };
    if (requestedAssignee === '' && required?.includes('resourceName')) return { error: 'Proje yapılandırması atanan kişiyi zorunlu kılıyor.' };
    if (patch.versionId === null && required?.includes('fixVersion')) return { error: 'Proje yapılandırması hedef sürümü zorunlu kılıyor.' };

    const key = requestedAssignee ? assigneeKey(requestedAssignee) : undefined;
    const resource = key ? project.resources.find(r => assigneeKey(r.name) === key) : undefined;
    const person = key && !resource ? people.find(p => assigneeKey(personName(p)) === key) : undefined;
    if (key && !resource && !person) return { error: 'Seçilen kişi artık atama listesinde bulunmuyor.' };
    const setVersion = typeof patch.versionId === 'string';
    const version = setVersion ? project.versions?.find(v => v.id === patch.versionId && v.status === 'unreleased') : undefined;
    if (setVersion && !version) return { error: 'Seçilen hedef sürüm artık kullanılabilir değil.' };

    const assignee = resource?.name || (person ? personName(person) : requestedAssignee);
    const unit = resource?.unit || person?.departmentCode;
    const changes = tasks.flatMap(before => {
        const assignmentChanged = assignee !== undefined && assignee !== (before.resourceName || '');
        const after = {
            ...before,
            ...(patch.priority ? { priority: patch.priority } : {}),
            ...(assignmentChanged ? { resourceName: assignee, unit: unit || before.unit } : {}),
            ...(patch.versionId !== undefined ? { fixVersion: version?.name } : {}),
        };
        return assignmentChanged || after.priority !== before.priority || (after.fixVersion || '') !== (before.fixVersion || '')
            ? [{ before, after }] : [];
    });
    const newResource = person && changes.some(({ before, after }) => before.resourceName !== after.resourceName) && assignee
        ? { name: assignee, participation: 100, unit: person.departmentCode || '', title: person.titleCode || 'Uzman' }
        : undefined;
    return { changes, newResource };
};
