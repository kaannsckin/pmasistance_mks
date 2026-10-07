import { describe, expect, it, vi } from 'vitest';
import { buildWorklogJql, checkRecipients, handleIntegrationRequest, integrationStatus, Mailer, reminderMessage, teamsCard } from './handler';

const TOKEN = 'erisim-kodu-12345678901234567890';
const BASE_ENV = { AI_ACCESS_TOKEN: TOKEN };

const post = (route: string, body: unknown, token: string | null = TOKEN) =>
    new Request(`http://localhost/api/integrations/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });

const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('durum ve yardımcılar', () => {
    it('hangi entegrasyonun yapılandırıldığını gizli bilgi vermeden söyler', async () => {
        const env = { JIRA_BASE_URL: 'https://jira.kurum.gov.tr', JIRA_TOKEN: 'x', TEAMS_WEBHOOK_URL: 'https://hook', SMTP_HOST: 'smtp', SMTP_FROM: 'pa@kurum.gov.tr' };
        expect(integrationStatus(env)).toEqual({ jira: true, teams: true, email: true, reminder: false });
        const res = await handleIntegrationRequest(new Request('http://x/api/integrations/health'), env, { route: 'health' });
        const body = await res.json();
        expect(body).toEqual({ jira: true, teams: true, email: true, reminder: false, authMode: 'none' });
        expect(JSON.stringify(body)).not.toContain('jira.kurum');
    });

    it('JQL, alıcı alan adı kısıtı ve Teams kartı', () => {
        expect(buildWorklogJql('mks', '2026-10-05', '2026-10-11')).toBe('project = "MKS" AND worklogDate >= "2026-10-05" AND worklogDate <= "2026-10-11" ORDER BY key');
        expect(checkRecipients(['A@kurum.gov.tr', 'b@alt.kurum.gov.tr', 'kotu@baska.com', 'bozuk', 'a@kurum.gov.tr'], { SMTP_FROM: 'pa@kurum.gov.tr' }))
            .toEqual({ ok: ['a@kurum.gov.tr', 'b@alt.kurum.gov.tr'], rejected: ['kotu@baska.com', 'bozuk'] });
        const card = teamsCard('Konu', 'Metin', 'https://app');
        expect(card.attachments[0].content.body[0].text).toBe('Konu');
        expect(card.attachments[0].content.actions[0].url).toBe('https://app');
        expect(reminderMessage('https://app', new Date('2026-10-08T07:00:00Z')).text).toContain('Rapor sayfası: https://app');
    });
});

describe('bildirim', () => {
    it('kimlik bilgisi olmadan reddedilir; koruma yapılandırılmamışsa yayında kapalıdır', async () => {
        expect((await handleIntegrationRequest(post('notify', { subject: 'a', text: 'b' }, null), BASE_ENV, { route: 'notify' })).status).toBe(401);
        expect((await handleIntegrationRequest(post('notify', { subject: 'a', text: 'b' }), {}, { route: 'notify' })).status).toBe(503);
    });

    it('Teams ve e-posta: yapılandırılmamışsa not_configured, yapılandırılmışsa gönderir', async () => {
        const r1 = await handleIntegrationRequest(post('notify', { subject: 'Rapor', text: 'Metin', teams: true, email: { to: ['m@kurum.gov.tr'] } }), BASE_ENV, { route: 'notify' });
        expect(await r1.json()).toEqual({ teams: 'not_configured', email: 'not_configured', rejected: [] });

        const fetchImpl = vi.fn(async () => new Response('1', { status: 200 })) as unknown as typeof fetch;
        const sent: unknown[] = [];
        const mailer: Mailer = { sendMail: async m => { sent.push(m); } };
        const env = { ...BASE_ENV, TEAMS_WEBHOOK_URL: 'https://hook.example/x', SMTP_HOST: 'smtp', SMTP_FROM: 'pa@kurum.gov.tr', APP_URL: 'https://app' };
        const r2 = await handleIntegrationRequest(post('notify', { subject: 'Rapor', text: 'Metin', html: '<p>Metin</p>', teams: true, email: { to: ['m@kurum.gov.tr', 'x@disari.com'] } }), env, { route: 'notify', fetchImpl, mailer });
        expect(await r2.json()).toEqual({ teams: 'sent', email: 'sent', rejected: ['x@disari.com'] });
        const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
        expect(url).toBe('https://hook.example/x');
        expect(JSON.parse(String(init.body)).attachments[0].contentType).toBe('application/vnd.microsoft.card.adaptive');
        expect(sent[0]).toMatchObject({ from: 'pa@kurum.gov.tr', to: 'm@kurum.gov.tr', subject: 'Rapor', html: '<p>Metin</p>' });
    });
});

describe('Jira worklog', () => {
    const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://jira.kurum.gov.tr/', JIRA_TOKEN: 'pat' };

    it('yapılandırılmamışsa 501, geçersiz girdi 400', async () => {
        expect((await handleIntegrationRequest(post('jira-worklogs', { projectKey: 'MKS', from: '2026-10-05', to: '2026-10-11' }), BASE_ENV, { route: 'jira-worklogs' })).status).toBe(501);
        expect((await handleIntegrationRequest(post('jira-worklogs', { projectKey: 'M KS"', from: '2026-10-05', to: '2026-10-11' }), env, { route: 'jira-worklogs' })).status).toBe(400);
    });

    it('arama + eksik worklog sayfası; tarih aralığı dışındakiler atılır', async () => {
        const calls: string[] = [];
        const fetchImpl = (async (url: string, init?: RequestInit) => {
            calls.push(url);
            expect((init?.headers as Record<string, string>).authorization).toBe('Bearer pat');
            if (url.includes('/search')) {
                return jsonRes(200, {
                    total: 2,
                    issues: [
                        { key: 'MKS-12', fields: { summary: 'Multi-domain', worklog: { total: 1, worklogs: [{ started: '2026-10-06T09:00:00.000+0300', timeSpentSeconds: 7200, comment: 'Alan adı doğrulama', author: { displayName: 'Kaan Demir' } }] } } },
                        { key: 'MKS-15', fields: { summary: 'Arşiv', worklog: { total: 30, worklogs: [] } } },
                    ],
                });
            }
            return jsonRes(200, {
                worklogs: [
                    { started: '2026-10-07T10:00:00.000+0300', timeSpentSeconds: 3600, comment: { type: 'doc', content: [{ content: [{ text: 'ADF yorum' }] }] }, author: { name: 'ali' } },
                    { started: '2026-09-30T10:00:00.000+0300', timeSpentSeconds: 3600, author: { displayName: 'Eski' } },
                ],
            });
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-worklogs', { projectKey: 'mks', from: '2026-10-05', to: '2026-10-11' }), env, { route: 'jira-worklogs', fetchImpl });
        const { entries } = await res.json();
        expect(calls[0]).toContain('https://jira.kurum.gov.tr/rest/api/2/search?jql=');
        expect(calls[1]).toBe('https://jira.kurum.gov.tr/rest/api/2/issue/MKS-15/worklog');
        expect(entries).toEqual([
            { date: '2026-10-06', author: 'Kaan Demir', issueKey: 'MKS-12', summary: 'Multi-domain', hours: 2, comment: 'Alan adı doğrulama', source: 'jira' },
            { date: '2026-10-07', author: 'ali', issueKey: 'MKS-15', summary: 'Arşiv', hours: 1, comment: 'ADF yorum', source: 'jira' },
        ]);
    });

    it('Jira yetki hatası anlaşılır mesajla döner', async () => {
        const fetchImpl = (async () => jsonRes(401, {})) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-worklogs', { projectKey: 'MKS', from: '2026-10-05', to: '2026-10-11' }), env, { route: 'jira-worklogs', fetchImpl });
        expect(res.status).toBe(502);
        expect((await res.json()).error).toContain('Jira erişimi reddedildi');
    });
});

describe('haftalık hatırlatma (cron)', () => {
    const cronReq = (secret?: string) => new Request('http://x/api/integrations/cron-reminder', { headers: secret ? { authorization: `Bearer ${secret}` } : {} });

    it('CRON_SECRET olmadan çalışmaz; yanlış sırla 401', async () => {
        expect((await handleIntegrationRequest(cronReq('a'), {}, { route: 'cron-reminder' })).status).toBe(503);
        expect((await handleIntegrationRequest(cronReq('yanlis'), { CRON_SECRET: 'dogru' }, { route: 'cron-reminder' })).status).toBe(401);
    });

    it('Teams kanalına ve dağıtım listesine gönderir', async () => {
        const fetchImpl = vi.fn(async () => new Response('1')) as unknown as typeof fetch;
        const sent: { bcc?: string }[] = [];
        const env = { CRON_SECRET: 'dogru', TEAMS_WEBHOOK_URL: 'https://hook', SMTP_HOST: 'smtp', SMTP_FROM: 'pa@kurum.gov.tr', REPORT_REMINDER_TO: 'py-listesi@kurum.gov.tr, disari@x.com' };
        const res = await handleIntegrationRequest(cronReq('dogru'), env, { route: 'cron-reminder', fetchImpl, mailer: { sendMail: async m => { sent.push(m); } } });
        expect(await res.json()).toEqual({ ok: true, teams: 'sent', email: 'sent' });
        expect(sent[0].bcc).toBe('py-listesi@kurum.gov.tr');
    });
});
