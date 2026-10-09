import { describe, expect, it } from 'vitest';
import { WorkspaceData } from '../../types';
import { splitWorkspaceDoc } from '../../utils/cloudSync';
import { readMcpConfig } from './config';
import { ConflictError, fileSource, SourceError, supabaseSource } from './source';
import { fakeSupabase, FakeDb, sampleWorkspace } from './testUtils';

const WS_ID = 'ws-1';

/** Örnek çalışma alanını tarayıcının yazdığı biçimde bulut tablolarına koyar */
const cloudDb = (ws: WorkspaceData = sampleWorkspace(), o: { members?: FakeDb['workspace_members']; privateRow?: boolean } = {}): FakeDb => {
    const { core, privateDoc, projects } = splitWorkspaceDoc(ws);
    return {
        workspaces: [{ id: WS_ID, name: 'Birim Portföyü', core: { ...core, gelecekAlan: 'korunmalı' }, version: 7 }],
        workspace_projects: projects.map((p, i) => ({ workspace_id: WS_ID, project_id: p.id, data: p, version: 3 + i })),
        workspace_private: o.privateRow === false ? [] : [{ workspace_id: WS_ID, data: privateDoc, version: 2 }],
        workspace_members: o.members || [{ workspace_id: WS_ID, user_id: 'u1', role: 'py' }],
    };
};

const source = (db: FakeDb, workspaceId?: string, password = 'dogru-parola') => {
    const fake = fakeSupabase(db);
    return { ...fake, src: supabaseSource({ url: 'https://abc.supabase.co', email: 'py@kurum.gov.tr', password, workspaceId }, fake.client) };
};

describe('Supabase kaynağı', () => {
    it('oturum açar, üyelikten çalışma alanını ve rolü bulur, satırları birleştirir', async () => {
        const { src, signIns } = source(cloudDb());
        const loaded = await src.load();
        expect(loaded.memberRole).toBe('py');
        expect(loaded.privateVisible).toBe(true);
        expect(loaded.label).toBe('Supabase (abc.supabase.co · Birim Portföyü)');
        expect(loaded.ws.projects.map(p => p.id)).toEqual(['altay', 'gizli']);
        // Notlar özel belgeden projeye geri birleşir
        expect(loaded.ws.projects[0].notes[0].content).toContain('ek bütçe');
        // Önbellek: ikinci okuma bulutu yeniden okumaz, oturum bir kez açılır
        expect(await src.load()).toBe(loaded);
        expect((await src.load({ fresh: true })).ws).not.toBe(loaded.ws);
        expect(signIns()).toBe(1);
    });

    it('oturum jetonunun süresi dolmuşsa bir kez yeniden giriş yapar', async () => {
        const { src, failures, signIns } = source(cloudDb());
        await src.load();
        failures.push({ table: 'workspaces', message: 'JWT expired' });
        const loaded = await src.load({ fresh: true });
        expect(loaded.ws.projects).toHaveLength(2);
        expect(signIns()).toBe(2);
    });

    it('yanlış parola, üyelik yok ve birden fazla üyelik açık hata verir', async () => {
        await expect(source(cloudDb(), undefined, 'yanlis').src.load()).rejects.toThrow('Supabase girişi başarısız');
        await expect(source(cloudDb(sampleWorkspace(), { members: [] })).src.load()).rejects.toThrow('hiçbir çalışma alanının üyesi değil');
        const iki = cloudDb(sampleWorkspace(), { members: [{ workspace_id: WS_ID, user_id: 'u1', role: 'py' }, { workspace_id: 'ws-2', user_id: 'u1', role: 'mudur' }] });
        await expect(source(iki).src.load()).rejects.toThrow('PLANASISTAN_WORKSPACE_ID');
        // Seçilince çalışır
        expect((await source(iki, WS_ID).src.load()).memberRole).toBe('py');
    });

    it('yönetici rolünde özel belge (RLS) okunamaz: notlar boş gelir', async () => {
        const loaded = await source(cloudDb(sampleWorkspace(), { privateRow: false })).src.load();
        expect(loaded.privateVisible).toBe(false);
        expect(loaded.ws.projects[0].notes).toEqual([]);
    });

    it('yalnız değişen proje satırını sürüm kontrolüyle yazar', async () => {
        const db = cloudDb();
        const { src, calls } = source(db);
        const { ws } = await src.load();
        const after: WorkspaceData = { ...ws, projects: ws.projects.map(p => (p.id === 'altay' ? { ...p, rag: 'red' as const } : p)) };
        await src.save(ws, after);
        const updates = calls.filter(c => c.op === 'update');
        expect(updates).toHaveLength(1);
        expect(updates[0].table).toBe('workspace_projects');
        const row = db.workspace_projects.find(r => r.project_id === 'altay')!;
        expect(row.version).toBe(4);
        expect((row.data as { rag: string; notes: unknown[] }).rag).toBe('red');
        // Notlar proje satırına yazılmaz (özel belgede kalır)
        expect((row.data as { notes: unknown[] }).notes).toEqual([]);
        expect(db.workspaces[0].version).toBe(7);
    });

    it('çekirdek değişince yazılır; tanınmayan alanlar korunur', async () => {
        const db = cloudDb();
        const { src } = source(db);
        const { ws } = await src.load();
        const after: WorkspaceData = { ...ws, allocations: ws.allocations.map(a => (a.id === 'a1' ? { ...a, plan: { ...a.plan, 9: 0.5 } } : a)) };
        await src.save(ws, after);
        expect(db.workspaces[0].version).toBe(8);
        const core = db.workspaces[0].core as Record<string, unknown>;
        expect(core.gelecekAlan).toBe('korunmalı');
        expect((core.allocations as { id: string; plan: Record<number, number> }[]).find(a => a.id === 'a1')!.plan[9]).toBe(0.5);
    });

    it('arada başkası yazdıysa çakışma verir, hiçbir şeyi ezmez', async () => {
        const db = cloudDb();
        const { src } = source(db);
        const { ws } = await src.load();
        db.workspace_projects.find(r => r.project_id === 'altay')!.version = 99; // başka bir istemci yazdı
        const after: WorkspaceData = { ...ws, projects: ws.projects.map(p => (p.id === 'altay' ? { ...p, rag: 'red' as const } : p)) };
        await expect(src.save(ws, after)).rejects.toBeInstanceOf(ConflictError);
        expect((db.workspace_projects.find(r => r.project_id === 'altay')!.data as { rag?: string }).rag).toBe('amber');
    });

    it('eski biçimdeki (projeler çekirdekte) buluta yazmaz', async () => {
        const ws = sampleWorkspace();
        const db = cloudDb(ws);
        db.workspaces[0].core = { ...(db.workspaces[0].core as object), projects: ws.projects };
        db.workspace_projects = [];
        const { src } = source(db);
        const loaded = await src.load();
        expect(loaded.ws.projects).toHaveLength(2);
        await expect(src.save(loaded.ws, { ...loaded.ws })).rejects.toThrow('eski biçimde');
    });

    it('bu oturumda okunmamış veri kaydedilmez', async () => {
        const { src } = source(cloudDb());
        await expect(src.save(sampleWorkspace(), sampleWorkspace())).rejects.toBeInstanceOf(SourceError);
    });
});

