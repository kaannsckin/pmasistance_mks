import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleAiRequest } from '../ai/handler';
import { handleIntegrationRequest } from './handler';
import { invalidateIntegrationCache, validateIntegration } from './settings';

const ADMIN = 'yonetici-anahtari-1234567890';
let dir: string;
let ENV: Record<string, string>;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pa-int-'));
    ENV = { AI_SETTINGS_FILE: join(dir, 'ai.json'), AI_CONFIG_SECRET: 'x'.repeat(32), AI_ADMIN_TOKEN: ADMIN, AI_ACCESS_TOKEN: 'erisim-kodu-123456', JIRA_BASE_URL: 'https://eski.kurum.gov.tr', JIRA_TOKEN: 'dosya-jetonu-AAAA', JIRA_ALLOWED_PROJECTS: 'MKS' };
    invalidateIntegrationCache();
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); invalidateIntegrationCache(); });

const admin = (body: unknown, token: string | null = ADMIN) => handleAiRequest(new Request('https://app.kurum.local/api/ai/admin', {
    method: 'POST', headers: { 'content-type': 'application/json', host: 'app.kurum.local', ...(token ? { 'x-admin-token': token } : {}) }, body: JSON.stringify(body),
}), ENV);
const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('panelden entegrasyon ayarları', () => {
    it('yönetici anahtarı olmadan açılmaz', async () => {
        expect((await admin({ action: 'integrations-get' }, null)).status).toBe(401);
    });

    it('kaydedilen değer ayar dosyasının üzerine yazılır; jeton şifreli saklanır ve geri dönmez', async () => {
        const save = await admin({ action: 'integrations-save', values: { JIRA_BASE_URL: 'https://jira.kurum.gov.tr', JIRA_TOKEN: 'panel-jetonu-ZZ99', JIRA_ALLOWED_PROJECTS: 'MKS, MPS', JIRA_ALLOW_UPDATE: '1' } });
        expect(save.status).toBe(200);
        const raw = readFileSync(join(dir, 'integration-settings.json'), 'utf8');
        expect(raw).not.toContain('panel-jetonu');
        expect(raw).toContain('MKS, MPS');

        const got = await (await admin({ action: 'integrations-get' })).json();
        expect(got.panel).toMatchObject({ JIRA_BASE_URL: 'https://jira.kurum.gov.tr', JIRA_TOKEN: '…ZZ99', JIRA_ALLOWED_PROJECTS: 'MKS, MPS' });
        expect(got.env).toMatchObject({ JIRA_TOKEN: '…AAAA', JIRA_ALLOWED_PROJECTS: 'MKS' });
        expect(got.status).toMatchObject({ jira: true, jiraUpdate: true });
        expect(JSON.stringify(got)).not.toContain('panel-jetonu');

        // Entegrasyon ucu panel değerleriyle çalışır: MPS artık izinli, istek panel adresine panel jetonuyla gider
        const calls: { url: string; auth: string }[] = [];
        const fetchImpl = (async (url: string, init?: RequestInit) => {
            calls.push({ url, auth: String((init?.headers as Record<string, string>)?.authorization || '') });
            if (url.endsWith('/rest/api/2/status')) return jsonRes(200, []);
            if (url.endsWith('/rest/api/2/field')) return jsonRes(200, []);
            return jsonRes(200, { issues: [], total: 0 });
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(new Request('https://app.kurum.local/api/integrations/jira-sync', {
            method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer erisim-kodu-123456' }, body: JSON.stringify({ op: 'search', keys: ['MPS-1'] }),
        }), ENV, { route: 'jira-sync', fetchImpl });
        expect(res.status).toBe(200);
        expect(calls[0].url).toMatch(/^https:\/\/jira\.kurum\.gov\.tr\//);
        expect(calls[0].auth).toBe('Bearer panel-jetonu-ZZ99');
    });

    it('gizli alan gönderilmezse kayıtlı kalır, boş metin siler; temizleyince ayar dosyasına dönülür', async () => {
        await admin({ action: 'integrations-save', values: { JIRA_TOKEN: 'panel-jetonu-ZZ99', TEAMS_WEBHOOK_URL: 'https://hook.kurum/1' } });
        await admin({ action: 'integrations-save', values: { JIRA_ALLOWED_PROJECTS: 'MPS' } });
        let got = await (await admin({ action: 'integrations-get' })).json();
        expect(got.panel).toMatchObject({ JIRA_TOKEN: '…ZZ99', JIRA_ALLOWED_PROJECTS: 'MPS' });
        await admin({ action: 'integrations-save', values: { JIRA_TOKEN: '' } });
        got = await (await admin({ action: 'integrations-get' })).json();
        expect(got.panel.JIRA_TOKEN).toBeUndefined();
        expect(got.panel.TEAMS_WEBHOOK_URL).toBe('…um/1');
        await admin({ action: 'integrations-clear' });
        got = await (await admin({ action: 'integrations-get' })).json();
        expect(got.panel).toEqual({});
    });

    it('geçersiz değer kaydedilmez', async () => {
        expect(validateIntegration({ JIRA_ALLOWED_PROJECTS: 'MKS; DROP' })).toMatch(/proje anahtarları/);
        expect(validateIntegration({ JIRA_BASE_URL: 'jira.kurum' })).toMatch(/http/);
        expect(validateIntegration({ JIRA_TOKEN: 'a\nb' })).toMatch(/tek satır/);
        expect((await admin({ action: 'integrations-save', values: { TEAMS_WEBHOOK_URL: 'http://x' } })).status).toBe(400);
    });
});
