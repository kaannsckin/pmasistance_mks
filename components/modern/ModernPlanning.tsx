import React, { useMemo, useRef, useState } from 'react';
import { EstimateLogEntry, Project, ReleasePlan, Task, WorkspaceData } from '../../types';
import { CommitResult } from '../../utils/planning/releasePlan';
import { aiPolicyOf } from '../../utils/ai/policy';
import { buildHistory, calibrator, PlanningHistory } from '../../utils/planning/history';
import NewRecordPlanner from './planning/NewRecordPlanner';
import PlanSimulator from './planning/PlanSimulator';
import ReleasePlanner from './planning/ReleasePlanner';

/**
 * Planlama asistanı (proje yöneticisi): geçmiş kayıtların ölçülmüş kapanma
 * sürelerinden yeni kayıt için tahmin, sürüm planlama sihirbazı ve plan için
 * olasılıklı teslim tarihi.
 * Geçmiş tüm projelerin eğitime uygun kapanmış kayıtlarından kurulur; başka
 * projelerin kayıt adları kanıt listesinde gösterilmez.
 */

interface Props {
    project: Project;
    workspace: WorkspaceData;
    visibleProjectIds: ReadonlySet<string>;
    canEdit: boolean;
    onAddTask: (task: Task, log: EstimateLogEntry) => void;
    onViewTask: (task: Task) => void;
    onOpenList: () => void;
    onSaveReleasePlan: (plan: ReleasePlan) => void;
    onDeleteReleasePlan: (id: string) => void;
    onCommitReleasePlan: (result: CommitResult) => void;
    onOpenGoals: () => void;
}

type Mode = 'record' | 'release' | 'simulate';

const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

const ModernPlanning: React.FC<Props> = ({ project, workspace, visibleProjectIds, canEdit, onAddTask, onViewTask, onOpenList, onSaveReleasePlan, onDeleteReleasePlan, onCommitReleasePlan, onOpenGoals }) => {
    const [mode, setMode] = useState<Mode>('record');
    // Geçmiş yalnız görevler ya da ekip değişince yeniden kurulur (sürüm taslağı kaydı onu bozmasın)
    const histRef = useRef<{ keys: unknown[]; h: PlanningHistory } | null>(null);
    const keys = workspace.projects.flatMap(p => [p.id, p.tasks, p.resources]);
    if (!histRef.current || keys.length !== histRef.current.keys.length || keys.some((k, i) => k !== histRef.current!.keys[i])) {
        histRef.current = { keys, h: buildHistory(workspace.projects) };
    }
    const history = histRef.current.h;
    const overall = useMemo(() => calibrator(history)({}), [history]);
    const people = workspace.people;
    const leaves = useMemo(() => workspace.leaves || [], [workspace.leaves]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="m-0 text-[22px] font-bold m-text">Planlama asistanı</h2>
                    <p className="m-0 mt-0.5 text-[15px] m-text-3">
                        Eğitime uygun kapanmış kayıt: {num(history.records.length)} / {num(history.report.closed)}
                        {overall ? ` · gerçekleşen efor tahminin medyan ${num(overall.median)} katı` : ''}
                    </p>
                </div>
                <div className="m-segmented" role="tablist" aria-label="Planlama kipi">
                    <button type="button" role="tab" className="m-segment" aria-selected={mode === 'record'} onClick={() => setMode('record')}>Yeni kayıt</button>
                    <button type="button" role="tab" className="m-segment" aria-selected={mode === 'release'} onClick={() => setMode('release')}>Sürüm planı</button>
                    <button type="button" role="tab" className="m-segment" aria-selected={mode === 'simulate'} onClick={() => setMode('simulate')}>Plan simülasyonu</button>
                </div>
            </div>
            {mode === 'record' ? (
                <NewRecordPlanner key={project.id} project={project} history={history} people={people} leaves={leaves} visibleProjectIds={visibleProjectIds} canEdit={canEdit} blindEstimate={aiPolicyOf(workspace).blindEstimate} onAddTask={onAddTask} onOpenList={onOpenList} />
            ) : mode === 'release' ? (
                <ReleasePlanner key={project.id} project={project} history={history} people={people} leaves={leaves} visibleProjectIds={visibleProjectIds} canEdit={canEdit} blindEstimate={aiPolicyOf(workspace).blindEstimate}
                    onSavePlan={onSaveReleasePlan} onDeletePlan={onDeleteReleasePlan} onCommit={onCommitReleasePlan} onOpenGoals={onOpenGoals} />
            ) : (
                <PlanSimulator key={project.id} project={project} history={history} people={people} leaves={leaves} visibleProjectIds={visibleProjectIds} onViewTask={onViewTask} />
            )}
        </div>
    );
};

export default ModernPlanning;
