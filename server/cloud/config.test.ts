import { describe, expect, it } from 'vitest';
import { handleCloudConfig } from './config';

const url = 'https://planasistan.supabase.co';
const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
const request = (method = 'GET') => new Request('https://app.example/api/cloud/config', { method });

describe('bulut bağlantısı dağıtım ayarları', () => {
    it.each(['sb_publishable_dummy-test', jwt('anon')])('yalnız tarayıcıya uygun bağlantıyı döndürür', async key => {
        const r = await handleCloudConfig(request(), {
            SUPABASE_URL: ` ${url}/ `,
            SUPABASE_ANON_KEY: key,
            SUPABASE_SERVICE_ROLE_KEY: 'never-in-response',
        });
        expect(r.headers.get('cache-control')).toBe('no-store');
        expect(await r.json()).toEqual({ connection: { url, anonKey: key } });
    });

    it.each(['sb_secret_dummy-test', jwt('service_role'), jwt('authenticated'), '', 'invalid'])('gizli veya geçersiz anahtarı yayınlamaz', async key => {
        const r = await handleCloudConfig(request(), { SUPABASE_URL: url, SUPABASE_ANON_KEY: key });
        expect(await r.json()).toEqual({ connection: null });
    });

    it('URL içine gömülmüş kimlik bilgilerini reddeder', async () => {
        const r = await handleCloudConfig(request(), { SUPABASE_URL: 'https://user:secret@example.com', SUPABASE_ANON_KEY: 'sb_publishable_test' });
        expect(await r.json()).toEqual({ connection: null });
        expect((await handleCloudConfig(request('POST'), {})).status).toBe(405);
    });
});
