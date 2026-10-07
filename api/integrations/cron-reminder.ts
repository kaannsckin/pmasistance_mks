import { handleIntegrationRequest } from '../../server/integrations/handler.js';

/** Vercel fonksiyonu: GET /api/integrations/cron-reminder — haftalık rapor hatırlatması (Vercel cron, CRON_SECRET) */
export const GET = (request: Request): Promise<Response> => handleIntegrationRequest(request, process.env, { route: 'cron-reminder' });

