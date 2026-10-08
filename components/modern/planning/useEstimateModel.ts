import { useEffect, useState } from 'react';
import { PlanningHistory } from '../../../utils/planning/history';
import { EstimateModel } from '../../../utils/planning/ml/estimateModel';
import { trainModelAsync } from '../../../utils/planning/ml/runModel';

/**
 * Klasik ML modelini arka planda eğitir; aynı geçmiş için bir kez (kipler
 * arasında geçişte yeniden eğitilmez). Kapalıysa ya da eğitim bitmediyse null.
 */
const cache = new WeakMap<PlanningHistory, Promise<EstimateModel | null>>();

export const useEstimateModel = (history: PlanningHistory, enabled: boolean): { model: EstimateModel | null; training: boolean } => {
    const [state, setState] = useState<{ history: PlanningHistory | null; model: EstimateModel | null }>({ history: null, model: null });
    useEffect(() => {
        if (!enabled) return;
        let alive = true;
        let p = cache.get(history);
        if (!p) {
            p = trainModelAsync(history.records).catch(() => null);
            cache.set(history, p);
        }
        p.then(model => { if (alive) setState({ history, model }); });
        return () => { alive = false; };
    }, [history, enabled]);
    if (!enabled) return { model: null, training: false };
    return state.history === history ? { model: state.model, training: false } : { model: state.history ? state.model : null, training: true };
};
