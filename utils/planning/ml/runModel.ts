import { ModelEvalRun, WorkspaceData } from '../../../types';
import { aiPolicyOf } from '../../ai/policy';
import { HistoryRecord, PlanningHistory } from '../history';
import { RecordDraft } from '../referenceClass';
import { EstimateModel, evaluateEstimateModel, MIN_TRAIN, MODEL_VERSION, ModelEstimate, predictEstimate, trainEstimateModel } from './estimateModel';

/**
 * Model eğitimi ve sınaması Web Worker'da (binlerce kayıtta birkaç saniye
 * sürebilir). Worker kurulamazsa aynı kod ana iş parçacığında çalışır.
 */

const aborted = () => new DOMException('Model eğitimi iptal edildi', 'AbortError');

const run = <T,>(message: unknown, inline: () => T, pick: (d: Record<string, unknown>) => T, signal?: AbortSignal): Promise<T> => {
    if (signal?.aborted) return Promise.reject(aborted());
    const fallback = () => new Promise<T>((resolve, reject) => setTimeout(() => {
        if (signal?.aborted) { reject(aborted()); return; }
        try { resolve(inline()); } catch (e) { reject(e); }
    }, 0));
    if (typeof Worker === 'undefined') return fallback();
    let worker: Worker;
    try {
        worker = new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module' });
    } catch {
        return fallback();
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => { worker.terminate(); reject(aborted()); };
        signal?.addEventListener('abort', onAbort, { once: true });
        const done = () => { signal?.removeEventListener('abort', onAbort); worker.terminate(); };
        worker.onmessage = (e: MessageEvent<Record<string, unknown>>) => {
            done();
            if (typeof e.data.error === 'string') reject(new Error(e.data.error)); else resolve(pick(e.data));
        };
        worker.onerror = ev => { ev.preventDefault(); done(); fallback().then(resolve, reject); };
        worker.postMessage(message);
    });
};

const stub = (records: HistoryRecord[]): PlanningHistory => ({
    report: { total: records.length, closed: records.length, usable: records.length, byIssue: {}, medianByType: [], estimateRatio: null, byProject: [], rows: [] },
    records,
});

export const trainModelAsync = (records: HistoryRecord[], signal?: AbortSignal): Promise<EstimateModel | null> =>
    run({ kind: 'train', records }, () => trainEstimateModel(records), d => (d.model as EstimateModel | null) ?? null, signal);

export const evaluateModelAsync = (records: HistoryRecord[], id: string, signal?: AbortSignal): Promise<ModelEvalRun> =>
    run({ kind: 'evaluate', records, id }, () => evaluateEstimateModel(stub(records), { id }), d => d.run as ModelEvalRun, signal);

/**
 * Planlamada model önerisi gösterilsin mi (politika + son sınama + yeterli
 * veri). Ekip tahmini girilmiş ve girilmemiş taslak için ayrı karar.
 */
export const modelEstimateEnabled = (ws: Pick<WorkspaceData, 'aiPolicy' | 'modelEvals'>, records: number): { withEstimate: boolean; withoutEstimate: boolean } => {
    if (records < MIN_TRAIN) return { withEstimate: false, withoutEstimate: false };
    const policy = aiPolicyOf(ws).modelEstimate;
    if (policy !== 'auto') return { withEstimate: policy === 'on', withoutEstimate: policy === 'on' };
    const last = [...(ws.modelEvals || [])].reverse().find(r => r.version === MODEL_VERSION);
    return { withEstimate: last?.withEstimate?.better === true, withoutEstimate: last?.better === true };
};

/** Planlamada kullanılabilir model ve hangi taslak türünde gösterileceği */
export interface PlanningModel {
    model: EstimateModel;
    gate: { withEstimate: boolean; withoutEstimate: boolean };
}

/** Taslak için model tahmini; bu taslak türünde (ekip tahminli / tahminsiz) model sınamayı geçmediyse null */
export const modelFor = (ml: PlanningModel | null | undefined, draft: RecordDraft): ModelEstimate | null => {
    if (!ml || !draft.name.trim()) return null;
    return (draft.ownEstimateDays ? ml.gate.withEstimate : ml.gate.withoutEstimate) ? predictEstimate(ml.model, draft) : null;
};
