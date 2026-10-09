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
        alias: { '@': path.resolve(__dirname, '.') },
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
            output: { entryFileNames: 'planasistan-mcp.mjs', format: 'es' },
        },
    },
});
