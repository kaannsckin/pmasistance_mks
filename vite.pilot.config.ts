import path from 'path';
import { defineConfig } from 'vite';

/**
 * Pilot komut satırının derlemesi (npm run build:pilot): simülasyon, pilot
 * kontrolleri ve MCP sunucusu tek bir Node betiğine paketlenir →
 * dist-pilot/pilot.mjs. Ayrıntı: pilot/README.md
 */
export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, '.') },
    },
    ssr: {
        noExternal: true,
        target: 'node',
    },
    build: {
        ssr: 'server/pilot/cli.ts',
        outDir: 'dist-pilot',
        emptyOutDir: true,
        target: 'node20',
        minify: false,
        sourcemap: false,
        rollupOptions: {
            output: { entryFileNames: 'pilot.mjs', format: 'es' },
        },
    },
});
