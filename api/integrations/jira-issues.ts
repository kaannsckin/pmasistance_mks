import { handleIntegrationRequest } from '../../server/integrations/handler.js';

/** Vercel fonksiyonu: POST /api/integrations/jira-issues — planlama geçmişi için Jira kayıtları ve durum geçmişi (JIRA_* ortam değişkenleri) */
export const POST = (request: Request): Promise<Response> => handleIntegrationRequest(request, process.env, { route: 'jira-issues' });
export const OPTIONS = POST;
