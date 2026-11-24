import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../api/integrations/health';

const apiFunctions = (dir = 'api'): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return apiFunctions(path);
    return /\.(ts|js|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
});


// Vercel fonksiyonları düz Node ESM ile çalışır: göreli importlar .js uzantısı olmadan çözülemez.
const RELATIVE_IMPORT = /^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm;
const extensionlessImports = (entries: string[]): string[] => {
    const seen = new Set<string>();
    const found: string[] = [];
    const stack = [...entries];
    while (stack.length) {
        const file = stack.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        for (const match of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
            const spec = match[1];
            if (!spec.endsWith('.js')) found.push(`${file}: ${spec}`);
            const base = resolve(dirname(file), spec.replace(/\.js$/, ''));
            const target = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find(existsSync);
            if (target) stack.push(target);
        }
    }
    return found;
};

describe('Vercel fonksiyonları', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('Hobby planın dağıtım başına 12 fonksiyon sınırını aşmaz', () => {
        expect(apiFunctions().length).toBeLessThanOrEqual(12);
    });

    it('göreli importları .js uzantısıyla yazar (Node ESM)', () => {
        expect(extensionlessImports(apiFunctions().map(file => resolve(file)))).toEqual([]);
    });

    it('/api/cloud/config adresini entegrasyon fonksiyonuna yönlendirir', () => {
        const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
        expect(config.rewrites).toContainEqual({ source: '/api/cloud/config', destination: '/api/integrations/health?route=cloud-config' });
    });

    it('yönlendirilen istekte Supabase bağlantısını döndürür', async () => {
        vi.stubEnv('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
        vi.stubEnv('SUPABASE_ANON_KEY', 'sb_publishable_test');
        for (const url of ['https://app.example/api/integrations/health?route=cloud-config', 'https://app.example/api/cloud/config']) {
            const res = await GET(new Request(url));
            expect(res.status).toBe(200);
            expect((await res.json()).connection).toBeTruthy();
        }
    });

    it('entegrasyon durumunu eskisi gibi döndürür', async () => {
        const body = await (await GET(new Request('https://app.example/api/integrations/health'))).json();
        expect(body).not.toHaveProperty('connection');
    });
});
