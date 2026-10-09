import { describe, expect, it } from 'vitest';
import { fetchJiraIssuesPage, fetchJiraWorklogs } from '../integrations/handler';
import type { JiraIssueRecord } from '../../utils/integrations';
import { createMockJira, parseJql, PILOT_JIRA_ENV, RawIssue, toRawIssue } from './mockJira';
import { createState, createWorld, jiraExports, runUntil } from './sim';

const rec = (key: string, extra: Partial<JiraIssueRecord> = {}): JiraIssueRecord => ({
    key, summary: `Rapor ekranı ${key}`, description: 'Saha testinde bildirildi.', issueType: 'Hata', status: 'Tamamlandı', statusCategory: 'done', priority: 'High',
    created: '2026-09-01T06:12:00.000Z', resolved: '2026-09-04T13:40:00.000Z', components: ['U310'], labels: ['saha'], fixVersions: ['ATL v1.6'],
    originalEstimateSeconds: 21600, timeSpentSeconds: 30600, storyPoints: null, assignee: 'Emre Koç', blockedBy: [],
    transitions: [
        { at: '2026-09-02T06:20:00.000Z', from: 'Yapılacak', to: 'Devam Ediyor', fromCategory: 'new', toCategory: 'indeterminate' },
        { at: '2026-09-04T13:40:00.000Z', from: 'Devam Ediyor', to: 'Tamamlandı', fromCategory: 'indeterminate', toCategory: 'done' },
    ],
    due: '2026-09-11',
    ...extra,
});

const project = { key: 'ATL', name: 'ATLAS' };
const logs = (n: number, day = '2026-09-02') => Array.from({ length: n }, (_, i) => ({ day: `2026-09-${String(2 + (i % 20)).padStart(2, '0')}`.replace('2026-09-02', day), hours: 1.5, author: 'Emre Koç' }));

