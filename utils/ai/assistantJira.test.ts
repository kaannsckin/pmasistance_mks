import { describe, expect, it } from 'vitest';
import { Allocation, TaskStatus, UserRole, WorkspaceData, WorklogEntry } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { AiAction, applyAction, describeAction, monthsBetween, validateAction } from './actions';
import { buildToolContext } from './scope';
import { executeTool, toolSpecsFor } from './tools';
import { reportRange } from './worklogReport';

const NOW = new Date(2026, 10, 20, 10, 0); // 20 Kasım 2026

const build = (role: UserRole = 'py', personId: string | null = 'pm'): WorkspaceData => {
    const gib = createProject('GİB');
    gib.id = 'gib';
    gib.pmPersonId = 'pm';
    gib.jiraProjectKey = 'MPS';
    gib.tasks = ['6608', '6609'].map((n, i) => ({ id: `t${i}`, name: `Bulgu ${n}`, availability: true, priority: 'High' as const, version: 0, predecessor: null, unit: 'EMS', resourceName: 'Ayşe Kaya', time: { best: 2, avg: 2, worst: 2 }, jiraId: `MPS-${n}`, notes: '', status: TaskStatus.ToDo }));
    const atl = createProject('ATL');
    atl.id = 'atl';
    atl.pmPersonId = 'pm';
    atl.jiraProjectKey = 'ATL';
    const other = createProject('Başka');
    other.id = 'other';
    other.pmPersonId = 'x';
    other.jiraProjectKey = 'GIZ';
    return {
        ...createEmptyWorkspace(),
        currentRole: role,
        currentPersonId: personId ?? undefined,
        projects: [gib, atl, other],
        people: [
            { id: 'pm', firstName: 'Murat', lastName: 'S', departmentCode: 'U310', availableAA: 1, roles: [] },
            { id: 'ayse', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] },
        ],
        allocations: [{ id: 'a1', personId: 'ayse', projectId: 'atl', year: 2027, plan: { 1: 0.7 }, actual: {} } as Allocation],
    };
};

const logs: Record<string, WorklogEntry[]> = {
    MPS: [
        { date: '2026-11-03', author: 'Ayşe Kaya', issueKey: 'MPS-6608', summary: 'RBAC', hours: 6, source: 'jira' },
        { date: '2026-11-04', author: 'Can Er', issueKey: 'MPS-6609', summary: 'MFA', hours: 4, source: 'jira' },
        { date: '2026-11-05', author: 'Can Er', issueKey: 'MPS-7000', summary: 'Başka iş', hours: 5, source: 'jira' },
    ],
    ATL: [{ date: '2026-11-10', author: 'Ayşe Kaya', issueKey: 'ATL-1', summary: 'Analiz', hours: 8, source: 'jira' }],
};
const withJira = (ws: WorkspaceData) => {
    const ctx = buildToolContext(ws, NOW);
    const calls: string[] = [];
    ctx.jira = { worklogs: async (k, f, t) => { calls.push(`${k} ${f} ${t}`); return logs[k] || []; } };
    return { ctx, calls };
};
const run = async (ctx: ReturnType<typeof buildToolContext>, name: string, args: Record<string, unknown>) => {
    const r = await executeTool({ name, arguments: args }, ctx);
    return { ...r, json: JSON.parse(r.content) };
};

describe('tahsis aralığı', () => {
    it('ay aralığı yıl geçer; 24 ayla sınırlı', () => {
        expect(monthsBetween('2026-12', '2027-03')).toEqual([{ year: 2026, month: 12 }, { year: 2027, month: 1 }, { year: 2027, month: 2 }, { year: 2027, month: 3 }]);
        expect(monthsBetween('2027-03', '2026-12')).toEqual([]);
        expect(monthsBetween('2026-13', '2027-01')).toBeNull();
    });

    it('"Ayşe\'yi Aralık–Mart %50 GİB\'e ata": tek öneri, kapasite aşımı kartta, uygulanınca her yıl için satır açılır', async () => {
        const ws = build();
        const { ctx } = withJira(ws);
        const r = await run(ctx, 'oner_tahsis_ayarla', { kisi: 'Ayşe Kaya', proje: 'GİB', baslangic: '2026-12', bitis: '2027-03', yuzde: 50 });
        expect(r.ok).toBe(true);
        const p = ctx.proposals[0];
        expect(p.action).toEqual({ type: 'tahsis_araligi', personId: 'ayse', projectId: 'gib', from: '2026-12', to: '2027-03', field: 'plan', value: 0.5 });
        expect(p.title).toBe('Plan tahsis: Ayşe Kaya · Aralık 2026 – Mart 2027');
        expect(p.details.find(d => d.label === 'Kapasite aşımı')?.value).toBe('Ocak 2027: toplam 1,2 / 1 AA');

        const out = applyAction(ws, p.action).ws;
        const rows = out.allocations.filter(a => a.personId === 'ayse' && a.projectId === 'gib');
        expect(rows.map(a => [a.year, a.plan])).toEqual([[2026, { 12: 0.5 }], [2027, { 1: 0.5, 2: 0.5, 3: 0.5 }]]);
    });

    it('tek ay ve eski biçim (yil + ay) eski aksiyonu üretir', async () => {
        const { ctx } = withJira(build());
        await run(ctx, 'oner_tahsis_ayarla', { kisi: 'Ayşe Kaya', proje: 'GİB', yil: 2026, ay: 12, aa: 0.25 });
        expect(ctx.proposals[0].action).toMatchObject({ type: 'tahsis_ayarla', year: 2026, month: 12, value: 0.25 });
    });

    it('aralıktaki bir yılın planı kilitliyse öneri reddedilir', () => {
        const ws = { ...build(), planLocks: [{ projectId: 'gib', year: 2027, status: 'locked' as const }] };
        const a: AiAction = { type: 'tahsis_araligi', personId: 'ayse', projectId: 'gib', from: '2026-12', to: '2027-03', field: 'plan', value: 0.5 };
        expect(validateAction(ws as WorkspaceData, a)).toMatch(/2027 planı onayda\/kilitli/);
        expect(validateAction(ws as WorkspaceData, { ...a, field: 'actual' })).toBeNull();
        expect(validateAction(build(), { ...a, value: 2 })).toMatch(/0 ile 1,5/);
    });
});

