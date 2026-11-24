import { CLOUD_CONFIG_PATH, normalizeCloudConnection } from '../../utils/cloudConnection.js';

export const handleCloudConfig = async (request: Request, env: Record<string, string | undefined>): Promise<Response> => {
    const headers = { 'cache-control': 'no-store' };
    if (new URL(request.url).pathname !== CLOUD_CONFIG_PATH) return new Response(null, { status: 404, headers });
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...headers, allow: 'GET' } });
    const connection = normalizeCloudConnection(env.SUPABASE_URL ?? '', env.SUPABASE_ANON_KEY ?? '');
    return Response.json({ connection }, { headers });
};
