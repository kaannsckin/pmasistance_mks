import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError } from '../mcp/source';
import { callAs, runChecks } from './check';
import {
    cloudConfigFromEnv, cloudEnvProblem, cloudTarget, createPilotWorkspace, ensureMemberships, ensurePilotUsers, fileAuthStorage, listMembers,
    parseViewers, PilotCloudConfig, pilotEmail, replacePilotWorkspace, serviceSource,
} from './cloud';
import { fakeCloudClients, fakeCloudServer, registerUser } from './fakeCloud';
import { createState, createWorld, jiraExports, runUntil } from './sim';
import { PERSONAS } from './world';

const cfg: PilotCloudConfig = { url: 'https://pilot-test.supabase.co', anonKey: 'anon', serviceKey: 'service', password: 'pilot-parola' };
const persona = (id: string) => PERSONAS.find(p => p.id === id)!;

const simulate = (end = '2026-07-15') => {
    const state = createState(2026, '2026-06-01');
    const ws = runUntil(state, createWorld(2026, '2026-06-01'), end, undefined, { importAll: true });
    return { state, ws };
};

describe('pilot bulut ayarları', () => {
    const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref: 'x' })).toString('base64url')}.imzaimzaimzaimzaimza`;
    const valid = { PILOT_SUPABASE_URL: 'https://x.supabase.co/', PILOT_SUPABASE_ANON_KEY: jwt('anon'), PILOT_SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'), PILOT_PASSWORD: 'uzun-pilot-parolasi-42' };

    it('dört ortam değişkeni gerekir; eksikler adıyla bildirilir', () => {
        expect(cloudConfigFromEnv({ PILOT_SUPABASE_URL: 'https://x.supabase.co/' }).missing).toEqual(['PILOT_SUPABASE_ANON_KEY', 'PILOT_SUPABASE_SERVICE_ROLE_KEY', 'PILOT_PASSWORD']);
        expect(cloudConfigFromEnv(valid).config).toEqual({ url: 'https://x.supabase.co', anonKey: valid.PILOT_SUPABASE_ANON_KEY, serviceKey: valid.PILOT_SUPABASE_SERVICE_ROLE_KEY, password: valid.PILOT_PASSWORD });
        // Yeni biçim anahtarlar da geçerlidir
        expect(cloudConfigFromEnv({ ...valid, PILOT_SUPABASE_ANON_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwx', PILOT_SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz' }).config).not.toBeNull();
    });

    it('yer tutucu ya da yer değiştirmiş anahtarlar adıyla reddedilir; değerler mesaja girmez', () => {
        // Pilotta yaşanan durum: talimattaki yer tutucular olduğu gibi yapıştırılmış
        const env = { ...valid, PILOT_SUPABASE_ANON_KEY: '<anon public anahtarı>', PILOT_SUPABASE_SERVICE_ROLE_KEY: '<service_role anahtarı>', PILOT_PASSWORD: '<yeni uydurduğunuz uzun bir parola>' };
        const r = cloudConfigFromEnv(env);
        expect(r.config).toBeNull();
        expect(r.invalid.map(x => x.split(' ')[0])).toEqual(['PILOT_SUPABASE_ANON_KEY', 'PILOT_SUPABASE_SERVICE_ROLE_KEY', 'PILOT_PASSWORD']);
        expect(cloudEnvProblem(env)).not.toContain('anahtarı>');
        const swapped = cloudConfigFromEnv({ ...valid, PILOT_SUPABASE_ANON_KEY: valid.PILOT_SUPABASE_SERVICE_ROLE_KEY, PILOT_SUPABASE_SERVICE_ROLE_KEY: valid.PILOT_SUPABASE_ANON_KEY });
        expect(swapped.invalid).toHaveLength(2);
        expect(cloudEnvProblem({ ...valid, PILOT_SUPABASE_URL: 'yzwm.supabase.co' })).toMatch(/^geçersiz: PILOT_SUPABASE_URL/);
    });

    it('izleyiciler: varsayılan rol pyb_destek, geçersiz rol ya da e-posta reddedilir', () => {
        expect(parseViewers('A@x.com, b@y.org:py')).toEqual([{ email: 'a@x.com', role: 'pyb_destek' }, { email: 'b@y.org', role: 'py' }]);
        expect(parseViewers(undefined)).toEqual([]);
        expect(() => parseViewers('a@x.com:patron')).toThrow(/Geçersiz rol/);
        expect(() => parseViewers('adsiz')).toThrow(/Geçersiz e-posta/);
    });

    it('oturum deposu dosyada kalır (ayrı süreçler aynı oturumu kullanır)', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'pilot-oturum-'));
        try {
            const a = fileAuthStorage(join(dir, 'o.json'));
            a.setItem('k', 'v');
            expect(fileAuthStorage(join(dir, 'o.json')).getItem('k')).toBe('v');
            a.removeItem('k');
            expect(a.getItem('k')).toBeNull();
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe('pilot bulutta (bellekte Supabase, RLS ile)', () => {
    const server = fakeCloudServer();
    const clients = fakeCloudClients(server);
    const admin = clients.service();
    const sim = simulate();
    let dir = '';
    let jiraDir = '';
    let workspaceId = '';

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), 'pilot-bulut-'));
        jiraDir = join(dir, 'jira');
        await mkdir(jiraDir);
        for (const [key, resp] of Object.entries(jiraExports(sim.state))) await writeFile(join(jiraDir, `${key}.json`), JSON.stringify(resp));
        registerUser(server, 'izleyici@example.org');
    });
    afterAll(() => rm(dir, { recursive: true, force: true }));

    it('hesaplar kurulur; ikinci kurulum aynı hesapları kullanır ve parolayı eşitler', async () => {
        const users = await ensurePilotUsers(admin, 'eski-parola');
        expect(Object.keys(users)).toEqual(['jira', ...PERSONAS.map(p => p.id)]);
        const again = await ensurePilotUsers(admin, cfg.password);
        expect(again).toEqual(users);
        expect(server.users.filter(u => u.email.startsWith('pilot-')).every(u => u.password === cfg.password)).toBe(true);
    });

    it('çalışma alanı kurulur: Jira ajanı sahibi, personalar rolleriyle, izleyici kayıtlıysa üye olur', async () => {
        const users = await ensurePilotUsers(admin, cfg.password);
        workspaceId = await createPilotWorkspace(admin, users.jira, sim.ws);
        const report = await ensureMemberships(admin, workspaceId, users, parseViewers('izleyici@example.org, kayitsiz@example.org:py'));
        expect(report.kayitsiz).toEqual(['kayitsiz@example.org']);
        const members = await listMembers(admin, workspaceId);
        expect(members).toEqual(expect.arrayContaining([
            { email: pilotEmail('jira'), rol: 'pyb_destek' },
            { email: 'izleyici@example.org', rol: 'pyb_destek' },
            ...PERSONAS.map(p => ({ email: pilotEmail(p.id), rol: p.role })),
        ]));
        // Proje satırları, çekirdek ve özel belge v1; notlar proje satırına değil özel belgeye
        const rows = server.tables.workspace_projects.filter(r => r.workspace_id === workspaceId);
        expect(rows).toHaveLength(sim.ws.projects.length);
        expect(rows.every(r => r.version === 1 && (r.data as { notes: unknown[] }).notes.length === 0)).toBe(true);
        expect(server.tables.workspace_private.find(r => r.workspace_id === workspaceId)!.version).toBe(1);
        // Sunucu okuması veriyi eksiksiz geri verir (izinler dahil)
        const back = (await serviceSource(cfg, clients, workspaceId).load({ fresh: true })).ws;
        expect(back.projects.map(p => [p.id, p.tasks.length, p.notes.length, p.customerRequests.length])).toEqual(sim.ws.projects.map(p => [p.id, p.tasks.length, p.notes.length, p.customerRequests.length]));
        expect(back.allocations).toHaveLength(sim.ws.allocations.length);
        expect(back.leaves).toEqual(sim.ws.leaves || []);
        expect(back.weeklyReports).toHaveLength((sim.ws.weeklyReports || []).length);
    });

    it('kontroller bulutta geçer: personalar kendi hesabıyla, rol üyelikten; müdür notları veritabanından okuyamaz', async () => {
        const target = cloudTarget(cfg, clients, workspaceId, jiraDir);
        const results = await runChecks(target, { now: new Date('2026-07-16T07:00:00Z') });
        expect(results.filter(r => r.durum === 'KALDI')).toEqual([]);
        const names = results.map(r => r.ad);
        expect(names).toEqual(expect.arrayContaining([
            'bulut: persona üyelikleri ve rolleri',
            'ahmet (müdür): notlar veritabanında okunamaz (RLS)',
            'ahmet (müdür): notlara yazamaz (RLS)',
            'elif (PY): notlar veritabanından okunur',
            'elif: jira_aktar → onay → görevler Jira ile aynı',
        ]));
        expect(results.find(r => r.ad === 'elif: bağlantı ve kimlik')!.ayrinti).toContain('Supabase (pilot-test.supabase.co');
        // Her persona bir kez giriş yapar; sonraki bağlantılar kayıtlı oturumu kullanır
        expect(server.signIns).toBe(PERSONAS.length);
        // Yazma akışı kontrolleri geçici kopyada: buluttaki veri değişmedi
        expect(server.tables.workspace_projects.filter(r => r.workspace_id === workspaceId).every(r => r.version === 1)).toBe(true);
    }, 60_000);

    it('persona değişikliği buluta kendi hesabıyla yazılır; müdürün oturumunda notlar yoktur', async () => {
        const target = cloudTarget(cfg, clients, workspaceId, jiraDir);
        const [prop, applied] = await callAs(persona('elif'), target, 'oner_risk_ekle', { proje: 'ATLAS', baslik: 'Bulut pilot riski', olasilik: 2, etki: 3 }, { writable: true, confirm: true });
        expect(prop.isError).toBe(false);
        expect(applied.isError).toBe(false);
        const row = server.tables.workspace_projects.find(r => r.workspace_id === workspaceId && r.project_id === 'prj-atlas')!;
        expect(row.version).toBe(2);
        expect((row.data as { risks: { title: string }[] }).risks.some(r => r.title === 'Bulut pilot riski')).toBe(true);

        const ahmet = (await target.source(persona('ahmet'), false).load({ fresh: true }));
        expect(ahmet.memberRole).toBe('mudur');
        expect(ahmet.privateVisible).toBe(false);
        expect(ahmet.ws.projects.every(p => p.notes.length === 0)).toBe(true);
        const elif = (await target.source(persona('elif'), false).load({ fresh: true }));
        expect(elif.ws.projects.some(p => p.notes.length > 0)).toBe(true);
    });

    it('Jira ajanının okuması ile yazması arasında biri yazarsa ezilmez (çakışma)', async () => {
        const service = serviceSource(cfg, clients, workspaceId);
        const loaded = (await service.load({ fresh: true })).ws;
        await callAs(persona('elif'), cloudTarget(cfg, clients, workspaceId, jiraDir), 'oner_risk_ekle', { proje: 'ATLAS', baslik: 'Araya giren risk', olasilik: 1, etki: 1 }, { writable: true, confirm: true });
        const next = { ...loaded, projects: loaded.projects.map(p => (p.id === 'prj-atlas' ? { ...p, rag: 'red' as const } : p)) };
        await expect(service.save(loaded, next)).rejects.toBeInstanceOf(ConflictError);
    });

    it('baslat --zorla: çalışma alanı yerinde yenilenir — kimlik ve üyelikler aynı, sürümler artar', async () => {
        const membersBefore = await listMembers(admin, workspaceId);
        const coreV = server.tables.workspaces.find(r => r.id === workspaceId)!.version as number;
        const atlasV = server.tables.workspace_projects.find(r => r.workspace_id === workspaceId && r.project_id === 'prj-atlas')!.version as number;
        const fresh = simulate('2026-06-20');
        expect(await replacePilotWorkspace(admin, workspaceId, fresh.ws)).toBe(true);
        expect(server.tables.workspaces.find(r => r.id === workspaceId)!.version).toBe(coreV + 1);
        expect(server.tables.workspace_projects.find(r => r.workspace_id === workspaceId && r.project_id === 'prj-atlas')!.version).toBe(atlasV + 1);
        expect(await listMembers(admin, workspaceId)).toEqual(membersBefore);
        const back = (await serviceSource(cfg, clients, workspaceId).load({ fresh: true })).ws;
        expect(back.projects.find(p => p.id === 'prj-atlas')!.tasks).toHaveLength(fresh.ws.projects.find(p => p.id === 'prj-atlas')!.tasks.length);
        expect(await replacePilotWorkspace(admin, '00000000-0000-0000-0000-000000000000', fresh.ws)).toBe(false);
    });
});
