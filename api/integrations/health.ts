import { handleIntegrationRequest } from '../../server/integrations/handler.js';

/** Vercel fonksiyonu: GET /api/integrations/health — hangi entegrasyonların yapılandırıldığı (gizli bilgi içermez) */
export const GET = (request: Request): Promise<Response> => handleIntegrationRequest(request, process.env, { route: 'health' });

