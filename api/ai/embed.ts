import { handleAiRequest } from '../../server/ai/handler.js';

/** Vercel fonksiyonu: POST /api/ai/embed — RAG embedding (isteğe bağlı, AI_EMBEDDING_MODEL) */
export const POST = (request: Request): Promise<Response> => handleAiRequest(request, process.env, { route: 'embed' });
export const OPTIONS = POST;
