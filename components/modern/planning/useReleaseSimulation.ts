import { useEffect, useRef, useState } from 'react';
import { Leave, Person, Project, ReleasePlan } from '../../../types';
import { PlanningHistory } from '../../../utils/planning/history';
import { SimResult } from '../../../utils/planning/monteCarlo';
import { buildReleaseSimulation, ReleaseSimulation } from '../../../utils/planning/releasePlan';
import { runSimulationAsync } from '../../../utils/planning/runSimulation';

export interface ReleaseSimState {
    sim: ReleaseSimulation | null;
    result: SimResult | null;
    running: boolean;
    error: string | null;
}

/**
 * Sürüm planı değiştikçe (gecikmeli) simülasyonu arka planda yeniden çalıştırır;
 * önceki çalışma iptal edilir. `enabled` kapalıyken hiçbir şey yapmaz.
 */
export const useReleaseSimulation = (
    project: Project,
    plan: ReleasePlan,
    history: PlanningHistory,
    ctx: { people: Person[]; leaves: Leave[] },
    opts: { enabled: boolean; iterations?: number; visibleProjectIds?: ReadonlySet<string> },
): ReleaseSimState => {
    const [state, setState] = useState<ReleaseSimState>({ sim: null, result: null, running: false, error: null });
    const runId = useRef(0);
    // Plan her düzenlemede yeni nesne; yalnız simülasyonu etkileyen içerik değişince çalışsın
    const key = JSON.stringify([plan.items, plan.milestones, plan.targetDate, plan.testDays, opts.iterations]);

    useEffect(() => {
        if (!opts.enabled) return;
        const id = ++runId.current;
        const abort = new AbortController();
        setState(s => ({ ...s, running: true, error: null }));
        const timer = setTimeout(() => {
            try {
                const sim = buildReleaseSimulation(project, plan, history, ctx, { now: new Date(), iterations: opts.iterations ?? 3000, visibleProjectIds: opts.visibleProjectIds });
                if (!sim.built.input.groups?.[0]?.tasks.length) {
                    if (id === runId.current) setState({ sim, result: null, running: false, error: null });
                    return;
                }
                runSimulationAsync(sim.built.input, abort.signal).then(result => {
                    if (id === runId.current) setState({ sim, result, running: false, error: null });
                }, e => {
                    if (id !== runId.current || abort.signal.aborted) return;
                    setState(s => ({ ...s, running: false, error: e instanceof Error ? e.message : String(e) }));
                });
            } catch (e) {
                setState(s => ({ ...s, running: false, error: e instanceof Error ? e.message : String(e) }));
            }
        }, 300);
        return () => { clearTimeout(timer); abort.abort(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opts.enabled, key, project.tasks, project.resources, project.settings, history, ctx.people, ctx.leaves]);

    return state;
};