describe('Jira araçları', () => {
    it('Jira bağlı değilse araçlar sunulmaz', () => {
        const names = toolSpecsFor(buildToolContext(build(), NOW)).map(s => s.name);
        expect(names).not.toContain('jira_worklog_raporu');
        expect(names).not.toContain('oner_jira_esitle');
        expect(toolSpecsFor(withJira(build()).ctx).map(s => s.name)).toEqual(expect.arrayContaining(['jira_worklog_raporu', 'oner_jira_esitle']));
    });

    it('"GİB, ATL ve MPS\'nin kasım worklog raporu": proje başına süre, kişi × proje; uygulama projesi kendi kayıtlarıyla sınırlı', async () => {
        const { ctx, calls } = withJira(build());
        const r = await run(ctx, 'jira_worklog_raporu', { projeler: 'GİB, ATL ve MPS', ay: 'Kasım', grupla: 'proje, kişi, kayıt' });
        expect(r.ok).toBe(true);
        expect(calls).toEqual(['MPS 2026-11-01 2026-11-20', 'ATL 2026-11-01 2026-11-20']); // MPS bir kez okunur, bugünden ileri gidilmez
        expect(r.json.projeler).toEqual([
            { proje: 'GİB', jira: 'MPS', saat: 10, gun: 1.3, kisi_sayisi: 2, kayit_sayisi: 2, kapsam_disi_saat: 5 },
            { proje: 'ATL', jira: 'ATL', saat: 8, gun: 1, kisi_sayisi: 1, kayit_sayisi: 1 },
            { proje: 'Jira MPS', jira: 'MPS', saat: 15, gun: 1.9, kisi_sayisi: 2, kayit_sayisi: 3 },
        ]);
        expect(r.json.kisiler[0]).toEqual({ kisi: 'Ayşe Kaya', saat: 20, projeler: { 'GİB': 6, ATL: 8, 'Jira MPS': 6 } });
        expect(r.json.kayitlar[0]).toMatchObject({ anahtar: 'MPS-6608', saat: 12 });
    });

    it('kapsam: görünmeyen proje ve yabancı Jira anahtarı reddedilir; aralık sınırlı', async () => {
        const { ctx } = withJira(build());
        expect((await run(ctx, 'jira_worklog_raporu', { projeler: 'Başka', ay: '2026-11' })).json.hata).toMatch(/yetki kapsamında değil/);
        expect((await run(ctx, 'jira_worklog_raporu', { projeler: 'GIZ', ay: '2026-11' })).ok).toBe(false);
        expect((await run(ctx, 'jira_worklog_raporu', { projeler: 'GİB', baslangic: '2026-01-01', bitis: '2026-11-01' })).json.hata).toMatch(/92 gün/);
        expect(reportRange({ ay: 'aralık' }, NOW)).toEqual({ from: '2025-12-01', to: '2025-12-31' }); // gelmemiş ay → geçen yıl
        expect(reportRange({ ay: '2026-10' }, NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    });

    it('Jira eşitleme önerisi: kart, Jira\'ya yazılacak alanları açıkça gösterir; yetkisiz PY reddedilir', async () => {
        const ws = build();
        ws.projects[0].jiraSync = { projectKey: 'MPS', discover: false, autoMinutes: 0, fields: { status: 'both', assignee: 'pull' }, autoPeople: true };
        const { ctx } = withJira(ws);
        const r = await run(ctx, 'oner_jira_esitle', { proje: 'GİB' });
        expect(r.ok).toBe(true);
        const d = describeAction(ws, ctx.proposals[0].action);
        expect(d.title).toBe('Jira eşitle: GİB');
        expect(d.details).toEqual(expect.arrayContaining([
            { label: 'Kayıt', value: '2 Jira anahtarlı kayıt' },
            { label: 'Jira\'dan alınacak', value: 'Durum, Atanan kişi' },
            expect.objectContaining({ label: 'Jira\'ya YAZILACAK', value: expect.stringMatching(/^Durum — /) }),
        ]));
        expect(() => applyAction(ws, ctx.proposals[0].action)).toThrow(/uygulama içinde/);
        expect(validateAction(build('py', 'ayse'), { type: 'jira_esitle', projectId: 'gib' })).toMatch(/yalnız projenin PY/);
        expect(validateAction(ws, { type: 'jira_esitle', projectId: 'atl' })).toMatch(/Jira anahtarlı kayıt/);
    });
});
