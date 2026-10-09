import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serializeWorkspace } from '../../utils/workspace';
import { callAs, fileTarget, listToolsAs } from './check';
import { createState, createWorld, jiraExports, runUntil } from './sim';
import { PERSONAS } from './world';

const persona = (id: string) => PERSONAS.find(p => p.id === id)!;
const WEEK = '2026-H28';

describe('haftalık rapor akışı (MCP, persona kimlikleriyle)', () => {
    let dir = '';
    let file = '';
    beforeAll(async () => {
        // Ajanlı dönem 6 Temmuz'da başlar: 28. haftanın NEHİR raporunu Burak (ajan) yazar
        const state = createState(2026, '2026-06-01', '2026-07-06');
        const ws = runUntil(state, createWorld(2026, '2026-06-01'), '2026-07-08', undefined, { importAll: true });
        dir = await mkdtemp(join(tmpdir(), 'pilot-rapor-'));
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

    it('araçlar role göre sunulur', async () => {
        const names = async (who: string) => (await listToolsAs(persona(who), fileTarget(file))).map(t => t.name);
        expect(await names('burak')).toEqual(expect.arrayContaining(['haftalik_rapor', 'haftalik_rapor_taslagi', 'oner_haftalik_rapor']));
        expect(await names('selin')).toEqual(expect.arrayContaining(['oner_rapor_karari']));
        expect(await names('selin')).not.toContain('oner_hafta_yayinla');
        expect(await names('mert')).toEqual(expect.arrayContaining(['oner_rapor_karari', 'oner_hafta_yayinla', 'oneriyi_uygula']));
        const ahmet = await names('ahmet');
        expect(ahmet).toContain('haftalik_rapor');
        expect(ahmet.filter(n => n.startsWith('oner_'))).toEqual([]);
    });

    it('taslak paketi uygulamanın istemidir; gönderim, iade, onaylar ve yayın akıştan geçer', async () => {
        const pkg = await call('burak', 'haftalik_rapor_taslagi', { proje: 'NHR-2403', hafta: WEEK });
        expect(pkg.ok).toBe(true);
        expect(pkg.json.sistem).toContain('KURUM RAPOR KILAVUZU');
        expect(pkg.json.istem).toContain('ŞİMDİKİ GİRDİ');

        const prev = await call('burak', 'haftalik_rapor', { proje: 'NHR-2403', hafta: WEEK });
        const plans = prev.json.gecen_haftanin_plani as { madde_id: string }[];
        const submit = {
            proje: 'NHR-2403', hafta: WEEK, py_puani: 5, gonder: true,
            ai_taslagi: '{"buHafta":[{"tur":"ongoing","metin":"Bu hafta NEHİR veri boru hattında şema doğrulamanın geliştirilmesine devam edildi."}],"gelecekHafta":["Kabul testleri hazırlanacak."]}',
            bu_hafta: [{ kategori: 'ongoing', metin: 'Bu hafta NEHİR veri boru hattında şema doğrulamanın geliştirilmesine devam edildi.' }],
            gelecek_hafta: ['17 Temmuz\'a kadar kabul testi senaryoları müşteriyle paylaşılacak.'],
            plan_degerlendirmesi: plans.map(p => ({ madde_id: p.madde_id, durum: 'partial' })),
        };
        // Biçim hatası (açılımı verilmemiş kısaltma) olan rapor gönderilmez; genel geçer madde yalnız uyarıdır
        const bad = await call('burak', 'oner_haftalik_rapor', { ...submit, bu_hafta: [{ kategori: 'ongoing', metin: 'Bu hafta QWZ modülünün entegrasyonu tamamlandı.' }] });
        expect(bad.ok).toBe(false);
        expect(JSON.stringify(bad.json)).toContain('gönderilemez');

        expect((await call('burak', 'oner_haftalik_rapor', submit, true)).ok).toBe(true);
        expect((await call('elif', 'oner_haftalik_rapor', { ...submit, gonder: false })).ok).toBe(false);
        expect((await call('selin', 'oner_rapor_karari', { proje: 'NHR-2403', hafta: WEEK, karar: 'iade' })).ok).toBe(false); // not zorunlu
        expect((await call('selin', 'oner_rapor_karari', { proje: 'NHR-2403', hafta: WEEK, karar: 'iade', not: 'Müşteri teslim tarihi eksik.' }, true)).ok).toBe(true);
        const returned = await call('burak', 'haftalik_rapor', { proje: 'NHR-2403', hafta: WEEK });
        expect(returned.json.asama).toBe('Taslak');
        expect(returned.json.iade_notu).toBe('Müşteri teslim tarihi eksik.');
        expect(returned.json.bu_hafta[0].kaynak).toBe('ai');

        expect((await call('burak', 'oner_haftalik_rapor', submit, true)).ok).toBe(true);
        expect((await call('ahmet', 'haftalik_rapor', { proje: 'NHR-2403', hafta: WEEK })).json.durum).toContain('görünür değil');
        expect((await call('selin', 'oner_rapor_karari', { proje: 'NHR-2403', hafta: WEEK, karar: 'onay' }, true)).ok).toBe(true);
        expect((await call('mert', 'oner_rapor_karari', { proje: 'NHR-2403', hafta: WEEK, karar: 'onay' }, true)).ok).toBe(true);
        expect((await call('ahmet', 'oner_rapor_karari', { proje: 'NHR-2403', hafta: WEEK, karar: 'onay' })).ok).toBe(false);
        expect((await call('mert', 'oner_hafta_yayinla', { hafta: WEEK }, true)).ok).toBe(true);

        const seen = await call('ahmet', 'haftalik_rapor', { proje: 'NHR-2403', hafta: WEEK });
        expect(seen.json.asama).toBe('Onaylandı');
        const actions = (seen.json.gecmis as string[]).map(h => h.split(' ')[2]);
        expect(actions).toEqual(['create', 'submit', 'return', 'submit', 'bs_approve', 'pyds_approve']);
    });
});
