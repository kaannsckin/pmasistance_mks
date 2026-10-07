import { runMonteCarlo, SimInput, SimResult } from './monteCarlo';

/**
 * Simülasyonu Web Worker'da çalıştırır (10.000 tekrar arayüzü dondurmasın).
 * Worker kurulamazsa (eski tarayıcı, test ortamı) aynı motor ana iş
 * parçacığında çalışır; sonuç aynıdır. `signal` iptal edilince (ayar yeniden
 * değişti) worker sonlandırılır ve söz AbortError ile reddedilir.
 */
export const runSimulationAsync = (input: SimInput, signal?: AbortSignal): Promise<SimResult> => {
    const aborted = () => new DOMException('Simülasyon iptal edildi', 'AbortError');
    if (signal?.aborted) return Promise.reject(aborted());
    const inline = () => new Promise<SimResult>((resolve, reject) => setTimeout(() => {
        if (signal?.aborted) { reject(aborted()); return; }
        try { resolve(runMonteCarlo(input)); } catch (e) { reject(e); }
    }, 0));
    if (typeof Worker === 'undefined') return inline();
    let worker: Worker;
    try {
        worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
    } catch {
        return inline();
    }
    return new Promise<SimResult>((resolve, reject) => {
        const onAbort = () => { worker.terminate(); reject(aborted()); };
        signal?.addEventListener('abort', onAbort, { once: true });
        const done = () => { signal?.removeEventListener('abort', onAbort); worker.terminate(); };
        worker.onmessage = (e: MessageEvent<{ result: SimResult }>) => { done(); resolve(e.data.result); };
        worker.onerror = ev => { ev.preventDefault(); done(); inline().then(resolve, reject); };
        worker.postMessage({ input });
    });
};
