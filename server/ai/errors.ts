/** Sağlayıcı hatasının kullanıcıya gösterilen Türkçe açıklaması (anahtar değeri içermez) */
export const upstreamErrorMessage = (status: number, detail: string, keyName = "sunucudaki AI_API_KEY'i"): string => {
    const suffix = detail ? ` (${detail})` : '';
    if (status === 401 || status === 403) return `AI sağlayıcısı anahtarı reddetti; ${keyName} kontrol edin${suffix}.`;
    if (status === 404) return `Model ya da uç nokta bulunamadı; AI_MODEL / AI_BASE_URL'i kontrol edin${suffix}.`;
    if (status === 429) return `AI sağlayıcısı kota/hız sınırına ulaştı; biraz sonra tekrar deneyin${suffix}.`;
    if (status >= 500) return `AI sağlayıcısında geçici bir hata oluştu${suffix}.`;
    if (/tool|function/i.test(detail)) {
        return `AI sağlayıcısı araç çağrısını (tool calling) reddetti; model ya da sunucu desteklemiyor olabilir (vLLM'de --enable-auto-tool-choice ve --tool-call-parser gerekir)${suffix}.`;
    }
    return `AI sağlayıcısı isteği reddetti${suffix}.`;
};
