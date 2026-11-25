import React, { useState } from 'react';
import { Project, Task } from '../../types';
import { previewTaskDelete } from '../../utils/taskDelete';
import TaskKeyButton from './TaskKeyButton';
import { Sheet } from './ui';

interface Props {
    project: Pick<Project, 'tasks'>;
    ids: ReadonlySet<string>;
    onView: (task: Task) => void;
    /** Hata iletisi döner; başarılıysa undefined */
    onConfirm: () => string | undefined;
    onClose: () => void;
}

/** Seçili görevleri silmeden önce listeler; ardılların öncül bağının kalkacağını söyler. */
const BulkTaskDeleteSheet: React.FC<Props> = ({ project, ids, onView, onConfirm, onClose }) => {
    const [error, setError] = useState<string>();
    const preview = previewTaskDelete(project, ids);
    const tasks = 'error' in preview ? [] : preview.tasks;
    const unlinked = 'error' in preview ? [] : preview.unlinked;
    const message = error || ('error' in preview ? preview.error : undefined);

    return (
        <Sheet
            wide
            title="Görevleri sil"
            subtitle={`${tasks.length} görev silinecek`}
            onClose={onClose}
            footer={
                <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className="m-btn m-btn-plain" autoFocus onClick={onClose}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-danger" disabled={!tasks.length} onClick={() => setError(onConfirm())}>
                        {tasks.length ? `${tasks.length} görevi sil` : 'Görevleri sil'}
                    </button>
                </div>
            }
        >
            <p className="m-0 text-[14px] m-text-2">
                Silinen görevler geri alınamaz. Gerekirse önce JSON yedeği alın. Jira'daki kayıtlar silinmez; yalnız bu uygulamadaki kopyaları kaldırılır.
            </p>
            {message && <p className="m-0 text-[14px] m-ink-bad" role="alert">{message}</p>}
            {unlinked.length > 0 && (
                <p className="m-0 text-[14px] m-ink-warn" role="status">
                    {unlinked.length} görevin öncülü silinecek görevlerden biri; bu görevlerin öncül bağı kaldırılacak.
                </p>
            )}
            {tasks.length > 0 && (
                <section aria-label="Silinecek görevler" className="rounded-xl m-surface px-3.5 py-3">
                    <ul className="max-h-72 overflow-y-auto m-0 p-0 list-none">
                        {tasks.map(t => (
                            <li key={t.id} className="flex items-center gap-2 border-t first:border-t-0 m-sep py-1.5">
                                <TaskKeyButton task={t} onOpen={() => onView(t)} />
                                <span className="min-w-0 text-[14px] m-text break-words">{t.name}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </Sheet>
    );
};

export default BulkTaskDeleteSheet;
