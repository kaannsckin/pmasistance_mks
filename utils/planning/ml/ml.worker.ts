import { HistoryRecord, PlanningHistory } from '../history';
import { evaluateEstimateModel, trainEstimateModel } from './estimateModel';

/** Klasik ML modelinin eğitimi ve sınaması arayüzü kilitlemeden arka planda */
type Req = { kind: 'train'; records: HistoryRecord[] } | { kind: 'evaluate'; records: HistoryRecord[]; id: string };

const historyOf = (records: HistoryRecord[]): PlanningHistory => ({
    report: { total: records.length, closed: records.length, usable: records.length, byIssue: {}, medianByType: [], estimateRatio: null, byProject: [], rows: [] },
    records,
});

self.onmessage = (e: MessageEvent<Req>) => {
    const post = (self as unknown as { postMessage: (m: unknown) => void }).postMessage;
    try {
        const d = e.data;
        post(d.kind === 'train' ? { model: trainEstimateModel(d.records) } : { run: evaluateEstimateModel(historyOf(d.records), { id: d.id }) });
    } catch (err) {
        post({ error: err instanceof Error ? err.message : String(err) });
    }
};
