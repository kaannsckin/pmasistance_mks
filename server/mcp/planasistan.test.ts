import { describe, expect, it } from 'vitest';
import { UserRole, WorkspaceData } from '../../types';
import { APPLY_TOOL, createPlanAsistanMcp, PlanAsistanMcpOptions, STATUS_TOOL } from './planasistan';
import { memorySource, sampleWorkspace } from './testUtils';

const NOW = new Date('2026-07-15T09:00:00Z');

const server = (ws: WorkspaceData, o: Partial<PlanAsistanMcpOptions> & { memberRole?: UserRole; readOnlyReason?: string; kind?: 'file' | 'supabase' } = {}) => {
    const mem = memorySource(ws, { kind: o.kind, memberRole: o.memberRole, readOnlyReason: o.readOnlyReason });
    const mcp = createPlanAsistanMcp({ source: mem.source, allowWrite: false, now: () => NOW, ...o });
    const call = async (name: string, args: Record<string, unknown> = {}) => {
        const res = await mcp.callTool(name, args);
        return { ...res, json: JSON.parse(res.content[0].text) };
    };
    const toolNames = async () => (await mcp.listTools()).map(t => t.name);
    return { mcp, mem, call, toolNames };
};

describe('PlanAsistan MCP — kapsam', () => {
    it('Proje Yöneticisi yalnız kendi projesini görür; sicil çıktıya girmez', async () => {
        const { call } = server(sampleWorkspace(), { role: 'py', person: 'Ayşe Kaya' });
        const res = await call('proje_listesi');
        expect(res.isError).toBeUndefined();
        expect(res.content[0].text).toContain('ALTAY Sistemi');
        expect(res.content[0].text).not.toContain('Gizli Proje');
        const kisi = await call('kisi_profili', { kisi: 'Ayşe Kaya' });
        expect(kisi.content[0].text).not.toContain('SCp199');
        const gizli = await call('proje_detayi', { proje: 'Gizli Proje' });
        expect(gizli.isError).toBe(true);
        expect(gizli.json.hata).toContain('yetki kapsamında değil');
    });

    it('yönetici rollerine not ve istek araçları hiç sunulmaz', async () => {
        const { toolNames } = server(sampleWorkspace(), { role: 'mudur' });
        const names = await toolNames();
        expect(names).toContain('portfoy_ozeti');
        expect(names).not.toContain('notlari_ara');
        expect(names).not.toContain('musteri_istekleri');
        expect(names[0]).toBe(STATUS_TOOL);
    });

    it('kişiye bağlı rolde kişi verilmezse açık bir hata döner', async () => {
        const { call } = server(sampleWorkspace(), { role: 'py' });
        const res = await call('proje_listesi');
        expect(res.isError).toBe(true);
        expect(res.json.hata).toContain('PLANASISTAN_PERSON');
        const bilinmeyen = await server(sampleWorkspace(), { role: 'py', person: 'Olmayan Kişi' }).call('proje_listesi');
        expect(bilinmeyen.json.hata).toContain('bulunamadı');
    });

    it('JSON yedeğinde kimlik ayarlanmamışsa yedeği alan tarayıcıdaki kimlik kullanılır', async () => {
        const { call } = server(sampleWorkspace('py', 'p2'), { kind: 'file' });
        const durum = await call(STATUS_TOOL);
        expect(durum.json.kimlik).toMatchObject({ rol: 'Proje Yöneticisi', kisi: 'Mehmet Demir', kaynak: 'yedekteki kimlik' });
        // Tek görünür proje varsayılan proje olur
        expect(durum.json.varsayilan_proje).toBe('Gizli Proje (GZL)');
        const detay = await call('proje_detayi');
        expect(detay.json.ad).toBe('Gizli Proje');
    });

    it('Supabase kaynağında rol bulut üyeliğinden gelir', async () => {
        const { call } = server(sampleWorkspace(), { memberRole: 'pyb_destek' });
        const durum = await call(STATUS_TOOL);
        expect(durum.json.kimlik).toMatchObject({ rol: 'PYB Destek', kaynak: 'bulut üyelik rolü' });
        expect(durum.json.gorunur_proje).toBe(2);
        expect(durum.json.varsayilan_proje).toContain('yok');
    });

    it('PLANASISTAN_PROJECT varsayılan projeyi belirler; görünmeyen proje hata verir', async () => {
        const ok = await server(sampleWorkspace(), { role: 'pyb_destek', project: 'ALT-01' }).call('proje_detayi');
        expect(ok.content[0].text).toContain('Arayüz tasarımı');
        const bad = await server(sampleWorkspace(), { role: 'py', person: 'Ayşe Kaya', project: 'GZL' }).call('proje_listesi');
        expect(bad.isError).toBe(true);
        expect(bad.json.hata).toContain('PLANASISTAN_PROJECT');
    });

    it('yönetici konsolunda AI kapatılmışsa araçlar çalışmaz', async () => {
        const ws = { ...sampleWorkspace(), aiPolicy: { enabled: false } };
        const res = await server(ws, { role: 'pyb_destek' }).call('proje_listesi');
        expect(res.isError).toBe(true);
        expect(res.json.hata).toContain('kurum genelinde kapatılmış');
    });

    it('bilgi_ara sunucuda anahtar kelimeyle notlarda arar (kapsam içinde)', async () => {
        const { call } = server(sampleWorkspace(), { role: 'py', person: 'Ayşe Kaya' });
        const res = await call('bilgi_ara', { sorgu: 'ek bütçe' });
        expect(res.isError).toBeUndefined();
        expect(res.json.arama_turu).toBe('anahtar kelime');
        expect(res.json.sonuclar[0].metin).toContain('bütçe');
    });

    it('kaynak okunamazsa salt-okunur katalog sunulur ve çağrılar nedeni döndürür', async () => {
        const mcp = createPlanAsistanMcp({
            source: { kind: 'supabase', readOnlyReason: () => null, load: async () => { throw new Error('ağ yok'); }, save: async () => undefined },
            allowWrite: true,
        });
        const names = (await mcp.listTools()).map(t => t.name);
        expect(names).toContain('proje_listesi');
        expect(names.some(n => n.startsWith('oner_'))).toBe(false);
        const res = await mcp.callTool('proje_listesi', {});
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('ağ yok');
    });

    it('yapılandırma yoksa durum aracı nasıl kurulacağını söyler', async () => {
        const mcp = createPlanAsistanMcp({ source: null, allowWrite: false });
        const res = JSON.parse((await mcp.callTool(STATUS_TOOL, {})).content[0].text);
        expect(res.durum).toBe('yapılandırılmamış');
        expect(res.hata).toContain('PLANASISTAN_WORKSPACE_FILE');
    });
});

