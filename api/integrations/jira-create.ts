import { handleIntegrationRequest } from '../../server/integrations/handler.js';

/** Vercel fonksiyonu: POST /api/integrations/jira-create — planlamadaki kayıtları Jira'da açar (JIRA_ALLOW_CREATE gerekir) */
export const POST = (request: Request): Promise<Response> => handleIntegrationRequest(request, process.env, { route: 'jira-create' });
export const OPTIONS = POST;
