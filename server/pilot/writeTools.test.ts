import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serializeWorkspace } from '../../utils/workspace';
import { callAs, fileTarget, listToolsAs } from './check';
import { createState, createWorld, jiraExports, runUntil } from './sim';
import { PERSONAS } from './world';

const persona = (id: string) => PERSONAS.find(p => p.id === id)!;

/** Demo, ajanların çalıştığı ortamdır: PY'nin risk, istek ve not kararları uygulamaya MCP'den yazılır */
describe('PY yazma araçları (MCP, persona kimlikleriyle)', () => {
    let dir = '';
    let file = '';
    beforeAll(async () => {
        const state = createState(2026, '2026-06-01', '2026-07-06');
        const ws = runUntil(state, createWorld(2026, '2026-06-01'), '2026-07-08', undefined, { importAll: true });
        const psl = ws.projects.find(p => p.code === 'PSL-2402')!;
        psl.customerRequests = [...psl.customerRequests, {
            id: 'req-test-cevrimdisi', title: 'Çevrimdışı mod: bağlantısız veri girişi', description: 'Saha ekipleri kapsama dışında veri giremiyor.',
            customerName: 'Kurum B Saha Operasyonları', createdAt: '2026-07-07T09:00:00.000Z', status: 'New',
        }];
        dir = await mkdtemp(join(tmpdir(), 'pilot-yazma-'));
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

    it('PY araçları görür; müdür not ve istek araçlarını hiç görmez', async () => {
        const names = async (who: string) => (await listToolsAs(persona(who), fileTarget(file))).map(t => t.name);
        expect(await names('burak')).toEqual(expect.arrayContaining(['oner_risk_guncelle', 'oner_istek_karari', 'oner_not_ekle']));
        const ahmet = await names('ahmet');
        expect(ahmet).not.toContain('oner_istek_karari');
        expect(ahmet).not.toContain('oner_not_ekle');
    });

    it('risk kapatılır; başka PY\'nin projesinde reddedilir', async () => {
        const list = await call('burak', 'risk_listesi', { proje: 'NHR-2403' });
        const risk = (list.json.riskler as { baslik: string }[])[0];
        expect(risk).toBeTruthy();
        const denied = await call('elif', 'oner_risk_guncelle', { proje: 'NHR-2403', risk: risk.baslik, durum: 'closed' });
        expect(denied.ok).toBe(false);
        const done = await call('burak', 'oner_risk_guncelle', { proje: 'NHR-2403', risk: risk.baslik, durum: 'closed', gerekce: 'Önlem tamamlandı' }, true);
        expect(done.ok).toBe(true);
        const closed = await call('burak', 'risk_listesi', { proje: 'NHR-2403', durum: 'closed' });
        expect((closed.json.riskler as { baslik: string }[]).map(r => r.baslik)).toContain(risk.baslik);
    });

    it('müşteri isteği kabul edilir: görev açılır, istek dönüşür, gerekçe günlükte', async () => {
        const r = await call('burak', 'oner_istek_karari', {
            proje: 'PSL-2402', istek: 'Çevrimdışı mod', karar: 'kabul', gerekce: 'Tahmini 15 gün; Ağustos sürümüne alındı.',
            atanan: 'Ece Polat', bitis: '2026-08-28', efor_gun: 15,
        }, true);
        expect(r.ok).toBe(true);
        const reqs = await call('burak', 'musteri_istekleri', { proje: 'PSL-2402' });
        expect(JSON.stringify(reqs.json)).toContain('Converted');
        const notes = await call('burak', 'notlari_ara', { proje: 'PSL-2402', metin: 'Ağustos sürümüne alındı' });
        expect(notes.json.eslesen).toBeGreaterThan(0);
        const again = await call('burak', 'oner_istek_karari', { proje: 'PSL-2402', istek: 'Çevrimdışı mod', karar: 'ret', gerekce: 'x' });
        expect(again.ok).toBe(false);
    });

    it('PY kendi projesine not ekler', async () => {
        const r = await call('burak', 'oner_not_ekle', { proje: 'NHR-2403', metin: '#karar Test kaynağı için Selin Hanım\'dan 0,5 AA istendi.', tarih: '2026-07-08' }, true);
        expect(r.ok).toBe(true);
        const notes = await call('burak', 'notlari_ara', { proje: 'NHR-2403', metin: 'Test kaynağı için' });
        expect(notes.json.eslesen).toBe(1);
    });
});
