import { handleIntegrationRequest } from '../../server/integrations/handler.js';

/** Vercel fonksiyonu: POST /api/integrations/notify — Teams kanalı ve/veya e-posta bildirimi (TEAMS_WEBHOOK_URL, SMTP_*) */
export const POST = (request: Request): Promise<Response> => handleIntegrationRequest(request, process.env, { route: 'notify' });
export const OPTIONS = POST;
