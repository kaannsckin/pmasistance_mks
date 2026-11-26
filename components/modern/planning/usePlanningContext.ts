import { useMemo, useRef } from 'react';
import { WorkspaceData } from '../../../types';
import { buildHistory, PlanningHistory } from '../../../utils/planning/history';
import { modelEstimateEnabled } from '../../../utils/planning/ml/runModel';
import { estimateGate } from '../../../utils/ai/estimateEval';
import { aiPolicyOf } from '../../../utils/ai/policy';
import { useAssistantOptional } from '../../assistant/AssistantContext';
import { useEstimateModel } from './useEstimateModel';

/**
 * Tahmin bağlamı (Planlama ve Görevler'deki tahminli yeni kayıt ortak): geçmiş
 * kayıtlar, izinler, AI kalite kapısı ve sınamayı geçtiyse ML modeli.
 * Geçmiş yalnız görevler ya da ekip değişince yeniden kurulur.
 */
export const usePlanningContext = (workspace: WorkspaceData) => {
    const histRef = useRef<{ keys: unknown[]; h: PlanningHistory } | null>(null);
    const keys = workspace.projects.flatMap(p => [p.id, p.tasks, p.resources]);
    if (!histRef.current || keys.length !== histRef.current.keys.length || keys.some((k, i) => k !== histRef.current!.keys[i])) {
        histRef.current = { keys, h: buildHistory(workspace.projects) };
    }
    const history = histRef.current.h;
    const leaves = useMemo(() => workspace.leaves || [], [workspace.leaves]);
    // Kalite kapısı zorunluysa ve altın sette kalındıysa AI tahmin önerisi kapanır
    const aiBlocked = estimateGate(workspace, useAssistantOptional()?.status?.model).blocked;
    // Klasik ML modeli: politika ve son sınama izin veriyorsa arka planda eğitilir
    const modelGate = modelEstimateEnabled(workspace, history.records.length);
    const { model } = useEstimateModel(history, modelGate.withEstimate || modelGate.withoutEstimate);
    const ml = useMemo(() => (model ? { model, gate: modelGate } : null), [model, modelGate.withEstimate, modelGate.withoutEstimate]); // eslint-disable-line react-hooks/exhaustive-deps
    return { history, leaves, aiBlocked, ml, blindEstimate: aiPolicyOf(workspace).blindEstimate };
};
