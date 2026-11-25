import { describe, expect, it } from 'vitest';
import { Task, TaskStatus, WorkspaceData } from '../../types';
import { createEmptyWorkspace, createProject } from '../workspace';
import { buildToolContext } from './scope';
import { matchSkills, skillById, SKILLS } from './skills';
import { buildSystemPrompt } from './systemPrompt';
import { executeTool, toolSpecsFor } from './tools';
import { expandSlash, slashSkillFor } from './slashCommands';
import { AI_LIMITS } from './protocol';

const NOW = new Date('2026-11-20T09:00:00Z');

const task = (i: number, extra: Partial<Task> = {}): Task => ({
    id: `t${i}`, name: `Kayıt ${i}`, availability: true, priority: i % 3 ? 'High' : 'Low', version: 1, predecessor: null, unit: i % 2 ? 'U310' : 'U320',
    resourceName: i % 2 ? 'Ayşe Kaya' : 'Ali Can', time: { best: 1, avg: i, worst: i * 2 }, jiraId: `ATL-${i}`, notes: '', status: TaskStatus.ToDo, ...extra,
});

const buildWs = (): WorkspaceData => {
    const p = createProject('ATLAS', { code: 'ATL' });
    p.id = 'atlas';
    p.pmPersonId = 'p1';
    p.tasks = Array.from({ length: 30 }, (_, i) => task(i + 1));
    return {
        ...createEmptyWorkspace(), currentRole: 'py', currentPersonId: 'p1', projects: [p], activeProjectId: 'atlas',
        people: [{ id: 'p1', firstName: 'Ayşe', lastName: 'Kaya', departmentCode: 'U310', availableAA: 1, roles: [] }],
    };
};

const chatCtx = () => {
    const ctx = buildToolContext(buildWs(), NOW);
    ctx.files = [];
    return ctx;
};

describe('yetenekler', () => {
    it('katalog: benzersiz kimlik, ad, kullanım cümlesi ve oyun kitabı', () => {
        expect(new Set(SKILLS.map(s => s.id)).size).toBe(SKILLS.length);
        for (const s of SKILLS) {
            expect(s.when.length).toBeGreaterThan(20);
            expect(s.playbook).toMatch(/Oyun kitabı/);
        }
        expect(skillById('kok-neden')?.name).toMatch(/kök neden/i);
    });

    it('istekten yetenek seçimi; ek içeriğindeki sözcükler tetiklemez', () => {
        expect(matchSkills('Ekteki Excel\'i analiz et, ne görüyorsun?').map(s => s.id)).toContain('veri-analizi');
        expect(matchSkills('ATLAS neden gecikti?')[0].id).toBe('kok-neden');
        expect(matchSkills('Bu hızla ne zaman biter, yetişir mi?')[0].id).toBe('tahmin');
        expect(matchSkills('Merhaba')).toEqual([]);
        expect(matchSkills('Selam\n\n[Kullanıcı 1 dosya ekledi.]\n<<<EK 1: notlar.txt>>>\nrisk analizi gecikme\n<<<EK 1 SONU>>>')).toEqual([]);
        expect(matchSkills('Özetle\n\n[Kullanıcı 1 dosya ekledi.]\n<<<EK 1: butce.xlsx>>>\na,b\n<<<EK 1 SONU>>>').map(s => s.id)).toContain('veri-analizi');
        expect(matchSkills('rapor analiz risk kapasite neden').length).toBeLessThanOrEqual(2);
    });

    it('sistem talimatı: analist tutumu her zaman; katalog ve oyun kitabı yalnız sohbette ve uyan istekte', () => {
        const plain = buildToolContext(buildWs(), NOW);
        expect(buildSystemPrompt(plain)).toContain('Analist tutumu');
        expect(buildSystemPrompt(plain, { userText: 'neden gecikti' })).not.toContain('Etkin yetenek:');
        const ctx = chatCtx();
        const sys = buildSystemPrompt(ctx, { userText: 'ATLAS neden gecikti?' });
        expect(sys).toContain('yetenek_yukle');
        expect(sys).toContain('Etkin yetenek: Sapma ve kök neden');
        expect(buildSystemPrompt(ctx, { userText: 'merhaba' })).not.toContain('Etkin yetenek:');
        // Komutla seçilen yetenek eşleşmenin yerine geçer
        expect(buildSystemPrompt(ctx, { userText: 'x', skills: [skillById('tahmin')!] })).toContain('Etkin yetenek: Tahmin');
        // En geniş talimat bile sunucu sınırında
        const widest = buildSystemPrompt(ctx, { userText: 'x', skills: SKILLS.slice(0, 2) });
        expect(widest.length).toBeLessThan(AI_LIMITS.maxSystemChars * 0.75);
    });

    it('yetenek_yukle oyun kitabını döner; bilinmeyen yetenek açıklamalı hata', async () => {
        const ctx = chatCtx();
        expect(toolSpecsFor(ctx).map(s => s.name)).toEqual(expect.arrayContaining(['yetenek_yukle', 'veri_analiz']));
        expect(toolSpecsFor(buildToolContext(buildWs(), NOW)).map(s => s.name)).not.toContain('veri_analiz');
        const ok = JSON.parse((await executeTool({ name: 'yetenek_yukle', arguments: { ad: 'karar-destek' } }, ctx)).content);
        expect(ok.oyun_kitabi).toMatch(/Karar destek/);
        const bad = JSON.parse((await executeTool({ name: 'yetenek_yukle', arguments: { ad: 'şiir' } }, ctx)).content);
        expect(bad.hata).toMatch(/Yetenekler: veri-analizi/);
    });

    it('"/" komutları yeteneği açar', () => {
        expect(slashSkillFor('/analiz bütçe')).toBe('veri-analizi');
        expect(slashSkillFor('/yonetici')).toBe('yonetici-ozeti');
        expect(slashSkillFor('/ozet')).toBeUndefined();
        expect(expandSlash('/kokneden', { projectName: 'ATLAS' })).toMatch(/ATLAS projesinin plandan sapması/);
        expect(expandSlash('/toplanti', { projectName: 'ATLAS' })).toMatch(/^ATLAS durum toplantısı/);
    });
});

