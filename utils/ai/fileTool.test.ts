import { describe, expect, it } from 'vitest';
import { Task, TaskStatus, WorkspaceData } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { buildToolContext, clampLimit } from './scope';
import { buildSystemPrompt } from './systemPrompt';
import { executeTool, toolKind, toolSpecsFor } from './tools';

const NOW = new Date('2026-11-20T09:00:00Z');

const task = (i: number): Task => ({
    id: `t${i}`, name: `Kayıt ${i}`, availability: true, priority: i % 2 ? 'High' : 'Low', version: 1, predecessor: null, unit: 'U310',
    resourceName: 'Ayşe Kaya', time: { best: 1, avg: 2, worst: 4 }, jiraId: `ATL-${i}`, notes: '', status: TaskStatus.ToDo,
});

const buildWs = (): WorkspaceData => {
    const p = createProject('ATLAS', { code: 'ATL' });
    p.id = 'atlas';
    p.pmPersonId = 'p1';
    p.tasks = Array.from({ length: 70 }, (_, i) => task(i + 1));
    return {
        ...createEmptyWorkspace(), currentRole: 'py', currentPersonId: 'p1', projects: [p],
        people: [{ id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] }],
    };
};

const ctxWithFiles = () => {
    const ctx = buildToolContext(buildWs(), NOW);
    ctx.files = [];
    return ctx;
};

const call = async (ctx: ReturnType<typeof ctxWithFiles>, args: Record<string, unknown>) => {
    const out = await executeTool({ name: 'dosya_olustur', arguments: args }, ctx);
    return { ...out, json: JSON.parse(out.content) };
};

describe('dosya_olustur', () => {
    it('yalnız tarayıcı sohbetinde (dosya çalışma zamanı) sunulur; sistem talimatına kural eklenir', () => {
        const plain = buildToolContext(buildWs(), NOW);
        expect(toolSpecsFor(plain).map(s => s.name)).not.toContain('dosya_olustur');
        expect(buildSystemPrompt(plain)).not.toContain('Dosya çıktısı');
        const ctx = ctxWithFiles();
        expect(toolSpecsFor(ctx).map(s => s.name)).toContain('dosya_olustur');
        expect(buildSystemPrompt(ctx)).toContain('Dosya çıktısı');
        expect(toolKind('dosya_olustur')).toBe('file');
    });

    it('tablo bir okuma aracından dolar; dosyada ekran sınırı (50) aşılır, sütunlar seçilir', async () => {
        const ctx = ctxWithFiles();
        const r = await call(ctx, {
            bicim: 'xlsx', baslik: 'ATLAS açık kayıtlar', alt_baslik: 'Kasım 2026',
            bolumler: [
                { tur: 'paragraf', metin: '70 açık kayıt.' },
                { tur: 'tablo', metin: 'Kayıtlar', kaynak_arac: 'gorev_ara', kaynak_arg: '{"proje":"ATLAS"}', kaynak_alan: 'gorevler', sutunlar: ['Jira', 'Görev', 'Öncelik'] },
            ],
        });
        expect(r.ok).toBe(true);
        expect(r.json).toMatchObject({ bicim: 'Excel', tablo: 1, satir: 70, kaynaklar: [{ arac: 'gorev_ara', alan: 'gorevler', satir: 70 }] });
        const doc = ctx.files![0];
        const table = doc.blocks[1] as Extract<typeof doc.blocks[number], { kind: 'table' }>;
        expect(table.columns).toEqual(['Jira', 'Görev', 'Öncelik']);
        expect(table.rows[0]).toEqual(['ATL-1', 'Kayıt 1', 'High']);
        // Sınır yalnız aktarım süresince yükselir
        expect(clampLimit(undefined, 25)).toBe(25);
    });

    it('elle tablo ve hatalı istekler', async () => {
        const ctx = ctxWithFiles();
        const ok = await call(ctx, {
            bicim: 'pdf', baslik: 'Özet',
            bolumler: [{ tur: 'tablo', sutunlar: ['Kişi', 'Saat'], satirlar: [['Ayşe', '12,5'], ['Ali', '3']] }, { tur: 'liste', maddeler: ['a', 'b'] }],
        });
        expect(ok.json).toMatchObject({ bicim: 'PDF', satir: 2 });
        expect((ctx.files![0].blocks[0] as { rows: unknown[][] }).rows[0]).toEqual(['Ayşe', 12.5]);

        const bad = await call(ctx, { bicim: 'xlsx', baslik: 'x', bolumler: [{ tur: 'tablo', kaynak_arac: 'oner_risk_ekle' }] });
        expect(bad.json.hata).toMatch(/okuma aracı değil/);
        const missingCol = await call(ctx, { bicim: 'xlsx', baslik: 'x', bolumler: [{ tur: 'tablo', kaynak_arac: 'gorev_ara', sutunlar: ['Yok'] }] });
        expect(missingCol.json.hata).toMatch(/Yok sütunu sonuçta yok/);
        expect((await call(ctx, { bicim: 'odt', baslik: 'x', bolumler: [{ tur: 'paragraf', metin: 'a' }] })).json.hata).toMatch(/xlsx, csv/);
    });
});
