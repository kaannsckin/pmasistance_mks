import { describe, expect, it } from 'vitest';
import { WorkspaceData } from '../types';
import { createEmptyWorkspace, createProject } from './workspace';
import { joinStored, memoryStore, storageDiff, WorkspacePersister } from './workspaceStore';

const ws = (): WorkspaceData => {
    const a = createProject('A'), b = createProject('B');
    return { ...createEmptyWorkspace(), projects: [a, b], activeProjectId: a.id };
};

describe('parçalı depo', () => {
    it('ilk kayıt her şeyi yazar; sonra yalnız değişen proje ya da meta', () => {
        const w0 = ws();
        expect(storageDiff(null, w0).puts.map(([k]) => k).sort()).toEqual(['meta', `project:${w0.projects[0].id}`, `project:${w0.projects[1].id}`].sort());
        // Görev değişti: yalnız o proje
        const w1 = { ...w0, projects: [{ ...w0.projects[0], tasks: [] }, w0.projects[1]] };
        expect(storageDiff(w0, w1)).toEqual({ puts: [[`project:${w0.projects[0].id}`, w1.projects[0]]], deletes: [] });
        // Proje dışı alan: yalnız meta
        const w2 = { ...w1, people: [] };
        expect(storageDiff(w1, w2).puts.map(([k]) => k)).toEqual(['meta']);
        // Proje silindi + sıra değişti
        const w3 = { ...w2, projects: [w2.projects[1]] };
        const d = storageDiff(w2, w3);
        expect(d.deletes).toEqual([`project:${w2.projects[0].id}`]);
        expect(d.puts.map(([k]) => k)).toEqual(['meta']);
        expect(storageDiff(w3, w3)).toEqual({ puts: [], deletes: [] });
    });

    it('gidiş-dönüş veri kaybetmez; yetim proje kayıtları ayıklanır, tanınmayan biçim null', async () => {
        const kv = memoryStore();
        const w0 = ws();
        const p = new WorkspacePersister(kv, null);
        p.save(w0);
        await p.flush();
        kv.data.set('project:eski', { id: 'eski' });
        const back = joinStored(await kv.readAll())!;
        expect(back.workspace).toEqual(w0);
        expect(back.orphans).toEqual(['project:eski']);
        expect(joinStored(new Map())).toBeNull();
        expect(joinStored(new Map([['meta', { format: 99, workspace: {}, projectIds: [] }]]))).toBeNull();
        // Yetimler sonraki ilk yazımda silinir
        const p2 = new WorkspacePersister(kv, back.workspace, undefined, back.orphans);
        p2.save({ ...back.workspace, people: [] });
        await p2.flush();
        expect(kv.data.has('project:eski')).toBe(false);
    });

    it('yazım sürerken gelen değişikliklerden yalnız sonuncusu yazılır', async () => {
        const kv = memoryStore();
        const w0 = ws();
        const p = new WorkspacePersister(kv, w0);
        const edits = Array.from({ length: 20 }, (_, i) => ({ ...w0, projects: [{ ...w0.projects[0], name: `A${i}` }, w0.projects[1]] }));
        edits.forEach(e => p.save(e));
        await p.flush();
        expect(kv.writes).toBeLessThanOrEqual(2);
        expect((kv.data.get(`project:${w0.projects[0].id}`) as { name: string }).name).toBe('A19');
    });

    it('kota hatasında kullanıcıya bildirilir; yer açılınca eksik parçalar yeniden yazılır', async () => {
        let full = true;
        const kv = memoryStore(() => (full ? new DOMException('dolu', 'QuotaExceededError') : null));
        const results: boolean[] = [];
        const w0 = ws();
        const p = new WorkspacePersister(kv, null, ok => results.push(ok));
        p.save(w0);
        await p.flush();
        expect(results).toEqual([false]);
        full = false;
        p.save({ ...w0, people: [] }); // yalnız meta değişti ama projeler hiç yazılmamıştı
        await p.flush();
        expect(results).toEqual([false, true]);
        expect([...kv.data.keys()].filter(k => k.startsWith('project:'))).toHaveLength(2);
    });

    it('sıfırlama depoyu boşaltır ve sonraki kayıtları durdurur', async () => {
        const kv = memoryStore();
        const p = new WorkspacePersister(kv, null);
        p.save(ws());
        await p.clear();
        p.save(ws());
        await p.flush();
        expect(kv.data.size).toBe(0);
    });
});