describe('JSON yedeği kaynağı', () => {
    const files = (content: string, mtime = 1) => ({
        readFile: async () => content,
        mtime: async () => mtime,
    });

    it('çalışma alanı yedeğini okur, salt-okunurdur', async () => {
        const json = JSON.stringify({ ...sampleWorkspace('py', 'p1'), exportDate: '2026-07-01T10:00:00Z' });
        const src = fileSource('/yedek.json', files(json));
        const loaded = await src.load();
        expect(loaded.ws.projects).toHaveLength(2);
        expect(loaded.ws.currentPersonId).toBe('p1');
        expect(loaded.dataAt).toBe('2026-07-01T10:00:00Z');
        expect(src.readOnlyReason()).toContain('yalnız okunur');
        await expect(src.save(loaded.ws, loaded.ws)).rejects.toThrow();
    });

    it('geçersiz dosya ve eski tek proje yedeği anlaşılır hata verir', async () => {
        await expect(fileSource('/x.json', files('{bozuk')).load()).rejects.toThrow('geçerli bir JSON değil');
        await expect(fileSource('/x.json', files(JSON.stringify({ tasks: [] }))).load()).rejects.toThrow('eski tek proje yedeği');
        await expect(fileSource('/yok.json', { readFile: async () => '', mtime: async () => { throw new Error('ENOENT'); } }).load()).rejects.toThrow('bulunamadı');
    });
});

describe('MCP ayarları', () => {
    it('veri kaynağı yoksa kurulum gerektiğini söyler', () => {
        const o = readMcpConfig({});
        expect(o.source).toBeNull();
        expect(o.allowWrite).toBe(false);
    });

    it('iki kaynak birden, eksik Supabase ayarı ve geçersiz rol reddedilir', () => {
        expect(readMcpConfig({ PLANASISTAN_WORKSPACE_FILE: '/a.json', PLANASISTAN_SUPABASE_URL: 'https://x.supabase.co' }).setupError).toContain('yalnız birini');
        expect(readMcpConfig({ PLANASISTAN_SUPABASE_URL: 'https://x.supabase.co', PLANASISTAN_SUPABASE_ANON_KEY: 'k' }).setupError).toContain('PLANASISTAN_EMAIL, PLANASISTAN_PASSWORD');
        expect(readMcpConfig({ PLANASISTAN_WORKSPACE_FILE: '/a.json', PLANASISTAN_ROLE: 'patron' }).setupError).toContain('PLANASISTAN_ROLE geçersiz');
    });

    it('yedek ve Supabase kaynaklarını kurar', () => {
        const file = readMcpConfig({ PLANASISTAN_WORKSPACE_FILE: '/a.json', PLANASISTAN_ROLE: 'py', PLANASISTAN_PERSON: 'Ayşe Kaya', PLANASISTAN_MCP_WRITE: '1' });
        expect(file).toMatchObject({ role: 'py', person: 'Ayşe Kaya', allowWrite: true });
        expect(file.source?.kind).toBe('file');
        const created: string[] = [];
        const supa = readMcpConfig({
            PLANASISTAN_SUPABASE_URL: 'https://x.supabase.co', PLANASISTAN_SUPABASE_ANON_KEY: 'anon', PLANASISTAN_EMAIL: 'a@b.c', PLANASISTAN_PASSWORD: ' boşluklu ',
        }, { createSupabase: (url, key) => { created.push(`${url}|${key}`); return fakeSupabase(cloudDb()).client; } });
        expect(supa.source?.kind).toBe('supabase');
        expect(supa.allowWrite).toBe(false);
        expect(created).toEqual(['https://x.supabase.co|anon']);
    });
});
