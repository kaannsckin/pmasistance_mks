import { AiConfig } from './config.js';

/**
 * Proxy erişim koruması — kurumsal anahtarın kotasını yalnızca uygulama
 * kullanıcılarına açar.
 *
 *  - none     : koruma yok (yalnızca yerel geliştirme / kurum içi ağ)
 *  - token    : paylaşılan erişim kodu (Authorization: Bearer <AI_ACCESS_TOKEN>)
 *  - supabase : Supabase oturumu + en az bir çalışma alanına üyelik
 *               (workspace_members RLS'i yalnızca kendi üyeliklerini döndürür)
 */

export type AuthResult =
    | { ok: true; subject: string }
    | { ok: false; status: number; message: string };

/** Sabit zamanlı karşılaştırma — erişim kodu harf harf tahmin edilemesin */
export const safeEqual = (a: string, b: string): boolean => {
    const len = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diff === 0;
};

export const clientIp = (request: Request): string =>
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'yerel';

const bearer = (request: Request): string | undefined => {
    const h = request.headers.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m ? m[1].trim() : undefined;
};

const SUPABASE_CACHE_MS = 60_000;
const supabaseCache = new Map<string, { subject: string; until: number }>();

const verifySupabase = async (config: AiConfig, jwt: string, fetchImpl: typeof fetch, now: number): Promise<AuthResult> => {
    const cached = supabaseCache.get(jwt);
    if (cached && cached.until > now) return { ok: true, subject: cached.subject };

    const headers = { apikey: config.supabaseAnonKey!, authorization: `Bearer ${jwt}` };
    const userRes = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, { headers });
    if (!userRes.ok) return { ok: false, status: 401, message: 'Oturum doğrulanamadı; bulut penceresinden yeniden giriş yapın.' };
    const user = await userRes.json().catch(() => null) as { id?: string } | null;
    if (!user?.id) return { ok: false, status: 401, message: 'Oturum doğrulanamadı; bulut penceresinden yeniden giriş yapın.' };

    const memRes = await fetchImpl(`${config.supabaseUrl}/rest/v1/workspace_members?select=role&limit=1`, { headers });
    const rows = memRes.ok ? await memRes.json().catch(() => []) : [];
    if (!Array.isArray(rows) || rows.length === 0) {
        return { ok: false, status: 403, message: 'AI asistanı yalnızca bir çalışma alanının üyelerine açıktır.' };
    }

    const subject = `user:${user.id}`;
    if (supabaseCache.size > 1000) supabaseCache.clear();
    supabaseCache.set(jwt, { subject, until: now + SUPABASE_CACHE_MS });
    return { ok: true, subject };
};

export const authorize = async (
    request: Request,
    config: AiConfig,
    fetchImpl: typeof fetch = fetch,
    now: number = Date.now()
): Promise<AuthResult> => {
    if (config.authMode === 'none') return { ok: true, subject: `ip:${clientIp(request)}` };

    const token = bearer(request);
    if (!token) return { ok: false, status: 401, message: 'AI erişimi için kimlik bilgisi gerekli.' };

    if (config.authMode === 'token') {
        return safeEqual(token, config.accessToken || '')
            ? { ok: true, subject: `ip:${clientIp(request)}` }
            : { ok: false, status: 401, message: 'Erişim kodu geçersiz.' };
    }

    try {
        return await verifySupabase(config, token, fetchImpl, now);
    } catch {
        return { ok: false, status: 503, message: 'Oturum doğrulama servisine ulaşılamadı.' };
    }
};

/** Testler için önbelleği sıfırlar */
export const resetAuthCache = (): void => supabaseCache.clear();
