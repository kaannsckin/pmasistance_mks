import { handleAiRequest } from '../../server/ai/handler.js';

/** Vercel fonksiyonu: GET /api/ai/health — yapılandırma durumu (gizli bilgi içermez) */
export const GET = (request: Request): Promise<Response> => handleAiRequest(request, process.env, { route: 'health' });
export const OPTIONS = GET;
