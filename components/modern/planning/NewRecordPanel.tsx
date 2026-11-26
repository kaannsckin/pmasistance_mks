import React from 'react';
import { EstimateLogEntry, Project, Task, WorkspaceData } from '../../../types';
import { Icon } from '../icons';
import NewRecordPlanner from './NewRecordPlanner';
import { usePlanningContext } from './usePlanningContext';

/**
 * Görevler ekranında tahminli yeni kayıt: benzer kapanmış kayıtlardan ve (sınamayı
 * geçtiyse) modelden süre/efor/önem önerisi ve hangi sprinte sığacağı.
 * Eskiden Planlama'nın "Yeni kayıt" sekmesiydi.
 */
const NewRecordPanel: React.FC<{
    project: Project;
    workspace: WorkspaceData;
    visibleProjectIds: ReadonlySet<string>;
    canEdit: boolean;
    onAddTask: (task: Task, log: EstimateLogEntry) => void;
    onClose: () => void;
}> = ({ project, workspace, visibleProjectIds, canEdit, onAddTask, onClose }) => {
    const { history, leaves, aiBlocked, ml, blindEstimate } = usePlanningContext(workspace);
    return (
        <section className="flex flex-col gap-3" aria-labelledby="new-record-title">
            <div className="flex items-center gap-2">
                <h2 id="new-record-title" className="m-0 flex-1 text-[19px] font-semibold m-text">Tahminli yeni kayıt</h2>
                <button type="button" className="m-btn m-btn-plain" onClick={onClose}><Icon name="x" size={17} />Kapat</button>
            </div>
            <NewRecordPlanner key={project.id} project={project} history={history} people={workspace.people} leaves={leaves} visibleProjectIds={visibleProjectIds}
                canEdit={canEdit} blindEstimate={blindEstimate} aiBlocked={aiBlocked} ml={ml} onAddTask={onAddTask} onOpenList={onClose} />
        </section>
    );
};

export default NewRecordPanel;
