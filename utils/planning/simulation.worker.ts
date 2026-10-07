import { runMonteCarlo, SimInput } from './monteCarlo';

/** Monte Carlo simülasyonunu arayüzü kilitlemeden arka planda çalıştırır */
self.onmessage = (e: MessageEvent<{ input: SimInput }>) => {
    const result = runMonteCarlo(e.data.input);
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ result });
};
