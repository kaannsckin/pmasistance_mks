import { describe, expect, it, vi } from 'vitest';
import { buildIssueJql, buildKeysJql, buildSyncJql, buildWorklogJql, checkRecipients, checkSyncSource, handleIntegrationRequest, integrationStatus, JiraIssueRecord, Mailer, pickIssueType, pickPriority, plainDescription, reminderMessage, teamsCard } from './handler';

const TOKEN = 'erisim-kodu-12345678901234567890';
const BASE_ENV = { AI_ACCESS_TOKEN: TOKEN, JIRA_WORKLOG_SINGLE_USER: '1' };

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
        expect(integrationStatus(env)).toEqual({ jira: true, jiraCreate: false, jiraUpdate: false, teams: true, email: true, reminder: false });
        expect(integrationStatus({ ...env, JIRA_ALLOW_CREATE: '1' }).jiraCreate).toBe(true);
        expect(integrationStatus({ JIRA_ALLOW_CREATE: '1' }).jiraCreate).toBe(false); // Jira yoksa açma da yok
        const res = await handleIntegrationRequest(new Request('http://x/api/integrations/health'), env, { route: 'health' });
        const body = await res.json();
        expect(body).toEqual({ jira: true, jiraCreate: false, jiraUpdate: false, teams: true, email: true, reminder: false, authMode: 'none' });
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
        const res = await handleIntegrationRequest(post('jira-worklogs', { projectKey: 'mks', from: '2026-10-05', to: '2026-10-11', detail: true }), env, { route: 'jira-worklogs', fetchImpl });
        const { entries } = await res.json();
        expect(calls[0]).toContain('https://jira.kurum.gov.tr/rest/api/2/search?jql=');
        expect(calls[1]).toBe('https://jira.kurum.gov.tr/rest/api/2/issue/MKS-15/worklog?startAt=0&maxResults=1000');
        expect(entries).toMatchObject([
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

    it('kayıt anahtarlarıyla tüm worklog: e-posta, sayfalama, bulunamayan kayıt', async () => {
        const calls: string[] = [];
        const fetchImpl = (async (url: string) => {
            calls.push(url);
            if (url.includes('/issue/MKS-9/')) return jsonRes(404, {});
            if (url.includes('/issue/MKS-1/') && url.includes('startAt=0')) {
                return jsonRes(200, { total: 2, worklogs: [{ started: '2026-10-06T09:00:00.000+0300', timeSpentSeconds: 7200, author: { displayName: 'Ayşe Kaya', emailAddress: 'Ayse.Kaya@Kurum.gov.tr' } }] });
            }
            if (url.includes('/issue/MKS-1/')) return jsonRes(200, { total: 2, worklogs: [{ started: '2026-11-02T09:00:00.000+0300', timeSpentSeconds: 1800, author: { name: 'ali' } }] });
            return jsonRes(200, { total: 0, worklogs: [] });
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-worklogs', { keys: ['mks-1', 'MKS-9', 'MKS-1'] }), env, { route: 'jira-worklogs', fetchImpl });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.missing).toEqual(['MKS-9']);
        expect(body.entries).toMatchObject([
            { date: '2026-10-06', author: 'Ayşe Kaya', authorEmail: 'ayse.kaya@kurum.gov.tr', issueKey: 'MKS-1', summary: '', hours: 2, source: 'jira' },
            { date: '2026-11-02', author: 'ali', issueKey: 'MKS-1', summary: '', hours: 0.5, source: 'jira' },
        ]);
        expect(calls.filter(c => c.includes('/issue/MKS-1/'))).toHaveLength(2); // ikinci sayfa da istendi
    });

    it('kayıt anahtarı listesi doğrulanır ve izinli projelerle sınırlanır', async () => {
        const fetchImpl = (async () => jsonRes(200, { worklogs: [] })) as unknown as typeof fetch;
        const call = (keys: unknown, e: Record<string, string> = env) => handleIntegrationRequest(post('jira-worklogs', { keys }), e, { route: 'jira-worklogs', fetchImpl });
        expect((await call([])).status).toBe(400);
        expect((await call(['MKS'])).status).toBe(400);
        expect((await call(Array.from({ length: 51 }, (_, i) => `MKS-${i + 1}`))).status).toBe(400);
        const res = await call(['MKS-1', 'GIZ-2'], { ...env, JIRA_ALLOWED_PROJECTS: 'MKS' });
        expect(res.status).toBe(403);
        expect((await res.json()).error).toContain('GIZ');
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
            fixVersions: [{ name: '2.1' }], timeoriginalestimate: 57600, timespent: 72000, assignee: { displayName: 'Ayşe Yılmaz' }, customfield_10002: 3, duedate: '2026-09-10',
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
                return jsonRes(200, { total: 3, startAt: 0, issues: [issue('MKS-12', { timeestimate: 0, aggregatetimeoriginalestimate: 72000, aggregatetimeestimate: 3600, aggregatetimespent: 81000, subtasks: [{ key: 'MKS-13' }] }), issue('MKS-15', { status: { id: '3', name: 'Devam Ediyor' }, resolutiondate: null, assignee: null, customfield_10002: null }, { total: 5, histories: [] })] });
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
        expect(search).toContain('duedate');
        expect(search).toContain(',customfield_10002&');
        expect(search).toContain('startAt=0');
        expect(body).toMatchObject({ total: 3, next: '2' });
        expect(body.issues[0]).toMatchObject({
            key: 'MKS-12', summary: 'Oturum hatası MKS-12', description: 'Giriş x ekranında kılavuz hata\n\nadım', issueType: 'Hata', status: 'Kapandı', statusCategory: 'done', priority: 'Yüksek',
            created: '2026-09-01T06:00:00.000Z', resolved: '2026-09-04T14:00:00.000Z', components: ['Yazılım'], labels: ['giris'], fixVersions: ['2.1'],
            originalEstimateSeconds: 57600, timeSpentSeconds: 72000, remainingEstimateSeconds: 0, aggregateOriginalEstimateSeconds: 72000, aggregateRemainingEstimateSeconds: 3600, aggregateTimeSpentSeconds: 81000, subtaskKeys: ['MKS-13'], storyPoints: 3, assignee: 'Ayşe Yılmaz', blockedBy: ['MKS-1'],
            transitions: [
                { at: '2026-09-02T06:30:00.000Z', from: 'Yapılacak', to: 'Devam Ediyor', fromCategory: 'new', toCategory: 'indeterminate' },
                { at: '2026-09-03T07:00:00.000Z', from: 'Devam Ediyor', to: 'Kapandı', fromCategory: 'indeterminate', toCategory: 'done' },
            ],
            due: '2026-09-10',
        });
        // Durum kategorisi kaydın kendisinde yoksa durum listesinden; kısaltılmış geçmiş kayıttan tamamlanır
        expect(body.issues[1]).toMatchObject({ statusCategory: 'indeterminate', resolved: null, assignee: '', remainingEstimateSeconds: null, aggregateRemainingEstimateSeconds: null, subtaskKeys: [], storyPoints: null, transitions: [{ to: 'Test', toCategory: 'indeterminate' }] });
        expect(JSON.stringify(body)).not.toContain('pat');
    });

    it('Jira Cloud: yeni arama ucu ve sayfa jetonu', async () => {
        const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://kurum.atlassian.net', JIRA_EMAIL: 'pa@kurum.gov.tr', JIRA_API_TOKEN: 't', JIRA_STORY_POINTS_FIELD: 'customfield_10016' };
        const calls: string[] = [];
        const fetchImpl = (async (url: string) => {
            calls.push(url);
            if (url.endsWith('/rest/api/2/status')) return jsonRes(200, STATUSES);
            return jsonRes(200, { issues: [issue('MKS-3', { timetracking: { remainingEstimateSeconds: 1800 }, parent: { key: 'MKS-2' } })], nextPageToken: 'abc-123', isLast: false });
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-issues', { projectKey: 'MKS', cursor: 'onceki' }), env, { route: 'jira-issues', fetchImpl });
        const body = await res.json();
        expect(calls.some(c => c.endsWith('/rest/api/2/field'))).toBe(false); // alan ortamdan
        const search = calls.find(c => c.includes('/search/jql?'))!;
        expect(search).toContain('nextPageToken=onceki');
        expect(decodeURIComponent(search)).toContain('statusCategory = Done ORDER BY key ASC');
        expect(body).toMatchObject({ total: null, next: 'abc-123', issues: [{ key: 'MKS-3', remainingEstimateSeconds: 1800, parentKey: 'MKS-2' }] });
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

describe("Jira'da kayıt açma", () => {
    const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://jira.kurum.gov.tr/', JIRA_TOKEN: 'jt', JIRA_ALLOW_CREATE: '1' };
    const TYPES = [{ id: '1', name: 'Görev' }, { id: '2', name: 'Hata' }, { id: '3', name: 'Hikaye' }, { id: '4', name: 'Alt Görev', subtask: true }];
    const PRIORITIES = [{ id: '1', name: 'Highest' }, { id: '2', name: 'High' }, { id: '3', name: 'Medium' }, { id: '4', name: 'Low' }, { id: '5', name: 'Lowest' }];

    it('tür ve öncelik Jira adlarıyla eşlenir', () => {
        expect(pickIssueType(TYPES, 'bug')?.id).toBe('2');
        expect(pickIssueType(TYPES, 'feature')?.id).toBe('3');
        expect(pickIssueType(TYPES, 'improvement')?.id).toBe('1'); // yoksa Görev
        expect(pickIssueType([{ id: '9', name: 'Epic' }, { id: '4', name: 'Sub-task', subtask: true }], 'task')?.id).toBe('9');
        expect(pickPriority(PRIORITIES, 'Blocker')?.name).toBe('Highest');
        expect(pickPriority(PRIORITIES, 'High')?.name).toBe('High');
        expect(pickPriority(PRIORITIES, 'Low')?.name).toBe('Low');
        expect(pickPriority([{ id: '7', name: 'Engelleyici' }, { id: '8', name: 'Yüksek' }, { id: '9', name: 'Düşük' }], 'Blocker')?.id).toBe('7');
        expect(pickPriority([{ id: '8', name: 'P2' }], 'High')).toBeUndefined();
    });

    it('kapalıysa, anahtar ya da izin listesi uymuyorsa reddedilir', async () => {
        const r = (body: unknown, e: Record<string, string> = env) => handleIntegrationRequest(post('jira-create', body), e, { route: 'jira-create' });
        const one = [{ ref: 't1', summary: 'Kayıt' }];
        expect((await r({ projectKey: 'MKS', issues: one }, { ...env, JIRA_ALLOW_CREATE: '' })).status).toBe(403);
        expect((await r({ projectKey: 'M K', issues: one })).status).toBe(400);
        expect((await r({ projectKey: 'MKS', issues: [] })).status).toBe(400);
        expect((await r({ projectKey: 'MKS', issues: [{ ref: 't1', summary: '  ' }] })).status).toBe(400);
        expect((await r({ projectKey: 'ABC', issues: one }, { ...env, JIRA_ALLOWED_PROJECTS: 'MKS' })).status).toBe(403);
    });

    it('kayıtları açar; ekranda olmayan alanı çıkarıp yeniden dener, zorunlu alan hatasını bildirir', async () => {
        const posts: Record<string, unknown>[] = [];
        let n = 0;
        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith('/rest/api/2/project/MKS')) return jsonRes(200, { issueTypes: TYPES, components: [{ id: '50', name: 'Yazılım' }] });
            if (url.endsWith('/rest/api/2/priority')) return jsonRes(200, PRIORITIES);
            if (url.endsWith('/rest/api/2/issue') && init?.method === 'POST') {
                const fields = JSON.parse(String(init.body)).fields;
                posts.push(fields);
                n++;
                if (n === 1) return jsonRes(400, { errorMessages: [], errors: { timetracking: "Field 'timetracking' cannot be set." } });
                if (fields.summary === 'Zorunlu alan') return jsonRes(400, { errorMessages: [], errors: { customfield_10010: 'Sprint is required.' } });
                return jsonRes(201, { id: String(100 + n), key: `MKS-${100 + n}` });
            }
            return jsonRes(404, {});
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-create', { projectKey: 'mks', issues: [
            { ref: 't1', summary: 'Giriş\nhatası', description: 'Oturum düşüyor', issueType: 'bug', priority: 'Blocker', component: 'yazılım', estimateHours: 12 },
            { ref: 't2', summary: 'Rapor ekranı', issueType: 'feature', priority: 'Medium' },
            { ref: 't3', summary: 'Zorunlu alan' },
        ] }), env, { route: 'jira-create', fetchImpl });
        expect(res.status).toBe(200);
        expect((await res.json()).results).toEqual([
            { ref: 't1', key: 'MKS-102', dropped: ['timetracking'] },
            { ref: 't2', key: 'MKS-103' },
            { ref: 't3', error: 'customfield_10010: Sprint is required.' },
        ]);
        expect(posts[0]).toEqual({
            project: { key: 'MKS' }, summary: 'Giriş hatası', issuetype: { id: '2' }, description: 'Oturum düşüyor', priority: { id: '1' }, components: [{ id: '50' }], timetracking: { originalEstimate: '720m' },
        });
        expect(posts[1].timetracking).toBeUndefined();
        expect(posts[2]).toMatchObject({ issuetype: { id: '3' }, priority: { id: '3' } });
        expect(posts[2].components).toBeUndefined();
    });

    it('yetki yarıda kesilirse açılan kayıtlar döner, kalanlar gönderilmez', async () => {
        let n = 0;
        const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.includes('/project/')) return jsonRes(200, { issueTypes: TYPES });
            if (url.endsWith('/priority')) return jsonRes(200, PRIORITIES);
            if (init?.method === 'POST') return ++n === 1 ? jsonRes(201, { key: 'MKS-1' }) : jsonRes(403, {});
            return jsonRes(404, {});
        }) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-create', { projectKey: 'MKS', issues: [{ ref: 'a', summary: 'A' }, { ref: 'b', summary: 'B' }, { ref: 'c', summary: 'C' }] }), env, { route: 'jira-create', fetchImpl });
        const { results } = await res.json();
        expect(results[0]).toEqual({ ref: 'a', key: 'MKS-1' });
        expect(results.slice(1).map((r: { ref: string; error?: string }) => [r.ref, /yetkisi yok/.test(r.error || '')])).toEqual([['b', true], ['c', true]]);
        expect(n).toBe(2); // üçüncü kayıt hiç denenmez
    });

    it('proje bulunamazsa anlaşılır hata', async () => {
        const fetchImpl = vi.fn(async () => jsonRes(404, {})) as unknown as typeof fetch;
        const res = await handleIntegrationRequest(post('jira-create', { projectKey: 'YOK', issues: [{ ref: 'a', summary: 'A' }] }), env, { route: 'jira-create', fetchImpl });
        expect(res.status).toBe(404);
        expect((await res.json()).error).toMatch(/YOK projesi Jira'da bulunamadı/);
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

describe('Jira canlı eşitleme (jira-sync)', () => {
    const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://jira-sync.kurum.gov.tr', JIRA_TOKEN: 'pat-gizli' };
    const STATUSES = [{ id: '1', statusCategory: { key: 'new' } }, { id: '3', statusCategory: { key: 'indeterminate' } }, { id: '6', statusCategory: { key: 'done' } }];
    const raw = (key: string, status = '3', extra: Record<string, unknown> = {}) => ({ key, fields: { summary: `Kayıt ${key}`, status: { id: status, name: status === '6' ? 'Kapandı' : 'Devam Ediyor' }, priority: { name: 'High' }, updated: '2026-11-12T09:00:00.000+0300', labels: ['mks-takip'], ...extra }, changelog: { total: 0, histories: [] } });
    const run = (body: unknown, fetchImpl: typeof fetch, e: Record<string, string> = env) => handleIntegrationRequest(post('jira-sync', body), e, { route: 'jira-sync', fetchImpl, now: new Date('2026-11-13T08:00:00Z') });
    const meta = (url: string) => (url.endsWith('/rest/api/2/status') ? jsonRes(200, STATUSES) : url.endsWith('/rest/api/2/field') ? jsonRes(200, []) : null);

    it('kaynak JQL: yalnız açık kayıtlar; izin listesi sorguya eklenir', () => {
        expect(buildSyncJql({}, { projectKey: 'MKS', labels: ['a', 'b'] })).toBe('project = "MKS" AND labels in ("a", "b") AND statusCategory != Done ORDER BY key ASC');
        expect(buildSyncJql({ JIRA_ALLOWED_PROJECTS: 'mks, ABC' }, { filterId: '12345' })).toBe('project in ("MKS", "ABC") AND filter = 12345 AND statusCategory != Done ORDER BY key ASC');
        expect(buildSyncJql({}, { labels: ['x'] }, false)).toBe('labels in ("x") ORDER BY key ASC');
        expect(buildKeysJql(['MKS-1', 'MKS-2'])).toBe('key in ("MKS-1", "MKS-2") ORDER BY key ASC');
        expect(buildSyncJql({}, { projectKey: 'MKS', text: 'giriş hatası' }, false)).toBe('project = "MKS" AND text ~ "giriş hatası" ORDER BY key ASC');
        const duePeriod = { start: '2026-12-01', end: '2026-12-31' };
        expect(checkSyncSource({}, { filterId: '7', duePeriod })).toEqual({ source: { filterId: '7', duePeriod } });
        expect(buildSyncJql({ JIRA_ALLOWED_PROJECTS: 'MKS' }, { filterId: '7', duePeriod }, false))
            .toBe('project in ("MKS") AND filter = 7 AND duedate >= "2026-12-01" AND duedate <= "2026-12-31" ORDER BY key ASC');
        expect(checkSyncSource({}, { duePeriod })).toHaveProperty('status', 400);
        expect(checkSyncSource({}, { projectKey: 'MKS', duePeriod: { ...duePeriod, end: '2026-12-99' } })).toHaveProperty('status', 400);
        expect(checkSyncSource({}, { projectKey: 'MKS', duePeriod: { ...duePeriod, end: '2026-12-31" OR project = "ABC' } })).toHaveProperty('status', 400);
    });

    it('kapsamsız ya da geçersiz kaynak reddedilir; serbest JQL kabul edilmez', async () => {
        const fetchImpl = vi.fn(async () => jsonRes(200, { issues: [], total: 0 })) as unknown as typeof fetch;
        expect((await run({ op: 'search', source: {} }, fetchImpl)).status).toBe(400);
        expect((await run({ op: 'search', jql: 'ORDER BY key' }, fetchImpl)).status).toBe(400);
        expect((await run({ op: 'search', source: { labels: ['a" OR project = X'] } }, fetchImpl)).status).toBe(400);
        expect((await run({ op: 'search', source: { filterId: '1 OR 1=1' } }, fetchImpl)).status).toBe(400);
        expect((await run({ op: 'search', source: { projectKey: 'MKS', text: 'a" OR project = X' } }, fetchImpl)).status).toBe(400);
        expect((await run({ op: 'search', source: { text: 'yalniz metin' } }, fetchImpl)).status).toBe(400);
        expect((await run({ op: 'search', keys: ['MKS-1", "X-1'] }, fetchImpl)).status).toBe(400);
        expect((await run({ op: 'search', source: { projectKey: 'XYZ' } }, fetchImpl, { ...env, JIRA_ALLOWED_PROJECTS: 'MKS' })).status).toBe(403);
        expect((await run({ op: 'search', keys: ['XYZ-1'] }, fetchImpl, { ...env, JIRA_ALLOWED_PROJECTS: 'MKS' })).status).toBe(403);
        expect((await run({ op: 'baska' }, fetchImpl)).status).toBe(400);
        expect((await run({ op: 'meta' }, fetchImpl, BASE_ENV)).status).toBe(501);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('kaynaktan açık kayıtlar ve anahtarla güncel hâl; bulunamayan anahtar atlanıp bildirilir', async () => {
        const calls: string[] = [];
        const fetchImpl = (async (url: string) => {
            calls.push(decodeURIComponent(url));
            const m = meta(url);
            if (m) return m;
            const u = decodeURIComponent(url);
            if (u.includes('labels in ("mks-takip")')) return jsonRes(200, { issues: [raw('MKS-7')], total: 1 });
            if (u.includes('"MKS-99"')) return jsonRes(400, { errorMessages: ["An issue with key 'MKS-99' does not exist for field 'key'."] });
            return jsonRes(200, { issues: [raw('MKS-1', '6'), raw('MKS-2')], total: 2 });
        }) as unknown as typeof fetch;
        const src = await (await run({ op: 'search', source: { labels: ['mks-takip'] } }, fetchImpl)).json();
        expect(src).toMatchObject({ total: 1, next: null, missing: [], issues: [{ key: 'MKS-7', statusCategory: 'indeterminate', updated: '2026-11-12T06:00:00.000Z' }] });
        expect(calls.some(c => c.includes('labels in ("mks-takip") AND statusCategory != Done'))).toBe(true);

        const res = await run({ op: 'search', keys: ['mks-1', 'MKS-2', 'MKS-99'] }, fetchImpl);
        const body = await res.json() as { issues: JiraIssueRecord[]; missing: string[] };
        expect(body.issues.map(i => [i.key, i.statusCategory])).toEqual([['MKS-1', 'done'], ['MKS-2', 'indeterminate']]);
        expect(body.missing).toEqual(['MKS-99']);
        expect(calls.at(-1)).toContain('key in ("MKS-1", "MKS-2") ORDER BY');
        expect(JSON.stringify(body)).not.toContain('pat-gizli');
    });

    it('meta: jeton sahibi, izinli projeler ve sık kullanılan filtreler', async () => {
        const fetchImpl = (async (url: string) => {
            if (url.endsWith('/myself')) return jsonRes(200, { displayName: 'Murat S.' });
            if (url.endsWith('/project')) return jsonRes(200, [{ key: 'XYZ', name: 'Başka' }, { key: 'MKS', name: 'Merkezi Kayıt' }]);
            if (url.endsWith('/filter/favourite')) return jsonRes(200, [{ id: '12345', name: 'MKS açıklar', jql: 'project = MKS AND resolution = Unresolved' }]);
            return jsonRes(404, {});
        }) as unknown as typeof fetch;
        expect(await (await run({ op: 'meta' }, fetchImpl, { ...env, JIRA_ALLOWED_PROJECTS: 'MKS' })).json()).toEqual({
            user: 'Murat S.', projects: [{ key: 'MKS', name: 'Merkezi Kayıt' }], filters: [{ id: '12345', name: 'MKS açıklar', jql: 'project = MKS AND resolution = Unresolved' }],
        });
        const denied = await run({ op: 'meta' }, (async () => jsonRes(401, {})) as unknown as typeof fetch);
        expect(denied.status).toBe(502);
    });

    it('güncelleme: belirli Jira durumuna geçiş (ad ile) ve çözüm; ekranda çözüm yoksa çözümsüz yeniden dener', async () => {
        const on = { ...env, JIRA_ALLOW_UPDATE: '1' };
        const posts: Record<string, unknown>[] = [];
        let resolutionRejected = true;
        const transitions = [
            { id: '41', name: 'Teste gönder', to: { name: 'Testing', statusCategory: { key: 'indeterminate' } } },
            { id: '51', name: 'Çöz', to: { name: 'Resolved', statusCategory: { key: 'done' } } },
            { id: '61', name: 'Kapat', to: { name: 'Closed', statusCategory: { key: 'done' } } },
        ];
        const fetchImpl = (async (url: string, init?: RequestInit) => {
            const method = init?.method || 'GET';
            const m = meta(url);
            if (m) return m;
            if (url.includes('?fields=status')) return jsonRes(200, { fields: { status: { name: 'Analysis', statusCategory: { key: 'indeterminate' } } } });
            if (url.endsWith('/transitions') && method === 'GET') return jsonRes(200, { transitions });
            if (url.endsWith('/transitions')) {
                const body = JSON.parse(String(init!.body));
                posts.push(body);
                if (body.fields?.resolution && resolutionRejected) return jsonRes(400, { errors: { resolution: 'Alan ekranda yok.' } });
                return new Response(null, { status: 204 });
            }
            if (url.includes('/search?')) return jsonRes(200, { issues: [raw('MKS-1', '6')], total: 1 });
            return jsonRes(404, {});
        }) as unknown as typeof fetch;
        // "Çözüldü" ≠ kategori seçimi: aynı kategoride Resolved ve Closed varken ada göre Resolved seçilir
        let res = await run({ op: 'update', key: 'MKS-1', changes: { status: 'done', statusName: 'RESOLVED', resolution: 'Düzeltildi' } }, fetchImpl, on);
        let body = await res.json() as { applied: string[]; errors: { field: string; message: string }[] };
        expect(posts.map(p => (p.transition as { id: string }).id)).toEqual(['51', '51']);
        expect(posts[0]).toEqual({ transition: { id: '51' }, fields: { resolution: { name: 'Fixed' } } });
        expect(body.applied).toEqual(['status']);
        expect(body.errors[0].field).toBe('resolution');
        // Çözüm ekranda varsa birlikte yazılır
        posts.length = 0; resolutionRejected = false;
        res = await run({ op: 'update', key: 'MKS-1', changes: { statusName: 'Testing' } }, fetchImpl, on);
        body = await res.json() as { applied: string[]; errors: { field: string; message: string }[] };
        expect(posts).toEqual([{ transition: { id: '41' } }]);
        expect(body.applied).toEqual(['status']);
        // Geçiş yoksa Jira'daki geçişler listelenir
        res = await run({ op: 'update', key: 'MKS-1', changes: { statusName: 'Blocked' } }, fetchImpl, on);
        body = await res.json() as { applied: string[]; errors: { field: string; message: string }[] };
        expect(body.errors[0].message).toBe('Jira iş akışı bu kayıt için "Blocked" durumuna doğrudan geçişe izin vermiyor (Jira\'daki geçişler: Testing, Resolved, Closed).');
        // Geçersiz ad reddedilir (enjeksiyon yok)
        expect((await run({ op: 'update', key: 'MKS-1', changes: { statusName: 'a"; drop' } }, fetchImpl, on)).status).toBe(400);
    });

    it('güncelleme: kapalıysa reddedilir; alan, durum geçişi, yorum ve worklog ayrı ayrı uygulanır', async () => {
        const noop = vi.fn(async () => jsonRes(200, {})) as unknown as typeof fetch;
        expect((await run({ op: 'update', key: 'MKS-1', changes: { summary: 'x' } }, noop)).status).toBe(403);
        const on = { ...env, JIRA_ALLOW_UPDATE: '1' };
        expect((await run({ op: 'update', key: 'MKS-1', changes: {} }, noop, on)).status).toBe(400);
        expect((await run({ op: 'update', key: 'MKS-1', changes: { priority: 'toString' } }, noop, on)).status).toBe(400);
        expect((await run({ op: 'update', key: 'XYZ-1', changes: { summary: 'x' } }, noop, { ...on, JIRA_ALLOWED_PROJECTS: 'MKS' })).status).toBe(403);
        expect((await run({ op: 'update', key: 'MKS-1', changes: { worklogHours: 1 } }, noop, on)).status).toBe(403);
        expect(noop).not.toHaveBeenCalled();

        const sent: { method: string; url: string; body?: Record<string, unknown> }[] = [];
        let put = 0;
        const fetchImpl = (async (url: string, init?: RequestInit) => {
            const method = init?.method || 'GET';
            sent.push({ method, url, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
            const m = meta(url);
            if (m) return m;
            if (url.endsWith('/rest/api/2/priority')) return jsonRes(200, [{ id: '2', name: 'High' }, { id: '4', name: 'Low' }]);
            if (method === 'PUT') return ++put === 1 ? jsonRes(400, { errors: { duedate: 'Alan ekranda yok.' } }) : new Response(null, { status: 204 });
            if (url.endsWith('/transitions') && method === 'GET') return jsonRes(200, { transitions: [{ id: '11', name: 'İptal', to: { name: 'İptal', statusCategory: { key: 'done' } } }, { id: '21', name: 'Kapat', to: { name: 'Kapandı', statusCategory: { key: 'done' } } }, { id: '31', name: 'Başla', to: { name: 'Devam', statusCategory: { key: 'indeterminate' } } }] });
            if (url.endsWith('/transitions')) return new Response(null, { status: 204 });
            if (url.endsWith('/comment')) return jsonRes(201, { id: '1' });
            if (url.includes('/issue/MKS-1?fields=status')) return jsonRes(200, { fields: { status: { statusCategory: { key: 'indeterminate' } } } });
            if (url.includes('/search?')) return jsonRes(200, { issues: [raw('MKS-1', '6')], total: 1 });
            return jsonRes(404, {});
        }) as unknown as typeof fetch;
        const res = await run({ op: 'update', key: 'mks-1', changes: { summary: '  Yeni   başlık ', priority: 'High', dueDate: '2026-12-01', status: 'done', comment: 'Kapatıldı', remainingEstimateHours: 0 } }, fetchImpl, on);
        expect(res.status).toBe(200);
        const body = await res.json() as { applied: string[]; errors: { field: string; message: string }[]; issue: JiraIssueRecord };
        expect(body.applied).toEqual(['summary', 'priority', 'remainingEstimateHours', 'status', 'comment']);
        expect(body.errors).toEqual([{ field: 'dueDate', message: 'Alan ekranda yok.' }]);
        expect(body.issue).toMatchObject({ key: 'MKS-1', statusCategory: 'done' });
        const puts = sent.filter(x => x.method === 'PUT');
        expect(puts[0].body).toEqual({ fields: { summary: 'Yeni başlık', priority: { id: '2' }, duedate: '2026-12-01', timetracking: { remainingEstimate: '0m' } } });
        expect(puts[1].body).toEqual({ fields: { summary: 'Yeni başlık', priority: { id: '2' }, timetracking: { remainingEstimate: '0m' } } });
        expect(sent.find(x => x.method === 'POST' && x.url.endsWith('/transitions'))!.body).toEqual({ transition: { id: '21' } }); // adı ipucuna uyan geçiş
        expect(sent.find(x => x.url.endsWith('/comment'))!.body).toEqual({ body: 'Kapatıldı' });
        expect(sent.some(x => x.url.endsWith('/worklog'))).toBe(false);
    });

    it('durum zaten hedefteyse geçiş denenmez; geçiş yoksa hata alan bazında döner', async () => {
        const on = { ...env, JIRA_ALLOW_UPDATE: '1' };
        const mk = (current: string) => {
            const methods: string[] = [];
            const fetchImpl = (async (url: string, init?: RequestInit) => {
                methods.push(`${init?.method || 'GET'} ${url.split('/rest/api/2')[1]}`);
                const m = meta(url);
                if (m) return m;
                if (url.includes('?fields=status')) return jsonRes(200, { fields: { status: { statusCategory: { key: current } } } });
                if (url.endsWith('/transitions')) return jsonRes(200, { transitions: [{ id: '31', name: 'Başla', to: { statusCategory: { key: 'indeterminate' } } }] });
                return jsonRes(200, { issues: [raw('MKS-1')], total: 1 });
            }) as unknown as typeof fetch;
            return { fetchImpl, methods };
        };
        const same = mk('done');
        expect(await (await run({ op: 'update', key: 'MKS-1', changes: { status: 'done' } }, same.fetchImpl, on)).json()).toMatchObject({ applied: [], errors: [] });
        expect(same.methods.some(m => m.includes('/transitions'))).toBe(false);
        const none = mk('new');
        expect(await (await run({ op: 'update', key: 'MKS-1', changes: { status: 'done' } }, none.fetchImpl, on)).json()).toMatchObject({ applied: [], errors: [{ field: 'status' }] });
        expect(none.methods.some(m => m.startsWith('POST'))).toBe(false);
    });
});

describe('Jira değişiklik geçmişi ucu', () => {
    const get = (key: string) => new Request(`http://localhost/api/integrations/jira-history?key=${key}`, {
        headers: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': 'history-test' },
    });
    const row = (id: number) => ({ id: String(id), created: '2026-11-24T09:20:00+0300', author: { displayName: 'Ayşe' },
        items: [{ field: 'assignee', fieldId: 'assignee', from: null, to: '123', toString: 'Ayşe' }] });

    it('Cloud v3 geçmişini 100’den fazla değişiklik için sayfalar ve proje kapsamını uygular', async () => {
        const calls: number[] = [];
        const fetchImpl = (async (url: string) => {
            const u = new URL(url);
            expect(u.pathname).toBe('/rest/api/3/issue/MKS-4/changelog');
            const offset = Number(u.searchParams.get('startAt'));
            calls.push(offset);
            return jsonRes(200, { total: 105, values: Array.from({ length: Math.min(100, 105 - offset) }, (_, i) => row(i + offset)) });
        }) as typeof fetch;
        const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://history-fixture.atlassian.net', JIRA_TOKEN: 'secret', JIRA_ALLOWED_PROJECTS: 'MKS' };
        const opts = { route: 'jira-history' as const, fetchImpl };
        const res = await handleIntegrationRequest(get('mks-4'), env, opts);
        expect(res.status).toBe(200);
        const { entries } = await res.json();
        expect(entries).toHaveLength(105);
        expect(entries[100]).toMatchObject({ id: '100', at: '2026-11-24T06:20:00.000Z', author: 'Ayşe', items: [{ from: null, to: '123', toString: 'Ayşe' }] });
        expect((await handleIntegrationRequest(get('ABC-4'), env, opts)).status).toBe(403);
        expect(calls).toEqual([0, 100]);
    });

    it('Data Center geçmişi expand=changelog ile alınır', async () => {
        const fetchImpl = (async (url: string) => {
            expect(url).toBe('https://history-dc.example/rest/api/2/issue/MKS-4?expand=changelog&fields=none');
            return jsonRes(200, { changelog: { total: 2, histories: [row(1), row(2)] } });
        }) as typeof fetch;
        const env = { ...BASE_ENV, JIRA_BASE_URL: 'https://history-dc.example', JIRA_TOKEN: 'secret' };
        const res = await handleIntegrationRequest(get('MKS-4'), env, { route: 'jira-history', fetchImpl });
        expect(res.status).toBe(200);
        expect((await res.json()).entries).toHaveLength(2);
    });
});

describe('Jira worklog ayrıntısı ve artımlı yenileme', () => {
    const dc = { ...BASE_ENV, JIRA_BASE_URL: 'https://worklog-dc.example', JIRA_TOKEN: 'pat' };
    const row = (id: string, email: string, seconds = 1800) => ({
        id, issueId: '42', started: '2026-11-23T23:10:00.000+0000', updated: '2026-11-24T04:30:00.000+0000',
        timeSpentSeconds: seconds, author: { displayName: email, emailAddress: email, accountId: id + '-account' }, comment: `Özel yorum ${id}`,
    });

    it('kimliği doğrulanan üye yalnız kendi saat ve yorumunu görür, eşlenen yönetici proje kayıtlarını görür', async () => {
        const env = { ...dc, AI_AUTH_MODE: 'supabase', SUPABASE_URL: 'https://auth-worklog.example', SUPABASE_ANON_KEY: 'anon',
            JIRA_WORKLOG_ACCESS: '{"manager":{"projects":["MKS"]}}' };
        const fetchImpl = (async (url: string, init?: RequestInit) => {
            const authorization = new Headers(init?.headers).get('authorization');
            if (url.includes('/auth/v1/user')) {
                const manager = authorization === 'Bearer manager-mock-token';
                return jsonRes(200, { id: manager ? 'manager' : 'member', email: 'ayse@example.org', email_confirmed_at: '2026-01-01' });
            }
            if (url.includes('/rest/v1/workspace_members')) return jsonRes(200, [{ role: 'py' }]);
            return jsonRes(200, { worklogs: [row('1', 'ayse@example.org'), row('2', 'ali@example.org')] });
        }) as typeof fetch;
        const request = (auth: string) => post('jira-worklogs', { keys: ['MKS-1'], detail: true, timeZone: 'Europe/Istanbul', manager: true }, auth);
        const member = await handleIntegrationRequest(request('member-mock-token'), env, { route: 'jira-worklogs', fetchImpl });
        expect(member.status).toBe(200);
        const { entries } = await member.json();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            id: '1', accountId: '1-account', started: '2026-11-23T23:10:00.000+00:00', date: '2026-11-24',
            updated: '2026-11-24T04:30:00.000Z', comment: 'Özel yorum 1',
        });
        const manager = await handleIntegrationRequest(request('manager-mock-token'), env, { route: 'jira-worklogs', fetchImpl });
        expect((await manager.json()).entries).toHaveLength(2);
    });

    it('düzenlenen ve silinen kayıtları Jira akışlarından tek yenilemede işler', async () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-24T09:00:00Z'));
        try {
            const calls: string[] = [];
            const fetchImpl = (async (url: string, init?: RequestInit) => {
                calls.push(url);
                if (url.includes('/search?')) return jsonRes(200, { total: 1, issues: [{ key: 'MKS-10', id: '42' }] });
                if (url.includes('/worklog/updated')) return jsonRes(200, { values: [{ worklogId: 1 }, { worklogId: 3 }], until: Date.now(), lastPage: true });
                if (url.includes('/worklog/deleted')) return jsonRes(200, { values: [{ worklogId: 2 }], until: Date.now(), lastPage: true });
                if (url.endsWith('/worklog/list')) {
                    expect(JSON.parse(String(init?.body))).toEqual({ ids: [1, 3] });
                    return jsonRes(200, [row('1', 'ayse@example.org', 5400), { ...row('3', 'ali@example.org'), issueId: '99' }]);
                }
                return jsonRes(200, { worklogs: [row('1', 'ayse@example.org'), row('2', 'ayse@example.org')] });
            }) as typeof fetch;
            const run = () => handleIntegrationRequest(post('jira-worklogs', { keys: ['MKS-10'], detail: true, incremental: true }), dc, { route: 'jira-worklogs', fetchImpl });
            expect((await (await run()).json()).entries).toHaveLength(2);
            now.mockReturnValue(Date.parse('2026-11-24T09:01:00Z'));
            const next = await (await run()).json();
            expect(next.entries).toHaveLength(1);
            expect(next.entries[0]).toMatchObject({ id: '1', hours: 1.5 });
            expect(calls.filter(url => url.includes('/issue/MKS-10/'))).toHaveLength(1);
        } finally {
            now.mockRestore();
        }
    });
});
