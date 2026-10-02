import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createAiMiddleware } from './server/ai/nodeAdapter';

/**
 * Yerel geliştirmede /api/ai/* isteklerini AI proxy'sine bağlar. Anahtar
 * .env.local / ortam değişkenlerinden YALNIZCA sunucu tarafında okunur;
 * tarayıcı paketine hiçbir AI değişkeni gömülmez (yayında: api/ai/*).
 */
const aiProxyPlugin = (mode: string): Plugin => {
  const getEnv = () => ({ ...loadEnv(mode, '.', ''), ...process.env });
  const middleware = createAiMiddleware(getEnv, { isDev: true });
  return {
    name: 'planasistan-ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai', middleware);
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
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
