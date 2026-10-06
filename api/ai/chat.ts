import { handleAiRequest } from '../../server/ai/handler.js';

/** Vercel fonksiyonu: POST /api/ai/chat — anahtar Vercel ortam değişkenlerinden okunur */
export const POST = (request: Request): Promise<Response> => handleAiRequest(request, process.env, { route: 'chat' });
export const OPTIONS = POST;
