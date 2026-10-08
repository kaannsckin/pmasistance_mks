import { describe, expect, it, vi } from 'vitest';
import { buildIssueJql, buildWorklogJql, checkRecipients, handleIntegrationRequest, integrationStatus, JiraIssueRecord, Mailer, plainDescription, reminderMessage, teamsCard } from './handler';

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

    it('Jira Cloud: yeni arama ucu ve sayfa jetonuyla tüm sayfalar', async () => {
        const cloudEnv = { ...BASE_ENV, JIRA_BASE_URL: 'https://kurum.atlassian.net', JIRA_EMAIL: 'pa@kurum.gov.tr', JIRA_API_TOKEN: 'tok' };
        const calls: string[] = [];
        const fetchImpl = (async (url: string, init?: RequestInit) => {
            calls.push(url);
            expect((init?.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('pa@kurum.gov.tr:tok').toString('base64')}`);
            const log = (key: string, day: string) => ({ key, fields: { summary: key, worklog: { total: 1, worklogs: [{ started: `2026-10-${day}T09:00:00.000+0300`, timeSpentSeconds: 3600, author: { displayName: 'Ali' } }] } } });
            if (url.includes('nextPageToken=t2')) return jsonRes(200, { issues: [log('MKS-2', '07')], isLast: true });
            return jsonRes(200, { issues: [log('MKS-1', '06')], nextPageToken: 't2', isLast: false });
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-worklogs', { projectKey: 'MKS', from: '2026-10-05', to: '2026-10-11' }), cloudEnv, { route: 'jira-worklogs', fetchImpl });
        const { entries } = await res.json();
        expect(calls).toHaveLength(2);
        expect(calls.every(c => c.startsWith('https://kurum.atlassian.net/rest/api/2/search/jql?'))).toBe(true);
        expect(calls[1]).toContain('nextPageToken=t2');
        expect(entries.map((e: { issueKey: string }) => e.issueKey)).toEqual(['MKS-1', 'MKS-2']);
    });

    it('Jira yetki hatası anlaşılır mesajla döner', async () => {
        const fetchImpl = (async () => jsonRes(401, {})) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-worklogs', { projectKey: 'MKS', from: '2026-10-05', to: '2026-10-11' }), env, { route: 'jira-worklogs', fetchImpl });
        expect(res.status).toBe(502);
        expect((await res.json()).error).toContain('Jira erişimi reddedildi');
    });
});

describe('Jira kayıt geçmişi', () => {
    const STATUSES = [
        { id: '1', name: 'Yapılacak', statusCategory: { key: 'new' } },
        { id: '3', name: 'Devam Ediyor', statusCategory: { key: 'indeterminate' } },
        { id: '10001', name: 'Test', statusCategory: { key: 'indeterminate' } },
        { id: '6', name: 'Kapandı', statusCategory: { key: 'done' } },
    ];
    const FIELDS = [{ id: 'customfield_10002', name: 'Story Points' }, { id: 'summary', name: 'Summary' }];
    const history = (created: string, from: string, fromString: string, to: string, toString: string) => ({ created, items: [{ field: 'status', from, fromString, to, toString }, { field: 'assignee', from: 'a', to: 'b' }] });
    const issue = (key: string, extra: Record<string, unknown> = {}, changelog?: unknown) => ({
        key,
        fields: {
            summary: `Oturum hatası ${key}`, description: 'Giriş {code}x{code} ekranında [kılavuz|https://wiki] hata\n\n\n\nadım', issuetype: { name: 'Hata' }, status: { id: '6', name: 'Kapandı', statusCategory: { key: 'done' } },
            priority: { name: 'Yüksek' }, created: '2026-09-01T09:00:00.000+0300', resolutiondate: '2026-09-04T17:00:00.000+0300', components: [{ name: 'Yazılım' }], labels: ['giris'],
            fixVersions: [{ name: '2.1' }], timeoriginalestimate: 57600, timespent: 72000, assignee: { displayName: 'Ayşe Yılmaz' }, customfield_10002: 3,
            issuelinks: [{ type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key: 'MKS-1' } }, { type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { key: 'MKS-9' } }],
            ...extra,
        },
        changelog: changelog ?? { total: 2, histories: [history('2026-09-03T10:00:00.000+0300', '3', 'Devam Ediyor', '6', 'Kapandı'), history('2026-09-02T09:30:00.000+0300', '1', 'Yapılacak', '3', 'Devam Ediyor')] },
    });

    it('JQL: kapanmışlar ya da açıklar dahil; açıklama sadeleşir', () => {
        expect(buildIssueJql('mks', 'done', '2025-10-01')).toBe('project = "MKS" AND statusCategory = Done AND resolved >= "2025-10-01" ORDER BY key ASC');
        expect(buildIssueJql('mks', 'all', '2025-10-01')).toBe('project = "MKS" AND (statusCategory != Done OR resolved >= "2025-10-01") ORDER BY key ASC');
        expect(buildIssueJql('mks', 'all')).toBe('project = "MKS" ORDER BY key ASC');
        expect(plainDescription('a {code:java}x{code} [metin|http://u] !resim.png! b\n\n\n\nc')).toBe('a x metin b\n\nc');
    });

    it('Server/DC: alanlar, durum geçmişi, eksik geçmişin tamamlanması ve sayfa imleci', async () => {
        const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://jira-dc.kurum.gov.tr', JIRA_TOKEN: 'pat' };
        const calls: string[] = [];
        const fetchImpl = (async (url: string) => {
            calls.push(url);
            if (url.endsWith('/rest/api/2/status')) return jsonRes(200, STATUSES);
            if (url.endsWith('/rest/api/2/field')) return jsonRes(200, FIELDS);
            if (url.includes('/rest/api/2/search?')) {
                return jsonRes(200, { total: 3, startAt: 0, issues: [issue('MKS-12'), issue('MKS-15', { status: { id: '3', name: 'Devam Ediyor' }, resolutiondate: null, assignee: null, customfield_10002: null }, { total: 5, histories: [] })] });
            }
            if (url.includes('/rest/api/2/issue/MKS-15')) return jsonRes(200, { key: 'MKS-15', changelog: { total: 1, histories: [history('2026-09-05T08:00:00.000+0300', '1', 'Yapılacak', '10001', 'Test')] } });
            return jsonRes(404, {});
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-issues', { projectKey: 'mks', scope: 'all', since: '2025-10-01' }), env, { route: 'jira-issues', fetchImpl });
        expect(res.status).toBe(200);
        const body = await res.json() as { issues: JiraIssueRecord[]; total: number; next: string };
        const search = calls.find(c => c.includes('/search?'))!;
        expect(decodeURIComponent(search)).toContain('statusCategory != Done OR resolved >= "2025-10-01"');
        expect(search).toContain('expand=changelog');
        expect(search).toContain(',customfield_10002&');
        expect(search).toContain('startAt=0');
        expect(body).toMatchObject({ total: 3, next: '2' });
        expect(body.issues[0]).toEqual({
            key: 'MKS-12', summary: 'Oturum hatası MKS-12', description: 'Giriş x ekranında kılavuz hata\n\nadım', issueType: 'Hata', status: 'Kapandı', statusCategory: 'done', priority: 'Yüksek',
            created: '2026-09-01T06:00:00.000Z', resolved: '2026-09-04T14:00:00.000Z', components: ['Yazılım'], labels: ['giris'], fixVersions: ['2.1'],
            originalEstimateSeconds: 57600, timeSpentSeconds: 72000, storyPoints: 3, assignee: 'Ayşe Yılmaz', blockedBy: ['MKS-1'],
            transitions: [
                { at: '2026-09-02T06:30:00.000Z', from: 'Yapılacak', to: 'Devam Ediyor', fromCategory: 'new', toCategory: 'indeterminate' },
                { at: '2026-09-03T07:00:00.000Z', from: 'Devam Ediyor', to: 'Kapandı', fromCategory: 'indeterminate', toCategory: 'done' },
            ],
        });
        // Durum kategorisi kaydın kendisinde yoksa durum listesinden; kısaltılmış geçmiş kayıttan tamamlanır
        expect(body.issues[1]).toMatchObject({ statusCategory: 'indeterminate', resolved: null, assignee: '', storyPoints: null, transitions: [{ to: 'Test', toCategory: 'indeterminate' }] });
        expect(JSON.stringify(body)).not.toContain('pat');
    });

    it('Jira Cloud: yeni arama ucu ve sayfa jetonu', async () => {
        const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://kurum.atlassian.net', JIRA_EMAIL: 'pa@kurum.gov.tr', JIRA_API_TOKEN: 't', JIRA_STORY_POINTS_FIELD: 'customfield_10016' };
        const calls: string[] = [];
        const fetchImpl = (async (url: string) => {
            calls.push(url);
            if (url.endsWith('/rest/api/2/status')) return jsonRes(200, STATUSES);
            return jsonRes(200, { issues: [issue('MKS-3')], nextPageToken: 'abc-123', isLast: false });
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-issues', { projectKey: 'MKS', cursor: 'onceki' }), env, { route: 'jira-issues', fetchImpl });
        const body = await res.json();
        expect(calls.some(c => c.endsWith('/rest/api/2/field'))).toBe(false); // alan ortamdan
        const search = calls.find(c => c.includes('/search/jql?'))!;
        expect(search).toContain('nextPageToken=onceki');
        expect(decodeURIComponent(search)).toContain('statusCategory = Done ORDER BY key ASC');
        expect(body).toMatchObject({ total: null, next: 'abc-123', issues: [{ key: 'MKS-3' }] });
    });

    it('izin listesi, geçersiz girdi ve yapılandırma', async () => {
        const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://jira-dc2.kurum.gov.tr', JIRA_TOKEN: 'pat', JIRA_ALLOWED_PROJECTS: 'MKS, ABC' };
        const fetchImpl = (async () => jsonRes(200, { issues: [], total: 0 })) as unknown as typeof fetch;
        const r = (body: unknown, e: Record<string, string> = env) => handleIntegrationRequest(post('jira-issues', body), e, { route: 'jira-issues', fetchImpl });
        expect((await r({ projectKey: 'XYZ' })).status).toBe(403);
        expect((await handleIntegrationRequest(post('jira-worklogs', { projectKey: 'XYZ', from: '2026-01-01', to: '2026-01-02' }), env, { route: 'jira-worklogs', fetchImpl })).status).toBe(403);
        expect((await r({ projectKey: 'MKS', since: '1999-01-01' })).status).toBe(400);
        expect((await r({ projectKey: 'MKS', cursor: 'a b' })).status).toBe(400);
        expect((await r({ projectKey: 'MKS' }, BASE_ENV)).status).toBe(501);
        expect(await (await r({ projectKey: 'abc' })).json()).toEqual({ issues: [], total: 0, next: null });
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