describe('veri_analiz aracı', () => {
    const run = async (ctx: ReturnType<typeof chatCtx>, args: Record<string, unknown>) =>
        JSON.parse((await executeTool({ name: 'veri_analiz', arguments: args }, ctx)).content);

    it('uygulama verisi üzerinde (kaynak_arac) grupla ve ölç', async () => {
        const ctx = chatCtx();
        const r = await run(ctx, { islem: 'ozet', kaynak_arac: 'gorev_ara', kaynak_arg: '{"proje":"ATLAS"}', kaynak_alan: 'gorevler', grupla: ['Atanan'], olcumler: [{ fonk: 'say' }] });
        expect(r.toplam_satir).toBe(30);
        expect(r.satirlar.map((x: Record<string, unknown>) => x['kayıt sayısı'])).toEqual([15, 15]);
        expect(r.genel_toplam).toEqual({ 'kayıt sayısı': 30 });
    });

    it('ekli tablo: tek tabloda ad gerekmez; birden çokta ad istenir; ek yoksa yol gösterir', async () => {
        const ctx = chatCtx();
        expect((await run(ctx, { islem: 'profil' })).hata).toMatch(/kaynak_arac/);
        ctx.tables = [{ name: 'a.csv', columns: ['K', 'V'], rows: [['x', 1], ['y', 2]] }];
        expect((await run(ctx, { islem: 'profil' })).satir).toBe(2);
        ctx.tables.push({ name: 'b.csv', columns: ['K'], rows: [['z']] });
        expect((await run(ctx, { islem: 'profil' })).hata).toMatch(/"a.csv", "b.csv"/);
        expect((await run(ctx, { islem: 'profil', tablo: 'b' })).satir).toBe(1);
        expect((await run(ctx, { islem: 'trend', tablo: 'a.csv' })).hata).toMatch(/tarih_sutun/);
    });

    it('analiz sonucu rapor dosyasına tablo ve grafik olarak girer (sayılar yeniden yazılmaz)', async () => {
        const ctx = chatCtx();
        ctx.tables = [{ name: 'maliyet.xlsx / Kalemler', columns: ['Bölüm', 'Tutar'], rows: [['U310', 100], ['U320', 300], ['U310', 50]] }];
        const ozet = JSON.stringify({ islem: 'ozet', grupla: ['Bölüm'], olcumler: [{ sutun: 'Tutar', fonk: 'toplam', ad: 'Toplam tutar' }] });
        const out = JSON.parse((await executeTool({
            name: 'dosya_olustur', arguments: {
                bicim: 'docx', baslik: 'Maliyet analizi',
                bolumler: [
                    { tur: 'vurgu', ton: 'bilgi', metin: 'Maliyetin %67\'si U320\'de.' },
                    { tur: 'gosterge', gostergeler: [{ ad: 'Toplam', deger: '₺450', degisim: '+%12', durum: 'dikkat' }] },
                    { tur: 'grafik', grafik_turu: 'pie', metin: 'U320 maliyetin üçte ikisi', kaynak_arac: 'veri_analiz', kaynak_arg: ozet, kaynak_alan: 'satirlar', etiket_sutun: 'Bölüm', deger_sutunlari: ['Toplam tutar'] },
                    { tur: 'tablo', metin: 'Bölüm kırılımı', kaynak_arac: 'veri_analiz', kaynak_arg: ozet, kaynak_alan: 'satirlar' },
                    { tur: 'vurgu', ton: 'oneri', vurgu_basligi: 'U320 sözleşmesini gözden geçir', metin: 'Sahip: PYB, 15 Aralık' },
                ],
            },
        }, ctx)).content);
        expect(out).toMatchObject({ grafik: 1, gosterge: 1, vurgu: 2, tablo: 1 });
        expect(out.kalite_notu).toBeUndefined();
        const doc = ctx.files![0];
        const chart = doc.blocks.find(b => b.kind === 'chart') as Extract<typeof doc.blocks[number], { kind: 'chart' }>;
        expect(chart).toMatchObject({ chart: 'pie', labels: ['U320', 'U310'], series: [{ name: 'Toplam tutar', values: [300, 150] }] });
        const table = doc.blocks.find(b => b.kind === 'table') as Extract<typeof doc.blocks[number], { kind: 'table' }>;
        expect(table.rows[0]).toEqual(['U320', 300, 66.7]);
    });

    it('yalnız tablo içeren dosyada kalite notu döner', async () => {
        const ctx = chatCtx();
        const out = JSON.parse((await executeTool({ name: 'dosya_olustur', arguments: { bicim: 'xlsx', baslik: 'x', bolumler: [{ tur: 'tablo', sutunlar: ['a'], satirlar: [['1']] }] } }, ctx)).content);
        expect(out.kalite_notu).toMatch(/gosterge ve vurgu/);
    });
});
