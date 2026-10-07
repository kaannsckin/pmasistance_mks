import { handleIntegrationRequest } from '../../server/integrations/handler.js';

/** Vercel fonksiyonu: POST /api/integrations/jira-worklogs — Jira worklog kayıtları (JIRA_* ortam değişkenleri) */
export const POST = (request: Request): Promise<Response> => handleIntegrationRequest(request, process.env, { route: 'jira-worklogs' });
export const OPTIONS = POST;
