import React, { useState } from 'react';
import { Project, ProjectScheme, WorkflowConfig } from '../../types';
import { effectiveScheme, validateProjectWorkflow } from '../../utils/projectScheme';
import { workflowKey } from '../../utils/workflow';
import WorkflowDesigner from './admin/WorkflowDesigner';
import { Icon } from './icons';
import { Sheet } from './ui';

/**
 * Projeye özel iş akışı (Jira "genişletilmiş proje yönetimi"): yapılandırma
 * izin veriyorsa proje sahibi kendi projesinin akışını çizer — yalnız
 * yapılandırmanın durumlarıyla; yeni durum yönetici tarafından eklenir.
 */
const ProjectWorkflowSheet: React.FC<{
    project: Project;
    scheme: ProjectScheme;
    onClose: () => void;
    /** undefined: projeye özel akışı kaldır (yapılandırmanınkine dön) */
    onSave: (wf: WorkflowConfig | undefined) => void;
}> = ({ project, scheme, onClose, onSave }) => {
    const eff = effectiveScheme({ projectSchemes: [scheme] }, { schemeId: scheme.id, workflowOverride: project.workflowOverride });
    const [wf, setWf] = useState<WorkflowConfig>(() => JSON.parse(JSON.stringify(eff.workflow)));
    const errors = validateProjectWorkflow(scheme, wf);
    const usage = (k: string) => project.tasks.filter(t => t.jiraStatus && workflowKey(t.jiraStatus) === k).length;
    return (
        <Sheet xxl title={`İş akışı: ${project.name}`}
            subtitle={`Yapılandırma: ${scheme.name} · ${eff.workflowSource === 'project' ? 'bu projeye özel akış' : 'yapılandırmanın akışı kullanılıyor'} — durumlar yapılandırmadan gelir, okları ve başlangıcı bu projeye göre değiştirebilirsiniz.`}
            onClose={onClose}
            footer={(
                <>
                    {project.workflowOverride && <button type="button" className="m-btn m-btn-plain" onClick={() => { if (window.confirm('Projeye özel akış kaldırılıp yapılandırmanın akışına dönülsün mü?')) onSave(undefined); }}>Yapılandırmanın akışına dön</button>}
                    {errors.length ? <span role="alert" className="flex-1 text-[13px] m-ink-bad">{errors[0]}</span> : <span className="flex-1 text-[13px] m-text-3">Akışta olmayan durumdaki yerel görevler aynı kategorinin ilk durumuna taşınır.</span>}
                    <button type="button" className="m-btn m-btn-gray" onClick={onClose}>Vazgeç</button>
                    <button type="button" className="m-btn m-btn-primary" disabled={errors.length > 0} onClick={() => onSave(wf)}><Icon name="check" size={16} />Kaydet</button>
                </>
            )}>
            <WorkflowDesigner value={wf} onChange={setWf} pool={scheme.workflow.statuses} usage={usage} />
        </Sheet>
    );
};

export default ProjectWorkflowSheet;
