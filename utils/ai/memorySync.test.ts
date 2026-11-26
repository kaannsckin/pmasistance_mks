import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore, memoryKey, MemoryItem, parseMemoryMarkdown, readMemoryRaw } from './memory';
import { identityKeyOf, loadSyncState, mergeMemory, MemoryRemote, syncMemory } from './memorySync';

const mem = new Map<string, string>();
beforeEach(() => {
    mem.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => { mem.set(k, v); },
        removeItem: (k: string) => { mem.delete(k); },
    };
});

const NOW = new Date('2026-11-20T09:00:00Z');
const items = (md: string): MemoryItem[] => parseMemoryMarkdown(md, '2026-11-20');
const texts = (xs: MemoryItem[]) => xs.map(x => x.text).sort();

/** Bellek içi bulut satırı (sürüm kilidiyle) */
const fakeCloud = () => {
    const cloud: { row: { content: string; version: number } | null; writes: number; beforeUpdate?: () => void } = { row: null, writes: 0 };
    const remote: MemoryRemote = {
        get: async () => (cloud.row ? { ...cloud.row } : null),
        insert: async content => {
            if (cloud.row) return { ok: false, conflict: true };
            cloud.row = { content, version: 1 }; cloud.writes++;
            return { ok: true, version: 1 };
        },
        update: async (content, expected) => {
            cloud.beforeUpdate?.();
            cloud.beforeUpdate = undefined;
            if (!cloud.row || cloud.row.version !== expected) return { ok: false, conflict: true };
            cloud.row = { content, version: expected + 1 }; cloud.writes++;
            return { ok: true, version: expected + 1 };
        },
    };
    return { cloud, remote };
};

describe('üç yönlü birleştirme', () => {
    it('iki tarafta ayrı eklenenler kalır; bir tarafta silinen geri gelmez', () => {
        const base = items('## Notlar\n- [2026-11-01] ortak\n- [2026-11-01] A silecek\n- [2026-11-01] B silecek');
        const local = items('## Notlar\n- [2026-11-01] ortak\n- [2026-11-01] B silecek\n- [2026-11-19] A yeni');
        const remote = items('## Notlar\n- [2026-11-01] ortak\n- [2026-11-01] A silecek\n- [2026-11-18] B yeni');
        const r = mergeMemory(base, local, remote, NOW);
        expect(texts(r.items)).toEqual(['A yeni', 'B yeni', 'ortak']);
        expect(r.fromRemote).toEqual({ added: 1, removed: 1 });
    });

    it('aynı anahtardan yenisi kalır; aynı satırın tarihi ve önemi birleşir', () => {
        const base = items('## Notlar\n- [2026-11-01] Ana proje: ATLAS\n- [2026-11-01] ortak');
        const local = items('## Notlar\n- [2026-11-10] Ana proje: BORA\n- [2026-11-01] ortak');
        const remote = items('## Notlar\n- [2026-11-15] Ana proje: CERES\n- [2026-11-12] ! ortak');
        const r = mergeMemory(base, local, remote, NOW).items;
        expect(texts(r)).toEqual(['Ana proje: CERES', 'ortak']);
        expect(r.find(x => x.text === 'ortak')).toMatchObject({ createdAt: '2026-11-12', important: true });
    });

    it('ilk eşitlemede (taban yok) iki tarafın birleşimi alınır; üslup bölümü korunur', () => {
        const r = mergeMemory([], items('## Üslup\n- Hitap: Murat Bey'), items('## Tercihler\n- Süreleri gün ver'), NOW).items;
        expect(r.map(x => [x.section, x.text])).toEqual([['uslup', 'Hitap: Murat Bey'], ['tercih', 'Süreleri gün ver']]);
    });
});

describe('eşitleme', () => {
    const keyA = memoryKey('py', 'p1');

    it('iki cihaz: A yazar, B çeker ve ekler, A geri çeker; yerel yazım olay yaymaz', async () => {
        const { cloud, remote } = fakeCloud();
        const clock = () => NOW;
        createMemoryStore(keyA, clock).add('Hitap: Murat Bey', { section: 'uslup' });
        const a1 = await syncMemory(keyA, 'ws1', remote, clock);
        expect(a1).toMatchObject({ ok: true, pushed: true, pulled: 0 });
        expect(cloud.row?.version).toBe(1);

        // B cihazı: ayrı localStorage
        const deviceA = new Map(mem);
        mem.clear();
        const b1 = await syncMemory(keyA, 'ws1', remote, clock);
        expect(b1).toMatchObject({ ok: true, pulled: 1, pushed: false });
        expect(readMemoryRaw(keyA)).toContain('Hitap: Murat Bey');
        createMemoryStore(keyA, clock).add('ATLAS teslimi Ocak sonu', { tags: ['atlas'] });
        expect(await syncMemory(keyA, 'ws1', remote, clock)).toMatchObject({ ok: true, pushed: true });

        // A'ya dön
        mem.clear();
        for (const [k, v] of deviceA) mem.set(k, v);
        const a2 = await syncMemory(keyA, 'ws1', remote, clock);
        expect(a2).toMatchObject({ ok: true, pulled: 1, pushed: false });
        expect(createMemoryStore(keyA, clock).list().map(i => i.text)).toEqual(['Hitap: Murat Bey', 'ATLAS teslimi Ocak sonu #atlas']);
        // Değişiklik yoksa yazım da yok
        const writes = cloud.writes;
        expect(await syncMemory(keyA, 'ws1', remote, clock)).toMatchObject({ ok: true, pushed: false, pulled: 0 });
        expect(cloud.writes).toBe(writes);
        expect(loadSyncState(keyA, 'ws1')?.version).toBe(2);
        expect(loadSyncState(keyA, 'baska-ws')).toBeNull();
    });

    it('araya başka cihaz girerse (sürüm çakışması) yeniden birleştirir; hiçbir satır kaybolmaz', async () => {
        const { cloud, remote } = fakeCloud();
        const clock = () => NOW;
        cloud.row = { content: '## Notlar\n- [2026-11-01] buluttaki', version: 5 };
        createMemoryStore(keyA, clock).add('yereldeki');
        cloud.beforeUpdate = () => { cloud.row = { content: '## Notlar\n- [2026-11-01] buluttaki\n- [2026-11-19] arada eklenen', version: 6 }; };
        const r = await syncMemory(keyA, 'ws1', remote, clock);
        expect(r.ok).toBe(true);
        expect(texts(items(cloud.row!.content))).toEqual(['arada eklenen', 'buluttaki', 'yereldeki']);
        expect(cloud.row!.version).toBe(7);
    });

    it('bulut hatası açıklamayla döner, yerel hafızaya dokunmaz', async () => {
        createMemoryStore(keyA, () => NOW).add('yereldeki');
        const before = readMemoryRaw(keyA);
        const r = await syncMemory(keyA, 'ws1', { get: async () => { throw new Error('ağ yok'); }, insert: async () => ({ ok: true, version: 1 }), update: async () => ({ ok: true, version: 1 }) });
        expect(r).toMatchObject({ ok: false });
        expect(r.error).toMatch(/ağ yok/);
        expect(readMemoryRaw(keyA)).toBe(before);
    });

    it('kimlik anahtarı rol + kişidir', () => {
        expect(identityKeyOf(memoryKey('py', 'p1'))).toBe('py:p1');
        expect(identityKeyOf(memoryKey('mudur'))).toBe('mudur:-');
    });
});
