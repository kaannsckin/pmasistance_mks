import { handleIntegrationRequest } from '../../server/integrations/handler.js';

export const GET = (request: Request): Promise<Response> => handleIntegrationRequest(request, process.env, { route: 'jira-history' });
