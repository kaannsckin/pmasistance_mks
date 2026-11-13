import { handleIntegrationRequest } from '../../server/integrations/handler.js';

/** Vercel fonksiyonu: POST /api/integrations/jira-sync — kapsamlı canlı eşitleme (op: meta | search | update; JIRA_ALLOW_UPDATE) */
export const POST = (request: Request): Promise<Response> => handleIntegrationRequest(request, process.env, { route: 'jira-sync' });
export const OPTIONS = POST;
