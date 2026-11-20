import path from 'path';
import { defineConfig } from 'vite';

/**
 * PlanAsistan yerel sürümünün sunucusu (npm run build:local): AI vekili ve
 * entegrasyonlar tek bir CommonJS betiğine paketlenir → dist-local/planasistan.cjs.
 * Tek dosyalık çalıştırılabilir (exe) için CommonJS gerekir; bkz. scripts/build-exe.mjs
 */
export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, '.'), 'node:sqlite': path.resolve(__dirname, 'server/mcp/sqliteStub.ts') },
    },
    ssr: { noExternal: true, target: 'node' },
    build: {
        ssr: 'server/local/main.ts',
        outDir: 'dist-local',
        emptyOutDir: true,
        target: 'node22',
        minify: false,
        sourcemap: false,
        rollupOptions: {
            output: { inlineDynamicImports: true, entryFileNames: 'planasistan.cjs', format: 'cjs' },
        },
    },
});
