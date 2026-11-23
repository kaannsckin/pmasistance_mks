import React, { useId, useState } from 'react';
import { Person, Project, ProjectScheme, Task } from '../../types';
import { bulkAssigneeOptions, BULK_PRIORITIES, BulkTaskPatch, previewBulkTaskEdit } from '../../utils/bulkTaskEdit';
import { PRIORITY_META } from './taskMeta';
import { Field, Sheet } from './ui';

interface Props {
    project: Pick<Project, 'resources' | 'versions'>;
    people: Person[];
    tasks: Task[];
    requiredFields: ProjectScheme['requiredFields'];
    onApply: (patch: BulkTaskPatch) => string | undefined;
    onClose: () => void;
}

const BulkTaskEditSheet: React.FC<Props> = ({ project, people, tasks, requiredFields, onApply, onClose }) => {
    const [patch, setPatch] = useState<BulkTaskPatch>({});
    const [error, setError] = useState<string>();
    const id = useId();
    const requiredAssignee = requiredFields?.includes('resourceName');
    const requiredVersion = requiredFields?.includes('fixVersion');
    const versions = (project.versions || []).filter(v => v.status === 'unreleased');
    const preview = previewBulkTaskEdit(project, tasks, people, requiredFields, patch);
    const changes = 'error' in preview ? [] : preview.changes;
    const change = (value: BulkTaskPatch) => { setPatch(prev => ({ ...prev, ...value })); setError(undefined); };
    const message = error || ('error' in preview ? preview.error : undefined);
    const confirm = () => {
        if (changes.length) setError(onApply(patch));
    };

    return (
        <Sheet
            wide
            title="Görevleri toplu düzenle"
            subtitle={`${tasks.length} görev seçili`}
            onClose={onClose}
            footer={
                <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className="m-btn m-btn-plain" onClick={onClose}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-primary" disabled={!changes.length} onClick={confirm}>
                        {changes.length ? `${changes.length} görevi güncelle` : 'Görevleri güncelle'}
                    </button>
                </div>
            }
        >
            <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Öncelik" htmlFor={`${id}-priority`}>
                    <select id={`${id}-priority`} className="m-input" autoFocus value={patch.priority || ''} onChange={e => change({ priority: (e.target.value || undefined) as Task['priority'] | undefined })}>
                        <option value="">Değiştirme</option>
                        {BULK_PRIORITIES.map(priority => <option key={priority} value={priority}>{PRIORITY_META[priority].label}</option>)}
                    </select>
                </Field>
                <Field label="Atanan kişi" htmlFor={`${id}-assignee`}>
                    <select id={`${id}-assignee`} className="m-input" value={patch.assignee === undefined ? '' : `kişi:${patch.assignee}`} onChange={e => change({ assignee: e.target.value ? e.target.value.slice(5) : undefined })}>
                        <option value="">Değiştirme</option>
                        {!requiredAssignee && <option value="kişi:">Atamayı kaldır</option>}
                        {bulkAssigneeOptions(project.resources, people).map(name => <option key={name} value={`kişi:${name}`}>{name}</option>)}
                    </select>
                </Field>
                <Field label="Hedef sürüm" htmlFor={`${id}-version`}>
                    <select id={`${id}-version`} className="m-input" value={patch.versionId === undefined ? '' : `sürüm:${patch.versionId || ''}`} onChange={e => change({ versionId: e.target.value ? e.target.value.slice(6) || null : undefined })}>
                        <option value="">Değiştirme</option>
                        {!requiredVersion && <option value="sürüm:">Hedef sürümü kaldır</option>}
                        {versions.map(version => <option key={version.id} value={`sürüm:${version.id}`}>{version.name}</option>)}
                    </select>
                </Field>
            </div>
            {message && <p className="m-0 text-[14px] m-ink-bad" role="alert">{message}</p>}
            <section aria-label="Değişiklik önizlemesi" className="rounded-xl m-surface px-3.5 py-3">
                <h3 className="m-0 text-[15px] font-semibold m-text">Değişiklik önizlemesi</h3>
                <p aria-live="polite" className="mt-1 mb-0 text-[14px] m-text-2">{changes.length
                    ? `${changes.length} görev güncellenecek${tasks.length > changes.length ? `, ${tasks.length - changes.length} görev aynı kalacak` : ''}.`
                    : 'Görevlerde uygulanacak değişiklik yok.'}</p>
                {changes.length > 0 && (
                    <ul className="max-h-64 overflow-y-auto mt-2 mb-0 p-0 list-none">
                        {changes.map(({ before, after }) => (
                            <li key={before.id} className="border-t m-sep py-2">
                                <p className="m-0 font-semibold text-[14px] m-text break-words">{[before.jiraId, before.name].filter(Boolean).join(' · ')}</p>
                                <ul className="m-0 mt-0.5 p-0 list-none text-[13px] m-text-2 break-words">
                                    {before.priority !== after.priority && <li>Öncelik · {PRIORITY_META[before.priority].label} → {PRIORITY_META[after.priority].label}</li>}
                                    {before.resourceName !== after.resourceName && <li>Atanan kişi · {before.resourceName || 'Atanmadı'} → {after.resourceName || 'Atanmadı'}</li>}
                                    {before.unit !== after.unit && <li>Birim · {before.unit || '—'} → {after.unit || '—'}</li>}
                                    {(before.fixVersion || '') !== (after.fixVersion || '') && <li>Hedef sürüm · {before.fixVersion || '—'} → {after.fixVersion || '—'}</li>}
                                </ul>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </Sheet>
    );
};

export default BulkTaskEditSheet;
