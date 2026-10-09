import { handleAiRequest } from '../../server/ai/handler.js';

/** Vercel fonksiyonu: POST /api/ai/admin — yönetici panelinden AI bağlantı ayarları ve bağlantı testi (AI_ADMIN_TOKEN) */
export const POST = (request: Request): Promise<Response> => handleAiRequest(request, process.env, { route: 'admin' });
export const OPTIONS = POST;
