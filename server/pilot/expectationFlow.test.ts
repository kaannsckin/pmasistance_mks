import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseImportedJson, serializeWorkspace } from '../../utils/workspace';
import type { WorkspaceData } from '../../types';
import { callAs, fileTarget, listToolsAs } from './check';
import { createState, createWorld, jiraExports, runUntil } from './sim';
import { PERSONAS } from './world';

const persona = (id: string) => PERSONAS.find(p => p.id === id)!;

/** BL-30: müdürün kararı uygulamaya yazılır — PY yönetimden karar ister, müdür beklentiye yanıt verir */
describe('yönetimden beklentiler (MCP, persona kimlikleriyle)', () => {
    let dir = '';
    let file = '';
    beforeAll(async () => {
        const state = createState(2026, '2026-06-01', '2026-07-06');
        const ws = runUntil(state, createWorld(2026, '2026-06-01'), '2026-07-08', undefined, { importAll: true });
        dir = await mkdtemp(join(tmpdir(), 'pilot-beklenti-'));
        file = join(dir, 'workspace.json');
        await writeFile(file, serializeWorkspace(ws, false));
        await mkdir(join(dir, 'jira'));
        for (const [k, v] of Object.entries(jiraExports(state))) await writeFile(join(dir, 'jira', `${k}.json`), JSON.stringify(v));
    });
    afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

    const call = async (who: string, tool: string, args: Record<string, unknown>, confirm = false) => {
        const out = await callAs(persona(who), fileTarget(file), tool, args, { writable: true, confirm });
        const last = out[out.length - 1];
        return { ok: !last.isError, json: last.json as Record<string, any> };
    };
    const saved = async (): Promise<WorkspaceData> => (parseImportedJson(await readFile(file, 'utf8')) as { workspace: WorkspaceData }).workspace;

    it('araçlar role göre: PY ve bölüm sorumlusu açar, müdür yanıtlar', async () => {
        const names = async (who: string) => (await listToolsAs(persona(who), fileTarget(file))).map(t => t.name);
        const burak = await names('burak');
        expect(burak).toEqual(expect.arrayContaining(['beklentiler', 'oner_beklenti_ac']));
        expect(burak).not.toContain('oner_beklenti_yanitla');
        expect(await names('selin')).toContain('oner_beklenti_ac');
        const ahmet = await names('ahmet');
        expect(ahmet).toEqual(expect.arrayContaining(['beklentiler', 'oner_beklenti_yanitla', 'oneriyi_uygula']));
        expect(ahmet).not.toContain('oner_beklenti_ac');
    });

    it('PY kararı ister, müdür yazar, PY yanıtı görür; rol dışı denemeler reddedilir', async () => {
        const raise = await call('burak', 'oner_beklenti_ac', {
            baslik: 'NEHİR için Temmuz–Eylül 0,5 AA test mühendisi', aciklama: 'Yeniden açılan kayıtlar arttı; U320\'den 0,5 AA gerekiyor.',
            kategori: 'resource', aciliyet: 'critical', proje: 'NHR-2403', termin: '2026-07-15',
        }, true);
        expect(raise.ok).toBe(true);

        const denied = await call('ahmet', 'oner_beklenti_ac', { baslik: 'x', kategori: 'other', aciliyet: 'normal' });
        expect(denied.ok).toBe(false);
        const notMine = await call('burak', 'oner_beklenti_yanitla', { beklenti: 'Temmuz–Eylül 0,5 AA', durum: 'karsilandi', yanit: 'x' });
        expect(notMine.ok).toBe(false);

        const list = await call('ahmet', 'beklentiler', {});
        const item = (list.json.beklentiler as { baslik: string; aciliyet: string; durum: string }[]).find(e => e.baslik.startsWith('NEHİR için Temmuz'))!;
        expect(item).toMatchObject({ aciliyet: 'Kritik', durum: 'Yanıt bekliyor' });
        expect(list.json.yapabilecegin.join(' ')).toContain('oner_beklenti_yanitla');

        const decide = await call('ahmet', 'oner_beklenti_yanitla', {
            beklenti: 'Temmuz–Eylül 0,5 AA', durum: 'karsilandi', yanit: 'Onaylandı: KALKAN\'dan Can Erdem Temmuz–Eylül 0,2 AA/ay NEHİR\'e; işe alım yok.',
        }, true);
        expect(decide.ok).toBe(true);

        const seen = await call('burak', 'beklentiler', { durum: 'kapali' });
        const closed = (seen.json.beklentiler as { baslik: string; durum: string; yanit: string; yanitlayan: string }[]).find(e => e.baslik.startsWith('NEHİR için Temmuz'))!;
        expect(closed).toMatchObject({ durum: 'Karşılandı', yanitlayan: 'Ahmet Şahin' });
        expect(closed.yanit).toContain('Can Erdem');

        const again = await call('ahmet', 'oner_beklenti_yanitla', { beklenti: 'Temmuz–Eylül 0,5 AA', durum: 'inceleniyor', yanit: 'y' });
        expect(again.ok).toBe(false);

        const ws = await saved();
        expect(ws.auditLog!.map(a => a.action)).toEqual(expect.arrayContaining(['expectation.create', 'expectation.close']));
    });
});
