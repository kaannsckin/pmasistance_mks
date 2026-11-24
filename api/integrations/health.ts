import { handleIntegrationRequest } from '../../server/integrations/handler.js';
import { handleCloudConfig } from '../../server/cloud/config.js';
import { CLOUD_CONFIG_PATH } from '../../utils/cloudConnection.js';

// Vercel Hobby planı dağıtım başına 12 fonksiyonla sınırlı. /api/cloud/config bu fonksiyona
// vercel.json rewrite'ıyla yönlenir; ayrı bir fonksiyon dosyası eklemeyin.
const isCloudConfig = (url: URL) => url.pathname === CLOUD_CONFIG_PATH || url.searchParams.get('route') === 'cloud-config';

/** Vercel fonksiyonu: GET /api/integrations/health (entegrasyon durumu) ve GET /api/cloud/config (Supabase bağlantısı). Gizli bilgi içermez. */
export const GET = (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    return isCloudConfig(url)
        ? handleCloudConfig(new Request(new URL(CLOUD_CONFIG_PATH, url)), process.env)
        : handleIntegrationRequest(request, process.env, { route: 'health' });
};
