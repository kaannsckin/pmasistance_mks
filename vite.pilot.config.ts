import path from 'path';
import { defineConfig } from 'vite';

/**
 * Pilot komut satırının derlemesi (npm run build:pilot): simülasyon, pilot
 * kontrolleri ve MCP sunucusu tek bir Node betiğine paketlenir →
 * dist-pilot/pilot.mjs. Ayrıntı: pilot/README.md
 */
export default defineConfig({
    resolve: {
        // undici'nin kullanılmayan SQLite önbelleği deneysel özellik uyarısı basmasın
        alias: { '@': path.resolve(__dirname, '.'), 'node:sqlite': path.resolve(__dirname, 'server/mcp/sqliteStub.ts') },
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
            output: { inlineDynamicImports: true, entryFileNames: 'pilot.mjs', format: 'es' },
        },
    },
});