describe('PlanAsistan MCP — değişiklikler', () => {
    const writer = (ws = sampleWorkspace()) => server(ws, { role: 'py', person: 'Ayşe Kaya', allowWrite: true });

    it('yazma varsayılanda kapalıdır; öneri araçları sunulmaz', async () => {
        const { toolNames, call } = server(sampleWorkspace(), { role: 'py', person: 'Ayşe Kaya' });
        const names = await toolNames();
        expect(names.some(n => n.startsWith('oner_'))).toBe(false);
        expect(names).not.toContain(APPLY_TOOL);
        const res = await call('oner_risk_ekle', { baslik: 'X', olasilik: 3, etki: 3 });
        expect(res.isError).toBe(true);
        expect(res.json.hata).toContain('PLANASISTAN_MCP_WRITE');
    });

    it('JSON yedeği ve veri girmeyen roller değişiklik yapamaz', async () => {
        const yedek = server(sampleWorkspace(), { role: 'py', person: 'Ayşe Kaya', allowWrite: true, kind: 'file', readOnlyReason: 'yedek salt-okunur' });
        expect(await yedek.toolNames()).not.toContain(APPLY_TOOL);
        expect((await yedek.call(STATUS_TOOL)).json.degisiklik).toContain('yedek salt-okunur');
        const mudur = server(sampleWorkspace(), { role: 'mudur', allowWrite: true });
        expect((await mudur.toolNames()).some(n => n.startsWith('oner_'))).toBe(false);
        expect((await mudur.call(STATUS_TOOL)).json.degisiklik).toContain('veri girmez');
    });

    it('öneri hazırlanır, onaylanınca uygulanıp kaydedilir; aynı öneri iki kez uygulanmaz', async () => {
        const { call, mem, toolNames } = writer();
        expect(await toolNames()).toEqual(expect.arrayContaining(['oner_risk_ekle', 'oner_tahsis_ayarla', APPLY_TOOL]));
        const oneri = await call('oner_risk_ekle', { proje: 'ALTAY', baslik: 'Tedarik gecikmesi', olasilik: 4, etki: 5, sahip: 'Mehmet Demir' });
        expect(oneri.isError).toBeUndefined();
        expect(oneri.json.oneri_id).toMatch(/^oneri-/);
        expect(oneri.json.durum).toContain('UYGULANMADI');
        expect(mem.saved).toHaveLength(0);

        const uygula = await call(APPLY_TOOL, { oneri_id: oneri.json.oneri_id });
        expect(uygula.isError).toBeUndefined();
        expect(uygula.json.uygulandi).toBe(true);
        expect(mem.saved).toHaveLength(1);
        const { before, after } = mem.saved[0];
        expect(before.projects.find(p => p.id === 'altay')!.risks || []).toHaveLength(0);
        const risk = after.projects.find(p => p.id === 'altay')!.risks![0];
        expect(risk).toMatchObject({ title: 'Tedarik gecikmesi', probability: 4, impact: 5, owner: 'Mehmet Demir' });
        // Denetim kaydı yapılandırılan kimlikle
        expect(after.auditLog?.[0]).toMatchObject({ action: 'ai.apply', actorRole: 'py', actorName: 'Ayşe Kaya' });

        const tekrar = await call(APPLY_TOOL, { oneri_id: oneri.json.oneri_id });
        expect(tekrar.isError).toBe(true);
        expect(tekrar.json.hata).toContain('bulunamadı');
    });

    it('başkasının projesine öneri hazırlanamaz', async () => {
        const res = await writer().call('oner_gorev_ekle', { proje: 'Gizli Proje', ad: 'Sızma' });
        expect(res.isError).toBe(true);
    });

    it('uygulama anında güncel veriyle yeniden doğrulanır (plan arada kilitlenmiş)', async () => {
        const { call, mem } = writer();
        const oneri = await call('oner_tahsis_ayarla', { kisi: 'Ayşe Kaya', proje: 'ALTAY', yil: 2026, ay: 9, aa: 0.5 });
        expect(oneri.isError).toBeUndefined();
        const ws = sampleWorkspace();
        mem.set({ ...ws, planLocks: [{ projectId: 'altay', year: 2026, status: 'locked' }] as WorkspaceData['planLocks'] });
        const res = await call(APPLY_TOOL, { oneri_id: oneri.json.oneri_id });
        expect(res.isError).toBe(true);
        expect(res.json.hata).toContain('kilitli');
        expect(mem.saved).toHaveLength(0);
    });

    it('tahsis önerisi uygulanınca plan hücresi değişir', async () => {
        const { call, mem } = writer();
        const oneri = await call('oner_tahsis_ayarla', { kisi: 'Ayşe Kaya', proje: 'ALTAY', yil: 2026, ay: 9, aa: 0.75 });
        await call(APPLY_TOOL, { oneri_id: oneri.json.oneri_id });
        const row = mem.saved[0].after.allocations.find(a => a.personId === 'p1' && a.projectId === 'altay')!;
        expect(row.plan[9]).toBe(0.75);
    });
});
