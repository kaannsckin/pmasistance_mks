import { handleIntegrationRequest } from '../../server/integrations/handler.js';

// Vercel Hobby planı dağıtım başına 12 fonksiyonla sınırlı: zamanlanmış proje raporları da bu
// fonksiyondan çalışır (?route=report); ayrı bir fonksiyon dosyası eklemeyin.
/** Vercel fonksiyonu: GET /api/integrations/cron-reminder — haftalık rapor hatırlatması; ?route=report: zamanlanmış proje raporları (Vercel cron, CRON_SECRET) */
export const GET = (request: Request): Promise<Response> =>
    handleIntegrationRequest(request, process.env, { route: new URL(request.url).searchParams.get('route') === 'report' ? 'cron-report' : 'cron-reminder' });
