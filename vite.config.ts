import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createAiMiddleware } from './server/ai/nodeAdapter';
import { handleIntegrationRequest, IntegrationRoute } from './server/integrations/handler';

/**
 * Yerel geliştirmede /api/ai/* isteklerini AI proxy'sine bağlar. Anahtar
 * .env.local / ortam değişkenlerinden YALNIZCA sunucu tarafında okunur;
 * tarayıcı paketine hiçbir AI değişkeni gömülmez (yayında: api/ai/*).
 */
const aiProxyPlugin = (mode: string): Plugin => {
  const getEnv = () => ({ ...loadEnv(mode, '.', ''), ...process.env });
  const middleware = createAiMiddleware(getEnv, { isDev: true });
  // Kurum entegrasyonları (Jira, Teams, e-posta) — yayında api/integrations/*
  const integrations = createAiMiddleware(getEnv, {
    isDev: true,
    mountPath: '/api/integrations',
    handler: (request, env, opts) => {
      const route = new URL(request.url).pathname.split('/').pop() as IntegrationRoute;
      if (!['health', 'jira-worklogs', 'jira-issues', 'notify', 'cron-reminder'].includes(route)) return Promise.resolve(new Response('Not found', { status: 404 }));
      return handleIntegrationRequest(request, env, { route, isDev: opts.isDev });
    },
  });
  return {
    name: 'planasistan-ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai', middleware);
      server.middlewares.use('/api/integrations', integrations);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai', middleware);
      server.middlewares.use('/api/integrations', integrations);
    },
  };
};

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), aiProxyPlugin(mode)],
      // Bilgi Bankası doküman okuyucuları yalnızca gerektiğinde yüklenir; geliştirme
      // sunucusu ilk kullanımda sayfayı yenilemesin diye önceden hazırlanır
      optimizeDeps: { include: ['pdfjs-dist', 'jszip'] },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
