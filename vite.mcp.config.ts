import path from 'path';
import { defineConfig } from 'vite';

/**
 * PlanAsistan MCP sunucusunun derlemesi (npm run build:mcp): uygulamanın
 * araç kataloğu ve hesap motorları tek bir Node betiğine paketlenir →
 * dist-mcp/planasistan-mcp.mjs. Bağımlılıklar da pakete girer; betik
 * `node` ile tek başına çalışır. Ayrıntı: docs/MCP_KURULUM.md
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
        ssr: 'server/mcp/stdio.ts',
        outDir: 'dist-mcp',
        emptyOutDir: true,
        target: 'node20',
        minify: false,
        sourcemap: false,
        rollupOptions: {
            output: { inlineDynamicImports: true, entryFileNames: 'planasistan-mcp.mjs', format: 'es' },
        },
    },
});