describe('pilot Jira\'sı', () => {
    it('JQL: uygulamanın ürettiği sorgular; tanınmayan koşul reddedilir', () => {
        expect(parseJql('project = "ATL" AND statusCategory = Done AND resolved >= "2025-10-01" ORDER BY key ASC')).toEqual({ project: 'ATL', doneOnly: true, resolvedSince: '2025-10-01' });
        expect(parseJql('project = "ATL" AND (statusCategory != Done OR resolved >= "2025-10-01") ORDER BY key ASC')).toEqual({ project: 'ATL', openOrResolvedSince: '2025-10-01' });
        expect(parseJql('project = "ATL" AND worklogDate >= "2026-10-01" AND worklogDate <= "2026-10-07" ORDER BY key')).toEqual({ project: 'ATL', worklogFrom: '2026-10-01', worklogTo: '2026-10-07' });
        expect(parseJql('project = "ATL" AND assignee = currentUser()')).toBeNull();
        expect(parseJql('statusCategory = Done')).toBeNull();
    });

    it('uygulamanın Jira istemcisinden geçen kayıt üretilenle aynıdır (tam tur)', async () => {
        const records = [rec('ATL-1'), rec('ATL-2', { status: 'Devam Ediyor', statusCategory: 'indeterminate', resolved: null, transitions: [rec('x').transitions[0]], storyPoints: 5, blockedBy: ['ATL-1'], due: null, originalEstimateSeconds: null, timeSpentSeconds: null })];
        const raws = records.map((r, i) => toRawIssue(r, { id: 10_001 + i, project, worklogs: [] }));
        const jira = createMockJira(async () => raws);
        const page = await fetchJiraIssuesPage(PILOT_JIRA_ENV, { projectKey: 'ATL', scope: 'all' }, jira);
        expect(page.issues).toEqual(records);
        expect(page).toMatchObject({ total: 2, next: null });
    });

    it('sayfalama: Server/DC (startAt) ve Cloud (search/jql, nextPageToken)', async () => {
        const raws = Array.from({ length: 25 }, (_, i) => toRawIssue(rec(`ATL-${i + 1}`), { id: 10_000 + i, project, worklogs: [] }));
        const jira = createMockJira(async () => raws);
        const first = await fetchJiraIssuesPage(PILOT_JIRA_ENV, { projectKey: 'ATL', scope: 'done', pageSize: 10 }, jira);
        expect(first).toMatchObject({ total: 25, next: '10' });
        expect(first.issues[0].key).toBe('ATL-1');
        const last = await fetchJiraIssuesPage(PILOT_JIRA_ENV, { projectKey: 'ATL', scope: 'done', pageSize: 10, cursor: '20' }, jira);
        expect(last.issues.map(i => i.key)).toEqual(['ATL-21', 'ATL-22', 'ATL-23', 'ATL-24', 'ATL-25']);
        expect(last.next).toBeNull();
        const cloud = await fetchJiraIssuesPage({ ...PILOT_JIRA_ENV, JIRA_BASE_URL: 'https://pilot.atlassian.net' }, { projectKey: 'ATL', scope: 'done', pageSize: 10 }, jira);
        expect(cloud).toMatchObject({ total: null, next: '10' });
        // since: yalnız o tarihten sonra kapanan
        const none = await fetchJiraIssuesPage(PILOT_JIRA_ENV, { projectKey: 'ATL', scope: 'done', since: '2026-10-01' }, jira);
        expect(none.issues).toHaveLength(0);
    });

    it('worklog: aramada 20 kayıtla kısaltılır, istemci kaydın kendisinden tamamlar', async () => {
        const raws = [toRawIssue(rec('ATL-7'), { id: 10_007, project, worklogs: logs(26) })];
        const jira = createMockJira(async () => raws);
        const entries = await fetchJiraWorklogs(PILOT_JIRA_ENV, 'ATL', '2026-09-01', '2026-09-30', jira);
        expect(entries).toHaveLength(26);
        expect(entries[0]).toMatchObject({ author: 'Emre Koç', issueKey: 'ATL-7', hours: 1.5, source: 'jira' });
        expect(await fetchJiraWorklogs(PILOT_JIRA_ENV, 'ATL', '2026-10-01', '2026-10-30', jira)).toEqual([]);
    });

    it('kimlik doğrulama ister, yazmaya ve bilinmeyen JQL\'e izin vermez', async () => {
        const jira = createMockJira(async () => [] as RawIssue[]);
        expect((await jira('http://pilot-jira.local/rest/api/2/status')).status).toBe(401);
        const auth = { headers: { authorization: 'Bearer pilot' } };
        expect((await jira('http://pilot-jira.local/rest/api/2/issue', { ...auth, method: 'POST', body: '{}' })).status).toBe(403);
        expect((await jira(`http://pilot-jira.local/rest/api/2/search?jql=${encodeURIComponent('assignee = x')}`, auth)).status).toBe(400);
        expect((await jira('http://pilot-jira.local/rest/api/2/status', auth)).status).toBe(200);
    });

    it('simülasyonun dışa aktarımı uygulamanın istemcisinden kayıpsız döner', async () => {
        const state = createState(2026, '2026-06-01');
        runUntil(state, createWorld(2026, '2026-06-01'), '2026-07-10');
        const exports = jiraExports(state);
        const jira = createMockJira(async () => Object.values(exports).flatMap(e => e.issues));
        for (const [key, data] of Object.entries(state.jira)) {
            const got: JiraIssueRecord[] = [];
            let cursor: string | undefined;
            do {
                const r = await fetchJiraIssuesPage(PILOT_JIRA_ENV, { projectKey: key, scope: 'all', cursor }, jira);
                got.push(...r.issues);
                cursor = r.next || undefined;
            } while (cursor);
            expect(got).toEqual(data.issues.map(x => ({ ...x.rec, due: x.rec.due ?? null })));
        }
    });
});
