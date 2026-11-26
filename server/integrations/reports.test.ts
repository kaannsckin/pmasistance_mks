import { describe, expect, it, vi } from 'vitest';
import { handleIntegrationRequest } from './handler';
import { invalidateIntegrationCache } from './settings';
import { notionBlocks } from './reports';
import { TaskStatus } from '../../types';

const NOW = new Date('2026-11-26T05:00:00Z'); // 08:00 TR, Perşembe
const project = {
    id: 'p1', name: 'ATLAS', settings: { projectStartDate: '2026-11-16', sprintDuration: 1 },
    tasks: [
        { id: 'a', name: 'Giriş', status: TaskStatus.Done, resolvedAt: '2026-11-25T12:00:00Z', jiraId: 'MKS-1', resourceName: 'Ayşe Kaya', unit: 'U', version: 2, time: { avg: 1 } },
        { id: 'b', name: 'Ödeme', status: TaskStatus.ToDo, issueType: 'bug', createdAt: '2026-11-25T15:00:00Z', jiraId: 'MKS-2', resourceName: 'Can Er', unit: 'U', version: 2, time: { avg: 1 } },
    ],
    reportSchedules: [
        { id: 's1', name: 'Günlük', enabled: true, cadence: 'daily', hour: 17, channels: { slack: true, notion: true, teams: true }, blocks: ['progress', 'bugs'], createdAt: '', updatedAt: '' },
        { id: 's2', name: 'Kapalı', enabled: false, cadence: 'daily', hour: 8, channels: { slack: true }, blocks: ['progress'], createdAt: '', updatedAt: '' },
    ],
};

const setup = () => {
    invalidateIntegrationCache();
    const calls: { url: string; init?: RequestInit }[] = [];
    let saved: unknown = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
        if (url.includes('/rest/v1/workspace_projects')) return ok([{ workspace_id: 'w', project_id: 'p1', data: project }]);
        if (url.includes('/rest/v1/workspaces')) return ok([{ id: 'w', core: { people: [] } }]);
        if (url.includes('/rest/v1/app_settings') && init?.method === 'POST') { saved = JSON.parse(String(init.body)); return new Response(null, { status: 201 }); }
        if (url.includes('/rest/v1/app_settings')) return ok(saved && (saved as { id: string }).id === 'report-runs' ? [{ data: (saved as { data: unknown }).data }] : []);
        if (url.includes('api.notion.com')) return ok({ url: 'https://notion.so/x' });
        return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;
    const env = {
        CRON_SECRET: 'gizli', SUPABASE_URL: 'https://s.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc',
        SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/x', NOTION_TOKEN: 'secret_x', NOTION_PARENT_PAGE_ID: '0123456789abcdef0123456789abcdef', TEAMS_WEBHOOK_URL: 'https://teams/x', APP_URL: 'https://app',
    };
    return { calls, fetchImpl, env };
};

const cron = (env: Record<string, string>, fetchImpl: typeof fetch, auth = 'Bearer gizli', now = NOW) =>
    handleIntegrationRequest(new Request('http://x/api/integrations/cron-reminder?route=report', { headers: { authorization: auth } }), env, { route: 'cron-report', fetchImpl, now });

describe('zamanlanmış rapor (sunucu)', () => {
    it('yetki ister; bulut verisinden zamanı gelen raporu Slack, Notion ve Teams\'e gönderir; aynı gün tekrar göndermez', async () => {
        const { calls, fetchImpl, env } = setup();
        expect((await cron(env, fetchImpl, 'Bearer yanlis')).status).toBe(401);
        const res = await cron(env, fetchImpl);
        const body = await res.json();
        expect(res.status).toBe(200);
        // Günlük cron saatlik değil: raporun saati (17) beklenmez
        expect(body.sent).toEqual([{ proje: 'ATLAS', rapor: 'Günlük', teams: 'sent', slack: 'sent', notion: 'sent' }]);
        const slack = calls.find(c => c.url.includes('hooks.slack.com'))!;
        const text = JSON.parse(String(slack.init!.body)).text as string;
        expect(text).toContain('*ATLAS · Günlük · 26 Kas · %50*');
        expect(text).toContain('*Hatalar*: 1 açık hata (+1 açıldı, −0 kapandı)');
        const notion = JSON.parse(String(calls.find(c => c.url.includes('api.notion.com'))!.init!.body));
        expect(notion.parent.page_id).toBe('0123456789abcdef0123456789abcdef');
        expect(notion.children[0]).toMatchObject({ type: 'heading_2' });
        // İkinci çalışma: bugün gönderildi
        const again = await (await cron(env, fetchImpl)).json();
        expect(again.sent).toEqual([]);
    });

    it('saatlik cron ayarıyla raporun saatine uyulur', async () => {
        const { fetchImpl, env } = setup();
        const body = await (await cron({ ...env, REPORT_CRON_HOURLY: '1' }, fetchImpl)).json();
        expect(body.sent).toEqual([]);
    });

    it('servis anahtarı yoksa yapılandırma hatası', async () => {
        const { fetchImpl, env } = setup();
        const res = await cron({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, fetchImpl);
        expect(res.status).toBe(503);
    });

    it('Notion blokları: başlık, özet, madde; 100 blok sınırı', () => {
        const b = notionBlocks([{ title: 'İlerleme', summary: '%50', lines: ['• bir', '! iki'] }], 'https://app');
        expect(b.map(x => x.type)).toEqual(['heading_2', 'paragraph', 'bulleted_list_item', 'bulleted_list_item', 'paragraph']);
        expect(JSON.stringify(b[2])).toContain('"content":"bir"');
        expect(notionBlocks(Array.from({ length: 60 }, (_, i) => ({ title: `B${i}`, lines: ['x'] }))).length).toBe(100);
    });

    it('notify: Slack ve Notion kanalları bölümlerle', async () => {
        const { calls, fetchImpl, env } = setup();
        const res = await handleIntegrationRequest(new Request('http://x/api/integrations/notify', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ subject: 'Rapor', text: '**İlerleme**: %40', slack: true, notion: true, sections: [{ title: 'İlerleme', summary: '%40', lines: [] }] }),
        }), { ...env, AI_AUTH_MODE: 'none' }, { route: 'notify', fetchImpl, isDev: true });
        expect(await res.json()).toEqual({ slack: 'sent', notion: 'sent' });
        expect(JSON.parse(String(calls.find(c => c.url.includes('hooks.slack.com'))!.init!.body)).text).toBe("*Rapor*\n\n*İlerleme*: %40\n\n<https://app|PlanAsistan'da aç>");
    });
});
