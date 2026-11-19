/** Kota/hız sınırı yanıtından çıkarılan yeniden deneme bilgisi (istemciye iletilir) */
export interface UpstreamRetryInfo {
    /** Sağlayıcının önerdiği bekleme (saniye) */
    retryAfterSec?: number;
    /** daily: günlük kota doldu · exhausted: kota/bakiye bitti — dakikalar içinde açılmaz */
    quota?: 'daily' | 'exhausted';
}

const MAX_RETRY_AFTER_SEC = 24 * 3600;

/** Google RetryInfo.retryDelay: "37s" / "1.5s" ya da {seconds, nanos} */
const parseDelay = (v: unknown): number | undefined => {
    if (typeof v === 'string') {
        const m = /^(\d+(?:\.\d+)?)s$/.exec(v.trim());
        return m ? Number(m[1]) : undefined;
    }
    if (v && typeof v === 'object') {
        const o = v as { seconds?: number | string; nanos?: number };
        const s = Number(o.seconds || 0) + Number(o.nanos || 0) / 1e9;
        return s > 0 ? s : undefined;
    }
    return undefined;
};

/**
 * 429 yanıtından bekleme süresi ve kota türü: `retry-after-ms` / `retry-after`
 * başlıkları (OpenAI, Azure…), Gemini'nin RetryInfo ve QuotaFailure ayrıntıları,
 * OpenAI'nin `insufficient_quota` kodu.
 */
export const upstreamRetryInfo = (headers: Pick<Headers, 'get'>, bodyText: string, now = Date.now()): UpstreamRetryInfo => {
    let sec: number | undefined;
    const ms = Number(headers.get('retry-after-ms'));
    if (ms > 0) sec = ms / 1000;
    const ra = headers.get('retry-after')?.trim();
    if (sec === undefined && ra) {
        if (/^\d+(\.\d+)?$/.test(ra)) sec = Number(ra);
        else if (!Number.isNaN(Date.parse(ra))) sec = (Date.parse(ra) - now) / 1000;
    }

    let quota: UpstreamRetryInfo['quota'];
    let json: unknown;
    try { json = JSON.parse(bodyText); } catch { json = null; }
    const err = (Array.isArray(json) ? json[0] : json as { error?: unknown } | null)?.error as
        { code?: unknown; type?: unknown; details?: unknown } | undefined;
    if (err && typeof err === 'object') {
        for (const d of Array.isArray(err.details) ? err.details as Record<string, unknown>[] : []) {
            const type = String(d?.['@type'] || '');
            if (sec === undefined && type.endsWith('RetryInfo')) sec = parseDelay(d.retryDelay);
            const violations = Array.isArray(d?.violations) ? d.violations as { quotaId?: unknown }[] : [];
            if (type.endsWith('QuotaFailure') && violations.some(v => /PerDay/i.test(String(v?.quotaId || '')))) quota = 'daily';
        }
        if (err.code === 'insufficient_quota' || err.type === 'insufficient_quota') quota = 'exhausted';
    }

    const out: UpstreamRetryInfo = {};
    if (sec !== undefined && Number.isFinite(sec) && sec > 0) out.retryAfterSec = Math.min(MAX_RETRY_AFTER_SEC, Math.ceil(sec));
    if (quota) out.quota = quota;
    return out;
};

/** Sağlayıcı hatasının kullanıcıya gösterilen Türkçe açıklaması (anahtar değeri içermez) */
export const upstreamErrorMessage = (status: number, detail: string, keyName = "sunucudaki AI_API_KEY'i"): string => {
    const suffix = detail ? ` (${detail})` : '';
    if (status === 401 || status === 403) return `AI sağlayıcısı anahtarı reddetti; ${keyName} kontrol edin${suffix}.`;
    if (status === 404) return `Model ya da uç nokta bulunamadı; AI_MODEL / AI_BASE_URL'i kontrol edin${suffix}.`;
    if (status === 429) return `AI sağlayıcısı kota/hız sınırına ulaştı; biraz sonra tekrar deneyin${suffix}.`;
    if (status === 503 || (status >= 500 && /high demand|overloaded|try again later/i.test(detail))) {
        return 'AI modeli şu an çok yoğun (sağlayıcı tarafında geçici bir durum); birkaç saniye sonra tekrar deneyin.';
    }
    if (status >= 500) return `AI sağlayıcısında geçici bir hata oluştu${suffix}.`;
    if (/tool|function/i.test(detail)) {
        return `AI sağlayıcısı araç çağrısını (tool calling) reddetti; model ya da sunucu desteklemiyor olabilir (vLLM'de --enable-auto-tool-choice ve --tool-call-parser gerekir)${suffix}.`;
    }
    return `AI sağlayıcısı isteği reddetti${suffix}.`;
};
