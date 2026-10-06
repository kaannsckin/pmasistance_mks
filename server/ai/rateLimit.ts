/**
 * Basit sabit pencereli hız sınırı (kişi/IP başına dakikada N istek).
 * Sunucusuz ortamda her örnek kendi sayacını tutar — kotayı tamamen
 * korumaz ama tek bir istemcinin anahtarı tüketmesini zorlaştırır.
 */

export interface RateLimiter {
    /** İzin verilirse 0, aksi halde kaç saniye sonra tekrar denenebileceği */
    hit: (subject: string, now?: number) => number;
}

export const createRateLimiter = (limitPerWindow: number, windowMs = 60_000): RateLimiter => {
    const windows = new Map<string, { start: number; count: number }>();
    return {
        hit: (subject, now = Date.now()) => {
            if (windows.size > 5000) {
                for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
            }
            const w = windows.get(subject);
            if (!w || now - w.start >= windowMs) {
                windows.set(subject, { start: now, count: 1 });
                return 0;
            }
            if (w.count >= limitPerWindow) return Math.max(1, Math.ceil((w.start + windowMs - now) / 1000));
            w.count++;
            return 0;
        },
    };
};
